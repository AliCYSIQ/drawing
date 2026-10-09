import { describe, expect, it } from 'vitest'
import type { Board, Folder } from '@shared/types'
import {
  boardIdsInFolder,
  cannotTransfer,
  copyItems,
  copyName,
  deleteItems,
  itemKey,
  moveItems,
  parseItemKey,
  resolveBoardIds,
  sortItems,
  type Item,
  type Lib
} from '@renderer/lib/library'

const folder = (id: string, name: string, parentId?: string): Folder => ({ id, name, parentId, createdAt: 0 })
const board = (id: string, name: string, folderId?: string): Board => ({
  id,
  name,
  kind: 'collection',
  tags: [],
  folderId,
  images: [{ id: `${id}-1`, path: `/data/collections/${id}/1.jpg` }],
  createdAt: 0
})

// Human ─┬─ Hands (folder) ── handsB
//        └─ poses
// Animals (empty)
// top (at the top level)
const lib = (): Lib => ({
  folders: [folder('human', 'Human'), folder('hands', 'Hands', 'human'), folder('animals', 'Animals')],
  boards: [board('poses', 'Poses', 'human'), board('handsB', 'Hands close up', 'hands'), board('top', 'Loose')]
})
const counter = () => {
  let n = 0
  return () => `new${++n}`
}
const B = (id: string): Item => ({ type: 'board', id })
const F = (id: string): Item => ({ type: 'folder', id })

describe('item keys', () => {
  it('round-trip', () => {
    for (const item of [B('a'), F('b')]) expect(parseItemKey(itemKey(item))).toEqual(item)
    expect(parseItemKey('nonsense')).toBeNull()
  })
})

describe('moving', () => {
  it('a collection moved into a folder leaves where it was', () => {
    const out = moveItems(lib(), [B('top')], 'animals')
    expect(out.boards.find((b) => b.id === 'top')?.folderId).toBe('animals')
    expect(out.boards).toHaveLength(3)
  })

  it('a folder never goes inside itself; the rest of the selection still moves', () => {
    const out = moveItems(lib(), [F('human'), B('top')], 'hands')
    expect(out.folders.find((f) => f.id === 'human')?.parentId).toBeUndefined()
    expect(out.boards.find((b) => b.id === 'top')?.folderId).toBe('hands')
    expect(cannotTransfer(lib(), F('human'), 'hands', 'move')).toMatch(/inside itself/)
  })

  it('moving to where it already is does nothing', () => {
    expect(cannotTransfer(lib(), B('poses'), 'human', 'move')).toMatch(/already there/)
    expect(cannotTransfer(lib(), B('poses'), 'human', 'copy')).toBeNull()
  })
})

describe('copying', () => {
  it('a collection copy is independent, keeps the images, and gets a free name', () => {
    const out = copyItems(lib(), [B('poses')], 'human', counter())
    const copy = out.boards.find((b) => b.id === 'new1')!
    expect(copy).toMatchObject({ name: 'Poses (copy)', folderId: 'human' })
    expect(copy.images).toEqual(lib().boards[0].images)
    expect(out.boards).toHaveLength(4)
  })

  it('to have a collection in two folders, copy it: the name stays', () => {
    const out = copyItems(lib(), [B('poses')], 'animals', counter())
    expect(out.boards.find((b) => b.id === 'new1')).toMatchObject({ name: 'Poses', folderId: 'animals' })
    expect(out.boards.find((b) => b.id === 'poses')?.folderId).toBe('human')
  })

  it('a folder copy copies everything inside it', () => {
    const out = copyItems(lib(), [F('human')], undefined, counter())
    const top = out.folders.find((f) => f.name === 'Human (copy)')!
    expect(top.parentId).toBeUndefined()
    const handsCopy = out.folders.find((f) => f.parentId === top.id)!
    expect(handsCopy.name).toBe('Hands')
    expect(out.boards.filter((b) => b.folderId === top.id || b.folderId === handsCopy.id)).toHaveLength(2)
  })

  it('a folder can’t be copied into its own sub-folder', () => {
    const out = copyItems(lib(), [F('human')], 'hands', counter())
    expect(out.folders).toHaveLength(3)
  })

  it('names: (copy), then (copy 2)', () => {
    expect(copyName('Hands', ['Hands', 'Hands (copy)'])).toBe('Hands (copy 2)')
    expect(copyName('Feet', ['Hands'])).toBe('Feet')
  })
})

describe('deleting', () => {
  it('a folder can keep what is inside (moved up) or delete it all', () => {
    const keep = deleteItems(lib(), [F('human')], 'keep')
    expect(keep.boards).toHaveLength(3)
    expect(keep.deletedBoards).toEqual([])
    const all = deleteItems(lib(), [F('human')], 'all')
    expect(all.folders.map((f) => f.id)).toEqual(['animals'])
    expect(all.deletedBoards.sort()).toEqual(['handsB', 'poses'])
  })
})

describe('practicing a folder', () => {
  it('includes collections in deeper folders', () => {
    expect(boardIdsInFolder(lib().folders, lib().boards, 'human').sort()).toEqual(['handsB', 'poses'])
    expect(resolveBoardIds(lib(), ['top'], ['hands', 'gone']).sort()).toEqual(['handsB', 'top'])
  })
})

describe('sorting', () => {
  it('by name with numbers in order, or by size and date', () => {
    const list = [
      { id: 'a', name: 'Pose 10', createdAt: 1 },
      { id: 'b', name: 'pose 2', createdAt: 3 },
      { id: 'c', name: 'Arms', createdAt: 2 }
    ]
    expect(sortItems(list, 'name', () => 0, () => 0).map((x) => x.id)).toEqual(['c', 'b', 'a'])
    expect(sortItems(list, 'added', () => 0, () => 0).map((x) => x.id)).toEqual(['b', 'c', 'a'])
    expect(sortItems(list, 'size', (x) => (x.id === 'a' ? 9 : 1), () => 0)[0].id).toBe('a')
  })
})
