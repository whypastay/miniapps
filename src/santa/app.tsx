import { useEffect, useRef, useState } from 'preact/hooks'
import { formatMoney, formatShort, pad2, parseISODate } from '../format.ts'
import { haptic } from '../telegram.ts'
import { Empty, Section, Shell } from '../ui.tsx'
import { LiveSanta, openBot } from './live.tsx'
import { createSantaRepository } from './repo.ts'
import type { SantaRepository, SantaSnapshot, WishlistItem } from './types.ts'

const TABS = [
  { id: 'game', label: 'Game' },
  { id: 'wishlist', label: 'Wishlist' },
  { id: 'group', label: 'Group' },
  { id: 'settings', label: 'Settings' },
]

export function SantaApp() {
  const repo = useRef<SantaRepository>(createSantaRepository())
  const [snap, setSnap] = useState<SantaSnapshot | null>(null)
  const [tab, setTab] = useState('game')
  const [asking, setAsking] = useState(false)
  const [draft, setDraft] = useState('')
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    let cancel = false
    void repo.current.load().then((next) => { if (!cancel) setSnap(next) })
    return () => { cancel = true }
  }, [])

  if (!snap) {
    return (
      <Shell theme="santa" title="Secret Santa" tabs={TABS} active={tab} home="game" onTab={setTab} ready={false} screen="loading">
        <p class="loading">Reading the draw</p>
      </Shell>
    )
  }

  if (snap.live) {
    return <LiveSanta snap={snap} repo={repo.current} onChange={setSnap} />
  }

  if (!snap.connected) {
    return (
      <Shell theme="santa" title="Secret Santa" tabs={TABS.filter((item) => item.id !== 'settings')} active={tab} home="game" onTab={setTab} ready screen="waiting" actions={[{ label: 'OPEN MY GAMES IN THE BOT', testId: 'open-bot', onClick: () => openBot('app') }]}>
        {tab === 'wishlist' ? (
          <Section index="01" title="YOUR LIST">
            <Empty title="NO GAME OPEN" body="OPEN THE APP FROM YOUR GAME IN THE BOT CHAT." />
          </Section>
        ) : tab === 'group' ? (
          <Section index="01" title="THE ROOM">
            <Empty title="NO NAMES" body="THE ROOM APPEARS WHEN YOU OPEN A GAME FROM THE BOT." />
          </Section>
        ) : tab === 'settings' ? (
          <Section index="01" title="RECORD" aside="WAITING">
            <p class="note">Nothing is stored until the bot connects the group.</p>
          </Section>
        ) : (
          <Section index="01" title="THE DRAW">
            <div class="kicker">Your recipient</div>
            <p class="hero-blank">—</p>
            <p class="note">Open the app from your game in the chat with the bot: tap “Open in app” under the game, or send /app.</p>
          </Section>
        )}
      </Shell>
    )
  }

  const recipient = snap.recipient
  const actions = tab === 'game'
    ? [
        {
          label: recipient.giftBought ? 'MARKED BOUGHT' : 'MARK GIFT AS BOUGHT',
          mark: 'check' as const,
          onClick: () => {
            const bought = !recipient.giftBought
            setSnap({ ...snap, recipient: { ...recipient, giftBought: bought } })
            void repo.current.setGiftBought(bought)
            haptic(bought ? 'success' : 'tap')
          },
        },
        {
          label: asking ? 'CLOSE THE NOTE' : `ASK ${recipient.givenName.toUpperCase()} ANONYMOUSLY`,
          tone: 'ghost' as const,
          onClick: () => setAsking((open) => !open),
        },
      ]
    : tab === 'wishlist'
      ? [{ label: 'ADD A LINE', onClick: () => addItem(snap, setSnap, repo.current) }]
      : []

  return (
    <Shell theme="santa" title="Secret Santa" tabs={TABS} active={tab} home="game" onTab={setTab} actions={actions} ready screen="draw">
      {tab === 'game' ? (
        <>
          <Section index="01" title={snap.studio} aside={`${snap.group.length} PLAYERS · ${recipient.drawStatus === 'done' ? 'DONE' : 'OPEN'}`}>
            <div class="kicker">You are gifting</div>
            <h2 class="name" data-field="recipient">
              <span>{recipient.givenName}</span>
              <span>{recipient.familyName}</span>
            </h2>
            <StatsRow
              budget={formatMoney(recipient.budget, recipient.currency)}
              exchange={formatShort(parseISODate(recipient.exchangeDate))}
              time={recipient.exchangeTime}
            />
          </Section>
          <Section index="02" title="HER WISHLIST" aside={`${recipient.wishlist.length} ITEMS`}>
            {recipient.wishlist.map((item, index) => (
              <article class="row" key={item.id}>
                <span class="row-idx">{pad2(index + 1)}</span>
                <span>
                  <span class="row-title">{item.title}</span>
                  <span class="row-sub">{item.note}</span>
                </span>
                <span class="row-val">{item.price === null ? '—' : `~${formatMoney(item.price, recipient.currency)}`}</span>
              </article>
            ))}
          </Section>
          {asking ? (
            <Section index="03" title="ANONYMOUS NOTE">
              <div class="composer">
                <textarea
                  value={draft}
                  maxLength={280}
                  placeholder="A question, without your name"
                  onInput={(event) => setDraft(event.currentTarget.value)}
                />
                <button
                  type="button"
                  class="text-btn"
                  onClick={() => {
                    const text = draft.trim()
                    if (!text) return
                    void repo.current.sendAnonymousNote(text).then((note) => {
                      setSnap({ ...snap, notes: [note, ...snap.notes] })
                      setDraft('')
                      haptic('success')
                    })
                  }}
                >
                  SEND THE NOTE
                </button>
                <p class="note">Demo only. Nothing leaves this device. When the group is connected, the bot delivers it without your name.</p>
              </div>
              {snap.notes.map((note) => (
                <article class="row" key={note.id}>
                  <span class="row-idx">{stamp(note.sentAt)}</span>
                  <span class="row-title">{note.text}</span>
                  <span class="row-side">SENT</span>
                </article>
              ))}
            </Section>
          ) : null}
        </>
      ) : null}

      {tab === 'wishlist' ? (
        <Section index="01" title="YOUR LIST" aside={`${snap.myWishlist.length} ITEMS`}>
          {snap.myWishlist.length === 0 ? <Empty title="NO LINES" body="ADD WHAT YOU ACTUALLY WANT." /> : null}
          {snap.myWishlist.map((item, index) => (
            <Editor
              key={item.id}
              index={index + 1}
              item={item}
              onChange={(patch) => {
                const items = snap.myWishlist.map((row) => row.id === item.id ? { ...row, ...patch } : row)
                persistList(snap, items, setSnap, repo.current)
              }}
              onRemove={() => {
                const items = snap.myWishlist.filter((row) => row.id !== item.id)
                persistList(snap, items, setSnap, repo.current)
              }}
            />
          ))}
        </Section>
      ) : null}

      {tab === 'group' ? (
        <Section index="01" title="THE ROOM" aside={`${snap.group.length} PLAYERS`}>
          <p class="note">Your assignment stays on the game tab.</p>
          {snap.group.map((member, index) => (
            <article class={member.isYou ? 'row is-you' : 'row'} key={member.id}>
              <span class="row-idx">{pad2(index + 1)}</span>
              <span class="row-title">{member.isYou ? snap.settings.displayName : member.name}</span>
              <span class="row-side">{member.isYou ? 'YOU' : `${member.wishlistCount} ${member.wishlistCount === 1 ? 'ITEM' : 'ITEMS'}`}</span>
            </article>
          ))}
        </Section>
      ) : null}

      {tab === 'settings' ? (
        <>
          <Section index="01" title="YOU">
            <label class="field">
              <span class="k">Display name</span>
              <input
                type="text"
                maxLength={32}
                value={snap.settings.displayName}
                onInput={(event) => {
                  const displayName = event.currentTarget.value
                  const settings = { ...snap.settings, displayName }
                  const group = snap.group.map((member) => member.isYou ? { ...member, name: displayName.trim() || 'You' } : member)
                  setSnap({ ...snap, settings, group })
                  void repo.current.saveSettings({ ...settings, displayName: displayName.trim() || 'You' })
                }}
              />
            </label>
            <div class="field">
              <span class="k">Remind the day before</span>
              <button
                type="button"
                class="choice"
                aria-pressed={snap.settings.remindDayBefore}
                onClick={() => {
                  const settings = { ...snap.settings, remindDayBefore: !snap.settings.remindDayBefore }
                  setSnap({ ...snap, settings })
                  void repo.current.saveSettings(settings)
                  haptic('select')
                }}
              >
                {snap.settings.remindDayBefore ? 'ON' : 'OFF'}
              </button>
            </div>
          </Section>
          <Section index="02" title="RECORD" aside="THIS DEVICE">
            <p class="note">The draw itself will live on the bot. This shell keeps a local copy.</p>
          </Section>
          <Section index="03" title="RESET">
            {armed ? (
              <div class="confirm">
                <p class="note">Puts the demo group back to its opening state.</p>
                <div class="pair">
                  <button
                    type="button"
                    class="text-btn danger"
                    onClick={() => {
                      void repo.current.reset().then((next) => {
                        setSnap(next)
                        setArmed(false)
                        setAsking(false)
                        haptic('warning')
                      })
                    }}
                  >
                    CONFIRM RESET
                  </button>
                  <button type="button" class="text-btn" onClick={() => setArmed(false)}>KEEP THE DRAW</button>
                </div>
              </div>
            ) : (
              <div class="field">
                <span class="k">Opening state</span>
                <button type="button" class="text-btn danger" onClick={() => setArmed(true)}>RESTORE THE DRAW</button>
              </div>
            )}
          </Section>
        </>
      ) : null}
    </Shell>
  )
}

