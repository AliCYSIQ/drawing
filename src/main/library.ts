import { nativeImage, net } from 'electron'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { FolderInfo, FolderTree, FoundFile, PinFile, PinterestImport, ScannedDir } from '@shared/types'
import { fetchBoard, PINTEREST_UA, type PinImage } from './pinterest'
import { log, timedSync } from './log'
import { dataDir } from './store'

export const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif'])
const MAX_DOWNLOAD = 50 * 1024 * 1024

export function isImagePath(p: string): boolean {
  return IMAGE_EXTS.has(extname(p).toLowerCase())
}

/**
 * The id a new asset for this path gets. It only seeds the id: once an asset
 * exists, its id stays when the file moves, so it isn't tied to the path.
 */
export function imageId(path: string): string {
  return createHash('sha1').update(path.toLowerCase()).digest('hex').slice(0, 16)
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

/** SHA-256 of a file, read in pieces so a big file never sits in memory whole. */
export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject)
  })
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/** SHA-256 of each file (null where it can't be read), two at a time so the disk stays usable. */
export async function hashFiles(paths: string[]): Promise<(string | null)[]> {
  const out: (string | null)[] = new Array(paths.length).fill(null)
  let next = 0
  const worker = async () => {
    for (let i = next++; i < paths.length; i = next++) out[i] = await sha256File(paths[i]).catch(() => null)
  }
  await Promise.all([worker(), worker()])
  return out
}

async function found(path: string, size?: number): Promise<FoundFile> {
  return { path, id: imageId(path), size: size ?? (await stat(path).then((s) => s.size, () => 0)) }
}

/** Image files picked one by one. */
export async function filesInfo(paths: string[]): Promise<FoundFile[]> {
  return Promise.all(paths.filter(isImagePath).map((p) => found(p)))
}

/**
 * A disk folder and every sub-folder with images somewhere inside it, all
 * levels down, each with its own images. Parents come before their
 * sub-folders. Links (symlinks, junctions) are not followed.
 */
export async function scanTree(dir: string): Promise<ScannedDir[]> {
  const out: ScannedDir[] = []
  const walk = async (path: string, parent: string | undefined, depth: number): Promise<boolean> => {
    const entries = await readdir(path, { withFileTypes: true }).catch(() => [])
    const files = await Promise.all(
      entries
        .filter((e) => e.isFile() && isImagePath(e.name))
        .map((e) => e.name)
        .sort(byName)
        .map((n) => found(join(path, n)))
    )
    const at = out.length
    out.push({ path, name: basename(path) || path, ...(parent ? { parent } : {}), files })
    let any = files.length > 0
    if (depth < 32) {
      for (const e of entries.filter((x) => x.isDirectory()).sort((a, b) => byName(a.name, b.name))) {
        if (await walk(join(path, e.name), path, depth + 1)) any = true
      }
    }
    // A sub-folder with no images anywhere inside it is left out.
    if (!any && parent) out.splice(at)
    return any
  }
  if (!(await stat(dir).then((s) => s.isDirectory(), () => false))) throw new Error('That folder can’t be found.')
  await walk(dir, undefined, 0)
  return out
}

/**
 * A folder and its sub-folders that hold images, all levels down. Links
 * (symlinks, junctions) are not followed, so a loop can't trap it.
 */
export async function folderTree(dir: string, depth = 0): Promise<FolderTree> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const direct = entries.filter((e) => e.isFile() && isImagePath(e.name)).length
  const children: FolderTree[] = []
  if (depth < 32) {
    for (const e of entries.filter((x) => x.isDirectory()).sort((a, b) => byName(a.name, b.name))) {
      const t = await folderTree(join(dir, e.name), depth + 1)
      if (t.total) children.push(t)
    }
  }
  const name = dir.split(/[\\/]/).filter(Boolean).pop() ?? 'Folder'
  return { name, path: dir, direct, total: direct + children.reduce((a, c) => a + c.total, 0), children }
}

/** What a folder holds, so the app can ask what to do with its sub-folders. */
export async function inspectFolder(dir: string): Promise<FolderInfo> {
  const tree = await folderTree(dir)
  return {
    name: tree.name,
    path: dir,
    direct: tree.direct,
    subfolders: tree.children.map((c) => ({ name: c.name, path: c.path, count: c.total })),
    tree
  }
}

/**
 * Copy images into the app's own folder, so they keep working if the
 * originals are moved or deleted. The originals are only read. With
 * `baseDir`, sub-folders are kept. Returns the copies (null where a file
 * vanished or can't be read).
 */
