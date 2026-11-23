import { useEffect, useRef, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { applyFormatLocale, cls } from './format.ts'
import { themeBlock, themes, type ThemeId } from './theme.ts'
import { bindBackButton, bootTelegram, closeOrLeave, haptic, nativeChromeVisible, telegramFullscreen, telegramProfile } from './telegram.ts'

export type IconName = 'ledger' | 'bars' | 'people' | 'gear' | 'gift' | 'list' | 'grid' | 'cards' | 'split' | 'radar' | 'bookmark' | 'shield'

export interface TabItem {
  id: string
  label: string
  icon?: IconName
}

export interface Action {
  label: string
  aside?: string
  onClick?: () => void
  disabled?: boolean
  tone?: 'gold' | 'ghost'
  mark?: 'arrow' | 'check' | 'none'
  testId?: string
}

/** Sentence case for system copy ("NO MARKS" -> "No marks"). Never used on people's names. */
export function sentence(text: string): string {
  const lower = text.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

export function Arrow() {
  return (
    <svg class="glyph" width="18" height="12" viewBox="0 0 18 12" aria-hidden="true">
      <path d="M1 6h15M11.5 1.5 16 6l-4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.2" />
    </svg>
  )
}

export function Check() {
  return (
    <svg class="glyph" width="15" height="12" viewBox="0 0 15 12" aria-hidden="true">
      <path d="M1.5 6.4 5.4 10.2 13.5 1.8" fill="none" stroke="currentColor" stroke-width="1.3" />
    </svg>
  )
}

export function Dots() {
  return (
    <svg width="14" height="4" viewBox="0 0 14 4" aria-hidden="true">
      <circle cx="2" cy="2" r="1" fill="currentColor" />
      <circle cx="7" cy="2" r="1" fill="currentColor" />
      <circle cx="12" cy="2" r="1" fill="currentColor" />
    </svg>
  )
}

const ICONS: Record<IconName, ComponentChildren> = {
  ledger: <><rect x="3" y="3" width="14" height="14" /><path d="M3 8h14M8 8v9" /></>,
  bars: <path d="M3 16h14M5 13V9M9 13V5M13 13V7M17 13v-3" />,
  people: <><circle cx="7" cy="8" r="3" /><circle cx="14" cy="9" r="2.3" /><path d="M2 17c0-3 2.4-5 5-5s5 2 5 5M12 13.5c3 0 5 1.5 5 3.5" /></>,
  gear: <><circle cx="10" cy="10" r="2.5" /><path d="M10 2v3M10 15v3M2 10h3M15 10h3M4.3 4.3l2.1 2.1M13.6 13.6l2.1 2.1M4.3 15.7l2.1-2.1M13.6 6.4l2.1-2.1" /></>,
  gift: <path d="M3 8h14v9H3zM2 5h16v3H2zM10 5v12M10 5c-1-3-5-3-5 0M10 5c1-3 5-3 5 0" />,
  list: <path d="M5 3h10v14H5zM8 7h4M8 10h4M8 13h2" />,
  grid: <><rect x="3" y="3" width="14" height="14" /><path d="M3 10h14M10 3v14" /></>,
  split: <><path d="M3 5h14M3 15h14M10 5v10" /><circle cx="6" cy="10" r="1.2" /><circle cx="14" cy="10" r="1.2" /></>,
  radar: <><path d="M10 10 16.5 4.5" /><path d="M3 10a7 7 0 0 1 7-7M5.5 10A4.5 4.5 0 0 1 10 5.5M8 10a2 2 0 0 1 2-2" /><path d="M3 10h14M10 10v7" /><circle cx="14" cy="7" r="0.8" fill="currentColor" /></>,
  bookmark: <path d="M5 3h10v14l-5-3.6L5 17z" />,
  shield: <><path d="M10 2.5 16 5v5c0 3.6-2.6 6.3-6 7.5C6.6 16.3 4 13.6 4 10V5z" /><path d="M10 7v4M10 13.2v.6" /></>,
  cards: <><rect x="6" y="3" width="10" height="13" transform="rotate(8 11 9.5)" /><rect x="3" y="4" width="10" height="13" /><path d="M6 9h4M6 12h3" /></>,
}

export function Icon(props: { name: IconName }) {
  return (
    <svg class="ic" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">
      {ICONS[props.name]}
    </svg>
  )
}

type Chrome = 'browser' | 'overlay' | 'native'

function chromeMode(): Chrome {
  if (telegramFullscreen()) return 'overlay'
  return nativeChromeVisible() ? 'native' : 'browser'
}

export function Shell(props: {
  theme: ThemeId
  title: string
  tabs: TabItem[]
  active: string
  home: string
  onTab: (id: string) => void
  actions?: Action[]
  /** Masthead: two mono labels between a heavy and a hairline rule. */
  mast?: [string, string]
  ready?: boolean
  screen?: string
  /** Telegram BackButton on the home tab (e.g. back to a list of games). */
  onBack?: () => void
  /** Short status line under the masthead (saving, errors). */
  toast?: string | null
  children: ComponentChildren
}) {
  const theme = themes[props.theme]
  const scrollRef = useRef<HTMLDivElement>(null)
  const [chrome, setChrome] = useState<Chrome>('browser')
  const [greeting, setGreeting] = useState<string | null>(null)
  const ready = props.ready !== false
  const hasSettings = props.tabs.some((tab) => tab.id === 'settings')

  useEffect(() => {
    // telegram-web-app.js loads async (telegram.org can be slow): boot as soon as it is there
    let booted = false
    const boot = () => {
      if (booted || !window.Telegram?.WebApp) return
      booted = true
      bootTelegram(theme)
    }
    boot()
    const bootTimer = window.setInterval(() => { boot(); if (booted) window.clearInterval(bootTimer) }, 100)
    const bootStop = window.setTimeout(() => window.clearInterval(bootTimer), 8000)
    const sync = () => {
      setChrome(chromeMode())
      const profile = telegramProfile()
      applyFormatLocale(profile.language)
      setGreeting(profile.firstName)
    }
    sync()
    const timer = window.setInterval(sync, 400)
    const stop = window.setTimeout(() => window.clearInterval(timer), 6000)
    return () => {
      window.clearInterval(timer)
      window.clearTimeout(stop)
      window.clearInterval(bootTimer)
      window.clearTimeout(bootStop)
    }
  }, [theme])

  useEffect(() => bindBackButton(
    props.active !== props.home || Boolean(props.onBack),
    () => { if (props.active !== props.home) props.onTab(props.home); else props.onBack?.() },
  ), [props.active, props.home, props.onTab, props.onBack])

  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0)
  }, [props.active])

  function choose(id: string) {
    if (id === props.active) return
    haptic('select')
    props.onTab(id)
  }

  function run(action: Action) {
    if (action.disabled || !action.onClick) return
    haptic('tap')
    action.onClick()
  }

  return (
    <div
      class={cls('app', `motif-${theme.motif}`)}
      data-layout="frame"
      data-theme={theme.id}
      data-chrome={chrome}
      data-ready={ready ? 'true' : 'false'}
      data-screen={props.screen}
    >
      <style>{themeBlock(theme)}</style>
      {chrome === 'native' ? null : (
        <header class="top">
          {chrome === 'browser' ? (
            <button type="button" class="side left" onClick={() => { haptic('tap'); closeOrLeave() }}>Close</button>
          ) : null}
          <div class="top-title">
            <h1>{props.title}</h1>
            <div class="sub">{greeting ? greeting : 'mini app'}</div>
          </div>
          {chrome === 'browser' && hasSettings ? (
            <button type="button" class="side right" aria-label="Open settings" onClick={() => choose('settings')}>
              <span class="ring"><Dots /></span>
            </button>
          ) : null}
        </header>
      )}
      {props.mast ? (
        <div class="mast" data-field="mast">
          <span>{props.mast[0]}</span>
          <span>{props.mast[1]}</span>
        </div>
      ) : <div class="mast bare" aria-hidden="true" />}
      {props.toast ? <div class="toast" role="status" data-field="toast">{props.toast}</div> : null}
      <div class="scroll" ref={scrollRef}>
        <div class="page">{props.children}</div>
      </div>
      <footer class="dock">
        {(props.actions ?? []).length > 0 ? (
          <div class="actions">
            {(props.actions ?? []).map((action) => (
              <button
                key={action.label}
                type="button"
                class={action.tone === 'ghost' ? 'ghost' : 'cta'}
                disabled={action.disabled}
                data-action={action.testId}
                onClick={() => run(action)}
              >
                <span class="cta-label">{action.label}{action.aside ? <span class="cta-aside"> · {action.aside}</span> : null}</span>
                {action.tone === 'ghost' ? null : (
                  <span class="cta-side">
                    {action.mark === 'check' ? <Check /> : action.mark === 'none' || action.disabled ? null : <Arrow />}
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : null}
        {props.tabs.length > 0 ? <nav class="tabbar" role="tablist" aria-label="Sections" style={{ ['--tabs' as string]: String(props.tabs.length) }}>
          {props.tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              class="tab"
              role="tab"
              data-tab={tab.id}
              aria-selected={tab.id === props.active}
              onClick={() => choose(tab.id)}
            >
              <Icon name={tab.icon ?? 'grid'} />
              <span class="lbl">{tab.label}</span>
            </button>
          ))}
        </nav> : <div class="tabbar-pad" />}
      </footer>
    </div>
  )
}

export function Section(props: { index?: string; title: string; aside?: ComponentChildren; plain?: boolean; children?: ComponentChildren }) {
  return (
    <section class="block">
      <header class="section-h">
        <h3>{props.plain ? props.title : sentence(props.title)}</h3>
        {props.aside ? <span class="aside">{props.aside}</span> : null}
      </header>
      {props.children}
    </section>
  )
}

export function Kicker(props: { children: ComponentChildren }) {
  return <div class="kicker">{props.children}</div>
}

export function Stats(props: {
  columns?: 2 | 3 | 4
  items: Array<{ label: string; value: string; unit?: string; field?: string; small?: boolean }>
}) {
  return (
    <div class="stats" data-cols={props.columns ?? props.items.length}>
      {props.items.map((item) => (
        <div class="stat" key={item.label}>
          <div class="stat-label">{item.label}</div>
          <div class={item.small ? 'stat-value small' : 'stat-value'}>
            <span data-field={item.field}>{item.value}</span>
            {item.unit ? <span class="stat-unit">{item.unit}</span> : null}
          </div>
        </div>
      ))}
    </div>
  )
}

export function Empty(props: { title: string; body: string }) {
  return (
    <div class="empty">
      <strong>{sentence(props.title)}</strong>
      <span>{props.body}</span>
    </div>
  )
}

/** Santa motif: a framed card with a diagonal ribbon and a wax seal carrying the monogram. */
export function Seal(props: { mark: string; children: ComponentChildren }) {
  return (
    <div class="seal">
      <div class="ribbon" aria-hidden="true" />
      <div class="wax" aria-hidden="true">{props.mark}</div>
      {props.children}
    </div>
  )
}

/** Matchday motif: a pitch drawn in hairline, printed faintly behind the hero. */
export function Pitch() {
  return (
    <svg class="pitch" viewBox="0 0 170 150" preserveAspectRatio="xMaxYMin meet" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">
      <rect x="10" y="10" width="150" height="130" />
      <path d="M85 10v130" />
      <circle cx="85" cy="75" r="24" />
      <rect x="10" y="45" width="26" height="60" />
      <rect x="134" y="45" width="26" height="60" />
    </svg>
  )
}

/** RemoteRadar motif: a radar sweep in hairline, printed faintly behind the hero, with one gold blip. */
export function RadarSweep() {
  return (
    <svg class="radar-sweep" viewBox="0 0 160 160" preserveAspectRatio="xMaxYMin meet" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true">
      <circle cx="160" cy="0" r="150" />
      <circle cx="160" cy="0" r="110" />
      <circle cx="160" cy="0" r="70" />
      <circle cx="160" cy="0" r="30" />
      <path d="M160 0 L22 92" />
      <path d="M160 0 L60 140" stroke-dasharray="2 4" />
      <circle class="blip" cx="74" cy="58" r="3" />
    </svg>
  )
}
