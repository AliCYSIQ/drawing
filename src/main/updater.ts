// Updates from GitHub Releases (electron-updater, NSIS installer).
//
// The app checks a little after it starts (unless turned off in Settings),
// downloads in the background, and tells the page when a new version is
// ready. It installs when you press Restart, or when you quit the app. It
// never restarts on its own, so a session is never interrupted.
//
// Where updates come from is set at build time (electron-builder.yml →
// publish), written into the installed app as app-update.yml. The release
// repository must be public: a private one would need a token inside the app.
// See docs/releasing.md.

import { app, type BrowserWindow } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '@shared/types'
import { log } from './log'

let win: BrowserWindow | null = null
let status: UpdateStatus = { state: app.isPackaged ? 'idle' : 'disabled' }
let wired = false

function publish(next: UpdateStatus): void {
  status = next
  if (win && !win.isDestroyed()) win.webContents.send('update:status', status)
}

export function getUpdateStatus(): UpdateStatus {
  return status
}

export function attachUpdater(w: BrowserWindow): void {
  win = w
  if (wired || !app.isPackaged) return
  wired = true
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = {
    info: () => {},
    debug: () => {},
    warn: (m: unknown) => log('warn', `Updater: ${String(m)}`),
    error: (m: unknown) => log('error', `Updater: ${String(m)}`)
  }
  autoUpdater.on('checking-for-update', () => publish({ state: 'checking' }))
  autoUpdater.on('update-not-available', () => publish({ state: 'none', checkedAt: Date.now() }))
  autoUpdater.on('update-available', (info) => publish({ state: 'downloading', version: info.version, percent: 0 }))
  autoUpdater.on('download-progress', (p) =>
    publish({ state: 'downloading', version: status.version, percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) => {
    log('info', `Update ${info.version} downloaded`)
    publish({ state: 'ready', version: info.version })
  })
  autoUpdater.on('error', (err) => {
    log('warn', `Update check failed: ${err?.message ?? err}`)
    // A failed check is quiet: it says so in Settings and tries again next start.
    publish({ state: 'error', error: friendlyError(err), version: status.version })
  })
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) return status
  if (status.state === 'checking' || status.state === 'downloading' || status.state === 'ready') return status
  try {
    await autoUpdater.checkForUpdates()
  } catch {
    // Reported through the 'error' event.
  }
  return status
}

/** Quit and run the installer quietly; the app starts again afterwards. */
export function installUpdate(): void {
  if (status.state !== 'ready') return
  log('info', `Installing update ${status.version}`)
  autoUpdater.quitAndInstall(true, true)
}

function friendlyError(err: Error | undefined): string {
  const msg = err?.message ?? ''
  if (/404|Not Found|Unable to find latest version/i.test(msg)) return 'No releases found. If the repository is private, updates need a public releases repository.'
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::ERR_/i.test(msg)) return 'No internet connection.'
  return 'The update check failed. It tries again next time the app starts.'
}

/** The GitHub releases page updates come from (read from the installed app's app-update.yml). */
export function releasesUrl(): string | null {
  if (!app.isPackaged) return null
  try {
    const yml = readFileSync(join(process.resourcesPath, 'app-update.yml'), 'utf8')
    const owner = /^owner:\s*(\S+)/m.exec(yml)?.[1]
    const repo = /^repo:\s*(\S+)/m.exec(yml)?.[1]
    return owner && repo ? `https://github.com/${owner}/${repo}/releases` : null
  } catch {
    return null
  }
}
