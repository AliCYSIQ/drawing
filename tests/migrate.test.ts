import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION } from '@shared/types'
import { boardsV1toV2, checkLibraryV4, detectVersion, libraryV3toV4, migrateDataDir, migrateFiles, shortcutsToCopies } from '../src/main/migrate'
import { poolFor } from '../src/renderer/src/lib/library'
import type { LibraryData } from '@shared/types'

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

  it('v3 → v4: collections become folders with their images; nothing is lost and ids stay', () => {
    const data = 'C:\\Users\\me\\AppData\\Roaming\\Drawing Practice\\data'
    const boards = [
      // A linked disk folder (sub-folders flattened, as v0.2 did), favorite and tagged.
      { id: 'hands', name: 'Hands', kind: 'folder', tags: ['hands'], folderId: 'human', favorite: true, source: 'D:\\Refs\\Hands', images: [{ id: 'h1', path: 'D:\\Refs\\Hands\\1.jpg' }, { id: 'h2', path: 'D:\\Refs\\Hands\\sub\\2.jpg' }], createdAt: 5, syncedAt: 6 },
      // Only the top images of a folder.
      { id: 'top', name: 'Top only', kind: 'folder', tags: [], source: 'D:\\Refs\\Top', recursive: false, images: [], createdAt: 5 },
      // Pasted images, stored by the app.
      { id: 'pasted', name: 'Pasted', kind: 'collection', tags: [], images: [{ id: 'p1', path: `${data}\\collections\\pasted\\aa.png` }], createdAt: 7 },
      // A Pinterest board, and a copy of it that shares its files.
      { id: 'pin', name: 'Pins', kind: 'pinterest', tags: [], source: 'https://pinterest.com/u/pins/', images: [{ id: 'q1', path: `${data}\\cache\\pinterest\\pin\\123.jpg`, sourceUrl: 'https://www.pinterest.com/pin/123/' }], createdAt: 8, syncedAt: 9 },
      { id: 'pin-in-art', name: 'Pins', kind: 'pinterest', tags: [], folderId: 'art', source: 'https://pinterest.com/u/pins/', images: [{ id: 'q1', path: `${data}\\cache\\pinterest\\pin\\123.jpg`, sourceUrl: 'https://www.pinterest.com/pin/123/' }], createdAt: 8 },
      // Picked files, with a folder that no longer exists.
      { id: 'files', name: 'Images', kind: 'files', tags: [], folderId: 'gone', images: [{ id: 'f1', path: 'E:\\x.jpg' }], createdAt: 1 }
    ]
    const library = { folders: [{ id: 'human', name: 'Human', createdAt: 1 }, { id: 'art', name: 'Art', createdAt: 2 }], favoriteImages: ['h1', 'q1'], pendingDelete: ['old'] }
    const out = libraryV3toV4(boards, library, { dataDir: data, exists: () => true }) as LibraryData
    expect(checkLibraryV4(boards, out)).toBeNull()

    const f = (id: string) => out.folders.find((x) => x.id === id)!
    expect(f('hands')).toMatchObject({ name: 'Hands', parentId: 'human', tags: ['hands'], favorite: true, source: { kind: 'disk', path: 'D:\\Refs\\Hands', include: 'flat', syncedAt: 6 } })
    expect(f('top').source).toMatchObject({ include: 'top' })
    expect(f('pin').source).toEqual({ kind: 'pinterest', url: 'https://pinterest.com/u/pins/', syncedAt: 9 })
    expect(f('pin-in-art').parentId).toBe('art')
    expect(f('files').parentId).toBeUndefined()
    expect(f('pasted').source).toBeUndefined()

    // Image ids are kept as asset ids, so history, favorites and "fresh first" still match.
    expect(out.assets.map((a) => a.id).sort()).toEqual(['f1', 'h1', 'h2', 'p1', 'q1'])
    expect(out.favoriteImages).toEqual(['h1', 'q1'])
    const a = (id: string) => out.assets.find((x) => x.id === id)!
    expect(a('h1')).toMatchObject({ storage: 'linked', origin: 'folder' })
    expect(a('p1')).toMatchObject({ storage: 'stored', origin: 'paste' })
    expect(a('q1')).toMatchObject({ storage: 'stored', origin: 'pinterest', pinId: '123' })
    expect(a('f1')).toMatchObject({ storage: 'linked', origin: 'file' })
    // The copy is its own folder of entries sharing the asset.
    expect(out.images.filter((i) => i.assetId === 'q1').map((i) => i.folderId).sort()).toEqual(['pin', 'pin-in-art'])
    expect(out.images.find((i) => i.assetId === 'h2')).toMatchObject({ folderId: 'hands', name: '2' })
    // A plan that picked the collection draws the same images from the folder.
    expect(poolFor(out, out.assets, ['hands']).map((r) => r.id).sort()).toEqual(['h1', 'h2'])
    expect(out).not.toHaveProperty('pendingDelete')
  })

  it('v3 → v4 keeps the path that still exists when a copy held an old one', () => {
    const boards = [
      { id: 'b1', name: 'A', kind: 'folder', tags: [], images: [{ id: 'x', path: 'D:\\old\\1.jpg' }], createdAt: 1 },
      { id: 'b2', name: 'A', kind: 'folder', tags: [], images: [{ id: 'x', path: 'D:\\new\\1.jpg' }], createdAt: 1 }
    ]
    const out = libraryV3toV4(boards, { folders: [] }, { dataDir: 'C:\\data', exists: (p) => p.startsWith('D:\\new') }) as LibraryData
    expect(out.assets).toEqual([expect.objectContaining({ id: 'x', path: 'D:\\new\\1.jpg' })])
  })

  it('images the app stored are known as stored even when the data folder was somewhere else then', () => {
    const boards = [{ id: 'p', name: 'Pins', kind: 'pinterest', tags: [], source: 'https://pinterest.com/u/b/', images: [{ id: 'x', path: 'D:\\Old\\Drawing Practice\\data\\cache\\pinterest\\p\\1.jpg' }], createdAt: 1 }]
    const out = libraryV3toV4(boards, { folders: [] }, { dataDir: 'C:\\Users\\me\\AppData\\Roaming\\Drawing Practice\\data', exists: () => true }) as LibraryData
    expect(out.assets[0]).toMatchObject({ storage: 'stored', origin: 'pinterest' })
  })

  it('the check stops a migration that would lose an image', () => {
    const boards = [{ id: 'b', name: 'B', kind: 'folder', tags: [], images: [{ id: 'x', path: '/1.jpg' }], createdAt: 1 }]
    const out = libraryV3toV4(boards, { folders: [] }, { dataDir: '', exists: () => true }) as LibraryData
    expect(checkLibraryV4(boards, { ...out, images: [] })).toMatch(/not carried over/)
    expect(checkLibraryV4(boards, { ...out, assets: [] })).toMatch(/no asset/)
  })

  it('v3 → v4 on disk: backed up, written whole, done once, and nothing on disk moves', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'migrate-'))
    const stored = join(dir, 'collections', 'b1')
    mkdirSync(stored, { recursive: true })
    writeFileSync(join(stored, 'a.png'), 'png')
    const boards = [{ id: 'b1', name: 'Pasted', kind: 'collection', tags: ['t'], images: [{ id: 'i', path: join(stored, 'a.png') }], createdAt: 1 }]
    const sessions = [{ id: 's1', plan: { boardIds: ['b1'] }, poses: [{ imageId: 'i', imagePath: join(stored, 'a.png') }] }]
    const presets = [{ id: 'p', name: 'Quick', plan: { boardIds: ['b1'] } }]
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ schemaVersion: 3, theme: 'dark' }))
    writeFileSync(join(dir, 'boards.json'), JSON.stringify(boards))
    writeFileSync(join(dir, 'library.json'), JSON.stringify({ folders: [], favoriteImages: ['i'] }))
    writeFileSync(join(dir, 'sessions.json'), JSON.stringify(sessions))
    writeFileSync(join(dir, 'presets.json'), JSON.stringify(presets))

    const result = await migrateDataDir(dir, new Date('2026-10-31T10:00:00Z'))
    expect(result).toMatchObject({ status: 'migrated', from: 3 })
    const lib = JSON.parse(readFileSync(join(dir, 'library.json'), 'utf8')) as LibraryData
    expect(lib.format).toBe(4)
    expect(lib.folders[0]).toMatchObject({ id: 'b1', name: 'Pasted', tags: ['t'] })
    expect(lib.images[0]).toMatchObject({ assetId: 'i', folderId: 'b1' })
    expect(lib.assets[0]).toMatchObject({ id: 'i', storage: 'stored' })
    // History, presets and the old collections file are untouched; the image file is where it was.
    expect(JSON.parse(readFileSync(join(dir, 'sessions.json'), 'utf8'))).toEqual(sessions)
    expect(JSON.parse(readFileSync(join(dir, 'presets.json'), 'utf8'))).toEqual(presets)
    expect(JSON.parse(readFileSync(join(dir, 'boards.json'), 'utf8'))).toEqual(boards)
    expect(existsSync(join(stored, 'a.png'))).toBe(true)
    expect(JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'))).toEqual({ schemaVersion: SCHEMA_VERSION, theme: 'dark' })
    const backup = (result as { backup: string }).backup
    expect(JSON.parse(readFileSync(join(backup, 'library.json'), 'utf8'))).toEqual({ folders: [], favoriteImages: ['i'] })
    expect(readdirSync(dir).filter((f) => f.endsWith('.migrating'))).toEqual([])
    expect(await migrateDataDir(dir)).toEqual({ status: 'current' })
  })

  it('a migration cut short (library written, version not yet) finishes at the next start without redoing the library', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'migrate-'))
    const boards = [{ id: 'b1', name: 'A', kind: 'folder', tags: [], images: [{ id: 'i', path: 'D:\\a.jpg' }], createdAt: 1 }]
    const done = libraryV3toV4(boards, { folders: [], favoriteImages: [] }, { dataDir: dir, exists: () => true })
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ schemaVersion: 3 }))
    writeFileSync(join(dir, 'boards.json'), JSON.stringify(boards))
    writeFileSync(join(dir, 'library.json'), JSON.stringify(done))
    writeFileSync(join(dir, 'library.json.migrating'), '{"half":')
    expect(await migrateDataDir(dir)).toMatchObject({ status: 'migrated', from: 3 })
    expect(JSON.parse(readFileSync(join(dir, 'library.json'), 'utf8'))).toEqual(done)
    expect(JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')).schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('two collections that shared an id both become folders', () => {
    const boards = [
      { id: 'b1', name: 'A', kind: 'folder', tags: [], images: [{ id: 'x', path: '/1.jpg' }], createdAt: 1 },
      { id: 'b1', name: 'B', kind: 'folder', tags: [], images: [{ id: 'y', path: '/2.jpg' }], createdAt: 1 }
    ]
    const out = libraryV3toV4(boards, { folders: [] }, { dataDir: '', exists: () => true }) as LibraryData
    expect(out.folders.map((f) => f.id)).toEqual(['b1', 'b1-2'])
    expect(checkLibraryV4(boards, out)).toBeNull()
  })

  it('a migration that fails its check writes nothing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'migrate-'))
    // A damaged library file that claims to be done already, with an image that has no asset.
    const broken = { format: 4, folders: [{ id: 'b1', name: 'A', createdAt: 1 }], images: [{ id: 'e', assetId: 'nope', folderId: 'b1', name: 'e', createdAt: 1 }], assets: [], favoriteImages: [] }
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ schemaVersion: 3 }))
    writeFileSync(join(dir, 'boards.json'), JSON.stringify([{ id: 'b1', name: 'A', kind: 'folder', tags: [], images: [], createdAt: 1 }]))
    writeFileSync(join(dir, 'library.json'), JSON.stringify(broken))
    await expect(migrateDataDir(dir)).rejects.toThrow(/no asset/)
    expect(JSON.parse(readFileSync(join(dir, 'library.json'), 'utf8'))).toEqual(broken)
    expect(JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')).schemaVersion).toBe(3)
    expect(readdirSync(dir).filter((f) => f.endsWith('.migrating'))).toEqual([])
  })

  it('leaves data from a newer app version alone', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'migrate-'))
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1 }))
    expect(await migrateDataDir(dir)).toEqual({ status: 'newer', version: SCHEMA_VERSION + 1 })
    expect(existsSync(join(dir, 'backups'))).toBe(false)
  })
})
