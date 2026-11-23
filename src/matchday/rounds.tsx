/* Matchday+: the round recap, set like the back page of a newspaper. Data from GET /recap (matchday/api.py). */
import { useEffect, useState } from 'preact/hooks'
import { Empty, Section } from '../ui.tsx'

export interface RecapResult {
  id: string; home: string; away: string; kickoff: number; homeScore: number | null; awayScore: number | null; status: string
  liveHome: number | null; liveAway: number | null; picks: number; exact: string[]; exactCount: number
  predHome: number | null; predAway: number | null; points: number | null
}
export interface Recap {
  comp: string; season: number; round: number; label: string; longLabel: string
  league: { id: number; name: string; code: string } | null; scope: string
  complete: boolean; pending: number; played: number; total: number
  headline: string; subhead: string; results: RecapResult[]
  leaders: Array<{ name: string; pts: number; exact: number; rank: number; you: boolean }>
  table: Array<{ name: string; pts: number; rank: number; move: number; round: number; you: boolean }>
  you: { pts: number; exact: number; played: number; roundRank: number | null; rank: number | null; move: number } | null
  players: number; attribution: string; date: string
}
export interface RecapOut {
  recap: Recap; rounds: RoundChip[]; member: boolean; cardUrl: string | null; link: string; shareUrl: string; joinCode: string | null
}
export interface RoundChip { comp: string; round: number; label: string; complete: boolean; total?: number; finished?: number }

export interface RecapTarget { comp: string; round: number; code: string | null }

/** rc_PL11 / rc_UCL6_K7QX2M (startapp) or ?rc= on the button URL. */
export function parseRecap(raw: string | null | undefined): RecapTarget | null {
  const v = (raw ?? '').trim()
  const m = /^rc_(PL|UCL)(\d{1,2})(?:_([A-Z0-9]{6}))?$/.exec(v) ?? /^rc_([A-Z0-9]{2,3})-(\d{1,2})(?:_([A-Z0-9]{6}))?$/.exec(v)
  return m ? { comp: m[1], round: Number(m[2]), code: m[3] ?? null } : null
}

function moveMark(n: number) {
  if (n > 0) return <span class="move up">▲{n}</span>
  if (n < 0) return <span class="move down">▼{-n}</span>
  return <span class="move flat">—</span>
}

/** The PNG is public but sits behind the tunnel: fetch it with the skip header and show a blob. */
export function useCardImage(url: string | null): string | null {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    if (!url) { setSrc(null); return }
    let gone = false
    let made: string | null = null
    fetch(url, { headers: { 'ngrok-skip-browser-warning': '1' } })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => { if (b && !gone) { made = URL.createObjectURL(b); setSrc(made) } })
      .catch(() => undefined)
    return () => { gone = true; if (made) URL.revokeObjectURL(made) }
  }, [url])
  return src
}

