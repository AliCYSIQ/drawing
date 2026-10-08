import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const launch = (dataDir: string) =>
  electron.launch({
    args: [join(__dirname, '..', 'out', 'main', 'index.js')],
    env: { ...process.env, DRAWING_DATA_DIR: dataDir }
  })

test('the window reopens where it was, and maximized when it was', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'drawing-window-'))
  const want = { x: 120, y: 90, width: 1100, height: 720 }

  let app = await launch(dataDir)
  await app.firstWindow()
  await app.evaluate(({ BrowserWindow }, b) => BrowserWindow.getAllWindows()[0].setBounds(b), want)
  await app.close()

  app = await launch(dataDir)
  await app.firstWindow()
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())).toEqual(want)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize())
  await app.close()

  app = await launch(dataDir)
  const page = await app.firstWindow()
  await page.waitForTimeout(500)
  const state = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    return { maximized: w.isMaximized(), normal: w.getNormalBounds() }
  })
  expect(state.maximized).toBe(true)
  expect(state.normal).toEqual(want)
  await app.close()
  rmSync(dataDir, { recursive: true, force: true })
})
