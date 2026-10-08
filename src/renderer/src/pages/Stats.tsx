import { useMemo, useState } from 'react'
import { thumbUrl } from '@shared/api'
import type { SessionRecord } from '@shared/types'
import { Heatmap } from '../components/Heatmap'
import { Trash } from '../components/Icons'
import { Empty, PageHeader } from '../components/ui'
import { describeBlocks, formatDuration, planBlocks } from '../lib/schedule'
import { currentStreak, longestStreak, minutesByDay, totals } from '../lib/stats'
import { useApp } from '../store'

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`

export function Stats() {
  const sessions = useApp((s) => s.sessions)
  const challenges = useApp((s) => s.challenges)
  const go = useApp((s) => s.go)
  const deleteSession = useApp((s) => s.deleteSession)
  const [confirm, setConfirm] = useState<string | null>(null)

  const byDay = useMemo(() => minutesByDay(sessions), [sessions])
  const t = useMemo(() => totals(sessions), [sessions])
  const history = useMemo(() => [...sessions].sort((a, b) => b.startedAt - a.startedAt), [sessions])

  const figures: { label: string; value: string }[] = [
    { label: 'Total practice', value: formatDuration(t.minutes * 60) },
    { label: 'Sessions', value: String(t.sessions) },
    { label: 'Poses drawn', value: String(t.images) },
    { label: 'Current streak', value: days(currentStreak(byDay, new Date())) },
    { label: 'Longest streak', value: days(longestStreak(byDay)) }
  ]

  const describe = (s: SessionRecord) => {
    if (s.challenge) {
      const ch = challenges.find((c) => c.id === s.challenge!.challengeId)
      return `${ch?.name ?? 'Challenge'}, level ${s.challenge.level + 1}`
    }
    if (s.redoOf) return 'Redo of flagged poses'
    if (s.plan.mode === 'relaxed') return 'Relaxed, no timer'
    if (s.plan.mode === 'memory') {
      const refs = new Set(s.poses.map((p) => p.imageId)).size
      return `Memory: ${refs} ${refs === 1 ? 'reference' : 'references'}, ${s.poses.length} attempts`
    }
    return describeBlocks(planBlocks(s.plan, s.poses.length))
  }

  return (
    <div className="page-form">
      <PageHeader title="Stats" />
      <section aria-label="Practice heatmap" className="rounded-lg bg-surface p-5 ring-1 ring-line">
        <Heatmap sessions={sessions} />
      </section>

      <dl className="mt-6 grid grid-cols-5 gap-4">
        {figures.map((f) => (
          <div key={f.label}>
            <dt className="text-[12.5px] text-muted">{f.label}</dt>
            <dd className="tnum text-[22px] font-semibold tracking-[-0.01em]">{f.value}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-10 pb-3 text-[17px] font-semibold">History</h2>
      {!history.length ? (
        <Empty title="No sessions yet">Your sessions show up here, and each one opens its review.</Empty>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {history.map((s) => (
            <li key={s.id} className="group flex items-center gap-4 py-2.5">
              <button
                type="button"
                onClick={() => go({ name: 'review', sessionId: s.id })}
                className="flex min-w-0 flex-1 items-center gap-4 text-left"
              >
                <span className="flex -space-x-3">
                  {s.poses.slice(0, 3).map((p, k) => (
                    <img
                      key={k}
                      src={thumbUrl(p.imagePath, 96)}
                      alt=""
                      loading="lazy"
                      className="h-10 w-8 rounded object-cover ring-2 ring-bg"
                    />
                  ))}
                </span>
                <span className="w-44 shrink-0 text-ink">
                  {new Date(s.startedAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted group-hover:text-ink">{describe(s)}</span>
                <span className="tnum w-20 text-right text-ink">{formatDuration(s.activeMs / 1000)}</span>
                <span className="w-24 text-right text-[12.5px] text-muted">
                  {s.reviewed ? 'Reviewed' : s.finished ? 'Not reviewed' : 'Stopped early'}
                </span>
              </button>
              {confirm === s.id ? (
                <span className="flex gap-1">
                  <button type="button" className="h-8 rounded-md px-2 text-red hover:bg-raised" onClick={() => deleteSession(s.id)}>
                    Delete
                  </button>
                  <button type="button" className="h-8 rounded-md px-2 text-muted hover:bg-raised" onClick={() => setConfirm(null)}>
                    Keep
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  aria-label="Delete session"
                  title="Delete session"
                  onClick={() => setConfirm(s.id)}
                  className="invisible flex h-8 w-8 items-center justify-center rounded-md text-muted hover:text-red group-hover:visible"
                >
                  <Trash size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
