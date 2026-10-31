import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addFolder } from './lib'
import { makeFixtures } from './make-fixtures'

const main = join(__dirname, '..', 'out', 'main', 'index.js')

test('a change made just before closing is saved', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'drawing-data-'))
  const app = await electron.launch({ args: [main], env: { ...process.env, DRAWING_DATA_DIR: dataDir } })
  const page = await app.firstWindow()
  await page.getByRole('button', { name: 'Settings' }).click()
  // Settings run from source: updates are explained, not offered.
  await expect(page.getByText('Updates work in the installed app')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Check now' })).toBeDisabled()

  await page.getByRole('radio', { name: 'Newsprint' }).click()
  // Close at once: the save that normally waits a moment must happen first.
  await app.close()
  const settings = JSON.parse(readFileSync(join(dataDir, 'data', 'settings.json'), 'utf8'))
  expect(settings.theme).toBe('light')
  rmSync(dataDir, { recursive: true, force: true })
})

test('closing the app in the middle of a session keeps it, as stopped early', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'drawing-data-'))
  const refs = mkdtempSync(join(tmpdir(), 'refs-'))
  makeFixtures(refs, 2)
  const app = await electron.launch({ args: [main], env: { ...process.env, DRAWING_DATA_DIR: dataDir } })
  const page = await app.firstWindow()
  await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [dir] })) as typeof dialog.showOpenDialog
  }, refs)
  await page.getByRole('button', { name: 'Library' }).click()
  await addFolder(page)
  await page.getByRole('button', { name: 'Practice', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Custom seconds' }).fill('60')
  await page.getByRole('spinbutton', { name: 'Number of poses' }).fill('3')
  await page.getByRole('button', { name: 'Start drawing' }).click()
  await page.waitForTimeout(4000)
  await app.close()
  const sessions = JSON.parse(readFileSync(join(dataDir, 'data', 'sessions.json'), 'utf8'))
  expect(sessions).toHaveLength(1)
  expect(sessions[0].finished).toBe(false)
  expect(sessions[0].activeMs).toBeGreaterThan(3000)
  rmSync(dataDir, { recursive: true, force: true })
  rmSync(refs, { recursive: true, force: true })
})
