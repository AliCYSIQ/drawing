// The one place that compares a reference with your drawing. Review and the
// memory-mode reveal both use it, so they behave the same:
// - your drawing can be a canvas capture, a photo of this drawing, or a photo
//   of the whole page; tabs pick which one, and can rename or remove it
// - side by side or overlay, for any of them
// - every pane zooms (scroll) and moves (drag); double-click resets
// - a red pen (M) marks what is off, on the reference and on your drawing,
//   in side by side and in overlay; one Undo (Ctrl+Z) and one Clear

import { useEffect, useRef, useState } from 'react'
import { imageUrl } from '@shared/api'
import type { PoseResult, Stroke } from '@shared/types'
import { REFERENCE_KEY, type SourceKind } from '../lib/review'
import { useApp } from '../store'
import { useContextMenu, SEPARATOR } from './ContextMenu'
import { Camera, Close, Pen, Trash, Undo } from './Icons'
import { MarkupImage } from './Markup'
import { usePanZoom } from './PanZoom'
import { Button, Segmented } from './ui'

export interface DrawingSource {
  path: string
  label: string
  kind?: SourceKind
  /** Marks on this image, for sources shown read-only (earlier attempts). */
  strokes?: Stroke[]
  /** v0.1 marks saved as a picture. */
  legacyMarkup?: string
}

type Mode = 'side' | 'overlay'

/** Every image of one drawing: the canvas capture, photos of it, photos of the whole page. */
export function drawingSources(pose: PoseResult, pagePhotos: string[] = [], labels: Record<string, string> = {}): DrawingSource[] {
  const list: DrawingSource[] = []
  const marks = pose.marks ?? {}
  const name = (path: string, fallback: string) => labels[path]?.trim() || fallback
  if (pose.capturePath) {
    list.push({
      path: pose.capturePath,
      kind: 'capture',
      label: name(pose.capturePath, 'Canvas capture'),
      strokes: marks[pose.capturePath],
      legacyMarkup: pose.markupPath ? imageUrl(pose.markupPath) : undefined
    })
  }
  const photos = pose.photos ?? []
  photos.forEach((p, i) =>
    list.push({ path: p, kind: 'photo', label: name(p, photos.length > 1 ? `Photo ${i + 1}` : 'Photo'), strokes: marks[p] })
  )
  pagePhotos.forEach((p, i) =>
    list.push({ path: p, kind: 'page', label: name(p, pagePhotos.length > 1 ? `Page ${i + 1}` : 'Page photo'), strokes: marks[p] })
  )
  return list
}

