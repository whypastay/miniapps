import { useState } from 'preact/hooks'
import { daysBetween, formatShort, pad2, parseISODate } from '../format.ts'
import { getWebApp, haptic, inTelegram } from '../telegram.ts'
import { Empty, Section, Shell } from '../ui.tsx'
import { botLink } from './payload.ts'
import type { LiveGame, SantaRepository, SantaSnapshot } from './types.ts'

const TABS = [
  { id: 'game', label: 'Game' },
  { id: 'wishlist', label: 'Wishlist' },
  { id: 'group', label: 'Group' },
]

/** Open the bot chat with a start parameter, then close the app. */
export function openBot(start?: string): void {
  const url = botLink(start)
  const tg = getWebApp()
  if (inTelegram() && tg?.openTelegramLink) {
    try {
      tg.openTelegramLink(url)
      window.setTimeout(() => { try { tg.close() } catch { /* already closed */ } }, 300)
      return
    } catch { /* fall through */ }
  }
  window.open(url, '_blank', 'noopener')
}

/** Free-text wishlist -> display lines. */
export function wishLines(text: string | null): string[] {
  if (!text) return []
  const lines = text.split(/\r?\n/).map((line) => line.replace(/^[\s\-•*·\d.)]+/, '').trim()).filter(Boolean)
  if (lines.length > 1) return lines.slice(0, 20)
  const parts = text.split(/[,;]/).map((part) => part.trim()).filter(Boolean)
  if (parts.length >= 2 && parts.length <= 10 && parts.every((part) => part.length >= 2)) return parts
  return [text.trim()]
}

function nameClass(name: string): string {
  if (name.length > 10) return 'name xs'
  if (name.length > 6) return 'name sm'
  return 'name'
}

function dateLabel(iso: string | null): string {
  return iso ? formatShort(parseISODate(iso)) : 'TBD'
}

function daysLeft(iso: string | null): string {
  if (!iso) return '—'
  const days = daysBetween(new Date(), parseISODate(iso))
  if (days < 0) return 'DONE'
  if (days === 0) return 'TODAY'
  return String(days)
}

