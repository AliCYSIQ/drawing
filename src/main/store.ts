import { app } from 'electron'
import { execFile } from 'node:child_process'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { StoreName } from '@shared/types'

const NAMES: StoreName[] = ['boards', 'sessions', 'challenges', 'presets', 'settings']

/** Everything the app saves lives here (inside Electron's userData folder). */
export function dataDir(...parts: string[]): string {
  return join(app.getPath('userData'), 'data', ...parts)
}

function file(name: StoreName): string {
  if (!NAMES.includes(name)) throw new Error(`Unknown store: ${name}`)
  return dataDir(`${name}.json`)
}

export async function load<T>(name: StoreName): Promise<T | null> {
  let text: string
  try {
    text = await readFile(file(name), 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
  try {
    return JSON.parse(text) as T
  } catch {
    // Keep the damaged file for recovery instead of silently overwriting it.
    await rename(file(name), `${file(name)}.corrupt-${Date.now()}`)
    return null
  }
}

// One write at a time per file, so a slow write can't land after a newer one.
const queues = new Map<StoreName, Promise<void>>()

export function save(name: StoreName, data: unknown): Promise<void> {
  const prev = queues.get(name) ?? Promise.resolve()
  const next = prev.catch(() => {}).then(() => writeAtomic(file(name), JSON.stringify(data)))
  queues.set(name, next)
  return next
}

async function writeAtomic(target: string, text: string): Promise<void> {
  await mkdir(dataDir(), { recursive: true })
  const tmp = `${target}.tmp`
  await writeFile(tmp, text, 'utf8')
  // Windows can briefly lock the target (antivirus, indexer); retry a few times.
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(tmp, target)
      return
    } catch (err) {
      if (attempt >= 5) throw err
      await new Promise((r) => setTimeout(r, 50 * (attempt + 1)))
    }
  }
}

/** Zip the data folder (without the thumbnail cache) using Windows' built-in tar. */
export async function exportZip(target: string): Promise<void> {
  await mkdir(dataDir(), { recursive: true })
  await promisify(execFile)('tar.exe', ['-a', '-c', '-f', target, '--exclude', 'thumbs', '-C', dataDir(), '.'])
}
