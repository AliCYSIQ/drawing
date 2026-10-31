import { create } from 'zustand'
import {
  DEFAULT_FLOAT,
  DEFAULT_HOTKEYS,
  DEFAULT_PLAN,
  DEFAULT_SETTINGS,
  EMPTY_LIBRARY,
  type Challenge,
  type FloatState,
  type FreeRun,
  type HotkeyAction,
  type ImageRef,
  type LibraryData,
  type PoseResult,
  type Preset,
  type SessionPlan,
  type SessionRecord,
  type Settings,
  type Skill,
  type StoreName,
  type UpdateStatus
} from '@shared/types'
import type { CaptureResult, CaptureTarget } from '@shared/capture'
import { completeLevel } from './lib/challenges'
import { freeBeat, freePause, freeRecord, freeRestore, freeStart, freeToggle } from './lib/freeEngine'
import { planFolderIds, tidyAssets, type Item, type Lib } from './lib/library'
import { createMemory, memoryStop, type MemoryState } from './lib/memoryEngine'
import { findSkill, normalizeSkillName, withoutSkill } from './lib/skills'
import { activeMs, createEngine, stop, type EngineState, type Slot } from './lib/sessionEngine'

export type View =
  | { name: 'practice' }
  | { name: 'library'; folderId?: string }
  | { name: 'viewer'; folderId?: string; entryId: string }
  | { name: 'challenges'; challengeId?: string }
  | { name: 'stats' }
  | { name: 'history'; day?: string }
  | { name: 'settings' }
  | { name: 'session' }
  | { name: 'review'; sessionId: string }

export interface Run {
  id: string
  plan: SessionPlan
  slots: Slot[]
  engine: EngineState
  /** Set for memory-mode runs. */
  memory?: MemoryState
  /** Memory mode: one result per attempt, added as each drawing ends. */
  results: PoseResult[]
  startedAt: number
  captures: (string | undefined)[]
  challenge?: { challengeId: string; level: number }
  redoOf?: string
  returnTo: View
}

export interface Toast {
  id: number
  text: string
  /** A button on the toast, e.g. Undo. */
  action?: { label: string; run: () => void }
}

/** A library state Undo or Redo goes back to. */
interface LibrarySnapshot {
  label: string
  folders: LibraryData['folders']
  images: LibraryData['images']
}

interface State {
  loaded: boolean
  view: View
  /** Folders, images, assets and favorite images. */
  library: LibraryData
  sessions: SessionRecord[]
  challenges: Challenge[]
  presets: Preset[]
  /** Your skill list; sessions, presets and challenges can count toward one. */
  skills: Skill[]
  settings: Settings
  float: FloatState
  hotkeyStatus: Record<HotkeyAction, boolean>
  run: Run | null
  /** A free drawing session that is going (also saved in settings, for a restart). */
  free: FreeRun | null
  toast: Toast | null
  /** Asset ids whose file can't be found (checked, not saved). */
  missing: string[]
  update: UpdateStatus
  /** Library changes that Ctrl+Z (or a toast's Undo) can take back, newest last. */
  libraryUndo: LibrarySnapshot[]
  /** Changes Undo took back, for Redo (Ctrl+Y). A new change clears them. */
  libraryRedo: LibrarySnapshot[]
  /** Cut or copied library items, waiting for Paste. `at`: when, to tell it apart from the system clipboard. */
  clipboard: { op: 'cut' | 'copy'; items: Item[]; at: number } | null
  setClipboard(c: { op: 'cut' | 'copy'; items: Item[] } | null): void
  /** Change the library with Undo. The function gets the whole library and returns it changed. */
  changeLibrary(label: string, fn: (data: LibraryData) => LibraryData | (Lib & Partial<LibraryData>), toast?: string): void
  undoLibrary(): void
  redoLibrary(): void
  checkMissing(): Promise<void>
  /** Work out the SHA-256 of images that don't have one yet, a few at a time. */
  hashPending(): Promise<void>

  init(): Promise<void>
  go(view: View): void
  /** A short message; with `action`, it has a button (like Undo) and stays a little longer. */
  notify(text: string, action?: Toast['action']): void
  dismissToast(): void
  /** A library change without Undo (favorites, hashes). */
  setLibrary(fn: (l: LibraryData) => LibraryData): void
  setChallenges(fn: (c: Challenge[]) => Challenge[]): void
  setPresets(fn: (p: Preset[]) => Preset[]): void
  setSkills(fn: (s: Skill[]) => Skill[]): void
  /** Adds a skill, or returns the one that already has this name. Null for an empty name. */
  addSkill(name: string): Skill | null
  /** Removes a skill. What was tagged with it keeps everything else and shows as no skill. */
  deleteSkill(id: string): void
  updateSettings(patch: Partial<Settings>): void
  updateSession(id: string, fn: (s: SessionRecord) => SessionRecord): void
  updatePose(sessionId: string, index: number, patch: Partial<PoseResult>): void
  deleteSession(id: string): void
  setFloat(patch: Partial<FloatState>): void

