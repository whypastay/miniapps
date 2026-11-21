import { readJson, writeJson } from '../storage.ts'
import type { AnonymousNote, GroupMember, SantaRepository, SantaSettings, SantaSnapshot, WishlistItem } from './types.ts'

const KEY = 'si:santa:v1'

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

function exchangeYear(today: Date): number {
  const month = today.getMonth()
  const day = today.getDate()
  if (month > 11 || (month === 11 && day > 18)) return today.getFullYear() + 1
  return today.getFullYear()
}

export function createSantaSeed(today = new Date()): SantaSnapshot {
  const group: GroupMember[] = [
    { id: 'you', name: 'You', isYou: true, wishlistCount: 2 },
    { id: 'marco', name: 'Marco Bell', isYou: false, wishlistCount: 2 },
    { id: 'priya', name: 'Priya Nair', isYou: false, wishlistCount: 1 },
    { id: 'aisha', name: 'Aisha Rahman', isYou: false, wishlistCount: 3 },
    { id: 'tom', name: 'Tom Hale', isYou: false, wishlistCount: 2 },
    { id: 'lukas', name: 'Lukas Weber', isYou: false, wishlistCount: 1 },
    { id: 'sofia', name: 'Sofia Marin', isYou: false, wishlistCount: 2 },
    { id: 'daniel', name: 'Daniel Okonkwo', isYou: false, wishlistCount: 1 },
    { id: 'kenji', name: 'Kenji Mori', isYou: false, wishlistCount: 2 },
    { id: 'lena', name: 'Lena Voss', isYou: false, wishlistCount: 1 },
    { id: 'omar', name: 'Omar Said', isYou: false, wishlistCount: 2 },
    { id: 'chiara', name: 'Chiara De Luca', isYou: false, wishlistCount: 1 },
  ]
  return {
    studio: 'THE DRAW / STUDIO',
    settings: { displayName: 'You', remindDayBefore: true },
    recipient: {
      id: 'aisha',
      givenName: 'Aisha',
      familyName: 'Rahman',
      budget: 25,
      currency: 'EUR',
      exchangeDate: `${exchangeYear(today)}-12-18`,
      exchangeTime: '18:00',
      drawStatus: 'done',
      giftBought: false,
      wishlist: [
        { id: 'r1', title: 'Hardcover cookbook', note: 'Middle-Eastern / vegetarian', price: 22 },
        { id: 'r2', title: 'Merino wool socks', note: 'EU 38 · muted colours', price: 15 },
        { id: 'r3', title: 'Dark chocolate', note: '70%+ · no nuts', price: 8 },
      ],
    },
    myWishlist: [
      { id: 'm1', title: 'Black ink', note: 'Pilot Iroshizuku', price: 18 },
      { id: 'm2', title: 'Linen notebook', note: 'A5, plain', price: 12 },
    ],
    group,
    notes: [],
  }
}

function revive(value: unknown): SantaSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const snap = value as SantaSnapshot
  if (!snap.recipient || !Array.isArray(snap.group) || !Array.isArray(snap.myWishlist)) return null
  if (typeof snap.recipient.givenName !== 'string' || typeof snap.recipient.familyName !== 'string') return null
  return snap
}

function read(): SantaSnapshot {
  return readJson(KEY, revive) ?? createSantaSeed()
}

function write(snapshot: SantaSnapshot): void {
  writeJson(KEY, snapshot)
}

export class DemoSantaRepository implements SantaRepository {
  load(): Promise<SantaSnapshot> {
    const existing = readJson(KEY, revive)
    if (existing) return Promise.resolve(existing)
    const seed = createSantaSeed()
    write(seed)
    return Promise.resolve(seed)
  }

  saveMyWishlist(items: WishlistItem[]): Promise<void> {
    const snapshot = read()
    const you = snapshot.group.find((member) => member.isYou)
    if (you) you.wishlistCount = items.length
    write({ ...snapshot, myWishlist: items, group: snapshot.group })
    return Promise.resolve()
  }

  setGiftBought(bought: boolean): Promise<void> {
    const snapshot = read()
    snapshot.recipient.giftBought = bought
    write(snapshot)
    return Promise.resolve()
  }

  sendAnonymousNote(text: string): Promise<AnonymousNote> {
    const snapshot = read()
    const note: AnonymousNote = { id: uid(), text: text.trim(), sentAt: new Date().toISOString() }
    snapshot.notes = [note, ...snapshot.notes].slice(0, 20)
    write(snapshot)
    return Promise.resolve(note)
  }

  saveSettings(settings: SantaSettings): Promise<void> {
    const snapshot = read()
    const you = snapshot.group.find((member) => member.isYou)
    if (you) you.name = settings.displayName.trim() || 'You'
    write({ ...snapshot, settings: { ...settings, displayName: you?.name ?? 'You' } })
    return Promise.resolve()
  }

  reset(): Promise<SantaSnapshot> {
    const seed = createSantaSeed()
    write(seed)
    return Promise.resolve(seed)
  }
}

export function createSantaRepository(): SantaRepository {
  return new DemoSantaRepository()
}
