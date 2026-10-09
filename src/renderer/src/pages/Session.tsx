import { useCallback, useEffect, useRef, useState } from 'react'
import { Back, Float, Flip, Grey, Next, Pause, Play, Refresh, Stop } from '../components/Icons'
import { Stage } from '../components/Stage'
import { IconButton } from '../components/ui'
import {
  back,
  restart,
  elapsed,
  next,
  phaseDuration,
  remaining,
  stop,
  tick,
  togglePause,
  type EngineEvent,
  type Step
} from '../lib/sessionEngine'
import { chime } from '../lib/sound'
import { useApp } from '../store'

export function Session() {
  const run = useApp((s) => s.run)
  const timerDisplay = useApp((s) => s.settings.timerDisplay)
  const float = useApp((s) => s.float)
  const setFloat = useApp((s) => s.setFloat)
  const [now, setNow] = useState(() => Date.now())
  const [flip, setFlip] = useState(false)
  const [grey, setGrey] = useState(false)
  const pending = useRef<Promise<unknown>[]>([])

  const handleEvents = useCallback((events: EngineEvent[]) => {
    const { run: r, settings, setCapture, finishRun } = useApp.getState()
    if (!r) return
    for (const ev of events) {
      if (ev.type === 'poseEnd') {
        if (settings.sound && ev.reason === 'time') chime('pose')
        if (r.plan.capture && settings.captureRegion) {
          const index = ev.index
          pending.current.push(
            window.api.capture(settings.captureRegion, r.id, index).then((path) => {
              if (path) setCapture(index, path)
            })
          )
        }
      } else if (ev.type === 'restEnd') {
        if (settings.sound) chime('rest')
      } else if (ev.type === 'done') {
        if (settings.sound && ev.finished) chime('done')
        // Wait for the last capture so it lands in the saved session.
        const waiting = pending.current
        pending.current = []
        void Promise.allSettled(waiting).then(() => finishRun(ev.finished))
      }
    }
  }, [])

  const apply = useCallback(
    (fn: (now: number) => Step) => {
      const r = useApp.getState().run
      if (!r || r.engine.phase === 'done') return
      const step = fn(Date.now())
      if (step.state !== r.engine) useApp.getState().setEngine(step.state)
      handleEvents(step.events)
      setNow(Date.now())
    },
    [handleEvents]
  )

  const doNext = useCallback(() => apply((t) => next(useApp.getState().run!.engine, t)), [apply])
  const doBack = useCallback(() => apply((t) => back(useApp.getState().run!.engine, t)), [apply])
  const doStop = useCallback(() => apply((t) => stop(useApp.getState().run!.engine, t)), [apply])
  const doRestart = useCallback(() => apply((t) => ({ state: restart(useApp.getState().run!.engine, t), events: [] })), [apply])
  const lastTick = useRef<string>('')
  const doPause = useCallback(() => {
    const r = useApp.getState().run
    if (!r || r.engine.phase === 'done') return
    useApp.getState().setEngine(togglePause(r.engine, Date.now()))
  }, [])

  // The clock: check the engine ten times a second.
  useEffect(() => {
    const id = setInterval(() => {
      apply((t) => tick(useApp.getState().run!.engine, t))
      // Optional soft ticks in the last 3 seconds of a timed pose (10 s or longer).
      const { run: r, settings } = useApp.getState()
      if (!r || !settings.sound || !settings.countdownTicks) return
      const e = r.engine
      const left = remaining(e, Date.now())
      if (e.phase !== 'pose' || e.paused || left === null || phaseDuration(e) < 10_000) return
      const sec = Math.ceil(left / 1000)
      const key = `${e.index}-${sec}`
      if (sec >= 1 && sec <= 3 && lastTick.current !== key) {
        lastTick.current = key
        chime('tick')
      }
    }, 100)
    return () => clearInterval(id)
  }, [apply])

  useEffect(() => {
    return window.api.onHotkey((action) => (action === 'pause' ? doPause() : doNext()))
  }, [doPause, doNext])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === ' ') {
        e.preventDefault()
        doPause()
      } else if (e.key === 'ArrowRight') doNext()
      else if (e.key === 'ArrowLeft') doBack()
      else if (e.key === 'Escape') doStop()
      else if (e.key.toLowerCase() === 'r') doRestart()
      else if (e.key.toLowerCase() === 'f') setFlip((v) => !v)
      else if (e.key.toLowerCase() === 'g') setGrey((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doPause, doNext, doBack, doStop, doRestart])

  if (!run) return null
  const e = run.engine
  const slot = e.slots[Math.min(e.index, e.slots.length - 1)]
  const left = remaining(e, now)
  const duration = phaseDuration(e)
  const progress = duration ? Math.min(1, elapsed(e, now) / duration) : 0
  const urgent = left !== null && left <= 5000 && e.phase === 'pose'
  const resting = e.phase === 'rest'
  const shownMs = left ?? elapsed(e, now)
  // "Line only" hides the numbers during poses; the progress line still shows the time.
  const showClock = timerDisplay === 'clock' || resting || left === null

  return (
    <Stage
      path={resting ? null : slot?.imagePath ?? null}
      fallback={slot?.fallbackPath}
      flip={flip}
      grey={grey}
      overlay={
        <>
          {resting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <div className="text-muted">Rest</div>
              <div className="tnum text-[64px] font-semibold leading-none tracking-[-0.03em]">{Math.ceil(shownMs / 1000)}</div>
              <div className="text-muted">
                Next: pose {e.index + 2} of {e.slots.length}
              </div>
            </div>
          )}
          {e.paused && !resting && (
            <div className="absolute inset-0 flex items-center justify-center bg-bg/55">
              <div className="rounded-md bg-surface px-4 py-2 text-[15px] ring-1 ring-line">Paused. Press space to go on.</div>
            </div>
          )}
          {showClock && (
            <div
              className={`tnum pointer-events-none absolute bottom-3 right-4 font-semibold leading-none tracking-[-0.03em] drop-shadow-[0_1px_8px_rgba(0,0,0,0.45)] transition-colors ${
                urgent ? 'text-red' : 'text-ink'
              } ${float.on ? 'text-[26px]' : 'text-[44px]'}`}
              aria-live="off"
            >
              {clock(shownMs, left !== null)}
            </div>
          )}
          {!float.on && (
            <div className="pointer-events-none absolute left-4 top-3 text-muted">
              {resting ? 'Rest' : `Pose ${e.index + 1} of ${e.slots.length}`}
            </div>
          )}
          {duration > 0 && (
            <div className="absolute inset-x-0 bottom-0 h-[3px] bg-line/60">
              <div
                className={`h-full ${urgent ? 'bg-red' : 'bg-blue'}`}
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          )}
        </>
      }
    >
      <IconButton label="Previous pose (←)" onClick={doBack}>
        <Back size={17} />
      </IconButton>
      <IconButton label={e.paused ? 'Go on (space)' : 'Pause (space)'} onClick={doPause}>
        {e.paused ? <Play size={17} /> : <Pause size={17} />}
      </IconButton>
      <IconButton label="Restart this pose (R)" onClick={doRestart} disabled={resting}>
        <Refresh size={17} />
      </IconButton>
      <IconButton label={resting ? 'Skip rest (→)' : 'Next pose (→)'} onClick={doNext}>
        <Next size={17} />
      </IconButton>
      <span className="mx-1 h-5 w-px bg-line" />
      <IconButton label="Flip (F)" active={flip} onClick={() => setFlip((v) => !v)}>
        <Flip size={17} />
      </IconButton>
      <IconButton label="Greyscale (G)" active={grey} onClick={() => setGrey((v) => !v)}>
        <Grey size={17} />
      </IconButton>
      <IconButton label={float.on ? 'Leave float mode' : 'Float on top'} active={float.on} onClick={() => setFloat({ on: !float.on })}>
        <Float size={17} />
      </IconButton>
      <span className="mx-1 h-5 w-px bg-line" />
      <IconButton label="End session (Esc)" onClick={doStop}>
        <Stop size={17} />
      </IconButton>
    </Stage>
  )
}

function clock(ms: number, countdown: boolean): string {
  const total = countdown ? Math.ceil(ms / 1000) : Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
