import { describe, expect, it } from 'vitest'
import type { SessionRecord } from '@shared/types'
import { DEFAULT_PLAN } from '@shared/types'
import {
  currentStreak,
  dayKey,
  longestStreak,
  minutesByDay,
  recentMistakes,
  totals,
  yearGrid
} from '@renderer/lib/stats'

function session(day: Date, minutes: number, mistakes: string[][] = [], reviewed = false): SessionRecord {
  return {
    id: String(day.getTime()) + minutes,
    startedAt: day.getTime(),
    endedAt: day.getTime() + minutes * 60000,
    activeMs: minutes * 60000,
    plan: DEFAULT_PLAN,
    poses: mistakes.map((m, i) => ({
      imageId: `i${i}`,
      imagePath: '',
      plannedSeconds: 60,
      spentMs: 60000,
      skipped: false,
      mistakes: m,
      redo: false
    })),
    finished: true,
    reviewed,
    pagePhotos: []
  }
}

const d = (y: number, m: number, day: number, h = 20) => new Date(y, m - 1, day, h)

describe('stats', () => {
  it('sums minutes per local day', () => {
    const map = minutesByDay([session(d(2026, 10, 1), 20), session(d(2026, 10, 1, 22), 10)])
    expect(map.get('2026-10-01')).toBe(30)
  })

  it('counts the streak up to today, or yesterday when today is empty', () => {
    const map = minutesByDay([
      session(d(2026, 10, 5), 10),
      session(d(2026, 10, 6), 10),
      session(d(2026, 10, 7), 10)
    ])
    expect(currentStreak(map, d(2026, 10, 7))).toBe(3)
    expect(currentStreak(map, d(2026, 10, 8))).toBe(3)
    expect(currentStreak(map, d(2026, 10, 9))).toBe(0)
  })

  it('finds the longest streak across month ends', () => {
    const map = minutesByDay([
      session(d(2026, 9, 29), 5),
      session(d(2026, 9, 30), 5),
      session(d(2026, 10, 1), 5),
      session(d(2026, 10, 5), 5)
    ])
    expect(longestStreak(map)).toBe(3)
  })

  it('builds a 53-week grid ending in the current week', () => {
    const end = d(2026, 10, 8)
    const grid = yearGrid(new Map([[dayKey(end), 45]]), end)
    expect(grid).toHaveLength(53)
    expect(grid[0][0].date.getDay()).toBe(0)
    const today = grid[52].find((c) => c.key === '2026-10-08')!
    expect(today.level).toBe(3)
    expect(grid[52].filter((c) => !c.inRange)).toHaveLength(6 - end.getDay())
  })

  it('totals minutes, sessions and drawn images', () => {
    const t = totals([session(d(2026, 10, 1), 30, [[], []])])
    expect(t).toEqual({ minutes: 30, sessions: 1, images: 2 })
  })

  it('ranks mistakes from recent reviewed sessions only', () => {
    const list = recentMistakes([
      session(d(2026, 10, 1), 10, [['tilt'], ['tilt', 'stiff']], true),
      session(d(2026, 10, 2), 10, [['proportions']], false)
    ])
    expect(list).toEqual([
      { mistake: 'tilt', count: 2 },
      { mistake: 'stiff', count: 1 }
    ])
  })
})
