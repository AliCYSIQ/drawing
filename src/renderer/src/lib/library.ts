// Folder logic for the library, kept pure so it can be tested on its own.
// A collection (board) has one home folder (board.folderId; none = top
// level). Other folders can list it in `shortcuts`.

import type { Board, Folder, ImageRef } from '@shared/types'

/** The folders from the top level down to `folderId` (empty at the top). */
export function folderPath(folders: Folder[], folderId?: string): Folder[] {
  const path: Folder[] = []
  const seen = new Set<string>()
  let id = folderId
  while (id && !seen.has(id)) {
    seen.add(id)
    const f = folders.find((x) => x.id === id)
    if (!f) break
    path.unshift(f)
    id = f.parentId
  }
  return path
}

export function childFolders(folders: Folder[], parentId?: string): Folder[] {
  return folders.filter((f) => f.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name))
}

/** Collections whose home is this folder. */
export function boardsIn(boards: Board[], folderId?: string): Board[] {
  return boards.filter((b) => b.folderId === folderId)
}

/** Collections shown in this folder as shortcuts (still existing, and not already at home here). */
export function shortcutsIn(folders: Folder[], boards: Board[], folderId?: string): Board[] {
  const folder = folders.find((f) => f.id === folderId)
  if (!folder) return []
  return folder.shortcuts
    .map((id) => boards.find((b) => b.id === id))
    .filter((b): b is Board => !!b && b.folderId !== folderId)
}

/** This folder and every folder inside it. */
export function descendantIds(folders: Folder[], folderId: string): Set<string> {
  const out = new Set([folderId])
  let grew = true
  while (grew) {
    grew = false
    for (const f of folders) {
      if (f.parentId && out.has(f.parentId) && !out.has(f.id)) {
        out.add(f.id)
        grew = true
      }
    }
  }
  return out
}

/** Every collection whose home is in this folder or below it. */
export function boardsBelow(folders: Folder[], boards: Board[], folderId: string): Board[] {
  const ids = descendantIds(folders, folderId)
  return boards.filter((b) => b.folderId && ids.has(b.folderId))
}

/** A few images for a folder's cover, taken from the collections inside it (shortcuts included). */
export function folderCover(folders: Folder[], boards: Board[], folderId: string, count = 3): ImageRef[] {
  return [...boardsBelow(folders, boards, folderId), ...shortcutsIn(folders, boards, folderId)]
    .flatMap((b) => b.images.slice(0, count))
    .slice(0, count)
}

/** How many things a folder holds: its sub-folders, collections and shortcuts (at its own level). */
export function folderItemCount(folders: Folder[], boards: Board[], folderId: string): number {
  return childFolders(folders, folderId).length + boardsIn(boards, folderId).length + shortcutsIn(folders, boards, folderId).length
}

/** Where a folder may move to: anywhere except itself and its own sub-folders. */
export function canMoveFolder(folders: Folder[], folderId: string, newParentId?: string): boolean {
  return !newParentId || !descendantIds(folders, folderId).has(newParentId)
}

/**
 * Delete a folder without deleting anything in it: its folders and
 * collections move up to its parent, and shortcuts to it are dropped.
 */
export function deleteFolder(folders: Folder[], boards: Board[], folderId: string): { folders: Folder[]; boards: Board[] } {
  const folder = folders.find((f) => f.id === folderId)
  if (!folder) return { folders, boards }
  const parent = folder.parentId
  return {
    folders: folders
      .filter((f) => f.id !== folderId)
      .map((f) => (f.parentId === folderId ? { ...f, parentId: parent } : f)),
    boards: boards.map((b) => (b.folderId === folderId ? { ...b, folderId: parent } : b))
  }
}

/** Remove a deleted collection from every folder's shortcuts. */
export function dropShortcuts(folders: Folder[], boardId: string): Folder[] {
  return folders.map((f) => (f.shortcuts.includes(boardId) ? { ...f, shortcuts: f.shortcuts.filter((s) => s !== boardId) } : f))
}

