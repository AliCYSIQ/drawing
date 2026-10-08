import { useState } from 'react'
import { DEFAULT_HOTKEYS, type HotkeyAction, type Settings as SettingsT } from '@shared/types'
import { Button, Field, PageHeader, Segmented, Toggle } from '../components/ui'
import { useApp } from '../store'

const HOTKEY_LABELS: Record<HotkeyAction, { name: string; when: string }> = {
  float: { name: 'Float mode on or off', when: 'Works any time the app is open.' },
  clickThrough: { name: 'Click-through on or off', when: 'While float mode is on. This is how you get out of click-through.' },
  pause: { name: 'Pause or go on', when: 'During a session.' },
  next: { name: 'Next pose (or Reveal, in memory mode)', when: 'During a session.' }
}

/** Turn a key press into an Electron accelerator like "Control+Alt+L". */
function accelerator(e: React.KeyboardEvent): string | null {
  const key = e.key
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return null
  const mods = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift'].filter(Boolean) as string[]
  if (!mods.length) return null
  const named: Record<string, string> = {
    ' ': 'Space',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    Escape: 'Escape',
    Enter: 'Enter'
  }
  const k = named[key] ?? (key.length === 1 ? key.toUpperCase() : /^F\d+$/.test(key) ? key : null)
  return k ? [...mods, k].join('+') : null
}

export function Settings() {
  const settings = useApp((s) => s.settings)
  const updateSettings = useApp((s) => s.updateSettings)
  const status = useApp((s) => s.hotkeyStatus)
  const notify = useApp((s) => s.notify)
  const [recording, setRecording] = useState<HotkeyAction | null>(null)

  const setTheme = (theme: SettingsT['theme']) => updateSettings({ theme })

  const saveHotkey = async (action: HotkeyAction, accel: string) => {
    const hotkeys = { ...settings.hotkeys, [action]: accel }
    updateSettings({ hotkeys })
    useApp.setState({ hotkeyStatus: await window.api.setHotkeys(hotkeys) })
  }

  const pickRegion = async () => {
    const region = await window.api.pickRegion()
    if (region) {
      updateSettings({ captureRegion: region })
      notify('Canvas area saved.')
    }
  }

  return (
    <div className="page-narrow">
      <PageHeader title="Settings" />
      <div className="divide-y divide-line border-y border-line">
        <Field label="Theme">
          <Segmented<SettingsT['theme']>
            label="Theme"
            value={settings.theme}
            onChange={setTheme}
            options={[
              { value: 'dark', label: 'Graphite' },
              { value: 'light', label: 'Newsprint' },
              { value: 'system', label: 'Match Windows' }
            ]}
          />
        </Field>

        <Field label="Interface size" hint="Ctrl + and Ctrl − change it from anywhere; Ctrl 0 resets it.">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={80}
              max={150}
              step={10}
              value={Math.round(settings.uiScale * 100)}
              onChange={(e) => updateSettings({ uiScale: Number(e.target.value) / 100 })}
              aria-label="Interface size"
              className="h-1 w-56 accent-[var(--blue)]"
            />
            <span className="tnum w-12 text-ink">{Math.round(settings.uiScale * 100)}%</span>
          </div>
        </Field>

        <Field label="Sound">
          <Toggle checked={settings.sound} onChange={(sound) => updateSettings({ sound })} label="Chime when a pose ends" />
        </Field>

        <Field label="Canvas area" hint="The part of the screen captured at the end of each pose, when capture is on.">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-ink">
              {settings.captureRegion
                ? `${Math.round(settings.captureRegion.width)} × ${Math.round(settings.captureRegion.height)} on screen`
                : 'Not picked yet'}
            </span>
            <Button onClick={pickRegion}>{settings.captureRegion ? 'Pick again' : 'Pick canvas area'}</Button>
            {settings.captureRegion && (
              <Button tone="ghost" onClick={() => updateSettings({ captureRegion: undefined })}>
                Clear
              </Button>
            )}
          </div>
        </Field>

        <Field label="Hotkeys" hint="These work even while Clip Studio is in front. Click one, then press the new keys (with Ctrl, Alt or Shift).">
          <div className="grid gap-3">
            {(Object.keys(HOTKEY_LABELS) as HotkeyAction[]).map((action) => (
              <div key={action} className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => setRecording(recording === action ? null : action)}
                  onKeyDown={(e) => {
                    if (recording !== action) return
                    e.preventDefault()
                    if (e.key === 'Escape') return setRecording(null)
                    if ((e.key === 'Backspace' || e.key === 'Delete') && action !== 'clickThrough') {
                      setRecording(null)
                      return void saveHotkey(action, '')
                    }
                    const accel = accelerator(e)
                    if (accel) {
                      setRecording(null)
                      void saveHotkey(action, accel)
                    }
                  }}
                  className={`tnum h-9 w-48 shrink-0 rounded-md px-3 text-left text-[13px] ring-1 ${
                    recording === action ? 'bg-blue-soft text-blue ring-blue' : 'bg-surface ring-line hover:ring-muted'
                  }`}
                >
                  {recording === action ? 'Press keys…' : settings.hotkeys[action] ? settings.hotkeys[action].replace(/\+/g, ' + ') : 'Off'}
                </button>
                <div>
                  <div className="text-ink">{HOTKEY_LABELS[action].name}</div>
                  <div className="text-[12.5px] text-muted">
                    {HOTKEY_LABELS[action].when}
                    {status[action] === false && <span className="text-red"> Another app already uses these keys; pick others.</span>}
                  </div>
                </div>
              </div>
            ))}
            <div>
              <Button
                tone="ghost"
                onClick={async () => {
                  updateSettings({ hotkeys: DEFAULT_HOTKEYS })
                  useApp.setState({ hotkeyStatus: await window.api.setHotkeys(DEFAULT_HOTKEYS) })
                }}
              >
                Reset hotkeys
              </Button>
            </div>
          </div>
        </Field>

        <Field label="Your data" hint="Boards, sessions, captures and Pinterest images are stored on this computer only.">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => window.api.openDataFolder()}>Open data folder</Button>
            <Button
              onClick={async () => {
                const path = await window.api.exportBackup()
                if (path) notify('Backup saved.')
              }}
            >
              Save a backup (.zip)
            </Button>
          </div>
        </Field>
      </div>
    </div>
  )
}
