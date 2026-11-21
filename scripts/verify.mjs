import { mkdir, writeFile } from 'node:fs/promises'
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
    await document.fonts.load('700 120px Archivo')
    await document.fonts.load('400 16px "IBM Plex Mono"')
    await document.fonts.ready
  })
  await new Promise((resolve) => setTimeout(resolve, 80))
  return page
}

async function shot(page, name) {
  await mkdir(out, { recursive: true })
  const file = `${out}/${name}.png`
  await page.screenshot({ path: file, fullPage: false })
  return file
}

async function overflow(page, label) {
  const box = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }))
  check(`${label} no horizontal overflow`, box.sw <= box.cw + 1, `scroll ${box.sw} client ${box.cw}`)
  const tabs = await page.$eval('.tabbar', (el) => {
    const r = el.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom }
  })
  check(`${label} tabs inside viewport`, tabs.bottom <= 845 && tabs.top > 600, JSON.stringify(tabs))
}

const budget = await open('/budget/')
const saved = await budget.$eval('[data-field="saved"]', (el) => el.textContent.trim())
const progress = await budget.$eval('[data-field="progress"]', (el) => el.textContent.trim())
const week = await budget.$eval('[data-field="week"]', (el) => el.textContent.trim())
const streak = await budget.$eval('[data-field="streak"]', (el) => el.textContent.trim())
const missed = await budget.$eval('[data-field="missed"]', (el) => el.textContent.trim())
const next = await budget.$eval('[data-field="next"]', (el) => el.textContent.trim())
check('saved 4,480', saved === '4,480', saved)
check('progress', progress.includes('32.5%') && progress.includes('13,780'), progress)
check('week 31', week === '31', week)
check('streak 13', streak === '13', streak)
check('missed 1', missed === '1', missed)
check('next €310', next === '€310', next)
const fonts = await budget.evaluate(() => {
  const hero = getComputedStyle(document.querySelector('.hero-num'))
  return {
    cond: document.fonts.check('700 80px Archivo'),
    mono: document.fonts.check('400 16px "IBM Plex Mono"'),
    stretch: hero.fontStretch,
    family: hero.fontFamily,
    weight: hero.fontWeight,
  }
})
console.log('  type', fonts.family, fonts.weight, fonts.stretch)
check('archivo loaded', fonts.cond)
check('plex loaded', fonts.mono)
check('hero is condensed', fonts.stretch === '62%' || fonts.stretch === 'extra-condensed', fonts.stretch)
await overflow(budget, 'budget')
await shot(budget, 'budget-ledger')

await budget.click('[data-week="31"]')
await budget.waitForFunction(() => document.querySelector('[data-field="saved"]')?.textContent?.trim() === '4,790')
const mid = await budget.$eval('[data-field="saved"]', (el) => el.textContent.trim())
check('week 31 logs €310', mid === '4,790', mid)
await budget.reload({ waitUntil: 'domcontentloaded' })
await budget.waitForSelector('[data-ready="true"]')
await budget.evaluate(() => document.fonts.ready)
const after = await budget.$eval('[data-field="saved"]', (el) => el.textContent.trim())
check('persists across reload', after === '4,790', after)
const stored = await budget.evaluate(() => localStorage.getItem('si:budget:v1'))
check('localStorage written', Boolean(stored && stored.includes('"31"')))

await budget.click('[data-tab="history"]')
await shot(budget, 'budget-history')
await budget.click('[data-tab="circle"]')
await budget.waitForSelector('.card-frame img', { timeout: 8000 })
await shot(budget, 'budget-circle')
await budget.click('[data-tab="settings"]')
await shot(budget, 'budget-settings')
await budget.click('[aria-pressed="false"]')
await budget.close()

const santa = await open('/santa/')
const name = await santa.$eval('[data-field="recipient"]', (el) => el.textContent.replace(/\s+/g, ' ').trim())
check('recipient Aisha Rahman', name.toLowerCase().includes('aisha') && name.toLowerCase().includes('rahman'), name)
await overflow(santa, 'santa')
await shot(santa, 'santa-game')
await santa.click('[data-tab="wishlist"]')
const title = await santa.$('[data-field="wish-title"]')
await title.click({ clickCount: 3 })
await title.type(' cartridge')
await santa.waitForFunction(() => localStorage.getItem('si:santa:v1')?.includes('cartridge'))
await santa.reload({ waitUntil: 'domcontentloaded' })
await santa.waitForSelector('[data-ready="true"]')
await santa.click('[data-tab="wishlist"]')
const kept = await santa.$eval('[data-field="wish-title"]', (el) => el.value)
check('wishlist persists', kept.includes('cartridge'), kept)
await shot(santa, 'santa-wishlist')
await santa.click('[data-tab="group"]')
await shot(santa, 'santa-group')
await santa.click('[data-tab="settings"]')
await shot(santa, 'santa-settings')
await santa.close()

const match = await open('/matchday/')
const position = await match.$eval('[data-field="position"]', (el) => el.textContent.trim())
const picks = await match.$eval('[data-field="picks"]', (el) => el.textContent.trim())
check('position 03', position === '03', position)
check('picks 6/10', picks === '6/10', picks)
const marco = await match.evaluate(() => document.body.innerText.includes('Marco B.'))
check('table has Marco', marco)
await overflow(match, 'matchday')
await shot(match, 'matchday-table')
await match.click('[data-tab="picks"]')
await shot(match, 'matchday-picks')
const before = await match.$eval('[data-pick="f7"][data-result="1"]', (el) => el.getAttribute('aria-pressed'))
await match.click('[data-pick="f7"][data-result="1"]')
await match.waitForFunction(() => document.querySelector('[data-pick="f7"][data-result="1"]')?.getAttribute('aria-pressed') === 'true')
await match.reload({ waitUntil: 'domcontentloaded' })
await match.waitForSelector('[data-ready="true"]')
await match.click('[data-tab="picks"]')
const pressed = await match.$eval('[data-pick="f7"][data-result="1"]', (el) => el.getAttribute('aria-pressed'))
check('pick persists', before !== 'true' && pressed === 'true', `${before} -> ${pressed}`)
await match.click('[data-tab="league"]')
await shot(match, 'matchday-league')
await match.click('[data-tab="settings"]')
await shot(match, 'matchday-settings')
await match.close()

const hub = await open('/')
await shot(hub, 'hub')
await hub.close()

await browser.close()
await writeFile(`${out}/report.json`, JSON.stringify({ failures }, null, 2))
if (failures.length) {
  console.error('\nFAILED')
  for (const line of failures) console.error('  ' + line)
  process.exit(1)
}
console.log('\nall checks passed')
