import { describe, expect, it } from 'vitest'
import { EMPTY_LIBRARY, type Asset, type Folder, type LibraryData, type LibraryImage, type PinterestImport, type ScannedDir } from '@shared/types'
import {
  addFiles,
  applyPinterestSync,
  cannotTransfer,
  copyItems,
  copyName,
  deleteItems,
  deleteSummary,
  importScan,
  itemKey,
  moveItems,
  parseItemKey,
  planFolderIds,
  poolFor,
  renameItem,
  rescanFolder,
  sortItems,
  tidyAssets,
  type Item,
  type Lib
} from '@renderer/lib/library'

const folder = (id: string, name: string, parentId?: string): Folder => ({ id, name, parentId, createdAt: 0 })
const entry = (id: string, folderId: string | undefined, assetId = `a-${id}`, name = id): LibraryImage => ({ id, assetId, folderId, name, createdAt: 0 })
const asset = (id: string, extra: Partial<Asset> = {}): Asset => ({ id, path: `/pics/${id}.jpg`, storage: 'linked', origin: 'folder', addedAt: 0, ...extra })

// Human ─┬─ Hands ── h1
//        └─ p1 (image in Human)
// Animals (empty)
// top (an image at the top level)
const lib = (): Lib => ({
  folders: [folder('human', 'Human'), folder('hands', 'Hands', 'human'), folder('animals', 'Animals')],
  images: [entry('p1', 'human'), entry('h1', 'hands'), entry('top', undefined)]
})
const counter = (prefix = 'new') => {
  let n = 0
  return () => `${prefix}${++n}`
}
const I = (id: string): Item => ({ type: 'image', id })
const F = (id: string): Item => ({ type: 'folder', id })

describe('item keys', () => {
  it('round-trip, also with ids that hold a colon', () => {
    for (const item of [I('a'), F('b'), I('x~y:z')]) expect(parseItemKey(itemKey(item))).toEqual(item)
    expect(parseItemKey('nonsense')).toBeNull()
  })
})

describe('moving', () => {
  it('an image moved into a folder leaves where it was', () => {
    const out = moveItems(lib(), [I('top')], 'animals')
    expect(out.images.find((i) => i.id === 'top')?.folderId).toBe('animals')
    expect(out.images).toHaveLength(3)
  })

  it('a folder never goes inside itself; the rest of the selection still moves', () => {
    const out = moveItems(lib(), [F('human'), I('top')], 'hands')
    expect(out.folders.find((f) => f.id === 'human')?.parentId).toBeUndefined()
    expect(out.images.find((i) => i.id === 'top')?.folderId).toBe('hands')
    expect(cannotTransfer(lib(), F('human'), 'hands', 'move')).toMatch(/inside itself/)
  })

  it('moving to where it already is does nothing', () => {
    expect(cannotTransfer(lib(), I('p1'), 'human', 'move')).toMatch(/already there/)
    expect(cannotTransfer(lib(), I('p1'), 'human', 'copy')).toBeNull()
  })
})

