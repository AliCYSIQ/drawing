import { useEffect, useRef, useState } from 'react'
import type { CaptureResult } from '@shared/capture'
import { CapturePreview } from '../components/Capture'
import { Pause, Play, Stop } from '../components/Icons'
import { Button } from '../components/ui'
import { freeElapsed, freePaused } from '../lib/freeEngine'
import { captureNow, captureTargetOf, useApp } from '../store'

/**
 * A free drawing session: a clock you can pause, and nothing else. Space (or
 * the pause hotkey from any app) pauses and goes on; End saves the session.
 * With capture on, the chosen window is captured first and shown: keep it,
 * retake it, or save without it. Until then the session is safe (it is
 * paused and saved, so even closing the app doesn't lose it).
 */
export function FreeSession() {
  const free = useApp((s) => s.free)
  const toggle = useApp((s) => s.toggleFree)
  const end = useApp((s) => s.endFree)
  const skill = useApp((s) => s.skills.find((k) => k.id === s.free?.skillId)?.name)
  // A boolean, not the target object: a new object on every read would redraw forever.
  const target = useApp((s) => !!captureTargetOf(s.settings))
  const [now, setNow] = useState(() => Date.now())
  const [shot, setShot] = useState<CaptureResult | null>(null)
  // Each try is its own file, so a retake never races the one it replaces.
  const tries = useRef(0)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])

  useEffect(() => window.api.onHotkey((action) => action === 'pause' && useApp.getState().toggleFree()), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.ctrlKey || e.altKey || e.metaKey) return
      if (e.key === ' ' && !document.querySelector('[role="dialog"]')) {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  if (!free) return null
  const paused = freePaused(free)
  const ms = freeElapsed(free, now)

  const take = async () => {
    setShot({})
    setShot(await captureNow(free.id, tries.current++))
  }

  const finish = () => {
    if (!free.capture) return end()
    if (!paused) toggle()
    void take()
  }

  const discard = () => {
    if (shot?.path) void window.api.deleteSessionFile(shot.path)
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="text-muted">
        Free drawing{skill ? ` · ${skill}` : ''}
        {free.capture ? (target ? ' · the canvas is captured when you end' : ' · no window chosen for the capture') : ''}
      </div>
      <div className={`tnum text-[88px] font-semibold leading-none tracking-[-0.03em] ${paused ? 'text-muted' : 'text-ink'}`} aria-label="Drawing time" role="timer">
        {clock(ms)}
      </div>
      <div className="h-6 text-muted" aria-live="polite">
        {paused ? 'Paused. Paused time doesn’t count.' : 'Drawing. The clock runs while you draw in another app.'}
      </div>
      <div className="flex gap-2">
        <Button tone="primary" className="h-11 min-w-36 text-[14px]" onClick={toggle} disabled={!!shot}>
          {paused ? <Play size={16} /> : <Pause size={16} />} {paused ? 'Resume' : 'Pause'}
        </Button>
        <Button className="h-11 min-w-36 text-[14px]" onClick={finish} disabled={!!shot}>
          <Stop size={16} /> End and save
        </Button>
      </div>
      <p className="max-w-md text-[12.5px] text-muted">Space pauses while this window is in front. You can minimize the app; the clock keeps going, and a session survives closing the app (it comes back paused).</p>
      {shot && (
        <CapturePreview
          title="Your canvas at the end"
          result={shot}
          onRetake={() => {
            discard()
            void take()
          }}
          onKeep={() => end(shot.path ? [shot.path] : [])}
          onClose={() => {
            discard()
            end([])
          }}
          closeLabel="Save without a picture"
        />
      )}
    </div>
  )
}

function clock(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}
