/**
 * Version of the saved data's format. Raise it with a migration in
 * src/main/migrate.ts whenever saved data changes shape.
 * 1 = v0.1 (fixed categories). 2 = free tags, folders, favorites.
 * 3 = v0.2.5: no shortcuts (they became copies).
 * 4 = v0.3: one folder tree. Collections became folders, images are entries
 *     in folders, and what an image is (its asset) is kept apart from where
 *     it sits in the library.
 */
export const SCHEMA_VERSION = 4

import type { CaptureWindow } from './capture'

/** Offered when typing a tag. Only suggestions: any tag can be added. */
export const SUGGESTED_TAGS = ['figures', 'faces', 'hands', 'feet', 'animals', 'creatures', 'clothing', 'props', 'environments']

/** v0.2 collection kinds; only read when migrating old data. */
export type BoardKind = 'folder' | 'files' | 'pinterest' | 'collection'

/** An image to draw: its asset id and where its file is. */
export interface ImageRef {
  /** The asset id (see Asset). History, favorites and "fresh first" use it. */
  id: string
  /** Absolute path on disk (stored images live in the app's data folder). */
  path: string
  sourceUrl?: string
}

/** A v0.2 collection ("board"). Only read when migrating old data (data version 3 and older). */
export interface Board {
  id: string
  name: string
  kind: BoardKind
  tags: string[]
  folderId?: string
  favorite?: boolean
  source?: string
  recursive?: boolean
  images: ImageRef[]
  createdAt: number
  syncedAt?: number
}

/** A folder on disk and the sub-folders in it that hold images, all levels down. */
export interface FolderTree {
  name: string
  path: string
  /** Images directly in this folder. */
  direct: number
  /** Images here and in every sub-folder. */
  total: number
  /** Sub-folders with images somewhere inside them, by name. */
  children: FolderTree[]
}

/** What a folder on disk holds, before adding it. */
export interface FolderInfo {
  name: string
  path: string
  /** Images directly in the folder (not in its sub-folders). */
  direct: number
  /** Sub-folders that contain images, with their image count (including deeper folders). */
  subfolders: { name: string; path: string; count: number }[]
  /** The whole structure, for keeping it when adding. */
  tree: FolderTree
}

/** An image file found on disk or saved by the app. */
export interface FoundFile {
  path: string
  /** The id a new asset for this file gets (worked out from the path, as image ids always were), unless it is taken. */
  id: string
  size: number
  /** SHA-256 of the bytes, when it was worked out. */
  sha256?: string
}

/** One disk folder in a scan, with its own images (not its sub-folders'). */
export interface ScannedDir {
  path: string
  name: string
  /** The disk folder it is in; none for the scanned folder itself. */
  parent?: string
  files: FoundFile[]
}

/**
 * Where a folder's images come from when it mirrors something outside the
 * app. Rescan or Sync brings it up to date. It is only a link: moving or
 * deleting the library folder never touches the disk folder or the board.
 */
export type FolderSource =
  | {
      kind: 'disk'
      path: string
      /**
       * tree: the images directly in `path`; its sub-folders are folders inside this one.
       * flat: every image under `path`, sub-folders included, all in this folder.
       * top: only the images directly in `path`; sub-folders are left out.
       */
      include: 'tree' | 'flat' | 'top'
      /** Disk sub-folders it leaves out (not picked when adding, or removed from the library), so a rescan doesn't bring them back. */
      skip?: string[]
      syncedAt?: number
    }
  | { kind: 'pinterest'; url: string; syncedAt?: number }

/** A folder in the library. Holds folders and images, like a folder in Windows. */
export interface Folder {
  id: string
  name: string
  /** none = top level of the library. */
  parentId?: string
  createdAt: number
  /** Free tags, e.g. "hands", "project A". */
  tags?: string[]
  favorite?: boolean
  source?: FolderSource
  /** Data version 2 only: collections shown here as shortcuts. Version 3 turned them into copies. */
  shortcuts?: string[]
}

/**
 * One image in a folder. A copy is another entry of the same asset, so the
 * picture's bytes are kept once. Moving or deleting an entry never touches
 * a file on disk.
 */