export function Compare({
  referencePath,
  referenceFallback,
  sources,
  earlier = [],
  marks,
  onMarks,
  onAddPhotos,
  onRemoveSource,
  onRenameSource,
  penDefault = false,
  emptyHint
}: {
  referencePath: string
  /** Kept copy of the reference, shown if the original is gone. */
  referenceFallback?: string
  /** Your drawing, in every form it exists (capture, photos). */
  sources: DrawingSource[]
  /** Earlier tries at the same reference, shown read-only between the two. */
  earlier?: DrawingSource[]
  /** Marks per image path; the reference's are under REFERENCE_KEY. */
  marks: Record<string, Stroke[]>
  onMarks: (path: string, strokes: Stroke[]) => void
  /** Attach photos of this drawing (paths on disk). */
  onAddPhotos?: (paths: string[]) => void
  onRemoveSource?: (source: DrawingSource) => void
  onRenameSource?: (source: DrawingSource, name: string) => void
  penDefault?: boolean
  /** Shown when there is no drawing image yet. */
  emptyHint?: string
}) {
  const [mode, setMode] = useState<Mode>('side')
  const [sel, setSel] = useState(0)
  const [pen, setPen] = useState(penDefault)
  const [dragOver, setDragOver] = useState(false)
  const [space, setSpace] = useState(false)
  const notify = useApp((s) => s.notify)
  /** Which image each stroke went on, newest last, so one Undo works across panes. */
  const history = useRef<string[]>([])

  const source = sources[Math.min(sel, sources.length - 1)]
  const strokes = source ? (marks[source.path] ?? []) : []
  const refStrokes = marks[REFERENCE_KEY] ?? []
  const overlay = mode === 'overlay' && !!source
  // Space held: the pen rests and dragging moves the image.
  const drawing = pen && !space

  // A newly added photo becomes the one shown; a removed one hands over to its neighbour.
  const count = sources.length
  const [lastCount, setLastCount] = useState(count)
  if (count !== lastCount) {
    setLastCount(count)
    if (count > lastCount) setSel(count - 1)
    else if (sel >= count) setSel(Math.max(0, count - 1))
  }

  const add = (path: string, list: Stroke[], s: Stroke) => {
    history.current.push(path)
    onMarks(path, [...list, s])
  }

  const undo = () => {
    // The last image marked that still has marks; otherwise the shown drawing, then the reference.
    while (history.current.length) {
      const path = history.current.pop()!
      const list = marks[path] ?? []
      if (list.length) return onMarks(path, list.slice(0, -1))
    }
    if (strokes.length) onMarks(source!.path, strokes.slice(0, -1))
    else if (refStrokes.length) onMarks(REFERENCE_KEY, refStrokes.slice(0, -1))
  }

  const clear = () => {
    const before: [string, Stroke[]][] = [[REFERENCE_KEY, refStrokes], ...(source ? [[source.path, strokes] as [string, Stroke[]]] : [])]
    const had = before.filter(([, list]) => list.length)
    if (!had.length) return
    for (const [path] of had) onMarks(path, [])
    history.current = []
    notify('Marks cleared.', { label: 'Undo', run: () => had.forEach(([path, list]) => onMarks(path, list)) })
  }

  const hasMarks = strokes.length > 0 || refStrokes.length > 0

  useEffect(() => {
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement
    const onKey = (e: KeyboardEvent) => {
      if (typing(e)) return
      if (e.key === ' ' && pen) {
        e.preventDefault()
        setSpace(true)
      } else if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.altKey) {
        setPen((v) => !v)
      } else if (e.ctrlKey && e.key.toLowerCase() === 'z' && hasMarks) {
        e.preventDefault()
        undo()
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpace(false)
    }
    const onBlur = () => setSpace(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  })

  const addPhotos = async () => {
    const paths = await window.api.pickPhotos()
    if (paths.length) onAddPhotos?.(paths)
  }

  const refUrl = imageUrl(referencePath, referenceFallback)

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4"
      onDragOver={(e) => {
        if (!onAddPhotos) return
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!onAddPhotos) return
        e.preventDefault()
        e.stopPropagation()
        setDragOver(false)
        const paths = [...e.dataTransfer.files].map((f) => window.api.pathForFile(f)).filter(Boolean)
        if (paths.length) onAddPhotos(paths)
      }}
    >
      <div className="flex min-h-9 flex-wrap items-center gap-2">
        {source && (
          <Segmented<Mode>
            label="Compare"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'side', label: 'Side by side' },
              { value: 'overlay', label: 'Overlay' }
            ]}
          />
        )}
        {sources.length > 0 && (onRemoveSource || onRenameSource || sources.length > 1) && (
          <SourceTabs sources={sources} selected={Math.min(sel, sources.length - 1)} onSelect={setSel} onRemove={onRemoveSource} onRename={onRenameSource} />
        )}
        <button
          type="button"
          aria-pressed={pen}
          onClick={() => setPen((v) => !v)}
          title="Mark what is off in red (M). Space + drag or right-drag moves the image."
          className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-[13px] ring-1 transition-colors ${
            pen ? 'bg-red/15 text-red ring-red' : 'text-ink ring-line hover:ring-muted'
          }`}
        >
          <Pen size={15} /> {pen ? 'Marking' : 'Mark'}
        </button>
        {hasMarks && (
          <>
            <Button tone="ghost" onClick={undo} title="Undo last mark (Ctrl+Z)">
              <Undo size={15} /> Undo
            </Button>
            <Button tone="ghost" onClick={clear} title="Clear the marks on the reference and on this drawing">
              <Trash size={15} /> Clear marks
            </Button>
          </>
        )}
        {onAddPhotos && (
          <Button tone="ghost" className="ml-auto" onClick={addPhotos}>
            <Camera size={15} /> Add photo of this drawing
          </Button>
        )}
      </div>

      <div className={`flex min-h-0 flex-1 gap-3 rounded-md ${dragOver ? 'outline-2 outline-dashed outline-blue' : ''}`}>
        {overlay ? (
          <Overlay
            reference={refUrl}
            refStrokes={refStrokes}
            drawing={source!}
            strokes={strokes}
            onAdd={drawing ? (s) => add(source!.path, strokes, s) : undefined}
            panHint={pen}
          />
        ) : (
          <>
            <ZoomPane
              label={drawing ? 'Reference: draw on it to mark' : 'Reference'}
              src={refUrl}
              strokes={refStrokes}
              onAdd={drawing ? (s) => add(REFERENCE_KEY, refStrokes, s) : undefined}
            />
            {earlier.map((e) => (
              <ZoomPane key={e.path} label={e.label} src={imageUrl(e.path)} strokes={e.strokes} legacyMarkup={e.legacyMarkup} />
            ))}
            {source ? (
              <ZoomPane
                label={drawing ? `${source.label}: draw on it to mark what is off` : source.label}
                src={imageUrl(source.path)}
                strokes={strokes}
                onAdd={drawing ? (s) => add(source.path, strokes, s) : undefined}
                legacyMarkup={source.legacyMarkup}
              />
            ) : onAddPhotos ? (
              <figure className="flex min-h-0 min-w-0 flex-1 flex-col">
                <button
                  type="button"
                  onClick={addPhotos}
                  className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line px-6 text-center text-muted hover:border-muted hover:text-ink"
                >
                  <Camera size={26} />
                  Drop a photo of this drawing here, or click to choose one.
                </button>
                <figcaption className="pt-1.5 text-center text-[12.5px] text-muted">Your drawing</figcaption>
              </figure>
            ) : null}
          </>
        )}
      </div>
      {!source && emptyHint && <p className="text-center text-muted">{emptyHint}</p>}
    </div>
  )
}

/**
 * The drawing images as tabs. Hover shows × to remove; double-click (or F2)
 * renames; right-click has both.
 */
function SourceTabs({
  sources,
  selected,
  onSelect,
  onRemove,
  onRename
}: {
  sources: DrawingSource[]
  selected: number
  onSelect: (i: number) => void
  onRemove?: (s: DrawingSource) => void
  onRename?: (s: DrawingSource, name: string) => void
}) {
  const [editing, setEditing] = useState<number | null>(null)
  const [text, setText] = useState('')
  const { open, menu } = useContextMenu()

  const startRename = (i: number) => {
    if (!onRename) return
    setEditing(i)
    setText(sources[i].label)
  }
  const commit = () => {
    if (editing !== null && onRename) onRename(sources[editing], text)
    setEditing(null)
  }

  return (
    <div role="tablist" aria-label="Which drawing image" className="inline-flex flex-wrap rounded-md bg-surface p-0.5 ring-1 ring-line">
      {sources.map((s, i) =>
        editing === i ? (
          <input
            key={s.path}
            autoFocus
            aria-label={`New name for ${s.label}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={commit}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') commit()
              else if (e.key === 'Escape') setEditing(null)
            }}
            className="h-8 w-36 rounded-[5px] bg-bg px-2 text-[13px] text-ink outline-none ring-1 ring-blue"
          />
        ) : (
          <span key={s.path} className="group relative inline-flex">
            <button
              type="button"
              role="tab"
              aria-selected={i === selected}
              title={onRename ? 'Double-click or F2 to rename' : undefined}
              onClick={() => onSelect(i)}
              onDoubleClick={() => startRename(i)}
              onKeyDown={(e) => {
                if (e.key === 'F2') startRename(i)
                else if (e.key === 'Delete' && onRemove) onRemove(s)
              }}
              onContextMenu={(e) =>
                (onRename || onRemove) &&
                open(e, [
                  ...(onRename ? [{ label: 'Rename', hint: 'F2', onClick: () => startRename(i) }] : []),
                  ...(onRename && onRemove ? [SEPARATOR] : []),
                  ...(onRemove ? [{ label: removeLabel(s), danger: true, onClick: () => onRemove(s) }] : [])
                ])
              }
              className={`h-8 max-w-[180px] truncate rounded-[5px] px-3 text-[13px] transition-colors ${onRemove ? 'pr-6' : ''} ${
                i === selected ? 'bg-raised text-ink shadow-[inset_0_-2px_0_var(--blue)]' : 'text-muted hover:text-ink'
              }`}
            >
              {s.label}
            </button>
            {onRemove && (
              <button
                type="button"
                aria-label={removeLabel(s)}
                title={removeLabel(s)}
                onClick={() => onRemove(s)}
                className="absolute right-1 top-1/2 hidden h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted hover:bg-line hover:text-red group-hover:flex group-focus-within:flex"
              >
                <Close size={12} />
              </button>
            )}
          </span>
        )
      )}
      {menu}
    </div>
  )
}

