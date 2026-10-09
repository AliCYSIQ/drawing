import type {
  FloatState,
  FolderInfo,
  HotkeyAction,
  Hotkeys,
  ImageRef,
  PinterestImport,
  PinterestProgress,
  Region,
  StoreName,
  UpdateStatus
} from './types'

/** What the preload script exposes as `window.api`. */
export interface Api {
  load<T>(name: StoreName): Promise<T | null>
  save(name: StoreName, data: unknown): Promise<void>

  pickFolder(): Promise<string | null>
  pickImages(): Promise<string[]>
  /** recursive (default true): include images in sub-folders. */
  scanFolder(dir: string, recursive?: boolean): Promise<ImageRef[]>
  inspectFolder(dir: string): Promise<FolderInfo>
  /** Which of these files no longer exist. */
  missingFiles(paths: string[]): Promise<string[]>
  /** New paths for images after their folder moved (null where not found). */
  relinkFolder(oldDir: string, newDir: string, paths: string[]): Promise<(string | null)[]>
  /** Keep a smaller copy of a practiced reference for history; returns its path. */
  keepReference(imageId: string, path: string): Promise<string | null>
  /** Copy images into the app's folder for a collection; ids stay the same. */
  copyImages(boardId: string, refs: ImageRef[], baseDir?: string): Promise<ImageRef[]>
  refsForFiles(paths: string[]): Promise<ImageRef[]>
  /** Download an image URL into a collection board's folder. */
  importUrl(boardId: string, url: string): Promise<ImageRef>
  /** Save pasted or dropped image bytes into a collection board's folder. */
  importBytes(boardId: string, name: string, bytes: Uint8Array): Promise<ImageRef>
  importPinterest(boardId: string, url: string): Promise<PinterestImport>
  onPinterestProgress(cb: (p: PinterestProgress) => void): () => void
  /** Delete the files the app stored for a board (Pinterest cache, collection images). */
  removeBoardFiles(boardId: string): Promise<void>
  /** Path of a dropped File, or '' when it isn't on disk. */
  pathForFile(file: File): string
  pickPhotos(): Promise<string[]>
  /** Copy a page photo into the data folder; returns the stored path. */
  keepPhoto(sessionId: string, path: string): Promise<string>

  setFloat(state: FloatState): Promise<void>
  onFloatChanged(cb: (state: FloatState) => void): () => void
  setHotkeys(hotkeys: Hotkeys): Promise<Record<HotkeyAction, boolean>>
  /** Also keeps the screen awake while a session runs. */
  setSessionActive(active: boolean): Promise<void>
  /** Interface size, 0.8–1.5. */
  setZoom(factor: number): Promise<void>
  onHotkey(cb: (action: 'pause' | 'next') => void): () => void

  pickRegion(): Promise<Region | null>
  capture(region: Region, sessionId: string, index: number): Promise<string | null>
  setCaptureProtection(on: boolean): Promise<void>

  minimize(): void
  toggleMaximize(): void
  close(): void
  /** Move the window (float mode drags it by hand so hover still works). */
  moveWindow(x: number, y: number): void
  onMaximized(cb: (maximized: boolean) => void): () => void
  /** Sends the picked rectangle from the region-picker window. */
  regionDone(rect: { x: number; y: number; width: number; height: number } | null): void

  openDataFolder(): Promise<void>
  exportBackup(): Promise<string | null>

  /** Version numbers and where the data lives. */
  appInfo(): Promise<AppInfo>
  /** CPU and memory of each part of the app (main, page, GPU…). */
  metrics(): Promise<ProcessMetric[]>
  /** The last lines of the app log (crashes, hangs, slow work). */
  recentLog(): Promise<string[]>
  openLog(): Promise<void>
  /** Write a page error to the app log. */
  log(level: 'warn' | 'error', message: string): void

  /** Check GitHub Releases for a newer version; it downloads in the background. */
  checkUpdates(): Promise<UpdateStatus>
  updateStatus(): Promise<UpdateStatus>
  onUpdateStatus(cb: (s: UpdateStatus) => void): () => void
  /** Restart into the downloaded version (call after saving). */
  installUpdate(): Promise<void>
  /** The app is closing: save what is waiting, then call flushed(). */
  onFlush(cb: () => void): () => void
  flushed(): void
}

export interface AppInfo {
  version: string
  electron: string
  chrome: string
  dataDir: string
  /** GitHub releases page of the installed app; null when running from source. */
  releasesUrl: string | null
}

export interface ProcessMetric {
  /** Browser = main process, Tab = the app's page, GPU… */
  type: string
  name: string
  /** Percent of one CPU core since the last call. */
  cpu: number
  memoryMB: number
}

/** URL the renderer uses to show a local image. */
/** `fallback` (a kept copy) is shown if the file at `path` is gone. */
export function imageUrl(path: string, fallback?: string): string {
  const extra = fallback ? `&fallback=${encodeURIComponent(fallback)}` : ''
  return `ref://image/?path=${encodeURIComponent(path)}${extra}`
}

export function thumbUrl(path: string, size = 320, fallback?: string): string {
  const extra = fallback ? `&fallback=${encodeURIComponent(fallback)}` : ''
  return `ref://thumb/?path=${encodeURIComponent(path)}&size=${size}${extra}`
}
