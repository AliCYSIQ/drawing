import { useEffect, useMemo, useState } from 'react'
import type { Folder } from '@shared/types'
import { cannotTransfer, childFolders, type Item, type Transfer } from '../lib/library'
import { uid, useApp } from '../store'
import { ArrowRight, Folder as FolderIcon, Plus } from './Icons'
import { Button } from './ui'

const VERB: Record<Transfer, string> = { move: 'Move here', copy: 'Copy here', shortcut: 'Add shortcut here' }

/**
 * "Move to…", "Copy to…" and "Add shortcut to…": a folder tree to pick where.
 * Places the items can't go are greyed out with the reason. A new folder can
 * be made inside the one picked.
 */
export function FolderDialog({
  op,
  items,
  start,
  onPick,
  onClose
}: {
  op: Transfer
  items: Item[]
  /** The folder shown open at first. */
  start?: string
  onPick: (target: string | undefined) => void
  onClose: () => void
}) {
  const folders = useApp((s) => s.library.folders)
  const boards = useApp((s) => s.boards)
  const setLibrary = useApp((s) => s.setLibrary)
  const [picked, setPicked] = useState<string | undefined>(start)
  const [naming, setNaming] = useState<string | null>(null)

  const why = (target: string | undefined) => {
    const reasons = items.map((it) => cannotTransfer({ boards, folders }, it, target, op))
    // A place is fine if at least one item can go there.
    return reasons.every(Boolean) ? reasons[0] : null
  }
  const blocked = why(picked)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && naming === null) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, naming])

  const makeFolder = (name: string) => {
    const f: Folder = { id: uid(), name: name.trim() || 'New folder', parentId: picked, shortcuts: [], createdAt: Date.now() }
    setLibrary((l) => ({ ...l, folders: [...l.folders, f] }))
    setPicked(f.id)
    setNaming(null)
  }

  const title = op === 'move' ? 'Move to' : op === 'copy' ? 'Copy to' : 'Add a shortcut in'
  const what = items.length === 1 ? '1 item' : `${items.length} items`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/70" role="dialog" aria-label={title} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[80vh] w-[min(480px,92vw)] flex-col rounded-lg bg-surface shadow-[0_12px_40px_rgba(0,0,0,0.4)] ring-1 ring-line">
        <div className="px-5 pt-5">
          <h2 className="text-[17px] font-semibold">
            {title}… <span className="font-normal text-muted">({what})</span>
          </h2>
        </div>
        <div className="mx-5 mt-3 min-h-[200px] flex-1 overflow-y-auto rounded-md bg-bg p-1.5 ring-1 ring-line" role="tree" aria-label="Folders">
          <TreeRow label="Library (top level)" depth={0} picked={picked === undefined} blocked={why(undefined)} onPick={() => setPicked(undefined)} />
          <Branch parentId={undefined} depth={1} picked={picked} onPick={setPicked} why={why} folders={folders} />
        </div>
        <div className="flex flex-wrap items-center gap-2 px-5 py-4">
          {naming === null ? (
            <Button tone="ghost" onClick={() => setNaming('')}>
              <Plus size={15} /> New folder
            </Button>
          ) : (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                makeFolder(naming)
              }}
            >
              <input
                autoFocus
                aria-label="New folder name"
                value={naming}
                placeholder="Folder name"
                onChange={(e) => setNaming(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setNaming(null)}
                className="h-9 w-40 rounded-md bg-bg px-2.5 text-ink outline-none ring-1 ring-line focus:ring-blue"
              />
              <Button type="submit">Create</Button>
            </form>
          )}
          <span className="ml-auto" />
          <Button tone="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button tone="primary" disabled={!!blocked} title={blocked ?? undefined} onClick={() => onPick(picked)}>
            {VERB[op]}
          </Button>
        </div>
        {blocked && <p className="-mt-2 px-5 pb-4 text-right text-[12.5px] text-muted">{blocked}</p>}
      </div>
    </div>
  )
}

function Branch({
  parentId,
  depth,
  picked,
  onPick,
  why,
  folders
}: {
  parentId?: string
  depth: number
  picked?: string
  onPick: (id: string) => void
  why: (id: string | undefined) => string | null
  folders: Folder[]
}) {
  const children = useMemo(() => childFolders(folders, parentId), [folders, parentId])
  return (
    <>
      {children.map((f) => (
        <Node key={f.id} folder={f} depth={depth} picked={picked} onPick={onPick} why={why} folders={folders} />
      ))}
    </>
  )
}

function Node({
  folder,
  depth,
  picked,
  onPick,
  why,
  folders
}: {
  folder: Folder
  depth: number
  picked?: string
  onPick: (id: string) => void
  why: (id: string | undefined) => string | null
  folders: Folder[]
}) {
  const [open, setOpen] = useState(true)
  const hasChildren = folders.some((f) => f.parentId === folder.id)
  return (
    <>
      <TreeRow
        label={folder.name}
        depth={depth}
        picked={picked === folder.id}
        blocked={why(folder.id)}
        onPick={() => onPick(folder.id)}
        open={hasChildren ? open : undefined}
        onToggle={() => setOpen((v) => !v)}
      />
      {open && hasChildren && <Branch parentId={folder.id} depth={depth + 1} picked={picked} onPick={onPick} why={why} folders={folders} />}
    </>
  )
}

function TreeRow({
  label,
  depth,
  picked,
  blocked,
  onPick,
  open,
  onToggle
}: {
  label: string
  depth: number
  picked: boolean
  blocked: string | null
  onPick: () => void
  open?: boolean
  onToggle?: () => void
}) {
  return (
    <div role="treeitem" aria-selected={picked} aria-expanded={open} className="flex items-center" style={{ paddingLeft: depth * 16 }}>
      <button
        type="button"
        aria-label={open ? `Close ${label}` : `Open ${label}`}
        onClick={onToggle}
        className={`flex h-7 w-6 items-center justify-center text-muted ${open === undefined ? 'invisible' : ''}`}
      >
        <ArrowRight size={12} className={open ? 'rotate-90' : ''} />
      </button>
      <button
        type="button"
        onClick={onPick}
        title={blocked ?? undefined}
        className={`flex h-8 min-w-0 flex-1 items-center gap-2 rounded px-2 text-left text-[13px] ${
          picked ? 'bg-blue-soft text-blue' : blocked ? 'text-muted/60' : 'text-ink hover:bg-raised'
        }`}
      >
        <FolderIcon size={15} />
        <span className="truncate">{label}</span>
      </button>
    </div>
  )
}
