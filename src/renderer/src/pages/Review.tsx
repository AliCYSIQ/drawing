import { useEffect, useMemo, useState } from 'react'
import { thumbUrl } from '@shared/api'
import { MISTAKES, type PoseResult, type SessionRecord, type Stroke } from '@shared/types'
import { Compare, drawingSources, type DrawingSource } from '../components/Compare'
import { ArrowLeft, ArrowRight, Camera, Check, Redo } from '../components/Icons'
import { Button, IconButton } from '../components/ui'
import { formatDuration, formatSeconds } from '../lib/schedule'
import { mistakeSummary } from '../lib/stats'
import { useApp } from '../store'

/** Earlier tries at the same reference: memory-mode attempts before this one, or the pose a redo came from. */
function earlierTries(session: SessionRecord, pose: PoseResult, original?: SessionRecord): DrawingSource[] {
  const first = (p: PoseResult, label: string): DrawingSource[] => {
    const s = drawingSources(p)[0]
    return s ? [{ ...s, label }] : []
  }
  if (pose.attempt) {
    return session.poses
      .filter((p) => p.imageId === pose.imageId && (p.attempt ?? 0) < pose.attempt!)
      .flatMap((p) => first(p, `Try ${p.attempt}`))
  }
  const before = original?.poses.find((p) => p.imageId === pose.imageId)
  return before ? first(before, 'Earlier try') : []
}

export function Review({ sessionId }: { sessionId: string }) {
  const session = useApp((s) => s.sessions.find((x) => x.id === sessionId))
  const sessions = useApp((s) => s.sessions)
  const updatePose = useApp((s) => s.updatePose)
  const updateSession = useApp((s) => s.updateSession)
  const go = useApp((s) => s.go)
  const startRun = useApp((s) => s.startRun)
  const notify = useApp((s) => s.notify)
  const [i, setI] = useState(0)
  const [summary, setSummary] = useState(false)

  const original = useMemo(
    () => (session?.redoOf ? sessions.find((s) => s.id === session.redoOf) : undefined),
    [session, sessions]
  )

  const count = session?.poses.length ?? 0
  const pose = session?.poses[Math.min(i, count - 1)]

  const toggleMistake = (m: string) => {
    if (!session || !pose) return
    const mistakes = pose.mistakes.includes(m) ? pose.mistakes.filter((x) => x !== m) : [...pose.mistakes, m]
    updatePose(session.id, i, { mistakes })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (summary || e.ctrlKey || e.altKey) return
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

  const keep = (paths: string[]) => Promise.all(paths.map((p) => window.api.keepPhoto(session.id, p)))

  const addPagePhotos = async () => {
    const picked = await window.api.pickPhotos()
    if (!picked.length) return
    const kept = await keep(picked)
    updateSession(session.id, (s) => ({ ...s, pagePhotos: [...s.pagePhotos, ...kept] }))
    notify(`Added ${kept.length} page ${kept.length === 1 ? 'photo' : 'photos'}. They show for every pose.`)
  }

  const addPosePhotos = async (paths: string[]) => {
    const kept = await keep(paths)
    const index = i
    updateSession(session.id, (s) => ({
      ...s,
      poses: s.poses.map((p, k) => (k === index ? { ...p, photos: [...(p.photos ?? []), ...kept] } : p))
    }))
  }

  const setMarks = (path: string, strokes: Stroke[]) =>
    updatePose(session.id, i, { marks: { ...pose.marks, [path]: strokes } })

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <div className="mr-auto">
          <h1 className="text-[17px] font-semibold">{session.redoOf ? 'Review: second try' : 'Review'}</h1>
          <div className="text-[12.5px] text-muted">
            {new Date(session.startedAt).toLocaleString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit'
            })}
            {', '}
            {session.poses.length} poses, {formatDuration(session.activeMs / 1000)}
          </div>
        </div>
        <Button onClick={addPagePhotos} title="A photo of a whole paper page; it shows next to every pose">
          <Camera size={16} /> Add page photos
        </Button>
        <Button onClick={redo} disabled={!flagged.length}>
          <Redo size={16} /> Redo flagged{flagged.length ? ` (${flagged.length})` : ''}
        </Button>
        <Button tone="primary" onClick={() => setSummary(true)}>
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

        <Compare
          key={i}
          referencePath={pose.imagePath}
          sources={drawingSources(pose, session.pagePhotos)}
          earlier={earlierTries(session, pose, original)}
          marks={pose.marks ?? {}}
          onMarks={setMarks}
          onAddPhotos={addPosePhotos}
          emptyHint="Hold your page next to the screen and check the main line first, then proportions and tilt. Or add a photo to see them side by side."
        />

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
            <span className="text-center text-[12.5px] text-muted">Keys 1–7 tag, M marks</span>
            <IconButton label="Next pose (→)" disabled={i >= count - 1} onClick={() => setI(i + 1)}>
              <ArrowRight size={18} />
            </IconButton>
          </div>
        </aside>
      </div>

      {summary && (
        <Summary
          session={session}
          sessions={sessions}
          flagged={flagged.length}
          onRedo={redo}
          onFinish={finish}
          onBack={() => setSummary(false)}
        />
      )}
    </div>
  )
}

/** What this review found, next to how often each mistake usually shows up. */
function Summary({
  session,
  sessions,
  flagged,
  onRedo,
  onFinish,
  onBack
}: {
  session: SessionRecord
  sessions: SessionRecord[]
  flagged: number
  onRedo: () => void
  onFinish: () => void
  onBack: () => void
}) {
  const rows = mistakeSummary(session, sessions)
  const hasHistory = sessions.some((s) => s.reviewed && s.id !== session.id && s.startedAt < session.startedAt)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack()
      else if (e.key === 'Enter') onFinish()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack, onFinish])

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg/70" role="dialog" aria-label="Review summary">
      <div className="w-[min(460px,90vw)] rounded-lg bg-surface p-6 shadow-[0_12px_40px_rgba(0,0,0,0.4)] ring-1 ring-line">
        <h2 className="text-[17px] font-semibold">Review done</h2>
        {rows.length ? (
          <>
            <p className="mt-1 text-muted">What you tagged this session{hasHistory ? ', and how often it usually comes up' : ''}:</p>
            <table className="mt-4 w-full">
              <tbody>
                {rows.map((r) => (
                  <tr key={r.mistake} className="border-t border-line">
                    <td className="py-2 first-letter:uppercase">{r.mistake}</td>
                    <td className="tnum py-2 text-right font-semibold">{r.count}×</td>
                    {hasHistory && (
                      <td className={`tnum w-36 py-2 text-right text-[12.5px] ${r.count > r.usual ? 'text-red' : 'text-muted'}`}>
                        usually {r.usual}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="mt-1 text-muted">No mistakes tagged this time.</p>
        )}
        {flagged > 0 && (
          <p className="mt-4 text-muted">
            {flagged} {flagged === 1 ? 'pose is' : 'poses are'} flagged to draw again.
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button tone="ghost" onClick={onBack}>
            Back to review
          </Button>
          {flagged > 0 && (
            <Button onClick={onRedo}>
              <Redo size={16} /> Redo flagged ({flagged})
            </Button>
          )}
          <Button tone="primary" onClick={onFinish}>
            Finish
          </Button>
        </div>
      </div>
    </div>
  )
}
