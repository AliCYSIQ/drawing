import type {
  FloatState,
  FolderInfo,
  FoundFile,
  HotkeyAction,
  Hotkeys,
  PinterestImport,
  PinterestProgress,
  Region,
  ScannedDir,
  StoreName,
  UpdateStatus
} from './types'
import type { BackupInfo, ResetPart } from './reset'
import type { CaptureResult, CaptureTarget, WindowChoice } from './capture'

/** What the preload script exposes as `window.api`. */
export interface Api {
  load<T>(name: StoreName): Promise<T | null>
  save(name: StoreName, data: unknown): Promise<void>

  pickFolder(): Promise<string | null>
  pickImages(): Promise<string[]>
  /** A disk folder and its sub-folders with images, each with its own image files. */
  scanTree(dir: string): Promise<ScannedDir[]>
  inspectFolder(dir: string): Promise<FolderInfo>
  /** SHA-256 of each file (null where it can't be read). */
  hashFiles(paths: string[]): Promise<(string | null)[]>
  /** Which of these files no longer exist. */
  missingFiles(paths: string[]): Promise<string[]>
  /** New paths for images after their folder moved (null where not found). */
  relinkFolder(oldDir: string, newDir: string, paths: string[]): Promise<(string | null)[]>
  /** Keep a smaller copy of a practiced reference for history; returns its path. */
  keepReference(imageId: string, path: string): Promise<string | null>
  /** Copy files into the app's own folder (the originals are only read); null where one can't be read. */
  copyFiles(folderId: string, paths: string[], baseDir?: string): Promise<(FoundFile | null)[]>
  /** Size and new-asset id of picked image files. */
  filesInfo(paths: string[]): Promise<FoundFile[]>
  /** Download an image URL into the app's folder. */
  importUrl(folderId: string, url: string): Promise<FoundFile & { sourceUrl?: string }>
  /** Save pasted or dropped image bytes into the app's folder. */
  importBytes(folderId: string, name: string, bytes: Uint8Array): Promise<FoundFile>
  /** `known`: pins already saved (pin id → file), never downloaded again. Deletes nothing. */
  importPinterest(folderId: string, url: string, known?: Record<string, string>): Promise<PinterestImport>
  onPinterestProgress(cb: (p: PinterestProgress) => void): () => void
  /** Delete what a failed first Pinterest import downloaded for a folder that was never saved. */
  removeImportFiles(folderId: string): Promise<void>
  /** Remove stored images nothing needs any more (only in the app's own folders); returns how many. */
  cleanStoredFiles(inUse: string[]): Promise<number>
  /** Path of a dropped File, or '' when it isn't on disk. */
  pathForFile(file: File): string
  pickPhotos(): Promise<string[]>
  /** Copy a page photo into the data folder; returns the stored path. */
  keepPhoto(sessionId: string, path: string): Promise<string>
  /** Delete a capture or review photo the app keeps (only files in its own folders). */
  deleteSessionFile(path: string): Promise<boolean>

  setFloat(state: FloatState): Promise<void>
  onFloatChanged(cb: (state: FloatState) => void): () => void
  setHotkeys(hotkeys: Hotkeys): Promise<Record<HotkeyAction, boolean>>
  /** Also keeps the screen awake while a session runs. */
  setSessionActive(active: boolean): Promise<void>
  /** Interface size, 0.8–1.5. */
  setZoom(factor: number): Promise<void>
  onHotkey(cb: (action: 'pause' | 'next') => void): () => void

  pickRegion(): Promise<Region | null>
  /** Capture the chosen window (or the older screen area); never falls back to the whole screen. */
  capture(target: CaptureTarget, sessionId: string, index: number): Promise<CaptureResult>
  /** Open windows to choose from (the app's own are left out; minimized ones aren't listed). */
  listWindows(): Promise<WindowChoice[]>
  /** A big picture of one window, for choosing the part to capture; null if it isn't open. */
  windowPreview(id: string): Promise<string | null>
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
  /** Start over: what the parts hold moves into a backup, then the page reloads. */
  resetData(parts: ResetPart[]): Promise<{ backup: string }>
  listBackups(): Promise<BackupInfo[]>
  /** Put a backup back (what it replaces is kept in a new backup); the page reloads. */
  restoreBackup(name: string): Promise<{ error?: string }>
  /** Pick a backup .zip and restore it. */
  restoreZip(): Promise<{ error?: string; cancelled?: boolean }>
  openBackups(): Promise<void>

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
