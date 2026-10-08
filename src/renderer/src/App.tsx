import { useEffect } from 'react'
import { TitleBar, WindowButtons } from './components/TitleBar'
import { Challenges } from './pages/Challenges'
import { Library } from './pages/Library'
import { MemorySession } from './pages/MemorySession'
import { Practice } from './pages/Practice'
import { Review } from './pages/Review'
import { Session } from './pages/Session'
import { Settings } from './pages/Settings'
import { Stats } from './pages/Stats'
import { Viewer } from './pages/Viewer'
import { useApp } from './store'

export function App() {
  const loaded = useApp((s) => s.loaded)
  const view = useApp((s) => s.view)
  const float = useApp((s) => s.float)
  const theme = useApp((s) => s.settings.theme)
  const toast = useApp((s) => s.toast)
  const run = useApp((s) => s.run)

  const uiScale = useApp((s) => s.settings.uiScale)

  useEffect(() => {
    void useApp.getState().init()
  }, [])

  useEffect(() => {
    if (loaded) void window.api.setZoom(uiScale)
  }, [loaded, uiScale])

  // Ctrl + / Ctrl - / Ctrl 0: interface size, like a browser.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey) return
      const step = e.key === '=' || e.key === '+' ? 0.1 : e.key === '-' ? -0.1 : e.key === '0' ? 0 : null
      if (step === null) return
      e.preventDefault()
      const { settings, updateSettings, notify } = useApp.getState()
      const next = step === 0 ? 1 : Math.round(Math.min(1.5, Math.max(0.8, settings.uiScale + step)) * 10) / 10
      updateSettings({ uiScale: next })
      notify(`Interface size ${Math.round(next * 100)}%`)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    const mq = matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])

  if (!loaded) return <div className="h-full bg-bg" />

  const fullBleed = view.name === 'session' || view.name === 'viewer'

  let page: React.ReactNode
  switch (view.name) {
    case 'practice':
      page = <Practice />
      break
    case 'library':
      page = <Library boardId={view.boardId} />
      break
    case 'viewer':
      page = <Viewer boardId={view.boardId} index={view.index} />
      break
    case 'challenges':
      page = <Challenges challengeId={view.challengeId} />
      break
    case 'stats':
      page = <Stats />
      break
    case 'settings':
      page = <Settings />
      break
    case 'session':
      page = run?.memory ? <MemorySession /> : <Session />
      break
    case 'review':
      page = <Review sessionId={view.sessionId} />
      break
  }

  return (
    <div className="flex h-full flex-col">
      {float.on ? null : fullBleed ? (
        <header className="drag flex h-9 shrink-0 items-stretch justify-end bg-bg">
          <WindowButtons />
        </header>
      ) : (
        <TitleBar />
      )}
      <main className={`min-h-0 flex-1 ${fullBleed || view.name === 'review' ? 'overflow-hidden' : 'overflow-y-auto'}`}>{page}</main>
      {toast && (
        <div
          role="status"
          className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md bg-raised px-4 py-2.5 text-ink shadow-[0_8px_30px_rgba(0,0,0,0.35)] ring-1 ring-line"
        >
          {toast.text}
        </div>
      )}
    </div>
  )
}
