import { useEffect, useRef, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { cls } from './format.ts'
import { themeBlock, themes, type ThemeId } from './theme.ts'
import { bindBackButton, bootTelegram, closeOrLeave, haptic, nativeChromeVisible } from './telegram.ts'

export interface TabItem {
  id: string
  label: string
}

export interface Action {
  label: string
  aside?: string
  onClick?: () => void
  disabled?: boolean
  tone?: 'gold' | 'ghost'
  mark?: 'arrow' | 'check' | 'none'
}

export function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 8h11M9 3.5 13.5 8 9 12.5" fill="none" stroke="currentColor" stroke-width="1.4" />
    </svg>
  )
}

export function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M2 7.2 5.4 10.6 12 3.4" fill="none" stroke="currentColor" stroke-width="1.6" />
    </svg>
  )
}

export function Dots() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="3.5" cy="9" r="1.15" fill="currentColor" />
      <circle cx="9" cy="9" r="1.15" fill="currentColor" />
      <circle cx="14.5" cy="9" r="1.15" fill="currentColor" />
    </svg>
  )
}

export function Shell(props: {
  theme: ThemeId
  title: string
  tabs: TabItem[]
  active: string
  home: string
  onTab: (id: string) => void
  actions?: Action[]
  ready?: boolean
  children: ComponentChildren
}) {
  const theme = themes[props.theme]
  const scrollRef = useRef<HTMLDivElement>(null)
  const [nativeChrome, setNativeChrome] = useState(false)
  const ready = props.ready !== false

  useEffect(() => {
    bootTelegram(theme)
    const sync = () => setNativeChrome(nativeChromeVisible())
    sync()
    const timer = window.setInterval(sync, 400)
    const stop = window.setTimeout(() => window.clearInterval(timer), 2400)
    return () => {
      window.clearInterval(timer)
      window.clearTimeout(stop)
    }
  }, [theme])

  useEffect(() => bindBackButton(props.active !== props.home, () => props.onTab(props.home)), [props.active, props.home, props.onTab])

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
      class={cls('app', `pattern-${theme.pattern}`)}
      data-layout="frame"
      data-theme={theme.id}
      data-ready={ready ? 'true' : 'false'}
    >
      <style>{themeBlock(theme)}</style>
      <div class="gridlines" aria-hidden="true"><i /><i /><i /></div>
      {nativeChrome ? null : (
        <header class="top">
          <button type="button" class="side left" onClick={() => { haptic('tap'); closeOrLeave() }}>CLOSE</button>
          <div>
            <h1>{props.title}</h1>
            <div class="sub">MINI APP</div>
          </div>
          <button type="button" class="side right" aria-label="Open settings" onClick={() => choose('settings')}>
            <Dots />
          </button>
        </header>
      )}
      <div class="scroll" ref={scrollRef}>
        {props.children}
      </div>
      <footer class="dock">
        {(props.actions ?? []).map((action) => (
          <button
            key={action.label}
            type="button"
            class={action.tone === 'ghost' ? 'ghost' : 'cta'}
            disabled={action.disabled}
            onClick={() => run(action)}
          >
            <span>{action.label}</span>
            <span class="cta-side">
              {action.aside ? <span>{action.aside}</span> : null}
              {action.mark === 'check' ? <Check /> : action.mark === 'none' || action.disabled ? null : <Arrow />}
            </span>
          </button>
        ))}
        <nav class="tabbar" role="tablist" aria-label="Sections">
          {props.tabs.map((tab, index) => (
            <button
              key={tab.id}
              type="button"
              class="tab"
              role="tab"
              data-tab={tab.id}
              aria-selected={tab.id === props.active}
              onClick={() => choose(tab.id)}
            >
              <span class="num">{String(index + 1).padStart(2, '0')}</span>
              <span class="lbl">{tab.label}</span>
            </button>
          ))}
        </nav>
      </footer>
    </div>
  )
}

export function Section(props: { index: string; title: string; aside?: ComponentChildren; children?: ComponentChildren }) {
  return (
    <section class="block">
      <header class="section-h">
        <span><span class="idx">{props.index}</span> — {props.title}</span>
        {props.aside ? <span class="aside">{props.aside}</span> : null}
      </header>
      {props.children}
    </section>
  )
}

export function Stats(props: {
  columns?: 2 | 3 | 4
  items: Array<{ label: string; value: string; unit?: string; field?: string }>
}) {
  return (
    <div class="stats" data-cols={props.columns ?? props.items.length}>
      {props.items.map((item) => (
        <div class="stat" key={item.label}>
          <div class="stat-label">{item.label}</div>
          <div class="stat-value">
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
      <strong>{props.title}</strong>
      <span>{props.body}</span>
    </div>
  )
}
