import { useEffect, useState } from 'react'

/** Runs in a see-through window over the screen: drag a rectangle over the canvas. */
export function RegionPicker() {
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [end, setEnd] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    document.body.style.background = 'transparent'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && window.api.regionDone(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const rect =
    start && end
      ? {
          x: Math.min(start.x, end.x),
          y: Math.min(start.y, end.y),
          width: Math.abs(end.x - start.x),
          height: Math.abs(end.y - start.y)
        }
      : null

  return (
    <div
      className="fixed inset-0 cursor-crosshair"
      style={{ background: rect ? 'transparent' : 'rgba(20,20,22,0.35)' }}
      onPointerDown={(e) => {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        setStart({ x: e.clientX, y: e.clientY })
        setEnd({ x: e.clientX, y: e.clientY })
      }}
      onPointerMove={(e) => start && setEnd({ x: e.clientX, y: e.clientY })}
      onPointerUp={() => window.api.regionDone(rect)}
    >
      {rect && (
        <div
          className="absolute border-2 border-[#86b6e6]"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            boxShadow: '0 0 0 9999px rgba(20,20,22,0.45)'
          }}
        >
          <span className="tnum absolute -top-7 left-0 rounded bg-[#26282b] px-2 py-0.5 text-[12px] text-white">
            {Math.round(rect.width)} × {Math.round(rect.height)}
          </span>
        </div>
      )}
      {!start && (
        <div className="absolute left-1/2 top-10 -translate-x-1/2 rounded-lg bg-[#26282b] px-4 py-2.5 text-[14px] text-white shadow-lg">
          Drag over your Clip Studio canvas. Press Esc to cancel.
        </div>
      )}
    </div>
  )
}
