import { describe, expect, it } from 'vitest'
import type { Board, Folder } from '@shared/types'
import {
  boardsBelow,
  boardsIn,
  canMoveFolder,
  childFolders,
  deleteFolder,
  dropShortcuts,
  folderCover,
  folderLabel,
  folderPath,
  searchBoards,
  shortcutsIn
} from '@renderer/lib/library'

const folder = (id: string, name: string, parentId?: string, shortcuts: string[] = []): Folder => ({
  id,
  name,
  parentId,
  shortcuts,
  createdAt: 0
})
const board = (id: string, name: string, folderId?: string, tags: string[] = []): Board => ({
  id,
  name,
  kind: 'folder',
  tags,
  folderId,
  images: [{ id: `${id}-1`, path: `/${id}/1.jpg` }, { id: `${id}-2`, path: `/${id}/2.jpg` }],
  createdAt: 0
})

// Human ─┬─ Hands (folder) ── hands board
//        └─ poses board
// Animals (folder), shows "poses" as a shortcut
const folders = [folder('human', 'Human'), folder('hands', 'Hands', 'human'), folder('animals', 'Animals', undefined, ['poses'])]
const boards = [board('poses', 'Dynamic poses', 'human', ['figures']), board('handsB', 'Hands close up', 'hands', ['hands']), board('top', 'Loose')]

describe('library folders', () => {
  it('builds the path from the top down', () => {
    expect(folderPath(folders, 'hands').map((f) => f.name)).toEqual(['Human', 'Hands'])
    expect(folderLabel(folders, 'hands')).toBe('Human / Hands')
    expect(folderPath(folders, undefined)).toEqual([])
  })

  it('lists sub-folders and collections at home in a folder', () => {
    expect(childFolders(folders).map((f) => f.id)).toEqual(['animals', 'human'])
    expect(boardsIn(boards, 'human').map((b) => b.id)).toEqual(['poses'])
    expect(boardsIn(boards, undefined).map((b) => b.id)).toEqual(['top'])
  })

  it('shows shortcuts without moving the collection', () => {
    expect(shortcutsIn(folders, boards, 'animals').map((b) => b.id)).toEqual(['poses'])
    expect(boardsIn(boards, 'animals')).toEqual([])
  })

  it('finds collections anywhere inside a folder, for its cover', () => {
    expect(boardsBelow(folders, boards, 'human').map((b) => b.id).sort()).toEqual(['handsB', 'poses'])
    expect(folderCover(folders, boards, 'human')).toHaveLength(3)
  })

  it('never moves a folder into itself or its own sub-folder', () => {
    expect(canMoveFolder(folders, 'human', 'hands')).toBe(false)
    expect(canMoveFolder(folders, 'human', 'human')).toBe(false)
    expect(canMoveFolder(folders, 'hands', 'animals')).toBe(true)
    expect(canMoveFolder(folders, 'hands', undefined)).toBe(true)
  })

  it('deleting a folder moves its contents up instead of deleting them', () => {
    const out = deleteFolder(folders, boards, 'human')
    expect(out.folders.find((f) => f.id === 'hands')?.parentId).toBeUndefined()
    expect(out.boards.find((b) => b.id === 'poses')?.folderId).toBeUndefined()
    expect(out.boards).toHaveLength(3)
  })

  it('removes a deleted collection from shortcuts', () => {
    expect(dropShortcuts(folders, 'poses').find((f) => f.id === 'animals')?.shortcuts).toEqual([])
  })

  it('searches names and tags, every word must match', () => {
    expect(searchBoards(boards, 'hands').map((b) => b.id)).toEqual(['handsB'])
    expect(searchBoards(boards, 'dynamic figures').map((b) => b.id)).toEqual(['poses'])
    expect(searchBoards(boards, '  ')).toHaveLength(3)
  })
})
