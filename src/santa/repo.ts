import { demoRequested } from '../mode.ts'
import { BotSantaRepository } from './bot.ts'
import { createDeviceRepository } from './demo.ts'
import { readLaunchPayload } from './payload.ts'
import type { SantaRepository } from './types.ts'

/**
 * Opened from a bot message: the game travels in ?d= -> BotSantaRepository.
 * ?demo=1 -> demo seed. Anything else -> the waiting state.
 */
export function createSantaRepository(): SantaRepository {
  if (!demoRequested()) {
    const live = readLaunchPayload()
    if (live) return new BotSantaRepository(live)
  }
  return createDeviceRepository()
}
