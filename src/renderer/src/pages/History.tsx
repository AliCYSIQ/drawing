import { useMemo, useState } from 'react'
import { SessionRow } from '../components/SessionRow'
import { Close } from '../components/Icons'
import { Empty, PageHeader } from '../components/ui'
import {
  filterSessions,
  groupByMonth,
  isFiltered,
  NO_FILTER,
  type DateRange,
  type HasFilter,
  type HistoryFilter,
  type SessionKind
} from '../lib/history'
import { formatDuration } from '../lib/schedule'
import { useApp } from '../store'

const PAGE = 50

const RANGES: { value: DateRange; label: string }[] = [
  { value: 'all', label: 'Any time' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'year', label: 'This year' }
]
const KINDS: { value: SessionKind; label: string }[] = [
  { value: 'classic', label: 'Classic' },
  { value: 'class', label: 'Class' },
  { value: 'relaxed', label: 'Relaxed' },
  { value: 'memory', label: 'Memory' },
  { value: 'challenge', label: 'Challenge' },
  { value: 'redo', label: 'Redo' }
]
const HAS: { value: HasFilter; label: string }[] = [
  { value: 'notes', label: 'Notes' },
  { value: 'drawings', label: 'Drawings' },
  { value: 'marks', label: 'Marks' },
  { value: 'flagged', label: 'Flagged to redo' }
]

/** Filters stay while you open a session's review and come back. */
let kept: HistoryFilter = NO_FILTER

/**
 * Every session, newest first, grouped by month. Search finds notes,
 * mistakes, collections and challenges; filters narrow by date, kind,
 * review state, what a session has, and skill. A day from the Stats heatmap
 * opens here filtered to that day.
 */
