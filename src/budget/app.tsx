import { useEffect, useRef, useState } from 'preact/hooks'
import { CURRENCIES, formatDay, formatMoney, formatMonth, pad2, parseISODate, symbol, type Currency } from '../format.ts'
import { loadRecord, placeLabel, readLocal, saveRecord, type RecordPlace } from '../storage.ts'
import { bindMainButton, haptic } from '../telegram.ts'
import { themes } from '../theme.ts'
import { Empty, Section, Shell, Stats, type Action } from '../ui.tsx'
import {
  BUDGET_KEY,
  createSeed,
  derive,
  heroText,
  progressLabel,
  resetState,
  ruleChip,
  ruleLine,
  sanitize,
  stepUnit,
  toggleWeek,
  weekAmount,
  type BudgetState,
  type Variant,
  type WeekEntry,
} from './model.ts'
import { downloadBlob, progressCaption, renderCard, shareCard, type ShareResult } from './share.ts'

const TABS = [
  { id: 'ledger', label: 'Ledger' },
  { id: 'history', label: 'History' },
  { id: 'circle', label: 'Circle' },
  { id: 'settings', label: 'Settings' },
]

const SHARE_COPY: Record<ShareResult, string> = {
  telegram: 'SENT THROUGH TELEGRAM',
  sheet: 'SHARE SHEET OPENED',
  download: 'CARD SAVED',
  closed: 'SHARE CLOSED',
  failed: 'COULD NOT SHARE THE CARD',
}

function parseStored(raw: string | null): BudgetState | null {
  if (!raw) return null
  try { return sanitize(JSON.parse(raw)) } catch { return null }
}

