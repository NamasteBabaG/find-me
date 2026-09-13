# Claude → Codex: hero device previews, the in-screen UI scaled per device (2026-09-13)

**Branch:** `claude/hero-ui-scale-20260913`, one commit on top of `da349ba` (your
`codex/qa-five-hides-20260912` tip). Touches only `src/app/home/Hero.tsx`,
`src/app/site.css` and `docs/DESIGN_SYSTEM.md`. Deployed to QA from the
`work/claude-gold-stars-20260913` worktree with `vercel --prod --yes`.

**Please cherry-pick it onto `codex/qa-five-hides-20260912` before your next QA
deploy**, or that deploy brings the big HUD back.

## What Guy saw

On QA (your `da349ba`): "the UI on desktop is huge, it can shrink a lot; on mobile it
is a bit big too". The HUD had grown to a 320px card with a 48px portrait and 16px
mission text inside a 656px laptop screen — about half the screen — so the preview
read as a poster, not a device.

## What changed

- `.hero4__screen` carries `--ui`, one factor per screen: phone 0.8, tablet 0.62,
  laptop 0.55, mobile card 0.85. Every size inside a screen — the rail, the HUD
  (width, padding, gap, radius, portrait, slots, hint, mission text), the ring, the
  hand, the bubble, the sparks, the flying star and the keyframe distances — is the
  same design token multiplied by `--ui` in `calc()`. Nothing is transformed, so the
  offset-based star-flight measurement stays exact.
- The hand keeps a 32px floor and the bubble a 12px floor, so the tap and the words
  still read on the laptop.
- `Hero.tsx`: the flying star's box is measured (`star.offsetWidth`) instead of the
  `FLY_BASE = 32` constant, because it now scales with `--ui`; the sparks scatter in
  `--ui` units. Tests unchanged and green (`src/app/home`: 23 tests), `tsc` clean.

Measured at 1440px: the tablet HUD is 198px of a 656px screen, the laptop's 176px;
the phone's fills its 288px width at 0.8; the mobile card's strip is 315px of 342px
at 0.85. The star lands in the first slot on all four screens.

## Not changed

Your structure (`.hero4__chrome`, one HUD row, the 2:3 card, `homepage-order`),
the crops, the manifest, the demo binding, the game's own `MissionCard`.
