import { useId, useState } from 'react'
import { Close } from './Icons'

export const normalizeTag = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 32)

/** Tags as removable chips plus a field that suggests existing tags. */
export function TagEditor({
  tags,
  onChange,
  suggestions
}: {
  tags: string[]
  onChange: (tags: string[]) => void
  suggestions: string[]
}) {
  const [text, setText] = useState('')
  const listId = useId()
  const add = (raw: string) => {
    const t = normalizeTag(raw)
    if (t && !tags.includes(t)) onChange([...tags, t])
    setText('')
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span key={t} className="inline-flex h-7 items-center gap-1 rounded-full bg-raised pl-3 pr-1 text-[13px] text-ink">
          {t}
          <button
            type="button"
            aria-label={`Remove tag ${t}`}
            onClick={() => onChange(tags.filter((x) => x !== t))}
            className="flex h-5 w-5 items-center justify-center rounded-full text-muted hover:bg-line hover:text-ink"
          >
            <Close size={12} />
          </button>
        </span>
      ))}
      <input
        aria-label="Add a tag"
        list={listId}
        value={text}
        placeholder={tags.length ? 'Add tag' : 'Add a tag, e.g. hands'}
        onChange={(e) => {
          const v = e.target.value
          // Picking a suggestion from the list adds it straight away.
          if (suggestions.includes(v)) add(v)
          else setText(v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add(text)
          } else if (e.key === 'Backspace' && !text && tags.length) {
            onChange(tags.slice(0, -1))
          }
        }}
        onBlur={() => text && add(text)}
        className="h-7 w-40 rounded-full bg-transparent px-3 text-[13px] text-ink outline-none ring-1 ring-line placeholder:text-muted/70 focus:ring-blue"
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !tags.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  )
}
