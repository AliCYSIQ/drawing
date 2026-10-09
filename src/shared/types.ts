/**
 * Version of the saved data's format. Raise it with a migration in
 * src/main/migrate.ts whenever saved data changes shape.
 * 1 = v0.1 (fixed categories). 2 = free tags, folders, favorites.
 * 3 = v0.2.5: no shortcuts (they became copies).
 */
export const SCHEMA_VERSION = 3

/** Offered when typing a tag. Only suggestions: any tag can be added. */
export const SUGGESTED_TAGS = ['figures', 'faces', 'hands', 'feet', 'animals', 'creatures', 'clothing', 'props', 'environments']

export type BoardKind = 'folder' | 'files' | 'pinterest' | 'collection'

export interface ImageRef {
  /** Stable id, derived from the path the image was first added from; kept when a folder is relinked. */
  id: string
  /** Absolute path on disk (Pinterest and collection images live in the app's data folder). */
  path: string
  sourceUrl?: string
}

/** A collection of references ("board"). */
export interface Board {
  id: string
  name: string
  kind: BoardKind
  /** Free tags, e.g. "hands", "project A". */
  tags: string[]
  /** Home folder; none = top level of the library. */
  folderId?: string
  favorite?: boolean
  /** Folder path or Pinterest URL. */
  source?: string
  /** Linked folders: false = only the images directly in the folder, not its sub-folders. */
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

/** A folder in the library. Holds folders and collections, like a folder in Windows. */
export interface Folder {
  id: string
  name: string
  parentId?: string
  /** Data version 2 only: collections shown here as shortcuts. Version 3 turned them into copies. */
  shortcuts?: string[]
  createdAt: number
}

/** Library data that isn't a collection: folders and favorite images. */
export interface LibraryMeta {
  folders: Folder[]
  /** Image ids marked as favorites, across all collections. */
  favoriteImages: string[]
  /**
   * Deleted collections whose image files (pasted, Pinterest) are removed at
   * the next start, so Undo works until then.
   */
  pendingDelete?: string[]
}

export const EMPTY_LIBRARY: LibraryMeta = { folders: [], favoriteImages: [] }

/** `seconds: 0` means untimed (you press next yourself). */
export interface Block {
  count: number
  seconds: number
}

/**
 * Classic: one time for every pose. Class: blocks that get longer. Relaxed: no timer.
 * Memory: study a reference, hide it, draw it from memory, reveal and correct, repeat.
 */
export type SessionMode = 'classic' | 'class' | 'relaxed' | 'memory'

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
  boardIds: string[]
  /** Whole library folders: everything inside them, including collections added later. */
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
  /** True when the session reached its last pose instead of being stopped early. */
  finished: boolean
  reviewed: boolean
  /** Photos of whole paper pages (several drawings each), attached during review. */
  pagePhotos: string[]
  /** Your own names for captures and photos, by file path ("Page 1" → "Sketchbook p. 12"). */
  labels?: Record<string, string>
  /** Names of the collections when the session was drawn, for searching history after renames. */
  boardNames?: string[]
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
 * each time. 'split' keeps the folder structure (folders and collections,
 * all levels down); 'one' makes one collection; 'top' takes only the images
 * directly in the folder.
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
  captureRegion?: Region
  float: FloatState
  lastPlan?: SessionPlan
  /** Library order: folders first, then by this. */
  librarySort?: 'name' | 'added' | 'practiced' | 'size'
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

export interface PinterestImport {
  name: string
  images: ImageRef[]
  report: {
    /** Pins with an image that the sync found. */
    found: number
    /** Pin count the board reports; video-only pins make this a little higher. */
    expected: number
    /** Pinterest stopped answering before the end; earlier images were kept. */
    partial: boolean
    /** Pins whose image could not be downloaded. */
    failed: number
  }
}

export interface PinterestProgress {
  boardId: string
  stage: 'list' | 'download'
  done: number
  total: number
}
