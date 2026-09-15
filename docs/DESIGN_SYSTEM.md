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

- Target size comes from the pinned placement/age contract. Do not copy the old 4% / 3% / 2.5% heuristic to new boards; recognition and coherent scale must be checked at playable zoom. Child interaction targets use the shared geometry and touch policy.
- Feedback 300–800ms; world-specific particles; speech bubbles in screen space, Fredoka 20/32.
- Search HUD: contained face, name/stars stack and hint in one compact row. Map, zoom, reset and sound remain on the separate tool rail. No find-three helper sentence or world-wide counter inside the board.
- Portrait phones: scene covers height, drag to explore, gentle "landscape is more fun" tip, never blocking.
- **Gold stars** (`--gold*` tokens, `--grad-gold`, `--shadow-glow-gold`): one per distinct hiding spot. New serial find-any games plan five per board; an explicitly approved partial release may carry four. Finding three unlocks the next board; finding all delivered targets completes it. Legacy games keep their authored three. Never hardcode forty-five: sum the actual published targets. Progress is saved immediately and never charged for hints; the visual star lands after its flight (`StarFlight` → `StarTray`) without briefly disappearing. World totals belong on the map, hub and adventure bag, not inside the board. Rules: `src/domain/game/progress.ts` and `src/domain/game/mission.ts`.

## The collection: stickers on the board and in the bag (`Collection.tsx`, `Album.tsx`, `collection.css`)

A discovery is a **sticker**: a round window onto the board's own pixels (`AlbumCrop`), ghosted (grayscale, half opacity, dashed rim) until it is found, then full colour with the white sticker rim and a gold ring; it pops once with a ring of light (`sticker--fresh`) and never re-celebrates on mount. Rarity is a small word on the sticker's lower edge (Common / Rare / Epic, `--sea` and `--berry` families), never a shop tag. On a wide screen (>= 900px and 560px tall) the six stickers stay in view in a glass strip at the bottom inline-start corner with a tally; on a phone they fold into one round button with a progress ring and a count badge that opens a short sheet (3x2 grid, one line of words, read-aloud). Tapping a missing sticker means "looking for it": a small card with the picture, the name, a `--sun` hint button (words, then a marked area, then the exact spot), read-aloud and a way out; it never collects. A sticker just found flies from the tap into its slot on the star's own arc (`fm-fly`, `fm-fly-arc`), the slot lights only when it lands, the tally bumps; a repeat tap wiggles the sticker instead of a second card. A complete board turns the strip gold. First sight is one small dark pill, gone on its own. Hit-testing stays in `SceneViewport`; the strip is presentation and guidance. A phone never pans past the board's edge (`panPadding` 0 under `useWide`); a wide screen keeps the 220px margin that pulls an edge hide out from under the HUD.

The bag shows one sticker page per place: name, stars and a tally chip (gold when complete); the postcard, or a dashed frame saying how many hiding spots it still needs, beside the six stickers with their names and a short story (found) or hint (missing); a "back to the board" button while something is missing. Three finds open the next place and the postcard needs every hiding spot: said at the choice moment and in the album, never as a fixed line in the search HUD. Tokens and the 8px grid throughout; at <= 720px the page is one column and the stickers sit three across.

## Photo → character section (`src/app/home/Transformation.tsx`)

Sits immediately after the hero, before the live demo. Three cards: the prepared public example photo, its illustrated character, and the character hidden in a world crop. The shared source is `content/demo/transformation.ts`; its current patch agrees with the live demo. Do not replace public marketing examples with a customer's private photo.

## Motion and feedback rules (polish pass, 2026-09-15)