function removeLabel(s: DrawingSource): string {
  return s.kind === 'page' ? `Remove ${s.label} from this session` : `Remove ${s.label}`
}

/** One image that zooms and moves on its own; marks are drawn in image space so they follow the zoom. */
function ZoomPane({
  label,
  src,
  strokes,
  onAdd,
  legacyMarkup
}: {
  label: string
  src: string
  strokes?: Stroke[]
  onAdd?: (s: Stroke) => void
  legacyMarkup?: string
}) {
  const { view, handlers, reset } = usePanZoom()
  return (
    <figure className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        className="relative min-h-0 flex-1 cursor-grab overflow-hidden rounded-md bg-surface active:cursor-grabbing"
        {...handlers}
        onDoubleClick={reset}
        title="Scroll to zoom, drag to move, double-click to reset"
      >
        <div className="absolute inset-0" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
          <MarkupImage src={src} alt={label} strokes={strokes} onAdd={onAdd} savedMarkup={legacyMarkup} />
        </div>
      </div>
      <figcaption className="pt-1.5 text-center text-[12.5px] text-muted">{label}</figcaption>
    </figure>
  )
}

/**
 * Your drawing over the reference. Drag (or right-drag while marking) to line
 * it up, scroll to resize. Marks go on your drawing and stay at full strength
 * whatever the opacity; they show in side by side too.
 */
