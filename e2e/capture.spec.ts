// Canvas capture of a chosen window, with real windows: a red "canvas" app
// and a blue "browser" kept in front of it. The capture must show red.
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CaptureResult, CaptureWindow } from '../src/shared/capture'

let app: ElectronApplication
let page: Page
let dataDir: string
let others: ElectronApplication

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'drawing-capture-'))
  app = await electron.launch({ args: [join(__dirname, '..', 'out', 'main', 'index.js')], env: { ...process.env, DRAWING_DATA_DIR: dataDir } })
  page = await app.firstWindow()
  others = await electron.launch({ args: [join(__dirname, 'fake-apps', 'main.js')] })
  await others.firstWindow()
  await new Promise((r) => setTimeout(r, 1500))
})

test.afterAll(async () => {
  await others?.close().catch(() => {})
  await app?.close()
  rmSync(dataDir, { recursive: true, force: true })
})

const capture = (target: CaptureWindow, index = 0) => page.evaluate(([w, i]) => window.api.capture({ kind: 'window', window: w }, 'capture-test', i), [target, index] as const)
/** Colour (r, g, b) at a point of a saved capture, given as fractions of its size. */
const colourAt = (path: string, fx: number, fy: number) =>
  app.evaluate(
    ({ nativeImage }, [p, x, y]) => {
      const img = nativeImage.createFromPath(p)
      const { width, height } = img.getSize()
      const bmp = img.toBitmap()
      const i = (Math.floor(height * y) * width + Math.floor(width * x)) * 4
      // Colours come back within a few steps of the original (colour management), so round them.
      const q = (v: number) => (v > 200 ? 255 : v < 55 ? 0 : v)
      return { r: q(bmp[i + 2]), g: q(bmp[i + 1]), b: q(bmp[i]), width, height }
    },
    [path, fx, fy] as const
  )
const win = (title: string) =>
  others.evaluate(({ BrowserWindow }, t) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === t)!
    return w.id
  }, title)
const act = (title: string, what: 'minimize' | 'restore' | 'close' | 'resize' | 'move') =>
  others.evaluate(
    async ({ BrowserWindow, screen }, [t, a]) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === t)!
      if (a === 'minimize') w.minimize()
      else if (a === 'restore') w.restore()
      else if (a === 'close') w.close()
      else if (a === 'resize') {
        w.setSize(900, 300)
        w.webContents.invalidate()
      }
      else {
        const other = screen.getAllDisplays().find((d) => d.id !== screen.getDisplayMatching(w.getBounds()).id)
        if (!other) return false
        w.setPosition(other.bounds.x + 100, other.bounds.y + 100)
      }
      await new Promise((r) => setTimeout(r, 900))
      return true
    },
    [title, what] as const
  )

const CANVAS = 'Sketch.clip - Fake Paint Studio'

test('the window picker lists the other apps, not this one', async () => {
  const list = await page.evaluate(() => window.api.listWindows())
  const titles = list.map((w) => w.title)
  expect(titles).toContain(CANVAS)
  expect(titles).toContain('Reference page - Fake Browser')
  // This app's own window is never offered.
  const own = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => w.getMediaSourceId()))
  expect(list.some((w) => own.includes(w.id))).toBe(false)
})

test('the chosen window is captured even with another window in front of it', async () => {
  expect(await win(CANVAS)).toBeTruthy()
  const r = (await capture({ title: CANVAS })) as CaptureResult
  expect(r.error).toBeUndefined()
  expect(r.hint).toMatch(/^window:/)
  // Red at the edge, black at the centre: the canvas, not the blue browser on top.
  expect(await colourAt(r.path!, 0.1, 0.5)).toMatchObject({ r: 255, g: 0, b: 0 })
  expect(await colourAt(r.path!, 0.5, 0.5)).toMatchObject({ r: 0, g: 0, b: 0 })
})

test('a browser window can be chosen too', async () => {
  const r = await capture({ title: 'Reference page - Fake Browser' })
  expect(await colourAt(r.path!, 0.5, 0.5)).toMatchObject({ r: 0, g: 0, b: 255 })
})

test('part of the window: only the black square', async () => {
  const r = await capture({ title: CANVAS, crop: { x: 0.42, y: 0.42, width: 0.16, height: 0.16 } }, 1)
  const c = await colourAt(r.path!, 0.5, 0.5)
  expect(c).toMatchObject({ r: 0, g: 0, b: 0 })
  const whole = await capture({ title: CANVAS }, 2)
  const w = await colourAt(whole.path!, 0, 0)
  expect(c.width).toBeLessThan(w.width / 4)
})

