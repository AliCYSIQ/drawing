import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addFolder, folderTile, imageTile, savedLibrary } from './lib'
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
const tile = (n: string) => folderTile(page, n)
const newFolder = async (n: string) => {
  await page.getByRole('button', { name: 'New folder' }).click()
  await page.getByRole('textbox', { name: 'New folder name' }).fill(n)
  await page.getByRole('button', { name: 'Create' }).click()
}
const trail = () => page.getByRole('navigation', { name: 'Folder path' })
const folderId = async (n: string) => (await savedLibrary(page)).folders.find((f) => f.name === n)!.id
const parentOf = async (n: string) => (await savedLibrary(page)).folders.find((f) => f.name === n)!.parentId
const selectBox = (n: string) => page.getByRole('checkbox', { name: `Select ${n}` })

test('a click opens a folder; drag a folder onto another to move it; Ctrl+Z undoes, Ctrl+Y redoes', async () => {
  await page.getByRole('button', { name: 'Library' }).click()
  await expect(page.getByText('Your library is empty')).toBeVisible()
  await addFolder(page)
  await expect(page.getByText(/Added 3 images from/)).toBeVisible()
  await newFolder('Human')
  await newFolder('Animals')
  // Folders say what they hold; an empty one says so.
  await expect(tile('Human')).toHaveAccessibleName(/folder, Empty/)
  await expect(tile(name())).toHaveAccessibleName(/folder, 3 images/)

  // One click opens a folder, and its images are there, each its own tile.
  await tile(name()).click()
  await expect(trail()).toContainText(name())
  await expect(page.getByRole('button', { name: /, image$/ })).toHaveCount(3)
  await expect(page.getByRole('button', { name: 'Practice this folder' })).toBeVisible()
  // Up goes back to the folder above.
  await trail().getByRole('button', { name: /^Up/ }).click()
  await expect(tile('Human')).toBeVisible()

  await tile(name()).dragTo(tile('Human'))
  await expect(page.getByText(/Moved “.*” to “Human”/)).toBeVisible()
  await expect(tile(name())).toHaveCount(0)
  expect(await parentOf(name())).toBe(await folderId('Human'))
  await expect(tile('Human')).toHaveAccessibleName(/1 folder/)

  await page.keyboard.press('Control+z')
  await expect(tile(name())).toBeVisible()
  expect(await parentOf(name())).toBeUndefined()
  await page.keyboard.press('Control+y')
  await expect(tile(name())).toHaveCount(0)
  await page.keyboard.press('Control+z')
  await expect(tile(name())).toBeVisible()
})

test('the corner check selects (a click doesn’t), then Move to… a folder', async () => {
  await selectBox(name()).click()
  await expect(page.getByRole('toolbar', { name: 'Selection' })).toContainText('1 selected')
  // Still at the top level: selecting never opened it.
  await expect(tile('Animals')).toBeVisible()
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: /Move to/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Move to' })
  await dialog.getByRole('button', { name: 'Animals' }).click()
  await dialog.getByRole('button', { name: 'Move here' }).click()
  await expect(tile(name())).toHaveCount(0)
  expect(await parentOf(name())).toBe(await folderId('Animals'))
})

test('images move and copy between folders; a copy is its own entry of the same picture', async () => {
  await tile('Animals').click()
  await tile(name()).click()
  // Ctrl+click selects images without opening them.
  await imageTile(page, 'pose-01').click({ modifiers: ['Control'] })
  await imageTile(page, 'pose-02').click({ modifiers: ['Control'] })
  await expect(page.getByRole('toolbar', { name: 'Selection' })).toContainText('2 selected')
  await page.keyboard.press('Control+c')
  await trail().getByRole('button', { name: 'Library' }).click()
  await tile('Human').click()
  await page.keyboard.press('Control+v')
  await expect(page.getByText(/Copied 2 images to “Human”/)).toBeVisible()
  await expect(page.getByRole('button', { name: /, image$/ })).toHaveCount(2)
  const lib = await savedLibrary(page)
  const human = lib.folders.find((f) => f.name === 'Human')!.id
  const copies = lib.images.filter((i) => i.folderId === human)
  const originals = lib.images.filter((i) => i.name === 'pose-01' || i.name === 'pose-02').filter((i) => i.folderId !== human)
  expect(copies.map((c) => c.assetId).sort()).toEqual(originals.map((o) => o.assetId).sort())
  expect(lib.assets).toHaveLength(3)

  // Right-click has the actions; Delete removes the entry from the library only.
  await imageTile(page, 'pose-01').click({ button: 'right' })
  await page.getByRole('menuitem', { name: /^Delete/ }).click()
  await expect(page.getByRole('button', { name: /, image$/ })).toHaveCount(1)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('button', { name: /, image$/ })).toHaveCount(2)
})