/** Folders that show this collection as a shortcut. */
export function foldersWithShortcut(folders: Folder[], boardId: string): Folder[] {
  return folders.filter((f) => f.shortcuts.includes(boardId))
}

/** Name or tag matches every word of the query. */
export function searchBoards(boards: Board[], query: string): Board[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return boards
  return boards.filter((b) => {
    const text = `${b.name} ${b.tags.join(' ')}`.toLowerCase()
    return words.every((w) => text.includes(w))
  })
}

/** "Human / Hands" style label for a folder, or "" at the top level. */
export function folderLabel(folders: Folder[], folderId?: string): string {
  return folderPath(folders, folderId)
    .map((f) => f.name)
    .join(' / ')
}

// ---------------------------------------------------------------------------
// File-manager operations (v0.2.5): select, move, copy, shortcuts, delete.
// Every operation takes the library as it is and returns the new one, so the
// page can keep the old one for Undo.

/** The library parts these operations change. */
export interface Lib {
  boards: Board[]
  folders: Folder[]
}

/** One thing in a folder view: a folder, a collection, or a shortcut to a collection (in folderId). */
export type Item =
  | { type: 'folder'; id: string }
  | { type: 'board'; id: string }
  | { type: 'shortcut'; id: string; folderId: string }

export function itemKey(item: Item): string {
  return item.type === 'shortcut' ? `s:${item.folderId}:${item.id}` : `${item.type === 'folder' ? 'f' : 'b'}:${item.id}`
}

export function parseItemKey(key: string): Item | null {
  const [t, a, b] = key.split(':')
  if (t === 'f' && a) return { type: 'folder', id: a }
  if (t === 'b' && a) return { type: 'board', id: a }
  if (t === 's' && a && b) return { type: 'shortcut', folderId: a, id: b }
  return null
}

/** Which kind of move a drop or paste makes. */
export type Transfer = 'move' | 'copy' | 'shortcut'

/** Why an item can't go to a folder, or null when it can. */
export function cannotTransfer(lib: Lib, item: Item, target: string | undefined, op: Transfer): string | null {
  if (item.type === 'folder') {
    if (op === 'shortcut') return 'Folders can’t have shortcuts.'
    if (target && descendantIds(lib.folders, item.id).has(target)) {
      if (op === 'move') return 'A folder can’t go inside itself.'
      if (target === item.id || op === 'copy') return 'A folder can’t be copied into itself.'
    }
    if (op === 'move' && lib.folders.find((f) => f.id === item.id)?.parentId === target) return 'It is already there.'
    return null
  }
  if (!target && (op === 'shortcut' || item.type === 'shortcut')) return 'Shortcuts go in folders, not the top level.'
  if (op === 'move') {
    const home = item.type === 'board' ? lib.boards.find((b) => b.id === item.id)?.folderId : item.folderId
    if (home === target) return 'It is already there.'
  }
  return null
}

/** Move items into a folder (undefined = top level). Things that can't go there are left alone. */
export function moveItems(lib: Lib, items: Item[], target: string | undefined): Lib {
  let { boards, folders } = lib
  for (const item of items) {
    if (cannotTransfer({ boards, folders }, item, target, 'move')) continue
    if (item.type === 'folder') {
      folders = folders.map((f) => (f.id === item.id ? { ...f, parentId: target } : f))
    } else if (item.type === 'board') {
      boards = boards.map((b) => (b.id === item.id ? { ...b, folderId: target } : b))
      // A shortcut in its new home would be a duplicate.
      if (target) folders = setShortcut(folders, target, item.id, false)
    } else {
      // Moving a shortcut moves the shortcut, not the collection.
      folders = setShortcut(folders, item.folderId, item.id, false)
      const home = boards.find((b) => b.id === item.id)?.folderId
      if (target && target !== home) folders = setShortcut(folders, target, item.id, true)
    }
  }
  return { boards, folders }
}

function setShortcut(folders: Folder[], folderId: string, boardId: string, on: boolean): Folder[] {
  return folders.map((f) =>
    f.id !== folderId
      ? f
      : { ...f, shortcuts: on ? [...new Set([...f.shortcuts, boardId])] : f.shortcuts.filter((x) => x !== boardId) }
  )
}

