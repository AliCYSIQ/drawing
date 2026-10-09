import { useMemo, useRef, useState } from 'react'
import type { Board, Folder } from '@shared/types'
import { boardIdsInFolder, boardsIn, childFolders, folderCover, folderLabel, folderPath, resolveBoardIds, searchBoards } from '../lib/library'
import { useApp } from '../store'
import { Close, Folder as FolderIcon } from './Icons'
import { FolderTrail, itemCountLabel, PickBoardChip, PickFolderChip } from './LibraryTiles'
import { Button } from './ui'

/** The folder the picker showed last, so coming back to Practice opens it again. */
let lastFolder: string | undefined

/**
 * Choose what to practice, browsing the library's folders like in Windows:
 * click a folder to pick everything in it (collections added to it later
 * too), double-click it to go inside and pick from its sub-folders and
 * collections. Click a collection to pick it.
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
  /**
   * A double-click arrives as two clicks first (pick, un-pick). What was
   * picked before them is kept, so opening a folder never changes the pick.
   */
  const beforeClicks = useRef<{ at: number; boardIds: string[]; folderIds: string[] } | null>(null)
  const openFolder = (id: string, viaDoubleClick: boolean) => {
    const b = beforeClicks.current
    if (viaDoubleClick && b && Date.now() - b.at < 800) onChange(b.boardIds, b.folderIds)
    beforeClicks.current = null
    open(id)
  }

  const pickedFolders = folderIds.filter((id) => folders.some((f) => f.id === id))
  const pickedBoards = value.filter((id) => boards.some((b) => b.id === id))
  /** Collections already in through a picked folder, and the folder's name. */
  const viaFolder = useMemo(() => {
    const map = new Map<string, string>()
    for (const f of pickedFolders) {
      const name = folders.find((x) => x.id === f)?.name ?? ''
      for (const id of boardIdsInFolder(folders, boards, f)) if (!map.has(id)) map.set(id, name)
    }
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

  /** The picked folder above this one, if any (then this one is in already). */
  const pickedAbove = (f: Folder) => folderPath(folders, f.parentId).find((p) => pickedFolders.includes(p.id))

  const toggleBoard = (id: string) => {
    if (viaFolder.has(id)) return
    onChange(pickedBoards.includes(id) ? pickedBoards.filter((v) => v !== id) : [...pickedBoards, id], pickedFolders)
  }
  const toggleFolder = (f: Folder) => {
    const prev = beforeClicks.current
    if (!prev || Date.now() - prev.at > 800) beforeClicks.current = { at: Date.now(), boardIds: pickedBoards, folderIds: pickedFolders }
    if (pickedAbove(f)) return
    if (pickedFolders.includes(f.id)) return onChange(pickedBoards, pickedFolders.filter((x) => x !== f.id))
    // A picked folder takes over what was picked inside it, one by one or as sub-folders.
    const inside = new Set(boardIdsInFolder(folders, boards, f.id))
    const below = new Set([...folders.filter((x) => folderPath(folders, x.id).some((p) => p.id === f.id)).map((x) => x.id)])
    onChange(
      pickedBoards.filter((b) => !inside.has(b)),
      [...pickedFolders.filter((x) => !below.has(x)), f.id]
    )
  }

  const searching = query.trim() !== ''
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const shownFolders: Folder[] = searching ? folders.filter((f) => words.every((w) => f.name.toLowerCase().includes(w))) : childFolders(folders, here)
  const byName = (a: Board, b: Board) => a.name.localeCompare(b.name, undefined, { numeric: true })
  const shownBoards: Board[] = searching ? searchBoards(boards, query).sort(byName) : boardsIn(boards, here).sort(byName)

  const folderCount = (f: Folder) => itemCountLabel(childFolders(folders, f.id).length, boardsIn(boards, f.id).length)

  return (
    <div className="grid gap-3">
      {(pickedBoards.length > 0 || pickedFolders.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Picked">
          {pickedFolders.map((id) => {
            const f = folders.find((x) => x.id === id)!
            const inside = boardIdsInFolder(folders, boards, id)
            const images = new Set(inside.flatMap((b) => boards.find((x) => x.id === b)!.images.map((i) => i.id))).size
            return (
              <span key={id} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-blue-soft pl-2.5 pr-1 text-[13px] text-blue">
                <FolderIcon size={13} /> {f.name}
                <span className="tnum text-blue/70">
                  · everything inside: {inside.length} {inside.length === 1 ? 'collection' : 'collections'}, {images} images
                </span>
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => toggleFolder(f)} className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-blue/20">
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
          <span className="tnum px-1 text-[12.5px] text-muted">{total} images in all</span>
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
        {!searching && shownFolders.length > 0 && <span className="text-[12.5px] text-muted">Click to pick · double-click a folder to open it</span>}
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
              included={pickedAbove(f)?.name}
              onOpen={(viaDoubleClick) => openFolder(f.id, viaDoubleClick)}
              onPick={() => toggleFolder(f)}
            />
          ))}
        </div>
      )}
      {shownBoards.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(clamp(190px,13vw,260px),1fr))] gap-2.5">
          {shownBoards.map((b) => (
            <div key={b.id}>
              <PickBoardChip
                board={b}
                selected={pickedBoards.includes(b.id) || viaFolder.has(b.id)}
                title={viaFolder.has(b.id) ? `In the picked folder “${viaFolder.get(b.id)}”` : undefined}
                onClick={() => toggleBoard(b.id)}
              />
              {searching && <div className="truncate px-1 pt-1 text-[12px] text-muted">In {folderLabel(folders, b.folderId) || 'Library'}</div>}
            </div>
          ))}
        </div>
      )}
      {searching && !shownFolders.length && !shownBoards.length && <p className="text-muted">Nothing matches “{query}”.</p>}
      {!searching && !shownFolders.length && !shownBoards.length && <p className="text-muted">This folder is empty.</p>}
    </div>
  )
}
