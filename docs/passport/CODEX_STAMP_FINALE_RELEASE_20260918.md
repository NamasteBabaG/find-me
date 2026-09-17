# Passport stamp + finale integration — 2026-09-18

## Scope and provenance

User approved integrating Claude's final six-commit design chain and our fixes,
then deploying to QA only. Claude's worktree was not changed. Earlier
`980ca39b`/`6fa9a43f` design was already in the QA release. This integration adds
the deltas of `55d98ab2`, `0089f06d`, `d6dfa794`, and `a312ae90`.

- Shared `PassportStamp` draws the eyes, ring, and accessible visited label in
  the book and the ceremony. No visible words inside the stamp.
- Book stamp is 64px, 56px on a short laptop, 52px on a phone.
- Claude's finale is preserved: flat print, larger ceremonial stamp, two matched
  240x64 primary actions and a secondary 48px link-style row.
- Finale stamp is 88px on desktop. At phone widths it becomes 64px at the print's
  lower corner: 88px covered the child's face on the small fixture photograph.
- Book stamp is anchored above the action row, not a guessed distance from the
  leaf footer. Measured clearances are 3.9–4.6px including its rotation.
- Photo-develop animation now settles flat, matching the new mount (it previously
  ended at -3deg then jumped flat when the phase changed).
- Retained the flex photo sizing, small-viewport fixes, book `preserve-3d`, no
  opacity flattening on the turning leaf, blank reverse face and guest isolation.

## Claude review blockers

`CLAUDE_REVIEW_20260917.md` reviewed the earlier `00368e48` baseline. Both highlighted
blockers already have fixes in our release ancestry (`bea4b219`): owner-fenced
paid-game reconciliation, and `prisma/changes/20260917-passport.sql` plus guarded
`scripts/qa-passport-migrate.mjs`. The QA-only migration/backfill receipt is in
`CODEX_CLAUDE_FIXES_20260917.md`. No schema changes or migration reruns in this task.
This does not claim production migration or close unrelated production gates.

## Verification

- Full `npm run check -- --maxWorkers=4`: **250 files, 3347 passed, 2 expected-fail,
  35 skipped**, no unexpected failures; tsc passed. Duration 520.63 seconds.
- Final targeted book/finale/sharing/guest/family regression: **7 files, 40 passed**.
- Isolated fictional beach fixture, mock providers, generation off; no paid call,
  real child asset, real progress change or account share issuance.
- Guest gift → map → all three finds → actual completion dialog → passport →
  back to board → second board and another three finds: successful. Guest views
  had no outbound account/home anchors. Browser errors empty.
- Desktop finale 1366x768: dialog 820x662.39, no internal overflow. Two primary
  actions measured 240x64, secondary row 48px tall. Accessible stamp 88px, round.
- Phone finale 360x640 after adaptation: no internal horizontal/vertical overflow,
  stamp 64px, label retained, photo transform `none`, face visible.
- Owner book loaded via local magic link and its authenticated media API. At
  1440x900, 1366x768, 390x844, 360x740, 360x640: zero document overflow; no stamp/
  action intersection; sizes 64/56/52/52/52. Photos and discoveries loaded.
- Hebrew guest book next/previous and English owner book opening exercised.
  Reduced-motion and blank-reverse behavior covered by existing interaction tests.
- The game behind the finale reports a 1px scroll-width difference with body
  overflow-x hidden; the dialog itself and passport do not overflow. No claim
  of a new board-camera fix is made by this UI release.
- No real iOS/Safari/device-touch or real-payment test in this task.

Screenshots and ephemeral fixture credentials remain in ignored `output/passport/`.
QA deployment and live smoke receipt will follow after the clean-commit build.