export async function copyFiles(folderId: string, paths: string[], baseDir?: string): Promise<(FoundFile | null)[]> {
  const dir = collectionDir(folderId)
  await mkdir(dir, { recursive: true })
  const out: (FoundFile | null)[] = []
  for (const path of paths) {
    const rel = baseDir && path.toLowerCase().startsWith(baseDir.toLowerCase())
      ? path.slice(baseDir.length).replace(/^[\\/]+/, '')
      : `${createHash('sha1').update(path).digest('hex').slice(0, 16)}${extname(path).toLowerCase()}`
    const target = join(dir, rel)
    try {
      await mkdir(dirname(target), { recursive: true })
      if (!existsSync(target)) await copyFile(path, target)
      const bytes = await readFile(target)
      out.push({ path: target, id: imageId(target), size: bytes.length, sha256: sha256(bytes) })
    } catch {
      out.push(null)
    }
  }
  return out
}

function extFromType(type: string | null, fallback = '.jpg'): string {
  if (!type) return fallback
  if (type.includes('png')) return '.png'
  if (type.includes('webp')) return '.webp'
  if (type.includes('gif')) return '.gif'
  if (type.includes('avif')) return '.avif'
  if (type.includes('bmp')) return '.bmp'
  if (type.includes('jpeg') || type.includes('jpg')) return '.jpg'
  return fallback
}

/** Where pasted, downloaded and copied-in images for a folder are kept. */
function collectionDir(folderId: string): string {
  return dataDir('collections', safeName(folderId))
}

function pinterestDir(folderId: string): string {
  return dataDir('cache', 'pinterest', safeName(folderId))
}

function safeName(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '')
}

async function download(url: string, headers: Record<string, string> = {}): Promise<{ bytes: Buffer; type: string | null }> {
  const res = await net.fetch(url, { headers })
  if (!res.ok) throw new Error(`Download failed (${res.status})`)
  const type = res.headers.get('content-type')
  if (type && !type.startsWith('image/')) throw new Error('That link is not an image.')
  const bytes = Buffer.from(await res.arrayBuffer())
  if (bytes.length > MAX_DOWNLOAD) throw new Error('Image is too large.')
  return { bytes, type }
}

export async function importUrl(folderId: string, url: string): Promise<FoundFile & { sourceUrl?: string }> {
  const u = new URL(url)
  if (!['http:', 'https:', 'data:'].includes(u.protocol)) throw new Error('Only web links can be imported.')
  const { bytes, type } = await download(url)
  const dir = collectionDir(folderId)
  await mkdir(dir, { recursive: true })
  const name = createHash('sha1').update(bytes).digest('hex').slice(0, 16)
  const path = join(dir, name + extFromType(type, extname(u.pathname) || '.jpg'))
  if (!existsSync(path)) await writeFile(path, bytes)
  return { path, id: imageId(path), size: bytes.length, sha256: sha256(bytes), ...(u.protocol === 'data:' ? {} : { sourceUrl: url }) }
}

export async function importBytes(folderId: string, fileName: string, bytes: Uint8Array): Promise<FoundFile> {
  if (bytes.length > MAX_DOWNLOAD) throw new Error('Image is too large.')
  const dir = collectionDir(folderId)
  await mkdir(dir, { recursive: true })
  const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 16)
  const ext = isImagePath(fileName) ? extname(fileName).toLowerCase() : '.png'
  const path = join(dir, hash + ext)
  if (!existsSync(path)) await writeFile(path, bytes)
  return { path, id: imageId(path), size: bytes.length, sha256: sha256(bytes) }
}

/**
 * Delete what a first Pinterest import downloaded for a folder that was
 * never saved (the import failed). Only that new folder's own download
 * folder: pins it reused from other folders live elsewhere and stay.
 */
export async function removeImportFiles(folderId: string): Promise<void> {
  await rm(pinterestDir(folderId), { recursive: true, force: true })
}

/**
 * Remove images the app stored (pasted, downloaded, copied in, Pinterest)
 * that nothing needs any more: no library image uses them and no session
 * lacks its own smaller copy. Only files inside the app's own stored-image
 * folders can go; your own files elsewhere are never touched.
 */
