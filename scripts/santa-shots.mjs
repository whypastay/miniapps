// Screenshots of the Santa app with bot payloads: BASE_URL=... PAYLOADS=/tmp/santa-payloads.json SHOT_DIR=... node scripts/santa-shots.mjs
import { mkdir, readFile } from 'node:fs/promises'
import puppeteer from 'puppeteer-core'

const base = process.env.BASE_URL ?? 'http://127.0.0.1:43123'
const out = process.env.SHOT_DIR ?? '/tmp/qa'
const prefix = process.env.PREFIX ?? 'santa'
const chrome = process.env.CHROME ?? '/usr/bin/google-chrome'
const payloads = JSON.parse(await readFile(process.env.PAYLOADS ?? '/tmp/santa-payloads.json', 'utf8'))
const failures = []
const check = (name, ok, detail = '') => { if (ok) console.log(`ok  ${name}`); else failures.push(`${name} ${detail}`) }

await mkdir(out, { recursive: true })
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'] })

async function open(path) {
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await page.goto(base + path, { waitUntil: 'networkidle0', timeout: 30000 })
  await page.waitForSelector('[data-ready="true"]', { timeout: 15000 })
  await page.evaluate(async () => { await document.fonts.ready })
  await new Promise((r) => setTimeout(r, 150))
  return page
}
const text = (page) => page.evaluate(() => document.body.innerText)
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)

const drawn = await open(`/santa/?d=${payloads.drawn}`)
const t1 = await text(drawn)
check('drawn shows recipient', t1.includes('AISHA') || t1.includes('Aisha'), t1.slice(0, 200))
check('drawn shows wishlist', t1.includes('Hardcover cookbook'))
check('drawn shows budget', t1.includes('€25'))
check('drawn no overflow', await noOverflow(drawn))
await drawn.screenshot({ path: `${out}/${prefix}-live.png` })
await drawn.click('[data-tab="wishlist"]')
await new Promise((r) => setTimeout(r, 150))
check('own wishlist', (await text(drawn)).includes('Warm wool socks'))
await drawn.screenshot({ path: `${out}/${prefix}-live-wishlist.png` })
await drawn.click('[data-tab="group"]')
await new Promise((r) => setTimeout(r, 150))
check('group names', (await text(drawn)).includes('Kenji'))
await drawn.screenshot({ path: `${out}/${prefix}-live-group.png` })
await drawn.close()

const openGame = await open(`/santa/?d=${payloads.open}`)
const t2 = await text(openGame)
check('open hides recipient', !t2.includes('AISHA') && !t2.includes('Aisha'))
check('open says not drawn', t2.toLowerCase().includes('not drawn yet'))
await openGame.screenshot({ path: `${out}/${prefix}-live-open.png` })
await openGame.close()

const waiting = await open('/santa/')
check('waiting screen', (await waiting.$eval('[data-screen]', (el) => el.getAttribute('data-screen'))) === 'waiting')
check('waiting has bot action', (await text(waiting)).includes('OPEN MY GAMES IN THE BOT'))
await waiting.screenshot({ path: `${out}/${prefix}-waiting.png` })
await waiting.close()

const broken = await open('/santa/?d=not-a-real-payload')
check('broken payload -> waiting', (await broken.$eval('[data-screen]', (el) => el.getAttribute('data-screen'))) === 'waiting')
await broken.close()

await browser.close()
if (failures.length) { console.error('FAIL\n' + failures.join('\n')); process.exit(1) }
console.log('all santa checks passed')
