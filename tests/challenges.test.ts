import { describe, expect, it } from 'vitest'
import { completeLevel, currentLevel, isUnlocked, makeLadder } from '@renderer/lib/challenges'

describe('challenges', () => {
  it('speed ladder drops from 2 minutes to 30 seconds', () => {
    const ch = makeLadder('c', 'speed', ['b'], 0)
    expect(ch.levels.map((l) => l.blocks[0].seconds)).toEqual([120, 90, 60, 45, 30])
    expect(ch.levels.every((l) => l.blocks[0].count === 10)).toBe(true)
  })

  it('volume ladder grows from 10 to 30 poses', () => {
    const ch = makeLadder('c', 'volume', ['b'], 0)
    expect(ch.levels.map((l) => l.blocks[0].count)).toEqual([10, 15, 20, 25, 30])
  })

  it('class ladder adds a longer block each level', () => {
    const ch = makeLadder('c', 'class', ['b'], 0)
    expect(ch.levels.map((l) => l.blocks.length)).toEqual([1, 2, 3, 4, 5])
  })

  it('unlocks levels in order', () => {
    let ch = makeLadder('c', 'speed', ['b'], 0)
    expect(isUnlocked(ch, 0)).toBe(true)
    expect(isUnlocked(ch, 1)).toBe(false)
    expect(currentLevel(ch)).toBe(0)
    ch = completeLevel(ch, 0)
    expect(isUnlocked(ch, 1)).toBe(true)
    expect(currentLevel(ch)).toBe(1)
    for (let i = 1; i < 5; i++) ch = completeLevel(ch, i)
    expect(currentLevel(ch)).toBe(-1)
  })
})
