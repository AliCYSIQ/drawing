// Remembers the main window's size, position and maximized state between launches.

import { screen, type BrowserWindow, type Rectangle } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dataDir } from './store'

interface WindowState {
  bounds: Rectangle
  maximized: boolean
}

const file = () => dataDir('window-state.json')

/** The saved state, or null when there is none or it would open off screen (a monitor was unplugged). */
export function loadWindowState(): WindowState | null {
  try {
    const s = JSON.parse(readFileSync(file(), 'utf8')) as WindowState
    const b = s.bounds
    if (![b.x, b.y, b.width, b.height].every(Number.isFinite)) return null
    const visible = screen.getAllDisplays().some(({ workArea: a }) => {
      const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
      const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
      return w >= 120 && h >= 80
    })
    return visible ? s : null
  } catch {
    return null
  }
}

/**
 * Save the normal (not maximized, not float) bounds when the window closes.
 * `floatBounds` gives the bounds from before float mode when float is on.
 */
export function trackWindowState(w: BrowserWindow, beforeFloat: () => { bounds: Rectangle; maximized: boolean } | null): void {
  w.on('close', () => {
    const saved = beforeFloat() ?? { bounds: w.getNormalBounds(), maximized: w.isMaximized() }
    try {
      mkdirSync(dataDir(), { recursive: true })
      writeFileSync(file(), JSON.stringify(saved))
    } catch {
      // Not worth stopping the app from closing.
    }
  })
}
