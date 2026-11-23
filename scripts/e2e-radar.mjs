// RemoteRadar end to end with a simulated launch: a random never-published bot token signs initData for
// fake users 9000000000000101-103 (nobody real exists behind them). API: gateway base.
import { createHmac } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import puppeteer from 'puppeteer-core'

const base = process.env.BASE_URL ?? 'http://127.0.0.1:43123'
const api = process.env.API ?? 'http://127.0.0.1:18790'
const out = process.env.SHOT_DIR ?? '/workspace/miniapps-deploy/shots'
const prefix = process.env.SHOT_PREFIX ?? 'remoteradar'
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

const screen = (page) => page.$eval('[data-screen]', (el) => el.getAttribute('data-screen'))
async function shot(page, name) { await mkdir(out, { recursive: true }); await page.screenshot({ path: `${out}/${prefix}-${name}.png` }) }
async function overflow(page, label) {
  const box = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
  check(`${label}: no horizontal overflow`, box.sw <= box.cw + 1, `scroll ${box.sw} client ${box.cw}`)
}
async function waitScreen(page, value, ms = 10000) { await page.waitForFunction((v) => document.querySelector('[data-screen]')?.getAttribute('data-screen') === v, { timeout: ms }, value) }
async function tab(page, id) { await page.click(`[data-tab="${id}"]`); await sleep(350) }
async function act(page, id) { await page.waitForSelector(`[data-action="${id}"]:not([disabled])`, { timeout: 10000 }); await page.click(`[data-action="${id}"]`); await sleep(500) }
async function text(page, sel) { return page.$eval(sel, (el) => el.textContent ?? '') }
async function scrollTop(page) { await page.evaluate(() => document.querySelector('.scroll')?.scrollTo(0, 0)); await sleep(120) }

// clean slate for the fake users
for (const who of Object.keys(USERS)) await call(who, 'DELETE', '/me')

