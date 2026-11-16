# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary buyer (confirmed by Guy, 2026-11-16):** a parent buying for their own child, usually on a phone in the evening. Before paying they need to see that the game really works and that the child's photo is safe.
- **Players:** the child, aged 4 to 10, on a phone held upright, a tablet, or a computer. Younger children may play with an adult.
- **Secondary:** gift givers (grandparents, relatives, birthdays) and the family members who open a shared game link.

## Product Purpose

איפה אני? turns one photo of a child into a personal search game. The child is drawn as an illustrated character and painted into large, detailed adventure paintings. The child then searches for themself, hide after hide. Success means a child shouting "that's me!" and a parent who trusted the site enough to buy.

## Positioning

A seek-and-find book where the hidden figure is your own child. The child is painted into the world, not stuck on as a sticker. Each world has nine illustrated places, every hide is checked before delivery, and a passport fills up as the child plays.

## Operating Context

- Parents buy through a wizard: name and age, search level (Explorers / Detectives), photo with crop, package, worlds, summary and payment.
- The game is prepared and checked after payment. Its status lives in the family area.
- Children play in the browser, with no app. The flow is map, then board (drag, zoom, hint, find), then the passport/bag.
- People who receive a shared link (play / friends / passport) stay inside the game and never get a website exit. This is decided in `docs/passport/CODEX_GUEST_ISOLATION_20260917.md`.
- Hebrew first (RTL), with English. Prices are in ILS in Israel and USD elsewhere.

## Capabilities and Constraints

- Every string goes through `src/i18n`: English is the source of truth and Hebrew is typed against it. Hebrew is gender-neutral, and the child speaks in the first person.
- CSS uses tokens only, on an 8px grid. Touch targets are at least 48px for adults and 64px on child screens. Child screens have no red X, no "try again" and no store.
- The domain, engine, payment and generation layers are out of scope for visual work. The game renderer's geometry (tap contracts, viewport) must not change.
- The child's source photo is private. Analytics carry no PII.
- Pricing is in flux: a flat price per world (29 ILS / $10) is on a separate branch. No price claims beyond what the code renders.
- Weak tablets (e.g. an older iPad) must stay smooth. Motion must be cheap: composite-only, with a reduced-motion fallback.

## Brand Commitments

- **The incumbent world stays (Guy, 2026-11-16):** "Playful Premium" (warm light ground, ink navy, sun yellow, gouache accents, Rubik/Fredoka, the paintings in front). Guy rejected replacement worlds (trail blazes, sticker album, tiles). Visual work upgrades this world toward professional precision: unified component language, better motion, less "AI-made". It never swaps the world for another.
- **Colour discipline (Guy, 2026-11-16):** not too colourful, no mess, everything consistent with the design system. On parent screens neutrals carry the page, sun means the action, ink means chosen, `--sun-soft` is the only chip tint, and the paintings carry every other colour. The table is in `docs/DESIGN_SYSTEM.md` ("Colour discipline").
- **Name:** "איפה אני?" everywhere in Hebrew. "Find Me Worlds" only in English and in the domain (Guy, 2026-11-16).
- **No emoji anywhere.** Use one stroke icon family (`src/ui/Icon.tsx`). No eyebrow labels above headings, and no copy that reads as AI-written (Guy, 2026-11-16).
- **The hero shows the find:** a child is found in a painting, with the search HUD, a tap, a ring, a bubble in the child's voice and a gold star into the tray. It is shown on the device a family holds, as the full board, with no labels under the stage. These are Guy's decisions, recorded in `src/app/home/Hero.tsx`.
- Gold stars are what a child collects. Closing a dialog is a plain ×. Phones play upright, and tablets are never told how to hold the device.
- Every owner screen has a visible way out (map/hub → parents' area).

## Evidence on Hand

- The illustrated boards: dense, saturated painted scenes in `public/scenes/*`, `public/home/boards/*`, and the hero crops `public/home/hero-*.webp`.
- A playable demo board (beach) with a demo child, and a transformation example (photo → character → in the world) in `public/demo/*` and `public/home/transform-found-*.webp`.
- The world catalog: journey (nine real places), kingdom, time travel. A world map painting.
- There are no testimonials, press, customer counts or reviews. Do not invent any.

## Product Principles

1. Show the child being found; never just describe it.
2. The paintings are the product. Interface chrome serves them and never competes with them.
3. Trust is earned in plain words: what happens to the photo, what you get, what it costs.
4. A child's screen is big, immediate and forgiving. A parent's screen is calm and certain.
5. Every screen has a way back.

## Accessibility & Inclusion

Child targets are at least 64px and adult targets at least 48px. Visible focus. Respect reduced motion. Readable contrast on painted backgrounds. Full RTL/LTR mirroring.
