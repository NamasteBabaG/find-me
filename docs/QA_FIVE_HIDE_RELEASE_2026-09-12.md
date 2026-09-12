# QA five-hide release — 12 September 2026

## Scope and compatibility

New QA `local-patch-world-v1` drafts pin all nine scenes to content version 7. Version 7 has five independently tappable targets per board: three unlock the next board, five complete this board, and the world has 45 unique stars. Version 6, its 27 placements, paid fingerprints and saved games are not migrated. The existing Omer game remains version 6.

The authored coordinates, hints, local support, depth, occlusion, lighting and wardrobe are in `src/domain/scene/local-patch-five-hides.ts`. Every board has one near, two middle and two deep placements. `scripts/inspect-five-hide-layout.ts` produces free placement overlays against the exact shipped art; these overlays are not evidence of generated-image quality.

## Generation and publication

- The initial identity uses the existing board-matched v4 contract and real board-people atlas. The parent's source photo defines likeness, not photographic finish. The avatar is a free full-portrait-cell display derivative, not another render and not a circular destructive crop.
- Each patch uses its own exact scene crop, mask and local lighting, plus original people from the same board as the style authority. Wardrobe is board-specific. Distant placements use smaller native geometry, not a foreground figure moved upwards.
- After the user approved the actual LOW pilot on 12 September, new version-7 patches use LOW, 768×1152, opaque. Version-6 patches and the initial identity remain MEDIUM; old paid fingerprints are unchanged. LOW reasoning is a separate setting: identity review and grouped board review use GPT-5.6 Luna LOW. No silent high-cost fallback is introduced.
- There is one review of the actual composed five-patch board, with five separately identified findings. Nine grouped calls replace 45 per-hide calls. Render-completion, review and publication evidence is tied to exact shipping pixels and geometry.
- Visual fail/unsure is advisory and never spends a visual retry or waits for human approval. A SYSTEM policy record honestly admits technically valid current images; it does not rewrite the judge into a pass. Technical corruption, mismatched ownership/bindings and unresolved charges still stop the unsafe operation.
- A ready email and one separate aggregated concern email have independent durable delivery records, immutable payloads and bounded/idempotent retries. Email failure does not unpublish the game. Concern counts refer to current distinct hides, not historical attempts or fault count.

## Server operation and money

The existing Vercel server cron runs once per minute (QA project is Pro), rather than every five minutes. The browser can nudge the queue but is not required for continuation. Existing lease/CAS fences, retained provider evidence and absolute dispatch deadlines remain active. The email drain has one 20-second window rather than an unbounded sequence of sends.

The inclusive world ceiling is USD4; the generic USD5 legacy ceiling must not silently extend it. Identity, render, grouped review and technical retries all belong in the same ledger. Admin and creation status use that ledger rather than summing duplicate asset/variant costs. Unknown and reserved amounts remain separate from settled usage-derived estimates.

Historical comparison: Omer (`game_mruqsdt9sccz4n2im09r`) was recorded in the preceding release report at **USD2.776271, 82 settled operations, 27 hides**. The new live admin independently confirmed that total on 12 September: identity about USD0.0725, images USD2.0253, judging USD0.6785. That is a usage/rate-card estimate, not a verified provider invoice, and excludes development/R&D, infrastructure, email and payment fees. The original MEDIUM planning target for the new 45-hide world was USD2–2.50. With the user's subsequent LOW approval, a provisional USD1.30–1.70 planning range follows from the one measured LOW patch and modest review/retry allowance; it is **not a measured complete-world cost or a guarantee**. The inclusive safety ceiling remains USD4. Neither token-rate savings nor synthetic tests prove the actual whole-world price.

Further cost experiments must compare LOW image output and/or multiple local scene crops per sheet against the same board's MEDIUM result, including face detail at game zoom and all input/repair costs. Do not ship an untested atlas or quote pixel-linear pricing as measured savings.

## Player and display

The find HUD is top-right, displays a larger contained full portrait, board stars and world stars. A single anchored found bubble is used on mobile. Unique target IDs are persisted immediately, including partial 2/5 or 4/5 progress. Three-star continuation is distinct from five-star completion. Loading clouds stay opaque and intercept input until the board assets finish decoding, including narrow/mobile viewports.

The admin's free full-face repair can derive a new display avatar from a retained local-patch identity sheet. Ownership/source/race checks are enforced; canonical identity, target art, paid evidence, publication state and share links are not regenerated.

## Verification evidence and limits

Verified using real isolated SQLite/DbStorage, synthetic providers and fresh clients: 45 targets, nine grouped reviews, raw fail/unsure findings, automatic publication, separate mail intents and no provider/mail redispatch on replay. Additional tests cover bounded budgets, unknown evidence, lost acknowledgements, ownership/pixel/geometry substitution, deletion, stale workers and legacy version-6 behavior.

