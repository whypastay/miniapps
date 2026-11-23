// RemoteRadar · AI gigs mode end to end with a simulated launch: a random never-published bot token signs initData for
// fake users 9000000000000101-103 (nobody real exists behind them). API: gateway base.
import { createHmac } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import puppeteer from 'puppeteer-core'

const base = process.env.BASE_URL ?? 'http://127.0.0.1:43123'
const api = process.env.API ?? 'http://127.0.0.1:18790'
const out = process.env.SHOT_DIR ?? '/workspace/miniapps-deploy/shots'
const prefix = process.env.SHOT_PREFIX ?? 'gigsradar'
const chrome = process.env.CHROME ?? '/usr/bin/google-chrome'
const token = (await readFile(process.env.RADAR_TOKEN_FILE ?? '/tmp/radar-sim.token', 'utf8')).trim()
const failures = []
const check = (name, ok, detail = '') => { if (!ok) { failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`FAIL ${name} ${detail}`) } else console.log(`ok  ${name}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const USERS = {
  alice: { id: 9000000000000101, first_name: 'Alice', last_name: 'E2E', language_code: 'en' },
  bob: { id: 9000000000000102, first_name: 'Bob', last_name: 'E2E', language_code: 'en' },
  cara: { id: 9000000000000103, first_name: 'Cara', last_name: 'E2E', language_code: 'en' },
}

function sign(user, startParam) {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'AAE-e2e', user: JSON.stringify(user) }
  if (startParam) fields.start_param = startParam
  const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(token).digest()
  fields.hash = createHmac('sha256', secret).update(check).digest('hex')
  return new URLSearchParams(fields).toString()
}

async function call(who, method, path, body) {
  const res = await fetch(`${api}/radar/api${path}`, {
    method, headers: { Authorization: `tma ${sign(USERS[who])}`, 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, data: await res.json().catch(() => null) }
}

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none'] })

async function open(who, { start, query = '', telegram = true } = {}) {
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await page.setRequestInterception(true)
  page.on('request', (req) => {
    if (!req.url().includes('telegram.org/js')) return req.continue()
    return req.respond({ status: 200, contentType: 'text/javascript', body: '' })
  })
  page.on('pageerror', (err) => failures.push(`${who} page error: ${err.message}`))
  if (telegram) {
    const user = USERS[who]
    await page.evaluateOnNewDocument((initData, user, start) => {
      const btn = () => ({ isVisible: false, show() { this.isVisible = true }, hide() { this.isVisible = false }, onClick() {}, offClick() {}, setText() {}, enable() {}, disable() {} })
      window.__links = []; window.__external = []
      window.Telegram = { WebApp: {
        initData, initDataUnsafe: { user, start_param: start || undefined }, platform: 'ios', isFullscreen: false, colorScheme: 'light',
        ready() {}, expand() {}, close() {}, setHeaderColor() {}, setBackgroundColor() {}, setBottomBarColor() {}, disableVerticalSwipes() {},
        safeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 }, contentSafeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
        BackButton: btn(), MainButton: btn(),
        HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} },
        openTelegramLink(url) { window.__links.push(url) }, openLink(url) { window.__external.push(url) },
        requestWriteAccess(cb) { cb(true) }, onEvent() {}, offEvent() {},
      } }
    }, sign(user, start), user, start ?? '')
  }
  await page.goto(`${base}/radar/?api=${encodeURIComponent(api)}${query}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-ready="true"]', { timeout: 20000 })
  await page.evaluate(async () => { await document.fonts.ready })
  await sleep(250)
  return page
}

const screen = (page) => page.evaluate(() => (document.querySelector('[data-screen="intro"],[data-screen="help"]') ?? document.querySelector('[data-screen]'))?.getAttribute('data-screen'))
async function shot(page, name) { await mkdir(out, { recursive: true }); await page.screenshot({ path: `${out}/${prefix}-${name}.png` }) }
async function overflow(page, label) {
  const box = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
  check(`${label}: no horizontal overflow`, box.sw <= box.cw + 1, `scroll ${box.sw} client ${box.cw}`)
}
async function waitScreen(page, value, ms = 10000) { await page.waitForFunction((v) => (document.querySelector('[data-screen="intro"],[data-screen="help"]') ?? document.querySelector('[data-screen]'))?.getAttribute('data-screen') === v, { timeout: ms }, value) }
async function tab(page, id) { await page.click(`[data-tab="${id}"]`); await sleep(350) }
async function act(page, id) { await page.waitForSelector(`[data-action="${id}"]:not([disabled])`, { timeout: 10000 }); await page.click(`[data-action="${id}"]`); await sleep(500) }
async function text(page, sel) { return page.$eval(sel, (el) => el.textContent ?? '') }
async function scrollTop(page) { await page.evaluate(() => document.querySelector('.scroll')?.scrollTo(0, 0)); await sleep(120) }


