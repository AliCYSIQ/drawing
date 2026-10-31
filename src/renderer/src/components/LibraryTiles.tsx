// What the library shows: folder tiles that look like folders, image tiles,
// the selection check and the folder path. Shared by the Library (where
// things are managed) and the folder picker on Practice and Challenges
// (where folders are picked to practice).

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { thumbUrl } from '@shared/api'
import type { ImageRef } from '@shared/types'
import { folderPath } from '../lib/library'
import { useApp } from '../store'
import { ArrowLeft, ArrowRight, Check, Folder as FolderIcon } from './Icons'

export function Cover({ img, className = '', size = 240 }: { img: ImageRef; className?: string; size?: number }) {
  // Most references are portrait figures: crop from the upper part so heads stay in the cover.
  return (
    <img src={thumbUrl(img.path, size)} alt="" loading="lazy" draggable={false} className={`h-full w-full object-cover object-[center_20%] ${className}`} />
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
        <span className={`flex min-w-0 items-center gap-1.5 text-ink ${small ? 'text-[11.5px]' : 'text-[12.5px]'}`}>
          <FolderIcon size={small ? 12 : 14} className="shrink-0" />
          <span className="truncate">{label}</span>
        </span>
      </div>
    </div>
  )
}

/**
 * The selection check in a tile's corner. It shows on hover, on focus, and
 * on every tile once something is selected; a checked one always shows.
 */
export function TileCheck({ checked, show, onToggle, label }: { checked: boolean; show: boolean; onToggle: (e: React.MouseEvent) => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onToggle(e)
      }}
      className={`absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md shadow-sm ring-1 transition-[color,opacity] ${
        checked ? 'bg-blue text-bg ring-blue' : `${show ? '' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100'} bg-bg/85 text-transparent ring-line hover:text-muted`
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
 * Where you are: an Up button, then Library › Human › Hands. Every part is a
 * link and a drop target (drop something on "Library" to move it to the top).
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
  const up = path.length ? path[path.length - 1].parentId : null
  return (
    <nav aria-label="Folder path" className="flex min-w-0 flex-wrap items-center gap-1 text-muted">
      {up !== null && (
        <button
          type="button"
          aria-label="Up to the folder above (Backspace)"
          title="Up (Backspace)"
          onClick={() => onOpen(up)}
          className="mr-1 flex h-7 w-7 items-center justify-center rounded-md text-muted ring-1 ring-line hover:bg-raised hover:text-ink"
        >
          <ArrowLeft size={14} />
        </button>
      )}
      {parts.map((p, i) => (
        <span key={p.id ?? 'top'} className="flex min-w-0 items-center gap-1">
          {i > 0 && <ArrowRight size={13} className="shrink-0" />}
          {i === parts.length - 1 ? (
            <span {...dropProps?.(p.id)} className="truncate rounded px-1.5 py-0.5 font-semibold text-ink" aria-current="location">
              {p.name}
            </span>
          ) : (
            <button
              type="button"
              {...dropProps?.(p.id)}
              onClick={() => onOpen(p.id)}
              className="truncate rounded px-1.5 py-0.5 ring-blue hover:bg-raised hover:text-ink data-[drop=yes]:bg-blue-soft data-[drop=yes]:text-blue data-[drop=yes]:ring-1"
            >
              {p.name}
            </button>
          )}
        </span>
      ))}
    </nav>
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
