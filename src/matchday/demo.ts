import { addDays, startOfDay, toISODate } from '../format.ts'
import { readJson, writeJson } from '../storage.ts'
import type { Fixture, MatchdayRepository, MatchdaySettings, MatchdaySnapshot, Pick, ResultPick } from './types.ts'

const KEY = 'si:matchday:v1'

function nextSunday(today: Date): Date {
  const start = startOfDay(today)
  const add = (7 - start.getDay()) % 7
  return addDays(start, add)
}

function stamp(day: Date, hh: number, mm: number): string {
  return `${toISODate(day)}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function pick(id: string, result: ResultPick | null, home: number | null, away: number | null): Pick {
  return { fixtureId: id, result, homeScore: home, awayScore: away }
}

export function createMatchdaySeed(today = new Date()): MatchdaySnapshot {
  const sunday = nextSunday(today)
  const fixtures: Fixture[] = [
    { id: 'f1', kickoff: stamp(sunday, 12, 30), home: 'Arsenal', away: 'Chelsea' },
    { id: 'f2', kickoff: stamp(sunday, 14, 0), home: 'Liverpool', away: 'Everton' },
    { id: 'f3', kickoff: stamp(sunday, 14, 0), home: 'Man City', away: 'Man United' },
    { id: 'f4', kickoff: stamp(sunday, 14, 0), home: 'Spurs', away: 'Newcastle' },
    { id: 'f5', kickoff: stamp(sunday, 16, 30), home: 'Villa', away: 'Brighton' },
    { id: 'f6', kickoff: stamp(sunday, 16, 30), home: 'Brentford', away: 'Fulham' },
    { id: 'f7', kickoff: stamp(sunday, 14, 0), home: 'Wolves', away: 'Palace' },
    { id: 'f8', kickoff: stamp(sunday, 14, 0), home: 'West Ham', away: 'Bournemouth' },
    { id: 'f9', kickoff: stamp(sunday, 16, 30), home: 'Forest', away: 'Leeds' },
    { id: 'f10', kickoff: stamp(sunday, 19, 0), home: 'Ipswich', away: 'Leicester' },
  ]
  return {
    gameweek: {
      played: 14,
      picking: 15,
      season: 38,
      lockAt: today.getTime() + ((2 * 60 + 14) * 60 + 36) * 1000,
      resultPoints: 1,
      exactScorePoints: 3,
    },
    fixtures,
    picks: [
      pick('f1', '1', 2, 0),
      pick('f2', '1', 3, 1),
      pick('f3', 'X', 1, 1),
      pick('f4', '2', null, null),
      pick('f5', '1', null, null),
      pick('f6', 'X', null, null),
      pick('f7', null, null, null),
      pick('f8', null, null, null),
      pick('f9', null, null, null),
      pick('f10', null, null, null),
    ],
    table: [
      { id: 'marco', name: 'Marco B.', isYou: false, points: 96, move: 0 },
      { id: 'priya', name: 'Priya N.', isYou: false, points: 91, move: 1 },
      { id: 'you', name: 'You', isYou: true, points: 88, move: 2 },
      { id: 'aisha', name: 'Aisha K.', isYou: false, points: 85, move: 2 },
      { id: 'tom', name: 'Tom H.', isYou: false, points: 79, move: 1 },
      { id: 'lukas', name: 'Lukas W.', isYou: false, points: 71, move: 0 },
      { id: 'sofia', name: 'Sofia', isYou: false, points: 64, move: -1 },
      { id: 'daniel', name: 'Daniel', isYou: false, points: 58, move: 0 },
      { id: 'kenji', name: 'Kenji', isYou: false, points: 51, move: -2 },
    ],
    league: { name: 'Sunday Squad', code: 'SUN-14', seasonLabel: 'FRIENDS LEAGUE' },
    settings: { displayName: 'You', remindBeforeLock: true },
  }
}

function revive(value: unknown): MatchdaySnapshot | null {
  if (!value || typeof value !== 'object') return null
  const snap = value as MatchdaySnapshot
  if (!snap.gameweek || !Array.isArray(snap.fixtures) || !Array.isArray(snap.picks) || !Array.isArray(snap.table)) return null
  return snap
}

function read(): MatchdaySnapshot {
  return readJson(KEY, revive) ?? createMatchdaySeed()
}

export class DemoMatchdayRepository implements MatchdayRepository {
  load(): Promise<MatchdaySnapshot> {
    const existing = readJson(KEY, revive)
    if (existing) return Promise.resolve(existing)
    const seed = createMatchdaySeed()
    writeJson(KEY, seed)
    return Promise.resolve(seed)
  }

  savePicks(picks: Pick[]): Promise<void> {
    const snapshot = read()
    writeJson(KEY, { ...snapshot, picks })
    return Promise.resolve()
  }

  saveSettings(settings: MatchdaySettings): Promise<void> {
    const snapshot = read()
    const name = settings.displayName.trim() || 'You'
    const table = snapshot.table.map((row) => (row.isYou ? { ...row, name } : row))
    writeJson(KEY, { ...snapshot, settings: { ...settings, displayName: name }, table })
    return Promise.resolve()
  }

  reset(): Promise<MatchdaySnapshot> {
    const seed = createMatchdaySeed()
    writeJson(KEY, seed)
    return Promise.resolve(seed)
  }
}

export function createMatchdayRepository(): MatchdayRepository {
  return new DemoMatchdayRepository()
}

export function picksMade(picks: Pick[]): number {
  return picks.filter((pick) => pick.result !== null).length
}

export function impliedResult(home: number, away: number): ResultPick {
  if (home > away) return '1'
  if (home < away) return '2'
  return 'X'
}
