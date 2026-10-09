import { useState } from 'react'
import { flushSaves, useApp } from '../store'
import { Button } from './ui'

/** Restart into a downloaded update: saves everything waiting first. */
export async function restartToUpdate(): Promise<void> {
  await flushSaves()
  await window.api.installUpdate()
}

/**
 * "A new version is ready" — only outside sessions, the image viewer and
 * float mode, so it never gets in the way of drawing. "Later" installs it
 * when the app is closed.
 */
export function UpdateBanner() {
  const update = useApp((s) => s.update)
  const view = useApp((s) => s.view.name)
  const floatOn = useApp((s) => s.float.on)
  const [later, setLater] = useState(false)

  if (update.state !== 'ready' || later || floatOn || view === 'session' || view === 'viewer') return null
  return (
    <div
      role="status"
      className="fixed bottom-6 right-6 z-40 flex max-w-[420px] items-center gap-3 rounded-lg bg-raised px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.35)] ring-1 ring-line"
    >
      <span className="min-w-0 flex-1 text-ink">
        Version {update.version} is ready.
        <span className="block text-[12.5px] text-muted">Restart now, or it installs when you close the app.</span>
      </span>
      <Button tone="ghost" onClick={() => setLater(true)}>
        Later
      </Button>
      <Button tone="primary" onClick={() => void restartToUpdate()}>
        Restart now
      </Button>
    </div>
  )
}
