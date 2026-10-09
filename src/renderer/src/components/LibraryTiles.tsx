// What the library shows: folder tiles that look like folders, collection
// tiles with a mosaic cover, and the folder path. Shared by the Library
// (where things are managed) and the collection pickers on Practice and
// Challenges (where things are picked).

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { thumbUrl } from '@shared/api'
import type { Board, BoardKind, Folder, ImageRef } from '@shared/types'
import { folderPath } from '../lib/library'
import { useApp } from '../store'
import { ArrowRight, Check, Folder as FolderIcon, Images, Shortcut, Star } from './Icons'

export const KIND_LABEL: Record<BoardKind, string> = {
  folder: 'Linked folder',
  files: 'Images',
  pinterest: 'Pinterest',
  collection: 'Collection'
}

export function Cover({ img, className = '', size = 240 }: { img: ImageRef; className?: string; size?: number }) {
  // Most references are portrait figures: crop from the upper part so heads stay in the cover.
  return (
    <img src={thumbUrl(img.path, size)} alt="" loading="lazy" draggable={false} className={`h-full w-full object-cover object-[center_20%] ${className}`} />
  )
}

/** A collection cover that fits what it holds: empty, one image, two side by side, or one large and two small. */
export function Mosaic({ images }: { images: ImageRef[] }) {
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

const PAPERS = [
  { left: '2%', rotate: -7 },
  { left: '24%', rotate: 1.5 },
  { left: '46%', rotate: 7 }
]

/**
 * A folder drawn as a folder: the back with its tab, up to three images from
 * inside standing up like papers, and the front flap with what it holds.
 * The shape is what tells it apart from a collection, whatever the images.
 */
export function FolderArt({ images, label, small }: { images: ImageRef[]; label?: ReactNode; small?: boolean }) {
  return (
    <div className="relative aspect-[4/3]">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true">
        <path
          d="M0 30 Q0 12 18 12 H132 Q144 12 152 22 L164 38 H382 Q400 38 400 56 V282 Q400 300 382 300 H18 Q0 300 0 282 Z"
          fill="var(--folder-back)"
        />
      </svg>
      <div className="absolute inset-x-[10%] bottom-[8%] top-[17%]">
        {images.slice(0, 3).map((img, i) => (
          <div
            key={img.id + i}
            className="folder-paper absolute top-0 aspect-[3/4] h-full overflow-hidden rounded-[4px] bg-surface ring-1 ring-black/10"
            style={{ left: PAPERS[i].left, transform: `rotate(${PAPERS[i].rotate}deg)` }}
          >
            <Cover img={img} size={small ? 160 : 240} />
          </div>
        ))}
      </div>
      <div className={`folder-front absolute inset-x-0 bottom-0 flex items-end rounded-[10px] ${small ? 'h-[52%] p-1.5' : 'h-[50%] p-2.5'}`}>
        <span className={`flex items-center gap-1.5 text-ink ${small ? 'text-[11.5px]' : 'text-[12.5px]'}`}>
          <FolderIcon size={small ? 12 : 14} />
          {label}
        </span>
      </div>
    </div>
  )
}

export function itemCountLabel(folders: number, collections: number): string {
  const parts = []
  if (folders) parts.push(`${folders} ${folders === 1 ? 'folder' : 'folders'}`)
  if (collections) parts.push(`${collections} ${collections === 1 ? 'collection' : 'collections'}`)
  return parts.join(' · ') || 'Empty'
}

/** The selection check in a tile's corner. */
export function TileCheck({ checked, show, onToggle, label }: { checked: boolean; show: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      className={`absolute left-2 top-2 z-10 h-6 w-6 items-center justify-center rounded-md ring-1 transition-colors ${
        checked ? 'flex bg-blue text-bg ring-blue' : `${show ? 'flex' : 'hidden group-hover:flex group-focus-within:flex'} bg-bg/85 text-transparent ring-line hover:text-muted`
      }`}
    >
      <Check size={14} strokeWidth={2.6} />
    </button>
  )
}

/** Inline name editing on a tile (F2). Enter saves, Esc cancels. */
export function RenameField({ value, onDone, label }: { value: string; onDone: (name: string | null) => void; label: string }) {
  const [text, setText] = useState(value)
  const done = useRef(false)
  const finish = (name: string | null) => {
    if (done.current) return
    done.current = true
    onDone(name)
  }
  return (
    <input
      autoFocus
      aria-label={label}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(text.trim() || null)
        else if (e.key === 'Escape') finish(null)
      }}
      onBlur={() => finish(text.trim() || null)}
      className="mt-2 h-7 w-full rounded bg-surface px-1.5 font-semibold text-ink outline-none ring-1 ring-blue"
    />
  )
}

