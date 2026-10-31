import { describe, expect, it } from 'vitest'
import type { Asset, Folder, LibraryImage } from '@shared/types'
import {
  canMoveFolder,
  childFolders,
  countLabel,
  deleteItems,
  folderCounts,
  folderCover,
  folderLabel,
  folderPath,
  imagesBelow,
  imagesIn,
  searchLibrary,
  assetMap
} from '@renderer/lib/library'

const folder = (id: string, name: string, parentId?: string, tags: string[] = []): Folder => ({ id, name, parentId, createdAt: 0, tags })
const entry = (id: string, folderId: string | undefined, name = id): LibraryImage => ({ id, assetId: `a-${id}`, folderId, name, createdAt: 0 })
const asset = (id: string): Asset => ({ id: `a-${id}`, path: `/pics/${id}.jpg`, storage: 'linked', origin: 'folder', addedAt: 0 })

// Human ─┬─ Hands ── hand1, hand2
//        ├─ Poses ── standing, sitting   (tag "figures")
//        └─ proportions (an image directly in Human)
// Animals (empty)
// loose (an image at the top level)
const folders = [folder('human', 'Human'), folder('hands', 'Hands', 'human', ['hands']), folder('poses', 'Dynamic poses', 'human', ['figures']), folder('animals', 'Animals')]
const images = [
  entry('hand1', 'hands', 'Hand 01'),
  entry('hand2', 'hands', 'Hand 02'),
  entry('standing', 'poses', 'Standing'),
  entry('sitting', 'poses', 'Sitting'),
  entry('proportions', 'human', 'Proportions'),
  entry('loose', undefined, 'Loose')
]
const lib = { folders, images }
const assets = assetMap(images.map((i) => asset(i.id)))

describe('library folders', () => {
  it('builds the path from the top down', () => {
    expect(folderPath(folders, 'hands').map((f) => f.name)).toEqual(['Human', 'Hands'])
    expect(folderLabel(folders, 'hands')).toBe('Human / Hands')
    expect(folderPath(folders, undefined)).toEqual([])
  })

  it('a folder holds folders and images at once, and either can be empty', () => {
    expect(childFolders(folders).map((f) => f.id)).toEqual(['animals', 'human'])
    expect(childFolders(folders, 'human').map((f) => f.id)).toEqual(['poses', 'hands'])
    expect(imagesIn(images, 'human').map((i) => i.id)).toEqual(['proportions'])
    expect(imagesIn(images, undefined).map((i) => i.id)).toEqual(['loose'])
    expect(folderCounts(lib, 'human')).toEqual({ folders: 2, images: 1, total: 5 })
    expect(folderCounts(lib, 'animals')).toEqual({ folders: 0, images: 0, total: 0 })
    expect(countLabel(folderCounts(lib, 'animals'))).toBe('Empty')
    expect(countLabel(folderCounts(lib, 'human'))).toBe('2 folders · 1 image')
  })

  it('finds images anywhere inside a folder, for its cover', () => {
    expect(imagesBelow(lib, 'human').map((i) => i.id).sort()).toEqual(['hand1', 'hand2', 'proportions', 'sitting', 'standing'])
    const cover = folderCover(lib, assets, 'human')
    expect(cover).toHaveLength(3)
    // Its own image comes first.
    expect(cover[0].id).toBe('a-proportions')
  })

  it('never moves a folder into itself or its own sub-folder', () => {
    expect(canMoveFolder(folders, 'human', 'hands')).toBe(false)
    expect(canMoveFolder(folders, 'human', 'human')).toBe(false)
    expect(canMoveFolder(folders, 'hands', 'animals')).toBe(true)
    expect(canMoveFolder(folders, 'hands', undefined)).toBe(true)
  })

  it('deleting a folder can move its contents up instead of deleting them', () => {
    const out = deleteItems(lib, [{ type: 'folder', id: 'human' }], 'keep')
    expect(out.folders.find((f) => f.id === 'hands')?.parentId).toBeUndefined()
    expect(out.images.find((i) => i.id === 'proportions')?.folderId).toBeUndefined()
    expect(out.images).toHaveLength(6)
  })

  it('searches folder names and tags, and image names; every word must match', () => {
    expect(searchLibrary(lib, 'hands').folders.map((f) => f.id)).toEqual(['hands'])
    expect(searchLibrary(lib, 'dynamic figures').folders.map((f) => f.id)).toEqual(['poses'])
    expect(searchLibrary(lib, 'hand 02').images.map((i) => i.id)).toEqual(['hand2'])
    expect(searchLibrary(lib, '  ')).toEqual({ folders: [], images: [] })
  })
})
