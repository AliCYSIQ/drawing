import { useEffect, useRef, useState } from 'react'

/** Points are 0–1 across the image, so marks stay put at any size. */
export type Stroke = { x: number; y: number }[]

export const MARK_RED = '#ff3b30'

function containRect(box: DOMRect, nw: number, nh: number) {
  const scale = Math.min(box.width / nw, box.height / nh)
  const width = nw * scale
  const height = nh * scale
  return { left: (box.width - width) / 2, top: (box.height - height) / 2, width, height }
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

/** Your drawing with a red pen on top for marking corrections. */
export function MarkupImage({
  src,
  strokes,
  onChange,
  savedMarkup
}: {
  src: string
  strokes: Stroke[]
  onChange?: (s: Stroke[]) => void
  /** A markup PNG saved earlier, shown instead of live strokes. */
  savedMarkup?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const current = useRef<Stroke | null>(null)

  useEffect(() => {
    if (!box.current || !natural) return
    const update = () => setRect(containRect(box.current!.getBoundingClientRect(), natural.w, natural.h))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [natural])

  useEffect(() => {
    const c = canvas.current
    if (!c || !rect) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(rect.width * dpr)
    c.height = Math.round(rect.height * dpr)
    draw(c.getContext('2d')!, strokes, c.width, c.height)
  }, [rect, strokes])

  const point = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }

  return (
    <div ref={box} className="relative h-full w-full">
      <img
        src={src}
        alt="Your drawing"
        draggable={false}
        onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        className="absolute inset-0 h-full w-full object-contain"
      />
      {savedMarkup && !onChange && (
        <img src={savedMarkup} alt="" draggable={false} className="absolute inset-0 h-full w-full object-contain" />
      )}
      {rect && onChange && (
        <canvas
          ref={canvas}
          className="absolute cursor-crosshair touch-none"
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            current.current = [point(e)]
            onChange([...strokes, current.current])
          }}
          onPointerMove={(e) => {
            if (!current.current) return
            current.current = [...current.current, point(e)]
            onChange([...strokes.slice(0, -1), current.current])
          }}
          onPointerUp={() => {
            current.current = null
          }}
        />
      )}
    </div>
  )
}

/** Render strokes at the drawing's real size as a transparent PNG. */
export async function renderMarkup(strokes: Stroke[], src: string): Promise<Uint8Array | null> {
  if (!strokes.length) return null
  const img = new Image()
  img.src = src
  await img.decode()
  const c = new OffscreenCanvas(img.naturalWidth, img.naturalHeight)
  draw(c.getContext('2d') as unknown as CanvasRenderingContext2D, strokes, c.width, c.height)
  const blob = await c.convertToBlob({ type: 'image/png' })
  return new Uint8Array(await blob.arrayBuffer())
}