  startRun(opts: {
    plan: SessionPlan
    slots: Slot[]
    challenge?: { challengeId: string; level: number }
    redoOf?: string
  }): void
  setEngine(engine: EngineState): void
  setCapture(index: number, path: string): void
  setMemory(memory: MemoryState): void
  /** Returns the new result's index. */
  addResult(result: PoseResult): number
  updateResult(index: number, patch: Partial<PoseResult>): void
  /** Save the session (unless almost nothing was drawn) and go to review or back. */
  finishRun(finished: boolean, opts?: { quiet?: boolean }): void

  startFree(opts: { skillId?: string; capture: boolean }): void
  toggleFree(): void
  /** End free drawing: save it (with the pictures kept from the end capture) and show it. */
  endFree(drawings?: string[]): void
}

export const uid = (): string => crypto.randomUUID()

let initStarted = false

export const useApp = create<State>((set, get) => ({
  loaded: false,
  view: { name: 'practice' },
  library: EMPTY_LIBRARY,
  sessions: [],
  challenges: [],
  presets: [],
  skills: [],
  settings: DEFAULT_SETTINGS,
  float: DEFAULT_FLOAT,
  hotkeyStatus: { clickThrough: true, float: true, pause: true, next: true },
  run: null,
  free: null,
  missing: [],
  update: { state: 'idle' },
  libraryUndo: [],
  libraryRedo: [],
  clipboard: null,
  toast: null,

  async init() {
    if (initStarted) return
    initStarted = true
    const api = window.api
    const [library, sessions, challenges, presets, skills, saved] = await Promise.all([
      api.load<LibraryData>('library'),
      api.load<SessionRecord[]>('sessions'),
      api.load<Challenge[]>('challenges'),
      api.load<Preset[]>('presets'),
      api.load<Skill[]>('skills'),
      api.load<Settings>('settings')
    ])
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      // First run on a large monitor (e.g. 2560 px at 100% Windows scaling):
      // start a little bigger so text isn't tiny. Ctrl +/- changes it.
      uiScale: window.screen.availWidth >= 2400 ? 1.2 : 1,
      ...saved,
      hotkeys: { ...DEFAULT_HOTKEYS, ...saved?.hotkeys },
      float: { ...DEFAULT_FLOAT, ...saved?.float, on: false, clickThrough: false }
    }
    let lib: LibraryData = {
      ...EMPTY_LIBRARY,
      ...library,
      folders: library?.folders ?? [],
      images: library?.images ?? [],
      assets: library?.assets ?? [],
      favoriteImages: library?.favoriteImages ?? []
    }
    // Stored images nothing needs any more go now, after a restart, so Undo
    // worked until then. Only when the library loaded, so a damaged library
    // file never deletes anything. (Every practiced reference also has its
    // own kept copy, so history never depends on these files.)
    if (library?.format === 4) {
      const tidy = tidyAssets(lib, sessions ?? [])
      lib = tidy.data
      void api.cleanStoredFiles(tidy.inUse)
    }
    // A free drawing session that was going when the app closed comes back, paused.
    const free = settings.freeRun ? freeRestore(settings.freeRun) : null
    set({
      library: lib,
      sessions: sessions ?? [],
      challenges: challenges ?? [],
      presets: presets ?? [],
      skills: skills ?? [],
      settings: free ? { ...settings, freeRun: free } : settings,
      float: settings.float,
      free,
      ...(free ? { view: { name: 'session' as const } } : {}),
      loaded: true
    })
    if (free) {
      void api.setSessionActive(true)
      get().notify('Your free drawing session is back, paused. Press Resume to go on.')
    }
    api.onFloatChanged((float) => {
      set({ float })
      const { on, clickThrough, ...keep } = float
      void on
      void clickThrough
      const prev = get().settings.float
      if (prev.alwaysOnTop !== keep.alwaysOnTop || prev.opacity !== keep.opacity || prev.locked !== keep.locked) {
        get().updateSettings({ float: { ...prev, ...keep } })
      }
    })
    api.onFlush(() => {
      // Closing in the middle of a session keeps what was drawn, as "stopped early".
      if (get().run) {
        stopRunClock()
        get().finishRun(false, { quiet: true })
      }
      const f = get().free
      if (f && !freePausedNow(f)) get().updateSettings({ freeRun: freeBeat(f, Date.now()) })
      void flushSaves().then(() => api.flushed())
    })
    api.onUpdateStatus((update) => set({ update }))
    set({ update: await api.updateStatus() })
    set({ hotkeyStatus: await api.setHotkeys(settings.hotkeys) })
    void get().checkMissing().then(() => get().hashPending())
    // A little after start, so the first screen isn't slowed down.
    if (settings.autoUpdate !== false) setTimeout(() => void api.checkUpdates(), 10_000)
  },

  async checkMissing() {
    const { assets, images } = get().library
    const used = new Set(images.map((i) => i.assetId))
    const list = assets.filter((a) => used.has(a.id))
    const gone = new Set(await window.api.missingFiles(list.map((a) => a.path)))
    set({ missing: list.filter((a) => gone.has(a.path)).map((a) => a.id) })
  },

  async hashPending() {
    if (hashing) return
    hashing = true
    try {
      for (;;) {
        // Never while drawing: the disk and the processor are yours then.
        if (get().run || get().free) return
        const { library, missing } = get()
        const gone = new Set(missing)
        const used = new Set(library.images.map((i) => i.assetId))
        const todo = library.assets.filter((a) => !a.sha256 && used.has(a.id) && !gone.has(a.id) && !failedHash.has(a.id)).slice(0, 16)
        if (!todo.length) return
        const hashes = await window.api.hashFiles(todo.map((a) => a.path))
        const found = new Map<string, string>()
        todo.forEach((a, i) => (hashes[i] ? found.set(a.id, hashes[i]!) : failedHash.add(a.id)))
        if (found.size) get().setLibrary((l) => ({ ...l, assets: l.assets.map((a) => (found.has(a.id) ? { ...a, sha256: found.get(a.id) } : a)) }))
        await new Promise((r) => setTimeout(r, 50))
      }
    } finally {
      hashing = false
    }
  },

  go(view) {
    set({ view })
  },

  notify(text, action) {
    const toast: Toast = { id: Date.now() + Math.random(), text, ...(action ? { action } : {}) }
    set({ toast })
    setTimeout(
      () => {
        if (get().toast?.id === toast.id) set({ toast: null })
      },
      action ? 7000 : 3200
    )
  },

  dismissToast() {
    set({ toast: null })
  },

  setClipboard(clipboard) {
    set({ clipboard: clipboard ? { ...clipboard, at: Date.now() } : null })
  },

  changeLibrary(label, fn, toast) {
    const { library, libraryUndo } = get()
    const out = fn(library)
    if (out.folders === library.folders && out.images === library.images && (out.assets ?? library.assets) === library.assets) return
    set({
      library: { ...library, ...out },
      libraryUndo: [...libraryUndo.slice(-29), { label, folders: library.folders, images: library.images }],
      libraryRedo: []
    })
    if (toast) get().notify(toast, { label: 'Undo', run: () => get().undoLibrary() })
  },

  undoLibrary() {
    const { libraryUndo, libraryRedo, library } = get()
    const last = libraryUndo[libraryUndo.length - 1]
    if (!last) return
    // Assets stay: an image the undo takes away may come back with Redo, and
    // ones nothing uses are tidied at the next start.
    set({
      library: { ...library, folders: last.folders, images: last.images },
      libraryUndo: libraryUndo.slice(0, -1),
      libraryRedo: [...libraryRedo, { label: last.label, folders: library.folders, images: library.images }]
    })
    get().notify(`Undone: ${last.label}.`)
  },

  redoLibrary() {
    const { libraryUndo, libraryRedo, library } = get()
    const next = libraryRedo[libraryRedo.length - 1]
    if (!next) return
    set({
      library: { ...library, folders: next.folders, images: next.images },
      libraryRedo: libraryRedo.slice(0, -1),
      libraryUndo: [...libraryUndo, { label: next.label, folders: library.folders, images: library.images }]
    })
    get().notify(`Redone: ${next.label}.`)
  },

  setLibrary(fn) {
    set({ library: fn(get().library) })
  },

  setChallenges(fn) {
    set({ challenges: fn(get().challenges) })
  },

  setPresets(fn) {
    set({ presets: fn(get().presets) })
  },

  setSkills(fn) {
    set({ skills: fn(get().skills) })
  },

  addSkill(raw) {
    const name = normalizeSkillName(raw)
    if (!name) return null
    const existing = findSkill(get().skills, name)
    if (existing) return existing
    const skill = { id: uid(), name }
    set({ skills: [...get().skills, skill] })
    return skill
  },

  deleteSkill(id) {
    const { sessions, presets, challenges, settings, skills } = get()
    set({ ...withoutSkill({ sessions, presets, challenges, settings }, id), skills: skills.filter((s) => s.id !== id) })
  },

  updateSettings(patch) {
    set({ settings: { ...get().settings, ...patch } })
  },

  updateSession(id, fn) {
    set({ sessions: get().sessions.map((s) => (s.id === id ? fn(s) : s)) })
  },

  updatePose(sessionId, index, patch) {
    get().updateSession(sessionId, (s) => ({
      ...s,
      poses: s.poses.map((p, i) => (i === index ? { ...p, ...patch } : p))
    }))
  },

  deleteSession(id) {
    const before = get().sessions
    const at = before.findIndex((s) => s.id === id)
    if (at < 0) return
    const removed = before[at]
    set({ sessions: before.filter((s) => s.id !== id) })
    get().notify('Session deleted.', {
      label: 'Undo',
      run: () => {
        const now = get().sessions
        if (now.some((s) => s.id === id)) return
        const sessions = now.slice()
        sessions.splice(Math.min(at, sessions.length), 0, removed)
        set({ sessions })
      }
    })
  },

  setFloat(patch) {
    // Shown at once; the main process answers with the state it applied.
    // Without this, two quick changes could send the first one's old values.
    const next = { ...get().float, ...patch }
    next.clickThrough = next.on && next.clickThrough
    set({ float: next })
    void window.api.setFloat(next)
  },

  startRun({ plan, slots, challenge, redoOf }) {
    const now = Date.now()
    const restSeconds = plan.rest.enabled ? plan.rest.seconds : 0
    const returnTo = get().view.name === 'session' ? { name: 'practice' as const } : get().view
    set({
      run: {
        id: uid(),
        plan,
        slots,
        engine: createEngine(plan.mode === 'memory' ? [] : slots, restSeconds, now),
        ...(plan.mode === 'memory' ? { memory: createMemory(slots, plan.memory, now) } : {}),
        results: [],
        startedAt: now,
        captures: slots.map(() => undefined),
        challenge,
        redoOf,
        returnTo
      },
      view: { name: 'session' }
    })
    void window.api.setSessionActive(true)
    // A fixed screen area would catch the app's own window; a chosen window can't.
    if (plan.capture && captureTargetOf(get().settings)?.kind === 'screen') void window.api.setCaptureProtection(true)
  },

  setEngine(engine) {
    const run = get().run
    if (run) set({ run: { ...run, engine } })
  },

  setCapture(index, path) {
    const run = get().run
    if (!run) return
    const captures = run.captures.slice()
    captures[index] = path
    set({ run: { ...run, captures } })
  },

  setMemory(memory) {
    const run = get().run
    if (run) set({ run: { ...run, memory } })
  },

  addResult(result) {
    const run = get().run
    if (!run) return -1
    set({ run: { ...run, results: [...run.results, result] } })
    return run.results.length
  },

  updateResult(index, patch) {
    const run = get().run
    if (!run) return
    set({ run: { ...run, results: run.results.map((r, i) => (i === index ? { ...r, ...patch } : r)) } })
  },

  finishRun(finished, opts = {}) {
    const run = get().run
    if (!run) return
    void window.api.setSessionActive(false)
    void window.api.setCaptureProtection(false)
    const drawn = run.memory ? run.results.reduce((a, r) => a + r.spentMs, 0) : activeMs(run.engine)
    if (drawn < 3000) {
      set({ run: null, view: run.returnTo })
      if (!opts.quiet) get().notify('Stopped before drawing anything, so nothing was saved.')
      return
    }
    const timed: PoseResult[] = run.slots.map((slot, i) => ({
      imageId: slot.imageId,
      imagePath: slot.imagePath,
      plannedSeconds: slot.seconds,
      spentMs: Math.round(run.engine.spent[i]),
      skipped: run.engine.skipped[i],
      capturePath: run.captures[i],
      mistakes: [],
      redo: false
    }))
    const poses = run.memory ? run.results : timed
    // Folder names now, so history can still find the session after renames.
    const { library } = get()
    const boardNames = planFolderIds(run.plan)
      .map((id) => library.folders.find((f) => f.id === id)?.name)
      .filter((n): n is string => !!n)
    const record: SessionRecord = {
      id: run.id,
      ...(boardNames.length ? { boardNames } : {}),
      startedAt: run.startedAt,
      endedAt: Date.now(),
      activeMs: Math.round(drawn),
      plan: run.plan,
      poses: poses.filter((p) => p.spentMs > 0),
      finished,
      reviewed: false,
      pagePhotos: [],
      ...(run.challenge ? { challenge: run.challenge } : {}),
      ...(run.redoOf ? { redoOf: run.redoOf } : {})
    }
    // Only a challenge level played to its end counts as done.
    let challenges = get().challenges
    if (run.challenge && finished) {
      const { challengeId, level } = run.challenge
      challenges = challenges.map((c) => (c.id === challengeId ? completeLevel(c, level) : c))
    }
    set({
      run: null,
      sessions: [...get().sessions, record],
      challenges,
      settings: run.challenge || run.redoOf ? get().settings : { ...get().settings, lastPlan: run.plan },
      view: run.plan.review && !opts.quiet ? { name: 'review', sessionId: record.id } : run.returnTo
    })
    // Keep a copy of each practiced reference so this session's history and
    // review still show it if the original is later moved or deleted.
    void keepReferences(record)
    void get().hashPending()
    if (opts.quiet) return
    if (run.challenge && finished) get().notify(`Level ${run.challenge.level + 1} done. The next level is open.`)
    else if (run.challenge) get().notify('Session saved. It was stopped early, so the level stays open until you finish it.')
    else if (!run.plan.review) get().notify(finished ? 'Session saved.' : 'Session saved. It was stopped early; the time you drew counts.')
  },

  startFree({ skillId, capture }) {
    const free = freeStart(uid(), Date.now(), { skillId, capture })
    set({ free, view: { name: 'session' }, settings: { ...get().settings, freeRun: free, freeCapture: capture } })
    void window.api.setSessionActive(true)
  },

  toggleFree() {
    const f = get().free
    if (!f) return
    const free = freeToggle(f, Date.now())
    set({ free, settings: { ...get().settings, freeRun: free } })
  },

  endFree(drawings = []) {
    const f = get().free
    if (!f) return
    const now = Date.now()
    const paused = freePause(f, now)
    void window.api.setSessionActive(false)
    const { freeRun, ...settings } = get().settings
    void freeRun
    if (paused.carriedMs < 3000) {
      set({ free: null, settings, view: { name: 'practice' } })
      get().notify('Stopped before drawing anything, so nothing was saved.')
      for (const d of drawings) void window.api.deleteSessionFile(d)
      return
    }
    const record = freeRecord(paused, now, { drawings })
    set({ free: null, settings, sessions: [...get().sessions, record], view: { name: 'review', sessionId: record.id } })
    get().notify(f.capture && !drawings.length ? 'Session saved, without a picture of the canvas.' : 'Session saved.')
    void get().hashPending()
  }
}))

