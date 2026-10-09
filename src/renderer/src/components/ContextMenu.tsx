import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export interface MenuItem {
  label: string
  onClick: () => void
  /** Key shown on the right, e.g. "F2". */
  hint?: string
  danger?: boolean
  disabled?: boolean
  icon?: ReactNode
}

/** A line between groups of items. */
export const SEPARATOR = 'separator' as const
export type MenuEntry = MenuItem | typeof SEPARATOR

interface Open {
  x: number
  y: number
  items: MenuEntry[]
}

/**
 * A right-click menu. `open(e, items)` shows it at the pointer; it closes on
 * a click outside, Esc, scrolling or resizing. Arrow keys move, Enter picks.
 */
export function useContextMenu(): { open: (e: React.MouseEvent | { clientX: number; clientY: number }, items: MenuEntry[]) => void; menu: ReactNode } {
  const [state, setState] = useState<Open | null>(null)
  const open = (e: React.MouseEvent | { clientX: number; clientY: number }, items: MenuEntry[]) => {
    if ('preventDefault' in e) {
      e.preventDefault()
      e.stopPropagation()
    }
    setState({ x: e.clientX, y: e.clientY, items })
  }
  return { open, menu: state && <Menu {...state} onClose={() => setState(null)} /> }
}

function Menu({ x, y, items, onClose }: Open & { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // Keep it on screen.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - r.height - 4))
    })
    el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [x, y])

  useEffect(() => {
    const close = (e: Event) => {
      if (e.type === 'pointerdown' && ref.current?.contains(e.target as Node)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
      const next = e.key === 'ArrowDown' ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length
      buttons[next]?.focus()
    }
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    window.addEventListener('wheel', onClose, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('wheel', onClose)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-[60] min-w-[200px] rounded-md bg-raised p-1 shadow-[0_10px_34px_rgba(0,0,0,0.4)] ring-1 ring-line"
      style={pos}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item === SEPARATOR ? (
          <div key={i} className="my-1 h-px bg-line" role="separator" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose()
              item.onClick()
            }}
            className={`flex h-8 w-full items-center gap-2.5 rounded px-2.5 text-left text-[13px] outline-none disabled:opacity-40 ${
              item.danger ? 'text-red hover:bg-red/15 focus:bg-red/15' : 'text-ink hover:bg-line focus:bg-line'
            }`}
          >
            {item.icon && <span className="flex w-4 justify-center text-muted">{item.icon}</span>}
            <span className="flex-1">{item.label}</span>
            {item.hint && <span className="text-[12px] text-muted">{item.hint}</span>}
          </button>
        )
      )}
    </div>
  )
}
