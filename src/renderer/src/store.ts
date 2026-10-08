import { create } from 'zustand'
import {
  DEFAULT_FLOAT,
  DEFAULT_HOTKEYS,
  DEFAULT_PLAN,
  DEFAULT_SETTINGS,
  type Board,
  type Challenge,
  type FloatState,
  type HotkeyAction,
  type PoseResult,
  type Preset,
  type SessionPlan,
  type SessionRecord,
  type Settings,
  type StoreName
} from '@shared/types'
import { completeLevel } from './lib/challenges'
import { createMemory, type MemoryState } from './lib/memoryEngine'
import { activeMs, createEngine, type EngineState, type Slot } from './lib/sessionEngine'

export type View =
  | { name: 'practice' }
  | { name: 'library'; boardId?: string }
  | { name: 'viewer'; boardId: string; index: number }
  | { name: 'challenges'; challengeId?: string }
  | { name: 'stats' }
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
}

interface State {
  loaded: boolean
  view: View
  boards: Board[]
  sessions: SessionRecord[]
  challenges: Challenge[]
  presets: Preset[]
  settings: Settings
  float: FloatState
  hotkeyStatus: Record<HotkeyAction, boolean>
  run: Run | null
  toast: Toast | null

  init(): Promise<void>
  go(view: View): void
  notify(text: string): void
  setBoards(fn: (b: Board[]) => Board[]): void
  updateBoard(id: string, patch: Partial<Board>): void
  setChallenges(fn: (c: Challenge[]) => Challenge[]): void
  setPresets(fn: (p: Preset[]) => Preset[]): void
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
  sessions: [],
  challenges: [],
  presets: [],
  settings: DEFAULT_SETTINGS,
  float: DEFAULT_FLOAT,
  hotkeyStatus: { clickThrough: true, float: true, pause: true, next: true },
  run: null,
  toast: null,

  async init() {
    if (initStarted) return
    initStarted = true
    const api = window.api
    const [boards, sessions, challenges, presets, saved] = await Promise.all([
      api.load<Board[]>('boards'),
      api.load<SessionRecord[]>('sessions'),
      api.load<Challenge[]>('challenges'),
      api.load<Preset[]>('presets'),
      api.load<Settings>('settings')
    ])
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      ...saved,
      hotkeys: { ...DEFAULT_HOTKEYS, ...saved?.hotkeys },
      float: { ...DEFAULT_FLOAT, ...saved?.float, on: false, clickThrough: false }
    }
    set({
      boards: boards ?? [],
      sessions: sessions ?? [],
      challenges: challenges ?? [],
      presets: presets ?? [],
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
    set({ hotkeyStatus: await api.setHotkeys(settings.hotkeys) })
  },

  go(view) {
    set({ view })
  },

  notify(text) {
    const toast = { id: Date.now(), text }
    set({ toast })
    setTimeout(() => {
      if (get().toast?.id === toast.id) set({ toast: null })
    }, 3200)
  },

  setBoards(fn) {
    set({ boards: fn(get().boards) })
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
    set({ sessions: get().sessions.filter((s) => s.id !== id) })
  },

  setFloat(patch) {
    void window.api.setFloat({ ...get().float, ...patch })
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
    const record: SessionRecord = {
      id: run.id,
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

// Save each collection shortly after it changes.
const timers = new Map<StoreName, ReturnType<typeof setTimeout>>()
function persist(name: StoreName, data: unknown): void {
  clearTimeout(timers.get(name))
  timers.set(
    name,
    setTimeout(() => void window.api.save(name, data), 250)
  )
}

useApp.subscribe((state, prev) => {
  if (!state.loaded || !prev.loaded) return
  if (state.boards !== prev.boards) persist('boards', state.boards)
  if (state.sessions !== prev.sessions) persist('sessions', state.sessions)
  if (state.challenges !== prev.challenges) persist('challenges', state.challenges)
  if (state.presets !== prev.presets) persist('presets', state.presets)
  if (state.settings !== prev.settings) persist('settings', state.settings)
})

export function initialPlan(settings: Settings): SessionPlan {
  return { ...DEFAULT_PLAN, ...settings.lastPlan }
}
