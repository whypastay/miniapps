/* RemoteRadar — remote jobs open to your country, and a scam check. RemotelyHired network. */
import type { ComponentChildren } from 'preact'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { Api, ApiError, connect, discoverBase, openLink, requestWriteAccess, startParam } from '../api.ts'
import { cls, pad2 } from '../format.ts'
import { haptic, inTelegram } from '../telegram.ts'
import { GuideScope, RADAR_GUIDE } from '../guide.tsx'
import { Empty, RadarSweep, Section, Shell, Stats, type Action } from '../ui.tsx'
import {
  day, LEVEL_LABEL, localTz, openExternal, radarTarget,
  type CheckResponse, type CheckResult, type FeedPage, type Job, type Me, type Meta, type Prefs, type PublicCheck,
} from './model.ts'

const T = 'radar' as const
const TITLE = 'RemoteRadar'
const TABS = [
  { id: 'feed', label: 'Feed', icon: 'radar' as const },
  { id: 'saved', label: 'Saved', icon: 'bookmark' as const },
  { id: 'check', label: 'Check', icon: 'shield' as const },
  { id: 'settings', label: 'Settings', icon: 'gear' as const },
]
const HOURS = [7, 9, 12, 18, 21]

function payText(pay: string | undefined): string {
  const p = (pay ?? '').replace(' (as published)', '').trim()
  return /^(not listed|not stated|n\/a)?$/i.test(p) ? '' : p
}

type View = 'loading' | 'fatal' | 'setup' | 'tabs' | 'job' | 'result' | 'shared-check'
type Runner = <R>(fn: () => Promise<R>, ok?: string) => Promise<R | null>

function useToast() {
  const [toast, setToast] = useState<string | null>(null)
  const say = useCallback((text: string | null) => {
    setToast(text)
    if (text) window.setTimeout(() => setToast((cur) => (cur === text ? null : cur)), 3800)
  }, [])
  return { toast, say }
}

