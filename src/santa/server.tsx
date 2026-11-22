import { useCallback, useEffect, useState } from 'preact/hooks'
import { daysBetween, formatShort, pad2, parseISODate } from '../format.ts'
import { Api, ApiError, copyText, openLink, requestWriteAccess, startParam } from '../api.ts'
import { bindMainButton, haptic } from '../telegram.ts'
import { themes } from '../theme.ts'
import { Empty, Seal, Section, Shell } from '../ui.tsx'
import { NameLines, wishLines } from './live.tsx'

/* ---------- API shapes (santa/api.py) ---------- */
interface GameSummary {
  id: number
  name: string
  status: 'open' | 'drawn'
  budget: string | null
  date: string | null
  organizer: boolean
  playing: boolean
  players: number
}
interface Player { id?: number; name: string; wishlist: boolean; organizer: boolean; you: boolean }
interface Note { id: number; dir: 'toGiftee' | 'fromSanta' | 'toSanta' | 'fromGiftee'; text: string; at: number; delivered: boolean }
interface GameView extends GameSummary {
  code: string | null
  inviteLink: string | null
  shareUrl: string | null
  groupLink: string | null
  inGroup: boolean
  minPlayers: number
  playerList: Player[]
  wishlist: string | null
  recipient: { name: string; wishlist: string | null } | null
  bought: boolean
  notes: Note[]
  exclusions: Array<{ a: number; b: number; aName: string; bName: string }>
  message?: string
  delivered?: boolean
}
interface Me { id: number; name: string; news: boolean; bot: string; mainApp: boolean; games: GameSummary[] }

const GAME_TABS = [
  { id: 'game', label: 'Game', icon: 'gift' as const },
  { id: 'wishlist', label: 'Wishlist', icon: 'list' as const },
  { id: 'group', label: 'Group', icon: 'people' as const },
]
const ORG_TAB = { id: 'manage', label: 'Manage', icon: 'gear' as const }

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

