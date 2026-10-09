import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAN, DEFAULT_SETTINGS, type Challenge, type SessionRecord, type Skill } from '@shared/types'
import { findSkill, knownSkill, normalizeSkillName, withoutSkill } from '@renderer/lib/skills'
import { sessionsForSkill, skillTotals } from '@renderer/lib/stats'

const skills: Skill[] = [
  { id: 'g', name: 'Gesture' },
  { id: 'h', name: 'Hands' },
  { id: 'p', name: 'Perspective' }
]

function session(id: string, minutes: number, skillId?: string, startedAt = 1000): SessionRecord {
  return {
    id,
    startedAt,
    endedAt: startedAt + minutes * 60000,
    activeMs: minutes * 60000,
    plan: { ...DEFAULT_PLAN, ...(skillId ? { skillId } : {}) },
    poses: [],
    finished: true,
    reviewed: false,
    pagePhotos: []
  }
}

const challenge = (id: string, skillId?: string): Challenge => ({
  id,
  name: id,
  kind: 'custom',
  boardIds: [],
  levels: [],
  completed: [],
  createdAt: 0,
  ...(skillId ? { skillId } : {})
})

describe('skills', () => {
  it('cleans up names and finds them ignoring case', () => {
    expect(normalizeSkillName('  Figure   drawing ')).toBe('Figure drawing')
    expect(normalizeSkillName('x'.repeat(60))).toHaveLength(40)
    expect(findSkill(skills, ' gesture ')?.id).toBe('g')
    expect(findSkill(skills, 'anatomy')).toBeUndefined()
  })

  it('treats a deleted skill as no skill', () => {
    expect(knownSkill(skills, 'h')).toBe('h')
    expect(knownSkill(skills, 'gone')).toBeUndefined()
    expect(knownSkill(skills, undefined)).toBeUndefined()
  })

  it('deleting a skill untags sessions, presets, challenges and the last plan, and nothing else', () => {
    const kept = session('b', 10, 'h')
    const data = {
      sessions: [session('a', 20, 'g'), kept],
      presets: [{ id: 'p1', name: 'Warm-up', plan: { ...DEFAULT_PLAN, skillId: 'g' } }],
      challenges: [challenge('c1', 'g'), challenge('c2', 'h')],
      settings: { ...DEFAULT_SETTINGS, lastPlan: { ...DEFAULT_PLAN, skillId: 'g' } }
    }
    const out = withoutSkill(data, 'g')
    expect(out.sessions[0].plan.skillId).toBeUndefined()
    expect(out.sessions[0].activeMs).toBe(20 * 60000)
    expect(out.sessions[1]).toBe(kept)
    expect(out.presets[0].plan.skillId).toBeUndefined()
    expect(out.challenges.map((c) => c.skillId)).toEqual([undefined, 'h'])
    expect(out.settings.lastPlan?.skillId).toBeUndefined()
    // Untouched lists keep their identity, so they aren't saved again.
    expect(withoutSkill(data, 'p').sessions).toBe(data.sessions)
  })

  it('filters sessions by skill, with deleted skills counted as none', () => {
    const list = [session('a', 20, 'g'), session('b', 10), session('c', 5, 'gone')]
    expect(sessionsForSkill(list, skills, 'all')).toHaveLength(3)
    expect(sessionsForSkill(list, skills, 'g').map((s) => s.id)).toEqual(['a'])
    expect(sessionsForSkill(list, skills, 'none').map((s) => s.id)).toEqual(['b', 'c'])
  })

  it('totals time and sessions per skill, most time first, no skill last', () => {
    const rows = skillTotals(
      [session('a', 20, 'h', 100), session('b', 30, 'g', 200), session('c', 15, 'h', 300), session('d', 5, undefined, 400)],
      skills
    )
    expect(rows.map((r) => [r.name, r.minutes, r.sessions, r.lastAt])).toEqual([
      ['Hands', 35, 2, 300],
      ['Gesture', 30, 1, 200],
      ['Perspective', 0, 0, undefined],
      ['No skill', 5, 1, 400]
    ])
    expect(skillTotals([session('a', 20, 'g')], skills).some((r) => !r.skillId)).toBe(false)
  })
})
