import { describe, expect, it } from 'vitest'
import { freeElapsed, freePause, freePaused, freeRecord, freeRestore, freeResume, freeStart, freeToggle } from '../src/renderer/src/lib/freeEngine'
import { minutesByDay, skillTotals } from '../src/renderer/src/lib/stats'
import { filterSessions, NO_FILTER, sessionKind } from '../src/renderer/src/lib/history'

const S = 1000

describe('free drawing', () => {
  it('counts drawing time and leaves pauses out', () => {
    let r = freeStart('f', 0, { capture: false })
    expect(freeElapsed(r, 10 * S)).toBe(10 * S)
    r = freePause(r, 10 * S)
    expect(freePaused(r)).toBe(true)
    // An hour of break doesn't count.
    expect(freeElapsed(r, 3600 * S)).toBe(10 * S)
    r = freeResume(r, 3600 * S)
    expect(freeElapsed(r, 3605 * S)).toBe(15 * S)
    r = freeToggle(r, 3605 * S)
    r = freeToggle(r, 4000 * S)
    expect(freeElapsed(r, 4002 * S)).toBe(17 * S)
  })

  it('pausing twice or resuming twice changes nothing', () => {
    const r = freePause(freeStart('f', 0, { capture: false }), 5 * S)
    expect(freePause(r, 9 * S)).toBe(r)
    const on = freeResume(r, 9 * S)
    expect(freeResume(on, 12 * S)).toBe(on)
  })

  it('after a restart it comes back paused, with the time up to when the app last saw it running', () => {
    const r = { ...freeStart('f', 0, { capture: true, skillId: 'k' }), lastSeen: 90 * S }
    const back = freeRestore(r)
    expect(freePaused(back)).toBe(true)
    expect(freeElapsed(back, 10_000 * S)).toBe(90 * S)
    expect(back).toMatchObject({ skillId: 'k', capture: true })
    // Paused when the app closed: nothing changes.
    const paused = freePause(r, 30 * S)
    expect(freeRestore(paused)).toBe(paused)
  })

  it('is saved as a session with no references, counted in totals and its skill', () => {
    const r = freePause(freeStart('f', Date.UTC(2026, 9, 1, 10), { capture: true, skillId: 'k1' }), Date.UTC(2026, 9, 1, 10, 30))
    const rec = freeRecord(r, Date.UTC(2026, 9, 1, 11), { note: '  gesture study  ', drawings: ['/data/captures/f/001.png'] })
    expect(rec).toMatchObject({ id: 'f', activeMs: 30 * 60 * S, poses: [], finished: true, note: 'gesture study', drawings: ['/data/captures/f/001.png'] })
    expect(rec.plan).toMatchObject({ mode: 'free', boardIds: [], skillId: 'k1', review: false })
    expect(sessionKind(rec)).toBe('free')
    expect([...minutesByDay([rec]).values()]).toEqual([30])
    expect(skillTotals([rec], [{ id: 'k1', name: 'Gesture' }])[0]).toMatchObject({ sessions: 1 })
    const ctx = { folders: [], challenges: [], skills: [] }
    expect(filterSessions([rec], { ...NO_FILTER, kinds: ['free'] }, ctx)).toHaveLength(1)
    expect(filterSessions([rec], { ...NO_FILTER, query: 'gesture' }, ctx)).toHaveLength(1)
    expect(filterSessions([rec], { ...NO_FILTER, status: 'not-reviewed' }, ctx)).toHaveLength(0)
  })

  it('a session whose capture failed is still a session, without a drawing', () => {
    const rec = freeRecord(freePause(freeStart('f', 0, { capture: true }), 60 * S), 60 * S, { drawings: [] })
    expect(rec.drawings).toBeUndefined()
    expect(rec.activeMs).toBe(60 * S)
  })
})
