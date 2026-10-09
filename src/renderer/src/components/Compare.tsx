// The one place that compares a reference with your drawing. Review and the
// memory-mode reveal both use it, so they behave the same:
// - your drawing can be a canvas capture, a photo of this drawing, or a photo
//   of the whole page; a switcher picks which one
// - side by side or overlay, for any of them
// - every pane zooms (scroll) and moves (drag); double-click resets
// - a red pen (M) to mark what is off, with undo (Ctrl+Z) and clear

import { useEffect, useState } from 'react'
import { imageUrl } from '@shared/api'
import type { PoseResult, Stroke } from '@shared/types'
import { Camera, Pen, Trash, Undo } from './Icons'
import { MarkupImage } from './Markup'
import { usePanZoom } from './PanZoom'
import { Button, Segmented } from './ui'

export interface DrawingSource {
  path: string
  label: string
  /** Marks on this image, for sources shown read-only (earlier attempts). */
  strokes?: Stroke[]
  /** v0.1 marks saved as a picture. */
  legacyMarkup?: string
}

type Mode = 'side' | 'overlay'

/** Every image of one drawing: the canvas capture, photos of it, photos of the whole page. */
export function drawingSources(pose: PoseResult, pagePhotos: string[] = []): DrawingSource[] {
  const list: DrawingSource[] = []
  const marks = pose.marks ?? {}
  if (pose.capturePath) {
    list.push({
      path: pose.capturePath,
      label: 'Canvas capture',
      strokes: marks[pose.capturePath],
      legacyMarkup: pose.markupPath ? imageUrl(pose.markupPath) : undefined
    })
  }
  const photos = pose.photos ?? []
  photos.forEach((p, i) => list.push({ path: p, label: photos.length > 1 ? `Photo ${i + 1}` : 'Photo', strokes: marks[p] }))
  pagePhotos.forEach((p, i) =>
    list.push({ path: p, label: pagePhotos.length > 1 ? `Page ${i + 1}` : 'Page photo', strokes: marks[p] })
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
  /** Marks per drawing image path. */
  marks: Record<string, Stroke[]>
  onMarks: (path: string, strokes: Stroke[]) => void
  /** Attach photos of this drawing (paths on disk). */
  onAddPhotos?: (paths: string[]) => void
  penDefault?: boolean
  /** Shown when there is no drawing image yet. */
  emptyHint?: string
}) {
  const [mode, setMode] = useState<Mode>('side')
  const [sel, setSel] = useState(0)
  const [pen, setPen] = useState(penDefault)
  const [dragOver, setDragOver] = useState(false)
  const source = sources[Math.min(sel, sources.length - 1)]
  const strokes = source ? (marks[source.path] ?? []) : []
  const penOn = pen && !!source && mode === 'side'

  // A newly added photo becomes the one shown.
  const count = sources.length
  const [lastCount, setLastCount] = useState(count)
  if (count !== lastCount) {
    setLastCount(count)
    if (count > lastCount) setSel(count - 1)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return
      if (!source) return
      if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.altKey) {
        setMode('side')
        setPen((v) => !v)
      } else if (e.ctrlKey && e.key.toLowerCase() === 'z' && strokes.length) {
        e.preventDefault()
        onMarks(source.path, strokes.slice(0, -1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [source, strokes, onMarks])

  const addPhotos = async () => {
    const paths = await window.api.pickPhotos()
    if (paths.length) onAddPhotos?.(paths)
  }

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
        {sources.length > 1 && (
          <Segmented<string>
            label="Which drawing image"
            value={String(sel)}
            onChange={(v) => setSel(Number(v))}
            options={sources.map((s, i) => ({ value: String(i), label: s.label }))}
          />
        )}
        {source && mode === 'side' && (
          <>
            <button
              type="button"
              aria-pressed={penOn}
              onClick={() => setPen((v) => !v)}
              title="Mark what is off in red (M)"
              className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-[13px] ring-1 transition-colors ${
                penOn ? 'bg-red/15 text-red ring-red' : 'text-ink ring-line hover:ring-muted'
              }`}
            >
              <Pen size={15} /> {penOn ? 'Marking' : 'Mark'}
            </button>
            {penOn && strokes.length > 0 && (
              <>
                <Button tone="ghost" onClick={() => onMarks(source.path, strokes.slice(0, -1))} title="Undo last mark (Ctrl+Z)">
                  <Undo size={15} /> Undo
                </Button>
                <Button tone="ghost" onClick={() => onMarks(source.path, [])}>
                  <Trash size={15} /> Clear marks
                </Button>
              </>
            )}
          </>
        )}
        {onAddPhotos && (
          <Button tone="ghost" className="ml-auto" onClick={addPhotos}>
            <Camera size={15} /> Add photo of this drawing
          </Button>
        )}
      </div>

      <div className={`flex min-h-0 flex-1 gap-3 rounded-md ${dragOver ? 'outline-2 outline-dashed outline-blue' : ''}`}>
        {source && mode === 'overlay' ? (
          <Overlay reference={imageUrl(referencePath, referenceFallback)} drawing={source} strokes={strokes} />
        ) : (
          <>
            <ZoomPane label="Reference" src={imageUrl(referencePath, referenceFallback)} />
            {earlier.map((e) => (
              <ZoomPane key={e.path} label={e.label} src={imageUrl(e.path)} strokes={e.strokes} legacyMarkup={e.legacyMarkup} />
            ))}
            {source ? (
              <ZoomPane
                label={penOn ? `${source.label}: draw on it to mark what is off` : source.label}
                src={imageUrl(source.path)}
                strokes={strokes}
                onAdd={penOn ? (s) => onMarks(source.path, [...strokes, s]) : undefined}
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

function Overlay({ reference, drawing, strokes }: { reference: string; drawing: DrawingSource; strokes: Stroke[] }) {
  const [opacity, setOpacity] = useState(55)
  const { view, handlers, reset } = usePanZoom()
  return (
    <figure className="flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1 cursor-grab overflow-hidden rounded-md bg-surface active:cursor-grabbing" {...handlers}>
        <img src={reference} alt="Reference" draggable={false} className="absolute inset-0 h-full w-full object-contain" />
        <div
          className="absolute inset-0"
          style={{ opacity: opacity / 100, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        >
          <MarkupImage src={imageUrl(drawing.path)} alt={`${drawing.label} over the reference`} strokes={strokes} savedMarkup={drawing.legacyMarkup} />
        </div>
      </div>
      <figcaption className="flex items-center justify-center gap-3 pt-2 text-[12.5px] text-muted">
        Drag your drawing to line it up, scroll to resize.
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
