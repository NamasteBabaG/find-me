# QA local-patch release — 2026-09-12

## Product contract

New QA drafts use `local-patch-world-v1` from their first step. The only offered package on QA is one world: nine boards, three painted appearances per board. Existing drafts, held games, historical board versions and the main production deployment are not migrated or resumed.

The first character is generated with the real, hash-verified atlas of painted board people and `character-v3-board-matched-matte`. The photograph determines identity and age; the board atlas determines illustration language. A style/identity review must pass before the parent sees the avatar and before board painting starts. There is no legacy portrait fallback. Scene-specific clothing, pose, illumination and saturation are conditioned on the actual local board crop.

## Connected route

1. Regular draft, name/age, photo, one-world package, checkout.
2. Queue identity stage: packaged-art preflight, one retained identity purchase, style review, approved illustrated avatar.
3. Local-patch queue: 27 authored placements, at most two render attempts per placement across restarts, one judge after local composition.
4. Render and judge purchases share the existing $4 world ledger. Retention precedes settlement; unknown charges hold the world and never silently become free or trigger repurchase.
5. Accepted crops become owned assets and targets with rect, hitRect and anchor. The same accepted patch is used for replay variants A/B.
6. Only 27 currently hash-bound passing appearances can produce READY. The fenced transaction saves nine scene configurations and the game, honors original-photo deletion, then sends the ready notification. Email failure does not revoke a playable game.
7. Owner/admin deletion covers generated, rejected, retained and orphan images, revokes worker publication, and preserves accounting plus unrelated/shared assets.

## Artwork and hints

Version 6 is selected explicitly for new local-patch games; legacy catalog defaults remain unchanged. All 27 hints describe the new placements. Static public WebP artwork and existing packaged source PNGs have different encodings but identical decoded RGBA pixels. The manifest pins both byte hashes and their common pixel hash. Runtime painting uses the already-packaged original PNGs; build validation proves they match the public artwork. No authenticated CDN fetch and no child imagery is included in the build.

## Verification performed before deployment

- Real isolated SQLite, FileBlob storage and ledger with synthetic providers: all nine boards and 27 targets reach READY; replay dispatches nothing.
- Refused or missing appearances never become avatar/body fallbacks or partial READY games.
- Changed crop bytes invalidate approval; unfenced legacy persistence/publication is refused.
- Approved display survives privacy cleanup only with a matching atomic cleanup receipt. Missing receipt, changed photo, age, identity or approval fingerprint is refused.
- Unknown-charge holds remain visible in the creation screen and do not starve later jobs.
- A failed ready email leaves a usable bearer play link and READY state.
- Wrong-quality imagery remains rejected even when its bill is unpriceable; deletion while providers are in flight does not recreate private imagery.

Synthetic verification proves orchestration, not the visual quality of a new paid generation. Record the live deployment and paid visual check separately below.

## Live verification

### First live run: deadline starvation correction

The first new game (`game_mruqsdt9sccz4n2im09r`, עומר) exposed a scheduling defect that synthetic instant preparation did not catch: a 270-second route required the full 240-second provider maximum plus 25 seconds for retention after all preparation. More than five seconds of identity, artwork and ledger reads therefore deferred an unreserved purchase on every tick. The initial character completed while the first hide stayed PENDING on attempt 1.

The correction separates minimum useful dispatch time (150 seconds for the image, 60 seconds for its judge) from the unchanged 240-second provider maximum. Both phases keep the 25-second retention margin and receive the actual remaining deadline. Keys, fingerprints, budgets and retained evidence do not change. Real queue/SQLite tests with six and twenty seconds of preparation now generate the first hide; replay adds no dispatch or cost. A genuinely too-short window still defers safely. Focused verification: 54 render/purchase/painter tests, 24 world tests, four player tests, both TypeScript checks.

Correction `4f828ee` was built and promoted to QA at approximately 10:40 UTC on 2026-09-12: deployment `dpl_HXG37KhmzaCvL2hUjRKgvifNTj5i`, `find-me-ko9a3z4cw-smallheroes-projects.vercel.app`. Both generation and APP_COMMIT are explicit build/runtime values. The existing creation page was refreshed; no order, identity, attempt or ledger record was reset.

Deployed to the **find-me-qa** Vercel project only on 2026-09-12. Main production was not changed.

- Release branch: `codex/qa-complete-world-20260912`, code commit `2e00a5c`; preserves the existing QA read-only partial-game review.
- Deployment: `dpl_7BLqG4gVTm4T79BNjbfEvV9AxYMr`, READY, promoted to `https://qa.findmeworlds.com/`.
- Generation is explicitly `on` in the deployment's build/runtime configuration and in the QA project's stored configuration. Existing held games were not resumed.
- Clean-checkout verification: 154 test files passed, 2,257 tests passed, 35 skipped. The subsequent neutral-child prompt change passed all 57 focused prompt/judge/render tests.
- Remote Linux build and trace audit passed: all nine art pairs match; no missing/private/stale traced assets. Jobs trace 213,675,710 bytes; largest trace 215,200,411 bytes.
- Live UI: new Bar, age-five draft accepted through the ordinary create form; the photo-upload step rendered. Unauthenticated diagnostics were refused by the QA gate. No error logs were returned for the new deployment when checked.
- **Paid visual acceptance remains unverified.** Browser automation refused local file selection (`fileChooser.setFiles: Not allowed`), before any image generation. The user was asked to select the previously authorized photo in the open upload screen. No provider spend occurred in this release verification, and no full-game success is claimed from the synthetic tests.
