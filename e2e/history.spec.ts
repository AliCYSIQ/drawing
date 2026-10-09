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
  dataDir = mkdtempSync(join(tmpdir(), 'drawing-history-'))
  refsDir = mkdtempSync(join(tmpdir(), 'figures-'))
  makeFixtures(refsDir, 3)
  app = await electron.launch({
    args: [join(__dirname, '..', 'out', 'main', 'index.js')],
    env: { ...process.env, DRAWING_DATA_DIR: dataDir }
  })
  page = await app.firstWindow()
  await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [dir] })) as typeof dialog.showOpenDialog
  }, refsDir)
})

test.afterAll(async () => {
  await app?.close()
  rmSync(dataDir, { recursive: true, force: true })
  rmSync(refsDir, { recursive: true, force: true })
})

test('History finds a session by its note, filters it, and a heatmap day opens it', async () => {
  await page.getByRole('button', { name: 'Library' }).click()
  await page.getByRole('button', { name: 'Add folder' }).click()
  await page.getByRole('button', { name: 'Practice', exact: true }).click()
  await page.getByRole('radio', { name: 'Classic' }).click()
  await page.getByRole('spinbutton', { name: 'Custom seconds' }).fill('2')
  await page.getByRole('spinbutton', { name: 'Number of poses' }).fill('2')
  await page.getByRole('button', { name: 'Start drawing' }).click()
  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('textbox', { name: 'One thing to remember' }).fill('ribcage tilts the other way')
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Finish' }).click()

  await page.getByRole('button', { name: 'History' }).click()
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible()
  await expect(page.getByText('“ribcage tilts the other way”')).toBeVisible()

  await page.getByRole('searchbox', { name: 'Search sessions' }).fill('ribcage')
  await expect(page.getByText('1 session', { exact: false }).first()).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search sessions' }).fill('elbow')
  await expect(page.getByText('No sessions match')).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters' }).click()

  await page.getByRole('button', { name: 'Memory', exact: true }).click()
  await expect(page.getByText('No sessions match')).toBeVisible()
  await page.getByRole('button', { name: 'Memory', exact: true }).click()
  // The collection's name is shown and searchable.
  await page.getByRole('searchbox', { name: 'Search sessions' }).fill(refsDir.split(/[\\/]/).pop()!)
  await expect(page.getByText('“ribcage tilts the other way”')).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters' }).click()

  // Stats: a day on the heatmap opens History for that day.
  await page.getByRole('button', { name: 'Stats' }).click()
  await page.locator('svg[aria-label^="Practice minutes"] rect.cursor-pointer').first().click()
  await expect(page.getByRole('button', { name: 'Show every day' })).toBeVisible()
  await expect(page.getByText('“ribcage tilts the other way”')).toBeVisible()
})
