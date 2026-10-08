import type { Block, Challenge, LadderKind, Level } from '@shared/types'

const FOCUS = [
  'Line of action first',
  'Shoulder and hip tilt',
  'Big shapes, no details',
  'Weight and balance',
  'Push the pose: exaggerate'
]

export const LADDERS: Record<LadderKind, { name: string; about: string }> = {
  speed: { name: 'Speed ladder', about: '10 poses per level. Time drops from 2 minutes to 30 seconds.' },
  volume: { name: 'Volume ladder', about: '60 seconds per pose. Pose count grows from 10 to 30.' },
  class: { name: 'Class ladder', about: 'Short poses first, then each level adds a longer block.' }
}

function ladderLevels(kind: LadderKind): Level[] {
  if (kind === 'speed') {
    return [120, 90, 60, 45, 30].map((seconds, i) => ({
      title: `Level ${i + 1}`,
      focus: FOCUS[i],
      blocks: [{ count: 10, seconds }],
      rest: 0
    }))
  }
  if (kind === 'volume') {
    return [10, 15, 20, 25, 30].map((count, i) => ({
      title: `Level ${i + 1}`,
      focus: FOCUS[i],
      blocks: [{ count, seconds: 60 }],
      rest: 0
    }))
  }
  const steps: Block[][] = [
    [{ count: 10, seconds: 30 }],
    [{ count: 5, seconds: 30 }, { count: 5, seconds: 60 }],
    [{ count: 5, seconds: 30 }, { count: 4, seconds: 60 }, { count: 2, seconds: 120 }],
    [{ count: 5, seconds: 30 }, { count: 3, seconds: 60 }, { count: 2, seconds: 120 }, { count: 1, seconds: 300 }],
    [
      { count: 5, seconds: 30 },
      { count: 3, seconds: 60 },
      { count: 2, seconds: 120 },
      { count: 1, seconds: 300 },
      { count: 1, seconds: 600 }
    ]
  ]
  return steps.map((blocks, i) => ({ title: `Level ${i + 1}`, focus: FOCUS[i], blocks, rest: 5 }))
}

export function makeLadder(id: string, kind: LadderKind, boardIds: string[], now: number): Challenge {
  return {
    id,
    name: LADDERS[kind].name,
    kind: 'ladder',
    ladder: kind,
    boardIds,
    levels: ladderLevels(kind),
    completed: [],
    createdAt: now
  }
}

export function newLevel(n: number): Level {
  return { title: `Level ${n}`, focus: '', blocks: [{ count: 10, seconds: 60 }], rest: 0 }
}

/** Level 1 is always open; every other level opens when the one before it is done. */
export function isUnlocked(ch: Challenge, i: number): boolean {
  return i === 0 || ch.completed.includes(i - 1)
}

export function completeLevel(ch: Challenge, i: number): Challenge {
  if (ch.completed.includes(i)) return ch
  return { ...ch, completed: [...ch.completed, i].sort((a, b) => a - b) }
}

/** The first level that is open but not done yet, or -1 when all are done. */
export function currentLevel(ch: Challenge): number {
  for (let i = 0; i < ch.levels.length; i++) {
    if (isUnlocked(ch, i) && !ch.completed.includes(i)) return i
  }
  return -1
}
