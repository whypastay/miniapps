import { createContext } from 'preact'
import type { ComponentChildren } from 'preact'
import { useContext, useEffect, useRef, useState } from 'preact/hooks'
import type { Api } from './api.ts'
import { haptic } from './telegram.ts'
import { themeBlock, themes, type ThemeId } from './theme.ts'

export interface IntroCard {
  kicker: string
  title: string
  body: string
}

export interface GuideFaq {
  q: string
  a: string
}

export interface GuideSpec {
  id: ThemeId
  cards: IntroCard[]
  how: string[]
  faq: GuideFaq[]
}

export const SANTA_GUIDE: GuideSpec = {
  id: 'santa',
  cards: [
    {
      kicker: '01',
      title: 'A gift exchange, in the app',
      body: 'Create a game, set a budget and a date, then share the invite. Everyone joins in one tap.',
    },
    {
      kicker: '02',
      title: 'Wishlists, then a private draw',
      body: 'Add what you would like, with a size and a link if you want. The draw never repeats last year’s pairs, and couples can be kept unpaired.',
    },
    {
      kicker: '03',
      title: 'Meet up, or just play',
      body: 'Vote on a date, then open the Party tab for questions. In any chat, type @PartyPackSanta_bot to drop a question from the decks.',
    },
    {
      kicker: '04',
      title: 'Free, and private',
      body: 'Only you see who you are gifting. Chat is for notifications. Skip this anytime — the ? keeps the guide.',
    },
  ],
  how: [
    'Create a game in the app: a name, an optional budget and a date.',
    'Share the invite link, or add the bot to a group chat.',
    'Everyone writes a wishlist. After the draw, only you see your giftee.',
    'Vote on a meetup if you want one. The Party tab has questions for the room. In any chat, type @PartyPackSanta_bot to insert a question.',
    'The bot writes to this chat for the draw, reminders and notes — not for the main flow.',
  ],
  faq: [
    { q: 'Is it free?', a: 'Yes. There is no paid plan and no advertising in the game.' },
    { q: 'Who sees the pairs?', a: 'Only each giver sees their giftee. The organizer does not see the draw.' },
    { q: 'What do you store?', a: 'Your Telegram id, name and username, the games you join, wishlists, votes and notes you write.' },
    { q: 'How do I delete my data?', a: 'Leave or cancel a game in Manage. To remove yourself from the bot entirely, write to the bot and ask — or use the leave controls in the app for each game you are in.' },
  ],
}

export const MATCHDAY_GUIDE: GuideSpec = {
  id: 'matchday',
  cards: [
    {
      kicker: '01',
      title: 'Call the score before kick-off',
      body: 'Premier League and Champions League. Change a pick any time until the match starts.',
    },
    {
      kicker: '02',
      title: 'Exact is three, result is one',
      body: 'Climb the worldwide table. Create a private league for friends, or join one with a code.',
    },
    {
      kicker: '03',
      title: 'Times in your zone',
      body: 'Set your time zone in Settings. We can nudge you before kick-off if you ask.',
    },
    {
      kicker: '04',
      title: 'Free, no betting',
      body: 'Just bragging rights. Chat is for results and reminders; the app is where you play.',
    },
  ],
  how: [
    'Open Picks, set a score, and save it. You can change it until kick-off.',
    'Exact score is 3 points. The right result (win, draw or loss) is 1.',
    'Your rank appears on the worldwide table. Create a private league, or join with a code.',
    'Set your time zone and optional reminders in Settings.',
    'The bot writes to this chat for results and reminders. Picks live in the app.',
  ],
  faq: [
    { q: 'Is it free?', a: 'Yes. There is no betting, no odds, no money and no prizes — only bragging rights.' },
    { q: 'What do you store?', a: 'Your Telegram id, name and username, your time zone and reminder settings, your predictions and the leagues you join.' },
    { q: 'How do I delete my data?', a: 'Settings has a control to delete everything. It cannot be undone. Other players only ever saw your first name and points.' },
    { q: 'When do picks lock?', a: 'At kick-off for that match. A locked pick cannot be changed.' },
  ],
}

