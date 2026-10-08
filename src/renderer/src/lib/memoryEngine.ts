// Memory mode as a pure state machine, like sessionEngine.
// For each reference: study (reference visible) → draw (reference hidden)
// → reveal (compare and correct) → draw again, or move to the next reference.

import type { Slot } from './sessionEngine'

export type MemoryPhase = 'study' | 'draw' | 'reveal' | 'done'

export interface MemoryState {
  refs: Slot[]
  studySeconds: number
  /** 0 = draw until Reveal is pressed. */
  drawSeconds: number
  maxAttempts: number
  index: number
  /** 1-based attempt at the current reference. */
  attempt: number
  phase: MemoryPhase
  phaseStart: number
  carried: number
  paused: boolean
  /** Study time before the current attempt. */
  studyMs: number
}

export type MemoryEvent =
  | { type: 'drawStart' }
  | { type: 'drawEnd'; index: number; attempt: number; drawMs: number; studyMs: number }
  | { type: 'done'; finished: boolean }

export interface MemoryStep {
  state: MemoryState
  events: MemoryEvent[]
}

export function createMemory(
  refs: Slot[],
  opts: { studySeconds: number; drawSeconds: number; attempts: number },
  now: number
): MemoryState {
  return {
    refs,
    studySeconds: opts.studySeconds,
    drawSeconds: opts.drawSeconds,
    maxAttempts: Math.max(1, opts.attempts),
    index: 0,
    attempt: 1,
    phase: refs.length ? 'study' : 'done',
    phaseStart: now,
    carried: 0,
    paused: false,
    studyMs: 0
  }
}

export function memoryDuration(s: MemoryState): number {
  if (s.phase === 'study') return s.studySeconds * 1000
  if (s.phase === 'draw') return s.drawSeconds * 1000
  return 0
}

export function memoryElapsed(s: MemoryState, now: number): number {
  return s.paused ? s.carried : s.carried + (now - s.phaseStart)
}

export function memoryRemaining(s: MemoryState, now: number): number | null {
  const d = memoryDuration(s)
  return d ? Math.max(0, d - memoryElapsed(s, now)) : null
}

export function memoryTogglePause(s: MemoryState, now: number): MemoryState {
  if (s.phase === 'done' || s.phase === 'reveal') return s
  return s.paused
    ? { ...s, paused: false, phaseStart: now }
    : { ...s, paused: true, carried: memoryElapsed(s, now) }
}

/** Move on when the study or drawing time is up. */
export function memoryTick(s: MemoryState, now: number): MemoryStep {
  if (s.paused) return { state: s, events: [] }
  const d = memoryDuration(s)
  if (!d || memoryElapsed(s, now) < d) return { state: s, events: [] }
  return advance(s, now, d)
}

/** "I'm ready" during study, "Reveal" during drawing. */
export function memoryAdvance(s: MemoryState, now: number): MemoryStep {
  if (s.phase !== 'study' && s.phase !== 'draw') return { state: s, events: [] }
  return advance(s, now, memoryElapsed(s, now))
}

function advance(s: MemoryState, now: number, used: number): MemoryStep {
  if (s.phase === 'study') {
    return {
      state: { ...s, phase: 'draw', phaseStart: now, carried: 0, paused: false, studyMs: s.studyMs + used },
      events: [{ type: 'drawStart' }]
    }
  }
  return {
    state: { ...s, phase: 'reveal', phaseStart: now, carried: 0, paused: false },
    events: [{ type: 'drawEnd', index: s.index, attempt: s.attempt, drawMs: used, studyMs: s.studyMs }]
  }
}

export function canTryAgain(s: MemoryState): boolean {
  return s.phase === 'reveal' && s.attempt < s.maxAttempts
}

/** Draw the same reference again straight away, while the corrections are fresh. */
export function memoryAgain(s: MemoryState, now: number): MemoryStep {
  if (!canTryAgain(s)) return { state: s, events: [] }
  return {
    state: { ...s, phase: 'draw', attempt: s.attempt + 1, phaseStart: now, carried: 0, studyMs: 0 },
    events: [{ type: 'drawStart' }]
  }
}

export function memoryNextRef(s: MemoryState, now: number): MemoryStep {
  if (s.phase !== 'reveal') return { state: s, events: [] }
  if (s.index >= s.refs.length - 1) {
    return { state: { ...s, phase: 'done' }, events: [{ type: 'done', finished: true }] }
  }
  return {
    state: { ...s, index: s.index + 1, attempt: 1, phase: 'study', phaseStart: now, carried: 0, studyMs: 0 },
    events: []
  }
}

export function memoryStop(s: MemoryState, now: number): MemoryStep {
  if (s.phase === 'done') return { state: s, events: [] }
  const events: MemoryEvent[] = []
  if (s.phase === 'draw') {
    events.push({ type: 'drawEnd', index: s.index, attempt: s.attempt, drawMs: memoryElapsed(s, now), studyMs: s.studyMs })
  }
  events.push({ type: 'done', finished: false })
  return { state: { ...s, phase: 'done', paused: false }, events }
}
