import { _electron as electron, expect, test } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeFixtures } from './make-fixtures'

const main = join(__dirname, '..', 'out', 'main', 'index.js')

test('a copy shares the image files, and deleting the original never breaks it', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'drawing-copies-'))
  const png = readFileSync(makeFixtures(mkdtempSync(join(tmpdir(), 'png-')), 1)[0])
  let app = await electron.launch({ args: [main], env: { ...process.env, DRAWING_DATA_DIR: dataDir } })
  let page = await app.firstWindow()
  const boards = async () => {
    await page.waitForTimeout(400)
    return page.evaluate(async () => (await window.api.load<{ id: string; name: string; images: { path: string }[] }[]>('boards'))!)
  }

  // A collection filled by pasting: its image lives in the app's data folder.
  await page.getByRole('button', { name: 'Library' }).click()
  await page.getByRole('button', { name: 'New collection' }).click()
  await page.evaluate((bytes) => {
    const dt = new DataTransfer()
    dt.items.add(new File([new Uint8Array(bytes)], 'pose.png', { type: 'image/png' }))
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }))
  }, [...png])
  await expect(page.getByText('Added 1 image.')).toBeVisible()
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Library' }).click()

  // Copy it (Ctrl+C, Ctrl+V): a second collection, same image file.
  const tile = (n: RegExp) => page.getByRole('button', { name: n })
  await tile(/^New collection, 1 images/).click()
  await page.keyboard.press('Control+c')
  await page.keyboard.press('Control+v')
  await expect(tile(/^New collection \(copy\), 1 images/)).toBeVisible()
  const [original, copy] = await boards()
  expect(copy.images[0].path).toBe(original.images[0].path)

  // Delete the original, start again: the file the copy uses is still there.
  await tile(/^New collection, 1 images/).click()
  await page.keyboard.press('Delete')
  await expect(tile(/^New collection, 1 images/)).toHaveCount(0)
  await app.close()
  app = await electron.launch({ args: [main], env: { ...process.env, DRAWING_DATA_DIR: dataDir } })
  page = await app.firstWindow()
  await page.getByRole('button', { name: 'Library' }).click()
  await page.waitForTimeout(500)
  const after = await boards()
  expect(after).toHaveLength(1)
  expect(existsSync(after[0].images[0].path)).toBe(true)

  // Deleting the last one that uses it removes the file at the next start.
  await tile(/^New collection \(copy\)/).click()
  await page.keyboard.press('Delete')
  await page.waitForTimeout(400)
  await app.close()
  app = await electron.launch({ args: [main], env: { ...process.env, DRAWING_DATA_DIR: dataDir } })
  page = await app.firstWindow()
  await page.waitForTimeout(800)
  expect(existsSync(after[0].images[0].path)).toBe(false)
  await app.close()
  rmSync(dataDir, { recursive: true, force: true })
})
