import { app, BrowserWindow, crashReporter, dialog, ipcMain, Menu, net, powerSaveBlocker, protocol, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DEFAULT_FLOAT, type FloatState, type Hotkeys, type ImageRef, type Region, type StoreName } from '@shared/types'
import { captureRegion, pickRegion } from './capture'
import { attachFloat, boundsBeforeFloat, getFloat, setFloat, setHotkeys, setSessionActive } from './float'
import {
  copyImages,
  deleteSessionFile,
  importBytes,
  importPinterest,
  importUrl,
  inspectFolder,
  isImagePath,
  keepPhoto,
  keepReference,
  missingFiles,
  refsForFiles,
  relinkFolder,
  removeBoardFiles,
  scanFolder,
  thumbnail
} from './library'
import { log, logFile, recentLog } from './log'
import { dataDir, exportZip, load, save } from './store'
import { migrateDataDir } from './migrate'
import { attachUpdater, checkForUpdates, getUpdateStatus, installUpdate, releasesUrl } from './updater'
import { loadWindowState, trackWindowState } from './windowState'

// Tests point the app at a throwaway data folder.
if (process.env.DRAWING_DATA_DIR) app.setPath('userData', process.env.DRAWING_DATA_DIR)

// Crash dumps stay on this computer (userData/Crashpad); the log says which part crashed.
crashReporter.start({ uploadToServer: false })
process.on('uncaughtException', (err) => log('error', `Main process: ${err.stack ?? err.message}`))
process.on('unhandledRejection', (err) => log('error', `Main process (promise): ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`))

protocol.registerSchemesAsPrivileged([
  { scheme: 'ref', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

const preload = join(__dirname, '../preload/index.js')
let main: BrowserWindow | null = null

function loadRenderer(w: BrowserWindow, hash = ''): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    w.loadURL(`${process.env.ELECTRON_RENDERER_URL}${hash ? `#${hash}` : ''}`)
  } else {
    w.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
  }
}

function createWindow(): void {
  const saved = loadWindowState()
  main = new BrowserWindow({
    ...(saved?.bounds ?? { width: 1280, height: 820 }),
    frame: false,
    show: false,
    backgroundColor: '#141413',
    title: 'Drawing Practice',
    webPreferences: { preload }
  })
  attachFloat(main)
  attachUpdater(main)
  trackWindowState(main, boundsBeforeFloat)
  saveBeforeClose(main)
  main.once('ready-to-show', () => {
    if (saved?.maximized) main?.maximize()
    main?.show()
  })
  main.on('unresponsive', () => log('warn', `Window stopped responding (float ${JSON.stringify(getFloat())})`))
  main.on('responsive', () => log('info', 'Window responds again'))
  main.on('maximize', () => main?.webContents.send('window:maximized', true))
  main.on('unmaximize', () => main?.webContents.send('window:maximized', false))
  // Links open in the real browser, never inside the app.
  main.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  main.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(process.env.ELECTRON_RENDERER_URL ?? 'file:')) e.preventDefault()
  })
  loadRenderer(main)
}

/**
 * The page saves each change a moment after it happens. Before the window
 * closes (or an update restarts the app), it gets a chance to save what is
 * still waiting, so the last note or mark isn't lost.
 */
let savedBeforeClose = false
function saveBeforeClose(w: BrowserWindow): void {
  w.on('close', (e) => {
    if (savedBeforeClose || w.webContents.isCrashed()) return
    e.preventDefault()
    const done = () => {
      clearTimeout(timer)
      ipcMain.removeListener('app:flushed', done)
      savedBeforeClose = true
      if (!w.isDestroyed()) w.close()
    }
    const timer = setTimeout(done, 2000)
    ipcMain.once('app:flushed', done)
    w.webContents.send('app:flush')
  })
}

