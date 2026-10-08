import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { RegionPicker } from './pages/RegionPicker'
import './index.css'

const picker = location.hash === '#region-picker'

createRoot(document.getElementById('root')!).render(<StrictMode>{picker ? <RegionPicker /> : <App />}</StrictMode>)
