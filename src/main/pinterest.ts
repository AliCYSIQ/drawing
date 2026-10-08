// Reads a public Pinterest board without the official API.
//
// Pinterest has no free API for reading any board, so this uses what the
// website itself uses: the board page embeds its first page of pins and a
// "bookmark" in a JSON script tag, and the rest comes from the internal
// resource endpoint, one bookmark at a time. Both are undocumented and can
// change; everything that depends on their shape is in this file, and
// tests/pinterest.test.ts checks it against saved fixtures.

export interface PinImage {
  id: string
  url: string
}

export interface BoardPage {
  boardId: string
  name: string
  pinCount: number
  resource: string
  options: Record<string, unknown>
  pins: PinImage[]
  bookmark: string | null
}

export interface BoardResult {
  name: string
  pins: PinImage[]
  /** True when only the RSS feed worked, which holds just the latest pins. */
  partial: boolean
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

const FEED_RESOURCES = ['BoardSectionPinsResource', 'BoardFeedResource']

/** Turns any board link (any Pinterest domain, with or without a section) into a canonical URL. */
export function normalizeBoardUrl(input: string): { url: string; path: string } {
  let u: URL
  try {
    u = new URL(input.trim().startsWith('http') ? input.trim() : `https://${input.trim()}`)
  } catch {
    throw new Error('That is not a link.')
  }
  if (!/(^|\.)pinterest\.[a-z.]+$/.test(u.hostname) && u.hostname !== 'pin.it') {
    throw new Error('That is not a Pinterest link.')
  }
  if (u.hostname === 'pin.it') return { url: u.toString(), path: '' }
  const parts = u.pathname.split('/').filter(Boolean)
  if (parts.length < 2 || ['pin', 'search', 'ideas', 'explore'].includes(parts[0])) {
    throw new Error('Paste a board link, like pinterest.com/username/boardname')
  }
  const path = `/${parts.slice(0, Math.min(parts.length, 3)).join('/')}/`
  return { url: `https://www.pinterest.com${path}`, path }
}

export function pinImage(pin: unknown): PinImage | null {
  const p = pin as { id?: string; type?: string; images?: Record<string, { url?: string }> }
  if (!p || !p.id || (p.type && p.type !== 'pin') || !p.images) return null
  const url = p.images.orig?.url ?? p.images['736x']?.url ?? p.images['474x']?.url
  return url ? { id: String(p.id), url } : null
}

function readScriptJson(html: string, id: string): unknown {
  const match = html.match(new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)</script>`))
  if (!match) return null
  try {
    return JSON.parse(match[1])
  } catch {
    return null
  }
}

export function parseBoardPage(html: string): BoardPage {
  const props = readScriptJson(html, '__PWS_INITIAL_PROPS__') as {
    initialReduxState?: {
      boards?: Record<string, { id: string; name: string; pin_count?: number }>
      resources?: Record<string, Record<string, { data?: unknown[]; nextBookmark?: string }>>
    }
  } | null
  const state = props?.initialReduxState
  if (!state?.resources) throw new Error('Could not read this board. Is it public?')

  for (const resource of FEED_RESOURCES) {
    const entries = state.resources[resource]
    if (!entries) continue
    const [key, value] = Object.entries(entries)[0] ?? []
    if (!key || !value) continue
    const options = Object.fromEntries(JSON.parse(key) as [string, unknown][])
    const boardId = String(options.board_id ?? '')
    const board = boardId ? state.boards?.[boardId] : Object.values(state.boards ?? {})[0]
    return {
      boardId,
      name: board?.name ?? 'Pinterest board',
      pinCount: board?.pin_count ?? 0,
      resource,
      options,
      pins: (value.data ?? []).map(pinImage).filter((p): p is PinImage => !!p),
      bookmark: value.nextBookmark && value.nextBookmark !== '-end-' ? value.nextBookmark : null
    }
  }
  throw new Error('Could not find the pins on this page. Is it a board link?')
}

export function parseFeedResponse(json: unknown): { pins: PinImage[]; bookmark: string | null } {
  const rr = (json as { resource_response?: { data?: unknown[]; bookmark?: string } })?.resource_response
  if (!rr || !Array.isArray(rr.data)) throw new Error('Unexpected reply from Pinterest.')
  const pins = rr.data.map(pinImage).filter((p): p is PinImage => !!p)
  const bookmark = rr.bookmark && rr.bookmark !== '-end-' ? rr.bookmark : null
  return { pins, bookmark }
}

/** The RSS feed only has the latest pins, at 236 px; 736 px versions exist at the same path. */
export function parseRss(xml: string): { name: string; pins: PinImage[] } {
  const decoded = xml.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  const name = (xml.match(/<channel>\s*<title>([^<]*)<\/title>/) ?? [])[1]?.replace(/&apos;/g, "'") ?? 'Pinterest board'
  const pins: PinImage[] = []
  const itemRe = /<item>([\s\S]*?)<\/item>/g
  let m: RegExpExecArray | null
  while ((m = itemRe.exec(decoded))) {
    const id = (m[1].match(/\/pin\/(\d+)/) ?? [])[1]
    const src = (m[1].match(/<img src="([^"]+)"/) ?? [])[1]
    if (id && src) pins.push({ id, url: src.replace(/\/\d+x\//, '/736x/') })
  }
  return { name, pins }
}

type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean
  status: number
  url: string
  text(): Promise<string>
}>

export interface FetchBoardOptions {
  fetch?: Fetch
  onProgress?: (found: number, total: number) => void
  maxPins?: number
}

export async function fetchBoard(input: string, opts: FetchBoardOptions = {}): Promise<BoardResult> {
  const doFetch: Fetch = opts.fetch ?? (globalThis.fetch as unknown as Fetch)
  const maxPins = opts.maxPins ?? 2000
  let { url, path } = normalizeBoardUrl(input)

  const pageRes = await doFetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en' } })
  if (!pageRes.ok) throw new Error(`Pinterest answered ${pageRes.status}. Is the board public?`)
  if (!path) ({ url, path } = normalizeBoardUrl(pageRes.url)) // short pin.it link
  const html = await pageRes.text()

  let page: BoardPage
  try {
    page = parseBoardPage(html)
  } catch (err) {
    const rss = await fetchRss(doFetch, path)
    if (rss) return { ...rss, partial: true }
    throw err
  }

  const seen = new Set<string>()
  const pins: PinImage[] = []
  const add = (list: PinImage[]) => {
    for (const p of list) {
      if (seen.has(p.id) || pins.length >= maxPins) continue
      seen.add(p.id)
      pins.push(p)
    }
  }
  add(page.pins)
  opts.onProgress?.(pins.length, page.pinCount)

  let bookmark = page.bookmark
  while (bookmark && pins.length < maxPins) {
    const data = JSON.stringify({ options: { ...page.options, bookmarks: [bookmark] }, context: {} })
    const feedUrl =
      `https://www.pinterest.com/resource/${page.resource}/get/` +
      `?source_url=${encodeURIComponent(path)}&data=${encodeURIComponent(data)}`
    const res = await doFetch(feedUrl, { headers: feedHeaders(path) })
    if (!res.ok) break // keep what we have
    const next = parseFeedResponse(JSON.parse(await res.text()))
    const before = pins.length
    add(next.pins)
    opts.onProgress?.(pins.length, page.pinCount)
    if (pins.length === before) break
    bookmark = next.bookmark
  }
  return { name: page.name, pins, partial: false }
}

/** The resource endpoint answers 403 unless it is told which page handler is asking. */
export function feedHeaders(path: string): Record<string, string> {
  const section = path.split('/').filter(Boolean).length > 2
  return {
    'User-Agent': UA,
    'X-Requested-With': 'XMLHttpRequest',
    Accept: 'application/json',
    'X-Pinterest-PWS-Handler': section ? 'www/[username]/[slug]/[section_slug].js' : 'www/[username]/[slug].js'
  }
}

async function fetchRss(doFetch: Fetch, path: string): Promise<{ name: string; pins: PinImage[] } | null> {
  const parts = path.split('/').filter(Boolean)
  if (parts.length < 2) return null
  try {
    const res = await doFetch(`https://www.pinterest.com/${parts[0]}/${parts[1]}.rss`, { headers: { 'User-Agent': UA } })
    if (!res.ok) return null
    const rss = parseRss(await res.text())
    return rss.pins.length ? rss : null
  } catch {
    return null
  }
}

export const PINTEREST_UA = UA
