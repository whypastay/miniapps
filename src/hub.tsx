import { themes, themeBlock } from './theme.ts'

const LINKS = [
  { href: './budget/', index: '01', title: 'Budget Better', meta: 'Forest ink · the 52-week grid', theme: 'budget' as const },
  { href: './santa/', index: '02', title: 'Secret Santa', meta: 'Claret ink · ribbon and wax seal', theme: 'santa' as const },
  { href: './matchday/', index: '03', title: 'Matchday', meta: 'Navy ink · the pitch', theme: 'matchday' as const },
]

export function Hub() {
  const paper = themes.paper
  return (
    <div class="app" data-layout="board" data-theme="paper" data-ready="true">
      <style>{themeBlock(paper)}</style>
      <main class="board">
        <div class="board-mark"><span>Design system A</span><span>Three mini apps</span></div>
        <h1>The <em>Ledger</em></h1>
        <p class="board-lead">Warm paper, one printing ink per bot, gold used as foil. A serif for numbers and names, a grotesque for reading, mono for labels.</p>
        <nav class="hub-list" aria-label="Mini apps">
          {LINKS.map((link) => (
            <a key={link.href} class="hub-link" href={link.href} style={{ ['--tile' as string]: themes[link.theme].ink }}>
              <span class="idx">{link.index}</span>
              <span>
                <strong>{link.title}</strong>
                <em>{link.meta}</em>
              </span>
              <i class="tile" aria-hidden="true">{themes[link.theme].mark}</i>
            </a>
          ))}
        </nav>
        <p class="board-foot">
          Instrument Serif · Geist · Geist Mono<br />
          /budget · /santa · /matchday
        </p>
      </main>
    </div>
  )
}
