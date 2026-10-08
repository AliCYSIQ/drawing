import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeFixtures } from './make-fixtures'

let app: ElectronApplication
let page: Page
let dataDir: string
let refsDir: string
let photo: string

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'drawing-review-'))
  refsDir = mkdtempSync(join(tmpdir(), 'drawing-refs-'))
  makeFixtures(refsDir, 3)
  photo = makeFixtures(mkdtempSync(join(tmpdir(), 'drawing-photo-')), 1)[0]
  app = await electron.launch({
    args: [join(__dirname, '..', 'out', 'main', 'index.js')],
    env: { ...process.env, DRAWING_DATA_DIR: dataDir }
  })
  page = await app.firstWindow()
  // Dialogs can't be clicked in a test: folders answer with the fixtures, files with the "photo".
  // The canvas area is a fixed rectangle instead of the drag-to-pick window.
  await app.evaluate(({ dialog, ipcMain, screen }, { dir, file }) => {
    dialog.showOpenDialog = (async (_w: unknown, o: Electron.OpenDialogOptions) => ({
      canceled: false,
      filePaths: o.properties?.includes('openDirectory') ? [dir] : [file]
    })) as typeof dialog.showOpenDialog
    const d = screen.getPrimaryDisplay()
    ipcMain.removeHandler('capture:pickRegion')
    ipcMain.handle('capture:pickRegion', () => ({ displayId: d.id, x: 0, y: 0, width: 300, height: 400 }))
  }, { dir: refsDir, file: photo })
  await page.getByRole('button', { name: 'Library' }).click()
  await page.getByRole('button', { name: 'Add folder' }).click()
  await expect(page.getByText(/Added 3 images/)).toBeVisible()
})

test.afterAll(async () => {
  await app?.close()
  rmSync(dataDir, { recursive: true, force: true })
  rmSync(refsDir, { recursive: true, force: true })
})

async function shortSession(capture: boolean) {
  await page.getByRole('button', { name: 'Practice', exact: true }).click()
  await page.getByRole('radio', { name: 'Classic' }).click()
  await page.getByRole('spinbutton', { name: 'Custom seconds' }).fill('2')
  await page.getByRole('spinbutton', { name: 'Number of poses' }).fill('2')
  const toggle = page.getByRole('switch', { name: /Capture my Clip Studio canvas/ })
  if ((await toggle.getAttribute('aria-checked')) !== String(capture)) await toggle.click()
  if (capture && (await page.getByRole('button', { name: 'Pick canvas area' }).count())) {
    await page.getByRole('button', { name: 'Pick canvas area' }).click()
  }
  await page.getByRole('button', { name: 'Start drawing' }).click()
  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible({ timeout: 15_000 })
}

// Collections are saved 250 ms after a change; read after that.
const savedPose = async () => {
  await page.waitForTimeout(400)
  return page.evaluate(async () => {
    const sessions = (await window.api.load<{ poses: { photos?: string[]; marks?: Record<string, unknown[]> }[] }[]>('sessions'))!
    return sessions[sessions.length - 1].poses[0]
  })
}

test('with a canvas capture, an added photo still shows (and can be switched to)', async () => {
  await shortSession(true)
  await expect(page.getByText('Canvas capture', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Add photo of this drawing' }).click()
  // Both images are offered, and the new photo is the one shown.
  await expect(page.getByRole('radio', { name: 'Canvas capture' })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Photo' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('figcaption', { hasText: /^Photo$/ })).toBeVisible()
  await page.getByRole('radio', { name: 'Overlay' }).click()
  await expect(page.getByText('Drag your drawing to line it up')).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Finish' }).click()
})

test('with only a photo, side by side, overlay and the pen work', async () => {
  await shortSession(false)
  // No drawing yet: a drop area instead of compare tools.
  await expect(page.getByText(/Drop a photo of this drawing here/)).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Side by side' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Add photo of this drawing' }).click()
  await expect(page.getByRole('radio', { name: 'Side by side' })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Overlay' })).toBeVisible()
  expect((await savedPose()).photos).toHaveLength(1)

  // Pen: M turns it on, a drag draws a mark, Ctrl+Z undoes it.
  await page.keyboard.press('m')
  await expect(page.getByRole('button', { name: 'Marking' })).toBeVisible()
  const canvas = page.locator('canvas')
  const box = (await canvas.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 8 })
  await page.mouse.up()
  const marked = await savedPose()
  expect(Object.values(marked.marks ?? {})[0]).toHaveLength(1)
  await page.keyboard.press('Control+z')
  expect(Object.values((await savedPose()).marks ?? {})[0]).toHaveLength(0)

  // With the pen off, the marks stay but dragging no longer draws.
  await page.keyboard.press('m')
  await expect(page.getByRole('button', { name: 'Mark', exact: true })).toBeVisible()
})

test('Done shows a summary of what was tagged', async () => {
  await page.getByRole('button', { name: 'Tilt' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('dialog', { name: 'Review summary' })).toBeVisible()
  await expect(page.getByRole('dialog').getByText('Tilt')).toBeVisible()
  await page.getByRole('button', { name: 'Finish' }).click()
  await expect(page.getByRole('heading', { name: 'What do you want to draw?' })).toBeVisible()
})
