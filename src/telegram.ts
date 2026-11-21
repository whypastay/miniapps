import type { Theme } from './theme.ts'

export interface TelegramSafeArea {
  top: number
  bottom: number
  left: number
  right: number
}

export interface TelegramButton {
  show: () => void
  hide: () => void
  onClick: (cb: () => void) => void
  offClick: (cb: () => void) => void
  isVisible?: boolean
}

export interface TelegramMainButton extends TelegramButton {
  setText?: (text: string) => void
  text?: string
  color?: string
  textColor?: string
  enable?: () => void
  disable?: () => void
}

export interface TelegramHaptics {
  impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void
  notificationOccurred: (type: 'error' | 'success' | 'warning') => void
  selectionChanged: () => void
}

export interface TelegramCloudStorage {
  setItem: (key: string, value: string, cb?: (error: string | null, stored?: boolean) => void) => void
  getItem: (key: string, cb: (error: string | null, value?: string) => void) => void
  removeItem: (key: string, cb?: (error: string | null, removed?: boolean) => void) => void
}

export interface TelegramWebApp {
  ready: () => void
  expand: () => void
  close: () => void
  initData: string
  initDataUnsafe?: { user?: { id: number } }
  platform: string
  colorScheme?: 'light' | 'dark'
  isFullscreen?: boolean
  setHeaderColor?: (color: string) => void
  setBackgroundColor?: (color: string) => void
  setBottomBarColor?: (color: string) => void
  disableVerticalSwipes?: () => void
  requestFullscreen?: () => void | Promise<void>
  safeAreaInset?: TelegramSafeArea
  contentSafeAreaInset?: TelegramSafeArea
  BackButton?: TelegramButton
  MainButton?: TelegramMainButton
  HapticFeedback?: TelegramHaptics
  CloudStorage?: TelegramCloudStorage
  shareMessage?: (msgId: string, cb?: (success: boolean) => void) => void
  openTelegramLink?: (url: string) => void
  onEvent?: (event: string, cb: () => void) => void
  offEvent?: (event: string, cb: () => void) => void
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

export function getWebApp(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null
}

export function inTelegram(): boolean {
  const tg = getWebApp()
  if (!tg) return false
  if (typeof tg.initData === 'string' && tg.initData.length > 0) return true
  if (tg.initDataUnsafe?.user) return true
  if (tg.platform && tg.platform !== 'unknown') return true
  return false
}

function applyInsets(): void {
  const tg = getWebApp()
  const area = tg?.contentSafeAreaInset ?? tg?.safeAreaInset
  const root = document.documentElement
  root.style.setProperty('--inset-top', `${area?.top ?? 0}px`)
  root.style.setProperty('--inset-bottom', `${area?.bottom ?? 0}px`)
}

export function bootTelegram(theme: Theme): void {
  const tg = getWebApp()
  if (!tg || !inTelegram()) return
  tg.ready()
  tg.expand()
  try { tg.setHeaderColor?.(theme.bg) } catch { /* older clients */ }
  try { tg.setBackgroundColor?.(theme.bg) } catch { /* older clients */ }
  try { tg.setBottomBarColor?.(theme.bg) } catch { /* optional */ }
  try { tg.disableVerticalSwipes?.() } catch { /* optional */ }
  if (!tg.isFullscreen && tg.requestFullscreen) {
    try {
      const result = tg.requestFullscreen()
      if (result && typeof (result as Promise<void>).then === 'function') {
        void (result as Promise<void>).catch(() => undefined)
      }
    } catch { /* fullscreen refused */ }
  }
  applyInsets()
  const update = () => applyInsets()
  tg.onEvent?.('safeAreaChanged', update)
  tg.onEvent?.('contentSafeAreaChanged', update)
  tg.onEvent?.('fullscreenChanged', update)
  tg.onEvent?.('viewportChanged', update)
}

export function nativeChromeVisible(): boolean {
  const tg = getWebApp()
  if (!tg || !inTelegram()) return false
  return !tg.isFullscreen
}

export type HapticKind = 'tap' | 'select' | 'success' | 'warning'

export function haptic(kind: HapticKind): void {
  const h = inTelegram() ? getWebApp()?.HapticFeedback : null
  if (!h) return
  try {
    if (kind === 'tap') h.impactOccurred('light')
    else if (kind === 'select') h.selectionChanged()
    else if (kind === 'success') h.notificationOccurred('success')
    else h.notificationOccurred('warning')
  } catch { /* haptics unavailable */ }
}

export function bindBackButton(visible: boolean, onClick: () => void): () => void {
  const button = inTelegram() ? getWebApp()?.BackButton : null
  if (!button) return () => undefined
  const handler = () => onClick()
  button.onClick(handler)
  if (visible) button.show()
  else button.hide()
  return () => {
    button.offClick(handler)
    button.hide()
  }
}

export function bindMainButton(options: {
  visible: boolean
  text: string
  color: string
  textColor: string
  onClick: () => void
}): () => void {
  const button = inTelegram() ? getWebApp()?.MainButton : null
  if (!button) return () => undefined
  const handler = () => options.onClick()
  button.setText?.(options.text)
  button.color = options.color
  button.textColor = options.textColor
  button.onClick(handler)
  if (options.visible) {
    button.enable?.()
    button.show()
  } else {
    button.hide()
  }
  return () => {
    button.offClick(handler)
    button.hide()
  }
}

export function closeOrLeave(): void {
  const tg = getWebApp()
  if (inTelegram() && tg) {
    tg.close()
    return
  }
  const directory = new URL('.', location.href)
  location.href = new URL('..', directory).href
}

export function preparedShareId(): string | null {
  const id = new URLSearchParams(location.search).get('shareMsg')
  return id && id.trim() ? id.trim() : null
}

export function sharePreparedMessage(id: string): Promise<boolean> {
  const tg = inTelegram() ? getWebApp() : null
  if (!tg?.shareMessage) return Promise.resolve(false)
  return new Promise((resolve) => {
    try {
      tg.shareMessage!(id, (success) => resolve(Boolean(success)))
    } catch {
      resolve(false)
    }
  })
}