export function RecapView(props: {
  out: RecapOut
  exact: number
  onRound: (comp: string, round: number) => void
}) {
  const { recap: r, rounds } = props.out
  const card = useCardImage(props.out.cardUrl)
  const done = r.results.filter((x) => x.homeScore !== null)
  return (
    <>
      {rounds.length > 1 ? (
        <div class="picks-wrap" role="group" aria-label="Round">
          {rounds.map((c) => (
            <button type="button" class="choice" key={`${c.comp}${c.round}`} data-round={`${c.comp}${c.round}`}
              aria-pressed={c.comp === r.comp && c.round === r.round} onClick={() => props.onRound(c.comp, c.round)}>
              {c.label}{c.complete ? '' : ' ·'}
            </button>
          ))}
        </div>
      ) : null}

      <section class="block paper-page" data-recap={`${r.comp}${r.round}`}>
        <div class="paper-mast">
          <span>The Matchday</span>
          <span>{r.date}</span>
        </div>
        <div class="kicker">{r.longLabel} · {r.scope}</div>
        <h2 class="paper-head" data-field="headline">{r.headline}</h2>
        {r.subhead ? <p class="paper-sub">{r.subhead}</p> : null}
        <p class="paper-meta">
          {r.complete ? `Full time · ${r.played} matches` : `In progress · ${r.played} of ${r.total} played`}
          {r.players ? ` · ${r.players} ${r.players === 1 ? 'player' : 'players'}` : ''}
        </p>
      </section>

      {r.you ? (
        <div class="lock" data-field="you">
          <span>Your round{r.you.roundRank ? ` · ${r.you.roundRank}${ord(r.you.roundRank)} of ${r.players}` : ''}{r.you.rank ? ` · season #${r.you.rank}` : ''}</span>
          <b>{r.you.pts} pts{r.you.exact ? ` · ${r.you.exact} exact` : ''}</b>
        </div>
      ) : null}

      <Section title="Round leaders" aside={r.leaders.length ? `exact = ${props.exact}` : ''}>
        {r.leaders.length ? r.leaders.map((l, i) => (
          <article class={l.you ? 'standing is-you' : 'standing'} key={`${i}-${l.name}`}>
            <span class="rk">{l.rank}</span>
            <span class="move flat">{l.exact ? `${l.exact}◎` : '—'}</span>
            <span class="who"><span>{l.you ? `${l.name} (you)` : l.name}</span></span>
            <span class="pt">{l.pts}</span>
          </article>
        )) : <Empty title="No picks this round" body="Nobody here called this round. Make picks for the next one — they lock at kick-off." />}
      </Section>

      <Section title="Results" aside={`${done.length}/${r.total}`}>
        {r.results.map((x, i) => {
          const live = x.homeScore === null && x.liveHome !== null
          const score = x.homeScore !== null ? `${x.homeScore}–${x.awayScore}` : live ? `${x.liveHome}–${x.liveAway}` : 'v'
          const mine = x.predHome !== null ? `You said ${x.predHome}–${x.predAway}` : 'No pick'
          const who = x.exactCount ? ` · exact: ${x.exact.join(', ')}${x.exactCount > x.exact.length ? ' +' : ''}` : ''
          return (
            <article class="row" key={x.id} data-result={x.id}>
              <span class="row-idx">{x.points === props.exact ? '◎' : x.points ? '✓' : x.points === 0 ? '×' : String(i + 1).padStart(2, '0')}</span>
              <span class="row-title">{x.home} <b class="mono">{score}</b> {x.away}
                <span class="row-sub">{live ? `LIVE · delayed · ` : ''}{mine}{who}</span></span>
              <span class="row-val">{x.points !== null ? `+${x.points}` : ''}</span>
            </article>
          )
        })}
      </Section>

      {r.table.length ? (
        <Section title={r.league ? 'The league table' : 'The season table'} aside="after this round">
          {r.table.map((t, i) => (
            <article class={t.you ? 'standing is-you' : 'standing'} key={`${i}-${t.name}`}>
              <span class="rk">{t.rank}</span>
              {moveMark(t.move)}
              <span class="who"><span>{t.you ? `${t.name} (you)` : t.name}</span></span>
              <span class="pt">{t.pts}</span>
            </article>
          ))}
        </Section>
      ) : null}

      <Section title="The card" aside="1080 × 1350">
        {card ? <img class="recap-card" src={card} alt={`${r.longLabel} recap card`} data-field="card" /> : <p class="note">The card is being set…</p>}
        <p class="note">Share sends a link that opens this recap. “Send to my chat” puts the picture in your chat with the bot, so you can forward it to a group or WhatsApp.</p>
      </Section>
      <p class="note attrib" data-field="attribution">{r.attribution}. Scores are slightly delayed. No betting, no odds.</p>
    </>
  )
}

function ord(n: number): string {
  const t = n % 100
  if (t >= 11 && t <= 13) return 'th'
  return ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
}
