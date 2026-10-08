import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  fetchBoard,
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
      if (isPage(url)) return { body: fixture('pinterest-board.html') }
      if (url.includes('BOOKMARK-1')) return { body: feedPage(['a', 'b'], 'BOOKMARK-2') }
      return { body: feedPage(['c']) }
    })
    const board = await fetchBoard(BOARD, { fetch: fn, sleep: noSleep })
    expect(board.partial).toBe(false)
    expect(board.expected).toBe(67)
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
      if (isPage(url)) return { body: fixture('pinterest-board.html') }
      if (failures < 2) {
        failures++
        return { status: 503, body: '' }
      }
      return { body: feedPage(['a', 'b']) }
    })
    const board = await fetchBoard(BOARD, { fetch: fn, sleep: noSleep })
    expect(board.partial).toBe(false)
    expect(board.pins).toHaveLength(5)
  })

  it('falls back to the smallest options when the full ones are refused', async () => {
    const { fn } = fakeFetch((url) => {
      if (isPage(url)) return { body: fixture('pinterest-board.html') }
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

  it('reports a private or missing board', async () => {
    const { fn } = fakeFetch(() => ({ status: 404, body: '' }))
    await expect(fetchBoard('https://www.pinterest.com/x/y/', { fetch: fn })).rejects.toThrow(/404/)
  })
})