export const BUDGET_GUIDE: GuideSpec = {
  id: 'budget',
  cards: [
    {
      kicker: '01',
      title: 'A 52-week ledger',
      body: 'Pick classic, reverse, or a fixed weekly amount, in any currency. Tick a week when the money is set aside.',
    },
    {
      kicker: '02',
      title: 'Skip a week without shame',
      body: 'A skip is logged honestly and ends the current streak. You can change the unit later; past ticks stay as history.',
    },
    {
      kicker: '03',
      title: 'Split what a group spends',
      body: 'Open the Split tab for a trip or a shared house. We show who owes whom in the fewest transfers.',
    },
    {
      kicker: '04',
      title: 'Private, and free',
      body: 'We never ask for bank details. This is a tracker, not financial advice. Chat is for reminders; the ledger and the split live in the app.',
    },
  ],
  how: [
    'Open a 52-week ledger: classic (1→52), reverse (52→1), or a fixed weekly amount, in any currency.',
    'Tick a week when the money is set aside. Skip if you need to — it is logged honestly.',
    'Open the Split tab to log what a group spent. Balances update as you go, and settle-up uses the fewest transfers.',
    'Optional weekly reminders arrive in this chat. The tracker itself stays in the app.',
  ],
  faq: [
    { q: 'Is it free?', a: 'Yes. There is no paid plan.' },
    { q: 'Is this financial advice?', a: 'No. This is a tracker, not advice, and not a promise of a result. We never ask for bank details, phone numbers or ID.' },
    { q: 'What do you store?', a: 'Your Telegram id, name and username, your challenge setup, weekly ticks and notes, reminder preferences, and any Split groups you join.' },
    { q: 'How do I delete my data?', a: 'Settings can reset the ledger. Privacy in the bot chat can delete everything we have stored about you.' },
  ],
}


export const RADAR_GUIDE: GuideSpec = {
  id: 'radar',
  cards: [
    {
      kicker: '01',
      title: 'Jobs open to your country',
      body: 'Pick your country, role and level. You only see remote listings that actually accept applicants from there.',
    },
    {
      kicker: '02',
      title: 'Apply on the original board',
      body: 'Listings come from Himalayas, Remote OK and Jobicy. Open a job here, then apply on their page.',
    },
    {
      kicker: '03',
      title: 'Check a suspicious offer',
      body: 'Paste a job post or a link in Check. Each red flag is explained. You can also paste an offer in this chat.',
    },
    {
      kicker: '04',
      title: 'Free, and optional alerts',
      body: 'We never charge you or ask for your documents. Turn on a daily alert if you want one. Skip this anytime — the ? keeps the guide.',
    },
  ],
  how: [
    'Set your country, role and level in the app. The feed only shows remote jobs open to that country.',
    'Tap a job to read it, save it, or apply on the board that listed it (Himalayas, Remote OK or Jobicy).',
    'Paste a suspicious offer in Check — or in this chat — to see every red flag explained.',
    'Optional: a daily alert with new matches at the hour you pick, in Settings.',
    'Chat is for alerts and a short verdict if you paste an offer. The feed lives in the app.',
  ],
  faq: [
    { q: 'Is it free?', a: 'Yes. We never charge you or ask for your documents.' },
    { q: 'Where do the jobs come from?', a: 'Himalayas, Remote OK and Jobicy. You apply on their pages, not inside this app.' },
    { q: 'What do you store?', a: 'Your Telegram id and name, your country, role and level, saved jobs, and alert time. For scam checks we keep only the result so a shared link works, never the text you pasted.' },
    { q: 'How do I delete my data?', a: 'Settings has a control to delete everything, or send /delete in the chat. It cannot be undone.' },
  ],
}