/** What canvas captures take: the chosen window, else the older fixed screen area, else nothing. */
export function captureTargetOf(settings: Settings): CaptureTarget | null {
  if (settings.captureWindow) return { kind: 'window', window: settings.captureWindow }
  if (settings.captureRegion) return { kind: 'screen', region: settings.captureRegion }
  return null
}

/**
 * Capture the canvas now. A window found under a new source id (its app was
 * restarted) is remembered under it, so the next capture finds it at once.
 */
export async function captureNow(sessionId: string, index: number): Promise<CaptureResult> {
  const { settings, updateSettings } = useApp.getState()
  const target = captureTargetOf(settings)
  if (!target) return { error: 'No window is chosen for captures. Choose one in Settings or on Practice.' }
  const protect = target.kind === 'screen'
  if (protect) await window.api.setCaptureProtection(true)
  const r = await window.api.capture(target, sessionId, index).catch((err: Error) => ({ error: err.message }) as CaptureResult)
  if (protect && !useApp.getState().run) await window.api.setCaptureProtection(false)
  const w = useApp.getState().settings.captureWindow
  if (target.kind === 'window' && w && r.hint && (r.hint !== w.hint || (r.title && r.title !== w.title))) {
    updateSettings({ captureWindow: { ...w, hint: r.hint, ...(r.title ? { title: r.title } : {}) } })
  }
  return r
}

