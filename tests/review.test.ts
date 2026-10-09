import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAN, type PoseResult, type SessionRecord } from '@shared/types'
import { filesInUse, removeSource, renameSource } from '../src/renderer/src/lib/review'

const pose = (extra: Partial<PoseResult> = {}): PoseResult => ({
  imageId: 'a',
  imagePath: '/refs/a.png',
  plannedSeconds: 60,
  spentMs: 60_000,
  skipped: false,
  mistakes: [],
  redo: false,
  ...extra
})

const line = [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }]

const session = (): SessionRecord => ({
  id: 's',
  startedAt: 0,
  endedAt: 1,
  activeMs: 120_000,
  plan: DEFAULT_PLAN,
  finished: true,
  reviewed: false,
  pagePhotos: ['/p/page1.jpg', '/p/page2.jpg'],
  labels: { '/p/page1.jpg': 'Sketchbook' },
  poses: [
    pose({ capturePath: '/c/1.png', photos: ['/p/photo.jpg'], marks: { '/p/page1.jpg': [line], '/c/1.png': [line] } }),
    pose({ marks: { '/p/page1.jpg': [line, line] } })
  ]
})

describe('removing a drawing image', () => {
  it('a page leaves the whole session, with its marks on every pose and its name', () => {
    const { session: next } = removeSource(session(), 0, { kind: 'page', path: '/p/page1.jpg' })
    expect(next.pagePhotos).toEqual(['/p/page2.jpg'])
    expect(next.poses.every((p) => !p.marks?.['/p/page1.jpg'])).toBe(true)
    expect(next.poses[0].marks?.['/c/1.png']).toHaveLength(1)
    expect(next.labels?.['/p/page1.jpg']).toBeUndefined()
  })

  it('undo puts a page back in its place with its marks and name', () => {
    const before = session()
    const { session: next, undo } = removeSource(before, 0, { kind: 'page', path: '/p/page1.jpg' })
    const back = undo(next)
    expect(back.pagePhotos).toEqual(before.pagePhotos)
    expect(back.poses[1].marks?.['/p/page1.jpg']).toHaveLength(2)
    expect(back.labels?.['/p/page1.jpg']).toBe('Sketchbook')
    // Undo twice does nothing more.
    expect(undo(back).pagePhotos).toEqual(before.pagePhotos)
  })

  it('a photo or capture leaves only its own pose', () => {
    const { session: noPhoto } = removeSource(session(), 0, { kind: 'photo', path: '/p/photo.jpg' })
    expect(noPhoto.poses[0].photos).toEqual([])
    const { session: noCapture, undo } = removeSource(session(), 0, { kind: 'capture', path: '/c/1.png' })
    expect(noCapture.poses[0].capturePath).toBeUndefined()
    expect(noCapture.poses[0].marks?.['/c/1.png']).toBeUndefined()
    const back = undo(noCapture)
    expect(back.poses[0].capturePath).toBe('/c/1.png')
    expect(back.poses[0].marks?.['/c/1.png']).toHaveLength(1)
  })

  it('undo keeps changes made after the removal', () => {
    const { session: next, undo } = removeSource(session(), 0, { kind: 'photo', path: '/p/photo.jpg' })
    const edited = { ...next, poses: next.poses.map((p, i) => (i === 1 ? { ...p, note: 'tilt' } : p)) }
    const back = undo(edited)
    expect(back.poses[0].photos).toEqual(['/p/photo.jpg'])
    expect(back.poses[1].note).toBe('tilt')
  })

  it('files still in use: a removed file is only deleted once nothing uses it', () => {
    const { session: next } = removeSource(session(), 0, { kind: 'page', path: '/p/page1.jpg' })
    expect(filesInUse(next).has('/p/page1.jpg')).toBe(false)
    expect(filesInUse(next).has('/c/1.png')).toBe(true)
  })
})

describe('renaming', () => {
  it('a name is trimmed; an empty name goes back to the usual one', () => {
    expect(renameSource(session(), '/c/1.png', '  First try ').labels?.['/c/1.png']).toBe('First try')
    expect(renameSource(session(), '/p/page1.jpg', '   ').labels?.['/p/page1.jpg']).toBeUndefined()
  })
})
