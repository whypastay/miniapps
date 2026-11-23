/* Santa+ pieces: budget currency, item wishlists, meetup poll, party pack, public wishlist. Ledger style. */
import { useMemo, useState } from 'preact/hooks'
import { formatShort, pad2, parseISODate } from '../format.ts'
import { copyText, openLink } from '../api.ts'
import { haptic } from '../telegram.ts'
import { Empty, Section } from '../ui.tsx'
import decks from './party.json'

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'PHP', 'NGN', 'RUB', 'IDR', 'BRL', 'MXN', 'TRY', 'UAH', 'KZT', 'PKR', 'KES', 'ZAR', 'CAD', 'AUD', 'AED', 'PLN']

export interface WishItem { title: string; link?: string; size?: string; note?: string }
export interface MeetupOption { id: number; at: string; votes: number; mine: boolean; names: string[] }
export interface Meetup { at: string | null; place: string | null; pollOpen: boolean; options: MeetupOption[]; voters: number }

export function guessCurrency(): string {
  try {
    const loc = (navigator.language || 'en-US').toUpperCase()
    const region = loc.split('-')[1] ?? ''
    const map: Record<string, string> = { IN: 'INR', PH: 'PHP', NG: 'NGN', RU: 'RUB', ID: 'IDR', BR: 'BRL', MX: 'MXN', TR: 'TRY', UA: 'UAH', KZ: 'KZT', PK: 'PKR', KE: 'KES', ZA: 'ZAR', CA: 'CAD', AU: 'AUD', AE: 'AED', PL: 'PLN', GB: 'GBP', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR' }
    return map[region] ?? 'USD'
  } catch { return 'USD' }
}

export function BudgetField(props: { amount: string; currency: string; onAmount: (v: string) => void; onCurrency: (v: string) => void; prefix: string }) {
  return (
    <div class="field stack">
      <span class="k">Budget per gift (optional)</span>
      <div class="budget-row">
        <input type="text" inputMode="decimal" maxLength={9} value={props.amount} placeholder="1500" data-field={`${props.prefix}-budget`}
          onInput={(e) => props.onAmount(e.currentTarget.value.replace(/[^\d.]/g, ''))} />
        <select value={props.currency} data-field={`${props.prefix}-currency`} onChange={(e) => props.onCurrency(e.currentTarget.value)}>
          {CURRENCIES.map((c) => <option value={c} key={c}>{c}</option>)}
        </select>
      </div>
      <span class="note">Everyone sees the same amount and currency.</span>
    </div>
  )
}

export function textToItems(text: string | null): WishItem[] {
  if (!text) return []
  return text.split(/\r?\n/).map((l) => l.replace(/^[\s\-•*·]+/, '').trim()).filter(Boolean).slice(0, 15).map((title) => {
    const m = title.match(/(https?:\/\/\S+)/)
    return m ? { title: title.replace(m[1], '').trim() || 'Link', link: m[1] } : { title: title.slice(0, 80) }
  })
}

function host(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return 'link' }
}

/** Read-only list: what a Santa (or a friend with the public link) sees. */
export function WishItemsView(props: { items: WishItem[]; text: string | null; noSurprises: string | null; listOnly: boolean; empty: preact.ComponentChildren }) {
  const items = props.items.length ? props.items : textToItems(props.text)
  return (
    <>
      {props.listOnly ? <p class="flag" data-field="list-only">Please stick to the list</p> : null}
      {items.length ? items.map((it, i) => (
        <article class="row wish-item" key={`${i}-${it.title}`}>
          <span class="row-idx">{pad2(i + 1)}</span>
          <span>
            <span class="row-title">{it.title}</span>
            {it.size || it.note ? <span class="row-sub">{[it.size ? `Size ${it.size}` : '', it.note ?? ''].filter(Boolean).join(' · ')}</span> : null}
          </span>
          {it.link ? <button type="button" class="text-btn" onClick={() => { haptic('tap'); openLink(it.link!) }}>{host(it.link).toUpperCase().slice(0, 14)} ↗</button> : <span />}
        </article>
      )) : props.empty}
      {props.noSurprises ? (
        <div class="callout" data-field="no-surprises"><span class="k">No surprises, please</span><p>{props.noSurprises}</p></div>
      ) : null}
    </>
  )
}

