import { useEffect, useState } from 'react'
import { ALL_PARTS, type BackupInfo, type ResetPart } from '@shared/reset'
import { flushSaves, useApp } from '../store'
import { Button } from './ui'

const QUICK: { label: string; parts: ResetPart[] }[] = [
  { label: 'Everything', parts: ALL_PARTS },
  { label: 'Keep my library', parts: ['history', 'skills', 'presets', 'settings'] },
  { label: 'Keep library and skills', parts: ['history', 'presets', 'settings'] },
  { label: 'Only history and stats', parts: ['history'] }
]

const WORD = 'reset'

/**
 * Settings → Start over. You choose what goes; it is moved into a backup
 * (not erased), and Backups below can bring it back.
 */
export function StartOver() {
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <Button tone="danger" onClick={() => setOpen(true)}>
        Start over…
      </Button>
    )
  }
  return <StartOverDialog onClose={() => setOpen(false)} />
}

function StartOverDialog({ onClose }: { onClose: () => void }) {
  const sessions = useApp((s) => s.sessions.length)
  const boards = useApp((s) => s.boards.length)
  const folders = useApp((s) => s.library.folders.length)
  const skills = useApp((s) => s.skills.length)
  const presets = useApp((s) => s.presets.length)
  const challenges = useApp((s) => s.challenges.length)
  const [parts, setParts] = useState<ResetPart[]>(ALL_PARTS)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
  const rows: { part: ResetPart; label: string; detail: string }[] = [
    { part: 'history', label: 'History and stats', detail: `${n(sessions, 'session', 'sessions')}, with captures, photos and marks; challenge progress starts over` },
    { part: 'library', label: 'Library', detail: `${n(boards, 'collection', 'collections')}, ${n(folders, 'folder', 'folders')}, favorites and stored images. Your own folders on disk are never touched.` },
    { part: 'skills', label: 'Skills', detail: n(skills, 'skill', 'skills') },
    { part: 'presets', label: 'Presets and challenges', detail: `${n(presets, 'preset', 'presets')}, ${n(challenges, 'challenge', 'challenges')}` },
    { part: 'settings', label: 'Settings', detail: 'Theme, hotkeys, canvas area, interface size, window size' }
  ]
  const toggle = (p: ResetPart) => setParts((list) => (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]))
  const same = (a: ResetPart[], b: ResetPart[]) => a.length === b.length && a.every((x) => b.includes(x))

  const go = async () => {
    setBusy(true)
    // Anything still waiting to be saved goes into the backup too.
    await flushSaves()
    await window.api.resetData(parts)
    // The page reloads with the remaining data.
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/70" role="dialog" aria-label="Start over" onPointerDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="max-h-[90vh] w-[min(560px,94vw)] overflow-y-auto rounded-lg bg-surface p-6 shadow-[0_12px_40px_rgba(0,0,0,0.4)] ring-1 ring-line">
        <h2 className="text-[17px] font-semibold">Start over</h2>
        <p className="mt-1 text-muted">Choose what to clear. It is moved into a backup first, so you can bring it back from Settings → Backups.</p>

        <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Quick choices">
          {QUICK.map((q) => (
            <button
              key={q.label}
              type="button"
              aria-pressed={same(parts, q.parts)}
              onClick={() => setParts(q.parts)}
              className={`h-8 rounded-full px-3 text-[13px] ring-1 transition-colors ${
                same(parts, q.parts) ? 'bg-blue-soft text-blue ring-blue' : 'text-muted ring-line hover:text-ink'
              }`}
            >
              {q.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-2.5">
          {rows.map((r) => (
            <label key={r.part} className="flex cursor-pointer items-start gap-3 rounded-md p-2 ring-1 ring-line hover:ring-muted">
              <input type="checkbox" checked={parts.includes(r.part)} onChange={() => toggle(r.part)} className="mt-1 h-4 w-4 accent-[var(--red)]" />
              <span>
                <span className="block text-ink">{r.label}</span>
                <span className="block text-[12.5px] text-muted">{r.detail}</span>
              </span>
            </label>
          ))}
        </div>

        <label className="mt-5 block">
          <span className="block pb-1.5 text-muted">
            Type <span className="font-semibold text-ink">{WORD}</span> to confirm
          </span>
          <input
            aria-label="Type reset to confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="h-9 w-48 rounded-md bg-bg px-2.5 text-ink outline-none ring-1 ring-line focus:ring-red"
          />
        </label>

        <div className="mt-6 flex justify-end gap-2">
          <Button tone="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            className="bg-red font-semibold text-white hover:brightness-110"
            disabled={busy || !parts.length || typed.trim().toLowerCase() !== WORD}
            onClick={() => void go()}
          >
            {busy ? 'Clearing…' : 'Clear and start over'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Settings → Backups: the ones the app made (before starting over, a restore or a format update), and restoring a .zip. */
export function Backups() {
  const notify = useApp((s) => s.notify)
  const [list, setList] = useState<BackupInfo[] | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    void window.api.listBackups().then(setList)
  }, [])

  const restore = async (name: string) => {
    setConfirm(null)
    await flushSaves()
    const out = await window.api.restoreBackup(name)
    if (out.error) notify(out.error)
  }
  const restoreZip = async () => {
    await flushSaves()
    const out = await window.api.restoreZip()
    if (out.error) notify(out.error)
  }

  const shown = showAll ? (list ?? []) : (list ?? []).slice(0, 4)
  return (
    <div className="grid gap-3">
      {list && !list.length && <p className="text-muted">No backups yet. The app makes one before starting over, a restore, or a data format update.</p>}
      {shown.length > 0 && (
        <ul className="divide-y divide-line border-y border-line" aria-label="Backups">
          {shown.map((b) => (
            <li key={b.name} className="flex flex-wrap items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block text-ink">
                  {b.label}
                  <span className="text-muted">
                    {' · '}
                    {new Date(b.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                </span>
                <span className="block truncate text-[12.5px] text-muted">{b.holds.join(', ') || 'Empty'}</span>
              </span>
              {confirm === b.name ? (
                <span className="flex items-center gap-1">
                  <Button tone="primary" onClick={() => void restore(b.name)}>
                    Restore it
                  </Button>
                  <Button tone="ghost" onClick={() => setConfirm(null)}>
                    Cancel
                  </Button>
                </span>
              ) : (
                <Button onClick={() => setConfirm(b.name)} title="Puts this data back. What it replaces is kept in a new backup.">
                  Restore…
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {list && list.length > 4 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="justify-self-start text-[13px] text-blue hover:underline">
          {showAll ? 'Show fewer' : `Show all ${list.length}`}
        </button>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void restoreZip()}>Restore from a .zip…</Button>
        <Button tone="ghost" onClick={() => window.api.openBackups()}>
          Open backups folder
        </Button>
      </div>
    </div>
  )
}
