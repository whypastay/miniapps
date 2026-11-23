// Matchday+ end to end on a COPY of the live DB (tools/sim_api.py): a random never-published bot token signs initData for
// fake users 9000000000000101-103 (nobody real exists behind them). API: tools/sim_api.py on 127.0.0.1:18892.
import { createHmac } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import puppeteer from 'puppeteer-core'

const base = process.env.BASE_URL ?? 'http://127.0.0.1:43123'
const api = process.env.API ?? 'http://127.0.0.1:18892'
const out = process.env.SHOT_DIR ?? '/workspace/miniapps-deploy/shots'
const prefix = process.env.SHOT_PREFIX ?? 'matchdayplus'
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

const [CODE] = (await readFile('/tmp/mdplus-sim/league.txt', 'utf8')).trim().split(' ')
const links = (page) => page.evaluate(() => window.__links)

try {
  // 1. Alice: an existing player. Table shows the live game and the "new" banner; the original intro does not reappear.
  const a = await open('alice')
  check('existing player: no intro on Table', (await screen(a)) !== 'intro', await screen(a))
  check('live game on Table with a delayed label', /Live now/.test(await text(a, '.scroll')) && Boolean(await a.$('[data-live]')))
  check('live row shows 1–0 and provisional points', /1–0/.test(await text(a, '[data-live]')) && /if it ends now/.test(await text(a, '[data-live]')), await text(a, '[data-live]'))
  check('attribution on Table', /Football data provided by the Football-Data\.org API/.test(await text(a, '[data-field="attribution"]')))
  check('new-feature banner', Boolean(await a.$('[data-field="plus-new"]')))
  await shot(a, 'table-live')
  await overflow(a, 'table')
  // 2. Rounds: own intro (4 cards), then the recap
  await act(a, 'to-rounds')
  await waitScreen(a, 'intro')
  check('Rounds intro first card', /Scores arrive by themselves/.test(await text(a, '.guide-title')), await text(a, '.guide-title'))
  await shot(a, 'intro')
  for (let i = 0; i < 3; i++) await act(a, 'intro-next')
  check('last Rounds intro card is about group chats', /Your group chat keeps score/.test(await text(a, '.guide-title')))
  await act(a, 'intro-done')
  const me = await call('alice', 'GET', '/state')
  check('finishing the Rounds intro marks plus only', me.data.me.plusOnboarded === true && me.data.me.onboarded === true)
  await a.waitForSelector('[data-recap]', { timeout: 10000 })
  const head = await text(a, '[data-field="headline"]')
  check('recap headline names a winner', /wins|share/.test(head), head)
  check('recap is worldwide by default', /Worldwide/.test(await text(a, '.paper-page')))
  check('round chips', (await a.$$('[data-round]')).length >= 2)
  await shot(a, 'recap')
  await overflow(a, 'recap')
  await scrollTo(a, '[data-result]')
  await shot(a, 'recap-results')
  await a.waitForSelector('[data-field="card"]', { timeout: 15000 })
  const imgOk = await a.$eval('[data-field="card"]', (img) => img.complete && img.naturalWidth === 1080 && img.naturalHeight === 1350)
  check('card preview loads (1080×1350)', imgOk)
  await scrollTo(a, '[data-field="card"]')
  await shot(a, 'recap-card')
  // league scope
  await scrollTop(a)
  await a.evaluate(() => [...document.querySelectorAll('.picks-wrap[aria-label="Recap for"] .choice')].find((b) => b.textContent === 'Sunday Squad')?.click())
  await a.waitForFunction(() => /Sunday Squad/.test(document.querySelector('.paper-page')?.textContent ?? ''), { timeout: 10000 })
  check('league recap scope', true)
  await shot(a, 'recap-league')
  // share + send
  await act(a, 'recap-share')
  const l = await links(a)
  check('share opens the Telegram share sheet with an rc_ link', l.some((u) => u.startsWith('https://t.me/share/url?') && decodeURIComponent(u).includes(`startapp=rc_PL11_${CODE}`)), JSON.stringify(l))
  await act(a, 'recap-send')
  await a.waitForSelector('.toast', { timeout: 5000 }).catch(() => undefined)
  check('send card confirms', /Sent/.test(await a.evaluate(() => document.querySelector('.toast')?.textContent ?? '')))
  // help in Rounds is the Matchday+ guide
  await act(a, 'open-help')
  check('Rounds help explains extra time and the source', /extra time and penalties do not count/.test(await text(a, 'body')) && /Football-Data\.org/.test(await text(a, 'body')))
  await shot(a, 'help')
  await act(a, 'help-close')
  // Picks: locked live game shows the live score
  await tab(a, 'picks')
  check('Picks shows the live game on top', /Live now/.test(await text(a, '.scroll')) && Boolean(await a.$('[data-live]')))
  await shot(a, 'picks-live')
  // League: owner toggle for group-chat recaps
  await tab(a, 'league')
  check('league owner sees the group recap toggle', Boolean(await a.$('[data-field="league-recap"]')))
  await a.click('[data-field="league-recap"]'); await sleep(700)
  check('toggle turns round messages off', (await a.$eval('[data-field="league-recap"]', (b) => b.getAttribute('aria-pressed'))) === 'false')
  await shot(a, 'league-toggle')
  await a.click('[data-field="league-recap"]'); await sleep(700)
  await a.close()

  // 3. Cara opens a shared league recap from a forwarded link: hint, no intro wall, the recap and a Join button
  const c = await open('cara', { start: `rc_PL11_${CODE}` })
  await c.waitForSelector('[data-recap]', { timeout: 10000 })
  check('shared recap: hint, no intro', Boolean(await c.$('[data-hint]')) && (await screen(c)) !== 'intro')
  check('shared recap shows the league', /Sunday Squad/.test(await text(c, '.paper-page')))
  await shot(c, 'shared')
  await act(c, 'recap-join')
  check('Join leads to the join form with the code', (await c.$eval('[data-field="league-code"]', (i) => i.value)) === CODE)
  await c.close()

  // 4. Bob is new: the original onboarding (560174b) is unchanged
  const b = await open('bob')
  await waitScreen(b, 'intro')
  check('original intro intact', /Call the score before kick-off/.test(await text(b, '.guide-title')))
  await b.close()

  // 5. Public card
  const rc = await call('alice', 'GET', '/recap?comp=PL&round=11')
  const png = await fetch(rc.data.cardUrl)
  check('public card is a PNG', png.status === 200 && png.headers.get('content-type') === 'image/png')
  const { writeFile } = await import('node:fs/promises')
  await writeFile(`${out}/${prefix}-card-1080.png`, Buffer.from(await png.arrayBuffer()))
} catch (err) {
  failures.push(`crashed: ${err.stack ?? err}`)
} finally {
  await browser.close()
}
console.log(failures.length ? `\n${failures.length} FAILED\n${failures.join('\n')}` : '\nall passed')
process.exit(failures.length ? 1 : 0)