/** Editor: items with optional size / link / note, plus "no surprises" and "stick to the list". */
export function WishItemsEditor(props: {
  items: WishItem[]; noSurprises: string; listOnly: boolean
  onChange: (next: { items: WishItem[]; noSurprises: string; listOnly: boolean }) => void
}) {
  const [open, setOpen] = useState<number | null>(null)
  const set = (items: WishItem[]) => props.onChange({ items, noSurprises: props.noSurprises, listOnly: props.listOnly })
  const patch = (i: number, p: Partial<WishItem>) => set(props.items.map((it, j) => (j === i ? { ...it, ...p } : it)))
  return (
    <div class="wish-editor">
      {props.items.map((it, i) => (
        <div class="wish-edit" key={i}>
          <div class="wish-edit-top">
            <span class="row-idx">{pad2(i + 1)}</span>
            <input type="text" maxLength={80} value={it.title} placeholder="Gift idea" data-field={`item-${i}`}
              onInput={(e) => patch(i, { title: e.currentTarget.value })} />
            <button type="button" class="text-btn" data-action={`details-${i}`} onClick={() => setOpen(open === i ? null : i)}>{open === i ? 'DONE' : 'DETAILS'}</button>
            <button type="button" class="text-btn danger" aria-label="Remove" onClick={() => { set(props.items.filter((_, j) => j !== i)); setOpen(null) }}>✕</button>
          </div>
          {open === i ? (
            <div class="wish-edit-more">
              <input type="text" maxLength={40} value={it.size ?? ''} placeholder="Size (optional)" data-field={`item-${i}-size`} onInput={(e) => patch(i, { size: e.currentTarget.value })} />
              <input type="url" maxLength={300} value={it.link ?? ''} placeholder="https:// link (optional)" data-field={`item-${i}-link`} onInput={(e) => patch(i, { link: e.currentTarget.value.trim() })} />
              <input type="text" maxLength={120} value={it.note ?? ''} placeholder="Colour, brand, any detail" data-field={`item-${i}-note`} onInput={(e) => patch(i, { note: e.currentTarget.value })} />
            </div>
          ) : it.size || it.link || it.note ? (
            <p class="row-sub wish-edit-sum">{[it.size ? `Size ${it.size}` : '', it.link ? host(it.link) : '', it.note ?? ''].filter(Boolean).join(' · ')}</p>
          ) : null}
        </div>
      ))}
      {props.items.length < 15 ? (
        <button type="button" class="text-btn add-item" data-action="add-item" onClick={() => { haptic('tap'); set([...props.items, { title: '' }]); setOpen(null) }}>+ ADD AN IDEA</button>
      ) : null}
      <label class="field stack">
        <span class="k">No surprises, please (optional)</span>
        <textarea maxLength={200} value={props.noSurprises} data-field="no-surprises" placeholder="Allergies, no candles, nothing with cats…"
          onInput={(e) => props.onChange({ items: props.items, noSurprises: e.currentTarget.value, listOnly: props.listOnly })} />
      </label>
      <div class="field">
        <span class="k">Ask my Santa to stick to the list</span>
        <button type="button" class="choice" aria-pressed={props.listOnly} data-field="list-only-toggle"
          onClick={() => { haptic('select'); props.onChange({ items: props.items, noSurprises: props.noSurprises, listOnly: !props.listOnly }) }}>{props.listOnly ? 'ON' : 'OFF'}</button>
      </div>
    </div>
  )
}

export function atLabel(at: string): string {
  const [d, t] = at.split('T')
  return `${formatShort(parseISODate(d))} · ${t}`
}

function weekday(at: string): string {
  return parseISODate(at.split('T')[0]).toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
}