export interface LibraryImage {
  id: string
  assetId: string
  /** none = top level of the library. */
  folderId?: string
  name: string
  createdAt: number
}

/**
 * What an image is, apart from where it sits in the library. The id stays
 * when the file moves (relink, rescan), so history and favorites follow it.
 */
export interface Asset {
  id: string
  path: string
  /** linked: your own file, never moved or deleted by the app. stored: a copy in the app's data folder. */
  storage: 'linked' | 'stored'
  /** How it came in. */
  origin: 'file' | 'folder' | 'paste' | 'web' | 'pinterest' | 'copy'
  sourceUrl?: string
  /** Pinterest pin id, so a sync never downloads a pin twice. */
  pinId?: string
  size?: number
  /** SHA-256 of the bytes: duplicates and moved files are recognised by it. */
  sha256?: string
  addedAt: number
}

/** Everything in the library. */
export interface LibraryData {
  /** 4: the folder-tree library. Library files from before have no `format`. */
  format?: 4
  folders: Folder[]
  images: LibraryImage[]
  assets: Asset[]
  /** Asset ids marked as favorites, wherever the image is. */
  favoriteImages: string[]
}

export const EMPTY_LIBRARY: LibraryData = { format: 4, folders: [], images: [], assets: [], favoriteImages: [] }

/** `seconds: 0` means untimed (you press next yourself). */
export interface Block {
  count: number
  seconds: number
}

/**
 * Classic: one time for every pose. Class: blocks that get longer. Relaxed: no timer.
 * Memory: study a reference, hide it, draw it from memory, reveal and correct, repeat.
 * Free: no references, only a clock; you draw whatever you like elsewhere.
 */
export type SessionMode = 'classic' | 'class' | 'relaxed' | 'memory' | 'free'

export interface MemoryOptions {
  /** Seconds to study each reference before it hides. */
  studySeconds: number
  /** Seconds to draw from memory; 0 = until you press Reveal. */
  drawSeconds: number
  /** Most attempts per reference. */
  attempts: number
}

/** Something you practice, e.g. "gesture" or "hands". You keep the list yourself. */
export interface Skill {
  id: string
  name: string
}

export interface SessionPlan {
  /** Data version 3 and older: picked collections. They are folders now (same ids), so they count like folderIds. */
  boardIds: string[]
  /** Library folders: every image inside them, sub-folders included. */
  folderIds?: string[]
  /** The skill this session practices; none = not tagged. Review can change it afterwards. */
  skillId?: string
  mode: SessionMode
  /** Classic: seconds per pose. */
  seconds: number
  /** Classic and relaxed: number of poses. 0 = every image once. */
  count: number
  /** Class mode blocks, in order. */
  blocks: Block[]
  /** Memory mode; `count` is the number of references. */
  memory: MemoryOptions
  shuffle: boolean
  rest: { enabled: boolean; seconds: number }
  /** Class mode: a longer break between blocks, in seconds; 0 = none. */
  blockRest?: number
  /** Images drawn in the last 7 days come after fresh ones. */
  freshFirst?: boolean
  /** Only images marked as favorites. */
  favoritesOnly?: boolean
  review: boolean
  /** Capture the Clip Studio canvas region at the end of each pose. */
  capture: boolean
}

export interface Preset {
  id: string
  name: string
  plan: SessionPlan
}

export const MISTAKES = [
  'proportions',
  'main line',
  'tilt',
  'placement',
  'stiff',
  'too much detail',
  'ran out of time'
] as const

/** One pen stroke; points are fractions (0–1) of the image's width and height. */
export type Stroke = { x: number; y: number }[]

export interface PoseResult {
  imageId: string
  /** Kept on the record so history still works after a board is removed. */
  imagePath: string
  plannedSeconds: number
  spentMs: number
  skipped: boolean
  capturePath?: string
  /** Photos of this one drawing (paper), attached during review. */
  photos?: string[]
  /**
   * Red correction marks, per drawing image (keyed by its path; marks on the
   * reference use the key "@reference"). Points are 0–1 across the image, so
   * they stay put at any size and can still be undone.
   */
  marks?: Record<string, Stroke[]>
  /** v0.1 memory mode saved marks as a picture; still shown for old sessions. */
  markupPath?: string
  mistakes: string[]
  note?: string
  redo: boolean
  /** Memory mode: which attempt at this reference (1, 2, 3…). */
  attempt?: number
  /** Memory mode: time spent studying before this attempt. */
  studyMs?: number
  /** A smaller copy of the reference kept by the app; shown if the original is gone. */
  keptPath?: string
}

