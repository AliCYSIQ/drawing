// Start over, and restore a backup.
//
// Starting over never erases anything: what it removes is moved into
// data/backups/<date>-before-reset/, so Settings can bring it back. Moving
// is instant even for big image folders. A restore first moves the data it
// replaces into another backup, so a restore can be undone too.
//
// While either runs, saves from the page are ignored (it could otherwise
// write old data back), and the page reloads afterwards with the new data.

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { SCHEMA_VERSION } from '@shared/types'
import { backupLabel, describeBackup, resetRewrites, resetTargets, type BackupInfo, type ResetPart } from '@shared/reset'
import { log } from './log'
import { migrateDataDir } from './migrate'
import { dataDir } from './store'

let frozen = false

/** True while a reset or restore runs: page saves are dropped. */
export function savesFrozen(): boolean {
  return frozen
}

export function unfreezeSaves(): void {
  frozen = false
}

function stamp(now = new Date()): string {
  return now.toISOString().slice(0, 19).replace(/[:T]/g, '-')
}

/** Move a file or folder; across drives (rare) copy then delete. */
async function move(from: string, to: string): Promise<void> {
  try {
    await rename(from, to)
  } catch {
    await cp(from, to, { recursive: true })
    await rm(from, { recursive: true, force: true })
  }
}

export async function resetData(parts: ResetPart[]): Promise<{ backup: string }> {
  frozen = true
  const dir = dataDir()
  const backup = join(dir, 'backups', `${stamp()}-before-reset`)
  await mkdir(backup, { recursive: true })
  const rewrites = resetRewrites(parts)
  // Kept as it was in the backup, then rewritten below.
  if (rewrites.challengesProgress && existsSync(join(dir, 'challenges.json'))) {
    await cp(join(dir, 'challenges.json'), join(backup, 'challenges.json'))
  }
  for (const name of resetTargets(parts)) {
    const from = join(dir, name)
    if (!existsSync(from)) continue
    // The thumbnail cache isn't worth keeping.
    if (name === 'thumbs') await rm(from, { recursive: true, force: true })
    else await move(from, join(backup, name))
  }
  if (rewrites.challengesProgress && existsSync(join(dir, 'challenges.json'))) {
    const list = JSON.parse(await readFile(join(dir, 'challenges.json'), 'utf8')) as { completed?: number[] }[]
    await writeFile(join(dir, 'challenges.json'), JSON.stringify(list.map((c) => ({ ...c, completed: [] }))), 'utf8')
  }
  if (rewrites.freshSettings) {
    await writeFile(join(dir, 'settings.json'), JSON.stringify({ schemaVersion: SCHEMA_VERSION }), 'utf8')
  }
  log('info', `Started over (${parts.join(', ')}); the old data is in ${backup}`)
  return { backup }
}

export async function listBackups(): Promise<BackupInfo[]> {
  const root = dataDir('backups')
  if (!existsSync(root)) return []
  const out: BackupInfo[] = []
  for (const name of await readdir(root)) {
    const path = join(root, name)
    const info = await stat(path).catch(() => null)
    if (!info?.isDirectory()) continue
    const entries = await readdir(path).catch(() => [])
    if (!entries.length) continue
    out.push({ name, createdAt: info.mtimeMs, label: backupLabel(name), holds: describeBackup(entries) })
  }
  return out.sort((a, b) => b.createdAt - a.createdAt)
}

/** Put a backup's data back. What it replaces is kept in a new backup first. */
export async function restoreBackup(name: string): Promise<{ error?: string }> {
  const root = dataDir('backups')
  const src = join(root, name)
  if (name.includes('/') || name.includes('\\') || name.startsWith('.') || !existsSync(src)) return { error: 'That backup is gone.' }
  // Backups inside a backup (from a zip) and old logs stay where they are.
  const entries = (await readdir(src)).filter((e) => e !== 'backups' && e !== 'logs')
  // Data from a newer version of the app can't be read by this one.
  try {
    const settings = JSON.parse(await readFile(join(src, 'settings.json'), 'utf8')) as { schemaVersion?: number }
    if ((settings.schemaVersion ?? 0) > SCHEMA_VERSION) return { error: 'This backup is from a newer version of the app. Update the app first.' }
  } catch {
    // No settings in it: fine.
  }
  frozen = true
  const dir = dataDir()
  const safety = join(root, `${stamp()}-before-restore`)
  await mkdir(safety, { recursive: true })
  for (const e of entries) {
    if (existsSync(join(dir, e))) await move(join(dir, e), join(safety, e))
    await cp(join(src, e), join(dir, e), { recursive: true })
  }
  await rm(join(dir, 'thumbs'), { recursive: true, force: true })
  // A backup from before a format change is brought up to date like at startup.
  const migration = await migrateDataDir(dir).catch((err: Error) => ({ status: 'failed' as const, err }))
  if (migration.status === 'failed') log('error', `Restored backup could not be updated: ${migration.err.message}`)
  log('info', `Restored backup ${name}; what it replaced is in ${safety}`)
  return {}
}

/** A backup .zip (Settings → Save a backup) unpacked into the backups folder, then restored. */
export async function restoreZip(zip: string): Promise<{ error?: string }> {
  const name = `${stamp()}-from-zip`
  const target = dataDir('backups', name)
  await mkdir(target, { recursive: true })
  try {
    // Windows' own tar reads zip files (the same tool that wrote them).
    await promisify(execFile)(process.platform === 'win32' ? 'tar.exe' : 'tar', ['-x', '-f', zip, '-C', target])
  } catch (err) {
    await rm(target, { recursive: true, force: true })
    log('warn', `Backup zip could not be read: ${(err as Error).message}`)
    return { error: 'That file could not be read as a Drawing Practice backup.' }
  }
  const entries = await readdir(target)
  if (!entries.some((e) => e.endsWith('.json'))) {
    await rm(target, { recursive: true, force: true })
    return { error: 'That zip has no Drawing Practice data in it.' }
  }
  return restoreBackup(name)
}

export function backupsDir(): string {
  return dataDir('backups')
}
