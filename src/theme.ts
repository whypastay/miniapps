/* Ledger — design system A.
   Warm paper, one printing ink per bot, gold used only as foil (markers, the active tab, the current week).
   Bots differ by ink, paper tint and one motif; everything else is shared. */

export type ThemeId = 'budget' | 'santa' | 'matchday' | 'paper'
export type Motif = 'ledger' | 'seal' | 'pitch' | 'plain'

export interface Theme {
  id: ThemeId
  title: string
  motif: Motif
  /** Two-letter monogram printed on the seal and the hub. */
  mark: string
  paper: string
  ink: string
  gold: string
  up: string
  down: string
}

const shared = { gold: '#A9813F', up: '#2E6B47', down: '#9A3A2E' }

export const themes: Record<ThemeId, Theme> = {
  budget: { id: 'budget', title: 'Budget Better', motif: 'ledger', mark: 'bb', paper: '#F5F0E6', ink: '#123B2C', ...shared },
  santa: { id: 'santa', title: 'Secret Santa', motif: 'seal', mark: 'pp', paper: '#F6EFE7', ink: '#5B1526', ...shared },
  matchday: { id: 'matchday', title: 'Matchday', motif: 'pitch', mark: 'md', paper: '#F2F0EA', ink: '#14223F', ...shared },
  paper: { id: 'paper', title: 'Ledger', motif: 'plain', mark: 'a', paper: '#EEE8DC', ink: '#1D1A16', gold: '#8A6A35', up: '#2E6B47', down: '#9A3A2E' },
}

export function themeBlock(theme: Theme): string {
  return `:root{--paper:${theme.paper};--ink:${theme.ink};--gold:${theme.gold};--up:${theme.up};--down:${theme.down}}`
}
