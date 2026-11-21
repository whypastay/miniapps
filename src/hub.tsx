import { themes, themeBlock } from './theme.ts'

const LINKS = [
  { href: './budget/', index: '01', title: 'Budget Better', meta: 'Forest · dot grid', theme: 'budget' as const },
  { href: './santa/', index: '02', title: 'Secret Santa', meta: 'Burgundy · hatch', theme: 'santa' as const },
  { href: './matchday/', index: '03', title: 'Matchday', meta: 'Navy · pinstripe', theme: 'matchday' as const },
]

export function Hub() {
  const paper = themes.paper
  return (
    <div class="app pattern-quiet" data-layout="board" data-theme="paper" data-ready="true">
      <style>{themeBlock(paper)}</style>
      <main class="board">
        <div class="board-mark">B</div>
        <h1>Swiss Instrument</h1>
        <p class="board-lead">Three Telegram mini apps. One grid, two typefaces, a different field for each bot.</p>
        <nav class="hub-list" aria-label="Mini apps">
          {LINKS.map((link) => (
            <a key={link.href} class="hub-link" href={link.href} style={{ ['--tile' as string]: themes[link.theme].bg }}>
              <span class="idx">{link.index}</span>
              <span>
                <strong>{link.title}</strong>
                <em>{link.meta}</em>
              </span>
              <i class="tile" aria-hidden="true" />
            </a>
          ))}
        </nav>
        <p class="board-foot">
          Archivo Condensed · IBM Plex Mono<br />
          /budget · /santa · /matchday
        </p>
      </main>
    </div>
  )
}
