# Claude → Codex: hero previews — phone and tablet, no tabs, the whole map (2026-09-14)

**Branch:** `claude/hero-two-devices-20260914`, two commits on top of `47295e9` (your
`codex/qa-five-hides-20260912` tip, which already carries the `--ui` sizing as your
cherry-pick of `fc5b36c`). Both deployed to QA from the `work/claude-gold-stars-20260913`
worktree with `vercel --prod --yes`; the second is what QA shows now.

**Please cherry-pick both onto `codex/qa-five-hides-20260912` before your next QA
deploy**, or the laptop and the tabs come back. The second commit carries new binary
crops (`public/home/hero-found-{wide,phone,card}.webp`) and the manifest; take them
together.

## What Guy asked (in order)

1. "A desktop preview next to a tablet is the same picture twice — drop it, keep mobile
   and tablet. Make the tablet on desktop as large as it can be without overflowing,
   with pleasant margins."
2. "No need for the phone/tablet text tabs under it — unnecessary. And inside the
   devices go as zoomed out as possible, the full picture in height, nothing cut at the
   sides or top/bottom: as much of the map as possible."

## What changed

- Laptop device, frame, base gone; the cycle is 16 s (phone 0–8 s, tablet 8–16 s;
  `hero4-cyc` retimed, tablet delay 8 s). Reduced motion holds the tablet.
- Device-label row gone (`.hero4__labels`, `hero4-lbl`, `home.hero.devices` in both
  dictionaries). The stage box is 704×704 design px.
- The tablet is 3:2 like the board: frame 704×472 at `top: 116px`, screen 688×456, so
  the whole board fits its screen with nothing cut and no letterbox. The grid gives the
  stage the wider column (`minmax(0, 5fr) minmax(0, 7fr)`) and `STAGE_GROW = 1.06` lets
  `--k` grow a little past design size on a wide column, never past the column.
  Measured: at 1440px the tablet is 746px wide, 48px from the copy and 64px from the
  viewport edge; at 1280px it is the column's 654px.
- `scripts/refresh-hero-found.ts` now cuts one crop per screen at the board's FULL height
  and the screen's exact aspect: `wide` = the whole 3072×2048 board (1600px), `phone` =
  a 288:616 column around the child (720×1539), `card` = a 2:3 column (720×1080). The
  mobile card uses `card`, the phone `phone`, the tablet `wide`; on mobile only the card
  crop is fetched. Manifest and hashes regenerated; `hero-found.test.ts` asserts every
  crop keeps the full board height and its screen's aspect.
- Tests follow (`hero.test.tsx`: two devices, per-screen crops, no labels). Home + i18n
  tests 29 green, tsc clean. `docs/DESIGN_SYSTEM.md` hero paragraphs updated.

## Not changed

Your `.hero4__chrome` row, the 2:3 card ratio, `homepage-order`, the game's `MissionCard`.
