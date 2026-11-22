import { useState } from 'preact/hooks'
import { daysBetween, formatShort, pad2, parseISODate } from '../format.ts'
import { getWebApp, haptic, inTelegram } from '../telegram.ts'
import { Empty, Seal, Section, Shell } from '../ui.tsx'
import { botLink } from './payload.ts'
import type { LiveGame, SantaRepository, SantaSnapshot } from './types.ts'

const TABS = [
  { id: 'game', label: 'Game', icon: 'gift' as const },
  { id: 'wishlist', label: 'Wishlist', icon: 'list' as const },
  { id: 'group', label: 'Group', icon: 'people' as const },
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
  const longest = Math.max(...name.split(/\s+/).map((part) => part.length))
  if (longest > 11) return 'name xs'
  if (longest > 8) return 'name sm'
  return 'name'
}

/** "Aisha Rahman" -> two lines, the family name in gold italic. */
export function NameLines(props: { name: string }) {
  const parts = props.name.trim().split(/\s+/)
  const first = parts[0] ?? props.name
  const rest = parts.slice(1).join(' ')
  return <>{<span>{first}</span>}{rest ? <span>{rest}</span> : null}</>
}

function dateLabel(iso: string | null): string {
  return iso ? formatShort(parseISODate(iso)) : 'TBD'
}

function daysLeft(iso: string | null): string {
  if (!iso) return '—'
  const days = daysBetween(new Date(), parseISODate(iso))
  if (days < 0) return 'Done'
  if (days === 0) return 'Today'
  return days === 1 ? '1 day' : `${days} days`
}

function issued(game: LiveGame): string {
  if (!game.issuedAt) return 'From the bot'
  const date = new Date(game.issuedAt * 1000)
  return `As of ${formatShort(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
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
            label: bought ? 'Gift marked as bought' : 'Mark gift as bought',
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
            label: `Ask ${recipient.name.split(' ')[0]} anonymously`,
            tone: 'ghost' as const,
            testId: 'ask',
            onClick: () => openBot(`ask_${game.gameId}`),
          },
        ]
      : game.playing
        ? [{ label: 'Edit my wishlist in the bot', testId: 'edit', onClick: () => openBot(`wl_${game.gameId}`) }]
        : [{ label: 'Open the game in the bot', testId: 'bot', onClick: () => openBot('app') }]
    : tab === 'wishlist' && game.playing
      ? [{ label: game.wishlist ? 'Edit it in the bot' : 'Write it in the bot', testId: 'edit', onClick: () => openBot(`wl_${game.gameId}`) }]
      : tab === 'group' && drawn && game.playing
        ? [{ label: 'Message my Santa', tone: 'ghost' as const, testId: 'santa', onClick: () => openBot(`santa_${game.gameId}`) }]
        : []

  const extra = game.playerCount - game.players.length

  const mast: [string, string] = [game.name, `${drawn ? 'Drawn' : 'Open'} · ${game.playerCount} ${game.playerCount === 1 ? 'player' : 'players'}`]

  return (
    <Shell theme="santa" title="Secret Santa" tabs={TABS} active={tab} home="game" onTab={setTab} actions={actions} ready screen={drawn ? 'draw' : 'open'} mast={mast}>
      {tab === 'game' ? (
        <>
          <Seal mark="pp">
            {drawn && recipient ? (
              <>
                <div class="kicker">The draw is done — you are gifting</div>
                <h2 class={nameClass(recipient.name)} data-field="recipient"><NameLines name={recipient.name} /></h2>
              </>
            ) : (
              <>
                <div class="kicker">Your recipient</div>
                <h2 class="name pending">{!game.playing ? 'You organize' : drawn ? 'Drawn' : 'Not drawn yet'}</h2>
              </>
            )}
            <div class="meta">
              <div><div class="k">Budget</div><div class="v" data-field="budget">{game.budget ?? '—'}</div></div>
              <div><div class="k">Exchange</div><div class="v">{dateLabel(game.exchangeDate)}</div></div>
              <div><div class="k">Left</div><div class="v">{daysLeft(game.exchangeDate)}</div></div>
            </div>
            {bought && drawn ? <span class="bought">Gift bought</span> : null}
          </Seal>
          {drawn && recipient ? (
            <Section title="Their wishlist" aside={`${wishLines(recipient.wishlist).length} lines`}>
              {recipient.wishlist
                ? <WishRows text={recipient.wishlist} />
                : <Empty title="No list yet" body="The bot tells you when they write one." />}
            </Section>
          ) : (
            <p class="note">
              {!game.playing
                ? 'You are organizing, not playing.'
                : drawn
                  ? 'Names are drawn. Ask the bot for your game again to see who you got.'
                  : 'Names are not drawn yet. The bot messages you the moment they are.'}
            </p>
          )}
          <p class="note stamp">{issued(game)} · open from the bot again for updates</p>
        </>
      ) : null}

      {tab === 'wishlist' ? (
        <Section title="Your wishlist" aside={game.playing ? `${wishLines(game.wishlist).length} lines` : 'Not playing'}>
          {!game.playing
            ? <Empty title="Not playing" body="You organize this game without a list." />
            : game.wishlist
              ? <WishRows text={game.wishlist} />
              : <Empty title="No lines yet" body="Write what you actually want." />}
          {game.playing ? <p class="note">You edit it in the chat with the bot: one message, and your Santa sees the new list.</p> : null}
        </Section>
      ) : null}

      {tab === 'group' ? (
        <Section title="The room" aside={`${game.playerCount} players`}>
          <p class="note">{drawn ? 'Only you see who you are gifting. The organizer does not see the pairs.' : 'People join with the invite link from the bot.'}</p>
          {game.players.map((name, index) => (
            <article class="row" key={`${index}-${name}`}>
              <span class="row-idx">{pad2(index + 1)}</span>
              <span class="row-title">{name}</span>
              <span />
            </article>
          ))}
          {extra > 0 ? <p class="note">+{extra} more</p> : null}
        </Section>
      ) : null}
    </Shell>
  )
}
