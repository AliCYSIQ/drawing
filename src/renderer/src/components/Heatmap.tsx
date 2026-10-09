import { useEffect, useMemo, useRef, useState } from 'react'
import type { SessionRecord } from '@shared/types'
import { dayKey, minutesByDay, yearGrid } from '../lib/stats'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const GAP = 3
const WEEKS = 53

/** Square size that fills the available width, within readable limits. */
function useCellSize(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [cell, setCell] = useState(13)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setCell(Math.max(11, Math.min(22, Math.floor((el.clientWidth - 24) / WEEKS) - GAP)))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, cell]
}

export function Heatmap({ sessions, end, onDay }: { sessions: SessionRecord[]; end?: Date; onDay?: (day: string) => void }) {
  const today = dayKey(end ?? new Date())
  // Recomputed when sessions change or the day rolls over, not on every render.
  const grid = useMemo(() => yearGrid(minutesByDay(sessions), end ?? new Date(), WEEKS), [sessions, today])
  const [box, CELL] = useCellSize()
  // Extra room on the right so the last month label isn't cut off.
  const width = grid.length * (CELL + GAP) + 24
  const height = 7 * (CELL + GAP) + 18

  // A month label sits above the first week that starts in that month.
  const labels: { x: number; text: string }[] = []
  grid.forEach((week, i) => {
    const first = week[0].date
    if (first.getDate() <= 7 && (i > 0 || first.getDate() === 1)) {
      labels.push({ x: i * (CELL + GAP), text: MONTHS[first.getMonth()] })
    }
  })

  return (
    <div ref={box} className="overflow-x-auto">
      <svg width={width} height={height} role="img" aria-label="Practice minutes per day for the last year">
        {labels.map((l) => (
          <text key={l.x} x={l.x} y={11} fontSize={11} fill="var(--muted)">
            {l.text}
          </text>
        ))}
        {grid.map((week, i) =>
          week.map((cell, j) =>
            cell.inRange ? (
              <rect
                key={cell.key}
                x={i * (CELL + GAP)}
                y={18 + j * (CELL + GAP)}
                width={CELL}
                height={CELL}
                rx={3}
                fill={`var(--heat-${cell.level})`}
                className={onDay && cell.minutes ? 'cursor-pointer hover:stroke-[var(--ink)]' : undefined}
                onClick={onDay && cell.minutes ? () => onDay(cell.key) : undefined}
              >
                <title>
                  {cell.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}:{' '}
                  {cell.minutes ? `${Math.round(cell.minutes)} min` : 'no practice'}
                </title>
              </rect>
            ) : null
          )
        )}
      </svg>
      <div className="mt-2 flex items-center gap-1.5 text-[12px] text-muted">
        Less
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className="inline-block h-[11px] w-[11px] rounded-[3px]" style={{ background: `var(--heat-${l})` }} />
        ))}
        More
      </div>
    </div>
  )
}
