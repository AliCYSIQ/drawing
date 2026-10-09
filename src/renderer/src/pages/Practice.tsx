import { useMemo, useState } from 'react'
import { DEFAULT_PLAN, type Block, type SessionMode, type SessionPlan } from '@shared/types'
import { BoardPicker } from '../components/BoardPicker'
import { Plus, Trash } from '../components/Icons'
import { Button, Field, IconButton, NumberField, Segmented, Toggle } from '../components/ui'
import {
  describeBlocks,
  estimateMemorySeconds,
  estimateSeconds,
  formatDuration,
  planBlocks,
  poolFromBoards,
  recentlySeen,
  slotsForPlan
} from '../lib/schedule'
import { currentStreak, dayKey, minutesByDay, recentMistakes } from '../lib/stats'
import { availablePool, initialPlan, uid, useApp } from '../store'

const TIMES = [30, 60, 120, 300, 600]

export function Practice() {
  const boards = useApp((s) => s.boards)
  const sessions = useApp((s) => s.sessions)
  const settings = useApp((s) => s.settings)
  const presets = useApp((s) => s.presets)
  const setPresets = useApp((s) => s.setPresets)
  const updateSettings = useApp((s) => s.updateSettings)
  const startRun = useApp((s) => s.startRun)
  const notify = useApp((s) => s.notify)

  const [plan, setPlanState] = useState<SessionPlan>(() => {
    const p = initialPlan(settings)
    const known = p.boardIds.filter((id) => boards.some((b) => b.id === id))
    return { ...p, boardIds: known.length ? known : boards.slice(0, 1).map((b) => b.id) }
  })
  const [presetName, setPresetName] = useState<string | null>(null)
  const setPlan = (patch: Partial<SessionPlan>) => setPlanState((p) => ({ ...p, ...patch }))

  const missing = useApp((s) => s.missing)
  const favoriteImages = useApp((s) => s.library.favoriteImages)
  const allImages = useMemo(() => poolFromBoards(boards, plan.boardIds), [boards, plan.boardIds])
  // Images whose file is gone are skipped.
  const available = useMemo(() => availablePool({ boards, missing }, allImages), [boards, missing, allImages])
  const skipped = allImages.length - available.length
  const favoritesHere = useMemo(() => {
    const fav = new Set(favoriteImages)
    return available.filter((i) => fav.has(i.id))
  }, [available, favoriteImages])
  const pool = plan.favoritesOnly ? favoritesHere : available
  const blocks = planBlocks(plan, pool.length)
  const poses = blocks.reduce((a, b) => a + b.count, 0)
  const seconds = estimateSeconds(
    blocks,
    plan.rest.enabled ? plan.rest.seconds : 0,
    plan.mode === 'class' ? (plan.blockRest ?? 0) : 0
  )
  const mistakes = useMemo(() => recentMistakes(sessions).slice(0, 2), [sessions])
  const byDay = useMemo(() => minutesByDay(sessions), [sessions])
  const today = Math.round(byDay.get(dayKey(Date.now())) ?? 0)
  const streak = currentStreak(byDay, new Date())
  const needsRegion = plan.capture && !settings.captureRegion

  const start = () => {
    const slots = slotsForPlan(plan, pool, Math.random, recentlySeen(sessions, Date.now()))
    if (!slots.length) return
    startRun({ plan, slots })
  }

  const pickRegion = async () => {
    const region = await window.api.pickRegion()
    if (region) {
      updateSettings({ captureRegion: region })
      notify('Canvas area saved.')
    }
  }

  return (
    <div className="page-form grid grid-cols-[minmax(0,1fr)_clamp(300px,24vw,380px)] gap-10">
      <section aria-label="Session setup" className="min-w-0">
        <h1 className="pb-4 text-[22px] font-semibold tracking-[-0.01em]">What do you want to draw?</h1>
        <BoardPicker value={plan.boardIds} onChange={(boardIds) => setPlan({ boardIds })} />

        <div className="mt-6 divide-y divide-line border-t border-line">
          <Field label="Mode" hint={modeHint(plan.mode)}>
            <Segmented<SessionMode>
              label="Mode"
              value={plan.mode}
              onChange={(mode) => setPlan({ mode })}
              options={[
                { value: 'classic', label: 'Classic' },
                { value: 'class', label: 'Class' },
                { value: 'relaxed', label: 'Relaxed' },
                { value: 'memory', label: 'Memory' }
              ]}
            />
          </Field>

          {plan.mode === 'memory' && (
            <Field
              label="Memory loop"
              hint="Study the reference, then it hides and you draw it from memory. Reveal it, mark what is off, and draw it again while the fixes are fresh."
            >
              <div className="grid gap-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-28 text-muted">Study for</span>
                  <NumberField label="Study seconds" value={plan.memory.studySeconds} min={5} max={1800} suffix="s" onChange={(studySeconds) => setPlan({ memory: { ...plan.memory, studySeconds } })} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-28 text-muted">Draw for</span>
                  <NumberField label="Drawing seconds" value={plan.memory.drawSeconds} min={0} max={3600} suffix="s" onChange={(drawSeconds) => setPlan({ memory: { ...plan.memory, drawSeconds } })} />
                  <span className="text-[12.5px] text-muted">0 = until you press Reveal</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-28 text-muted">Attempts</span>
                  <NumberField label="Attempts per reference" value={plan.memory.attempts} min={1} max={10} onChange={(attempts) => setPlan({ memory: { ...plan.memory, attempts } })} />
                  <span className="text-[12.5px] text-muted">per reference</span>
                </div>
              </div>
            </Field>
          )}

          {plan.mode === 'classic' && (
            <Field label="Time per pose">
              <div className="flex flex-wrap items-center gap-2">
                {TIMES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={plan.seconds === t}
                    onClick={() => setPlan({ seconds: t })}
                    className={`tnum h-9 min-w-12 rounded-md px-3 text-[13px] ring-1 transition-colors ${
                      plan.seconds === t ? 'bg-blue-soft text-blue ring-blue' : 'bg-surface text-ink ring-line hover:ring-muted'
                    }`}
                  >
                    {t < 60 ? `${t}s` : `${t / 60}m`}
                  </button>
                ))}
                <NumberField label="Custom seconds" value={plan.seconds} min={2} max={3600} suffix="s" onChange={(seconds) => setPlan({ seconds })} />
              </div>
            </Field>
          )}

          {plan.mode === 'class' && (
            <Field label="Blocks" hint="Poses get longer as the session goes on, like a life-drawing class.">
              <BlocksEditor blocks={plan.blocks} onChange={(b) => setPlan({ blocks: b })} />
              <div className="mt-3 flex flex-wrap items-center gap-2 text-muted">
                Break between blocks
                <NumberField
                  label="Break between blocks, seconds"
                  value={plan.blockRest ?? 0}
                  min={0}
                  max={1800}
                  suffix="s"
                  onChange={(blockRest) => setPlan({ blockRest })}
                />
                <span className="text-[12.5px]">0 = none. A longer pause before the poses get longer.</span>
              </div>
            </Field>
          )}

          {plan.mode !== 'class' && (
            <Field
              label={plan.mode === 'memory' ? 'References' : 'Poses'}
              hint={plan.count === 0 ? `Every image once (${pool.length}).` : '0 uses every image once.'}
            >
              <NumberField
                label={plan.mode === 'memory' ? 'Number of references' : 'Number of poses'}
                value={plan.count}
                min={0}
                max={500}
                onChange={(count) => setPlan({ count })}
              />
            </Field>
          )}

          <Field label="Options">
            <div className="grid gap-3.5">
              <Toggle checked={plan.shuffle} onChange={(shuffle) => setPlan({ shuffle })} label="Shuffle" />
              <Toggle
                checked={plan.freshFirst !== false}
                onChange={(freshFirst) => setPlan({ freshFirst })}
                label="Fresh images first"
                hint="Images you drew in the last 7 days come after ones you haven’t."
              />
              <Toggle
                checked={!!plan.favoritesOnly}
                onChange={(favoritesOnly) => setPlan({ favoritesOnly })}
                label="Favorites only"
                hint={
                  favoritesHere.length
                    ? `${favoritesHere.length} favorite ${favoritesHere.length === 1 ? 'image' : 'images'} in these boards.`
                    : 'No favorites in these boards yet: star images in the Library.'
                }
              />
              <div className={`flex flex-wrap items-center gap-3 ${plan.mode === 'memory' ? 'hidden' : ''}`}>
                <Toggle
                  checked={plan.rest.enabled}
                  onChange={(enabled) => setPlan({ rest: { ...plan.rest, enabled } })}
                  label="Rest between pictures"
                />
                {plan.rest.enabled && (
                  <RestField seconds={plan.rest.seconds} onChange={(s) => setPlan({ rest: { ...plan.rest, seconds: s } })} />
                )}
              </div>
              <Toggle
                checked={plan.review}
                onChange={(review) => setPlan({ review })}
                label="Review afterwards"
                hint="See every reference again and note what went wrong."
              />
              <Toggle
                checked={plan.capture}
                onChange={(capture) => setPlan({ capture })}
                label="Capture my Clip Studio canvas"
                hint={
                  settings.captureRegion ? (
                    <>
                      Grabs the canvas area at the end of each pose.{' '}
                      <button type="button" className="text-blue hover:underline" onClick={pickRegion}>
                        Change area
                      </button>
                    </>
                  ) : (
                    'Grabs the canvas area at the end of each pose, for review.'
                  )
                }
              />
              {needsRegion && (
                <div>
                  <Button onClick={pickRegion}>Pick canvas area</Button>
                </div>
              )}
            </div>
          </Field>

          <Field label="Presets">
            <div className="flex flex-wrap items-center gap-2">
              {presets.map((p) => (
                <span key={p.id} className="inline-flex items-center rounded-md bg-surface ring-1 ring-line">
                  <button
                    type="button"
                    className="h-8 pl-3 pr-1.5 text-[13px] text-ink hover:text-blue"
                    onClick={() => {
                      const known = p.plan.boardIds.filter((id) => boards.some((b) => b.id === id))
                      setPlanState({ ...DEFAULT_PLAN, ...p.plan, boardIds: known })
                    }}
                  >
                    {p.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete preset ${p.name}`}
                    className="h-8 px-1.5 text-muted hover:text-red"
                    onClick={() => setPresets((list) => list.filter((x) => x.id !== p.id))}
                  >
                    <Trash size={14} />
                  </button>
                </span>
              ))}
              {presetName === null ? (
                <Button tone="ghost" onClick={() => setPresetName('')}>
                  <Plus size={15} /> Save as preset
                </Button>
              ) : (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!presetName.trim()) return
                    setPresets((list) => [...list, { id: uid(), name: presetName.trim(), plan }])
                    setPresetName(null)
                  }}
                >
                  <input
                    autoFocus
                    value={presetName}
                    placeholder="Preset name"
                    onChange={(e) => setPresetName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && setPresetName(null)}
                    className="h-9 w-40 rounded-md bg-surface px-2.5 text-ink outline-none ring-1 ring-line focus:ring-blue"
                  />
                  <Button type="submit">Save</Button>
                </form>
              )}
            </div>
          </Field>
        </div>
      </section>

      <aside aria-label="Summary" className="sticky top-8 self-start">
        <div className="rounded-lg bg-surface p-5 ring-1 ring-line">
          <div className="tnum text-[34px] font-semibold leading-none tracking-[-0.02em]">
            {poses} {plan.mode === 'memory' ? (poses === 1 ? 'reference' : 'references') : poses === 1 ? 'pose' : 'poses'}
          </div>
          <div className="mt-2 text-muted">
            {plan.mode === 'relaxed'
              ? 'No timer'
              : plan.mode === 'memory'
                ? `Up to ${plan.memory.attempts} ${plan.memory.attempts === 1 ? 'attempt' : 'attempts'} each${
                    plan.memory.drawSeconds ? `, up to ${formatDuration(estimateMemorySeconds(poses, plan.memory))}` : ''
                  }`
                : `${describeBlocks(blocks)}, about ${formatDuration(seconds)}`}
          </div>
          <Button tone="primary" className="mt-5 h-11 w-full text-[14px]" disabled={!pool.length || needsRegion} onClick={start}>
            Start drawing
          </Button>
          {!pool.length && <p className="mt-2.5 text-[12.5px] text-muted">Pick at least one board with images.</p>}
          {skipped > 0 && (
            <p className="mt-2.5 text-[12.5px] text-muted">
              {skipped} {skipped === 1 ? 'image is' : 'images are'} missing on disk and will be skipped.
            </p>
          )}
          {needsRegion && <p className="mt-2.5 text-[12.5px] text-muted">Pick the canvas area first, or turn capture off.</p>}
        </div>

        {mistakes.length > 0 && (
          <div className="mt-4 rounded-lg p-5 ring-1 ring-line">
            <div className="text-muted">Watch for, from your last reviews</div>
            <ul className="mt-2 grid gap-1">
              {mistakes.map((m) => (
                <li key={m.mistake} className="flex justify-between text-ink">
                  <span className="first-letter:uppercase">{m.mistake}</span>
                  <span className="tnum text-muted">{m.count}×</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-3 px-1">
          <div>
            <dt className="text-[12.5px] text-muted">Today</dt>
            <dd className="tnum text-[17px] font-semibold">{today} min</dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-muted">Streak</dt>
            <dd className="tnum text-[17px] font-semibold">
              {streak} {streak === 1 ? 'day' : 'days'}
            </dd>
          </div>
        </dl>
      </aside>
    </div>
  )
}

function modeHint(mode: SessionMode): string {
  if (mode === 'classic') return 'The same time for every pose.'
  if (mode === 'class') return 'Short poses first, longer ones later.'
  if (mode === 'memory') return 'Draw from memory instead of copying. Fewer references, studied deeply.'
  return 'No timer. Press next when you are done.'
}

export function BlocksEditor({ blocks, onChange }: { blocks: Block[]; onChange: (b: Block[]) => void }) {
  const update = (i: number, patch: Partial<Block>) => onChange(blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)))
  return (
    <div className="grid gap-2">
      {blocks.map((b, i) => (
        <div key={i} className="flex items-center gap-2">
          <NumberField label={`Block ${i + 1} poses`} value={b.count} min={1} max={200} suffix="poses" onChange={(count) => update(i, { count })} />
          <span className="text-muted">at</span>
          <NumberField label={`Block ${i + 1} seconds`} value={b.seconds} min={2} max={3600} suffix="s" onChange={(seconds) => update(i, { seconds })} />
          <IconButton label={`Remove block ${i + 1}`} disabled={blocks.length === 1} onClick={() => onChange(blocks.filter((_, j) => j !== i))}>
            <Trash size={15} />
          </IconButton>
        </div>
      ))}
      <div>
        <Button
          tone="ghost"
          onClick={() => {
            const last = blocks[blocks.length - 1] ?? { count: 5, seconds: 60 }
            onChange([...blocks, { count: Math.max(1, Math.ceil(last.count / 2)), seconds: last.seconds * 2 }])
          }}
        >
          <Plus size={15} /> Add block
        </Button>
      </div>
    </div>
  )
}

function RestField({ seconds, onChange }: { seconds: number; onChange: (s: number) => void }) {
  const [unit, setUnit] = useState<'s' | 'min'>(seconds >= 60 && seconds % 60 === 0 ? 'min' : 's')
  const shown = unit === 'min' ? Math.round(seconds / 60) : seconds
  return (
    <span className="inline-flex items-center gap-2">
      <NumberField
        label="Rest length"
        value={shown}
        min={1}
        max={unit === 'min' ? 30 : 600}
        onChange={(v) => onChange(unit === 'min' ? v * 60 : v)}
      />
      <Segmented<'s' | 'min'>
        label="Rest unit"
        value={unit}
        onChange={(u) => {
          setUnit(u)
          onChange(u === 'min' ? Math.max(1, Math.round(seconds / 60)) * 60 : seconds)
        }}
        options={[
          { value: 's', label: 'seconds' },
          { value: 'min', label: 'minutes' }
        ]}
      />
    </span>
  )
}