test('F2 renames; deleting a folder can take what is inside; Undo brings it back', async () => {
  await trail().getByRole('button', { name: 'Library' }).click()
  await selectBox('Human').click()
  await page.keyboard.press('F2')
  await page.getByRole('textbox', { name: 'New name for Human' }).fill('People')
  await page.keyboard.press('Enter')
  await expect(tile('People')).toBeVisible()
  // Esc clears the selection, so only Animals is deleted next.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('toolbar', { name: 'Selection' })).toHaveCount(0)

  await selectBox('Animals').click()
  await page.keyboard.press('Delete')
  await page.getByRole('dialog', { name: 'Delete' }).getByRole('button', { name: 'Delete everything inside too' }).click()
  await expect(tile('Animals')).toHaveCount(0)
  expect((await savedLibrary(page)).images).toHaveLength(2)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(tile('Animals')).toBeVisible()
  expect((await savedLibrary(page)).images).toHaveLength(5)
})

test('Practice: opening a folder never picks it; the check picks it with everything inside', async () => {
  await page.getByRole('button', { name: 'Practice', exact: true }).click()
  // Start fresh: clear what was picked by default.
  const clear = page.getByRole('button', { name: 'Clear', exact: true })
  if (await clear.isVisible()) await clear.click()
  await expect(page.getByRole('button', { name: 'Start drawing' })).toBeDisabled()
  await page.getByRole('button', { name: /^Animals, folder/ }).click()
  await expect(page.getByRole('navigation', { name: 'Folder path' })).toContainText('Animals')
  await expect(page.getByRole('button', { name: 'Start drawing' })).toBeDisabled()
  await page.getByRole('button', { name: 'Pick this folder' }).click()
  await expect(page.getByText('3 different images in all')).toBeVisible()
  await page.getByRole('navigation', { name: 'Folder path' }).getByRole('button', { name: 'Library' }).click()
  await expect(page.getByRole('checkbox', { name: 'Pick Animals to practice' })).toBeChecked()
  // Picking People too: its images are copies of the same pictures, so still 3 different ones.
  await page.getByRole('checkbox', { name: 'Pick People to practice' }).click()
  await expect(page.getByText('3 different images in all')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start drawing' })).toBeEnabled()
})

test('every image zooms the same way: scroll zooms, double-click fits again', async () => {
  await page.getByRole('button', { name: 'Library' }).click()
  await tile('Animals').click()
  await tile(name()).click()
  await imageTile(page, 'pose-01').click()
  const stage = page.locator('.stage')
  await stage.hover()
  await page.mouse.wheel(0, -400)
  await expect(page.getByRole('button', { name: 'Fit' })).toBeVisible()
  await expect(page.getByText(/^\d+%$/)).not.toHaveText('100%')
  await stage.dblclick({ position: { x: 300, y: 300 } })
  await expect(page.getByRole('button', { name: 'Fit' })).toHaveCount(0)
  // A new image starts unzoomed.
  await page.mouse.wheel(0, -400)
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Fit' })).toHaveCount(0)
  await page.keyboard.press('Escape')
})

test('“Practice this folder” in the Library picks just that folder', async () => {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Library' }).click()
  await tile('People').click()
  await page.getByRole('button', { name: 'Practice this folder' }).click()
  await expect(page.getByRole('heading', { name: 'What do you want to draw?' })).toBeVisible()
  await expect(page.getByLabel('Picked')).toContainText('People')
  await expect(page.getByLabel('Picked')).not.toContainText('Animals')
  await expect(page.getByText('2 different images in all')).toBeVisible()
})
