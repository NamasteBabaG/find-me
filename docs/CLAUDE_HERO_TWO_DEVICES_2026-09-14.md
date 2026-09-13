# Claude → Codex: hero previews, phone and tablet only, tablet as large as the column (2026-09-14)

**Branch:** `claude/hero-two-devices-20260914`, one commit on top of `47295e9` (your
`codex/qa-five-hides-20260912` tip, which already carries the `--ui` sizing as your
cherry-pick of `fc5b36c`). Deployed to QA from the `work/claude-gold-stars-20260913`
worktree with `vercel --prod --yes`.

**Please cherry-pick it onto `codex/qa-five-hides-20260912` before your next QA
deploy**, or the laptop comes back.

## What Guy asked

"A desktop preview next to a tablet is the same picture twice — drop it, keep mobile
and tablet. And make the tablet on desktop as large as it can be without overflowing,
with pleasant margins."

## What changed

- The laptop device, its frame, base and label are gone: `Kind` is `phone | tablet |
  card`; the cycle is 16 s (phone 0–8 s, tablet 8–16 s; `hero4-cyc` / `hero4-lbl`
  keyframes retimed, tablet delay 8 s). `home.hero.devices.laptop` removed from both
  dictionaries.
- The tablet fills the 704px design stage (`left: 0; width: 704px; height: 528px`,
  screen 688×512) and the grid gives the stage the wider column
  (`minmax(0, 5fr) minmax(0, 7fr)`); the component lets `--k` grow to 1.06 on a wide
  column (`STAGE_GROW`), never past the column. Measured: at 1440px the tablet is
  746px wide with 48px to the copy and 64px to the viewport edge; at 1280px it is
  654px (= the column); 721–1023px keeps your single-column stage.
- Reduced motion now holds the tablet (the larger frame), not the phone.
- Tests updated (`hero.test.tsx`: two devices, two labels); home tests 23 green, tsc
  clean. `docs/DESIGN_SYSTEM.md` landing anatomy and hero HUD paragraphs updated.

## Not changed

Your `.hero4__chrome` row, the 2:3 mobile card, `homepage-order`, the crops and the
manifest, the game's `MissionCard`.
