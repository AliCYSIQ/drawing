import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { Api } from '@shared/api'

function on<T>(channel: string, cb: (value: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, value: T) => cb(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: Api = {
  load: (name) => ipcRenderer.invoke('store:load', name),
  save: (name, data) => ipcRenderer.invoke('store:save', name, data),

  pickFolder: () => ipcRenderer.invoke('library:pickFolder'),
  pickImages: () => ipcRenderer.invoke('library:pickImages'),
  scanFolder: (dir, recursive) => ipcRenderer.invoke('library:scanFolder', dir, recursive),
  inspectFolder: (dir) => ipcRenderer.invoke('library:inspectFolder', dir),
  copyImages: (boardId, refs, baseDir) => ipcRenderer.invoke('library:copyImages', boardId, refs, baseDir),
  missingFiles: (paths) => ipcRenderer.invoke('library:missingFiles', paths),
  relinkFolder: (oldDir, newDir, paths) => ipcRenderer.invoke('library:relinkFolder', oldDir, newDir, paths),
  keepReference: (imageId, path) => ipcRenderer.invoke('library:keepReference', imageId, path),
  refsForFiles: (paths) => ipcRenderer.invoke('library:refsForFiles', paths),
  importUrl: (boardId, url) => ipcRenderer.invoke('library:importUrl', boardId, url),
  importBytes: (boardId, name, bytes) => ipcRenderer.invoke('library:importBytes', boardId, name, bytes),
  importPinterest: (boardId, url) => ipcRenderer.invoke('library:importPinterest', boardId, url),
  onPinterestProgress: (cb) => on('pinterest:progress', cb),
  removeBoardFiles: (boardId) => ipcRenderer.invoke('library:removeBoardFiles', boardId),
  pathForFile: (file) => webUtils.getPathForFile(file),
  pickPhotos: () => ipcRenderer.invoke('library:pickPhotos'),
  keepPhoto: (sessionId, path) => ipcRenderer.invoke('library:keepPhoto', sessionId, path),

  setFloat: (state) => ipcRenderer.invoke('float:set', state),
  onFloatChanged: (cb) => on('float:changed', cb),
  setHotkeys: (hotkeys) => ipcRenderer.invoke('hotkeys:set', hotkeys),
  setSessionActive: (active) => ipcRenderer.invoke('session:active', active),
  setZoom: (factor) => ipcRenderer.invoke('window:zoom', factor),
  onHotkey: (cb) => on('hotkey', cb),

  pickRegion: () => ipcRenderer.invoke('capture:pickRegion'),
  capture: (region, sessionId, index) => ipcRenderer.invoke('capture:grab', region, sessionId, index),
  setCaptureProtection: (on) => ipcRenderer.invoke('capture:protect', on),

  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggleMaximize'),
  close: () => ipcRenderer.send('window:close'),
  moveWindow: (x, y) => ipcRenderer.send('window:move', x, y),
  onMaximized: (cb) => on('window:maximized', cb),
  regionDone: (rect) => ipcRenderer.send('region:done', rect),

  openDataFolder: () => ipcRenderer.invoke('data:open'),
  exportBackup: () => ipcRenderer.invoke('data:export'),

  appInfo: () => ipcRenderer.invoke('app:info'),
  metrics: () => ipcRenderer.invoke('app:metrics'),
  recentLog: () => ipcRenderer.invoke('app:recentLog'),
  openLog: () => ipcRenderer.invoke('app:openLog'),
  log: (level, message) => ipcRenderer.send('app:log', level, message),

  checkUpdates: () => ipcRenderer.invoke('update:check'),
  updateStatus: () => ipcRenderer.invoke('update:status'),
  onUpdateStatus: (cb) => on('update:status', cb),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onFlush: (cb) => on('app:flush', cb),
  flushed: () => ipcRenderer.send('app:flushed')
}

contextBridge.exposeInMainWorld('api', api)
