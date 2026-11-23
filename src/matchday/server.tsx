import type { ComponentChildren } from 'preact'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { formatRemain, pad2 } from '../format.ts'
import { Api, ApiError, copyText, openLink, requestWriteAccess, startParam } from '../api.ts'
import { haptic } from '../telegram.ts'
import { GuideScope, MATCHDAY_GUIDE, MATCHDAY_PLUS_GUIDE } from '../guide.tsx'
import { Empty, Pitch, Section, Shell } from '../ui.tsx'
import { kickoffLabel } from './live.tsx'
import { parseRecap, RecapView, type RecapOut, type RecapTarget, type RoundChip } from './rounds.tsx'

/* ---------- API shapes (matchday/api.py) ---------- */
interface Fx { id: string; kickoff: number; home: string; away: string; comp: string; round: string | null; predHome: number | null; predAway: number | null; status?: string }
interface LiveFx extends Fx { liveHome: number | null; liveAway: number | null; provisional: number | null }
interface Res { home: string; away: string; homeScore: number; awayScore: number; predHome: number; predAway: number; points: number; kickoff: number }
interface Row { name: string; pts: number; exact: number; rank: number | null; you: boolean }
interface League { id: number; name: string; code: string; members: number; owner: boolean; group: boolean; inviteLink: string; shareUrl: string; recap?: boolean }
interface State {
  me: { id: number; name: string; tz: string; zoneLabel: string; tzSet: boolean; remind: boolean; results: boolean; referrals: number; refLink: string; shareUrl: string; onboarded?: boolean; plusOnboarded?: boolean }
  gate?: import('../guide.tsx').GateInfo
  scoring: { result: number; exact: number }
  remindHours: number
  global: { rank: number | null; players: number; pts: number; exact: number }
  leagues: League[]
  table: { id: number; name: string; code: string; rank: number | null; players: number; rows: Row[] }
  fixtures: Fx[]
  live?: LiveFx[]
  rounds?: RoundChip[]
  data?: { source: string; attribution: string; delayed: boolean; auto: boolean; updated: string }
  results: Res[]
  round: string
  zones: Array<{ key: string; zone: string; title: string }>
  serverTime: number
  saved?: { fixture: string; home: number; away: number; quip: string }
  askRemind?: boolean
}

const TABS = [
  { id: 'table', label: 'Table', icon: 'bars' as const },
  { id: 'picks', label: 'Picks', icon: 'ledger' as const },
  { id: 'rounds', label: 'Rounds', icon: 'paper' as const },
  { id: 'league', label: 'League', icon: 'people' as const },
  { id: 'settings', label: 'Settings', icon: 'gear' as const },
]

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

function launchRecap(): RecapTarget | null {
  return parseRecap(startParam()) ?? parseRecap(new URLSearchParams(location.search).get('rc'))
}

const LIVE_LABEL: Record<string, string> = { IN_PLAY: 'LIVE', LIVE: 'LIVE', PAUSED: 'HT', SUSPENDED: 'STOPPED' }

function launchJoin(): string | null {
  const sp = startParam() ?? ''
  const q = new URLSearchParams(location.search)
  if (sp.startsWith('lg_')) return sp.slice(3)
  return q.get('join')
}

type Draft = Record<string, { h: number; a: number }>

