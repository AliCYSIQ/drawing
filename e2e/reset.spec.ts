import { _electron as electron, expect, test } from '@playwright/test'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeFixtures } from './make-fixtures'

test('start over keeping the library, then restore the backup', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'drawing-reset-'))
  const refsDir = mkdtempSync(join(tmpdir(), 'refs-'))
  makeFixtures(refsDir, 3)
  const app = await electron.launch({ args: [join(__dirname, '..', 'out', 'main', 'index.js')], env: { ...process.env, DRAWING_DATA_DIR: dataDir } })
  const page = await app.firstWindow()
  await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [dir] })) as typeof dialog.showOpenDialog
  }, refsDir)
  const data = (name: string) => join(dataDir, 'data', name)
  const read = (name: string) => JSON.parse(readFileSync(data(name), 'utf8'))

  // Some data: a collection, a skill, a short session.
  await page.getByRole('button', { name: 'Library' }).click()
  await page.getByRole('button', { name: 'Add folder' }).click()
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('textbox', { name: 'New skill name' }).fill('Gesture')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Practice', exact: true }).click()
  await page.getByRole('radio', { name: 'Classic' }).click()
  await page.getByRole('spinbutton', { name: 'Custom seconds' }).fill('2')
  await page.getByRole('spinbutton', { name: 'Number of poses' }).fill('2')
  await page.getByRole('button', { name: 'Start drawing' }).click()
  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Finish' }).click()
  await page.waitForTimeout(400)
  expect(read('sessions.json')).toHaveLength(1)

  // Start over, keeping the library.
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Start over…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Start over' })
  await dialog.getByRole('button', { name: 'Keep my library' }).click()
  const clear = dialog.getByRole('button', { name: 'Clear and start over' })
  await expect(clear).toBeDisabled()
  await dialog.getByRole('textbox', { name: 'Type reset to confirm' }).fill('reset')
  await clear.click()

  // The page reloads: history and skills are empty, the library is still there.
  await expect(page.getByRole('heading', { name: 'What do you want to draw?' })).toBeVisible({ timeout: 10_000 })
  await expect.poll(() => existsSync(data('sessions.json'))).toBe(false)
  expect(read('boards.json')).toHaveLength(1)
  expect(existsSync(data('skills.json'))).toBe(false)
  expect(read('settings.json').schemaVersion).toBeGreaterThan(0)
  const backups = readdirSync(data('backups'))
  expect(backups.some((b) => b.endsWith('before-reset'))).toBe(true)

  // Restore brings the sessions and skill back.
  await page.getByRole('button', { name: 'Settings' }).click()
  const list = page.getByRole('list', { name: 'Backups' })
  await expect(list).toContainText('Before starting over')
  await list.getByRole('button', { name: 'Restore…' }).first().click()
  await list.getByRole('button', { name: 'Restore it' }).click()
  await expect(page.getByRole('heading', { name: 'What do you want to draw?' })).toBeVisible({ timeout: 10_000 })
  await expect.poll(() => existsSync(data('sessions.json'))).toBe(true)
  expect(read('sessions.json')).toHaveLength(1)
  expect(read('skills.json')).toHaveLength(1)
  await page.getByRole('button', { name: 'History' }).click()
  await expect(page.getByRole('list').getByRole('listitem')).toHaveCount(1)

  await app.close()
  rmSync(dataDir, { recursive: true, force: true })
  rmSync(refsDir, { recursive: true, force: true })
})
