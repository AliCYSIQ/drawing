// Clip Studio capture: pick a screen rectangle once, then grab it at the end
// of each pose so review can show the drawing next to the reference.

import { BrowserWindow, desktopCapturer, ipcMain, screen } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Region } from '@shared/types'
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

export async function saveMarkup(sessionId: string, name: string, png: Uint8Array): Promise<string> {
  const dir = sessionDir(sessionId)
  await mkdir(dir, { recursive: true })
  const file = join(dir, `${name.replace(/[^a-zA-Z0-9_-]/g, '')}.png`)
  await writeFile(file, png)
  return file
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
  await writeFile(file, source.thumbnail.crop(crop).toPNG())
  return file
}
