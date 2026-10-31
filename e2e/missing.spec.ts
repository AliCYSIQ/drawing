import { _electron as electron, expect, test } from '@playwright/test'
import { existsSync, mkdtempSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addFolder, folderTile, savedLibrary } from './lib'
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
  const assets = async () => (await savedLibrary(page)).assets.sort((a, b) => a.id.localeCompare(b.id))

  await answerFolder(before)
  await page.getByRole('button', { name: 'Library' }).click()
  await addFolder(page)
  await expect(page.getByText(/Added 3 images/)).toBeVisible()
  const ids = (await assets()).map((a) => a.id)

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
  await folderTile(page, 'Poses').click()
  await expect(page.getByRole('alert')).toContainText('3 images here can’t be found')
  await expect(page.getByText('Missing', { exact: true })).toHaveCount(3)

  // Sessions skip them; history still shows the kept copies.
  await page.getByRole('button', { name: 'Practice', exact: true }).click()
  await expect(page.getByText(/3 images are missing on disk and will be skipped/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start drawing' })).toBeDisabled()
  await page.getByRole('button', { name: 'Stats' }).click()
  const thumb = page.locator('li img').first()
  await expect.poll(() => thumb.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0)

  // Find folder relinks every image and keeps their ids.
  await page.getByRole('button', { name: 'Library' }).click()
  await folderTile(page, 'Poses').click()
  await answerFolder(after)
  await page.getByRole('button', { name: 'Find folder…' }).click()
  await expect(page.getByText('Found 3 of 3 images in the new place.')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  const relinked = await assets()
  expect(relinked.map((a) => a.id)).toEqual(ids)
  expect(relinked.every((a) => a.path.startsWith(after))).toBe(true)

  // A rescan of the new folder keeps the same ids too, and finds nothing new.
  await page.getByRole('button', { name: 'Rescan' }).click()
  await expect(page.getByText('No new images.')).toBeVisible()
  expect((await assets()).map((a) => a.id)).toEqual(ids)

  // A file renamed on disk keeps its asset (its history and favorite) after a rescan.
  // Each image's bytes are worked out in the background; wait for them.
  await expect.poll(async () => (await savedLibrary(page)).assets.filter((a) => a.sha256).length, { timeout: 15_000 }).toBe(3)
  renameSync(join(after, 'pose-01.png'), join(after, 'renamed.png'))
  await page.getByRole('button', { name: 'Rescan' }).click()
  await expect(page.getByText(/1 moved or renamed file found again/)).toBeVisible()
  const final = await assets()
  expect(final.map((a) => a.id)).toEqual(ids)
  expect(final.some((a) => a.path.endsWith('renamed.png'))).toBe(true)

  await app.close()
  rmSync(dataDir, { recursive: true, force: true })
  rmSync(parent, { recursive: true, force: true })
})