test('after a resize the part follows the window', async () => {
  const before = await colourAt((await capture({ title: CANVAS }, 20)).path!, 0, 0)
  await act(CANVAS, 'resize')
  const after = await colourAt((await capture({ title: CANVAS }, 21)).path!, 0, 0)
  // The new shape is captured (wider than tall now), and the part is the same share of it.
  expect(after.width / after.height).toBeGreaterThan(before.width / before.height + 1)
  const part = await colourAt((await capture({ title: CANVAS, crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } }, 22)).path!, 0, 0)
  expect(Math.abs(part.width - after.width / 2)).toBeLessThanOrEqual(2)
  expect(Math.abs(part.height - after.height / 2)).toBeLessThanOrEqual(2)
})

test('moved to another monitor, it is still found (needs two monitors)', async () => {
  const moved = await act(CANVAS, 'move')
  test.skip(!moved, 'Only one monitor on this computer')
  const r = await capture({ title: CANVAS }, 4)
  expect(await colourAt(r.path!, 0.5, 0.5)).toMatchObject({ r: 0, g: 0, b: 0 })
})

test('minimized: a clear message, no desktop picture; restored: it works again', async () => {
  await act(CANVAS, 'minimize')
  const r = await capture({ title: CANVAS }, 5)
  expect(r.path).toBeUndefined()
  expect(r.error).toMatch(/isn't open, or it is minimized/)
  await act(CANVAS, 'restore')
  const again = await capture({ title: CANVAS }, 6)
  expect(again.path).toBeTruthy()
})

test('closed: a clear message, and a free drawing session is still saved', async () => {
  await act(CANVAS, 'close')
  const r = await capture({ title: CANVAS }, 7)
  expect(r.error).toMatch(/isn't open/)

  // End a free drawing session with the window gone: the preview says why, the session is kept.
  await page.waitForTimeout(500)
  await page.evaluate(async (title) => {
    const s = (await window.api.load<Record<string, unknown>>('settings')) ?? {}
    await window.api.save('settings', { ...s, freeCapture: true, captureWindow: { title } })
  }, CANVAS)
  await page.reload()
  await page.getByRole('button', { name: 'Practice', exact: true }).click()
  await page.getByRole('radio', { name: 'Free drawing' }).click()
  await page.getByRole('button', { name: 'Start free drawing' }).click()
  await page.waitForTimeout(3500)
  await page.getByRole('button', { name: 'End and save' }).click()
  const dialog = page.getByRole('dialog', { name: 'Your canvas at the end' })
  await expect(dialog.getByRole('alert')).toContainText("isn't open")
  await expect(dialog.getByRole('button', { name: 'Try again' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Save without a picture' }).click()
  await expect(page.getByRole('heading', { name: 'Free drawing' })).toBeVisible()
  await page.waitForTimeout(400)
  const sessions = (await page.evaluate(() => window.api.load<{ plan: { mode: string }; drawings?: string[]; activeMs: number }[]>('sessions')))!
  expect(sessions.at(-1)).toMatchObject({ plan: { mode: 'free' } })
  expect(sessions.at(-1)!.drawings).toBeUndefined()
  expect(sessions.at(-1)!.activeMs).toBeGreaterThan(3000)
})

test('a free drawing capture is shown first, and can be retaken before it is kept', async () => {
  await page.waitForTimeout(500)
  await page.evaluate(async (title) => {
    const s = (await window.api.load<Record<string, unknown>>('settings')) ?? {}
    await window.api.save('settings', { ...s, freeCapture: true, captureWindow: { title } })
  }, 'Reference page - Fake Browser')
  await page.reload()
  await page.getByRole('button', { name: 'Practice', exact: true }).click()
  await page.getByRole('radio', { name: 'Free drawing' }).click()
  await page.getByRole('button', { name: 'Start free drawing' }).click()
  await page.waitForTimeout(3500)
  await page.getByRole('button', { name: 'End and save' }).click()
  const dialog = page.getByRole('dialog', { name: 'Your canvas at the end' })
  await expect(dialog.getByRole('img', { name: 'The capture' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Retake' }).click()
  await expect(dialog.getByRole('img', { name: 'The capture' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Keep it' }).click()
  await page.waitForTimeout(400)
  const sessions = (await page.evaluate(() => window.api.load<{ drawings?: string[] }[]>('sessions')))!
  expect(sessions.at(-1)!.drawings).toHaveLength(1)
})
