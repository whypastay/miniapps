import type { LiveFixture, LiveMatchday, LiveResult, LiveRow } from './types.ts'

export const PAYLOAD_VERSION = 1
export const DEFAULT_BOT = 'MatchdayPicks_bot'
const SESSION_KEY = 'si:matchday:payload'
let botUsername = DEFAULT_BOT

function str(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() ? value.slice(0, max) : null
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function goals(value: unknown): number | null {
  const n = num(value)
  return n !== null && n >= 0 && n <= 99 ? Math.trunc(n) : null
}

function fromBase64Url(token: string): string {
  const b64 = token.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (token.length % 4)) % 4)
  const bin = atob(b64)
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)))
}

function validZone(zone: string | null): string {
  if (!zone) return 'UTC'
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return zone
  } catch {
    return 'UTC'
  }
}

function list(value: unknown, max: number): unknown[][] {
  return Array.isArray(value) ? value.filter((x): x is unknown[] => Array.isArray(x)).slice(0, max) : []
}

/** Validate the bot payload. Unknown or broken input returns null (the app shows its waiting state). */
export function parsePayload(token: string | null | undefined): LiveMatchday | null {
  if (!token || token.length > 6000 || !/^[A-Za-z0-9_-]+$/.test(token)) return null
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(fromBase64Url(token)) as Record<string, unknown>
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object' || raw.v !== PAYLOAD_VERSION) return null
  const bot = str(raw.bu, 40)
  const tb = (raw.tb && typeof raw.tb === 'object' ? raw.tb : {}) as Record<string, unknown>
  const g = Array.isArray(raw.g) ? raw.g : []
  const sc = Array.isArray(raw.sc) ? raw.sc : []
  const rows: LiveRow[] = list(tb.rows, 12).flatMap((r) => {
    const name = str(r[0], 20)
    const points = num(r[1])
    return name && points !== null ? [{ name, points, isYou: r[2] === 1, rank: num(r[3]) ?? 0 }] : []
  })
  const fixtures: LiveFixture[] = list(raw.fx, 20).flatMap((f) => {
    const id = str(f[0], 24)
    const kickoff = num(f[1])
    const home = str(f[2], 24)
    const away = str(f[3], 24)
    if (!id || !/^[a-z0-9_]+$/.test(id) || kickoff === null || !home || !away) return []
    const predHome = goals(f[5])
    const predAway = goals(f[6])
    const both = predHome !== null && predAway !== null
    return [{ id, kickoff: kickoff * 1000, home, away, comp: str(f[4], 6) ?? 'PL', predHome: both ? predHome : null, predAway: both ? predAway : null }]
  })
  const results: LiveResult[] = list(raw.rs, 8).flatMap((r) => {
    const home = str(r[0], 24)
    const away = str(r[1], 24)
    const vals = [goals(r[2]), goals(r[3]), goals(r[4]), goals(r[5]), num(r[6])]
    if (!home || !away || vals.some((v) => v === null)) return []
    const [homeScore, awayScore, predHome, predAway, points] = vals as number[]
    return [{ home, away, homeScore, awayScore, predHome, predAway, points }]
  })
  return {
    version: PAYLOAD_VERSION,
    issuedAt: num(raw.t) ?? 0,
    botUsername: bot && /^[A-Za-z0-9_]{5,32}$/.test(bot) ? bot : DEFAULT_BOT,
    timeZone: validZone(str(raw.z, 40)),
    zoneLabel: str(raw.zl, 8) ?? 'UTC',
    resultPoints: num(sc[0]) ?? 1,
    exactPoints: num(sc[1]) ?? 3,
    name: str(raw.n, 20) ?? 'You',
    globalRank: num(g[0]),
    globalPlayers: num(g[1]) ?? 0,
    points: num(g[2]) ?? 0,
    exact: num(g[3]) ?? 0,
    table: {
      name: str(tb.n, 30) ?? 'Worldwide',
      code: str(tb.c, 8) ?? '',
      rank: num(tb.r),
      players: num(tb.pc) ?? rows.length,
      rows,
    },
    leagues: list(raw.lg, 6).flatMap((l) => {
      const name = str(l[0], 24)
      const code = str(l[1], 8)
      return name && code ? [{ name, code }] : []
    }),
    fixtures,
    results,
    remind: raw.rm === 1,
    round: str(raw.gw, 16) ?? '',
    viewerId: Number.isSafeInteger(raw.r) && (raw.r as number) > 0 ? (raw.r as number) : 0,
  }
}

/** Read ?d= (or #d= as a fallback); keep a session copy so an in-app reload still shows the snapshot. */
export function readLaunchPayload(): LiveMatchday | null {
  const fromQuery = new URLSearchParams(location.search).get('d')
  const fromHash = new URLSearchParams(location.hash.slice(1)).get('d')
  const token = fromQuery ?? fromHash
  let parsed: LiveMatchday | null = null
  if (token) {
    parsed = parsePayload(token)
    if (parsed) {
      try { sessionStorage.setItem(SESSION_KEY, token) } catch { /* private mode */ }
    }
  } else {
    try { parsed = parsePayload(sessionStorage.getItem(SESSION_KEY)) } catch { parsed = null }
  }
  if (parsed) botUsername = parsed.botUsername
  return parsed
}

export function botLink(start?: string): string {
  return `https://t.me/${botUsername}${start ? `?start=${start}` : ''}`
}
