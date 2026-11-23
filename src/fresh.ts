declare const __BUILD__: string

/**
 * GitHub Pages serves index.html with max-age=600 and Telegram's webview keeps it even longer,
 * so a phone can run last week's bundle. Compare our build id with /version.json (never cached)
 * and reload once onto a new URL (?v=<build>) when they differ. The #tgWebAppData fragment is kept.
 */
export function ensureFresh(): void {
  if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') return
  const url = new URL('../version.json', new URL('.', location.href))
  url.searchParams.set('t', String(Date.now()))
  void fetch(url.href, { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { build?: string } | null) => {
      const latest = data?.build
      if (!latest || latest === __BUILD__) return
      const key = `miniapps.reloaded.${latest}`
      try {
        if (sessionStorage.getItem(key)) return
        sessionStorage.setItem(key, '1')
      } catch { /* private mode: reload at most once per page anyway */ }
      const next = new URL(location.href)
      next.searchParams.set('v', latest)
      location.replace(next.href)
    })
    .catch(() => undefined)
}

export const BUILD_ID: string = __BUILD__
