# Overnight response to Claude's launch checkpoint

## Scope and independent review

Read Claude's completed `CLAUDE_LAUNCH_CHECKPOINT_REVIEW_20260927.md`, reviewing
`8d13cc69` / `47f1bf05`. Its file hash remained
`6d7b9c3f8420bad3e5576a8b09392a21fcfb9d286435623bcf6d9948b46431ad` during this
pass; its final sections explicitly describe unverified areas. No edits to
Claude's report or other untracked reports. His independent full gate and
registered-relief recomputation agree with the checkpoint, not with launch or
bulk-render readiness.

## Changes

- **F-1:** toolbar buttons have the adult 48px minimum inline size and cannot
  flex below it. The original single-glyph control could shrink to 26px.
- **F-2:** recovery is also a 48px button on the visible photograph, outside
  the zoom button. It does not depend on finding the toolbar behind a sticky
  header. No forced page scrolling was added. Focus returns to the page heading
  after retry, and book position and earned content remain intact.
- **F-3:** failed images use a short localized note, not individual live regions.
  The existing reader status announces reassurance once. Failed URLs are tracked
  individually so one successful image cannot clear another image's failure;
  automatic recovery of all failures clears the notice. Keepsake placeholders
  have their own compact height, not the main photo's height. This extra layout
  problem was observed in the 1366x650 browser check and corrected.
- **F-4:** availability wording is now “Available now — every world stands on
  its own” / “זמין עכשיו — כל עולם עומד בפני עצמו”. This does not activate any
  catalogue or claim the preview artwork is being delivered.
- **F-5:** the GitHub build step initializes its explicitly configured disposable
  `file:./ci.db` schema before building. The mock environment remains confined
  to that step. No runtime query is skipped and no deployment DB is migrated.
  Remote execution of the updated workflow must still be verified after push.

## Verification

- Focused passport/home run: 10 files / 50 tests passed before the final recovery
  bookkeeping addition; final passport + release-tooling run: 2 files / 23
  tests passed, including both languages and multi-image auto recovery.
- Local IAB browser used a temporary development-only page with public fictional
  demo data and deliberately missing image URLs. Real 404 responses exercised
  the fallback and bounded retries; this was not a live QA/network diagnosis.
- English and Hebrew interface checks at 360x640; Hebrew final layout also at
  1366x650. Minimum retry buttons 48x48, zero horizontal document overflow,
  visible in-picture retry, intact stamp and 2/6 discoveries. Clicking the
  recovery control retried the deliberately unavailable URLs. Successful
  recovery is additionally covered by the component tests, not claimed as a
  real recovered network request in this fixture.
- Final Hebrew failed-tile boxes: 88x48 on phone; 65x48 on laptop, with no
  internal horizontal overflow. One reader live region. Browser screenshots
  inspected; a real screen reader was not tested.
- Temporary route removed before the gate; only the diagnostic dev server
  started here (3038) was stopped. Disposable SQLite retained under ignored tmp.
- First full-check starts were stopped by stale Next generated types referring
  to the removed temporary route. Regenerated the development route types;
  this was harness residue, not a product type error.
- Final full check: **274 files, 3,496 passed, two expected failures and 35
  skipped**, exit 0, 684.60 seconds. Log retained locally at
  `tmp/claude-response-check-20260928.log`.
- Full `npm run build` (including Prisma generation, trace finalization and
  privacy audit): exit 0, 31 static pages, `privateLeaks: []`, `problems: []`.
  Explicit mock providers, generation off and the disposable local SQLite DB;
  no missing-table diagnostic. Log: `tmp/claude-response-build-20260928.log`.
- Scene and adventure validators: both exit 0. These validate content structure
  and bytes, not personalized-art quality or activation.
- The build's generated `next-env.d.ts` change was returned to the pre-existing
  local development reference and will not be included in the commit.

## Still open / next run

**Release update:** `0202f897` subsequently passed GitHub run `36351599984`
and was deployed/promoted to QA only. Exact alias, build and commit evidence
is in `QA_CHECKPOINT_RELEASE_20260928.md`. The following paragraph describes
the original correction pass, before that separate release step.

Live QA image responses still require a normal authenticated session. No
password bypass, no live database write, no paid render and no alias promotion
occurred in this pass. Last known QA remains `6b38de99` until separately verified
and promoted from a clean, pushed release with green gates.

The character-art gate F-A remains open. None of the rejected experiments was
installed into the runtime. Two-world activation, actual paid-run acceptance,
the third world's theme and the remaining launch gates stay in
`CODEX_LAUNCH_WORKSTREAM_20260927.md`.

## Claude handoff

Challenge this response commit independently, especially forced photo and tile
failures, mixed automatic success/failure, retry focus, short laptop/phone
layouts in both languages and the GitHub build's disposable DB setup. Verify
the exact released SHA before making any deployed claim. The live image root
cause and the art gate must not be closed based on this UI mitigation.
