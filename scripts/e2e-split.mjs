// Ledger Split end to end (Budget Better Mini App) with simulated Telegram initData for fake users.
// INIT_FILE: {svc: {alice|bob|cara: {init, user}}} signed for fake user ids. API: gateway base.
import { mkdir, readFile } from 'node:fs/promises'
import puppeteer from 'puppeteer-core'

const base = process.env.BASE_URL ?? 'http://127.0.0.1:43123'
const api = process.env.API ?? 'http://127.0.0.1:18790'
const out = process.env.SHOT_DIR ?? '/workspace/miniapps-deploy/shots'
const prefix = process.env.SHOT_PREFIX ?? 'ledgersplit'
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


async function setVal(page, sel, v) { await page.$eval(sel, (el, x) => { el.value = x; el.dispatchEvent(new Event('input', { bubbles: true })) }, v) }
async function scrollTop(page) { await page.evaluate(() => document.querySelector('.scroll')?.scrollTo(0, 0)); await sleep(120) }
let gid = null
async function split() {
  // alice starts a trip with a name-only member
  const a = await open('budget', 'alice', '&split=new')
  check('split: new user lands on the new-group form', (await screen(a)) === 'split-new', await screen(a))
  await type(a, '[data-field="split-name"]', 'Goa, December')
  await a.click('[data-cur="INR"]')
  await type(a, '[data-field="split-person"]', 'Dima')
  await act(a, 'split-add-person')
  await shot(a, 'new')
  await overflow(a, 'split new')
  await act(a, 'split-create')
  await waitScreen(a, 'split-people')
  const g0 = (await call('budget', 'alice', 'GET', '/split')).data.groups[0]
  gid = g0.id
  const view = (await call('budget', 'alice', 'GET', `/split/${gid}`)).data
  check('split: group in INR with alice + Dima', view.currency === 'INR' && view.members.length === 2, JSON.stringify(view.members))
  check('split: invite + summary links', /startapp=sp_|start=sp_/.test(view.inviteLink) && /ss_/.test(view.publicLink), view.inviteLink)
  if (!REAL) {
    await act(a, 'split-invite')
    const links = (await a.evaluate(() => window.__links)) ?? []
    check('split: invite opens the Telegram share sheet', links.some((l) => l.startsWith('https://t.me/share/url')), links.join(','))
  }
  await shot(a, 'people')
  // bob joins as himself, cara claims "Dima"
  for (const who of ['bob', 'cara']) {
    const p = await open('budget', who, `&sj=${view.code}`)
    check(`split: ${who} sees the invitation`, (await screen(p)) === 'split-join', await screen(p))
    if (who === 'cara') {
      await p.click('[data-claim]'); await sleep(150)
      await shot(p, 'join')
    }
    await act(p, 'split-join')
    await waitScreen(p, 'split-ledger')
    await p.close()
  }
  const v1 = (await call('budget', 'alice', 'GET', `/split/${gid}`)).data
  const id = (n) => v1.members.find((m) => m.name.startsWith(n)).id
  check('split: cara took over Dima', v1.members.length === 3 && v1.members.some((m) => m.name === 'Dima' && m.joined), JSON.stringify(v1.members))
  // alice: dinner 1200 equally among all three
  await a.close()
  let a2 = await open('budget', 'alice', `&split=${gid}`)
  await act(a2, 'split-add')
  await waitScreen(a2, 'split-expense')
  await type(a2, '[data-field="split-amount"]', '1200')
  await type(a2, '[data-field="split-title"]', 'Dinner at Thalassa')
  await sleep(200)
  await shot(a2, 'expense-equal')
  await overflow(a2, 'split expense')
  await act(a2, 'split-save-expense')
  await waitScreen(a2, 'split-ledger')
  // bob: taxi 900 by shares, alice counts double
  const b = await open('budget', 'bob', `&split=${gid}`)
  await act(b, 'split-add')
  await type(b, '[data-field="split-amount"]', '900')
  await type(b, '[data-field="split-title"]', 'Airport taxi')
  await b.click('[data-mode="shares"]'); await sleep(100)
  const plus = await b.$$(`[data-line="${id('Alice')}"] .stepper button`)
  await plus[1].click(); await sleep(150)
  const w = await b.$eval(`[data-weight="${id('Alice')}"]`, (el) => el.textContent)
  check('split: share stepper works', w === '2', w)
  await shot(b, 'expense-shares')
  await act(b, 'split-save-expense')
  await waitScreen(b, 'split-ledger')
  await b.close()
  // cara: villa 4500 exact (2000 / 1500 / 1000)
  const c = await open('budget', 'cara', `&split=${gid}`)
  await act(c, 'split-add')
  await type(c, '[data-field="split-amount"]', '4500')
  await type(c, '[data-field="split-title"]', 'Villa, two nights')
  await c.click('[data-mode="exact"]'); await sleep(100)
  await type(c, `[data-exact="${id('Alice')}"]`, '2000')
  await type(c, `[data-exact="${id('Bob')}"]`, '1500')
  await shot(c, 'expense-exact-left')
  await type(c, `[data-exact="${id('Dima')}"]`, '1000')
  await act(c, 'split-save-expense')
  await waitScreen(c, 'split-ledger')
  await c.close()
  const v2 = (await call('budget', 'alice', 'GET', `/split/${gid}`)).data
  const bal = (n) => v2.members.find((m) => m.name.startsWith(n)).balance.INR ?? 0
  // taxi shares 2:1:1 -> alice 450, bob 225, dima 225
  // alice: +1200 -400 -450 -2000 = -1650 ; bob: +900 -400 -225 -1500 = -1225 ; dima: +4500 -400 -225 -1000 = +2875
  check('split: balances add up', bal('Alice') === -165000 && bal('Bob') === -122500 && bal('Dima') === 287500, JSON.stringify(v2.members.map((m) => m.balance)))
  check('split: fewest transfers (2)', v2.plan.length === 2, JSON.stringify(v2.plan))
  check('split: totals', v2.totals.INR === 660000, JSON.stringify(v2.totals))
  await a2.close()
  a2 = await open('budget', 'alice', `&split=${gid}`)
  await sleep(300)
  await scrollTop(a2)
  await shot(a2, 'ledger')
  await overflow(a2, 'split ledger')
  await tab(a2, 'balances')
  await shot(a2, 'balances')
  await act(a2, 'split-mark-paid')
  await waitScreen(a2, 'split-settle')
  await shot(a2, 'settle')
  await act(a2, 'split-record')
  await waitScreen(a2, 'split-balances')
  const v3 = (await call('budget', 'alice', 'GET', `/split/${gid}`)).data
  check('split: marking paid clears alice', !(v3.members.find((m) => m.name.startsWith('Alice')).balance.INR) && v3.plan.length === 1, JSON.stringify(v3.plan))
  await shot(a2, 'after-paid')
  await tab(a2, 'settings')
  await shot(a2, 'settings')
  // list
  const l = await open('budget', 'alice', '&split=1')
  await sleep(300)
  // one group -> opens it directly; go back to the list with the BackButton handler
  check('split: single group opens straight away', (await screen(l)) === 'split-ledger', await screen(l))
  await l.close()
  // public summary: a plain browser, no Telegram at all
  const tok = v3.publicLink.split('ss_')[1]
  const pub = await browser.newPage()
  await pub.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await pub.setRequestInterception(true)
  pub.on('request', (req) => (req.url().includes('telegram.org/js') ? req.respond({ status: 200, contentType: 'text/javascript', body: '' }) : req.continue()))
  pub.on('pageerror', (err) => failures.push(`public page error: ${err.message}`))
  await pub.goto(`${base}/budget/?api=${encodeURIComponent(api)}&ss=${tok}`, { waitUntil: 'domcontentloaded' })
  await pub.waitForSelector('[data-ready="true"]', { timeout: 15000 })
  await pub.evaluate(async () => { await document.fonts.ready }); await sleep(200)
  check('split: public summary opens without Telegram', (await screen(pub)) === 'split-public', await screen(pub))
  const spent = await pub.$eval('[data-field="public-spent"]', (el) => el.textContent)
  check('split: public summary shows the total', spent.includes('6,600'), spent)
  await shot(pub, 'public')
  await overflow(pub, 'split public')
  await pub.close()
  await a2.close()
}

try {
  await split()
} catch (err) {
  failures.push(`crash: ${err.stack || err}`)
} finally {
  if (gid) await call('budget', 'alice', 'POST', `/split/${gid}/archive`).catch(() => undefined)
  await browser.close()
}
console.log(failures.length ? `\n${failures.length} FAILED\n${failures.join('\n')}` : '\nall split checks passed')
process.exit(failures.length ? 1 : 0)