let hashing = false

/** Stop the running pose's clock, so the time drawn in it counts (the app is closing). */
function stopRunClock(): void {
  const { run, setEngine, setMemory, addResult } = useApp.getState()
  if (!run) return
  const now = Date.now()
  if (!run.memory) return setEngine(stop(run.engine, now).state)
  const step = memoryStop(run.memory, now)
  for (const ev of step.events) {
    if (ev.type !== 'drawEnd') continue
    const slot = run.memory.refs[ev.index]
    addResult({
      imageId: slot.imageId,
      imagePath: slot.imagePath,
      plannedSeconds: run.memory.drawSeconds,
      spentMs: Math.round(ev.drawMs),
      studyMs: Math.round(ev.studyMs),
      attempt: ev.attempt,
      skipped: false,
      mistakes: [],
      redo: false
    })
  }
  setMemory(step.state)
}
/** Files that couldn't be read for a hash this time; tried again after a restart. */
const failedHash = new Set<string>()

function freePausedNow(f: FreeRun): boolean {
  return f.runningSince === undefined
}

// A running free session is saved every 15 seconds, so a crash or restart loses little.
setInterval(() => {
  const { free, settings, updateSettings } = useApp.getState()
  if (free && !freePausedNow(free) && settings.freeRun) updateSettings({ freeRun: freeBeat(free, Date.now()) })
}, 15_000)

