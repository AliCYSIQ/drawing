import { useEffect, useState } from 'react'
import { DEFAULT_HOTKEYS, type FolderImport, type HotkeyAction, type Settings as SettingsT, type Skill } from '@shared/types'
import { Diagnostics } from '../components/Diagnostics'
import { Trash } from '../components/Icons'
import { Backups, StartOver } from '../components/StartOver'
import { UpdatesField } from '../components/UpdatesField'
import { Button, Field, IconButton, PageHeader, Segmented, Toggle } from '../components/ui'
import { findSkill, normalizeSkillName } from '../lib/skills'
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

        <Field label="Adding folders" hint="What happens when a folder you add has sub-folders with images.">
          <select
            aria-label="When a folder has sub-folders"
            value={settings.folderImport}
            onChange={(e) => updateSettings({ folderImport: e.target.value as FolderImport })}
            className="h-9 rounded-md bg-surface px-2.5 text-ink outline-none ring-1 ring-line focus:ring-blue"
          >
            <option value="ask">Ask each time</option>
            <option value="one">One collection with everything</option>
            <option value="split">A collection for each sub-folder</option>
            <option value="top">Only the images directly in the folder</option>
          </select>
        </Field>

        <Field label="Skills" hint="Things you practice. A session, preset or challenge can count toward one, and Stats show time and sessions per skill.">
          <SkillList />
        </Field>

        <Field label="Timer" hint="Some find a counting clock stressful; the line at the bottom still shows how much time is left.">
          <Segmented<SettingsT['timerDisplay']>
            label="Timer"
            value={settings.timerDisplay}
            onChange={(timerDisplay) => updateSettings({ timerDisplay })}
            options={[
              { value: 'clock', label: 'Numbers and line' },
              { value: 'line', label: 'Line only' }
            ]}
          />
        </Field>

        <Field label="Sound">
          <div className="grid gap-3">
            <Toggle checked={settings.sound} onChange={(sound) => updateSettings({ sound })} label="Chime when a pose ends" />
            <Toggle
              checked={settings.countdownTicks}
              onChange={(countdownTicks) => updateSettings({ countdownTicks })}
              label="Soft ticks in the last 3 seconds"
              hint="Only for poses of 10 seconds or more, and only with sound on."
            />
          </div>
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

        <Field label="Backups" hint="Restoring puts a backup's data back; what it replaces is kept in a new backup, so a restore can be undone too.">
          <Backups />
        </Field>

        <Field label="Start over" hint="Clear your history, library, skills, presets or settings, all or some. Nothing is erased: it moves into a backup you can restore.">
          <StartOver />
        </Field>

        <Field label="Updates">
          <UpdatesField />
        </Field>

        <Field label="Diagnostics" hint="How much CPU and memory the app uses, and problems it recorded. Useful if the app feels slow.">
          <Diagnostics />
        </Field>
      </div>
    </div>
  )
}

/** Your skills: rename in place, add, or delete (tagged sessions keep their time). */
function SkillList() {
  const skills = useApp((s) => s.skills)
  const sessions = useApp((s) => s.sessions)
  const setSkills = useApp((s) => s.setSkills)
  const addSkill = useApp((s) => s.addSkill)
  const deleteSkill = useApp((s) => s.deleteSkill)
  const notify = useApp((s) => s.notify)
  const [text, setText] = useState('')
  const [confirm, setConfirm] = useState<string | null>(null)

  /** False when the new name is empty or already taken. */
  const rename = (id: string, raw: string): boolean => {
    const name = normalizeSkillName(raw)
    const other = findSkill(skills, name)
    if (other && other.id !== id) notify(`There's already a skill called ${other.name}.`)
    if (!name || (other && other.id !== id)) return false
    setSkills((list) => list.map((k) => (k.id === id ? { ...k, name } : k)))
    return true
  }

  const add = () => {
    const existing = findSkill(skills, text)
    if (existing) notify(`${existing.name} is already in your skills.`)
    if (addSkill(text)) setText('')
  }

  return (
    <div className="grid gap-2">
      {skills.map((k) => {
        const used = sessions.filter((s) => s.plan.skillId === k.id).length
        return (
          <div key={k.id} className="flex flex-wrap items-center gap-2">
            <SkillName skill={k} onRename={(name) => rename(k.id, name)} />
            <span className="tnum w-24 text-[12.5px] text-muted">
              {used} {used === 1 ? 'session' : 'sessions'}
            </span>
            {confirm === k.id ? (
              <>
                <Button
                  tone="danger"
                  onClick={() => {
                    deleteSkill(k.id)
                    setConfirm(null)
                  }}
                >
                  Delete {k.name}
                </Button>
                <Button tone="ghost" onClick={() => setConfirm(null)}>
                  Keep
                </Button>
              </>
            ) : (
              <IconButton label={`Delete skill ${k.name}`} onClick={() => setConfirm(k.id)}>
                <Trash size={15} />
              </IconButton>
            )}
          </div>
        )
      })}
      {confirm && <p className="text-[12.5px] text-muted">Its sessions keep their time and show as “No skill”.</p>}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input
          aria-label="New skill name"
          value={text}
          maxLength={40}
          placeholder={skills.length ? 'Add a skill' : 'Add a skill, e.g. gesture'}
          onChange={(e) => setText(e.target.value)}
          className="h-9 w-56 rounded-md bg-surface px-2.5 text-ink outline-none ring-1 ring-line placeholder:text-muted/70 focus:ring-blue"
        />
        <Button type="submit" disabled={!normalizeSkillName(text)}>
          Add
        </Button>
      </form>
    </div>
  )
}

function SkillName({ skill, onRename }: { skill: Skill; onRename: (name: string) => boolean }) {
  const [draft, setDraft] = useState(skill.name)
  useEffect(() => setDraft(skill.name), [skill.name])
  return (
    <input
      aria-label={`Name of skill ${skill.name}`}
      value={draft}
      maxLength={40}
      onChange={(e) => setDraft(e.target.value)}
      // Switching to another app blurs the field too; only a real blur renames.
      onBlur={() => document.hasFocus() && draft !== skill.name && !onRename(draft) && setDraft(skill.name)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        else if (e.key === 'Escape') setDraft(skill.name)
      }}
      className="h-9 w-56 rounded-md bg-transparent px-2.5 text-ink outline-none ring-1 ring-line hover:ring-muted focus:bg-surface focus:ring-blue"
    />
  )
}