describe('copying', () => {
  it('an image copy is a new entry of the same asset, with a free name', () => {
    const out = copyItems(lib(), [I('p1')], 'human', counter())
    const copy = out.images.find((i) => i.id === 'new1')!
    expect(copy).toMatchObject({ name: 'p1 (copy)', folderId: 'human', assetId: 'a-p1' })
    expect(out.images).toHaveLength(4)
  })

  it('to have an image in two folders, copy it: the name stays', () => {
    const out = copyItems(lib(), [I('p1')], 'animals', counter())
    expect(out.images.find((i) => i.id === 'new1')).toMatchObject({ name: 'p1', folderId: 'animals' })
    expect(out.images.find((i) => i.id === 'p1')?.folderId).toBe('human')
  })

  it('a folder copy copies everything inside it, sharing the assets', () => {
    const out = copyItems(lib(), [F('human')], undefined, counter())
    const top = out.folders.find((f) => f.name === 'Human (copy)')!
    expect(top.parentId).toBeUndefined()
    const handsCopy = out.folders.find((f) => f.parentId === top.id)!
    expect(handsCopy.name).toBe('Hands')
    const inside = out.images.filter((i) => i.folderId === top.id || i.folderId === handsCopy.id)
    expect(inside.map((i) => i.assetId).sort()).toEqual(['a-h1', 'a-p1'])
    expect(new Set(out.images.map((i) => i.id)).size).toBe(out.images.length)
  })

  it('a folder can’t be copied into its own sub-folder', () => {
    const out = copyItems(lib(), [F('human')], 'hands', counter())
    expect(out.folders).toHaveLength(3)
  })

  it('names: (copy), then (copy 2)', () => {
    expect(copyName('Hands', ['Hands', 'Hands (copy)'])).toBe('Hands (copy 2)')
    expect(copyName('Feet', ['Hands'])).toBe('Feet')
  })
})

describe('deleting and renaming', () => {
  it('a folder can keep what is inside (moved up) or delete it all; disk files are never involved', () => {
    const keep = deleteItems(lib(), [F('human')], 'keep')
    expect(keep.images).toHaveLength(3)
    expect(keep.folders.find((f) => f.id === 'hands')?.parentId).toBeUndefined()
    const all = deleteItems(lib(), [F('human')], 'all')
    expect(all.folders.map((f) => f.id)).toEqual(['animals'])
    expect(all.images.map((i) => i.id)).toEqual(['top'])
    expect(deleteSummary(lib(), [F('human'), I('top')])).toEqual({ folders: 1, images: 1, insideFolders: 1, insideImages: 2 })
  })

  it('a removed sub-folder of a linked folder is remembered, so a rescan doesn’t bring it back', () => {
    const l: Lib = {
      folders: [
        { ...folder('root', 'Refs'), source: { kind: 'disk', path: 'C:\\Refs', include: 'tree' } },
        { ...folder('sub', 'Hands', 'root'), source: { kind: 'disk', path: 'C:\\Refs\\Hands', include: 'tree' } }
      ],
      images: []
    }
    const out = deleteItems(l, [F('sub')], 'all')
    expect(out.folders[0].source).toMatchObject({ skip: ['C:\\Refs\\Hands'] })
  })

  it('renames folders and images; an empty name changes nothing', () => {
    expect(renameItem(lib(), I('p1'), '  Proportions ').images[0].name).toBe('Proportions')
    expect(renameItem(lib(), F('human'), 'People').folders[0].name).toBe('People')
    expect(renameItem(lib(), F('human'), '   ')).toEqual(lib())
  })
})

describe('practicing folders', () => {
  const assets = [asset('a-p1'), asset('a-h1'), asset('a-top'), asset('dup', { sha256: 'same' }), asset('dup2', { sha256: 'same' })]

  it('a folder includes images in deeper folders; picked twice is still once', () => {
    expect(poolFor(lib(), assets, ['human']).map((r) => r.id).sort()).toEqual(['a-h1', 'a-p1'])
    expect(poolFor(lib(), assets, ['human', 'hands', 'gone']).map((r) => r.id).sort()).toEqual(['a-h1', 'a-p1'])
  })

  it('copies and the same picture kept twice are drawn once', () => {
    const l = copyItems(lib(), [I('p1')], 'hands', counter())
    expect(poolFor(l, assets, ['human'])).toHaveLength(2)
    const twice: Lib = { folders: [folder('f', 'F')], images: [entry('x', 'f', 'dup'), entry('y', 'f', 'dup2')] }
    expect(poolFor(twice, assets, ['f'])).toHaveLength(1)
  })

  it('old plans picked collections; their ids are folders now', () => {
    expect(planFolderIds({ boardIds: ['b1'], folderIds: ['f1', 'b1'] })).toEqual(['f1', 'b1'])
  })
})

