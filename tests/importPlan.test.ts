import { describe, expect, it } from 'vitest'
import type { FolderTree } from '@shared/types'
import { planImport, planTotals } from '../src/renderer/src/lib/importPlan'

const t = (path: string, direct: number, children: FolderTree[] = []): FolderTree => ({
  name: path.split('/').pop()!,
  path,
  direct,
  total: direct + children.reduce((a, c) => a + c.total, 0),
  children
})

// Human Poses/            Standing.jpg
//   Sports/               Football.jpg
//     Basketball/         Dunk.jpg
//   Portraits/            2 images
const tree = t('/Human Poses', 1, [t('/Human Poses/Portraits', 2), t('/Human Poses/Sports', 1, [t('/Human Poses/Sports/Basketball', 1)])])

describe('adding a folder, keeping its structure', () => {
  it('makes folders for folders with sub-folders and collections for the rest, all levels down', () => {
    expect(planImport(tree, 'split')).toEqual({
      type: 'folder',
      name: 'Human Poses',
      children: [
        { type: 'collection', name: 'Human Poses (loose images)', dir: '/Human Poses', recursive: false, count: 1 },
        { type: 'collection', name: 'Portraits', dir: '/Human Poses/Portraits', recursive: true, count: 2 },
        {
          type: 'folder',
          name: 'Sports',
          children: [
            { type: 'collection', name: 'Sports (loose images)', dir: '/Human Poses/Sports', recursive: false, count: 1 },
            { type: 'collection', name: 'Basketball', dir: '/Human Poses/Sports/Basketball', recursive: true, count: 1 }
          ]
        }
      ]
    })
    expect(planTotals(planImport(tree, 'split'))).toEqual({ folders: 2, collections: 4, images: 5 })
  })

  it('a folder without sub-folders is one collection', () => {
    expect(planImport(t('/Feet', 4), 'split')).toEqual({ type: 'collection', name: 'Feet', dir: '/Feet', recursive: true, count: 4 })
  })

  it('only the picked top-level sub-folders', () => {
    const plan = planImport(tree, 'split', ['/Human Poses/Sports'])
    expect(planTotals(plan)).toEqual({ folders: 2, collections: 3, images: 3 })
  })

  it('no loose-images collection when a folder has only sub-folders', () => {
    const plan = planImport(t('/Refs', 0, [t('/Refs/A', 1), t('/Refs/B', 1)]), 'split')
    expect(plan).toMatchObject({ type: 'folder', children: [{ name: 'A' }, { name: 'B' }] })
  })
})

describe('the other ways', () => {
  it('one collection with everything, or only some sub-folders', () => {
    expect(planImport(tree, 'one')).toEqual({ type: 'collection', name: 'Human Poses', dir: '/Human Poses', recursive: true, count: 5 })
    expect(planImport(tree, 'one', ['/Human Poses/Portraits'])).toMatchObject({ count: 3, only: ['/Human Poses/Portraits'] })
  })

  it('only the images directly in the folder', () => {
    expect(planImport(tree, 'top')).toEqual({ type: 'collection', name: 'Human Poses', dir: '/Human Poses', recursive: false, count: 1 })
    expect(planImport(t('/Refs', 0, [t('/Refs/A', 1)]), 'top')).toBeNull()
  })
})