/** ref://image/?path=… serves a local image; ref://thumb/?path=…&size=… a cached thumbnail. */
function registerProtocol(): void {
  protocol.handle('ref', async (req) => {
    const url = new URL(req.url)
    let path = url.searchParams.get('path') ?? ''
    // `fallback`: the kept copy of a reference, used once the original is gone.
    const fallback = url.searchParams.get('fallback')
    if (fallback && isImagePath(fallback) && !existsSync(path)) path = fallback
    if (!isImagePath(path)) return new Response('Not an image', { status: 400 })
    let file = path
    if (url.hostname === 'thumb') {
      const size = Math.min(1024, Math.max(64, Number(url.searchParams.get('size')) || 320))
      file = (await thumbnail(path, size).catch(() => null)) ?? path
    }
    try {
      return await net.fetch(pathToFileURL(file).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

// The screen must not dim or sleep in the middle of a pose.
let awakeId: number | null = null
function keepAwake(on: boolean): void {
  if (on && awakeId === null) awakeId = powerSaveBlocker.start('prevent-display-sleep')
  if (!on && awakeId !== null) {
    powerSaveBlocker.stop(awakeId)
    awakeId = null
  }
}

function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>): void {
  ipcMain.handle(channel, (_e, ...args) => fn(...(args as A)))
}

function registerIpc(): void {
  handle('store:load', (name: StoreName) => load(name))
  handle('store:save', (name: StoreName, data: unknown) => save(name, data))

  handle('library:pickFolder', async () => {
    const r = await dialog.showOpenDialog(main!, { properties: ['openDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  handle('library:pickImages', async () => {
    const r = await dialog.showOpenDialog(main!, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'] }]
    })
    return r.canceled ? [] : r.filePaths
  })
  handle('library:pickPhotos', async () => {
    const r = await dialog.showOpenDialog(main!, {
      title: 'Photos of your pages',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
    })
    return r.canceled ? [] : r.filePaths
  })
  handle('library:keepPhoto', (sessionId: string, path: string) => keepPhoto(sessionId, path))
  handle('library:deleteSessionFile', (path: string) => deleteSessionFile(path))
  handle('library:scanFolder', (dir: string, recursive?: boolean) => scanFolder(dir, recursive !== false))
  handle('library:inspectFolder', (dir: string) => inspectFolder(dir))
  handle('library:copyImages', (boardId: string, refs: ImageRef[], baseDir?: string) => copyImages(boardId, refs, baseDir))
  handle('library:missingFiles', (paths: string[]) => missingFiles(paths))
  handle('library:relinkFolder', (oldDir: string, newDir: string, paths: string[]) => relinkFolder(oldDir, newDir, paths))
  handle('library:keepReference', (imageId: string, path: string) => keepReference(imageId, path).catch(() => null))
  handle('library:refsForFiles', (paths: string[]) => refsForFiles(paths))
  handle('library:importUrl', (boardId: string, url: string) => importUrl(boardId, url))
  handle('library:importBytes', (boardId: string, name: string, bytes: Uint8Array) => importBytes(boardId, name, bytes))
  handle('library:removeBoardFiles', (boardId: string) => removeBoardFiles(boardId))
  handle('library:importPinterest', (boardId: string, url: string) =>
    importPinterest(boardId, url, (stage, done, total) =>
      main?.webContents.send('pinterest:progress', { boardId, stage, done, total })
    )
  )

  handle('float:set', (s: FloatState) => setFloat(s))
  handle('hotkeys:set', (h: Hotkeys) => setHotkeys(h))
  handle('session:active', (active: boolean) => {
    setSessionActive(active)
    keepAwake(active)
  })
  handle('window:zoom', (factor: number) => {
    if (Number.isFinite(factor)) main?.webContents.setZoomFactor(Math.min(1.5, Math.max(0.8, factor)))
  })

  handle('capture:pickRegion', () => pickRegion(main!, loadRenderer, preload))
  handle('capture:grab', (region: Region, sessionId: string, index: number) =>
    captureRegion(region, sessionId, index).catch(() => null)
  )
  // Keeps the app's own window out of captures (Windows 10 2004+), so a
  // float window over the canvas doesn't end up in the drawing.
  handle('capture:protect', (on: boolean) => main?.setContentProtection(on))

  ipcMain.on('window:minimize', () => main?.minimize())
  ipcMain.on('window:toggleMaximize', () => (main?.isMaximized() ? main.unmaximize() : main?.maximize()))
  ipcMain.on('window:close', () => main?.close())
  ipcMain.on('window:move', (_e, x: number, y: number) => {
    if (!main?.isMovable() || !Number.isFinite(x) || !Number.isFinite(y)) return
    // setBounds with the current size: setPosition alone can drift the size on scaled displays.
    const { width, height } = main.getBounds()
    main.setBounds({ x: Math.round(x), y: Math.round(y), width, height })
  })

  handle('data:open', () => shell.openPath(dataDir()).then(() => undefined))
  handle('app:openLog', () => shell.openPath(logFile()).then(() => undefined))
  handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    dataDir: dataDir(),
    releasesUrl: releasesUrl()
  }))
  handle('app:metrics', () =>
    app.getAppMetrics().map((m) => ({
      type: m.type,
      name: m.name ?? m.serviceName ?? '',
      cpu: Math.round(m.cpu.percentCPUUsage * 10) / 10,
      memoryMB: Math.round(m.memory.workingSetSize / 1024)
    }))
  )
  handle('app:recentLog', () => recentLog())
  handle('update:check', () => checkForUpdates())
  handle('update:status', () => getUpdateStatus())
  handle('update:install', () => {
    // The page saved everything before asking.
    savedBeforeClose = true
    installUpdate()
  })
  ipcMain.on('app:log', (_e, level: unknown, message: unknown) => {
    if (level !== 'warn' && level !== 'error') return
    log(level, `Page: ${String(message).slice(0, 4000)}`)
  })
  handle('data:export', async () => {
    const stamp = new Date().toISOString().slice(0, 10)
    const r = await dialog.showSaveDialog(main!, {
      defaultPath: `drawing-practice-backup-${stamp}.zip`,
      filters: [{ name: 'Zip', extensions: ['zip'] }]
    })
    if (r.canceled || !r.filePath) return null
    await exportZip(r.filePath)
    return r.filePath
  })
}

/** Log crashes of any part of the app; if the page itself crashed, bring it back in a normal window. */
function watchCrashes(): void {
  app.on('child-process-gone', (_e, d) => {
    log('error', `${d.type} process gone: ${d.reason} (exit code ${d.exitCode}${d.name ? `, ${d.name}` : ''})`)
  })
  app.on('render-process-gone', (_e, wc, d) => {
    log('error', `Page process gone: ${d.reason} (exit code ${d.exitCode})`)
    if (!main || main.isDestroyed() || wc !== main.webContents || d.reason === 'clean-exit') return
    // A crashed page under click-through would leave an invisible window that ignores the mouse.
    setFloat({ ...DEFAULT_FLOAT, ...getFloat(), on: false, clickThrough: false })
    setSessionActive(false)
    keepAwake(false)
    loadRenderer(main)
  })
}

const single = app.requestSingleInstanceLock()
if (!single) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!main) return
    if (main.isMinimized()) main.restore()
    main.focus()
  })
  app.whenReady().then(async () => {
    app.setAppUserModelId('com.ilent0.drawing-practice')
    // No hidden default menu: its shortcuts (reload, zoom) would fight the app's own.
    Menu.setApplicationMenu(null)
    const migration = await migrateDataDir(dataDir()).catch((err: Error) => ({ status: 'failed' as const, err }))
    if (migration.status === 'newer' || migration.status === 'failed') {
      const detail =
        migration.status === 'newer'
          ? 'Your practice data was saved by a newer version of Drawing Practice. Install the newer version to open it; nothing was changed.'
          : `Your practice data could not be updated (${migration.err.message}). A backup is in the data folder; nothing else was changed.`
      const choice = dialog.showMessageBoxSync({
        type: 'warning',
        title: 'Drawing Practice',
        message: 'Drawing Practice can’t open your data',
        detail,
        buttons: ['Open data folder', 'Quit']
      })
      if (choice === 0) await shell.openPath(dataDir())
      app.quit()
      return
    }
    registerProtocol()
    registerIpc()
    watchCrashes()
    createWindow()
  })
  app.on('window-all-closed', () => app.quit())
}
