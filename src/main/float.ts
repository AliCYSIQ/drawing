// Float mode: the PureRef-style state of the main window, plus global hotkeys.
// The window is always frameless (the app draws its own title bar), so float
// mode only has to hide the app's chrome, shrink the window, and apply the
// on-top / opacity / lock / click-through options.
//
// Two things keep it light (v0.2.5, after click-through caused lag and crashes):
// - Only properties that changed are applied to the window (see floatProps.ts).
// - Click-through doesn't forward mouse moves. Forwarding installs a
//   system-wide mouse hook on Windows that runs on the app's main thread, so
//   the whole PC's mouse waited for the app. The float controls never show
//   during click-through, so nothing needs those moves.

import { BrowserWindow, globalShortcut, type Rectangle } from 'electron'
import { DEFAULT_FLOAT, DEFAULT_HOTKEYS, type FloatState, type HotkeyAction, type Hotkeys } from '@shared/types'
import { changedProps, NORMAL_WINDOW, wantedHotkeys, windowProps, type WindowProps } from './floatProps'
import { log } from './log'

const NORMAL_MIN = { width: 900, height: 620 }
const FLOAT_MIN = { width: 160, height: 120 }

let win: BrowserWindow | null = null
let state: FloatState = { ...DEFAULT_FLOAT }
let applied: WindowProps = { ...NORMAL_WINDOW }
let hotkeys: Hotkeys = { ...DEFAULT_HOTKEYS }
let sessionActive = false
let normalBounds: Rectangle | null = null
let wasMaximized = false
let floatBounds: Rectangle | null = null

/** Accelerators registered now, by action, and whether each one worked. */
const registered = new Map<HotkeyAction, string>()
const status: Record<HotkeyAction, boolean> = { clickThrough: true, float: true, pause: true, next: true }

export function attachFloat(w: BrowserWindow): void {
  win = w
  w.setMinimumSize(NORMAL_MIN.width, NORMAL_MIN.height)
  w.on('closed', () => {
    win = null
    globalShortcut.unregisterAll()
    registered.clear()
  })
}

export function getFloat(): FloatState {
  return state
}

/** While float mode is on: the window's size and place from before it, for saving at exit. */
export function boundsBeforeFloat(): { bounds: Rectangle; maximized: boolean } | null {
  return state.on && normalBounds ? { bounds: normalBounds, maximized: wasMaximized } : null
}

export function setFloat(next: FloatState): void {
  if (!win || win.isDestroyed()) return
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
    applyProps(w, { ...NORMAL_WINDOW, onTop: applied.onTop, opacity: applied.opacity })
    w.setMinimumSize(NORMAL_MIN.width, NORMAL_MIN.height)
    if (normalBounds) w.setBounds(normalBounds)
    if (wasMaximized) w.maximize()
  }

  applyProps(w, windowProps(next))
  const wasOn = state.on
  state = { ...next, clickThrough: next.on && next.clickThrough }
  if (wasOn !== state.on) syncHotkeys()
  w.webContents.send('float:changed', state)
}

/** Apply only what differs from what the window already has. */
function applyProps(w: BrowserWindow, next: WindowProps): void {
  const c = changedProps(applied, next)
  if (c.onTop !== undefined) w.setAlwaysOnTop(c.onTop, 'screen-saver')
  // Opacity is only ever set once it isn't 1: setting it makes the window a
  // layered window on Windows, which costs more to draw.
  if (c.opacity !== undefined) w.setOpacity(c.opacity)
  if (c.movable !== undefined) w.setMovable(c.movable)
  if (c.resizable !== undefined) w.setResizable(c.resizable)
  if (c.ignoreMouse !== undefined) w.setIgnoreMouseEvents(c.ignoreMouse)
  applied = { ...applied, ...c }
}

function defaultFloatBounds(from: Rectangle): Rectangle {
  const width = 420
  const height = 560
  return { x: from.x + from.width - width - 24, y: from.y + 48, width, height }
}

export function setHotkeys(next: Hotkeys): Record<HotkeyAction, boolean> {
  const changed = (Object.keys(next) as HotkeyAction[]).filter((a) => next[a] !== hotkeys[a])
  hotkeys = { ...next }
  // A changed accelerator is registered again even if its action stays active.
  for (const a of changed) unregister(a)
  syncHotkeys()
  return { ...status }
}

export function setSessionActive(active: boolean): void {
  if (sessionActive === active) return
  sessionActive = active
  syncHotkeys()
}

/**
 * Register only the hotkeys that are useful now, so they don't take shortcuts
 * away from Clip Studio the rest of the time. Only what changed is touched:
 * the old code unregistered everything on every change, including from inside
 * the hotkey being handled.
 */
function syncHotkeys(): void {
  const wanted = wantedHotkeys(hotkeys, state.on, sessionActive)
  for (const action of [...registered.keys()]) {
    if (wanted[action] !== registered.get(action)) unregister(action)
  }
  for (const [action, accel] of Object.entries(wanted) as [HotkeyAction, string][]) {
    if (registered.has(action)) continue
    try {
      // Run the action after the hotkey's own handler has returned, so it can
      // change which hotkeys are registered without touching the one firing.
      const ok = globalShortcut.register(accel, () => setImmediate(() => run(action)))
      status[action] = ok
      if (ok) registered.set(action, accel)
    } catch (err) {
      status[action] = false
      log('warn', `Hotkey ${accel} could not be registered: ${(err as Error).message}`)
    }
  }
  for (const action of Object.keys(status) as HotkeyAction[]) {
    if (!(action in wanted)) status[action] = true
  }
}

function unregister(action: HotkeyAction): void {
  const accel = registered.get(action)
  if (!accel) return
  try {
    globalShortcut.unregister(accel)
  } catch {
    // Already gone.
  }
  registered.delete(action)
}

function run(action: HotkeyAction): void {
  if (action === 'float') setFloat({ ...state, on: !state.on })
  else if (action === 'clickThrough') {
    if (state.on) setFloat({ ...state, clickThrough: !state.clickThrough })
  } else win?.webContents.send('hotkey', action)
}
