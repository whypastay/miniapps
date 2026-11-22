export const CURRENCIES = ['EUR', 'USD', 'INR', 'PHP', 'NGN', 'GBP'] as const
export type Currency = (typeof CURRENCIES)[number]

const SYMBOL: Record<Currency, string> = {
  EUR: '€',
  USD: '$',
  INR: '₹',
  PHP: '₱',
  NGN: '₦',
  GBP: '£',
}

let locale = 'en-GB'

export function applyFormatLocale(language: string | null | undefined): void {
  if (!language) return
  const tag = language.replace('_', '-')
  try {
    new Intl.NumberFormat(tag).format(1)
    locale = tag
  } catch {
    locale = 'en-GB'
  }
}

export function formatLocale(): string {
  return locale
}

export function isCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value)
}

export function symbol(currency: Currency): string {
  return SYMBOL[currency]
}

export function formatPlain(amount: number): string {
  return Math.round(amount).toLocaleString(locale)
}

export function formatMoney(amount: number, currency: Currency): string {
  return SYMBOL[currency] + formatPlain(amount)
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseISODate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y || 1970, (m || 1) - 1, d || 1)
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000)
}

function tidy(value: string): string {
  return value.replace(/[,.]/g, '').replace(/\s+/g, ' ').trim()
}

export function formatDay(date: Date): string {
  return tidy(new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(date))
}

export function formatMonth(date: Date): string {
  return tidy(new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(date))
}

export function formatShort(date: Date): string {
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric' }).format(date)
  const month = tidy(new Intl.DateTimeFormat(locale, { month: 'short' }).format(date))
  return `${day}\u00A0${month}`
}

export function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatRemain(ms: number): string {
  if (ms <= 0) return '00:00:00'
  const total = Math.floor(ms / 1000)
  const hh = Math.floor(total / 3600)
  const mm = Math.floor((total % 3600) / 60)
  const ss = total % 60
  return [hh, mm, ss].map((part) => String(part).padStart(2, '0')).join(':')
}

export function cls(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
