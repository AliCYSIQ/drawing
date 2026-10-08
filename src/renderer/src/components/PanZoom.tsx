import { useRef, useState } from 'react'

export interface View2D {
  x: number
  y: number
  scale: number
}

export const IDENTITY: View2D = { x: 0, y: 0, scale: 1 }

/** Drag to move, scroll to zoom around the pointer. */
export function usePanZoom(initial: View2D = IDENTITY) {
  const [view, setView] = useState<View2D>(initial)
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null)

  const handlers = {
    onPointerDown(e: React.PointerEvent) {
      if (e.button !== 0) return
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

export function PanZoomImage({ src, alt }: { src: string; alt: string }) {
  const { view, handlers, reset } = usePanZoom()
  return (
    <div
      className="relative h-full w-full cursor-grab overflow-hidden active:cursor-grabbing"
      {...handlers}
      onDoubleClick={reset}
      title="Drag to move, scroll to zoom, double-click to reset"
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="absolute inset-0 h-full w-full object-contain"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      />
    </div>
  )
}
