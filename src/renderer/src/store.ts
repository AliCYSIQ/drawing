import { create } from 'zustand'
import {
  DEFAULT_FLOAT,
  DEFAULT_HOTKEYS,
  DEFAULT_PLAN,
  DEFAULT_SETTINGS,
  EMPTY_LIBRARY,
  type Board,
  type Challenge,
  type FloatState,
  type HotkeyAction,
  type ImageRef,
  type LibraryMeta,
  type PoseResult,
  type Preset,
  type SessionPlan,
  type SessionRecord,
  type Settings,
  type Skill,
  type StoreName,
  type UpdateStatus
} from '@shared/types'
import { completeLevel } from './lib/challenges'
import { resolveBoardIds, type Item, type Lib } from './lib/library'
import { createMemory, type MemoryState } from './lib/memoryEngine'
import { findSkill, normalizeSkillName, withoutSkill } from './lib/skills'
import { activeMs, createEngine, type EngineState, type Slot } from './lib/sessionEngine'

export type View =
  | { name: 'practice' }
  | { name: 'library'; boardId?: string; folderId?: string }
  | { name: 'viewer'; boardId: string; index: number }
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

interface State {
  loaded: boolean
  view: View
  boards: Board[]
  /** Folders and favorite images. */
  library: LibraryMeta
  sessions: SessionRecord[]
  challenges: Challenge[]
  presets: Preset[]
  /** Your skill list; sessions, presets and challenges can count toward one. */
  skills: Skill[]
  settings: Settings
  float: FloatState
  hotkeyStatus: Record<HotkeyAction, boolean>
  run: Run | null
  toast: Toast | null
  /** Image ids per collection whose file can't be found (checked, not saved). */
  missing: Record<string, string[]>
  update: UpdateStatus
  /** Library changes that Ctrl+Z (or a toast's Undo) can take back, newest last. */
  libraryUndo: { label: string; boards: Board[]; folders: LibraryMeta['folders'] }[]
  /** Cut or copied library items, waiting for Paste. */
  clipboard: { op: 'cut' | 'copy'; items: Item[] } | null
  setClipboard(c: State['clipboard']): void
  /**
   * Change collections and folders together, with Undo. `deletedBoards`:
   * collections whose stored image files go at the next start.
   */
  changeLibrary(label: string, fn: (lib: Lib) => Lib & { deletedBoards?: string[] }, toast?: string): void
  undoLibrary(): void
  checkMissing(): Promise<void>

  init(): Promise<void>
  go(view: View): void
  /** A short message; with `action`, it has a button (like Undo) and stays a little longer. */
  notify(text: string, action?: Toast['action']): void
  dismissToast(): void
  setBoards(fn: (b: Board[]) => Board[]): void
  setLibrary(fn: (l: LibraryMeta) => LibraryMeta): void
  updateBoard(id: string, patch: Partial<Board>): void
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
  finishRun(finished: boolean): void
}

export const uid = (): string => crypto.randomUUID()

let initStarted = false

