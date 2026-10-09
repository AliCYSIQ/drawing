import { useMemo, useState } from 'react'
import type { Board, Folder } from '@shared/types'
import {
  boardIdsInFolder,
  boardsIn,
  childFolders,
  folderCover,
  folderLabel,
  resolveBoardIds,
  searchBoards,
  shortcutsIn
} from '../lib/library'
import { useApp } from '../store'
import { Close, Folder as FolderIcon } from './Icons'
import { FolderTrail, itemCountLabel, PickBoardChip, PickFolderChip } from './LibraryTiles'
import { Button } from './ui'

/** The folder the picker showed last, so coming back to Practice opens it again. */
let lastFolder: string | undefined

/**
 * Choose what to practice, browsing the library's folders like the Library
 * does. Click a folder to open it; tick it to practice everything inside
 * (collections added to it later too). Click a collection to pick it.
 */
export function BoardPicker({
  value,
  folderIds = [],
  onChange
}: {
  value: string[]
  folderIds?: string[]
  onChange: (boardIds: string[], folderIds: string[]) => void
}) {
  const boards = useApp((s) => s.boards)
  const folders = useApp((s) => s.library.folders)
  const go = useApp((s) => s.go)
  const [query, setQuery] = useState('')
  const [here, setHere] = useState<string | undefined>(() => (lastFolder && folders.some((f) => f.id === lastFolder) ? lastFolder : undefined))
  const open = (id?: string) => {
    lastFolder = id
    setHere(id)
    setQuery('')
  }

  const pickedFolders = folderIds.filter((id) => folders.some((f) => f.id === id))
  const pickedBoards = value.filter((id) => boards.some((b) => b.id === id))
  /** Collections already in through a picked folder, and which folder. */
  const viaFolder = useMemo(() => {
    const map = new Map<string, string>()
    for (const f of pickedFolders) for (const id of boardIdsInFolder(folders, boards, f)) if (!map.has(id)) map.set(id, f)
    return map
  }, [pickedFolders, folders, boards])
  const total = useMemo(
    () => new Set(resolveBoardIds({ boards, folders }, pickedBoards, pickedFolders).flatMap((id) => boards.find((b) => b.id === id)!.images.map((i) => i.id))).size,
    [boards, folders, pickedBoards, pickedFolders]
  )

  if (!boards.length) {
    return (
      <div className="rounded-md border border-dashed border-line px-4 py-5 text-muted">
        No references yet.{' '}
        <Button tone="ghost" className="h-7 px-2 text-blue" onClick={() => go({ name: 'library' })}>
          Add a folder or Pinterest board
        </Button>
      </div>
    )
  }

  const toggleBoard = (id: string) => {
    if (viaFolder.has(id)) return
    onChange(pickedBoards.includes(id) ? pickedBoards.filter((v) => v !== id) : [...pickedBoards, id], pickedFolders)
  }
  const toggleFolder = (id: string) => {
    if (pickedFolders.includes(id)) return onChange(pickedBoards, pickedFolders.filter((f) => f !== id))
    // Picking a folder takes over the collections inside it that were picked one by one.
    const inside = new Set(boardIdsInFolder(folders, boards, id))
    onChange(pickedBoards.filter((b) => !inside.has(b)), [...pickedFolders, id])
  }

  const searching = query.trim() !== ''
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const shownFolders: Folder[] = searching ? folders.filter((f) => words.every((w) => f.name.toLowerCase().includes(w))) : childFolders(folders, here)
  const byName = (a: Board, b: Board) => a.name.localeCompare(b.name, undefined, { numeric: true })
  const shownBoards: Board[] = searching ? searchBoards(boards, query).sort(byName) : boardsIn(boards, here).sort(byName)
  const shortcuts: Board[] = searching ? [] : shortcutsIn(folders, boards, here).sort(byName)

  const folderCount = (f: Folder) =>
    itemCountLabel(childFolders(folders, f.id).length, boardsIn(boards, f.id).length + shortcutsIn(folders, boards, f.id).length)

  const chip = (b: Board, shortcut = false) => (
    <div key={`${shortcut ? 's' : 'b'}-${b.id}`} title={viaFolder.has(b.id) ? `In the picked folder “${folders.find((f) => f.id === viaFolder.get(b.id))?.name}”` : undefined}>
      <PickBoardChip board={b} shortcut={shortcut} selected={pickedBoards.includes(b.id) || viaFolder.has(b.id)} onClick={() => toggleBoard(b.id)} />
      {searching && <div className="truncate px-1 pt-1 text-[12px] text-muted">In {folderLabel(folders, b.folderId) || 'Library'}</div>}
    </div>
  )

  return (
    <div className="grid gap-3">
      {(pickedBoards.length > 0 || pickedFolders.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Picked">
          {pickedFolders.map((id) => {
            const f = folders.find((x) => x.id === id)!
            return (
              <span key={id} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-blue-soft pl-2.5 pr-1 text-[13px] text-blue">
                <FolderIcon size={13} /> {f.name}
                <span className="text-blue/70">· everything inside</span>
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => toggleFolder(id)} className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-blue/20">
                  <Close size={11} />
                </button>
              </span>
            )
          })}
          {pickedBoards.map((id) => {
            const b = boards.find((x) => x.id === id)!
            return (
              <span key={id} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-raised pl-2.5 pr-1 text-[13px] text-ink">
                {b.name}
                <span className="tnum text-muted">{b.images.length}</span>
                <button type="button" aria-label={`Remove ${b.name}`} onClick={() => toggleBoard(id)} className="flex h-5 w-5 items-center justify-center rounded-full text-muted hover:bg-line hover:text-ink">
                  <Close size={11} />
                </button>
              </span>
            )
          })}
          <span className="tnum px-1 text-[12.5px] text-muted">{total} images</span>
          <button type="button" onClick={() => onChange([], [])} className="px-1 text-[12.5px] text-muted hover:text-ink">
            Clear
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          aria-label="Search collections"
          value={query}
          placeholder="Search collections and folders"
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 w-64 rounded-full bg-surface px-3.5 text-[13px] text-ink outline-none ring-1 ring-line placeholder:text-muted/70 focus:ring-blue"
        />
        {!searching && folders.length > 0 && <FolderTrail folderId={here} onOpen={open} />}
      </div>
      {shownFolders.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(clamp(150px,10vw,200px),1fr))] gap-2.5">
          {shownFolders.map((f) => (
            <PickFolderChip
              key={f.id}
              folder={f}
              cover={folderCover(folders, boards, f.id)}
              count={folderCount(f)}
              picked={pickedFolders.includes(f.id)}
              onOpen={() => open(f.id)}
              onPick={() => toggleFolder(f.id)}
            />
          ))}
        </div>
      )}
      {(shownBoards.length > 0 || shortcuts.length > 0) && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(clamp(190px,13vw,260px),1fr))] gap-2.5">
          {shownBoards.map((b) => chip(b))}
          {shortcuts.map((b) => chip(b, true))}
        </div>
      )}
      {searching && !shownFolders.length && !shownBoards.length && <p className="text-muted">Nothing matches “{query}”.</p>}
      {!searching && !shownFolders.length && !shownBoards.length && !shortcuts.length && <p className="text-muted">This folder is empty.</p>}
    </div>
  )
}
