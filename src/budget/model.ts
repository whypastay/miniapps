import {
  addDays,
  daysBetween,
  formatDay,
  formatMoney,
  formatPlain,
  isCurrency,
  parseISODate,
  startOfDay,
  toISODate,
  type Currency,
} from '../format.ts'

export type Variant = 'classic' | 'reverse' | 'custom'
export type Phase = 'upcoming' | 'active' | 'closed'
export type CellState = 'paid' | 'due' | 'missed' | 'future'

export interface BudgetState {
  version: 1
  variant: Variant
  multiplier: number
  customAmount: number
  currency: Currency
  year: number
  startDate: string
  paid: Record<string, string>
}

export interface WeekEntry {
  week: number
  amount: number
  status: CellState
  paidOn: string | null
  due: string
  dueLabel: string
  late: number | null
  timing: string
}

export interface Ledger {
  phase: Phase
  currentWeek: number
  saved: number
  goal: number
  progress: number
  streak: number
  missed: number
  nextWeek: number | null
  nextAmount: number
  paidCount: number
  entries: WeekEntry[]
}

export const BUDGET_KEY = 'si:budget:v1'
const UNIT_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]

export function createEmpty(today = new Date(), overrides: Partial<Pick<BudgetState, 'variant' | 'multiplier' | 'customAmount' | 'currency' | 'startDate' | 'year'>> = {}): BudgetState {
  const startDate = overrides.startDate ?? toISODate(startOfDay(today))
  const year = overrides.year ?? Number(startDate.slice(0, 4))
  return {
    version: 1,
    variant: overrides.variant ?? 'classic',
    multiplier: Math.max(1, Math.round(overrides.multiplier ?? 1)),
    customAmount: Math.max(1, Math.round(overrides.customAmount ?? 25)),
    currency: overrides.currency ?? 'EUR',
    year: Number.isFinite(year) ? year : today.getFullYear(),
    startDate,
    paid: {},
  }
}

export function createSeed(today = new Date()): BudgetState {
  const start = addDays(startOfDay(today), -30 * 7)
  const paid: Record<string, string> = {}
  for (let week = 1; week <= 30; week += 1) {
    if (week === 17) continue
    const due = addDays(start, (week - 1) * 7)
    const paidOn = week === 29 ? addDays(due, 1) : due
    paid[String(week)] = toISODate(paidOn)
  }
  return {
    version: 1,
    variant: 'classic',
    multiplier: 10,
    customAmount: 25,
    currency: 'EUR',
    year: 2027,
    startDate: toISODate(start),
    paid,
  }
}

export function sanitize(value: unknown): BudgetState | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<BudgetState>
  if (raw.version !== 1) return null
  if (raw.variant !== 'classic' && raw.variant !== 'reverse' && raw.variant !== 'custom') return null
  if (!isCurrency(raw.currency)) return null
  if (typeof raw.startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.startDate)) return null
  if (typeof raw.multiplier !== 'number' || !Number.isFinite(raw.multiplier) || raw.multiplier < 1) return null
  if (typeof raw.customAmount !== 'number' || !Number.isFinite(raw.customAmount) || raw.customAmount < 1) return null
  if (typeof raw.year !== 'number' || !Number.isFinite(raw.year)) return null
  if (!raw.paid || typeof raw.paid !== 'object') return null
  const paid: Record<string, string> = {}
  for (const [key, stamp] of Object.entries(raw.paid)) {
    const week = Number(key)
    if (!Number.isInteger(week) || week < 1 || week > 52) continue
    if (typeof stamp !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(stamp)) continue
    paid[String(week)] = stamp
  }
  return {
    version: 1,
    variant: raw.variant,
    multiplier: Math.round(raw.multiplier),
    customAmount: Math.round(raw.customAmount),
    currency: raw.currency,
    year: Math.round(raw.year),
    startDate: raw.startDate,
    paid,
  }
}

export function weekAmount(state: Pick<BudgetState, 'variant' | 'multiplier' | 'customAmount'>, week: number): number {
  if (state.variant === 'custom') return state.customAmount
  const units = state.variant === 'reverse' ? 53 - week : week
  return units * state.multiplier
}

export function ruleChip(state: BudgetState): string {
  if (state.variant === 'custom') return `CUSTOM ${formatMoney(state.customAmount, state.currency)}`
  return `${state.variant === 'reverse' ? 'REVERSE' : 'CLASSIC'} ×${state.multiplier}`
}

