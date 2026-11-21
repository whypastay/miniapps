import type { Currency } from '../format.ts'

export interface WishlistItem {
  id: string
  title: string
  note: string
  price: number | null
}

export interface GroupMember {
  id: string
  name: string
  isYou: boolean
  wishlistCount: number
}

export interface Recipient {
  id: string
  givenName: string
  familyName: string
  budget: number
  currency: Currency
  exchangeDate: string
  exchangeTime: string
  drawStatus: 'done' | 'pending'
  wishlist: WishlistItem[]
  giftBought: boolean
}

export interface AnonymousNote {
  id: string
  text: string
  sentAt: string
}

export interface SantaSettings {
  displayName: string
  remindDayBefore: boolean
}

export interface SantaSnapshot {
  connected: boolean
  studio: string
  settings: SantaSettings
  recipient: Recipient
  myWishlist: WishlistItem[]
  group: GroupMember[]
  notes: AnonymousNote[]
}

/**
 * Screens talk only to this interface.
 * DemoSantaRepository is the on-device stand-in.
 * Replace it in createSantaRepository() with a bot client when the draw lives on the server.
 */
export interface SantaRepository {
  load(): Promise<SantaSnapshot>
  saveMyWishlist(items: WishlistItem[]): Promise<void>
  setGiftBought(bought: boolean): Promise<void>
  sendAnonymousNote(text: string): Promise<AnonymousNote>
  saveSettings(settings: SantaSettings): Promise<void>
  reset(): Promise<SantaSnapshot>
}
