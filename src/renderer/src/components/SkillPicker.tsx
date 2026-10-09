import { useEffect, useRef, useState } from 'react'
import { knownSkill } from '../lib/skills'
import { useApp } from '../store'
import { Plus } from './Icons'

const chip = (on: boolean) =>
  `h-8 rounded-full px-3 text-[13px] ring-1 transition-colors ${
    on ? 'bg-blue-soft text-blue ring-blue' : 'text-muted ring-line hover:text-ink'
  }`

/** Pick one of your skills (or none), or add a new one on the spot. */
export function SkillPicker({ value, onChange }: { value?: string; onChange: (skillId: string | undefined) => void }) {
  const skills = useApp((s) => s.skills)
  const addSkill = useApp((s) => s.addSkill)
  const [name, setName] = useState<string | null>(null)
  // The field can blur as it closes; this keeps Esc from adding and Enter from adding twice.
  const closed = useRef(false)
  // After Enter or Esc, keyboard focus goes back to "New skill" instead of the page.
  const refocus = useRef(false)
  const newButton = useRef<HTMLButtonElement>(null)
  const current = knownSkill(skills, value)

  useEffect(() => {
    if (name === null && refocus.current) {
      refocus.current = false
      newButton.current?.focus()
    }
  }, [name])

  const open = () => {
    closed.current = false
    setName('')
  }
  const close = (keep: boolean) => {
    if (closed.current) return
    closed.current = true
    const skill = keep && name !== null ? addSkill(name) : null
    if (skill) onChange(skill.id)
    setName(null)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div role="radiogroup" aria-label="Skill" className="contents">
        <button type="button" role="radio" aria-checked={!current} onClick={() => onChange(undefined)} className={chip(!current)}>
          None
        </button>
        {skills.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={current === s.id}
            onClick={() => onChange(s.id)}
            className={chip(current === s.id)}
          >
            {s.name}
          </button>
        ))}
      </div>
      {name === null ? (
        <button
          ref={newButton}
          type="button"
          onClick={open}
          className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-[13px] text-muted hover:bg-raised hover:text-ink"
        >
          <Plus size={13} /> New skill
        </button>
      ) : (
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault()
            refocus.current = true
            close(true)
          }}
        >
          <input
            autoFocus
            aria-label="New skill name"
            value={name}
            maxLength={40}
            placeholder="e.g. gesture"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return
              refocus.current = true
              close(false)
            }}
            // Switching to another app (Clip Studio) blurs the field too; keep it open instead of adding a half-typed name.
            onBlur={() => document.hasFocus() && close(true)}
            className="h-8 w-40 rounded-full bg-transparent px-3 text-[13px] text-ink outline-none ring-1 ring-blue placeholder:text-muted/70"
          />
        </form>
      )}
    </div>
  )
}
