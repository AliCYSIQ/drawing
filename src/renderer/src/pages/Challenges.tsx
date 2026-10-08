import { useMemo, useState } from 'react'
import { thumbUrl } from '@shared/api'
import { DEFAULT_PLAN, type Challenge, type LadderKind, type Level } from '@shared/types'
import { BoardPicker } from '../components/BoardPicker'
import { ArrowLeft, Check, Lock, Plus, Trash } from '../components/Icons'
import { Button, Empty, Field, IconButton, NumberField, PageHeader } from '../components/ui'
import { currentLevel, isUnlocked, LADDERS, makeLadder, newLevel } from '../lib/challenges'
import { describeBlocks, estimateSeconds, formatDuration, poolFromBoards, slotsForLevel } from '../lib/schedule'
import { uid, useApp } from '../store'
import { BlocksEditor } from './Practice'

export function Challenges({ challengeId }: { challengeId?: string }) {
  const challenge = useApp((s) => s.challenges.find((c) => c.id === challengeId))
  return challenge ? <ChallengeView challenge={challenge} /> : <ChallengeList />
}

function ChallengeList() {
  const challenges = useApp((s) => s.challenges)
  const boards = useApp((s) => s.boards)
  const setChallenges = useApp((s) => s.setChallenges)
  const go = useApp((s) => s.go)
  const [making, setMaking] = useState<LadderKind | 'custom' | null>(null)
  const [boardIds, setBoardIds] = useState<string[]>(() => boards.slice(0, 1).map((b) => b.id))

  const create = () => {
    if (!making || !boardIds.length) return
    const id = uid()
    const ch: Challenge =
      making === 'custom'
        ? { id, name: 'My challenge', kind: 'custom', boardIds, levels: [newLevel(1)], completed: [], createdAt: Date.now() }
        : makeLadder(id, making, boardIds, Date.now())
    setChallenges((list) => [...list, ch])
    setMaking(null)
    go({ name: 'challenges', challengeId: id })
  }

  return (
    <div className="mx-auto max-w-[1180px] px-8 py-8">
      <PageHeader title="Challenges" />
      <p className="-mt-3 max-w-2xl pb-6 text-muted">
        A challenge is a path of levels. Each level is a short session with a focus, and finishing it opens the next one.
      </p>

      <h2 className="pb-3 text-[15px] font-semibold">Start a new one</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        {(Object.keys(LADDERS) as LadderKind[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={making === k}
            onClick={() => setMaking(k)}
            className={`rounded-lg p-4 text-left ring-1 transition-colors ${making === k ? 'bg-blue-soft ring-blue' : 'bg-surface ring-line hover:ring-muted'}`}
          >
            <div className="font-semibold">{LADDERS[k].name}</div>
            <div className="mt-1 text-[13px] text-muted">{LADDERS[k].about}</div>
          </button>
        ))}
        <button
          type="button"
          aria-pressed={making === 'custom'}
          onClick={() => setMaking('custom')}
          className={`rounded-lg p-4 text-left ring-1 transition-colors ${making === 'custom' ? 'bg-blue-soft ring-blue' : 'ring-line hover:ring-muted'}`}
        >
          <div className="font-semibold">Build your own</div>
          <div className="mt-1 text-[13px] text-muted">Set each level's poses, time and focus yourself.</div>
        </button>
      </div>

      {making && (
        <div className="mt-4 rounded-lg bg-surface p-4 ring-1 ring-line">
          <div className="pb-3 font-semibold">Which boards should it use?</div>
          <BoardPicker value={boardIds} onChange={setBoardIds} />
          <div className="mt-4 flex gap-2">
            <Button tone="primary" disabled={!boardIds.length} onClick={create}>
              Create challenge
            </Button>
            <Button tone="ghost" onClick={() => setMaking(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <h2 className="pb-3 pt-10 text-[15px] font-semibold">Your challenges</h2>
      {!challenges.length ? (
        <Empty title="No challenges yet">Pick a ladder above to start one.</Empty>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {challenges.map((c) => {
            const next = currentLevel(c)
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => go({ name: 'challenges', challengeId: c.id })}
                  className="group flex w-full items-center gap-4 py-3 text-left"
                >
                  <span className="min-w-0 flex-1 font-semibold group-hover:text-blue">{c.name}</span>
                  <LevelDots challenge={c} />
                  <span className="w-36 text-right text-muted">
                    {next === -1 ? 'All levels done' : `Next: level ${next + 1}`}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function LevelDots({ challenge }: { challenge: Challenge }) {
  return (
    <span className="flex gap-1" aria-label={`${challenge.completed.length} of ${challenge.levels.length} levels done`}>
      {challenge.levels.map((_, i) => (
        <span
          key={i}
          className={`h-2 w-2 rounded-full ${challenge.completed.includes(i) ? 'bg-blue' : isUnlocked(challenge, i) ? 'ring-1 ring-blue' : 'bg-line'}`}
        />
      ))}
    </span>
  )
}

function ChallengeView({ challenge }: { challenge: Challenge }) {
  const boards = useApp((s) => s.boards)
  const sessions = useApp((s) => s.sessions)
  const settings = useApp((s) => s.settings)
  const setChallenges = useApp((s) => s.setChallenges)
  const startRun = useApp((s) => s.startRun)
  const go = useApp((s) => s.go)
  const [selected, setSelected] = useState(() => Math.max(0, currentLevel(challenge)))
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const update = (patch: Partial<Challenge>) =>
    setChallenges((list) => list.map((c) => (c.id === challenge.id ? { ...c, ...patch } : c)))

  const level = challenge.levels[Math.min(selected, challenge.levels.length - 1)]
  const pool = useMemo(() => poolFromBoards(boards, challenge.boardIds), [boards, challenge.boardIds])
  const unlocked = isUnlocked(challenge, selected)
  const attempts = sessions
    .filter((s) => s.challenge?.challengeId === challenge.id && s.challenge.level === selected)
    .sort((a, b) => b.startedAt - a.startedAt)

  const start = () => {
    const slots = slotsForLevel(level, pool)
    if (!slots.length) return
    startRun({
      plan: {
        ...DEFAULT_PLAN,
        ...settings.lastPlan,
        boardIds: challenge.boardIds,
        mode: 'class',
        blocks: level.blocks,
        shuffle: true,
        rest: { enabled: level.rest > 0, seconds: level.rest || 5 },
        review: settings.lastPlan?.review ?? true,
        capture: settings.lastPlan?.capture ?? false
      },
      slots,
      challenge: { challengeId: challenge.id, level: selected }
    })
  }

  return (
    <div className="mx-auto max-w-[1180px] px-8 py-8">
      <button type="button" onClick={() => go({ name: 'challenges' })} className="mb-3 inline-flex items-center gap-1 text-muted hover:text-ink">
        <ArrowLeft size={15} /> Challenges
      </button>
      <div className="flex flex-wrap items-center gap-3 pb-6">
        <input
          aria-label="Challenge name"
          value={challenge.name}
          onChange={(e) => update({ name: e.target.value })}
          className="-ml-1 min-w-0 flex-1 rounded-md bg-transparent px-1 text-[22px] font-semibold tracking-[-0.01em] outline-none hover:bg-surface focus:bg-surface focus:ring-1 focus:ring-blue"
        />
        <Button tone="ghost" onClick={() => setEditing((v) => !v)}>
          {editing ? 'Done editing' : 'Edit levels and boards'}
        </Button>
        {confirmDelete ? (
          <>
            <Button
              tone="danger"
              onClick={() => {
                setChallenges((list) => list.filter((c) => c.id !== challenge.id))
                go({ name: 'challenges' })
              }}
            >
              Delete challenge
            </Button>
            <Button tone="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <IconButton label="Delete challenge" onClick={() => setConfirmDelete(true)}>
            <Trash size={16} />
          </IconButton>
        )}
      </div>

      {editing ? (
        <Editor challenge={challenge} update={update} />
      ) : (
        <div className="grid grid-cols-[260px_minmax(0,1fr)] gap-10">
          <LevelPath challenge={challenge} selected={selected} onSelect={setSelected} />
          <section aria-label={`Level ${selected + 1}`} className="min-w-0">
            <h2 className="text-[20px] font-semibold">{level.title}</h2>
            {level.focus && <p className="mt-1 text-[15px] text-blue">Focus: {level.focus}</p>}
            <p className="mt-3 text-muted">
              {describeBlocks(level.blocks)}
              {level.rest ? `, ${level.rest}s rest between poses` : ''}, about {formatDuration(estimateSeconds(level.blocks, level.rest))}.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <Button tone="primary" className="h-11 px-6 text-[14px]" disabled={!unlocked || !pool.length} onClick={start}>
                {challenge.completed.includes(selected) ? 'Play again' : 'Start level'}
              </Button>
              {!unlocked && <span className="text-muted">Finish level {selected} to open this one.</span>}
              {!pool.length && <span className="text-muted">This challenge's boards have no images. Edit it to pick boards.</span>}
            </div>

            <h3 className="pb-3 pt-10 font-semibold">Your tries at this level</h3>
            {!attempts.length ? (
              <p className="text-muted">Nothing yet. Each finished try shows up here, so you can compare them.</p>
            ) : (
              <ul className="grid gap-2">
                {attempts.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => go({ name: 'review', sessionId: s.id })}
                      className="flex w-full items-center gap-4 rounded-md px-2 py-2 text-left hover:bg-surface"
                    >
                      <span className="flex gap-1">
                        {s.poses.slice(0, 6).map((p, k) => (
                          <img
                            key={k}
                            src={thumbUrl(p.capturePath ?? p.imagePath, 96)}
                            alt=""
                            loading="lazy"
                            className="h-12 w-9 rounded object-cover"
                          />
                        ))}
                      </span>
                      <span className="flex-1 text-ink">
                        {new Date(s.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                      <span className="text-muted">{s.finished ? 'Finished' : 'Stopped early'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

/** Levels on a winding pencil line, Drawing Timer style. */
function LevelPath({ challenge, selected, onSelect }: { challenge: Challenge; selected: number; onSelect: (i: number) => void }) {
  const STEP = 92
  const xs = [70, 170, 120, 40, 150]
  const points = challenge.levels.map((_, i) => ({ x: xs[i % xs.length], y: 40 + i * STEP }))
  const d = points.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`
    const prev = points[i - 1]
    const midY = (prev.y + p.y) / 2
    return `${acc} C ${prev.x} ${midY}, ${p.x} ${midY}, ${p.x} ${p.y}`
  }, '')
  const height = 40 + (challenge.levels.length - 1) * STEP + 50

  return (
    <div className="relative" style={{ height }}>
      <svg width={220} height={height} className="pencil absolute inset-0" aria-hidden="true">
        <path d={d} stroke="var(--line)" strokeWidth={3} fill="none" />
      </svg>
      {challenge.levels.map((lv, i) => {
        const done = challenge.completed.includes(i)
        const open = isUnlocked(challenge, i)
        const p = points[i]
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            aria-current={selected === i ? 'step' : undefined}
            aria-label={`${lv.title}${done ? ', done' : open ? '' : ', locked'}`}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
            style={{ left: p.x, top: p.y }}
          >
            <span
              className={`flex h-12 w-12 items-center justify-center rounded-full text-[16px] font-semibold ring-2 transition-colors ${
                done
                  ? 'bg-blue text-bg ring-blue'
                  : open
                    ? 'bg-bg text-ink ring-blue'
                    : 'bg-surface text-muted ring-line'
              } ${selected === i ? 'outline-2 outline-offset-4 outline-blue' : ''}`}
            >
              {done ? <Check size={20} strokeWidth={2.6} /> : open ? i + 1 : <Lock size={16} />}
            </span>
            <span className={`whitespace-nowrap text-[12px] ${selected === i ? 'text-ink' : 'text-muted'}`}>{lv.title}</span>
          </button>
        )
      })}
    </div>
  )
}

function Editor({ challenge, update }: { challenge: Challenge; update: (p: Partial<Challenge>) => void }) {
  const setLevel = (i: number, patch: Partial<Level>) =>
    update({ levels: challenge.levels.map((l, j) => (j === i ? { ...l, ...patch } : l)) })

  return (
    <div className="max-w-3xl">
      <Field label="Boards">
        <BoardPicker value={challenge.boardIds} onChange={(boardIds) => update({ boardIds })} />
      </Field>
      <div className="mt-4 divide-y divide-line border-t border-line">
        {challenge.levels.map((lv, i) => (
          <div key={i} className="grid gap-3 py-4">
            <div className="flex items-center gap-2">
              <input
                aria-label={`Level ${i + 1} title`}
                value={lv.title}
                onChange={(e) => setLevel(i, { title: e.target.value })}
                className="h-9 w-40 rounded-md bg-surface px-2.5 font-semibold outline-none ring-1 ring-line focus:ring-blue"
              />
              <input
                aria-label={`Level ${i + 1} focus`}
                value={lv.focus}
                placeholder="Focus, e.g. line of action first"
                onChange={(e) => setLevel(i, { focus: e.target.value })}
                className="h-9 min-w-0 flex-1 rounded-md bg-surface px-2.5 outline-none ring-1 ring-line placeholder:text-muted/70 focus:ring-blue"
              />
              <IconButton
                label={`Remove level ${i + 1}`}
                disabled={challenge.levels.length === 1}
                onClick={() =>
                  update({
                    levels: challenge.levels.filter((_, j) => j !== i),
                    completed: challenge.completed.filter((c) => c !== i).map((c) => (c > i ? c - 1 : c))
                  })
                }
              >
                <Trash size={15} />
              </IconButton>
            </div>
            <BlocksEditor blocks={lv.blocks} onChange={(blocks) => setLevel(i, { blocks })} />
            <div className="flex items-center gap-2 text-muted">
              Rest between poses
              <NumberField label={`Level ${i + 1} rest seconds`} value={lv.rest} min={0} max={600} suffix="s" onChange={(rest) => setLevel(i, { rest })} />
              <span className="text-[12.5px]">0 = no rest</span>
            </div>
          </div>
        ))}
      </div>
      <Button tone="ghost" onClick={() => update({ levels: [...challenge.levels, newLevel(challenge.levels.length + 1)] })}>
        <Plus size={15} /> Add level
      </Button>
    </div>
  )
}
