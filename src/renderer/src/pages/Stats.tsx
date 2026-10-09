import { useMemo, useState } from 'react'
import { Heatmap } from '../components/Heatmap'
import { SessionRow } from '../components/SessionRow'
import { Empty, PageHeader } from '../components/ui'
import { formatDuration } from '../lib/schedule'
import { knownSkill } from '../lib/skills'
import {
  currentStreak,
  longestStreak,
  minutesByDay,
  sessionsForSkill,
  skillTotals,
  totals,
  type SkillFilter,
  type SkillTotal
} from '../lib/stats'
import { useApp } from '../store'

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`

export function Stats() {
  const allSessions = useApp((s) => s.sessions)
  const skills = useApp((s) => s.skills)
  const go = useApp((s) => s.go)
  const [picked, setPicked] = useState<SkillFilter>('all')

  const perSkill = useMemo(() => skillTotals(allSessions, skills), [allSessions, skills])
  const hasUntagged = perSkill.some((r) => !r.skillId)
  // A skill deleted while it was picked falls back to everything.
  const filter: SkillFilter = picked === 'all' || (picked === 'none' && hasUntagged) || knownSkill(skills, picked) ? picked : 'all'
  const filterName = filter === 'all' ? null : filter === 'none' ? 'No skill' : skills.find((k) => k.id === filter)?.name
  const sessions = useMemo(() => sessionsForSkill(allSessions, skills, filter), [allSessions, skills, filter])

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

  return (
    <div className="page-form">
      <PageHeader title="Stats">
        {skills.length > 0 && (
          <div role="radiogroup" aria-label="Show stats for" className="flex flex-wrap gap-1.5">
            {[
              { value: 'all', label: 'All skills' },
              ...skills.map((k) => ({ value: k.id, label: k.name })),
              ...(hasUntagged ? [{ value: 'none', label: 'No skill' }] : [])
            ].map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={filter === o.value}
                onClick={() => setPicked(o.value)}
                className={`h-8 rounded-full px-3 text-[13px] ring-1 transition-colors ${
                  filter === o.value ? 'bg-blue-soft text-blue ring-blue' : 'text-muted ring-line hover:text-ink'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </PageHeader>
      <section aria-label={filterName ? `Practice heatmap: ${filterName}` : 'Practice heatmap'} className="rounded-lg bg-surface p-5 ring-1 ring-line">
        <Heatmap sessions={sessions} onDay={(day) => go({ name: 'history', day })} />
        <p className="mt-1 text-[12px] text-muted">Click a day to see its sessions.</p>
      </section>

      <dl className="mt-6 grid grid-cols-5 gap-4">
        {figures.map((f) => (
          <div key={f.label}>
            <dt className="text-[12.5px] text-muted">{f.label}</dt>
            <dd className="tnum text-[22px] font-semibold tracking-[-0.01em]">{f.value}</dd>
          </div>
        ))}
      </dl>

      {skills.length > 0 && <SkillTable rows={perSkill} />}

      <div className="mt-10 flex items-baseline gap-3 pb-3">
        <h2 className="text-[17px] font-semibold">Recent sessions{filterName ? `: ${filterName}` : ''}</h2>
        {history.length > 0 && (
          <button type="button" onClick={() => go({ name: 'history' })} className="text-blue hover:underline">
            All {history.length} in History
          </button>
        )}
      </div>
      {!history.length ? (
        filterName ? (
          <Empty title={`No sessions for ${filterName} yet`}>Pick a skill on the Practice page, and its sessions show up here.</Empty>
        ) : (
          <Empty title="No sessions yet">Your sessions show up here, and each one opens its review.</Empty>
        )
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {history.slice(0, 5).map((s) => (
            <SessionRow key={s.id} session={s} showSkill={filter === 'all'} />
          ))}
        </ul>
      )}
    </div>
  )
}

/** Time and sessions per skill, with a bar for each skill's share of the most practiced one. */
function SkillTable({ rows }: { rows: SkillTotal[] }) {
  const most = Math.max(0, ...rows.map((r) => r.minutes))
  return (
    <>
      <h2 className="mt-10 pb-3 text-[17px] font-semibold">Skills</h2>
      <table className="w-full">
        <thead>
          <tr className="text-left text-[12.5px] text-muted">
            <th className="pb-2 font-normal">Skill</th>
            <th className="w-24 pb-2 text-right font-normal">Sessions</th>
            <th className="w-24 pb-2 text-right font-normal">Time</th>
            <th className="w-[32%] pb-2 pl-6 font-normal">
              <span className="sr-only">Time compared with your most practiced skill</span>
            </th>
            <th className="w-36 pb-2 text-right font-normal">Last practiced</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line border-y border-line">
          {rows.map((r) => (
            <tr key={r.skillId ?? 'none'}>
              <td className={`py-2.5 ${r.skillId ? 'text-ink' : 'text-muted'}`}>{r.name}</td>
              <td className="tnum py-2.5 text-right text-ink">{r.sessions}</td>
              <td className="tnum py-2.5 text-right text-ink">{r.minutes ? formatDuration(r.minutes * 60) : '–'}</td>
              <td className="py-2.5 pl-6" title={`${r.name}: ${r.minutes ? formatDuration(r.minutes * 60) : 'no practice yet'}`}>
                {r.minutes > 0 && (
                  <div
                    className="h-2 min-w-[2px] rounded-r-[4px] bg-blue"
                    style={{ width: `${(r.minutes / most) * 100}%` }}
                  />
                )}
              </td>
              <td className="py-2.5 text-right text-muted">
                {r.lastAt ? new Date(r.lastAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Not yet'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
