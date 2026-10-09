import { useRef, useState } from 'react'

export interface View2D {
  x: number
  y: number
  scale: number
}

export const IDENTITY: View2D = { x: 0, y: 0, scale: 1 }

/**
 * Drag to move, scroll to zoom around the pointer. The left, middle and right
 * buttons all move it; while the red pen is on, the pen takes the left button
 * (it stops the event), so the right button or Space + drag still move.
 */
export function usePanZoom(initial: View2D = IDENTITY) {
  const [view, setView] = useState<View2D>(initial)
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null)

  const handlers = {
    onPointerDown(e: React.PointerEvent) {
      if (e.button > 2) return
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
    onContextMenu(e: React.MouseEvent) {
      // Right-drag moves the image; no browser menu.
      e.preventDefault()
    },
    onWheel(e: React.WheelEvent) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const cx = e.clientX - rect.left - rect.width / 2
      const cy = e.clientY - rect.top - rect.height / 2
      setView((v) => {
        const scale = Math.min(8, Math.max(0.2, v.scale * Math.exp(-e.deltaY * 0.0015)))
        const k = scale / v.scale
        return { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }
      })
    }
  }

  return { view, setView, handlers, reset: () => setView(initial) }
}
