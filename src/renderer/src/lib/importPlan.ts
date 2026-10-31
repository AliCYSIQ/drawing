// What adding a folder from disk makes in the library, for the preview in
// the add dialog. The import itself (importScan in library.ts) follows the
// same rules, so what you see is what you get:
//
// - Keep the folder structure (the default): the folder becomes a library
//   folder, and so does every sub-folder with images somewhere inside, all
//   levels down. Images stay directly in the folder they are in on disk; a
//   folder can hold images and folders at once.
// - One folder: every image in one library folder.
// - Only the top: just the images directly in the folder.

import type { FolderImport, FolderTree } from '@shared/types'

export interface PlanNode {
  name: string
  /** Images directly in it. */
  images: number
  children: PlanNode[]
}

export type ImportChoice = Exclude<FolderImport, 'ask'>

/** How each choice is stored on the new folder (see FolderSource). */
export const INCLUDE: Record<ImportChoice, 'tree' | 'flat' | 'top'> = { split: 'tree', one: 'flat', top: 'top' }

function keep(tree: FolderTree): PlanNode {
  return { name: tree.name, images: tree.direct, children: tree.children.map(keep) }
}

/**
 * The plan for adding `tree` the chosen way. `picked`: paths of the
 * top-level sub-folders to include (all of them when left out).
 */
export function planImport(tree: FolderTree, choice: ImportChoice, picked?: string[]): PlanNode | null {
  const subs = picked ? tree.children.filter((c) => picked.includes(c.path)) : tree.children
  if (choice === 'top') return tree.direct ? { name: tree.name, images: tree.direct, children: [] } : null
  if (choice === 'one') {
    const images = tree.direct + subs.reduce((a, c) => a + c.total, 0)
    return images ? { name: tree.name, images, children: [] } : null
  }
  if (!tree.direct && !subs.length) return null
  return { name: tree.name, images: tree.direct, children: subs.map(keep) }
}

/** Sub-folders left out of an import: the top-level ones not picked. */
export function skippedPaths(tree: FolderTree, choice: ImportChoice, picked?: string[]): string[] {
  if (choice === 'top' || !picked) return []
  return tree.children.filter((c) => !picked.includes(c.path)).map((c) => c.path)
}

/** How many folders and images a plan makes. */
export function planTotals(node: PlanNode | null): { folders: number; images: number } {
  if (!node) return { folders: 0, images: 0 }
  return node.children.map(planTotals).reduce((a, t) => ({ folders: a.folders + t.folders, images: a.images + t.images }), { folders: 1, images: node.images })
}
