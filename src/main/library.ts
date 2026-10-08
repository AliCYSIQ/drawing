import { nativeImage, net } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ImageRef } from '@shared/types'
import { fetchBoard, PINTEREST_UA, type PinImage } from './pinterest'
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

export async function scanFolder(dir: string): Promise<ImageRef[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  const paths = entries
    .filter((e) => e.isFile() && isImagePath(e.name))
    .map((e) => join(e.parentPath, e.name))
  paths.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  return paths.map((p) => refFor(p))
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
): Promise<{ name: string; images: ImageRef[] }> {
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
      images[job.i] = await downloadPin(dir, job.pin, existing).catch(() => null)
      onProgress('download', ++done, board.pins.length)
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))

  const keep = new Set(board.pins.map((p) => p.id))
  for (const [id, f] of existing) if (!keep.has(id)) await rm(join(dir, f), { force: true })

  const ok = images.filter((x): x is ImageRef => !!x)
  if (!ok.length) throw new Error('Could not download any images from this board.')
  return { name: board.name, images: ok }
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
    const full = nativeImage.createFromPath(path)
    if (!full.isEmpty()) img = full.resize({ width: Math.min(size, full.getSize().width), quality: 'good' })
  }
  if (img.isEmpty()) return null
  await mkdir(dataDir('thumbs'), { recursive: true })
  await writeFile(out, img.toJPEG(82))
  return out
}
