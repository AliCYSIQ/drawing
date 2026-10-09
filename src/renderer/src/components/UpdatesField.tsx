import { useEffect, useState } from 'react'
import type { AppInfo } from '@shared/api'
import { useApp } from '../store'
import { restartToUpdate } from './UpdateBanner'
import { Button, Toggle } from './ui'

/** Settings: the version, whether to check for updates, and checking now. */
export function UpdatesField() {
  const update = useApp((s) => s.update)
  const autoUpdate = useApp((s) => s.settings.autoUpdate !== false)
  const updateSettings = useApp((s) => s.updateSettings)
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    void window.api.appInfo().then(setInfo)
  }, [])

  const text: Record<typeof update.state, string> = {
    disabled: 'Updates work in the installed app (this copy runs from the source code).',
    idle: 'Not checked yet.',
    checking: 'Checking…',
    none: 'You have the latest version.',
    downloading: `Downloading version ${update.version ?? ''}${update.percent ? ` (${update.percent}%)` : ''}…`,
    ready: `Version ${update.version} is ready.`,
    error: update.error ?? 'The update check failed.'
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-ink">Version {info?.version ?? '…'}</span>
        <span className={update.state === 'error' ? 'text-red' : 'text-muted'}>{text[update.state]}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {update.state === 'ready' ? (
          <Button tone="primary" onClick={() => void restartToUpdate()}>
            Restart and update
          </Button>
        ) : (
          <Button
            onClick={() => void window.api.checkUpdates()}
            disabled={update.state === 'disabled' || update.state === 'checking' || update.state === 'downloading'}
          >
            Check now
          </Button>
        )}
        {info?.releasesUrl && (
          <a href={info.releasesUrl} target="_blank" rel="noreferrer" className="px-2 text-blue hover:underline">
            What’s new
          </a>
        )}
      </div>
      <Toggle
        checked={autoUpdate}
        onChange={(on) => updateSettings({ autoUpdate: on })}
        label="Check for updates when the app starts"
        hint="New versions download in the background and install when you restart or close the app, never during a session."
      />
    </div>
  )
}
