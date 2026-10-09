// The library as a file manager: folders and collections you can select,
// move, copy, make shortcuts of, rename and delete, like files in Windows.
//
// - Click opens. Ctrl+click, Shift+click or the corner check selects; while
//   something is selected, clicks add to the selection.
// - Drag onto a folder (or a part of the folder path) moves; hold Ctrl to
//   copy, Alt to make a shortcut. Hovering a folder while dragging opens it.
// - Right-click for every action. Keys: Ctrl+A, Esc, Delete, F2, Enter,
//   Ctrl+X / Ctrl+C / Ctrl+V, Ctrl+Z, Backspace (up a folder).
// - Every change can be undone (Ctrl+Z, or Undo on the message).

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Board, Folder } from '@shared/types'
import {
  addShortcuts,
  boardsBelow,
  boardsIn,
  cannotTransfer,
  childFolders,
  copyItems,
  deleteItems,
  deleteSummary,
  folderCover,
  folderLabel,
  itemKey,
  lastPracticed,
  moveItems,
  parseItemKey,
  shortcutsIn,
  sortItems,
  type FileCopy,
  type Item,
  type SortKey,
  type Transfer
} from '../lib/library'
import { uid, useApp } from '../store'
import { SEPARATOR, useContextMenu, type MenuEntry } from './ContextMenu'
import { FolderDialog } from './FolderDialog'
import { Close, Copy, Folder as FolderIcon, Move, Shortcut, Star, Trash } from './Icons'
import { FolderArt, FolderTrail, itemCountLabel, KIND_LABEL, Mosaic, RenameField, TileCheck, useSpringOpen } from './LibraryTiles'
import { Button } from './ui'

const DRAG_TYPE = 'application/x-drawing-items'

/** What a folder tile or folder-path part needs to take drops. */
export interface DropProps {
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  'data-drop': 'yes' | 'no' | undefined
}
/** What is being dragged; kept here too because a folder that opens mid-drag replaces the tiles. */
let dragging: Item[] | null = null

const OP_LABEL: Record<Transfer, string> = { move: 'Move to', copy: 'Copy to', shortcut: 'Shortcut in' }

function opFrom(e: React.DragEvent | React.KeyboardEvent | KeyboardEvent): Transfer {
  return e.ctrlKey || e.metaKey ? 'copy' : e.altKey ? 'shortcut' : 'move'
}

