// Channel subscription gate. 390px shots named gate-*.png.
import { mkdir, readFile } from 'node:fs/promises'
import puppeteer from 'puppeteer-core'

const base = process.env.BASE_URL ?? 'http://127.0.0.1:43123'
const api = process.env.API ?? 'http://127.0.0.1:18790'
const out = process.env.SHOT_DIR ?? '/workspace/miniapps-deploy/shots'
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
  await page.waitForSelector('[data-gate="1"], [data-ready="true"]', { timeout: 20000 })
  await page.evaluate(async () => { await document.fonts.ready })
  await sleep(250)
  return page
}

async function shot(page, name) {
  await mkdir(out, { recursive: true })
  const path = `${out}/${name}.png`
  await page.screenshot({ path })
  console.log('shot', path)
}

for (const [svc, tag, handle] of [
  ['santa', 'santa', '@partypackhq'],
  ['matchday', 'matchday', '@matchdayhq'],
  ['budget', 'budget', '@budgetbetterhq'],
  ['radar', 'radar', '@remotelyhired'],
]) {
  const page = await open(svc, 'alice', 'gate=preview&guide=off')
  await page.waitForSelector('[data-gate="1"]', { timeout: 10000 })
  const text = await page.$eval('[data-screen="gate"]', (el) => el.innerText)
  check(`${tag} shows ${handle}`, text.includes(handle))
  check(`${tag} join button`, await page.$('[data-action="gate-join"]') !== null)
  check(`${tag} continue button`, await page.$('[data-action="gate-continue"]') !== null)
  await page.click('[data-action="gate-join"]')
  const links = await page.evaluate(() => window.__links)
  check(`${tag} openTelegramLink`, links.some((u) => u.includes(handle.replace('@', ''))))
  await shot(page, `gate-${tag}`)
  await page.close()
}

await browser.close()
if (failures.length) {
  console.error('failures:\n' + failures.map((f) => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('all gate shots ok')