/** Show collections in a folder as shortcuts (folders and their own home are skipped). */
export function addShortcuts(lib: Lib, items: Item[], target: string | undefined): Lib {
  if (!target) return lib
  let folders = lib.folders
  for (const item of items) {
    if (cannotTransfer(lib, item, target, 'shortcut')) continue
    const home = lib.boards.find((b) => b.id === item.id)?.folderId
    if (home !== target) folders = setShortcut(folders, target, item.id, true)
  }
  return { ...lib, folders }
}

/** A name that isn't taken among `taken`: "Hands", "Hands (copy)", "Hands (copy 2)"… */
export function copyName(name: string, taken: string[]): string {
  const used = new Set(taken.map((t) => t.toLowerCase()))
  if (!used.has(name.toLowerCase())) return name
  for (let n = 1; ; n++) {
    const next = n === 1 ? `${name} (copy)` : `${name} (copy ${n})`
    if (!used.has(next.toLowerCase())) return next
  }
}

/** A collection copy that still needs its image files copied (pasted and Pinterest images live in the app). */
export interface FileCopy {
  from: string
  to: string
}

/**
 * Copy items into a folder. A collection copy is a new, independent
 * collection with the same images; a folder copy copies everything inside
 * it; copying a shortcut makes another shortcut. `newId` makes ids (tests
 * pass a counter). Returns the new library and the image files to copy.
 */
export function copyItems(lib: Lib, items: Item[], target: string | undefined, newId: () => string, now = Date.now()): Lib & { files: FileCopy[]; made: Item[] } {
  let boards = lib.boards.slice()
  let folders = lib.folders.slice()
  const files: FileCopy[] = []
  const made: Item[] = []
  const namesIn = (folderId?: string) => [
    ...boards.filter((b) => b.folderId === folderId).map((b) => b.name),
    ...folders.filter((f) => f.parentId === folderId).map((f) => f.name)
  ]

  const copyBoard = (b: Board, into: string | undefined, rename: boolean): Board => {
    const copy: Board = { ...b, id: newId(), folderId: into, name: rename ? copyName(b.name, namesIn(into)) : b.name, createdAt: now, images: b.images.slice() }
    boards.push(copy)
    files.push({ from: b.id, to: copy.id })
    return copy
  }

  const copyFolder = (src: Folder, into: string | undefined, rename: boolean, map: Map<string, string>): Folder => {
    const copy: Folder = { ...src, id: newId(), parentId: into, name: rename ? copyName(src.name, namesIn(into)) : src.name, createdAt: now, shortcuts: src.shortcuts.slice() }
    map.set(src.id, copy.id)
    folders.push(copy)
    for (const b of lib.boards.filter((x) => x.folderId === src.id)) map.set(b.id, copyBoard(b, copy.id, false).id)
    for (const child of lib.folders.filter((f) => f.parentId === src.id)) copyFolder(child, copy.id, false, map)
    return copy
  }

  for (const item of items) {
    if (cannotTransfer({ boards, folders }, item, target, 'copy')) continue
    if (item.type === 'board') {
      const b = lib.boards.find((x) => x.id === item.id)
      if (b) made.push({ type: 'board', id: copyBoard(b, target, true).id })
    } else if (item.type === 'shortcut') {
      const before = folders
      folders = addShortcuts({ boards, folders }, [item], target).folders
      if (folders !== before && target) made.push({ type: 'shortcut', id: item.id, folderId: target })
    } else {
      const src = lib.folders.find((f) => f.id === item.id)
      if (!src) continue
      const map = new Map<string, string>()
      const copy = copyFolder(src, target, true, map)
      made.push({ type: 'folder', id: copy.id })
      // Shortcuts to collections that were copied too point at the copies.
      const copied = new Set(map.values())
      folders = folders.map((f) => (copied.has(f.id) ? { ...f, shortcuts: f.shortcuts.map((s) => map.get(s) ?? s) } : f))
    }
  }
  boards = boards.slice()
  return { boards, folders, files, made }
}

