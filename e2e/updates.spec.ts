import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
