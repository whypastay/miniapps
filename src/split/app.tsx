/* Ledger Split — who owes whom, inside the Budget Better Mini App. */
import type { ComponentChildren } from 'preact'
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { Api, ApiError, connect, copyText, discoverBase, openLink, requestWriteAccess, startParam } from '../api.ts'
import { formatShort, pad2, parseISODate } from '../format.ts'
import { haptic } from '../telegram.ts'
import { BUDGET_GUIDE, GuideScope } from '../guide.tsx'
import { Empty, Section, Shell, Stats, type Action } from '../ui.tsx'
import {
  balanceLine, currencyCodes, decimals, FEATURED, firstName, majorString, money, previewSplit, setCurrencies, toMinor,
  type Expense, type Group, type Invite, type ListResponse, type Member, type PublicSummary,
} from './model.ts'

type View = 'loading' | 'list' | 'new' | 'join' | 'group' | 'expense' | 'settle' | 'public' | 'fatal'
const TABS = [
  { id: 'ledger', label: 'Ledger', icon: 'ledger' as const },
  { id: 'balances', label: 'Balances', icon: 'bars' as const },
  { id: 'people', label: 'People', icon: 'people' as const },
  { id: 'settings', label: 'Settings', icon: 'gear' as const },
]

interface Target { join?: string; pub?: string; group?: number; fresh?: boolean }
export function splitTarget(): Target | null {
  const sp = startParam() ?? ''
  const q = new URLSearchParams(location.search)
  if (sp.startsWith('sp_')) return { join: sp.slice(3) }
  if (sp.startsWith('ss_')) return { pub: sp.slice(3) }
  if (sp.startsWith('sg_')) return { group: Number(sp.slice(3)) || undefined }
  if (sp === 'split_new') return { fresh: true }
  if (sp === 'split') return {}
  if (q.get('sj')) return { join: q.get('sj')! }
  if (q.get('ss')) return { pub: q.get('ss')! }
  const s = q.get('split')
  if (s === null) return null
  if (s === 'new') return { fresh: true }
  return /^\d+$/.test(s) && s !== '1' ? { group: Number(s) } : {}
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function dayLabel(iso: string | null): string {
  if (!iso) return ''
  return formatShort(parseISODate(iso)).toUpperCase()
}
function toneClass(v: number): string { return v > 0 ? 'tone-up' : v < 0 ? 'tone-down' : 'tone-even' }

type Runner = <T>(fn: () => Promise<T>, ok?: string) => Promise<T | null>

export function SplitApp(props: { onLedger?: () => void }) {
  const [view, setView] = useState<View>('loading')
  const [api, setApi] = useState<Api | null>(null)
  const [list, setList] = useState<ListResponse | null>(null)
  const [group, setGroup] = useState<Group | null>(null)
  const [tab, setTab] = useState('ledger')
  const [invite, setInvite] = useState<Invite | null>(null)
  const [inviteCode, setInviteCode] = useState('')
  const [pub, setPub] = useState<PublicSummary | null>(null)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [settle, setSettle] = useState<{ from: number; to: number; amount: number; currency: string } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [fatal, setFatal] = useState('')

  const say = useCallback((text: string | null) => {
    setToast(text)
    if (text) window.setTimeout(() => setToast((cur) => (cur === text ? null : cur)), 3800)
  }, [])
  const run: Runner = useCallback(async (fn, ok) => {
    setBusy(true)
    try {
      const out = await fn()
      if (ok) { say(ok); haptic('success') }
      return out
    } catch (err) {
      say(err instanceof ApiError ? err.message : 'Something went wrong. Try again.')
      haptic('warning')
      return null
    } finally { setBusy(false) }
  }, [say])

  const showGroup = (g: Group, t?: string) => { setCurrencies(g.currencies); setGroup(g); if (t) setTab(t); setView('group') }

  useEffect(() => {
    let cancel = false
    void (async () => {
      const target = splitTarget() ?? {}
      if (target.pub) {
        try {
          const base = await discoverBase()
          if (!base) throw new ApiError(0, 'offline', 'The summary could not be loaded. Try again in a minute.')
          const s = await new Api('budget', base, '').get<PublicSummary>(`/split/public/${encodeURIComponent(target.pub)}`)
          if (cancel) return
          setCurrencies(s.currencies); setPub(s); setView('public')
        } catch (err) {
          if (!cancel) { setFatal(err instanceof ApiError ? err.message : 'The summary could not be loaded.'); setView('fatal') }
        }
        return
      }
      const client = await connect('budget')
      if (cancel) return
      if (!client) { setFatal('Open Ledger Split from the Budget Better bot in Telegram.'); setView('fatal'); return }
      setApi(client)
      try {
        const l = await client.get<ListResponse>('/split')
        if (cancel) return
        setCurrencies(l.currencies); setList(l)
        if (target.join) {
          const inv = await client.get<Invite>(`/split/invite/${encodeURIComponent(target.join)}`).catch((e) => { throw e })
          if (cancel) return
          if (inv.member) { showGroup(await client.get<Group>(`/split/${inv.id}`)); return }
          setInvite(inv); setInviteCode(target.join); setView('join'); return
        }
        const open = target.group && l.groups.some((g) => g.id === target.group) ? target.group
          : !target.fresh && l.groups.length === 1 ? l.groups[0].id : undefined
        if (open) { showGroup(await client.get<Group>(`/split/${open}`)); return }
        setView(target.fresh || !l.groups.length ? 'new' : 'list')
      } catch (err) {
        if (cancel) return
        setFatal(err instanceof ApiError ? err.message : 'The bot did not answer.'); setView('fatal')
      }
    })()
    return () => { cancel = true }
  }, [])

  const toList = useCallback(() => {
    setGroup(null); setEditing(null); setSettle(null); setView('list'); setTab('ledger')
    if (api) void api.get<ListResponse>('/split').then(setList).catch(() => undefined)
  }, [api])

  const launched = useRef(splitTarget())
  const hint = launched.current?.join
    ? 'You were invited to a shared ledger. Join below — the short guide is under ? if you want it later.'
    : launched.current?.pub
      ? 'This is a public summary. Start your own from the button below, or open ? for a short guide.'
      : null
  const guide = (node: ComponentChildren) => (
    <GuideScope theme="budget" spec={BUDGET_GUIDE} api={api} ready={view !== 'loading'} onboarded={Boolean(list?.onboarded)} hint={hint} gate={list?.gate} publicPage={view === 'public'}>
      {node}
    </GuideScope>
  )

  /* ------------------------------------------------------------ screens */
  if (view === 'loading') {
    return guide(<Shell theme="budget" title="Ledger Split" tabs={[]} active="x" home="x" onTab={() => undefined} ready={false} screen="split-loading" mast={['Ledger Split', 'Reading']}>
      <p class="loading">Reading your groups</p>
    </Shell>)
  }
  if (view === 'fatal') {
    return guide(<Shell theme="budget" title="Ledger Split" tabs={[]} active="x" home="x" onTab={() => undefined} ready screen="split-error" mast={['Ledger Split', 'Offline']}
      actions={[{ label: 'Try again', testId: 'retry', onClick: () => location.reload() }]}>
      <Section title="Not available right now"><p class="note">{fatal}</p></Section>
    </Shell>)
  }
  if (view === 'public' && pub) return guide(<PublicScreen pub={pub} />)
  if (!api) return guide(null)

  if (view === 'join' && invite) {
    return guide(<JoinScreen invite={invite} busy={busy} toast={toast}
      onJoin={(claim) => void run(() => api.post<Group>('/split/join', { code: inviteCode, claim }), 'You are in.').then((g) => { if (g) { showGroup(g, 'ledger'); void requestWriteAccess() } })}
      onBack={list?.groups.length ? toList : undefined} />)
  }
  if (view === 'new') {
    return guide(<NewGroup busy={busy} toast={toast} hasGroups={Boolean(list?.groups.length)} onCancel={toList} onLedger={props.onLedger}
      onCreate={(body) => void run(() => api.post<Group>('/split', body), 'Group created. Invite people next.').then((g) => { if (g) { showGroup(g, 'people'); void requestWriteAccess() } })} />)
  }
  if (view === 'expense' && group) {
    return guide(<ExpenseForm group={group} expense={editing} busy={busy} toast={toast}
      onCancel={() => { setEditing(null); setView('group') }}
      onSave={(body) => void run(() => editing ? api.put<Group>(`/split/${group.id}/expenses/${editing.id}`, body) : api.post<Group>(`/split/${group.id}/expenses`, body),
        editing ? 'Expense updated.' : 'Expense added.').then((g) => { if (g) { setEditing(null); showGroup(g, 'ledger') } })}
      onDelete={editing ? () => void run(() => api.del<Group>(`/split/${group.id}/expenses/${editing.id}`), editing.kind === 'settle' ? 'Payment removed.' : 'Expense deleted.').then((g) => { if (g) { setEditing(null); showGroup(g) } }) : undefined} />)
  }
  if (view === 'settle' && group && settle) {
    return guide(<SettleForm group={group} draft={settle} busy={busy} toast={toast} onCancel={() => setView('group')}
      onSave={(body) => void run(() => api.post<Group>(`/split/${group.id}/settle`, body), 'Payment recorded.').then((g) => { if (g) { setSettle(null); showGroup(g, 'balances') } })} />)
  }
  if (view === 'group' && group) {
    return guide(<GroupScreen group={group} tab={tab} setTab={setTab} busy={busy} toast={toast} run={run} api={api} say={say}
      onGroup={(g) => showGroup(g)} onBack={toList}
      onAdd={() => { setEditing(null); setView('expense') }}
      onEdit={(e) => { setEditing(e); setView('expense') }}
      onSettle={(d) => { setSettle(d); setView('settle') }} />)
  }
  // list
  const groups = list?.groups ?? []
  const actions: Action[] = [{ label: 'New group', testId: 'split-new', onClick: () => setView('new') }]
  if (props.onLedger) actions.push({ label: 'Back to the 52-week ledger', tone: 'ghost', onClick: props.onLedger })
  return guide((
    <Shell theme="budget" title="Ledger Split" tabs={[]} active="list" home="list" onTab={() => undefined} ready screen="split-list"
      mast={['Ledger Split', `${groups.length} ${groups.length === 1 ? 'group' : 'groups'}`]} actions={actions} toast={toast} onBack={props.onLedger}>
      <div class="split-hero">
        <div class="kicker">Who owes whom</div>
        <p class="split-lede">Trips, flats, dinners. Add what you paid; the ledger works out the fewest transfers to settle.</p>
      </div>
      <Section title="Your groups" aside={`${groups.length}`}>
        {groups.length ? groups.map((g, i) => {
          const b = balanceLine(g.myBalance)
          const spent = Object.entries(g.totals).map(([c, v]) => money(v, c)).join(' · ') || 'Nothing yet'
          return (
            <button type="button" class="row split-row" key={g.id} data-group={g.id}
              onClick={() => { haptic('tap'); void run(() => api.get<Group>(`/split/${g.id}`)).then((v) => v && showGroup(v, 'ledger')) }}>
              <span class="row-idx">{pad2(i + 1)}</span>
              <span><span class="row-title">{g.name}</span><span class="row-sub">{g.members} people · {spent}</span></span>
              <span class={`split-bal ${b.tone === 'up' ? 'tone-up' : b.tone === 'down' ? 'tone-down' : 'tone-even'}`}>{b.text}</span>
            </button>
          )
        }) : <Empty title="No groups yet" body="Start one for a trip or a flat, then send the invite link." />}
      </Section>
      <p class="note">In a group chat, add @{list?.bot ?? 'the bot'} and send /split: everyone gets the same ledger.</p>
    </Shell>
  ))
}

/* ------------------------------------------------------------------ new group */
function CurrencyPick(props: { value: string; onChange: (c: string) => void; field: string }) {
  const others = currencyCodes().filter((c) => !FEATURED.includes(c))
  return (
    <div class="cur-pick">
      <div class="choices cur-grid" role="group">
        {FEATURED.map((c) => (
          <button type="button" class="choice" key={c} aria-pressed={props.value === c} data-cur={c} onClick={() => { haptic('select'); props.onChange(c) }}>{c}</button>
        ))}
      </div>
      <label class="field">
        <span class="k">Other currency</span>
        <select value={others.includes(props.value) ? props.value : ''} data-field={props.field} onChange={(e) => e.currentTarget.value && props.onChange(e.currentTarget.value)}>
          <option value="">—</option>
          {others.map((c) => <option value={c} key={c}>{c}</option>)}
        </select>
      </label>
    </div>
  )
}

function guessCurrency(): string {
  const region = (navigator.language || 'en-US').toUpperCase().split('-')[1] ?? ''
  const map: Record<string, string> = { IN: 'INR', PH: 'PHP', NG: 'NGN', GB: 'GBP', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', RU: 'RUB', ID: 'IDR', BR: 'BRL', MX: 'MXN', TR: 'TRY', UA: 'UAH', KZ: 'KZT' }
  return map[region] ?? 'USD'
}

function NewGroup(props: { busy: boolean; toast: string | null; hasGroups: boolean; onCancel: () => void; onLedger?: () => void; onCreate: (b: unknown) => void }) {
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState(guessCurrency())
  const [person, setPerson] = useState('')
  const [people, setPeople] = useState<string[]>([])
  const add = () => { const p = person.trim(); if (p && !people.includes(p) && people.length < 30) { setPeople([...people, p]); setPerson(''); haptic('tap') } }
  const actions: Action[] = [{ label: props.busy ? 'Creating' : 'Create group', testId: 'split-create', disabled: props.busy || !name.trim(), onClick: () => props.onCreate({ name: name.trim(), currency, people }) }]
  if (props.hasGroups) actions.push({ label: 'Back to my groups', tone: 'ghost', onClick: props.onCancel })
  else if (props.onLedger) actions.push({ label: 'Back to the 52-week ledger', tone: 'ghost', onClick: props.onLedger })
  return (
    <Shell theme="budget" title="Ledger Split" tabs={[]} active="new" home="new" onTab={() => undefined} ready screen="split-new"
      mast={['Ledger Split', 'New group']} actions={actions} toast={props.toast} onBack={props.hasGroups ? props.onCancel : props.onLedger}>
      <Section title="Start a group">
        <label class="field stack"><span class="k">Name</span>
          <input type="text" maxLength={48} value={name} placeholder="Goa, December" data-field="split-name" onInput={(e) => setName(e.currentTarget.value)} /></label>
      </Section>
      <Section title="Currency" aside={currency}>
        <CurrencyPick value={currency} onChange={setCurrency} field="split-currency-other" />
        <p class="note">Each expense can use another currency. Balances stay per currency; nothing is converted behind your back.</p>
      </Section>
      <Section title="Who's in" aside={`${people.length + 1}`}>
        <div class="person-add">
          <input type="text" maxLength={40} value={person} placeholder="Add a name, e.g. Anya" data-field="split-person"
            onInput={(e) => setPerson(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
          <button type="button" class="text-btn" data-action="split-add-person" disabled={!person.trim()} onClick={add}>ADD</button>
        </div>
        <div class="picks-wrap">
          <span class="chip is-you">You</span>
          {people.map((p) => <button type="button" class="chip" key={p} onClick={() => setPeople(people.filter((x) => x !== p))}>{p} ✕</button>)}
        </div>
        <p class="note">Optional. People you add by name can claim their name when they open the invite.</p>
      </Section>
    </Shell>
  )
}

/* ------------------------------------------------------------------ join */
function JoinScreen(props: { invite: Invite; busy: boolean; toast: string | null; onJoin: (claim?: number) => void; onBack?: () => void }) {
  const inv = props.invite
  const [claim, setClaim] = useState<number | undefined>(undefined)
  const who = claim ? inv.placeholders.find((p) => p.id === claim)?.name : undefined
  return (
    <Shell theme="budget" title="Ledger Split" tabs={[]} active="join" home="join" onTab={() => undefined} ready screen="split-join"
      mast={['Invitation', inv.currency]} toast={props.toast} onBack={props.onBack}
      actions={[{ label: props.busy ? 'Joining' : who ? `Join as ${who}` : 'Join the group', testId: 'split-join', disabled: props.busy, onClick: () => props.onJoin(claim) }]}>
      <div class="split-hero">
        <div class="kicker">You're invited to</div>
        <h2 class="split-title">{inv.name}</h2>
        <p class="split-lede">{inv.people.length ? `${inv.people.join(', ')} ${inv.people.length === 1 ? 'is' : 'are'} already in.` : 'Be the first to join.'}</p>
      </div>
      {inv.placeholders.length ? (
        <Section title="Are you one of these?">
          <p class="note">Someone added these names before they joined. Pick yours so past expenses land on you.</p>
          <div class="picks-wrap">
            {inv.placeholders.map((p) => (
              <button type="button" class="choice" key={p.id} aria-pressed={claim === p.id} data-claim={p.id}
                onClick={() => { haptic('select'); setClaim(claim === p.id ? undefined : p.id) }}>{p.name}</button>
            ))}
            <button type="button" class="choice" aria-pressed={claim === undefined} onClick={() => setClaim(undefined)}>None, I'm new</button>
          </div>
        </Section>
      ) : null}
      <p class="note">Everyone in the group sees the expenses and balances. Only you can change your notifications.</p>
    </Shell>
  )
}

/* ------------------------------------------------------------------ group */
function GroupScreen(props: {
  group: Group; tab: string; setTab: (t: string) => void; busy: boolean; toast: string | null; run: Runner; api: Api; say: (t: string | null) => void
  onGroup: (g: Group) => void; onBack: () => void; onAdd: () => void; onEdit: (e: Expense) => void
  onSettle: (d: { from: number; to: number; amount: number; currency: string }) => void
}) {
  const { group: g, tab, api, run } = props
  const byId = useMemo(() => new Map(g.members.map((m) => [m.id, m])), [g])
  const nameOf = (id: number) => { const m = byId.get(id); return m ? (m.you ? 'You' : firstName(m.name)) : '—' }
  const update = (v: Group | null) => { if (v) props.onGroup(v) }
  const [person, setPerson] = useState('')
  const [edit, setEdit] = useState({ name: g.name, currency: g.currency })
  useEffect(() => setEdit({ name: g.name, currency: g.currency }), [g.name, g.currency])
  const active = g.members.filter((m) => !m.left)

  let actions: Action[] = []
  if (tab === 'ledger') {
    actions = [{ label: 'Add expense', testId: 'split-add', onClick: props.onAdd }]
    if (g.plan.length) actions.push({ label: 'Settle up', tone: 'ghost', testId: 'split-to-settle', onClick: () => props.setTab('balances') })
  } else if (tab === 'balances') {
    actions = g.plan.length
      ? [{ label: 'Record a payment', testId: 'split-pay', onClick: () => { const p = g.plan[0]; props.onSettle({ from: p.from, to: p.to, amount: p.amount, currency: p.currency }) } }]
      : [{ label: 'Add expense', testId: 'split-add', onClick: props.onAdd }]
  } else if (tab === 'people') {
    actions = [{ label: 'Invite people', testId: 'split-invite', onClick: () => { haptic('tap'); openLink(g.shareUrl) } }]
  } else if (tab === 'settings') {
    const dirty = edit.name.trim() !== g.name || edit.currency !== g.currency
    actions = dirty
      ? [{ label: 'Save changes', testId: 'split-save', disabled: props.busy || !edit.name.trim(), onClick: () => void run(() => api.patch<Group>(`/split/${g.id}`, { name: edit.name.trim(), currency: edit.currency }), 'Saved.').then(update) }]
      : [{ label: 'Back to my groups', tone: 'ghost', onClick: props.onBack }]
  }

  // hero: my position in the group currency first, then any other currency
  const mine = Object.entries(g.myBalance)
  const main = mine.find(([c]) => c === g.currency) ?? mine[0]
  const rest = mine.filter((x) => x !== main)
  const heroKicker = !main ? 'All square' : main[1] > 0 ? 'You are owed' : 'You owe'
  const spent = g.totals[g.currency] ?? 0

  return (
    <Shell theme="budget" title="Ledger Split" tabs={TABS} active={tab} home="ledger" onTab={props.setTab} actions={actions} ready
      screen={`split-${tab}`} mast={[g.name, `${active.length} people · ${g.currency}`]} toast={props.toast} onBack={props.onBack}>
      {tab === 'ledger' ? (
        <>
          <div class="hero split-pos">
            <div class="kicker">{heroKicker}</div>
            <div class={`hero-num ${main && money(main[1], main[0], { abs: true }).length > 7 ? 'xs' : 'sm'} ${main ? toneClass(main[1]) : ''}`} data-field="split-my-balance">
              {main ? money(main[1], main[0], { abs: true }) : money(0, g.currency)}
            </div>
            {rest.length ? <div class="of">{rest.map(([c, v]) => <span key={c} class={toneClass(v)}>{money(v, c, { sign: true })}</span>)}</div> : null}
          </div>
          <Stats columns={3} items={[
            { label: 'Group spent', value: money(spent, g.currency), small: true, field: 'split-spent' },
            { label: 'Expenses', value: String(g.expenses.filter((e) => e.kind === 'expense').length), small: true },
            { label: 'To settle', value: g.plan.length ? `${g.plan.length} ${g.plan.length === 1 ? 'transfer' : 'transfers'}` : 'None', small: true },
          ]} />
          <Section title="Expenses" aside={g.expenseCount > g.expenses.length ? `latest ${g.expenses.length}` : `${g.expenses.length}`}>
            {g.expenses.length ? g.expenses.map((e) => <ExpenseRow key={e.id} e={e} nameOf={nameOf} me={g.me} onClick={() => props.onEdit(e)} />)
              : <Empty title="Nothing logged" body="Add the first expense: who paid, how much, and who shares it." />}
          </Section>
        </>
      ) : null}

      {tab === 'balances' ? (
        <>
          <Section title="Settle up" aside={g.plan.length ? `${g.plan.length} ${g.plan.length === 1 ? 'transfer' : 'transfers'}` : 'square'}>
            {g.plan.length ? (
              <>
                <p class="note">The fewest transfers that clear every balance. Mark one paid when the money has moved.</p>
                {g.plan.map((p, i) => (
                  <article class="row transfer" key={`${p.currency}-${p.from}-${p.to}`} data-transfer={i}>
                    <span class="row-idx">{pad2(i + 1)}</span>
                    <span><span class="row-title">{nameOf(p.from)} <span class="arrow">→</span> {nameOf(p.to)}</span>
                      <span class="row-sub mono">{money(p.amount, p.currency)}</span></span>
                    <button type="button" class="text-btn" data-action="split-mark-paid" onClick={() => props.onSettle({ from: p.from, to: p.to, amount: p.amount, currency: p.currency })}>MARK PAID</button>
                  </article>
                ))}
              </>
            ) : <Empty title="All square" body="Nobody owes anything. New expenses show up here." />}
          </Section>
          <Section title="Balances">
            {active.map((m, i) => {
              const b = balanceLine(m.balance)
              const paid = Object.entries(m.paid).map(([c, v]) => money(v, c)).join(' · ')
              return (
                <article class={m.you ? 'row is-you' : 'row'} key={m.id}>
                  <span class="row-idx">{pad2(i + 1)}</span>
                  <span><span class="row-title">{m.you ? `${m.name} (you)` : m.name}</span><span class="row-sub">{paid ? `Paid ${paid}` : 'Paid nothing yet'}</span></span>
                  <span class={`split-bal ${b.tone === 'up' ? 'tone-up' : b.tone === 'down' ? 'tone-down' : 'tone-even'}`} data-member-balance={m.id}>{b.text}</span>
                </article>
              )
            })}
            <p class="note">Plus means the group owes them. Currencies are kept apart, without exchange rates.</p>
          </Section>
        </>
      ) : null}

      {tab === 'people' ? (
        <>
          <Section title="People" aside={`${active.length}`}>
            {active.map((m, i) => (
              <article class={m.you ? 'row is-you' : 'row'} key={m.id}>
                <span class="row-idx">{pad2(i + 1)}</span>
                <span><span class="row-title">{m.name}</span><span class="row-sub">{m.you ? 'You' : m.joined ? (m.owner ? 'Owner · joined' : 'Joined') : 'Not joined yet · send the invite'}</span></span>
                {m.removable && !m.you && (!m.joined || g.owner) ? (
                  <button type="button" class="text-btn danger" onClick={() => void run(() => api.del<Group>(`/split/${g.id}/members`, { id: m.id }), `${firstName(m.name)} removed.`).then(update)}>REMOVE</button>
                ) : <span class="row-side">{m.owner ? 'OWNER' : ''}</span>}
              </article>
            ))}
            <div class="person-add">
              <input type="text" maxLength={40} value={person} placeholder="Add someone by name" data-field="split-person"
                onInput={(e) => setPerson(e.currentTarget.value)} />
              <button type="button" class="text-btn" data-action="split-add-person" disabled={!person.trim() || props.busy}
                onClick={() => void run(() => api.post<Group>(`/split/${g.id}/members`, { name: person.trim() })).then((v) => { if (v) { setPerson(''); update(v) } })}>ADD</button>
            </div>
          </Section>
          <Section title="Invite">
            <div class="field"><span class="k">Invite link</span>
              <span class="link-actions">
                <button type="button" class="text-btn" data-action="split-copy-invite" onClick={() => void copyText(g.inviteLink).then((ok) => props.say(ok ? 'Invite link copied.' : g.inviteLink))}>COPY</button>
                <button type="button" class="text-btn" onClick={() => openLink(g.shareUrl)}>SEND</button>
              </span></div>
            <div class="field"><span class="k">Read-only summary</span>
              <span class="link-actions">
                <button type="button" class="text-btn" data-action="split-copy-summary" onClick={() => void copyText(g.publicLink).then((ok) => props.say(ok ? 'Summary link copied.' : g.publicLink))}>COPY</button>
                <button type="button" class="text-btn" onClick={() => openLink(`https://t.me/share/url?url=${encodeURIComponent(g.publicLink)}&text=${encodeURIComponent(`${g.name}: who owes whom`)}`)}>SEND</button>
              </span></div>
            <p class="note">The summary shows names, balances and the settle-up plan. Not the expense list. No login needed.</p>
          </Section>
        </>
      ) : null}

      {tab === 'settings' ? (
        <>
          <Section title="Group">
            <label class="field stack"><span class="k">Name</span>
              <input type="text" maxLength={48} value={edit.name} data-field="split-edit-name" onInput={(e) => setEdit({ ...edit, name: e.currentTarget.value })} /></label>
            <div class="field stack"><span class="k">Main currency</span>
              <CurrencyPick value={edit.currency} onChange={(currency) => setEdit({ ...edit, currency })} field="split-edit-currency" /></div>
          </Section>
          <Section title="Notifications">
            <div class="field"><span class="k">Message me about new expenses</span>
              <button type="button" class="choice" aria-pressed={g.notify} data-field="split-notify"
                onClick={() => void run(() => api.patch<Group>(`/split/${g.id}`, { notify: !g.notify })).then((v) => { update(v); haptic('select') })}>{g.notify ? 'ON' : 'OFF'}</button></div>
            {g.inChat ? (
              <div class="field"><span class="k">Post updates in the group chat</span>
                <button type="button" class="choice" aria-pressed={g.chatUpdates}
                  onClick={() => void run(() => api.patch<Group>(`/split/${g.id}`, { chatUpdates: !g.chatUpdates })).then(update)}>{g.chatUpdates ? 'ON' : 'OFF'}</button></div>
            ) : null}
          </Section>
          <Section title="Leave">
            <div class="field"><span class="k">Leave this group</span>
              <button type="button" class="text-btn danger" data-action="split-leave" onClick={() => void run(() => api.post(`/split/${g.id}/leave`), 'You left the group.').then((ok) => { if (ok) props.onBack() })}>LEAVE</button></div>
            {g.owner ? (
              <div class="field"><span class="k">Archive for everyone</span>
                <button type="button" class="text-btn danger" data-action="split-archive" onClick={() => void run(() => api.post(`/split/${g.id}/archive`), 'Group archived.').then((ok) => { if (ok) props.onBack() })}>ARCHIVE</button></div>
            ) : null}
            <p class="note">You can leave once your balance is zero.</p>
          </Section>
        </>
      ) : null}
    </Shell>
  )
}

function ExpenseRow(props: { e: Expense; nameOf: (id: number) => string; me: number; onClick: () => void }) {
  const { e } = props
  if (e.kind === 'settle') {
    const to = e.shares[0]?.member
    return (
      <button type="button" class="row exp settle" onClick={props.onClick} data-expense={e.id}>
        <span class="row-idx">{dayLabel(e.date)}</span>
        <span><span class="row-title">{props.nameOf(e.payer)} paid {to ? props.nameOf(to) : ''}</span><span class="row-sub">Payment</span></span>
        <span class="exp-amt"><span class="mono">{money(e.amount, e.currency)}</span><span class="exp-me tone-even">✓ settled</span></span>
      </button>
    )
  }
  const lent = e.payer === props.me ? e.amount - e.mine : 0
  const me = e.payer === props.me ? (lent ? { t: `you lent ${money(lent, e.currency)}`, c: 'tone-up' } : { t: 'just you', c: 'tone-even' })
    : e.mine ? { t: `your share ${money(e.mine, e.currency)}`, c: 'tone-down' } : { t: 'not involved', c: 'tone-even' }
  return (
    <button type="button" class="row exp" onClick={props.onClick} data-expense={e.id}>
      <span class="row-idx">{dayLabel(e.date)}</span>
      <span><span class="row-title">{e.title}</span>
        <span class="row-sub">{props.nameOf(e.payer)} paid · {e.mode === 'equal' ? `split ${e.shares.length} ways` : e.mode === 'shares' ? 'by shares' : 'exact amounts'}</span></span>
      <span class="exp-amt"><span class="mono">{money(e.amount, e.currency)}</span><span class={`exp-me ${me.c}`}>{me.t}</span></span>
    </button>
  )
}

/* ------------------------------------------------------------------ expense form */
function ExpenseForm(props: { group: Group; expense: Expense | null; busy: boolean; toast: string | null; onCancel: () => void; onSave: (b: unknown) => void; onDelete?: () => void }) {
  return props.expense?.kind === 'settle' ? <PaymentView {...props} expense={props.expense} /> : <ExpenseEditor {...props} />
}

function PaymentView(props: { group: Group; expense: Expense; busy: boolean; toast: string | null; onCancel: () => void; onDelete?: () => void }) {
  const g = props.group
  const e = props.expense
  const to = e.shares[0]?.member
  const nm = (id?: number) => g.members.find((m) => m.id === id)?.name ?? '—'
  return (
    <Shell theme="budget" title="Ledger Split" tabs={[]} active="x" home="x" onTab={() => undefined} ready screen="split-payment" mast={[g.name, 'Payment']} toast={props.toast} onBack={props.onCancel}
      actions={[{ label: 'Remove this payment', testId: 'split-delete', disabled: props.busy, onClick: () => props.onDelete?.() }, { label: 'Back', tone: 'ghost', onClick: props.onCancel }]}>
      <Section title="Payment"><div class="field"><span class="k">{nm(e.payer)} → {nm(to)}</span><span class="mono">{money(e.amount, e.currency)}</span></div>
        <p class="note">Remove it if it was recorded by mistake; the debt comes back.</p></Section>
    </Shell>
  )
}

function ExpenseEditor(props: { group: Group; expense: Expense | null; busy: boolean; toast: string | null; onCancel: () => void; onSave: (b: unknown) => void; onDelete?: () => void }) {
  const g = props.group
  const e = props.expense
  const active = g.members.filter((m) => !m.left || e?.shares.some((s) => s.member === m.id) || e?.payer === m.id)
  const [title, setTitle] = useState(e?.title ?? '')
  const [currency, setCurrency] = useState(e?.currency ?? g.currency)
  const [amount, setAmount] = useState(e ? majorString(e.amount, e.currency) : '')
  const [date, setDate] = useState(e?.date ?? todayISO())
  const [payer, setPayer] = useState<number>(e?.payer ?? g.me)
  const [mode, setMode] = useState<'equal' | 'shares' | 'exact'>(e?.mode ?? 'equal')
  const [inSplit, setInSplit] = useState<Set<number>>(() => new Set(e ? e.shares.map((s) => s.member) : active.filter((m) => !m.left).map((m) => m.id)))
  const [weights, setWeights] = useState<Record<number, number>>(() => Object.fromEntries(active.map((m) => [m.id, Number(e?.shares.find((s) => s.member === m.id)?.weight ?? 1) || 1])))
  const [exact, setExact] = useState<Record<number, string>>(() => Object.fromEntries(active.map((m) => {
    const s = e?.shares.find((x) => x.member === m.id)
    return [m.id, s && e?.mode === 'exact' ? majorString(s.share, e.currency) : '']
  })))
  const total = toMinor(amount, currency)
  const ids = active.map((m) => m.id).filter((id) => inSplit.has(id))
  const preview = useMemo(() => {
    if (!total) return new Map<number, number>()
    if (mode === 'exact') return new Map(ids.map((id) => [id, toMinor(exact[id] ?? '', currency) ?? 0]))
    const w = ids.map((id) => (mode === 'equal' ? 1 : weights[id] ?? 0))
    const parts = previewSplit(total, w)
    return new Map(ids.map((id, i) => [id, parts[i]]))
  }, [total, mode, ids.join(','), JSON.stringify(weights), JSON.stringify(exact), currency])
  const assigned = [...preview.values()].reduce((a, b) => a + b, 0)
  const left = total ? total - assigned : 0
  const valid = Boolean(title.trim() && total && ids.length && (mode !== 'exact' || left === 0) && (mode !== 'shares' || ids.some((id) => (weights[id] ?? 0) > 0)))

  function save() {
    const split = ids.map((id) => ({ member: id, value: mode === 'equal' ? null : mode === 'shares' ? weights[id] ?? 0 : exact[id] || '0' }))
    props.onSave({ title: title.trim(), amount, currency, date, payer, mode, split })
  }
  const toggle = (id: number) => { haptic('select'); setInSplit((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n }) }
  const actions: Action[] = [{ label: props.busy ? 'Saving' : e ? 'Save changes' : 'Add expense', testId: 'split-save-expense', disabled: props.busy || !valid, onClick: save }]
  actions.push({ label: 'Cancel', tone: 'ghost', onClick: props.onCancel })

  return (
    <Shell theme="budget" title="Ledger Split" tabs={[]} active="x" home="x" onTab={() => undefined} ready screen="split-expense"
      mast={[g.name, e ? 'Edit expense' : 'New expense']} actions={actions} toast={props.toast} onBack={props.onCancel}>
      <div class="amount-entry">
        <input type="text" inputMode="decimal" class="amount-input" value={amount} placeholder={decimals(currency) ? '0.00' : '0'} maxLength={14} data-field="split-amount"
          onInput={(ev) => setAmount(ev.currentTarget.value.replace(/[^\d.,]/g, ''))} />
        <select class="amount-cur" value={currency} data-field="split-currency" onChange={(ev) => setCurrency(ev.currentTarget.value)}>
          {currencyCodes().map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <label class="field stack"><span class="k">What for</span>
        <input type="text" maxLength={60} value={title} placeholder="Dinner, taxi, groceries…" data-field="split-title" onInput={(ev) => setTitle(ev.currentTarget.value)} /></label>
      <label class="field"><span class="k">Date</span>
        <input type="date" value={date} max={todayISO()} data-field="split-date" onInput={(ev) => setDate(ev.currentTarget.value)} /></label>
      <Section title="Paid by">
        <div class="picks-wrap">
          {active.map((m) => (
            <button type="button" class="choice" key={m.id} aria-pressed={payer === m.id} data-payer={m.id} onClick={() => { haptic('select'); setPayer(m.id) }}>{m.you ? 'You' : firstName(m.name)}</button>
          ))}
        </div>
      </Section>
      <Section title="Split" aside={mode === 'exact' && total ? (left === 0 ? 'adds up' : `${money(Math.abs(left), currency)} ${left > 0 ? 'left' : 'over'}`) : `${ids.length} people`}>
        <div class="choices seg" role="group">
          {(['equal', 'shares', 'exact'] as const).map((m) => (
            <button type="button" class="choice" key={m} aria-pressed={mode === m} data-mode={m} onClick={() => { haptic('select'); setMode(m) }}>{m === 'equal' ? 'Equally' : m === 'shares' ? 'By shares' : 'Exact'}</button>
          ))}
        </div>
        {active.map((m) => {
          const on = inSplit.has(m.id)
          return (
            <div class={on ? 'split-line on' : 'split-line'} key={m.id} data-line={m.id}>
              <button type="button" class="tick" aria-pressed={on} aria-label={`Include ${m.name}`} onClick={() => toggle(m.id)}>{on ? '✓' : ''}</button>
              <button type="button" class="split-who" onClick={() => toggle(m.id)}>{m.you ? 'You' : m.name}</button>
              {on && mode === 'shares' ? (
                <span class="stepper mini">
                  <button type="button" aria-label="Less" onClick={() => setWeights({ ...weights, [m.id]: Math.max(0, (weights[m.id] ?? 1) - 1) })}>−</button>
                  <span class="mono" data-weight={m.id}>{weights[m.id] ?? 1}</span>
                  <button type="button" aria-label="More" onClick={() => setWeights({ ...weights, [m.id]: Math.min(99, (weights[m.id] ?? 1) + 1) })}>+</button>
                </span>
              ) : null}
              {on && mode === 'exact' ? (
                <input type="text" inputMode="decimal" class="exact-in" value={exact[m.id] ?? ''} placeholder="0" data-exact={m.id}
                  onInput={(ev) => setExact({ ...exact, [m.id]: ev.currentTarget.value.replace(/[^\d.,]/g, '') })} />
              ) : null}
              <span class="mono split-share">{on && total && mode !== 'exact' ? money(preview.get(m.id) ?? 0, currency) : on ? '' : '—'}</span>
            </div>
          )
        })}
      </Section>
      {props.onDelete ? (
        <Section title="Delete">
          <div class="field"><span class="k">Delete this expense</span>
            <button type="button" class="text-btn danger" data-action="split-delete" onClick={props.onDelete}>DELETE</button></div>
        </Section>
      ) : null}
    </Shell>
  )
}

/* ------------------------------------------------------------------ settle */
function SettleForm(props: { group: Group; draft: { from: number; to: number; amount: number; currency: string }; busy: boolean; toast: string | null; onCancel: () => void; onSave: (b: unknown) => void }) {
  const g = props.group
  const d = props.draft
  const [from, setFrom] = useState(d.from)
  const [to, setTo] = useState(d.to)
  const [currency, setCurrency] = useState(d.currency)
  const [amount, setAmount] = useState(majorString(d.amount, d.currency))
  const active = g.members.filter((m) => !m.left)
  const nm = (m: Member) => (m.you ? 'You' : firstName(m.name))
  const valid = from !== to && Boolean(toMinor(amount, currency))
  return (
    <Shell theme="budget" title="Ledger Split" tabs={[]} active="x" home="x" onTab={() => undefined} ready screen="split-settle"
      mast={[g.name, 'Mark as paid']} toast={props.toast} onBack={props.onCancel}
      actions={[{ label: props.busy ? 'Saving' : 'Record payment', testId: 'split-record', mark: 'check', disabled: props.busy || !valid, onClick: () => props.onSave({ from, to, amount, currency }) },
        { label: 'Cancel', tone: 'ghost', onClick: props.onCancel }]}>
      <div class="amount-entry">
        <input type="text" inputMode="decimal" class="amount-input" value={amount} data-field="settle-amount" onInput={(ev) => setAmount(ev.currentTarget.value.replace(/[^\d.,]/g, ''))} />
        <select class="amount-cur" value={currency} onChange={(ev) => setCurrency(ev.currentTarget.value)}>
          {currencyCodes().map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <Section title="Who paid">
        <div class="picks-wrap">{active.map((m) => <button type="button" class="choice" key={m.id} aria-pressed={from === m.id} onClick={() => setFrom(m.id)}>{nm(m)}</button>)}</div>
      </Section>
      <Section title="To whom">
        <div class="picks-wrap">{active.map((m) => <button type="button" class="choice" key={m.id} aria-pressed={to === m.id} disabled={m.id === from} onClick={() => setTo(m.id)}>{nm(m)}</button>)}</div>
      </Section>
      <p class="note">Lower the amount for a partial payment. Both people get a short message.</p>
    </Shell>
  )
}

/* ------------------------------------------------------------------ public summary */
function PublicScreen(props: { pub: PublicSummary }) {
  const p = props.pub
  const spent = p.totals[p.currency] ?? Object.values(p.totals)[0] ?? 0
  const spentCur = p.totals[p.currency] !== undefined ? p.currency : Object.keys(p.totals)[0] ?? p.currency
  return (
    <Shell theme="budget" title="Ledger Split" tabs={[]} active="x" home="x" onTab={() => undefined} ready screen="split-public"
      mast={['Ledger Split', 'Read-only']}
      actions={[{ label: 'Start your own', testId: 'split-start-own', onClick: () => openLink(p.startLink) }]}>
      <div class="hero split-pos">
        <div class="kicker">{p.name} · spent together</div>
        <div class="hero-num sm" data-field="public-spent">{money(spent, spentCur)}</div>
        <div class="of"><span>{p.count} {p.count === 1 ? 'expense' : 'expenses'} · {p.people.length} people</span>
          {Object.keys(p.totals).length > 1 ? <span>{Object.entries(p.totals).filter(([c]) => c !== spentCur).map(([c, v]) => money(v, c)).join(' · ')}</span> : null}</div>
      </div>
      <Section title="Settle up" aside={p.plan.length ? `${p.plan.length} ${p.plan.length === 1 ? 'transfer' : 'transfers'}` : 'square'}>
        {p.plan.length ? p.plan.map((t, i) => (
          <article class="row transfer" key={i}><span class="row-idx">{pad2(i + 1)}</span>
            <span><span class="row-title">{t.fromName} <span class="arrow">→</span> {t.toName}</span></span>
            <span class="mono">{money(t.amount, t.currency)}</span></article>
        )) : <Empty title="All square" body="Nobody owes anything." />}
      </Section>
      <Section title="Balances">
        {p.people.map((m, i) => {
          const b = balanceLine(m.balance)
          return <article class="row" key={i}><span class="row-idx">{pad2(i + 1)}</span><span class="row-title">{m.name}</span>
            <span class={`split-bal ${b.tone === 'up' ? 'tone-up' : b.tone === 'down' ? 'tone-down' : 'tone-even'}`}>{b.text}</span></article>
        })}
      </Section>
      <p class="note">Kept with Ledger Split by Budget Better on Telegram. Free, no limits, local currencies.</p>
    </Shell>
  )
}
