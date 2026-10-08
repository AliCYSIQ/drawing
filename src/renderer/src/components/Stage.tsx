import { useEffect, useRef, useState, type ReactNode } from 'react'
import { imageUrl } from '@shared/api'
import { useApp } from '../store'
import { Close, Lock, Pin, Through } from './Icons'
import { IconButton } from './ui'

const HIDE_AFTER_MS = 4000
/** A press that moves less than this is a click, not a drag. */
const CLICK_SLOP = 4

/**
 * The area that shows a reference.
 *
 * Normal window: the controls appear on hover.
 * Float mode: hovering never shows anything, because it got in the way while
 * drawing next to the window. A click shows the controls; they hide again
 * after a few idle seconds, when the mouse leaves, or on the next click.
 * With click-through on they never show (the hotkeys still work).
 * Dragging the stage moves the window (by hand, so hover still works).
 */
export function Stage({
  path,
  flip,
  grey,
  children,
  overlay
}: {
  path: string | null
  flip?: boolean
  grey?: boolean
  /** Controls shown at the bottom on hover. */
  children?: ReactNode
  /** Anything drawn over the image (rest screen, paused label). */
  overlay?: ReactNode
}) {
  const float = useApp((s) => s.float)
  const setFloat = useApp((s) => s.setFloat)
  const press = useRef<{ x: number; y: number; wx: number; wy: number; moved: boolean } | null>(null)
  const [shown, setShown] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const keepShown = () => {
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setShown(false), HIDE_AFTER_MS)
  }
  useEffect(() => () => clearTimeout(hideTimer.current), [])
  // Entering or leaving float mode starts with the controls hidden.
  useEffect(() => setShown(false), [float.on])

  const onPointerDown = (e: React.PointerEvent) => {
    if (!float.on || e.button !== 0) return
    if ((e.target as HTMLElement).closest('button, input, [data-no-drag]')) return
    press.current = { x: e.screenX, y: e.screenY, wx: window.screenX, wy: window.screenY, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (shown) keepShown()
    const p = press.current
    if (!p) return
    if (!p.moved && Math.hypot(e.screenX - p.x, e.screenY - p.y) < CLICK_SLOP) return
    p.moved = true
    if (!float.locked) window.api.moveWindow(p.wx + e.screenX - p.x, p.wy + e.screenY - p.y)
  }
  const onPointerUp = () => {
    const p = press.current
    press.current = null
    if (!p || p.moved) return
    setShown((v) => !v)
    keepShown()
  }

  const mode = !float.on ? 'hover' : shown && !float.clickThrough ? 'on' : 'off'

  return (
    <div
      data-controls={mode}
      className={`stage relative h-full w-full overflow-hidden bg-bg ${float.on && !float.locked ? 'cursor-move' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (press.current = null)}
      onPointerLeave={() => float.on && !press.current && setShown(false)}
      onDoubleClick={(e) => {
        if (float.on && !(e.target as HTMLElement).closest('button, input')) setFloat({ on: false })
      }}
    >
      {path && (
        <img
          key={path}
          src={imageUrl(path)}
          alt="Reference"
          draggable={false}
          className="pose-in absolute inset-0 h-full w-full object-contain"
          style={{ transform: flip ? 'scaleX(-1)' : undefined, filter: grey ? 'grayscale(1)' : undefined }}
        />
      )}
      {overlay}
      {float.on && <FloatBar />}
      {children && (
        <div className="reveal absolute inset-x-0 bottom-0 flex justify-center pb-4 pt-10">
          <div className="flex items-center gap-0.5 rounded-lg bg-surface/95 p-1 shadow-[0_6px_24px_rgba(0,0,0,0.35)] ring-1 ring-line">
            {children}
          </div>
        </div>
      )}
    </div>
  )
}

function FloatBar() {
  const float = useApp((s) => s.float)
  const setFloat = useApp((s) => s.setFloat)
  const hotkey = useApp((s) => s.settings.hotkeys.clickThrough)
  const notify = useApp((s) => s.notify)

  return (
    <div className="reveal absolute right-2 top-2 flex items-center gap-0.5 rounded-lg bg-surface/95 p-1 ring-1 ring-line" data-no-drag>
      <IconButton label="Keep on top" active={float.alwaysOnTop} onClick={() => setFloat({ alwaysOnTop: !float.alwaysOnTop })}>
        <Pin size={16} />
      </IconButton>
      <label className="flex items-center px-1.5" title="Opacity">
        <span className="sr-only">Opacity</span>
        <input
          type="range"
          min={20}
          max={100}
          value={Math.round(float.opacity * 100)}
          onChange={(e) => setFloat({ opacity: Number(e.target.value) / 100 })}
          className="h-1 w-20 accent-[var(--blue)]"
        />
      </label>
      <IconButton label="Lock position and size" active={float.locked} onClick={() => setFloat({ locked: !float.locked })}>
        <Lock size={16} />
      </IconButton>
      <IconButton
        label={`Click-through (${hotkey} turns it off)`}
        onClick={() => {
          setFloat({ clickThrough: true, locked: true })
          notify(`Click-through is on. Press ${hotkey.replace(/\+/g, ' + ')} to turn it off.`)
        }}
      >
        <Through size={16} />
      </IconButton>
      <IconButton label="Leave float mode" onClick={() => setFloat({ on: false })}>
        <Close size={16} />
      </IconButton>
    </div>
  )
}
