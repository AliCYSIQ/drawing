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

function fakeFetch(routes: (url: string) => { status?: number; body: string }) {
  const calls: string[] = []
  const headers: Record<string, string>[] = []
  const fn = async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push(url)
    headers.push(init?.headers ?? {})
    const r = routes(url)
    const status = r.status ?? 200
    return { ok: status < 400, status, url, text: async () => r.body }
  }
  return { fn, calls, headers }
}

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
      if (!url.includes('/resource/')) return { body: fixture('pinterest-board.html') }
      if (url.includes('BOOKMARK-1')) return { body: feedPage(['a', 'b'], 'BOOKMARK-2') }
      return { body: feedPage(['c']) }
    })
    const board = await fetchBoard('https://www.pinterest.com/pinterest/girls-night-in/', { fetch: fn })
    expect(board.partial).toBe(false)
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

  it('falls back to RSS when the page has no readable data', async () => {
    const { fn } = fakeFetch((url) =>
      url.endsWith('.rss') ? { body: fixture('pinterest-board.rss') } : { body: '<html>changed</html>' }
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