export async function cleanStoredFiles(inUse: string[]): Promise<number> {
  const used = new Set(inUse.map((p) => p.toLowerCase()))
  let removed = 0
  for (const root of [dataDir('collections'), dataDir('cache', 'pinterest')]) {
    if (!existsSync(root)) continue
    for (const id of await readdir(root)) {
      const dir = join(root, id)
      const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => [])
      let kept = 0
      for (const e of entries) {
        if (!e.isFile()) continue
        const path = join(e.parentPath, e.name)
        if (used.has(path.toLowerCase()) || !isInside(root, path)) kept++
        else {
          await rm(path, { force: true })
          removed++
        }
      }
      if (!kept) await rm(dir, { recursive: true, force: true })
    }
  }
  return removed
}

/** Which of these files no longer exist. */
export async function missingFiles(paths: string[]): Promise<string[]> {
  const gone: string[] = []
  const batch = 64
  for (let i = 0; i < paths.length; i += batch) {
    const part = paths.slice(i, i + batch)
    const found = await Promise.all(part.map((p) => stat(p).then(() => true, () => false)))
    part.forEach((p, k) => !found[k] && gone.push(p))
  }
  return gone
}

/**
 * Keep a copy (at most 1600 px, once per image) of a reference that was
 * practiced, so history and review still show it after the original is
 * moved or deleted. Returns the copy's path, or null if it can't be made.
 */
export async function keepReference(imageId: string, path: string): Promise<string | null> {
  const out = dataDir('kept', `${imageId.replace(/[^a-zA-Z0-9_-]/g, '')}.jpg`)
  if (existsSync(out)) return out
  let img = timedSync('history copy read', () => nativeImage.createFromPath(path))
  if (img.isEmpty()) {
    // nativeImage only reads PNG/JPEG; Windows' thumbnailer handles WebP and the rest.
    img = await nativeImage.createThumbnailFromPath(path, { width: 1600, height: 1600 }).catch(() => nativeImage.createEmpty())
  }
  if (img.isEmpty()) return null
  const { width, height } = img.getSize()
  const jpeg = timedSync('history copy resize', () => {
    const small = Math.max(width, height) <= 1600 ? img : width >= height ? img.resize({ width: 1600, quality: 'good' }) : img.resize({ height: 1600, quality: 'good' })
    return small.toJPEG(88)
  })
  await mkdir(dataDir('kept'), { recursive: true })
  await writeFile(out, jpeg)
  return out
}

/**
 * After a folder was moved: find each image at the same place relative to
 * the new folder. Returns the new path, or null where it isn't there.
 */
export async function relinkFolder(oldDir: string, newDir: string, paths: string[]): Promise<(string | null)[]> {
  const lower = oldDir.toLowerCase()
  return Promise.all(
    paths.map(async (p) => {
      const rel = p.toLowerCase().startsWith(lower) ? p.slice(oldDir.length).replace(/^[\\/]+/, '') : p.split(/[\\/]/).pop()!
      const candidate = join(newDir, rel)
      return stat(candidate).then(() => candidate, () => null)
    })
  )
}

/** Copy review photos into the data folder so they survive the originals being moved. */
export async function keepPhoto(sessionId: string, src: string): Promise<string> {
  const dir = dataDir('photos', safeName(sessionId))
  await mkdir(dir, { recursive: true })
  const res = await net.fetch(pathToFileURL(src).toString())
  const bytes = Buffer.from(await res.arrayBuffer())
  const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 16)
  const path = join(dir, hash + extname(src).toLowerCase())
  if (!existsSync(path)) await writeFile(path, bytes)
  return path
}

/**
 * Fetch a Pinterest board and download its images, so practice works offline.
 * Pins already saved (by an earlier sync of any folder; `known`: pin id →
 * file) are not downloaded again. Nothing is deleted here: pins that left the
 * board are the library's business, and only after asking.
 */
