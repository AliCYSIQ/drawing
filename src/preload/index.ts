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
  scanFolder: (dir) => ipcRenderer.invoke('library:scanFolder', dir),
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
  onHotkey: (cb) => on('hotkey', cb),

  pickRegion: () => ipcRenderer.invoke('capture:pickRegion'),
  capture: (region, sessionId, index) => ipcRenderer.invoke('capture:grab', region, sessionId, index),
  setCaptureProtection: (on) => ipcRenderer.invoke('capture:protect', on),
  saveMarkup: (sessionId, name, png) => ipcRenderer.invoke('capture:saveMarkup', sessionId, name, png),

  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggleMaximize'),
  close: () => ipcRenderer.send('window:close'),
  moveWindow: (x, y) => ipcRenderer.send('window:move', x, y),
  onMaximized: (cb) => on('window:maximized', cb),
  regionDone: (rect) => ipcRenderer.send('region:done', rect),

  openDataFolder: () => ipcRenderer.invoke('data:open'),
  exportBackup: () => ipcRenderer.invoke('data:export')
}

contextBridge.exposeInMainWorld('api', api)
