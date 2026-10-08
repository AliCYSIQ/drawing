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
  await expect(page.getByRole('group', { name: 'Filter by tag' }).getByRole('button', { name: 'Hands' })).toBeVisible()
  await expect(page.getByText('Linked folder, hands')).toBeVisible()
  await page.getByRole('button', { name: 'Stats' }).click()
  await expect(page.getByText('Reviewed')).toBeVisible()

  const backups = readdirSync(join(data, 'backups'))
  expect(backups).toHaveLength(1)
  expect(existsSync(join(data, 'backups', backups[0], 'boards.json'))).toBe(true)
  await app.close()
  expect(JSON.parse(readFileSync(join(data, 'settings.json'), 'utf8')).schemaVersion).toBe(2)
  rmSync(userData, { recursive: true, force: true })
  rmSync(refs, { recursive: true, force: true })
})
