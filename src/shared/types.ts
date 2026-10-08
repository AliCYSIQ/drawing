export const CATEGORIES = [
  'figures',
  'faces',
  'hands',
  'creatures',
  'props',
  'environments',
  'other'
] as const
export type Category = (typeof CATEGORIES)[number]

export type BoardKind = 'folder' | 'files' | 'pinterest' | 'collection'

export interface ImageRef {
  /** Stable id derived from the local path. */
  id: string
  /** Absolute path on disk (Pinterest and collection images live in the app's data folder). */
  path: string
  sourceUrl?: string
}

export interface Board {
  id: string
  name: string
  kind: BoardKind
  category: Category
  /** Folder path or Pinterest URL. */
  source?: string
  images: ImageRef[]
  createdAt: number
  syncedAt?: number
}

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

export interface SessionPlan {
  boardIds: string[]
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

export interface PoseResult {
  imageId: string
  /** Kept on the record so history still works after a board is removed. */
  imagePath: string
  plannedSeconds: number
  spentMs: number
  skipped: boolean
  capturePath?: string
  /** Red correction marks drawn over the capture (memory mode). */
  markupPath?: string
  mistakes: string[]
  note?: string
  redo: boolean
  /** Memory mode: which attempt at this reference (1, 2, 3…). */
  attempt?: number
  /** Memory mode: time spent studying before this attempt. */
  studyMs?: number
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
  /** Phone photos of paper pages, attached during review. */
  pagePhotos: string[]
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

export interface Settings {
  theme: 'dark' | 'light' | 'system'
  /** Interface size: 1 = 100%. Ctrl + / - / 0 change it. */
  uiScale: number
  sound: boolean
  hotkeys: Hotkeys
  captureRegion?: Region
  float: FloatState
  lastPlan?: SessionPlan
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
  theme: 'dark',
  uiScale: 1,
  sound: true,
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
  review: true,
  capture: false
}

export type StoreName = 'boards' | 'sessions' | 'challenges' | 'presets' | 'settings'

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