export interface SessionRecord {
  id: string
  startedAt: number
  endedAt: number
  /** Time spent on poses: rest and pauses not included. */
  activeMs: number
  plan: SessionPlan
  poses: PoseResult[]
  /** True when the session reached its last pose instead of being stopped early (free drawing: always true). */
  finished: boolean
  reviewed: boolean
  /** Photos of whole paper pages (several drawings each), attached during review. */
  pagePhotos: string[]
  /** Your own names for captures and photos, by file path ("Page 1" → "Sketchbook p. 12"). */
  labels?: Record<string, string>
  /** Names of the folders (collections before v0.3) when the session was drawn, for searching history after renames. */
  boardNames?: string[]
  /** Free drawing: a note about the session. */
  note?: string
  /** Free drawing: pictures of the whole drawing (the canvas capture at the end). */
  drawings?: string[]
  challenge?: { challengeId: string; level: number }
  redoOf?: string
}

export interface Level {
  title: string
  focus: string
  blocks: Block[]
  /** Rest seconds between poses; 0 = no rest. */
  rest: number
}

export type LadderKind = 'speed' | 'volume' | 'class'

export interface Challenge {
  id: string
  name: string
  kind: 'ladder' | 'custom'
  ladder?: LadderKind
  /** Like SessionPlan.boardIds: old collection ids, which are folder ids now. */
  boardIds: string[]
  /** Whole library folders, like a session plan's. */
  folderIds?: string[]
  /** Every level's session counts toward this skill. */
  skillId?: string
  levels: Level[]
  /** Indices of completed levels. */
  completed: number[]
  createdAt: number
}

/** A rectangle on one display, in DIPs relative to that display's top-left corner. */
export interface Region {
  displayId: number
  x: number
  y: number
  width: number
  height: number
}

export interface FloatState {
  on: boolean
  alwaysOnTop: boolean
  opacity: number
  locked: boolean
  clickThrough: boolean
}

export interface Hotkeys {
  /** Turns click-through on/off while float mode is on. */
  clickThrough: string
  /** Turns float mode on/off from anywhere. Empty = not registered. */
  float: string
  /** Registered only while a session runs. */
  pause: string
  next: string
}

export type HotkeyAction = keyof Hotkeys

/**
 * What to do with sub-folders when adding a folder. 'ask' shows the choice
 * each time. 'split' keeps the folder structure, all levels down; 'one' puts
 * every image in one folder; 'top' takes only the images directly in the folder.
 */
export type FolderImport = 'ask' | 'one' | 'split' | 'top'

/** Where the updater is; 'disabled' when running from source (not installed). */
export interface UpdateStatus {
  state: 'disabled' | 'idle' | 'checking' | 'none' | 'downloading' | 'ready' | 'error'
  version?: string
  /** Download progress, 0–100. */
  percent?: number
  error?: string
  checkedAt?: number
}

export interface Settings {
  /** Format of the saved data; see SCHEMA_VERSION. */
  schemaVersion: number
  /** Check for a new version a little after the app starts (default on). */
  autoUpdate?: boolean
  theme: 'dark' | 'light' | 'system'
  folderImport: FolderImport
  /** Interface size: 1 = 100%. Ctrl + / - / 0 change it. */
  uiScale: number
  sound: boolean
  /** Short ticks in the last 3 seconds of a pose. */
  countdownTicks: boolean
  /** Numbers and line, or only the progress line (calmer). */
  timerDisplay: 'clock' | 'line'
  hotkeys: Hotkeys
  /** Older setups: a fixed screen area to capture. A chosen window (captureWindow) is used instead when there is one. */
  captureRegion?: Region
  /** The window canvas captures take, and which part of it. */
  captureWindow?: CaptureWindow
  float: FloatState
  lastPlan?: SessionPlan
  /** Library order: folders first, then by this. */
  librarySort?: 'name' | 'added' | 'practiced' | 'size'
  /** Free drawing: capture the canvas area when the session ends. */
  freeCapture?: boolean
  /** A free drawing session that is still going, so it survives a restart. */
  freeRun?: FreeRun
}

