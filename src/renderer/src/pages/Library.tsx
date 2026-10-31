import { useEffect, useMemo, useState } from 'react'
import { SUGGESTED_TAGS, type Folder, type FolderInfo, type FoundFile, type LibraryImage, type PinterestImport, type PinterestProgress } from '@shared/types'
import { useContextMenu, SEPARATOR, type MenuEntry } from '../components/ContextMenu'
import { DeleteDialog, FolderBrowser, isDraggingItems, libraryPasteWins, practiceFolders } from '../components/FolderBrowser'
import { Folder as FolderIcon, Images, Link, Play, Plus, Refresh, Star } from '../components/Icons'
import { ImportSheet, type ImportOptions } from '../components/ImportSheet'
import { TagEditor } from '../components/TagEditor'
import { Button, Empty } from '../components/ui'
import { INCLUDE, skippedPaths } from '../lib/importPlan'
import {
  addFiles,
  applyPinterestSync,
  assetMap,
  deleteItems,
  descendantIds,
  imagesIn,
  importScan,
  rescanFolder,
  searchLibrary,
  tagsInUse,
  type SortKey
} from '../lib/library'
import { uid, useApp } from '../store'

const label = (t: string) => t[0].toUpperCase() + t.slice(1)

export function cleanError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** Say plainly what a sync got, and why it got less than the board holds. */
export function syncMessage(r: PinterestImport, added: number): string {
  const { found, expected, failed, limited, skipped, diagnostics: d } = r.report
  const parts: string[] = [`${r.pins.length} images from “${r.name}”${added ? ` (${added} new)` : ''}.`]
  const of = expected ? `${found} of ${expected}` : `${found}`
  const pages = d ? ` (${d.pages.length} ${d.pages.length === 1 ? 'page' : 'pages'} read)` : ''
  if (limited) parts.push(`The board has more than ${found} pins; only the first ${found} are read in one sync.`)
  else if (d?.stop === 'rss') parts.push('Only Pinterest’s short RSS feed could be read (its latest pins); images you had are kept. Sync again later for the rest.')
  else if (d?.stop === 'failed') parts.push(`Pinterest stopped answering after ${of} pins${pages}; images you had are kept. Sync again for the rest.`)
  else if (d?.stop === 'short') parts.push(`Pinterest listed only ${of} pins${pages}${skipped ? `, plus ${skipped} that aren’t pictures` : ''}; images you had are kept. Sync again later.`)
  if (failed) parts.push(`${failed} could not be downloaded; Sync again retries them.`)
  if (skipped && d?.stop !== 'short') parts.push(`${skipped} ${skipped === 1 ? 'item is not a picture' : 'items are not pictures'} (videos, stories) and ${skipped === 1 ? 'was' : 'were'} left out.`)
  return parts.join(' ')
}

function usePinterestProgress(folderId: string | null): PinterestProgress | null {
  const [p, setP] = useState<PinterestProgress | null>(null)
  useEffect(() => (folderId ? window.api.onPinterestProgress((x) => x.boardId === folderId && setP(x)) : undefined), [folderId])
  return p
}

function progressText(p: PinterestProgress): string {
  return p.stage === 'list' ? `Finding pins: ${p.done}${p.total ? ` of ${p.total}` : ''}` : `Downloading images: ${p.done} of ${p.total}`
}

/** Every pin already saved anywhere in the library, so a sync never downloads it twice. */
function knownPins(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const a of useApp.getState().library.assets) if (a.pinId) out[a.pinId] = a.path
  return out
}

