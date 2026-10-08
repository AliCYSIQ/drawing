import { useEffect, useMemo, useState } from 'react'
import { imageUrl, thumbUrl } from '@shared/api'
import { MISTAKES, type PoseResult, type SessionRecord } from '@shared/types'
import { ArrowLeft, ArrowRight, Camera, Check, Redo } from '../components/Icons'
import { MarkupImage } from '../components/Markup'
import { PanZoomImage, usePanZoom } from '../components/PanZoom'
import { Button, IconButton, Segmented } from '../components/ui'
import { formatDuration, formatSeconds } from '../lib/schedule'
import { useApp } from '../store'

type Mode = 'side' | 'overlay'

export function Review({ sessionId }: { sessionId: string }) {
  const session = useApp((s) => s.sessions.find((x) => x.id === sessionId))
  const sessions = useApp((s) => s.sessions)
  const updatePose = useApp((s) => s.updatePose)
  const updateSession = useApp((s) => s.updateSession)
  const go = useApp((s) => s.go)
  const startRun = useApp((s) => s.startRun)
  const notify = useApp((s) => s.notify)
  const [i, setI] = useState(0)

  const earlier = useMemo(() => {
    const original = session?.redoOf ? sessions.find((s) => s.id === session.redoOf) : undefined
    return (imageId: string) => original?.poses.find((p) => p.imageId === imageId)
  }, [session, sessions])

  const count = session?.poses.length ?? 0
  const pose = session?.poses[Math.min(i, count - 1)]

  const toggleMistake = (m: string) => {
    if (!session || !pose) return
    const mistakes = pose.mistakes.includes(m) ? pose.mistakes.filter((x) => x !== m) : [...pose.mistakes, m]
    updatePose(session.id, i, { mistakes })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return
      if (e.key === 'ArrowRight') setI((v) => Math.min(count - 1, v + 1))
      else if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1))
      else if (e.key.toLowerCase() === 'r' && session && pose) updatePose(session.id, i, { redo: !pose.redo })
      else if (/^[1-9]$/.test(e.key) && Number(e.key) <= MISTAKES.length) toggleMistake(MISTAKES[Number(e.key) - 1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!session || !pose) {
    return <div className="p-8 text-muted">This session has no poses to review.</div>
  }

  const flagged = session.poses.filter((p) => p.redo)

  const finish = () => {
    updateSession(session.id, (s) => ({ ...s, reviewed: true }))
    go(session.challenge ? { name: 'challenges', challengeId: session.challenge.challengeId } : { name: 'practice' })
  }

  const redo = () => {
    updateSession(session.id, (s) => ({ ...s, reviewed: true }))
    startRun({
      plan: { ...session.plan, review: true },
      slots: flagged.map((p) => ({ imageId: p.imageId, imagePath: p.imagePath, seconds: p.plannedSeconds || 60 })),
      redoOf: session.id
    })
  }

  const addPhotos = async (paths?: string[]) => {
    const picked = paths ?? (await window.api.pickPhotos())
    if (!picked.length) return
    const kept = await Promise.all(picked.map((p) => window.api.keepPhoto(session.id, p)))
    updateSession(session.id, (s) => ({ ...s, pagePhotos: [...s.pagePhotos, ...kept] }))
    notify(`Added ${kept.length} ${kept.length === 1 ? 'photo' : 'photos'}.`)
  }

  return (
    <div
      className="flex h-full flex-col"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const paths = [...e.dataTransfer.files].map((f) => window.api.pathForFile(f)).filter(Boolean)
        if (paths.length) void addPhotos(paths)
      }}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <div className="mr-auto">
          <h1 className="text-[17px] font-semibold">{session.redoOf ? 'Review: second try' : 'Review'}</h1>
          <div className="text-[12.5px] text-muted">
            {new Date(session.startedAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            {', '}
            {session.poses.length} poses, {formatDuration(session.activeMs / 1000)}
          </div>
        </div>
        <Button onClick={() => addPhotos()}>
          <Camera size={16} /> Add page photos
        </Button>
        <Button onClick={redo} disabled={!flagged.length}>
          <Redo size={16} /> Redo flagged{flagged.length ? ` (${flagged.length})` : ''}
        </Button>
        <Button tone="primary" onClick={finish}>
          <Check size={16} /> Done
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[92px_minmax(0,1fr)_300px]">
        <nav aria-label="Poses" className="min-h-0 overflow-y-auto border-r border-line p-2">
          {session.poses.map((p, k) => (
            <button
              key={k}
              type="button"
              aria-current={k === i ? 'true' : undefined}
              onClick={() => setI(k)}
              className={`relative mb-2 block aspect-[3/4] w-full overflow-hidden rounded-md ring-2 ${
                k === i ? 'ring-blue' : 'ring-transparent hover:ring-line'
              }`}
            >
              <img src={thumbUrl(p.imagePath, 200)} alt={`Pose ${k + 1}`} className="h-full w-full object-cover" />
              <span className="tnum absolute bottom-1 left-1 rounded bg-bg/85 px-1 text-[11px] text-ink">
                {p.attempt ? `try ${p.attempt}` : k + 1}
              </span>
              {(p.mistakes.length > 0 || p.redo) && (
                <span className="absolute right-1 top-1 flex gap-0.5">
                  {p.mistakes.length > 0 && <span className="h-2 w-2 rounded-full bg-blue" />}
                  {p.redo && <span className="h-2 w-2 rounded-full bg-red" />}
                </span>
              )}
            </button>
          ))}
        </nav>

        <Compare key={i} session={session} pose={pose} earlier={earlier(pose.imageId)} />

        <aside aria-label="Notes for this pose" className="flex min-h-0 flex-col gap-5 overflow-y-auto border-l border-line p-5">
          <div>
            <div className="text-[15px] font-semibold">
              Pose {i + 1} of {count}
            </div>
            <div className="text-[12.5px] text-muted">
              {pose.plannedSeconds
                ? `Drew ${formatSeconds(Math.round(pose.spentMs / 1000))} of ${formatSeconds(pose.plannedSeconds)}`
                : `Drew for ${formatSeconds(Math.round(pose.spentMs / 1000))}`}
              {pose.skipped && ', skipped early'}
            </div>
          </div>

          <div>
            <div className="pb-2 text-muted">What went wrong?</div>
            <div className="flex flex-wrap gap-1.5">
              {MISTAKES.map((m, k) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={pose.mistakes.includes(m)}
                  onClick={() => toggleMistake(m)}
                  title={`Key ${k + 1}`}
                  className={`h-8 rounded-full px-3 text-[13px] ring-1 transition-colors first-letter:uppercase ${
                    pose.mistakes.includes(m) ? 'bg-blue-soft text-blue ring-blue' : 'text-ink ring-line hover:ring-muted'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="block pb-2 text-muted">One thing to remember</span>
            <textarea
              value={pose.note ?? ''}
              onChange={(e) => updatePose(session.id, i, { note: e.target.value })}
              rows={3}
              placeholder="e.g. the ribcage tilts the other way"
              className="w-full resize-none rounded-md bg-surface p-2.5 text-ink outline-none ring-1 ring-line placeholder:text-muted/70 focus:ring-blue"
            />
          </label>

          <button
            type="button"
            aria-pressed={pose.redo}
            onClick={() => updatePose(session.id, i, { redo: !pose.redo })}
            className={`flex items-center gap-2.5 rounded-md px-3 py-2.5 text-left ring-1 transition-colors ${
              pose.redo ? 'bg-red/15 text-red ring-red' : 'text-ink ring-line hover:ring-muted'
            }`}
          >
            <Redo size={16} />
            <span>
              Draw this one again
              <span className="block text-[12px] opacity-75">Key R. Flagged poses go into “Redo flagged”.</span>
            </span>
          </button>

          <div className="mt-auto flex items-center justify-between">
            <IconButton label="Previous pose (←)" disabled={i === 0} onClick={() => setI(i - 1)}>
              <ArrowLeft size={18} />
            </IconButton>
            <span className="text-[12.5px] text-muted">Keys 1–7 tag mistakes</span>
            <IconButton label="Next pose (→)" disabled={i >= count - 1} onClick={() => setI(i + 1)}>
              <ArrowRight size={18} />
            </IconButton>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Pane({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-hidden rounded-md bg-surface">{children}</div>
      <figcaption className="pt-1.5 text-center text-[12.5px] text-muted">{label}</figcaption>
    </figure>
  )
}

function Compare({ session, pose, earlier }: { session: SessionRecord; pose: PoseResult; earlier?: PoseResult }) {
  const [mode, setMode] = useState<Mode>('side')
  const [photo, setPhoto] = useState(0)
  const ref = imageUrl(pose.imagePath)
  const drawing = pose.capturePath ? imageUrl(pose.capturePath) : null
  const photos = session.pagePhotos
  // Memory mode: every attempt at this reference, so you can see them improve.
  const attempts = pose.attempt
    ? session.poses.filter((p) => p.imageId === pose.imageId && p.attempt && p.capturePath)
    : []

  if (attempts.length > 1 && mode === 'side') {
    return (
      <div className="flex min-h-0 min-w-0 flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <Segmented<Mode>
            label="Compare"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'side', label: 'All attempts' },
              { value: 'overlay', label: 'Overlay' }
            ]}
          />
        </div>
        <div className="flex min-h-0 flex-1 gap-3">
          <Pane label="Reference">
            <img src={ref} alt="Reference" className="h-full w-full object-contain" />
          </Pane>
          {attempts.map((a) => (
            <Pane key={a.attempt} label={a.attempt === pose.attempt ? `Attempt ${a.attempt} (this one)` : `Attempt ${a.attempt}`}>
              <MarkupImage src={imageUrl(a.capturePath!)} strokes={[]} savedMarkup={a.markupPath ? imageUrl(a.markupPath) : undefined} />
            </Pane>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-3 p-4">
      {drawing && (
        <div className="flex items-center gap-3">
          <Segmented<Mode>
            label="Compare"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'side', label: 'Side by side' },
              { value: 'overlay', label: 'Overlay' }
            ]}
          />
          {mode === 'overlay' && <span className="text-[12.5px] text-muted">Drag your drawing to line it up, scroll to resize.</span>}
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-3">
        {drawing && mode === 'overlay' ? (
          <Overlay reference={ref} drawing={drawing} />
        ) : (
          <>
            <Pane label="Reference">
              <img src={ref} alt="Reference" className="h-full w-full object-contain" />
            </Pane>
            {earlier?.capturePath && (
              <Pane label="Earlier try">
                <img src={imageUrl(earlier.capturePath)} alt="Earlier try" className="h-full w-full object-contain" />
              </Pane>
            )}
            {drawing ? (
              <Pane label="Your drawing">
                <MarkupImage src={drawing} strokes={[]} savedMarkup={pose.markupPath ? imageUrl(pose.markupPath) : undefined} />
              </Pane>
            ) : photos.length ? (
              <Pane label={photos.length > 1 ? `Page photo ${photo + 1} of ${photos.length}` : 'Page photo'}>
                <div className="relative h-full">
                  <PanZoomImage src={imageUrl(photos[Math.min(photo, photos.length - 1)])} alt="Page photo" />
                  {photos.length > 1 && (
                    <div className="absolute bottom-2 right-2 flex gap-1">
                      <IconButton label="Previous photo" className="bg-bg/80" onClick={() => setPhoto((p) => (p - 1 + photos.length) % photos.length)}>
                        <ArrowLeft size={16} />
                      </IconButton>
                      <IconButton label="Next photo" className="bg-bg/80" onClick={() => setPhoto((p) => (p + 1) % photos.length)}>
                        <ArrowRight size={16} />
                      </IconButton>
                    </div>
                  )}
                </div>
              </Pane>
            ) : null}
          </>
        )}
      </div>

      {!drawing && !photos.length && (
        <p className="text-center text-muted">
          Hold your page next to the screen. Check the main line first, then proportions and tilt. Add a photo of the page to see
          them side by side.
        </p>
      )}
    </div>
  )
}

export function Overlay({ reference, drawing }: { reference: string; drawing: string }) {
  const [opacity, setOpacity] = useState(55)
  const { view, handlers, reset } = usePanZoom()
  return (
    <figure className="flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1 cursor-grab overflow-hidden rounded-md bg-surface active:cursor-grabbing" {...handlers}>
        <img src={reference} alt="Reference" draggable={false} className="absolute inset-0 h-full w-full object-contain" />
        <img
          src={drawing}
          alt="Your drawing over the reference"
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain"
          style={{ opacity: opacity / 100, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        />
      </div>
      <figcaption className="flex items-center justify-center gap-3 pt-2 text-[12.5px] text-muted">
        <label className="flex items-center gap-2">
          Drawing opacity
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
