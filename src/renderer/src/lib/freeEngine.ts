// Free drawing: a clock and nothing else. You draw whatever you like in
// another app (or on paper); the session counts your drawing time, without
// pauses, toward your totals and the skill you picked.
//
// Pure, like the other engines: time comes from timestamps, so pausing is
// exact, and the state can be saved and picked up again after a restart.

import { DEFAULT_PLAN, type FreeRun, type SessionRecord } from '@shared/types'

export function freeStart(id: string, now: number, opts: { skillId?: string; capture: boolean }): FreeRun {
  return { id, startedAt: now, carriedMs: 0, runningSince: now, lastSeen: now, ...(opts.skillId ? { skillId: opts.skillId } : {}), capture: opts.capture }
}

/** Drawing time so far (pauses not counted). */
export function freeElapsed(r: FreeRun, now: number): number {
  return r.carriedMs + (r.runningSince !== undefined ? Math.max(0, now - r.runningSince) : 0)
}

export function freePaused(r: FreeRun): boolean {
  return r.runningSince === undefined
}

export function freePause(r: FreeRun, now: number): FreeRun {
  if (r.runningSince === undefined) return r
  const { runningSince, ...rest } = r
  void runningSince
  return { ...rest, carriedMs: freeElapsed(r, now), lastSeen: now }
}

export function freeResume(r: FreeRun, now: number): FreeRun {
  if (r.runningSince !== undefined) return r
  return { ...r, runningSince: now, lastSeen: now }
}

export function freeToggle(r: FreeRun, now: number): FreeRun {
  return freePaused(r) ? freeResume(r, now) : freePause(r, now)
}

/** Seen running just now; saved every so often so a restart loses little. */
export function freeBeat(r: FreeRun, now: number): FreeRun {
  return { ...r, lastSeen: now }
}

/**
 * Picking a session up after the app was closed (or crashed) while it ran:
 * the time up to the last moment the app saw it running counts, and it comes
 * back paused, because the app can't know whether you went on drawing.
 */
export function freeRestore(r: FreeRun): FreeRun {
  if (r.runningSince === undefined) return r
  const { runningSince, ...rest } = r
  return { ...rest, carriedMs: r.carriedMs + Math.max(0, r.lastSeen - runningSince) }
}

/** The session to save when it ends. */
export function freeRecord(r: FreeRun, now: number, extra: { note?: string; drawings?: string[] } = {}): SessionRecord {
  const note = extra.note?.trim()
  return {
    id: r.id,
    startedAt: r.startedAt,
    endedAt: now,
    activeMs: Math.round(freeElapsed(r, now)),
    plan: { ...DEFAULT_PLAN, mode: 'free', boardIds: [], folderIds: [], count: 0, review: false, capture: r.capture, ...(r.skillId ? { skillId: r.skillId } : {}) },
    poses: [],
    finished: true,
    reviewed: false,
    pagePhotos: [],
    ...(note ? { note } : {}),
    ...(extra.drawings?.length ? { drawings: extra.drawings } : {})
  }
}
