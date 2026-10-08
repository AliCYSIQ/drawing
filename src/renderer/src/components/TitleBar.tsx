import { useEffect, useState } from 'react'
import { useApp, type View } from '../store'
import { Close, Gear, Maximize, Minimize } from './Icons'

const TABS: { name: View['name']; label: string }[] = [
  { name: 'practice', label: 'Practice' },
  { name: 'library', label: 'Library' },
  { name: 'challenges', label: 'Challenges' },
  { name: 'stats', label: 'Stats' }
]

function activeTab(view: View): View['name'] {
  if (view.name === 'viewer') return 'library'
  if (view.name === 'review') return 'stats'
  return view.name
}

export function TitleBar() {
  const view = useApp((s) => s.view)
  const go = useApp((s) => s.go)
  const [maximized, setMaximized] = useState(false)

  useEffect(() => window.api.onMaximized(setMaximized), [])

  const current = activeTab(view)

  return (
    <header
      className="drag flex h-11 shrink-0 items-stretch border-b border-line bg-bg pl-4"
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget) window.api.toggleMaximize()
      }}
    >
      <div className="flex items-center gap-2 pr-6">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="pencil">
          <path d="M5 19c3-8 6-12 9-12s3 5 5 4" stroke="var(--blue)" strokeWidth="2.4" fill="none" />
          <circle cx="8.5" cy="6" r="2.2" stroke="var(--ink)" strokeWidth="1.8" fill="none" />
        </svg>
        <span className="text-[13px] font-semibold tracking-[-0.01em]">Drawing Practice</span>
      </div>
      <nav className="no-drag flex items-stretch" aria-label="Main">
        {TABS.map((t) => (
          <button
            key={t.name}
            type="button"
            onClick={() => go({ name: t.name } as View)}
            aria-current={current === t.name ? 'page' : undefined}
            className={`relative px-3.5 text-[13px] transition-colors ${
              current === t.name ? 'text-ink' : 'text-muted hover:text-ink'
            }`}
          >
            {t.label}
            {current === t.name && (
              <svg className="pencil absolute inset-x-2 bottom-1.5" height="4" viewBox="0 0 60 4" preserveAspectRatio="none" aria-hidden="true">
                <path d="M1 2.6C15 1.2 40 1.4 59 2.2" stroke="var(--blue)" strokeWidth="2" fill="none" />
              </svg>
            )}
          </button>
        ))}
      </nav>
      <div className="ml-auto flex items-stretch">
        <button
          type="button"
          title="Settings"
          aria-label="Settings"
          onClick={() => go({ name: 'settings' })}
          className={`no-drag flex w-11 items-center justify-center transition-colors hover:bg-raised ${
            current === 'settings' ? 'text-blue' : 'text-muted hover:text-ink'
          }`}
        >
          <Gear size={17} />
        </button>
        <WindowButtons maximized={maximized} />
      </div>
    </header>
  )
}

export function WindowButtons({ maximized }: { maximized?: boolean }) {
  return (
    <div className="no-drag flex items-stretch">
      <button
        type="button"
        aria-label="Minimize"
        onClick={() => window.api.minimize()}
        className="flex w-11 items-center justify-center text-muted hover:bg-raised hover:text-ink"
      >
        <Minimize size={16} />
      </button>
      <button
        type="button"
        aria-label={maximized ? 'Restore' : 'Maximize'}
        onClick={() => window.api.toggleMaximize()}
        className="flex w-11 items-center justify-center text-muted hover:bg-raised hover:text-ink"
      >
        <Maximize size={14} />
      </button>
      <button
        type="button"
        aria-label="Close"
        onClick={() => window.api.close()}
        className="flex w-12 items-center justify-center text-muted hover:bg-red hover:text-white"
      >
        <Close size={16} />
      </button>
    </div>
  )
}