describe('sorting', () => {
  it('by name with numbers in order, or by size and date', () => {
    const list = [
      { id: 'a', name: 'Pose 10', createdAt: 1 },
      { id: 'b', name: 'pose 2', createdAt: 3 },
      { id: 'c', name: 'Arms', createdAt: 2 }
    ]
    expect(sortItems(list, 'name', () => 0, () => 0).map((x) => x.id)).toEqual(['c', 'b', 'a'])
    expect(sortItems(list, 'added', () => 0, () => 0).map((x) => x.id)).toEqual(['b', 'c', 'a'])
    expect(sortItems(list, 'size', (x) => (x.id === 'a' ? 9 : 1), () => 0)[0].id).toBe('a')
  })
})

// ---------------------------------------------------------------------------

const file = (path: string, extra: { size?: number; sha256?: string } = {}) => ({ path, id: `id:${path}`, size: extra.size ?? 10, ...(extra.sha256 ? { sha256: extra.sha256 } : {}) })

// Drawing Practice/            (no images of its own)
//   Anatomy/                   Proportions.jpg
//     Hands/                   Hand 01.jpg, Hand 02.jpg
//     Figures/                 Figure 01.jpg
//   Pinterest/Anatomy References/   Pin 01.jpg
const scan: ScannedDir[] = [
  { path: 'D:\\DP', name: 'Drawing Practice', files: [] },
  { path: 'D:\\DP\\Anatomy', name: 'Anatomy', parent: 'D:\\DP', files: [file('D:\\DP\\Anatomy\\Proportions.jpg')] },
  { path: 'D:\\DP\\Anatomy\\Figures', name: 'Figures', parent: 'D:\\DP\\Anatomy', files: [file('D:\\DP\\Anatomy\\Figures\\Figure 01.jpg')] },
  { path: 'D:\\DP\\Anatomy\\Hands', name: 'Hands', parent: 'D:\\DP\\Anatomy', files: [file('D:\\DP\\Anatomy\\Hands\\Hand 01.jpg'), file('D:\\DP\\Anatomy\\Hands\\Hand 02.jpg')] },
  { path: 'D:\\DP\\Pinterest', name: 'Pinterest', parent: 'D:\\DP', files: [] },
  { path: 'D:\\DP\\Pinterest\\Anatomy References', name: 'Anatomy References', parent: 'D:\\DP\\Pinterest', files: [file('D:\\DP\\Pinterest\\Anatomy References\\Pin 01.jpg')] }
]
const named = (d: LibraryData, name: string) => d.folders.find((f) => f.name === name)!

describe('adding a disk folder', () => {
  it('keeps the structure: every disk folder is a folder, images stay where they are, no extra layers', () => {
    const r = importScan(EMPTY_LIBRARY, scan, { include: 'tree' }, counter('n'), 5)
    expect(r.folders).toBe(6)
    expect(r.images).toBe(5)
    const d = r.data
    expect(named(d, 'Drawing Practice').parentId).toBeUndefined()
    expect(named(d, 'Hands').parentId).toBe(named(d, 'Anatomy').id)
    expect(d.images.filter((i) => i.folderId === named(d, 'Anatomy').id).map((i) => i.name)).toEqual(['Proportions'])
    expect(d.images.filter((i) => i.folderId === named(d, 'Hands').id).map((i) => i.name)).toEqual(['Hand 01', 'Hand 02'])
    expect(d.images.some((i) => i.folderId === named(d, 'Drawing Practice').id)).toBe(false)
    expect(named(d, 'Hands').source).toEqual({ kind: 'disk', path: 'D:\\DP\\Anatomy\\Hands', include: 'tree', syncedAt: 5 })
    expect(d.assets.every((a) => a.storage === 'linked' && a.id === `id:${a.path}`)).toBe(true)
  })

  it('one folder with everything, or only the top images; left-out sub-folders are remembered', () => {
    const flat = importScan(EMPTY_LIBRARY, scan, { include: 'flat', skip: ['D:\\DP\\Pinterest'] }, counter('n'))
    expect(flat.folders).toBe(1)
    expect(flat.images).toBe(4)
    expect(flat.data.folders[0].source).toMatchObject({ include: 'flat', skip: ['D:\\DP\\Pinterest'] })
    const top = importScan(EMPTY_LIBRARY, [scan[1]].map((d) => ({ ...d, parent: undefined })), { include: 'top' }, counter('n'))
    expect(top.images).toBe(1)
  })

  it('an image already in the library keeps its asset (and history); a new one gets the id from its path', () => {
    const before: LibraryData = { ...EMPTY_LIBRARY, assets: [asset('old', { path: 'D:\\DP\\Anatomy\\Proportions.jpg' })] }
    const r = importScan(before, scan, { include: 'tree' }, counter('n'))
    expect(r.data.images.find((i) => i.name === 'Proportions')?.assetId).toBe('old')
    expect(r.data.assets).toHaveLength(5)
  })
})

