import { useMemo, useState } from 'react'
import type { Folder } from '@shared/types'
import { assetMap, childFolders, countLabel, descendantIds, folderCounts, folderCover, folderLabel, folderPath, imagesBelow, poolSize } from '../lib/library'
import { useApp } from '../store'
import { Check, Close, Folder as FolderIcon } from './Icons'
import { FolderArt, FolderTrail, TileCheck } from './LibraryTiles'
import { Button } from './ui'

/** The folder the picker showed last, so coming back to Practice opens it again. */
let lastFolder: string | undefined

/**
 * Choose what to practice. Browsing and picking are separate, so looking
 * around never changes what you picked:
 * - click a folder to open it (the path above goes back up)
 * - the check in its corner picks it: every image inside, sub-folders included
 * - "Pick this folder" picks the folder you are in
 * An image reached through two picked folders is drawn once.
 */
export function FolderPicker({ value, onChange }: { value: string[]; onChange: (folderIds: string[]) => void }) {
  const library = useApp((s) => s.library)
  const { folders, images } = library
  const go = useApp((s) => s.go)
  const [query, setQuery] = useState('')
  const [here, setHere] = useState<string | undefined>(() => (lastFolder && folders.some((f) => f.id === lastFolder) ? lastFolder : undefined))
  const open = (id?: string) => {
    lastFolder = id
    setHere(id)
    setQuery('')
  }
  const assets = useMemo(() => assetMap(library.assets), [library.assets])
  const lib = { folders, images }
  const picked = value.filter((id) => folders.some((f) => f.id === id))
  const total = useMemo(() => poolSize({ folders, images }, assets, picked), [folders, images, assets, picked])

  if (!folders.length) {
    return (
      <div className="rounded-md border border-dashed border-line px-4 py-5 text-muted">
        No references yet.{' '}
        <Button tone="ghost" className="h-7 px-2 text-blue" onClick={() => go({ name: 'library' })}>
          Add a folder or a Pinterest board
        </Button>
      </div>
    )
  }

  /** The picked folder above this one, if any (then this one is in already). */
  const pickedAbove = (f: Folder) => folderPath(folders, f.parentId).find((p) => picked.includes(p.id))
  const toggle = (f: Folder) => {
    if (pickedAbove(f)) return
    if (picked.includes(f.id)) return onChange(picked.filter((x) => x !== f.id))
    // A picked folder takes over the folders picked inside it.
    const inside = descendantIds(folders, f.id)
    onChange([...picked.filter((x) => !inside.has(x)), f.id])
  }

  const searching = query.trim() !== ''
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const shown: Folder[] = searching
    ? folders.filter((f) => words.every((w) => `${f.name} ${(f.tags ?? []).join(' ')}`.toLowerCase().includes(w)))
    : childFolders(folders, here)
  const current = folders.find((f) => f.id === here)
  const hereImages = here ? folderCounts(lib, here).images : 0

  return (
    <div className="grid gap-3">
      {picked.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Picked">
          {picked.map((id) => {
            const f = folders.find((x) => x.id === id)!
            const n = imagesBelow(lib, id).length
            return (
              <span key={id} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-blue-soft pl-2.5 pr-1 text-[13px] text-blue">
                <FolderIcon size={13} /> {f.name}
                <span className="tnum text-blue/70">· {n} {n === 1 ? 'image' : 'images'}</span>
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => toggle(f)} className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-blue/20">
                  <Close size={11} />
                </button>
              </span>
            )
          })}
          <span className="tnum px-1 text-[12.5px] text-muted">{total} different images in all</span>
          <button type="button" onClick={() => onChange([])} className="px-1 text-[12.5px] text-muted hover:text-ink">
            Clear
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          aria-label="Search folders"
          value={query}
          placeholder="Search folders"
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 w-56 rounded-full bg-surface px-3.5 text-[13px] text-ink outline-none ring-1 ring-line placeholder:text-muted/70 focus:ring-blue"
        />
        {!searching && <FolderTrail folderId={here} onOpen={open} />}
        {!searching && current && (
          <button
            type="button"
            aria-pressed={picked.includes(current.id) || !!pickedAbove(current)}
            onClick={() => toggle(current)}
            disabled={!!pickedAbove(current)}
            className={`ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] ring-1 transition-colors disabled:opacity-60 ${
              picked.includes(current.id) || pickedAbove(current) ? 'bg-blue-soft text-blue ring-blue' : 'text-ink ring-line hover:ring-muted'
            }`}
          >
            {(picked.includes(current.id) || pickedAbove(current)) && <Check size={13} strokeWidth={2.6} />}
            {picked.includes(current.id) ? 'Picked' : pickedAbove(current) ? `In “${pickedAbove(current)!.name}”` : 'Pick this folder'}
          </button>
        )}
      </div>
      {shown.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(clamp(150px,10vw,200px),1fr))] gap-2.5">
          {shown.map((f) => {
            const above = pickedAbove(f)
            const on = picked.includes(f.id) || !!above
            return (
              <div key={f.id} className="group relative" title={above ? `In the picked folder “${above.name}”` : undefined}>
                <button
                  type="button"
                  aria-label={`${f.name}, folder, ${countLabel(folderCounts(lib, f.id))}`}
                  onClick={() => open(f.id)}
                  className={`block w-full rounded-md p-1.5 text-left ring-1 transition-colors ${on ? 'bg-blue-soft ring-blue' : 'bg-surface ring-line hover:ring-muted'}`}
                >
                  <FolderArt images={folderCover(lib, assets, f.id)} small label={countLabel(folderCounts(lib, f.id))} />
                  <span className="mt-1.5 block truncate px-1 text-[13px] text-ink">{f.name}</span>
                  {searching && <span className="block truncate px-1 text-[12px] text-muted">In {folderLabel(folders, f.parentId) || 'Library'}</span>}
                </button>
                <TileCheck checked={on} show={on || picked.length > 0} onToggle={() => toggle(f)} label={`Pick ${f.name} to practice`} />
              </div>
            )
          })}
        </div>
      )}
      {!shown.length && (
        <p className="text-muted">
          {searching ? `No folder matches “${query}”.` : hereImages ? `No folders in here; it holds ${hereImages} ${hereImages === 1 ? 'image' : 'images'}.` : 'This folder is empty.'}
        </p>
      )}
      {!searching && <p className="text-[12.5px] text-muted">Click a folder to open it. The check in its corner picks it, with everything inside.</p>}
    </div>
  )
}
