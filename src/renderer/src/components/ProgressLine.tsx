import { useLayoutEffect, useRef } from 'react'

/**
 * The thin line that shows how much of a pose has passed. The browser animates
 * it on its own, so the page doesn't have to redraw ten times a second to move
 * it (the clock numbers only change once a second).
 */
export function ProgressLine({
  carried,
  phaseStart,
  paused,
  durationMs,
  urgent
}: {
  /** Time already spent in this phase before phaseStart (pauses). */
  carried: number
  phaseStart: number
  paused: boolean
  durationMs: number
  urgent: boolean
}) {
  const bar = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = bar.current
    if (!el || durationMs <= 0) return
    const done = paused ? carried : carried + (Date.now() - phaseStart)
    const from = Math.min(1, Math.max(0, done / durationMs))
    el.style.transform = `scaleX(${from})`
    if (paused || from >= 1) return
    const anim = el.animate([{ transform: `scaleX(${from})` }, { transform: 'scaleX(1)' }], {
      duration: durationMs - done,
      easing: 'linear',
      fill: 'forwards'
    })
    return () => anim.cancel()
  }, [carried, phaseStart, paused, durationMs])

  if (durationMs <= 0) return null
  return (
    <div className="absolute inset-x-0 bottom-0 h-[3px] bg-line/60" role="presentation">
      <div ref={bar} className={`h-full w-full origin-left ${urgent ? 'bg-red' : 'bg-blue'}`} style={{ transform: 'scaleX(0)' }} />
    </div>
  )
}
