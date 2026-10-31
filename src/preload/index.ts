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
  scanTree: (dir) => ipcRenderer.invoke('library:scanTree', dir),
  inspectFolder: (dir) => ipcRenderer.invoke('library:inspectFolder', dir),
  copyFiles: (folderId, paths, baseDir) => ipcRenderer.invoke('library:copyFiles', folderId, paths, baseDir),
  hashFiles: (paths) => ipcRenderer.invoke('library:hashFiles', paths),
  missingFiles: (paths) => ipcRenderer.invoke('library:missingFiles', paths),
  relinkFolder: (oldDir, newDir, paths) => ipcRenderer.invoke('library:relinkFolder', oldDir, newDir, paths),
  keepReference: (imageId, path) => ipcRenderer.invoke('library:keepReference', imageId, path),
  filesInfo: (paths) => ipcRenderer.invoke('library:filesInfo', paths),
  importUrl: (folderId, url) => ipcRenderer.invoke('library:importUrl', folderId, url),
  importBytes: (folderId, name, bytes) => ipcRenderer.invoke('library:importBytes', folderId, name, bytes),
  importPinterest: (folderId, url, known) => ipcRenderer.invoke('library:importPinterest', folderId, url, known),
  onPinterestProgress: (cb) => on('pinterest:progress', cb),
  removeImportFiles: (folderId) => ipcRenderer.invoke('library:removeImportFiles', folderId),
  cleanStoredFiles: (inUse) => ipcRenderer.invoke('library:cleanStoredFiles', inUse),
  pathForFile: (file) => webUtils.getPathForFile(file),
  pickPhotos: () => ipcRenderer.invoke('library:pickPhotos'),
  keepPhoto: (sessionId, path) => ipcRenderer.invoke('library:keepPhoto', sessionId, path),
  deleteSessionFile: (path) => ipcRenderer.invoke('library:deleteSessionFile', path),

  setFloat: (state) => ipcRenderer.invoke('float:set', state),
  onFloatChanged: (cb) => on('float:changed', cb),
  setHotkeys: (hotkeys) => ipcRenderer.invoke('hotkeys:set', hotkeys),
  setSessionActive: (active) => ipcRenderer.invoke('session:active', active),
  setZoom: (factor) => ipcRenderer.invoke('window:zoom', factor),
  onHotkey: (cb) => on('hotkey', cb),

  pickRegion: () => ipcRenderer.invoke('capture:pickRegion'),
  capture: (target, sessionId, index) => ipcRenderer.invoke('capture:grab', target, sessionId, index),
  listWindows: () => ipcRenderer.invoke('capture:windows'),
  windowPreview: (id) => ipcRenderer.invoke('capture:preview', id),
  setCaptureProtection: (on) => ipcRenderer.invoke('capture:protect', on),

  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggleMaximize'),
  close: () => ipcRenderer.send('window:close'),
  moveWindow: (x, y) => ipcRenderer.send('window:move', x, y),
  onMaximized: (cb) => on('window:maximized', cb),
  regionDone: (rect) => ipcRenderer.send('region:done', rect),

  openDataFolder: () => ipcRenderer.invoke('data:open'),
  exportBackup: () => ipcRenderer.invoke('data:export'),
  resetData: (parts) => ipcRenderer.invoke('data:reset', parts),
  listBackups: () => ipcRenderer.invoke('data:backups'),
  restoreBackup: (name) => ipcRenderer.invoke('data:restore', name),
  restoreZip: () => ipcRenderer.invoke('data:restoreZip'),
  openBackups: () => ipcRenderer.invoke('data:openBackups'),

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
