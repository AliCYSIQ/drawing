import { useCallback, useEffect, useRef, useState } from 'react'
import { MISTAKES, type Stroke } from '@shared/types'
import { Float, Flip, Grey, Pause, Play, Redo, Stop } from '../components/Icons'
import { Compare, drawingSources, type DrawingSource } from '../components/Compare'
import { ProgressLine } from '../components/ProgressLine'
import { Stage } from '../components/Stage'
import { Button, IconButton } from '../components/ui'
import {
  canTryAgain,
  memoryAdvance,
  memoryAgain,
  memoryDuration,
  memoryElapsed,
  memoryNextRef,
  memoryRemaining,
  memoryStop,
  memoryTick,
  memoryTogglePause,
  type MemoryEvent,
  type MemoryState,
  type MemoryStep
} from '../lib/memoryEngine'
import { chime } from '../lib/sound'
import { useApp } from '../store'

/**
 * Memory mode, after the study loop from Kim Jung Gi's memory practice:
 * study the reference, hide it and draw from memory, reveal it and mark the
 * differences in red, then draw it again while the corrections are fresh.
 */
export function MemorySession() {
  const run = useApp((s) => s.run)
  const timerDisplay = useApp((s) => s.settings.timerDisplay)
  const float = useApp((s) => s.float)
  const setFloat = useApp((s) => s.setFloat)
  const [now, setNow] = useState(() => Date.now())
  const [peekHidden, setPeekHidden] = useState(false)
  const [flip, setFlip] = useState(false)
  const [grey, setGrey] = useState(false)
  const pending = useRef<Promise<unknown>[]>([])
  const floatWasOn = useRef(false)

  const handleEvents = useCallback((events: MemoryEvent[]) => {
    const st = useApp.getState()
    const r = st.run
    if (!r) return
    for (const ev of events) {
      if (ev.type === 'drawStart') {
        if (st.settings.sound) chime('rest')
      } else if (ev.type === 'drawEnd') {
        if (st.settings.sound) chime('pose')
        const slot = r.memory!.refs[ev.index]
        const idx = st.addResult({
          imageId: slot.imageId,
          imagePath: slot.imagePath,
          plannedSeconds: r.memory!.drawSeconds,
          spentMs: Math.round(ev.drawMs),
          studyMs: Math.round(ev.studyMs),
          attempt: ev.attempt,
          skipped: false,
          mistakes: [],
          redo: false
        })
        if (r.plan.capture && st.settings.captureRegion) {
          pending.current.push(
            window.api.capture(st.settings.captureRegion, r.id, idx).then((path) => {
              if (path) useApp.getState().updateResult(idx, { capturePath: path })
            })
          )
        }
        // A small float window is too cramped to compare in; come back to full size.
        if (useApp.getState().float.on) {
          floatWasOn.current = true
          useApp.getState().setFloat({ on: false })
        }
      } else if (ev.type === 'done') {
        if (st.settings.sound && ev.finished) chime('done')
        const waiting = pending.current
        pending.current = []
        void Promise.allSettled(waiting).then(() => useApp.getState().finishRun(ev.finished))
      }
    }
  }, [])

  /** `refresh` false: the clock ticking; the page only redraws when the shown second or the phase changes. */
  const apply = useCallback(
    (fn: (s: MemoryState, now: number) => MemoryStep, refresh = true) => {
      const r = useApp.getState().run
      if (!r?.memory || r.memory.phase === 'done') return
      const step = fn(r.memory, Date.now())
      const changed = step.state !== r.memory
      if (changed) useApp.getState().setMemory(step.state)
      handleEvents(step.events)
      if (refresh || changed) setNow(Date.now())
    },
    [handleEvents]
  )
  const shownSecond = useRef('')

  /** Continue from the reveal; marks and notes are already saved on the attempt as you make them. */
  const leaveReveal = useCallback(
    (fn: (s: MemoryState, now: number) => MemoryStep) => {
      apply(fn)
      if (floatWasOn.current && useApp.getState().run?.memory?.phase !== 'done') {
        floatWasOn.current = false
        useApp.getState().setFloat({ on: true })
      }
    },
    [apply]
  )

  useEffect(() => {
    const id = setInterval(() => {
      apply(memoryTick, false)
      const m = useApp.getState().run?.memory
      if (!m) return
      const t = Date.now()
      const left = memoryRemaining(m, t)
      const second = left === null ? Math.floor(memoryElapsed(m, t) / 1000) : Math.ceil(left / 1000)
      const key = `${m.index}-${m.attempt}-${m.phase}-${m.paused}-${second}`
      if (key !== shownSecond.current) {
        shownSecond.current = key
        setNow(t)
      }
    }, 100)
    return () => clearInterval(id)
  }, [apply])

  const phase = run?.memory?.phase

  useEffect(() => {
    return window.api.onHotkey((action) => {
      const p = useApp.getState().run?.memory?.phase
      if (action === 'pause') apply((s, t) => ({ state: memoryTogglePause(s, t), events: [] }))
      else if (p === 'study' || p === 'draw') apply(memoryAdvance)
    })
  }, [apply])

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return
      if (e.key === 'Escape') leaveReveal(memoryStop)
      else if (phase === 'reveal') {
        if (e.key === 'Enter') {
          const s = useApp.getState().run?.memory
          leaveReveal(s && canTryAgain(s) ? memoryAgain : memoryNextRef)
        } else if (e.key === 'ArrowRight') leaveReveal(memoryNextRef)
      } else {
        if (e.key === ' ') {
          e.preventDefault()
          apply((s, t) => ({ state: memoryTogglePause(s, t), events: [] }))
        } else if (e.key === 'Enter') apply(memoryAdvance)
        else if (e.key.toLowerCase() === 'h' && phase === 'study') setPeekHidden(true)
        else if (e.key.toLowerCase() === 'f') setFlip((v) => !v)
        else if (e.key.toLowerCase() === 'g') setGrey((v) => !v)
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'h') setPeekHidden(false)
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [apply, leaveReveal, phase])

  if (!run?.memory) return null
  const m = run.memory
  const slot = m.refs[Math.min(m.index, m.refs.length - 1)]
  const left = memoryRemaining(m, now)
  const shown = left ?? memoryElapsed(m, now)
  const duration = memoryDuration(m)
  const urgent = left !== null && left <= 5000
  // "Line only" hides the numbers while the progress line shows the time; an untimed drawing still counts up.
  const showClock = timerDisplay === 'clock' || left === null

  if (m.phase === 'reveal' || m.phase === 'done') {
    return <Reveal leave={leaveReveal} />
  }

  const studying = m.phase === 'study'
  const label = studying
    ? `Study reference ${m.index + 1} of ${m.refs.length}`
    : `Draw it from memory, attempt ${m.attempt} of ${m.maxAttempts}`

  return (
    <Stage
      path={studying && !peekHidden ? slot.imagePath : null}
      fallback={slot.fallbackPath}
      flip={flip}
      grey={grey}
      overlay={
        <>
          {!studying && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <div className={float.on ? 'text-[13px] text-muted' : 'text-[15px] text-muted'}>
                The reference is hidden. Draw what you remember.
              </div>
              {showClock && (
                <div className={`tnum font-semibold leading-none tracking-[-0.03em] ${urgent ? 'text-red' : ''} ${float.on ? 'text-[36px]' : 'text-[72px]'}`}>
                  {clock(shown, left !== null)}
                </div>
              )}
              <Button tone="primary" onClick={() => apply(memoryAdvance)}>
                Reveal (Enter)
              </Button>
            </div>
          )}
          {studying && peekHidden && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-muted">
              Picture it on your page. Let go of H to look again.
            </div>
          )}
          {m.paused && (
            <div className="absolute inset-0 flex items-center justify-center bg-bg/55">
              <div className="rounded-md bg-surface px-4 py-2 text-[15px] ring-1 ring-line">Paused. Press space to go on.</div>
            </div>
          )}
          {!float.on && <div className="pointer-events-none absolute left-4 top-3 text-muted">{label}</div>}
          {studying && showClock && (
            <div
              className={`tnum pointer-events-none absolute bottom-3 right-4 font-semibold leading-none tracking-[-0.03em] drop-shadow-[0_1px_8px_rgba(0,0,0,0.45)] ${
                urgent ? 'text-red' : 'text-ink'
              } ${float.on ? 'text-[26px]' : 'text-[44px]'}`}
            >
              {clock(shown, true)}
            </div>
          )}
          <ProgressLine carried={m.carried} phaseStart={m.phaseStart} paused={m.paused} durationMs={duration} urgent={urgent} />
        </>
      }
    >
      <IconButton label={m.paused ? 'Go on (space)' : 'Pause (space)'} onClick={() => apply((s, t) => ({ state: memoryTogglePause(s, t), events: [] }))}>
        {m.paused ? <Play size={17} /> : <Pause size={17} />}
      </IconButton>
      {studying ? (
        <>
          <button
            type="button"
            className="h-9 rounded-md px-3 text-[13px] text-muted hover:bg-raised hover:text-ink"
            onPointerDown={() => setPeekHidden(true)}
            onPointerUp={() => setPeekHidden(false)}
            onPointerLeave={() => setPeekHidden(false)}
            title="Hold to hide the reference and test your memory (or hold H)"
          >
            Hold to test
          </button>
          <Button tone="primary" className="h-8" onClick={() => apply(memoryAdvance)}>
            Hide it, I'm ready
          </Button>
        </>
      ) : (
        <Button tone="primary" className="h-8" onClick={() => apply(memoryAdvance)}>
          Reveal
        </Button>
      )}
      <span className="mx-1 h-5 w-px bg-line" />
      {studying && (
        <>
          <IconButton label="Flip (F)" active={flip} onClick={() => setFlip((v) => !v)}>
            <Flip size={17} />
          </IconButton>
          <IconButton label="Greyscale (G)" active={grey} onClick={() => setGrey((v) => !v)}>
            <Grey size={17} />
          </IconButton>
        </>
      )}
      <IconButton label={float.on ? 'Leave float mode' : 'Float on top'} active={float.on} onClick={() => setFloat({ on: !float.on })}>
        <Float size={17} />
      </IconButton>
      <span className="mx-1 h-5 w-px bg-line" />
      <IconButton label="End session (Esc)" onClick={() => apply(memoryStop)}>
        <Stop size={17} />
      </IconButton>
    </Stage>
  )
}