export function BudgetApp() {
  const seed = useRef(parseStored(readLocal(BUDGET_KEY)) ?? createSeed())
  const [state, setState] = useState<BudgetState>(seed.current)
  const [place, setPlace] = useState<RecordPlace>(readLocal(BUDGET_KEY) ? 'device' : 'memory')
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState('ledger')
  const [focus, setFocus] = useState<number | null>(null)
  const [armed, setArmed] = useState(false)
  const [card, setCard] = useState<{ blob: Blob; url: string } | null>(null)
  const [note, setNote] = useState('')
  const dirty = useRef(false)

  useEffect(() => {
    let cancel = false
    const initial = seed.current
    void (async () => {
      const had = readLocal(BUDGET_KEY)
      if (!had) {
        const where = await saveRecord(BUDGET_KEY, JSON.stringify(initial))
        if (!cancel) setPlace(where)
      } else {
        const loaded = await loadRecord(BUDGET_KEY)
        const parsed = parseStored(loaded.raw)
        if (!cancel && parsed && !dirty.current) {
          setState(parsed)
          setPlace(loaded.place)
        } else if (!cancel) setPlace(loaded.place)
      }
      if (!cancel) setReady(true)
    })()
    return () => { cancel = true }
  }, [])

  function commit(next: BudgetState) {
    dirty.current = true
    setState(next)
    setArmed(false)
    void saveRecord(BUDGET_KEY, JSON.stringify(next)).then(setPlace)
  }

  const ledger = derive(state)
  const theme = themes.budget
  const savedText = heroText(ledger.saved)
  const scale = savedText.length >= 10 ? 'xs' : savedText.length >= 8 ? 'sm' : ''
  const chip = `${ruleChip(state)} · ${state.currency}`
  const focused = ledger.entries[(focus ?? ledger.currentWeek) - 1]

  useEffect(() => {
    if (tab !== 'settings' || !armed) {
      return bindMainButton({
        visible: false,
        text: 'CONFIRM RESET',
        color: theme.gold,
        textColor: theme.onGold,
        onClick: () => undefined,
      })
    }
    return bindMainButton({
      visible: true,
      text: 'CONFIRM RESET',
      color: theme.gold,
      textColor: theme.onGold,
      onClick: () => commit(resetState(state)),
    })
  }, [tab, armed, state, theme.gold, theme.onGold])

  useEffect(() => {
    if (tab !== 'circle') return
    let cancel = false
    let url = ''
    const view = derive(state)
    void renderCard({
      bg: theme.bg,
      cream: theme.cream,
      gold: theme.gold,
      year: state.year,
      rule: ruleChip(state),
      currency: state.currency,
      saved: heroText(view.saved),
      progress: progressLabel(view, state.currency),
      stats: [
        { label: 'WEEK', value: `${pad2(view.currentWeek)} / 52` },
        { label: 'STREAK', value: `${view.streak} WK` },
        { label: 'MISSED', value: String(view.missed) },
        { label: 'GOAL', value: formatMoney(view.goal, state.currency) },
      ],
      cells: view.entries.map((entry) => entry.status),
    }).then((result) => {
      if (cancel) {
        URL.revokeObjectURL(result.url)
        return
      }
      url = result.url
      setCard(result)
    }).catch(() => {
      if (!cancel) setNote('COULD NOT RENDER THE CARD')
    })
    return () => {
      cancel = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [tab, state, theme.bg, theme.cream, theme.gold])

  function onCell(week: number) {
    const paid = Boolean(state.paid[String(week)])
    setFocus(week)
    commit(toggleWeek(state, week))
    haptic(paid ? 'tap' : 'success')
  }

  async function onShare() {
    setNote('RENDERING')
    const blob = card?.blob ?? (await renderCard({
      bg: theme.bg,
      cream: theme.cream,
      gold: theme.gold,
      year: state.year,
      rule: ruleChip(state),
      currency: state.currency,
      saved: savedText,
      progress: progressLabel(ledger, state.currency),
      stats: [],
      cells: ledger.entries.map((entry) => entry.status),
    })).blob
    const result = await shareCard(blob, progressCaption(savedText, progressLabel(ledger, state.currency), ledger.currentWeek))
    setNote(SHARE_COPY[result])
    haptic(result === 'failed' ? 'warning' : 'success')
  }

  function onDownload() {
    if (!card) return
    downloadBlob(card.blob, 'budget-better.png')
    setNote('CARD SAVED')
    haptic('success')
  }

  async function onCopy() {
    const line = progressCaption(savedText, progressLabel(ledger, state.currency), ledger.currentWeek)
    try {
      await navigator.clipboard.writeText(line)
      setNote('LINE COPIED')
    } catch {
      setNote('SELECT THE LINE')
    }
  }

  const recent = ledger.entries.filter((entry) => entry.status === 'paid').slice().reverse().slice(0, 2)
  const history = ledger.entries.filter((entry) => entry.status !== 'future').slice().reverse()
  const actions = actionsFor(tab, ledger, state.currency, () => {
    if (!ledger.nextWeek) return
    onCell(ledger.nextWeek)
  }, () => setTab('circle'), onShare, onDownload)

  return (
    <Shell theme="budget" title="Budget Better" tabs={TABS} active={tab} home="ledger" onTab={setTab} actions={actions} ready={ready}>
      {tab === 'ledger' ? (
        <>
          <Section index="01" title={`SAVINGS / ${state.year}`} aside={chip}>
            <div class="kicker">Saved to date</div>
            <p class={`hero-num ${scale}`} data-field="saved">{savedText}</p>
            <div class="track-wrap">
              <div class="track"><span style={{ width: `${Math.min(100, ledger.progress)}%` }} /></div>
              <div class="track-meta">
                <span>0</span>
                <span class="mid" data-field="progress">{progressLabel(ledger, state.currency)}</span>
                <span>100</span>
              </div>
            </div>
            <Stats
              columns={4}
              items={[
                { label: 'Week', value: String(ledger.currentWeek), unit: '/52', field: 'week' },
                { label: 'Streak', value: String(ledger.streak), unit: 'wk', field: 'streak' },
                { label: 'Missed', value: String(ledger.missed), unit: 'wk', field: 'missed' },
                { label: 'Next', value: ledger.nextWeek ? formatMoney(ledger.nextAmount, state.currency) : '—', field: 'next' },
              ]}
            />
          </Section>
          <Section index="02" title="WEEKS 1–52" aside={<Legend />}>
            <div class="weeks">
              {[0, 1, 2, 3].flatMap((row) => [
                <span class="row-label" key={`l${row}`}>{pad2(row + 1)}</span>,
                ...Array.from({ length: 13 }, (_, column) => {
                  const week = row * 13 + column + 1
                  const entry = ledger.entries[week - 1]
                  return (
                    <button
                      key={week}
                      type="button"
                      class={`cell ${entry.status}`}
                      data-week={week}
                      aria-pressed={entry.status === 'paid'}
                      aria-label={`Week ${week}, ${entry.status}, ${formatMoney(entry.amount, state.currency)}`}
                      onClick={() => onCell(week)}
                    />
                  )
                }),
              ])}
            </div>
            {focused ? (
              <div class="readout">
                Week {pad2(focused.week)} · {focused.timing} · {formatMoney(focused.amount, state.currency)}
              </div>
            ) : null}
          </Section>
          <Section index="03" title="RECENT" aside={<button type="button" class="text-btn" onClick={() => setTab('history')}>ALL →</button>}>
            {recent.length === 0 ? <Empty title="NO MARKS" body="TAP A WEEK TO LOG IT." /> : recent.map((entry) => (
              <Entry key={entry.week} entry={entry} currency={state.currency} onClick={() => setTab('history')} />
            ))}
          </Section>
        </>
      ) : null}

      {tab === 'history' ? <History entries={history} currency={state.currency} onToggle={onCell} /> : null}

      {tab === 'circle' ? (
        <>
          <Section index="01" title="PROGRESS CARD" aside="PNG">
            <p class="note">A still of the ledger, rendered on this device.</p>
            <div class="card-frame">
              {card ? <img src={card.url} alt="Budget Better progress card" /> : <p class="loading">RENDERING THE CARD</p>}
            </div>
            {note ? <p class="status" data-field="share-note">{note}</p> : null}
          </Section>
          <Section index="02" title="THE LINE">
            <p class="copy">{progressCaption(savedText, progressLabel(ledger, state.currency), ledger.currentWeek)}</p>
            <button type="button" class="text-btn" onClick={() => void onCopy()}>COPY LINE</button>
          </Section>
        </>
      ) : null}

      {tab === 'settings' ? (
        <Settings
          state={state}
          ledgerWeek={ledger.currentWeek}
          ledgerGoal={ledger.goal}
          place={place}
          armed={armed}
          onArm={setArmed}
          onChange={commit}
          onReset={() => { haptic('warning'); commit(resetState(state)) }}
        />
      ) : null}
    </Shell>
  )
}

function actionsFor(
  tab: string,
  ledger: ReturnType<typeof derive>,
  currency: Currency,
  log: () => void,
  toCircle: () => void,
  share: () => void,
  download: () => void,
): Action[] {
  if (tab === 'ledger') {
    if (!ledger.nextWeek) return [{ label: 'CHALLENGE COMPLETE', disabled: true, mark: 'none' }]
    return [{ label: `LOG WEEK ${ledger.nextWeek}`, aside: formatMoney(ledger.nextAmount, currency), onClick: log }]
  }
  if (tab === 'history') return [{ label: 'SHARE PROGRESS', onClick: toCircle }]
  if (tab === 'circle') {
    return [
      { label: 'SHARE THE CARD', aside: 'PNG', onClick: share },
      { label: 'DOWNLOAD', aside: 'PNG', onClick: download, tone: 'ghost' },
    ]
  }
  return []
}

function Legend() {
  return (
    <span class="legend">
      <span><i class="swatch paid" /> Paid</span>
      <span><i class="swatch due" /> Due</span>
      <span><i class="swatch missed" /> Missed</span>
    </span>
  )
}

function Entry(props: { entry: WeekEntry; currency: Currency; onClick: () => void }) {
  const { entry } = props
  const when = entry.paidOn ? formatDay(parseISODate(entry.paidOn)) : entry.dueLabel
  return (
    <button type="button" class="entry" onClick={props.onClick}>
      <span class="entry-id">W{pad2(entry.week)}</span>
      <span>
        <span class="entry-amt">{formatMoney(entry.amount, props.currency)}</span>
        <span class="entry-sub">{when} · {entry.timing}</span>
      </span>
      <span class="entry-mark">{entry.status === 'paid' ? '✓' : ''}</span>
    </button>
  )
}

function History(props: { entries: WeekEntry[]; currency: Currency; onToggle: (week: number) => void }) {
  if (props.entries.length === 0) return <Empty title="NO MARKS" body="THE GRID IS CLEAR. LOG A WEEK FROM THE LEDGER." />
  const groups: Array<{ label: string; rows: WeekEntry[] }> = []
  for (const entry of props.entries) {
    const label = formatMonth(parseISODate(entry.due))
    const last = groups[groups.length - 1]
    if (!last || last.label !== label) groups.push({ label, rows: [entry] })
    else last.rows.push(entry)
  }
  return (
    <>
      <Section index="01" title="MARKS" aside={`${props.entries.filter((entry) => entry.status === 'paid').length} PAID`}>
        <p class="note">Tap a row to mark it paid or clear it.</p>
      </Section>
      {groups.map((group) => (
        <div key={group.label}>
          <div class="month">{group.label}</div>
          {group.rows.map((entry) => (
            <Entry key={entry.week} entry={entry} currency={props.currency} onClick={() => props.onToggle(entry.week)} />
          ))}
        </div>
      ))}
    </>
  )
}

function Settings(props: {
  state: BudgetState
  ledgerWeek: number
  ledgerGoal: number
  place: RecordPlace
  armed: boolean
  onArm: (armed: boolean) => void
  onChange: (next: BudgetState) => void
  onReset: () => void
}) {
  const { state } = props
  const sample = weekAmount(state, props.ledgerWeek)
  function setVariant(variant: Variant) {
    haptic('select')
    props.onChange({ ...state, variant })
  }
  return (
    <>
      <Section index="01" title="RULE">
        <div class="choices">
          {(['classic', 'reverse', 'custom'] as const).map((variant) => (
            <button key={variant} type="button" class="choice" aria-pressed={state.variant === variant} onClick={() => setVariant(variant)}>
              {variant}
            </button>
          ))}
        </div>
        {state.variant === 'custom' ? (
          <div class="field">
            <span class="k">Weekly amount</span>
            <span class="stepper">
              <button type="button" aria-label="Decrease amount" onClick={() => props.onChange({ ...state, customAmount: Math.max(1, state.customAmount - 5) })}>−</button>
              <strong>{formatMoney(state.customAmount, state.currency)}</strong>
              <button type="button" aria-label="Increase amount" onClick={() => props.onChange({ ...state, customAmount: state.customAmount + 5 })}>+</button>
            </span>
          </div>
        ) : (
          <div class="field">
            <span class="k">Unit multiplier</span>
            <span class="stepper">
              <button type="button" aria-label="Decrease unit" onClick={() => props.onChange({ ...state, multiplier: stepUnit(state.multiplier, -1) })}>−</button>
              <strong>×{state.multiplier}</strong>
              <button type="button" aria-label="Increase unit" onClick={() => props.onChange({ ...state, multiplier: stepUnit(state.multiplier, 1) })}>+</button>
            </span>
          </div>
        )}
        <p class="rule">{ruleLine(state)} Week {props.ledgerWeek} saves {formatMoney(sample, state.currency)}. The year comes to {formatMoney(props.ledgerGoal, state.currency)}.</p>
      </Section>
      <Section index="02" title="CURRENCY">
        <div class="currencies">
          {CURRENCIES.map((code) => (
            <button
              key={code}
              type="button"
              class="choice"
              aria-pressed={state.currency === code}
              onClick={() => { haptic('select'); props.onChange({ ...state, currency: code }) }}
            >
              {symbol(code)} {code}
            </button>
          ))}
        </div>
      </Section>
      <Section index="03" title="CALENDAR">
        <div class="field">
          <span class="k">Year</span>
          <span class="stepper">
            <button type="button" aria-label="Previous year" onClick={() => props.onChange({ ...state, year: Math.max(2020, state.year - 1) })}>−</button>
            <strong>{state.year}</strong>
            <button type="button" aria-label="Next year" onClick={() => props.onChange({ ...state, year: Math.min(2040, state.year + 1) })}>+</button>
          </span>
        </div>
        <label class="field">
          <span class="k">Start</span>
          <input
            type="date"
            value={state.startDate}
            onInput={(event) => {
              const value = event.currentTarget.value
              if (/^\d{4}-\d{2}-\d{2}$/.test(value)) props.onChange({ ...state, startDate: value })
            }}
          />
        </label>
        <p class="note">Current week follows the start date. Marks stay. Amounts follow the rule.</p>
      </Section>
      <Section index="04" title="RECORD" aside={placeLabel(props.place)}>
        <p class="note">Outside Telegram the ledger stays on this device. Inside Telegram it also writes to CloudStorage.</p>
      </Section>
      <Section index="05" title="RESET">
        {props.armed ? (
          <div class="confirm">
            <p class="note">Clears every mark and starts the calendar on today. The rule and currency stay.</p>
            <div class="pair">
              <button type="button" class="text-btn danger" onClick={props.onReset}>CONFIRM RESET</button>
              <button type="button" class="text-btn" onClick={() => props.onArm(false)}>KEEP THE LEDGER</button>
            </div>
          </div>
        ) : (
          <div class="field">
            <span class="k">Clear the marks</span>
            <button type="button" class="text-btn danger" onClick={() => props.onArm(true)}>RESET CHALLENGE</button>
          </div>
        )}
      </Section>
    </>
  )
}