export function FolderBrowser({
  folderId,
  results,
  empty
}: {
  folderId?: string
  /** Search results to show instead of the folder (collections and folders from anywhere). */
  results?: { folders: Folder[]; boards: Board[] }
  /** Shown when the folder has nothing in it. */
  empty: React.ReactNode
}) {
  const boards = useApp((s) => s.boards)
  const folders = useApp((s) => s.library.folders)
  const sessions = useApp((s) => s.sessions)
  const sort = useApp((s) => s.settings.librarySort ?? 'name')
  const clipboard = useApp((s) => s.clipboard)
  const go = useApp((s) => s.go)
  const notify = useApp((s) => s.notify)
  const changeLibrary = useApp((s) => s.changeLibrary)
  const setClipboard = useApp((s) => s.setClipboard)
  const updateBoard = useApp((s) => s.updateBoard)

  const [selected, setSelected] = useState<string[]>([])
  const anchor = useRef<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ op: Transfer; items: Item[] } | null>(null)
  const [confirm, setConfirm] = useState<Item[] | null>(null)
  const [drop, setDrop] = useState<{ key: string; op: Transfer; ok: boolean } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const { open: openMenu, menu } = useContextMenu()

  const practiced = useMemo(() => lastPracticed(sessions), [sessions])

  // What this view shows, in order: folders first, then collections, then shortcuts.
  const view = useMemo(() => {
    const sortFolders = (list: Folder[]) =>
      sortItems(
        list,
        sort as SortKey,
        (f) => childFolders(folders, f.id).length + boardsIn(boards, f.id).length,
        (f) => Math.max(0, ...boardsBelow(folders, boards, f.id).map((b) => practiced.get(b.id) ?? 0))
      )
    const sortBoards = (list: Board[]) =>
      sortItems(list, sort as SortKey, (b) => b.images.length, (b) => practiced.get(b.id) ?? 0)
    if (results) {
      return {
        folders: sortFolders(results.folders),
        boards: sortBoards(results.boards),
        shortcuts: [] as Board[]
      }
    }
    return {
      folders: sortFolders(childFolders(folders, folderId)),
      boards: sortBoards(boardsIn(boards, folderId)),
      shortcuts: sortBoards(shortcutsIn(folders, boards, folderId))
    }
  }, [results, folders, boards, folderId, sort, practiced])

  const items: Item[] = useMemo(
    () => [
      ...view.folders.map((f) => ({ type: 'folder' as const, id: f.id })),
      ...view.boards.map((b) => ({ type: 'board' as const, id: b.id })),
      ...(folderId ? view.shortcuts.map((b) => ({ type: 'shortcut' as const, id: b.id, folderId })) : [])
    ],
    [view, folderId]
  )
  const order = items.map(itemKey)
  const selectedItems = selected.map(parseItemKey).filter((x): x is Item => !!x)
  const selecting = selected.length > 0
  const cutKeys = new Set(clipboard?.op === 'cut' ? clipboard.items.map(itemKey) : [])

  // Keep the selection to what is still here (after a move or delete).
  useEffect(() => {
    setSelected((sel) => {
      const next = sel.filter((k) => order.includes(k))
      return next.length === sel.length ? sel : next
    })
    // order is derived from items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  const nameOf = (item: Item) =>
    item.type === 'folder' ? (folders.find((f) => f.id === item.id)?.name ?? 'Folder') : (boards.find((b) => b.id === item.id)?.name ?? 'Collection')
  const placeName = (target?: string) => (target ? `“${folders.find((f) => f.id === target)?.name ?? 'folder'}”` : 'the top level')
  const describe = (list: Item[]) => {
    if (list.length === 1) return `“${nameOf(list[0])}”`
    const f = list.filter((i) => i.type === 'folder').length
    const parts = [f && `${f} ${f === 1 ? 'folder' : 'folders'}`, list.length - f && `${list.length - f} ${list.length - f === 1 ? 'collection' : 'collections'}`]
    return parts.filter(Boolean).join(' and ')
  }

  const open = (item: Item) => {
    if (item.type === 'folder') go({ name: 'library', folderId: item.id })
    else go({ name: 'library', boardId: item.id })
  }

  // ----- actions -----

  const copyFiles = async (files: FileCopy[]) => {
    for (const { from, to } of files) {
      const b = useApp.getState().boards.find((x) => x.id === to)
      if (!b || (b.kind !== 'collection' && b.kind !== 'pinterest')) continue
      const images = await window.api.duplicateBoardFiles(from, to, b.images)
      if (useApp.getState().boards.some((x) => x.id === to)) updateBoard(to, { images })
    }
  }

  const transfer = (op: Transfer, list: Item[], target: string | undefined) => {
    const lib = { boards: useApp.getState().boards, folders: useApp.getState().library.folders }
    const can = list.filter((it) => !cannotTransfer(lib, it, target, op))
    if (!can.length) return notify(cannotTransfer(lib, list[0], target, op) ?? 'Nothing to do.')
    if (op === 'move') {
      changeLibrary('move', (l) => moveItems(l, can, target), `Moved ${describe(can)} to ${placeName(target)}.`)
    } else if (op === 'shortcut') {
      changeLibrary('shortcut', (l) => addShortcuts(l, can, target), `Added ${can.length === 1 ? 'a shortcut' : `${can.length} shortcuts`} in ${placeName(target)}.`)
    } else {
      let files: FileCopy[] = []
      changeLibrary(
        'copy',
        (l) => {
          const out = copyItems(l, can, target, uid)
          files = out.files
          return out
        },
        `Copied ${describe(can)} to ${placeName(target)}.`
      )
      void copyFiles(files)
    }
    setSelected([])
  }

  const remove = (list: Item[]) => {
    if (!list.length) return
    if (list.some((i) => i.type === 'folder')) return setConfirm(list)
    const onlyShortcuts = list.every((i) => i.type === 'shortcut')
    changeLibrary(
      'delete',
      (l) => deleteItems(l, list, 'keep'),
      onlyShortcuts ? `Removed ${list.length === 1 ? 'the shortcut' : `${list.length} shortcuts`}.` : `Deleted ${describe(list)}.`
    )
    setSelected([])
  }

  const rename = (item: Item, name: string | null) => {
    setRenaming(null)
    if (!name) return
    if (item.type === 'folder') {
      changeLibrary('rename', (l) => ({ ...l, folders: l.folders.map((f) => (f.id === item.id ? { ...f, name } : f)) }))
    } else {
      changeLibrary('rename', (l) => ({ ...l, boards: l.boards.map((b) => (b.id === item.id ? { ...b, name } : b)) }))
    }
  }

  const cut = (list: Item[]) => {
    if (!list.length) return
    setClipboard({ op: 'cut', items: list })
    notify(`Cut ${describe(list)}. Open a folder and paste (Ctrl+V).`)
  }
  const copy = (list: Item[]) => {
    if (!list.length) return
    setClipboard({ op: 'copy', items: list })
    notify(`Copied ${describe(list)}. Open a folder and paste (Ctrl+V).`)
  }
  const paste = (asShortcut = false) => {
    if (!clipboard || results) return
    const lib = useApp.getState()
    const still = clipboard.items.filter((i) =>
      i.type === 'folder' ? lib.library.folders.some((f) => f.id === i.id) : lib.boards.some((b) => b.id === i.id)
    )
    if (!still.length) return setClipboard(null)
    transfer(asShortcut ? 'shortcut' : clipboard.op === 'cut' ? 'move' : 'copy', still, folderId)
    if (clipboard.op === 'cut' && !asShortcut) setClipboard(null)
  }

  const toggle = (key: string) => {
    anchor.current = key
    setSelected((sel) => (sel.includes(key) ? sel.filter((k) => k !== key) : [...sel, key]))
  }

  const click = (item: Item, e: React.MouseEvent) => {
    const key = itemKey(item)
    if (e.shiftKey && anchor.current && order.includes(anchor.current)) {
      const [a, b] = [order.indexOf(anchor.current), order.indexOf(key)].sort((x, y) => x - y)
      const range = order.slice(a, b + 1)
      setSelected((sel) => (e.ctrlKey ? [...new Set([...sel, ...range])] : range))
    } else if (e.ctrlKey || e.metaKey || selecting) {
      toggle(key)
    } else {
      open(item)
    }
  }

  // ----- menus -----

  const itemMenu = (item: Item, e: React.MouseEvent) => {
    const key = itemKey(item)
    const list = selected.includes(key) ? selectedItems : [item]
    if (!selected.includes(key)) setSelected([key])
    const single = list.length === 1 ? list[0] : null
    const hasBoards = list.some((i) => i.type !== 'folder')
    const board = single && single.type !== 'folder' ? boards.find((b) => b.id === single.id) : null
    const entries: MenuEntry[] = [
      ...(single ? [{ label: 'Open', hint: 'Enter', onClick: () => open(single) }] : []),
      ...(single ? [{ label: single.type === 'shortcut' ? 'Rename the collection' : 'Rename', hint: 'F2', onClick: () => setRenaming(itemKey(single)) }] : []),
      ...(single?.type === 'shortcut' && board
        ? [{ label: `Show where it lives (${folderLabel(folders, board.folderId) || 'Library'})`, onClick: () => go({ name: 'library', folderId: board.folderId }) }]
        : []),
      SEPARATOR,
      { label: 'Move to…', icon: <Move size={14} />, onClick: () => setDialog({ op: 'move', items: list }) },
      { label: 'Copy to…', icon: <Copy size={14} />, onClick: () => setDialog({ op: 'copy', items: list }) },
      ...(hasBoards ? [{ label: 'Add shortcut in…', icon: <Shortcut size={14} />, onClick: () => setDialog({ op: 'shortcut', items: list }) }] : []),
      SEPARATOR,
      { label: 'Cut', hint: 'Ctrl+X', onClick: () => cut(list) },
      { label: 'Copy', hint: 'Ctrl+C', onClick: () => copy(list) },
      ...(board
        ? [SEPARATOR, { label: board.favorite ? 'Remove from favorites' : 'Add to favorites', icon: <Star size={14} filled={board.favorite} />, onClick: () => updateBoard(board.id, { favorite: !board.favorite }) }]
        : []),
      SEPARATOR,
      {
        label: list.every((i) => i.type === 'shortcut') ? 'Remove shortcut' : 'Delete…',
        hint: 'Del',
        danger: true,
        icon: <Trash size={14} />,
        onClick: () => remove(list)
      }
    ]
    openMenu(e, tidy(entries))
  }

  const backgroundMenu = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return
    setSelected([])
    const hasBoards = clipboard?.items.some((i) => i.type !== 'folder')
    openMenu(
      e,
      tidy([
        ...(clipboard && !results
          ? [
              { label: clipboard.op === 'cut' ? `Paste (move ${clipboard.items.length})` : `Paste (copy ${clipboard.items.length})`, hint: 'Ctrl+V', onClick: () => paste() },
              ...(hasBoards && folderId ? [{ label: 'Paste shortcut', onClick: () => paste(true) }] : []),
              SEPARATOR
            ]
          : []),
        { label: 'Select all', hint: 'Ctrl+A', onClick: () => setSelected(order) }
      ])
    )
  }

  // ----- keys -----

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return
      if (dialog || confirm || renaming) return
      const k = e.key.toLowerCase()
      const ctrl = e.ctrlKey || e.metaKey
      const single = selectedItems.length === 1 ? selectedItems[0] : null
      if (ctrl && k === 'a') {
        e.preventDefault()
        setSelected(order)
      } else if (e.key === 'Escape' && selecting) {
        setSelected([])
      } else if (e.key === 'Delete') {
        remove(selectedItems)
      } else if (e.key === 'F2' && single) {
        setRenaming(itemKey(single))
      } else if (e.key === 'Enter' && single && t === document.body) {
        open(single)
      } else if (ctrl && k === 'x') {
        cut(selectedItems)
      } else if (ctrl && k === 'c') {
        copy(selectedItems)
      } else if (ctrl && k === 'v') {
        paste(e.shiftKey)
      } else if (ctrl && k === 'z') {
        e.preventDefault()
        useApp.getState().undoLibrary()
      } else if ((e.key === 'Backspace' || (e.altKey && e.key === 'ArrowLeft')) && folderId && !results) {
        go({ name: 'library', folderId: folders.find((f) => f.id === folderId)?.parentId })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ----- drag and drop -----

  useEffect(() => {
    const end = () => {
      dragging = null
      setIsDragging(false)
      setDrop(null)
    }
    window.addEventListener('dragend', end)
    window.addEventListener('drop', end)
    // A folder opened mid-drag: this view is new, the drag goes on.
    if (dragging) setIsDragging(true)
    return () => {
      window.removeEventListener('dragend', end)
      window.removeEventListener('drop', end)
    }
  }, [])

  const dragProps = (item: Item) => ({
    draggable: renaming !== itemKey(item),
    onDragStart: (e: React.DragEvent) => {
      const key = itemKey(item)
      const keys = selected.includes(key) ? selected : [key]
      if (!selected.includes(key)) setSelected([key])
      dragging = keys.map(parseItemKey).filter((x): x is Item => !!x)
      e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(keys))
      e.dataTransfer.effectAllowed = 'all'
      const ghost = document.createElement('div')
      ghost.textContent = keys.length === 1 ? nameOf(dragging[0]) : `${keys.length} items`
      ghost.style.cssText =
        'position:fixed;top:-100px;left:0;padding:6px 10px;border-radius:6px;background:#86b6e6;color:#1d1e20;font:600 13px system-ui'
      document.body.appendChild(ghost)
      e.dataTransfer.setDragImage(ghost, -8, -8)
      setTimeout(() => ghost.remove())
      setIsDragging(true)
    }
  })

  /** Folder tiles and folder-path parts take drops. */
  const dropProps = (target: string | undefined): DropProps => {
    const key = target ?? 'top'
    const check = (e: React.DragEvent) => {
      if (!dragging) return null
      const op = opFrom(e)
      const lib = { boards: useApp.getState().boards, folders: useApp.getState().library.folders }
      const ok = dragging.some((it) => !cannotTransfer(lib, it, target, op))
      return { op, ok }
    }
    return {
      onDragOver: (e: React.DragEvent) => {
        const c = check(e)
        if (!c) return
        if (c.ok) e.preventDefault()
        e.dataTransfer.dropEffect = !c.ok ? 'none' : c.op === 'move' ? 'move' : c.op === 'copy' ? 'copy' : 'link'
        if (drop?.key !== key || drop.op !== c.op || drop.ok !== c.ok) setDrop({ key, ...c })
      },
      onDragLeave: (e: React.DragEvent) => {
        if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return
        setDrop((d) => (d?.key === key ? null : d))
      },
      onDrop: (e: React.DragEvent) => {
        const c = check(e)
        const list = dragging
        setDrop(null)
        if (!c?.ok || !list) return
        e.preventDefault()
        e.stopPropagation()
        dragging = null
        setIsDragging(false)
        transfer(c.op, list, target)
      },
      'data-drop': drop?.key === key ? (drop.ok ? 'yes' : 'no') : undefined
    }
  }

  // ----- render -----

  const nothing = !items.length

  return (
    <div className="relative">
      {!results && (folderId || clipboard) && (
        <div className="mb-4 flex min-h-8 flex-wrap items-center gap-3">
          <FolderTrail folderId={folderId} onOpen={(id) => go({ name: 'library', folderId: id })} dropProps={dropProps} />
          {clipboard && (
            <Button tone="ghost" className="h-8" onClick={() => paste()}>
              Paste {clipboard.items.length === 1 ? `“${nameOf(clipboard.items[0])}”` : `${clipboard.items.length} items`} here
            </Button>
          )}
        </div>
      )}

      {selecting && (
        <div role="toolbar" aria-label="Selection" className="sticky top-0 z-20 mb-4 flex flex-wrap items-center gap-1 rounded-lg bg-raised px-2 py-1.5 ring-1 ring-line">
          <span className="px-2 font-semibold text-ink">{selected.length} selected</span>
          {selectedItems.length === 1 && (
            <Button tone="ghost" onClick={() => setRenaming(selected[0])}>
              Rename
            </Button>
          )}
          <Button tone="ghost" onClick={() => setDialog({ op: 'move', items: selectedItems })}>
            <Move size={15} /> Move to…
          </Button>
          <Button tone="ghost" onClick={() => setDialog({ op: 'copy', items: selectedItems })}>
            <Copy size={15} /> Copy to…
          </Button>
          {selectedItems.some((i) => i.type !== 'folder') && (
            <Button tone="ghost" onClick={() => setDialog({ op: 'shortcut', items: selectedItems })}>
              <Shortcut size={15} /> Add shortcut in…
            </Button>
          )}
          <Button tone="danger" onClick={() => remove(selectedItems)}>
            <Trash size={15} /> {selectedItems.every((i) => i.type === 'shortcut') ? 'Remove shortcut' : 'Delete'}
          </Button>
          <span className="ml-auto text-[12.5px] text-muted">Drag to a folder to move · Ctrl copies · Alt makes a shortcut</span>
          <button type="button" aria-label="Clear selection (Esc)" title="Clear selection (Esc)" onClick={() => setSelected([])} className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-line hover:text-ink">
            <Close size={15} />
          </button>
        </div>
      )}

      {nothing ? (
        <div onContextMenu={backgroundMenu}>{empty}</div>
      ) : (
        <div
          className="grid min-h-[200px] grid-cols-[repeat(auto-fill,minmax(clamp(240px,15vw,340px),1fr))] gap-5"
          onClick={(e) => e.target === e.currentTarget && setSelected([])}
          onContextMenu={backgroundMenu}
        >
          {view.folders.map((f) => {
            const item: Item = { type: 'folder', id: f.id }
            const key = itemKey(item)
            return (
              <FolderTile
                key={key}
                folder={f}
                where={results ? folderLabel(folders, f.parentId) || 'Library' : undefined}
                selected={selected.includes(key)}
                selecting={selecting}
                dimmed={cutKeys.has(key)}
                renaming={renaming === key}
                onRename={(name) => rename(item, name)}
                onClick={(e) => click(item, e)}
                onOpen={() => open(item)}
                onToggle={() => toggle(key)}
                onMenu={(e) => itemMenu(item, e)}
                drag={dragProps(item)}
                drop={dropProps(f.id)}
                dropLabel={drop?.key === f.id && drop.ok ? `${OP_LABEL[drop.op]} ${f.name}` : null}
              />
            )
          })}
          {view.boards.map((b) => {
            const item: Item = { type: 'board', id: b.id }
            const key = itemKey(item)
            return (
              <BoardTile
                key={key}
                board={b}
                where={results ? folderLabel(folders, b.folderId) || 'Library' : undefined}
                selected={selected.includes(key)}
                selecting={selecting}
                dimmed={cutKeys.has(key)}
                renaming={renaming === key}
                onRename={(name) => rename(item, name)}
                onClick={(e) => click(item, e)}
                onOpen={() => open(item)}
                onToggle={() => toggle(key)}
                onMenu={(e) => itemMenu(item, e)}
                drag={dragProps(item)}
              />
            )
          })}
          {folderId &&
            !results &&
            view.shortcuts.map((b) => {
              const item: Item = { type: 'shortcut', id: b.id, folderId }
              const key = itemKey(item)
              return (
                <BoardTile
                  key={key}
                  board={b}
                  shortcut
                  selected={selected.includes(key)}
                  selecting={selecting}
                  dimmed={cutKeys.has(key)}
                  renaming={renaming === key}
                  onRename={(name) => rename(item, name)}
                  onClick={(e) => click(item, e)}
                  onOpen={() => open(item)}
                  onToggle={() => toggle(key)}
                  onMenu={(e) => itemMenu(item, e)}
                  drag={dragProps(item)}
                  onRemoveShortcut={() => remove([item])}
                />
              )
            })}
        </div>
      )}

      {isDragging && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md bg-raised px-4 py-2.5 text-ink shadow-[0_8px_30px_rgba(0,0,0,0.35)] ring-1 ring-line">
          Drop on a folder to move. Hold Ctrl to copy, Alt to make a shortcut.
        </div>
      )}

      {dialog && (
        <FolderDialog
          op={dialog.op}
          items={dialog.items}
          start={folderId}
          onClose={() => setDialog(null)}
          onPick={(target) => {
            setDialog(null)
            transfer(dialog.op, dialog.items, target)
          }}
        />
      )}
      {confirm && (
        <DeleteDialog
          items={confirm}
          onCancel={() => setConfirm(null)}
          onDelete={(mode) => {
            const list = confirm
            setConfirm(null)
            changeLibrary('delete', (l) => deleteItems(l, list, mode), `Deleted ${describe(list)}.`)
            setSelected([])
          }}
        />
      )}
      {menu}
    </div>
  )
}