export const useApp = create<State>((set, get) => ({
  loaded: false,
  view: { name: 'practice' },
  boards: [],
  library: EMPTY_LIBRARY,
  sessions: [],
  challenges: [],
  presets: [],
  skills: [],
  settings: DEFAULT_SETTINGS,
  float: DEFAULT_FLOAT,
  hotkeyStatus: { clickThrough: true, float: true, pause: true, next: true },
  run: null,
  missing: {},
  update: { state: 'idle' },
  libraryUndo: [],
  clipboard: null,
  toast: null,

  async init() {
    if (initStarted) return
    initStarted = true
    const api = window.api
    const [boards, library, sessions, challenges, presets, skills, saved] = await Promise.all([
      api.load<Board[]>('boards'),
      api.load<LibraryMeta>('library'),
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
    set({
      boards: (boards ?? []).map((b) => ({ ...b, tags: b.tags ?? [] })),
      library: { ...EMPTY_LIBRARY, ...library },
      sessions: sessions ?? [],
      challenges: challenges ?? [],
      presets: presets ?? [],
      skills: skills ?? [],
      settings,
      float: settings.float,
      loaded: true
    })
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
    // Stored images of collections deleted last time (kept until now so Undo
    // worked). Copies share files, so only files no collection uses go. Only
    // when the collections list loaded, so a damaged file never deletes anything.
    if (boards && library?.pendingDelete?.length) {
      void api.cleanStoredFiles(
        boards.map((b) => b.id),
        boards.flatMap((b) => b.images.map((i) => i.path))
      )
      set({ library: { ...get().library, pendingDelete: [] } })
    }
    api.onFlush(() => void flushSaves().then(() => api.flushed()))
    api.onUpdateStatus((update) => set({ update }))
    set({ update: await api.updateStatus() })
    set({ hotkeyStatus: await api.setHotkeys(settings.hotkeys) })
    void get().checkMissing()
    // A little after start, so the first screen isn't slowed down.
    if (settings.autoUpdate !== false) setTimeout(() => void api.checkUpdates(), 10_000)
  },

  async checkMissing() {
    const boards = get().boards
    const gone = new Set(await window.api.missingFiles(boards.flatMap((b) => b.images.map((i) => i.path))))
    const missing: Record<string, string[]> = {}
    for (const b of boards) {
      const ids = b.images.filter((i) => gone.has(i.path)).map((i) => i.id)
      if (ids.length) missing[b.id] = ids
    }
    set({ missing })
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
    set({ clipboard })
  },

  changeLibrary(label, fn, toast) {
    const { boards, library, libraryUndo } = get()
    const out = fn({ boards, folders: library.folders })
    if (out.boards === boards && out.folders === library.folders) return
    const gone = out.deletedBoards ?? []
    set({
      boards: out.boards,
      library: {
        ...library,
        folders: out.folders,
        ...(gone.length ? { pendingDelete: [...new Set([...(library.pendingDelete ?? []), ...gone])] } : {})
      },
      libraryUndo: [...libraryUndo.slice(-19), { label, boards, folders: library.folders }]
    })
    if (toast) get().notify(toast, { label: 'Undo', run: () => get().undoLibrary() })
  },

  undoLibrary() {
    const { libraryUndo, boards, library } = get()
    const last = libraryUndo[libraryUndo.length - 1]
    if (!last) return
    // Collections the undo removes (copies) have their stored files cleaned up later.
    const kept = new Set(last.boards.map((b) => b.id))
    const dropped = boards.filter((b) => !kept.has(b.id)).map((b) => b.id)
    set({
      boards: last.boards,
      library: {
        ...library,
        folders: last.folders,
        ...(dropped.length ? { pendingDelete: [...new Set([...(library.pendingDelete ?? []), ...dropped])] } : {})
      },
      libraryUndo: libraryUndo.slice(0, -1)
    })
    get().notify(`Undone: ${last.label}.`)
  },

  setBoards(fn) {
    set({ boards: fn(get().boards) })
  },

  setLibrary(fn) {
    set({ library: fn(get().library) })
  },

  updateBoard(id, patch) {
    set({ boards: get().boards.map((b) => (b.id === id ? { ...b, ...patch } : b)) })
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
    if (plan.capture) void window.api.setCaptureProtection(true)
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

  finishRun(finished) {
    const run = get().run
    if (!run) return
    void window.api.setSessionActive(false)
    void window.api.setCaptureProtection(false)
    const drawn = run.memory ? run.results.reduce((a, r) => a + r.spentMs, 0) : activeMs(run.engine)
    if (drawn < 3000) {
      set({ run: null, view: run.returnTo })
      get().notify('Stopped before drawing anything, so nothing was saved.')
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
    // Collection names now, so history can still find the session after renames.
    const { boards, library } = get()
    const boardNames = resolveBoardIds({ boards, folders: library.folders }, run.plan.boardIds, run.plan.folderIds)
      .map((id) => boards.find((b) => b.id === id)?.name)
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
      view: run.plan.review ? { name: 'review', sessionId: record.id } : run.returnTo
    })
    // Keep a copy of each practiced reference so this session's history and
    // review still show it if the original is later moved or deleted.
    void keepReferences(record)
    if (run.challenge && finished) get().notify(`Level ${run.challenge.level + 1} done. The next level is open.`)
    else if (!run.plan.review) get().notify('Session saved.')
  }
}))

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

/** All images of these collections that can still be found (missing ones are skipped in sessions). */
export function availablePool(state: Pick<State, 'boards' | 'missing'>, pool: ImageRef[]): ImageRef[] {
  const gone = new Set(Object.values(state.missing).flat())
  return gone.size ? pool.filter((i) => !gone.has(i.id)) : pool
}

// Save each collection shortly after it changes.
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
  if (state.boards !== prev.boards) persist('boards', state.boards)
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
