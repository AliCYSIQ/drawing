import { _electron as electron, expect, test } from '@playwright/test'
import { existsSync, mkdtempSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeFixtures } from './make-fixtures'

test('a moved folder shows as missing, history keeps working, and Find folder relinks it', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'drawing-missing-'))
  const parent = mkdtempSync(join(tmpdir(), 'refs-parent-'))
  const before = join(parent, 'Poses')
  const after = join(parent, 'Poses (moved)')
  makeFixtures(before, 3)

  const app = await electron.launch({
    args: [join(__dirname, '..', 'out', 'main', 'index.js')],
    env: { ...process.env, DRAWING_DATA_DIR: dataDir }
  })
  const page = await app.firstWindow()
  const answerFolder = (dir: string) =>
    app.evaluate(({ dialog }, d) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [d] })) as typeof dialog.showOpenDialog
    }, dir)
  const savedBoard = async () => {
    await page.waitForTimeout(400)
    return page.evaluate(async () => (await window.api.load<{ images: { id: string; path: string }[] }[]>('boards'))![0])
  }

  await answerFolder(before)
  await page.getByRole('button', { name: 'Library' }).click()
  await page.getByRole('button', { name: 'Add folder' }).click()
  const ids = (await savedBoard()).images.map((i) => i.id)

  // Practice once, without review, so the references get kept copies.
  await page.getByRole('button', { name: 'Practice', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Custom seconds' }).fill('2')
  await page.getByRole('spinbutton', { name: 'Number of poses' }).fill('2')
  const review = page.getByRole('switch', { name: /Review afterwards/ })
  if ((await review.getAttribute('aria-checked')) === 'true') await review.click()
  await page.getByRole('button', { name: 'Start drawing' }).click()
  await expect(page.getByText('Session saved.')).toBeVisible({ timeout: 15_000 })
  await expect.poll(() => (existsSync(join(dataDir, 'data', 'kept')) ? readdirSync(join(dataDir, 'data', 'kept')).length : 0)).toBe(2)

  // The folder is moved outside the app.
  renameSync(before, after)
  await page.getByRole('button', { name: 'Library' }).click()
  await expect(page.getByText('3 missing')).toBeVisible()
  await page.getByRole('button', { name: /^Poses, 3 images/ }).dblclick()
  await expect(page.getByRole('alert')).toContainText('3 of 3 images can’t be found')

  // Sessions skip them; history still shows the kept copies.
  await page.getByRole('button', { name: 'Practice', exact: true }).click()
  await expect(page.getByText(/3 images are missing on disk and will be skipped/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start drawing' })).toBeDisabled()
  await page.getByRole('button', { name: 'Stats' }).click()
  const thumb = page.locator('li img').first()
  await expect.poll(() => thumb.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0)

  // Find folder relinks every image and keeps their ids.
  await page.getByRole('button', { name: 'Library' }).click()
  await page.getByRole('button', { name: /^Poses, 3 images/ }).dblclick()
  await answerFolder(after)
  await page.getByRole('button', { name: 'Find folder…' }).click()
  await expect(page.getByText('Found 3 of 3 images in the new place.')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  const relinked = await savedBoard()
  expect(relinked.images.map((i) => i.id)).toEqual(ids)
  expect(relinked.images.every((i) => i.path.startsWith(after))).toBe(true)

  // A rescan of the new folder keeps the same ids too.
  await page.getByRole('button', { name: 'Rescan folder' }).click()
  await expect(page.getByText('3 images in the folder.')).toBeVisible()
  expect((await savedBoard()).images.map((i) => i.id).sort()).toEqual([...ids].sort())

  await app.close()
  rmSync(dataDir, { recursive: true, force: true })
  rmSync(parent, { recursive: true, force: true })
})
