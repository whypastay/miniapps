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

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export function isCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value)
}

export function symbol(currency: Currency): string {
  return SYMBOL[currency]
}

export function formatPlain(amount: number): string {
  return Math.round(amount).toLocaleString('en-GB')
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

export function formatDay(date: Date): string {
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`
}

export function formatMonth(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

export function formatShort(date: Date): string {
  return `${date.getDate()}\u00A0${MONTHS[date.getMonth()]}`
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