async function scrollTo(page, sel) {
  await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'start' }), sel); await sleep(200)
}

for (const who of Object.keys(USERS)) await call(who, 'DELETE', '/me')

try {
  // 1. Alice taps the @remotelyhiredgigs post link (startapp=gigs__src_gigs): the AI gigs intro, then setup
  let a = await open('alice', { start: 'gigs__src_gigs' })
  await waitScreen(a, 'intro')
  const t1 = await text(a, '.guide-title')
  check('gigs intro opens on first launch from the channel', /AI gigs open to your country/.test(t1), t1)
  await shot(a, 'intro')
  await overflow(a, 'intro')
  for (let i = 0; i < 3; i++) await act(a, 'intro-next')
  const t4 = await text(a, '.guide-title')
  check('last intro card is about the notice', /Hear when one opens/.test(t4), t4)
  await act(a, 'intro-done')
  await waitScreen(a, 'radar-setup')
  let me = await call('alice', 'GET', '/me')
  check('finishing the gigs intro marks gigs only', me.data.gigsOnboarded === true && me.data.onboarded === false, JSON.stringify([me.data.gigsOnboarded, me.data.onboarded]))
  const lede = await text(a, '.radar-lede')
  check('setup speaks about AI gigs', /AI-training platforms/.test(lede), lede)
  await a.click('[data-field="country"] [data-value="NG"]')
  await sleep(150)
  await shot(a, 'setup')
  await act(a, 'save-setup')
  await waitScreen(a, 'radar-gigs')
  await a.waitForSelector('[data-gig]')
  const page = await call('alice', 'GET', '/gigs')
  const shown = Number(await text(a, '[data-field="gigs-open"]'))
  check('open count matches the API', shown === page.data.counts.open, `${shown} vs ${page.data.counts.open}`)
  const st = Object.fromEntries(await a.$$eval('[data-gig]', (els) => els.map((e) => [e.getAttribute('data-gig'), e.getAttribute('data-status')])))
  check('Outlier is not open to Nigeria', st.outlier === 'closed', st.outlier)
  check('Mercor is open to Nigeria', st.mercor === 'open', st.mercor)
  const order = await a.$$eval('[data-gig]', (els) => els.map((e) => e.getAttribute('data-status')))
  const rank = { open: 0, varies: 1, invite: 2, closed: 3 }
  check('open platforms are listed first', order.every((s, i) => i === 0 || rank[order[i - 1]] <= rank[s]), order.join(','))
  check('gigs tab shows a review date and independence note', /reviewed every 7 days/.test(await text(a, '[data-field="gigs-note"]')))
  await shot(a, 'gigs')
  await overflow(a, 'gigs')

  // 2. Notice on
  await a.click('[data-field="gig-watch"] [data-value="on"]'); await sleep(900)
  me = await call('alice', 'GET', '/me')
  check('gig notice turned on', me.data.gigWatch === true)
  await scrollTo(a, '[data-action="gig-check"]')
  await shot(a, 'safety')

  // 3. Platform detail: status, steps, sources, official site, share
  await scrollTop(a)
  await a.click('[data-gig="outlier"]')
  await waitScreen(a, 'radar-gig')
  const status = await text(a, '[data-field="gig-status"]')
  check('detail shows the country status with the reason', /Not open/.test(status) && /Nigeria/.test(status), status.slice(0, 120))
  check('detail names the official domain', (await text(a, '[data-field="gig-official"]')).includes('outlier.ai'))
  check('detail lists primary sources', (await a.$$('[data-field="gig-sources"] a')).length >= 1)
  await shot(a, 'platform')
  await overflow(a, 'platform')
  await scrollTo(a, '[data-field="gig-official"]')
  await shot(a, 'platform-safety')
  await a.click('[data-testid="open-official"], [data-action="open-official"]').catch(() => undefined)
  await sleep(300)
  let ext = await a.evaluate(() => window.__external)
  if (!ext.length) { await a.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Open outlier\.ai/.test(x.textContent)); b?.click() }); await sleep(300); ext = await a.evaluate(() => window.__external) }
  check('official site opens in the browser', ext.some((u) => u.startsWith('https://outlier.ai')), ext.join(','))
  await a.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Share with a friend/.test(x.textContent)); b?.click() })
  await sleep(1200)
  const links = await a.evaluate(() => window.__links)
  check('share opens a Telegram share link with gig_outlier', links.some((u) => u.includes('t.me/share/url') && decodeURIComponent(u).includes('startapp=gig_outlier')), links.join(','))

  // 4. Help for the gigs mode
  await a.close()
  a = await open('alice', { query: '&tab=gigs' })
  await waitScreen(a, 'radar-gigs')
  await act(a, 'open-help')
  await waitScreen(a, 'help')
  const help = await a.$eval('[data-screen="help"]', (el) => el.textContent)
  check('gigs help explains accounts and VPNs', /rent or share an account/.test(help) && /VPN/.test(help))
  await shot(a, 'help')
  await act(a, 'help-close')

  // 5. Feed keeps its own intro (separate mode)
  await tab(a, 'feed'); await sleep(600)
  check('job feed still has its own first-run intro', (await screen(a)) === 'intro' && /Jobs open to your country/.test(await text(a, '.guide-title')))
  await act(a, 'intro-skip')

  // 6. Scam check: fake copy of a platform
  await tab(a, 'check')
  await a.click('[data-example="clone"]'); await sleep(200)
  await act(a, 'run-check').catch(async () => { await a.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Check this job/.test(x.textContent)); b?.click() }) })
  await sleep(1200)
  if ((await screen(a)) !== 'radar-result') await a.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Check this job/.test(x.textContent)); b?.click() })
  await waitScreen(a, 'radar-result')
  const flags = await a.$$eval('[data-flag]', (els) => els.map((e) => e.getAttribute('data-flag')))
  check('clone check flags the fake domain and the fee', flags.includes('link_clone') && flags.includes('upfront_fee'), flags.join(','))
  await shot(a, 'check-clone')
  await a.close()

  // 7. Bob opens a shared platform without an account: detail first, hint, no intro wall
  const b = await open('bob', { start: 'gig_mercor' })
  await waitScreen(b, 'radar-gig')
  check('shared platform opens straight on its card', (await text(b, '[data-field="gig-name"]')) === 'Mercor')
  check('shared launch shows a hint, not the intro', Boolean(await b.$('[data-hint]')) && !(await b.$('[data-screen="intro"]')))
  await shot(b, 'shared')
  await overflow(b, 'shared')
  await b.evaluate(() => { const x = [...document.querySelectorAll('button')].find((y) => /Get RemoteRadar/.test(y.textContent)); x?.click() })
  await sleep(500)
  check('Get RemoteRadar leads to the gigs setup', (await screen(b)) === 'radar-setup' && /AI-training/.test(await text(b, '.radar-lede')))
  await b.close()

  // 8. Cara in India: live gig listings from the job boards
  await call('cara', 'PUT', '/prefs', { country: 'IN', roles: [], levels: [] })
  await call('cara', 'POST', '/me/onboarded', { done: true, mode: 'gigs' })
  const c = await open('cara', { query: '&tab=gigs' })
  await waitScreen(c, 'radar-gigs')
  await c.waitForSelector('[data-gig]')
  const cg = await call('cara', 'GET', '/gigs')
  if (cg.data.listings.length) {
    await scrollTo(c, '[data-job]')
    const rows = await c.$$eval('[data-job] .radar-src', (els) => els.map((e) => e.textContent.trim()))
    check('gig listings credit their board', rows.length > 0 && rows.every((t) => /Himalayas|Remote OK|Jobicy/.test(t)), rows.join(','))
  } else check('no listings today: empty state shown', Boolean(await c.$('.empty')))
  await c.evaluate(() => document.querySelector('.scroll')?.scrollBy(0, -60)); await sleep(150)
  await shot(c, 'listings')
  await c.close()
} catch (err) {
  failures.push(`crash: ${err.stack || err}`)
} finally {
  for (const who of Object.keys(USERS)) await call(who, 'DELETE', '/me')
  await browser.close()
}
console.log(failures.length ? `\n${failures.length} FAILED\n${failures.join('\n')}` : '\nall gigs checks passed')
process.exit(failures.length ? 1 : 0)