export const GIGS_GUIDE: GuideSpec = {
  id: 'radar',
  cards: [
    {
      kicker: '01',
      title: 'AI gigs open to your country',
      body: 'Outlier, Mercor, micro1, DataAnnotation and more. See which ones take people from where you live, before you spend an evening on sign-up.',
    },
    {
      kicker: '02',
      title: 'What joining really takes',
      body: 'ID checks, assessments, typical tasks, how pay works and what people run into. Checked by hand on each platform\'s own pages, every week.',
    },
    {
      kicker: '03',
      title: 'Spot fake copies',
      body: 'Real platforms never charge to join. Each card shows the official site only. Paste any offer or link in Check to see its red flags.',
    },
    {
      kicker: '04',
      title: 'Hear when one opens',
      body: 'Turn on a notice and we message you when a new platform appears or one opens to your country. Skip this anytime — the ? keeps the guide.',
    },
  ],
  how: [
    'Gigs lists AI-training and data platforms with your status: open, varies by project, invite only, or not open.',
    'Tap a platform for its country rules, sign-up steps, tasks, pay and common complaints, with links to its own pages.',
    'Sign up only on the official site shown on the card. Joining is free on every real platform.',
    'Never buy, rent or share an account, and never use a VPN to fake your country: platforms close those accounts and keep the pay.',
    'Turn on the notice to hear when a platform opens to your country. Live gig listings below come from Himalayas, Remote OK and Jobicy.',
  ],
  faq: [
    { q: 'How current is this?', a: 'We read each platform\'s public pages by hand and review the list every week. Rules change fast, so the official site has the final word.' },
    { q: 'Are you part of these platforms?', a: 'No. RemoteRadar is independent. If we ever use a referral link it is the platform\'s official program and it is marked.' },
    { q: 'Someone offers me a ready account. OK?', a: 'No. Accounts are tied to one verified person. Rented or bought accounts get closed, the pay is lost, and sellers often ask for more money.' },
    { q: 'What does the notice send?', a: 'At most one message a day, between 9:00 and 21:00 your time, only when a platform is new or opens to your country. Turn it off here or with /stop.' },
  ],
}

interface Chrome {
  onHelp?: () => void
  banner?: ComponentChildren
}

const GuideCtx = createContext<Chrome>({})

export function useGuideChrome(): Chrome {
  return useContext(GuideCtx)
}

function override(): 'intro' | 'help' | 'off' | null {
  const v = new URLSearchParams(location.search).get('guide')
  if (v === 'intro' || v === 'help' || v === 'off') return v
  return null
}

export function GuideScope(props: {
  theme: ThemeId
  spec: GuideSpec
  api: Api | null
  ready: boolean
  onboarded: boolean
  hint?: string | null
  /** Body posted to /me/onboarded when the intro ends; lets one app keep a separate intro per mode. */
  doneBody?: Record<string, unknown>
  children: ComponentChildren
}) {
  const forced = override()
  const [intro, setIntro] = useState(forced === 'intro')
  const [help, setHelp] = useState(forced === 'help')
  const [hint, setHint] = useState<string | null>(props.hint ?? null)
  const theme = themes[props.theme]

  useEffect(() => { setHint(props.hint ?? null) }, [props.hint])

  useEffect(() => {
    if (forced === 'off') { setIntro(false); setHelp(false); return }
    if (forced === 'intro') { setIntro(true); return }
    if (forced === 'help') { setHelp(true); setIntro(false); return }
    if (!props.ready) return
    // An invite or deep link should not block the person with the full intro.
    if (props.hint) { setIntro(false); return }
    if (props.api && !props.onboarded) setIntro(true)
  }, [props.ready, props.onboarded, props.hint, props.api, forced])

  async function finish() {
    setIntro(false)
    haptic('success')
    if (props.api) {
      try { await props.api.post('/me/onboarded', props.doneBody ?? { done: true }) } catch { /* keep the local flag */ }
    }
  }

  function openHelp() {
    haptic('tap')
    setHelp(true)
  }

  function replay() {
    setHelp(false)
    setIntro(true)
    haptic('tap')
  }

  const banner = hint ? (
    <div class="hint-bar" data-hint role="status">
      <span>{hint}</span>
      <button type="button" class="text-btn" data-action="hint-dismiss" onClick={() => setHint(null)}>Dismiss</button>
    </div>
  ) : null

  return (
    <GuideCtx.Provider value={{ onHelp: openHelp, banner }}>
      {props.children}
      {intro ? <Intro theme={theme.id} spec={props.spec} onDone={() => void finish()} /> : null}
      {help ? <HelpSheet theme={theme.id} spec={props.spec} onClose={() => setHelp(false)} onReplay={replay} /> : null}
    </GuideCtx.Provider>
  )
}

