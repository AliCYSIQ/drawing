// Upgrades saved data to the current format at startup.
//
// Before changing anything, the JSON files are copied to
// data/backups/<date>-v<old>/ so the user can always go back. Data written
// by a newer app version is never touched: the app says so and stops.
//
// To change the format: raise SCHEMA_VERSION in src/shared/types.ts and add
// a step to STEPS below (from the previous version to the new one), with a test.

import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { SCHEMA_VERSION } from '@shared/types'

type Json = Record<string, unknown>
/** All JSON stores by name (without .json); missing ones are absent. */
export type DataFiles = Record<string, unknown>

/** v1 → v2: fixed categories become free tags ("other" becomes no tag). */
export function boardsV1toV2(boards: unknown): unknown {
  if (!Array.isArray(boards)) return boards
  return boards.map((b: Json) => {
    const { category, ...rest } = b
    const tags = Array.isArray(rest.tags)
      ? rest.tags
      : typeof category === 'string' && category !== 'other'
        ? [category]
        : []
    return { ...rest, tags }
  })
}

const STEPS: Record<number, (files: DataFiles) => DataFiles> = {
  1: (files) => ({ ...files, boards: boardsV1toV2(files.boards) })
}

/**
 * Which version the files are in. No settings but other data means v0.1,
 * which didn't record a version. No data at all means a fresh start.
 */
export function detectVersion(files: DataFiles): number {
  const settings = files.settings as Json | undefined
  if (settings && typeof settings.schemaVersion === 'number') return settings.schemaVersion
  const hasData = Object.keys(files).some((k) => k !== 'settings')
  return hasData || settings ? 1 : SCHEMA_VERSION
}

/** Apply every step from `from` up to the current version. Pure, so it can be tested. */
export function migrateFiles(files: DataFiles, from: number): DataFiles {
  let out = files
  for (let v = from; v < SCHEMA_VERSION; v++) {
    const step = STEPS[v]
    if (!step) throw new Error(`No migration from data version ${v}`)
    out = step(out)
  }
  return { ...out, settings: { ...((out.settings as Json) ?? {}), schemaVersion: SCHEMA_VERSION } }
}

export type MigrationResult =
  | { status: 'current' }
  | { status: 'migrated'; from: number; backup: string }
  | { status: 'newer'; version: number }

export async function migrateDataDir(dir: string, now = new Date()): Promise<MigrationResult> {
  if (!existsSync(dir)) return { status: 'current' }
  const names = (await readdir(dir)).filter((f) => f.endsWith('.json') && !f.includes('.corrupt'))
  const files: DataFiles = {}
  for (const f of names) {
    try {
      files[f.slice(0, -5)] = JSON.parse(await readFile(join(dir, f), 'utf8'))
    } catch {
      // A damaged file is left for the store to set aside.
    }
  }
  const version = detectVersion(files)
  if (version > SCHEMA_VERSION) return { status: 'newer', version }
  if (version === SCHEMA_VERSION) return { status: 'current' }

  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const backup = join(dir, 'backups', `${stamp}-v${version}`)
  await mkdir(backup, { recursive: true })
  for (const f of names) await copyFile(join(dir, f), join(backup, f))

  const migrated = migrateFiles(files, version)
  for (const [name, data] of Object.entries(migrated)) {
    if (data === undefined) continue
    if (name !== 'settings' && !(name in files)) continue
    await writeFile(join(dir, `${name}.json`), JSON.stringify(data), 'utf8')
  }
  return { status: 'migrated', from: version, backup }
}
