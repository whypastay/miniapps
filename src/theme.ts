export type ThemeId = 'budget' | 'santa' | 'matchday' | 'paper'
export type Pattern = 'dots' | 'hatch' | 'pinstripe' | 'quiet'

export interface Theme {
  id: ThemeId
  title: string
  pattern: Pattern
  bg: string
  bgDeep: string
  cream: string
  gold: string
  goldPress: string
  onGold: string
  muted: string
  faint: string
  line: string
  lineStrong: string
  patternInk: string
  up: string
  down: string
}

const ink = {
  cream: '#F3EBDD',
  gold: '#E2B656',
  goldPress: '#C99A3C',
  onGold: '#17200F',
  muted: 'rgba(243, 235, 221, 0.64)',
  faint: 'rgba(243, 235, 221, 0.40)',
  line: 'rgba(243, 235, 221, 0.18)',
  lineStrong: 'rgba(243, 235, 221, 0.32)',
  patternInk: 'rgba(243, 235, 221, 0.17)',
  up: '#C5D7BC',
  down: '#E7B2A4',
}

export const themes: Record<ThemeId, Theme> = {
  budget: {
    id: 'budget',
    title: 'Budget Better',
    pattern: 'dots',
    bg: '#1B4A38',
    bgDeep: '#10281F',
    ...ink,
  },
  santa: {
    id: 'santa',
    title: 'Secret Santa',
    pattern: 'hatch',
    bg: '#7A2F3E',
    bgDeep: '#4C1A26',
    ...ink,
  },
  matchday: {
    id: 'matchday',
    title: 'Matchday',
    pattern: 'pinstripe',
    bg: '#14233F',
    bgDeep: '#0C1730',
    ...ink,
  },
  paper: {
    id: 'paper',
    title: 'Swiss Instrument',
    pattern: 'quiet',
    bg: '#E6E1D6',
    bgDeep: '#D7D1C4',
    cream: '#1A1916',
    gold: '#8C6A2A',
    goldPress: '#74581F',
    onGold: '#F3EBDD',
    muted: 'rgba(26, 25, 22, 0.62)',
    faint: 'rgba(26, 25, 22, 0.42)',
    line: 'rgba(26, 25, 22, 0.16)',
    lineStrong: 'rgba(26, 25, 22, 0.32)',
    patternInk: 'rgba(26, 25, 22, 0.18)',
    up: '#1A1916',
    down: '#1A1916',
  },
}

export function themeBlock(theme: Theme): string {
  return `:root{--bg:${theme.bg};--bg-deep:${theme.bgDeep};--cream:${theme.cream};--gold:${theme.gold};--gold-press:${theme.goldPress};--on-gold:${theme.onGold};--muted:${theme.muted};--faint:${theme.faint};--line:${theme.line};--line-strong:${theme.lineStrong};--pattern:${theme.patternInk};--up:${theme.up};--down:${theme.down}}`
}
