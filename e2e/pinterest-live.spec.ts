// Talks to the real Pinterest, so it only runs when asked:
// `PINTEREST_LIVE=https://www.pinterest.com/user/board/ npx playwright test pinterest-live`
import { _electron as electron, expect, test } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const board = process.env.PINTEREST_LIVE

test('sync a public Pinterest board inside the app', async () => {
  test.skip(!board, 'Set PINTEREST_LIVE=<board url> to run')
  test.setTimeout(180_000)
  const dataDir = mkdtempSync(join(tmpdir(), 'drawing-pin-'))
  const app = await electron.launch({
    args: [join(__dirname, '..', 'out', 'main', 'index.js')],
    env: { ...process.env, DRAWING_DATA_DIR: dataDir }
  })
  const page = await app.firstWindow()
  const result = await page.evaluate((url) => window.api.importPinterest('live-test', url), board!)
  console.log(`${result.name}: ${result.images.length} images`)
  expect(result.images.length).toBeGreaterThan(25)
  expect(result.images.every((i) => existsSync(i.path))).toBe(true)
  await app.close()
  rmSync(dataDir, { recursive: true, force: true })
})
