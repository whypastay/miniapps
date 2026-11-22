import { createEmptySanta } from './demo.ts'
import { loadRecord, saveRecord } from '../storage.ts'
import type { AnonymousNote, LiveGame, SantaRepository, SantaSettings, SantaSnapshot, WishlistItem } from './types.ts'

/**
 * Reads the game the bot packed into the URL. Read-only except for the
 * "gift bought" mark, which is the user's own note kept in Telegram CloudStorage.
 * Wishlist edits and anonymous notes go through the bot chat (deep links), not here.
 */
export class BotSantaRepository implements SantaRepository {
  private readonly game: LiveGame

  constructor(game: LiveGame) {
    this.game = game
  }

  private boughtKey(): string {
    return `santa_bought_${this.game.gameId}`
  }

  async load(): Promise<SantaSnapshot> {
    const base = createEmptySanta()
    const g = this.game
    let bought = false
    if (g.recipient) {
      const { raw } = await loadRecord(this.boughtKey())
      bought = raw === g.recipient.name
    }
    return {
      ...base,
      connected: true,
      studio: g.name,
      recipient: {
        ...base.recipient,
        givenName: g.recipient?.name ?? '',
        drawStatus: g.status === 'drawn' ? 'done' : 'pending',
        giftBought: bought,
      },
      live: g,
    }
  }

  async setGiftBought(bought: boolean): Promise<void> {
    if (!this.game.recipient) return
    // Store the recipient's name, so a redraw (new recipient) clears the mark.
    await saveRecord(this.boughtKey(), bought ? this.game.recipient.name : '')
  }

  saveMyWishlist(_items: WishlistItem[]): Promise<void> {
    return Promise.reject(new Error('The wishlist is edited in the bot chat.'))
  }

  sendAnonymousNote(_text: string): Promise<AnonymousNote> {
    return Promise.reject(new Error('Anonymous notes are sent through the bot chat.'))
  }

  saveSettings(_settings: SantaSettings): Promise<void> {
    return Promise.resolve()
  }

  reset(): Promise<SantaSnapshot> {
    return this.load()
  }
}
