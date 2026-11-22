import { demoRequested } from '../mode.ts'
import { BotMatchdayRepository } from './bot.ts'
import { createDeviceRepository } from './demo.ts'
import { readLaunchPayload } from './payload.ts'
import type { MatchdayRepository } from './types.ts'

/**
 * Opened from the bot: the snapshot travels in ?d= -> BotMatchdayRepository.
 * ?demo=1 -> demo seed. Anything else -> the waiting state.
 */
export function createMatchdayRepository(): MatchdayRepository {
  if (!demoRequested()) {
    const live = readLaunchPayload()
    if (live) return new BotMatchdayRepository(live)
  }
  return createDeviceRepository()
}
