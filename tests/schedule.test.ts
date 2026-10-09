import { describe, expect, it } from 'vitest'
import type { Board, ImageRef, SessionPlan } from '@shared/types'
import { DEFAULT_PLAN } from '@shared/types'
import {
  describeBlocks,
  estimateSeconds,
  pickImages,
  poolFromBoards,
  recentlySeen,
  slotsForPlan
} from '@renderer/lib/schedule'

const imgs = (n: number, prefix = 'i'): ImageRef[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, path: `/${prefix}${i}.jpg` }))

function seeded(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

describe('schedule', () => {
  it('merges boards without duplicate images', () => {
    const a: Board = { id: 'a', name: 'A', kind: 'folder', tags: [], images: imgs(3), createdAt: 0 }
    const b: Board = { id: 'b', name: 'B', kind: 'folder', tags: [], images: imgs(2), createdAt: 0 }
    expect(poolFromBoards([a, b], ['a', 'b'])).toHaveLength(3)
  })

  it('never repeats an image until the pool is used up', () => {
    const picked = pickImages(imgs(5), 5, true, seeded())
    expect(new Set(picked.map((p) => p.id)).size).toBe(5)
  })

  it('wraps around without the same image twice in a row', () => {
    const picked = pickImages(imgs(3), 30, true, seeded(7))
    expect(picked).toHaveLength(30)
    for (let i = 1; i < picked.length; i++) expect(picked[i].id).not.toBe(picked[i - 1].id)
  })

  it('count 0 means every image once', () => {
    const plan: SessionPlan = { ...DEFAULT_PLAN, mode: 'classic', count: 0, seconds: 45 }
    const slots = slotsForPlan(plan, imgs(7), seeded())
    expect(slots).toHaveLength(7)
    expect(slots.every((s) => s.seconds === 45)).toBe(true)
  })

  it('class mode follows the blocks in order', () => {
    const plan: SessionPlan = {
      ...DEFAULT_PLAN,
      mode: 'class',
      blocks: [
        { count: 2, seconds: 30 },
        { count: 1, seconds: 300 }
      ]
    }
    expect(slotsForPlan(plan, imgs(10), seeded()).map((s) => s.seconds)).toEqual([30, 30, 300])
  })

  it('relaxed mode has no timer', () => {
    const plan: SessionPlan = { ...DEFAULT_PLAN, mode: 'relaxed', count: 3 }
    expect(slotsForPlan(plan, imgs(10), seeded()).map((s) => s.seconds)).toEqual([0, 0, 0])
  })

  it('keeps order when shuffle is off', () => {
    const plan: SessionPlan = { ...DEFAULT_PLAN, shuffle: false, count: 3 }
    expect(slotsForPlan(plan, imgs(5)).map((s) => s.imageId)).toEqual(['i0', 'i1', 'i2'])
  })

  it('class mode can rest longer between blocks, but not after the last', () => {
    const plan: SessionPlan = {
      ...DEFAULT_PLAN,
      mode: 'class',
      blockRest: 30,
      blocks: [
        { count: 2, seconds: 30 },
        { count: 2, seconds: 60 }
      ]
    }
    expect(slotsForPlan(plan, imgs(10), seeded()).map((s) => s.restAfter)).toEqual([undefined, 30, undefined, undefined])
    expect(estimateSeconds(plan.blocks, 5, 30)).toBe(180 + 2 * 5 + 30)
  })

  it('puts images drawn recently after fresh ones', () => {
    const pool = imgs(6)
    const recent = new Set(['i0', 'i1', 'i2'])
    const picked = pickImages(pool, 6, true, seeded(3), recent)
    expect(picked.slice(0, 3).every((p) => !recent.has(p.id))).toBe(true)
    // freshFirst off ignores the history.
    const plan: SessionPlan = { ...DEFAULT_PLAN, count: 3, freshFirst: false, shuffle: false }
    expect(slotsForPlan(plan, pool, seeded(), recent).map((s) => s.imageId)).toEqual(['i0', 'i1', 'i2'])
  })

  it('knows which images were drawn in the last week', () => {
    const day = 86_400_000
    const now = 30 * day
    const seen = recentlySeen(
      [
        { startedAt: now - 2 * day, poses: [{ imageId: 'a' }] },
        { startedAt: now - 9 * day, poses: [{ imageId: 'b' }] }
      ],
      now
    )
    expect([...seen]).toEqual(['a'])
  })

  it('estimates length with rest between poses', () => {
    expect(estimateSeconds([{ count: 3, seconds: 60 }], 5)).toBe(190)
    expect(
      describeBlocks([
        { count: 10, seconds: 30 },
        { count: 1, seconds: 300 }
      ])
    ).toBe('10×30s → 1×5m')
  })
})