function Reveal({ leave }: { leave: (fn: (s: MemoryState, now: number) => MemoryStep) => void }) {
  const run = useApp((s) => s.run)!
  const updateResult = useApp((s) => s.updateResult)
  const m = run.memory!
  const idx = run.results.length - 1
  const result = run.results[idx]
  const slot = m.refs[m.index]
  if (!result) return null
  const again = canTryAgain(m)
  const last = m.index >= m.refs.length - 1

  // Earlier attempts at this reference, shown between the reference and this one.
  const earlier: DrawingSource[] = run.results
    .filter((r, i) => i < idx && r.imageId === result.imageId)
    .flatMap((r) => {
      const s = drawingSources(r)[0]
      return s ? [{ ...s, label: `Try ${r.attempt}` }] : []
    })

  const toggle = (mk: string) =>
    updateResult(idx, { mistakes: result.mistakes.includes(mk) ? result.mistakes.filter((x) => x !== mk) : [...result.mistakes, mk] })

  const addPhotos = async (paths: string[]) => {
    const kept = await Promise.all(paths.map((p) => window.api.keepPhoto(run.id, p)))
    const current = useApp.getState().run?.results[idx]
    updateResult(idx, { photos: [...(current?.photos ?? []), ...kept] })
  }

  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)_310px]">
      <div className="flex min-h-0 min-w-0 flex-col">
        <h1 className="px-4 pt-4 text-[17px] font-semibold">
          Compare: reference {m.index + 1} of {m.refs.length}, attempt {m.attempt}
        </h1>
        <Compare
          key={idx}
          referencePath={slot.imagePath}
          referenceFallback={slot.fallbackPath}
          sources={drawingSources(result)}
          earlier={earlier}
          marks={result.marks ?? {}}
          onMarks={(path: string, strokes: Stroke[]) =>
            updateResult(idx, { marks: { ...useApp.getState().run?.results[idx]?.marks, [path]: strokes } })
          }
          onAddPhotos={addPhotos}
          penDefault
          emptyHint="Put your page next to the reference. Find 4 to 6 big differences (angles, proportions, the spaces between shapes) and mark each one in red on your paper."
        />
      </div>

      <aside className="flex min-h-0 flex-col gap-5 overflow-y-auto border-l border-line p-5">
        <div>
          <div className="text-[15px] font-semibold">What did you remember wrong?</div>
          <div className="text-[12.5px] text-muted">
            Studied {Math.round((result.studyMs ?? 0) / 1000)}s, drew {Math.round(result.spentMs / 1000)}s
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {MISTAKES.filter((mk) => mk !== 'ran out of time').map((mk) => (
            <button
              key={mk}
              type="button"
              aria-pressed={result.mistakes.includes(mk)}
              onClick={() => toggle(mk)}
              className={`h-8 rounded-full px-3 text-[13px] ring-1 transition-colors first-letter:uppercase ${
                result.mistakes.includes(mk) ? 'bg-blue-soft text-blue ring-blue' : 'text-ink ring-line hover:ring-muted'
              }`}
            >
              {mk}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="block pb-2 text-muted">What to fix next time</span>
          <textarea
            value={result.note ?? ''}
            onChange={(e) => updateResult(idx, { note: e.target.value })}
            rows={3}
            placeholder="e.g. the elbow lines up with the hip"
            className="w-full resize-none rounded-md bg-surface p-2.5 text-ink outline-none ring-1 ring-line placeholder:text-muted/70 focus:ring-blue"
          />
        </label>

        <div className="mt-auto grid gap-2">
          {again && (
            <Button tone="primary" className="h-11" onClick={() => leave(memoryAgain)}>
              <Redo size={16} /> Draw it again from memory (Enter)
            </Button>
          )}
          <Button tone={again ? 'quiet' : 'primary'} className="h-11" onClick={() => leave(memoryNextRef)}>
            {last ? 'Finish session' : 'Next reference (→)'}
          </Button>
          <Button tone="ghost" onClick={() => leave(memoryStop)}>
            End session
          </Button>
        </div>
      </aside>
    </div>
  )
}

function clock(ms: number, countdown: boolean): string {
  const total = countdown ? Math.ceil(ms / 1000) : Math.floor(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
