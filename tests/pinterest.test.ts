import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  fetchBoard,
  MAX_PINS,
  normalizeBoardUrl,
  parseBoardPage,
  parseFeedResponse,
  parseRss
} from '../src/main/pinterest'

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8')

const feedPage = (ids: string[], bookmark?: string) =>
  JSON.stringify({
    resource_response: {
      status: 'success',
      data: ids.map((id) => ({ id, type: 'pin', images: { orig: { url: `https://i.pinimg.com/originals/${id}.jpg` } } })),
      ...(bookmark ? { bookmark } : {})
    }
  })

function fakeFetch(routes: (url: string, call: number) => { status?: number; body: string }) {
  const calls: string[] = []
  const headers: Record<string, string>[] = []
  const caches: (string | undefined)[] = []
  const fn = async (url: string, init?: { headers?: Record<string, string>; cache?: string }) => {
    calls.push(url)
    headers.push(init?.headers ?? {})
    caches.push(init?.cache)
    const r = routes(url, calls.length)
    const status = r.status ?? 200
    return { ok: status < 400, status, url, text: async () => r.body }
  }
  return { fn, calls, headers, caches }
}

const noSleep = async () => {}
/** The saved board page, reporting `count` pins (the fixture says 67). */
const boardPage = (count: number) => fixture('pinterest-board.html').replace('"pin_count":67', `"pin_count":${count}`)
/** A board page made up for a test: `ids` as its pins, `bookmark` to the next page. */
const madePage = (ids: string[], count: number, bookmark?: string) => {
  const key = JSON.stringify([
    ['board_id', 'B1'],
    ['page_size', 25]
  ])
  const props = {
    initialReduxState: {
      boards: { B1: { id: 'B1', name: 'Clothing', pin_count: count } },
      resources: {
        BoardFeedResource: {
          [key]: { data: ids.map((id) => ({ id, type: 'pin', images: { orig: { url: `https://i.pinimg.com/originals/${id}.jpg` } } })), ...(bookmark ? { nextBookmark: bookmark } : {}) }
        }
      }
    }
  }
  return `<html><script id="__PWS_INITIAL_PROPS__" type="application/json">${JSON.stringify(props)}</script></html>`
}
const range = (from: number, n: number) => Array.from({ length: n }, (_, i) => `p${from + i}`)
const BOARD = 'https://www.pinterest.com/pinterest/girls-night-in/'
const isPage = (url: string) => !url.includes('/resource/')