describe('rescanning a linked folder', () => {
  const base = () => importScan(EMPTY_LIBRARY, scan, { include: 'tree' }, counter('n'), 1).data

  it('adds new images and new sub-folders, and leaves missing ones in place', () => {
    const d0 = base()
    const root = named(d0, 'Drawing Practice').id
    const next: ScannedDir[] = [
      ...scan.slice(0, 3),
      { ...scan[3], files: [scan[3].files[0], file('D:\\DP\\Anatomy\\Hands\\Hand 03.jpg')] },
      ...scan.slice(4),
      { path: 'D:\\DP\\Environments', name: 'Environments', parent: 'D:\\DP', files: [file('D:\\DP\\Environments\\City.jpg')] }
    ]
    const r = rescanFolder(d0, root, next, counter('r'), 9)
    expect(r.added).toBe(2)
    expect(r.newFolders).toBe(1)
    expect(named(r.data, 'Environments').parentId).toBe(root)
    // Hand 02's file is gone from the scan but its image stays (shown as missing).
    expect(r.data.images.filter((i) => i.folderId === named(r.data, 'Hands').id).map((i) => i.name)).toEqual(['Hand 01', 'Hand 02', 'Hand 03'])
  })

  it('a moved or renamed file keeps its asset when its bytes match a missing image', () => {
    const d0 = base()
    const lost = d0.assets.find((a) => a.path.endsWith('Hand 02.jpg'))!
    const d1 = { ...d0, assets: d0.assets.map((a) => (a.id === lost.id ? { ...a, sha256: 'h2' } : a)) }
    const next = scan.map((d) => (d.name === 'Hands' ? { ...d, files: [d.files[0], file('D:\\DP\\Anatomy\\Hands\\Hand 2 renamed.jpg', { sha256: 'h2' })] } : d))
    const r = rescanFolder(d1, named(d1, 'Drawing Practice').id, next, counter('r'), 9, new Set([lost.id]))
    expect(r.relinked).toBe(1)
    expect(r.added).toBe(0)
    expect(r.data.assets.find((a) => a.id === lost.id)?.path).toBe('D:\\DP\\Anatomy\\Hands\\Hand 2 renamed.jpg')
  })

  it('a sub-folder removed from the library doesn’t come back', () => {
    const d0 = base()
    const removed = { ...d0, ...deleteItems(d0, [{ type: 'folder', id: named(d0, 'Pinterest').id }], 'all') }
    const r = rescanFolder(removed, named(removed, 'Drawing Practice').id, scan, counter('r'))
    expect(r.newFolders).toBe(0)
    expect(r.data.folders.some((f) => f.name === 'Anatomy References')).toBe(false)
  })
})

