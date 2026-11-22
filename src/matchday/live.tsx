import { useEffect, useState } from 'preact/hooks'
import { formatRemain, pad2 } from '../format.ts'
import { getWebApp, haptic, inTelegram } from '../telegram.ts'
import { Empty, Pitch, Section, Shell } from '../ui.tsx'
import { botLink } from './payload.ts'
import type { LiveFixture, LiveMatchday, MatchdaySnapshot } from './types.ts'

const TABS = [
  { id: 'table', label: 'Table', icon: 'bars' as const },
  { id: 'picks', label: 'Picks', icon: 'ledger' as const },
  { id: 'league', label: 'League', icon: 'people' as const },
  { id: 'settings', label: 'Settings', icon: 'gear' as const },
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

export function kickoffLabel(ms: number, zone: string, label: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(ms))
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
    return `${get('weekday')} ${get('day')} ${get('month')} · ${get('hour')}:${get('minute')} ${label}`
  } catch {
    return new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
  }
}

function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return 'th'
  return ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2)
  return letters.toUpperCase()
}

function issued(live: LiveMatchday): string {
  if (!live.issuedAt) return 'From the bot'
  return `As of ${kickoffLabel(live.issuedAt * 1000, live.timeZone, live.zoneLabel)}`
}

function predicted(f: LiveFixture): boolean {
  return f.predHome !== null && f.predAway !== null
}

