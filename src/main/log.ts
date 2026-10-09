// A small app log in data/logs/app.log: crashes, hangs and errors, so
// "it crashed sometimes" can become "the GPU process crashed, for this reason".
// Nothing leaves the computer.

import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { dataDir } from './store'

const MAX_BYTES = 1024 * 1024

export function logFile(): string {
  return dataDir('logs', 'app.log')
}

export function log(level: 'info' | 'warn' | 'error', message: string): void {
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${message.replace(/\s+$/, '')}\n`
  try {
    mkdirSync(dataDir('logs'), { recursive: true })
    // Keep one older file; the log never grows past about 2 MB.
    try {
      if (statSync(logFile()).size > MAX_BYTES) renameSync(logFile(), `${logFile()}.1`)
    } catch {
      // No log yet.
    }
    appendFileSync(logFile(), line, 'utf8')
  } catch {
    // Logging must never break the app.
  }
  if (level !== 'info') console.warn(line.trim())
}

/** The last lines of the log, newest last. */
export function recentLog(lines = 60): string[] {
  try {
    return readFileSync(logFile(), 'utf8').trimEnd().split('\n').slice(-lines)
  } catch {
    return []
  }
}

/**
 * Run synchronous work and log it when it held the main thread for long.
 * While the main thread is busy the window can't respond, so these are the
 * first places to look when the app lags.
 */
export function timedSync<T>(label: string, fn: () => T, slowMs = 120): T {
  const start = performance.now()
  try {
    return fn()
  } finally {
    const ms = performance.now() - start
    if (ms > slowMs) log('warn', `Slow: ${label} took ${Math.round(ms)} ms on the main thread`)
  }
}
