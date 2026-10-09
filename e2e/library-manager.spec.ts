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
  dataDir = mkdtempSync(join(tmpdir(), 'drawing-manager-'))
  refsDir = mkdtempSync(join(tmpdir(), 'poses-'))
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

const name = () => refsDir.split(/[\\/]/).pop()!
const tile = (n: string) => page.getByRole('button', { name: new RegExp(`^${n}, `) })
const newFolder = async (n: string) => {
  await page.getByRole('button', { name: 'New folder' }).click()
  await page.getByRole('textbox', { name: 'New folder name' }).fill(n)
  await page.getByRole('button', { name: 'Create' }).click()
}
const trail = () => page.getByRole('navigation', { name: 'Folder path' })
const saved = async () => {
  await page.waitForTimeout(400)
  return page.evaluate(async () => ({
    boards: (await window.api.load<{ id: string; name: string; folderId?: string }[]>('boards'))!,
    folders: (await window.api.load<{ folders: { id: string; name: string; parentId?: string }[] }>('library'))!.folders
  }))
}
const folderId = async (n: string) => (await saved()).folders.find((f) => f.name === n)!.id

test('drag a collection onto a folder to move it; Ctrl+Z undoes', async () => {
  await page.getByRole('button', { name: 'Library' }).click()
  await page.getByRole('button', { name: 'Add folder' }).click()
  await newFolder('Human')
  await newFolder('Animals')
  // Folders look like folders and say what they hold.
  await expect(tile('Human')).toHaveAccessibleName(/folder, Empty/)

  await tile(name()).dragTo(tile('Human'))
  await expect(page.getByText(/Moved “.*” to “Human”/)).toBeVisible()
  await expect(tile(name())).toHaveCount(0)
  expect((await saved()).boards[0].folderId).toBe(await folderId('Human'))
  await expect(tile('Human')).toHaveAccessibleName(/1 collection/)

  await page.keyboard.press('Control+z')
  await expect(tile(name())).toBeVisible()
  expect((await saved()).boards[0].folderId).toBeUndefined()
})

test('select with Ctrl+click, then Move to… a folder', async () => {
  await tile(name()).click({ modifiers: ['Control'] })
  await expect(page.getByRole('toolbar', { name: 'Selection' })).toContainText('1 selected')
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: /Move to/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Move to' })
  await dialog.getByRole('button', { name: 'Animals' }).click()
  await dialog.getByRole('button', { name: 'Move here' }).click()
  await expect(tile(name())).toHaveCount(0)
  expect((await saved()).boards[0].folderId).toBe(await folderId('Animals'))
})

test('copy and paste makes an independent collection; right-click has the actions', async () => {
  await tile('Animals').click()
  await tile(name()).click({ button: 'right' })
  await page.getByRole('menuitem', { name: /^Copy\b.*Ctrl\+C/ }).click()
  await trail().getByRole('button', { name: 'Library' }).click()
  await page.keyboard.press('Control+v')
  await expect(page.getByText(/Copied/)).toBeVisible()
  await expect(tile(name())).toBeVisible()
  const { boards } = await saved()
  expect(boards).toHaveLength(2)
  expect(new Set(boards.map((b) => b.id)).size).toBe(2)
})

test('deleting a folder can take what is inside; Undo brings it back', async () => {
  await tile('Animals').click({ modifiers: ['Control'] })
  await page.keyboard.press('Delete')
  await page.getByRole('dialog', { name: 'Delete' }).getByRole('button', { name: 'Delete everything inside too' }).click()
  await expect(tile('Animals')).toHaveCount(0)
  expect((await saved()).boards).toHaveLength(1)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(tile('Animals')).toBeVisible()
  expect((await saved()).boards).toHaveLength(2)
})

test('Practice browses folders; ticking one practices everything inside', async () => {
  await page.getByRole('button', { name: 'Practice', exact: true }).click()
  await page.getByRole('button', { name: /^Animals, folder/ }).click()
  await expect(page.getByRole('navigation', { name: 'Folder path' })).toContainText('Animals')
  await page.getByRole('navigation', { name: 'Folder path' }).getByRole('button', { name: 'Library' }).click()
  // Start fresh: clear what was picked by default.
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Start drawing' })).toBeDisabled()
  await page.getByRole('checkbox', { name: 'Practice everything in Animals' }).click()
  await expect(page.getByText('everything inside')).toBeVisible()
  await expect(page.getByText('3 images', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start drawing' })).toBeEnabled()
})