export function RadarApp() {
  const [view, setView] = useState<View>('loading')
  const [api, setApi] = useState<Api | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [tab, setTab] = useState('feed')
  const [feed, setFeed] = useState<FeedPage | null>(null)
  const [saved, setSaved] = useState<Job[] | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [jobBack, setJobBack] = useState<string>('feed')
  const [check, setCheck] = useState<CheckResponse | null>(null)
  const [shared, setShared] = useState<PublicCheck | null>(null)
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [fatal, setFatal] = useState('')
  const { toast, say } = useToast()

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

  const loadFeed = useCallback(async (client: Api, query = '', more?: FeedPage) => {
    const off = more ? more.jobs.length : 0
    const page = await client.get<FeedPage>(`/feed?offset=${off}&q=${encodeURIComponent(query)}`)
    setFeed(more ? { ...page, jobs: [...more.jobs, ...page.jobs] } : page)
  }, [])

  useEffect(() => {
    let cancel = false
    void (async () => {
      const target = radarTarget(startParam())
      const client = await connect(T)
      if (cancel) return
      if (!client) {
        // A shared scam check can be read anywhere (it holds only the verdict and rule names).
        if (target.check) {
          try {
            const base = await discoverBase()
            if (!base) throw new ApiError(0, 'offline', 'The check could not be loaded. Try again in a minute.')
            const pub = await new Api(T, base, '').get<PublicCheck>(`/checks/${encodeURIComponent(target.check)}`)
            if (!cancel) { setShared(pub); setView('shared-check') }
          } catch (err) {
            if (!cancel) { setFatal(err instanceof ApiError ? err.message : 'The check could not be loaded.'); setView('fatal') }
          }
          return
        }
        setFatal('Open RemoteRadar from its bot in Telegram.'); setView('fatal'); return
      }
      setApi(client)
      try {
        const m = await client.get<Me>('/me')
        if (cancel) return
        setMe(m)
        if (target.check) {
          const pub = await client.get<PublicCheck>(`/checks/${encodeURIComponent(target.check)}`)
          if (!cancel) { setShared(pub); setView('shared-check') }
          return
        }
        if (target.job) {
          const d = await client.get<{ job: Job }>(`/jobs/${encodeURIComponent(target.job)}`).catch(() => null)
          if (cancel) return
          if (d) { setJob(d.job); setJobBack(m.prefs.country ? 'feed' : 'setup'); setView('job'); if (m.prefs.country) void loadFeed(client).catch(() => undefined); return }
          say('That job is no longer in our feed.')
        }
        if (!m.prefs.country) { setView('setup'); return }
        if (target.tab) setTab(target.tab)
        await loadFeed(client)
        if (!cancel) setView('tabs')
      } catch (err) {
        if (cancel) return
        setFatal(err instanceof ApiError ? err.message : 'The bot did not answer.'); setView('fatal')
      }
    })()
    return () => { cancel = true }
  }, [loadFeed, say])

  useEffect(() => {
    if (api && view === 'tabs' && tab === 'saved') void api.get<{ jobs: Job[] }>('/saved').then((r) => setSaved(r.jobs)).catch(() => undefined)
  }, [api, view, tab])

  const savePrefs = useCallback(async (p: Partial<Prefs> & { alert?: Prefs['alert'] }, ok?: string) => {
    if (!api || !me) return null
    const out = await run(() => api.put<{ prefs: Prefs }>('/prefs', p), ok)
    if (out) {
      setMe({ ...me, prefs: out.prefs })
      await loadFeed(api, q).catch(() => undefined)
    }
    return out
  }, [api, me, run, loadFeed, q])

  const openJob = useCallback((j: Job, back: string) => {
    if (!api) return
    haptic('tap')
    void run(() => api.get<{ job: Job }>(`/jobs/${j.token}`)).then((d) => {
      if (d) { setJob(d.job); setJobBack(back); setView('job') }
    })
  }, [api, run])

  const launched = useRef(radarTarget(startParam()))
  const hint = launched.current.job
    ? 'Someone shared a job with you. Open it below — the short guide is under ? if you want it later.'
    : launched.current.check
      ? 'Someone shared a scam check with you. Read it below — the short guide is under ? if you want it later.'
      : null
  const guide = (node: ComponentChildren) => (
    <GuideScope theme="radar" spec={RADAR_GUIDE} api={api} ready={view !== 'loading'} onboarded={Boolean(me?.onboarded)} hint={hint}>
      {node}
    </GuideScope>
  )

  /* ------------------------------------------------------------ screens */
  if (view === 'loading') {
    return guide(<Shell theme={T} title={TITLE} tabs={[]} active="x" home="x" onTab={() => undefined} ready={false} screen="radar-loading" mast={['RemoteRadar', 'Scanning']}>
      <p class="loading">Scanning today's listings</p>
    </Shell>)
  }
  if (view === 'fatal') {
    return guide(<Shell theme={T} title={TITLE} tabs={[]} active="x" home="x" onTab={() => undefined} ready screen="radar-error" mast={['RemoteRadar', 'Offline']}
      actions={[{ label: 'Try again', testId: 'retry', onClick: () => location.reload() }]}>
      <Section title="Not available right now"><p class="note">{fatal}</p></Section>
    </Shell>)
  }
  if (view === 'shared-check' && shared) {
    return guide(<SharedCheck pub={shared} me={me}
      onGet={() => {
        if (!api || !me) { openLink(shared.appLink); return }
        if (!me.prefs.country) { setView('setup'); return }
        setTab('feed'); setView('tabs'); if (!feed) void loadFeed(api).catch(() => undefined)
      }}
      onCheck={() => {
        if (!api || !me) { openLink(shared.appLink); return }
        setTab('check'); setView(me.prefs.country ? 'tabs' : 'setup')
      }} />)
  }
  if (!api || !me) return guide(null)

  if (view === 'setup') {
    return guide(<SetupScreen meta={me.meta} prefs={me.prefs} busy={busy} toast={toast} onBack={job ? () => setView('job') : undefined}
      onSave={(p) => void savePrefs(p).then((out) => { if (out) { setView('tabs'); setTab(tab === 'check' ? 'check' : 'feed'); haptic('success') } })} />)
  }
  if (view === 'job' && job) {
    return guide(<JobScreen job={job} me={me} busy={busy} toast={toast}
      onBack={() => { setView(jobBack === 'setup' || !me.prefs.country ? 'setup' : 'tabs'); if (jobBack !== 'setup') setTab(jobBack) }}
      onGet={() => setView('setup')}
      onSave={() => void run(() => job.saved ? api.del<{ saved: boolean; savedCount: number }>(`/jobs/${job.token}/save`) : api.post<{ saved: boolean; savedCount: number }>(`/jobs/${job.token}/save`),
        job.saved ? 'Removed from saved.' : 'Saved.').then((r) => {
        if (!r) return
        setJob({ ...job, saved: r.saved }); setMe({ ...me, savedCount: r.savedCount })
        if (feed) setFeed({ ...feed, jobs: feed.jobs.map((x) => x.token === job.token ? { ...x, saved: r.saved } : x) })
      })}
      onShare={() => void run(() => api.post<{ shareUrl: string }>(`/jobs/${job.token}/share`)).then((r) => { if (r) openLink(r.shareUrl) })} />)
  }
  if (view === 'result' && check) {
    return guide(<ResultScreen res={check} toast={toast}
      onBack={() => { setView('tabs'); setTab('check') }}
      onAnother={() => { setDraft(''); setCheck(null); setView('tabs'); setTab('check') }}
      onShare={() => openLink(check.shareUrl)}
      onJob={check.result.job ? () => openJob(check.result.job!, 'check') : undefined} />)
  }

  // tabs
  const prefs = me.prefs
  let body = null
  let actions: Action[] = []
  let mast: [string, string] = ['RemoteRadar', '']
  if (tab === 'feed') {
    mast = ['RemoteRadar', feed?.feedDay ? `Checked ${day(feed.feedDay)}` : '']
    body = <FeedTab feed={feed} prefs={prefs} meta={me.meta} q={q} busy={busy}
      onQuery={(v) => { setQ(v); void loadFeed(api, v).catch(() => undefined) }}
      onMore={() => feed && void run(() => loadFeed(api, q, feed))}
      onOpen={(j) => openJob(j, 'feed')}
      onFilters={() => setTab('settings')} />
  } else if (tab === 'saved') {
    mast = ['Saved jobs', `${me.savedCount}`]
    body = <SavedTab jobs={saved} onOpen={(j) => openJob(j, 'saved')} onFeed={() => setTab('feed')} />
  } else if (tab === 'check') {
    mast = ['Scam check', 'Rule-based']
    actions = [{ label: busy ? 'Checking' : 'Check this job', testId: 'run-check', disabled: busy || !draft.trim(),
      onClick: () => void run(() => api.post<CheckResponse>('/check', { text: draft.slice(0, 8000) })).then((r) => { if (r) { setCheck(r); setView('result'); haptic(r.result.level === 'clear' ? 'success' : 'warning') } }) }]
    body = <CheckTab draft={draft} setDraft={setDraft} meta={me.meta} />
  } else {
    mast = ['Settings', prefs.countryName ?? '']
    body = <SettingsTab me={me} busy={busy} onSave={(p, ok) => void savePrefs(p, ok)}
      onDelete={() => void run(() => api.del('/me'), 'Your data is deleted.').then((r) => { if (r) { setMe({ ...me, prefs: { ...me.prefs, country: null, countryName: null, roles: [], levels: [], alert: { on: false, hour: 9, tz: null } }, savedCount: 0 }); setView('setup') } })} />
  }
  return guide((
    <Shell theme={T} title={TITLE} tabs={TABS} active={tab} home="feed" onTab={setTab} ready screen={`radar-${tab}`} mast={mast} actions={actions} toast={toast}>
      {body}
    </Shell>
  ))
}

