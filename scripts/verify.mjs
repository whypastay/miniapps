import { mkdir } from 'node:fs/promises'
import puppeteer from 'puppeteer-core'

const base = process.env.BASE_URL ?? 'http://127.0.0.1:43123'
const out = process.env.SHOT_DIR ?? '/tmp/qa'
const chrome = process.env.CHROME ?? '/usr/bin/google-chrome'
const failures = []

function check(name, ok, detail = '') {
  if (!ok) failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
  else console.log(`ok  ${name}`)
}

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none'],
})

async function open(path) {
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForSelector('[data-ready="true"]', { timeout: 10000 })
  await page.evaluate(async () => {
    await document.fonts.load('400 88px "Instrument Serif"')
    await document.fonts.load('italic 400 22px "Instrument Serif"')
    await document.fonts.load('400 15px Geist')
    await document.fonts.load('500 10px "Geist Mono"')
    await document.fonts.ready
  })
  await new Promise((resolve) => setTimeout(resolve, 60))
  return page
}

async function shot(page, name) {
  await mkdir(out, { recursive: true })
  await page.screenshot({ path: `${out}/${name}.png` })
}

async function overflow(page, label) {
  const box = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }))
  check(`${label} no horizontal overflow`, box.sw <= box.cw + 1, `scroll ${box.sw} client ${box.cw}`)
}

const budget = await open('/budget/')
check('onboarding', await budget.$eval('[data-screen]', (el) => el.getAttribute('data-screen')) === 'onboarding')
check('no demo total', !(await budget.evaluate(() => document.body.innerText.includes('4,480'))))
await overflow(budget, 'onboarding')
check('browser close button', (await budget.$$('.side.left')).length === 1)
await shot(budget, 'budget-onboarding')
await budget.click('[data-action="open-ledger"]')
await budget.waitForSelector('[data-screen="ledger"]')
const emptySaved = await budget.$eval('[data-field="saved"]', (el) => el.textContent.trim())
const emptyWeek = await budget.$eval('[data-field="week"]', (el) => el.textContent.trim())
check('empty saved 0', emptySaved === '0', emptySaved)
check('empty week 1', emptyWeek === '1', emptyWeek)
await overflow(budget, 'empty ledger')
await shot(budget, 'budget-empty')
await budget.reload({ waitUntil: 'domcontentloaded' })
await budget.waitForSelector('[data-screen="ledger"]')
const kept = await budget.$eval('[data-field="saved"]', (el) => el.textContent.trim())
check('empty ledger persists', kept === '0', kept)
await budget.close()

const demo = await open('/budget/?demo=1')
const saved = await demo.$eval('[data-field="saved"]', (el) => el.textContent.trim())
const week = await demo.$eval('[data-field="week"]', (el) => el.textContent.trim())
check('demo saved', saved === '4,480', saved)
check('demo week', week === '31', week)
await overflow(demo, 'demo ledger')
await shot(demo, 'budget-demo')
await demo.close()

const santa = await open('/santa/')
const santaText = await santa.evaluate(() => document.body.innerText)
check('santa waiting', await santa.$eval('[data-screen]', (el) => el.getAttribute('data-screen')) === 'waiting')
check('santa has no recipient', !/aisha|rahman/i.test(santaText))
await overflow(santa, 'santa')
await shot(santa, 'santa-default')
await santa.close()

const match = await open('/matchday/')
const matchText = await match.evaluate(() => document.body.innerText)
check('matchday waiting', await match.$eval('[data-screen]', (el) => el.getAttribute('data-screen')) === 'waiting')
check('matchday has no table', !/marco|priya/i.test(matchText))
await overflow(match, 'matchday')
await shot(match, 'matchday-default')
await match.close()

await browser.close()

const cloudBrowser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const cloud = await cloudBrowser.newPage()
await cloud.setRequestInterception(true)
cloud.on('request', (request) => {
  if (request.url().includes('telegram.org')) request.abort()
  else request.continue()
})
await cloud.evaluateOnNewDocument(() => {
  window.__closed = false
  window.Telegram = {
    WebApp: {
      initData: 'query_id=1',
      initDataUnsafe: { user: { id: 7, first_name: 'Maya', language_code: 'de' } },
      platform: 'ios',
      isFullscreen: true,
      ready() {},
      expand() {},
      close() { window.__closed = true },
      CloudStorage: {
        getItem() { throw new Error('unavailable') },
        setItem() { throw new Error('unavailable') },
      },
    },
  }
})
await cloud.goto(base + '/budget/', { waitUntil: 'domcontentloaded' })
await cloud.waitForSelector('[data-screen="onboarding"]', { timeout: 8000 })
const eyebrow = await cloud.$eval('.sub', (el) => el.textContent.trim())
check('greets by first name', eyebrow.toUpperCase() === 'MAYA', eyebrow)
const preview = await cloud.$eval('[data-field="preview"]', (el) => el.textContent)
check('german grouping', preview.includes('1.378'), preview)
check('onboarding survived dead cloud storage', /week 1/i.test(preview), preview)
// Telegram fullscreen draws its own Close/menu pills: the app must not print a second pair under them.
check('no duplicate close in Telegram fullscreen', (await cloud.$$('.side')).length === 0)
check('fullscreen chrome mode', (await cloud.$eval('[data-chrome]', (el) => el.getAttribute('data-chrome'))) === 'overlay')
await cloudBrowser.close()
if (failures.length) {
  console.error('\nFAILED')
  for (const line of failures) console.error('  ' + line)
  process.exit(1)
}
console.log('\nall checks passed')
