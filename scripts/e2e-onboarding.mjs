// First-run intro, help sheet, invite hint and empty states. 390px shots named onboarding-*.png.
import { mkdir, readFile } from 'node:fs/promises'
import puppeteer from 'puppeteer-core'

const base = process.env.BASE_URL ?? 'http://127.0.0.1:43123'
const api = process.env.API ?? 'http://127.0.0.1:18790'
const out = process.env.SHOT_DIR ?? '/workspace/miniapps-deploy/shots'
const prefix = process.env.SHOT_PREFIX ?? 'onboarding'
const chrome = process.env.CHROME ?? '/usr/bin/google-chrome'
const init = JSON.parse(await readFile(process.env.INIT_FILE ?? '/tmp/e2e/init.json', 'utf8'))
const failures = []
const check = (name, ok, detail = '') => { if (!ok) { failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`FAIL ${name} ${detail}`) } else console.log(`ok  ${name}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none'] })

async function open(svc, who, query = '') {
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await page.setRequestInterception(true)
  page.on('request', (req) => {
    if (!req.url().includes('telegram.org/js')) return req.continue()
    return req.respond({ status: 200, contentType: 'text/javascript', body: '' })
  })
  page.on('pageerror', (err) => failures.push(`${svc}/${who} page error: ${err.message}`))
  const tg = init[svc][who]
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
  const q = query ? `&${query.replace(/^&/, '')}` : ''
  await page.goto(`${base}/${svc}/?api=${encodeURIComponent(api)}${q}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-ready="true"], [data-intro], [data-help]', { timeout: 20000 })
  await page.evaluate(async () => { await document.fonts.ready })
  await sleep(200)
  return page
}

async function shot(page, name) {
  await mkdir(out, { recursive: true })
  const path = `${out}/${prefix}-${name}.png`
  await page.screenshot({ path })
  console.log('shot', path)
}

async function introShots(svc, who, tag) {
  const page = await open(svc, who, 'guide=intro')
  await page.waitForSelector('[data-intro="1"]', { timeout: 10000 })
  check(`${tag} intro 1`, await page.$eval('[data-intro-step]', (el) => el.getAttribute('data-intro-step')) === '1')
  await shot(page, `${tag}-intro-1`)
  for (const n of [2, 3, 4]) {
    await page.click('[data-action="intro-next"]')
    await page.waitForFunction((s) => document.querySelector('[data-intro-step]')?.getAttribute('data-intro-step') === s, { timeout: 5000 }, String(n))
    await sleep(120)
    await shot(page, `${tag}-intro-${n}`)
  }
  check(`${tag} last card is Get started`, await page.$('[data-action="intro-done"]') !== null)
  await page.close()
}

async function helpShot(svc, who, tag) {
  const page = await open(svc, who, 'guide=help')
  await page.waitForSelector('[data-help="1"]', { timeout: 10000 })
  await sleep(120)
  await shot(page, `${tag}-help`)
  check(`${tag} help`, await page.$('[data-action="help-replay"]') !== null)
  await page.close()
}

async function emptyShot(svc, who, tag, query = 'guide=off') {
  const page = await open(svc, who, query)
  await page.waitForSelector('[data-ready="true"]', { timeout: 15000 })
  await sleep(200)
  await shot(page, `${tag}-empty`)
  check(`${tag} empty no intro`, await page.$('[data-intro]') === null)
  await page.close()
}

async function hintShot(svc, who, tag, query) {
  const page = await open(svc, who, query)
  await page.waitForSelector('[data-hint], [data-ready="true"]', { timeout: 15000 })
  await sleep(250)
  const has = await page.$('[data-hint]')
  check(`${tag} hint`, Boolean(has))
  await shot(page, `${tag}-hint`)
  await page.close()
}

if (!init.santa || !init.matchday || !init.budget) {
  console.error('init.json missing a service')
  process.exit(1)
}

await introShots('santa', 'alice', 'santa')
await helpShot('santa', 'alice', 'santa')
await emptyShot('santa', 'alice', 'santa')
await hintShot('santa', 'cara', 'santa', 'guide=off&join=DEMOCODE')

await introShots('matchday', 'alice', 'matchday')
await helpShot('matchday', 'alice', 'matchday')
await emptyShot('matchday', 'alice', 'matchday', 'guide=off')
await hintShot('matchday', 'cara', 'matchday', 'guide=off&join=DEMOCODE')

await introShots('budget', 'alice', 'budget')
await helpShot('budget', 'alice', 'budget')
await emptyShot('budget', 'alice', 'budget', 'guide=off')

if (init.radar) {
  await introShots('radar', 'alice', 'radar')
  await helpShot('radar', 'alice', 'radar')
  await emptyShot('radar', 'alice', 'radar', 'guide=off')
  await hintShot('radar', 'cara', 'radar', 'guide=off&job=abcdef123456')
} else {
  console.log('skip radar shots (no init)')
}

await browser.close()
if (failures.length) {
  console.error('FAILURES', failures.length)
  for (const f of failures) console.error(' -', f)
  process.exit(1)
}
console.log('all onboarding shots ok')
