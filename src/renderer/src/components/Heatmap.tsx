import { useMemo } from 'react'
import type { SessionRecord } from '@shared/types'
import { minutesByDay, yearGrid } from '../lib/stats'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const CELL = 13
const GAP = 3

export function Heatmap({ sessions, end = new Date() }: { sessions: SessionRecord[]; end?: Date }) {
  const grid = useMemo(() => yearGrid(minutesByDay(sessions), end), [sessions, end])
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
    <div className="overflow-x-auto">
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