- **Every tap answers.** A control a child presses scales down on `:active` (board buttons `.9`, map dots `.92`, stickers hover `1.06`). A place still ahead answers in a small dark pill (`.wmap__teaser`), never in silence.
- **Lift is one of two sizes.** Cards lift `-4px` on hover with `--shadow-2` (library, features, selectable cards); buttons lift `-2px` with their glow. Steps, worlds and plans keep `-6px` as the marketing exception.
- **Arrivals fade up, choices pop.** Notices, retry cards, create steps, FAQ answers and passport cards arrive with `fm-fade-up` (staggered `60ms` per card, capped at the sixth); a selection mark, a dialog and the cropper pop in with `fm-pop-in` on `--ease-pop`.
- **Loading never reflows.** A busy button keeps its width: the label goes invisible under a centred spinner (`.fm-btn__label`, `aria-busy`). A disabled button explains itself with `cursor: not-allowed` and no lift; only a disabled link loses pointer events.
- **Notes float, they do not push.** The landscape tip is one dark pill over the board, above the collection button, gone on its own after seven seconds. Nothing in the game reflows the board to say something.
- **Irreversible asks in our own dialog.** `ConfirmDialog` (`src/ui/ConfirmDialog.tsx`) is a native `<dialog>` dressed as `.fm-dialog`: title, one sentence, cancel and the destructive action; the form submits only after it, once.
- **Phones keep the floors.** Board buttons stay at `--touch-min` (48px) at every width; map dots draw at 56px with a transparent ring to the 64px kid target; the map, the bag, the finish card and the tip respect `env(safe-area-inset-*)`.
- **Reduced motion is honoured everywhere.** Every loop added here (gift float and glow, breathing map dot, marching road, marketing Ken Burns and nudges) and every entrance is switched off under `prefers-reduced-motion`.

## Consistency rules (design pass, 2026-09-15)

- **One speech bubble.** Wherever the child speaks (the hero screen, the photo-to-character card, the board, the gift cover, the map marker) it is the same bubble: white, a 3px `--ink` rim, Fredoka (`--font-kid`), `--radius-2`, a centred tail drawn with **physical** `border-right` + `border-bottom` (a logical border turned the RTL tail sideways). It pops in on `--ease-pop` and leaves on its own. The child says hello from the cover sticker (`gift.hello`) and "we're here" from the marker when it lands (`map.arrived`).
- **Colour lives in the chip, not the slab.** Inside a paper section, cards are white with `--shadow-1`; the tint goes on one rotated icon chip per card (`.step__icon`, `.feature__icon`, `--*-soft` fills) that turns the other way on hover. Full-colour slabs are reserved for the section sheets (`fm-sheet--*`, the demo, the final call). Six pastel cards in a row read as a sweet shop.
- **No hard shadows, no ink borders on controls.** Every control, including the worlds' arrows, is the button system: soft `--shadow-1`, lift `-2px` with its glow on hover, `scale(.96)` on press. `0 4px 0 var(--ink)` belongs to v1 and is gone.
- **Tokens only, still.** The hero eyebrow was the last hard-coded colour on the site; it is now the same translucent chip as the world names under the stage.
- **The title's last mark moves.** The hero lifts its closing `?` or `!` (`.hero4__q`), whichever the language ends with.
- **A page that hid** (`not-found`) wears the site header and footer, a centred button and a peeking mark; it is a page of the product, not a bare error.

## The wizard (create flow, polish 2026-09-15)

