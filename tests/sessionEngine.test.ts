import { describe, expect, it } from 'vitest'
import {
  activeMs,
  back,
  createEngine,
  next,
  pause,
  remaining,
  restart,
  resume,
  stop,
  tick,
  type Slot
} from '@renderer/lib/sessionEngine'

const slots = (secs: number[]): Slot[] =>
  secs.map((s, i) => ({ imageId: `i${i}`, imagePath: `p${i}`, seconds: s }))

describe('session engine', () => {
  it('counts down from timestamps and moves to the next pose', () => {
    let s = createEngine(slots([30, 30]), 0, 0)
    expect(remaining(s, 10_000)).toBe(20_000)
    const step = tick(s, 30_000)
    s = step.state
    expect(step.events).toEqual([{ type: 'poseEnd', index: 0, reason: 'time' }])
    expect(s.index).toBe(1)
    expect(remaining(s, 30_000)).toBe(30_000)
  })

  it('inserts rest between poses but not after the last', () => {
    let s = createEngine(slots([10, 10]), 5, 0)
    s = tick(s, 10_000).state
    expect(s.phase).toBe('rest')
    expect(remaining(s, 12_000)).toBe(3_000)
    s = tick(s, 15_000).state
    expect(s.phase).toBe('pose')
    expect(s.index).toBe(1)
    const end = tick(s, 25_000)
    expect(end.state.phase).toBe('done')
    expect(end.events).toContainEqual({ type: 'done', finished: true })
  })

  it('carries leftover time across phases when a tick arrives late', () => {
    let s = createEngine(slots([10, 10, 10]), 0, 0)
    // One late tick covers the first pose and 4s of the second.
    s = tick(s, 14_000).state
    expect(s.index).toBe(1)
    expect(remaining(s, 14_000)).toBe(6_000)
  })

  it('freezes the clock while paused', () => {
    let s = createEngine(slots([30]), 0, 0)
    s = pause(s, 10_000)
    expect(remaining(s, 50_000)).toBe(20_000)
    expect(tick(s, 100_000).state.phase).toBe('pose')
    s = resume(s, 50_000)
    expect(remaining(s, 55_000)).toBe(15_000)
  })

  it('marks skipped timed poses and records time spent', () => {
    let s = createEngine(slots([60, 60]), 0, 0)
    const step = next(s, 20_000)
    s = step.state
    expect(step.events[0]).toEqual({ type: 'poseEnd', index: 0, reason: 'skip' })
    expect(s.skipped[0]).toBe(true)
    expect(s.spent[0]).toBe(20_000)
    expect(s.index).toBe(1)
  })

  it('treats next on an untimed pose as a normal finish', () => {
    let s = createEngine(slots([0, 0]), 0, 0)
    expect(remaining(s, 5_000)).toBeNull()
    expect(tick(s, 999_999).state.index).toBe(0)
    s = next(s, 45_000).state
    expect(s.skipped[0]).toBe(false)
    expect(s.spent[0]).toBe(45_000)
  })

  it('goes back to the previous pose with a full timer', () => {
    let s = createEngine(slots([30, 30]), 0, 0)
    s = tick(s, 30_000).state
    s = back(s, 35_000).state
    expect(s.index).toBe(0)
    expect(remaining(s, 35_000)).toBe(30_000)
    expect(s.spent[1]).toBe(5_000)
  })

  it('back during a rest redoes the pose just finished', () => {
    let s = createEngine(slots([10, 10]), 5, 0)
    s = tick(s, 10_000).state
    s = back(s, 11_000).state
    expect(s.phase).toBe('pose')
    expect(s.index).toBe(0)
  })

  it('a pose can rest longer than the others (a break between class blocks)', () => {
    const list = slots([10, 10, 10])
    list[0].restAfter = 30
    let s = createEngine(list, 5, 0)
    s = tick(s, 10_000).state
    expect(s.phase).toBe('rest')
    expect(remaining(s, 10_000)).toBe(30_000)
    s = tick(s, 40_000).state
    s = tick(s, 50_000).state
    expect(s.phase).toBe('rest')
    expect(remaining(s, 50_000)).toBe(5_000)
  })

  it('a pose can rest less than the session rest (0 = straight on)', () => {
    const list = slots([10, 10])
    list[0].restAfter = 0
    const s = tick(createEngine(list, 5, 0), 10_000).state
    expect(s).toMatchObject({ phase: 'pose', index: 1 })
  })

  it('restart gives the same pose a full timer and keeps the time spent', () => {
    let s = createEngine(slots([30, 30]), 0, 0)
    s = restart(s, 20_000)
    expect(s.index).toBe(0)
    expect(remaining(s, 20_000)).toBe(30_000)
    expect(s.spent[0]).toBe(20_000)
  })

  it('stop ends early and reports an unfinished session', () => {
    const s = createEngine(slots([60, 60]), 0, 0)
    const step = stop(s, 25_000)
    expect(step.events).toEqual([
      { type: 'poseEnd', index: 0, reason: 'stop' },
      { type: 'done', finished: false }
    ])
    expect(activeMs(step.state)).toBe(25_000)
  })
})
