import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAN, type PoseResult, type SessionRecord } from '@shared/types'
import { filterSessions, groupByMonth, isFiltered, NO_FILTER, sessionHas, sessionKind } from '../src/renderer/src/lib/history'

const pose = (extra: Partial<PoseResult> = {}): PoseResult => ({
  imageId: 'a',
  imagePath: '/a.png',
  plannedSeconds: 60,
  spentMs: 60_000,
  skipped: false,
  mistakes: [],
  redo: false,
  ...extra
})

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime()

const session = (id: string, startedAt: number, extra: Partial<SessionRecord> = {}): SessionRecord => ({
  id,
  startedAt,
  endedAt: startedAt + 60_000,
  activeMs: 60_000,
  plan: { ...DEFAULT_PLAN, boardIds: ['hands'] },
  poses: [pose()],
  finished: true,
  reviewed: true,
  pagePhotos: [],
  ...extra
})

const now = at(2026, 10, 9)
const sessions = [
  session('noted', at(2026, 10, 8), { poses: [pose({ note: 'Ribcage tilts the other way', mistakes: ['tilt'] })] }),
  session('memory', at(2026, 10, 1), { plan: { ...DEFAULT_PLAN, mode: 'memory', boardIds: [] }, reviewed: false }),
  session('challenge', at(2026, 9, 20), { challenge: { challengeId: 'c1', level: 0 }, activeMs: 600_000 }),
  session('old', at(2025, 12, 31), { finished: false, reviewed: false, poses: [pose({ capturePath: '/c.png', redo: true, marks: { '/c.png': [[{ x: 0, y: 0 }]] } })] }),
  session('renamed', at(2026, 10, 5), { boardNames: ['Feet studies'], plan: { ...DEFAULT_PLAN, skillId: 'k1', boardIds: [] } })
]
const ctx = { boards: [{ id: 'hands', name: 'Hands close up' }], challenges: [{ id: 'c1', name: 'Speed ladder' }], skills: [{ id: 'k1', name: 'Gesture' }] }
const ids = (f: Partial<typeof NO_FILTER>) => filterSessions(sessions, { ...NO_FILTER, ...f }, ctx, now).map((s) => s.id)

describe('history filters', () => {
  it('newest first by default', () => {
    expect(ids({})).toEqual(['noted', 'renamed', 'memory', 'challenge', 'old'])
    expect(isFiltered(NO_FILTER)).toBe(false)
  })

  it('search finds notes, mistakes, collection names (also old names), challenges and skills', () => {
    expect(ids({ query: 'ribcage' })).toEqual(['noted'])
    expect(ids({ query: 'TILT other' })).toEqual(['noted'])
    expect(ids({ query: 'feet' })).toEqual(['renamed'])
    expect(ids({ query: 'hands close' })).toContain('noted')
    expect(ids({ query: 'speed ladder' })).toEqual(['challenge'])
    expect(ids({ query: 'gesture' })).toEqual(['renamed'])
  })

  it('date ranges and a single day', () => {
    expect(ids({ range: '7d' })).toEqual(['noted', 'renamed'])
    expect(ids({ range: 'year' })).not.toContain('old')
    expect(ids({ day: '2026-10-01' })).toEqual(['memory'])
  })

  it('kind, review state, skill and what a session has', () => {
    expect(ids({ kinds: ['memory', 'challenge'] })).toEqual(['memory', 'challenge'])
    expect(ids({ status: 'stopped' })).toEqual(['old'])
    expect(ids({ status: 'not-reviewed' })).toEqual(['memory'])
    expect(ids({ skill: 'k1' })).toEqual(['renamed'])
    expect(ids({ skill: 'none' })).not.toContain('renamed')
    expect(ids({ has: ['notes'] })).toEqual(['noted'])
    expect(ids({ has: ['drawings', 'marks', 'flagged'] })).toEqual(['old'])
  })

  it('sorts oldest or longest first', () => {
    expect(ids({ sort: 'oldest' })[0]).toBe('old')
    expect(ids({ sort: 'longest' })[0]).toBe('challenge')
  })

  it('kinds and has-flags of a session', () => {
    expect(sessionKind(sessions[2])).toBe('challenge')
    expect(sessionKind(session('r', 0, { redoOf: 'x' }))).toBe('redo')
    expect(sessionHas(sessions[0])).toEqual({ notes: true, drawings: false, marks: false, flagged: false })
  })

  it('groups by month, with totals', () => {
    const groups = groupByMonth(filterSessions(sessions, NO_FILTER, ctx, now))
    expect(groups.map((g) => g.sessions.length)).toEqual([3, 1, 1])
    expect(groups[1].activeMs).toBe(600_000)
    expect(groupByMonth(sessions, false)).toHaveLength(1)
  })
})
