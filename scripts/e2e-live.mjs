// End-to-end check of the live (server-backed) Mini Apps with simulated Telegram initData.
// INIT_FILE: {svc: {alice|bob|cara: {init, user}}} signed for fake user ids. API: gateway base.
import { mkdir, readFile } from 'node:fs/promises'
import puppeteer from 'puppeteer-core'

const base = process.env.BASE_URL ?? 'http://127.0.0.1:43123'
const api = process.env.API ?? 'http://127.0.0.1:18790'
const out = process.env.SHOT_DIR ?? '/workspace/miniapps-deploy/shots'
const prefix = process.env.SHOT_PREFIX ?? 'full'
const chrome = process.env.CHROME ?? '/usr/bin/google-chrome'
const init = JSON.parse(await readFile(process.env.INIT_FILE ?? '/tmp/e2e/init.json', 'utf8'))
const failures = []
const REAL = process.env.REAL_SDK === '1'
const check = (name, ok, detail = '') => { if (!ok) { failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`FAIL ${name} ${detail}`) } else console.log(`ok  ${name}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function call(svc, who, method, path, body) {
  const res = await fetch(`${api}/${svc}/api${path}`, {
    method, headers: { Authorization: `tma ${init[svc][who].init}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, data: await res.json().catch(() => null) }
}

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none'] })