export function ServerMatchday(props: { api: Api; onOffline?: () => void }) {
  const { api } = props
  const [st, setSt] = useState<State | null>(null)
  const [league, setLeague] = useState<number | null>(() => {
    const lg = Number(new URLSearchParams(location.search).get('lg') ?? '')
    return Number.isInteger(lg) && lg > 0 ? lg : null
  })
  const [tab, setTab] = useState(() => (launchRecap() ? 'rounds' : 'table'))
  const [rc, setRc] = useState<RecapOut | null>(null)
  const [rcWant, setRcWant] = useState<RecapTarget | null>(() => launchRecap())
  const [rcErr, setRcErr] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [fatal, setFatal] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>({})
  const [now, setNow] = useState(() => Date.now())
  const [askRemind, setAskRemind] = useState(false)
  const [form, setForm] = useState<null | 'create' | 'join'>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [confirm, setConfirm] = useState<null | 'leave' | 'delete'>(null)

  const say = useCallback((text: string | null) => {
    setToast(text)
    if (text) window.setTimeout(() => setToast((cur) => (cur === text ? null : cur)), 4000)
  }, [])

  const q = (lg: number | null) => (lg ? `?league=${lg}` : '')

  async function run<T>(fn: () => Promise<T>, ok?: string): Promise<T | null> {
    setBusy(true)
    try {
      const out = await fn()
      if (ok) { say(ok); haptic('success') }
      return out
    } catch (err) {
      say(err instanceof ApiError ? err.message : 'Something went wrong. Try again.')
      haptic('warning')
      return null
    } finally {
      setBusy(false)
    }
  }

  function apply(next: State | null) {
    if (!next) return
    setSt(next)
    setLeague(next.table.id || null)
  }

  useEffect(() => {
    let cancel = false
    const join = launchJoin()
    if (join) { setCode(join); setForm('join'); setTab('league') }
    void api.get<State>(`/state${q(league)}`).then((next) => { if (!cancel) apply(next) }).catch((err) => {
      if (cancel) return
      const down = !(err instanceof ApiError) || err.status === 0 || err.status >= 500
      if (down && props.onOffline && new URLSearchParams(location.search).get('d')) { props.onOffline(); return }
      setFatal(err instanceof ApiError ? err.message : 'The bot did not answer.')
    })
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => { cancel = true; window.clearInterval(timer) }
  }, [])

  // Matchday+: load the recap for the chosen round and scope (a shared link can carry a league code).
  const scopeId = st ? (st.table.code ? st.table.id : 0) : -1
  useEffect(() => {
    if (tab !== 'rounds' || !st) return
    let cancel = false
    const p = new URLSearchParams()
    if (rcWant) { p.set('comp', rcWant.comp); p.set('round', String(rcWant.round)) }
    if (rcWant?.code && !st.leagues.some((l) => l.code === rcWant.code)) p.set('code', rcWant.code)
    else if (rcWant?.code) p.set('league', String(st.leagues.find((l) => l.code === rcWant.code)!.id))
    else if (scopeId > 0) p.set('league', String(scopeId))
    setRcErr(null)
    api.get<RecapOut>(`/recap?${p.toString()}`).then((out) => { if (!cancel) setRc(out) }).catch((err) => {
      if (!cancel) { setRc(null); setRcErr(err instanceof ApiError ? err.message : 'The recap did not load. Try again.') }
    })
    return () => { cancel = true }
  }, [tab, rcWant?.comp, rcWant?.round, rcWant?.code, scopeId, Boolean(st)])

  const invited = useRef(launchJoin())
  const recapLaunch = useRef(launchRecap())
  const hint = invited.current
    ? 'You were invited to a league. Join below — the short guide is under ? if you want it later.'
    : recapLaunch.current
      ? 'Someone shared a round recap with you. It is below — the short guide is under ? if you want it later.'
      : null
  // Rounds (Matchday+) has its own intro and help, remembered separately; the original intro is unchanged.
  const guide = (node: ComponentChildren, ready = true) => tab === 'rounds' ? (
    <GuideScope key="plus" theme="matchday" spec={MATCHDAY_PLUS_GUIDE} api={api} ready={ready && Boolean(st || fatal)} onboarded={Boolean(st?.me.plusOnboarded)}
      hint={hint} doneBody={{ done: true, mode: 'plus' }} gate={st?.gate} publicPage={Boolean(recapLaunch.current)}>
      {node}
    </GuideScope>
  ) : (
    <GuideScope key="main" theme="matchday" spec={MATCHDAY_GUIDE} api={api} ready={ready && Boolean(st || fatal)} onboarded={Boolean(st?.me.onboarded)} hint={hint} gate={st?.gate}>
      {node}
    </GuideScope>
  )

  if (fatal) {
    return guide((
      <Shell theme="matchday" title="Matchday" tabs={[]} active="x" home="x" onTab={() => undefined} ready screen="error" mast={['Matchday', 'Offline']}
        actions={[{ label: 'Try again', testId: 'retry', onClick: () => location.reload() }]}>
        <Section title="The bot did not answer"><p class="note">{fatal}</p></Section>
      </Shell>
    ))
  }
  if (!st) {
    return guide((
      <Shell theme="matchday" title="Matchday" tabs={TABS} active={tab} home="table" onTab={setTab} ready={false} screen="loading" mast={['Matchday', 'Reading']}>
        <p class="loading">Reading the league</p>
      </Shell>
    ), false)
  }

  const s = st
  const zone = s.me.tz
  const fixtures = s.fixtures.map((f) => ({ ...f, ms: f.kickoff * 1000 }))
  const open = fixtures.filter((f) => f.ms > now)
  const todo = open.filter((f) => f.predHome === null)
  const next = todo[0] ?? open[0] ?? null
  const isLeague = s.table.code !== ''
  const current = isLeague ? s.leagues.find((l) => l.id === s.table.id) ?? null : null
  const dirty = Object.keys(draft).filter((id) => {
    const f = fixtures.find((x) => x.id === id)
    return f && f.ms > now && (f.predHome !== draft[id].h || f.predAway !== draft[id].a)
  })

  function liveOf(id: string): string | null {
    const l = (s.live ?? []).find((x) => x.id === id)
    return l && l.liveHome !== null ? `${LIVE_LABEL[l.status ?? ''] ?? 'LIVE'} ${l.liveHome}–${l.liveAway}` : null
  }

  function value(f: Fx): { h: number; a: number } | null {
    return draft[f.id] ?? (f.predHome !== null && f.predAway !== null ? { h: f.predHome, a: f.predAway } : null)
  }

  function step(f: Fx, side: 'h' | 'a', delta: number) {
    const cur = value(f) ?? { h: 0, a: 0 }
    const v = Math.max(0, Math.min(20, cur[side] + delta))
    setDraft({ ...draft, [f.id]: { ...cur, [side]: v } })
    haptic('select')
  }

  async function savePicks() {
    let last: State | null = null
    let saved = 0
    setBusy(true)
    try {
      for (const id of dirty) {
        const d = draft[id]
        try {
          last = await api.post<State>(`/predict${q(league)}`, { fixture: id, home: d.h, away: d.a })
          saved += 1
          if (last.askRemind) setAskRemind(true)
        } catch (err) {
          say(err instanceof ApiError ? err.message : 'Something went wrong. Try again.')
          haptic('warning')
        }
      }
    } finally {
      setBusy(false)
    }
    if (last) {
      apply(last)
      setDraft({})
      say(saved === 1 && last.saved ? last.saved.quip : `${saved} picks saved.`)
      haptic('success')
    }
  }

  async function switchLeague(id: number | null) {
    haptic('select')
    apply(await run(() => api.get<State>(`/state${q(id)}`)))
  }

  async function settings(patch: Record<string, unknown>, ok?: string) {
    const nextState = await run(() => api.patch<State>(`/me${q(league)}`, patch), ok)
    apply(nextState)
    return nextState
  }

  let actions: Array<{ label: string; aside?: string; onClick?: () => void; tone?: 'ghost'; testId?: string; disabled?: boolean }> = []
  if (confirm) {
    actions = [
      { label: confirm === 'leave' ? 'Leave the league' : 'Delete my data', testId: 'confirm', disabled: busy, onClick: () => void doConfirm() },
      { label: 'Keep it', tone: 'ghost', onClick: () => setConfirm(null) },
    ]
  } else if (tab === 'picks' || tab === 'table') {
    if (dirty.length) actions = [{ label: busy ? 'Saving' : dirty.length === 1 ? 'Save my pick' : `Save ${dirty.length} picks`, testId: 'save-picks', disabled: busy, onClick: () => void savePicks() }]
    else if (tab === 'table' && todo.length) actions = [{ label: `Predict ${todo[0].home} v ${todo[0].away}`, aside: `${open.length - todo.length}/${open.length}`, testId: 'to-picks', onClick: () => setTab('picks') }]
  } else if (tab === 'league') {
    if (form === 'create') actions = [{ label: 'Create the league', testId: 'create', disabled: busy || name.trim().length < 2, onClick: () => void createLeague() }, { label: 'Not now', tone: 'ghost', onClick: () => setForm(null) }]
    else if (form === 'join') actions = [{ label: 'Join the league', testId: 'join', disabled: busy || !code.trim(), onClick: () => void joinLeague() }, { label: 'Not now', tone: 'ghost', onClick: () => setForm(null) }]
    else if (current) actions = [{ label: 'Invite friends to this league', testId: 'invite', onClick: () => openLink(current.shareUrl) }]
    else actions = [{ label: 'Create a league', testId: 'new-league', onClick: () => setForm('create') }, { label: 'Join with a code', tone: 'ghost', testId: 'to-join', onClick: () => setForm('join') }]
  } else if (tab === 'rounds') {
    if (rc?.joinCode) actions = [{ label: `Join ${rc.recap.scope}`, testId: 'recap-join', onClick: () => { setCode(rc.joinCode!); setForm('join'); setTab('league') } }]
    else if (rc) actions = [
      { label: 'Share this recap', testId: 'recap-share', onClick: () => { haptic('tap'); openLink(rc.shareUrl) } },
      { label: busy ? 'Sending' : 'Send the card to my chat', tone: 'ghost', testId: 'recap-send', disabled: busy, onClick: () => void sendCard() },
    ]
  } else if (tab === 'settings') {
    actions = [{ label: 'Invite a friend to play', tone: 'ghost', testId: 'invite-bot', onClick: () => openLink(s.me.shareUrl) }]
  }

  async function sendCard() {
    if (!rc) return
    await requestWriteAccess()
    const body: Record<string, unknown> = { comp: rc.recap.comp, round: rc.recap.round }
    if (rc.recap.league) body[rc.member ? 'league' : 'code'] = rc.member ? rc.recap.league.id : rc.recap.league.code
    await run(() => api.post('/recap/send', body), 'Sent. Open your chat with the bot and forward it.')
  }
  async function leagueRecap(on: boolean) {
    if (!current) return
    apply(await run(() => api.patch<State>(`/leagues/${current.id}${q(league)}`, { recap: on }), on ? 'Round messages on for this chat.' : 'Round messages off for this chat.'))
  }

  async function createLeague() {
    const nextState = await run(() => api.post<State>('/leagues', { name: name.trim() }), 'League created. Invite your friends.')
    if (nextState) { apply(nextState); setForm(null); setName('') }
  }
  async function joinLeague() {
    const nextState = await run(() => api.post<State>('/leagues/join', { code: code.trim().replace(/^.*lg_/, '') }), 'You joined the league.')
    if (nextState) { apply(nextState); setForm(null); setCode(''); void requestWriteAccess() }
  }
  async function doConfirm() {
    const c = confirm
    setConfirm(null)
    if (c === 'leave' && current) apply(await run(() => api.post<State>(`/leagues/${current.id}/leave`), `You left ${current.name}.`))
    if (c === 'delete') {
      if (await run(() => api.del('/me'), 'Your data is deleted.')) {
        apply(await run(() => api.get<State>('/state')))
      }
    }
  }

  const rank = s.table.rank
  const mast: [string, string] = [s.table.name, s.round || `${s.global.players} players worldwide`]
  const myPts = isLeague ? (s.table.rows.find((r) => r.you)?.pts ?? 0) : s.global.pts
  const myExact = isLeague ? (s.table.rows.find((r) => r.you)?.exact ?? 0) : s.global.exact

  const liveSection = (s.live ?? []).length ? (
            <Section title="Live now" aside="delayed">
              {(s.live ?? []).map((f) => (
                <article class="row" key={f.id} data-live={f.id}>
                  <span class="row-idx live-dot">{LIVE_LABEL[f.status ?? ''] ?? (f.liveHome !== null ? 'LIVE' : 'ON')}</span>
                  <span class="row-title">{f.home} <b class="mono">{f.liveHome !== null ? `${f.liveHome}–${f.liveAway}` : 'v'}</b> {f.away}
                    <span class="row-sub">{f.predHome !== null ? `You said ${f.predHome}–${f.predAway}` : 'No pick'}{f.provisional !== null ? ` · ${f.provisional} pts if it ends now` : ''}</span></span>
                  <span class="row-val">{f.provisional !== null ? `+${f.provisional}` : ''}</span>
                </article>
              ))}
            </Section>
          ) : null

  return guide((
    <Shell theme="matchday" title="Matchday" tabs={TABS} active={tab} home="table" onTab={(t) => { setConfirm(null); setTab(t) }} actions={actions} ready screen={`live-${tab}`} mast={mast} toast={toast}
      onBack={form ? () => setForm(null) : undefined}>
      {askRemind && !s.me.remind ? (
        <div class="lock">
          <span>Remind you {s.remindHours}h before kick-off if a pick is missing?</span>
          <button type="button" class="text-btn" data-action="remind-on" onClick={() => { setAskRemind(false); void requestWriteAccess(); void settings({ remind: true }, 'Reminders on.') }}>TURN ON</button>
        </div>
      ) : null}

      {confirm ? (
        <Section title={confirm === 'leave' ? `Leave ${current?.name ?? 'the league'}?` : 'Delete your data?'}>
          <p class="note">{confirm === 'leave' ? 'Your points stay on the worldwide table. You can rejoin with the code.' : 'Your predictions, points and leagues are removed for good.'}</p>
        </Section>
      ) : null}

      {tab === 'table' ? (
        <>
          <section class="block hero">
            <Pitch />
            <div class="kicker">{isLeague ? 'Your position' : 'Worldwide position'}</div>
            <div class="position">
              {rank ? <p class="hero-num" data-field="position">{rank}<span class="ord">{ordinal(rank)}</span></p> : <p class="hero-blank" data-field="position">—</p>}
              <div class="ctx">
                {rank ? `of ${s.table.players} ${isLeague ? 'friends' : 'players'}` : 'not on the board yet'}<br />
                <span class="move flat" data-field="points">{myPts} pts · {myExact} exact</span>
              </div>
            </div>
          </section>
          <div class="lock">
            <span>{next ? `${todo.length ? 'Next pick locks' : 'Next kick-off'} · ${next.home} v ${next.away}` : 'No open fixtures'}</span>
            <b data-field="lock">{next ? formatRemain(next.ms - now).split(':').join(' : ') : '-- : -- : --'}</b>
          </div>
          {liveSection}
          {!s.me.plusOnboarded && (s.rounds ?? []).length ? (
            <div class="lock" data-field="plus-new">
              <span>New: a recap card for every round</span>
              <button type="button" class="text-btn" data-action="to-rounds" onClick={() => setTab('rounds')}>OPEN</button>
            </div>
          ) : null}
          {s.leagues.length ? (
            <div class="picks-wrap" role="group" aria-label="Table">
              <button type="button" class="choice" aria-pressed={!isLeague} onClick={() => void switchLeague(null)}>Worldwide</button>
              {s.leagues.map((l) => <button type="button" class="choice" key={l.id} aria-pressed={l.id === s.table.id} onClick={() => void switchLeague(l.id)}>{l.name}</button>)}
            </div>
          ) : null}
          <Section title="The table" aside={`Pts · exact score = ${s.scoring.exact}`}>
            {s.table.rows.length ? (
              <>
                <div class="tbl-head"><span>#</span><span /><span>Player</span><span class="r">Pts</span></div>
                {s.table.rows.map((row, index) => (
                  <article class={row.you ? 'standing is-you' : 'standing'} key={`${index}-${row.name}`}>
                    <span class="rk">{row.rank || index + 1}</span>
                    <span class="move flat">{row.exact ? `${row.exact}◎` : '—'}</span>
                    <span class="who"><span class="av">{initials(row.name)}</span><span>{row.you ? `${row.name} (you)` : row.name}</span></span>
                    <span class="pt">{row.pts}</span>
                  </article>
                ))}
                {s.table.players > s.table.rows.length ? <p class="note">Top {s.table.rows.length} of {s.table.players} players</p> : null}
              </>
            ) : <Empty title="No table yet" body="Make your first prediction and you are on the board." />}
          </Section>
          {s.data ? <p class="note attrib" data-field="attribution">{s.data.attribution}. Scores update automatically and are slightly delayed.</p> : null}
          {s.results.length ? (
            <Section title="Your last results" aside={`${s.results.reduce((sum, r) => sum + r.points, 0)} pts`}>
              {s.results.map((r, index) => (
                <article class="row" key={`${index}-${r.home}`}>
                  <span class="row-idx">{r.points === s.scoring.exact ? '◎' : r.points > 0 ? '✓' : '×'}</span>
                  <span class="row-title">{r.home} {r.homeScore}–{r.awayScore} {r.away}<span class="row-sub">You said {r.predHome}–{r.predAway}</span></span>
                  <span class="row-val">+{r.points}</span>
                </article>
              ))}
            </Section>
          ) : null}
        </>
      ) : null}

      {tab === 'picks' ? liveSection : null}
      {tab === 'picks' ? (
        <Section title="Open fixtures" aside={`${s.round ? s.round + ' · ' : ''}${open.length - todo.length}/${open.length} in`}>
          <p class="note">Correct result {s.scoring.result} pt. Exact score {s.scoring.exact} pts. Times in {s.me.zoneLabel}. Each pick locks at kick-off.</p>
          {fixtures.length === 0 ? <Empty title="No fixtures yet" body="When a match is listed, set the score here before kick-off. The schedule refreshes automatically." /> : null}
          {fixtures.map((f, index) => {
            const locked = f.ms <= now
            const v = value(f)
            const changed = Boolean(draft[f.id]) && (f.predHome !== draft[f.id].h || f.predAway !== draft[f.id].a)
            return (
              <article class={locked ? 'fixture is-locked' : 'fixture'} key={f.id} data-fixture={f.id}>
                <div class="fixture-top">
                  <h3><span class="row-idx">{pad2(index + 1)}</span>{f.home}</h3>
                  <span class="when">{f.comp === 'UCL' ? 'UCL · ' : ''}{kickoffLabel(f.ms, zone, s.me.zoneLabel)}</span>
                </div>
                <div class="away">{f.away}</div>
                <div class="picks">
                  {locked ? (
                    <span class="score live-score" data-field="pick">{v ? `${v.h} : ${v.a}` : '– : –'} · {liveOf(f.id) ?? 'locked'}</span>
                  ) : (
                    <>
                      <span class="stepper" data-side="home">
                        <button type="button" aria-label={`${f.home} minus`} onClick={() => step(f, 'h', -1)}>−</button>
                        <strong data-field="home">{v ? v.h : '–'}</strong>
                        <button type="button" aria-label={`${f.home} plus`} data-action="home-plus" onClick={() => step(f, 'h', 1)}>+</button>
                      </span>
                      <span class="stepper" data-side="away">
                        <button type="button" aria-label={`${f.away} minus`} onClick={() => step(f, 'a', -1)}>−</button>
                        <strong data-field="away">{v ? v.a : '–'}</strong>
                        <button type="button" aria-label={`${f.away} plus`} data-action="away-plus" onClick={() => step(f, 'a', 1)}>+</button>
                      </span>
                      <span class="status">{changed ? 'Unsaved' : f.predHome !== null ? 'Saved' : ''}</span>
                    </>
                  )}
                </div>
              </article>
            )
          })}
        </Section>
      ) : null}

      {tab === 'rounds' ? (
        <>
          {s.leagues.length ? (
            <div class="picks-wrap" role="group" aria-label="Recap for">
              <button type="button" class="choice" aria-pressed={!isLeague && !(rc && rc.recap.league && !rc.member)} onClick={() => { setRcWant(rcWant ? { ...rcWant, code: null } : null); void switchLeague(null) }}>Worldwide</button>
              {s.leagues.map((l) => <button type="button" class="choice" key={l.id} aria-pressed={l.id === s.table.id} onClick={() => { setRcWant(rcWant ? { ...rcWant, code: null } : null); void switchLeague(l.id) }}>{l.name}</button>)}
            </div>
          ) : null}
          {rc ? (
            <RecapView out={rc} exact={s.scoring.exact} onRound={(comp, round) => { haptic('select'); setRcWant({ comp, round, code: rcWant?.code ?? null }) }} />
          ) : rcErr ? (
            <Empty title="No recap yet" body={`${rcErr} When the first results of a round are in, its recap appears here.`} />
          ) : <p class="loading">Setting the back page</p>}
        </>
      ) : null}

      {tab === 'league' ? (
        <>
          {form === 'create' ? (
            <Section title="New league">
              <label class="field stack"><span class="k">League name</span>
                <input type="text" maxLength={40} value={name} placeholder="Sunday Squad" data-field="league-name" onInput={(e) => setName(e.currentTarget.value)} /></label>
              <p class="note">You get a code and a link to share. Friends who join appear on your league table.</p>
            </Section>
          ) : null}
          {form === 'join' ? (
            <Section title="Join a league">
              <label class="field stack"><span class="k">League code or link</span>
                <input type="text" maxLength={80} value={code} placeholder="K7QX2M" data-field="league-code" onInput={(e) => setCode(e.currentTarget.value)} /></label>
            </Section>
          ) : null}
          {!form && current ? (
            <Section title={current.name} plain aside={current.code}>
              <div class="kicker">FRIENDS LEAGUE</div>
              <p class="hero-num sm">{current.code}</p>
              <p class="note">{current.members} players · friends join with the code or the link</p>
              <div class="field"><span class="k">Invite link</span>
                <button type="button" class="text-btn" onClick={() => void copyText(current.inviteLink).then((ok) => { say(ok ? 'Link copied.' : current.inviteLink); haptic('tap') })}>COPY</button></div>
              {current.group ? (
                <div class="field"><span class="k">Round preview & recap in the group chat</span>
                  {current.owner
                    ? <button type="button" class="choice" aria-pressed={current.recap !== false} data-field="league-recap" onClick={() => void leagueRecap(current.recap === false)}>{current.recap !== false ? 'ON' : 'OFF'}</button>
                    : <span class="row-val">{current.recap !== false ? 'ON' : 'OFF'}</span>}</div>
              ) : null}
              <div class="field"><span class="k">Leave this league</span>
                <button type="button" class="text-btn danger" data-action="leave" onClick={() => setConfirm('leave')}>LEAVE</button></div>
            </Section>
          ) : null}
          <Section title="Your leagues" aside={`${s.leagues.length}`}>
            {!form && !s.leagues.length ? <Empty title="No private league yet" body="Create one for friends, or join with a code. The worldwide table is already open." /> : null}
            {s.leagues.map((l, index) => (
              <button type="button" class={l.id === s.table.id ? 'row is-you' : 'row'} key={l.id} onClick={() => void switchLeague(l.id)}>
                <span class="row-idx">{pad2(index + 1)}</span>
                <span><span class="row-title">{l.name}</span><span class="row-sub">{l.members} players{l.owner ? ' · yours' : ''}</span></span>
                <span class="row-val">{l.code}</span>
              </button>
            ))}
            <button type="button" class={!isLeague ? 'row is-you' : 'row'} onClick={() => void switchLeague(null)}>
              <span class="row-idx">WW</span><span class="row-title">Worldwide</span>
              <span class="row-val">{s.global.rank ? `#${s.global.rank}` : '—'}</span>
            </button>
            {!form && s.leagues.length ? (
              <div class="field"><span class="k">Another league</span>
                <span><button type="button" class="text-btn" data-action="new-league" onClick={() => setForm('create')}>CREATE</button>{'  ·  '}
                  <button type="button" class="text-btn" data-action="to-join" onClick={() => setForm('join')}>JOIN</button></span></div>
            ) : null}
          </Section>
          <Section title="Scoring">
            <article class="row"><span class="row-idx">01</span><span class="row-title">Correct result</span><span class="row-val">{s.scoring.result}</span></article>
            <article class="row"><span class="row-idx">02</span><span class="row-title">Exact score</span><span class="row-val">{s.scoring.exact}</span></article>
          </Section>
        </>
      ) : null}

      {tab === 'settings' ? (
        <>
          <Section title="Time zone" aside={s.me.zoneLabel}>
            <div class="picks-wrap">
              {s.zones.map((z) => (
                <button type="button" class="choice" key={z.key} aria-pressed={z.zone === zone} data-zone={z.key} onClick={() => { haptic('select'); void settings({ tz: z.key }, `Times now in ${z.title.replace(/^\S+\s/, '')}.`) }}>{z.title}</button>
              ))}
            </div>
          </Section>
          <Section title="Messages from the bot">
            <div class="field">
              <span class="k">Remind me {s.remindHours}h before kick-off</span>
              <button type="button" class="choice" aria-pressed={s.me.remind} data-field="remind" onClick={() => { if (!s.me.remind) void requestWriteAccess(); void settings({ remind: !s.me.remind }) }}>{s.me.remind ? 'ON' : 'OFF'}</button>
            </div>
            <div class="field">
              <span class="k">Full-time results</span>
              <button type="button" class="choice" aria-pressed={s.me.results} data-field="results" onClick={() => void settings({ results: !s.me.results })}>{s.me.results ? 'ON' : 'OFF'}</button>
            </div>
          </Section>
          <Section title="Friends" aside={`${s.me.referrals} joined`}>
            <p class="note">Friends who start with your link count here.</p>
          </Section>
          <Section title="Your data">
            <div class="field"><span class="k">Delete predictions and points</span>
              <button type="button" class="text-btn danger" data-action="delete" onClick={() => setConfirm('delete')}>DELETE</button></div>
            <p class="note">A free game for fun: no betting, no odds, no prizes.</p>
          </Section>
        </>
      ) : null}
    </Shell>
  ))
}
