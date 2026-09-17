# Stamp integration hold — 2026-09-18

The user reported that Claude is actively working on this same feature. Design
edits and QA deployment are on hold to avoid competing changes.

## Ownership and safe baseline

- Claude's active worktree: `work/claude-passport-20260917`, branch
  `claude/passport-polish-20260917`, last observed commit `d6dfa794`.
- That tree has an uncommitted edit to `src/ui/passport/passport.css`; do not
  copy, revert or commit it from the integration tree.
- Current QA release remains `d26fb24a` (guest isolation). This work has NOT
  been deployed or pushed.
- Integration base: `38ec7a18`; parked on
  `codex/stamp-integration-hold-20260918`, separate from the QA release branch.

## Parked work (not final design)

Applied the deltas of `55d98ab2`, `0089f06d`, and `d6dfa794`, resolving CSS
conflicts while retaining our responsive flex layout and extra 3D flip fix.
Introduced a shared `PassportStamp` wrapper in `StampMark.tsx`: book and finale
now share the ring, 64/56/52px sizing, accessible visited label and brand eyes.
The finale keeps its existing `data-new` choreography.

The prior Claude chain shared only the eyes SVG; the finale still used its old
rectangular multiply-blended container. Confirm Claude's final version resolves
that too before deciding which implementation to retain.

Desktop browser inspection found a collision between the stamp and actions.
The parked fix anchors the stamp above the action row instead of measuring from
the bottom of the leaf. Latest phone measurements show separation; desktop must
be rechecked after a confirmed fresh load (the first measurements raced HMR).

## Checks completed / still required

- Focused book + finale tests: 18 passed before the last positioning change.
- Added assertions for mark-only accessible English/Hebrew labels and shared
  stamp class; no visible repeated words and no stamp on locked book pages.
- Disposable local fictional beach fixture only; no personal renders, paid
  calls, real account data or QA game progress changed.
- Observed 0 document overflow at 1440x900, 1366x768, 390x844, 360x740 and
  360x640. This alone does not prove absence of internal collisions.
- Owner passport and media API returned 200; local browser errors were empty.
- Full test gate was started while work was in progress; rerun on final merged
  source. Do not treat this checkpoint as verified for release.
- Still required: live finale, fresh desktop overlap check, Hebrew mid-turn
  frames, guest-isolation regression, complete gate, clean-commit QA deployment
  and live QA smoke test.

## Next handoff

Use Claude's final committed design as the source of truth. Apply only necessary
integration fixes; do not wholesale replace CSS because QA has additional
`preserve-3d`/no-opacity-flattening and small-viewport fixes absent from Claude's
branch. Preserve guest navigation isolation from `d26fb24a`.
