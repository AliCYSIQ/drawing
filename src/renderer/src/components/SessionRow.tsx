import { useState } from 'react'
import { thumbUrl } from '@shared/api'
import type { SessionRecord } from '@shared/types'
import { firstNote, sessionHas } from '../lib/history'
import { describeBlocks, formatDuration, planBlocks } from '../lib/schedule'
import { useApp } from '../store'
import { Camera, Pen, Redo, Trash } from './Icons'

/** How a session is described in lists: its mode, challenge level or redo. */
export function describeSession(s: SessionRecord, challengeName?: string): string {
  if (s.challenge) return `${challengeName ?? 'Challenge'}, level ${s.challenge.level + 1}`
  if (s.redoOf) return 'Redo of flagged poses'
  if (s.plan.mode === 'relaxed') return 'Relaxed, no timer'
  if (s.plan.mode === 'memory') {
    const refs = new Set(s.poses.map((p) => p.imageId)).size
    return `Memory: ${refs} ${refs === 1 ? 'reference' : 'references'}, ${s.poses.length} attempts`
  }
  return describeBlocks(planBlocks(s.plan, s.poses.length))
}

/** One past session: opens its review; the bin deletes it (with Undo). */
export function SessionRow({ session: s, showSkill, detail }: { session: SessionRecord; showSkill?: boolean; detail?: boolean }) {
  const go = useApp((st) => st.go)
  const deleteSession = useApp((st) => st.deleteSession)
  const challenges = useApp((st) => st.challenges)
  const skills = useApp((st) => st.skills)
  const [confirm, setConfirm] = useState(false)
  const skill = skills.find((k) => k.id === s.plan.skillId)?.name
  const has = sessionHas(s)
  const note = detail ? firstNote(s) : undefined
  const collections = detail ? (s.boardNames ?? []).join(', ') : ''

  return (
    <li className="group flex items-center gap-4 py-2.5">
      <button
        type="button"
        onClick={() => go({ name: 'review', sessionId: s.id })}
        className="flex min-w-0 flex-1 items-center gap-4 text-left"
      >
        <span className="flex shrink-0 -space-x-3">
          {s.poses.slice(0, 3).map((p, k) => (
            <img key={k} src={thumbUrl(p.imagePath, 96, p.keptPath)} alt="" loading="lazy" className="h-10 w-8 rounded object-cover ring-2 ring-bg" />
          ))}
        </span>
        <span className="w-44 shrink-0 text-ink">
          {new Date(s.startedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-muted group-hover:text-ink">
            {describeSession(s, challenges.find((c) => c.id === s.challenge?.challengeId)?.name)}
            {showSkill && skill ? ` · ${skill}` : ''}
            {collections ? ` · ${collections}` : ''}
          </span>
          {note && <span className="block truncate text-[12.5px] text-muted/80">“{note}”</span>}
        </span>
        {detail && (
          <span className="flex shrink-0 items-center gap-1.5 text-muted" aria-label="What it has">
            {has.drawings && <span title="Has drawings (captures or photos)"><Camera size={14} /></span>}
            {has.marks && <span title="Has red marks"><Pen size={14} /></span>}
            {has.flagged && <span title="Has poses flagged to redo" className="text-red"><Redo size={14} /></span>}
          </span>
        )}
        <span className="tnum w-20 shrink-0 text-right text-ink">{formatDuration(s.activeMs / 1000)}</span>
        <span className="w-24 shrink-0 text-right text-[12.5px] text-muted">{s.reviewed ? 'Reviewed' : s.finished ? 'Not reviewed' : 'Stopped early'}</span>
      </button>
      {confirm ? (
        <span className="flex gap-1">
          <button type="button" className="h-8 rounded-md px-2 text-red hover:bg-raised" onClick={() => deleteSession(s.id)}>
            Delete
          </button>
          <button type="button" className="h-8 rounded-md px-2 text-muted hover:bg-raised" onClick={() => setConfirm(false)}>
            Keep
          </button>
        </span>
      ) : (
        <button
          type="button"
          aria-label="Delete session"
          title="Delete session"
          onClick={() => setConfirm(true)}
          className="invisible flex h-8 w-8 items-center justify-center rounded-md text-muted hover:text-red group-hover:visible"
        >
          <Trash size={15} />
        </button>
      )}
    </li>
  )
}