/** Drop a leading or doubled separator. */
function tidy(entries: MenuEntry[]): MenuEntry[] {
  const out: MenuEntry[] = []
  for (const e of entries) {
    if (e === SEPARATOR && (!out.length || out[out.length - 1] === SEPARATOR)) continue
    out.push(e)
  }
  while (out[out.length - 1] === SEPARATOR) out.pop()
  return out
}


interface TileProps {
  selected: boolean
  selecting: boolean
  dimmed: boolean
  renaming: boolean
  onRename: (name: string | null) => void
  onClick: (e: React.MouseEvent) => void
  onOpen: () => void
  onToggle: () => void
  onMenu: (e: React.MouseEvent) => void
  drag: { draggable: boolean; onDragStart: (e: React.DragEvent) => void }
  /** Folder path shown in search results. */
  where?: string
}

function FolderTile({
  folder,
  drop,
  dropLabel,
  ...t
}: TileProps & { folder: Folder; drop: DropProps; dropLabel: string | null }) {
  const boards = useApp((s) => s.boards)
  const folders = useApp((s) => s.library.folders)
  const go = useApp((s) => s.go)
  const cover = folderCover(folders, boards, folder.id)
  const subs = childFolders(folders, folder.id).length
  const cols = boardsIn(boards, folder.id).length + shortcutsIn(folders, boards, folder.id).length
  const count = itemCountLabel(subs, cols)
  const spring = useSpringOpen(() => go({ name: 'library', folderId: folder.id }))
  const { onDragOver, onDragLeave, onDrop, 'data-drop': dataDrop } = drop
  return (
    <div
      className={`group relative ${t.dimmed ? 'opacity-50' : ''}`}
      data-drop={dataDrop}
      {...t.drag}
      onDragOver={onDragOver}
      onDragEnter={() => dragging && spring.start()}
      onDragLeave={(e) => {
        onDragLeave(e)
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) spring.stop()
      }}
      onDrop={(e) => {
        spring.stop()
        onDrop(e)
      }}
    >
      <button
        type="button"
        aria-label={`${folder.name}, folder, ${count}`}
        onClick={t.onClick}
        onDoubleClick={t.onOpen}
        onContextMenu={t.onMenu}
        className="block w-full text-left"
      >
        <div className={`rounded-[10px] transition-shadow ${t.selected || dataDrop === 'yes' ? 'ring-2 ring-blue ring-offset-2 ring-offset-bg' : ''}`}>
          <FolderArt images={cover} label={count} />
        </div>
        {t.renaming ? (
          <RenameField value={folder.name} onDone={t.onRename} label={`New name for ${folder.name}`} />
        ) : (
          <div className="mt-2 truncate font-semibold text-ink group-hover:text-blue">{folder.name}</div>
        )}
        <div className="text-[12.5px] text-muted">{t.where ? `In ${t.where}` : 'Folder'}</div>
      </button>
      <TileCheck checked={t.selected} show={t.selecting} onToggle={t.onToggle} label={`Select ${folder.name}`} />
      {dropLabel && (
        <span className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 rounded-md bg-blue px-2.5 py-1 text-[12.5px] font-semibold text-bg shadow-lg">
          {dropLabel}
        </span>
      )}
    </div>
  )
}


