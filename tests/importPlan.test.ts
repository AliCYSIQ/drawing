import { describe, expect, it } from 'vitest'
import type { FolderTree } from '@shared/types'
import { planImport, planTotals, skippedPaths } from '../src/renderer/src/lib/importPlan'

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
  it('every disk folder becomes a folder, all levels down, with its images directly in it', () => {
    expect(planImport(tree, 'split')).toEqual({
      name: 'Human Poses',
      images: 1,
      children: [
        { name: 'Portraits', images: 2, children: [] },
        { name: 'Sports', images: 1, children: [{ name: 'Basketball', images: 1, children: [] }] }
      ]
    })
    expect(planTotals(planImport(tree, 'split'))).toEqual({ folders: 4, images: 5 })
  })

  it('a folder without sub-folders is just a folder of images', () => {
    expect(planImport(t('/Feet', 4), 'split')).toEqual({ name: 'Feet', images: 4, children: [] })
  })

  it('only the picked top-level sub-folders; the others are remembered as left out', () => {
    const plan = planImport(tree, 'split', ['/Human Poses/Sports'])
    expect(planTotals(plan)).toEqual({ folders: 3, images: 3 })
    expect(skippedPaths(tree, 'split', ['/Human Poses/Sports'])).toEqual(['/Human Poses/Portraits'])
  })

  it('no made-up “loose images” layer when a folder holds images and sub-folders', () => {
    const plan = planImport(tree, 'split')!
    expect(plan.images).toBe(1)
    expect(plan.children.map((c) => c.name)).toEqual(['Portraits', 'Sports'])
  })
})

describe('the other ways', () => {
  it('one folder with everything, or only some sub-folders', () => {
    expect(planImport(tree, 'one')).toEqual({ name: 'Human Poses', images: 5, children: [] })
    expect(planImport(tree, 'one', ['/Human Poses/Portraits'])).toMatchObject({ images: 3 })
  })

  it('only the images directly in the folder', () => {
    expect(planImport(tree, 'top')).toEqual({ name: 'Human Poses', images: 1, children: [] })
    expect(planImport(t('/Refs', 0, [t('/Refs/A', 1)]), 'top')).toBeNull()
    expect(skippedPaths(tree, 'top', [])).toEqual([])
  })
})