/**
 * The folder path: Library › Human › Hands. Every part is a link and a drop
 * target (drop something on "Library" to move it to the top level).
 */
export function FolderTrail({
  folderId,
  onOpen,
  dropProps
}: {
  folderId?: string
  onOpen: (id?: string) => void
  dropProps?: (id?: string) => object
}) {
  const folders = useApp((s) => s.library.folders)
  const path = folderPath(folders, folderId)
  const parts: { id?: string; name: string }[] = [{ name: 'Library' }, ...path.map((f) => ({ id: f.id, name: f.name }))]
  return (
    <nav aria-label="Folder path" className="flex flex-wrap items-center gap-1 text-muted">
      {parts.map((p, i) => (
        <span key={p.id ?? 'top'} className="flex items-center gap-1">
          {i > 0 && <ArrowRight size={13} />}
          {i === parts.length - 1 ? (
            <span {...dropProps?.(p.id)} className="rounded px-1.5 py-0.5 text-ink" aria-current="location">
              {p.name}
            </span>
          ) : (
            <button
              type="button"
              {...dropProps?.(p.id)}
              onClick={() => onOpen(p.id)}
              className="rounded px-1.5 py-0.5 ring-blue hover:bg-raised hover:text-ink data-[drop=yes]:bg-blue-soft data-[drop=yes]:text-blue data-[drop=yes]:ring-1"
            >
              {p.name}
            </button>
          )}
        </span>
      ))}
    </nav>
  )
}

/** Small folder and collection chips for the pickers on Practice and Challenges. */
export function PickFolderChip({
  folder,
  cover,
  count,
  picked,
  onOpen,
  onPick
}: {
  folder: Folder
  cover: ImageRef[]
  count: string
  picked: boolean
  onOpen: () => void
  onPick: () => void
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${folder.name}, folder, ${count}. Open`}
        className={`block w-full rounded-md p-1.5 text-left ring-1 transition-colors ${picked ? 'bg-blue-soft ring-blue' : 'bg-surface ring-line hover:ring-muted'}`}
      >
        <FolderArt images={cover} small label={count} />
        <span className="mt-1.5 block truncate px-1 text-[13px] text-ink">{folder.name}</span>
      </button>
      {/* Always shown: it's how a whole folder gets picked. */}
      <TileCheck checked={picked} show onToggle={onPick} label={`Practice everything in ${folder.name}`} />
    </div>
  )
}

export function PickBoardChip({ board, selected, onClick, shortcut }: { board: Board; selected: boolean; onClick: () => void; shortcut?: boolean }) {
  const strip = board.images.slice(0, 4)
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${board.name}${shortcut ? ', shortcut' : ''}, ${board.images.length} images`}
      onClick={onClick}
      className={`group relative overflow-hidden rounded-md text-left ring-1 transition-colors ${
        selected ? 'bg-blue-soft ring-blue' : 'bg-surface ring-line hover:ring-muted'
      }`}
    >
      <div className="flex aspect-[3/1] gap-px overflow-hidden bg-bg">
        {strip.map((img) => (
          <img key={img.id} src={thumbUrl(img.path, 160)} alt="" loading="lazy" className="h-full min-w-0 flex-1 object-cover" />
        ))}
        {!strip.length && <div className="flex-1" />}
      </div>
      <div className="flex items-center gap-2 px-2.5 py-2">
        {shortcut && <Shortcut size={13} className="shrink-0 text-muted" />}
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{board.name}</span>
        {board.favorite && <Star size={12} filled className="shrink-0 text-blue" />}
        <span className="tnum text-[12px] text-muted">{board.images.length}</span>
      </div>
      {selected && (
        <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue text-bg">
          <Check size={13} strokeWidth={2.6} />
        </span>
      )}
    </button>
  )
}

/** Hover a folder this long while dragging and it opens (as in Windows and macOS). */
export function useSpringOpen(onOpen: () => void, delay = 900) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return {
    start: () => {
      clearTimeout(timer.current)
      timer.current = setTimeout(onOpen, delay)
    },
    stop: () => clearTimeout(timer.current)
  }
}