function stamp(at: number): string {
  const d = new Date(at * 1000)
  return `${formatShort(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function nameClass(name: string): string {
  const longest = Math.max(...name.split(/\s+/).map((part) => part.length))
  if (longest > 11) return 'name xs'
  if (longest > 8) return 'name sm'
  return 'name'
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function launchTarget(): { join?: string; game?: number } {
  const sp = startParam() ?? ''
  const q = new URLSearchParams(location.search)
  const join = sp.startsWith('join_') ? sp.slice(5) : q.get('join')
  const g = Number(q.get('g') ?? (sp.startsWith('g') ? sp.replace(/^g_?/, '') : ''))
  return { join: join || undefined, game: Number.isInteger(g) && g > 0 ? g : undefined }
}

export function ServerSanta(props: { api: Api; onOffline?: () => void }) {
  const { api } = props
  const [me, setMe] = useState<Me | null>(null)
  const [game, setGame] = useState<GameView | null>(null)
  const [tab, setTab] = useState('game')
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [fatal, setFatal] = useState<string | null>(null)
  const [pendingJoin, setPendingJoin] = useState<string | null>(null)

  const say = useCallback((text: string | null) => {
    setToast(text)
    if (text) window.setTimeout(() => setToast((cur) => (cur === text ? null : cur)), 4000)
  }, [])

  const run = useCallback(async <T,>(fn: () => Promise<T>, ok?: string): Promise<T | null> => {
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
  }, [say])

  const refreshMe = useCallback(async () => {
    const next = await api.get<Me>('/me')
    setMe(next)
    return next
  }, [api])

  const openGame = useCallback(async (id: number) => {
    const view = await run(() => api.get<GameView>(`/games/${id}`))
    if (view) { setGame(view); setTab('game') }
  }, [api, run])

  useEffect(() => {
    let cancel = false
    void (async () => {
      const target = launchTarget()
      if (target.join) setPendingJoin(target.join)
      try {
        const m = await refreshMe()
        if (cancel) return
        if (target.join) {
          // handled by the join form
        } else if (target.game && m.games.some((g) => g.id === target.game)) {
          await openGame(target.game)
        } else if (m.games.length === 1) {
          await openGame(m.games[0].id)
        }
      } catch (err) {
        if (cancel) return
        // backend unreachable: fall back to the snapshot the bot put in the link (read-only)
        const down = !(err instanceof ApiError) || err.status === 0 || err.status >= 500
        if (down && props.onOffline && new URLSearchParams(location.search).get('d')) { props.onOffline(); return }
        setFatal(err instanceof ApiError ? err.message : 'The bot did not answer.')
      }
    })()
    return () => { cancel = true }
  }, [])

  const back = useCallback(() => {
    setGame(null)
    setTab('game')
    void refreshMe().catch(() => undefined)
  }, [refreshMe])

  if (fatal) {
    return (
      <Shell theme="santa" title="Secret Santa" tabs={[]} active="x" home="x" onTab={() => undefined} ready screen="error" mast={['Secret Santa', 'Offline']}
        actions={[{ label: 'Try again', testId: 'retry', onClick: () => location.reload() }]}>
        <Section title="The bot did not answer"><p class="note">{fatal}</p></Section>
      </Shell>
    )
  }
  if (!me) {
    return (
      <Shell theme="santa" title="Secret Santa" tabs={[]} active="x" home="x" onTab={() => undefined} ready={false} screen="loading" mast={['Secret Santa', 'Reading']}>
        <p class="loading">Reading your games</p>
      </Shell>
    )
  }
  if (!game) {
    return <Games me={me} api={api} run={run} busy={busy} toast={toast} pendingJoin={pendingJoin}
      onJoined={(view) => { setPendingJoin(null); setGame(view); setTab(view.playing ? 'wishlist' : 'game'); void requestWriteAccess() }}
      onCreated={(view) => { setGame(view); setTab('group'); void requestWriteAccess() }}
      onOpen={(id) => void openGame(id)}
      onMe={setMe} />
  }
  return <GameScreen game={game} me={me} api={api} run={run} busy={busy} toast={toast} tab={tab} setTab={setTab}
    onGame={setGame} onBack={back} say={say} />
}

type Runner = <T>(fn: () => Promise<T>, ok?: string) => Promise<T | null>

/* ---------------------------------------------------------------- games list */
function Games(props: {
  me: Me; api: Api; run: Runner; busy: boolean; toast: string | null; pendingJoin: string | null
  onJoined: (v: GameView) => void; onCreated: (v: GameView) => void; onOpen: (id: number) => void; onMe: (m: Me) => void
}) {
  const { me, api, run } = props
  const [mode, setMode] = useState<'list' | 'new' | 'join'>(props.pendingJoin ? 'join' : me.games.length ? 'list' : 'new')
  const [name, setName] = useState('')
  const [budget, setBudget] = useState('')
  const [date, setDate] = useState('')
  const [code, setCode] = useState(props.pendingJoin ?? '')
  useEffect(() => { if (props.pendingJoin) { setCode(props.pendingJoin); setMode('join') } }, [props.pendingJoin])

  async function create() {
    if (!name.trim()) { haptic('warning'); return }
    const view = await run(() => api.post<GameView>('/games', { name: name.trim(), budget: budget.trim() || null, date: date || null }), 'Game created. Invite people next.')
    if (view) props.onCreated(view)
  }
  async function join() {
    const raw = code.trim().replace(/^.*join_/, '')
    if (!raw) { haptic('warning'); return }
    const view = await run(() => api.post<GameView>('/join', { code: raw }), 'You are in. Write your wishlist.')
    if (view) props.onJoined(view)
  }

  const actions = mode === 'new'
    ? [{ label: props.busy ? 'Creating' : 'Create the game', testId: 'create', disabled: props.busy || !name.trim(), onClick: () => void create() },
       ...(me.games.length ? [{ label: 'Back to my games', tone: 'ghost' as const, onClick: () => setMode('list') }] : [{ label: 'I have an invite code', tone: 'ghost' as const, testId: 'to-join', onClick: () => setMode('join') }])]
    : mode === 'join'
      ? [{ label: props.busy ? 'Joining' : 'Join the game', testId: 'join', disabled: props.busy || !code.trim(), onClick: () => void join() },
         { label: me.games.length ? 'Back to my games' : 'Start my own game', tone: 'ghost' as const, onClick: () => setMode(me.games.length ? 'list' : 'new') }]
      : [{ label: 'Start a new game', testId: 'new', onClick: () => setMode('new') },
         { label: 'Join with a code', tone: 'ghost' as const, testId: 'to-join', onClick: () => setMode('join') }]

  return (
    <Shell theme="santa" title="Secret Santa" tabs={[]} active="games" home="games" onTab={() => undefined} ready screen={`games-${mode}`}
      mast={['Secret Santa', `${me.games.length} ${me.games.length === 1 ? 'game' : 'games'}`]} actions={actions} toast={props.toast}
      onBack={mode !== 'list' && me.games.length ? () => setMode('list') : undefined}>
      {mode === 'new' ? (
        <Section title="Start a game">
          <label class="field stack"><span class="k">Name</span>
            <input type="text" maxLength={60} value={name} placeholder="Office party 2026" data-field="new-name" onInput={(e) => setName(e.currentTarget.value)} /></label>
          <label class="field stack"><span class="k">Budget (optional)</span>
            <input type="text" maxLength={40} value={budget} placeholder="€25" data-field="new-budget" onInput={(e) => setBudget(e.currentTarget.value)} /></label>
          <label class="field stack"><span class="k">Exchange date (optional)</span>
            <input type="date" min={todayISO()} value={date} data-field="new-date" onInput={(e) => setDate(e.currentTarget.value)} /></label>
          <p class="note">You join as a player. Turn that off in Manage if you only organize.</p>
        </Section>
      ) : null}
      {mode === 'join' ? (
        <Section title="Join a game">
          <label class="field stack"><span class="k">Invite code or link</span>
            <input type="text" maxLength={120} value={code} placeholder="AB12CD" data-field="join-code" onInput={(e) => setCode(e.currentTarget.value)} /></label>
          <p class="note">The organizer's invite link has the code at the end.</p>
        </Section>
      ) : null}
      {mode === 'list' ? (
        <>
          <Section title="Your games" aside={`${me.games.length}`}>
            {me.games.map((g, i) => (
              <button type="button" class="row" key={g.id} data-game={g.id} onClick={() => { haptic('tap'); props.onOpen(g.id) }}>
                <span class="row-idx">{pad2(i + 1)}</span>
                <span>
                  <span class="row-title">{g.name}</span>
                  <span class="row-sub">{g.organizer ? 'You organize' : 'Playing'} · {g.players} {g.players === 1 ? 'player' : 'players'} · {dateLabel(g.date)}</span>
                </span>
                <span class="row-side">{g.status === 'drawn' ? 'DRAWN' : 'OPEN'}</span>
              </button>
            ))}
          </Section>
          <Section title="Updates">
            <div class="field">
              <span class="k">Tips and news from the bot</span>
              <button type="button" class="choice" aria-pressed={me.news} data-field="news"
                onClick={() => void run(() => api.put<{ news: boolean }>('/me/news', { on: !me.news })).then((r) => { if (r) { props.onMe({ ...me, news: r.news }); haptic('select') } })}>
                {me.news ? 'ON' : 'OFF'}
              </button>
            </div>
          </Section>
        </>
      ) : null}
    </Shell>
  )
}

/* ---------------------------------------------------------------- one game */
function GameScreen(props: {
  game: GameView; me: Me; api: Api; run: Runner; busy: boolean; toast: string | null; tab: string
  setTab: (t: string) => void; onGame: (g: GameView) => void; onBack: () => void; say: (t: string | null) => void
}) {
  const { game, api, run, tab, setTab, onGame } = props
  const gid = game.id
  const drawn = game.status === 'drawn'
  const tabs = game.organizer ? [...GAME_TABS, ORG_TAB] : GAME_TABS
  const [wish, setWish] = useState(game.wishlist ?? '')
  const [wishDirty, setWishDirty] = useState(false)
  const [noteTo, setNoteTo] = useState<'giftee' | 'santa'>('giftee')
  const [note, setNote] = useState('')
  const [confirm, setConfirm] = useState<null | 'draw' | 'undo' | 'cancel' | 'leave'>(null)
  const [edit, setEdit] = useState({ name: game.name, budget: game.budget ?? '', date: game.date ?? '' })
  const [pair, setPair] = useState<number[]>([])

  useEffect(() => { if (!wishDirty) setWish(game.wishlist ?? '') }, [game.wishlist])
  useEffect(() => { setEdit({ name: game.name, budget: game.budget ?? '', date: game.date ?? '' }) }, [game.name, game.budget, game.date])

  const update = (view: GameView | null) => { if (view) onGame(view) }

  async function saveWish() {
    const view = await run(() => api.put<GameView>(`/games/${gid}/wishlist`, { text: wish }), drawn ? 'Saved. Your Santa sees the new list.' : 'Wishlist saved.')
    if (view) { setWishDirty(false); onGame(view) }
  }
  async function sendNote() {
    const text = note.trim()
    if (!text) return
    const view = await run(() => api.post<GameView>(`/games/${gid}/notes`, { to: noteTo, text }))
    if (view) {
      setNote('')
      onGame(view)
      props.say(view.delivered === false ? 'Saved, but Telegram could not deliver it yet.' : 'Sent anonymously.')
      haptic('success')
    }
  }
  async function draw() {
    const view = await run(() => api.post<GameView>(`/games/${gid}/draw`))
    setConfirm(null)
    if (view) { onGame(view); props.say(view.message ?? 'Names drawn. Everyone got their giftee.'); haptic('success'); setTab('game') }
  }
  async function share() {
    if (game.shareUrl) { haptic('tap'); openLink(game.shareUrl) }
  }

  // MainButton: confirm the destructive / big actions
  useEffect(() => {
    if (!confirm) return undefined
    const t = themes.santa
    const label = confirm === 'draw' ? (drawn ? 'Confirm the redraw' : 'Confirm the draw') : confirm === 'undo' ? 'Confirm: undo the draw' : confirm === 'cancel' ? 'Confirm: cancel the game' : 'Confirm: leave the game'
    return bindMainButton({ visible: true, text: label, color: t.ink, textColor: t.paper, onClick: () => void doConfirm() })
  }, [confirm, drawn])

  async function doConfirm() {
    const c = confirm
    if (!c) return
    if (c === 'draw') return draw()
    setConfirm(null)
    if (c === 'undo') update(await run(() => api.post<GameView>(`/games/${gid}/undo`), 'Draw undone. Everyone was told.'))
    if (c === 'cancel') { if (await run(() => api.post(`/games/${gid}/cancel`), 'Game cancelled.')) props.onBack() }
    if (c === 'leave') { if (await run(() => api.post(`/games/${gid}/leave`), 'You left the game.')) props.onBack() }
  }

  const first = game.recipient ? game.recipient.name.split(' ')[0] : ''
  const canNote = drawn && game.playing
  const thread = game.notes.filter((n) => noteTo === 'giftee' ? (n.dir === 'toGiftee' || n.dir === 'fromGiftee') : (n.dir === 'toSanta' || n.dir === 'fromSanta'))

  let actions: Array<{ label: string; aside?: string; onClick?: () => void; tone?: 'ghost'; testId?: string; disabled?: boolean; mark?: 'check' | 'arrow' | 'none' }> = []
  if (confirm) {
    actions = [{ label: 'Confirm', testId: 'confirm', disabled: props.busy, onClick: () => void doConfirm() }, { label: 'Not now', tone: 'ghost', onClick: () => setConfirm(null) }]
  } else if (tab === 'game') {
    if (drawn && game.recipient) {
      actions = [{
        label: game.bought ? 'Gift marked as bought' : 'Mark gift as bought', mark: 'check', testId: 'bought',
        onClick: () => void run(() => api.put<GameView>(`/games/${gid}/bought`, { bought: !game.bought })).then((v) => { if (v) { onGame(v); haptic(v.bought ? 'success' : 'tap') } }),
      }]
    } else if (!drawn && game.shareUrl) {
      actions = [{ label: 'Invite people', testId: 'invite', onClick: () => void share() }]
      if (game.organizer) actions.push({ label: 'Draw names', tone: 'ghost', testId: 'draw', onClick: () => { setTab('manage'); setConfirm('draw') } })
    }
  } else if (tab === 'wishlist' && game.playing) {
    actions = [{ label: props.busy ? 'Saving' : 'Save my wishlist', testId: 'save-wish', disabled: props.busy || !wishDirty, onClick: () => void saveWish() }]
  } else if (tab === 'wishlist' && game.organizer && !drawn) {
    actions = [{ label: 'Play in this game too', testId: 'selfjoin', onClick: () => void run(() => api.post<GameView>(`/games/${gid}/selfjoin`), 'You are playing now.').then(update) }]
  } else if (tab === 'group' && !drawn && game.shareUrl) {
    actions = [{ label: 'Invite people', testId: 'invite', onClick: () => void share() }]
    if (!game.organizer && game.playing) actions.push({ label: 'Leave the game', tone: 'ghost', testId: 'leave', onClick: () => setConfirm('leave') })
  } else if (tab === 'manage') {
    const dirty = edit.name !== game.name || edit.budget !== (game.budget ?? '') || edit.date !== (game.date ?? '')
    actions = dirty
      ? [{ label: 'Save changes', testId: 'save-game', disabled: props.busy || !edit.name.trim(), onClick: () => void run(() => api.patch<GameView>(`/games/${gid}`, { name: edit.name.trim(), budget: edit.budget.trim() || null, date: edit.date || null }), 'Saved.').then(update) }]
      : [{ label: drawn ? 'Redraw names' : 'Draw names', testId: 'draw', disabled: game.players < game.minPlayers, aside: game.players < game.minPlayers ? `need ${game.minPlayers}` : undefined, onClick: () => setConfirm('draw') }]
  }

  const mast: [string, string] = [game.name, `${drawn ? 'Drawn' : 'Open'} · ${game.players} ${game.players === 1 ? 'player' : 'players'}`]

  return (
    <Shell theme="santa" title="Secret Santa" tabs={tabs} active={tab} home="game" onTab={(t) => { setConfirm(null); setTab(t) }} actions={actions} ready
      screen={`game-${tab}`} mast={mast} toast={props.toast} onBack={props.onBack}>
      {confirm ? (
        <Section title={confirm === 'draw' ? (drawn ? 'Redraw names?' : 'Draw names now?') : confirm === 'undo' ? 'Undo the draw?' : confirm === 'cancel' ? 'Cancel this game?' : 'Leave this game?'}>
          <p class="note">
            {confirm === 'draw'
              ? drawn ? 'Everyone gets a new giftee and the old pairs stop counting. Notes are cleared.' : `Each of the ${game.players} players gets a private message with their giftee. New people can't join after this.`
              : confirm === 'undo' ? 'Pairs and anonymous notes are deleted, and the game opens for new players again.'
                : confirm === 'cancel' ? 'Everyone is told the game is cancelled. This cannot be undone.'
                  : 'The organizer is told you left.'}
          </p>
        </Section>
      ) : null}

      {tab === 'game' ? (
        <>
          <Seal mark="pp">
            {drawn && game.recipient ? (
              <>
                <div class="kicker">The draw is done — you are gifting</div>
                <h2 class={nameClass(game.recipient.name)} data-field="recipient"><NameLines name={game.recipient.name} /></h2>
              </>
            ) : (
              <>
                <div class="kicker">Your recipient</div>
                <h2 class="name pending">{!game.playing ? 'You organize' : drawn ? 'Drawn' : 'Not drawn yet'}</h2>
              </>
            )}
            <div class="meta">
              <div><div class="k">Budget</div><div class="v" data-field="budget">{game.budget ?? '—'}</div></div>
              <div><div class="k">Exchange</div><div class="v">{dateLabel(game.date)}</div></div>
              <div><div class="k">Left</div><div class="v">{daysLeft(game.date)}</div></div>
            </div>
            {game.bought && drawn ? <span class="bought">Gift bought</span> : null}
          </Seal>
          {drawn && game.recipient ? (
            <Section title="Their wishlist" aside={`${wishLines(game.recipient.wishlist).length} lines`}>
              {game.recipient.wishlist
                ? wishLines(game.recipient.wishlist).map((line, i) => (
                    <article class="row" key={`${i}-${line}`}><span class="row-idx">{pad2(i + 1)}</span><span class="row-title wish-line">{line}</span><span /></article>
                  ))
                : <Empty title="No list yet" body={`Ask ${first} below — they won't know it's you.`} />}
            </Section>
          ) : !drawn ? (
            <Section title="Waiting for the draw" aside={`${game.players}/${game.minPlayers}+`}>
              <p class="note">
                {game.players < game.minPlayers
                  ? `At least ${game.minPlayers} players are needed. Invite people with the button below.`
                  : game.organizer ? 'Enough players. Draw names in Manage when everyone is in.' : 'The organizer draws names when everyone is in. You get a message here and in the chat.'}
              </p>
              {game.code ? <div class="field"><span class="k">Invite code</span><span class="code" data-field="code">{game.code}</span></div> : null}
              {game.inviteLink ? (
                <div class="field"><span class="k">Invite link</span>
                  <button type="button" class="text-btn" onClick={() => void copyText(game.inviteLink!).then((ok) => { props.say(ok ? 'Link copied.' : game.inviteLink); haptic('tap') })}>COPY</button></div>
              ) : null}
            </Section>
          ) : (
            <p class="note">You organize this game without playing, so you have no giftee.</p>
          )}
          {canNote ? (
            <Section title="Anonymous notes" aside={`${game.notes.length}`}>
              <div class="choices two" role="group">
                <button type="button" class="choice" aria-pressed={noteTo === 'giftee'} data-field="to-giftee" onClick={() => { setNoteTo('giftee'); haptic('select') }}>To {first || 'giftee'}</button>
                <button type="button" class="choice" aria-pressed={noteTo === 'santa'} data-field="to-santa" onClick={() => { setNoteTo('santa'); haptic('select') }}>To my Santa</button>
              </div>
              <div class="thread">
                {thread.length === 0 ? <p class="note">{noteTo === 'giftee' ? `Ask ${first} about sizes or taste. They see "your Secret Santa", never your name.` : 'Your Santa is secret. Write to them here — replies show up in this thread.'}</p> : null}
                {thread.map((n) => (
                  <article class={n.dir.startsWith('from') ? 'row note-in' : 'row'} key={n.id}>
                    <span class="row-idx">{n.dir.startsWith('from') ? 'IN' : 'OUT'}</span>
                    <span><span class="row-title">{n.text}</span><span class="row-sub">{stamp(n.at)}{n.dir.startsWith('to') && !n.delivered ? ' · not delivered' : ''}</span></span>
                    <span class="row-side">{n.dir === 'fromSanta' ? 'SANTA' : n.dir === 'fromGiftee' ? first.toUpperCase() : 'YOU'}</span>
                  </article>
                ))}
              </div>
              <div class="composer">
                <textarea value={note} maxLength={1000} data-field="note" placeholder={noteTo === 'giftee' ? 'A question, without your name' : 'A message to your Santa'} onInput={(e) => setNote(e.currentTarget.value)} />
                <div class="line">
                  <span class="note">{noteTo === 'giftee' ? 'Sent as “your Secret Santa”' : `Sent with your name`}</span>
                  <button type="button" class="text-btn" data-action="send-note" disabled={props.busy || !note.trim()} onClick={() => void sendNote()}>SEND</button>
                </div>
              </div>
            </Section>
          ) : null}
        </>
      ) : null}

      {tab === 'wishlist' ? (
        <Section title="Your wishlist" aside={game.playing ? `${wishLines(wish).length} lines` : 'Not playing'}>
          {!game.playing ? (
            <Empty title="Not playing" body={drawn ? 'You organize this game without a list.' : 'You organize without playing. Join below to get a giftee too.'} />
          ) : (
            <div class="composer">
              <textarea class="wish-text" value={wish} maxLength={600} data-field="wishlist" placeholder={'One idea per line\nBook: Piranesi\nWarm socks, size 42'}
                onInput={(e) => { setWish(e.currentTarget.value); setWishDirty(true) }} />
              <p class="note">{drawn ? 'Your Santa gets a message when you save changes.' : 'Your Santa sees this after the draw.'} {wish.length}/600</p>
            </div>
          )}
        </Section>
      ) : null}

      {tab === 'group' ? (
        <Section title="The room" aside={`${game.players} players`}>
          <p class="note">{drawn ? 'Only you see who you are gifting. The organizer does not see the pairs.' : game.organizer ? 'Remove people before the draw if needed.' : 'People join with the invite link.'}</p>
          {game.playerList.map((p, i) => (
            <article class={p.you ? 'row is-you' : 'row'} key={`${i}-${p.name}`}>
              <span class="row-idx">{pad2(i + 1)}</span>
              <span><span class="row-title">{p.name}</span><span class="row-sub">{p.organizer ? 'Organizer · ' : ''}{p.wishlist ? 'Wishlist ready' : 'No wishlist yet'}</span></span>
              {game.organizer && !drawn && !p.you && p.id ? (
                <button type="button" class="text-btn danger" data-action="kick" onClick={() => void run(() => api.post<GameView>(`/games/${gid}/kick`, { user: p.id }), `${p.name} removed.`).then(update)}>REMOVE</button>
              ) : <span class="row-side">{p.you ? 'YOU' : ''}</span>}
            </article>
          ))}
        </Section>
      ) : null}

      {tab === 'manage' && game.organizer ? (
        <>
          <Section title="Game">
            <label class="field stack"><span class="k">Name</span>
              <input type="text" maxLength={60} value={edit.name} data-field="edit-name" onInput={(e) => setEdit({ ...edit, name: e.currentTarget.value })} /></label>
            <label class="field stack"><span class="k">Budget</span>
              <input type="text" maxLength={40} value={edit.budget} placeholder="—" onInput={(e) => setEdit({ ...edit, budget: e.currentTarget.value })} /></label>
            <label class="field stack"><span class="k">Exchange date</span>
              <input type="date" min={todayISO()} value={edit.date} onInput={(e) => setEdit({ ...edit, date: e.currentTarget.value })} /></label>
          </Section>
          {!drawn && game.playerList.length >= 2 ? (
            <Section title="Never pair" aside={`${game.exclusions.length}`}>
              <p class="note">Pick two people who should not gift each other (couples, for example).</p>
              <div class="picks-wrap">
                {game.playerList.filter((p) => p.id).map((p) => (
                  <button type="button" class="choice" key={p.id} aria-pressed={pair.includes(p.id!)}
                    onClick={() => { haptic('select'); setPair((cur) => cur.includes(p.id!) ? cur.filter((x) => x !== p.id) : [...cur, p.id!].slice(-2)) }}>{p.name}</button>
                ))}
              </div>
              {pair.length === 2 ? (
                <button type="button" class="text-btn" data-action="add-excl" onClick={() => void run(() => api.post<GameView>(`/games/${gid}/exclusions`, { a: pair[0], b: pair[1] }), 'Saved: they will not be paired.').then((v) => { update(v); setPair([]) })}>ADD THIS PAIR</button>
              ) : null}
              {game.exclusions.map((x) => (
                <article class="row" key={`${x.a}-${x.b}`}>
                  <span class="row-idx">≠</span><span class="row-title">{x.aName} · {x.bName}</span>
                  <button type="button" class="text-btn danger" onClick={() => void run(() => api.del<GameView>(`/games/${gid}/exclusions`, { a: x.a, b: x.b })).then(update)}>REMOVE</button>
                </article>
              ))}
            </Section>
          ) : null}
          <Section title="Draw">
            <div class="field"><span class="k">Players</span><span class="code">{game.players} / min {game.minPlayers}</span></div>
            {!game.playing && !drawn ? (
              <div class="field"><span class="k">Play too</span>
                <button type="button" class="text-btn" onClick={() => void run(() => api.post<GameView>(`/games/${gid}/selfjoin`), 'You are playing now.').then(update)}>JOIN AS PLAYER</button></div>
            ) : null}
            {drawn ? (
              <div class="field"><span class="k">Undo the draw</span><button type="button" class="text-btn danger" data-action="undo" onClick={() => setConfirm('undo')}>UNDO</button></div>
            ) : null}
            {game.groupLink ? (
              <div class="field"><span class="k">Add the bot to a group chat</span><button type="button" class="text-btn" onClick={() => openLink(game.groupLink!)}>OPEN</button></div>
            ) : null}
            <div class="field"><span class="k">Cancel the game</span><button type="button" class="text-btn danger" data-action="cancel" onClick={() => setConfirm('cancel')}>CANCEL</button></div>
          </Section>
        </>
      ) : null}
    </Shell>
  )
}
