// Matchday live snapshot checks + screenshots. TOKEN env = a payload from bots/matchday (webapp.encoded_payload).
import { mkdir } from 'node:fs/promises'
import puppeteer from 'puppeteer-core'

const base = process.env.BASE_URL ?? 'http://127.0.0.1:43123'
const out = process.env.SHOT_DIR ?? '/tmp/qa'
const token = process.env.TOKEN ?? ''
const chrome = process.env.CHROME ?? '/usr/bin/google-chrome'
const failures = []
const check = (name, ok, detail = '') => (ok ? console.log(`ok  ${name}`) : failures.push(`${name}${detail ? ` — ${detail}` : ''}`))

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none'] })
async function open(path) {
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForSelector('[data-ready="true"]', { timeout: 10000 })
  await page.evaluate(async () => { await document.fonts.ready })
  await new Promise((r) => setTimeout(r, 120))
  return page
}
await mkdir(out, { recursive: true })
const page = await open(`/matchday/?d=${token}`)
check('live screen', (await page.$eval('[data-screen]', (el) => el.getAttribute('data-screen'))) === 'live')
const text = await page.evaluate(() => document.body.innerText)
check('shows table', /Sunday Squad/i.test(text), text.slice(0, 200))
check('no demo names leak', !/Marco B\./.test(text))
const sw = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)
check('no horizontal overflow (table)', sw)
await page.screenshot({ path: `${out}/matchday-live.png` })
await page.click('[data-tab="picks"]')
await new Promise((r) => setTimeout(r, 150))
const fixtures = await page.$$('[data-fixture]')
check('fixtures listed', fixtures.length > 0, String(fixtures.length))
const opened = []
await page.exposeFunction('__opened', (u) => opened.push(u))
await page.evaluate(() => { window.open = (u) => { window.__opened(String(u)); return null } })
const btn = await page.$('[data-fixture] .live-go:not([disabled])')
if (btn) { await btn.click(); await new Promise((r) => setTimeout(r, 100)) }
check('predict deep-links to the bot', opened.some((u) => /t\.me\/MatchdayPicks_bot\?start=pr_[a-z0-9_]+$/.test(u)), opened.join(','))
check('no horizontal overflow (picks)', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1))
await page.screenshot({ path: `${out}/matchday-live-picks.png` })
await page.close()
const bad = await open('/matchday/?d=broken!!')
check('broken payload -> waiting', (await bad.$eval('[data-screen]', (el) => el.getAttribute('data-screen'))) === 'waiting')
await bad.close()
await browser.close()
if (failures.length) { console.error('FAIL\n' + failures.join('\n')); process.exit(1) }
console.log('all matchday checks passed')