function BoardTile({
  board,
  shortcut,
  onRemoveShortcut,
  ...t
}: TileProps & { board: Board; shortcut?: boolean; onRemoveShortcut?: () => void }) {
  const missing = useApp((s) => s.missing[board.id]?.length ?? 0)
  return (
    <div className={`group relative ${t.dimmed ? 'opacity-50' : ''}`} {...t.drag}>
      <button
        type="button"
        aria-label={`${board.name}${shortcut ? ', shortcut' : ''}, ${board.images.length} images`}
        onClick={t.onClick}
        onDoubleClick={t.onOpen}
        onContextMenu={t.onMenu}
        className="block w-full text-left"
      >
        <div className={`relative rounded-md ${t.selected ? 'ring-2 ring-blue ring-offset-2 ring-offset-bg' : ''}`}>
          <Mosaic images={board.images} />
          {shortcut && (
            <span title="Shortcut: this collection lives in another folder" className="absolute bottom-2 left-2 flex h-6 items-center gap-1 rounded-md bg-bg/85 px-1.5 text-[12px] text-ink">
              <Shortcut size={13} /> Shortcut
            </span>
          )}
          {missing > 0 && (
            <span className="absolute bottom-2 right-2 flex h-6 items-center rounded-md bg-bg/90 px-1.5 text-[12px] text-red">{missing} missing</span>
          )}
        </div>
        {t.renaming ? (
          <RenameField value={board.name} onDone={t.onRename} label={`New name for ${board.name}`} />
        ) : (
          <div className="mt-2 flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate font-semibold text-ink group-hover:text-blue">{board.name}</span>
            {board.favorite && <Star size={13} filled className="shrink-0 self-center text-blue" />}
            <span className="tnum text-[12.5px] text-muted">{board.images.length}</span>
          </div>
        )}
        <div className="truncate text-[12.5px] text-muted">{[KIND_LABEL[board.kind], ...board.tags].join(', ')}</div>
        {t.where && <div className="truncate text-[12.5px] text-muted">In {t.where}</div>}
      </button>
      <TileCheck checked={t.selected} show={t.selecting} onToggle={t.onToggle} label={`Select ${board.name}`} />
      {onRemoveShortcut && !t.selecting && (
        <button
          type="button"
          onClick={onRemoveShortcut}
          title="Remove the shortcut (the collection stays where it lives)"
          className="absolute right-2 top-2 hidden h-7 items-center rounded-md bg-bg/90 px-2 text-[12px] text-muted hover:text-ink group-hover:flex"
        >
          Remove shortcut
        </button>
      )}
    </div>
  )
}