/* ------------------------------------------------------------ setup */
function Choices(props: { options: Array<{ id: string; label: string }>; value: string[]; multi?: boolean; cols?: 2 | 3; field: string; onChange: (v: string[]) => void }) {
  return (
    <div class={cls('choices', props.cols === 2 && 'two')} data-field={props.field}>
      {props.options.map((o) => {
        const on = props.value.includes(o.id)
        return (
          <button type="button" class="choice" key={o.id} aria-pressed={on} data-value={o.id}
            onClick={() => {
              haptic('select')
              if (!props.multi) props.onChange([o.id])
              else props.onChange(on ? props.value.filter((x) => x !== o.id) : [...props.value, o.id])
            }}>{o.label}</button>
        )
      })}
    </div>
  )
}

function PrefsPicker(props: { meta: Meta; country: string | null; roles: string[]; levels: string[]; setCountry: (c: string) => void; setRoles: (r: string[]) => void; setLevels: (l: string[]) => void }) {
  const focus = props.meta.countries.filter((c) => c.focus)
  const other = props.meta.countries.filter((c) => !c.focus)
  const [more, setMore] = useState(Boolean(props.country && !focus.some((c) => c.code === props.country)))
  return (
    <>
      <Section title="Where you work from" aside="Required">
        <Choices field="country" options={focus.map((c) => ({ id: c.code, label: c.name }))} value={props.country ? [props.country] : []} onChange={(v) => props.setCountry(v[0])} />
        {more ? (
          <div class="radar-countries">
            <Choices field="country-more" cols={2} options={other.map((c) => ({ id: c.code, label: c.name }))} value={props.country ? [props.country] : []} onChange={(v) => props.setCountry(v[0])} />
          </div>
        ) : (
          <button type="button" class="text-btn radar-more" data-action="more-countries" onClick={() => setMore(true)}>Another country</button>
        )}
      </Section>
      <Section title="Roles" aside={props.roles.length ? `${props.roles.length} picked` : 'Any role'}>
        <Choices field="roles" multi cols={2} options={props.meta.roles} value={props.roles} onChange={props.setRoles} />
      </Section>
      <Section title="Level" aside={props.levels.length ? `${props.levels.length} picked` : 'Any level'}>
        <Choices field="levels" multi options={props.meta.levels} value={props.levels} onChange={props.setLevels} />
      </Section>
    </>
  )
}

