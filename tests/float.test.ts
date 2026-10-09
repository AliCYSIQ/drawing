import { describe, expect, it } from 'vitest'
import { DEFAULT_FLOAT, DEFAULT_HOTKEYS } from '@shared/types'
import { changedProps, NORMAL_WINDOW, wantedHotkeys, windowProps } from '../src/main/floatProps'

describe('float window properties', () => {
  it('a window outside float mode is a normal window, whatever the saved options', () => {
    expect(windowProps({ ...DEFAULT_FLOAT, on: false, opacity: 0.4, locked: true, clickThrough: true })).toEqual(NORMAL_WINDOW)
  })

  it('float mode applies on-top, opacity, lock and click-through', () => {
    expect(windowProps({ on: true, alwaysOnTop: true, opacity: 0.55, locked: true, clickThrough: true })).toEqual({
      onTop: true,
      opacity: 0.55,
      movable: false,
      resizable: false,
      ignoreMouse: true
    })
  })

  it('opacity stays between 20% and 100%', () => {
    expect(windowProps({ ...DEFAULT_FLOAT, on: true, opacity: 0.01 }).opacity).toBe(0.2)
    expect(windowProps({ ...DEFAULT_FLOAT, on: true, opacity: 3 }).opacity).toBe(1)
  })

  it('only changed properties are applied', () => {
    const on = windowProps({ on: true, alwaysOnTop: true, opacity: 1, locked: true, clickThrough: true })
    // Turning click-through off (Ctrl+Alt+L) touches nothing else.
    const off = windowProps({ on: true, alwaysOnTop: true, opacity: 1, locked: true, clickThrough: false })
    expect(changedProps(on, off)).toEqual({ ignoreMouse: false })
    expect(changedProps(off, off)).toEqual({})
  })

  it('entering float mode at full opacity never sets opacity', () => {
    const next = windowProps({ ...DEFAULT_FLOAT, on: true })
    expect(changedProps(NORMAL_WINDOW, next)).not.toHaveProperty('opacity')
  })
})

describe('hotkeys in use', () => {
  it('float is always on; click-through only in float mode; pause and next only in a session', () => {
    expect(Object.keys(wantedHotkeys(DEFAULT_HOTKEYS, false, false))).toEqual(['float'])
    expect(Object.keys(wantedHotkeys(DEFAULT_HOTKEYS, true, false)).sort()).toEqual(['clickThrough', 'float'])
    expect(Object.keys(wantedHotkeys(DEFAULT_HOTKEYS, true, true)).sort()).toEqual(['clickThrough', 'float', 'next', 'pause'])
  })

  it('an empty hotkey is not registered', () => {
    expect(wantedHotkeys({ ...DEFAULT_HOTKEYS, float: '' }, false, false)).toEqual({})
  })
})
