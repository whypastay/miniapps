import { createEmptyMatchday } from './demo.ts'
import type { LiveMatchday, MatchdayRepository, MatchdaySettings, MatchdaySnapshot, Pick } from './types.ts'

/**
 * Reads the league snapshot the bot packed into the URL. Read-only:
 * predictions are saved by the bot (the app deep-links to ?start=pr_<fixture>).
 */
export class BotMatchdayRepository implements MatchdayRepository {
  private readonly live: LiveMatchday

  constructor(live: LiveMatchday) {
    this.live = live
  }

  load(): Promise<MatchdaySnapshot> {
    const base = createEmptyMatchday()
    const l = this.live
    return Promise.resolve({
      ...base,
      connected: true,
      live: l,
      gameweek: { ...base.gameweek, resultPoints: l.resultPoints, exactScorePoints: l.exactPoints },
      league: { name: l.table.name, code: l.table.code, seasonLabel: l.table.code ? 'FRIENDS LEAGUE' : 'WORLDWIDE' },
      settings: { displayName: l.name, remindBeforeLock: l.remind },
    })
  }

  savePicks(_picks: Pick[]): Promise<void> {
    return Promise.reject(new Error('Predictions are saved in the bot chat.'))
  }

  saveSettings(_settings: MatchdaySettings): Promise<void> {
    return Promise.resolve()
  }

  reset(): Promise<MatchdaySnapshot> {
    return this.load()
  }
}
