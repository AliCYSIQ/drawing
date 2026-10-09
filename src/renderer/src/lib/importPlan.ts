// What adding a folder from disk creates in the library. One plan is used
// both for the preview in the add dialog and for the import itself, so what
// you see is what you get.
//
// Keeping the folder structure (the default when a folder has sub-folders):
// - the chosen folder becomes a library folder
// - a sub-folder with only images becomes a collection
// - a sub-folder with its own sub-folders becomes a folder, all levels down
// - a folder with images and sub-folders keeps both: its own images become a
//   "(loose images)" collection inside it
// A chosen folder without sub-folders is simply one collection.

import type { FolderImport, FolderTree } from '@shared/types'

export type PlanNode =
  | { type: 'folder'; name: string; children: PlanNode[] }
  | {
      type: 'collection'
      name: string
      /** The folder on disk it links to. */
      dir: string
      /** false: only the images directly in `dir`. */
      recursive: boolean
      count: number
      /** Only these sub-folders (and the images directly in `dir`); a list of images, not a linked folder. */
      only?: string[]
    }

export const LOOSE = '(loose images)'

/** One disk folder with its structure kept. */
function keep(tree: FolderTree, children: FolderTree[] = tree.children): PlanNode {
  if (!children.length) return { type: 'collection', name: tree.name, dir: tree.path, recursive: true, count: tree.total }
  return {
    type: 'folder',
    name: tree.name,
    children: [
      ...(tree.direct ? [{ type: 'collection' as const, name: `${tree.name} ${LOOSE}`, dir: tree.path, recursive: false, count: tree.direct }] : []),
      ...children.map((c) => keep(c))
    ]
  }
}

/**
 * The plan for adding `tree` the chosen way. `picked`: paths of the
 * top-level sub-folders to include (all of them when left out).
 */
export function planImport(tree: FolderTree, choice: Exclude<FolderImport, 'ask'>, picked?: string[]): PlanNode | null {
  const subs = picked ? tree.children.filter((c) => picked.includes(c.path)) : tree.children
  if (choice === 'top') {
    return tree.direct ? { type: 'collection', name: tree.name, dir: tree.path, recursive: false, count: tree.direct } : null
  }
  if (choice === 'one') {
    const count = tree.direct + subs.reduce((a, c) => a + c.total, 0)
    if (!count) return null
    const all = subs.length === tree.children.length
    return { type: 'collection', name: tree.name, dir: tree.path, recursive: true, count, ...(all ? {} : { only: subs.map((c) => c.path) }) }
  }
  if (!tree.direct && !subs.length) return null
  return keep(tree, subs)
}

/** How many collections and images a plan makes. */
export function planTotals(node: PlanNode | null): { folders: number; collections: number; images: number } {
  if (!node) return { folders: 0, collections: 0, images: 0 }
  if (node.type === 'collection') return { folders: 0, collections: 1, images: node.count }
  return node.children.map(planTotals).reduce((a, t) => ({ folders: a.folders + t.folders, collections: a.collections + t.collections, images: a.images + t.images }), {
    folders: 1,
    collections: 0,
    images: 0
  })
}
