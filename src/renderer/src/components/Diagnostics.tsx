import { useEffect, useState } from 'react'
import type { ProcessMetric } from '@shared/api'
import { Button } from './ui'

const NAMES: Record<string, string> = {
  Browser: 'Main process',
  Tab: 'App page',
  GPU: 'Graphics (GPU process)',
  Utility: 'Helper'
}

/**
 * CPU and memory of each part of the app, refreshed every 2 seconds while
 * shown, plus the problems the app log recorded (crashes, hangs, slow work).
 */
export function Diagnostics() {
  const [open, setOpen] = useState(false)
  const [metrics, setMetrics] = useState<ProcessMetric[]>([])
  const [problems, setProblems] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    let alive = true
    const load = async () => {
      const [m, lines] = await Promise.all([window.api.metrics(), window.api.recentLog()])
      if (!alive) return
      setMetrics(m)
      setProblems(lines.filter((l) => / (WARN|ERROR) /.test(l)).slice(-8))
    }
    void load()
    const id = setInterval(load, 2000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [open])

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} title="CPU and memory of the app, and recent problems">
        Show diagnostics
      </Button>
    )
  }

  const cpu = metrics.reduce((a, m) => a + m.cpu, 0)
  const memory = metrics.reduce((a, m) => a + m.memoryMB, 0)

  return (
    <div className="grid gap-3">
      <table className="w-full max-w-[520px] text-[13px]" aria-label="CPU and memory">
        <thead>
          <tr className="text-left text-[12.5px] text-muted">
            <th className="pb-1.5 font-normal">Part of the app</th>
            <th className="w-20 pb-1.5 text-right font-normal">CPU</th>
            <th className="w-24 pb-1.5 text-right font-normal">Memory</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line border-y border-line">
          {metrics.map((m, i) => (
            <tr key={`${m.type}-${i}`}>
              <td className="py-1.5 text-ink">{NAMES[m.type] ?? m.type}{m.name && m.type === 'Utility' ? ` (${m.name})` : ''}</td>
              <td className="tnum py-1.5 text-right">{m.cpu.toFixed(1)}%</td>
              <td className="tnum py-1.5 text-right">{m.memoryMB} MB</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-1.5">Total</td>
            <td className="tnum py-1.5 text-right">{cpu.toFixed(1)}%</td>
            <td className="tnum py-1.5 text-right">{memory} MB</td>
          </tr>
        </tbody>
      </table>
      <p className="text-[12.5px] text-muted">
        CPU is a share of one core. Idle, the total should stay near 0–2%; during a session a little more.
      </p>
      <div>
        <div className="pb-1 text-muted">Recent problems</div>
        {problems.length ? (
          <ul className="grid max-h-40 gap-1 overflow-y-auto rounded-md bg-surface p-2.5 font-mono text-[11.5px] text-muted ring-1 ring-line">
            {problems.map((l, i) => (
              <li key={i} className="break-all">
                {l}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12.5px] text-muted">None recorded.</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => window.api.openLog()}>Open log file</Button>
        <Button tone="ghost" onClick={() => setOpen(false)}>
          Hide
        </Button>
      </div>
    </div>
  )
}
