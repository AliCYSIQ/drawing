// Clip Studio capture: pick a screen rectangle once, then grab it at the end
// of each pose so review can show the drawing next to the reference.

import { BrowserWindow, desktopCapturer, ipcMain, screen } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Region } from '@shared/types'
import { cropRect, findWindow, flatColour, type CaptureResult, type CaptureTarget, type CaptureWindow, type WindowChoice } from '@shared/capture'
import { timedSync } from './log'
import { dataDir } from './store'

/**
 * Show a see-through window over the display under the mouse and let the user
 * drag a rectangle. The main window hides meanwhile so the canvas is visible.
 */
export function pickRegion(
  main: BrowserWindow,
  load: (w: BrowserWindow, hash: string) => void,
  preload: string
): Promise<Region | null> {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const picker = new BrowserWindow({
    ...display.bounds,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: { preload }
  })
  picker.setAlwaysOnTop(true, 'screen-saver')
  main.hide()
  load(picker, 'region-picker')

  return new Promise((resolve) => {
    let settled = false
    const finish = (rect: Omit<Region, 'displayId'> | null) => {
      if (settled) return
      settled = true
      ipcMain.removeListener('region:done', onDone)
      if (!picker.isDestroyed()) picker.close()
      main.show()
      if (!rect || rect.width < 20 || rect.height < 20) return resolve(null)
      resolve({ displayId: display.id, ...rect })
    }
    const onDone = (e: Electron.IpcMainEvent, rect: Omit<Region, 'displayId'> | null) => {
      if (e.sender === picker.webContents) finish(rect)
    }
    ipcMain.on('region:done', onDone)
    picker.on('closed', () => finish(null))
  })
}

function sessionDir(sessionId: string): string {
  return dataDir('captures', sessionId.replace(/[^a-zA-Z0-9_-]/g, ''))
}

export async function captureRegion(region: Region, sessionId: string, index: number): Promise<string | null> {
  const display = screen.getAllDisplays().find((d) => d.id === region.displayId) ?? screen.getPrimaryDisplay()
  const sf = display.scaleFactor
  const size = { width: Math.round(display.size.width * sf), height: Math.round(display.size.height * sf) }
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size })
  const source = sources.find((s) => s.display_id === String(display.id)) ?? (sources.length === 1 ? sources[0] : null)
  if (!source || source.thumbnail.isEmpty()) return null

  // The thumbnail may come back at a slightly different size; scale the rectangle to it.
  const shot = source.thumbnail.getSize()
  const kx = shot.width / display.size.width
  const ky = shot.height / display.size.height
  const crop = {
    x: Math.max(0, Math.round(region.x * kx)),
    y: Math.max(0, Math.round(region.y * ky)),
    width: Math.round(region.width * kx),
    height: Math.round(region.height * ky)
  }
  crop.width = Math.min(crop.width, shot.width - crop.x)
  crop.height = Math.min(crop.height, shot.height - crop.y)
  if (crop.width <= 0 || crop.height <= 0) return null

  const dir = sessionDir(sessionId)
  await mkdir(dir, { recursive: true })
  const file = join(dir, `${String(index + 1).padStart(3, '0')}.png`)
  const png = timedSync('canvas capture encode', () => source.thumbnail.crop(crop).toPNG())
  await writeFile(file, png)
  return file
}

// ---------------------------------------------------------------------------
// A chosen window. Electron's desktopCapturer takes a window's own picture,
// so it doesn't matter which window is in front (checked: a window covered by
// another still comes back as itself). A minimized window isn't listed.

/** The app's own windows are never offered or captured. */
function ownWindowIds(): Set<string> {
  return new Set(BrowserWindow.getAllWindows().map((w) => w.getMediaSourceId()))
}

/** Thumbnails are scaled to fit this box; the biggest screen keeps a full-size window sharp. */
function fullSize(): { width: number; height: number } {
  let width = 0
  let height = 0
  for (const d of screen.getAllDisplays()) {
    width = Math.max(width, Math.round(d.size.width * d.scaleFactor))
    height = Math.max(height, Math.round(d.size.height * d.scaleFactor))
  }
  return { width: width || 1920, height: height || 1080 }
}

async function openWindows(thumbnailSize: { width: number; height: number }, icons = false) {
  const own = ownWindowIds()
  const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize, fetchWindowIcons: icons })
  return sources.filter((s) => !own.has(s.id) && s.name.trim() !== '')
}

/** Open windows to choose from, with small pictures. */
export async function listWindows(): Promise<WindowChoice[]> {
  const list = await openWindows({ width: 360, height: 240 }, true)
  return list
    .filter((s) => !s.thumbnail.isEmpty())
    .map((s) => ({
      id: s.id,
      title: s.name,
      thumbnail: s.thumbnail.toDataURL(),
      ...(s.appIcon && !s.appIcon.isEmpty() ? { icon: s.appIcon.toDataURL() } : {})
    }))
}

/** A big picture of one window, for choosing the part to capture. Null when it isn't open (or minimized). */
export async function windowPreview(id: string): Promise<string | null> {
  const s = (await openWindows({ width: 1600, height: 1200 })).find((x) => x.id === id)
  return s && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : null
}

/** Capture the chosen window (or part of it) into the session's captures. Never falls back to the screen. */
export async function captureWindow(chosen: CaptureWindow, sessionId: string, index: number): Promise<CaptureResult> {
  const sources = await openWindows(fullSize())
  const match = findWindow(
    sources.map((s) => ({ id: s.id, name: s.name })),
    chosen
  )
  if ('error' in match) {
    return {
      error:
        match.error === 'ambiguous'
          ? `Several open windows look like “${chosen.title}”. Choose the window again.`
          : `The window “${chosen.title}” isn't open, or it is minimized. Open or restore it, then try again.`
    }
  }
  const source = sources.find((s) => s.id === match.id)!
  const img = source.thumbnail
  if (img.isEmpty()) return { error: `The window “${match.title}” gave no picture. Is it minimized?`, hint: match.id, title: match.title }
  const { width, height } = img.getSize()
  const rect = cropRect(chosen.crop, width, height)
  const part = rect.width === width && rect.height === height ? img : img.crop(rect)
  const size = part.getSize()
  const look = flatColour(part.toBitmap(), size.width, size.height)
  if (look.flat && look.dark) return { error: `The picture of “${match.title}” came back black. Is it minimized, or hidden by Windows?`, hint: match.id, title: match.title }
  const dir = sessionDir(sessionId)
  await mkdir(dir, { recursive: true })
  const file = join(dir, `${String(index + 1).padStart(3, '0')}.png`)
  const png = timedSync('window capture encode', () => part.toPNG())
  await writeFile(file, png)
  return { path: file, hint: match.id, title: match.title }
}

/** Capture what the setup says: the chosen window, or the older fixed screen area. */
export async function capture(target: CaptureTarget, sessionId: string, index: number): Promise<CaptureResult> {
  try {
    if (target.kind === 'window') return await captureWindow(target.window, sessionId, index)
    const path = await captureRegion(target.region, sessionId, index)
    return path ? { path } : { error: 'The screen area could not be captured. Pick it again in Settings.' }
  } catch (err) {
    return { error: `The capture failed: ${(err as Error).message}` }
  }
}
