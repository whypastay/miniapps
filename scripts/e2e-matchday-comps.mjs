// Matchday league competitions end to end on a COPY of the live DB (tools/sim_api.py): a random never-published bot token signs initData for
// fake users 9000000000000101-103 (nobody real exists behind them). API: tools/sim_api.py on 127.0.0.1:18892.
import { createHmac } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import puppeteer from 'puppeteer-core'

const base = process.env.BASE_URL ?? 'http://127.0.0.1:43123'
const api = process.env.API ?? 'http://127.0.0.1:18892'
const out = process.env.SHOT_DIR ?? '/workspace/miniapps-deploy/shots'
const prefix = process.env.SHOT_PREFIX ?? 'matchday-comps'
const chrome = process.env.CHROME ?? '/usr/bin/google-chrome'
const token = (await readFile(process.env.MD_TOKEN_FILE ?? '/tmp/mdplus-sim.token', 'utf8')).trim()
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
  const res = await fetch(`${api}/matchday/api${path}`, {
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
  await page.goto(`${base}/matchday/?api=${encodeURIComponent(api)}${query}`, { waitUntil: 'domcontentloaded' })
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

const [SQUAD] = (await readFile('/tmp/mdplus-sim/league.txt', 'utf8')).trim().split(' ')
const [PENA, PENA_ID] = (await readFile('/tmp/mdplus-sim/pena.txt', 'utf8')).trim().split(' ')
const pressed = (page) => page.$$eval('[data-comp][aria-pressed="true"]', (b) => b.map((x) => x.getAttribute('data-comp')))
const fixtureTags = (page) => page.$$eval('[data-fixture] .comp-tag', (t) => [...new Set(t.map((x) => x.textContent))])
async function clickText(page, sel, txt) { await page.evaluate((s, t) => [...document.querySelectorAll(s)].find((b) => b.textContent.trim() === t)?.click(), sel, txt); await sleep(700) }

try {
  // 1. Create a league on Serie A + Champions League
  const a = await open('alice', { query: '&guide=off' })
  await tab(a, 'league')
  await act(a, 'new-league')
  await a.type('[data-field="league-name"]', 'Calcio Club')
  const listed = await a.$$eval('[data-comp]', (b) => b.map((x) => x.getAttribute('data-comp')))
  check('picker lists the 10 free-tier competitions in season', listed.join() === 'PL,UCL,PD,SA,BL1,FL1,DED,PPL,ELC,BSA', listed.join())
  check('PL + UCL picked by default', (await pressed(a)).join() === 'PL,UCL')
  await a.click('[data-comp="PL"]'); await a.click('[data-comp="SA"]'); await sleep(200)
  check('toggle to Serie A + UCL', (await pressed(a)).join() === 'UCL,SA', (await pressed(a)).join())
  await scrollTo(a, '.comp-grid')
  await shot(a, 'create')
  await overflow(a, 'create')
  await act(a, 'create')
  let st = await call('alice', 'GET', '/state')
  const calcio = st.data.leagues.find((l) => l.name === 'Calcio Club')
  check('league saved with its competitions', calcio && calcio.comps.join() === 'UCL,SA', JSON.stringify(calcio?.comps))
  check('league card shows the competitions', /Champions League & Serie A/.test(await text(a, '[data-field="league-comps"]')))

  // 2. La Peña (LaLiga + Bundesliga): Table, Picks and Rounds use only those
  await tab(a, 'table')
  await clickText(a, '.picks-wrap[aria-label="Table"] .choice', 'La Peña')
  check('table says what the league plays on', /LaLiga & Bundesliga/.test(await text(a, '[data-field="view-comps"]')))
  check('league table has the two players', (await a.$$('.standing')).length === 2)
  await shot(a, 'table')
  await tab(a, 'picks')
  const tags = await fixtureTags(a)
  check('Picks shows only LaLiga and Bundesliga games', tags.length > 0 && tags.every((t) => t === 'LaLiga' || t === 'BL'), tags.join())
  await shot(a, 'picks')
  await tab(a, 'rounds')
  await a.waitForSelector('[data-recap]', { timeout: 10000 })
  const chips = await a.$$eval('[data-round]', (b) => b.map((x) => x.getAttribute('data-round')))
  check('Rounds lists only LaLiga and Bundesliga rounds', chips.length > 0 && chips.every((c) => c.startsWith('PD') || c.startsWith('BL1')), chips.join())
  check('recap is for La Peña', /La Peña/.test(await text(a, '.paper-page')) && /(LaLiga|Bundesliga)/.test(await text(a, '.paper-page')))
  await shot(a, 'rounds')
  const rc = await call('alice', 'GET', `/recap?league=${PENA_ID}`)
  const png = await fetch(rc.data.cardUrl)
  check('league recap card renders', png.status === 200 && png.headers.get('content-type') === 'image/png')
  const { writeFile } = await import('node:fs/promises')
  await writeFile(`${out}/${prefix}-card-1080.png`, Buffer.from(await png.arrayBuffer()))

  // 3. Owner changes competitions: future matches only
  await tab(a, 'league')
  await act(a, 'edit-comps')
  await a.click('[data-comp="SA"]'); await sleep(200)
  check('editor starts from the current competitions + the new pick', (await pressed(a)).join() === 'PD,SA,BL1', (await pressed(a)).join())
  await scrollTo(a, '.comp-grid')
  await shot(a, 'change')
  await act(a, 'save-comps')
  check('save explains future-only', /next kick-off/.test(await a.evaluate(() => document.querySelector('.toast')?.textContent ?? '')))
  st = await call('alice', 'GET', `/state?league=${PENA_ID}`)
  check('change stored', st.data.table.comps.join() === 'PD,SA,BL1')

  // 4. Worldwide stays PL + UCL
  await tab(a, 'table')
  await clickText(a, '.picks-wrap[aria-label="Table"] .choice', 'Worldwide')
  check('worldwide table note', /Worldwide table: Premier League & Champions League/.test(await text(a, '[data-field="view-comps"]')))
  await tab(a, 'picks')
  const wtags = await fixtureTags(a)
  check('worldwide Picks: PL and UCL only', wtags.every((t) => t === 'PL' || t === 'UCL'), wtags.join())
  await a.close()

  // 5. Group league: the ⚙️ Competitions button opens the picker for the owner
  const g = await open('alice', { start: `lc_${SQUAD}`, query: '&guide=off' })
  await g.waitForSelector('.comp-grid', { timeout: 10000 })
  check('lc_ link opens the picker on the group league', /Sunday Squad/.test(await text(g, '.scroll')) && (await pressed(g)).join() === 'PL,UCL')
  await shot(g, 'group-picker')
  await g.close()

  // 6. A member who is not the owner cannot change them
  const b = await open('bob', { query: '&guide=off' })
  await tab(b, 'league')
  await clickText(b, '.row .row-title', 'La Peña')
  check('member sees competitions, no CHANGE', /LaLiga, Serie A & Bundesliga/.test(await text(b, '[data-field="league-comps"]')) && !(await b.$('[data-action="edit-comps"]')))
  await b.close()

  // 7. Intro and help mention the leagues
  const c = await open('cara', { query: '&guide=help' })
  await waitScreen(c, 'help')
  check('help explains league competitions', /pick its competitions/.test(await text(c, 'body')) && /Brasileirão/.test(await text(c, 'body')))
  await shot(c, 'help')
  await c.close()
  const n = await open('bob', { query: '&guide=intro' })
  await waitScreen(n, 'intro')
  check('intro card 1 mentions more leagues', /LaLiga, Serie A, Bundesliga/.test(await text(n, 'body')))
  await shot(n, 'intro')
  await n.close()
} catch (err) {
  failures.push(`crashed: ${err.stack ?? err}`)
} finally {
  await browser.close()
}
console.log(failures.length ? `\n${failures.length} FAILED\n${failures.join('\n')}` : '\nall passed')
process.exit(failures.length ? 1 : 0)
