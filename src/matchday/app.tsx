import { useEffect, useRef, useState } from 'preact/hooks'
import { formatDay, formatRemain, pad2, parseISODate } from '../format.ts'
import { haptic } from '../telegram.ts'
import { Empty, Section, Shell, Stats } from '../ui.tsx'
import { createMatchdayRepository, impliedResult, picksMade } from './demo.ts'
import type { MatchdayRepository, MatchdaySnapshot, Pick, ResultPick } from './types.ts'

const TABS = [
  { id: 'picks', label: 'Picks' },
  { id: 'table', label: 'Table' },
  { id: 'league', label: 'League' },
  { id: 'settings', label: 'Settings' },
]

export function MatchdayApp() {
  const repo = useRef<MatchdayRepository>(createMatchdayRepository())
  const [snap, setSnap] = useState<MatchdaySnapshot | null>(null)
  const [tab, setTab] = useState('table')
  const [open, setOpen] = useState(false)
  const [armed, setArmed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let cancel = false
    void repo.current.load().then((next) => { if (!cancel) setSnap(next) })
    return () => { cancel = true }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  if (!snap) {
    return (
      <Shell theme="matchday" title="Matchday" tabs={TABS} active={tab} home="table" onTab={setTab} ready={false} screen="loading">
        <p class="loading">Reading the league</p>
      </Shell>
    )
  }

  if (!snap.connected) {
    return (
      <Shell theme="matchday" title="Matchday" tabs={TABS} active={tab} home="table" onTab={setTab} ready screen="waiting" actions={[{ label: 'WAITING ON THE BOT', disabled: true, mark: 'none' }]}>
        {tab === 'picks' ? (
          <Section index="01" title="PICKS">
            <Empty title="NO FIXTURES" body="THE BOT PUBLISHES THE SLATE WHEN THE GAMEWEEK OPENS." />
          </Section>
        ) : tab === 'league' ? (
          <Section index="01" title="LEAGUE">
            <Empty title="NO ROOM" body="THE LEAGUE OPENS FROM THE BOT." />
          </Section>
        ) : tab === 'settings' ? (
          <Section index="01" title="RECORD" aside="WAITING">
            <p class="note">Nothing is stored until the bot connects the league.</p>
          </Section>
        ) : (
          <Section index="01" title="SUNDAY SQUAD">
            <div class="kicker">Your position</div>
            <p class="hero-blank">—</p>
            <p class="note">The table opens from the bot.</p>
          </Section>
        )}
      </Shell>
    )
  }

  const made = picksMade(snap.picks)
  const total = snap.fixtures.length
  const locked = now >= snap.gameweek.lockAt
  const remain = formatRemain(snap.gameweek.lockAt - now)
  const you = snap.table.find((row) => row.isYou) ?? snap.table[0]
  const rank = Math.max(1, snap.table.findIndex((row) => row.isYou) + 1)
  const shown = open ? snap.table : snap.table.slice(0, 6)
  const hidden = snap.table.slice(6)

  function writePicks(picks: Pick[]) {
    setSnap({ ...snap!, picks })
    void repo.current.savePicks(picks)
  }

  function choose(id: string, result: ResultPick) {
    if (locked || !snap) return
    writePicks(snap.picks.map((row) => row.fixtureId === id ? { ...row, result } : row))
    haptic('select')
  }

  function score(id: string, side: 'homeScore' | 'awayScore', raw: string) {
    if (locked || !snap) return
    const trimmed = raw.trim()
    const value = trimmed === '' ? null : Math.max(0, Math.min(20, Math.trunc(Number(trimmed))))
    if (value !== null && !Number.isFinite(value)) return
    writePicks(snap.picks.map((row) => {
      if (row.fixtureId !== id) return row
      const next = { ...row, [side]: value }
      if (next.homeScore !== null && next.awayScore !== null) next.result = impliedResult(next.homeScore, next.awayScore)
      return next
    }))
  }

  const actions = tab === 'table'
    ? [{ label: `MAKE GW${snap.gameweek.picking} PICKS`, aside: `${made}/${total}`, onClick: () => setTab('picks') }]
    : tab === 'picks'
      ? [{ label: locked ? 'PICKS LOCKED' : 'TO THE TABLE', aside: `${made}/${total}`, disabled: locked, onClick: () => setTab('table') }]
      : tab === 'league'
        ? [{ label: copied ? 'CODE COPIED' : 'COPY THE CODE', onClick: () => {
            void navigator.clipboard.writeText(`${snap.league.name} · code ${snap.league.code}`).then(() => {
              setCopied(true)
              haptic('success')
              window.setTimeout(() => setCopied(false), 1600)
            }).catch(() => setCopied(false))
          } }]
        : []

  return (
    <Shell theme="matchday" title="Matchday" tabs={TABS} active={tab} home="table" onTab={setTab} actions={actions} ready>
      {tab === 'table' ? (
        <>
          <Section index="01" title={snap.league.name.toUpperCase()} aside={`GW ${snap.gameweek.played} / ${snap.gameweek.season}`}>
            <div class="kicker">Your position</div>
            <div class="position">
              <div class="hero-lockup">
                <span class="hero-num" data-field="position">{pad2(rank)}</span>
                <span class="hero-denom">/{pad2(snap.table.length)}</span>
              </div>
              <div class="plate">
                <i class="plate-stripes" aria-hidden="true" />
                <div>
                  <div class="plate-k">{you.move === 0 ? 'HELD' : `${Math.abs(you.move)} PLACES`}</div>
                  <div class="plate-v">{you.points} PTS</div>
                </div>
              </div>
            </div>
            <Stats
              columns={2}
              items={[
                { label: `GW${snap.gameweek.picking} picks lock in`, value: locked ? 'LOCKED' : remain, field: 'lock' },
                { label: 'Picks made', value: `${made}/${total}`, field: 'picks' },
              ]}
            />
          </Section>
          <Section index="02" title="TABLE" aside={`EXACT SCORE = ${snap.gameweek.exactScorePoints} PTS`}>
            {shown.map((row, index) => (
              <article class={row.isYou ? 'row is-you' : 'row'} key={row.id}>
                <span class="row-idx">{pad2(index + 1)}</span>
                <span class="row-title">{row.isYou ? snap.settings.displayName : row.name}</span>
                <span class="row-side">
                  {row.move !== 0 ? <span class={row.move > 0 ? 'move up' : 'move down'}>{row.move > 0 ? `+${row.move}` : `−${Math.abs(row.move)}`}</span> : null}
                  <span class="row-val">{row.points}</span>
                </span>
              </article>
            ))}
            {hidden.length > 0 && !open ? (
              <div class="more-row">
                <button type="button" onClick={() => setOpen(true)}>
                  +{hidden.length} MORE · {hidden.map((row) => row.name.split(' ')[0].toUpperCase()).join(', ')}
                </button>
                <button type="button" class="invite" onClick={() => setTab('league')}>INVITE →</button>
              </div>
            ) : null}
          </Section>
        </>
      ) : null}

      {tab === 'picks' ? (
        <Section index="01" title={`GW${snap.gameweek.picking}`} aside={locked ? 'LOCKED' : remain}>
          <p class="note">Correct result {snap.gameweek.resultPoints} pt. Exact score {snap.gameweek.exactScorePoints} pts. {locked ? 'The window is shut.' : 'Picks stay open until the clock hits zero.'}</p>
          {snap.fixtures.map((fixture, index) => {
            const pick = snap.picks.find((row) => row.fixtureId === fixture.id)
            return (
              <article class={locked ? 'fixture is-locked' : 'fixture'} key={fixture.id}>
                <div class="fixture-top">
                  <h3>{pad2(index + 1)}  {fixture.home}</h3>
                  <span class="when">{kickLabel(fixture.kickoff)}</span>
                </div>
                <div class="row-title">{fixture.away}</div>
                <div class="picks">
                  {(['1', 'X', '2'] as const).map((result) => (
                    <button
                      key={result}
                      type="button"
                      class="result"
                      data-pick={fixture.id}
                      data-result={result}
                      aria-pressed={pick?.result === result}
                      disabled={locked}
                      onClick={() => choose(fixture.id, result)}
                    >
                      {result}
                    </button>
                  ))}
                  <span class="score">
                    <input inputMode="numeric" disabled={locked} value={pick?.homeScore ?? ''} aria-label={`${fixture.home} score`} onInput={(event) => score(fixture.id, 'homeScore', event.currentTarget.value)} />
                    <span>:</span>
                    <input inputMode="numeric" disabled={locked} value={pick?.awayScore ?? ''} aria-label={`${fixture.away} score`} onInput={(event) => score(fixture.id, 'awayScore', event.currentTarget.value)} />
                  </span>
                </div>
              </article>
            )
          })}
        </Section>
      ) : null}

      {tab === 'league' ? (
        <>
          <Section index="01" title={snap.league.name.toUpperCase()} aside={snap.league.code}>
            <div class="kicker">{snap.league.seasonLabel}</div>
            <p class="hero-num sm">{snap.league.code}</p>
            <p class="note">{snap.table.length} players · GW {snap.gameweek.played} / {snap.gameweek.season}</p>
          </Section>
          <Section index="02" title="SCORING">
            <article class="row"><span class="row-idx">01</span><span class="row-title">Correct result</span><span class="row-val">{snap.gameweek.resultPoints}</span></article>
            <article class="row"><span class="row-idx">02</span><span class="row-title">Exact score</span><span class="row-val">{snap.gameweek.exactScorePoints}</span></article>
          </Section>
          <Section index="03" title="THE ROOM" aside={`${snap.table.length} PLAYERS`}>
            {snap.table.map((row, index) => (
              <article class={row.isYou ? 'row is-you' : 'row'} key={row.id}>
                <span class="row-idx">{pad2(index + 1)}</span>
                <span class="row-title">{row.isYou ? snap.settings.displayName : row.name}</span>
                <span class="row-val">{row.points}</span>
              </article>
            ))}
          </Section>
        </>
      ) : null}

      {tab === 'settings' ? (
        <>
          <Section index="01" title="YOU">
            <label class="field">
              <span class="k">Display name</span>
              <input
                type="text"
                maxLength={24}
                value={snap.settings.displayName}
                onInput={(event) => {
                  const displayName = event.currentTarget.value
                  const table = snap.table.map((row) => row.isYou ? { ...row, name: displayName.trim() || 'You' } : row)
                  const settings = { ...snap.settings, displayName }
                  setSnap({ ...snap, settings, table })
                  void repo.current.saveSettings({ ...settings, displayName: displayName.trim() || 'You' })
                }}
              />
            </label>
            <div class="field">
              <span class="k">Remind before lock</span>
              <button
                type="button"
                class="choice"
                aria-pressed={snap.settings.remindBeforeLock}
                onClick={() => {
                  const settings = { ...snap.settings, remindBeforeLock: !snap.settings.remindBeforeLock }
                  setSnap({ ...snap, settings })
                  void repo.current.saveSettings(settings)
                  haptic('select')
                }}
              >
                {snap.settings.remindBeforeLock ? 'ON' : 'OFF'}
              </button>
            </div>
          </Section>
          <Section index="02" title="RECORD" aside="THIS DEVICE">
            <p class="note">The league table will live on the bot. Picks here are a local copy.</p>
          </Section>
          <Section index="03" title="RESET">
            {armed ? (
              <div class="confirm">
                <p class="note">Puts the demo picks and the table back to the opening slate.</p>
                <div class="pair">
                  <button type="button" class="text-btn danger" onClick={() => {
                    void repo.current.reset().then((next) => {
                      setSnap(next)
                      setArmed(false)
                      setOpen(false)
                      haptic('warning')
                    })
                  }}>CONFIRM RESET</button>
                  <button type="button" class="text-btn" onClick={() => setArmed(false)}>KEEP THE SLATE</button>
                </div>
              </div>
            ) : (
              <div class="field">
                <span class="k">Opening slate</span>
                <button type="button" class="text-btn danger" onClick={() => setArmed(true)}>RESTORE PICKS</button>
              </div>
            )}
          </Section>
        </>
      ) : null}
    </Shell>
  )
}

function kickLabel(stamp: string): string {
  const [date, time] = stamp.split('T')
  return `${formatDay(parseISODate(date || '2026-01-01'))} · ${time || ''}`
}