/**
 * Delete items. A folder either keeps what's inside (it moves up a level)
 * or takes everything inside with it. Returns the ids of deleted collections,
 * whose stored image files can be removed once Undo is no longer possible.
 */
export function deleteItems(lib: Lib, items: Item[], folderMode: 'keep' | 'all'): Lib & { deletedBoards: string[] } {
  let { boards, folders } = lib
  const gone = new Set<string>()
  for (const item of items) {
    if (item.type === 'shortcut') {
      folders = setShortcut(folders, item.folderId, item.id, false)
    } else if (item.type === 'board') {
      gone.add(item.id)
    } else if (folderMode === 'keep') {
      ;({ folders, boards } = deleteFolder(folders, boards, item.id))
    } else {
      const ids = descendantIds(folders, item.id)
      for (const b of boards) if (b.folderId && ids.has(b.folderId)) gone.add(b.id)
      folders = folders.filter((f) => !ids.has(f.id))
    }
  }
  boards = boards.filter((b) => !gone.has(b.id))
  for (const id of gone) folders = dropShortcuts(folders, id)
  return { boards, folders, deletedBoards: [...gone] }
}

/** What deleting these items would remove, for the confirmation. */
export function deleteSummary(lib: Lib, items: Item[]): { folders: number; boards: number; inside: number; shortcuts: number } {
  let inside = 0
  for (const item of items) {
    if (item.type !== 'folder') continue
    const ids = descendantIds(lib.folders, item.id)
    inside += lib.boards.filter((b) => b.folderId && ids.has(b.folderId)).length + ids.size - 1
  }
  return {
    folders: items.filter((i) => i.type === 'folder').length,
    boards: items.filter((i) => i.type === 'board').length,
    shortcuts: items.filter((i) => i.type === 'shortcut').length,
    inside
  }
}

/** Every collection a folder holds, deeper folders and shortcuts included (for practicing a whole folder). */
export function boardIdsInFolder(folders: Folder[], boards: Board[], folderId: string): string[] {
  const ids = descendantIds(folders, folderId)
  const out = new Set<string>()
  for (const b of boards) if (b.folderId && ids.has(b.folderId)) out.add(b.id)
  for (const f of folders) if (ids.has(f.id)) for (const s of f.shortcuts) if (boards.some((b) => b.id === s)) out.add(s)
  return [...out]
}

/** The collections a plan practices: the ones picked, plus everything in the picked folders. */
export function resolveBoardIds(lib: Lib, boardIds: string[], folderIds: string[] = []): string[] {
  const out = new Set(boardIds.filter((id) => lib.boards.some((b) => b.id === id)))
  for (const f of folderIds) if (lib.folders.some((x) => x.id === f)) for (const id of boardIdsInFolder(lib.folders, lib.boards, f)) out.add(id)
  return [...out]
}

export type SortKey = 'name' | 'added' | 'practiced' | 'size'

/**
 * Order for a folder view. Folders always come first (as in Windows), then
 * collections; both by the chosen key. `practiced` maps collection id → last
 * session time; `size` is the image count (folders: how many things they hold).
 */
export function sortItems<T extends { name: string; createdAt: number; id: string }>(
  list: T[],
  key: SortKey,
  size: (x: T) => number,
  practiced: (x: T) => number
): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  const by: Record<SortKey, (a: T, b: T) => number> = {
    name: byName,
    added: (a, b) => b.createdAt - a.createdAt || byName(a, b),
    practiced: (a, b) => practiced(b) - practiced(a) || byName(a, b),
    size: (a, b) => size(b) - size(a) || byName(a, b)
  }
  return list.slice().sort(by[key])
}

/** When each collection was last practiced. */
export function lastPracticed(sessions: { startedAt: number; plan: { boardIds: string[] } }[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const s of sessions) for (const id of s.plan.boardIds) out.set(id, Math.max(out.get(id) ?? 0, s.startedAt))
  return out
}