- **Steps have names.** `Stepper` (`src/ui/primitives.tsx`, `.fm-steps`) is a numbered dot and a label per step joined by a line: the ones behind are ticked on `--sun-soft`, the current one is lit `--sun` with a soft ring, the ones ahead are white with a `--line` rim. On a phone the labels fold away and one line under the dots says "Step 2 of 5 · Photo" (`count` prop, `common.stepOf`). Five anonymous dots said only "there are steps".
- **Form controls wear the product, not the browser.** A `<select>` sits inside `.fm-select`: the browser arrow is drawn away and the product's chevron (a mask, `--ink-2`) sits at the end of the field. A range input (`.cropper__zoom`) is a `--paper-3` track with a white thumb ringed in `--sea`, a small face and a big one at its ends. An invalid field (`aria-invalid`) shows a `--danger` rim with a `--coral-soft` ring.
- **A long note runs under the row.** The age note spans both columns (`.create__child-note`) instead of stacking four lines under a narrow select; the select is one size down (`--fs-400`) so its placeholder fits.
- **The consent travels with the button it unlocks.** On the crop step the checkbox and the two buttons are one panel (`.create__actions--panel`), never sticky: stuck to a phone's bottom it covered the crop circle.
- **The package step draws the choice the way the pricing section does**: a big number with the word small beside it (`.package__n`), the meta small, and a pill that says what a tap does and turns `--sun` once chosen (`.package__cta`, lined up along the bottom of the row). A world that can no longer be added (`.pick:disabled`) steps back at 55%.
- **Cards are as tall as their words.** The checkout grid aligns to the start; the summary no longer stretches to the pay card's height.
- **The dropzone's camera** sits in the same tilted `--sun-soft` chip the steps use and straightens on hover or drag-over.

### The wizard, second pass (2026-09-15)

- **A field is an answer, not a headline.** The name and age are `--fs-300` at weight 600, start-aligned, in a `--control-h` box. At `fm-input--lg` (32px, centred, weight 800) the example name read as the page's title and "Choose age" was cut in half.
- **The way on is in the middle.** `.create__actions` is a centred column: the primary action, with the way back quiet underneath it. It used to sit in a corner of the card, and the step count was printed there as well as on the stepper.
- **Every control on the photo step is ours.** The crop circle wears the white sticker rim on `--sun-soft` with a dashed guide inside; the zoom is a paper track with a sun thumb between a small and a large face; the consent tick is a sun-filled rounded box (`.uploader__tick`) — the browser's blue square was the one thing on the screen that belonged to somebody else.
- **The crop opens on the face.** `FaceDetector` where a browser has one; otherwise the crop opens a little above centre (42%), which is where a portrait puts a head. It is a starting point, never a lock: drag, arrows and zoom still decide.
- **A step warms the next one.** Each client step calls `router.prefetch` for where its button leads, so pressing it is a paint rather than a wait.
- **The worlds step is a confirmation.** The worlds are a ladder (`outOfOrderWorlds`), so the only selection the server accepts is the first `want` of them: the step shows what the package includes and marks the rest "opens with a bigger package", with the package step one tap away. It used to offer a choice it could not deliver.
- **A shelf is read at a glance.** A library card is a cover with the child lit in the tone of its state (`--sun-soft` ready, `--sea-soft` being made, `--paper-3` unfinished), a state pill with a dot on the corner, and one clear action. Every lifecycle status has parent-facing copy; a raw `PACKAGE_SELECTED` used to be printed as-is.
- **The child's tools are buttons on a painting.** `.scene__btn` is a white glass circle with a white rim and an ink glyph, lit gold under a finger and squashed to `.88` on press; the icons are one chunky stroke family (map, magnifiers, frame, speaker), not a video player's hairlines.
- **A screen fits its screen.** The map budgets its chrome (`--wmap-chrome`, larger when the parents' link is there) so the picture shrinks and the one obvious action is never under the fold.

## Reachable without a finger (audit A06/A07, 2026-09-15)

- **The account is always in the header.** The library link is never hidden: the words on a wide header, the mark alone (`.fm-header__account-icon`, a stroke glyph in the toolbar's language) below 860px, with its name on the link so it is never lost. Every header control is `--touch-min` (48px) on a phone — the adult floor, which the 40px `--sm` row was under.
- **The board can be searched with a keyboard.** The picture is focusable (`tabIndex=0`, `role="application"`, instructions on `aria-describedby`), and the arrows walk a gold crosshair (`.scene__cursor`) over it: 24px on screen per press, 96px with Shift, so the pace is the same at any zoom. Enter looks where it stands, through the same hit-testing a tap uses; Escape and blur put it away; the camera follows the crosshair to the edge of the view. Hiding spots are never tab stops — a list of them would hand over the answer.