export async function importPinterest(
  folderId: string,
  url: string,
  onProgress: (stage: 'list' | 'download', done: number, total: number) => void,
  known: Record<string, string> = {}
): Promise<PinterestImport> {
  const board = await fetchBoard(url, {
    // Node's own fetch, not Electron's: through Chromium's network stack the
    // board page comes without its "next page" bookmark, and a bookmark from
    // the feed then leads to an empty page (25 of 35 pins on a real board).
    fetch: (u, init) => globalThis.fetch(u, init as RequestInit) as never,
    onProgress: (n, total) => onProgress('list', n, total)
  })
  const d = board.diagnostics
  log(
    'info',
    `Pinterest sync ${url}: ${board.pins.length} pins of ${board.expected || '?'}, ${board.skipped} not pictures, ${d.duplicates} seen twice, stop: ${d.stop}; pages: ` +
      d.pages.map((p) => `${p.kind} ${p.status}${p.tries > 1 ? `x${p.tries}` : ''} ${p.newPins}/${p.pins}${p.next ? '>' : ''}`).join(', ')
  )
  if (!board.pins.length) {
    throw new Error(board.skipped ? 'This board has no pictures the app can use (only videos or other items).' : 'No images found on this board.')
  }

  const dir = pinterestDir(folderId)
  await mkdir(dir, { recursive: true })
  const existing = new Map<string, string>()
  for (const f of await readdir(dir)) existing.set(f.replace(/\.[^.]+$/, ''), join(dir, f))
  for (const [pin, path] of Object.entries(known)) if (!existing.has(pin) && existsSync(path)) existing.set(pin, path)

  const pins: ((PinFile & { fresh?: boolean }) | null)[] = new Array(board.pins.length).fill(null)
  let done = 0
  const queue = board.pins.map((pin, i) => ({ pin, i }))
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      // One retry: image hosts drop the odd request when six run at once.
      pins[job.i] = await downloadPin(dir, job.pin, existing)
        .catch(() => downloadPin(dir, job.pin, existing))
        .catch(() => null)
      onProgress('download', ++done, board.pins.length)
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))

  const ok = pins.filter((x): x is PinFile & { fresh?: boolean } => !!x).map(({ fresh, ...p }) => (void fresh, p))
  if (!ok.length) throw new Error('Could not download any images from this board.')
  return {
    name: board.name,
    pins: ok,
    report: {
      found: board.pins.length,
      expected: board.expected,
      partial: board.partial,
      failed: pins.filter((x) => !x).length,
      limited: board.limited,
      skipped: board.skipped,
      downloaded: pins.filter((x) => x?.fresh).length,
      diagnostics: board.diagnostics
    }
  }
}

async function downloadPin(dir: string, pin: PinImage, existing: Map<string, string>): Promise<PinFile & { fresh?: boolean }> {
  const pinUrl = `https://www.pinterest.com/pin/${pin.id}/`
  const have = existing.get(pin.id)
  if (have) return { ...(await found(have)), pinId: pin.id, sourceUrl: pinUrl }
  let got: { bytes: Buffer; type: string | null }
  try {
    got = await download(pin.url, { 'User-Agent': PINTEREST_UA })
  } catch (err) {
    // Some "originals" are missing; the 736px copy almost always exists.
    if (!pin.url.includes('/originals/')) throw err
    got = await download(pin.url.replace('/originals/', '/736x/'), { 'User-Agent': PINTEREST_UA })
  }
  const path = join(dir, pin.id + extFromType(got.type, extname(new URL(pin.url).pathname) || '.jpg'))
  await writeFile(path, got.bytes)
  return { path, id: imageId(path), size: got.bytes.length, sha256: sha256(got.bytes), pinId: pin.id, sourceUrl: pinUrl, fresh: true }
}

/** Small JPEG thumbnails, cached by path + modified time. Returns null to fall back to the full image. */
export async function thumbnail(path: string, size: number): Promise<string | null> {
  let mtime: number
  try {
    mtime = (await stat(path)).mtimeMs
  } catch {
    return null
  }
  const key = createHash('sha1').update(`${path}|${mtime}|${size}`).digest('hex')
  const out = dataDir('thumbs', `${key}.jpg`)
  if (existsSync(out)) return out
  let img = nativeImage.createEmpty()
  try {
    img = await nativeImage.createThumbnailFromPath(path, { width: size, height: size })
  } catch {
    img = timedSync('thumbnail fallback', () => {
      const full = nativeImage.createFromPath(path)
      return full.isEmpty() ? full : full.resize({ width: Math.min(size, full.getSize().width), quality: 'good' })
    })
  }
  if (img.isEmpty()) return null
  await mkdir(dataDir('thumbs'), { recursive: true })
  await writeFile(out, img.toJPEG(82))
  return out
}

/**
 * Delete a capture or review photo the app keeps (never a file outside the
 * app's captures and photos folders). Returns whether a file was removed.
 */
export async function deleteSessionFile(path: string): Promise<boolean> {
  if (![dataDir('captures'), dataDir('photos')].some((dir) => isInside(dir, path))) return false
  await rm(path, { force: true })
  return true
}

function isInside(dir: string, path: string): boolean {
  const rel = relative(dir, path)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}
