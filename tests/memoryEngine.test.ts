import { describe, expect, it } from 'vitest'
import {
  canTryAgain,
  createMemory,
  memoryAdvance,
  memoryAgain,
  memoryNextRef,
  memoryRemaining,
  memoryStop,
  memoryTick,
  memoryTogglePause
} from '@renderer/lib/memoryEngine'
import type { Slot } from '@renderer/lib/sessionEngine'

const refs = (n: number): Slot[] => Array.from({ length: n }, (_, i) => ({ imageId: `i${i}`, imagePath: `p${i}`, seconds: 0 }))
const opts = { studySeconds: 60, drawSeconds: 120, attempts: 3 }

describe('memory engine', () => {
  it('studies, hides the reference to draw, then reveals', () => {
    let s = createMemory(refs(2), opts, 0)
    expect(s.phase).toBe('study')
    let step = memoryTick(s, 60_000)
    s = step.state
    expect(s.phase).toBe('draw')
    expect(step.events).toEqual([{ type: 'drawStart' }])
    expect(memoryRemaining(s, 60_000)).toBe(120_000)
    step = memoryTick(s, 180_000)
    expect(step.state.phase).toBe('reveal')
    expect(step.events).toEqual([{ type: 'drawEnd', index: 0, attempt: 1, drawMs: 120_000, studyMs: 60_000 }])
  })

  it('lets you leave study early and reveal early', () => {
    let s = createMemory(refs(1), opts, 0)
    s = memoryAdvance(s, 20_000).state
    expect(s.phase).toBe('draw')
    expect(s.studyMs).toBe(20_000)
    const step = memoryAdvance(s, 50_000)
    expect(step.events[0]).toMatchObject({ type: 'drawEnd', drawMs: 30_000 })
  })

  it('waits for Reveal when drawing is untimed', () => {
    let s = createMemory(refs(1), { ...opts, drawSeconds: 0 }, 0)
    s = memoryAdvance(s, 1000).state
    expect(memoryRemaining(s, 1000)).toBeNull()
    expect(memoryTick(s, 10_000_000).state.phase).toBe('draw')
  })

  it('redraws the same reference up to the attempt limit, skipping study', () => {
    let s = createMemory(refs(1), { ...opts, attempts: 2 }, 0)
    s = memoryAdvance(memoryAdvance(s, 1000).state, 2000).state
    expect(canTryAgain(s)).toBe(true)
    s = memoryAgain(s, 3000).state
    expect(s.phase).toBe('draw')
    expect(s.attempt).toBe(2)
    s = memoryAdvance(s, 4000).state
    expect(canTryAgain(s)).toBe(false)
    expect(memoryAgain(s, 5000).state).toBe(s)
  })

  it('moves to the next reference and finishes after the last', () => {
    let s = createMemory(refs(2), opts, 0)
    s = memoryAdvance(memoryAdvance(s, 1).state, 2).state
    s = memoryNextRef(s, 3).state
    expect(s).toMatchObject({ index: 1, attempt: 1, phase: 'study' })
    s = memoryAdvance(memoryAdvance(s, 4).state, 5).state
    const end = memoryNextRef(s, 6)
    expect(end.state.phase).toBe('done')
    expect(end.events).toEqual([{ type: 'done', finished: true }])
  })

  it('pauses the clock but not the reveal', () => {
    let s = createMemory(refs(1), opts, 0)
    s = memoryTogglePause(s, 10_000)
    expect(memoryTick(s, 999_999).state.phase).toBe('study')
    s = memoryTogglePause(s, 50_000)
    expect(memoryRemaining(s, 50_000)).toBe(50_000)
  })

  it('stopping mid-drawing keeps that attempt', () => {
    let s = createMemory(refs(1), opts, 0)
    s = memoryAdvance(s, 10_000).state
    expect(memoryStop(s, 40_000).events).toEqual([
      { type: 'drawEnd', index: 0, attempt: 1, drawMs: 30_000, studyMs: 10_000 },
      { type: 'done', finished: false }
    ])
  })
})
