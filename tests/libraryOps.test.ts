import { describe, expect, it } from 'vitest'
import type { Board, Folder } from '@shared/types'
import {
  addShortcuts,
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

const folder = (id: string, name: string, parentId?: string, shortcuts: string[] = []): Folder => ({ id, name, parentId, shortcuts, createdAt: 0 })
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
// Animals (shortcut to poses)
// top (at the top level)
const lib = (): Lib => ({
  folders: [folder('human', 'Human'), folder('hands', 'Hands', 'human'), folder('animals', 'Animals', undefined, ['poses'])],
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
    for (const item of [B('a'), F('b'), { type: 'shortcut', id: 'c', folderId: 'd' } as Item]) expect(parseItemKey(itemKey(item))).toEqual(item)
    expect(parseItemKey('nonsense')).toBeNull()
  })
})

describe('moving', () => {
  it('a collection moved into a folder leaves where it was', () => {
    const out = moveItems(lib(), [B('top')], 'animals')
    expect(out.boards.find((b) => b.id === 'top')?.folderId).toBe('animals')
  })

  it('moving a collection to a folder with its shortcut drops the shortcut', () => {
    const out = moveItems(lib(), [B('poses')], 'animals')
    expect(out.boards.find((b) => b.id === 'poses')?.folderId).toBe('animals')
    expect(out.folders.find((f) => f.id === 'animals')?.shortcuts).toEqual([])
  })

  it('a folder never goes inside itself; the rest of the selection still moves', () => {
    const out = moveItems(lib(), [F('human'), B('top')], 'hands')
    expect(out.folders.find((f) => f.id === 'human')?.parentId).toBeUndefined()
    expect(out.boards.find((b) => b.id === 'top')?.folderId).toBe('hands')
    expect(cannotTransfer(lib(), F('human'), 'hands', 'move')).toMatch(/inside itself/)
  })

  it('moving a shortcut moves only the shortcut', () => {
    const out = moveItems(lib(), [{ type: 'shortcut', id: 'poses', folderId: 'animals' }], 'hands')
    expect(out.folders.find((f) => f.id === 'animals')?.shortcuts).toEqual([])
    expect(out.folders.find((f) => f.id === 'hands')?.shortcuts).toEqual(['poses'])
    expect(out.boards.find((b) => b.id === 'poses')?.folderId).toBe('human')
  })

  it('shortcuts never go to the top level', () => {
    expect(cannotTransfer(lib(), { type: 'shortcut', id: 'poses', folderId: 'animals' }, undefined, 'move')).toBeTruthy()
    expect(addShortcuts(lib(), [B('top')], undefined)).toEqual(lib())
  })
})

describe('copying', () => {
  it('a collection copy is independent, keeps the images, and gets a free name', () => {
    const out = copyItems(lib(), [B('poses')], 'human', counter())
    const copy = out.boards.find((b) => b.id === 'new1')!
    expect(copy).toMatchObject({ name: 'Poses (copy)', folderId: 'human' })
    expect(copy.images).toEqual(lib().boards[0].images)
    expect(out.files).toEqual([{ from: 'poses', to: 'new1' }])
    expect(out.boards).toHaveLength(4)
  })

  it('copying elsewhere keeps the name', () => {
    const out = copyItems(lib(), [B('poses')], 'animals', counter())
    expect(out.boards.find((b) => b.id === 'new1')?.name).toBe('Poses')
  })

  it('a folder copy copies everything inside it', () => {
    const out = copyItems(lib(), [F('human')], undefined, counter())
    const top = out.folders.find((f) => f.name === 'Human (copy)')!
    expect(top.parentId).toBeUndefined()
    const handsCopy = out.folders.find((f) => f.parentId === top.id)!
    expect(handsCopy.name).toBe('Hands')
    expect(out.boards.filter((b) => b.folderId === top.id || b.folderId === handsCopy.id)).toHaveLength(2)
    expect(out.files).toHaveLength(2)
  })

  it('a folder can’t be copied into its own sub-folder', () => {
    const out = copyItems(lib(), [F('human')], 'hands', counter())
    expect(out.folders).toHaveLength(3)
  })

  it('copying a shortcut adds another shortcut, not a collection', () => {
    const out = copyItems(lib(), [{ type: 'shortcut', id: 'poses', folderId: 'animals' }], 'hands', counter())
    expect(out.boards).toHaveLength(3)
    expect(out.folders.find((f) => f.id === 'hands')?.shortcuts).toEqual(['poses'])
  })

  it('names: (copy), then (copy 2)', () => {
    expect(copyName('Hands', ['Hands', 'Hands (copy)'])).toBe('Hands (copy 2)')
    expect(copyName('Feet', ['Hands'])).toBe('Feet')
  })
})

describe('shortcuts', () => {
  it('adds shortcuts, skipping folders and the collection’s own home', () => {
    const out = addShortcuts(lib(), [B('top'), F('hands'), B('handsB')], 'hands')
    expect(out.folders.find((f) => f.id === 'hands')?.shortcuts).toEqual(['top'])
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
    // Shortcuts to deleted collections go too.
    expect(all.folders[0].shortcuts).toEqual([])
  })

  it('removing a shortcut never deletes the collection', () => {
    const out = deleteItems(lib(), [{ type: 'shortcut', id: 'poses', folderId: 'animals' }], 'keep')
    expect(out.boards).toHaveLength(3)
    expect(out.deletedBoards).toEqual([])
  })
})

describe('practicing a folder', () => {
  it('includes collections in deeper folders and shortcuts', () => {
    const l = addShortcuts(lib(), [B('top')], 'hands')
    expect(boardIdsInFolder(l.folders, l.boards, 'human').sort()).toEqual(['handsB', 'poses', 'top'])
    expect(resolveBoardIds(l, ['top'], ['hands', 'gone']).sort()).toEqual(['handsB', 'top'])
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