async function open(svc, who, query = '') {
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await page.setRequestInterception(true)
  page.on('request', (req) => {
    if (!req.url().includes('telegram.org/js')) return req.continue()
    if (REAL) return void setTimeout(() => req.continue(), 2500)
    return req.respond({ status: 200, contentType: 'text/javascript', body: '' })
  })
  page.on('pageerror', (err) => failures.push(`${svc}/${who} page error: ${err.message}`))
  const tg = init[svc][who]
  if (REAL) {
    const q = query ? `?${query.replace(/^&/, '')}` : ''
    const hash = `#tgWebAppData=${encodeURIComponent(tg.init)}&tgWebAppVersion=8.0&tgWebAppPlatform=ios&tgWebAppThemeParams=%7B%7D`
    await page.goto(`${base}/${svc}/${q}${hash}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-ready="true"]', { timeout: 20000 })
    await page.evaluate(async () => { await document.fonts.ready })
    await sleep(300)
    return page
  }
  await page.evaluateOnNewDocument((initData, user) => {
    const btn = (name) => ({ _cb: null, isVisible: false, text: '', show() { this.isVisible = true }, hide() { this.isVisible = false }, onClick(cb) { this._cb = cb }, offClick() { this._cb = null }, setText(t) { this.text = t }, enable() {}, disable() {}, _name: name })
    window.__links = []
    window.Telegram = { WebApp: {
      initData, initDataUnsafe: { user }, platform: 'ios', isFullscreen: false, colorScheme: 'light',
      ready() {}, expand() {}, close() {}, setHeaderColor() {}, setBackgroundColor() {}, setBottomBarColor() {}, disableVerticalSwipes() {},
      safeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 }, contentSafeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
      BackButton: btn('back'), MainButton: btn('main'),
      HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} },
      openTelegramLink(url) { window.__links.push(url) }, requestWriteAccess(cb) { cb(true) }, onEvent() {}, offEvent() {},
    } }
  }, tg.init, tg.user)
  await page.goto(`${base}/${svc}/?api=${encodeURIComponent(api)}${query}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-ready="true"]', { timeout: 15000 })
  await page.evaluate(async () => { await document.fonts.ready })
  await sleep(150)
  return page
}

const screen = (page) => page.$eval('[data-screen]', (el) => el.getAttribute('data-screen'))
async function shot(page, name) { await mkdir(out, { recursive: true }); await page.screenshot({ path: `${out}/${prefix}-${name}.png` }) }
async function overflow(page, label) {
  const box = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
  check(`${label} no horizontal overflow`, box.sw <= box.cw + 1, `scroll ${box.sw} client ${box.cw}`)
}
async function type(page, sel, text) { await page.click(sel, { clickCount: 3 }); await page.type(sel, text) }
async function waitScreen(page, value, ms = 8000) { await page.waitForFunction((v) => document.querySelector('[data-screen]')?.getAttribute('data-screen') === v, { timeout: ms }, value) }
async function tab(page, id) { await page.click(`[data-tab="${id}"]`); await sleep(150) }
async function act(page, id) { await page.waitForSelector(`[data-action="${id}"]:not([disabled])`, { timeout: 8000 }); await page.click(`[data-action="${id}"]`); await sleep(400) }

// ---------------------------------------------------------------- Santa
async function santa() {
  const a = await open('santa', 'alice')
  check('santa: new user lands on the create form', (await screen(a)) === 'games-new', await screen(a))
  await type(a, '[data-field="new-name"]', 'E2E Office Party')
  await type(a, '[data-field="new-budget"]', '€20')
  const d = new Date(Date.now() + 20 * 86400e3).toISOString().slice(0, 10)
  await a.$eval('[data-field="new-date"]', (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })) }, d)
  await shot(a, 'santa-create')
  await overflow(a, 'santa create')
  await act(a, 'create')
  await waitScreen(a, 'game-group')
  await tab(a, 'game')
  const code = await a.$eval('[data-field="code"]', (el) => el.textContent.trim())
  check('santa: invite code shown in app', /^[A-Za-z0-9]{4,}$/.test(code), code)
  if (!REAL) await act(a, 'invite') // outside Telegram the real SDK navigates to t.me
  const links = (await a.evaluate(() => window.__links)) ?? []
  if (!REAL) check('santa: invite opens the Telegram share sheet', links.some((l) => l.startsWith('https://t.me/share/url')), links.join(','))
  await shot(a, 'santa-invite')

  for (const who of ['bob', 'cara']) {
    const p = await open('santa', who, `&join=${code}`)
    check(`santa: ${who} sees the join form prefilled`, (await screen(p)) === 'games-join')
    await act(p, 'join')
    await waitScreen(p, 'game-wishlist')
    await type(p, '[data-field="wishlist"]', `${who} wants: a good book\nwarm socks`)
    if (who === 'bob') await shot(p, 'santa-wishlist')
    await act(p, 'save-wish')
    await p.close()
  }
  // organizer draws in the app
  await a.reload({ waitUntil: 'domcontentloaded' })
  await a.waitForSelector('[data-ready="true"]')
  await sleep(500)
  await tab(a, 'group')
  const players = await a.$$eval('.row', (rows) => rows.length)
  await shot(a, 'santa-group')
  check('santa: reopening lands in the game', (await screen(a)).startsWith('game-'), await screen(a))
  await tab(a, 'manage')
  await shot(a, 'santa-manage')
  await act(a, 'draw')
  const mainVisible = await a.evaluate(() => window.Telegram.WebApp.MainButton.isVisible && (window.Telegram.WebApp.MainButton.text || 'shown'))
  check('santa: draw confirm uses the Telegram MainButton', Boolean(mainVisible), String(mainVisible))
  await act(a, 'confirm')
  await waitScreen(a, 'game-game')
  const rec = await a.$eval('[data-field="recipient"]', (el) => el.textContent.trim()).catch(() => '')
  check('santa: organizer sees a recipient after the draw', rec.length > 0, rec)
  check('santa: group had 3 players', players >= 3, String(players))
  await shot(a, 'santa-draw')

  // bob: notes + bought
  const b = await open('santa', 'bob')
  check('santa: bob opens straight into the game', (await screen(b)).startsWith('game-'), await screen(b))
  await b.type('[data-field="note"]', 'What size are your socks?')
  await act(b, 'send-note')
  await b.waitForFunction(() => document.querySelectorAll('.thread .row').length > 0, { timeout: 8000 })
  await act(b, 'bought')
  await sleep(500)
  check('santa: gift marked bought', (await b.$('.bought')) !== null)
  await shot(b, 'santa-notes')
  const bobView = (await call('santa', 'bob', 'GET', '/me')).data
  const gid = bobView.games[0].id
  const bobGame = (await call('santa', 'bob', 'GET', `/games/${gid}`)).data
  const giftee = bobGame.recipient.name.split(' ')[0].toLowerCase()
  const gv = (await call('santa', giftee, 'GET', `/games/${gid}`)).data
  check('santa: giftee receives the anonymous note', gv.notes.some((n) => n.dir === 'fromSanta' && n.text.includes('socks')), JSON.stringify(gv.notes))
  check('santa: organizer cannot see pairs', !('assignments' in (await call('santa', 'alice', 'GET', `/games/${gid}`)).data))
  // reply from giftee to santa in app
  const g = await open('santa', giftee)
  await g.click('[data-field="to-santa"]')
  await g.type('[data-field="note"]', 'Size 42, thanks!')
  await act(g, 'send-note')
  await sleep(600)
  const b2 = (await call('santa', 'bob', 'GET', `/games/${gid}`)).data
  check('santa: santa receives the reply in app', b2.notes.some((n) => n.dir === 'fromGiftee' && n.text.includes('42')), JSON.stringify(b2.notes))
  await g.close(); await b.close(); await a.close()
  return gid
}

