// Choosing what the canvas capture takes: a window (like PureRef's "pin to a
// window": choose it once, it is remembered), the whole of it or a part.
// Also the small preview that shows a capture so it can be kept or retaken.

import { useEffect, useRef, useState } from 'react'
import { imageUrl } from '@shared/api'
import { describeTarget, type Crop, type WindowChoice } from '@shared/capture'
import { captureNow, captureTargetOf, useApp } from '../store'
import { Button } from './ui'

/** What the capture takes now, with buttons to choose a window and to try it. */
export function CaptureSetup() {
  const settings = useApp((s) => s.settings)
  const updateSettings = useApp((s) => s.updateSettings)
  const notify = useApp((s) => s.notify)
  const [picking, setPicking] = useState(false)
  const [test, setTest] = useState<{ path?: string; error?: string } | null>(null)
  const target = captureTargetOf(settings)

  const tryIt = async () => {
    setTest({})
    const r = await captureNow(`test-${Date.now()}`, 0)
    setTest(r)
  }

  const pickScreen = async () => {
    const region = await window.api.pickRegion()
    if (region) {
      updateSettings({ captureRegion: region, captureWindow: undefined })
      notify('Screen area saved.')
    }
  }

  return (
    <div className="grid gap-2">
      <p className="text-[12.5px] text-muted">{describeTarget(target)}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setPicking(true)}>{settings.captureWindow ? 'Change window…' : 'Choose window…'}</Button>
        {target && (
          <Button tone="ghost" onClick={() => void tryIt()}>
            Test capture
          </Button>
        )}
        {!settings.captureWindow && (
          <button type="button" className="text-[12.5px] text-muted hover:text-ink" onClick={() => void pickScreen()}>
            {settings.captureRegion ? 'Pick the screen area again' : 'or use a fixed screen area'}
          </button>
        )}
      </div>
      {picking && <WindowPicker onClose={() => setPicking(false)} />}
      {test && (
        <CapturePreview
          title="Test capture"
          result={test}
          onRetake={() => void tryIt()}
          onClose={() => {
            if (test.path) void window.api.deleteSessionFile(test.path)
            setTest(null)
          }}
          closeLabel="Close"
        />
      )}
    </div>
  )
}

