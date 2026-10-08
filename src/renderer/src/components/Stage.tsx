import { useRef, type ReactNode } from 'react'
import { imageUrl } from '@shared/api'
import { useApp } from '../store'
import { Close, Lock, Pin, Through } from './Icons'
import { IconButton } from './ui'

/**
 * The area that shows a reference. In float mode the whole stage drags the
 * window (by hand, so hover still works for the controls) and a small
 * toolbar with the float options appears on hover.
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
  const drag = useRef<{ x: number; y: number; wx: number; wy: number } | null>(null)

  const onPointerDown = (e: React.PointerEvent) => {
    if (!float.on || float.locked || e.button !== 0) return
    if ((e.target as HTMLElement).closest('button, input, [data-no-drag]')) return
    drag.current = { x: e.screenX, y: e.screenY, wx: window.screenX, wy: window.screenY }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    window.api.moveWindow(d.wx + e.screenX - d.x, d.wy + e.screenY - d.y)
  }
  const endDrag = () => {
    drag.current = null
  }

  return (
    <div
      className={`stage relative h-full w-full overflow-hidden bg-bg ${float.on && !float.locked ? 'cursor-move' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
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