function SetupScreen(props: { meta: Meta; prefs: Prefs; busy: boolean; toast: string | null; onSave: (p: Partial<Prefs>) => void; onBack?: () => void }) {
  const [country, setCountry] = useState<string | null>(props.prefs.country)
  const [roles, setRoles] = useState<string[]>(props.prefs.roles)
  const [levels, setLevels] = useState<string[]>(props.prefs.levels)
  return (
    <Shell theme={T} title={TITLE} tabs={[]} active="setup" home="setup" onTab={() => undefined} ready screen="radar-setup" mast={['RemoteRadar', 'Set up']} toast={props.toast} onBack={props.onBack}
      actions={[{ label: 'Show my jobs', testId: 'save-setup', disabled: !country || props.busy, onClick: () => props.onSave({ country, roles, levels, alert: { on: props.prefs.alert.on, hour: props.prefs.alert.hour, tz: localTz() } } as Partial<Prefs>) }]}>
      <div class="hero radar-hero">
        <RadarSweep />
        <div class="kicker">Remote jobs, filtered for you</div>
        <h2 class="radar-lede">Only listings that are open to your country.</h2>
        <p class="note">We read Himalayas, Remote OK and Jobicy and drop anything limited to the US, the UK or Europe unless that is where you are.</p>
      </div>
      <PrefsPicker meta={props.meta} country={country} roles={roles} levels={levels} setCountry={setCountry} setRoles={setRoles} setLevels={setLevels} />
    </Shell>
  )
}

