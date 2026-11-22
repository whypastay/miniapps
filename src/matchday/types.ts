export interface Fixture {
  id: string
  kickoff: string
  home: string
  away: string
}

export type ResultPick = '1' | 'X' | '2'

export interface Pick {
  fixtureId: string
  result: ResultPick | null
  homeScore: number | null
  awayScore: number | null
}

export interface TableRow {
  id: string
  name: string
  isYou: boolean
  points: number
  move: number
}

export interface Gameweek {
  played: number
  picking: number
  season: number
  lockAt: number
  resultPoints: number
  exactScorePoints: number
}

export interface LeagueInfo {
  name: string
  code: string
  seasonLabel: string
}

export interface MatchdaySettings {
  displayName: string
  remindBeforeLock: boolean
}

/** One upcoming fixture as the bot sent it, with this user's prediction (if any). */
export interface LiveFixture {
  id: string
  kickoff: number
  home: string
  away: string
  comp: string
  predHome: number | null
  predAway: number | null
}

export interface LiveResult {
  home: string
  away: string
  homeScore: number
  awayScore: number
  predHome: number
  predAway: number
  points: number
}

export interface LiveRow {
  name: string
  points: number
  isYou: boolean
  rank: number
}

/** The per-user snapshot the bot packs into ?d= (see bots/matchday/matchday/webapp.py). */
export interface LiveMatchday {
  version: number
  issuedAt: number
  botUsername: string
  timeZone: string
  zoneLabel: string
  resultPoints: number
  exactPoints: number
  name: string
  globalRank: number | null
  globalPlayers: number
  points: number
  exact: number
  table: { name: string; code: string; rank: number | null; players: number; rows: LiveRow[] }
  leagues: Array<{ name: string; code: string }>
  fixtures: LiveFixture[]
  results: LiveResult[]
  remind: boolean
  round: string
}

export interface MatchdaySnapshot {
  live?: LiveMatchday | null
  connected: boolean
  gameweek: Gameweek
  fixtures: Fixture[]
  picks: Pick[]
  table: TableRow[]
  league: LeagueInfo
  settings: MatchdaySettings
}

/**
 * Screens talk only to this interface.
 * DemoMatchdayRepository keeps a local league (?demo=1 or the waiting state).
 * BotMatchdayRepository reads the snapshot the bot put into ?d=.
 */
export interface MatchdayRepository {
  load(): Promise<MatchdaySnapshot>
  savePicks(picks: Pick[]): Promise<void>
  saveSettings(settings: MatchdaySettings): Promise<void>
  reset(): Promise<MatchdaySnapshot>
}
