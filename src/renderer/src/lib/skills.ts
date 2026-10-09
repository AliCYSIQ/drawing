import type { Challenge, Preset, SessionPlan, SessionRecord, Settings, Skill } from '@shared/types'

/** Trimmed, single spaces, at most 40 characters. Case stays as typed. */
export const normalizeSkillName = (raw: string) => raw.trim().replace(/\s+/g, ' ').slice(0, 40)

/** The skill with this name, ignoring case. */
export function findSkill(skills: Skill[], name: string): Skill | undefined {
  const key = normalizeSkillName(name).toLowerCase()
  return skills.find((s) => s.name.toLowerCase() === key)
}

/** The skill id, if that skill still exists. */
export function knownSkill(skills: Skill[], id: string | undefined): string | undefined {
  return id && skills.some((s) => s.id === id) ? id : undefined
}

/** Everything that can carry a skill. */
export interface SkillTagged {
  sessions: SessionRecord[]
  presets: Preset[]
  challenges: Challenge[]
  settings: Settings
}

function untag<T extends { skillId?: string }>(x: T, id: string): T {
  if (x.skillId !== id) return x
  const copy = { ...x }
  delete copy.skillId
  return copy
}

/**
 * Removes one skill's tag from sessions, presets, challenges and the last
 * plan. Nothing else changes: the sessions keep their time and show as "No skill".
 */
export function withoutSkill(data: SkillTagged, id: string): SkillTagged {
  const plans = <T extends { plan: SessionPlan }>(list: T[]) =>
    list.some((x) => x.plan.skillId === id) ? list.map((x) => (x.plan.skillId === id ? { ...x, plan: untag(x.plan, id) } : x)) : list
  const lastPlan = data.settings.lastPlan
  return {
    sessions: plans(data.sessions),
    presets: plans(data.presets),
    challenges: data.challenges.some((c) => c.skillId === id) ? data.challenges.map((c) => untag(c, id)) : data.challenges,
    settings: lastPlan?.skillId === id ? { ...data.settings, lastPlan: untag(lastPlan, id) } : data.settings
  }
}