/** Pages that can show in float mode; every other page needs the normal window. */
const FLOAT_VIEWS: View['name'][] = ['session', 'viewer']

// Leaving a float page (Esc, end of session, navigation) turns float mode off,
// which also clears click-through, lock and opacity on the window.
useApp.subscribe((state, prev) => {
  if (state.view !== prev.view && state.float.on && !FLOAT_VIEWS.includes(state.view.name)) {
    state.setFloat({ on: false, clickThrough: false })
  }
})

async function keepReferences(record: SessionRecord): Promise<void> {
  const kept = new Map<string, string>()
  for (const p of record.poses) {
    if (kept.has(p.imageId)) continue
    const path = await window.api.keepReference(p.imageId, p.imagePath)
    if (path) kept.set(p.imageId, path)
  }
  if (!kept.size) return
  useApp.getState().updateSession(record.id, (s) => ({
    ...s,
    poses: s.poses.map((p) => (kept.has(p.imageId) ? { ...p, keptPath: kept.get(p.imageId) } : p))
  }))
}

/** The images of a pool whose file can still be found (missing ones are skipped in sessions). */
export function availablePool(state: Pick<State, 'missing'>, pool: ImageRef[]): ImageRef[] {
  if (!state.missing.length) return pool
  const gone = new Set(state.missing)
  return pool.filter((i) => !gone.has(i.id))
}

