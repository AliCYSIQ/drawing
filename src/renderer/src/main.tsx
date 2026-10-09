import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { RegionPicker } from './pages/RegionPicker'
import './index.css'

const picker = location.hash === '#region-picker'

// Page errors go to the app log (Settings → Diagnostics), so problems can be traced later.
window.addEventListener('error', (e) => window.api?.log('error', `${e.message} at ${e.filename}:${e.lineno}`))
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason
  window.api?.log('error', r instanceof Error ? (r.stack ?? r.message) : String(r))
})

createRoot(document.getElementById('root')!).render(<StrictMode>{picker ? <RegionPicker /> : <App />}</StrictMode>)
