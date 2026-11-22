import type { LiveGame, LiveRecipient } from './types.ts'

export const PAYLOAD_VERSION = 1
export const BOT_USERNAME = 'PartyPackSanta_bot'
const SESSION_KEY = 'si:santa:payload'

function str(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() ? value.slice(0, max) : null
}

function fromBase64Url(token: string): string {
  const b64 = token.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (token.length % 4)) % 4)
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** Validate the bot payload. Unknown or broken input returns null (the app shows its waiting state). */
export function parsePayload(token: string | null | undefined): LiveGame | null {
  if (!token || token.length > 6000 || !/^[A-Za-z0-9_-]+$/.test(token)) return null
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(fromBase64Url(token)) as Record<string, unknown>
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object' || raw.v !== PAYLOAD_VERSION) return null
  const status = raw.s === 'drawn' ? 'drawn' : raw.s === 'open' ? 'open' : null
  const name = str(raw.n, 80)
  if (!status || !name || typeof raw.gid !== 'number') return null
  let recipient: LiveRecipient | null = null
  if (status === 'drawn' && raw.r && typeof raw.r === 'object') {
    const r = raw.r as Record<string, unknown>
    const rn = str(r.n, 40)
    if (rn) recipient = { name: rn, wishlist: str(r.w, 700) }
  }
  const date = str(raw.d, 10)
  return {
    version: PAYLOAD_VERSION,
    issuedAt: typeof raw.t === 'number' ? raw.t : 0,
    gameId: raw.gid,
    name,
    budget: str(raw.b, 40),
    exchangeDate: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    status,
    organizer: raw.o === true,
    playing: raw.me === true,
    playerCount: typeof raw.pc === 'number' ? raw.pc : 0,
    players: Array.isArray(raw.p) ? raw.p.filter((x): x is string => typeof x === 'string').slice(0, 60).map((x) => x.slice(0, 20)) : [],
    wishlist: raw.me === true ? str(raw.w, 700) : null,
    recipient,
  }
}

/** Read ?d= (or #d= as a fallback); keep a session copy so an in-app reload still shows the game. */
export function readLaunchPayload(): LiveGame | null {
  const fromQuery = new URLSearchParams(location.search).get('d')
  const fromHash = new URLSearchParams(location.hash.slice(1)).get('d')
  const token = fromQuery ?? fromHash
  if (token) {
    const parsed = parsePayload(token)
    if (parsed) {
      try { sessionStorage.setItem(SESSION_KEY, token) } catch { /* private mode */ }
    }
    return parsed
  }
  try {
    return parsePayload(sessionStorage.getItem(SESSION_KEY))
  } catch {
    return null
  }
}

export function botLink(start?: string): string {
  return `https://t.me/${BOT_USERNAME}${start ? `?start=${start}` : ''}`
}
