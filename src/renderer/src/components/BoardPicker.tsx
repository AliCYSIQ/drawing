import { thumbUrl } from '@shared/api'
import type { Board } from '@shared/types'
import { useApp } from '../store'
import { Check } from './Icons'
import { Button } from './ui'

/** Choose one or more boards; each shows a strip of its first images. */
export function BoardPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const boards = useApp((s) => s.boards)
  const go = useApp((s) => s.go)

  if (!boards.length) {
    return (
      <div className="rounded-md border border-dashed border-line px-4 py-5 text-muted">
        No references yet.{' '}
        <Button tone="ghost" className="h-7 px-2 text-blue" onClick={() => go({ name: 'library' })}>
          Add a folder or Pinterest board
        </Button>
      </div>
    )
  }

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2.5">
      {boards.map((b) => (
        <BoardChip key={b.id} board={b} selected={value.includes(b.id)} onClick={() => toggle(b.id)} />
      ))}
    </div>
  )
}

function BoardChip({ board, selected, onClick }: { board: Board; selected: boolean; onClick: () => void }) {
  const strip = board.images.slice(0, 4)
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`group relative overflow-hidden rounded-md text-left ring-1 transition-colors ${
        selected ? 'bg-blue-soft ring-blue' : 'bg-surface ring-line hover:ring-muted'
      }`}
    >
      <div className="flex h-16 gap-px overflow-hidden bg-bg">
        {strip.map((img) => (
          <img key={img.id} src={thumbUrl(img.path, 160)} alt="" loading="lazy" className="h-full min-w-0 flex-1 object-cover" />
        ))}
        {!strip.length && <div className="flex-1" />}
      </div>
      <div className="flex items-center gap-2 px-2.5 py-2">
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{board.name}</span>
        <span className="tnum text-[12px] text-muted">{board.images.length}</span>
      </div>
      {selected && (
        <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue text-bg">
          <Check size={13} strokeWidth={2.6} />
        </span>
      )}
    </button>
  )
}
