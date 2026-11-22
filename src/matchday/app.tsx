import { useEffect, useRef, useState } from 'preact/hooks'
import { formatDay, formatRemain, pad2, parseISODate } from '../format.ts'
import { haptic } from '../telegram.ts'
import { Empty, Pitch, Section, Shell } from '../ui.tsx'
import { impliedResult, picksMade } from './demo.ts'
import { LiveMatchdayApp, openBot } from './live.tsx'
import { createMatchdayRepository } from './repo.ts'
import type { MatchdayRepository, MatchdaySnapshot, Pick, ResultPick } from './types.ts'

const TABS = [
  { id: 'picks', label: 'Picks', icon: 'ledger' as const },
  { id: 'table', label: 'Table', icon: 'bars' as const },
  { id: 'league', label: 'League', icon: 'people' as const },
  { id: 'settings', label: 'Settings', icon: 'gear' as const },
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
      <Shell theme="matchday" title="Matchday" tabs={TABS} active={tab} home="table" onTab={setTab} ready={false} screen="loading" mast={['Matchday', 'Reading']}>
        <p class="loading">Reading the league</p>
      </Shell>
    )
  }

  if (snap.live) {
    return <LiveMatchdayApp snap={snap} />
  }

  if (!snap.connected) {
    return (
      <Shell theme="matchday" title="Matchday" tabs={TABS} active={tab} home="table" onTab={setTab} ready screen="waiting" mast={['Friends league', 'Waiting for the bot']} actions={[{ label: 'Open Matchday Picks', testId: 'open-bot', onClick: () => openBot('app') }]}>
        {tab === 'picks' ? (
          <Section title="Picks">
            <Empty title="No fixtures yet" body="The bot publishes the slate when the gameweek opens." />
          </Section>
        ) : tab === 'league' ? (
          <Section title="League">
            <Empty title="No room yet" body="The league opens from the bot." />
          </Section>
        ) : tab === 'settings' ? (
          <Section title="Record" aside="Waiting">
            <p class="note">Nothing is stored until the bot connects the league.</p>
          </Section>
        ) : (
          <>
            <section class="block hero">
              <Pitch />
              <div class="kicker">Your position</div>
              <div class="position">
                <p class="hero-blank">—</p>
                <div class="ctx">of your friends<br /><span class="move flat">The table opens from the bot</span></div>
              </div>
            </section>
            <div class="lock"><span>Next picks lock in</span><b>-- : -- : --</b></div>
            <Section title="The table" aside="Pts · exact score = 3">
              <div class="tbl-head"><span>#</span><span /><span>Player</span><span class="r">Pts</span></div>
              <Empty title="No table yet" body="The bot posts the first table after gameweek one." />
            </Section>
          </>
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
    ? [{ label: `Make your gameweek ${snap.gameweek.picking} picks`, aside: `${made}/${total}`, onClick: () => setTab('picks') }]
    : tab === 'picks'
      ? [{ label: locked ? 'Picks locked' : 'To the table', aside: `${made}/${total}`, disabled: locked, onClick: () => setTab('table') }]
      : tab === 'league'
        ? [{ label: copied ? 'Code copied' : 'Copy the code', onClick: () => {
            void navigator.clipboard.writeText(`${snap.league.name} · code ${snap.league.code}`).then(() => {
              setCopied(true)
              haptic('success')
              window.setTimeout(() => setCopied(false), 1600)
            }).catch(() => setCopied(false))
          } }]
        : []

  return (
    <Shell theme="matchday" title="Matchday" tabs={TABS} active={tab} home="table" onTab={setTab} actions={actions} ready mast={[snap.league.name, `Gameweek ${snap.gameweek.played} of ${snap.gameweek.season}`]}>
      {tab === 'table' ? (
        <>
          <section class="block hero">
            <Pitch />
            <div class="kicker">Your position</div>
            <div class="position">
              <p class="hero-num" data-field="position">{rank}<span class="ord">{ordinal(rank)}</span></p>
              <div class="ctx">
                of {snap.table.length} friends<br />
                <span class={you.move > 0 ? 'move up' : you.move < 0 ? 'move down' : 'move flat'}>
                  {you.move === 0 ? '— held this week' : `${you.move > 0 ? '▲' : '▼'} ${Math.abs(you.move)} this week`}
                </span>
              </div>
            </div>
          </section>
          <div class="lock"><span>Gameweek {snap.gameweek.picking} picks lock in</span><b data-field="lock">{locked ? 'Locked' : remain.split(':').join(' : ')}</b></div>
          <Section title="The table" aside={`Pts · exact score = ${snap.gameweek.exactScorePoints}`}>
            <div class="tbl-head"><span>#</span><span /><span>Player</span><span class="r">Pts</span></div>
            {shown.map((row, index) => {
              const name = row.isYou ? snap.settings.displayName : row.name
              return (
                <article class={row.isYou ? 'standing is-you' : 'standing'} key={row.id}>
                  <span class="rk">{index + 1}</span>
                  <span class={row.move > 0 ? 'move up' : row.move < 0 ? 'move down' : 'move flat'}>{row.move > 0 ? `▲${row.move}` : row.move < 0 ? `▼${Math.abs(row.move)}` : '—'}</span>
                  <span class="who"><span class="av">{initials(name)}</span><span>{name}</span></span>
                  <span class="pt">{row.points}</span>
                </article>
              )
            })}
            {hidden.length > 0 && !open ? (
              <div class="more-row">
                <button type="button" onClick={() => setOpen(true)}>
                  + {hidden.length} more · {hidden.map((row) => row.name.split(' ')[0]).join(', ')}
                </button>
                <button type="button" class="invite" onClick={() => setTab('league')}>Invite a friend ↗</button>
              </div>
            ) : null}
          </Section>
        </>
      ) : null}

      {tab === 'picks' ? (
        <Section title={`Gameweek ${snap.gameweek.picking}`} aside={locked ? 'Locked' : remain}>
          <p class="note">Correct result {snap.gameweek.resultPoints} pt. Exact score {snap.gameweek.exactScorePoints} pts. {locked ? 'The window is shut.' : 'Picks stay open until the clock hits zero.'}</p>
          {snap.fixtures.map((fixture, index) => {
            const pick = snap.picks.find((row) => row.fixtureId === fixture.id)
            return (
              <article class={locked ? 'fixture is-locked' : 'fixture'} key={fixture.id}>
                <div class="fixture-top">
                  <h3><span class="row-idx">{pad2(index + 1)}</span>{fixture.home}</h3>
                  <span class="when">{kickLabel(fixture.kickoff)}</span>
                </div>
                <div class="away">{fixture.away}</div>
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
          <Section title={snap.league.name} plain aside={snap.league.code}>
            <div class="kicker">{snap.league.seasonLabel}</div>
            <p class="hero-num sm">{snap.league.code}</p>
            <p class="note">{snap.table.length} players · GW {snap.gameweek.played} / {snap.gameweek.season}</p>
          </Section>
          <Section title="Scoring">
            <article class="row"><span class="row-idx">01</span><span class="row-title">Correct result</span><span class="row-val">{snap.gameweek.resultPoints}</span></article>
            <article class="row"><span class="row-idx">02</span><span class="row-title">Exact score</span><span class="row-val">{snap.gameweek.exactScorePoints}</span></article>
          </Section>
          <Section title="The room" aside={`${snap.table.length} players`}>
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
          <Section title="You">
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
          <Section title="Record" aside="This device">
            <p class="note">The league table will live on the bot. Picks here are a local copy.</p>
          </Section>
          <Section title="Reset">
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