// Save each part shortly after it changes.
const timers = new Map<StoreName, ReturnType<typeof setTimeout>>()
const waiting = new Map<StoreName, unknown>()
function persist(name: StoreName, data: unknown): void {
  clearTimeout(timers.get(name))
  waiting.set(name, data)
  timers.set(
    name,
    setTimeout(() => {
      timers.delete(name)
      waiting.delete(name)
      void window.api.save(name, data)
    }, 250)
  )
}

/** Save everything that is still waiting, now (before the app closes or updates). */
export async function flushSaves(): Promise<void> {
  const jobs: Promise<void>[] = []
  for (const [name, data] of waiting) {
    clearTimeout(timers.get(name))
    timers.delete(name)
    jobs.push(window.api.save(name, data))
  }
  waiting.clear()
  await Promise.allSettled(jobs)
}

useApp.subscribe((state, prev) => {
  if (!state.loaded || !prev.loaded) return
  if (state.library !== prev.library) persist('library', state.library)
  if (state.sessions !== prev.sessions) persist('sessions', state.sessions)
  if (state.challenges !== prev.challenges) persist('challenges', state.challenges)
  if (state.presets !== prev.presets) persist('presets', state.presets)
  if (state.skills !== prev.skills) persist('skills', state.skills)
  if (state.settings !== prev.settings) persist('settings', state.settings)
})

export function initialPlan(settings: Settings): SessionPlan {
  return { ...DEFAULT_PLAN, ...settings.lastPlan }
}

let lastCaptureError = ''
/** A capture during a session failed: say why once, without stopping the session. */
export function captureFailed(error = 'The canvas could not be captured.'): void {
  if (error === lastCaptureError && useApp.getState().toast?.text.includes(error)) return
  lastCaptureError = error
  useApp.getState().notify(`Canvas capture: ${error} The session goes on; you can add a photo in review.`)
}