/** Meetup poll: organizer adds options, opens the vote and picks; players tick what works. */
export function MeetupSection(props: {
  meetup: Meetup; organizer: boolean; playing: boolean; busy: boolean; players: number; today: string
  onAdd: (at: string) => void; onRemove: (id: number) => void; onPoll: (open: boolean) => void; onVote: (id: number, on: boolean) => void
  onPick: (id: number) => void; onClear: () => void
}) {
  const m = props.meetup
  const [day, setDay] = useState('')
  const [time, setTime] = useState('19:00')
  const best = Math.max(0, ...m.options.map((o) => o.votes))
  if (!props.organizer && !m.at && !m.pollOpen) return null
  return (
    <Section title="Meetup" aside={m.at ? 'Set' : m.pollOpen ? `${m.voters} voted` : `${m.options.length} options`}>
      {m.at ? (
        <div class="field meetup-final" data-field="meetup-at">
          <span><span class="k">{weekday(m.at)} {atLabel(m.at)}</span>{m.place ? <span class="row-sub">{m.place}</span> : null}</span>
          {props.organizer ? <button type="button" class="text-btn" onClick={props.onClear}>CHANGE</button> : <span class="row-side">SEE YOU</span>}
        </div>
      ) : null}
      {!m.at ? (
        <>
          <p class="note">
            {m.pollOpen
              ? props.organizer ? 'Everyone ticks the times that work. Pick the winner when enough people voted.' : 'Tick every time that works for you. The organizer picks the final one.'
              : 'Suggest 2–8 times, then open the vote. Players get one message to vote here.'}
          </p>
          {m.options.map((o) => (
            <article class={o.mine ? 'row vote is-you' : 'row vote'} key={o.id} data-option={o.id}>
              <span class="row-idx">{weekday(o.at)}</span>
              <span>
                <span class="row-title">{atLabel(o.at)}</span>
                <span class="row-sub">{o.votes ? `${o.votes} · ${o.names.join(', ')}` : 'No votes yet'}</span>
                <span class="vote-bar"><span style={{ width: `${props.players ? Math.min(100, (o.votes / props.players) * 100) : 0}%` }} /></span>
              </span>
              <span class="vote-side">
                {m.pollOpen ? (
                  <button type="button" class="choice" aria-pressed={o.mine} data-action="vote" disabled={props.busy}
                    onClick={() => { haptic('select'); props.onVote(o.id, !o.mine) }}>{o.mine ? 'WORKS' : 'TICK'}</button>
                ) : null}
                {props.organizer && m.pollOpen && o.votes === best && best > 0 ? (
                  <button type="button" class="text-btn" data-action="pick" onClick={() => props.onPick(o.id)}>PICK</button>
                ) : null}
                {props.organizer && !m.pollOpen ? (
                  <button type="button" class="text-btn danger" onClick={() => props.onRemove(o.id)}>✕</button>
                ) : null}
              </span>
            </article>
          ))}
          {props.organizer && !m.pollOpen && m.options.length < 8 ? (
            <div class="meetup-add">
              <input type="date" min={props.today} value={day} data-field="meetup-day" onInput={(e) => setDay(e.currentTarget.value)} />
              <input type="time" value={time} step={900} data-field="meetup-time" onInput={(e) => setTime(e.currentTarget.value)} />
              <button type="button" class="text-btn" data-action="add-option" disabled={!day || !time || props.busy}
                onClick={() => { props.onAdd(`${day}T${time}`); haptic('tap') }}>ADD</button>
            </div>
          ) : null}
          {props.organizer ? (
            <div class="field">
              <span class="k">{m.pollOpen ? 'Close the vote' : 'Open the vote'}</span>
              <button type="button" class="text-btn" data-action="poll" disabled={props.busy || (!m.pollOpen && m.options.length < 2)}
                onClick={() => props.onPoll(!m.pollOpen)}>{m.pollOpen ? 'CLOSE' : 'OPEN'}</button>
            </div>
          ) : null}
        </>
      ) : null}
    </Section>
  )
}

type DeckId = keyof typeof decks
const DECK_IDS = Object.keys(decks) as DeckId[]

function shuffled(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i)
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

/** Party pack for the event day: pick a deck, flip cards, share one to the group chat. */
export function PartyDeck(props: { bot: string; say: (t: string) => void }) {
  const [deck, setDeck] = useState<DeckId>('icebreakers')
  const [pos, setPos] = useState(0)
  const order = useMemo(() => shuffled(decks[deck].cards.length), [deck])
  const d = decks[deck]
  const card = d.cards[order[pos % order.length]]
  const shareText = `${d.emoji} ${d.title}: ${card}`
  const botLink = `https://t.me/${props.bot}`
  return (
    <>
      <Section title="Party pack" aside={`${pad2((pos % order.length) + 1)} / ${order.length}`}>
        <div class="choices two deck-pick" role="group">
          {DECK_IDS.map((id) => (
            <button type="button" class="choice" key={id} aria-pressed={deck === id} data-deck={id}
              onClick={() => { haptic('select'); setDeck(id); setPos(0) }}>{decks[id].title}</button>
          ))}
        </div>
        <div class="party-card" data-field="party-card" onClick={() => { haptic('tap'); setPos((p) => p + 1) }}>
          <span class="kicker">{d.emoji} {d.title}</span>
          <p>{card}</p>
          <span class="row-sub">Tap the card for the next one</span>
        </div>
        <div class="field">
          <span class="k">Read it out, or send it to the chat</span>
          <span class="party-actions">
            <button type="button" class="text-btn" data-action="party-next" onClick={() => { haptic('tap'); setPos((p) => p + 1) }}>NEXT</button>
            <button type="button" class="text-btn" data-action="party-share" onClick={() => openLink(`https://t.me/share/url?url=${encodeURIComponent(botLink)}&text=${encodeURIComponent(shareText)}`)}>SHARE</button>
            <button type="button" class="text-btn" onClick={() => void copyText(shareText).then((ok) => props.say(ok ? 'Copied.' : shareText))}>COPY</button>
          </span>
        </div>
      </Section>
      <p class="note">Tip: in any chat type @{props.bot} and a space to drop a random question, or add a word like “truth” or “rather”.</p>
    </>
  )
}

export interface PublicList { name: string; items: WishItem[]; wishlist: string | null; noSurprises: string | null; listOnly: boolean; mine: boolean; bot: string }

export function PublicWishlistBody(props: { list: PublicList }) {
  const l = props.list
  return (
    <Section title={`${l.name}'s wishlist`} aside={`${(l.items.length || textToItems(l.wishlist).length)} ideas`}>
      <WishItemsView items={l.items} text={l.wishlist} noSurprises={l.noSurprises} listOnly={l.listOnly}
        empty={<Empty title="Nothing here yet" body={`${l.name} has not added ideas yet.`} />} />
    </Section>
  )
}
