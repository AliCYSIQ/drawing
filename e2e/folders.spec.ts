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
  dataDir = mkdtempSync(join(tmpdir(), 'drawing-folders-'))
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

const newFolder = async (name: string) => {
  await page.getByRole('button', { name: 'New folder' }).click()
  await page.getByRole('textbox', { name: 'New folder name' }).fill(name)
  await page.getByRole('button', { name: 'Create' }).click()
}
const tile = (name: string) => folderTile(page, name)
const refsName = () => refsDir.split(/[\\/]/).pop()!
const toTop = () => page.getByRole('navigation', { name: 'Folder path' }).getByRole('button', { name: 'Library' }).click()

test('a folder holds images and folders at once; images copy to a second folder; folders delete safely', async () => {
  await page.getByRole('button', { name: 'Library' }).click()
  await addFolder(page)
  await newFolder('Human')
  await newFolder('Animals')

  // Move one image into Human, and put a folder in there too.
  await tile(refsName()).click()
  await imageTile(page, 'pose-01').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Move to…' }).click()
  const move = page.getByRole('dialog', { name: 'Move to' })
  await move.getByRole('button', { name: 'Human' }).click()
  await move.getByRole('button', { name: 'Move here' }).click()
  await expect(page.getByText(/Moved “pose-01” to “Human”/)).toBeVisible()
  await toTop()
  await tile('Human').click()
  await newFolder('Hands')
  await expect(imageTile(page, 'pose-01')).toBeVisible()
  await expect(tile('Hands')).toBeVisible()

  // To have it in Animals too, copy it there.
  await imageTile(page, 'pose-01').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Copy to…' }).click()
  const copy = page.getByRole('dialog', { name: 'Copy to' })
  await copy.getByRole('button', { name: 'Animals' }).click()
  await copy.getByRole('button', { name: 'Copy here' }).click()
  await expect(page.getByText(/Copied “pose-01” to “Animals”/)).toBeVisible()
  await toTop()
  await tile('Animals').click()
  await expect(imageTile(page, 'pose-01')).toBeVisible()

  // Deleting Human keeps what's inside: it moves up to the top level.
  await toTop()
  await tile('Human').click()
  await page.getByRole('button', { name: 'More for this folder' }).click()
  await page.getByRole('menuitem', { name: 'Delete folder…' }).click()
  await page.getByRole('button', { name: /keep what’s inside/ }).click()
  await expect(tile('Human')).toHaveCount(0)
  await expect(tile('Hands')).toBeVisible()
  await expect(imageTile(page, 'pose-01')).toBeVisible()
  const lib = await savedLibrary(page)
  expect(lib.images.filter((i) => i.name === 'pose-01')).toHaveLength(2)
  expect(lib.images.find((i) => i.name === 'pose-01' && !i.folderId)).toBeTruthy()
})

test('search finds folders by name or tag, and images by name, anywhere', async () => {
  await tile('Animals').click()
  await page.getByRole('combobox', { name: 'Add a tag' }).fill('gesture')
  await page.keyboard.press('Enter')
  await toTop()
  await page.getByRole('searchbox', { name: 'Search the library' }).fill('gesture')
  await expect(tile('Animals')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Search results' })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search the library' }).fill('pose-02')
  await expect(page.getByText(`In ${refsName()}`)).toBeVisible()
  // An empty folder and an empty search say so.
  await page.getByRole('searchbox', { name: 'Search the library' }).fill('nothing like this')
  await expect(page.getByText('Nothing matches')).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search the library' }).fill('')
  await tile('Hands').click()
  await expect(page.getByText('This folder is empty')).toBeVisible()
})