/** A free drawing session in progress. Time is kept as timestamps, so pauses are exact. */
export interface FreeRun {
  id: string
  startedAt: number
  /** Drawing time before the current stretch (pauses not included). */
  carriedMs: number
  /** When the current stretch started; none = paused. */
  runningSince?: number
  /** Last time the app saw it running, for a restart after the app was closed. */
  lastSeen: number
  skillId?: string
  capture: boolean
}

export const DEFAULT_HOTKEYS: Hotkeys = {
  clickThrough: 'Control+Alt+L',
  float: 'Control+Alt+F',
  pause: 'Control+Alt+Space',
  next: 'Control+Alt+Right'
}

export const DEFAULT_FLOAT: FloatState = {
  on: false,
  alwaysOnTop: true,
  opacity: 1,
  locked: false,
  clickThrough: false
}

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: SCHEMA_VERSION,
  theme: 'dark',
  folderImport: 'ask',
  uiScale: 1,
  sound: true,
  countdownTicks: false,
  timerDisplay: 'clock',
  hotkeys: DEFAULT_HOTKEYS,
  float: DEFAULT_FLOAT
}

export const DEFAULT_PLAN: SessionPlan = {
  boardIds: [],
  mode: 'classic',
  seconds: 60,
  count: 10,
  blocks: [
    { count: 10, seconds: 30 },
    { count: 5, seconds: 60 },
    { count: 3, seconds: 300 },
    { count: 1, seconds: 600 }
  ],
  memory: { studySeconds: 60, drawSeconds: 180, attempts: 3 },
  shuffle: true,
  rest: { enabled: false, seconds: 5 },
  blockRest: 0,
  freshFirst: true,
  favoritesOnly: false,
  review: true,
  capture: false
}

export type StoreName = 'boards' | 'library' | 'sessions' | 'challenges' | 'presets' | 'skills' | 'settings'

/* Pinterest sync */

/** One page a sync read: the board page, a feed page, or the RSS feed. */
export interface SyncPage {
  kind: 'page' | 'feed' | 'rss'
  /** HTTP status of the last try (0 = no answer). */
  status: number
  /** How many requests it took. */
  tries: number
  /** Picture pins on the page, and how many of them were new. */
  pins: number
  newPins: number
  /** Items that are not pictures. */
  skipped: number
  /** Whether it pointed to a next page. */
  next: boolean
}

/** What a sync did, page by page, so a short result can be explained. */
export interface SyncDiagnostics {
  pages: SyncPage[]
  /** Pins seen again on a later page. */
  duplicates: number
  /** Only the RSS feed could be read (it holds the latest ~25 pins). */
  rss: boolean
  /**
   * Why reading stopped. end: no next page. failed: a page couldn't be read
   * after retries. short: the last page said "no more" before the board's
   * own count was reached. rss: only the RSS feed worked.
   */
  stop: 'end' | 'failed' | 'repeated-bookmark' | 'limit' | 'rss' | 'short'
}

/** One pin of a board, downloaded (or already saved by an earlier sync). */
export interface PinFile extends FoundFile {
  pinId: string
  /** The pin's page on Pinterest. */
  sourceUrl: string
}

export interface PinterestImport {
  name: string
  pins: PinFile[]
  report: {
    /** Pins with an image that the sync found. */
    found: number
    /** Pin count the board reports (0 when unknown); video-only pins make this a little higher. */
    expected: number
    /** Not every page could be read (Pinterest stopped answering, or only the short RSS feed worked). */
    partial: boolean
    /** Pins whose image could not be downloaded. */
    failed: number
    /** The board has more pins than one sync reads (MAX_PINS in src/main/pinterest.ts). */
    limited: boolean
    /** Items on the board that are not pictures (stories, ads, products). */
    skipped: number
    /** Images downloaded now (the rest were saved before). */
    downloaded: number
    diagnostics: SyncDiagnostics
  }
}

export interface PinterestProgress {
  boardId: string
  stage: 'list' | 'download'
  done: number
  total: number
}
