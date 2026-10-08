import { app, BrowserWindow, dialog, ipcMain, Menu, net, powerSaveBlocker, protocol, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { FloatState, Hotkeys, ImageRef, Region, StoreName } from '@shared/types'
import { captureRegion, pickRegion } from './capture'
import { attachFloat, boundsBeforeFloat, setFloat, setHotkeys, setSessionActive } from './float'
import {
  copyImages,
  importBytes,
  importPinterest,
  importUrl,
  inspectFolder,
  isImagePath,
  keepPhoto,
  refsForFiles,
  removeBoardFiles,
  scanFolder,
  thumbnail
} from './library'
import { dataDir, exportZip, load, save } from './store'
import { migrateDataDir } from './migrate'
import { loadWindowState, trackWindowState } from './windowState'

// Tests point the app at a throwaway data folder.
if (process.env.DRAWING_DATA_DIR) app.setPath('userData', process.env.DRAWING_DATA_DIR)

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
  trackWindowState(main, boundsBeforeFloat)
  main.once('ready-to-show', () => {
    if (saved?.maximized) main?.maximize()
    main?.show()
  })
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

/** ref://image/?path=… serves a local image; ref://thumb/?path=…&size=… a cached thumbnail. */
function registerProtocol(): void {
  protocol.handle('ref', async (req) => {
    const url = new URL(req.url)
    const path = url.searchParams.get('path') ?? ''
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
  handle('library:scanFolder', (dir: string, recursive?: boolean) => scanFolder(dir, recursive !== false))
  handle('library:inspectFolder', (dir: string) => inspectFolder(dir))
  handle('library:copyImages', (boardId: string, refs: ImageRef[], baseDir?: string) => copyImages(boardId, refs, baseDir))
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
    createWindow()
  })
  app.on('window-all-closed', () => app.quit())
}
