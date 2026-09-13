# Design system — "Playful Premium" (v2)

Lives at `/design-system`. Tokens: `src/styles/tokens.css`. Primitives: `src/styles/ui.css` (prefix `fm-`), `src/ui/*`. Landing/site: `src/app/site.css`. Game: `src/game/game.css`.

v1 ("cream paper + Fredoka + hard 4px shadows") was rejected as dated. v2 aims at 2030, not 1990: big geometric type, saturated colour slabs, soft layered depth, motion with intent.

## Principles

1. **Two audiences, one system.** Parents buy (clean, confident, premium). Kids play (big, bright, immediate). The game scopes its own display font (`--font-kid`) and never shows marketing.
2. **8px grid.** Every spacing, height, radius and line-height is a multiple of 8. `--space-0-5` (4px) only for icon/text nudges.
3. **Tokens only.** No magic numbers in component CSS. A new colour is a new token.
4. **Colour as structure.** Sections are full-width rounded "sheets" (`fm-sheet--night/sun/lavender/aqua/coral/lime`, radius 48) instead of borders and dividers.
5. **Depth is soft.** Layered shadows (`--shadow-1..3`), glow on primary hover (`--shadow-glow-sun`), sticker outlines for anything that is "the child".
6. **Motion with intent.** Scroll reveal (`.rv`), floating stickers, marquee, peeking demo child, 150/300/600/1200ms durations, `--ease-pop` for playful, `--ease-out` for UI. `prefers-reduced-motion` respected everywhere.
7. **The kid never fails.** No red X, no hearts, no "try again". Wrong tap = ripple + pop.

## Tokens

| Group      | Values                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| Spacing    | 8 · 16 · 24 · 32 · 40 · 48 · 64 · 80 · 96 · 128 · 160 (`--space-1 … --space-20`)                          |
| Radii      | 8 · 16 · 24 · 32 · 48 · pill                                                                              |
| Layout     | `--container` 1440 · `--container-narrow` 720 · `--container-text` 880 · `--gutter` 24/48                 |
| Touch      | `--touch-min` 48 (adult) · `--touch-kid` 64 (child) · `--control-h` 56                                   |
| Ground/ink | `--paper #FBF8F2` · `--ink #17162B` · `--ink-2/3/4` · `--night #14173A`                                   |
| Brand      | `--sun #FFC53D` (CTA) · `--coral #FF6B6B` · `--aqua #2ED3C3` · `--sea #2FA4D6` · `--lime #B8F26B` · `--lavender #C4B5FD` · `--berry` · `--grape` · `--leaf` |
| Gradients  | `--grad-sun` · `--grad-coral` · `--grad-aqua` · `--grad-lavender` · `--grad-night` · `--grad-rainbow`     |
| Type       | Rubik 400–900 for the site (`--font-display` = `--font-body`); Fredoka for kid UI (`--font-kid`). Scale 12/16 · 14/24 · 16/24 · 20/32 · 24/32 · 32/40 · 40/48 · 48/56 · 64/72 · 88/96 (`--fs-50 … --fs-900`), stepped down at 960px and 600px. |
| Motion     | `--ease-pop` · `--ease-out` · `--ease-in-out` · `--dur-1..4` (150/300/600/1200ms)                          |

## Primitives

`fm-btn` (+ `--secondary --night --white --coral --sea --ghost --danger`, sizes `--sm --lg --xl --kid`) · `fm-pill` · `fm-sticker-badge` · `fm-card` · `fm-sheet` · `fm-badge` · `fm-input` · `fm-stepper` · `fm-notice` · `fm-table` · `fm-sticker` · `fm-lang` (language switcher) · `.rv` (reveal).

React: `Button`, `LinkButton` (`src/ui/Button.tsx`), `SiteHeader`, `SiteFooter` (`src/ui/Shell.tsx`, server), `Stepper`, `Notice` (`src/ui/primitives.tsx`, client-safe).

## Landing anatomy

