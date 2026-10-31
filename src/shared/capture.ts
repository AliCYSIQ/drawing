// Which window the canvas capture takes, and how a chosen window is found
// again. Pure, so it can be tested; src/main/capture.ts does the capturing.
//
// Electron lists open windows with a source id that holds the window's
// handle. A handle is only good while that window is open, so it is kept
// as a hint, never as the identity: the identity is the window's title, and
// a window is found again by its title words when the hint is gone (after
// the app it belongs to was restarted). When that can't tell windows apart,
// the capture says so and asks you to pick, instead of guessing.

import type { Region } from './types'

/** Part of a window, as fractions (0–1) of the window's own picture, so it keeps up with resizing and scaling. */
export interface Crop {
  x: number
  y: number
  width: number
  height: number
}

/** The window chosen for canvas captures. */
export interface CaptureWindow {
  /** Its title when chosen, e.g. "illustration.clip - CLIP STUDIO PAINT EX". */
  title: string
  /** Electron's source id when last seen; only good while that window stays open. */
  hint?: string
  /** Part of the window; none = the whole window. */
  crop?: Crop
}

/** What a capture takes: a chosen window, or (older setups) a fixed area of the screen. */
export type CaptureTarget = { kind: 'window'; window: CaptureWindow } | { kind: 'screen'; region: Region }

export interface CaptureResult {
  path?: string
  /** Why there is no picture, in words for the user. */
  error?: string
  /** The window was found under a new source id: save it as the new hint. */
  hint?: string
  /** Its title now. */
  title?: string
}

/** One open window, as listed for the picker. */
export interface WindowChoice {
  id: string
  title: string
  /** Small picture of it (data URL). */
  thumbnail: string
  /** The app's icon (data URL), when Windows gives one. */
  icon?: string
}

const words = (title: string) =>
  title
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !/^\d+$/.test(w))

/** How many title words two windows share. */
function shared(a: string, b: string): number {
  const bw = new Set(words(b))
  return [...new Set(words(a))].filter((w) => bw.has(w)).length
}

export type WindowMatch = { id: string; title: string } | { error: 'gone' | 'ambiguous'; candidates: string[] }

/**
 * Find the chosen window among the open ones.
 * 1. The hint, if that window is still open and its title still looks like it.
 * 2. The one window with the very same title.
 * 3. The one window sharing the most title words (at least half of them);
 *    a tie means two windows look alike, so nothing is picked.
 */
export function findWindow(open: { id: string; name: string }[], chosen: CaptureWindow): WindowMatch {
  const want = words(chosen.title)
  if (chosen.hint) {
    const same = open.find((w) => w.id === chosen.hint)
    if (same && (!want.length || shared(same.name, chosen.title) > 0)) return { id: same.id, title: same.name }
  }
  const exact = open.filter((w) => w.name === chosen.title)
  if (exact.length === 1) return { id: exact[0].id, title: exact[0].name }
  if (exact.length > 1) return { error: 'ambiguous', candidates: exact.map((w) => w.name) }
  const need = Math.max(1, Math.ceil(want.length / 2))
  const scored = open.map((w) => ({ w, score: shared(w.name, chosen.title) })).filter((x) => x.score >= need)
  if (!scored.length) return { error: 'gone', candidates: [] }
  const best = Math.max(...scored.map((x) => x.score))
  const top = scored.filter((x) => x.score === best)
  if (top.length > 1) return { error: 'ambiguous', candidates: top.map((x) => x.w.name) }
  return { id: top[0].w.id, title: top[0].w.name }
}

/** A crop in pixels of an image of this size; the whole image when there is none. */
export function cropRect(crop: Crop | undefined, width: number, height: number): { x: number; y: number; width: number; height: number } {
  if (!crop) return { x: 0, y: 0, width, height }
  const x = Math.max(0, Math.min(width - 1, Math.round(crop.x * width)))
  const y = Math.max(0, Math.min(height - 1, Math.round(crop.y * height)))
  return {
    x,
    y,
    width: Math.max(1, Math.min(width - x, Math.round(crop.width * width))),
    height: Math.max(1, Math.min(height - y, Math.round(crop.height * height)))
  }
}

/**
 * A picture that is one flat colour almost everywhere, sampled from its
 * pixels (BGRA). A window that couldn't really be captured comes back black;
 * an empty white canvas is flat too, so callers treat only black as failed.
 */
export function flatColour(bgra: Uint8Array | Buffer, width: number, height: number): { flat: boolean; dark: boolean } {
  const step = Math.max(1, Math.floor((width * height) / 4000))
  let n = 0
  let sum = 0
  let sum2 = 0
  for (let i = 0; i < width * height; i += step) {
    const o = i * 4
    const v = (bgra[o] + bgra[o + 1] + bgra[o + 2]) / 3
    sum += v
    sum2 += v * v
    n++
  }
  if (!n) return { flat: true, dark: true }
  const mean = sum / n
  const variance = sum2 / n - mean * mean
  return { flat: variance < 4, dark: mean < 8 }
}

/** Short description of what will be captured, for the setup screens. */
export function describeTarget(t: CaptureTarget | null): string {
  if (!t) return 'Nothing chosen yet.'
  if (t.kind === 'screen') return `A fixed area of the screen (${Math.round(t.region.width)} × ${Math.round(t.region.height)}): whatever is on top there is captured.`
  return `${t.window.crop ? 'Part of' : 'The whole'} window “${t.window.title}”, even when another window is in front of it.`
}