function Overlay({
  reference,
  refStrokes,
  drawing,
  strokes,
  onAdd,
  panHint
}: {
  reference: string
  refStrokes: Stroke[]
  drawing: DrawingSource
  strokes: Stroke[]
  onAdd?: (s: Stroke) => void
  panHint: boolean
}) {
  const [opacity, setOpacity] = useState(55)
  const { view, handlers, reset } = usePanZoom()
  return (
    <figure className="flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1 cursor-grab overflow-hidden rounded-md bg-surface active:cursor-grabbing" {...handlers}>
        <div className="pointer-events-none absolute inset-0">
          <MarkupImage src={reference} alt="Reference" strokes={refStrokes} />
        </div>
        <div className="absolute inset-0" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
          <MarkupImage
            src={imageUrl(drawing.path)}
            alt={`${drawing.label} over the reference`}
            strokes={strokes}
            onAdd={onAdd}
            savedMarkup={drawing.legacyMarkup}
            imageOpacity={opacity / 100}
          />
        </div>
      </div>
      <figcaption className="flex flex-wrap items-center justify-center gap-3 pt-2 text-[12.5px] text-muted">
        {panHint ? 'Draw to mark. Right-drag or Space + drag lines it up, scroll resizes.' : 'Drag your drawing to line it up, scroll to resize.'}
        <label className="flex items-center gap-2">
          Opacity
          <input
            type="range"
            min={10}
            max={100}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="h-1 w-32 accent-[var(--blue)]"
          />
        </label>
        <button type="button" onClick={reset} className="text-blue hover:underline">
          Reset position
        </button>
      </figcaption>
    </figure>
  )
}