export function LiveMatchdayApp(props: { snap: MatchdaySnapshot }) {
  const live = props.snap.live as LiveMatchday
  const [tab, setTab] = useState('table')
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const open = live.fixtures.filter((f) => f.kickoff > now)
  const todo = open.filter((f) => !predicted(f))
  const made = open.length - todo.length
  const next = todo[0] ?? open[0] ?? null
  const isLeague = live.table.code !== ''
  const rank = live.table.rank
  const players = live.table.players
  const invite = isLeague ? botLink(`lg_${live.table.code}${live.viewerId ? `_${live.viewerId}` : ''}`) : ''

  function copyInvite() {
    const text = `Join my football prediction league "${live.table.name}" on Matchday Picks: ${invite}`
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      haptic('success')
      window.setTimeout(() => setCopied(false), 1600)
    }).catch(() => setCopied(false))
  }

  const actions = tab === 'table' || tab === 'picks'
    ? todo.length > 0
      ? [{ label: `Predict ${todo[0].home} v ${todo[0].away}`, aside: `${made}/${open.length}`, testId: 'predict', onClick: () => openBot(`pr_${todo[0].id}`) }]
      : [{ label: open.length ? 'All picks in — open the bot' : 'Open the bot', aside: open.length ? `${made}/${open.length}` : undefined, testId: 'bot', onClick: () => openBot('predict') }]
    : tab === 'league'
      ? isLeague
        ? [{ label: copied ? 'Invite copied' : 'Copy the invite link', testId: 'invite', onClick: copyInvite }]
        : [
            { label: 'Create a league in the bot', testId: 'create', onClick: () => openBot('league') },
            { label: 'Invite friends', tone: 'ghost' as const, testId: 'invite-bot', onClick: () => openBot('invite') },
          ]
      : [{ label: 'Change settings in the bot', tone: 'ghost' as const, testId: 'settings', onClick: () => openBot('settings') }]

  const mast: [string, string] = [live.table.name, live.round || `${live.globalPlayers} players worldwide`]

  return (
    <Shell theme="matchday" title="Matchday" tabs={TABS} active={tab} home="table" onTab={setTab} actions={actions} ready screen="live" mast={mast}>
      {tab === 'table' ? (
        <>
          <section class="block hero">
            <Pitch />
            <div class="kicker">{isLeague ? 'Your position' : 'Worldwide position'}</div>
            <div class="position">
              {rank ? (
                <p class="hero-num" data-field="position">{rank}<span class="ord">{ordinal(rank)}</span></p>
              ) : (
                <p class="hero-blank" data-field="position">—</p>
              )}
              <div class="ctx">
                {rank ? `of ${players} ${isLeague ? 'friends' : 'players'}` : 'not on the board yet'}<br />
                <span class="move flat" data-field="points">{live.points} pts · {live.exact} exact</span>
              </div>
            </div>
          </section>
          <div class="lock">
            <span>{next ? `${todo.length ? "Next pick locks" : "Next kick-off"} · ${next.home} v ${next.away}` : 'No open fixtures'}</span>
            <b data-field="lock">{next ? formatRemain(next.kickoff - now).split(':').join(' : ') : '-- : -- : --'}</b>
          </div>
          <Section title="The table" aside={`Pts · exact score = ${live.exactPoints}`}>
            {live.table.rows.length ? (
              <>
                <div class="tbl-head"><span>#</span><span /><span>Player</span><span class="r">Pts</span></div>
                {live.table.rows.map((row, index) => (
                  <article class={row.isYou ? 'standing is-you' : 'standing'} key={`${index}-${row.name}`}>
                    <span class="rk">{row.rank || index + 1}</span>
                    <span class="move flat">—</span>
                    <span class="who"><span class="av">{initials(row.name)}</span><span>{row.isYou ? `${row.name} (you)` : row.name}</span></span>
                    <span class="pt">{row.points}</span>
                  </article>
                ))}
                {players > live.table.rows.length ? <p class="note">{players} players in total · the full table is in the bot (/table)</p> : null}
              </>
            ) : (
              <Empty title="No table yet" body="Make your first prediction and you are on the board." />
            )}
          </Section>
          {live.results.length ? (
            <Section title="Your last results" aside={`${live.results.reduce((sum, r) => sum + r.points, 0)} pts`}>
              {live.results.map((r, index) => (
                <article class="row" key={`${index}-${r.home}`}>
                  <span class="row-idx">{r.points === live.exactPoints ? '◎' : r.points > 0 ? '✓' : '×'}</span>
                  <span class="row-title">{r.home} {r.homeScore}–{r.awayScore} {r.away}<span class="row-sub">You said {r.predHome}–{r.predAway}</span></span>
                  <span class="row-val">+{r.points}</span>
                </article>
              ))}
            </Section>
          ) : null}
          <p class="note stamp">{issued(live)} · open from the bot again for updates</p>
        </>
      ) : null}

      {tab === 'picks' ? (
        <Section title="Open fixtures" aside={`${live.round ? live.round + ' · ' : ''}${made}/${open.length} in`}>
          <p class="note">Correct result {live.resultPoints} pt. Exact score {live.exactPoints} pts. Times in {live.zoneLabel}. Each pick locks at its kick-off; tap a match to call it in the bot.</p>
          {live.fixtures.length === 0 ? <Empty title="No fixtures yet" body="The bot refreshes the schedule automatically." /> : null}
          {live.fixtures.map((f, index) => {
            const locked = f.kickoff <= now
            const done = predicted(f)
            return (
              <article class={locked ? 'fixture is-locked' : 'fixture'} key={f.id} data-fixture={f.id}>
                <div class="fixture-top">
                  <h3><span class="row-idx">{pad2(index + 1)}</span>{f.home}</h3>
                  <span class="when">{f.comp === 'UCL' ? 'UCL · ' : ''}{kickoffLabel(f.kickoff, live.timeZone, live.zoneLabel)}</span>
                </div>
                <div class="away">{f.away}</div>
                <div class="picks">
                  <span class="score live-score" data-field="pick">{done ? `${f.predHome} : ${f.predAway}` : '– : –'}</span>
                  <button type="button" class="result live-go" aria-pressed={done} disabled={locked} onClick={() => openBot(`pr_${f.id}`)}>
                    {locked ? 'Locked' : done ? 'Change ↗' : 'Predict ↗'}
                  </button>
                </div>
              </article>
            )
          })}
        </Section>
      ) : null}

      {tab === 'league' ? (
        <>
          <Section title={live.table.name} plain aside={isLeague ? live.table.code : 'Worldwide'}>
            <div class="kicker">{isLeague ? 'FRIENDS LEAGUE' : 'WORLDWIDE TABLE'}</div>
            <p class="hero-num sm">{isLeague ? live.table.code : live.globalPlayers}</p>
            <p class="note">{isLeague ? `${players} players · friends join with the code or the link` : 'players on the worldwide table'}</p>
          </Section>
          <Section title="Scoring">
            <article class="row"><span class="row-idx">01</span><span class="row-title">Correct result</span><span class="row-val">{live.resultPoints}</span></article>
            <article class="row"><span class="row-idx">02</span><span class="row-title">Exact score</span><span class="row-val">{live.exactPoints}</span></article>
          </Section>
          <Section title="Your leagues" aside={`${live.leagues.length}`}>
            {live.leagues.length ? live.leagues.map((l, index) => (
              <article class={l.code === live.table.code ? 'row is-you' : 'row'} key={l.code}>
                <span class="row-idx">{pad2(index + 1)}</span>
                <span class="row-title">{l.name}</span>
                <span class="row-val">{l.code}</span>
              </article>
            )) : <Empty title="No private league yet" body="Create one in the bot, or add the bot to a group chat and send /league." />}
            <article class="row">
              <span class="row-idx">WW</span>
              <span class="row-title">Worldwide</span>
              <span class="row-val">{live.globalRank ? `#${live.globalRank}` : '—'}</span>
            </article>
          </Section>
        </>
      ) : null}

      {tab === 'settings' ? (
        <>
          <Section title="You">
            <div class="field"><span class="k">Name on the table</span><span class="row-val">{live.name}</span></div>
            <div class="field"><span class="k">Time zone</span><span class="row-val">{live.zoneLabel} · {live.timeZone}</span></div>
            <div class="field">
              <span class="k">Remind before kick-off</span>
              <button type="button" class="choice" aria-pressed={live.remind} onClick={() => openBot('settings')}>{live.remind ? 'ON' : 'OFF'}</button>
            </div>
          </Section>
          <Section title="Record" aside="In the bot">
            <p class="note">Your predictions and the tables live in the bot. This app shows a snapshot from the moment the bot sent the button.</p>
            <p class="note">A free game for fun: no betting, no odds, no prizes. News and kick-off times: @matchdayhq.</p>
          </Section>
        </>
      ) : null}
    </Shell>
  )
}
