import { getWebApp, inTelegram } from './telegram.ts'

/**
 * Live API client for the bot backends (Telegram initData auth).
 *
 * Base URL discovery: ?api= on the launch URL (set by the bot's buttons and menu button),
 * then the last good base in sessionStorage, then ../api.json on Pages (published by the box).
 * Only known tunnel hosts are accepted, so a crafted link cannot point the app elsewhere.
 */
export type Service = 'santa' | 'matchday' | 'budget'

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

const HOSTS = /^https:\/\/[a-z0-9-]+\.(trycloudflare\.com|ngrok-free\.app|ngrok-free\.dev|ngrok\.app|ngrok\.dev|ngrok\.io)$/
const KEY = 'miniapps.api'

function localPage(): boolean {
  return location.hostname === '127.0.0.1' || location.hostname === 'localhost'
}

export function validBase(raw: string | null | undefined): string | null {
  if (!raw) return null
  const base = raw.trim().replace(/\/+$/, '')
  if (HOSTS.test(base)) return base
  // local preview + e2e: the box gateway on loopback
  if (localPage() && /^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(base)) return base
  return null
}

/** Signed initData: from telegram-web-app.js, or straight from the launch fragment (#tgWebAppData=...). */
export function initData(): string {
  const tg = getWebApp()
  if (tg && typeof tg.initData === 'string' && tg.initData) return tg.initData
  try {
    const fromHash = new URLSearchParams(location.hash.slice(1)).get('tgWebAppData')
    if (fromHash && fromHash.includes('hash=')) return fromHash
  } catch { /* no fragment */ }
  try {
    // telegram-web-app.js keeps the launch params here after it strips the fragment
    const kept = sessionStorage.getItem('__telegram__initParams')
    const data = kept ? (JSON.parse(kept) as { tgWebAppData?: string }).tgWebAppData : null
    if (data && data.includes('hash=')) return data
  } catch { /* none */ }
  return ''
}

/** Wait (briefly) for Telegram to hand over initData: the SDK may still be loading on slow phones. */
async function waitInitData(ms = 4000): Promise<string> {
  const end = Date.now() + ms
  for (;;) {
    const init = initData()
    if (init) return init
    let kept = false
    try { kept = Boolean(sessionStorage.getItem('__telegram__initParams')) } catch { /* none */ }
    const inTg = /tgWebApp/.test(location.hash) || kept
    if (!inTg || Date.now() > end) return ''
    await new Promise((r) => setTimeout(r, 100))
  }
}

/** Telegram start_param (from t.me/bot?startapp=...) or ?start= on the URL. */
export function startParam(): string | null {
  const tg = getWebApp() as { initDataUnsafe?: { start_param?: string } } | null
  const fromTg = tg?.initDataUnsafe?.start_param
  if (typeof fromTg === 'string' && fromTg) return fromTg
  const q = new URLSearchParams(location.search)
  return q.get('tgWebAppStartParam') || q.get('start') || null
}

let cached: Promise<string | null> | null = null

async function publishedBase(): Promise<string | null> {
  try {
    const res = await fetch(new URL(`../api.json?t=${Date.now()}`, location.href).href, { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json() as { api?: string | null }
    return validBase(data.api ?? null)
  } catch {
    return null
  }
}

export function discoverBase(): Promise<string | null> {
  if (cached) return cached
  cached = (async () => {
    const fromUrl = validBase(new URLSearchParams(location.search).get('api'))
    if (fromUrl) {
      try { sessionStorage.setItem(KEY, fromUrl) } catch { /* private mode */ }
      return fromUrl
    }
    const published = await publishedBase()
    if (published) return published
    try {
      return validBase(sessionStorage.getItem(KEY))
    } catch {
      return null
    }
  })()
  return cached
}

/** A live session exists when we are inside Telegram (signed initData) and a backend is published. */
export async function liveSession(): Promise<{ base: string; init: string } | null> {
  const init = await waitInitData()
  if (!init) return null
  // give the SDK a moment so BackButton / MainButton / haptics bind on the first screen
  for (let i = 0; i < 15 && !getWebApp(); i += 1) await new Promise((r) => setTimeout(r, 100))
  const base = await discoverBase()
  return base ? { base, init } : null
}

export class Api {
  base: string
  init: string
  svc: Service
  constructor(svc: Service, base: string, init: string) {
    this.svc = svc
    this.base = base
    this.init = init
  }

  async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `tma ${this.init}`,
      'ngrok-skip-browser-warning': '1',
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const send = () => fetch(`${this.base}/${this.svc}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    })
    let res: Response
    try {
      res = await send()
    } catch {
      // the tunnel may have moved: re-read api.json once and retry there
      const fresh = await publishedBase()
      if (!fresh || fresh === this.base) throw new ApiError(0, 'offline', 'No connection to the bot. Check your internet and try again.')
      this.base = fresh
      try { sessionStorage.setItem(KEY, fresh) } catch { /* private mode */ }
      try {
        res = await send()
      } catch {
        throw new ApiError(0, 'offline', 'No connection to the bot. Check your internet and try again.')
      }
    }
    let data: unknown = null
    try { data = await res.json() } catch { /* not JSON */ }
    if (!res.ok) {
      const err = (data ?? {}) as { error?: string; message?: string }
      throw new ApiError(res.status, err.error ?? 'http', err.message ?? 'Something went wrong. Try again.')
    }
    return data as T
  }

  get<T>(path: string) { return this.call<T>('GET', path) }
  post<T>(path: string, body: unknown = {}) { return this.call<T>('POST', path, body) }
  put<T>(path: string, body: unknown = {}) { return this.call<T>('PUT', path, body) }
  patch<T>(path: string, body: unknown = {}) { return this.call<T>('PATCH', path, body) }
  del<T>(path: string, body?: unknown) { return this.call<T>('DELETE', path, body) }
}

export async function connect(svc: Service): Promise<Api | null> {
  const s = await liveSession()
  return s ? new Api(svc, s.base, s.init) : null
}

/** Open a t.me link inside Telegram (share sheet, invite), without closing the app. */
export function openLink(url: string): void {
  const tg = getWebApp()
  try {
    if (inTelegram() && tg?.openTelegramLink && url.startsWith('https://t.me/')) {
      tg.openTelegramLink(url)
      return
    }
  } catch { /* fall back */ }
  window.open(url, '_blank', 'noopener')
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Ask once for permission to message the user (needed for draw / reminder notifications). */
export function requestWriteAccess(): Promise<boolean> {
  const tg = getWebApp() as { requestWriteAccess?: (cb: (ok: boolean) => void) => void } | null
  if (!inTelegram() || !tg?.requestWriteAccess) return Promise.resolve(false)
  return new Promise((resolve) => {
    try { tg.requestWriteAccess!((ok) => resolve(Boolean(ok))) } catch { resolve(false) }
  })
}
