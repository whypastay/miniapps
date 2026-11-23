import { useEffect, useRef, useState } from 'preact/hooks'
import { CURRENCIES, formatDay, formatMoney, formatMonth, pad2, parseISODate, startOfDay, symbol, toISODate, type Currency } from '../format.ts'
import { demoRequested } from '../mode.ts'
import { loadRecord, placeLabel, readLocal, saveRecord, type RecordPlace } from '../storage.ts'
import { bindMainButton, haptic, shareWithFriend } from '../telegram.ts'
import { Api, ApiError, connect, openLink, requestWriteAccess } from '../api.ts'
import { themes } from '../theme.ts'
import { Check, Empty, Section, Shell, Stats, sentence, type Action } from '../ui.tsx'
import {
  BUDGET_KEY,
  createEmpty,
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
  { id: 'ledger', label: 'Ledger', icon: 'ledger' as const },
  { id: 'history', label: 'History', icon: 'bars' as const },
  { id: 'circle', label: 'Circle', icon: 'people' as const },
  { id: 'split', label: 'Split', icon: 'split' as const },
  { id: 'settings', label: 'Settings', icon: 'gear' as const },
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

export function BudgetApp(props: { onSplit?: () => void } = {}) {
  const demo = useRef(demoRequested()).current
  const [state, setState] = useState<BudgetState | null>(() => (demo ? createSeed() : parseStored(readLocal(BUDGET_KEY))))
  const [place, setPlace] = useState<RecordPlace>(demo ? 'memory' : readLocal(BUDGET_KEY) ? 'device' : 'memory')
  const [ready, setReady] = useState(demo)
  const [tab, setTab] = useState('ledger')
  const [focus, setFocus] = useState<number | null>(null)
  const [armed, setArmed] = useState(false)
  const [card, setCard] = useState<{ blob: Blob; url: string } | null>(null)
  const [note, setNote] = useState('')
  const dirty = useRef(false)
  const api = useRef<Api | null>(null)
  const [server, setServer] = useState<ServerInfo | null>(null)
  const [sync, setSync] = useState<SyncState>('local')
  const pushTimer = useRef<number | null>(null)

  useEffect(() => {
    if (demo) return
    let cancel = false
    void (async () => {
      let local: BudgetState | null = null
      try {
        const loaded = await loadRecord(BUDGET_KEY)
        local = parseStored(loaded.raw)
        if (cancel) return
        if (local && !dirty.current) setState(local)
        setPlace(local ? loaded.place : 'memory')
      } catch {
        if (!cancel) setPlace('memory')
      }
      // the bot's database is the source of truth when the app runs inside Telegram
      try {
        const client = await connect('budget')
        if (client && !cancel) {
          api.current = client
          const remote = await client.get<ServerInfo>('/state')
          if (cancel) return
          setServer(remote)
          const fromBot = remote.state ? sanitize(remote.state) : null
          if (fromBot && !dirty.current) {
            setState(fromBot)
            void saveRecord(BUDGET_KEY, JSON.stringify(fromBot)).then(setPlace).catch(() => undefined)
            setSync('synced')
          } else if (local) {
            // first run with the bot: move the device ledger up
            const up = await client.put<ServerInfo>('/state', { state: local, timezone: zoneName() })
            if (!cancel) { setServer(up); setSync('synced') }
          } else {
            setSync('synced')
          }
        }
      } catch {
        if (!cancel && api.current) setSync('offline')
      } finally {
        if (!cancel) setReady(true)
      }
    })()
    return () => { cancel = true }
  }, [demo])

  function push(next: BudgetState) {
    const client = api.current
    if (!client) return
    setSync('saving')
    if (pushTimer.current) window.clearTimeout(pushTimer.current)
    pushTimer.current = window.setTimeout(() => {
      void client.put<ServerInfo>('/state', { state: next, timezone: zoneName() })
        .then((info) => { setServer(info); setSync('synced') })
        .catch(() => setSync('offline'))
    }, 500)
  }

  function commit(next: BudgetState) {
    dirty.current = true
    setState(next)
    setArmed(false)
    if (demo) return
    void saveRecord(BUDGET_KEY, JSON.stringify(next)).then(setPlace).catch(() => setPlace('memory'))
    push(next)
  }

  async function saveReminder(reminder: Reminder): Promise<string | null> {
    const client = api.current
    if (!client) return 'Open the app from Telegram to set reminders.'
    try {
      if (reminder.enabled) void requestWriteAccess()
      const info = await client.put<ServerInfo>('/reminder', { ...reminder, timezone: zoneName() })
      setServer(info)
      haptic('success')
      return null
    } catch (err) {
      haptic('warning')
      return err instanceof ApiError ? err.message : 'Could not save the reminder.'
    }
  }

  const ledger = state ? derive(state) : null
  const theme = themes.budget
  const savedText = ledger ? heroText(ledger.saved) : '0'
  const scale = savedText.length >= 10 ? 'xs' : savedText.length >= 8 ? 'sm' : ''
  const chip = state ? `${ruleChip(state)} · ${state.currency}` : ''
  const focused = ledger ? ledger.entries[(focus ?? ledger.currentWeek) - 1] : null

  useEffect(() => {
    if (!state || tab !== 'settings' || !armed) {
      return bindMainButton({
        visible: false,
        text: 'CONFIRM RESET',
        color: theme.ink,
        textColor: theme.paper,
        onClick: () => undefined,
      })
    }
    return bindMainButton({
      visible: true,
      text: 'CONFIRM RESET',
      color: theme.ink,
      textColor: theme.paper,
      onClick: () => commit(resetState(state)),
    })
  }, [tab, armed, state, theme.ink, theme.paper])

  useEffect(() => {
    if (!state || tab !== 'circle') return
    let cancel = false
    let url = ''
    const view = derive(state)
    void renderCard({
      paper: theme.paper,
      ink: theme.ink,
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
  }, [tab, state, theme.paper, theme.ink, theme.gold])

  function onCell(week: number) {
    if (!state) return
    const paid = Boolean(state.paid[String(week)])
    setFocus(week)
    commit(toggleWeek(state, week))
    haptic(paid ? 'tap' : 'success')
  }

  async function onShare() {
    if (!state || !ledger) return
    setNote('RENDERING')
    const blob = card?.blob ?? (await renderCard({
      paper: theme.paper,
      ink: theme.ink,
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
    if (!state || !ledger) return
    const line = progressCaption(savedText, progressLabel(ledger, state.currency), ledger.currentWeek)
    try {
      await navigator.clipboard.writeText(line)
      setNote('LINE COPIED')
    } catch {
      setNote('SELECT THE LINE')
    }
  }

  if (!ready) {
    return (
      <Shell theme="budget" title="Budget Better" tabs={[]} active="ledger" home="ledger" onTab={setTab} ready={false} screen="loading" mast={['The 52-week ledger', 'Reading']}>
        <p class="loading">Reading the ledger</p>
      </Shell>
    )
  }

  if (!state || !ledger) {
    return <Onboarding onOpen={commit} />
  }

  const recent = ledger.entries.filter((entry) => entry.status === 'paid').slice().reverse().slice(0, 2)
  const history = ledger.entries.filter((entry) => entry.status !== 'future').slice().reverse()
  const actions = actionsFor(tab, ledger, state.currency, () => {
    if (!ledger.nextWeek) return
    onCell(ledger.nextWeek)
  }, () => setTab('circle'), onShare, onDownload, server?.shareUrl ? () => openLink(server.shareUrl) : shareWithFriend)

  const mast: [string, string] = [`The 52-week ledger`, `${state.year} · ${chip}`]
  const todayAt = Math.min(100, Math.max(0, ((ledger.currentWeek - 0.5) / 52) * 100))

  return (
    <Shell theme="budget" title="Budget Better" tabs={props.onSplit ? TABS : TABS.filter((t) => t.id !== 'split')} active={tab} home="ledger" onTab={(t) => (t === 'split' ? props.onSplit?.() : setTab(t))} actions={actions} ready={ready} screen="ledger" mast={mast}>
      {tab === 'ledger' ? (
        <>
          <section class="block hero">
            <div class="kicker">Saved to date</div>
            <p class={`hero-num ${scale}`}>
              <sup>{symbol(state.currency)}</sup><span data-field="saved">{savedText}</span>{scale ? null : <span class="c">.00</span>}
            </p>
            <div class="of">
              <span>Goal <b>{formatMoney(ledger.goal, state.currency)}</b> · {sentence(ruleChip(state))}</span>
              <b data-field="progress">{ledger.progress.toFixed(1)}%</b>
            </div>
            <div class="track">
              <span style={{ width: `${Math.min(100, ledger.progress)}%` }} />
              <u style={{ left: `${todayAt}%` }} />
            </div>
            <div class="track-meta">
              <span>Wk 01</span>
              <span class="mid">▲ Today · wk {pad2(ledger.currentWeek)}</span>
              <span>Wk 52</span>
            </div>
          </section>
          <Stats
            columns={3}
            items={[
              { label: 'Week', value: String(ledger.currentWeek), unit: '/ 52', field: 'week' },
              { label: 'Streak', value: String(ledger.streak), unit: ledger.streak === 1 ? 'week' : 'weeks', field: 'streak' },
              { label: 'Next deposit', value: ledger.nextWeek ? formatMoney(ledger.nextAmount, state.currency) : '—', unit: ledger.nextWeek ? `wk ${ledger.nextWeek}` : undefined, field: 'next' },
            ]}
          />
          <Section title="The year at a glance" aside={<Legend />}>
            <div class="weeks">
              {[0, 1, 2, 3].flatMap((row) => [
                <span class="row-label" key={`l${row}`}>Q{row + 1}</span>,
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
                    >
                      {week}
                    </button>
                  )
                }),
              ])}
            </div>
            <div class="readout">
              <span>{focused ? `Week ${pad2(focused.week)} · ${focused.timing} · ${formatMoney(focused.amount, state.currency)}` : 'Tap a week to mark it'}</span>
              <span data-field="missed">{ledger.missed} missed</span>
            </div>
          </Section>
          <Section title="Recent entries" aside={<button type="button" class="text-btn" onClick={() => setTab('history')}>All →</button>}>
            {recent.length === 0 ? <Empty title="No marks yet" body="Tap a week in the grid, or log this week below." /> : recent.map((entry) => (
              <Entry key={entry.week} entry={entry} currency={state.currency} onClick={() => setTab('history')} />
            ))}
          </Section>
        </>
      ) : null}

      {tab === 'history' ? <History entries={history} currency={state.currency} onToggle={onCell} /> : null}

      {tab === 'circle' ? (
        <>
          <Section title="Progress card" aside="PNG · 1080×1350">
            <p class="note">A still of the ledger, rendered on this device.</p>
            <div class="card-frame">
              {card ? <img src={card.url} alt="Budget Better progress card" /> : <p class="loading">Rendering the card</p>}
            </div>
            {note ? <p class="status" data-field="share-note">{note}</p> : null}
          </Section>
          <Section title="The line">
            <p class="copy">{progressCaption(savedText, progressLabel(ledger, state.currency), ledger.currentWeek)}</p>
            <button type="button" class="text-btn" onClick={() => void onCopy()}>Copy line</button>
          </Section>
        </>
      ) : null}

      {tab === 'settings' ? (
        <Settings
          state={state}
          ledgerWeek={ledger.currentWeek}
          ledgerGoal={ledger.goal}
          place={place}
          sync={api.current ? sync : null}
          reminder={server?.reminder ?? null}
          onReminder={saveReminder}
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
  invite: () => void,
): Action[] {
  if (tab === 'ledger') {
    if (!ledger.nextWeek) return [{ label: 'Challenge complete', disabled: true, mark: 'none' }]
    return [{ label: `Log week ${ledger.nextWeek}`, aside: formatMoney(ledger.nextAmount, currency), onClick: log }]
  }
  if (tab === 'history') return [{ label: 'Share progress', onClick: toCircle }]
  if (tab === 'circle') {
    return [
      { label: 'Share the card', aside: 'PNG', onClick: share },
      { label: 'Share with a friend', onClick: invite, tone: 'ghost' },
      { label: 'Download PNG', onClick: download, tone: 'ghost' },
    ]
  }
  return []
}

function Legend() {
  return (
    <span class="legend">
      <span><i class="swatch paid" />paid</span>
      <span><i class="swatch due" />due</span>
      <span><i class="swatch missed" />missed</span>
    </span>
  )
}

function Entry(props: { entry: WeekEntry; currency: Currency; onClick: () => void }) {
  const { entry } = props
  const when = entry.paidOn ? formatDay(parseISODate(entry.paidOn)) : entry.dueLabel
  return (
    <button type="button" class="entry" onClick={props.onClick}>
      <span class="entry-id">{pad2(entry.week)}</span>
      <span>
        <span class="entry-amt">{formatMoney(entry.amount, props.currency)}</span>
        <span class="entry-sub">{when} · {entry.timing.toLowerCase()}</span>
      </span>
      <span class="entry-mark">{entry.status === 'paid' ? <Check /> : <span class="k">{entry.status}</span>}</span>
    </button>
  )
}

function History(props: { entries: WeekEntry[]; currency: Currency; onToggle: (week: number) => void }) {
  if (props.entries.length === 0) return <Empty title="No marks" body="The grid is clear. Log a week from the ledger." />
  const groups: Array<{ label: string; rows: WeekEntry[] }> = []
  for (const entry of props.entries) {
    const label = formatMonth(parseISODate(entry.due))
    const last = groups[groups.length - 1]
    if (!last || last.label !== label) groups.push({ label, rows: [entry] })
    else last.rows.push(entry)
  }
  return (
    <>
      <Section title="Marks" aside={`${props.entries.filter((entry) => entry.status === 'paid').length} paid`}>
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

function Onboarding(props: { onOpen: (next: BudgetState) => void }) {
  const [variant, setVariant] = useState<Variant>('classic')
  const [multiplier, setMultiplier] = useState(1)
  const [customAmount, setCustomAmount] = useState(25)
  const [currency, setCurrency] = useState<Currency>('EUR')
  const [startDate, setStartDate] = useState(() => toISODate(startOfDay(new Date())))
  const draft = createEmpty(new Date(), { variant, multiplier, customAmount, currency, startDate })
  const preview = derive(draft)
  const sample = weekAmount(draft, preview.currentWeek)

  return (
    <Shell
      theme="budget"
      title="Budget Better"
      tabs={[]}
      active="ledger"
      home="ledger"
      onTab={() => undefined}
      screen="onboarding"
      mast={['The 52-week ledger', 'New ledger']}
      actions={[{
        label: 'Open the ledger',
        testId: 'open-ledger',
        onClick: () => {
          haptic('success')
          props.onOpen(draft)
        },
      }]}
    >
      <Section title="The rule">
        <div class="choices">
          {(['classic', 'reverse', 'custom'] as const).map((item) => (
            <button key={item} type="button" class="choice" aria-pressed={variant === item} onClick={() => { haptic('select'); setVariant(item) }}>
              {item}
            </button>
          ))}
        </div>
        {variant === 'custom' ? (
          <div class="field">
            <span class="k">Weekly amount</span>
            <span class="stepper">
              <button type="button" aria-label="Decrease amount" onClick={() => setCustomAmount((value) => Math.max(1, value - 5))}>−</button>
              <strong>{formatMoney(customAmount, currency)}</strong>
              <button type="button" aria-label="Increase amount" onClick={() => setCustomAmount((value) => value + 5)}>+</button>
            </span>
          </div>
        ) : (
          <div class="field">
            <span class="k">Multiplier</span>
            <span class="stepper">
              <button type="button" aria-label="Decrease multiplier" onClick={() => setMultiplier((value) => stepUnit(value, -1))}>−</button>
              <strong>×{multiplier}</strong>
              <button type="button" aria-label="Increase multiplier" onClick={() => setMultiplier((value) => stepUnit(value, 1))}>+</button>
            </span>
          </div>
        )}
        <p class="rule" data-field="preview">{ruleLine(draft)} Week {preview.currentWeek} saves {formatMoney(sample, currency)}. The year comes to {formatMoney(preview.goal, currency)}.</p>
      </Section>
      <Section title="Currency">
        <div class="currencies">
          {CURRENCIES.map((code) => (
            <button key={code} type="button" class="choice" aria-pressed={currency === code} onClick={() => { haptic('select'); setCurrency(code) }}>
              {symbol(code)} {code}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Start">
        <label class="field">
          <span class="k">Start date</span>
          <input
            type="date"
            data-field="start"
            value={startDate}
            onInput={(event) => {
              const value = event.currentTarget.value
              if (/^\d{4}-\d{2}-\d{2}$/.test(value)) setStartDate(value)
            }}
          />
        </label>
        <p class="note">Week 1 begins on this date. The ledger opens empty.</p>
      </Section>
    </Shell>
  )
}

function Settings(props: {
  state: BudgetState
  ledgerWeek: number
  ledgerGoal: number
  place: RecordPlace
  sync: SyncState | null
  reminder: Reminder | null
  onReminder: (r: Reminder) => Promise<string | null>
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
      <Section title="The rule">
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
      <Section title="Currency">
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
      <Section title="Calendar">
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
      {props.sync ? <ReminderSection reminder={props.reminder} onSave={props.onReminder} /> : null}
      <Section title="Record" aside={props.sync ? SYNC_LABEL[props.sync] : placeLabel(props.place)}>
        <p class="note">{props.sync
          ? 'Your ledger lives in the bot: marks from the app show in the chat and the reminders, and the other way round.'
          : 'Outside Telegram the ledger stays on this device. Inside Telegram it also writes to CloudStorage.'}</p>
      </Section>
      <Section title="Reset">
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

interface Reminder { enabled: boolean; weekday: number | null; hour: number | null; minute: number; timezone?: string | null }
interface ServerInfo { state: unknown; skipped: number[]; reminder: Reminder; currencyRaw: string | null; referrals: number; refLink: string; shareUrl: string; bot: string }
type SyncState = 'local' | 'saving' | 'synced' | 'offline'
const SYNC_LABEL: Record<SyncState, string> = { local: 'THIS DEVICE', saving: 'SAVING', synced: 'SYNCED WITH THE BOT', offline: 'OFFLINE · WILL RETRY' }
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function zoneName(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
}

function ReminderSection(props: { reminder: Reminder | null; onSave: (r: Reminder) => Promise<string | null> }) {
  const current = props.reminder
  const [day, setDay] = useState<number>(current?.weekday ?? 6)
  const [hour, setHour] = useState<number>(current?.hour ?? 19)
  const [error, setError] = useState<string | null>(null)
  const enabled = Boolean(current?.enabled)
  const changed = !enabled || day !== current?.weekday || hour !== current?.hour
  async function save(next: Reminder) {
    setError(await props.onSave(next))
  }
  return (
    <Section title="Weekly reminder" aside={enabled ? `${DAYS[current!.weekday ?? 0]} ${pad2(current!.hour ?? 0)}:${pad2(current!.minute ?? 0)}` : 'Off'}>
      <div class="picks-wrap" role="group" aria-label="Day">
        {DAYS.map((label, index) => (
          <button type="button" class="choice" key={label} aria-pressed={day === index} data-day={index} onClick={() => { haptic('select'); setDay(index) }}>{label}</button>
        ))}
      </div>
      <div class="field">
        <span class="k">Time</span>
        <span class="stepper">
          <button type="button" aria-label="Earlier" onClick={() => setHour((h) => (h + 23) % 24)}>−</button>
          <strong data-field="remind-hour">{pad2(hour)}:00</strong>
          <button type="button" aria-label="Later" onClick={() => setHour((h) => (h + 1) % 24)}>+</button>
        </span>
      </div>
      <div class="field">
        <span class="k">{enabled ? 'The bot nudges you if the week is not marked' : 'Get a nudge from the bot'}</span>
        <span>
          {changed ? <button type="button" class="text-btn" data-action="remind-save" onClick={() => void save({ enabled: true, weekday: day, hour, minute: 0 })}>{enabled ? 'SAVE' : 'TURN ON'}</button> : null}
          {enabled ? <>{changed ? '  ·  ' : ''}<button type="button" class="text-btn danger" data-action="remind-off" onClick={() => void save({ enabled: false, weekday: current!.weekday, hour: current!.hour, minute: 0 })}>TURN OFF</button></> : null}
        </span>
      </div>
      {error ? <p class="note danger">{error}</p> : null}
    </Section>
  )
}
