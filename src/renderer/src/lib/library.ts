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