function issued(game: LiveGame): string {
  if (!game.issuedAt) return 'FROM THE BOT'
  const date = new Date(game.issuedAt * 1000)
  return `AS OF ${formatShort(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function WishRows(props: { text: string | null }) {
  return (
    <>
      {wishLines(props.text).map((line, index) => (
        <article class="row" key={`${index}-${line}`}>
          <span class="row-idx">{pad2(index + 1)}</span>
          <span class="row-title wish-line">{line}</span>
          <span />
        </article>
      ))}
    </>
  )
}

export function LiveSanta(props: { snap: SantaSnapshot; repo: SantaRepository; onChange: (next: SantaSnapshot) => void }) {
  const { snap, repo, onChange } = props
  const game = snap.live as LiveGame
  const [tab, setTab] = useState('game')
  const recipient = game.recipient
  const drawn = game.status === 'drawn'
  const bought = snap.recipient.giftBought

  const actions = tab === 'game'
    ? drawn && recipient
      ? [
          {
            label: bought ? 'MARKED BOUGHT' : 'MARK GIFT AS BOUGHT',
            mark: 'check' as const,
            testId: 'bought',
            onClick: () => {
              const next = !bought
              onChange({ ...snap, recipient: { ...snap.recipient, giftBought: next } })
              void repo.setGiftBought(next)
              haptic(next ? 'success' : 'tap')
            },
          },
          {
            label: `ASK ${recipient.name.toUpperCase()} ANONYMOUSLY`,
            tone: 'ghost' as const,
            testId: 'ask',
            onClick: () => openBot(`ask_${game.gameId}`),
          },
        ]
      : game.playing
        ? [{ label: 'EDIT MY WISHLIST IN THE BOT', testId: 'edit', onClick: () => openBot(`wl_${game.gameId}`) }]
        : [{ label: 'OPEN THE GAME IN THE BOT', testId: 'bot', onClick: () => openBot('app') }]
    : tab === 'wishlist' && game.playing
      ? [{ label: game.wishlist ? 'EDIT IN THE BOT' : 'WRITE IT IN THE BOT', testId: 'edit', onClick: () => openBot(`wl_${game.gameId}`) }]
      : tab === 'group' && drawn && game.playing
        ? [{ label: 'MESSAGE MY SANTA', tone: 'ghost' as const, testId: 'santa', onClick: () => openBot(`santa_${game.gameId}`) }]
        : []

  const extra = game.playerCount - game.players.length

  return (
    <Shell theme="santa" title="Secret Santa" tabs={TABS} active={tab} home="game" onTab={setTab} actions={actions} ready screen={drawn ? 'draw' : 'open'}>
      {tab === 'game' ? (
        <>
          <Section index="01" title={game.name.toUpperCase()} aside={`${game.playerCount} PLAYERS · ${drawn ? 'DRAWN' : 'OPEN'}`}>
            {drawn && recipient ? (
              <>
                <div class="kicker">You are gifting</div>
                <h2 class={nameClass(recipient.name)} data-field="recipient"><span>{recipient.name}</span></h2>
              </>
            ) : (
              <>
                <div class="kicker">Your recipient</div>
                <p class="hero-blank">—</p>
                <p class="note">
                  {!game.playing
                    ? 'You are organizing, not playing.'
                    : drawn
                      ? 'Names are drawn. Ask the bot for your game again to see who you got.'
                      : 'Names are not drawn yet. The bot messages you the moment they are.'}
                </p>
              </>
            )}
            <div class="stats" data-cols="3">
              <div class="stat"><div class="stat-label">Budget</div><div class="stat-value date" data-field="budget">{game.budget ?? '—'}</div></div>
              <div class="stat"><div class="stat-label">Exchange</div><div class="stat-value date">{dateLabel(game.exchangeDate)}</div></div>
              <div class="stat"><div class="stat-label">Days left</div><div class="stat-value">{daysLeft(game.exchangeDate)}</div></div>
            </div>
          </Section>
          {drawn && recipient ? (
            <Section index="02" title="THEIR WISHLIST" aside={bought ? 'GIFT BOUGHT' : `${wishLines(recipient.wishlist).length} LINES`}>
              {recipient.wishlist
                ? <WishRows text={recipient.wishlist} />
                : <Empty title="NO LIST YET" body="THE BOT TELLS YOU WHEN THEY WRITE ONE." />}
            </Section>
          ) : null}
          <p class="note stamp">{issued(game)} · OPEN FROM THE BOT AGAIN FOR UPDATES</p>
        </>
      ) : null}

      {tab === 'wishlist' ? (
        <Section index="01" title="YOUR LIST" aside={game.playing ? `${wishLines(game.wishlist).length} LINES` : 'NOT PLAYING'}>
          {!game.playing
            ? <Empty title="NOT PLAYING" body="YOU ORGANIZE THIS GAME WITHOUT A LIST." />
            : game.wishlist
              ? <WishRows text={game.wishlist} />
              : <Empty title="NO LINES" body="WRITE WHAT YOU ACTUALLY WANT." />}
          {game.playing ? <p class="note">You edit it in the chat with the bot: one message, and your Santa sees the new list.</p> : null}
        </Section>
      ) : null}

      {tab === 'group' ? (
        <Section index="01" title="THE ROOM" aside={`${game.playerCount} PLAYERS`}>
          <p class="note">{drawn ? 'Only you see who you are gifting. The organizer does not see the pairs.' : 'People join with the invite link from the bot.'}</p>
          {game.players.map((name, index) => (
            <article class="row" key={`${index}-${name}`}>
              <span class="row-idx">{pad2(index + 1)}</span>
              <span class="row-title">{name}</span>
              <span />
            </article>
          ))}
          {extra > 0 ? <p class="note">+{extra} MORE</p> : null}
        </Section>
      ) : null}
    </Shell>
  )
}
