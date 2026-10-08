// Float mode: the PureRef-style state of the main window, plus global hotkeys.
// The window is always frameless (the app draws its own title bar), so float
// mode only has to hide the app's chrome, shrink the window, and apply the
// on-top / opacity / lock / click-through options.

import { BrowserWindow, globalShortcut, type Rectangle } from 'electron'
import { DEFAULT_FLOAT, DEFAULT_HOTKEYS, type FloatState, type HotkeyAction, type Hotkeys } from '@shared/types'

const NORMAL_MIN = { width: 900, height: 620 }
const FLOAT_MIN = { width: 160, height: 120 }

let win: BrowserWindow | null = null
let state: FloatState = { ...DEFAULT_FLOAT }
let hotkeys: Hotkeys = { ...DEFAULT_HOTKEYS }
let sessionActive = false
let normalBounds: Rectangle | null = null
let wasMaximized = false
let floatBounds: Rectangle | null = null

export function attachFloat(w: BrowserWindow): void {
  win = w
  w.setMinimumSize(NORMAL_MIN.width, NORMAL_MIN.height)
  w.on('closed', () => {
    win = null
    globalShortcut.unregisterAll()
  })
}

export function getFloat(): FloatState {
  return state
}

export function setFloat(next: FloatState): void {
  if (!win) return
  const w = win
  const entering = next.on && !state.on
  const leaving = !next.on && state.on

  if (entering) {
    wasMaximized = w.isMaximized()
    if (wasMaximized) w.unmaximize()
    normalBounds = w.getBounds()
    w.setMinimumSize(FLOAT_MIN.width, FLOAT_MIN.height)
    w.setBounds(floatBounds ?? defaultFloatBounds(normalBounds))
  }
  if (leaving) {
    floatBounds = w.getBounds()
    // Undo everything float-only before resizing back.
    w.setIgnoreMouseEvents(false)
    w.setMovable(true)
    w.setResizable(true)
    w.setMinimumSize(NORMAL_MIN.width, NORMAL_MIN.height)
    if (normalBounds) w.setBounds(normalBounds)
    if (wasMaximized) w.maximize()
  }

  const on = next.on
  w.setAlwaysOnTop(on && next.alwaysOnTop, 'screen-saver')
  w.setOpacity(on ? Math.min(1, Math.max(0.2, next.opacity)) : 1)
  w.setMovable(!(on && next.locked))
  w.setResizable(!(on && next.locked))
  w.setIgnoreMouseEvents(on && next.clickThrough, { forward: true })

  state = { ...next, clickThrough: on && next.clickThrough }
  registerHotkeys()
  w.webContents.send('float:changed', state)
}

function defaultFloatBounds(from: Rectangle): Rectangle {
  const width = 420
  const height = 560
  return { x: from.x + from.width - width - 24, y: from.y + 48, width, height }
}

export function setHotkeys(next: Hotkeys): Record<HotkeyAction, boolean> {
  hotkeys = { ...next }
  return registerHotkeys()
}

export function setSessionActive(active: boolean): void {
  sessionActive = active
  registerHotkeys()
}

/**
 * Hotkeys are only registered while they are useful, so they don't take
 * shortcuts away from Clip Studio the rest of the time:
 * - float: always (turns float mode on/off)
 * - clickThrough: while float mode is on (it is the only way out of click-through)
 * - pause / next: while a session runs
 */
function registerHotkeys(): Record<HotkeyAction, boolean> {
  globalShortcut.unregisterAll()
  const result: Record<HotkeyAction, boolean> = { clickThrough: true, float: true, pause: true, next: true }
  const reg = (action: HotkeyAction, active: boolean, fn: () => void) => {
    const accel = hotkeys[action]
    if (!active || !accel) return
    try {
      result[action] = globalShortcut.register(accel, fn)
    } catch {
      result[action] = false
    }
  }
  reg('float', true, () => setFloat({ ...state, on: !state.on }))
  reg('clickThrough', state.on, () => setFloat({ ...state, clickThrough: !state.clickThrough }))
  reg('pause', sessionActive, () => win?.webContents.send('hotkey', 'pause'))
  reg('next', sessionActive, () => win?.webContents.send('hotkey', 'next'))
  return result
}
