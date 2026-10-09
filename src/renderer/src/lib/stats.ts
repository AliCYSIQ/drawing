import type { SessionRecord, Skill } from '@shared/types'
import { knownSkill } from './skills'

/** Local calendar day, e.g. "2026-10-08". */
export function dayKey(ts: number | Date): string {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function minutesByDay(sessions: SessionRecord[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const s of sessions) {
    const key = dayKey(s.startedAt)
    map.set(key, (map.get(key) ?? 0) + s.activeMs / 60000)
  }
  return map
}

/** Days in a row with practice, ending today (or yesterday, if today has nothing yet). */
export function currentStreak(byDay: Map<string, number>, today: Date): number {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (!(byDay.get(dayKey(d)) ?? 0)) d.setDate(d.getDate() - 1)
  let streak = 0
  while ((byDay.get(dayKey(d)) ?? 0) > 0) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

export function longestStreak(byDay: Map<string, number>): number {
  const days = [...byDay.entries()]
    .filter(([, m]) => m > 0)
    .map(([k]) => k)
    .sort()
  let best = 0
  let run = 0
  let prev: Date | null = null
  for (const key of days) {
    const [y, m, d] = key.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    if (prev) {
      const expected = new Date(prev)
      expected.setDate(expected.getDate() + 1)
      run = dayKey(expected) === key ? run + 1 : 1
    } else {
      run = 1
    }
    best = Math.max(best, run)
    prev = date
  }
  return best
}

/** Heatmap shade: 0 = nothing, 4 = 60+ minutes. */
export function level(minutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0) return 0
  if (minutes < 15) return 1
  if (minutes < 30) return 2
  if (minutes < 60) return 3
  return 4
}

export interface HeatCell {
  key: string
  date: Date
  minutes: number
  level: 0 | 1 | 2 | 3 | 4
  /** False for padding days after `end`. */
  inRange: boolean
}

/**
 * Columns of weeks (Sunday first) ending with the week that holds `end`,
 * GitHub-style.
 */
export function yearGrid(byDay: Map<string, number>, end: Date, weeks = 53): HeatCell[][] {
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  const start = new Date(last)
  start.setDate(start.getDate() - last.getDay() - (weeks - 1) * 7)
  const cols: HeatCell[][] = []
  const d = new Date(start)
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = []
    for (let i = 0; i < 7; i++) {
      const key = dayKey(d)
      const minutes = byDay.get(key) ?? 0
      col.push({ key, date: new Date(d), minutes, level: level(minutes), inRange: d <= last })
      d.setDate(d.getDate() + 1)
    }
    cols.push(col)
  }
  return cols
}

export interface Totals {
  minutes: number
  sessions: number
  images: number
}

export function totals(sessions: SessionRecord[]): Totals {
  let minutes = 0
  let images = 0
  for (const s of sessions) {
    minutes += s.activeMs / 60000
    images += s.poses.filter((p) => p.spentMs > 0).length
  }
  return { minutes, sessions: sessions.length, images }
}

/**
 * This session's tagged mistakes next to how often each one usually shows up
 * (average per session over the last few reviewed sessions before it).
 */
export function mistakeSummary(
  session: SessionRecord,
  sessions: SessionRecord[],
  lastSessions = 5
): { mistake: string; count: number; usual: number }[] {
  const count = (s: SessionRecord) => {
    const m = new Map<string, number>()
    for (const p of s.poses) for (const x of p.mistakes) m.set(x, (m.get(x) ?? 0) + 1)
    return m
  }
  const now = count(session)
  const before = sessions
    .filter((s) => s.reviewed && s.id !== session.id && s.startedAt < session.startedAt)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, lastSessions)
  const totals = new Map<string, number>()
  for (const s of before) for (const [k, v] of count(s)) totals.set(k, (totals.get(k) ?? 0) + v)
  return [...now.entries()]
    .map(([mistake, c]) => ({
      mistake,
      count: c,
      usual: before.length ? Math.round(((totals.get(mistake) ?? 0) / before.length) * 10) / 10 : 0
    }))
    .sort((a, b) => b.count - a.count || a.mistake.localeCompare(b.mistake))
}

/** Mistakes tagged in the last few reviewed sessions, most frequent first. */
export function recentMistakes(sessions: SessionRecord[], lastSessions = 5): { mistake: string; count: number }[] {
  const reviewed = sessions
    .filter((s) => s.reviewed)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, lastSessions)
  const counts = new Map<string, number>()
  for (const s of reviewed) {
    for (const p of s.poses) {
      for (const m of p.mistakes) counts.set(m, (counts.get(m) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([mistake, count]) => ({ mistake, count }))
    .sort((a, b) => b.count - a.count || a.mistake.localeCompare(b.mistake))
}

/** Stats filter: every session, sessions with no skill, or one skill's id. */
export type SkillFilter = 'all' | 'none' | (string & {})

/** The sessions a skill filter keeps. A deleted skill's sessions count as no skill. */
export function sessionsForSkill(sessions: SessionRecord[], skills: Skill[], filter: SkillFilter): SessionRecord[] {
  if (filter === 'all') return sessions
  return sessions.filter((s) => (knownSkill(skills, s.plan.skillId) ?? 'none') === filter)
}

export interface SkillTotal {
  /** Missing for sessions with no skill. */
  skillId?: string
  name: string
  minutes: number
  sessions: number
  /** Start of the latest session; missing when never practiced. */
  lastAt?: number
}

/**
 * Time and sessions per skill: every skill, practiced or not, most time
 * first; then "No skill" when some sessions have none.
 */
export function skillTotals(sessions: SessionRecord[], skills: Skill[]): SkillTotal[] {
  const rows = new Map<string | undefined, SkillTotal>(skills.map((k) => [k.id, { skillId: k.id, name: k.name, minutes: 0, sessions: 0 }]))
  for (const s of sessions) {
    const id = knownSkill(skills, s.plan.skillId)
    const row = rows.get(id) ?? { name: 'No skill', minutes: 0, sessions: 0 }
    row.minutes += s.activeMs / 60000
    row.sessions++
    row.lastAt = Math.max(row.lastAt ?? 0, s.startedAt)
    rows.set(id, row)
  }
  const none = rows.get(undefined)
  rows.delete(undefined)
  const sorted = [...rows.values()].sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name))
  return none ? [...sorted, none] : sorted
}