Real-browser smoke at widths 320,390,430 and1440 used a disposable local game, public demo art and synthetic sprites. Verified arbitrary target order, 3-star unlock, 5-star completion, reload persistence at2/4, a single bubble, full portrait containment and delayed-decode cloud blocking. No browser errors were observed. Local evidence is under `work/browser-smoke/REPORT.md` with screenshots. Synthetic sprites are deliberately not a visual-style or likeness test.

Release status, final stable suite totals, deployed commit and any paid pilot outcome must be appended below only after they are observed. A green local suite alone is not live QA acceptance.

## Release record

Stable full verification: `npm run check -- --maxWorkers=2` exited 0, including both TypeScript projects and **168 test files, 2,430 passed tests, 35 skipped**. Three independent agents implemented/reviewed separate boundaries; the final avatar/outbox interaction also passed a separate 13-test review. Browser verification and the paid style pilot are recorded above/below. No production-site deployment is part of this release.

First QA deployment: code commit `8be4818`, deployment `dpl_2zAbUWZ6xeAwBEDVx6Do35WUZ7H1`, Linux/Postgres build and board trace audit passed. Promoted to `qa.findmeworlds.com`; alias listing confirms production `findmeworlds.com` remains on its separate old deployment. Unauthenticated `/admin` still redirects to the QA gate. No error-level runtime entries were returned for the first fifteen-minute release window. Server GET `/api/jobs/tick` returned200 at consecutive one-minute intervals, without a creating page nudging it.

Omer display-only repair was run through the authenticated admin button after deployment. New avatar `ast_8z71a96vctpqwt8x84hk` is512×512 and visually includes the complete face/hair; the old identity artwork itself was not regenerated. Live status remains DELIVERED, nine boards/27hides and the existing share URL remain. Reload showed9/9stamps, so existing browser progress was preserved. Ledger total stayed USD2.776271.

Live normal-wizard verification reached name/age and `/create/photo` using the public demo fixture. The browser extension refused `fileChooser.setFiles` because file-URL access is not enabled. No workaround was used. This is a browser-automation permission blocker, not a reproduced application upload failure. **A newly paid45-hide game, live grouped-review completion and live ready/concern email delivery have therefore not yet been observed on this deployment.** Their complete flow is proved by real-storage synthetic integration, not claimed as a completed live generation. User instructions for the extension were supplied; the draft photo screen is left available for handoff.

LOW follow-up:74 focused tests passed, covering the real queue selecting quality from the persisted scene version, actual multipart LOW for7/MEDIUM for6, unchanged legacy fingerprint, and refusal to reuse a MEDIUM purchase as LOW. Both TypeScript projects and diff checks passed; a second agent independently reviewed the version/identity/mixed-scene boundaries. Live admin listed exactly8historical orders,0generating and0awaiting payment; none was a newv7order. The only new draft stopped before upload/payment. No existingv7MEDIUM purchase needed migration. Final LOW deployment metadata is recorded after promotion.

Final LOW release: code commit `9416ec8` on `codex/qa-five-hides-20260912`; deployment `dpl_3aqxfxfLqXnKgmSHdSUixPHVXjYT`, hostname `find-me-pg1v6z8wq-smallheroes-projects.vercel.app`. Remote Linux/Postgres build and asset trace audit passed. Promotion succeeded and alias listing verified `qa.findmeworlds.com` points to it; production `findmeworlds.com` is unchanged. The authenticated photo page loaded after promotion without browser error entries. No additional paid call was needed for this setting change. The disposable local browser-smoke server was stopped; it is not the generation worker. The root worktree's existing user edits were left untouched.

### Paid style pilot — completed

The isolated public-demo pilot made exactly three image calls and three Luna LOW reviews, with no retries. All six settled, no reservation or unknown charge remains. Usage-priced estimates: initial identity USD0.072820; MEDIUM patch USD0.055949; LOW patch USD0.026519; three reviews together USD0.002177; **total USD0.157465**. This R&D cost is separate from any customer's world, and is not a provider invoice.

Main and independent-agent visual inspection agree: the initial identity uses matte painted planes, grouped hair and drawn contours rather than photographic finish; both Sydney patches change the reference outfit to beach clothing. MEDIUM preserves the reference face and restrained smile better in this pair. LOW costs 52.6% less for this one patch but rounds/enlarges the eyes and looks more generic. The initial recommendation was to retain MEDIUM. The user then explicitly accepted LOW as good enough; that product decision selects LOW for new v7 patches only. It does not prove identical quality across all boards. All three advisory reviews returned pass, which does not replace the visual comparison.

Evidence: `work/pilot/local-patch-style-v1/cost-report.json`, retained isolated SQLite ledger, source/atlas/identity, and `comparison-identity-before-medium-low.png`. No customer's image or game was changed by this experiment.
