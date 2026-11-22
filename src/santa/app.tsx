import { useEffect, useRef, useState } from 'preact/hooks'
import { formatMoney, formatShort, pad2, parseISODate } from '../format.ts'
import { haptic } from '../telegram.ts'
import { Empty, Seal, Section, Shell } from '../ui.tsx'
import { LiveSanta, openBot } from './live.tsx'
import { createSantaRepository } from './repo.ts'
import { ServerSanta } from './server.tsx'
import { connect, type Api } from '../api.ts'
import { demoRequested } from '../mode.ts'
import type { SantaRepository, SantaSnapshot, WishlistItem } from './types.ts'

const TABS = [
  { id: 'game', label: 'Game', icon: 'gift' as const },
  { id: 'wishlist', label: 'Wishlist', icon: 'list' as const },
  { id: 'group', label: 'Group', icon: 'people' as const },
  { id: 'settings', label: 'Settings', icon: 'gear' as const },
]

export function SantaApp() {
  // undefined = still looking for the live backend; null = none (snapshot / demo mode)
  const [api, setApi] = useState<Api | null | undefined>(demoRequested() ? null : undefined)
  useEffect(() => {
    if (api !== undefined) return
    let cancel = false
    void connect('santa').then((next) => { if (!cancel) setApi(next) })
    return () => { cancel = true }
  }, [])
  if (api === undefined) {
    return (
      <Shell theme="santa" title="Secret Santa" tabs={[]} active="x" home="x" onTab={() => undefined} ready={false} screen="loading" mast={['Secret Santa', 'Connecting']}>
        <p class="loading">Connecting to the bot</p>
      </Shell>
    )
  }
  if (api) return <ServerSanta api={api} onOffline={() => setApi(null)} />
  return <SnapshotSanta />
}

function SnapshotSanta() {
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
      <Shell theme="santa" title="Secret Santa" tabs={TABS} active={tab} home="game" onTab={setTab} ready={false} screen="loading" mast={['Secret Santa', 'Reading']}>
        <p class="loading">Reading the draw</p>
      </Shell>
    )
  }

  if (snap.live) {
    return <LiveSanta snap={snap} repo={repo.current} onChange={setSnap} />
  }

  if (!snap.connected) {
    return (
      <Shell theme="santa" title="Secret Santa" tabs={TABS.filter((item) => item.id !== 'settings')} active={tab} home="game" onTab={setTab} ready screen="waiting" mast={['Secret Santa', 'Waiting for the bot']} actions={[{ label: 'Open my games in the bot', testId: 'open-bot', onClick: () => openBot('app') }]}>
        {tab === 'wishlist' ? (
          <Section title="Your wishlist">
            <Empty title="No game open" body="Open the app from your game in the bot chat." />
          </Section>
        ) : tab === 'group' ? (
          <Section title="The room">
            <Empty title="No names yet" body="The room appears when you open a game from the bot." />
          </Section>
        ) : tab === 'settings' ? (
          <Section title="Record" aside="Waiting">
            <p class="note">Nothing is stored until the bot connects the group.</p>
          </Section>
        ) : (
          <>
            <Seal mark="pp">
              <div class="kicker">Your recipient</div>
              <h2 class="name blank">—</h2>
              <div class="meta">
                <div><div class="k">Budget</div><div class="v">—</div></div>
                <div><div class="k">Exchange</div><div class="v">—</div></div>
                <div><div class="k">Left</div><div class="v">—</div></div>
              </div>
            </Seal>
            <Section title="How to open your game">
              <article class="row"><span class="row-idx">01</span><span class="row-title">Open the chat with @PartyPackSanta_bot</span><span /></article>
              <article class="row"><span class="row-idx">02</span><span class="row-title">Tap “Open in app” under your game, or send /app</span><span /></article>
              <article class="row"><span class="row-idx">03</span><span class="row-title">Your recipient and their wishlist appear here after the draw</span><span /></article>
            </Section>
          </>
        )}
      </Shell>
    )
  }

  const recipient = snap.recipient
  const actions = tab === 'game'
    ? [
        {
          label: recipient.giftBought ? 'Gift marked as bought' : 'Mark gift as bought',
          mark: 'check' as const,
          onClick: () => {
            const bought = !recipient.giftBought
            setSnap({ ...snap, recipient: { ...recipient, giftBought: bought } })
            void repo.current.setGiftBought(bought)
            haptic(bought ? 'success' : 'tap')
          },
        },
        {
          label: asking ? 'Close the note' : `Ask ${recipient.givenName} anonymously`,
          tone: 'ghost' as const,
          onClick: () => setAsking((open) => !open),
        },
      ]
    : tab === 'wishlist'
      ? [{ label: 'Add a line', onClick: () => addItem(snap, setSnap, repo.current) }]
      : []

  return (
    <Shell theme="santa" title="Secret Santa" tabs={TABS} active={tab} home="game" onTab={setTab} actions={actions} ready screen="draw" mast={[snap.studio, `${recipient.drawStatus === 'done' ? 'Drawn' : 'Open'} · ${snap.group.length} players`]}>
      {tab === 'game' ? (
        <>
          <Seal mark="pp">
            <div class="kicker">The draw is done — you are gifting</div>
            <h2 class="name" data-field="recipient">
              <span>{recipient.givenName}</span>
              <span>{recipient.familyName}</span>
            </h2>
            <StatsRow
              budget={formatMoney(recipient.budget, recipient.currency)}
              exchange={formatShort(parseISODate(recipient.exchangeDate))}
              time={recipient.exchangeTime}
            />
            {recipient.giftBought ? <span class="bought">Gift bought</span> : null}
          </Seal>
          <Section title="Her wishlist" aside={`${recipient.wishlist.length} items`}>
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
            <Section title="Anonymous note">
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
        <Section title="Your wishlist" aside={`${snap.myWishlist.length} items`}>
          {snap.myWishlist.length === 0 ? <Empty title="No lines yet" body="Add what you actually want." /> : null}
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
        <Section title="The room" aside={`${snap.group.length} players`}>
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
          <Section title="You">
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
          <Section title="Record" aside="This device">
            <p class="note">The draw itself will live on the bot. This shell keeps a local copy.</p>
          </Section>
          <Section title="Reset">
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
    <div class="meta">
      <div><div class="k">Budget</div><div class="v">{props.budget}</div></div>
      <div><div class="k">Exchange</div><div class="v">{props.exchange}</div></div>
      <div><div class="k">At</div><div class="v">{props.time}</div></div>
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