describe('adding images', () => {
  it('a file is put in a folder once; pasted images with the same bytes share one stored asset', () => {
    const d = addFiles(EMPTY_LIBRARY, [file('/a.png', { sha256: 'x' }), file('/a.png', { sha256: 'x' })], 'f', 'paste', 'stored', counter())
    expect(d.added).toBe(1)
    const again = addFiles(d.data, [file('/other-name.png', { sha256: 'x' })], 'g', 'paste', 'stored', counter('m'))
    expect(again.data.assets).toHaveLength(1)
    expect(again.data.images.map((i) => i.assetId)).toEqual(['id:/a.png', 'id:/a.png'])
  })
})

describe('Pinterest sync', () => {
  const pins = (ids: string[], report: Partial<PinterestImport['report']> = {}): PinterestImport => ({
    name: 'Hands',
    pins: ids.map((id) => ({ path: `C:\\data\\cache\\pinterest\\b\\${id}.jpg`, id: `id-${id}`, size: 1, pinId: id, sourceUrl: `https://www.pinterest.com/pin/${id}/` })),
    report: { found: ids.length, expected: ids.length, partial: false, failed: 0, limited: false, skipped: 0, downloaded: ids.length, diagnostics: { pages: [], duplicates: 0, rss: false, stop: 'end' }, ...report }
  })
  const start = (): LibraryData => ({ ...EMPTY_LIBRARY, folders: [{ ...folder('b', 'Hands'), source: { kind: 'pinterest', url: 'https://pinterest.com/u/hands/' } }] })

  it('adds new pins, never twice, and only lists pins that left the board', () => {
    const first = applyPinterestSync(start(), 'b', pins(['1', '2', '3']), counter(), 1)
    expect(first.added).toBe(3)
    expect(first.data.assets.map((a) => a.pinId)).toEqual(['1', '2', '3'])
    const second = applyPinterestSync(first.data, 'b', pins(['2', '3', '4']), counter('s'), 2)
    expect(second.added).toBe(1)
    expect(second.gone.map((i) => i.name)).toEqual(['1'])
    // Nothing is removed by the sync itself.
    expect(second.data.images).toHaveLength(4)
    expect(second.data.folders[0].source).toMatchObject({ syncedAt: 2 })
  })

  it('a partial or capped sync never says a pin is gone', () => {
    const first = applyPinterestSync(start(), 'b', pins(['1', '2', '3']), counter(), 1)
    expect(applyPinterestSync(first.data, 'b', pins(['2'], { partial: true }), counter('s')).gone).toEqual([])
    expect(applyPinterestSync(first.data, 'b', pins(['2'], { limited: true }), counter('s')).gone).toEqual([])
  })

  it('a pin kept by another folder (a copy) is reused, not downloaded again', () => {
    const first = applyPinterestSync(start(), 'b', pins(['1']), counter(), 1)
    const copy = { ...first.data, ...copyItems(first.data, [F('b')], undefined, counter('c')) }
    const again = applyPinterestSync(copy, 'c1', pins(['1']), counter('t'))
    expect(again.data.assets).toHaveLength(1)
  })
})

describe('tidying stored files after a restart', () => {
  it('keeps what images use and what history still needs; drops the rest', () => {
    const d: LibraryData = {
      ...EMPTY_LIBRARY,
      images: [entry('e1', 'f', 'used')],
      assets: [asset('used', { path: '/s/used.jpg', storage: 'stored' }), asset('drawn', { path: '/s/drawn.jpg', storage: 'stored' }), asset('old', { path: '/s/old.jpg', storage: 'stored' })]
    }
    const sessions = [{ poses: [{ imageId: 'drawn', imagePath: '/s/drawn.jpg' }, { imageId: 'kept', imagePath: '/s/kept.jpg', keptPath: '/k/kept.jpg' }] }]
    const t = tidyAssets(d, sessions)
    expect(t.data.assets.map((a) => a.id)).toEqual(['used', 'drawn'])
    expect(t.inUse.sort()).toEqual(['/s/drawn.jpg', '/s/used.jpg'])
    expect(t.dropped).toBe(1)
  })
})
