import { _electron as electron, expect, test } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeFixtures } from './make-fixtures'

test('v0.1 data opens: categories become tags, a backup is kept, sessions are untouched', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'drawing-v1-'))
  const data = join(userData, 'data')
  mkdirSync(data)
  const refs = mkdtempSync(join(tmpdir(), 'drawing-refs-'))
  const [img] = makeFixtures(refs, 1)
  const boards = [{ id: 'b1', name: 'Old hands', kind: 'folder', category: 'hands', source: refs, images: [{ id: 'i1', path: img }], createdAt: 1 }]
  const sessions = [
    {
      id: 's1',
      startedAt: Date.now() - 3600_000,
      endedAt: Date.now() - 3000_000,
      activeMs: 600_000,
      plan: { boardIds: ['b1'], mode: 'classic', seconds: 60, count: 10, blocks: [], shuffle: true, rest: { enabled: false, seconds: 5 }, review: true, capture: false },
      poses: [{ imageId: 'i1', imagePath: img, plannedSeconds: 60, spentMs: 60_000, skipped: false, mistakes: ['tilt'], redo: false }],
      finished: true,
      reviewed: true,
      pagePhotos: []
    }
  ]
  writeFileSync(join(data, 'boards.json'), JSON.stringify(boards))
  writeFileSync(join(data, 'sessions.json'), JSON.stringify(sessions))

  const app = await electron.launch({
    args: [join(__dirname, '..', 'out', 'main', 'index.js')],
    env: { ...process.env, DRAWING_DATA_DIR: userData }
  })
  const page = await app.firstWindow()
  await page.getByRole('button', { name: 'Library' }).click()
  await expect(page.getByRole('combobox', { name: 'Tag' }).getByRole('option', { name: 'Hands' })).toBeAttached()
  await expect(page.getByText('Linked folder · hands')).toBeVisible()
  await page.getByRole('button', { name: 'Stats' }).click()
  await expect(page.getByText('Reviewed')).toBeVisible()

  const backups = readdirSync(join(data, 'backups'))
  expect(backups).toHaveLength(1)
  expect(existsSync(join(data, 'backups', backups[0], 'boards.json'))).toBe(true)
  await app.close()
  expect(JSON.parse(readFileSync(join(data, 'settings.json'), 'utf8')).schemaVersion).toBe(4)
  // The collection became a folder (same id) holding its image (same id as an asset).
  const lib = JSON.parse(readFileSync(join(data, 'library.json'), 'utf8'))
  expect(lib.folders[0]).toMatchObject({ id: 'b1', name: 'Old hands', tags: ['hands'] })
  expect(lib.images[0]).toMatchObject({ assetId: 'i1', folderId: 'b1' })
  rmSync(userData, { recursive: true, force: true })
  rmSync(refs, { recursive: true, force: true })
})

test('v0.2.5 data opens as one folder tree: collections are folders, history, favorites and presets still match', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'drawing-v3-'))
  const data = join(userData, 'data')
  const refs = mkdtempSync(join(tmpdir(), 'drawing-refs-'))
  const [a, b] = makeFixtures(refs, 2)
  // An image the app stored (pasted), inside the data folder.
  const storedDir = join(data, 'collections', 'pasted')
  mkdirSync(storedDir, { recursive: true })
  const stored = join(storedDir, 'aa.png')
  writeFileSync(stored, readFileSync(b))
  const boards = [
    { id: 'hands', name: 'Hands', kind: 'folder', tags: ['hands'], folderId: 'human', source: refs, images: [{ id: 'ia', path: a }, { id: 'ib', path: b }], createdAt: 1, syncedAt: 2 },
    { id: 'pasted', name: 'Pasted', kind: 'collection', tags: [], folderId: 'human', images: [{ id: 'ip', path: stored }], createdAt: 3 }
  ]
  const library = { folders: [{ id: 'human', name: 'Human', createdAt: 1 }], favoriteImages: ['ia'] }
  const plan = { boardIds: ['hands'], mode: 'classic', seconds: 60, count: 10, blocks: [], shuffle: true, rest: { enabled: false, seconds: 5 }, review: true, capture: false }
  const sessions = [
    {
      id: 's1',
      startedAt: Date.now() - 3600_000,
      endedAt: Date.now() - 3000_000,
      activeMs: 600_000,
      plan,
      boardNames: ['Hands'],
      poses: [{ imageId: 'ia', imagePath: a, plannedSeconds: 60, spentMs: 60_000, skipped: false, mistakes: ['tilt'], note: 'ribcage', redo: false, marks: { '@reference': [[{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.4 }]] } }],
      finished: true,
      reviewed: true,
      pagePhotos: []
    }
  ]
  writeFileSync(join(data, 'boards.json'), JSON.stringify(boards))
  writeFileSync(join(data, 'library.json'), JSON.stringify(library))
  writeFileSync(join(data, 'sessions.json'), JSON.stringify(sessions))
  writeFileSync(join(data, 'presets.json'), JSON.stringify([{ id: 'p1', name: 'Hands quick', plan }]))
  writeFileSync(join(data, 'settings.json'), JSON.stringify({ schemaVersion: 3, lastPlan: plan }))

  const app = await electron.launch({ args: [join(__dirname, '..', 'out', 'main', 'index.js')], env: { ...process.env, DRAWING_DATA_DIR: userData } })
  const page = await app.firstWindow()

  // Practice still has the collection picked: it is the folder "Hands" now.
  await expect(page.getByLabel('Picked')).toContainText('Hands')
  await expect(page.getByText('2 different images in all')).toBeVisible()
  // The favorite still counts.
  await page.getByRole('switch', { name: /Favorites only/ }).click()
  await expect(page.getByText('1 favorite image in these folders.')).toBeVisible()

  // The library: Human holds the two old collections as folders.
  await page.getByRole('button', { name: 'Library' }).click()
  await page.getByRole('button', { name: /^Human, folder, 2 folders/ }).click()
  await page.getByRole('button', { name: /^Hands, folder/ }).click()
  await expect(page.getByRole('button', { name: /, image$/ })).toHaveCount(2)
  await expect(page.getByText(/Linked to /)).toBeVisible()

  // History opens the old session's review with its note and marks.
  await page.getByRole('button', { name: 'History' }).click()
  await page.getByRole('searchbox', { name: 'Search sessions' }).fill('hands')
  await page.getByRole('listitem').first().getByRole('button').first().click()
  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'One thing to remember' })).toHaveValue('ribcage')

  await app.close()
  expect(readdirSync(join(data, 'backups')).some((n) => n.endsWith('-v3'))).toBe(true)
  // The stored image is where it was, and nothing was deleted at start.
  expect(existsSync(stored)).toBe(true)
  rmSync(userData, { recursive: true, force: true })
  rmSync(refs, { recursive: true, force: true })
})