function Intro(props: { theme: ThemeId; spec: GuideSpec; onDone: () => void }) {
  const [step, setStep] = useState(0)
  const start = useRef<{ x: number; y: number } | null>(null)
  const cards = props.spec.cards
  const last = step >= cards.length - 1
  const card = cards[step]
  const theme = themes[props.theme]

  function go(next: number) {
    const i = Math.max(0, Math.min(cards.length - 1, next))
    if (i === step) return
    haptic('select')
    setStep(i)
  }

  function onPointerDown(e: { clientX: number; clientY: number }) {
    start.current = { x: e.clientX, y: e.clientY }
  }
  function onPointerUp(e: { clientX: number; clientY: number }) {
    const from = start.current
    start.current = null
    if (!from) return
    const dx = e.clientX - from.x
    const dy = e.clientY - from.y
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return
    if (dx < 0) {
      if (last) props.onDone()
      else go(step + 1)
    } else go(step - 1)
  }

  return (
    <div
      class="guide-layer"
      data-theme={theme.id}
      data-intro="1"
      data-intro-step={String(step + 1)}
      data-screen="intro"
    >
      <style>{themeBlock(theme)}</style>
      <div class="guide-top">
        <button type="button" class="text-btn" data-action="intro-skip" onClick={props.onDone}>Skip</button>
      </div>
      <div
        class="guide-card"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <div class="guide-kicker">{card.kicker}</div>
        <h2 class="guide-title">{card.title}</h2>
        <p class="guide-body">{card.body}</p>
      </div>
      <div class="guide-nav">
        <div class="guide-dots" role="tablist" aria-label="Introduction">
          {cards.map((item, i) => (
            <button
              key={item.kicker}
              type="button"
              class={i === step ? 'guide-dot is-on' : 'guide-dot'}
              aria-label={`Card ${i + 1}`}
              aria-current={i === step ? 'step' : undefined}
              onClick={() => go(i)}
            />
          ))}
        </div>
        <button
          type="button"
          class="cta"
          data-action={last ? 'intro-done' : 'intro-next'}
          onClick={() => { if (last) props.onDone(); else go(step + 1) }}
        >
          <span class="cta-label">{last ? 'Get started' : 'Next'}</span>
          <span class="cta-side" aria-hidden="true">
            <svg class="glyph" width="18" height="12" viewBox="0 0 18 12">
              <path d="M1 6h15M11.5 1.5 16 6l-4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.2" />
            </svg>
          </span>
        </button>
      </div>
    </div>
  )
}

function HelpSheet(props: { theme: ThemeId; spec: GuideSpec; onClose: () => void; onReplay: () => void }) {
  const theme = themes[props.theme]
  return (
    <div class="guide-layer is-help" data-theme={theme.id} data-help="1" data-screen="help">
      <style>{themeBlock(theme)}</style>
      <div class="guide-top">
        <button type="button" class="text-btn" data-action="help-close" onClick={() => { haptic('tap'); props.onClose() }}>Close</button>
      </div>
      <div class="guide-scroll">
        <div class="guide-kicker">How it works</div>
        <h2 class="guide-title">A short guide</h2>
        <ol class="help-steps">
          {props.spec.how.map((line, i) => (
            <li key={i}><span class="help-n">{String(i + 1).padStart(2, '0')}</span><span>{line}</span></li>
          ))}
        </ol>
        <div class="guide-kicker tight">Questions</div>
        {props.spec.faq.map((item) => (
          <details class="help-qa" key={item.q}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
        <button type="button" class="text-btn help-replay" data-action="help-replay" onClick={props.onReplay}>
          Show the intro again
        </button>
      </div>
    </div>
  )
}