/* ------------------------------------------------------------ feed */
function JobRow(props: { job: Job; i: number; onOpen: () => void }) {
  const j = props.job
  return (
    <button type="button" class="row radar-row" data-job={j.token} onClick={props.onOpen}>
      <span class="row-idx">{pad2(props.i + 1)}</span>
      <span>
        <span class="row-title">{j.title}</span>
        <span class="row-sub">{j.company}{payText(j.pay) ? ` · ${payText(j.pay)}` : ''}</span>
        <span class="radar-elig">{j.eligibility}</span>
      </span>
      <span class="row-val radar-src">{j.saved ? <span class="radar-saved" aria-label="Saved">●</span> : null}{j.sourceName}</span>
    </button>
  )
}

function FeedTab(props: { feed: FeedPage | null; prefs: Prefs; meta: Meta; q: string; busy: boolean; onQuery: (q: string) => void; onMore: () => void; onOpen: (j: Job) => void; onFilters: () => void }) {
  const f = props.feed
  const [text, setText] = useState(props.q)
  useEffect(() => {
    const t = window.setTimeout(() => { if (text !== props.q) props.onQuery(text) }, 350)
    return () => window.clearTimeout(t)
  }, [text])
  const roleNames = props.prefs.roles.map((r) => props.meta.roles.find((o) => o.id === r)?.label ?? r)
  const levelNames = props.prefs.levels.map((l) => LEVEL_LABEL[l] ?? l)
  const filters = [...roleNames, ...levelNames].join(' · ') || 'Any role · any level'
  return (
    <>
      <div class="hero radar-hero">
        <RadarSweep />
        <div class="kicker">Open to {props.prefs.countryName}</div>
        <div class="hero-num" data-field="total">{f ? f.total : '—'}</div>
        <div class="of"><span>remote {f?.total === 1 ? 'job' : 'jobs'} on today's radar</span><button type="button" class="text-btn" data-action="filters" onClick={props.onFilters}>{filters}</button></div>
      </div>
      <label class="radar-search">
        <span class="k">Search</span>
        <input type="text" data-field="q" placeholder="Title or company" value={text} onInput={(e) => setText((e.target as HTMLInputElement).value)} />
      </label>
      <Section title="Listings" aside={f && f.total > f.jobs.length ? `${f.jobs.length} of ${f.total}` : undefined}>
        {f && f.jobs.length ? f.jobs.map((j, i) => <JobRow key={j.token} job={j} i={i} onOpen={() => props.onOpen(j)} />)
          : <Empty title={props.q ? 'No matches' : 'Nothing open to you today'} body={props.q ? 'Try a shorter word, or clear the search.' : 'Open Settings to widen your country, role or level. New listings arrive every day.'} />}
        {f && f.total > f.jobs.length ? <button type="button" class="text-btn radar-more" data-action="more" disabled={props.busy} onClick={props.onMore}>Show more</button> : null}
      </Section>
      <p class="note">Listings from {props.meta.sources.map((s) => s.name).join(', ')}. You apply on their pages; nobody legit charges a fee to hire you.</p>
    </>
  )
}

function SavedTab(props: { jobs: Job[] | null; onOpen: (j: Job) => void; onFeed: () => void }) {
  return (
    <>
      <Section title="Saved jobs" aside={props.jobs ? `${props.jobs.length}` : ''}>
        {props.jobs && props.jobs.length ? props.jobs.map((j, i) => <JobRow key={j.token} job={{ ...j, saved: false }} i={i} onOpen={() => props.onOpen(j)} />)
          : <Empty title="Nothing saved yet" body="Open a job from the feed, then Save, to keep it here." />}
      </Section>
      {props.jobs && props.jobs.length ? <p class="note">Listings close. Apply soon on the board that listed the job.</p> : <button type="button" class="text-btn radar-more" onClick={props.onFeed}>Browse the feed</button>}
    </>
  )
}