export function ruleLine(state: BudgetState): string {
  if (state.variant === 'custom') return 'EVERY WEEK SAVES THE SAME AMOUNT.'
  if (state.variant === 'reverse') return 'WEEK N SAVES (53 − N) × THE UNIT.'
  return 'WEEK N SAVES N × THE UNIT.'
}

export function stepUnit(value: number, direction: 1 | -1): number {
  if (direction > 0) return UNIT_STEPS.find((step) => step > value) ?? value
  const lower = [...UNIT_STEPS].reverse().find((step) => step < value)
  return lower ?? UNIT_STEPS[0]
}

export function toggleWeek(state: BudgetState, week: number, today = new Date()): BudgetState {
  const key = String(week)
  const paid = { ...state.paid }
  if (paid[key]) delete paid[key]
  else paid[key] = toISODate(startOfDay(today))
  return { ...state, paid }
}

export function resetState(state: BudgetState, today = new Date()): BudgetState {
  return { ...state, paid: {}, startDate: toISODate(startOfDay(today)) }
}

function timing(status: CellState, late: number | null): string {
  if (status === 'future') return 'AHEAD'
  if (status === 'due') return 'DUE'
  if (status === 'missed') return 'MISSED'
  if (late === null || late === 0) return 'ON TIME'
  if (late < 0) return late === -1 ? '1 DAY EARLY' : `${-late} DAYS EARLY`
  return late === 1 ? '+1 DAY' : `+${late} DAYS`
}

export function derive(state: BudgetState, today = new Date()): Ledger {
  const start = parseISODate(state.startDate)
  const elapsed = daysBetween(start, today)
  let phase: Phase = 'active'
  let currentWeek = 1
  if (elapsed < 0) phase = 'upcoming'
  else {
    const week = Math.floor(elapsed / 7) + 1
    if (week > 52) {
      phase = 'closed'
      currentWeek = 52
    } else currentWeek = week
  }

  const paid = new Map<number, string>()
  for (const [key, stamp] of Object.entries(state.paid)) {
    const week = Number(key)
    if (week >= 1 && week <= 52) paid.set(week, stamp)
  }

  const entries: WeekEntry[] = []
  let saved = 0
  let goal = 0
  for (let week = 1; week <= 52; week += 1) {
    const amount = weekAmount(state, week)
    goal += amount
    const dueDate = addDays(start, (week - 1) * 7)
    const paidOn = paid.get(week) ?? null
    let status: CellState
    if (paidOn) status = 'paid'
    else if (phase === 'active' && week === currentWeek) status = 'due'
    else if (phase === 'upcoming' || (phase === 'active' && week > currentWeek)) status = 'future'
    else status = 'missed'
    if (paidOn) saved += amount
    const late = paidOn ? daysBetween(dueDate, parseISODate(paidOn)) : null
    entries.push({
      week,
      amount,
      status,
      paidOn,
      due: toISODate(dueDate),
      dueLabel: formatDay(dueDate),
      late,
      timing: timing(status, late),
    })
  }

  let cursor = 0
  if (phase === 'closed') cursor = 52
  else if (phase === 'active') cursor = paid.has(currentWeek) ? currentWeek : currentWeek - 1
  let streak = 0
  for (let week = cursor; week >= 1; week -= 1) {
    if (!paid.has(week)) break
    streak += 1
  }

  const missed = entries.filter((entry) => entry.status === 'missed').length
  let nextWeek: number | null = null
  if (phase === 'upcoming' || phase === 'closed') {
    nextWeek = entries.find((entry) => entry.status !== 'paid')?.week ?? null
  } else if (!paid.has(currentWeek)) nextWeek = currentWeek
  else nextWeek = entries.find((entry) => entry.week > currentWeek && entry.status !== 'paid')?.week ?? null

  return {
    phase,
    currentWeek,
    saved,
    goal,
    progress: goal === 0 ? 0 : (saved / goal) * 100,
    streak,
    missed,
    nextWeek,
    nextAmount: nextWeek ? weekAmount(state, nextWeek) : 0,
    paidCount: paid.size,
    entries,
  }
}

export function progressLabel(ledger: Ledger, currency: Currency): string {
  return `${ledger.progress.toFixed(1)}% OF ${formatMoney(ledger.goal, currency)}`
}

export function heroText(amount: number): string {
  return formatPlain(amount)
}
