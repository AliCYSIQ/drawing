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

/** Image ids drawn recently, with when each was last drawn (a Set works too: no order among them). */
export type Seen = Set<string> | Map<string, number>

/**
 * Fresh images first: the order stays as it is (shuffled or not), then
 * images not drawn recently move to the front. Among the drawn ones, the one
 * drawn longest ago comes first; ties keep their order.
 */
export function freshFirst(round: ImageRef[], seen: Seen): ImageRef[] {
  const fresh = round.filter((i) => !seen.has(i.id))
  const used = round.filter((i) => seen.has(i.id))
  if (seen instanceof Map) used.sort((a, b) => (seen.get(a.id) ?? 0) - (seen.get(b.id) ?? 0))
  return [...fresh, ...used]
}

/**
 * Pick `n` images (0 = all of them once). No image repeats until the whole
 * pool has been used; when a session needs more images than the pool holds,
 * it starts a new round without putting the same image twice in a row.
 * With `seenRecently`, the first round puts fresh images first (see freshFirst).
 */
export function pickImages(
  pool: ImageRef[],
  n: number,
  shuffle: boolean,
  rng: Rng = Math.random,
  seenRecently?: Seen
): ImageRef[] {
  if (!pool.length) return []
  const want = n > 0 ? n : pool.length
  const out: ImageRef[] = []
  while (out.length < want) {
    let round = shuffle ? shuffled(pool, rng) : pool.slice()
    if (!out.length && seenRecently?.size) round = freshFirst(round, seenRecently)
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

export interface SlotOptions {
  /** Rest after the last pose of each block (not after the final one); 0 = the usual rest. */
  blockRest?: number
  seenRecently?: Seen
}

export function slotsFromBlocks(
  blocks: Block[],
  pool: ImageRef[],
  shuffle: boolean,
  rng: Rng = Math.random,
  opts: SlotOptions = {}
): Slot[] {
  const total = blocks.reduce((a, b) => a + b.count, 0)
  const images = pickImages(pool, total, shuffle, rng, opts.seenRecently)
  if (!images.length) return []
  const slots: Slot[] = []
  let i = 0
  blocks.forEach((block, b) => {
    for (let k = 0; k < block.count; k++, i++) {
      const img = images[i]
      const endOfBlock = k === block.count - 1 && b < blocks.length - 1
      slots.push({
        imageId: img.id,
        imagePath: img.path,
        seconds: block.seconds,
        ...(endOfBlock && opts.blockRest ? { restAfter: opts.blockRest } : {})
      })
    }
  })
  return slots
}

export function slotsForPlan(plan: SessionPlan, pool: ImageRef[], rng: Rng = Math.random, seenRecently?: Seen): Slot[] {
  const blockRest = plan.mode === 'class' ? (plan.blockRest ?? 0) : 0
  return slotsFromBlocks(planBlocks(plan, pool.length), pool, plan.shuffle, rng, {
    blockRest,
    seenRecently: plan.freshFirst === false ? undefined : seenRecently
  })
}

/** Image ids drawn in sessions during the last `days` days, with when each was last drawn. */
export function recentlySeen(sessions: { startedAt: number; poses: { imageId: string }[] }[], now: number, days = 7): Map<string, number> {
  const since = now - days * 86_400_000
  const out = new Map<string, number>()
  for (const s of sessions) {
    if (s.startedAt < since) continue
    for (const p of s.poses) out.set(p.imageId, Math.max(out.get(p.imageId) ?? 0, s.startedAt))
  }
  return out
}

export function slotsForLevel(level: Level, pool: ImageRef[], rng: Rng = Math.random): Slot[] {
  return slotsFromBlocks(level.blocks, pool, true, rng)
}

/** Estimated session length in seconds (untimed poses count as 0). */
export function estimateSeconds(blocks: Block[], restSeconds: number, blockRest = 0): number {
  const poses = blocks.reduce((a, b) => a + b.count, 0)
  const drawing = blocks.reduce((a, b) => a + b.count * b.seconds, 0)
  const breaks = blockRest ? Math.max(0, blocks.length - 1) : 0
  return drawing + (Math.max(0, poses - 1) - breaks) * restSeconds + breaks * blockRest
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
