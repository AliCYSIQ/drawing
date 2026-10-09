// Finding past sessions: search, filters and month groups for the History
// page. Pure, so it can be tested.

import type { Board, Challenge, SessionRecord, Skill } from '@shared/types'
import { knownSkill } from './skills'

export type SessionKind = 'classic' | 'class' | 'relaxed' | 'memory' | 'challenge' | 'redo'
export type HasFilter = 'notes' | 'drawings' | 'marks' | 'flagged'
export type DateRange = 'all' | '7d' | '30d' | 'year'

export interface HistoryFilter {
  query: string
  range: DateRange
  /** One day (yyyy-mm-dd, local), e.g. from a click on the heatmap. Wins over `range`. */
  day?: string
  /** Empty = every kind. */
  kinds: SessionKind[]
  status: 'all' | 'reviewed' | 'not-reviewed' | 'stopped'
  /** Every one listed must hold. */
  has: HasFilter[]
  /** 'all', 'none' (no skill) or a skill id. */
  skill: string
  sort: 'newest' | 'oldest' | 'longest'
}

export const NO_FILTER: HistoryFilter = { query: '', range: 'all', kinds: [], status: 'all', has: [], skill: 'all', sort: 'newest' }

export function isFiltered(f: HistoryFilter): boolean {
  return !!f.query.trim() || f.range !== 'all' || !!f.day || f.kinds.length > 0 || f.status !== 'all' || f.has.length > 0 || f.skill !== 'all'
}

export function sessionKind(s: SessionRecord): SessionKind {
  if (s.challenge) return 'challenge'
  if (s.redoOf) return 'redo'
  return s.plan.mode
}

/** What a session has, for the "has" filters and the row's little badges. */
export function sessionHas(s: SessionRecord): Record<HasFilter, boolean> {
  return {
    notes: s.poses.some((p) => !!p.note?.trim()),
    drawings: s.pagePhotos.length > 0 || s.poses.some((p) => !!p.capturePath || !!p.photos?.length),
    marks: s.poses.some((p) => !!p.markupPath || Object.values(p.marks ?? {}).some((list) => list.length > 0)),
    flagged: s.poses.some((p) => p.redo)
  }
}

export interface HistoryContext {
  boards: Pick<Board, 'id' | 'name'>[]
  challenges: Pick<Challenge, 'id' | 'name'>[]
  skills: Skill[]
}

/** Everything a search can match in a session: notes, mistakes, collections, challenge and skill names. */
export function searchText(s: SessionRecord, ctx: HistoryContext): string {
  const names = new Set(s.boardNames ?? [])
  for (const id of s.plan.boardIds) {
    const b = ctx.boards.find((x) => x.id === id)
    if (b) names.add(b.name)
  }
  const challenge = s.challenge ? ctx.challenges.find((c) => c.id === s.challenge!.challengeId)?.name : undefined
  const skill = ctx.skills.find((k) => k.id === s.plan.skillId)?.name
  return [
    ...names,
    challenge,
    skill,
    s.plan.mode,
    ...s.poses.flatMap((p) => [p.note, ...p.mistakes])
  ]
    .filter(Boolean)
    .join(' \n ')
    .toLowerCase()
}

function startOfDay(ts: number): number {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function dayOf(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function filterSessions(sessions: SessionRecord[], f: HistoryFilter, ctx: HistoryContext, now = Date.now()): SessionRecord[] {
  const words = f.query.toLowerCase().split(/\s+/).filter(Boolean)
  const since =
    f.range === '7d'
      ? startOfDay(now) - 6 * 86_400_000
      : f.range === '30d'
        ? startOfDay(now) - 29 * 86_400_000
        : f.range === 'year'
          ? new Date(new Date(now).getFullYear(), 0, 1).getTime()
          : 0
  const out = sessions.filter((s) => {
    if (f.day ? dayOf(s.startedAt) !== f.day : s.startedAt < since) return false
    if (f.kinds.length && !f.kinds.includes(sessionKind(s))) return false
    if (f.status === 'reviewed' && !s.reviewed) return false
    if (f.status === 'not-reviewed' && (s.reviewed || !s.finished)) return false
    if (f.status === 'stopped' && s.finished) return false
    if (f.skill !== 'all') {
      const skill = knownSkill(ctx.skills, s.plan.skillId)
      if (f.skill === 'none' ? !!skill : skill !== f.skill) return false
    }
    if (f.has.length) {
      const has = sessionHas(s)
      if (!f.has.every((h) => has[h])) return false
    }
    if (words.length) {
      const text = searchText(s, ctx)
      if (!words.every((w) => text.includes(w))) return false
    }
    return true
  })
  const by = {
    newest: (a: SessionRecord, b: SessionRecord) => b.startedAt - a.startedAt,
    oldest: (a: SessionRecord, b: SessionRecord) => a.startedAt - b.startedAt,
    longest: (a: SessionRecord, b: SessionRecord) => b.activeMs - a.activeMs || b.startedAt - a.startedAt
  }
  return out.sort(by[f.sort])
}

export interface MonthGroup {
  key: string
  label: string
  sessions: SessionRecord[]
  activeMs: number
}

/** Sessions in order, cut into months ("October 2026"). Sorting by length gives one group. */
export function groupByMonth(list: SessionRecord[], byMonth = true): MonthGroup[] {
  if (!byMonth) return list.length ? [{ key: 'all', label: '', sessions: list, activeMs: list.reduce((a, s) => a + s.activeMs, 0) }] : []
  const groups: MonthGroup[] = []
  for (const s of list) {
    const d = new Date(s.startedAt)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    let g = groups[groups.length - 1]
    if (!g || g.key !== key) {
      g = { key, label: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), sessions: [], activeMs: 0 }
      groups.push(g)
    }
    g.sessions.push(s)
    g.activeMs += s.activeMs
  }
  return groups
}

/** The first note written in a session, for a preview line. */
export function firstNote(s: SessionRecord): string | undefined {
  return s.poses.find((p) => p.note?.trim())?.note?.trim()
}
