/* RemoteRadar data shapes (mirror of /radar/api). */
import { formatShort, parseISODate } from '../format.ts'
import { getWebApp, inTelegram } from '../telegram.ts'

export interface Country { code: string; name: string; focus: boolean }
export interface Opt { id: string; label: string }
export interface Source { id: string; name: string; home: string }
export interface Example { id: string; label: string; text: string }
export interface Meta {
  countries: Country[]; roles: Opt[]; levels: Opt[]; sources: Source[]
  feedDay: string | null; examples: Example[]; bot: string; hub: string; gigsHub?: string
}
export interface Prefs {
  country: string | null; countryName: string | null; roles: string[]; levels: string[]
  alert: { on: boolean; hour: number; tz: string | null }
}
export interface Me {
  prefs: Prefs; meta: Meta; savedCount: number
  start: { job: string | null; check: string | null; gig?: string | null; tab?: string | null }
  onboarded?: boolean; gigsOnboarded?: boolean; gigWatch?: boolean; gate?: import('../guide.tsx').GateInfo
}

export interface Job {
  token: string; id?: string; title: string; company: string; pay: string; type?: string; level?: string
  roles?: string[]; eligibility: string; location: string; published: string; excerpt?: string
  url: string; source: string; sourceName: string; sourceHome: string; saved: boolean
  requirements?: string[]; about?: string; inFeed?: boolean; openToYou?: boolean | null
}
export interface FeedPage { jobs: Job[]; total: number; offset: number; feedDay: string | null; country: string; countryName: string }

export interface Flag { id: string; severity: 'high' | 'medium' | 'low'; title: string; why: string; evidence?: string }
export interface CheckResult {
  level: 'high' | 'caution' | 'clear'; verdict: string; summary: string; score?: number
  flags: Flag[]; positives: string[]; tips?: string[]; count?: number; job?: Job
}
export interface CheckResponse { result: CheckResult; token: string; link: string; shareUrl: string }
export interface PublicCheck { result: CheckResult; bot: string; botLink: string; appLink: string }

export type GigStatus = 'open' | 'closed' | 'varies' | 'invite'
export interface GigCard {
  id: string; name: string; operator: string; kind: string; status: GigStatus; statusLabel: string
  official: string[]; url: string
}
export interface GigDetail extends GigCard {
  countryNote: string; tasks: string; onboarding: string[]; pay: string; watch: string[]
  sources: Array<{ label: string; url: string }>; reviewed: string
}
export interface GigsPage {
  platforms: GigCard[]; counts: Record<GigStatus, number>; country: string | null; countryName: string | null
  reviewed: string; reviewEveryDays: number; reviewDue: boolean; watch: boolean
  listings: Job[]; listingsDay: string | null; sources: Source[]; hub: string
}

export const LEVEL_LABEL: Record<string, string> = { entry: 'Entry', mid: 'Mid', senior: 'Senior' }

export function day(iso: string | null | undefined): string {
  if (!iso) return ''
  try { return formatShort(parseISODate(iso)) } catch { return iso }
}

/** Board links open in the browser, outside Telegram's webview. The URL is passed through unchanged. */
export function openExternal(url: string): void {
  const tg = getWebApp() as { openLink?: (u: string) => void } | null
  try {
    if (inTelegram() && tg?.openLink) { tg.openLink(url); return }
  } catch { /* fall back */ }
  window.open(url, '_blank', 'noopener')
}

export function localTz(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
}

export interface Target { job?: string; check?: string; tab?: string; gig?: string }
/** Where the launch points: startapp=job_… / chk_… / gig_… / gigs (shares and posts, may carry __src_…),
 *  or ?job= / ?chk= / ?gig= / ?tab= from bot buttons. */
export function radarTarget(start: string | null): Target {
  const t: Target = {}
  for (const part of (start ?? '').split('__')) {
    if (/^job_[A-Za-z0-9]{6,24}$/.test(part)) t.job = part.slice(4)
    if (/^chk_[A-Za-z0-9]{6,24}$/.test(part)) t.check = part.slice(4)
    if (/^gig_[a-z0-9]{2,24}$/.test(part)) { t.gig = part.slice(4); t.tab = 'gigs' }
    if (part === 'gigs') t.tab = 'gigs'
  }
  const q = new URLSearchParams(location.search)
  const job = q.get('job'); const chk = q.get('chk'); const tab = q.get('tab'); const gig = q.get('gig')
  if (!t.gig && gig && /^[a-z0-9]{2,24}$/.test(gig)) { t.gig = gig; t.tab = 'gigs' }
  if (!t.job && job && /^[A-Za-z0-9]{6,24}$/.test(job)) t.job = job
  if (!t.check && chk && /^[A-Za-z0-9]{6,24}$/.test(chk)) t.check = chk
  if (!t.tab && tab && ['feed', 'gigs', 'saved', 'check', 'settings'].includes(tab)) t.tab = tab
  return t
}
