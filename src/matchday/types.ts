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

export interface MatchdaySnapshot {
  gameweek: Gameweek
  fixtures: Fixture[]
  picks: Pick[]
  table: TableRow[]
  league: LeagueInfo
  settings: MatchdaySettings
}

/**
 * Screens talk only to this interface.
 * DemoMatchdayRepository keeps a local league.
 * Replace it in createMatchdayRepository() when the bot owns the table.
 */
export interface MatchdayRepository {
  load(): Promise<MatchdaySnapshot>
  savePicks(picks: Pick[]): Promise<void>
  saveSettings(settings: MatchdaySettings): Promise<void>
  reset(): Promise<MatchdaySnapshot>
}
