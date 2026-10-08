import type {
  FloatState,
  HotkeyAction,
  Hotkeys,
  ImageRef,
  PinterestImport,
  PinterestProgress,
  Region,
  StoreName
} from './types'

/** What the preload script exposes as `window.api`. */
export interface Api {
  load<T>(name: StoreName): Promise<T | null>
  save(name: StoreName, data: unknown): Promise<void>

  pickFolder(): Promise<string | null>
  pickImages(): Promise<string[]>
  scanFolder(dir: string): Promise<ImageRef[]>
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
  /** Save red correction marks (a transparent PNG) next to a session's captures. */
  saveMarkup(sessionId: string, name: string, png: Uint8Array): Promise<string>

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
}

/** URL the renderer uses to show a local image. */
export function imageUrl(path: string): string {
  return `ref://image/?path=${encodeURIComponent(path)}`
}

export function thumbUrl(path: string, size = 320): string {
  return `ref://thumb/?path=${encodeURIComponent(path)}&size=${size}`
}