// ---------------------------------------------------------------- Matchday
async function matchday() {
  const a = await open('matchday', 'alice')
  check('matchday: live screen', (await screen(a)).startsWith('live-'), await screen(a))
  await tab(a, 'picks')
  const hasFx = (await a.$$('[data-action="home-plus"]')).length > 0
  if (hasFx) {
    const fx = await a.$eval('[data-fixture]:not(.is-locked)', (el) => el.getAttribute('data-fixture'))
    const card = `[data-fixture="${fx}"]`
    await a.click(`${card} [data-action="home-plus"]`); await a.click(`${card} [data-action="home-plus"]`)
    await a.click(`${card} [data-action="away-plus"]`); await a.click(`${card} [data-action="home-plus"]`)
    await shot(a, 'matchday-picks')
    await overflow(a, 'matchday picks')
    await act(a, 'save-picks')
    await sleep(600)
    const st = (await call('matchday', 'alice', 'GET', '/state')).data
    const f = st.fixtures.find((x) => x.id === fx)
    check('matchday: prediction saved from the app', f && f.predHome === 3 && f.predAway === 1, JSON.stringify(f))
  } else {
    check('matchday: open fixtures available (none right now)', true)
  }
  await tab(a, 'league')
  await act(a, 'new-league')
  await type(a, '[data-field="league-name"]', 'E2E League')
  await act(a, 'create')
  await sleep(500)
  const st = (await call('matchday', 'alice', 'GET', '/state')).data
  const lg = st.leagues.find((l) => l.name === 'E2E League')
  check('matchday: league created in app', Boolean(lg))
  await shot(a, 'matchday-league')
  if (!REAL) await act(a, 'invite')
  if (!REAL) check('matchday: invite opens the share sheet', (await a.evaluate(() => window.__links)).some((l) => l.startsWith('https://t.me/share/url')))
  const b = await open('matchday', 'bob', `&join=${lg.code}`)
  await act(b, 'join')
  await sleep(500)
  const bs = (await call('matchday', 'bob', 'GET', '/state')).data
  check('matchday: friend joins the league in app', bs.leagues.some((l) => l.code === lg.code))
  await tab(b, 'table')
  await shot(b, 'matchday-table')
  await tab(b, 'settings')
  await b.click('[data-zone="IST"]')
  await sleep(600)
  await b.click('[data-field="remind"]')
  await sleep(600)
  const bs2 = (await call('matchday', 'bob', 'GET', '/state')).data
  check('matchday: time zone + reminder saved', bs2.me.tz === 'Asia/Kolkata' && bs2.me.remind === true, `${bs2.me.tz} ${bs2.me.remind}`)
  await shot(b, 'matchday-settings')
  await b.close(); await a.close()
}

// ---------------------------------------------------------------- Budget
async function budget() {
  const a = await open('budget', 'alice')
  check('budget: new user onboarding', (await screen(a)) === 'onboarding', await screen(a))
  await a.click('[data-action="open-ledger"]')
  await waitScreen(a, 'ledger')
  await sleep(300)
  await a.click('[data-week="1"]')
  await sleep(1500)
  const s1 = (await call('budget', 'alice', 'GET', '/state')).data
  check('budget: ledger synced to the bot', s1.state && s1.state.paid && s1.state.paid['1'], JSON.stringify(s1.state))
  await shot(a, 'budget-ledger')
  await overflow(a, 'budget ledger')
  await tab(a, 'settings')
  await a.click('[data-day="0"]')
  await act(a, 'remind-save')
  await sleep(600)
  const s2 = (await call('budget', 'alice', 'GET', '/state')).data
  check('budget: weekly reminder set in app', s2.reminder.enabled && s2.reminder.weekday === 0, JSON.stringify(s2.reminder))
  await a.evaluate(() => window.scrollTo(0, 0))
  await shot(a, 'budget-settings')
  // a fresh device (no local copy) gets the ledger from the bot
  const ctx = await browser.createBrowserContext()
  const p = await ctx.newPage()
  await a.close()
  await p.close()
  const b = await open('budget', 'alice')
  await b.evaluate(() => localStorage.clear())
  await b.reload({ waitUntil: 'domcontentloaded' })
  await b.waitForSelector('[data-ready="true"]')
  await sleep(500)
  check('budget: a new device restores the ledger from the bot', (await screen(b)) === 'ledger', await screen(b))
  await b.close()
}

let gid = null
try {
  gid = await santa()
  await matchday()
  await budget()
} catch (err) {
  failures.push(`crashed: ${err.stack || err}`)
} finally {
  // clean up the fake users' data through the API (DB rows are removed separately)
  try {
    if (gid) await call('santa', 'alice', 'POST', `/games/${gid}/cancel`)
    for (const who of ['alice', 'bob', 'cara']) await call('matchday', who, 'DELETE', '/me')
    await call('budget', 'alice', 'DELETE', '/state')
  } catch { /* best effort */ }
  await browser.close()
}
console.log(failures.length ? `\n${failures.length} FAILED:\n- ${failures.join('\n- ')}` : '\nall live checks passed')
process.exit(failures.length ? 1 : 0)
