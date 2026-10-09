// What float mode asks of the window, as plain data, so only real changes
// reach Windows. Re-applying unchanged styles (resizable, layered, ignore
// mouse) makes Windows rebuild the window frame, which showed up as lag.
// No Electron imports here, so it can be tested on its own.

import type { FloatState, HotkeyAction, Hotkeys } from '@shared/types'

export interface WindowProps {
  onTop: boolean
  /** 1 = opaque. */
  opacity: number
  movable: boolean
  resizable: boolean
  /** Clicks pass through to the window below. */
  ignoreMouse: boolean
}

/** A new window: not on top, opaque, movable, resizable, takes clicks. */
export const NORMAL_WINDOW: WindowProps = { onTop: false, opacity: 1, movable: true, resizable: true, ignoreMouse: false }

export function windowProps(s: FloatState): WindowProps {
  const on = s.on
  return {
    onTop: on && s.alwaysOnTop,
    opacity: on ? Math.round(Math.min(1, Math.max(0.2, s.opacity)) * 100) / 100 : 1,
    movable: !(on && s.locked),
    resizable: !(on && s.locked),
    ignoreMouse: on && s.clickThrough
  }
}

/** Only the properties that differ between what the window has and what it needs. */
export function changedProps(applied: WindowProps, next: WindowProps): Partial<WindowProps> {
  const out: Partial<WindowProps> = {}
  for (const key of Object.keys(next) as (keyof WindowProps)[]) {
    if (applied[key] !== next[key]) (out as Record<string, unknown>)[key] = next[key]
  }
  return out
}

/**
 * Which hotkeys should be registered right now (action → accelerator).
 * - float: always (turns float mode on/off)
 * - clickThrough: while float mode is on (it is the only way out of click-through)
 * - pause / next: while a session runs
 */
export function wantedHotkeys(hotkeys: Hotkeys, floatOn: boolean, sessionActive: boolean): Partial<Record<HotkeyAction, string>> {
  const active: Record<HotkeyAction, boolean> = { float: true, clickThrough: floatOn, pause: sessionActive, next: sessionActive }
  const out: Partial<Record<HotkeyAction, string>> = {}
  for (const action of Object.keys(active) as HotkeyAction[]) {
    if (active[action] && hotkeys[action]) out[action] = hotkeys[action]
  }
  return out
}
