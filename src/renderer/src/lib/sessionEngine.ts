// The session timer as a pure state machine. Every function takes `now` (ms)
// and returns a new state, so time comes from timestamps instead of counting
// interval ticks: the clock can't drift, and pausing is exact.

export interface Slot {
  imageId: string
  imagePath: string
  /** 0 = untimed. */
  seconds: number
}

export type Phase = 'pose' | 'rest' | 'done'

export interface EngineState {
  slots: Slot[]
  /** Rest between poses in seconds; 0 = none. */
  restSeconds: number
  index: number
  phase: Phase
  /** When the running part of the current phase started. */
  phaseStart: number
  /** Ms already spent in the current phase before the last pause. */
  carried: number
  paused: boolean
  /** Ms spent drawing each pose. */
  spent: number[]
  skipped: boolean[]
}

export type EngineEvent =
  | { type: 'poseEnd'; index: number; reason: 'time' | 'skip' | 'stop' }
  | { type: 'restEnd' }
  | { type: 'done'; finished: boolean }

export interface Step {
  state: EngineState
  events: EngineEvent[]
}

export function createEngine(slots: Slot[], restSeconds: number, now: number): EngineState {
  return {
    slots,
    restSeconds,
    index: 0,
    phase: slots.length ? 'pose' : 'done',
    phaseStart: now,
    carried: 0,
    paused: false,
    spent: slots.map(() => 0),
    skipped: slots.map(() => false)
  }
}

/** Length of the current phase in ms; 0 = untimed. */
export function phaseDuration(s: EngineState): number {
  if (s.phase === 'pose') return s.slots[s.index].seconds * 1000
  if (s.phase === 'rest') return s.restSeconds * 1000
  return 0
}

export function elapsed(s: EngineState, now: number): number {
  return s.paused ? s.carried : s.carried + (now - s.phaseStart)
}

/** Ms left in the current phase, or null when it has no timer. */
export function remaining(s: EngineState, now: number): number | null {
  const d = phaseDuration(s)
  if (!d) return null
  return Math.max(0, d - elapsed(s, now))
}

export function pause(s: EngineState, now: number): EngineState {
  if (s.paused || s.phase === 'done') return s
  return { ...s, paused: true, carried: elapsed(s, now) }
}

export function resume(s: EngineState, now: number): EngineState {
  if (!s.paused) return s
  return { ...s, paused: false, phaseStart: now }
}

export function togglePause(s: EngineState, now: number): EngineState {
  return s.paused ? resume(s, now) : pause(s, now)
}

/** Advance through every phase whose time has run out. */
export function tick(s: EngineState, now: number): Step {
  const events: EngineEvent[] = []
  let state = s
  while (!state.paused && state.phase !== 'done') {
    const d = phaseDuration(state)
    if (!d) break
    const used = elapsed(state, now)
    if (used < d) break
    // The phase ended at this moment; the next one starts from there.
    const endedAt = now - (used - d)
    if (state.phase === 'pose') {
      state = endPose(state, d, 'time', events)
    } else {
      events.push({ type: 'restEnd' })
      state = afterRest(state)
    }
    state = { ...state, phaseStart: endedAt, carried: 0 }
  }
  return { state, events }
}

/** Skip the rest of the current pose, or end a rest early. */
export function next(s: EngineState, now: number): Step {
  const events: EngineEvent[] = []
  if (s.phase === 'done') return { state: s, events }
  let state: EngineState
  if (s.phase === 'pose') {
    const timed = phaseDuration(s) > 0
    state = endPose(s, elapsed(s, now), timed ? 'skip' : 'time', events)
  } else {
    events.push({ type: 'restEnd' })
    state = afterRest(s)
  }
  return { state: { ...state, phaseStart: now, carried: 0 }, events }
}

/** Go back to the previous pose (or redo the pose a rest followed) with a full timer. */
export function back(s: EngineState, now: number): Step {
  if (s.phase === 'done') return { state: s, events: [] }
  let spent = s.spent
  let index = s.index
  if (s.phase === 'pose') {
    spent = withValue(spent, index, spent[index] + elapsed(s, now))
    index = Math.max(0, index - 1)
  }
  const skipped = withValue(s.skipped, index, false)
  return {
    state: { ...s, spent, skipped, index, phase: 'pose', phaseStart: now, carried: 0 },
    events: []
  }
}

/** End the session now. */
export function stop(s: EngineState, now: number): Step {
  const events: EngineEvent[] = []
  if (s.phase === 'done') return { state: s, events }
  let spent = s.spent
  if (s.phase === 'pose') {
    spent = withValue(spent, s.index, spent[s.index] + elapsed(s, now))
    events.push({ type: 'poseEnd', index: s.index, reason: 'stop' })
  }
  events.push({ type: 'done', finished: false })
  return { state: { ...s, spent, phase: 'done', paused: false, carried: 0 }, events }
}

export function activeMs(s: EngineState): number {
  return s.spent.reduce((a, b) => a + b, 0)
}

function endPose(
  s: EngineState,
  ms: number,
  reason: 'time' | 'skip',
  events: EngineEvent[]
): EngineState {
  const spent = withValue(s.spent, s.index, s.spent[s.index] + ms)
  const skipped = reason === 'skip' ? withValue(s.skipped, s.index, true) : s.skipped
  events.push({ type: 'poseEnd', index: s.index, reason })
  const last = s.index >= s.slots.length - 1
  if (last) {
    events.push({ type: 'done', finished: true })
    return { ...s, spent, skipped, phase: 'done' }
  }
  if (s.restSeconds > 0) return { ...s, spent, skipped, phase: 'rest' }
  return { ...s, spent, skipped, phase: 'pose', index: s.index + 1 }
}

function afterRest(s: EngineState): EngineState {
  return { ...s, phase: 'pose', index: s.index + 1 }
}

function withValue<T>(list: T[], i: number, value: T): T[] {
  const copy = list.slice()
  copy[i] = value
  return copy
}
