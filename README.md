# Swiss Instrument

Three Telegram Mini Apps on one static site. Same grid, same type, same four tabs. Only the field colour and the signature pattern change.

| App | Path | Field |
| --- | --- | --- |
| Budget Better | `/budget/` | Forest green, dot grid |
| Secret Santa | `/santa/` | Burgundy, diagonal hatch |
| Matchday | `/matchday/` | Navy, pinstripes |

Budget Better is a working 52-week savings challenge. Secret Santa and Matchday are complete shells on a local data layer, ready for a bot backend.

Archivo (condensed at width 62%) carries the big figures. IBM Plex Mono carries the data. Both are self-hosted.

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43123/](http://127.0.0.1:43123/) for the index, then `/budget/`, `/santa/`, and `/matchday/`. The same URLs work in a normal mobile browser. Inside Telegram the page calls `ready()`, `expand()`, paints the header and background in the brand colour, uses the Back button between tabs, and ticks the haptic engine on taps.

```bash
npm run build
npm run preview
```

`dist/` is a plain static folder. Asset paths are relative, so the build works at a domain root or under a project path such as GitHub Pages `/repo/`.

## Budget Better

- Classic (week N saves N × the unit), reverse (week N saves (53 − N) × the unit), or a flat custom amount.
- Currencies: EUR, USD, INR, PHP, NGN, GBP.
- Tap any of the 52 cells to mark a week paid or clear it.
- Saved to date, progress, streak, missed weeks, and the next deposit.
- History of marks, and a progress card drawn to a canvas.
- Settings: rule, currency, start date, reset.

State is stored per user in `Telegram.WebApp.CloudStorage` when the page is opened inside Telegram, and in `localStorage` otherwise (and as a cache). The first visit opens on a demo ledger: classic ×10 EUR, week 31, €4,480 of €13,780.

### Sharing the card

Share tries, in order:

1. `Telegram.WebApp.shareMessage`, when the page is opened with `?shareMsg=<id>` from a message the bot prepared with `savePreparedInlineMessage`.
2. The system share sheet, when the browser can share the PNG.
3. A download of `budget-better.png`.

Download is always available as its own control.

## Secret Santa and Matchday

Screens talk only to a repository interface:

- `SantaRepository` in `src/santa/types.ts`, demo implementation in `src/santa/demo.ts`
- `MatchdayRepository` in `src/matchday/types.ts`, demo implementation in `src/matchday/demo.ts`

`createSantaRepository()` and `createMatchdayRepository()` are the seam. Swap the demo class for a bot client and leave the screens alone. Until then, wishlist edits, the bought flag, anonymous notes, picks, and the display name persist in `localStorage` on this device. Copy in the settings tab says so.

## Point a bot at a route

In BotFather, set the menu button or the direct link of each bot to the matching URL:

- Budget bot → `https://<host>/budget/`
- Party bot → `https://<host>/santa/`
- Matchday bot → `https://<host>/matchday/`

The page ignores the client’s light or dark theme and keeps the brand field. Header, background, and bottom bar are set to that colour.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` builds `dist/` and deploys it with GitHub Pages.

1. Push to `main`.
2. In the repository settings, open **Pages** and set the source to **GitHub Actions**.
3. The next green run publishes the site.

## Cloudflare Pages

- Build command: `npm run build`
- Output directory: `dist`
- No base-path setting. Paths are already relative.

## Fonts

Archivo © 2019 The Archivo Project Authors. IBM Plex Mono © 2017 IBM Corp. Both are under the SIL Open Font License 1.1. License texts are in `src/fonts/`.
