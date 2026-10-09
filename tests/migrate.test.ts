import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION } from '@shared/types'
import { boardsV1toV2, detectVersion, migrateDataDir, migrateFiles, shortcutsToCopies } from '../src/main/migrate'

const v1Board = (category: string) => ({ id: 'b', name: 'Poses', kind: 'folder', category, images: [], createdAt: 1 })

describe('migrate', () => {
  it('turns categories into tags, and "other" into no tag', () => {
    expect(boardsV1toV2([v1Board('hands'), v1Board('other')])).toEqual([
      { id: 'b', name: 'Poses', kind: 'folder', tags: ['hands'], images: [], createdAt: 1 },
      { id: 'b', name: 'Poses', kind: 'folder', tags: [], images: [], createdAt: 1 }
    ])
  })

  it('detects v0.1 data, which had no version number', () => {
    expect(detectVersion({ boards: [] })).toBe(1)
    expect(detectVersion({ settings: { theme: 'dark' } })).toBe(1)
    expect(detectVersion({})).toBe(SCHEMA_VERSION)
    expect(detectVersion({ settings: { schemaVersion: 7 } })).toBe(7)
  })

  it('stamps the current version on settings', () => {
    const out = migrateFiles({ boards: [v1Board('faces')] }, 1)
    expect(out.settings).toEqual({ schemaVersion: SCHEMA_VERSION })
  })

  it('backs up the files, then migrates them in place', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'migrate-'))
    const sessions = [{ id: 's1', poses: [] }]
    writeFileSync(join(dir, 'boards.json'), JSON.stringify([v1Board('figures')]))
    writeFileSync(join(dir, 'sessions.json'), JSON.stringify(sessions))
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ theme: 'light' }))

    const result = await migrateDataDir(dir, new Date('2026-10-09T10:00:00Z'))
    expect(result).toMatchObject({ status: 'migrated', from: 1 })

    const boards = JSON.parse(readFileSync(join(dir, 'boards.json'), 'utf8'))
    expect(boards[0].tags).toEqual(['figures'])
    expect(boards[0]).not.toHaveProperty('category')
    expect(JSON.parse(readFileSync(join(dir, 'sessions.json'), 'utf8'))).toEqual(sessions)
    expect(JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'))).toEqual({ theme: 'light', schemaVersion: SCHEMA_VERSION })

    const backup = (result as { backup: string }).backup
    expect(readdirSync(backup).sort()).toEqual(['boards.json', 'sessions.json', 'settings.json'])
    expect(JSON.parse(readFileSync(join(backup, 'boards.json'), 'utf8'))[0].category).toBe('figures')

    // Running again finds nothing to do.
    expect(await migrateDataDir(dir)).toEqual({ status: 'current' })
  })

  it('v2 → v3: a shortcut becomes a copy in that folder, and folders lose their shortcut lists', () => {
    const boards = [{ id: 'b1', name: 'Hands', folderId: 'human', images: [{ id: 'i', path: '/x/1.jpg' }] }]
    const library = { folders: [{ id: 'human', name: 'Human', shortcuts: [] }, { id: 'art', name: 'Art', shortcuts: ['b1', 'gone'] }], favoriteImages: [] }
    const out = shortcutsToCopies(boards, library) as { boards: Record<string, unknown>[]; library: { folders: Record<string, unknown>[] } }
    expect(out.boards).toHaveLength(2)
    expect(out.boards[1]).toMatchObject({ id: 'b1-in-art', name: 'Hands', folderId: 'art' })
    expect(out.library.folders.every((f) => !('shortcuts' in f))).toBe(true)
  })

  it('v2 → v3 on disk: the copy shares the image files with the original', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'migrate-'))
    const stored = join(dir, 'collections', 'b1')
    mkdirSync(stored, { recursive: true })
    writeFileSync(join(stored, 'a.png'), 'png')
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ schemaVersion: 2 }))
    writeFileSync(join(dir, 'boards.json'), JSON.stringify([{ id: 'b1', name: 'Pasted', kind: 'collection', tags: [], images: [{ id: 'i', path: join(stored, 'a.png') }] }]))
    writeFileSync(join(dir, 'library.json'), JSON.stringify({ folders: [{ id: 'f1', name: 'Art', shortcuts: ['b1'] }], favoriteImages: [] }))

    expect(await migrateDataDir(dir)).toMatchObject({ status: 'migrated', from: 2 })
    const boards = JSON.parse(readFileSync(join(dir, 'boards.json'), 'utf8'))
    expect(boards.map((b: { folderId?: string }) => b.folderId)).toEqual([undefined, 'f1'])
    expect(boards[1].images).toEqual(boards[0].images)
    expect(JSON.parse(readFileSync(join(dir, 'library.json'), 'utf8')).folders[0]).not.toHaveProperty('shortcuts')
  })

  it('leaves data from a newer app version alone', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'migrate-'))
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1 }))
    expect(await migrateDataDir(dir)).toEqual({ status: 'newer', version: SCHEMA_VERSION + 1 })
    expect(existsSync(join(dir, 'backups'))).toBe(false)
  })
})
