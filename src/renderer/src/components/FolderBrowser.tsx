// The library as a file manager: folders and images you open, select, move,
// copy, rename and delete, like files in Windows.
//
// - Click a folder to open it; click an image to view it.
// - The check in a tile's corner selects it (it shows on hover). Ctrl+click
//   adds or removes, Shift+click selects a range.
// - Drag onto a folder (or a part of the folder path) moves; hold Ctrl to
//   copy. Hovering a folder while dragging opens it.
// - Right-click for every action. Keys: Ctrl+A, Esc, Delete, F2, Enter,
//   Ctrl+X / C / V, Ctrl+Z / Ctrl+Y, Backspace (up a folder).
// - Every change can be undone. Nothing here ever moves or deletes a file
//   on disk: the library only organizes.

import { useEffect, useMemo, useRef, useState } from 'react'
import { thumbUrl } from '@shared/api'
import { DEFAULT_PLAN, type Folder, type LibraryImage } from '@shared/types'
import {
  assetMap,
  cannotTransfer,
  childFolders,
  copyItems,
  countLabel,
  deleteItems,
  deleteSummary,
  descendantIds,
  folderCounts,
  folderCover,
  folderLabel,
  imagesBelow,
  imagesIn,
  itemKey,
  lastPracticed,
  moveItems,
  parseItemKey,
  renameItem,
  sortItems,
  type Item,
  type SortKey,
  type Transfer
} from '../lib/library'
import { uid, useApp } from '../store'
import { SEPARATOR, useContextMenu, type MenuEntry } from './ContextMenu'
import { FolderDialog } from './FolderDialog'
import { Close, Copy, Folder as FolderIcon, Images, Move, Play, Star, Trash } from './Icons'
import { FolderArt, FolderTrail, RenameField, TileCheck, useSpringOpen } from './LibraryTiles'
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
/** When the window last lost focus: a copy made in another app after this wins over the library's own. */
let blurredAt = 0
window.addEventListener('blur', () => (blurredAt = Date.now()))

/** True while library items are being dragged (so the page doesn't take the drop as new files). */
export const isDraggingItems = () => !!dragging

/** Whether Ctrl+V should paste the library's cut or copied items (not an image from another app). */
export function libraryPasteWins(): boolean {
  const c = useApp.getState().clipboard
  return !!c && c.at > blurredAt
}

/** Pick these folders on Practice and go there. */
export function practiceFolders(ids: string[]): void {
  const { settings, updateSettings, go } = useApp.getState()
  updateSettings({ lastPlan: { ...DEFAULT_PLAN, ...settings.lastPlan, boardIds: [], folderIds: ids } })
  go({ name: 'practice' })
}

const OP_LABEL: Record<Transfer, string> = { move: 'Move to', copy: 'Copy to' }

function opFrom(e: React.DragEvent): Transfer {
  return e.ctrlKey || e.metaKey ? 'copy' : 'move'
}

