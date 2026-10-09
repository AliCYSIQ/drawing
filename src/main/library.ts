import { nativeImage, net } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { FolderInfo, ImageRef, PinterestImport } from '@shared/types'
import { fetchBoard, PINTEREST_UA, type PinImage } from './pinterest'
import { timedSync } from './log'
import { dataDir } from './store'

export const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif'])
const MAX_DOWNLOAD = 50 * 1024 * 1024

export function isImagePath(p: string): boolean {
  return IMAGE_EXTS.has(extname(p).toLowerCase())
}

export function imageId(path: string): string {
  return createHash('sha1').update(path.toLowerCase()).digest('hex').slice(0, 16)
}

export function refFor(path: string, sourceUrl?: string): ImageRef {
  return sourceUrl ? { id: imageId(path), path, sourceUrl } : { id: imageId(path), path }
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

/** Images in a folder; with `recursive` (the default) also in every folder inside it. */
export async function scanFolder(dir: string, recursive = true): Promise<ImageRef[]> {
  const entries = await readdir(dir, { recursive, withFileTypes: true })
  const paths = entries
    .filter((e) => e.isFile() && isImagePath(e.name))
    .map((e) => join(e.parentPath, e.name))
  paths.sort(byName)
  return paths.map((p) => refFor(p))
}

/** What a folder holds, so the app can ask what to do with its sub-folders. */
export async function inspectFolder(dir: string): Promise<FolderInfo> {
  const entries = await readdir(dir, { withFileTypes: true })
  const direct = entries.filter((e) => e.isFile() && isImagePath(e.name)).length
  const subfolders: FolderInfo['subfolders'] = []
  for (const e of entries.filter((x) => x.isDirectory()).sort((a, b) => byName(a.name, b.name))) {
    const path = join(dir, e.name)
    const count = (await scanFolder(path).catch(() => [])).length
    if (count) subfolders.push({ name: e.name, path, count })
  }
  const name = dir.split(/[\\/]/).filter(Boolean).pop() ?? 'Folder'
  return { name, path: dir, direct, subfolders }
}

/**
 * Copy images into the app's own folder for a collection, so the collection
 * keeps working if the originals are moved or deleted. Ids stay the same, so
 * favorites and history still match. With `baseDir`, sub-folders are kept.
 */
export async function copyImages(boardId: string, refs: ImageRef[], baseDir?: string): Promise<ImageRef[]> {
  const dir = collectionDir(boardId)
  await mkdir(dir, { recursive: true })
  const out: ImageRef[] = []
  for (const ref of refs) {
    const rel = baseDir && ref.path.toLowerCase().startsWith(baseDir.toLowerCase())
      ? ref.path.slice(baseDir.length).replace(/^[\\/]+/, '')
      : `${createHash('sha1').update(ref.path).digest('hex').slice(0, 16)}${extname(ref.path).toLowerCase()}`
    const target = join(dir, rel)
    try {
      await mkdir(dirname(target), { recursive: true })
      if (!existsSync(target)) await copyFile(ref.path, target)
      out.push({ ...ref, path: target })
    } catch {
      // A file that vanished or can't be read is left out of the copy.
    }
  }
  return out
}

export function refsForFiles(paths: string[]): ImageRef[] {
  return paths.filter(isImagePath).map((p) => refFor(p))
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

function collectionDir(boardId: string): string {
  return dataDir('collections', safeName(boardId))
}

function pinterestDir(boardId: string): string {
  return dataDir('cache', 'pinterest', safeName(boardId))
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

export async function importUrl(boardId: string, url: string): Promise<ImageRef> {
  const u = new URL(url)
  if (!['http:', 'https:', 'data:'].includes(u.protocol)) throw new Error('Only web links can be imported.')
  const { bytes, type } = await download(url)
  const dir = collectionDir(boardId)
  await mkdir(dir, { recursive: true })
  const name = createHash('sha1').update(bytes).digest('hex').slice(0, 16)
  const path = join(dir, name + extFromType(type, extname(u.pathname) || '.jpg'))
  if (!existsSync(path)) await writeFile(path, bytes)
  return refFor(path, u.protocol === 'data:' ? undefined : url)
}

export async function importBytes(boardId: string, fileName: string, bytes: Uint8Array): Promise<ImageRef> {
  if (bytes.length > MAX_DOWNLOAD) throw new Error('Image is too large.')
  const dir = collectionDir(boardId)
  await mkdir(dir, { recursive: true })
  const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 16)
  const ext = isImagePath(fileName) ? extname(fileName).toLowerCase() : '.png'
  const path = join(dir, hash + ext)
  if (!existsSync(path)) await writeFile(path, bytes)
  return refFor(path)
}

export async function removeBoardFiles(boardId: string): Promise<void> {
  await rm(collectionDir(boardId), { recursive: true, force: true })
  await rm(pinterestDir(boardId), { recursive: true, force: true })
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
 * Images already downloaded are kept; images no longer on the board are removed.
 */
export async function importPinterest(
  boardId: string,
  url: string,
  onProgress: (stage: 'list' | 'download', done: number, total: number) => void
): Promise<PinterestImport> {
  const board = await fetchBoard(url, {
    fetch: (u, init) => net.fetch(u, init) as never,
    onProgress: (n, total) => onProgress('list', n, total)
  })
  if (!board.pins.length) throw new Error('No images found on this board.')

  const dir = pinterestDir(boardId)
  await mkdir(dir, { recursive: true })
  const existing = new Map<string, string>()
  for (const f of await readdir(dir)) existing.set(f.replace(/\.[^.]+$/, ''), f)

  const images: (ImageRef | null)[] = new Array(board.pins.length).fill(null)
  let done = 0
  const queue = board.pins.map((pin, i) => ({ pin, i }))
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      // One retry: image hosts drop the odd request when six run at once.
      images[job.i] = await downloadPin(dir, job.pin, existing)
        .catch(() => downloadPin(dir, job.pin, existing))
        .catch(() => null)
      onProgress('download', ++done, board.pins.length)
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))

  const ok = images.filter((x): x is ImageRef => !!x)
  const seen = new Set(board.pins.map((p) => p.id))
  if (board.partial) {
    // An interrupted sync must not drop images an earlier sync already saved.
    for (const [id, f] of existing) if (!seen.has(id)) ok.push(refFor(join(dir, f), `https://www.pinterest.com/pin/${id}/`))
  } else {
    for (const [id, f] of existing) if (!seen.has(id)) await rm(join(dir, f), { force: true })
  }
  if (!ok.length) throw new Error('Could not download any images from this board.')
  return {
    name: board.name,
    images: ok,
    report: {
      found: board.pins.length,
      expected: board.expected,
      partial: board.partial,
      failed: images.filter((x) => !x).length
    }
  }
}

async function downloadPin(dir: string, pin: PinImage, existing: Map<string, string>): Promise<ImageRef> {
  const pinUrl = `https://www.pinterest.com/pin/${pin.id}/`
  const have = existing.get(pin.id)
  if (have) return refFor(join(dir, have), pinUrl)
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
  return refFor(path, pinUrl)
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
  const inside = [dataDir('captures'), dataDir('photos')].some((dir) => {
    const rel = relative(dir, path)
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
  })
  if (!inside) return false
  await rm(path, { force: true })
  return true
}
