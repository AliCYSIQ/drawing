import { useEffect, useRef, useState } from 'react'
import type { Stroke } from '@shared/types'

export const MARK_RED = '#ff3b30'

/** Longest side of a marks canvas, in device pixels; bigger costs memory for nothing. */
const MAX_CANVAS = 4096

type Rect = { left: number; top: number; width: number; height: number }

function containRect(boxW: number, boxH: number, nw: number, nh: number): Rect {
  const scale = Math.min(boxW / nw, boxH / nh)
  const width = nw * scale
  const height = nh * scale
  return { left: (boxW - width) / 2, top: (boxH - height) / 2, width, height }
}

function penStyle(ctx: CanvasRenderingContext2D, w: number) {
  ctx.strokeStyle = MARK_RED
  ctx.lineWidth = Math.max(2, w * 0.006)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
}

function draw(ctx: CanvasRenderingContext2D, strokes: Stroke[], w: number, h: number) {
  ctx.clearRect(0, 0, w, h)
  penStyle(ctx, w)
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

/** Canvas pixels per CSS pixel: extra for crisp marks when zoomed in, capped for memory. */
export function canvasDensity(width: number, height: number, dpr: number): number {
  const want = (dpr || 1) * 2
  const longest = Math.max(width, height, 1)
  return Math.max(0.5, Math.min(want, MAX_CANVAS / longest))
}

/**
 * An image with red pen marks on top. With `onAdd` you draw; without it
 * the marks are only shown and the pointer passes through (for panning).
 * The layout uses untransformed sizes, so it also works inside a zoomed pane.
 *
 * A stroke being drawn lives only here; it is handed over (`onAdd`) when the
 * pen lifts, so drawing doesn't save the whole history on every mouse move.
 */
export function MarkupImage({
  src,
  alt,
  strokes = [],
  onAdd,
  savedMarkup,
  imageOpacity = 1
}: {
  src: string
  alt: string
  strokes?: Stroke[]
  /** A finished stroke. */
  onAdd?: (s: Stroke) => void
  /** Marks saved as a picture by v0.1 (memory mode). */
  savedMarkup?: string
  /** Overlay: the drawing shows through, the marks stay at full strength. */
  imageOpacity?: number
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

  const showCanvas = strokes.length > 0 || !!onAdd

  useEffect(() => {
    const c = canvas.current
    if (!c || !rect) return
    const density = canvasDensity(rect.width, rect.height, window.devicePixelRatio)
    const w = Math.round(rect.width * density)
    const h = Math.round(rect.height * density)
    if (c.width !== w || c.height !== h) {
      c.width = w
      c.height = h
    }
    draw(c.getContext('2d')!, strokes, w, h)
  }, [rect, strokes, showCanvas])

  const point = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect() // includes any zoom, which is what we want here
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }

  /** Draw just the newest piece of the stroke; the rest is already on the canvas. */
  const extend = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const c = canvas.current
    if (!c) return
    const ctx = c.getContext('2d')!
    penStyle(ctx, c.width)
    ctx.beginPath()
    ctx.moveTo(from.x * c.width, from.y * c.height)
    ctx.lineTo(to.x * c.width + (from === to ? 0.1 : 0), to.y * c.height)
    ctx.stroke()
  }

  return (
    <div ref={box} className="relative h-full w-full">
      <img
        src={src}
        alt={alt}
        draggable={false}
        onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        className="absolute inset-0 h-full w-full object-contain"
        style={imageOpacity < 1 ? { opacity: imageOpacity } : undefined}
      />
      {savedMarkup && <img src={savedMarkup} alt="" draggable={false} className="absolute inset-0 h-full w-full object-contain" />}
      {rect && showCanvas && (
        <canvas
          ref={canvas}
          data-marks
          className={`absolute touch-none ${onAdd ? 'cursor-crosshair' : 'pointer-events-none'}`}
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
          onPointerDown={(e) => {
            if (!onAdd || e.button !== 0) return
            e.stopPropagation()
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            const p = point(e)
            current.current = [p]
            extend(p, p)
          }}
          onPointerMove={(e) => {
            const s = current.current
            if (!onAdd || !s) return
            const p = point(e)
            extend(s[s.length - 1], p)
            s.push(p)
          }}
          onPointerUp={() => {
            const s = current.current
            current.current = null
            if (onAdd && s) onAdd(simplifyStroke(s))
          }}
          onPointerCancel={() => {
            current.current = null
            const c = canvas.current
            if (c) draw(c.getContext('2d')!, strokes, c.width, c.height)
          }}
        />
      )}
    </div>
  )
}
