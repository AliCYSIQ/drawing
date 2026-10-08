import { useEffect, useMemo, useState } from 'react'
import { thumbUrl } from '@shared/api'
import { SUGGESTED_TAGS, type Board, type BoardKind, type ImageRef, type PinterestImport, type PinterestProgress } from '@shared/types'
import { ArrowLeft, Folder, Images, Link, Plus, Refresh, Trash } from '../components/Icons'
import { TagEditor } from '../components/TagEditor'
import { Button, Empty, PageHeader } from '../components/ui'
import { uid, useApp } from '../store'

const KIND_LABEL: Record<BoardKind, string> = {
  folder: 'Folder',
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

export function Library({ boardId }: { boardId?: string }) {
  const board = useApp((s) => s.boards.find((b) => b.id === boardId))
  return board ? <BoardDetail board={board} /> : <BoardList />
}

function BoardList() {
  const boards = useApp((s) => s.boards)
  const setBoards = useApp((s) => s.setBoards)
  const go = useApp((s) => s.go)
  const notify = useApp((s) => s.notify)
  const [filter, setFilter] = useState<string>('all')
  const [pinterestOpen, setPinterestOpen] = useState(false)

  const shown = filter === 'all' ? boards : boards.filter((b) => b.tags.includes(filter))
  const used = useMemo(() => [...new Set(boards.flatMap((b) => b.tags))].sort(), [boards])

  const create = (b: Omit<Board, 'id' | 'createdAt' | 'tags'> & { tags?: string[] }) => {
    const board: Board = { tags: [], ...b, id: uid(), createdAt: Date.now() }
    setBoards((list) => [...list, board])
    return board
  }

  const addFolder = async () => {
    const dir = await window.api.pickFolder()
    if (!dir) return
    const images = await window.api.scanFolder(dir)
    if (!images.length) return notify('That folder has no images in it.')
    const name = dir.split(/[\\/]/).filter(Boolean).pop() ?? 'Folder'
    create({ name, kind: 'folder', source: dir, images, syncedAt: Date.now() })
    notify(`Added ${images.length} images from ${name}.`)
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

  return (
    <div className="page-wide">
      <PageHeader title="Library">
        <Button onClick={addFolder}>
          <Folder size={16} /> Add folder
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
      </PageHeader>

      {pinterestOpen && <PinterestForm onClose={() => setPinterestOpen(false)} />}

      {used.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-1.5" role="group" aria-label="Filter by tag">
          {['all', ...used].map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={filter === c}
              onClick={() => setFilter(c)}
              className={`h-8 rounded-full px-3 text-[13px] ring-1 transition-colors ${
                filter === c ? 'bg-blue-soft text-blue ring-blue' : 'text-muted ring-line hover:text-ink'
              }`}
            >
              {c === 'all' ? 'All' : label(c)}
            </button>
          ))}
        </div>
      )}

      {!boards.length ? (
        <Empty title="Your library is empty">
          Add a folder of reference photos, paste a Pinterest board link, or start a collection you fill by dragging images from
          your browser.
        </Empty>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(clamp(240px,15vw,340px),1fr))] gap-5">
          {shown.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => go({ name: 'library', boardId: b.id })}
              className="group text-left"
            >
              <Mosaic images={b.images} />
              <div className="mt-2 flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate font-semibold text-ink group-hover:text-blue">{b.name}</span>
                <span className="tnum text-[12.5px] text-muted">{b.images.length}</span>
              </div>
              <div className="text-[12.5px] text-muted">
                {[KIND_LABEL[b.kind], ...b.tags].join(", ")}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
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

function PinterestForm({ onClose }: { onClose: () => void }) {
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
  const go = useApp((s) => s.go)
  const notify = useApp((s) => s.notify)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const progress = usePinterestProgress(board.id)
  const [dragOver, setDragOver] = useState(false)

  const resync = async () => {
    setBusy(true)
    try {
      if (board.kind === 'folder' && board.source) {
        const images = await window.api.scanFolder(board.source)
        updateBoard(board.id, { images, syncedAt: Date.now() })
        notify(`${images.length} images in the folder.`)
      } else if (board.kind === 'pinterest' && board.source) {
        const r = await window.api.importPinterest(board.id, board.source)
        updateBoard(board.id, { images: r.images, syncedAt: Date.now() })
        notify(syncMessage(r))
      }
    } catch (err) {
      notify(cleanError(err))
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
    if (board.kind === 'pinterest' || board.kind === 'collection') void window.api.removeBoardFiles(board.id)
    go({ name: 'library' })
  }

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
      <button type="button" onClick={() => go({ name: 'library' })} className="mb-3 inline-flex items-center gap-1 text-muted hover:text-ink">
        <ArrowLeft size={15} /> Library
      </button>
      <div className="flex flex-wrap items-center gap-3 pb-2">
        <input
          aria-label="Board name"
          value={board.name}
          onChange={(e) => updateBoard(board.id, { name: e.target.value })}
          className="-ml-1 min-w-0 flex-1 rounded-md bg-transparent px-1 text-[22px] font-semibold tracking-[-0.01em] text-ink outline-none hover:bg-surface focus:bg-surface focus:ring-1 focus:ring-blue"
        />
        {(board.kind === 'folder' || board.kind === 'pinterest') && (
          <Button onClick={resync} disabled={busy}>
            <Refresh size={16} /> {busy ? (progress ? progressText(progress) : 'Syncing…') : board.kind === 'folder' ? 'Rescan folder' : 'Sync again'}
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
        {board.kind === 'folder' && '. Your files stay where they are; deleting the board does not delete them.'}
      </p>
      <div className="pb-5">
        <TagEditor tags={board.tags} onChange={(tags) => updateBoard(board.id, { tags })} suggestions={allTags} />
      </div>

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
                <img src={thumbUrl(img.path, 320)} alt="" loading="lazy" className="h-full w-full object-cover" />
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
