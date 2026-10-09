import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
const boards = async () => {
  await page.waitForTimeout(400)
  return page.evaluate(async () => (await window.api.load<{ name: string; kind: string; folderId?: string; images: { path: string }[] }[]>('boards'))!)
}

test('a folder with sub-folders asks, previews, and keeps its structure all levels down', async () => {
  await page.getByRole('button', { name: 'Add folder' }).click()
  await expect(sheet()).toBeVisible()
  // Only sub-folders that hold images are offered.
  await expect(sheet().getByRole('group', { name: /Sub-folders to include/ }).getByText('Heads')).toBeVisible()
  await expect(sheet().getByText('Empty')).toHaveCount(0)
  // Keeping the structure is the default, and the preview shows the result.
  await expect(sheet().getByRole('radio', { name: /Keep the folder structure/ })).toBeChecked()
  const preview = sheet().getByRole('region', { name: 'What will be added' })
  await expect(preview).toContainText('2 folders, 4 collections, 8 images')
  await expect(preview).toContainText('Fingers')
  await sheet().getByRole('button', { name: 'Add' }).click()
  await expect(page.getByText(/Added 4 collections \(8 images\) in the folder .*, with 1 folder inside/)).toBeVisible()

  await page.getByRole('button', { name: new RegExp(`^${rootName}, folder`) }).dblclick()
  await expect(page.getByRole('button', { name: /^Heads, 3 images/ })).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(`\\(loose images\\), 2 images`) })).toBeVisible()
  // Hands has a sub-folder, so it is a folder holding its own images and Fingers.
  await page.getByRole('button', { name: /^Hands, folder/ }).dblclick()
  await expect(page.getByRole('button', { name: /^Hands \(loose images\), 2 images/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Fingers, 1 images/ })).toBeVisible()
  await page.getByRole('navigation', { name: 'Folder path' }).getByRole('button', { name: 'Library' }).click()
})

test('"only the top folder" leaves sub-folders out, also on rescan', async () => {
  await page.getByRole('button', { name: 'Add folder' }).click()
  await sheet().getByText(/Only the images directly in/).click()
  await sheet().getByRole('button', { name: 'Add' }).click()
  await page.getByRole('button', { name: new RegExp(`^${rootName}, 2 images`) }).dblclick()
  await expect(page.getByText(/\(not its sub-folders\)/)).toBeVisible()
  await page.getByRole('button', { name: 'Rescan folder' }).click()
  await expect(page.getByText('2 images in the folder.')).toBeVisible()
  await page.getByRole('button', { name: 'Library', exact: true }).first().click()
})

test('"one collection" with copy keeps its own copies; "remember" stops the question', async () => {
  await page.getByRole('button', { name: 'Library', exact: true }).first().click()
  await page.getByRole('button', { name: 'Add folder' }).click()
  await sheet().getByText('One collection with everything').click()
  await sheet().getByText('Copy the images into the app').click()
  await sheet().getByText('Remember my choice').click()
  await sheet().getByRole('button', { name: 'Add' }).click()
  await expect(page.getByText(`Added 8 images from ${rootName}.`)).toBeVisible()
  const copied = (await boards()).find((b) => b.kind === 'collection')!
  expect(copied.images).toHaveLength(8)
  expect(copied.images.every((i) => i.path.startsWith(dataDir))).toBe(true)

  // Remembered: the next add happens straight away.
  await page.getByRole('button', { name: 'Add folder' }).click()
  await expect(sheet()).toHaveCount(0)
  await expect(page.getByText(`Added 8 images from ${rootName}.`)).toBeVisible()
})
