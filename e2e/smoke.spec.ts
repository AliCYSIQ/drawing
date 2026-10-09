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
  dataDir = mkdtempSync(join(tmpdir(), 'drawing-data-'))
  refsDir = mkdtempSync(join(tmpdir(), 'drawing-refs-'))
  makeFixtures(refsDir, 4)
  app = await electron.launch({
    args: [join(__dirname, '..', 'out', 'main', 'index.js')],
    env: { ...process.env, DRAWING_DATA_DIR: dataDir }
  })
  page = await app.firstWindow()
  // The folder dialog can't be clicked in a test; answer it with the fixture folder.
  await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [dir] })) as typeof dialog.showOpenDialog
  }, refsDir)
})

test.afterAll(async () => {
  await app?.close()
  rmSync(dataDir, { recursive: true, force: true })
  rmSync(refsDir, { recursive: true, force: true })
})

test('add a folder, draw a short session, review it, see it in stats', async () => {
  await page.getByRole('button', { name: 'Library' }).click()
  await page.getByRole('button', { name: 'Add folder' }).click()
  await expect(page.getByText(/Added 4 images/)).toBeVisible()

  await page.getByRole('button', { name: 'Practice' }).click()
  await page.getByRole('spinbutton', { name: 'Custom seconds' }).fill('2')
  await page.getByRole('spinbutton', { name: 'Number of poses' }).fill('2')
  await page.getByRole('button', { name: 'Start drawing' }).click()

  await expect(page.getByText('Pose 1 of 2')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('navigation', { name: 'Poses' }).getByRole('button')).toHaveCount(2)

  await page.getByRole('button', { name: 'Tilt' }).first().click()
  await page.getByRole('button', { name: 'Done' }).click()

  await page.getByRole('button', { name: 'Stats' }).click()
  await expect(page.getByText('Reviewed')).toBeVisible()
  await expect(page.locator('dd').filter({ hasText: /^1$/ }).first()).toBeVisible()
})

test('memory mode: study, draw from memory, reveal, try again', async () => {
  await page.getByRole('button', { name: 'Practice' }).click()
  await page.getByRole('radio', { name: 'Memory' }).click()
  await page.getByRole('spinbutton', { name: 'Number of references' }).fill('1')
  await page.getByRole('spinbutton', { name: 'Attempts per reference' }).fill('2')
  await page.getByRole('button', { name: 'Start drawing' }).click()

  await expect(page.getByText('Study reference 1 of 1')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.getByText('The reference is hidden')).toBeVisible()
  await page.waitForTimeout(3500)
  await page.keyboard.press('Enter')
  await expect(page.getByText(/Compare: reference 1 of 1, attempt 1/)).toBeVisible()
  await page.getByRole('button', { name: /Draw it again from memory/ }).click()
  await expect(page.getByText(/attempt 2 of 2/)).toBeVisible()
  await page.waitForTimeout(3500)
  await page.getByRole('button', { name: 'Reveal (Enter)' }).click()
  await page.getByRole('button', { name: 'Finish session' }).click()

  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Poses' }).getByRole('button')).toHaveCount(2)
})

test('canvas capture saves the picked screen area at full resolution', async () => {
  const display = await app.evaluate(({ screen }) => {
    const d = screen.getPrimaryDisplay()
    return { id: d.id, scale: d.scaleFactor }
  })
  const path = await page.evaluate(
    (id) => window.api.capture({ displayId: id, x: 100, y: 80, width: 300, height: 200 }, 'capture-test', 0),
    display.id
  )
  expect(path).toBeTruthy()
  const size = await app.evaluate(({ nativeImage }, p) => nativeImage.createFromPath(p).getSize(), path!)
  expect(size.width).toBe(Math.round(300 * display.scale))
  expect(size.height).toBe(Math.round(200 * display.scale))
})

const windowState = () =>
  app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    return { onTop: w.isAlwaysOnTop(), opacity: w.getOpacity(), movable: w.isMovable(), resizable: w.isResizable() }
  })

const stage = () => page.locator('.stage')

test('float mode: controls show on click, not hover, and it turns off', async () => {
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Library' }).click()
  await page.getByRole('button', { name: /^drawing-refs-/ }).first().dblclick()
  await page.getByRole('button', { name: 'Open image 1' }).click()
  await page.getByRole('button', { name: 'Float on top' }).click()
  expect((await windowState()).onTop).toBe(true)

  // Hovering shows nothing in float mode; a click does.
  await page.mouse.move(150, 200)
  await expect(stage()).toHaveAttribute('data-controls', 'off')
  await page.mouse.click(150, 200)
  await expect(stage()).toHaveAttribute('data-controls', 'on')

  await page.getByRole('button', { name: 'Leave float mode' }).first().click()
  expect((await windowState()).onTop).toBe(false)
})

test('ending a session from float mode with click-through leaves a normal window', async () => {
  await page.keyboard.press('Escape') // leave the image viewer
  await page.getByRole('button', { name: 'Practice' }).click()
  await page.getByRole('radio', { name: 'Classic' }).click()
  await page.getByRole('spinbutton', { name: 'Custom seconds' }).fill('30')
  await page.getByRole('spinbutton', { name: 'Number of poses' }).fill('2')
  await page.getByRole('button', { name: 'Start drawing' }).click()
  await page.getByRole('button', { name: 'Float on top' }).click()
  await page.mouse.click(150, 200)
  await page.getByRole('button', { name: /^Click-through/ }).click()
  await page.getByRole('button', { name: 'Keep on top' }).waitFor({ state: 'attached' })
  await expect(stage()).toHaveAttribute('data-controls', 'off')
  // Linux can't lock a window's position, so isMovable() stays true there.
  expect(await windowState()).toMatchObject({ onTop: true, ...(process.platform === 'linux' ? {} : { movable: false }) })

  // Turning click-through on and off fast (Ctrl+Alt+L) must not pile up work or lose the state.
  const start = Date.now()
  await page.evaluate(async () => {
    for (let i = 0; i < 40; i++) await window.api.setFloat({ on: true, alwaysOnTop: true, opacity: 1, locked: true, clickThrough: i % 2 === 0 })
  })
  expect(Date.now() - start).toBeLessThan(5000)
  await expect.poll(() => page.evaluate(() => document.querySelector('.stage')?.getAttribute('data-controls'))).toBe('off')

  await page.waitForTimeout(3500)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible()
  expect(await windowState()).toEqual({ onTop: false, opacity: 1, movable: true, resizable: true })
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
})