/** Deleting folders: keep what is inside (it moves up) or delete it all. */
export function DeleteDialog({ items, onCancel, onDelete }: { items: Item[]; onCancel: () => void; onDelete: (mode: 'keep' | 'all') => void }) {
  const boards = useApp((s) => s.boards)
  const folders = useApp((s) => s.library.folders)
  const sum = deleteSummary({ boards, folders }, items)
  const what = [
    sum.folders && `${sum.folders} ${sum.folders === 1 ? 'folder' : 'folders'}`,
    sum.boards && `${sum.boards} ${sum.boards === 1 ? 'collection' : 'collections'}`,
    sum.shortcuts && `${sum.shortcuts} ${sum.shortcuts === 1 ? 'shortcut' : 'shortcuts'}`
  ]
    .filter(Boolean)
    .join(', ')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/70" role="dialog" aria-label="Delete" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="w-[min(480px,92vw)] rounded-lg bg-surface p-6 shadow-[0_12px_40px_rgba(0,0,0,0.4)] ring-1 ring-line">
        <h2 className="text-[17px] font-semibold">Delete {what}?</h2>
        <p className="mt-2 text-muted">
          {sum.inside
            ? `The ${sum.folders === 1 ? 'folder holds' : 'folders hold'} ${sum.inside} ${sum.inside === 1 ? 'thing' : 'things'} (folders and collections).`
            : 'The folder is empty.'}{' '}
          Your image files on disk are never deleted. You can undo this.
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button tone="ghost" onClick={onCancel}>
            Cancel
          </Button>
          {sum.inside > 0 && (
            <Button tone="danger" onClick={() => onDelete('all')}>
              <FolderIcon size={15} /> Delete everything inside too
            </Button>
          )}
          <Button tone="primary" autoFocus onClick={() => onDelete('keep')}>
            {sum.inside ? 'Delete folder (keep what’s inside)' : 'Delete'}
          </Button>
        </div>
      </div>
    </div>
  )
}