export function FolderBrowser({
  folderId,
  results,
  empty,
  actions
}: {
  folderId?: string
  /** Search results to show instead of the folder (folders and images from anywhere). */
  results?: { folders: Folder[]; images: LibraryImage[] }
  /** Shown when the folder has nothing in it. */
  empty: React.ReactNode
  /** Buttons on the line with the folder path. */
  actions?: React.ReactNode
}) {
  const library = useApp((s) => s.library)
  const { folders, images, favoriteImages } = library
  const sessions = useApp((s) => s.sessions)
  const missingList = useApp((s) => s.missing)
  const sort = (useApp((s) => s.settings.librarySort) ?? 'name') as SortKey
  const clipboard = useApp((s) => s.clipboard)
  const go = useApp((s) => s.go)
  const notify = useApp((s) => s.notify)
  const changeLibrary = useApp((s) => s.changeLibrary)
  const setLibrary = useApp((s) => s.setLibrary)
  const setClipboard = useApp((s) => s.setClipboard)

  const [selected, setSelected] = useState<string[]>([])
  const anchor = useRef<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ op: Transfer; items: Item[] } | null>(null)
  const [confirm, setConfirm] = useState<Item[] | null>(null)
  const [drop, setDrop] = useState<{ key: string; op: Transfer; ok: boolean } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const { open: openMenu, menu } = useContextMenu()

  const assets = useMemo(() => assetMap(library.assets), [library.assets])
  const missing = useMemo(() => new Set(missingList), [missingList])
  const favs = useMemo(() => new Set(favoriteImages), [favoriteImages])
  const practiced = useMemo(() => lastPracticed(sessions), [sessions])

  // What this view shows, in order: folders first, then images.
  const view = useMemo(() => {
    const lib = { folders, images }
    const folderPracticed = (f: Folder) => Math.max(0, ...[...descendantIds(folders, f.id)].map((id) => practiced.folders.get(id) ?? 0))
    const sortFolders = (list: Folder[]) => sortItems(list, sort, (f) => imagesBelow(lib, f.id).length, folderPracticed)
    const sortImages = (list: LibraryImage[]) => sortItems(list, sort, () => 0, (i) => practiced.assets.get(i.assetId) ?? 0)
    if (results) return { folders: sortFolders(results.folders), images: sortImages(results.images) }
    return { folders: sortFolders(childFolders(folders, folderId)), images: sortImages(imagesIn(images, folderId)) }
  }, [results, folders, images, folderId, sort, practiced])

  const items: Item[] = useMemo(
    () => [...view.folders.map((f) => ({ type: 'folder' as const, id: f.id })), ...view.images.map((i) => ({ type: 'image' as const, id: i.id }))],
    [view]
  )
  const order = useMemo(() => items.map(itemKey), [items])
  const selectedItems = selected.map(parseItemKey).filter((x): x is Item => !!x)
  const cutKeys = new Set(clipboard?.op === 'cut' ? clipboard.items.map(itemKey) : [])

  // Keep the selection to what is still here (after a move or delete).
  useEffect(() => {
    setSelected((sel) => {
      const next = sel.filter((k) => order.includes(k))
      return next.length === sel.length ? sel : next
    })
  }, [order])

  const nameOf = (item: Item) =>
    item.type === 'folder' ? (folders.find((f) => f.id === item.id)?.name ?? 'Folder') : (images.find((i) => i.id === item.id)?.name ?? 'Image')
  const placeName = (target?: string) => (target ? `“${folders.find((f) => f.id === target)?.name ?? 'folder'}”` : 'the top level')
  const describe = (list: Item[]) => {
    if (list.length === 1) return `“${nameOf(list[0])}”`
    const f = list.filter((i) => i.type === 'folder').length
    const n = list.length - f
    return [f && `${f} ${f === 1 ? 'folder' : 'folders'}`, n && `${n} ${n === 1 ? 'image' : 'images'}`].filter(Boolean).join(' and ')
  }

  const open = (item: Item) => {
    if (item.type === 'folder') go({ name: 'library', folderId: item.id })
    else go({ name: 'viewer', folderId: results ? undefined : folderId, entryId: item.id })
  }

  // ----- actions -----

  /** Returns whether anything moved or was copied. */
  const transfer = (op: Transfer, list: Item[], target: string | undefined): boolean => {
    const lib = useApp.getState().library
    const can = list.filter((it) => !cannotTransfer(lib, it, target, op))
    if (!can.length) {
      notify(cannotTransfer(lib, list[0], target, op) ?? 'Nothing to do.')
      return false
    }
    if (op === 'move') changeLibrary('move', (l) => ({ ...l, ...moveItems(l, can, target) }), `Moved ${describe(can)} to ${placeName(target)}.`)
    // Copies share the image files; nothing is duplicated on disk.
    else changeLibrary('copy', (l) => ({ ...l, ...copyItems(l, can, target, uid) }), `Copied ${describe(can)} to ${placeName(target)}.`)
    setSelected([])
    return true
  }

  const remove = (list: Item[]) => {
    if (!list.length) return
    if (list.some((i) => i.type === 'folder')) return setConfirm(list)
    changeLibrary('delete', (l) => ({ ...l, ...deleteItems(l, list, 'keep') }), `Removed ${describe(list)} from the library.`)
    setSelected([])
  }

  const rename = (item: Item, name: string | null) => {
    setRenaming(null)
    if (name) changeLibrary('rename', (l) => ({ ...l, ...renameItem(l, item, name) }))
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
  const paste = () => {
    if (!clipboard || results) return
    const lib = useApp.getState().library
    const still = clipboard.items.filter((i) => (i.type === 'folder' ? lib.folders.some((f) => f.id === i.id) : lib.images.some((x) => x.id === i.id)))
    if (!still.length) return setClipboard(null)
    const done = transfer(clipboard.op === 'cut' ? 'move' : 'copy', still, folderId)
    // Cut items are pasted once; if they couldn't go here, they stay cut.
    if (done && clipboard.op === 'cut') setClipboard(null)
  }

  const toggleFavorite = (list: Item[]) => {
    const folderIds = list.filter((i) => i.type === 'folder').map((i) => i.id)
    const assetIds = list.flatMap((i) => (i.type === 'image' ? [images.find((x) => x.id === i.id)?.assetId ?? ''] : [])).filter(Boolean)
    const on = !(folderIds.every((id) => folders.find((f) => f.id === id)?.favorite) && assetIds.every((a) => favs.has(a)))
    setLibrary((l) => ({
      ...l,
      folders: l.folders.map((f) => (folderIds.includes(f.id) ? { ...f, favorite: on } : f)),
      favoriteImages: on ? [...new Set([...l.favoriteImages, ...assetIds])] : l.favoriteImages.filter((a) => !assetIds.includes(a))
    }))
  }

  const toggle = (key: string) => {
    anchor.current = key
    setSelected((sel) => (sel.includes(key) ? sel.filter((k) => k !== key) : [...sel, key]))
  }

  const selectRange = (key: string, add: boolean) => {
    if (!anchor.current || !order.includes(anchor.current)) return toggle(key)
    const [a, b] = [order.indexOf(anchor.current), order.indexOf(key)].sort((x, y) => x - y)
    const range = order.slice(a, b + 1)
    setSelected((sel) => (add ? [...new Set([...sel, ...range])] : range))
  }

  /** A click opens; with Ctrl it adds to the selection, with Shift it selects a range. */
  const click = (item: Item, e: React.MouseEvent) => {
    const key = itemKey(item)
    if (e.shiftKey) selectRange(key, e.ctrlKey || e.metaKey)
    else if (e.ctrlKey || e.metaKey) toggle(key)
    else open(item)
  }

  // ----- menus -----

  const itemMenu = (item: Item, e: React.MouseEvent) => {
    const key = itemKey(item)
    const list = selected.includes(key) ? selectedItems : [item]
    if (!selected.includes(key)) setSelected([key])
    const single = list.length === 1 ? list[0] : null
    const pickFolders = list.filter((i) => i.type === 'folder').map((i) => i.id)
    const image = single?.type === 'image' ? images.find((i) => i.id === single.id) : null
    const allFav = list.every((i) => (i.type === 'folder' ? folders.find((f) => f.id === i.id)?.favorite : favs.has(images.find((x) => x.id === i.id)?.assetId ?? '')))
    const entries: MenuEntry[] = [
      ...(single ? [{ label: 'Open', hint: 'Enter', onClick: () => open(single) }] : []),
      ...(pickFolders.length === list.length ? [{ label: pickFolders.length === 1 ? 'Practice this folder' : 'Practice these folders', icon: <Play size={14} />, onClick: () => practiceFolders(pickFolders) }] : []),
      ...(results && single
        ? [{ label: 'Show where it is', onClick: () => go({ name: 'library', folderId: single.type === 'folder' ? folders.find((f) => f.id === single.id)?.parentId : image?.folderId }) }]
        : []),
      SEPARATOR,
      ...(single ? [{ label: 'Rename', hint: 'F2', onClick: () => setRenaming(itemKey(single)) }] : []),
      { label: allFav ? 'Remove from favorites' : 'Add to favorites', icon: <Star size={14} filled={allFav} />, onClick: () => toggleFavorite(list) },
      SEPARATOR,
      { label: 'Cut', hint: 'Ctrl+X', onClick: () => cut(list) },
      { label: 'Copy', hint: 'Ctrl+C', onClick: () => copy(list) },
      { label: 'Move to…', icon: <Move size={14} />, onClick: () => setDialog({ op: 'move', items: list }) },
      { label: 'Copy to…', icon: <Copy size={14} />, onClick: () => setDialog({ op: 'copy', items: list }) },
      SEPARATOR,
      { label: 'Delete…', hint: 'Del', danger: true, icon: <Trash size={14} />, onClick: () => remove(list) }
    ]
    openMenu(e, tidy(entries))
  }

  const backgroundMenu = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return
    setSelected([])
    openMenu(
      e,
      tidy([
        ...(clipboard && !results
          ? [{ label: clipboard.op === 'cut' ? `Paste (move ${clipboard.items.length})` : `Paste (copy ${clipboard.items.length})`, hint: 'Ctrl+V', onClick: () => paste() }, SEPARATOR]
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
      if (dialog || confirm || renaming || document.querySelector('[role="dialog"]')) return
      const k = e.key.toLowerCase()
      const ctrl = e.ctrlKey || e.metaKey
      const single = selectedItems.length === 1 ? selectedItems[0] : null
      if (ctrl && k === 'a') {
        e.preventDefault()
        setSelected(order)
      } else if (e.key === 'Escape' && selected.length) {
        setSelected([])
      } else if (e.key === 'Delete') {
        remove(selectedItems)
      } else if (e.key === 'F2' && single) {
        e.preventDefault()
        setRenaming(itemKey(single))
      } else if (e.key === 'Enter' && single && t === document.body) {
        // A focused tile opens itself (Enter clicks it); otherwise the one selected opens.
        e.preventDefault()
        open(single)
      } else if (ctrl && k === 'x') {
        cut(selectedItems)
      } else if (ctrl && k === 'c') {
        copy(selectedItems)
      } else if (ctrl && k === 'v' && libraryPasteWins()) {
        // An image copied in another app since then is pasted by the page instead.
        e.preventDefault()
        paste()
      } else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) {
        e.preventDefault()
        useApp.getState().redoLibrary()
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
    // No mouse moves arrive during a drag, so the first one means it ended
    // (also when the tile it started from is gone because a folder opened).
    const moved = () => dragging && end()
    window.addEventListener('dragend', end)
    window.addEventListener('drop', end)
    window.addEventListener('mousemove', moved)
    // A folder opened mid-drag: this view is new, the drag goes on.
    if (dragging) setIsDragging(true)
    return () => {
      window.removeEventListener('dragend', end)
      window.removeEventListener('drop', end)
      window.removeEventListener('mousemove', moved)
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
      e.dataTransfer.effectAllowed = 'copyMove'
      const ghost = document.createElement('div')
      ghost.textContent = keys.length === 1 ? nameOf(dragging[0]) : `${keys.length} items`
      ghost.style.cssText = 'position:fixed;top:-100px;left:0;padding:6px 10px;border-radius:6px;background:#86b6e6;color:#1d1e20;font:600 13px system-ui'
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
      const lib = useApp.getState().library
      return { op, ok: dragging.some((it) => !cannotTransfer(lib, it, target, op)) }
    }
    return {
      onDragOver: (e: React.DragEvent) => {
        const c = check(e)
        if (!c) return
        e.stopPropagation()
        if (c.ok) e.preventDefault()
        e.dataTransfer.dropEffect = !c.ok ? 'none' : c.op
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

  const tileProps = (item: Item, name: string) => {
    const key = itemKey(item)
    return {
      name,
      selected: selected.includes(key),
      selecting: selected.length > 0,
      dimmed: cutKeys.has(key),
      renaming: renaming === key,
      onRename: (n: string | null) => rename(item, n),
      onClick: (e: React.MouseEvent) => click(item, e),
      onToggle: (e: React.MouseEvent) => (e.shiftKey ? selectRange(key, true) : toggle(key)),
      onMenu: (e: React.MouseEvent) => itemMenu(item, e),
      drag: dragProps(item)
    }
  }

  const pickFolders = selectedItems.filter((i) => i.type === 'folder').map((i) => i.id)
  // Covers and counts, worked out once per change rather than on every hover or drag.
  const folderInfo = useMemo(() => {
    const lib = { folders, images }
    return new Map(view.folders.map((f) => [f.id, { cover: folderCover(lib, assets, f.id), count: countLabel(folderCounts(lib, f.id)) }]))
  }, [view.folders, folders, images, assets])

  return (
    <div className="relative">
      <div className="mb-4 flex min-h-9 flex-wrap items-center gap-3">
        {results ? (
          <h2 className="text-[15px] font-semibold text-ink">Search results</h2>
        ) : (
          <FolderTrail folderId={folderId} onOpen={(id) => go({ name: 'library', folderId: id })} dropProps={dropProps} />
        )}
        {clipboard && !results && (
          <Button tone="ghost" className="h-8" onClick={() => paste()}>
            Paste {clipboard.items.length === 1 ? `“${nameOf(clipboard.items[0])}”` : `${clipboard.items.length} items`} here
          </Button>
        )}
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {selected.length > 0 && (
        <div role="toolbar" aria-label="Selection" className="sticky top-0 z-20 mb-4 flex flex-wrap items-center gap-1 rounded-lg bg-raised px-2 py-1.5 shadow-[0_6px_20px_rgba(0,0,0,0.25)] ring-1 ring-line">
          <span className="px-2 font-semibold text-ink">{selected.length} selected</span>
          {pickFolders.length > 0 && pickFolders.length === selectedItems.length && (
            <Button tone="ghost" onClick={() => practiceFolders(pickFolders)}>
              <Play size={14} /> Practice
            </Button>
          )}
          <Button tone="ghost" onClick={() => setDialog({ op: 'move', items: selectedItems })}>
            <Move size={15} /> Move to…
          </Button>
          <Button tone="ghost" onClick={() => setDialog({ op: 'copy', items: selectedItems })}>
            <Copy size={15} /> Copy to…
          </Button>
          <Button tone="danger" onClick={() => remove(selectedItems)}>
            <Trash size={15} /> Delete
          </Button>
          <span className="ml-auto hidden text-[12.5px] text-muted lg:inline">Drag to a folder to move · Ctrl copies</span>
          <button type="button" aria-label="Clear selection (Esc)" title="Clear selection (Esc)" onClick={() => setSelected([])} className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-line hover:text-ink">
            <Close size={15} />
          </button>
        </div>
      )}

      {!items.length ? (
        <div onContextMenu={backgroundMenu}>{empty}</div>
      ) : (
        <div className="min-h-[200px]" onClick={(e) => e.target === e.currentTarget && setSelected([])} onContextMenu={backgroundMenu}>
          {view.folders.length > 0 && (
            <div
              className="grid grid-cols-[repeat(auto-fill,minmax(clamp(180px,12vw,260px),1fr))] gap-5"
              onClick={(e) => e.target === e.currentTarget && setSelected([])}
              onContextMenu={backgroundMenu}
            >
              {view.folders.map((f) => {
                const item: Item = { type: 'folder', id: f.id }
                return (
                  <FolderTile
                    key={itemKey(item)}
                    folder={f}
                    cover={folderInfo.get(f.id)?.cover ?? []}
                    count={folderInfo.get(f.id)?.count ?? ''}
                    where={results ? folderLabel(folders, f.parentId) || 'Library' : undefined}
                    {...tileProps(item, f.name)}
                    drop={dropProps(f.id)}
                    dropLabel={drop?.key === f.id && drop.ok ? `${OP_LABEL[drop.op]} ${f.name}` : null}
                    onOpen={() => open(item)}
                  />
                )
              })}
            </div>
          )}
          {view.folders.length > 0 && view.images.length > 0 && <div className="h-6" />}
          {view.images.length > 0 && (
            <div
              className="grid grid-cols-[repeat(auto-fill,minmax(clamp(130px,9vw,200px),1fr))] gap-3"
              onClick={(e) => e.target === e.currentTarget && setSelected([])}
              onContextMenu={backgroundMenu}
            >
              {view.images.map((img) => {
                const item: Item = { type: 'image', id: img.id }
                const asset = assets.get(img.assetId)
                return (
                  <ImageTile
                    key={itemKey(item)}
                    path={asset?.path}
                    missing={missing.has(img.assetId) || !asset}
                    favorite={favs.has(img.assetId)}
                    where={results ? folderLabel(folders, img.folderId) || 'Library' : undefined}
                    {...tileProps(item, img.name)}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}

      {isDragging && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md bg-raised px-4 py-2.5 text-ink shadow-[0_8px_30px_rgba(0,0,0,0.35)] ring-1 ring-line">
          Drop on a folder to move. Hold Ctrl to copy.
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
            changeLibrary('delete', (l) => ({ ...l, ...deleteItems(l, list, mode) }), `Removed ${describe(list)} from the library.`)
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
  name: string
  selected: boolean
  /** Something is selected: every tile shows its check. */
  selecting: boolean
  dimmed: boolean
  renaming: boolean
  onRename: (name: string | null) => void
  onClick: (e: React.MouseEvent) => void
  onToggle: (e: React.MouseEvent) => void
  onMenu: (e: React.MouseEvent) => void
  drag: { draggable: boolean; onDragStart: (e: React.DragEvent) => void }
  /** Folder path shown in search results. */
  where?: string
}

function FolderTile({
  folder,
  cover,
  count,
  drop,
  dropLabel,
  onOpen,
  ...t
}: TileProps & { folder: Folder; cover: ReturnType<typeof folderCover>; count: string; drop: DropProps; dropLabel: string | null; onOpen: () => void }) {
  const spring = useSpringOpen(onOpen)
  const { onDragOver, onDragLeave, onDrop, 'data-drop': dataDrop } = drop
  const kind = folder.source?.kind === 'pinterest' ? 'Pinterest board' : folder.source?.kind === 'disk' ? 'Linked folder' : null
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
        data-tile
        aria-label={`${t.name}, folder, ${count}`}
        onClick={t.onClick}
        onContextMenu={t.onMenu}
        className="block w-full text-left"
      >
        <div className={`rounded-[10px] transition-shadow ${t.selected || dataDrop === 'yes' ? 'ring-2 ring-blue ring-offset-2 ring-offset-bg' : ''}`}>
          <FolderArt images={cover} label={count} />
        </div>
        {t.renaming ? (
          <RenameField value={t.name} onDone={t.onRename} label={`New name for ${t.name}`} />
        ) : (
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`min-w-0 flex-1 truncate font-semibold group-hover:text-blue ${t.selected ? 'text-blue' : 'text-ink'}`}>{t.name}</span>
            {folder.favorite && <Star size={13} filled className="shrink-0 self-center text-blue" />}
          </div>
        )}
        <div className="truncate text-[12.5px] text-muted">
          {[t.where ? `In ${t.where}` : kind ?? 'Folder', ...(folder.tags ?? [])].join(' · ')}
        </div>
      </button>
      <TileCheck checked={t.selected} show={t.selecting} onToggle={t.onToggle} label={`Select ${t.name}`} />
      {dropLabel && (
        <span className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 rounded-md bg-blue px-2.5 py-1 text-[12.5px] font-semibold text-bg shadow-lg">
          {dropLabel}
        </span>
      )}
    </div>
  )
}

function ImageTile({ path, missing, favorite, ...t }: TileProps & { path?: string; missing: boolean; favorite: boolean }) {
  return (
    <div className={`group relative ${t.dimmed ? 'opacity-50' : ''}`} {...t.drag}>
      <button type="button" data-tile aria-label={`${t.name}, image`} onClick={t.onClick} onContextMenu={t.onMenu} className="block w-full text-left">
        <div className={`relative aspect-[3/4] overflow-hidden rounded-md bg-surface ring-1 transition-shadow ${t.selected ? 'ring-2 ring-blue ring-offset-2 ring-offset-bg' : 'ring-line group-hover:ring-muted'}`}>
          {missing || !path ? (
            <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-[12.5px] text-red">
              <Images size={20} />
              Missing
            </span>
          ) : (
            <img src={thumbUrl(path, 320)} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
          )}
          {favorite && (
            <span className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-bg/85 text-blue">
              <Star size={13} filled />
            </span>
          )}
        </div>
        {t.renaming ? (
          <RenameField value={t.name} onDone={t.onRename} label={`New name for ${t.name}`} />
        ) : (
          <div className={`mt-1.5 truncate text-[12.5px] ${t.selected ? 'text-blue' : 'text-muted group-hover:text-ink'}`} title={t.name}>
            {t.name}
          </div>
        )}
        {t.where && <div className="truncate text-[12px] text-muted/80">In {t.where}</div>}
      </button>
      <TileCheck checked={t.selected} show={t.selecting} onToggle={t.onToggle} label={`Select ${t.name}`} />
    </div>
  )
}

/** Deleting folders: keep what is inside (it moves up) or delete it all. Files on disk are never touched. */
export function DeleteDialog({ items, onCancel, onDelete }: { items: Item[]; onCancel: () => void; onDelete: (mode: 'keep' | 'all') => void }) {
  const folders = useApp((s) => s.library.folders)
  const images = useApp((s) => s.library.images)
  const sum = deleteSummary({ folders, images }, items)
  const what = [sum.folders && `${sum.folders} ${sum.folders === 1 ? 'folder' : 'folders'}`, sum.images && `${sum.images} ${sum.images === 1 ? 'image' : 'images'}`]
    .filter(Boolean)
    .join(', ')
  const inside = [sum.insideFolders && `${sum.insideFolders} ${sum.insideFolders === 1 ? 'folder' : 'folders'}`, sum.insideImages && `${sum.insideImages} ${sum.insideImages === 1 ? 'image' : 'images'}`]
    .filter(Boolean)
    .join(' and ')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/70" role="dialog" aria-label="Delete" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="w-[min(480px,92vw)] rounded-lg bg-surface p-6 shadow-[0_12px_40px_rgba(0,0,0,0.4)] ring-1 ring-line">
        <h2 className="text-[17px] font-semibold">Delete {what} from the library?</h2>
        <p className="mt-2 text-muted">
          {inside ? `Inside: ${inside}.` : 'The folder is empty.'} Your image files on disk are never deleted, and you can undo this.
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button tone="ghost" onClick={onCancel}>
            Cancel
          </Button>
          {inside && (
            <Button tone="danger" onClick={() => onDelete('all')}>
              <FolderIcon size={15} /> Delete everything inside too
            </Button>
          )}
          <Button tone="primary" autoFocus onClick={() => onDelete('keep')}>
            {inside ? 'Delete folder, keep what’s inside' : 'Delete'}
          </Button>
        </div>
      </div>
    </div>
  )
}
