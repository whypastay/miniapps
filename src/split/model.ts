/* Ledger Split: shapes from savings/split_api.py and money formatting (integer minor units). */
export type CurTable = Record<string, [string, boolean, number]>

export interface Member { id: number; name: string; you: boolean; joined: boolean; left: boolean; owner: boolean; balance: Record<string, number>; paid: Record<string, number>; removable: boolean }
export interface Share { member: number; share: number; weight: string | null }
export interface Expense { id: number; kind: 'expense' | 'settle'; title: string; amount: number; currency: string; payer: number; mode: 'equal' | 'shares' | 'exact'; date: string | null; at: number; shares: Share[]; mine: number; byYou: boolean }
export interface Transfer { currency: string; from: number; to: number; amount: number; fromName: string; toName: string }
export interface Group {
  id: number; name: string; currency: string; code: string; owner: boolean; me: number; notify: boolean
  members: Member[]; expenses: Expense[]; expenseCount: number; totals: Record<string, number>; plan: Transfer[]
  myBalance: Record<string, number>; inviteLink: string; shareUrl: string; publicLink: string; inChat: boolean; chatUpdates: boolean
  currencies: CurTable
}
export interface GroupSummary { id: number; name: string; currency: string; members: number; totals: Record<string, number>; myBalance: Record<string, number>; updated: number }
export interface ListResponse { groups: GroupSummary[]; currencies: CurTable; bot: string }
export interface Invite { id: number; name: string; currency: string; member: boolean; people: string[]; placeholders: Array<{ id: number; name: string }> }
export interface PublicSummary {
  name: string; currency: string; people: Array<{ name: string; balance: Record<string, number> }>; totals: Record<string, number>
  count: number; plan: Array<{ currency: string; fromName: string; toName: string; amount: number }>; updated: number
  currencies: CurTable; bot: string; startLink: string
}

export const FEATURED = ['INR', 'PHP', 'NGN', 'USD', 'EUR', 'GBP']

const FALLBACK: CurTable = { USD: ['$', true, 2] }
let table: CurTable = FALLBACK
export function setCurrencies(t: CurTable | undefined) { if (t && Object.keys(t).length) table = t }
export function currencyCodes(): string[] { return Object.keys(table) }
export function decimals(cur: string): number { return (table[cur] ?? ['', true, 2])[2] }

/** 120000 INR -> "₹1,200"; sign adds + for positives; minus is a true minus sign. */
export function money(minor: number, cur: string, opts: { sign?: boolean; abs?: boolean } = {}): string {
  const [sym, before, n] = table[cur] ?? [`${cur} `, true, 2]
  const neg = minor < 0 && !opts.abs
  const v = Math.abs(minor) / 10 ** n
  let num = v.toLocaleString('en-US', { minimumFractionDigits: n, maximumFractionDigits: n })
  if (n && num.endsWith('.' + '0'.repeat(n))) num = num.slice(0, -(n + 1))
  const out = before ? `${sym}${num}` : `${num} ${sym}`
  if (neg) return `−${out}`
  return opts.sign && minor > 0 ? `+${out}` : out
}

export function toMinor(raw: string, cur: string): number | null {
  let s = raw.trim().replace(/[\s_\u00a0]/g, '')
  if (!s) return null
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '')
  else if (s.includes(',')) s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.')
  if (!/^\d+(\.\d*)?$/.test(s)) return null
  const n = decimals(cur)
  const v = Math.round(Number(s) * 10 ** n)
  return Number.isFinite(v) && v > 0 ? v : null
}

export function majorString(minor: number, cur: string): string {
  const n = decimals(cur)
  return n ? (minor / 10 ** n).toFixed(n).replace(/\.0+$/, '') : String(minor)
}

/** Same fair rounding as the server: floor, then hand the left-over units to the largest remainders. */
export function previewSplit(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum <= 0 || total <= 0) return weights.map(() => 0)
  const raw = weights.map((w) => (total * w) / sum)
  const base = raw.map((r) => Math.floor(r))
  let left = total - base.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => [r - base[i], i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1])
  for (const [, i] of order) { if (left <= 0) break; base[i] += 1; left -= 1 }
  return base
}

export function firstName(name: string): string { return name.split(' ')[0] || name }

export function balanceLine(bal: Record<string, number>): { text: string; tone: 'up' | 'down' | 'even' } {
  const entries = Object.entries(bal).filter(([, v]) => v)
  if (!entries.length) return { text: 'Settled', tone: 'even' }
  const text = entries.map(([c, v]) => money(v, c, { sign: true })).join(' · ')
  const tone = entries.every(([, v]) => v > 0) ? 'up' : entries.every(([, v]) => v < 0) ? 'down' : 'even'
  return { text, tone }
}
