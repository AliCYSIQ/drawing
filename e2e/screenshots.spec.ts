// Visual check, not a test: `SCREENSHOTS=<dir> npx playwright test screenshots`
// saves a picture of each screen into <dir>.
import { _electron as electron, test } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeFixtures } from './make-fixtures'

const out = process.env.SCREENSHOTS

test('screens', async () => {
  test.skip(!out, 'Set SCREENSHOTS=<folder> to save screenshots')
  test.setTimeout(120_000)
  const dataDir = mkdtempSync(join(tmpdir(), 'drawing-shots-'))
  const refsDir = mkdtempSync(join(tmpdir(), 'drawing-refs-'))
  makeFixtures(refsDir, 6)
  const app = await electron.launch({
    args: [join(__dirname, '..', 'out', 'main', 'index.js')],
    env: { ...process.env, DRAWING_DATA_DIR: dataDir }
  })
  const page = await app.firstWindow()
  await app.evaluate(({ dialog, BrowserWindow }, dir) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [dir] })) as typeof dialog.showOpenDialog
    BrowserWindow.getAllWindows()[0].setSize(1280, 820)
  }, refsDir)
  const shot = (name: string) => page.screenshot({ path: join(out!, `${name}.png`) })

  await shot('01-practice-empty')
  await page.getByRole('button', { name: 'Library' }).click()
  await page.getByRole('button', { name: 'Add folder' }).click()
  await page.waitForTimeout(800)
  await shot('02-library')
  await page.getByRole('button', { name: /Folder/ }).first().click()
  await page.waitForTimeout(500)
  await shot('03-board')

  await page.getByRole('button', { name: 'Practice' }).click()
  await page.waitForTimeout(400)
  await shot('04-practice')
  await page.getByRole('radio', { name: 'Class', exact: true }).click()
  await shot('05-practice-class')
  await page.getByRole('radio', { name: 'Memory' }).click()
  await shot('06-practice-memory')
  await page.getByRole('radio', { name: 'Classic' }).click()

  await page.getByRole('spinbutton', { name: 'Custom seconds' }).fill('3')
  await page.getByRole('spinbutton', { name: 'Number of poses' }).fill('3')
  await page.getByRole('switch', { name: /Rest between pictures/ }).click().catch(() => {})
  await page.getByRole('button', { name: 'Start drawing' }).click()
  await page.waitForTimeout(1200)
  await page.mouse.move(640, 600)
  await page.waitForTimeout(300)
  await shot('07-session')
  await page.waitForTimeout(6500)
  await shot('08-review')
  await page.getByRole('button', { name: 'Tilt' }).first().click()
  await page.getByRole('button', { name: 'Proportions' }).first().click()
  await page.getByRole('button', { name: /Draw this one again/ }).click()
  await shot('09-review-tagged')
  await page.getByRole('button', { name: 'Done' }).click()

  await page.getByRole('button', { name: 'Challenges' }).click()
  await page.getByRole('button', { name: /Speed ladder/ }).click()
  await page.getByRole('button', { name: 'Create challenge' }).click()
  await page.waitForTimeout(400)
  await shot('10-challenge')

  await page.getByRole('button', { name: 'Stats' }).click()
  await page.waitForTimeout(400)
  await shot('11-stats')
  await page.getByRole('button', { name: 'Settings' }).click()
  await shot('12-settings')

  await page.getByRole('button', { name: 'Practice' }).click()
  await page.getByRole('radio', { name: 'Memory' }).click()
  await page.getByRole('spinbutton', { name: 'Number of references' }).fill('1')
  // Capture on, with the "canvas" being part of the screen where the app shows the reference.
  await app.evaluate(({ ipcMain, screen }) => {
    const d = screen.getPrimaryDisplay()
    ipcMain.removeHandler('capture:pickRegion')
    ipcMain.handle('capture:pickRegion', () => ({ displayId: d.id, x: 0, y: 0, width: 480, height: 640 }))
  })
  await page.getByRole('switch', { name: /Capture my Clip Studio canvas/ }).click()
  await page.getByRole('button', { name: 'Pick canvas area' }).click()
  await page.getByRole('button', { name: 'Start drawing' }).click()
  await page.waitForTimeout(600)
  await shot('13-memory-study')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(3200)
  await shot('14-memory-draw')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  await page.waitForTimeout(1500)
  const canvas = page.locator('canvas')
  const box = await canvas.boundingBox()
  if (box) {
    // Circle a spot in red, like marking a mistake.
    const cx = box.x + box.width * 0.5
    const cy = box.y + box.height * 0.4
    await page.mouse.move(cx + 40, cy)
    await page.mouse.down()
    for (let a = 0; a <= 6.4; a += 0.3) await page.mouse.move(cx + 40 * Math.cos(a), cy + 30 * Math.sin(a))
    await page.mouse.up()
  }
  await shot('15-memory-reveal')
  await page.getByRole('button', { name: /Draw it again from memory/ }).click()
  await page.waitForTimeout(3200)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'End session' }).click()
  await page.waitForTimeout(1200)
  await shot('15b-memory-review')
  await page.getByRole('button', { name: 'Done' }).click()

  await page.getByRole('button', { name: 'Library' }).click()
  await page.getByRole('button', { name: /Folder/ }).first().click()
  await page.getByRole('button', { name: 'Open image 2' }).click()
  await page.getByRole('button', { name: 'Float on top' }).click()
  await page.waitForTimeout(600)
  await page.mouse.move(200, 200)
  await page.waitForTimeout(300)
  await shot('16-float')

  await app.close()
  rmSync(dataDir, { recursive: true, force: true })
  rmSync(refsDir, { recursive: true, force: true })
})
