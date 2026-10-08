import { useEffect, useMemo, useState } from 'react'
import { thumbUrl } from '@shared/api'
import { SUGGESTED_TAGS, type Board, type BoardKind, type Folder, type FolderInfo, type ImageRef, type PinterestImport, type PinterestProgress } from '@shared/types'
import { ArrowLeft, ArrowRight, Close, Folder as FolderIcon, Images, Link, Plus, Refresh, Star, Trash } from '../components/Icons'
import { ImportSheet, type ImportOptions } from '../components/ImportSheet'
import { TagEditor } from '../components/TagEditor'
import { Button, Empty, IconButton } from '../components/ui'
import {
  boardsIn,
  canMoveFolder,
  childFolders,
  deleteFolder,
  descendantIds,
  dropShortcuts,
  folderCover,
  folderItemCount,
  folderLabel,
  folderPath,
  foldersWithShortcut,
  searchBoards,
  shortcutsIn
} from '../lib/library'
import { uid, useApp } from '../store'

const KIND_LABEL: Record<BoardKind, string> = {
  folder: 'Linked folder',
  files: 'Images',
  pinterest: 'Pinterest',
  collection: 'Collection'
}

const label = (t: string) => t[0].toUpperCase() + t.slice(1)

/** Every tag in use, plus the usual suggestions, for the tag field. */
export function tagSuggestions(boards: Board[]): string[] {
  return [...new Set([...boards.flatMap((b) => b.tags), ...SUGGESTED_TAGS])].sort()
}

function mergeImages(existing: ImageRef[], added: ImageRef[]): ImageRef[] {
  const seen = new Set(existing.map((i) => i.id))
  return [...existing, ...added.filter((i) => !seen.has(i.id) && seen.add(i.id))]
}

export function Library({ boardId, folderId }: { boardId?: string; folderId?: string }) {
  const board = useApp((s) => s.boards.find((b) => b.id === boardId))
  const folderExists = useApp((s) => !folderId || s.library.folders.some((f) => f.id === folderId))
  if (board) return <BoardDetail board={board} />
  return <BoardList folderId={folderExists ? folderId : undefined} />
}