Hero (the live demo child being found on alternating phone/tablet frames — a laptop was dropped as a repeat of the tablet (Guy); a frameless board card on mobile, with world chips along its bottom) → photo-to-character proof (`#transform`, **three visual steps**) → full-bleed live demo (`#demo`, one mission) → how it works (`#how`, four purchase steps) → what's inside → worlds → gifting → pricing → trust → FAQ → final CTA. The three visual steps and the four purchase steps are separate sections: only the visual sequence precedes the demo.

Hero assets are public marketing copies built by `scripts/refresh-hero-found.ts --apply` from `buildDemoConfig` and the shared `targetGeometry` contract. `content/home/hero-found.json` binds the current demo identity, board, effective foreground, geometry and shipped crop hashes. No customer images or paid generation are involved. The star destination is remeasured on resize and language changes; reduced motion shows a static find and a non-wrapping world strip.

The hero HUD is a readable preview, not a miniaturised copy of every game control: one horizontal row contains a contained portrait, a name/five-stars stack, and the hint. No hide-count or find-three helper sentence appears in the HUD. Everything inside a screen is sized by `--ui` on `.hero4__screen` (phone 0.8, tablet 0.62, mobile card 0.85 of the 56px-portrait / 16px-text design values) — the tablet's HUD is a small corner of its screen, the phone's fills its top; at full size the HUD inside a small screen read as a poster (Guy). The design values are 16px edge insets and padding with 8px row gaps so the full portrait and all stars fit on narrow screens; on the narrow phone the tool rail flows below the HUD instead of overlapping it. The mobile card is 2:3 (one shared ratio for sizing and target geometry), with tools along its bottom, so neither the HUD nor the tools cross the child's celebration on a 320px screen. The 704px design stage clears the tilted phone; there is no device-label row under it (tabs there were noise, Guy). The tablet is 3:2 like the board and spans the stage's full 704px design width; the stage takes the wider grid column (5fr/7fr) and may grow to 1.06× design size on a wide column — the largest the tablet can be without leaving the column (Guy). Every screen shows the board at its full height: the whole board on the tablet, a full-height column cut to the screen's own aspect on the phone (288:616) and the card (2:3) — as much of the map as possible, nothing cropped or letterboxed (Guy). The actual player uses the same face/name-stars/hint row, keeping the name visible when quiet; only requested hint details fold below it. Unlocking and scoring rules are unchanged.

The live search card is separately compact: 48px contained portrait on desktop, 40px on mobile, 14px title, 16px star slots with solid visible outlines, 4px vertical / 8px horizontal padding, and a 48px hint touch target. The normal one-line-name card is 56px tall (measured at 320px, 390px and 1440px viewports); a long name wraps without clipping. Its width is capped at 256px, with space reserved for the tool rail. No unlock, score or hint behaviour changes.

## The game

- Target height ≈ 4% / 3% / 2.5% of scene height in final art; hitbox ≥ 48 screen px.
- Feedback 300–800ms; world-specific particles; speech bubbles in screen space, Fredoka 20/32.
- Top bar: map · world name · 1/3 · zoom · reset · sound. Nothing else.
- Portrait phones: scene covers height, drag to explore, gentle "landscape is more fun" tip, never blocking.
- **Gold stars** (`--gold*` tokens, `--grad-gold`, `--shadow-glow-gold`): one per distinct hiding spot. New serial find-any games have five per board and forty-five across nine boards; finding any three unlocks the next board and the remaining two stay optional. Legacy games keep their authored three per board. Progress is saved immediately and never charged for hints; the visual star lands after its flight (`StarFlight` → `StarTray`) without briefly disappearing. The finish card celebrates that board's actual target count; world totals belong on the map, hub and adventure bag, not inside the board. Rules: `src/domain/game/progress.ts` and `src/domain/game/mission.ts`.

## Photo → character section (`src/app/home/Transformation.tsx`)

Sits immediately after the hero, before the live demo. Three cards: the prepared public example photo, its illustrated character, and the character hidden in a world crop. The shared source is `content/demo/transformation.ts`; its current patch agrees with the live demo. Do not replace public marketing examples with a customer's private photo.
