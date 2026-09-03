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

Hero ("Where Am I?" over the real beach art with a searchlight that follows the pointer and reveals Noa) → world chips → full-bleed live demo (`#demo`, one mission, world at true 16:9, translucent compact UI) → how it works (4 steps) → bento "what's inside" (6 tiles) → gifting sheet (lavender) → worlds grid → pricing (middle plan elevated, dark) → trust sheet (aqua) → FAQ → final CTA sheet (sun gradient).

## The game

- Target height ≈ 4% / 3% / 2.5% of scene height in final art; hitbox ≥ 48 screen px.
- Feedback 300–800ms; world-specific particles; speech bubbles in screen space, Fredoka 20/32.
- Top bar: map · world name · 1/3 · zoom · reset · sound. Nothing else.
- Portrait phones: scene covers height, drag to explore, gentle "landscape is more fun" tip, never blocking.

## Photo → character section (`src/app/home/Transformation.tsx`)

Sits right after the live demo. Three cards: the parent's photo, the illustrated character, the character hidden in a world crop. The photo card reads `public/demo/example-photo.jpg`; until that file exists it renders a dashed placeholder, so drop a real photo (shoulders and up) there and pair it with the matching sticker in `EXAMPLE_STICKER_URL`.
