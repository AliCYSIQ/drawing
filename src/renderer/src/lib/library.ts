// The library as one folder tree, kept pure so it can be tested on its own.
//
// - A folder holds folders and images, like a folder in Windows. Everything
//   is in exactly one place (none = the top level).
// - An image in a folder is an entry. What the image is, its file and where
//   it came from, is an asset. A copy is a new entry of the same asset, so
//   the bytes are kept once; moving or deleting entries never touches files.
// - A folder can mirror a disk folder or a Pinterest board (its `source`).
//
// Every operation takes the library as it is and returns the new one, so the
// page can keep the old one for Undo.

import type { Asset, Folder, FolderSource, FoundFile, ImageRef, LibraryData, LibraryImage, PinterestImport, ScannedDir } from '@shared/types'

/** The library parts the file-manager operations change. */
export interface Lib {
  folders: Folder[]
  images: LibraryImage[]
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

// ---------------------------------------------------------------------------
// Where things are

/** The folders from the top level down to `folderId` (empty at the top). */
export function folderPath(folders: Folder[], folderId?: string): Folder[] {
  const path: Folder[] = []
  const seen = new Set<string>()
  let id = folderId
  while (id && !seen.has(id)) {
    seen.add(id)
    const f = folders.find((x) => x.id === id)
    if (!f) break
    path.unshift(f)
    id = f.parentId
  }
  return path
}

/** "Human / Hands" style label for a folder, or "" at the top level. */
export function folderLabel(folders: Folder[], folderId?: string): string {
  return folderPath(folders, folderId)
    .map((f) => f.name)
    .join(' / ')
}

export function childFolders(folders: Folder[], parentId?: string): Folder[] {
  return folders.filter((f) => f.parentId === parentId).sort((a, b) => byName(a.name, b.name))
}

/** Images directly in this folder (not in its sub-folders). */
export function imagesIn(images: LibraryImage[], folderId?: string): LibraryImage[] {
  return images.filter((i) => i.folderId === folderId)
}

/** This folder and every folder inside it. */
export function descendantIds(folders: Folder[], folderId: string): Set<string> {
  const out = new Set([folderId])
  let grew = true
  while (grew) {
    grew = false
    for (const f of folders) {
      if (f.parentId && out.has(f.parentId) && !out.has(f.id)) {
        out.add(f.id)
        grew = true
      }
    }
  }
  return out
}

/** Every image in this folder or below it. */
export function imagesBelow(lib: Lib, folderId: string): LibraryImage[] {
  const ids = descendantIds(lib.folders, folderId)
  return lib.images.filter((i) => i.folderId && ids.has(i.folderId))
}

/** What a folder holds: sub-folders and images at its own level, and images all levels down. */
export function folderCounts(lib: Lib, folderId: string): { folders: number; images: number; total: number } {
  return {
    folders: lib.folders.filter((f) => f.parentId === folderId).length,
    images: lib.images.filter((i) => i.folderId === folderId).length,
    total: imagesBelow(lib, folderId).length
  }
}

/** "3 folders · 12 images", or "Empty". */
export function countLabel(c: { folders: number; images: number; total?: number }): string {
  const parts = []
  if (c.folders) parts.push(`${c.folders} ${c.folders === 1 ? 'folder' : 'folders'}`)
  if (c.images) parts.push(`${c.images} ${c.images === 1 ? 'image' : 'images'}`)
  if (!c.images && c.total) parts.push(`${c.total} ${c.total === 1 ? 'image' : 'images'} inside`)
  return parts.join(' · ') || 'Empty'
}

export function assetMap(assets: Asset[]): Map<string, Asset> {
  return new Map(assets.map((a) => [a.id, a]))
}

/** The image to show for an entry. */
export function refOf(entry: LibraryImage, assets: Map<string, Asset>): ImageRef | null {
  const a = assets.get(entry.assetId)
  return a ? { id: a.id, path: a.path, ...(a.sourceUrl ? { sourceUrl: a.sourceUrl } : {}) } : null
}

/** A few images for a folder's cover: its own first, then from the folders inside it. */
export function folderCover(lib: Lib, assets: Map<string, Asset>, folderId: string, count = 3): ImageRef[] {
  const own = imagesIn(lib.images, folderId)
  const list = own.length >= count ? own : [...own, ...imagesBelow(lib, folderId).filter((i) => i.folderId !== folderId)]
  return list
    .slice(0, count * 2)
    .map((e) => refOf(e, assets))
    .filter((r): r is ImageRef => !!r)
    .slice(0, count)
}

/** Where a folder may move to: anywhere except itself and its own sub-folders. */
export function canMoveFolder(folders: Folder[], folderId: string, newParentId?: string): boolean {
  return !newParentId || !descendantIds(folders, folderId).has(newParentId)
}

// ---------------------------------------------------------------------------
// File-manager operations: select, move, copy, delete

/** One thing in a folder view: a folder or an image. */
export type Item = { type: 'folder'; id: string } | { type: 'image'; id: string }

export function itemKey(item: Item): string {
  return `${item.type === 'folder' ? 'f' : 'i'}:${item.id}`
}

export function parseItemKey(key: string): Item | null {
  const at = key.indexOf(':')
  const t = key.slice(0, at)
  const id = key.slice(at + 1)
  if (at < 0 || !id) return null
  if (t === 'f') return { type: 'folder', id }
  if (t === 'i') return { type: 'image', id }
  return null
}

/** What a drop or paste does. */
export type Transfer = 'move' | 'copy'

/** Why an item can't go to a folder, or null when it can. */
export function cannotTransfer(lib: Lib, item: Item, target: string | undefined, op: Transfer): string | null {
  if (item.type === 'folder') {
    if (target && descendantIds(lib.folders, item.id).has(target)) {
      return op === 'move' ? 'A folder can’t go inside itself.' : 'A folder can’t be copied into itself.'
    }
    if (op === 'move' && lib.folders.find((f) => f.id === item.id)?.parentId === target) return 'It is already there.'
    return null
  }
  if (op === 'move' && lib.images.find((i) => i.id === item.id)?.folderId === target) return 'It is already there.'
  return null
}

/** Move items into a folder (undefined = top level). Things that can't go there are left alone. */
export function moveItems(lib: Lib, items: Item[], target: string | undefined): Lib {
  let { folders, images } = lib
  for (const item of items) {
    if (cannotTransfer({ folders, images }, item, target, 'move')) continue
    if (item.type === 'folder') folders = folders.map((f) => (f.id === item.id ? { ...f, parentId: target } : f))
    else images = images.map((i) => (i.id === item.id ? { ...i, folderId: target } : i))
  }
  return { folders, images }
}

/** A name that isn't taken among `taken`: "Hands", "Hands (copy)", "Hands (copy 2)"… */
export function copyName(name: string, taken: string[]): string {
  const used = new Set(taken.map((t) => t.toLowerCase()))
  if (!used.has(name.toLowerCase())) return name
  for (let n = 1; ; n++) {
    const next = n === 1 ? `${name} (copy)` : `${name} (copy ${n})`
    if (!used.has(next.toLowerCase())) return next
  }
}

/**
 * Copy items into a folder. A copy is new and independent (its own name,
 * place and tags), and shares the assets, so no image bytes are duplicated.
 * A folder copy copies everything inside it. `newId` makes ids (tests pass a
 * counter). Returns the new library and the new items.
 */
export function copyItems(lib: Lib, items: Item[], target: string | undefined, newId: () => string, now = Date.now()): Lib & { made: Item[] } {
  const folders = lib.folders.slice()
  const images = lib.images.slice()
  const made: Item[] = []
  const namesIn = (folderId?: string) => [
    ...folders.filter((f) => f.parentId === folderId).map((f) => f.name),
    ...images.filter((i) => i.folderId === folderId).map((i) => i.name)
  ]
  const copyImage = (src: LibraryImage, into: string | undefined, rename: boolean): LibraryImage => {
    const copy: LibraryImage = { ...src, id: newId(), folderId: into, name: rename ? copyName(src.name, namesIn(into)) : src.name, createdAt: now }
    images.push(copy)
    return copy
  }
  const copyFolder = (src: Folder, into: string | undefined, rename: boolean): Folder => {
    const copy: Folder = { ...src, id: newId(), parentId: into, name: rename ? copyName(src.name, namesIn(into)) : src.name, createdAt: now }
    folders.push(copy)
    for (const i of lib.images.filter((x) => x.folderId === src.id)) copyImage(i, copy.id, false)
    for (const child of lib.folders.filter((f) => f.parentId === src.id)) copyFolder(child, copy.id, false)
    return copy
  }
  for (const item of items) {
    if (cannotTransfer({ folders, images }, item, target, 'copy')) continue
    if (item.type === 'image') {
      const src = lib.images.find((x) => x.id === item.id)
      if (src) made.push({ type: 'image', id: copyImage(src, target, true).id })
    } else {
      const src = lib.folders.find((f) => f.id === item.id)
      if (src) made.push({ type: 'folder', id: copyFolder(src, target, true).id })
    }
  }
  return { folders, images, made }
}

/** A disk path in a list, ignoring case and the slash style. */
const samePath = (a: string, b: string) => a.replace(/\//g, '\\').toLowerCase() === b.replace(/\//g, '\\').toLowerCase()

/**
 * Delete items from the library (never from the disk). A folder either keeps
 * what's inside (it moves up a level) or takes everything inside with it.
 * A folder that mirrors a disk sub-folder of its parent is remembered as
 * left out, so a rescan of the parent doesn't bring it back.
 */
export function deleteItems(lib: Lib, items: Item[], folderMode: 'keep' | 'all'): Lib {
  let { folders, images } = lib
  for (const item of items) {
    if (item.type === 'image') {
      images = images.filter((i) => i.id !== item.id)
      continue
    }
    const folder = folders.find((f) => f.id === item.id)
    if (!folder) continue
    const parent = folders.find((f) => f.id === folder.parentId)
    if (folder.source?.kind === 'disk' && parent?.source?.kind === 'disk' && parent.source.include === 'tree') {
      const skip = parent.source.skip ?? []
      const path = folder.source.path
      if (!skip.some((s) => samePath(s, path))) {
        const source = { ...parent.source, skip: [...skip, path] }
        folders = folders.map((f) => (f.id === parent.id ? { ...f, source } : f))
      }
    }
    if (folderMode === 'keep') {
      folders = folders.filter((f) => f.id !== folder.id).map((f) => (f.parentId === folder.id ? { ...f, parentId: folder.parentId } : f))
      images = images.map((i) => (i.folderId === folder.id ? { ...i, folderId: folder.parentId } : i))
    } else {
      const ids = descendantIds(folders, folder.id)
      folders = folders.filter((f) => !ids.has(f.id))
      images = images.filter((i) => !i.folderId || !ids.has(i.folderId))
    }
  }
  return { folders, images }
}

/** What deleting these items would remove, for the confirmation. */
export function deleteSummary(lib: Lib, items: Item[]): { folders: number; images: number; insideFolders: number; insideImages: number } {
  let insideFolders = 0
  let insideImages = 0
  for (const item of items) {
    if (item.type !== 'folder') continue
    const ids = descendantIds(lib.folders, item.id)
    insideFolders += ids.size - 1
    insideImages += lib.images.filter((i) => i.folderId && ids.has(i.folderId)).length
  }
  return {
    folders: items.filter((i) => i.type === 'folder').length,
    images: items.filter((i) => i.type === 'image').length,
    insideFolders,
    insideImages
  }
}

export function renameItem(lib: Lib, item: Item, name: string): Lib {
  const clean = name.trim().slice(0, 120)
  if (!clean) return lib
  if (item.type === 'folder') return { ...lib, folders: lib.folders.map((f) => (f.id === item.id ? { ...f, name: clean } : f)) }
  return { ...lib, images: lib.images.map((i) => (i.id === item.id ? { ...i, name: clean } : i)) }
}

// ---------------------------------------------------------------------------
// Practicing folders

/** The folders a plan picked: v0.3 folders plus the collections of older plans (folders now, same ids). */
export function planFolderIds(plan: { boardIds?: string[]; folderIds?: string[] }): string[] {
  return [...new Set([...(plan.folderIds ?? []), ...(plan.boardIds ?? [])])]
}

/**
 * Every image to practice from these folders, sub-folders included. An image
 * reached through two picked folders, or kept twice (a copy, or the same
 * picture added twice), is in the pool once.
 */
export function poolFor(lib: Lib, assets: Asset[] | Map<string, Asset>, folderIds: string[]): ImageRef[] {
  const byId = assets instanceof Map ? assets : assetMap(assets)
  const inFolders = new Set<string>()
  for (const id of folderIds) if (lib.folders.some((f) => f.id === id)) for (const d of descendantIds(lib.folders, id)) inFolders.add(d)
  const seenAsset = new Set<string>()
  const seenHash = new Set<string>()
  const pool: ImageRef[] = []
  for (const entry of lib.images) {
    if (!entry.folderId || !inFolders.has(entry.folderId) || seenAsset.has(entry.assetId)) continue
    seenAsset.add(entry.assetId)
    const a = byId.get(entry.assetId)
    if (!a) continue
    if (a.sha256) {
      if (seenHash.has(a.sha256)) continue
      seenHash.add(a.sha256)
    }
    pool.push({ id: a.id, path: a.path, ...(a.sourceUrl ? { sourceUrl: a.sourceUrl } : {}) })
  }
  return pool
}

/** How many different images these folders hold together (what the pool would have). */
export function poolSize(lib: Lib, assets: Asset[] | Map<string, Asset>, folderIds: string[]): number {
  return poolFor(lib, assets, folderIds).length
}

// ---------------------------------------------------------------------------
// Search and order

/** Folders by name or tag, images by name; every word must match. */
export function searchLibrary(lib: Lib, query: string): { folders: Folder[]; images: LibraryImage[] } {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return { folders: [], images: [] }
  const has = (text: string) => words.every((w) => text.toLowerCase().includes(w))
  return {
    folders: lib.folders.filter((f) => has(`${f.name} ${(f.tags ?? []).join(' ')}`)),
    images: lib.images.filter((i) => has(i.name))
  }
}

export type SortKey = 'name' | 'added' | 'practiced' | 'size'

/**
 * Order for a folder view. Folders always come first (as in Windows), then
 * images; both by the chosen key. `size` is the image count for folders.
 */
export function sortItems<T extends { name: string; createdAt: number; id: string }>(
  list: T[],
  key: SortKey,
  size: (x: T) => number,
  practiced: (x: T) => number
): T[] {
  const by: Record<SortKey, (a: T, b: T) => number> = {
    name: (a, b) => byName(a.name, b.name),
    added: (a, b) => b.createdAt - a.createdAt || byName(a.name, b.name),
    practiced: (a, b) => practiced(b) - practiced(a) || byName(a.name, b.name),
    size: (a, b) => size(b) - size(a) || byName(a.name, b.name)
  }
  return list.slice().sort(by[key])
}

/** When each picked folder and each drawn image (asset) was last practiced. */
export function lastPracticed(sessions: { startedAt: number; plan: { boardIds: string[]; folderIds?: string[] }; poses: { imageId: string }[] }[]): {
  folders: Map<string, number>
  assets: Map<string, number>
} {
  const folders = new Map<string, number>()
  const assets = new Map<string, number>()
  for (const s of sessions) {
    for (const id of planFolderIds(s.plan)) folders.set(id, Math.max(folders.get(id) ?? 0, s.startedAt))
    for (const p of s.poses) assets.set(p.imageId, Math.max(assets.get(p.imageId) ?? 0, s.startedAt))
  }
  return { folders, assets }
}

// ---------------------------------------------------------------------------
// Adding images

const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p
/** The name an image gets in the library: its file name without the extension. */
export const nameFromPath = (p: string) => fileName(p).replace(/\.[^.]+$/, '') || fileName(p)

export type Origin = Asset['origin']

/**
 * The asset for a file: the one already kept for that path, or a stored
 * copy with the same bytes, or a new one. The new id is the one worked out
 * from the path (as image ids always were, so older history still matches)
 * unless another asset has it.
 */
function assetFor(
  assets: Asset[],
  index: Map<string, Asset>,
  file: FoundFile & { sourceUrl?: string; pinId?: string },
  origin: Origin,
  storage: Asset['storage'],
  now: number,
  newId: () => string
): { asset: Asset; samePath: boolean } {
  const key = file.path.toLowerCase()
  const byPath = index.get(key)
  if (byPath) return { asset: byPath, samePath: true }
  if (storage === 'stored' && file.sha256) {
    const same = assets.find((a) => a.storage === 'stored' && a.sha256 === file.sha256)
    if (same) return { asset: same, samePath: false }
  }
  const taken = assets.some((a) => a.id === file.id)
  const asset: Asset = {
    id: taken ? newId() : file.id,
    path: file.path,
    storage,
    origin,
    ...(file.sourceUrl ? { sourceUrl: file.sourceUrl } : {}),
    ...(file.pinId ? { pinId: file.pinId } : {}),
    ...(file.size ? { size: file.size } : {}),
    ...(file.sha256 ? { sha256: file.sha256 } : {}),
    addedAt: now
  }
  assets.push(asset)
  index.set(key, asset)
  return { asset, samePath: false }
}

/**
 * Put files into a folder as images. A file already in that folder isn't
 * added twice; two different files with the same bytes are two images that
 * share one stored asset (drawn once in a session). Returns the new library
 * and how many images were added.
 */
export function addFiles(
  data: LibraryData,
  files: (FoundFile & { sourceUrl?: string })[],
  folderId: string | undefined,
  origin: Origin,
  storage: Asset['storage'],
  newId: () => string,
  now = Date.now()
): { data: LibraryData; added: number } {
  const assets = data.assets.slice()
  const index = new Map(assets.map((a) => [a.path.toLowerCase(), a]))
  const images = data.images.slice()
  const here = new Set(images.filter((i) => i.folderId === folderId).map((i) => i.assetId))
  let added = 0
  for (const f of files) {
    const { asset, samePath } = assetFor(assets, index, f, origin, storage, now, newId)
    if (samePath && here.has(asset.id)) continue
    here.add(asset.id)
    images.push({ id: newId(), assetId: asset.id, folderId, name: nameFromPath(f.path), createdAt: now })
    added++
  }
  return { data: { ...data, assets, images }, added }
}

/** How a disk folder is added: keep its structure, put everything in one folder, or only its own images. */
export type DiskInclude = 'tree' | 'flat' | 'top'

/**
 * Add a scanned disk folder. `tree` makes a library folder for the folder
 * and for every sub-folder with images somewhere inside, all levels down;
 * images stay directly in the folder they are in on disk. `flat` puts every
 * image in one folder; `top` takes only the images directly in it. `skip`:
 * sub-folders left out. Files are linked, not copied, unless `storage` says
 * they were copied into the app.
 */
export function importScan(
  data: LibraryData,
  scan: ScannedDir[],
  opts: { parentId?: string; include: DiskInclude; skip?: string[]; storage?: Asset['storage']; linked?: boolean },
  newId: () => string,
  now = Date.now()
): { data: LibraryData; rootId: string; folders: number; images: number } {
  const root = scan.find((d) => d.parent === undefined)
  if (!root) throw new Error('Nothing was scanned.')
  const skip = opts.skip ?? []
  const skipped = (path: string) => skip.some((s) => samePath(s, path) || path.toLowerCase().startsWith(`${s.toLowerCase().replace(/[\\/]+$/, '')}\\`) || path.toLowerCase().startsWith(`${s.toLowerCase().replace(/[\\/]+$/, '')}/`))
  const dirs = scan.filter((d) => !skipped(d.path))
  const storage = opts.storage ?? 'linked'
  const origin: Origin = storage === 'stored' ? 'copy' : 'folder'
  const linked = opts.linked !== false && storage === 'linked'
  let out = data
  const folders = out.folders.slice()
  const made = new Map<string, string>()
  const source = (path: string, include: DiskInclude, withSkip: boolean): FolderSource | undefined =>
    linked ? { kind: 'disk', path, include, ...(withSkip && include !== 'top' && skip.length ? { skip } : {}), syncedAt: now } : undefined
  const mk = (d: ScannedDir, parentId: string | undefined, include: DiskInclude, withSkip = false) => {
    const id = newId()
    const src = source(d.path, include, withSkip)
    folders.push({ id, name: d.name, ...(parentId ? { parentId } : {}), createdAt: now, tags: [], ...(src ? { source: src } : {}) })
    made.set(d.path.toLowerCase(), id)
    return id
  }
  const rootId = mk(root, opts.parentId, opts.include, true)
  out = { ...out, folders }
  let images = 0
  if (opts.include === 'tree') {
    // Parents come before children in a scan, so each folder's parent already exists.
    for (const d of dirs) {
      if (d === root) continue
      const parent = d.parent ? made.get(d.parent.toLowerCase()) : undefined
      if (!parent) continue
      mk(d, parent, 'tree')
    }
    for (const d of dirs) {
      const id = made.get(d.path.toLowerCase())
      if (!id) continue
      const r = addFiles(out, d.files, id, origin, storage, newId, now)
      out = r.data
      images += r.added
    }
  } else {
    const files = opts.include === 'top' ? root.files : dirs.flatMap((d) => d.files)
    const r = addFiles(out, files, rootId, origin, storage, newId, now)
    out = r.data
    images += r.added
  }
  return { data: out, rootId, folders: made.size, images }
}

/**
 * Bring a folder that mirrors a disk folder up to date with a fresh scan of
 * it. New images are added; images whose file is gone stay (shown as
 * missing). A file that was moved or renamed on disk keeps its asset (so its
 * history and favorite) when its SHA-256 matches a missing image's. In a
 * kept structure, new disk sub-folders become folders, unless they were left
 * out before.
 */
export function rescanFolder(
  data: LibraryData,
  folderId: string,
  scan: ScannedDir[],
  newId: () => string,
  now = Date.now(),
  /** Asset ids whose file can't be found. */
  missing: Set<string> = new Set()
): { data: LibraryData; added: number; relinked: number; newFolders: number } {
  const top = data.folders.find((f) => f.id === folderId)
  if (!top || top.source?.kind !== 'disk') return { data, added: 0, relinked: 0, newFolders: 0 }
  const include = top.source.include
  let folders = data.folders.slice()
  let assets = data.assets.slice()
  // Library folders in this one that mirror a disk folder, by disk path.
  const mirror = new Map<string, string>()
  for (const id of descendantIds(folders, folderId)) {
    const f = folders.find((x) => x.id === id)
    if (f?.source?.kind === 'disk' && (id === folderId || include === 'tree')) mirror.set(f.source.path.toLowerCase(), id)
  }
  const skipOf = (id: string) => {
    const f = folders.find((x) => x.id === id)
    return f?.source?.kind === 'disk' ? (f.source.skip ?? []) : []
  }
  const isSkipped = (path: string, parentDir?: string) => {
    if (!parentDir) return false
    const owner = mirror.get(parentDir.toLowerCase())
    return !!owner && skipOf(owner).some((s) => samePath(s, path))
  }

  // Which library folder each scanned disk folder's images go to.
  const target = new Map<string, string>()
  let newFolders = 0
  const root = scan.find((d) => d.parent === undefined)
  const skippedDirs = new Set<string>()
  // A disk folder some library folder already mirrors (say, moved somewhere else) isn't made again.
  const elsewhere = new Set(folders.flatMap((f) => (f.source?.kind === 'disk' ? [f.source.path.toLowerCase()] : [])))
  for (const d of scan) {
    const key = d.path.toLowerCase()
    if (d.parent && (skippedDirs.has(d.parent.toLowerCase()) || isSkipped(d.path, d.parent))) {
      skippedDirs.add(key)
      continue
    }
    if (include === 'flat') target.set(key, folderId)
    else if (include === 'top') {
      if (d === root) target.set(key, folderId)
    } else if (mirror.has(key)) target.set(key, mirror.get(key)!)
    else if (d.parent && mirror.has(d.parent.toLowerCase()) && !elsewhere.has(key)) {
      const id = newId()
      folders.push({ id, name: d.name, parentId: mirror.get(d.parent.toLowerCase()), createdAt: now, tags: [], source: { kind: 'disk', path: d.path, include: 'tree', syncedAt: now } })
      mirror.set(key, id)
      target.set(key, id)
      newFolders++
    }
  }

  // Images here whose file is gone: a file with the same bytes takes their place.
  const subtree = new Set(mirror.values())
  const byId = assetMap(assets)
  const lost = data.images
    .filter((i) => i.folderId && subtree.has(i.folderId) && missing.has(i.assetId))
    .map((i) => byId.get(i.assetId))
    .filter((a): a is Asset => !!a?.sha256)
  const known = new Set(assets.map((a) => a.path.toLowerCase()))
  let relinked = 0
  for (const d of scan) {
    for (const f of d.files) {
      if (known.has(f.path.toLowerCase()) || !f.sha256) continue
      const at = lost.findIndex((a) => a.sha256 === f.sha256)
      if (at < 0) continue
      const was = lost.splice(at, 1)[0]
      assets = assets.map((a) => (a.id === was.id ? { ...a, path: f.path, size: f.size } : a))
      known.add(f.path.toLowerCase())
      relinked++
    }
  }

  let out: LibraryData = { ...data, folders, assets }
  let added = 0
  for (const d of scan) {
    const id = target.get(d.path.toLowerCase())
    if (!id) continue
    const r = addFiles(out, d.files, id, 'folder', 'linked', newId, now)
    out = r.data
    added += r.added
  }
  folders = out.folders.map((f) => (f.source?.kind === 'disk' && subtree.has(f.id) ? { ...f, source: { ...f.source, syncedAt: now } } : f))
  return { data: { ...out, folders }, added, relinked, newFolders }
}

/**
 * Put a Pinterest sync into its folder. Pins already kept anywhere keep
 * their asset (a pin is never downloaded twice). Images whose pin is gone
 * from the board are only listed in `gone`: whether to remove them is your
 * choice, and only a complete sync can say a pin is gone.
 */
export function applyPinterestSync(
  data: LibraryData,
  folderId: string,
  result: PinterestImport,
  newId: () => string,
  now = Date.now()
): { data: LibraryData; added: number; gone: LibraryImage[] } {
  let assets = data.assets.slice()
  const files: (FoundFile & { sourceUrl?: string; pinId?: string })[] = []
  for (const pin of result.pins) {
    const have = assets.find((a) => a.pinId === pin.pinId)
    if (have) {
      // Downloaded again (the old file was gone): point the asset at the new file.
      if (have.path.toLowerCase() !== pin.path.toLowerCase()) assets = assets.map((a) => (a.id === have.id ? { ...a, path: pin.path, size: pin.size, ...(pin.sha256 ? { sha256: pin.sha256 } : {}) } : a))
    }
    files.push(pin)
  }
  // addFiles finds pins kept before by their path; new ones get a pin id.
  const before = { ...data, assets }
  const pinIds = new Map(result.pins.map((p) => [p.path.toLowerCase(), p.pinId]))
  const r = addFiles(before, files, folderId, 'pinterest', 'stored', newId, now)
  const out = { ...r.data, assets: r.data.assets.map((a) => (a.pinId || !pinIds.has(a.path.toLowerCase()) ? a : { ...a, pinId: pinIds.get(a.path.toLowerCase()) })) }
  const complete = !result.report.partial && !result.report.limited
  const onBoard = new Set(result.pins.map((p) => p.pinId))
  const byId = assetMap(out.assets)
  const gone = complete
    ? out.images.filter((i) => {
        if (i.folderId !== folderId) return false
        const pin = byId.get(i.assetId)?.pinId
        return !!pin && !onBoard.has(pin)
      })
    : []
  const folders = out.folders.map((f) => (f.id === folderId && f.source?.kind === 'pinterest' ? { ...f, source: { ...f.source, syncedAt: now } } : f))
  return { data: { ...out, folders }, added: r.added, gone }
}

// ---------------------------------------------------------------------------
// Keeping stored files tidy

/**
 * After a restart (so Undo is over): assets no image uses and no session
 * remembers are dropped, and the stored files that are still needed are
 * listed. A stored file is needed while an image uses it, or while a session
 * has no smaller kept copy of it. Linked files are never touched.
 */
export function tidyAssets(
  data: LibraryData,
  sessions: { poses: { imageId: string; imagePath: string; keptPath?: string }[] }[]
): { data: LibraryData; inUse: string[]; dropped: number } {
  const used = new Set(data.images.map((i) => i.assetId))
  const remembered = new Set(sessions.flatMap((s) => s.poses.map((p) => p.imageId)))
  const assets = data.assets.filter((a) => used.has(a.id) || remembered.has(a.id))
  const inUse = new Set<string>()
  for (const a of assets) if (used.has(a.id)) inUse.add(a.path)
  for (const s of sessions) for (const p of s.poses) if (!p.keptPath) inUse.add(p.imagePath)
  return { data: assets.length === data.assets.length ? data : { ...data, assets }, inUse: [...inUse], dropped: data.assets.length - assets.length }
}

/** Every tag in use on folders. */
export function tagsInUse(folders: Folder[]): string[] {
  return [...new Set(folders.flatMap((f) => f.tags ?? []))].sort()
}
