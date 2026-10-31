import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addFolder, folderTile, imageTile, savedLibrary } from './lib'
import { makeFixtures } from './make-fixtures'

let app: ElectronApplication
let page: Page
let dataDir: string
let root: string
let rootName: string

// root/                 2 images
// root/Heads            3 images
// root/Hands            2 images
// root/Hands/Fingers    1 image
// root/Empty            none (never offered)
test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'drawing-import-'))
  root = mkdtempSync(join(tmpdir(), 'Human-'))
  rootName = root.split(/[\\/]/).pop()!
  makeFixtures(root, 2)
  makeFixtures(join(root, 'Heads'), 3)
  makeFixtures(join(root, 'Hands'), 2)
  makeFixtures(join(root, 'Hands', 'Fingers'), 1)
  mkdirSync(join(root, 'Empty'))
  app = await electron.launch({
    args: [join(__dirname, '..', 'out', 'main', 'index.js')],
    env: { ...process.env, DRAWING_DATA_DIR: dataDir }
  })
  page = await app.firstWindow()
  await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [dir] })) as typeof dialog.showOpenDialog
  }, root)
  await page.getByRole('button', { name: 'Library' }).click()
})

test.afterAll(async () => {
  await app?.close()
  rmSync(dataDir, { recursive: true, force: true })
  rmSync(root, { recursive: true, force: true })
})

const sheet = () => page.getByRole('dialog', { name: 'Add folder' })
const trail = () => page.getByRole('navigation', { name: 'Folder path' })
const images = () => page.getByRole('button', { name: /, image$/ })

test('a folder with sub-folders asks, previews, and keeps its structure all levels down', async () => {
  await addFolder(page)
  await expect(sheet()).toBeVisible()
  // Only sub-folders that hold images are offered.
  await expect(sheet().getByRole('group', { name: /Sub-folders to include/ }).getByText('Heads')).toBeVisible()
  await expect(sheet().getByText('Empty')).toHaveCount(0)
  // Keeping the structure is the default, and the preview shows the result.
  await expect(sheet().getByRole('radio', { name: /Keep the folder structure/ })).toBeChecked()
  const preview = sheet().getByRole('region', { name: 'What will be added' })
  await expect(preview).toContainText('4 folders, 8 images')
  await expect(preview).toContainText('Fingers')
  await sheet().getByRole('button', { name: 'Add' }).click()
  await expect(page.getByText(new RegExp(`Added “${rootName}”: 4 folders, 8 images`))).toBeVisible()

  // The folder holds its own two images and its sub-folders: no made-up layer in between.
  await folderTile(page, rootName).click()
  await expect(folderTile(page, 'Heads')).toHaveAccessibleName(/3 images/)
  await expect(images()).toHaveCount(2)
  await expect(page.getByText(/\(loose images\)/)).toHaveCount(0)
  // Hands holds its own images and Fingers.
  await folderTile(page, 'Hands').click()
  await expect(images()).toHaveCount(2)
  await expect(folderTile(page, 'Fingers')).toHaveAccessibleName(/1 image/)
  await expect(page.getByText(/Linked to .*Hands/)).toBeVisible()
  await trail().getByRole('button', { name: 'Library' }).click()
})

test('a rescan adds new files and new sub-folders; your files are never moved', async () => {
  makeFixtures(join(root, 'Feet'), 1)
  await folderTile(page, rootName).click()
  await page.getByRole('button', { name: 'Rescan' }).click()
  await expect(page.getByText(/1 new image, 1 new folder/)).toBeVisible()
  await expect(folderTile(page, 'Feet')).toBeVisible()
  // Removing a sub-folder from the library keeps it out of later rescans.
  await page.getByRole('checkbox', { name: 'Select Feet' }).click()
  await page.keyboard.press('Delete')
  await page.getByRole('dialog', { name: 'Delete' }).getByRole('button', { name: 'Delete everything inside too' }).click()
  await page.getByRole('button', { name: 'Rescan' }).click()
  await expect(page.getByText(/No new images/)).toBeVisible()
  await expect(folderTile(page, 'Feet')).toHaveCount(0)
  rmSync(join(root, 'Feet'), { recursive: true, force: true })
  await trail().getByRole('button', { name: 'Library' }).click()
})

test('"only the top folder" leaves sub-folders out, also on rescan', async () => {
  await addFolder(page)
  await sheet().getByText(/Only the images directly in/).click()
  await sheet().getByRole('button', { name: 'Add' }).click()
  await expect(page.getByText(`Added 2 images from “${rootName}”.`)).toBeVisible()
  await folderTile(page, new RegExp(`^${rootName}, folder, 2 images$`)).click()
  await expect(page.getByText(/\(not its sub-folders\)/)).toBeVisible()
  await page.getByRole('button', { name: 'Rescan' }).click()
  await expect(page.getByText('No new images.')).toBeVisible()
  await expect(images()).toHaveCount(2)
  await trail().getByRole('button', { name: 'Library' }).click()
})

test('"one folder" with copy keeps its own copies; "remember" stops the question', async () => {
  await addFolder(page)
  await sheet().getByText('One folder with everything').click()
  await sheet().getByText('Copy the images into the app').click()
  await sheet().getByText('Remember my choice').click()
  await sheet().getByRole('button', { name: 'Add' }).click()
  await expect(page.getByText(`Added 8 images from “${rootName}”.`)).toBeVisible()
  const lib = await savedLibrary(page)
  const copied = lib.assets.filter((a) => a.storage === 'stored')
  expect(copied.every((a) => a.path.startsWith(dataDir))).toBe(true)
  // Files with the same bytes (the fixture makes a few) share one stored asset.
  expect(copied).toHaveLength(new Set(copied.map((a) => a.sha256)).size)
  // A copied folder doesn't follow the disk folder.
  const flat = lib.folders.find((f) => !f.parentId && f.name === rootName && !f.source)
  expect(flat).toBeTruthy()
  expect(lib.images.filter((i) => i.folderId === flat!.id)).toHaveLength(8)

  // Remembered: the next add happens straight away.
  await addFolder(page)
  await expect(sheet()).toHaveCount(0)
  await expect(page.getByText(`Added 8 images from “${rootName}”.`)).toBeVisible()
  await expect(imageTile(page, 'pose-01')).toHaveCount(0)
})
