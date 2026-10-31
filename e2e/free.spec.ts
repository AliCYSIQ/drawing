import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SessionRecord, Settings } from '../src/shared/types'

const main = join(__dirname, '..', 'out', 'main', 'index.js')
let dataDir: string
let app: ElectronApplication
let page: Page

const launch = async () => {
  app = await electron.launch({ args: [main], env: { ...process.env, DRAWING_DATA_DIR: dataDir } })
  page = await app.firstWindow()
}
const sessions = async () => {
  await page.waitForTimeout(400)
  return (await page.evaluate(() => window.api.load<SessionRecord[]>('sessions'))) ?? []
}
const startFree = async () => {
  await page.getByRole('button', { name: 'Practice', exact: true }).click()
  await page.getByRole('radio', { name: 'Free drawing' }).click()
  await page.getByRole('button', { name: 'Start free drawing' }).click()
  await expect(page.getByRole('timer', { name: 'Drawing time' })).toBeVisible()
}
/** Settings written to disk, then the page reloads to read them. */
const withSettings = async (patch: Partial<Settings>) => {
  await page.waitForTimeout(400)
  await page.evaluate(async (p) => {
    const s = (await window.api.load<Settings>('settings')) ?? ({} as Settings)
    await window.api.save('settings', { ...s, ...p })
  }, patch)
  await page.reload()
  await page.getByRole('button', { name: 'Library' }).waitFor()
}

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'drawing-free-'))
  await launch()
})

test.afterAll(async () => {
  await app?.close()
  rmSync(dataDir, { recursive: true, force: true })
})

test('free drawing needs no references, counts time without pauses, and shows in History', async () => {
  // An empty library is fine.
  await startFree()
  await page.waitForTimeout(2000)
  await page.keyboard.press(' ')
  await expect(page.getByText(/^Paused/)).toBeVisible()
  await page.waitForTimeout(2500)
  await page.keyboard.press(' ')
  await expect(page.getByText(/^Drawing\./)).toBeVisible()
  await page.waitForTimeout(2000)
  await page.getByRole('button', { name: 'End and save' }).click()

  await expect(page.getByRole('heading', { name: 'Free drawing' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Note' }).fill('loose figure warm-up')
  const [s] = await sessions()
  expect(s.plan.mode).toBe('free')
  expect(s.poses).toEqual([])
  expect(s.finished).toBe(true)
  // About 4 s of drawing; the 2.5 s pause doesn't count.
  expect(s.activeMs).toBeGreaterThan(3500)
  expect(s.activeMs).toBeLessThan(5500)

  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible()
  await expect(page.locator('li').getByText('Free drawing', { exact: true })).toBeVisible()
  await expect(page.getByText('“loose figure warm-up”')).toBeVisible()
})

test('a free drawing session survives closing the app, and comes back paused', async () => {
  await startFree()
  await page.waitForTimeout(4500)
  await app.close()
  await launch()
  await expect(page.getByRole('timer', { name: 'Drawing time' })).toBeVisible()
  await expect(page.getByText(/^Paused/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()
  await page.getByRole('button', { name: 'End and save' }).click()
  await expect(page.getByRole('heading', { name: 'Free drawing' })).toBeVisible()
  const list = await sessions()
  expect(list).toHaveLength(2)
  expect(list[1].activeMs).toBeGreaterThan(3000)
})

test('with capture on (an older fixed screen area), the capture is shown at the end and kept with the session', async () => {
  const display = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().id)
  await withSettings({ freeCapture: true, captureRegion: { displayId: display, x: 40, y: 40, width: 200, height: 150 } })
  await startFree()
  await page.waitForTimeout(3500)
  await page.getByRole('button', { name: 'End and save' }).click()
  await page.getByRole('dialog', { name: 'Your canvas at the end' }).getByRole('button', { name: 'Keep it' }).click()
  await expect(page.getByText('Session saved.')).toBeVisible()
  const s = (await sessions()).at(-1)!
  expect(s.drawings).toHaveLength(1)
  expect(existsSync(s.drawings![0])).toBe(true)
  await expect(page.getByRole('figure')).toBeVisible()
})

test('if the capture fails, the session is still saved', async () => {
  const display = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().id)
  // An area outside the screen can't be captured.
  await withSettings({ freeCapture: true, captureRegion: { displayId: display, x: 100_000, y: 100_000, width: 200, height: 150 } })
  await startFree()
  await page.waitForTimeout(3500)
  await page.getByRole('button', { name: 'End and save' }).click()
  const dialog = page.getByRole('dialog', { name: 'Your canvas at the end' })
  await expect(dialog.getByRole('alert')).toContainText('could not be captured')
  await dialog.getByRole('button', { name: 'Save without a picture' }).click()
  await expect(page.getByText('Session saved, without a picture of the canvas.')).toBeVisible()
  const s = (await sessions()).at(-1)!
  expect(s.plan.mode).toBe('free')
  expect(s.drawings).toBeUndefined()
  expect(s.activeMs).toBeGreaterThan(3000)
})