export function History({ day }: { day?: string }) {
  const sessions = useApp((s) => s.sessions)
  const boards = useApp((s) => s.boards)
  const challenges = useApp((s) => s.challenges)
  const skills = useApp((s) => s.skills)
  const go = useApp((s) => s.go)
  const [filter, setFilterState] = useState<HistoryFilter>(() => (day ? { ...kept, day } : { ...kept, day: undefined }))
  const [shown, setShown] = useState(PAGE)
  const setFilter = (patch: Partial<HistoryFilter>) => {
    const next = { ...filter, ...patch }
    kept = next
    setFilterState(next)
    setShown(PAGE)
  }

  const list = useMemo(() => filterSessions(sessions, filter, { boards, challenges, skills }), [sessions, filter, boards, challenges, skills])
  const groups = useMemo(() => groupByMonth(list.slice(0, shown), filter.sort !== 'longest'), [list, shown, filter.sort])
  const total = list.reduce((a, s) => a + s.activeMs, 0)
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  const chip = (on: boolean) =>
    `h-8 rounded-full px-3 text-[13px] ring-1 transition-colors ${on ? 'bg-blue-soft text-blue ring-blue' : 'text-muted ring-line hover:text-ink'}`
  const select = 'h-8 rounded-md bg-surface px-2 text-[13px] text-ink outline-none ring-1 ring-line focus:ring-blue'

  return (
    <div className="page-form">
      <PageHeader title="History">
        <span className="tnum text-muted">
          {list.length} {list.length === 1 ? 'session' : 'sessions'}
          {list.length ? `, ${formatDuration(total / 1000)}` : ''}
        </span>
      </PageHeader>

      {sessions.length > 0 && (
        <div className="mb-6 grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              aria-label="Search sessions"
              value={filter.query}
              placeholder="Search notes, mistakes, collections"
              onChange={(e) => setFilter({ query: e.target.value })}
              className="mr-2 h-8 w-72 rounded-full bg-surface px-3.5 text-[13px] text-ink outline-none ring-1 ring-line placeholder:text-muted/70 focus:ring-blue"
            />
            {filter.day ? (
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-blue-soft pl-3 pr-1 text-[13px] text-blue ring-1 ring-blue">
                {new Date(`${filter.day}T12:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                <button type="button" aria-label="Show every day" onClick={() => setFilter({ day: undefined })} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-blue/20">
                  <Close size={12} />
                </button>
              </span>
            ) : (
              <select aria-label="When" value={filter.range} onChange={(e) => setFilter({ range: e.target.value as DateRange })} className={select}>
                {RANGES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            )}
            <select aria-label="Review" value={filter.status} onChange={(e) => setFilter({ status: e.target.value as HistoryFilter['status'] })} className={select}>
              <option value="all">Reviewed or not</option>
              <option value="reviewed">Reviewed</option>
              <option value="not-reviewed">Not reviewed</option>
              <option value="stopped">Stopped early</option>
            </select>
            {skills.length > 0 && (
              <select aria-label="Skill" value={filter.skill} onChange={(e) => setFilter({ skill: e.target.value })} className={select}>
                <option value="all">All skills</option>
                {skills.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
                <option value="none">No skill</option>
              </select>
            )}
            <label className="ml-auto flex items-center gap-2 text-[13px] text-muted">
              Sort
              <select aria-label="Sort" value={filter.sort} onChange={(e) => setFilter({ sort: e.target.value as HistoryFilter['sort'] })} className={select}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="longest">Longest first</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="pr-1 text-[12.5px] text-muted">Kind</span>
            {KINDS.map((k) => (
              <button key={k.value} type="button" aria-pressed={filter.kinds.includes(k.value)} onClick={() => setFilter({ kinds: toggle(filter.kinds, k.value) })} className={chip(filter.kinds.includes(k.value))}>
                {k.label}
              </button>
            ))}
            <span className="pl-3 pr-1 text-[12.5px] text-muted">Has</span>
            {HAS.map((h) => (
              <button key={h.value} type="button" aria-pressed={filter.has.includes(h.value)} onClick={() => setFilter({ has: toggle(filter.has, h.value) })} className={chip(filter.has.includes(h.value))}>
                {h.label}
              </button>
            ))}
            {isFiltered(filter) && (
              <button type="button" onClick={() => setFilter({ ...NO_FILTER, sort: filter.sort })} className="ml-2 text-[13px] text-blue hover:underline">
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {!sessions.length ? (
        <Empty title="No sessions yet">Your sessions show up here, and each one opens its review.</Empty>
      ) : !list.length ? (
        <Empty title="No sessions match">Try other words, or clear the filters.</Empty>
      ) : (
        <>
          {groups.map((g) => (
            <section key={g.key} aria-label={g.label || 'Sessions'} className="mb-6">
              {g.label && (
                <h2 className="flex items-baseline gap-3 pb-2 text-[15px] font-semibold">
                  {g.label}
                  <span className="tnum text-[12.5px] font-normal text-muted">
                    {g.sessions.length} {g.sessions.length === 1 ? 'session' : 'sessions'}, {formatDuration(g.activeMs / 1000)}
                  </span>
                </h2>
              )}
              <ul className="divide-y divide-line border-y border-line">
                {g.sessions.map((s) => (
                  <SessionRow key={s.id} session={s} showSkill={filter.skill === 'all'} detail />
                ))}
              </ul>
            </section>
          ))}
          {list.length > shown && (
            <div className="flex justify-center">
              <button type="button" onClick={() => setShown((n) => n + PAGE)} className="h-9 rounded-md px-4 text-blue hover:bg-raised">
                Show {Math.min(PAGE, list.length - shown)} more of {list.length - shown}
              </button>
            </div>
          )}
        </>
      )}
      {filter.day && sessions.length > 0 && (
        <p className="mt-4 text-[12.5px] text-muted">
          From the Stats heatmap.{' '}
          <button type="button" className="text-blue hover:underline" onClick={() => go({ name: 'stats' })}>
            Back to Stats
          </button>
        </p>
      )}
    </div>
  )
}