describe('pinterest', () => {
  it('normalizes board links from any Pinterest domain', () => {
    expect(normalizeBoardUrl('https://fr.pinterest.com/user/my-board/?invite=1').url).toBe(
      'https://www.pinterest.com/user/my-board/'
    )
    expect(normalizeBoardUrl('pinterest.co.uk/user/board/section').path).toBe('/user/board/section/')
    expect(() => normalizeBoardUrl('https://www.pinterest.com/pin/123/')).toThrow(/board link/)
    expect(() => normalizeBoardUrl('https://example.com/a/b')).toThrow(/not a Pinterest/)
  })

  it('reads the board id, name, first pins and bookmark from the page', () => {
    const page = parseBoardPage(fixture('pinterest-board.html'))
    expect(page.boardId).toBe('424605139808122051')
    expect(page.name).toBe("Girls' night in")
    expect(page.pinCount).toBe(67)
    expect(page.resource).toBe('BoardFeedResource')
    expect(page.pins).toHaveLength(3) // the story item is skipped
    expect(page.pins[0].url).toMatch(/\/originals\//)
    expect(page.bookmark).toBe('BOOKMARK-1')
  })

  it('reads a feed page and stops at the end marker', () => {
    expect(parseFeedResponse(JSON.parse(feedPage(['1', '2'], 'B2')))).toMatchObject({ bookmark: 'B2' })
    expect(parseFeedResponse(JSON.parse(feedPage(['3'], '-end-'))).bookmark).toBeNull()
  })

  it('reads the RSS fallback at 736px', () => {
    const rss = parseRss(fixture('pinterest-board.rss'))
    expect(rss.name).toBe("Girls' night in")
    expect(rss.pins).toHaveLength(2)
    expect(rss.pins[0]).toEqual({
      id: '424605071145776592',
      url: 'https://i.pinimg.com/736x/da/c0/74/dac0749b1411aebab3d5eef1f16e87c0.jpg'
    })
  })

  it('pages through the whole board', async () => {
    const { fn, calls, headers } = fakeFetch((url) => {
      if (isPage(url)) return { body: boardPage(6) }
      if (url.includes('BOOKMARK-1')) return { body: feedPage(['a', 'b'], 'BOOKMARK-2') }
      return { body: feedPage(['c']) }
    })
    const board = await fetchBoard(BOARD, { fetch: fn, sleep: noSleep })
    expect(board.partial).toBe(false)
    expect(board.expected).toBe(6)
    expect(board.pins.map((p) => p.id)).toEqual([
      '424605071145776592',
      '424605071145776596',
      '424605071145776594',
      'a',
      'b',
      'c'
    ])
    expect(calls).toHaveLength(3)
    expect(decodeURIComponent(calls[1])).toContain('"bookmarks":["BOOKMARK-1"]')
    // Without this header the live endpoint answers 403.
    expect(headers[1]['X-Pinterest-PWS-Handler']).toBe('www/[username]/[slug].js')
  })

  it('fetches fresh every time, so a re-sync never reuses an old page', async () => {
    const { fn, calls, caches, headers } = fakeFetch((url) =>
      isPage(url) ? { body: fixture('pinterest-board.html') } : { body: feedPage(['a']) }
    )
    await fetchBoard(BOARD, { fetch: fn, sleep: noSleep })
    await new Promise((r) => setTimeout(r, 2))
    await fetchBoard(BOARD, { fetch: fn, sleep: noSleep })
    const pages = calls.filter(isPage)
    expect(pages).toHaveLength(2)
    expect(pages[0]).not.toBe(pages[1]) // cache-busting query differs
    expect(caches.every((c) => c === 'no-store')).toBe(true)
    expect(headers.every((h) => h['Cache-Control'] === 'no-cache')).toBe(true)
  })

  it('retries a page that fails, then carries on', async () => {
    let failures = 0
    const { fn } = fakeFetch((url) => {
      if (isPage(url)) return { body: boardPage(5) }
      if (failures < 2) {
        failures++
        return { status: 503, body: '' }
      }
      return { body: feedPage(['a', 'b']) }
    })
    const board = await fetchBoard(BOARD, { fetch: fn, sleep: noSleep })
    expect(board.partial).toBe(false)
    expect(board.pins).toHaveLength(5)
    expect(board.diagnostics.pages[1]).toMatchObject({ kind: 'feed', status: 200, tries: 3 })
  })

  it('falls back to the smallest options when the full ones are refused', async () => {
    const { fn } = fakeFetch((url) => {
      if (isPage(url)) return { body: boardPage(4) }
      const data = decodeURIComponent(url)
      return data.includes('field_set_key') ? { status: 403, body: 'Invalid Resource Request' } : { body: feedPage(['a']) }
    })
    const board = await fetchBoard(BOARD, { fetch: fn, sleep: noSleep })
    expect(board.partial).toBe(false)
    expect(board.pins.map((p) => p.id)).toContain('a')
  })

  it('reports a partial sync when Pinterest stops answering', async () => {
    const { fn } = fakeFetch((url) =>
      isPage(url) ? { body: fixture('pinterest-board.html') } : { status: 500, body: '' }
    )
    const board = await fetchBoard(BOARD, { fetch: fn, sleep: noSleep })
    expect(board.partial).toBe(true)
    expect(board.pins).toHaveLength(3)
    expect(board.expected).toBe(67)
  })

  it('stops if Pinterest hands back a bookmark it already gave', async () => {
    const { fn, calls } = fakeFetch((url) =>
      isPage(url) ? { body: fixture('pinterest-board.html') } : { body: feedPage(['a'], 'BOOKMARK-1') }
    )
    const board = await fetchBoard(BOARD, { fetch: fn, sleep: noSleep })
    expect(board.pins).toHaveLength(4)
    expect(calls).toHaveLength(2)
  })

  it('falls back to RSS when the page has no readable data', async () => {
    const { fn } = fakeFetch((url) =>
      url.includes('.rss') ? { body: fixture('pinterest-board.rss') } : { body: '<html>changed</html>' }
    )
    const board = await fetchBoard('https://www.pinterest.com/pinterest/girls-night-in/', { fetch: fn })
    expect(board.partial).toBe(true)
    expect(board.pins).toHaveLength(2)
  })

  it('when the page holds the first pins but no bookmark, it reads the feed from the start', async () => {
    // Seen live: 25 pins and "the rest were videos", while the board had more pictures.
    const html = boardPage(6).replace('"nextBookmark":"BOOKMARK-1"', '"nextBookmark":"-end-"')
    expect(parseBoardPage(html).bookmark).toBeNull()
    const { fn, calls } = fakeFetch((url) => {
      if (isPage(url)) return { body: html }
      if (!decodeURIComponent(url).includes('"bookmarks"')) return { body: feedPage(['424605071145776592', 'a', 'b'], 'NEXT') }
      return { body: feedPage(['c']) }
    })
    const board = await fetchBoard(BOARD, { fetch: fn, sleep: noSleep })
    expect(board.pins.map((p) => p.id)).toEqual(['424605071145776592', '424605071145776596', '424605071145776594', 'a', 'b', 'c'])
    expect(board.partial).toBe(false)
    expect(calls).toHaveLength(3)
  })

  it('says so when that first feed page can’t be read', async () => {
    const html = fixture('pinterest-board.html').replace('"nextBookmark":"BOOKMARK-1"', '"nextBookmark":"-end-"')
    const { fn } = fakeFetch((url) => (isPage(url) ? { body: html } : { status: 500, body: '' }))
    const board = await fetchBoard(BOARD, { fetch: fn, sleep: noSleep })
    expect(board.partial).toBe(true)
    expect(board.pins).toHaveLength(3)
  })

  it('stops at the safety limit and reports it, instead of claiming the board is done', async () => {
    let page = 0
    const { fn } = fakeFetch((url) => {
      if (isPage(url)) return { body: fixture('pinterest-board.html') }
      page++
      return { body: feedPage(Array.from({ length: 25 }, (_, i) => `p${page}-${i}`), `B${page + 1}`) }
    })
    const board = await fetchBoard(BOARD, { fetch: fn, sleep: noSleep, maxPins: 60 })
    expect(board.pins).toHaveLength(60)
    expect(board.limited).toBe(true)
    expect(board.partial).toBe(false)
  })

  it('pages through a big board (2,000+ pins) up to the default limit', async () => {
    let page = 0
    const { fn } = fakeFetch((url) => {
      if (isPage(url)) return { body: fixture('pinterest-board.html') }
      page++
      return { body: feedPage(Array.from({ length: 25 }, (_, i) => `p${page}-${i}`), page < 100 ? `B${page + 1}` : undefined) }
    })
    const board = await fetchBoard(BOARD, { fetch: fn, sleep: noSleep })
    expect(board.pins).toHaveLength(3 + 100 * 25)
    expect(board.limited).toBe(false)
    expect(MAX_PINS).toBeGreaterThan(board.pins.length)
  })

  it('counts items that are not pictures, so the report can say what was left out', async () => {
    const { fn } = fakeFetch((url) => {
      if (isPage(url)) return { body: fixture('pinterest-board.html') }
      const body = JSON.parse(feedPage(['a']))
      body.resource_response.data.push({ id: 'story', type: 'story' }, { id: 'v', type: 'pin' })
      return { body: JSON.stringify(body) }
    })
    const board = await fetchBoard(BOARD, { fetch: fn, sleep: noSleep })
    // The page fixture holds one story item too.
    expect(board.skipped).toBe(3)
    expect(board.pins.map((p) => p.id)).toContain('a')
  })

  it('a board of 35: a first page of 25, then a second page of 10', async () => {
    const { fn, calls } = fakeFetch((url) => {
      if (isPage(url)) return { body: madePage(range(1, 25), 35, 'NEXT') }
      return { body: feedPage(range(26, 10)) }
    })
    const board = await fetchBoard(BOARD, { fetch: fn, sleep: noSleep })
    expect(board.pins).toHaveLength(35)
    expect(board.partial).toBe(false)
    expect(board.diagnostics).toMatchObject({ duplicates: 0, rss: false, stop: 'end' })
    expect(board.diagnostics.pages.map((p) => [p.kind, p.pins, p.next])).toEqual([
      ['page', 25, true],
      ['feed', 10, false]
    ])
    expect(decodeURIComponent(calls[1])).toContain('"bookmarks":["NEXT"]')
  })

  it('many pages of different sizes, each from the bookmark the last one gave', async () => {
    const sizes = [7, 25, 3, 18]
    const { fn } = fakeFetch((url) => {
      if (isPage(url)) return { body: madePage(range(0, 25), 25 + 7 + 25 + 3 + 18, 'B1') }
      const n = Number(decodeURIComponent(url).match(/"bookmarks":\["B(\d+)"\]/)![1])
      const from = 25 + sizes.slice(0, n - 1).reduce((a, b) => a + b, 0)
      return { body: feedPage(range(from, sizes[n - 1]), n < sizes.length ? `B${n + 1}` : undefined) }
    })
    const board = await fetchBoard(BOARD, { fetch: fn, sleep: noSleep })
    expect(board.pins).toHaveLength(78)
    expect(board.diagnostics.pages).toHaveLength(5)
    expect(board.partial).toBe(false)
  })

  it('the live 25-of-35 case: no bookmark on the page, and the feed’s next page comes back empty', async () => {
    const { fn } = fakeFetch((url) => {
      if (isPage(url)) return { body: madePage(range(1, 25), 35) }
      if (!decodeURIComponent(url).includes('"bookmarks"')) return { body: feedPage(range(1, 25), 'NEXT') }
      return { body: feedPage([]) }
    })
    const board = await fetchBoard(BOARD, { fetch: fn, sleep: noSleep })
    expect(board.pins).toHaveLength(25)
    // Not a full sync: says so, and explains it, instead of "the rest were videos".
    expect(board.partial).toBe(true)
    expect(board.diagnostics.stop).toBe('short')
    expect(board.diagnostics.duplicates).toBe(25)
    expect(board.diagnostics.pages.map((p) => p.newPins)).toEqual([25, 0, 0])
  })

  it('pins seen again on a later page are counted once', async () => {
    const { fn } = fakeFetch((url) => (isPage(url) ? { body: madePage(range(1, 25), 30, 'NEXT') } : { body: feedPage([...range(20, 5), ...range(26, 5)]) }))
    const board = await fetchBoard(BOARD, { fetch: fn, sleep: noSleep })
    expect(board.pins).toHaveLength(30)
    expect(board.diagnostics.duplicates).toBe(5)
  })

  it('a 403 or 429 is retried (429 waits longer); if it never answers, the sync is partial', async () => {
    const waits: number[] = []
    const sleep = async (ms: number) => void waits.push(ms)
    let n = 0
    const { fn } = fakeFetch((url) => {
      if (isPage(url)) return { body: madePage(range(1, 25), 35, 'NEXT') }
      n++
      return n === 1 ? { status: 429, body: '' } : n === 2 ? { status: 403, body: '' } : { body: feedPage(range(26, 10)) }
    })
    const board = await fetchBoard(BOARD, { fetch: fn, sleep })
    expect(board.pins).toHaveLength(35)
    // The usual first wait is 600 ms; after a 429 it is three times longer.
    expect(waits).toEqual([1800, 1800])
    const { fn: never } = fakeFetch((url) => (isPage(url) ? { body: madePage(range(1, 25), 35, 'NEXT') } : { status: 429, body: '' }))
    const stuck = await fetchBoard(BOARD, { fetch: never, sleep: noSleep })
    expect(stuck).toMatchObject({ partial: true, diagnostics: { stop: 'failed' } })
    expect(stuck.diagnostics.pages[1]).toMatchObject({ status: 429, pins: 0 })
  })

  it('an invalid bookmark (Pinterest answers with an error) ends as a partial sync', async () => {
    const { fn } = fakeFetch((url) => (isPage(url) ? { body: madePage(range(1, 25), 35, 'BAD') } : { body: '{"resource_response":{"status":"failure"}}' }))
    const board = await fetchBoard(BOARD, { fetch: fn, sleep: noSleep })
    expect(board).toMatchObject({ partial: true, diagnostics: { stop: 'failed' } })
    expect(board.pins).toHaveLength(25)
  })

  it('the RSS fallback is marked as such and never counts as a full sync', async () => {
    const { fn } = fakeFetch((url) => (url.includes('.rss') ? { body: fixture('pinterest-board.rss') } : { body: '<html>changed</html>' }))
    const board = await fetchBoard(BOARD, { fetch: fn, sleep: noSleep })
    expect(board).toMatchObject({ partial: true, diagnostics: { rss: true, stop: 'rss' } })
  })

  it('a repeated bookmark stops the loop and is reported', async () => {
    const { fn } = fakeFetch((url) => (isPage(url) ? { body: madePage(range(1, 25), 26, 'SAME') } : { body: feedPage(['x'], 'SAME') }))
    const board = await fetchBoard(BOARD, { fetch: fn, sleep: noSleep })
    expect(board.pins).toHaveLength(26)
    expect(board.diagnostics.stop).toBe('repeated-bookmark')
  })

  it('reports a private or missing board', async () => {
    const { fn } = fakeFetch(() => ({ status: 404, body: '' }))
    await expect(fetchBoard('https://www.pinterest.com/x/y/', { fetch: fn })).rejects.toThrow(/404/)
  })
})
