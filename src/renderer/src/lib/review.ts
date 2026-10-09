// Review data changes, kept pure so they can be tested: removing and renaming
// the images of a drawing (canvas capture, photos of the drawing, page photos).

import type { PoseResult, SessionRecord, Stroke } from '@shared/types'

/** Marks on the reference are stored with the drawing marks, under this key. */
export const REFERENCE_KEY = '@reference'

export type SourceKind = 'capture' | 'photo' | 'page'

export interface SourceRef {
  kind: SourceKind
  path: string
}

/** The name shown for an image: your own name, or capture / photo / page with a number. */
export function sourceLabel(session: Pick<SessionRecord, 'labels'>, path: string, fallback: string): string {
  return session.labels?.[path]?.trim() || fallback
}

/** Give an image your own name; an empty name goes back to the usual one. */
export function renameSource(session: SessionRecord, path: string, name: string): SessionRecord {
  const labels = { ...session.labels }
  const clean = name.trim().slice(0, 60)
  if (clean) labels[path] = clean
  else delete labels[path]
  return { ...session, labels }
}

function withoutMarks(pose: PoseResult, path: string): PoseResult {
  if (!pose.marks || !(path in pose.marks)) return pose
  const marks = { ...pose.marks }
  delete marks[path]
  return { ...pose, marks }
}

function withoutLabel(session: SessionRecord, path: string): SessionRecord {
  if (!session.labels || !(path in session.labels)) return session
  const labels = { ...session.labels }
  delete labels[path]
  return { ...session, labels }
}

/**
 * Remove one image of a drawing. A page photo belongs to the whole session,
 * so it goes from every pose (with its marks). Returns the new session and an
 * undo that puts it back into whatever the session looks like by then.
 */
export function removeSource(
  session: SessionRecord,
  poseIndex: number,
  source: SourceRef
): { session: SessionRecord; undo: (current: SessionRecord) => SessionRecord } {
  const { kind, path } = source
  const label = session.labels?.[path]
  const restoreLabel = (s: SessionRecord): SessionRecord => (label ? { ...s, labels: { ...s.labels, [path]: label } } : s)

  if (kind === 'page') {
    const at = session.pagePhotos.indexOf(path)
    const marks = new Map<number, Stroke[]>()
    session.poses.forEach((p, i) => p.marks?.[path] && marks.set(i, p.marks[path]))
    const next = withoutLabel(
      { ...session, pagePhotos: session.pagePhotos.filter((p) => p !== path), poses: session.poses.map((p) => withoutMarks(p, path)) },
      path
    )
    const undo = (cur: SessionRecord): SessionRecord => {
      if (cur.pagePhotos.includes(path)) return cur
      const pagePhotos = cur.pagePhotos.slice()
      pagePhotos.splice(Math.min(Math.max(at, 0), pagePhotos.length), 0, path)
      const poses = cur.poses.map((p, i) => (marks.has(i) ? { ...p, marks: { ...p.marks, [path]: marks.get(i)! } } : p))
      return restoreLabel({ ...cur, pagePhotos, poses })
    }
    return { session: next, undo }
  }

  const pose = session.poses[poseIndex]
  const strokes = pose?.marks?.[path]
  const setPose = (s: SessionRecord, fn: (p: PoseResult) => PoseResult): SessionRecord => ({
    ...s,
    poses: s.poses.map((p, i) => (i === poseIndex ? fn(p) : p))
  })

  if (kind === 'capture') {
    const next = withoutLabel(
      setPose(session, (p) => {
        const out = withoutMarks({ ...p }, path)
        delete out.capturePath
        return out
      }),
      path
    )
    const undo = (cur: SessionRecord): SessionRecord =>
      cur.poses[poseIndex]?.capturePath
        ? cur
        : restoreLabel(
            setPose(cur, (p) => ({ ...p, capturePath: path, ...(strokes ? { marks: { ...p.marks, [path]: strokes } } : {}) }))
          )
    return { session: next, undo }
  }

  const at = pose?.photos?.indexOf(path) ?? -1
  const next = withoutLabel(
    setPose(session, (p) => withoutMarks({ ...p, photos: (p.photos ?? []).filter((x) => x !== path) }, path)),
    path
  )
  const undo = (cur: SessionRecord): SessionRecord => {
    if (cur.poses[poseIndex]?.photos?.includes(path)) return cur
    return restoreLabel(
      setPose(cur, (p) => {
        const photos = (p.photos ?? []).slice()
        photos.splice(Math.min(Math.max(at, 0), photos.length), 0, path)
        return { ...p, photos, ...(strokes ? { marks: { ...p.marks, [path]: strokes } } : {}) }
      })
    )
  }
  return { session: next, undo }
}

/** Every capture and photo file a session still uses. */
export function filesInUse(session: SessionRecord): Set<string> {
  const out = new Set(session.pagePhotos)
  for (const p of session.poses) {
    if (p.capturePath) out.add(p.capturePath)
    for (const ph of p.photos ?? []) out.add(ph)
  }
  return out
}
