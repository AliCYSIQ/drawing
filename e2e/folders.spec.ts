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
const tile = (name: string) => page.getByRole('button', { name: new RegExp(`^${name}`) })
const collectionName = () => refsDir.split(/[\\/]/).pop()!

test('collections move into folders, copies put them in a second folder, and folders delete safely', async () => {
  await page.getByRole('button', { name: 'Library' }).click()
  await page.getByRole('button', { name: 'Add folder' }).click()
  await newFolder('Human')
  await newFolder('Animals')
  await expect(tile('Human')).toBeVisible()

  // Move the collection into Human: it leaves the top level, like a file in Windows.
  await tile(collectionName()).dblclick()
  await page.getByRole('combobox', { name: 'Folder', exact: true }).selectOption({ label: 'Human' })
  await expect(page.getByRole('button', { name: 'Human' })).toBeVisible() // back link now says Human
  await page.getByRole('button', { name: 'Human' }).click()
  await expect(tile(collectionName())).toBeVisible()
  await page.getByRole('navigation', { name: 'Folder path' }).getByRole('button', { name: 'Library' }).click()
  await expect(tile(collectionName())).toHaveCount(0)

  // To have it in Animals too, copy it there: a separate collection with the same images.
  await tile('Human').dblclick()
  await tile(collectionName()).dblclick()
  await page.getByRole('button', { name: 'Copy to…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Copy to' })
  await dialog.getByRole('button', { name: 'Animals' }).click()
  await dialog.getByRole('button', { name: 'Copy here' }).click()
  await expect(page.getByText(/Copied .* to “Animals”/)).toBeVisible()
  await page.getByRole('button', { name: 'Human' }).click()
  await page.getByRole('navigation', { name: 'Folder path' }).getByRole('button', { name: 'Library' }).click()
  await tile('Animals').dblclick()
  await expect(tile(collectionName())).toBeVisible()

  // Deleting Human keeps the collection: it moves up to the top level.
  await page.getByRole('navigation', { name: 'Folder path' }).getByRole('button', { name: 'Library' }).click()
  await tile('Human').dblclick()
  await page.getByRole('button', { name: 'Delete folder' }).click()
  await page.getByRole('button', { name: /Delete folder \(keep/ }).click()
  await expect(tile(collectionName())).toBeVisible()
  await expect(tile('Human')).toHaveCount(0)
})

test('search finds collections by name or tag, anywhere', async () => {
  await tile(collectionName()).dblclick()
  await page.getByRole('combobox', { name: 'Add a tag' }).fill('gesture')
  await page.keyboard.press('Enter')
  await page.getByRole('combobox', { name: 'Folder', exact: true }).selectOption({ label: 'Animals' })
  await page.getByRole('button', { name: 'Animals' }).click()
  await page.getByRole('navigation', { name: 'Folder path' }).getByRole('button', { name: 'Library' }).click()
  await page.getByRole('searchbox', { name: 'Search collections' }).fill('gesture')
  await expect(page.getByText('In Animals')).toBeVisible()
})
