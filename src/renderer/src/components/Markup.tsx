import { useEffect, useRef, useState } from 'react'
import type { Stroke } from '@shared/types'

export const MARK_RED = '#ff3b30'

type Rect = { left: number; top: number; width: number; height: number }

function containRect(boxW: number, boxH: number, nw: number, nh: number): Rect {
  const scale = Math.min(boxW / nw, boxH / nh)
  const width = nw * scale
  const height = nh * scale
  return { left: (boxW - width) / 2, top: (boxH - height) / 2, width, height }
}

function draw(ctx: CanvasRenderingContext2D, strokes: Stroke[], w: number, h: number) {
  ctx.clearRect(0, 0, w, h)
  ctx.strokeStyle = MARK_RED
  ctx.lineWidth = Math.max(2, w * 0.006)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const s of strokes) {
    if (!s.length) continue
    ctx.beginPath()
    ctx.moveTo(s[0].x * w, s[0].y * h)
    for (const p of s.slice(1)) ctx.lineTo(p.x * w, p.y * h)
    if (s.length === 1) ctx.lineTo(s[0].x * w + 0.1, s[0].y * h)
    ctx.stroke()
  }
}

/** Drop points that barely move and round the rest, so saved strokes stay small. */
export function simplifyStroke(s: Stroke): Stroke {
  const out: Stroke = []
  for (const p of s) {
    const q = { x: Math.round(p.x * 10000) / 10000, y: Math.round(p.y * 10000) / 10000 }
    const last = out[out.length - 1]
    if (!last || Math.hypot(q.x - last.x, q.y - last.y) >= 0.002) out.push(q)
  }
  const end = s[s.length - 1]
  if (s.length > 1 && out.length && out[out.length - 1] !== end) out.push(end)
  return out
}

/**
 * An image with red pen marks on top. With `onChange` you draw; without it
 * the marks are only shown and the pointer passes through (for panning).
 * The layout uses untransformed sizes, so it also works inside a zoomed pane.
 */
export function MarkupImage({
  src,
  alt,
  strokes = [],
  onChange,
  savedMarkup
}: {
  src: string
  alt: string
  strokes?: Stroke[]
  onChange?: (s: Stroke[]) => void
  /** Marks saved as a picture by v0.1 (memory mode). */
  savedMarkup?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const current = useRef<Stroke | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el || !natural) return
    const update = () => setRect(containRect(el.clientWidth, el.clientHeight, natural.w, natural.h))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [natural])

  const showCanvas = strokes.length > 0 || !!onChange

  useEffect(() => {
    const c = canvas.current
    if (!c || !rect) return
    // Extra resolution so marks stay crisp when the pane is zoomed in.
    const density = (window.devicePixelRatio || 1) * 2
    c.width = Math.round(rect.width * density)
    c.height = Math.round(rect.height * density)
    draw(c.getContext('2d')!, strokes, c.width, c.height)
  }, [rect, strokes, showCanvas])

  const point = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect() // includes any zoom, which is what we want here
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }

  return (
    <div ref={box} className="relative h-full w-full">
      <img
        src={src}
        alt={alt}
        draggable={false}
        onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        className="absolute inset-0 h-full w-full object-contain"
      />
      {savedMarkup && <img src={savedMarkup} alt="" draggable={false} className="absolute inset-0 h-full w-full object-contain" />}
      {rect && showCanvas && (
        <canvas
          ref={canvas}
          className={`absolute touch-none ${onChange ? 'cursor-crosshair' : 'pointer-events-none'}`}
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
          onPointerDown={(e) => {
            if (!onChange || e.button !== 0) return
            e.stopPropagation()
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            current.current = [point(e)]
            onChange([...strokes, current.current])
          }}
          onPointerMove={(e) => {
            if (!onChange || !current.current) return
            current.current = [...current.current, point(e)]
            onChange([...strokes.slice(0, -1), current.current])
          }}
          onPointerUp={() => {
            if (!onChange || !current.current) return
            onChange([...strokes.slice(0, -1), simplifyStroke(current.current)])
            current.current = null
          }}
        />
      )}
    </div>
  )
}
