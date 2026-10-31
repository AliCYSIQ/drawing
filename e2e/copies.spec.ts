import { _electron as electron, expect, test } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { folderTile, savedLibrary } from './lib'
import { makeFixtures } from './make-fixtures'

const main = join(__dirname, '..', 'out', 'main', 'index.js')

test('a copy shares the image file, and deleting the original never breaks it', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'drawing-copies-'))
  const png = readFileSync(makeFixtures(mkdtempSync(join(tmpdir(), 'png-')), 1)[0])
  let app = await electron.launch({ args: [main], env: { ...process.env, DRAWING_DATA_DIR: dataDir } })
  let page = await app.firstWindow()

  // A folder filled by pasting: its image is stored in the app's data folder.
  await page.getByRole('button', { name: 'Library' }).click()
  await page.getByRole('button', { name: 'New folder' }).click()
  await page.getByRole('textbox', { name: 'New folder name' }).fill('Pasted')
  await page.getByRole('button', { name: 'Create' }).click()
  await folderTile(page, 'Pasted').click()
  await expect(page.getByText('This folder is empty')).toBeVisible()
  await page.evaluate((bytes) => {
    const dt = new DataTransfer()
    dt.items.add(new File([new Uint8Array(bytes)], 'pose.png', { type: 'image/png' }))
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }))
  }, [...png])
  await expect(page.getByText('Added 1 image to “Pasted”.')).toBeVisible()
  await page.getByRole('navigation', { name: 'Folder path' }).getByRole('button', { name: 'Library' }).click()

  // Copy it (Ctrl+C, Ctrl+V): a second folder, same image file.
  await page.getByRole('checkbox', { name: 'Select Pasted' }).click()
  await page.keyboard.press('Control+c')
  await page.keyboard.press('Control+v')
  await expect(folderTile(page, 'Pasted (copy)')).toBeVisible()
  let lib = await savedLibrary(page)
  expect(lib.images).toHaveLength(2)
  expect(lib.assets).toHaveLength(1)
  const file = lib.assets[0].path
  expect(lib.assets[0].storage).toBe('stored')

  // Delete the original, start again: the file the copy uses is still there.
  await page.getByRole('checkbox', { name: 'Select Pasted', exact: true }).click()
  await page.keyboard.press('Delete')
  await page.getByRole('dialog', { name: 'Delete' }).getByRole('button', { name: 'Delete everything inside too' }).click()
  await expect(folderTile(page, 'Pasted')).toHaveCount(0)
  await page.waitForTimeout(400)
  await app.close()
  app = await electron.launch({ args: [main], env: { ...process.env, DRAWING_DATA_DIR: dataDir } })
  page = await app.firstWindow()
  await page.getByRole('button', { name: 'Library' }).click()
  await page.waitForTimeout(500)
  lib = await savedLibrary(page)
  expect(lib.images).toHaveLength(1)
  expect(existsSync(file)).toBe(true)

  // Deleting the last one that uses it removes the file at the next start.
  await page.getByRole('checkbox', { name: 'Select Pasted (copy)' }).click()
  await page.keyboard.press('Delete')
  await page.getByRole('dialog', { name: 'Delete' }).getByRole('button', { name: 'Delete everything inside too' }).click()
  await page.waitForTimeout(400)
  await app.close()
  app = await electron.launch({ args: [main], env: { ...process.env, DRAWING_DATA_DIR: dataDir } })
  page = await app.firstWindow()
  await page.waitForTimeout(800)
  expect(existsSync(file)).toBe(false)
  await app.close()
  rmSync(dataDir, { recursive: true, force: true })
})
