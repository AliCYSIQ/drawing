import type { Block, Board, ImageRef, Level, SessionPlan } from '@shared/types'
import type { Slot } from './sessionEngine'

export type Rng = () => number

/** Every image in the chosen boards, without duplicates. */
export function poolFromBoards(boards: Board[], boardIds: string[]): ImageRef[] {
  const seen = new Set<string>()
  const pool: ImageRef[] = []
  for (const id of boardIds) {
    const board = boards.find((b) => b.id === id)
    if (!board) continue
    for (const img of board.images) {
      if (seen.has(img.id)) continue
      seen.add(img.id)
      pool.push(img)
    }
  }
  return pool
}

export function shuffled<T>(list: T[], rng: Rng = Math.random): T[] {
  const a = list.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Pick `n` images (0 = all of them once). No image repeats until the whole
 * pool has been used; when a session needs more images than the pool holds,
 * it starts a new round without putting the same image twice in a row.
 */
export function pickImages(pool: ImageRef[], n: number, shuffle: boolean, rng: Rng = Math.random): ImageRef[] {
  if (!pool.length) return []
  const want = n > 0 ? n : pool.length
  const out: ImageRef[] = []
  while (out.length < want) {
    let round = shuffle ? shuffled(pool, rng) : pool.slice()
    const prev = out[out.length - 1]
    if (prev && round.length > 1 && round[0].id === prev.id) {
      round = [...round.slice(1), round[0]]
    }
    out.push(...round.slice(0, want - out.length))
  }
  return out
}

/** The pose blocks a plan describes. */
export function planBlocks(plan: Pick<SessionPlan, 'mode' | 'seconds' | 'count' | 'blocks'>, poolSize: number): Block[] {
  if (plan.mode === 'class') return plan.blocks.filter((b) => b.count > 0)
  const count = plan.count > 0 ? plan.count : poolSize
  return [{ count, seconds: plan.mode === 'classic' ? plan.seconds : 0 }]
}

/** Memory mode length if every reference gets every attempt; drawing time 0 counts as nothing. */
export function estimateMemorySeconds(refs: number, m: { studySeconds: number; drawSeconds: number; attempts: number }): number {
  return refs * (m.studySeconds + m.drawSeconds * m.attempts)
}

export function slotsFromBlocks(blocks: Block[], pool: ImageRef[], shuffle: boolean, rng: Rng = Math.random): Slot[] {
  const total = blocks.reduce((a, b) => a + b.count, 0)
  const images = pickImages(pool, total, shuffle, rng)
  if (!images.length) return []
  const slots: Slot[] = []
  let i = 0
  for (const block of blocks) {
    for (let k = 0; k < block.count; k++, i++) {
      const img = images[i]
      slots.push({ imageId: img.id, imagePath: img.path, seconds: block.seconds })
    }
  }
  return slots
}

export function slotsForPlan(plan: SessionPlan, pool: ImageRef[], rng: Rng = Math.random): Slot[] {
  return slotsFromBlocks(planBlocks(plan, pool.length), pool, plan.shuffle, rng)
}

export function slotsForLevel(level: Level, pool: ImageRef[], rng: Rng = Math.random): Slot[] {
  return slotsFromBlocks(level.blocks, pool, true, rng)
}

/** Estimated session length in seconds (untimed poses count as 0). */
export function estimateSeconds(blocks: Block[], restSeconds: number): number {
  const poses = blocks.reduce((a, b) => a + b.count, 0)
  const drawing = blocks.reduce((a, b) => a + b.count * b.seconds, 0)
  return drawing + Math.max(0, poses - 1) * restSeconds
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rest = s % 60
  if (m < 60) return rest ? `${m}m ${rest}s` : `${m}m`
  const h = Math.floor(m / 60)
  const mm = m % 60
  return mm ? `${h}h ${mm}m` : `${h}h`
}

export function formatSeconds(seconds: number): string {
  if (seconds === 0) return 'untimed'
  if (seconds < 60) return `${seconds}s`
  return seconds % 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds / 60}m`
}

export function describeBlocks(blocks: Block[]): string {
  return blocks.map((b) => `${b.count}×${formatSeconds(b.seconds)}`).join(' → ')
}