/* ------------------------------------------------------------ job */
function JobScreen(props: { job: Job; me: Me; busy: boolean; toast: string | null; onBack: () => void; onSave: () => void; onShare: () => void; onGet: () => void }) {
  const j = props.job
  const setUp = Boolean(props.me.prefs.country)
  const actions: Action[] = [{ label: `Apply on ${j.sourceName}`, testId: 'apply', onClick: () => openExternal(j.url) }]
  if (setUp) actions.push({ label: 'Share with a friend', tone: 'ghost', testId: 'share-job', disabled: props.busy, onClick: props.onShare })
  else actions.push({ label: 'Get RemoteRadar', tone: 'ghost', testId: 'get-radar', onClick: props.onGet })
  const pay = payText(j.pay)
  return (
    <Shell theme={T} title={TITLE} tabs={[]} active="job" home="job" onTab={() => undefined} onBack={props.onBack} ready screen="radar-job"
      mast={[j.company, j.inFeed === false ? 'Saved copy' : j.sourceName]} actions={actions} toast={props.toast}>
      <div class="radar-job-head">
        <div class="kicker">{setUp ? (j.openToYou === false ? `Not open to ${props.me.prefs.countryName}` : j.eligibility || `Open to ${props.me.prefs.countryName}`) : 'Shared with you'}</div>
        <h2 class="radar-title" data-field="job-title">{j.title}</h2>
        {setUp ? <button type="button" class="text-btn radar-save" data-action="save" aria-pressed={j.saved} disabled={props.busy || j.inFeed === false && !j.saved} onClick={props.onSave}>{j.saved ? 'Saved ●' : 'Save ○'}</button> : null}
      </div>
      <Stats columns={3} items={[
        { label: 'Pay', value: pay || 'Not stated', small: true },
        { label: 'Type', value: j.type || '—', small: true },
        { label: 'Level', value: j.level ? LEVEL_LABEL[j.level] : '—', small: true },
      ]} />
      <div class="callout">
        <div class="k">Location on the listing</div>
        <p data-field="location">{j.location || 'Not stated'}</p>
      </div>
      {j.requirements && j.requirements.length ? (
        <Section title="What they ask for">
          <ul class="radar-list">{j.requirements.map((r) => <li key={r}>{r}</li>)}</ul>
        </Section>
      ) : null}
      {j.about ? <Section title="About the role"><p class="radar-about">{j.about}{j.about.length >= 900 ? '…' : ''}</p></Section> : null}
      {j.inFeed === false ? <p class="note">This listing has left today's feed. It may be closed; check on {j.sourceName}.</p> : null}
      <p class="radar-credit" data-field="credit">
        Source: <a href={j.sourceHome} onClick={(e) => { e.preventDefault(); openExternal(j.sourceHome) }}>{j.sourceName}</a>
        {j.published ? ` · listed ${day(j.published)}` : ''}. Apply there; we never charge.
      </p>
    </Shell>
  )
}

/* ------------------------------------------------------------ scam check */
function CheckTab(props: { draft: string; setDraft: (v: string) => void; meta: Meta }) {
  return (
    <>
      <div class="hero radar-hero">
        <RadarSweep />
        <div class="kicker">Red flag check</div>
        <h2 class="radar-lede">Got an offer that feels off? Paste it here.</h2>
      </div>
      <div class="composer">
        <textarea data-field="check-text" rows={7} maxLength={8000} placeholder="Paste the job post, the recruiter's message, or a link"
          value={props.draft} onInput={(e) => props.setDraft((e.target as HTMLTextAreaElement).value)} />
      </div>
      <Section title="Try an example" aside="Not real companies">
        {props.meta.examples.map((ex) => (
          <button type="button" class="row radar-example" key={ex.id} data-example={ex.id} onClick={() => { haptic('select'); props.setDraft(ex.text) }}>
            <span class="row-idx">{ex.id === 'clean' ? 'OK' : '!'}</span>
            <span><span class="row-title">{ex.label.replace('Composite example · ', '')}</span><span class="row-sub">{ex.text.slice(0, 74)}…</span></span>
            <span class="row-val">Use</span>
          </button>
        ))}
      </Section>
      <p class="note">Plain rules, no AI: fees, chat-app-only recruiters, task and crypto schemes, requests for codes or ID, look-alike links. We keep only the result, never your text. Examples are composites of common scams, not real companies.</p>
    </>
  )
}

const SEV: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' }

function Verdict(props: { r: CheckResult; count: number }) {
  const r = props.r
  return (
    <div class={cls('hero radar-hero radar-verdict', `lvl-${r.level}`)}>
      <RadarSweep />
      <div class="kicker">{props.count ? `${props.count} red ${props.count === 1 ? 'flag' : 'flags'}` : 'No red flags'}</div>
      <h2 class="radar-verdict-text" data-field="verdict">{r.verdict}</h2>
      <p class="radar-summary">{r.summary}</p>
    </div>
  )
}

function FlagList(props: { r: CheckResult }) {
  if (!props.r.flags.length) return null
  return (
    <Section title="What we found" aside={`${props.r.flags.length}`}>
      {props.r.flags.map((f) => (
        <div class="radar-flag" key={f.id} data-flag={f.id}>
          <div class="radar-flag-top"><span class={cls('radar-sev', `sev-${f.severity}`)}>{SEV[f.severity]}</span><strong>{f.title}</strong></div>
          <p>{f.why}</p>
          {f.evidence ? <q class="radar-evidence">{f.evidence}</q> : null}
        </div>
      ))}
    </Section>
  )
}

function ResultScreen(props: { res: CheckResponse; toast: string | null; onBack: () => void; onAnother: () => void; onShare: () => void; onJob?: () => void }) {
  const r = props.res.result
  return (
    <Shell theme={T} title={TITLE} tabs={[]} active="result" home="result" onTab={() => undefined} onBack={props.onBack} ready screen="radar-result"
      mast={['Scam check', r.level === 'clear' ? 'Clear' : r.level === 'caution' ? 'Caution' : 'High risk']} toast={props.toast}
      actions={[{ label: 'Share the result', testId: 'share-check', onClick: props.onShare }, { label: 'Check another', tone: 'ghost', testId: 'check-another', onClick: props.onAnother }]}>
      <Verdict r={r} count={r.flags.length} />
      <FlagList r={r} />
      {r.positives.length ? (
        <Section title="Good signs"><ul class="radar-list tone-up">{r.positives.map((p) => <li key={p}>{p}</li>)}</ul></Section>
      ) : null}
      {r.job && props.onJob ? <button type="button" class="text-btn radar-more" data-action="open-checked-job" onClick={props.onJob}>Open this listing</button> : null}
      <Section title="Before you reply">
        <ul class="radar-list">{(r.tips ?? []).map((t) => <li key={t}>{t}</li>)}</ul>
      </Section>
      <p class="note">These are pattern checks, not a verdict on any company. A shared link shows the flags only, never what you pasted.</p>
    </Shell>
  )
}

function SharedCheck(props: { pub: PublicCheck; me: Me | null; onGet: () => void; onCheck: () => void }) {
  const r = props.pub.result
  const set = Boolean(props.me?.prefs.country)
  return (
    <Shell theme={T} title={TITLE} tabs={[]} active="shared" home="shared" onTab={() => undefined} ready screen="radar-shared-check"
      mast={['Shared scam check', 'RemoteRadar']}
      actions={[{ label: set ? 'Open my job feed' : 'Get RemoteRadar', testId: 'get-radar', onClick: props.onGet }, { label: 'Check a job yourself', tone: 'ghost', testId: 'check-yourself', onClick: props.onCheck }]}>
      <Verdict r={r} count={r.count ?? r.flags.length} />
      <FlagList r={r} />
      <p class="note">Someone checked a job offer with RemoteRadar and shared the result. The text they pasted is not shown. RemoteRadar finds remote jobs open to your country and checks offers for scam patterns, free.</p>
    </Shell>
  )
}

/* ------------------------------------------------------------ settings */
function SettingsTab(props: { me: Me; busy: boolean; onSave: (p: Partial<Prefs>, ok?: string) => void; onDelete: () => void }) {
  const p = props.me.prefs
  const [country, setCountry] = useState<string | null>(p.country)
  const [roles, setRoles] = useState<string[]>(p.roles)
  const [levels, setLevels] = useState<string[]>(p.levels)
  const [confirm, setConfirm] = useState(false)
  const dirty = country !== p.country || roles.join() !== p.roles.join() || levels.join() !== p.levels.join()
  const tz = localTz()
  const alert = (on: boolean, hour = p.alert.hour) => {
    if (on && !p.alert.on) void requestWriteAccess()
    props.onSave({ alert: { on, hour, tz } } as Partial<Prefs>, on ? `Daily alert at ${pad2(hour)}:00.` : 'Daily alert off.')
  }
  return (
    <>
      <PrefsPicker meta={props.me.meta} country={country} roles={roles} levels={levels} setCountry={setCountry} setRoles={setRoles} setLevels={setLevels} />
      {dirty ? <button type="button" class="cta radar-inline-cta" data-action="save-prefs" disabled={props.busy || !country} onClick={() => props.onSave({ country, roles, levels }, 'Radar updated.')}>
        <span class="cta-label">Update my radar</span>
      </button> : null}
      <Section title="Daily alert" aside={p.alert.on ? `On · ${pad2(p.alert.hour)}:00` : 'Off'}>
        <div class="field">
          <span><span class="k">New matches in chat</span><span class="row-sub">Up to 5 new jobs a day, only when there are some.</span></span>
          <div class="choices radar-toggle" data-field="alert">
            <button type="button" class="choice" aria-pressed={!p.alert.on} data-value="off" onClick={() => alert(false)}>Off</button>
            <button type="button" class="choice" aria-pressed={p.alert.on} data-value="on" onClick={() => alert(true)}>On</button>
          </div>
        </div>
        {p.alert.on ? (
          <div class="radar-hours-wrap">
            <span class="k">Time</span>
            <div class="radar-hours" data-field="alert-hour">
              {HOURS.map((h) => <button type="button" class="choice" key={h} aria-pressed={p.alert.hour === h} onClick={() => alert(true, h)}>{pad2(h)}:00</button>)}
            </div>
          </div>
        ) : null}
        <p class="note">Your time zone: {p.alert.tz || tz}.</p>
      </Section>
      <Section title="Where jobs come from">
        {props.me.meta.sources.map((s) => (
          <button type="button" class="row" key={s.id} onClick={() => openExternal(s.home)}>
            <span class="row-idx">↗</span><span class="row-title">{s.name}</span><span class="row-val">{s.home.replace('https://', '')}</span>
          </button>
        ))}
        <button type="button" class="row" data-action="hub" onClick={() => openLink(props.me.meta.hub)}>
          <span class="row-idx">↗</span><span><span class="row-title">@remotelyhired</span><span class="row-sub">Hand-picked remote jobs every day</span></span><span class="row-val">Channel</span>
        </button>
      </Section>
      <Section title="Your data">
        <p class="note">We keep your country, roles, level, saved jobs and alert time. Scam checks keep only the result.</p>
        {confirm
          ? <button type="button" class="text-btn danger" data-action="delete-confirm" onClick={props.onDelete}>Tap again to delete everything</button>
          : <button type="button" class="text-btn danger" data-action="delete" onClick={() => setConfirm(true)}>Delete my data</button>}
      </Section>
      {inTelegram() ? null : <p class="note">Open from Telegram to receive alerts.</p>}
    </>
  )
}