let jobToken = null
let checkToken = null
try {
  // 1. Alice arrives from the @remotelyhired tech channel (src_ tag) and sets up
  const a = await open('alice', { start: 'src_tech' })
  check('first launch shows setup', (await screen(a)) === 'radar-setup', await screen(a))
  await a.click('[data-field="country"] [data-value="PH"]')
  await a.click('[data-field="levels"] [data-value="mid"]')
  await sleep(150)
  await shot(a, 'setup')
  await overflow(a, 'setup')
  await a.click('[data-field="levels"] [data-value="mid"]')
  await act(a, 'save-setup')
  await waitScreen(a, 'radar-feed')
  const total = Number(await text(a, '[data-field="total"]'))
  check('feed has jobs open to the Philippines', total > 0, String(total))
  const elig = await a.$$eval('.radar-elig', (els) => els.map((e) => e.textContent))
  check('every row carries an eligibility line', elig.length > 0 && elig.every((t) => /philippines|worldwide|apac|asia/i.test(t)), elig.slice(0, 3).join(' | '))
  const srcs = await a.$$eval('.radar-src', (els) => els.map((e) => e.textContent.trim()))
  check('every row names its source board', srcs.every((t) => /Himalayas|Remote OK|Jobicy/.test(t)))
  check('no JobPosting markup on the page', !(await a.content()).includes('JobPosting'))
  await shot(a, 'feed')
  await overflow(a, 'feed')

  // 2. Open a job: credit, apply goes to the board URL unchanged, save, share
  const feedApi = await call('alice', 'GET', '/feed')
  const first = feedApi.data.jobs[0]
  jobToken = first.token
  await a.click(`[data-job="${first.token}"]`)
  await waitScreen(a, 'radar-job')
  const credit = await text(a, '[data-field="credit"]')
  check('job shows source credit', credit.includes(`Source: ${first.sourceName}`) && credit.includes('we never charge'), credit)
  await act(a, 'save')
  check('job saved', (await text(a, '[data-action="save"]')).startsWith('Saved'))
  await shot(a, 'job')
  await overflow(a, 'job')
  await act(a, 'apply')
  const ext = await a.evaluate(() => window.__external)
  check('apply opens the board listing unchanged', ext[0] === first.url, `${ext[0]} vs ${first.url}`)
  await act(a, 'share-job')
  const links = await a.evaluate(() => window.__links)
  check('share opens the Telegram share sheet with a startapp job link', links.some((l) => l.startsWith('https://t.me/share/url') && decodeURIComponent(l).includes(`startapp=job_${first.token}`)), links.join(' '))

  // 3. Saved tab
  await a.close()
  const a2 = await open('alice', { query: '&tab=saved' })
  await waitScreen(a2, 'radar-saved')
  check('saved list has the job', (await a2.$$('.radar-row')).length === 1)
  await shot(a2, 'saved')

  // 4. Scam check with a composite example
  await tab(a2, 'check')
  await a2.click('[data-example="task"]')
  await sleep(200)
  await shot(a2, 'check')
  await overflow(a2, 'check')
  await act(a2, 'run-check')
  await waitScreen(a2, 'radar-result')
  const verdict = await text(a2, '[data-field="verdict"]')
  const flags = await a2.$$eval('[data-flag]', (els) => els.map((e) => e.getAttribute('data-flag')))
  check('task-scam example is high risk', verdict === 'High risk', verdict)
  check('flags explain Telegram recruiter and paid tasks', flags.includes('chat_only') && flags.includes('task_scam'), flags.join(','))
  await shot(a2, 'result')
  await overflow(a2, 'result')
  await scrollTop(a2)
  await act(a2, 'share-check')
  const l2 = await a2.evaluate(() => window.__links)
  const m = decodeURIComponent(l2.find((l) => l.includes('startapp%3Dchk_')) ?? '').match(/startapp=chk_([A-Za-z0-9]+)/)
  checkToken = m ? m[1] : null
  check('result share link carries chk_ token', Boolean(checkToken), l2.join(' '))

  // 5. Settings: daily alert
  await act(a2, 'check-another')
  await tab(a2, 'settings')
  await a2.click('[data-field="alert"] [data-value="on"]')
  await sleep(700)
  const me = await call('alice', 'GET', '/me')
  check('alert saved with local time zone', me.data.prefs.alert.on && Boolean(me.data.prefs.alert.tz), JSON.stringify(me.data.prefs.alert))
  await shot(a2, 'settings')
  await overflow(a2, 'settings')

  // 6. Bob opens the shared check (share loop) and taps Get RemoteRadar
  const b = await open('bob', { start: `chk_${checkToken}` })
  await waitScreen(b, 'radar-shared-check')
  const pageText = await b.evaluate(() => document.body.innerText)
  check('shared check hides the pasted text', !pageText.includes('hr_mila_jobs') && !pageText.includes('Hi dear'))
  await shot(b, 'shared-check')
  await overflow(b, 'shared check')
  await act(b, 'get-radar')
  await waitScreen(b, 'radar-setup')
  check('Get RemoteRadar leads to setup', true)

  // 7. Cara opens a shared job before setting up
  const c = await open('cara', { start: `job_${jobToken}__src_freshers` })
  await waitScreen(c, 'radar-job')
  check('shared job shows Get RemoteRadar', Boolean(await c.$('[data-action="get-radar"]')))
  await shot(c, 'shared-job')
  await overflow(c, 'shared job')

  // 8. Outside Telegram: the shared check is still readable (verdict + rule names only)
  const w = await open('bob', { telegram: false, query: `&chk=${checkToken}` })
  check('shared check readable outside Telegram', (await screen(w)) === 'radar-shared-check', await screen(w))
} catch (err) {
  failures.push(`crash: ${err.message}`)
  console.log(err)
} finally {
  for (const who of Object.keys(USERS)) await call(who, 'DELETE', '/me')
  await browser.close()
}
console.log(failures.length ? `\n${failures.length} FAILED\n${failures.join('\n')}` : '\nALL PASSED')
process.exit(failures.length ? 1 : 0)
