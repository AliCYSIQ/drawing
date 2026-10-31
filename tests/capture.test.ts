import { describe, expect, it } from 'vitest'
import { cropRect, describeTarget, findWindow, flatColour } from '../src/shared/capture'

const open = [
  { id: 'window:100:0', name: 'Sketch 12.clip - CLIP STUDIO PAINT EX' },
  { id: 'window:200:0', name: 'Pinterest - Brave' },
  { id: 'window:300:0', name: 'Downloads - File Explorer' }
]

describe('finding the chosen window again', () => {
  it('uses the remembered source id while that window is open', () => {
    expect(findWindow(open, { title: 'Sketch 12.clip - CLIP STUDIO PAINT EX', hint: 'window:100:0' })).toEqual({ id: 'window:100:0', title: open[0].name })
  })

  it('after its app restarted (new id), finds it by its title words, also with another document open', () => {
    const later = [...open.slice(1), { id: 'window:999:0', name: 'Hands study.clip - CLIP STUDIO PAINT EX' }]
    expect(findWindow(later, { title: 'Sketch 12.clip - CLIP STUDIO PAINT EX', hint: 'window:100:0' })).toEqual({ id: 'window:999:0', title: later[2].name })
  })

  it('never takes the window in front just because it is in front: an unrelated title is no match', () => {
    const noCsp = open.slice(1)
    expect(findWindow(noCsp, { title: 'Sketch 12.clip - CLIP STUDIO PAINT EX' })).toEqual({ error: 'gone', candidates: [] })
  })

  it('a handle reused by another app (its title shares nothing) is not trusted', () => {
    const reused = [{ id: 'window:100:0', name: 'Calculator' }]
    expect(findWindow(reused, { title: 'Sketch 12.clip - CLIP STUDIO PAINT EX', hint: 'window:100:0' })).toMatchObject({ error: 'gone' })
  })

  it('two windows that look alike: asks instead of guessing', () => {
    const two = [
      { id: 'window:1:0', name: 'A.clip - CLIP STUDIO PAINT EX' },
      { id: 'window:2:0', name: 'B.clip - CLIP STUDIO PAINT EX' }
    ]
    expect(findWindow(two, { title: 'Sketch 12.clip - CLIP STUDIO PAINT EX' })).toMatchObject({ error: 'ambiguous', candidates: [two[0].name, two[1].name] })
    // The very same title twice is ambiguous too.
    expect(findWindow([...two, { id: 'window:3:0', name: 'A.clip - CLIP STUDIO PAINT EX' }], { title: 'A.clip - CLIP STUDIO PAINT EX' })).toMatchObject({ error: 'ambiguous' })
  })
})

describe('the part of the window', () => {
  it('is a share of the window, so it follows resizing and scaling', () => {
    const crop = { x: 0.25, y: 0.1, width: 0.5, height: 0.8 }
    expect(cropRect(crop, 1000, 500)).toEqual({ x: 250, y: 50, width: 500, height: 400 })
    expect(cropRect(crop, 2000, 1000)).toEqual({ x: 500, y: 100, width: 1000, height: 800 })
    expect(cropRect(undefined, 640, 480)).toEqual({ x: 0, y: 0, width: 640, height: 480 })
    // Never outside the picture.
    expect(cropRect({ x: 0.9, y: 0.9, width: 0.5, height: 0.5 }, 100, 100)).toEqual({ x: 90, y: 90, width: 10, height: 10 })
  })
})

describe('blank pictures', () => {
  const solid = (b: number, g: number, r: number, n = 400) => Uint8Array.from({ length: n * 4 }, (_, i) => [b, g, r, 255][i % 4])
  it('all black is flat and dark (a window that could not really be captured)', () => {
    expect(flatColour(solid(0, 0, 0), 20, 20)).toEqual({ flat: true, dark: true })
  })
  it('an empty white canvas is flat but not dark, so it is kept', () => {
    expect(flatColour(solid(255, 255, 255), 20, 20)).toEqual({ flat: true, dark: false })
  })
  it('a drawing is not flat', () => {
    const px = solid(255, 255, 255)
    for (let i = 0; i < 400; i += 3) px.set([0, 0, 0], i * 4)
    expect(flatColour(px, 20, 20).flat).toBe(false)
  })
})

it('describes the setup in words', () => {
  expect(describeTarget(null)).toMatch(/Nothing/)
  expect(describeTarget({ kind: 'window', window: { title: 'CSP', crop: { x: 0, y: 0, width: 1, height: 1 } } })).toMatch(/Part of window “CSP”/)
  expect(describeTarget({ kind: 'screen', region: { displayId: 1, x: 0, y: 0, width: 300, height: 200 } })).toMatch(/whatever is on top/)
})
