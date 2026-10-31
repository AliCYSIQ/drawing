import { useRef, useState } from 'react'

export interface View2D {
  x: number
  y: number
  scale: number
}

export const IDENTITY: View2D = { x: 0, y: 0, scale: 1 }

export const MIN_ZOOM = 0.2
export const MAX_ZOOM = 8

/** Zoom by `factor` around a point given relative to the box's centre. */
export function zoomAt(v: View2D, factor: number, cx: number, cy: number): View2D {
  const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.scale * factor))
  const k = scale / v.scale
  return { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }
}

/**
 * The one zoom every image view uses (sessions, the image viewer, review,
 * memory mode): scroll zooms around the pointer, dragging moves, double-click
 * resets. `buttons`: which mouse buttons drag (the red pen takes the left
 * one by stopping the event; float mode keeps the left one for moving the
 * window). Presses on buttons and fields inside are left alone.
 */
export function usePanZoom(initial: View2D = IDENTITY, opts: { buttons?: number[] } = {}) {
  const [view, setView] = useState<View2D>(initial)
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null)
  const buttons = opts.buttons ?? [0, 1, 2]

  const handlers = {
    onPointerDown(e: React.PointerEvent) {
      if (!buttons.includes(e.button)) return
      if ((e.target as HTMLElement).closest('button, input, select, textarea, [data-no-drag]')) return
      drag.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    },
    onPointerMove(e: React.PointerEvent) {
      const d = drag.current
      if (!d) return
      setView((v) => ({ ...v, x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }))
    },
    onPointerUp() {
      drag.current = null
    },
    onPointerCancel() {
      drag.current = null
    },
    onContextMenu(e: React.MouseEvent) {
      // Right-drag moves the image; no browser menu.
      e.preventDefault()
    },
    onWheel(e: React.WheelEvent) {
      if ((e.target as HTMLElement).closest('[data-no-drag]')) return
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const cx = e.clientX - rect.left - rect.width / 2
      const cy = e.clientY - rect.top - rect.height / 2
      setView((v) => zoomAt(v, Math.exp(-e.deltaY * 0.0015), cx, cy))
    }
  }

  return {
    view,
    setView,
    handlers,
    reset: () => setView(initial),
    zoomed: view.scale !== 1 || view.x !== 0 || view.y !== 0,
    /** Zoom in or out around the centre (for buttons and keys). */
    zoomBy: (factor: number) => setView((v) => zoomAt(v, factor, 0, 0))
  }
}

/** How far it is zoomed, with a button back to the whole image. Shown only while zoomed. */
export function ZoomBadge({ scale, onReset }: { scale: number; onReset: () => void }) {
  return (
    <div data-no-drag className="absolute bottom-3 left-4 z-10 flex items-center gap-1 rounded-md bg-surface/90 py-0.5 pl-2 pr-0.5 text-[12.5px] text-muted ring-1 ring-line">
      <span className="tnum">{Math.round(scale * 100)}%</span>
      <button type="button" onClick={onReset} className="h-6 rounded px-1.5 text-blue hover:bg-raised" title="Show the whole image (double-click)">
        Fit
      </button>
    </div>
  )
}
