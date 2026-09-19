# Passport port onto the QA line — 2026-09-19

Branch `claude/qa-port-20260919`, two commits on top of `06699403`. Not pushed:
the user's arrangement is that Codex merges and pushes.

## What was missing, and why

`CODEX_STAMP_FINALE_RELEASE_20260918.md` integrated Claude's chain up to
`a312ae90`. Three commits came after it on `claude/passport-polish-20260917`
and were never seen by the QA line:

| commit | what | state |
| --- | --- | --- |
| `a15bccd3` | a place is half picture, half keepsakes | ported |
| `525e5ab5` | packages at 49 / 89 / 139 | cherry-picked as `65c61146` |
| `28a1cea1` | the print keeps its whole frame (caption strip removed) | ported |

Two independent checks agree on that boundary: the release note names the four
commits it took, and `git diff` between the two branches leaves exactly these
three changes plus the QA line's own work.

The design was reapplied **by hand, not merged**, per the handoff instruction.
Everything QA added is untouched: `preserve-3d` on the book, the turning leaf
that never fades, the blank reverse face, the shared `PassportStamp` (64/56/52),
guest navigation isolation, and every short-viewport rule. Only the
photograph's own sizing is replaced — the four fixed boxes (192/160/136/120px
wide, 125/90/88/64 tall) become floors of 120/96/88/80.

The QA line's `PassportStamp` refactor is kept over Claude's inline markup: it
is the better shape, and Claude's branch only ever duplicated it.

## One test changed

`scripts/verify-passport-touch.mjs` demanded that a 390x640 phone still scroll
vertically. That was the old layout's compromise — the leaf ran past the fold.
It now fits, so there was nothing to scroll to and the assertion failed for the
right reason. It now asserts the intent: the swipe must not turn the page, and
no content may be stranded — either the page scrolls, or it already fits.

## Verification

Disposable fictional beach fixture, mock providers, generation off. No paid
call, no real child asset, no account progress changed, no share issued.

- `npm run check` on the merged source: **250 files, 3347 passed, 2
  expected-fail, 35 skipped**, tsc clean. Run on vitest 4.1.11.
- `verify-passport-book.mjs`: zero document overflow at 1366x768, 390x844,
  360x740, 360x640. The smallest now needs **no** scroll, where the check
  tolerates 130px.
- `verify-passport-replay.mjs`: no duplicate finds, no repeated stamp, account
  progress unchanged, in-game passport scroll 0.
- `verify-passport-touch.mjs`: RTL swipe turns 2 to 3, no accidental zoom, a
  vertical swipe does not turn the page, no horizontal overflow.
- Half/half measured at **49-51%** of the leaf across all five viewports.
- Stamp clearance from the action row **4-5px**, no intersection, no spill off
  the leaf — the 3.9-4.6px the integration measured is preserved.
- Live ceremony, played to a real third find: 820x695, no internal overflow,
  two 240x64 primaries on one rank, the secondary row aligned beneath.
- Hebrew mid-turn frames at 120ms and 220ms: leaf opacity 1, book
  `preserve-3d`, both faces backface-hidden, reverse showing blank paper and
  the crest. No mirrored writing.
- Prices rendered live on the home page with the country override set to IL:
  **49 ₪ / 89 ₪ / 139 ₪**. Every surface — home, wizard package step, checkout
  — reads `priceFor`, so one edit moves all of them.

Two verifier failures were harness preconditions, not product faults, and are
recorded so the next run does not chase them: the scripts wait on Hebrew button
text (set the `findme_locale` cookie), and `verify-passport-replay.mjs` needs
the board **already complete** so a "play again" button exists, which a fresh
fixture does not give — place-3 is seeded 2-of-3.

## Open, and deliberately not decided here

- **USD is unchanged** at $22 / $39 / $56, set against the old shekel prices.
  The ILS drop moves the ratio from about 2.7 shekels per dollar to about 2.2,
  so the two currencies no longer describe the same product at the same price.
  Three numbers were given and they were the ILS ones.
- **The unit economics are stale.** `CODEX_HANDOFF_2026-09-07_SOL_HIGH_READINESS.md`
  reasons about margin at 59 ₪ a world and already warned that the measured cut
  was more expensive than its assumption. At 49 ₪ that case needs redoing. The
  dated handoffs were left as the historical record they are; `docs/I18N.md`,
  which was live guidance and had drifted two revisions, was corrected.
- **`.travel-passport__photo .passport-memory-fit`** still caps the cropped
  board photo at 125/90/64px inside a box that now grows. Only the in-game
  passport renders that crop, and only for a page whose photo is a chosen board
  hide; this fixture renders a plain image at every size, so there was nothing
  to observe. CSS that could not be seen failing was not edited.
- Pre-existing release gates (provider refund duplication, PayMe, PostgreSQL
  verification) are untouched and remain open.

No deployment was made from this branch.
