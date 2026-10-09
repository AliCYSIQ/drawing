import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeFixtures } from './make-fixtures'

let app: ElectronApplication
let page: Page
let dataDir: string
let refsDir: string

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'drawing-sessions-'))
  refsDir = mkdtempSync(join(tmpdir(), 'refs-'))
  makeFixtures(refsDir, 4)
  app = await electron.launch({
    args: [join(__dirname, '..', 'out', 'main', 'index.js')],
    env: { ...process.env, DRAWING_DATA_DIR: dataDir }
  })
  page = await app.firstWindow()
  await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [dir] })) as typeof dialog.showOpenDialog
  }, refsDir)
  await page.getByRole('button', { name: 'Library' }).click()
  await page.getByRole('button', { name: 'Add folder' }).click()
  await expect(page.getByText(/Added 4 images/)).toBeVisible()
})

test.afterAll(async () => {
  await app?.close()
  rmSync(dataDir, { recursive: true, force: true })
  rmSync(refsDir, { recursive: true, force: true })
})

const practice = async () => {
  await page.getByRole('button', { name: 'Practice', exact: true }).click()
  const review = page.getByRole('switch', { name: /Review afterwards/ })
  if ((await review.getAttribute('aria-checked')) === 'true') await review.click()
}
const clock = () => page.locator('.stage .tnum').filter({ hasText: /^\d+:\d\d$/ })

test('class mode rests longer between blocks', async () => {
  await practice()
  await page.getByRole('radio', { name: 'Class', exact: true }).click()
  // Two blocks of one 2-second pose, with a 4-second break between them.
  const counts = page.getByRole('spinbutton', { name: /poses$/ })
  const secs = page.getByRole('spinbutton', { name: /Block \d seconds/ })
  while ((await counts.count()) > 2) await page.getByRole('button', { name: /Remove block/ }).last().click()
  for (let i = 0; i < 2; i++) {
    await counts.nth(i).fill('1')
    await secs.nth(i).fill('2')
  }
  await page.getByRole('spinbutton', { name: 'Break between blocks, seconds' }).fill('4')
  await expect(page.getByText(/about 8s/)).toBeVisible()
  await page.getByRole('button', { name: 'Start drawing' }).click()
  await expect(page.getByText('Next: pose 2 of 2')).toBeVisible({ timeout: 5000 })
  await expect(page.getByText('Session saved.')).toBeVisible({ timeout: 15_000 })
})

test('R restarts the pose; "line only" hides the numbers', async () => {
  await practice()
  await page.getByRole('radio', { name: 'Classic' }).click()
  await page.getByRole('spinbutton', { name: 'Custom seconds' }).fill('30')
  await page.getByRole('spinbutton', { name: 'Number of poses' }).fill('1')
  await page.getByRole('button', { name: 'Start drawing' }).click()
  await page.waitForTimeout(2200)
  await expect(clock()).not.toHaveText('0:30')
  await page.keyboard.press('r')
  await expect(clock()).toHaveText(/0:(30|29)/)
  await page.waitForTimeout(3100) // count as drawing, so the session is kept
  await page.keyboard.press('Escape')
  await expect(page.getByText('Session saved.')).toBeVisible()

  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('radio', { name: 'Line only' }).click()
  await page.getByRole('button', { name: 'Practice', exact: true }).click()
  await page.getByRole('button', { name: 'Start drawing' }).click()
  await page.waitForTimeout(500)
  await expect(clock()).toHaveCount(0)
  await page.waitForTimeout(2600)
  await page.keyboard.press('Escape')
})

test('favorites only uses just the starred images', async () => {
  // No favorites yet: nothing to start, and the summary says why.
  await practice()
  await page.getByRole('switch', { name: /Favorites only/ }).click()
  await expect(page.getByText(/Star images in the Library, or turn off Favorites only/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start drawing' })).toBeDisabled()

  await page.getByRole('button', { name: 'Library' }).click()
  await page.getByRole('button', { name: /^refs-/ }).click()
  await page.getByRole('button', { name: 'Open image 1' }).hover()
  await page.getByRole('button', { name: 'Add image to favorites' }).first().click()
  await practice()
  await page.getByRole('spinbutton', { name: 'Number of poses' }).fill('0')
  await expect(page.getByText('4 poses')).toBeVisible()
  await page.getByRole('switch', { name: /Favorites only/ }).click()
  await expect(page.getByText('1 favorite image in these boards.')).toBeVisible()
  await expect(page.getByText('1 pose', { exact: true })).toBeVisible()
})
