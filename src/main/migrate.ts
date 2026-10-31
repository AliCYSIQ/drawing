// Upgrades saved data to the current format at startup.
//
// Before changing anything, the JSON files are copied to
// data/backups/<date>-v<old>/ so the user can always go back. Data written
// by a newer app version is never touched: the app says so and stops.
//
// To change the format: raise SCHEMA_VERSION in src/shared/types.ts and add
// a step to STEPS below (from the previous version to the new one), with a test.

import { copyFile, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
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

/**
 * v2 → v3: library folders became plain folders, so a collection shown in
 * another folder as a shortcut becomes a copy there (same name, same images;
 * copies share the image files, nothing is duplicated on disk).
 */
export function shortcutsToCopies(boards: unknown, library: unknown): { boards: unknown; library: unknown } {
  if (!Array.isArray(boards) || !library || typeof library !== 'object') return { boards, library }
  const lib = library as Json & { folders?: Json[] }
  const folders = Array.isArray(lib.folders) ? lib.folders : []
  const out = boards.slice() as Json[]
  for (const f of folders) {
    const ids = Array.isArray(f.shortcuts) ? (f.shortcuts as string[]) : []
    for (const id of ids) {
      const b = (boards as Json[]).find((x) => x.id === id)
      if (!b || b.folderId === f.id) continue
      out.push({ ...b, id: `${id}-in-${f.id}`, folderId: f.id })
    }
  }
  return {
    boards: out,
    library: {
      ...lib,
      folders: folders.map((f) => {
        const { shortcuts, ...rest } = f
        void shortcuts
        return rest
      })
    }
  }
}

/** What a step may need to know about the computer it runs on. */
export interface MigrateEnv {
  /** The data folder: images inside it were stored by the app. */
  dataDir: string
  exists: (path: string) => boolean
}

const baseName = (p: string) => {
  const file = p.split(/[\\/]/).pop() ?? p
  return file.replace(/\.[^.]+$/, '') || file
}

function isInside(dir: string, path: string): boolean {
  const d = dir.replace(/[\\/]+$/, '').toLowerCase()
  const p = path.toLowerCase()
  if (!d) return false
  return p.startsWith(d) && (p[d.length] === '\\' || p[d.length] === '/')
}

/**
 * v3 → v4: one folder tree.
 * - Library folders stay folders (same ids).
 * - Every collection becomes a folder with the same id, in the folder it was
 *   in, holding its images. Sessions, presets and challenges that point at a
 *   collection id therefore point at that folder now.
 * - A linked folder remembers its path (sub-folders flattened as before, or
 *   only the top images); a Pinterest board remembers its link.
 * - Each image becomes an entry; what the image is becomes an asset that
 *   keeps the old image id, so history, favorites and "fresh first" still
 *   match. Copies share their assets, as they shared their files.
 * Nothing on disk is moved or renamed.
 */
export function libraryV3toV4(boards: unknown, library: unknown, env: MigrateEnv): unknown {
  const lib = (library && typeof library === 'object' ? library : {}) as Json
  if (lib.format === 4) return lib // already done (a step that was cut short)
  const oldFolders = Array.isArray(lib.folders) ? (lib.folders as Json[]) : []
  const list = Array.isArray(boards) ? (boards as Json[]) : []
  const folders: Json[] = oldFolders.map((f) => {
    const { shortcuts, ...rest } = f
    void shortcuts
    return rest
  })
  const images: Json[] = []
  const assets = new Map<string, Json>()
  const kindOrigin: Record<string, string> = { folder: 'folder', files: 'file', pinterest: 'pinterest', collection: 'paste' }

  const taken = new Set(folders.map((f) => f.id))
  for (const raw of list) {
    if (typeof raw.id !== 'string') continue
    // Two collections with one id (never made on purpose) each get a folder of their own.
    let id = raw.id
    for (let n = 2; taken.has(id); n++) id = `${raw.id}-${n}`
    taken.add(id)
    const b: Json = { ...raw, id }
    const kind = String(b.kind ?? 'collection')
    const source =
      kind === 'folder' && typeof b.source === 'string'
        ? { kind: 'disk', path: b.source, include: b.recursive === false ? 'top' : 'flat', ...(b.syncedAt ? { syncedAt: b.syncedAt } : {}) }
        : kind === 'pinterest' && typeof b.source === 'string'
          ? { kind: 'pinterest', url: b.source, ...(b.syncedAt ? { syncedAt: b.syncedAt } : {}) }
          : undefined
    folders.push({
      id: b.id,
      name: typeof b.name === 'string' && b.name ? b.name : 'Folder',
      ...(typeof b.folderId === 'string' ? { parentId: b.folderId } : {}),
      createdAt: typeof b.createdAt === 'number' ? b.createdAt : Date.now(),
      tags: Array.isArray(b.tags) ? b.tags : [],
      ...(b.favorite ? { favorite: true } : {}),
      ...(source ? { source } : {})
    })
    const seen = new Set<string>()
    for (const img of Array.isArray(b.images) ? (b.images as Json[]) : []) {
      if (typeof img.id !== 'string' || typeof img.path !== 'string' || seen.has(img.id)) continue
      seen.add(img.id)
      const have = assets.get(img.id)
      // A copy made before its original was relinked can hold the old path; keep the one that exists.
      if (!have || (!env.exists(have.path as string) && env.exists(img.path))) {
        // Stored by the app: in this data folder, or in the app's own image folders of a data folder
        // that was elsewhere then (restored from a backup, another drive). Either way the app made it.
        const stored = isInside(env.dataDir, img.path) || /[\\/]data[\\/](collections|cache[\\/]pinterest)[\\/]/i.test(img.path)
        const pin = typeof img.sourceUrl === 'string' ? img.sourceUrl.match(/\/pin\/(\d+)/)?.[1] : undefined
        assets.set(img.id, {
          id: img.id,
          path: img.path,
          storage: stored ? 'stored' : 'linked',
          origin: kind === 'collection' && !stored ? 'file' : kind === 'collection' && b.source ? 'copy' : kindOrigin[kind] ?? 'file',
          ...(typeof img.sourceUrl === 'string' ? { sourceUrl: img.sourceUrl } : {}),
          ...(pin ? { pinId: pin } : {}),
          addedAt: have?.addedAt ?? (typeof b.createdAt === 'number' ? b.createdAt : Date.now())
        })
      }
      images.push({
        id: `${b.id}~${img.id}`,
        assetId: img.id,
        folderId: b.id,
        name: baseName(img.path),
        createdAt: typeof b.createdAt === 'number' ? b.createdAt : Date.now()
      })
    }
  }

  // A folder whose parent is gone (or that sits inside itself) goes to the top level.
  const ids = new Set(folders.map((f) => f.id as string))
  for (const f of folders) if (typeof f.parentId === 'string' && !ids.has(f.parentId)) delete f.parentId
  for (const f of folders) {
    const seen = new Set<unknown>([f.id])
    let p = f.parentId
    while (typeof p === 'string') {
      if (seen.has(p)) {
        delete f.parentId
        break
      }
      seen.add(p)
      p = folders.find((x) => x.id === p)?.parentId
    }
  }

  return {
    format: 4,
    folders,
    images,
    assets: [...assets.values()],
    favoriteImages: Array.isArray(lib.favoriteImages) ? lib.favoriteImages : []
  }
}

/**
 * Checks the v4 library against the v3 collections it was made from, so a
 * migration that lost something stops before anything is written.
 */
export function checkLibraryV4(boards: unknown, library: unknown): string | null {
  const lib = library as { format?: number; folders?: Json[]; images?: Json[]; assets?: Json[] }
  if (!lib || lib.format !== 4 || !Array.isArray(lib.folders) || !Array.isArray(lib.images) || !Array.isArray(lib.assets)) return 'the new library is incomplete'
  const folderIds = new Set(lib.folders.map((f) => f.id))
  const assetIds = new Set(lib.assets.map((a) => a.id))
  if (folderIds.size !== lib.folders.length) return 'two folders have the same id'
  for (const f of lib.folders) if (f.parentId !== undefined && !folderIds.has(f.parentId)) return `folder ${String(f.id)} is in a folder that does not exist`
  for (const i of lib.images) {
    if (!assetIds.has(i.assetId)) return `image ${String(i.id)} has no asset`
    if (i.folderId !== undefined && !folderIds.has(i.folderId)) return `image ${String(i.id)} is in a folder that does not exist`
  }
  const entries = new Set(lib.images.map((i) => `${String(i.folderId)}|${String(i.assetId)}`))
  const seen = new Set<string>()
  for (const b of Array.isArray(boards) ? (boards as Json[]) : []) {
    if (typeof b.id !== 'string') continue
    let id = b.id
    for (let n = 2; seen.has(id); n++) id = `${b.id}-${n}`
    seen.add(id)
    if (!folderIds.has(id)) return `collection “${String(b.name)}” was not carried over`
    for (const img of Array.isArray(b.images) ? (b.images as Json[]) : []) {
      if (typeof img.id === 'string' && typeof img.path === 'string' && !entries.has(`${id}|${img.id}`)) {
        return `an image of “${String(b.name)}” was not carried over`
      }
    }
  }
  return null
}

const STEPS: Record<number, (files: DataFiles, env: MigrateEnv) => DataFiles> = {
  1: (files) => ({ ...files, boards: boardsV1toV2(files.boards) }),
  2: (files) => ({ ...files, ...shortcutsToCopies(files.boards, files.library) }),
  3: (files, env) => {
    const library = libraryV3toV4(files.boards, files.library, env)
    const problem = checkLibraryV4(files.boards, library)
    if (problem) throw new Error(`Library update stopped: ${problem}`)
    // boards.json is left as it was; the app no longer reads it.
    return { ...files, library }
  }
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

const NO_ENV: MigrateEnv = { dataDir: '', exists: () => true }

/** Apply every step from `from` up to the current version. Pure, so it can be tested. */
export function migrateFiles(files: DataFiles, from: number, env: MigrateEnv = NO_ENV): DataFiles {
  let out = files
  for (let v = from; v < SCHEMA_VERSION; v++) {
    const step = STEPS[v]
    if (!step) throw new Error(`No migration from data version ${v}`)
    out = step(out, env)
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

  // Worked out in memory and checked first: a failed step writes nothing.
  const migrated = migrateFiles(files, version, { dataDir: dir, exists: existsSync })
  const changed = Object.entries(migrated).filter(
    ([name, data]) => data !== undefined && (name === 'settings' || name in files || name === 'library') && data !== files[name]
  )
  // Every file is written next to the old one first, then swapped in. The
  // settings (which hold the version) go last, so a migration cut short runs
  // again at the next start; its steps notice work that is already done.
  for (const [name, data] of changed) await writeFile(join(dir, `${name}.json.migrating`), JSON.stringify(data), 'utf8')
  const order = [...changed.filter(([n]) => n !== 'settings'), ...changed.filter(([n]) => n === 'settings')]
  for (const [name] of order) await rename(join(dir, `${name}.json.migrating`), join(dir, `${name}.json`))
  return { status: 'migrated', from: version, backup }
}