/** Step 1: choose a window. Step 2: the whole window, or drag a part of it. */
export function WindowPicker({ onClose }: { onClose: () => void }) {
  const updateSettings = useApp((s) => s.updateSettings)
  const notify = useApp((s) => s.notify)
  const [list, setList] = useState<WindowChoice[] | null>(null)
  const [chosen, setChosen] = useState<WindowChoice | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [mode, setMode] = useState<'whole' | 'part'>('whole')
  const [crop, setCrop] = useState<Crop | null>(null)

  const load = () => {
    setList(null)
    void window.api.listWindows().then(setList)
  }
  useEffect(load, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const choose = async (w: WindowChoice) => {
    setChosen(w)
    setPreview(await window.api.windowPreview(w.id))
  }

  const save = () => {
    if (!chosen) return
    updateSettings({ captureWindow: { title: chosen.title, hint: chosen.id, ...(mode === 'part' && crop ? { crop } : {}) } })
    notify(`Captures now take ${mode === 'part' && crop ? 'part of' : 'the whole'} “${chosen.title}”.`)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/70 p-6" role="dialog" aria-label="Choose a window to capture">
      <div className="flex max-h-full w-[min(900px,100%)] flex-col overflow-hidden rounded-lg bg-surface shadow-[0_12px_40px_rgba(0,0,0,0.4)] ring-1 ring-line">
        <div className="overflow-y-auto p-6">
          {!chosen ? (
            <>
              <h2 className="text-[17px] font-semibold">Which window has your canvas?</h2>
              <p className="mt-1 text-muted">
                Pick Clip Studio Paint, or any other open window. It is captured even when another window is in front of it. Minimized windows aren’t
                listed: restore them first.
              </p>
              <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                {list === null && <p className="text-muted">Looking for open windows…</p>}
                {list?.length === 0 && <p className="text-muted">No windows to capture. Open your drawing app and try again.</p>}
                {list?.map((w) => (
                  <button key={w.id} type="button" onClick={() => void choose(w)} className="rounded-md bg-bg p-2 text-left ring-1 ring-line hover:ring-blue">
                    <img src={w.thumbnail} alt="" className="aspect-[3/2] w-full rounded object-contain" />
                    <span className="mt-1.5 flex items-center gap-1.5 text-[13px] text-ink">
                      {w.icon && <img src={w.icon} alt="" className="h-4 w-4 shrink-0" />}
                      <span className="truncate" title={w.title}>
                        {w.title}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <h2 className="truncate text-[17px] font-semibold">“{chosen.title}”</h2>
              <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="What to capture">
                {(['whole', 'part'] as const).map((m) => (
                  <label key={m} className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 ring-1 ${mode === m ? 'bg-blue-soft ring-blue' : 'ring-line'}`}>
                    <input type="radio" name="capture-mode" checked={mode === m} onChange={() => setMode(m)} className="accent-[var(--blue)]" />
                    {m === 'whole' ? 'The whole window' : 'Part of it (drag over the picture)'}
                  </label>
                ))}
              </div>
              {preview ? (
                <CropArea src={preview} enabled={mode === 'part'} crop={crop} onCrop={setCrop} />
              ) : (
                <p className="mt-4 text-red">That window can’t be captured right now (closed or minimized). Go back and pick another, or restore it.</p>
              )}
              {mode === 'part' && <p className="mt-2 text-[12.5px] text-muted">The part is kept as a share of the window, so it follows when the window is resized; after big layout changes, choose it again.</p>}
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          {chosen ? (
            <Button tone="ghost" onClick={() => (setChosen(null), setPreview(null), setCrop(null), load())}>
              Back
            </Button>
          ) : (
            <Button tone="ghost" onClick={load}>
              Refresh
            </Button>
          )}
          <span className="mr-auto" />
          <Button tone="ghost" onClick={onClose}>
            Cancel
          </Button>
          {chosen && (
            <Button tone="primary" disabled={!preview || (mode === 'part' && !crop)} onClick={save}>
              Use this
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/** The window's picture; with `enabled`, dragging marks the part to capture. */
function CropArea({ src, enabled, crop, onCrop }: { src: string; enabled: boolean; crop: Crop | null; onCrop: (c: Crop | null) => void }) {
  const img = useRef<HTMLImageElement>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const at = (e: React.PointerEvent) => {
    const r = img.current!.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }
  return (
    <div className="relative mt-4 inline-block max-w-full select-none">
      <img
        ref={img}
        src={src}
        alt="The chosen window"
        draggable={false}
        className={`max-h-[55vh] max-w-full rounded ring-1 ring-line ${enabled ? 'cursor-crosshair' : ''}`}
        onPointerDown={(e) => {
          if (!enabled) return
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          start.current = at(e)
          onCrop(null)
        }}
        onPointerMove={(e) => {
          const s = start.current
          if (!s) return
          const p = at(e)
          onCrop({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), width: Math.abs(p.x - s.x), height: Math.abs(p.y - s.y) })
        }}
        onPointerUp={() => {
          start.current = null
          if (crop && (crop.width < 0.02 || crop.height < 0.02)) onCrop(null)
        }}
      />
      {enabled && crop && (
        <div
          className="pointer-events-none absolute border-2 border-blue bg-blue/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
          style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }}
        />
      )}
    </div>
  )
}

/** A capture to look at before keeping it; or why there is none, with a retry. */
export function CapturePreview({
  title,
  result,
  onRetake,
  onClose,
  onKeep,
  closeLabel = 'Don’t keep it'
}: {
  title: string
  /** `{}` while capturing. */
  result: { path?: string; error?: string }
  onRetake: () => void
  onClose: () => void
  onKeep?: () => void
  closeLabel?: string
}) {
  const busy = !result.path && !result.error
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/70 p-6" role="dialog" aria-label={title}>
      <div className="flex max-h-full w-[min(760px,100%)] flex-col rounded-lg bg-surface p-6 shadow-[0_12px_40px_rgba(0,0,0,0.4)] ring-1 ring-line">
        <h2 className="text-[17px] font-semibold">{title}</h2>
        {busy && <p className="mt-3 text-muted">Capturing…</p>}
        {result.error && (
          <p role="alert" className="mt-3 text-red">
            {result.error}
          </p>
        )}
        {result.path && <img src={imageUrl(result.path)} alt="The capture" className="mt-3 max-h-[60vh] min-h-0 rounded object-contain ring-1 ring-line" />}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button tone="ghost" onClick={onClose} disabled={busy}>
            {closeLabel}
          </Button>
          <Button onClick={onRetake} disabled={busy}>
            {result.error ? 'Try again' : 'Retake'}
          </Button>
          {onKeep && result.path && (
            <Button tone="primary" autoFocus onClick={onKeep}>
              Keep it
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