function StatsRow(props: { budget: string; exchange: string; time: string }) {
  return (
    <div class="stats" data-cols="3">
      <div class="stat"><div class="stat-label">Budget</div><div class="stat-value">{props.budget}</div></div>
      <div class="stat"><div class="stat-label">Exchange</div><div class="stat-value date">{props.exchange}</div></div>
      <div class="stat"><div class="stat-label">Time</div><div class="stat-value">{props.time}</div></div>
    </div>
  )
}

function Editor(props: {
  index: number
  item: WishlistItem
  onChange: (patch: Partial<WishlistItem>) => void
  onRemove: () => void
}) {
  return (
    <div class="editor">
      <div class="line">
        <span class="row-idx">{pad2(props.index)}</span>
        <button type="button" class="remove" onClick={props.onRemove}>REMOVE</button>
      </div>
      <input class="title" type="text" maxLength={80} value={props.item.title} placeholder="What you want" data-field={props.index === 1 ? 'wish-title' : undefined} onInput={(event) => props.onChange({ title: event.currentTarget.value })} />
      <input type="text" maxLength={120} value={props.item.note} placeholder="Size, colour, note" onInput={(event) => props.onChange({ note: event.currentTarget.value })} />
      <input
        type="text"
        inputMode="decimal"
        value={props.item.price ?? ''}
        placeholder="Price"
        onInput={(event) => {
          const raw = event.currentTarget.value.trim()
          const price = raw === '' ? null : Number(raw)
          props.onChange({ price: price !== null && Number.isFinite(price) ? price : null })
        }}
      />
    </div>
  )
}

function persistList(
  snap: SantaSnapshot,
  items: WishlistItem[],
  setSnap: (next: SantaSnapshot) => void,
  repo: SantaRepository,
) {
  const group = snap.group.map((member) => member.isYou ? { ...member, wishlistCount: items.length } : member)
  setSnap({ ...snap, myWishlist: items, group })
  void repo.saveMyWishlist(items)
}

function addItem(snap: SantaSnapshot, setSnap: (next: SantaSnapshot) => void, repo: SantaRepository) {
  const items = [...snap.myWishlist, { id: Math.random().toString(36).slice(2, 10), title: '', note: '', price: null }]
  persistList(snap, items, setSnap, repo)
  haptic('tap')
}

function stamp(iso: string): string {
  const date = new Date(iso)
  return `${formatShort(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}