export function Library({ folderId: asked }: { folderId?: string }) {
  // A folder that is gone (deleted, or undone away) shows the top level instead.
  const folderId = useApp((s) => (asked && s.library.folders.some((f) => f.id === asked) ? asked : undefined))
  const library = useApp((s) => s.library)
  const { folders, images } = library
  const changeLibrary = useApp((s) => s.changeLibrary)
  const setLibrary = useApp((s) => s.setLibrary)
  const go = useApp((s) => s.go)
  const notify = useApp((s) => s.notify)
  const sort = useApp((s) => s.settings.librarySort ?? 'name')
  const updateSettings = useApp((s) => s.updateSettings)
  const missingList = useApp((s) => s.missing)
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string>('all')
  const [favOnly, setFavOnly] = useState(false)
  const [pinterestOpen, setPinterestOpen] = useState(false)
  const [naming, setNaming] = useState<string | null>(null)
  const [sheet, setSheet] = useState<FolderInfo | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [gone, setGone] = useState<{ folderId: string; images: LibraryImage[] } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { open: openMenu, menu } = useContextMenu()
  const progress = usePinterestProgress(busy ? (folderId ?? null) : null)

  useEffect(() => {
    void useApp.getState().checkMissing()
  }, [folderId])

  const folder = folders.find((f) => f.id === folderId)
  const tags = useMemo(() => tagsInUse(folders), [folders])
  const searching = query.trim() !== '' || tag !== 'all' || favOnly
  const results = useMemo(() => {
    if (!searching) return undefined
    const lib = { folders, images }
    const base = query.trim() ? searchLibrary(lib, query) : { folders, images: favOnly ? images : [] }
    const favs = new Set(library.favoriteImages)
    return {
      folders: base.folders.filter((f) => (tag === 'all' || (f.tags ?? []).includes(tag)) && (!favOnly || f.favorite)),
      // Images have no tags of their own; a tag filter shows folders.
      images: tag === 'all' ? base.images.filter((i) => !favOnly || favs.has(i.assetId)) : []
    }
  }, [searching, query, tag, favOnly, folders, images, library.favoriteImages])

  const missingHere = useMemo(() => {
    const gone = new Set(missingList)
    return imagesIn(images, folderId).filter((i) => gone.has(i.assetId))
  }, [missingList, images, folderId])

  // ----- adding -----

  const newFolder = (name: string) => {
    setNaming(null)
    const f: Folder = { id: uid(), name: name.trim() || 'New folder', ...(folderId ? { parentId: folderId } : {}), createdAt: Date.now(), tags: [] }
    changeLibrary('new folder', (l) => ({ ...l, folders: [...l.folders, f] }), `Made the folder “${f.name}”.`)
  }

  const addFolder = async () => {
    const dir = await window.api.pickFolder()
    if (!dir) return
    const info = await window.api.inspectFolder(dir)
    if (!info.direct && !info.subfolders.length) return notify('That folder has no images in it.')
    if (!info.subfolders.length) return importFolder(info, { choice: 'split', subfolders: [], copy: false, remember: false })
    const remembered = useApp.getState().settings.folderImport
    if (remembered !== 'ask') return importFolder(info, { choice: remembered, subfolders: info.subfolders.map((x) => x.path), copy: false, remember: false })
    setSheet(info)
  }

  /** Add a disk folder the way the import sheet (or the remembered choice) says; the same rules as its preview. */
  const importFolder = async (info: FolderInfo, o: ImportOptions) => {
    setSheet(null)
    if (o.remember) updateSettings({ folderImport: o.choice })
    setBusy('Reading the folder…')
    try {
      let scan = await window.api.scanTree(info.path)
      const skip = skippedPaths(info.tree, o.choice, o.subfolders)
      if (o.copy) {
        // Copied into the app: the copies are what the library keeps; the originals are only read.
        setBusy('Copying images into the app…')
        const target = uid()
        const all = scan.flatMap((d) => d.files.map((f) => f.path))
        const copies = await window.api.copyFiles(target, all, info.path)
        const byPath = new Map(all.map((p, i) => [p.toLowerCase(), copies[i]]))
        scan = scan.map((d) => ({ ...d, files: d.files.map((f) => byPath.get(f.path.toLowerCase())).filter((f): f is FoundFile => !!f) }))
      }
      let made = { rootId: '', folders: 0, images: 0 }
      changeLibrary('add folder', (l) => {
        const r = importScan(l, scan, { parentId: folderId, include: INCLUDE[o.choice], skip, storage: o.copy ? 'stored' : 'linked' }, uid)
        made = r
        return r.data
      })
      if (!made.images) return notify('Nothing to add: the chosen folders have no images.')
      notify(
        made.folders > 1
          ? `Added “${info.name}”: ${made.folders} folders, ${made.images} images. Your files stay where they are.`
          : `Added ${made.images} images from “${info.name}”.`,
        { label: 'Undo', run: () => useApp.getState().undoLibrary() }
      )
      void useApp.getState().checkMissing().then(() => useApp.getState().hashPending())
    } catch (err) {
      notify(cleanError(err))
    } finally {
      setBusy(null)
    }
  }

  /** Files picked from disk are linked (your files stay where they are). */
  const addImages = async () => {
    const paths = await window.api.pickImages()
    if (!paths.length) return
    const files = await window.api.filesInfo(paths)
    putFiles(files.map((f) => ({ file: f, stored: false })))
  }

  const putFiles = (list: { file: FoundFile & { sourceUrl?: string }; stored: boolean; origin?: 'paste' | 'web' }[]) => {
    if (!list.length) return
    let added = 0
    changeLibrary('add images', (l) => {
      let data = l
      for (const group of [list.filter((x) => !x.stored), list.filter((x) => x.stored && x.origin !== 'web'), list.filter((x) => x.origin === 'web')]) {
        if (!group.length) continue
        const r = addFiles(data, group.map((x) => x.file), folderId, group[0].stored ? (group[0].origin ?? 'paste') : 'file', group[0].stored ? 'stored' : 'linked', uid)
        data = r.data
        added += r.added
      }
      return data
    })
    notify(added ? `Added ${added} ${added === 1 ? 'image' : 'images'}${folder ? ` to “${folder.name}”` : ''}.` : 'Those images are already here.')
    void useApp.getState().hashPending()
  }

  /** Dropped or pasted images: files on disk are linked; everything else (from a browser) is saved into the app. */
  const importData = async (data: DataTransfer) => {
    const out: { file: FoundFile & { sourceUrl?: string }; stored: boolean; origin?: 'paste' | 'web' }[] = []
    const files = [...data.files]
    const store = folderId ?? 'top'
    try {
      const onDisk = files.map((f) => window.api.pathForFile(f)).filter(Boolean)
      if (onDisk.length) for (const f of await window.api.filesInfo(onDisk)) out.push({ file: f, stored: false })
      for (const f of files) {
        if (window.api.pathForFile(f) || !f.type.startsWith('image/')) continue
        out.push({ file: await window.api.importBytes(store, f.name, new Uint8Array(await f.arrayBuffer())), stored: true, origin: 'paste' })
      }
      if (!files.length) {
        const text = data.getData('text/uri-list') || data.getData('text/plain')
        const urls = text
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter((s) => /^(https?:|data:image)/.test(s))
        for (const u of urls) out.push({ file: await window.api.importUrl(store, u), stored: true, origin: 'web' })
      }
    } catch (err) {
      notify(cleanError(err))
    }
    putFiles(out)
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || !e.clipboardData) return
      if (document.querySelector('[role="dialog"]')) return
      // Cut or copied library items since the last visit to another app paste themselves.
      if (libraryPasteWins()) return
      const d = e.clipboardData
      if (![...d.files].length && !/^(https?:|data:image)/.test((d.getData('text/plain') || '').trim())) return
      e.preventDefault()
      void importData(d)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  // ----- a folder that mirrors a disk folder or a Pinterest board -----

  const rescan = async (f: Folder) => {
    if (f.source?.kind !== 'disk') return
    setBusy('Rescanning…')
    try {
      await useApp.getState().checkMissing()
      const scan = await window.api.scanTree(f.source.path)
      const state = useApp.getState()
      const missing = new Set(state.missing)
      // A file that moved or was renamed is recognised by its bytes: hash only
      // new files with the size of an image that went missing here.
      const assets = assetMap(state.library.assets)
      const sub = descendantIds(state.library.folders, f.id)
      const lostSizes = new Set(
        state.library.images.filter((i) => i.folderId && sub.has(i.folderId) && missing.has(i.assetId)).map((i) => assets.get(i.assetId)?.size).filter(Boolean)
      )
      const known = new Set(state.library.assets.map((a) => a.path.toLowerCase()))
      const candidates = scan.flatMap((d) => d.files).filter((x) => !known.has(x.path.toLowerCase()) && lostSizes.has(x.size))
      if (candidates.length) {
        const hashes = await window.api.hashFiles(candidates.map((c) => c.path))
        candidates.forEach((c, i) => hashes[i] && (c.sha256 = hashes[i]!))
      }
      let r = { added: 0, relinked: 0, newFolders: 0 }
      changeLibrary('rescan', (l) => {
        const out = rescanFolder(l, f.id, scan, uid, Date.now(), missing)
        r = out
        return out.data
      })
      await useApp.getState().checkMissing()
      const left = useApp.getState().missing.length
      notify(
        [
          r.added ? `${r.added} new ${r.added === 1 ? 'image' : 'images'}` : 'No new images',
          r.newFolders ? `${r.newFolders} new ${r.newFolders === 1 ? 'folder' : 'folders'}` : '',
          r.relinked ? `${r.relinked} moved or renamed ${r.relinked === 1 ? 'file' : 'files'} found again` : '',
          left ? `${left} still missing` : ''
        ]
          .filter(Boolean)
          .join(', ') + '.'
      )
      void useApp.getState().hashPending()
    } catch {
      notify('The folder can’t be found. If you moved or renamed it, use Find folder.')
    } finally {
      setBusy(null)
    }
  }

  /** The disk folder was moved or renamed: find it again and point every image at its new place. */
  const findFolder = async (f: Folder) => {
    if (f.source?.kind !== 'disk') return
    const dir = await window.api.pickFolder()
    if (!dir) return
    const oldDir = f.source.path
    const { library: lib } = useApp.getState()
    const sub = descendantIds(lib.folders, f.id)
    const ids = [...new Set(lib.images.filter((i) => i.folderId && sub.has(i.folderId)).map((i) => i.assetId))]
    const assets = assetMap(lib.assets)
    const paths = ids.map((id) => assets.get(id)?.path ?? '')
    const found = await window.api.relinkFolder(oldDir, dir, paths)
    const count = found.filter(Boolean).length
    if (!count) return notify('None of the images are in that folder. Pick the folder this one came from.')
    const moved = new Map(ids.map((id, k) => [id, found[k]]).filter((x): x is [string, string] => !!x[1]))
    const swap = (p: string) => (p.toLowerCase().startsWith(oldDir.toLowerCase()) ? dir + p.slice(oldDir.length) : p)
    setLibrary((l) => ({
      ...l,
      assets: l.assets.map((a) => (moved.has(a.id) ? { ...a, path: moved.get(a.id)! } : a)),
      folders: l.folders.map((x) =>
        sub.has(x.id) && x.source?.kind === 'disk' ? { ...x, source: { ...x.source, path: swap(x.source.path), ...(x.source.skip ? { skip: x.source.skip.map(swap) } : {}) } } : x
      )
    }))
    notify(`Found ${count} of ${ids.length} images in the new place.`)
    void useApp.getState().checkMissing()
  }

  /** Make the images of a linked folder the app's own copies, so moving or deleting the originals doesn't matter. */
  const copyIn = async (f: Folder) => {
    setBusy('Copying images into the app…')
    try {
      const { library: lib } = useApp.getState()
      const sub = descendantIds(lib.folders, f.id)
      const assets = assetMap(lib.assets)
      const linked = [...new Set(lib.images.filter((i) => i.folderId && sub.has(i.folderId)).map((i) => i.assetId))].map((id) => assets.get(id)).filter((a) => a?.storage === 'linked')
      const copies = await window.api.copyFiles(f.id, linked.map((a) => a!.path), f.source?.kind === 'disk' ? f.source.path : undefined)
      const by = new Map(linked.map((a, k) => [a!.id, copies[k]]))
      setLibrary((l) => ({
        ...l,
        assets: l.assets.map((a) => {
          const c = by.get(a.id)
          return c ? { ...a, path: c.path, storage: 'stored' as const, origin: 'copy' as const, size: c.size, ...(c.sha256 ? { sha256: c.sha256 } : {}) } : a
        }),
        // The copies don't follow the disk folder any more.
        folders: l.folders.map((x) => {
          if (!sub.has(x.id) || x.source?.kind !== 'disk') return x
          const { source, ...rest } = x
          void source
          return rest
        })
      }))
      const done = copies.filter(Boolean).length
      notify(`Copied ${done} images into the app. Moving or deleting the originals won't affect them now.`)
    } finally {
      setBusy(null)
    }
  }

  const sync = async (f: Folder) => {
    if (f.source?.kind !== 'pinterest') return
    setBusy('Syncing…')
    try {
      const r = await window.api.importPinterest(f.id, f.source.url, knownPins())
      let out = { added: 0, gone: [] as LibraryImage[] }
      changeLibrary('sync', (l) => {
        const s = applyPinterestSync(l, f.id, r, uid)
        out = s
        return s.data
      })
      notify(syncMessage(r, out.added))
      // Pins that left the board are only removed if you say so.
      if (out.gone.length) setGone({ folderId: f.id, images: out.gone })
      void useApp.getState().checkMissing()
    } catch (err) {
      // A failed sync changes nothing: every image you had stays.
      notify(cleanError(err))
    } finally {
      setBusy(null)
    }
  }

  const removeMissing = () => {
    const list = missingHere.map((i) => ({ type: 'image' as const, id: i.id }))
    changeLibrary('remove missing', (l) => ({ ...l, ...deleteItems(l, list, 'keep') }), `Removed ${list.length} missing ${list.length === 1 ? 'image' : 'images'} from the library.`)
  }

  const removeFolder = (mode: 'keep' | 'all') => {
    if (!folder) return
    setConfirmDelete(false)
    changeLibrary('delete', (l) => ({ ...l, ...deleteItems(l, [{ type: 'folder', id: folder.id }], mode) }), `Removed the folder “${folder.name}” from the library.`)
    go({ name: 'library', folderId: folder.parentId })
  }

  const updateFolder = (patch: Partial<Folder>) => setLibrary((l) => ({ ...l, folders: l.folders.map((f) => (f.id === folderId ? { ...f, ...patch } : f)) }))

  const addMenu = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    openMenu({ clientX: r.left, clientY: r.bottom + 4 }, [
      { label: 'Folder from disk…', icon: <FolderIcon size={14} />, onClick: () => void addFolder() },
      { label: 'Images from disk…', icon: <Images size={14} />, onClick: () => void addImages() },
      { label: 'Pinterest board…', icon: <Link size={14} />, onClick: () => setPinterestOpen(true) }
    ])
  }

  const folderMenu = (e: React.MouseEvent) => {
    if (!folder) return
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const entries: MenuEntry[] = [
      { label: folder.favorite ? 'Remove from favorites' : 'Add to favorites', icon: <Star size={14} filled={folder.favorite} />, onClick: () => updateFolder({ favorite: !folder.favorite }) },
      ...(folder.source?.kind === 'disk'
        ? [
            SEPARATOR,
            { label: 'Find folder…', onClick: () => void findFolder(folder) },
            { label: 'Copy the images into the app', onClick: () => void copyIn(folder) }
          ]
        : []),
      SEPARATOR,
      { label: 'Delete folder…', danger: true, onClick: () => setConfirmDelete(true) }
    ]
    openMenu({ clientX: r.right - 220, clientY: r.bottom + 4 }, entries)
  }

  const empty = !folders.length && !images.length

  const actions = (
    <>
      {busy && <span className="text-[13px] text-muted">{progress ? progressText(progress) : busy}</span>}
      {folder && !searching && (
        <Button tone="primary" onClick={() => practiceFolders([folder.id])} title="Practice every image in this folder, sub-folders included">
          <Play size={14} /> Practice this folder
        </Button>
      )}
      {folder?.source?.kind === 'disk' && !searching && (
        <Button onClick={() => void rescan(folder)} disabled={!!busy} title={`Linked to ${folder.source.path}`}>
          <Refresh size={15} /> Rescan
        </Button>
      )}
      {folder?.source?.kind === 'pinterest' && !searching && (
        <Button onClick={() => void sync(folder)} disabled={!!busy} title={folder.source.url}>
          <Refresh size={15} /> Sync
        </Button>
      )}
      <Button onClick={addMenu} disabled={!!busy} aria-haspopup="menu">
        <Plus size={15} /> Add
      </Button>
      {naming === null ? (
        <Button tone="ghost" onClick={() => setNaming('')}>
          <FolderIcon size={15} /> New folder
        </Button>
      ) : (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            newFolder(naming)
          }}
        >
          <input
            autoFocus
            aria-label="New folder name"
            value={naming}
            placeholder="Folder name"
            onChange={(e) => setNaming(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setNaming(null)}
            onBlur={() => !naming.trim() && setNaming(null)}
            className="h-9 w-44 rounded-md bg-surface px-2.5 text-ink outline-none ring-1 ring-line focus:ring-blue"
          />
          <Button type="submit">Create</Button>
        </form>
      )}
      {folder && (
        <Button tone="ghost" aria-label="More for this folder" title="More" onClick={folderMenu} className="w-9 px-0">
          ···
        </Button>
      )}
    </>
  )

  return (
    <div
      className={`page-wide min-h-full ${dragOver ? 'outline-2 -outline-offset-8 outline-dashed outline-blue' : ''}`}
      onDragOver={(e) => {
        if (isDraggingItems() || ![...e.dataTransfer.types].some((t) => t === 'Files' || t === 'text/uri-list')) return
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={(e) => !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node) && setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false)
        if (isDraggingItems()) return
        e.preventDefault()
        void importData(e.dataTransfer)
      }}
    >
      {!empty && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <input
            type="search"
            aria-label="Search the library"
            value={query}
            placeholder="Search folders, images and tags"
            onChange={(e) => setQuery(e.target.value)}
            className="mr-2 h-8 w-72 rounded-full bg-surface px-3.5 text-[13px] text-ink outline-none ring-1 ring-line placeholder:text-muted/70 focus:ring-blue"
          />
          <button
            type="button"
            aria-pressed={favOnly}
            onClick={() => setFavOnly((v) => !v)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] ring-1 transition-colors ${favOnly ? 'bg-blue-soft text-blue ring-blue' : 'text-muted ring-line hover:text-ink'}`}
          >
            <Star size={13} filled={favOnly} /> Favorites
          </button>
          {tags.length > 0 && (
            <select
              aria-label="Tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              className={`h-8 rounded-full px-3 text-[13px] outline-none ring-1 ${tag !== 'all' ? 'bg-blue-soft text-blue ring-blue' : 'bg-transparent text-muted ring-line'}`}
            >
              <option value="all">Any tag</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {label(t)}
                </option>
              ))}
            </select>
          )}
          {searching && (
            <button type="button" className="px-2 text-[13px] text-blue hover:underline" onClick={() => (setQuery(''), setTag('all'), setFavOnly(false))}>
              Clear
            </button>
          )}
          <label className="ml-auto flex items-center gap-2 text-[13px] text-muted">
            Sort
            <select
              aria-label="Sort"
              value={sort}
              onChange={(e) => updateSettings({ librarySort: e.target.value as SortKey })}
              className="h-8 rounded-md bg-surface px-2 text-ink outline-none ring-1 ring-line focus:ring-blue"
            >
              <option value="name">Name</option>
              <option value="added">Newest first</option>
              <option value="practiced">Last practiced</option>
              <option value="size">Most images</option>
            </select>
          </label>
        </div>
      )}

      {pinterestOpen && <PinterestForm folderId={folderId} onClose={() => setPinterestOpen(false)} />}
      {sheet && <ImportSheet info={sheet} onCancel={() => setSheet(null)} onImport={(o) => void importFolder(sheet, o)} />}
      {confirmDelete && folder && <DeleteDialog items={[{ type: 'folder', id: folder.id }]} onCancel={() => setConfirmDelete(false)} onDelete={removeFolder} />}
      {gone && <GoneDialog gone={gone} onClose={() => setGone(null)} />}

      {empty ? (
        <>
          <div className="mb-4 flex justify-end gap-2">{actions}</div>
          <Empty title="Your library is empty">
            Add a folder of reference photos from your computer (its sub-folders stay folders), paste a Pinterest board link, or drag
            images in from your browser. Make folders to sort them, like in Windows.
          </Empty>
        </>
      ) : (
        <>
          {folder && !searching && <FolderInfoBar folder={folder} />}
          {missingHere.length > 0 && !searching && (
            <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 rounded-lg bg-red/10 px-4 py-3 ring-1 ring-red/40">
              <span className="mr-auto text-ink">
                {missingHere.length} {missingHere.length === 1 ? 'image here can’t be found' : 'images here can’t be found'}
                {folder?.source?.kind === 'disk' ? '. If you moved or renamed the folder, find it again.' : ': the files were moved or deleted outside the app.'}{' '}
                Sessions skip them; old sessions still show their kept copies.
              </span>
              {folder?.source?.kind === 'disk' && <Button onClick={() => void findFolder(folder)}>Find folder…</Button>}
              <Button tone="ghost" onClick={removeMissing}>
                Remove missing
              </Button>
            </div>
          )}
          <FolderBrowser
            folderId={folderId}
            results={results}
            actions={actions}
            empty={
              searching ? (
                <Empty title="Nothing matches">Try another word, or clear the filters.</Empty>
              ) : (
                <Empty title="This folder is empty">
                  Drag images here from your browser or from Explorer, paste one (Ctrl+V), use Add, or move things in with Cut and Paste.
                </Empty>
              )
            }
          />
        </>
      )}
      {menu}
    </div>
  )
}

/** Where the folder's images come from, and its tags. */
function FolderInfoBar({ folder }: { folder: Folder }) {
  const folders = useApp((s) => s.library.folders)
  const setLibrary = useApp((s) => s.setLibrary)
  const suggestions = useMemo(() => [...new Set([...tagsInUse(folders), ...SUGGESTED_TAGS])].sort(), [folders])
  const src = folder.source
  const synced = src?.syncedAt ? new Date(src.syncedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-muted">
      {src?.kind === 'disk' && (
        <span title={src.path}>
          Linked to <span className="text-ink">{src.path}</span>
          {src.include === 'flat' ? ' (sub-folders included, all here)' : src.include === 'top' ? ' (not its sub-folders)' : ''}
          {synced ? ` · scanned ${synced}` : ''}. Your files stay where they are.
        </span>
      )}
      {src?.kind === 'pinterest' && (
        <span>
          Pinterest board, saved on this computer{synced ? ` · synced ${synced}` : ''}.
        </span>
      )}
      <TagEditor
        tags={folder.tags ?? []}
        onChange={(tags) => setLibrary((l) => ({ ...l, folders: l.folders.map((f) => (f.id === folder.id ? { ...f, tags } : f)) }))}
        suggestions={suggestions}
      />
    </div>
  )
}

/** A complete sync found pins that left the board: keep them (the safe choice) or remove them. */
function GoneDialog({ gone, onClose }: { gone: { folderId: string; images: LibraryImage[] }; onClose: () => void }) {
  const changeLibrary = useApp((s) => s.changeLibrary)
  const n = gone.images.length
  const remove = () => {
    const list = gone.images.map((i) => ({ type: 'image' as const, id: i.id }))
    changeLibrary('remove pins', (l) => ({ ...l, ...deleteItems(l, list, 'keep') }), `Removed ${n} ${n === 1 ? 'image' : 'images'} that left the board.`)
    onClose()
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/70" role="dialog" aria-label="Pins removed from the board">
      <div className="w-[min(500px,92vw)] rounded-lg bg-surface p-6 shadow-[0_12px_40px_rgba(0,0,0,0.4)] ring-1 ring-line">
        <h2 className="text-[17px] font-semibold">
          {n} {n === 1 ? 'pin is' : 'pins are'} no longer on the board
        </h2>
        <p className="mt-2 text-muted">
          You still have {n === 1 ? 'its image' : 'their images'} here. Keep {n === 1 ? 'it' : 'them'}, or remove {n === 1 ? 'it' : 'them'} from this folder? Removing
          can be undone, and an image another folder or your history still uses is never deleted.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button tone="danger" onClick={remove}>
            Remove {n === 1 ? 'it' : `${n} images`}
          </Button>
          <Button tone="primary" autoFocus onClick={onClose}>
            Keep {n === 1 ? 'it' : 'them'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function PinterestForm({ onClose, folderId }: { onClose: () => void; folderId?: string }) {
  const changeLibrary = useApp((s) => s.changeLibrary)
  const go = useApp((s) => s.go)
  const notify = useApp((s) => s.notify)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [newId] = useState(uid)
  const progress = usePinterestProgress(newId)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    setBusy(true)
    setError('')
    try {
      // Always a new folder: an existing board is updated with its own Sync.
      const result = await window.api.importPinterest(newId, url.trim(), knownPins())
      const now = Date.now()
      let added = 0
      changeLibrary(
        'add Pinterest board',
        (l) => {
          const folder: Folder = { id: newId, name: result.name, ...(folderId ? { parentId: folderId } : {}), createdAt: now, tags: [], source: { kind: 'pinterest', url: url.trim(), syncedAt: now } }
          const r = applyPinterestSync({ ...l, folders: [...l.folders, folder] }, newId, result, uid, now)
          added = r.added
          return r.data
        }
      )
      notify(syncMessage(result, added))
      onClose()
      go({ name: 'library', folderId: newId })
      void useApp.getState().checkMissing()
    } catch (err) {
      setError(cleanError(err))
      void window.api.removeImportFiles(newId)
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
          onKeyDown={(e) => e.key === 'Escape' && !busy && onClose()}
          placeholder="https://pinterest.com/username/boardname"
          className="h-9 min-w-0 flex-1 rounded-md bg-bg px-3 text-ink outline-none ring-1 ring-line focus:ring-blue"
        />
        <Button tone="primary" type="submit" disabled={busy || !url.trim()}>
          {busy ? 'Syncing…' : 'Add board'}
        </Button>
        <Button tone="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
      </div>
      <p className="mt-2 text-[12.5px] text-muted">
        {busy && progress
          ? progressText(progress)
          : 'It becomes a new folder; its images are saved on this computer, so practice works offline. For personal practice only.'}
      </p>
      {error && <p className="mt-1 text-[13px] text-red">{error}</p>}
    </form>
  )
}