function BoardList({ folderId }: { folderId?: string }) {
  const boards = useApp((s) => s.boards)
  const folders = useApp((s) => s.library.folders)
  const setBoards = useApp((s) => s.setBoards)
  const setLibrary = useApp((s) => s.setLibrary)
  const go = useApp((s) => s.go)
  const notify = useApp((s) => s.notify)
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string>('all')
  const [favOnly, setFavOnly] = useState(false)
  const [pinterestOpen, setPinterestOpen] = useState(false)
  const [newFolder, setNewFolder] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [sheet, setSheet] = useState<FolderInfo | null>(null)
  const updateSettings = useApp((s) => s.updateSettings)

  useEffect(() => {
    void useApp.getState().checkMissing()
  }, [])

  const folder = folders.find((f) => f.id === folderId)
  const path = folderPath(folders, folderId)
  const used = useMemo(() => [...new Set(boards.flatMap((b) => b.tags))].sort(), [boards])
  const searching = query.trim() !== '' || tag !== 'all' || favOnly
  const results = searching
    ? searchBoards(boards, query).filter((b) => (tag === 'all' || b.tags.includes(tag)) && (!favOnly || b.favorite))
    : []
  const subfolders = childFolders(folders, folderId)
  const here = boardsIn(boards, folderId)
  const shortcuts = shortcutsIn(folders, boards, folderId)

  const create = (b: Omit<Board, 'id' | 'createdAt' | 'tags'> & { tags?: string[] }) => {
    const board: Board = { tags: [], ...b, folderId, id: uid(), createdAt: Date.now() }
    setBoards((list) => [...list, board])
    return board
  }

  const addFolder = async () => {
    const dir = await window.api.pickFolder()
    if (!dir) return
    const info = await window.api.inspectFolder(dir)
    if (!info.direct && !info.subfolders.length) return notify('That folder has no images in it.')
    if (!info.subfolders.length) return importFolder(info, { choice: 'one', subfolders: [], copy: false, remember: false })
    const remembered = useApp.getState().settings.folderImport
    if (remembered !== 'ask') {
      return importFolder(info, { choice: remembered, subfolders: info.subfolders.map((x) => x.path), copy: false, remember: false })
    }
    setSheet(info)
  }

  /** Add a folder the way the import sheet (or the remembered choice) says. */
  const importFolder = async (info: FolderInfo, o: ImportOptions) => {
    setSheet(null)
    if (o.remember) updateSettings({ folderImport: o.choice })
    const now = Date.now()
    const allSubs = o.subfolders.length === info.subfolders.length

    // One collection; linked to the folder unless only some sub-folders were picked.
    const collection = async (name: string, dir: string, recursive: boolean, folder?: string, refs?: ImageRef[]) => {
      let images = refs ?? (await window.api.scanFolder(dir, recursive))
      if (!images.length) return null
      const id = uid()
      if (o.copy) images = await window.api.copyImages(id, images, dir)
      const board: Board = {
        id,
        name,
        kind: o.copy ? 'collection' : refs ? 'files' : 'folder',
        tags: [],
        folderId: folder,
        source: dir,
        ...(recursive ? {} : { recursive: false }),
        images,
        createdAt: now,
        syncedAt: now
      }
      return board
    }

    let made: Board[] = []
    if (o.choice === 'top') {
      made = [await collection(info.name, info.path, false, folderId)].filter((b): b is Board => !!b)
    } else if (o.choice === 'one') {
      if (allSubs) {
        made = [await collection(info.name, info.path, true, folderId)].filter((b): b is Board => !!b)
      } else {
        const refs = [
          ...(await window.api.scanFolder(info.path, false)),
          ...(await Promise.all(o.subfolders.map((p) => window.api.scanFolder(p)))).flat()
        ]
        made = [await collection(info.name, info.path, true, folderId, refs)].filter((b): b is Board => !!b)
      }
    } else {
      const group: Folder = { id: uid(), name: info.name, parentId: folderId, shortcuts: [], createdAt: now }
      setLibrary((l) => ({ ...l, folders: [...l.folders, group] }))
      const subs = info.subfolders.filter((x) => o.subfolders.includes(x.path))
      const parts = await Promise.all([
        info.direct ? collection(`${info.name} (loose images)`, info.path, false, group.id) : null,
        ...subs.map((x) => collection(x.name, x.path, true, group.id))
      ])
      made = parts.filter((b): b is Board => !!b)
    }
    if (!made.length) return notify('Nothing to add: the chosen folders have no images.')
    setBoards((list) => [...list, ...made])
    const images = made.reduce((a, b) => a + b.images.length, 0)
    notify(
      made.length === 1
        ? `Added ${images} images from ${info.name}.`
        : `Added ${made.length} collections (${images} images) in the folder “${info.name}”.`
    )
  }

  const addImages = async () => {
    const paths = await window.api.pickImages()
    if (!paths.length) return
    const images = await window.api.refsForFiles(paths)
    create({ name: 'Images', kind: 'files', images })
  }

  const addCollection = () => {
    const b = create({ name: 'New collection', kind: 'collection', images: [] })
    go({ name: 'library', boardId: b.id })
  }

  const makeFolder = (name: string) => {
    const f: Folder = { id: uid(), name: name.trim() || 'New folder', parentId: folderId, shortcuts: [], createdAt: Date.now() }
    setLibrary((l) => ({ ...l, folders: [...l.folders, f] }))
    setNewFolder(null)
  }

  const updateFolder = (patch: Partial<Folder>) =>
    setLibrary((l) => ({ ...l, folders: l.folders.map((f) => (f.id === folderId ? { ...f, ...patch } : f)) }))

  const removeFolder = () => {
    if (!folderId) return
    const out = deleteFolder(folders, boards, folderId)
    setBoards(() => out.boards)
    setLibrary((l) => ({ ...l, folders: out.folders }))
    notify('Folder deleted. What was inside moved up one level.')
    go({ name: 'library', folderId: folder?.parentId })
  }

  const removeShortcut = (boardId: string) =>
    setLibrary((l) => ({
      ...l,
      folders: l.folders.map((f) => (f.id === folderId ? { ...f, shortcuts: f.shortcuts.filter((s) => s !== boardId) } : f))
    }))

  const empty = !subfolders.length && !here.length && !shortcuts.length

  return (
    <div className="page-wide">
      {folder && (
        <nav aria-label="Folder path" className="mb-3 flex flex-wrap items-center gap-1 text-muted">
          <button type="button" onClick={() => go({ name: 'library' })} className="hover:text-ink">
            Library
          </button>
          {path.slice(0, -1).map((f) => (
            <span key={f.id} className="flex items-center gap-1">
              <ArrowRight size={13} />
              <button type="button" onClick={() => go({ name: 'library', folderId: f.id })} className="hover:text-ink">
                {f.name}
              </button>
            </span>
          ))}
          <ArrowRight size={13} />
        </nav>
      )}

      <div className="flex flex-wrap items-center gap-3 pb-5">
        {folder ? (
          <input
            aria-label="Folder name"
            value={folder.name}
            onChange={(e) => updateFolder({ name: e.target.value })}
            className="-ml-1 min-w-0 flex-1 rounded-md bg-transparent px-1 text-[22px] font-semibold tracking-[-0.01em] text-ink outline-none hover:bg-surface focus:bg-surface focus:ring-1 focus:ring-blue"
          />
        ) : (
          <h1 className="mr-auto text-[22px] font-semibold tracking-[-0.01em] text-ink">Library</h1>
        )}
        <Button onClick={addFolder}>
          <FolderIcon size={16} /> Add folder
        </Button>
        <Button onClick={() => setPinterestOpen(true)}>
          <Link size={16} /> Pinterest board
        </Button>
        <Button onClick={addImages}>
          <Images size={16} /> Add images
        </Button>
        <Button tone="ghost" onClick={addCollection}>
          <Plus size={16} /> New collection
        </Button>
        {newFolder === null ? (
          <Button tone="ghost" onClick={() => setNewFolder('')}>
            <Plus size={16} /> New folder
          </Button>
        ) : (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              makeFolder(newFolder)
            }}
          >
            <input
              autoFocus
              aria-label="New folder name"
              value={newFolder}
              placeholder="Folder name, e.g. Human"
              onChange={(e) => setNewFolder(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setNewFolder(null)}
              className="h-9 w-48 rounded-md bg-surface px-2.5 text-ink outline-none ring-1 ring-line focus:ring-blue"
            />
            <Button type="submit">Create</Button>
          </form>
        )}
      </div>

      {folder && (
        <div className="-mt-2 mb-5 flex flex-wrap items-center gap-3 text-muted">
          <label className="flex items-center gap-2">
            Inside
            <FolderSelect
              value={folder.parentId}
              onChange={(parentId) => {
                if (!canMoveFolder(folders, folder.id, parentId)) return notify('A folder can’t go inside itself.')
                updateFolder({ parentId })
              }}
              exclude={folder.id}
            />
          </label>
          {confirmDelete ? (
            <span className="flex items-center gap-1">
              <Button tone="danger" onClick={removeFolder}>
                Delete folder (keep what’s inside)
              </Button>
              <Button tone="ghost" onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
            </span>
          ) : (
            <Button tone="ghost" onClick={() => setConfirmDelete(true)}>
              <Trash size={16} /> Delete folder
            </Button>
          )}
        </div>
      )}

      {pinterestOpen && <PinterestForm folderId={folderId} onClose={() => setPinterestOpen(false)} />}
      {sheet && <ImportSheet info={sheet} onCancel={() => setSheet(null)} onImport={(o) => void importFolder(sheet, o)} />}

      {boards.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-1.5">
          <input
            type="search"
            aria-label="Search collections"
            value={query}
            placeholder="Search names and tags"
            onChange={(e) => setQuery(e.target.value)}
            className="mr-2 h-8 w-64 rounded-full bg-surface px-3.5 text-[13px] text-ink outline-none ring-1 ring-line placeholder:text-muted/70 focus:ring-blue"
          />
          <button
            type="button"
            aria-pressed={favOnly}
            onClick={() => setFavOnly((v) => !v)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] ring-1 transition-colors ${
              favOnly ? 'bg-blue-soft text-blue ring-blue' : 'text-muted ring-line hover:text-ink'
            }`}
          >
            <Star size={13} filled={favOnly} /> Favorites
          </button>
          {used.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by tag">
              {['all', ...used].map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={tag === c}
                  onClick={() => setTag(c)}
                  className={`h-8 rounded-full px-3 text-[13px] ring-1 transition-colors ${
                    tag === c ? 'bg-blue-soft text-blue ring-blue' : 'text-muted ring-line hover:text-ink'
                  }`}
                >
                  {c === 'all' ? 'All' : label(c)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {searching ? (
        results.length ? (
          <TileGrid>
            {results.map((b) => (
              <BoardTile key={b.id} board={b} where={folderLabel(folders, b.folderId) || 'Library'} />
            ))}
          </TileGrid>
        ) : (
          <Empty title="Nothing matches">Try another word, or clear the filters.</Empty>
        )
      ) : !boards.length && !folders.length ? (
        <Empty title="Your library is empty">
          Add a folder of reference photos, paste a Pinterest board link, or start a collection you fill by dragging images from
          your browser.
        </Empty>
      ) : empty ? (
        <Empty title="This folder is empty">
          Add collections here with the buttons above, or open a collection and choose this folder under “Folder”.
        </Empty>
      ) : (
        <TileGrid>
          {subfolders.map((f) => (
            <FolderTile key={f.id} folder={f} />
          ))}
          {here.map((b) => (
            <BoardTile key={b.id} board={b} />
          ))}
          {shortcuts.map((b) => (
            <BoardTile key={`s-${b.id}`} board={b} shortcut onRemoveShortcut={() => removeShortcut(b.id)} />
          ))}
        </TileGrid>
      )}
    </div>
  )
}

function TileGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(clamp(240px,15vw,340px),1fr))] gap-5">{children}</div>
}

function BoardTile({
  board,
  shortcut,
  where,
  onRemoveShortcut
}: {
  board: Board
  shortcut?: boolean
  /** Folder label, shown in search results. */
  where?: string
  onRemoveShortcut?: () => void
}) {
  const go = useApp((s) => s.go)
  const missing = useApp((s) => s.missing[board.id]?.length ?? 0)
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label={`${board.name}${shortcut ? ', shortcut' : ''}, ${board.images.length} images`}
        onClick={() => go({ name: 'library', boardId: board.id })}
        className="block w-full text-left"
      >
        <div className="relative">
          <Mosaic images={board.images} />
          {shortcut && (
            <span title="Shortcut: this collection lives in another folder" className="absolute bottom-2 left-2 flex h-6 items-center gap-1 rounded-md bg-bg/85 px-1.5 text-[12px] text-ink">
              <Link size={12} /> Shortcut
            </span>
          )}
          {board.favorite && (
            <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-md bg-bg/85 text-blue" title="Favorite">
              <Star size={13} filled />
            </span>
          )}
          {missing > 0 && (
            <span className="absolute bottom-2 right-2 flex h-6 items-center rounded-md bg-bg/90 px-1.5 text-[12px] text-red">
              {missing} missing
            </span>
          )}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate font-semibold text-ink group-hover:text-blue">{board.name}</span>
          <span className="tnum text-[12.5px] text-muted">{board.images.length}</span>
        </div>
        <div className="truncate text-[12.5px] text-muted">{[KIND_LABEL[board.kind], ...board.tags].join(', ')}</div>
        {where && <div className="truncate text-[12.5px] text-muted">In {where}</div>}
      </button>
      {onRemoveShortcut && (
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

function FolderTile({ folder }: { folder: Folder }) {
  const go = useApp((s) => s.go)
  const boards = useApp((s) => s.boards)
  const folders = useApp((s) => s.library.folders)
  const cover = folderCover(folders, boards, folder.id)
  const count = folderItemCount(folders, boards, folder.id)
  return (
    <button
      type="button"
      aria-label={`${folder.name}, folder, ${count === 1 ? '1 item' : `${count} items`}`}
      onClick={() => go({ name: 'library', folderId: folder.id })}
      className="group text-left"
    >
      <div className="relative">
        {/* A second edge behind the cover, so a folder reads as a stack, not a single collection. */}
        <div className="absolute inset-x-3 -top-1.5 h-4 rounded-t-md bg-raised ring-1 ring-line" />
        <div className="relative">
          <Mosaic images={cover} />
        </div>
        <span className="absolute bottom-2 left-2 flex h-6 items-center gap-1 rounded-md bg-bg/85 px-1.5 text-[12px] text-ink">
          <FolderIcon size={12} /> Folder
        </span>
      </div>
      <div className="mt-2 truncate font-semibold text-ink group-hover:text-blue">{folder.name}</div>
      <div className="text-[12.5px] text-muted">{count === 1 ? '1 item' : `${count} items`}</div>
    </button>
  )
}

/** Pick a folder, shown with its full path; "Library" means the top level. */
function FolderSelect({
  value,
  onChange,
  exclude,
  label: ariaLabel = 'Folder'
}: {
  value?: string
  onChange: (id?: string) => void
  exclude?: string
  label?: string
}) {
  const folders = useApp((s) => s.library.folders)
  const options = folders
    .filter((f) => !exclude || !descendantIds(folders, exclude).has(f.id))
    .map((f) => ({ id: f.id, label: folderLabel(folders, f.id) }))
    .sort((a, b) => a.label.localeCompare(b.label))
  return (
    <select
      aria-label={ariaLabel}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      className="h-9 rounded-md bg-surface px-2.5 text-ink outline-none ring-1 ring-line focus:ring-blue"
    >
      <option value="">Library (top level)</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

/** A board cover that fits what the board holds: empty, one image, two side by side, or one large and two small. */
function Mosaic({ images }: { images: ImageRef[] }) {
  const [a, b, c] = images
  const frame = 'aspect-[4/3] overflow-hidden rounded-md bg-surface ring-1 ring-line'
  if (!a) {
    return (
      <div className={`${frame} flex items-center justify-center text-muted`}>
        <Images size={28} />
      </div>
    )
  }
  if (!b) {
    return (
      <div className={frame}>
        <Cover img={a} size={480} />
      </div>
    )
  }
  if (!c) {
    return (
      <div className={`${frame} grid grid-cols-2 gap-0.5`}>
        <Cover img={a} />
        <Cover img={b} />
      </div>
    )
  }
  return (
    <div className={`${frame} grid grid-cols-[2fr_1fr] grid-rows-2 gap-0.5`}>
      <Cover img={a} className="row-span-2" size={480} />
      <Cover img={b} />
      <Cover img={c} />
    </div>
  )
}

function Cover({ img, className = '', size = 240 }: { img: ImageRef; className?: string; size?: number }) {
  // Most references are portrait figures: crop from the upper part so heads stay in the cover.
  return (
    <img src={thumbUrl(img.path, size)} alt="" loading="lazy" className={`h-full w-full object-cover object-[center_20%] ${className}`} />
  )
}

function PinterestForm({ onClose, folderId }: { onClose: () => void; folderId?: string }) {
  const setBoards = useApp((s) => s.setBoards)
  const go = useApp((s) => s.go)
  const notify = useApp((s) => s.notify)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [boardId] = useState(uid)
  const progress = usePinterestProgress(boardId)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    setBusy(true)
    setError('')
    try {
      const result = await window.api.importPinterest(boardId, url.trim())
      const board: Board = {
        id: boardId,
        name: result.name,
        kind: 'pinterest',
        tags: [],
        folderId,
        source: url.trim(),
        images: result.images,
        createdAt: Date.now(),
        syncedAt: Date.now()
      }
      setBoards((list) => [...list, board])
      notify(syncMessage(result))
      onClose()
      go({ name: 'library', boardId })
    } catch (err) {
      setError(cleanError(err))
      void window.api.removeBoardFiles(boardId)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mb-6 rounded-lg bg-surface p-4 ring-1 ring-line">
      <label htmlFor="pin-url" className="block pb-2 font-semibold">
        Paste a link to a public Pinterest board
      </label>
      <div className="flex gap-2">
        <input
          id="pin-url"
          autoFocus
          value={url}
          disabled={busy}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://pinterest.com/username/boardname"
          className="h-9 min-w-0 flex-1 rounded-md bg-bg px-3 text-ink outline-none ring-1 ring-line focus:ring-blue"
        />
        <Button tone="primary" type="submit" disabled={busy || !url.trim()}>
          {busy ? 'Syncing…' : 'Sync board'}
        </Button>
        <Button tone="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
      </div>
      <p className="mt-2 text-[12.5px] text-muted">
        {busy && progress
          ? progressText(progress)
          : 'Images are saved on this computer, so practice works offline. For personal practice only.'}
      </p>
      {error && <p className="mt-1 text-[13px] text-red">{error}</p>}
    </form>
  )
}

/** Say plainly what a sync got, and what to do when it got less than the board holds. */
function syncMessage(r: PinterestImport): string {
  const { found, expected, partial, failed } = r.report
  if (partial) {
    const read = expected ? `${found} of ${expected}` : `${found}`
    return `Pinterest stopped answering after ${read} pins. You have ${r.images.length} images; press Sync again to get the rest.`
  }
  if (failed) return `Synced ${r.images.length} images. ${failed} could not be downloaded; press Sync again to retry them.`
  const skipped = expected > found ? ` (${expected - found} pins without a picture, like videos, were skipped)` : ''
  return `Synced ${r.images.length} images from ${r.name}${skipped}.`
}

function usePinterestProgress(boardId: string): PinterestProgress | null {
  const [p, setP] = useState<PinterestProgress | null>(null)
  useEffect(() => window.api.onPinterestProgress((x) => x.boardId === boardId && setP(x)), [boardId])
  return p
}

function progressText(p: PinterestProgress): string {
  return p.stage === 'list'
    ? `Finding pins: ${p.done}${p.total ? ` of ${p.total}` : ''}`
    : `Downloading images: ${p.done} of ${p.total}`
}

function cleanError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

function BoardDetail({ board }: { board: Board }) {
  const allBoards = useApp((s) => s.boards)
  const allTags = useMemo(() => tagSuggestions(allBoards), [allBoards])
  const updateBoard = useApp((s) => s.updateBoard)
  const setBoards = useApp((s) => s.setBoards)
  const folders = useApp((s) => s.library.folders)
  const favoriteImages = useApp((s) => s.library.favoriteImages)
  const setLibrary = useApp((s) => s.setLibrary)
  const go = useApp((s) => s.go)
  const notify = useApp((s) => s.notify)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const progress = usePinterestProgress(board.id)
  const [dragOver, setDragOver] = useState(false)
  const missingIds = useApp((s) => s.missing[board.id])
  const missing = useMemo(() => new Set(missingIds ?? []), [missingIds])

  useEffect(() => {
    void useApp.getState().checkMissing()
  }, [board.id])

  /** Rescanned images keep the ids they had, so favorites and history still match after a relink. */
  const keepIds = (scanned: ImageRef[]) => {
    const byPath = new Map(board.images.map((i) => [i.path.toLowerCase(), i]))
    return scanned.map((r) => byPath.get(r.path.toLowerCase()) ?? r)
  }

  /** The folder was moved or renamed: find it again and point every image at its new place. */
  const findFolder = async () => {
    const dir = await window.api.pickFolder()
    if (!dir || !board.source) return
    const found = await window.api.relinkFolder(board.source, dir, board.images.map((i) => i.path))
    const count = found.filter(Boolean).length
    if (!count) return notify('None of the images are in that folder. Pick the folder this collection came from.')
    updateBoard(board.id, { source: dir, images: board.images.map((img, k) => (found[k] ? { ...img, path: found[k]! } : img)) })
    notify(`Found ${count} of ${board.images.length} images in the new place.`)
    void useApp.getState().checkMissing()
  }

  const removeMissing = () => {
    updateBoard(board.id, { images: board.images.filter((i) => !missing.has(i.id)) })
    notify(`Removed ${missing.size} missing ${missing.size === 1 ? 'image' : 'images'} from the collection.`)
    void useApp.getState().checkMissing()
  }

  const resync = async () => {
    setBusy(true)
    try {
      if (board.kind === 'folder' && board.source) {
        const images = keepIds(await window.api.scanFolder(board.source, board.recursive !== false))
        updateBoard(board.id, { images, syncedAt: Date.now() })
        void useApp.getState().checkMissing()
        notify(`${images.length} images in the folder.`)
      } else if (board.kind === 'pinterest' && board.source) {
        const r = await window.api.importPinterest(board.id, board.source)
        updateBoard(board.id, { images: r.images, syncedAt: Date.now() })
        notify(syncMessage(r))
      }
    } catch (err) {
      notify(board.kind === 'folder' ? 'The folder can’t be found. If you moved or renamed it, use Find folder.' : cleanError(err))
    } finally {
      setBusy(false)
    }
  }

  const addFiles = async () => {
    const paths = await window.api.pickImages()
    if (!paths.length) return
    const refs = await window.api.refsForFiles(paths)
    updateBoard(board.id, { images: mergeImages(board.images, refs) })
  }

  /** Dropped or pasted images: files on disk are referenced, everything else is saved into the collection. */
  const importData = async (data: DataTransfer) => {
    const added: ImageRef[] = []
    const files = [...data.files]
    try {
      for (const f of files) {
        const path = window.api.pathForFile(f)
        if (path) added.push(...(await window.api.refsForFiles([path])))
        else if (f.type.startsWith('image/')) {
          added.push(await window.api.importBytes(board.id, f.name, new Uint8Array(await f.arrayBuffer())))
        }
      }
      if (!files.length) {
        const text = data.getData('text/uri-list') || data.getData('text/plain')
        const urls = text
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter((s) => /^(https?:|data:image)/.test(s))
        for (const u of urls) added.push(await window.api.importUrl(board.id, u))
      }
    } catch (err) {
      notify(cleanError(err))
    }
    if (added.length) {
      updateBoard(board.id, { images: mergeImages(board.images, added) })
      notify(`Added ${added.length} ${added.length === 1 ? 'image' : 'images'}.`)
    }
  }

  useEffect(() => {
    if (board.kind !== 'collection') return
    const onPaste = (e: ClipboardEvent) => {
      if (e.target instanceof HTMLInputElement || !e.clipboardData) return
      e.preventDefault()
      void importData(e.clipboardData)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  const remove = () => {
    setBoards((list) => list.filter((b) => b.id !== board.id))
    setLibrary((l) => ({ ...l, folders: dropShortcuts(l.folders, board.id) }))
    if (board.kind === 'pinterest' || board.kind === 'collection') void window.api.removeBoardFiles(board.id)
    go({ name: 'library', folderId: board.folderId })
  }

  /** Turn a linked collection into one the app keeps its own copy of. */
  const keepCopy = async () => {
    setBusy(true)
    try {
      const images = await window.api.copyImages(board.id, board.images, board.kind === 'folder' ? board.source : undefined)
      updateBoard(board.id, { kind: 'collection', images })
      notify(`Copied ${images.length} images into the app. Moving or deleting the originals won't affect this collection now.`)
    } finally {
      setBusy(false)
    }
  }

  const home = folders.find((f) => f.id === board.folderId)
  const alsoIn = foldersWithShortcut(folders, board.id)

  const moveTo = (folderId?: string) => {
    updateBoard(board.id, { folderId })
    // A shortcut in its new home would be a duplicate.
    if (folderId) setShortcut(folderId, false)
  }

  const setShortcut = (folderId: string, on: boolean) =>
    setLibrary((l) => ({
      ...l,
      folders: l.folders.map((f) =>
        f.id !== folderId
          ? f
          : { ...f, shortcuts: on ? [...new Set([...f.shortcuts, board.id])] : f.shortcuts.filter((x) => x !== board.id) }
      )
    }))

  const toggleFavoriteImage = (id: string) =>
    setLibrary((l) => ({
      ...l,
      favoriteImages: l.favoriteImages.includes(id) ? l.favoriteImages.filter((x) => x !== id) : [...l.favoriteImages, id]
    }))

  const removeImage = (id: string) => updateBoard(board.id, { images: board.images.filter((i) => i.id !== id) })

  const canDrop = board.kind === 'collection' || board.kind === 'files'

  return (
    <div
      className="page-wide"
      onDragOver={(e) => {
        if (!canDrop) return
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!canDrop) return
        e.preventDefault()
        setDragOver(false)
        void importData(e.dataTransfer)
      }}
    >
      <button
        type="button"
        onClick={() => go({ name: 'library', folderId: board.folderId })}
        className="mb-3 inline-flex items-center gap-1 text-muted hover:text-ink"
      >
        <ArrowLeft size={15} /> {home ? folderLabel(folders, home.id) : 'Library'}
      </button>
      <div className="flex flex-wrap items-center gap-3 pb-2">
        <input
          aria-label="Board name"
          value={board.name}
          onChange={(e) => updateBoard(board.id, { name: e.target.value })}
          className="-ml-1 min-w-0 flex-1 rounded-md bg-transparent px-1 text-[22px] font-semibold tracking-[-0.01em] text-ink outline-none hover:bg-surface focus:bg-surface focus:ring-1 focus:ring-blue"
        />
        <IconButton
          label={board.favorite ? 'Remove from favorites' : 'Add to favorites'}
          active={board.favorite}
          onClick={() => updateBoard(board.id, { favorite: !board.favorite })}
        >
          <Star size={17} filled={board.favorite} />
        </IconButton>
        {(board.kind === 'folder' || board.kind === 'pinterest') && (
          <Button onClick={resync} disabled={busy}>
            <Refresh size={16} /> {busy ? (progress ? progressText(progress) : 'Syncing…') : board.kind === 'folder' ? 'Rescan folder' : 'Sync again'}
          </Button>
        )}
        {(board.kind === 'folder' || board.kind === 'files') && (
          <Button tone="ghost" onClick={keepCopy} disabled={busy} title="Copy the images into the app, so moving or deleting the originals doesn't matter">
            Copy into the app
          </Button>
        )}
        {(board.kind === 'files' || board.kind === 'collection') && (
          <Button onClick={addFiles}>
            <Images size={16} /> Add images
          </Button>
        )}
        {confirmDelete ? (
          <span className="flex items-center gap-1">
            <Button tone="danger" onClick={remove}>
              Delete board
            </Button>
            <Button tone="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
          </span>
        ) : (
          <Button tone="ghost" onClick={() => setConfirmDelete(true)}>
            <Trash size={16} /> Delete
          </Button>
        )}
      </div>
      <p className="pb-3 text-muted">
        {board.images.length} images
        {board.source ? `, from ${board.source}` : ''}
        {board.kind === 'pinterest' && ' (saved on this computer)'}
        {board.kind === 'folder' && `${board.recursive === false ? ' (not its sub-folders)' : ''}. Linked: your files stay where they are, and deleting the collection does not delete them.`}
        {board.kind === 'collection' && board.source && ' (copied into the app)'}
      </p>
      <div className="pb-3">
        <TagEditor tags={board.tags} onChange={(tags) => updateBoard(board.id, { tags })} suggestions={allTags} />
      </div>
      <div className="flex flex-wrap items-center gap-3 pb-5 text-muted">
        <label className="flex items-center gap-2">
          Folder
          <FolderSelect value={board.folderId} onChange={moveTo} />
        </label>
        {folders.length > 0 && (
          <label className="flex items-center gap-2">
            Also show in
            <select
              aria-label="Add a shortcut in another folder"
              value=""
              onChange={(e) => e.target.value && setShortcut(e.target.value, true)}
              className="h-9 rounded-md bg-surface px-2.5 text-ink outline-none ring-1 ring-line focus:ring-blue"
            >
              <option value="">Add a shortcut…</option>
              {folders
                .filter((f) => f.id !== board.folderId && !f.shortcuts.includes(board.id))
                .map((f) => ({ id: f.id, label: folderLabel(folders, f.id) }))
                .sort((a, b) => a.label.localeCompare(b.label))
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
            </select>
          </label>
        )}
        {alsoIn.map((f) => (
          <span key={f.id} className="inline-flex h-7 items-center gap-1 rounded-full bg-raised pl-3 pr-1 text-[13px] text-ink">
            <Link size={12} /> {folderLabel(folders, f.id)}
            <button
              type="button"
              aria-label={`Remove the shortcut in ${f.name}`}
              onClick={() => setShortcut(f.id, false)}
              className="flex h-5 w-5 items-center justify-center rounded-full text-muted hover:bg-line hover:text-ink"
            >
              <Close size={12} />
            </button>
          </span>
        ))}
      </div>

      {missing.size > 0 && (
        <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 rounded-lg bg-red/10 px-4 py-3 ring-1 ring-red/40">
          <span className="mr-auto text-ink">
            {missing.size} of {board.images.length} images can’t be found
            {board.kind === 'folder' ? '. If you moved or renamed the folder, find it again.' : ': they were moved or deleted outside the app.'}{' '}
            Sessions skip them; old sessions still show their kept copies.
          </span>
          {board.kind === 'folder' && <Button onClick={findFolder}>Find folder…</Button>}
          <Button tone="ghost" onClick={removeMissing}>
            Remove missing
          </Button>
        </div>
      )}

      {canDrop && (
        <div
          className={`mb-5 rounded-lg border border-dashed px-4 py-5 text-center transition-colors ${
            dragOver ? 'border-blue bg-blue-soft text-blue' : 'border-line text-muted'
          }`}
        >
          Drag images here from your browser or a folder
          {board.kind === 'collection' ? ', or paste one with Ctrl+V.' : '.'}
        </div>
      )}

      {board.images.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(clamp(150px,10vw,240px),1fr))] gap-2">
          {board.images.map((img, i) => (
            <div key={img.id} className="group relative">
              <button
                type="button"
                onClick={() => go({ name: 'viewer', boardId: board.id, index: i })}
                className="block aspect-[3/4] w-full overflow-hidden rounded-md bg-surface ring-1 ring-line hover:ring-blue"
                aria-label={`Open image ${i + 1}`}
              >
                {missing.has(img.id) ? (
                  <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-[12.5px] text-red">
                    <Images size={20} />
                    Missing
                  </span>
                ) : (
                  <img src={thumbUrl(img.path, 320)} alt="" loading="lazy" className="h-full w-full object-cover" />
                )}
              </button>
              <button
                type="button"
                aria-label={favoriteImages.includes(img.id) ? 'Remove image from favorites' : 'Add image to favorites'}
                aria-pressed={favoriteImages.includes(img.id)}
                onClick={() => toggleFavoriteImage(img.id)}
                className={`absolute left-1.5 top-1.5 h-7 w-7 items-center justify-center rounded-md bg-bg/85 ${
                  favoriteImages.includes(img.id) ? 'flex text-blue' : 'hidden text-muted hover:text-ink group-hover:flex'
                }`}
              >
                <Star size={14} filled={favoriteImages.includes(img.id)} />
              </button>
              {canDrop && (
                <button
                  type="button"
                  aria-label="Remove from board"
                  title="Remove from board"
                  onClick={() => removeImage(img.id)}
                  className="absolute right-1.5 top-1.5 hidden h-7 w-7 items-center justify-center rounded-md bg-bg/85 text-muted hover:text-red group-hover:flex"
                >
                  <Trash size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Empty title="No images yet">
          {board.kind === 'collection'
            ? 'Drag images from Google Images, Line of Action or any site, or paste them.'
            : 'Nothing found.'}
        </Empty>
      )}
    </div>
  )
}
