# Omer: canonical identity and bounded patch quality (QA, 13 September 2026)

## Requested acceptance contract

- Keep the approved initial illustrated face and hair recognizable in every appearance. Do not borrow another board person's features or degraded distant anatomy.
- Board-specific wardrobe, illumination, saturation, contact shadow and natural occlusion remain. A hat may obscure hair, not the eyes or facial identity.
- Preserve depth variety without solving readability with a giant head or moving every hide to the foreground.
- Severe visible rectangular joins must not publish. Retry only the failed appearance, up to **three total image attempts**, persisted across restarts.
- Five appearances per board; three found unlock the next board; five complete it. Nine boards, 45 stars. Existing serial player behavior is unchanged.
- Create a separate new Omer game using the exact canonical illustration. Leave the delivered game and its paid requests unchanged. Base-board regeneration is future work, not part of this release.

## Verified causes

1. The former prompt explicitly redrew the face/hair using board people's simplification. This could conflict with recognizable identity.
2. The old face reference occupied about 220px within a padded 512px image; the judge's resize reduced the actual face to about 110px.
3. A detected misaligned/repainted border selected a hard paste instead of a fade; the advisory v7 policy still allowed publication. A 512x768 context crop could therefore appear as a visibly different rectangle.
4. Grouped review composited siblings together although the current player displays one child at a time. Strict review must see each individual player composition with pixels outside its join.

## Versioned correction

Catalog 8 is opt-in for new QA creation. Versions 6 and 7 retain their historic paid fingerprints, references and policy. The new painter receives the scene, the complete canonical portrait quadrant, board environmental examples, and the full unchanged identity sheet. LOW image quality and LOW judge effort remain; the additional reference may increase input cost.

The paid pilot exposed a second, deterministic defect: the provider returned a complete head above the hinted mask, but the initial32px return guard amputated it. A LOW grouped review missed this in Sydney3. The mask is guidance, not a measured silhouette. The derived compositor is now versioned separately from the unchanged paid request: `bounded-return/v2-head-safe` returns a predeclared120px context guard, with a12px edge feather. The tap measurement also searches the bounded head allowance rather than leaving the restored face untappable.

Raw seam evidence is preserved. A one-pixel axial mismatch with mean difference no greater than24 permits a bounded fade, not visual approval; larger shifts, diagonal one-by-one shifts and incompatible borders remain refused. Historical versions6/7 are unchanged. The strict grouped review includes a native close-up of each returned window in the same LOW call. An unusable boundary remains a billed, retained refusal, never a hard-paste approval. These deterministic metrics and margins are not a visual guarantee.

Strict review separates face likeness, face readability and severe seams from ordinary stylistic warnings. Definite defects trigger bounded targeted repair; uncertain/unreadable evidence does not invent an approval or an image purchase. Exhaustion is a durable generation failure, not a human-QA dependency or an automatic fourth attempt.

Canonical reuse requires a QA administrator, an explicit source asset and idempotent authorization, a paid non-refunded source order, original hash-bound painting/review evidence, and matching privacy-purge evidence when the original photograph has been deleted. The new game owns its copied assets. No new identity render or fake provider charge is created; the new game's sandbox payment webhook still authorizes generation.

## Previous game cost baseline (read-only QA ledger)

Source game: `game_57ogzsa72j29gtwgamev`, 45 appearances, nine boards, delivered.

| Operation | Calls | USD from recorded usage/rate card |
|---|---:|---:|
| Canonical identity image | 1 | 0.072820 |
| Hide images | 45 | 1.196875 |
| Identity and board reviews | 10 | 0.025984 |
| Total | 56 | **1.295679** |

All entries settled; no pending/unknown charges and no image retries. The ledger labels all charges `conservative-upper-estimate`, not provider invoices. These figures exclude hosting/storage and previously authored base boards. The new game's cost must be measured separately, including failed images and repeated reviews.

## Verification boundary

Unit and real-SQLite queue tests cover retained purchases, serial review evidence, targeted repair, three-attempt exhaustion, publication guards, and restart without duplicate calls. Visual identity fidelity, actual seams and readability at game zoom require real rendered output. Do not report those as established by synthetic tests alone.

Pre-deployment verification: `npm run check -- --maxWorkers=2` exited 0: 174 files, 2,531 tests passed and 35 skipped; both production and authoring TypeScript checks passed. Scene validation passed. Independent review checked all 45 real context crops after uniform resampling and a separate 6% brightness adjustment: neither caused false boundary refusals. The canonical-reuse integration includes signed sandbox payment, the real queue, one synthetic persisted hide, unchanged source accounting and correct notifications.

## Paid pilot and derived-image recovery

New game: `game_reuse_1cdd3ec511c539e2a20e404cda29`, created through the authenticated QA canonical-reuse UI and signed sandbox-payment flow. Source pixels are byte-identical; no identity image was purchased again. QA deployment `dpl_xU3QC544gtaH35x7UGGQFogtNSc7` ran the initial v8 pilot. Production alias remained untouched.

After the head-clipping defect was visually verified, only this game's job was parked using the existing `local-patch:needs-release` marker. Its active claim was revoked; hide attempts, paid records, order and old delivered game were unchanged. The in-flight answer was allowed to retain and settle. At the paused checkpoint: `$0.440642` settled, zero pending or unknown records. Server generation had progressed while the creating page was not open.

Independent native-image review of nine already-paid renders recomposed for free with the120px guard: all five Sydney appearances and Antarctica1/3/4 were visually coherent; Sydney3/5 had their complete hair/head restored. Antarctica2 still failed the numeric boundary check and was not silently admitted. This is evidence for those pictures, not a reliability claim for all45 placements. Recovery must preserve image attempts and charges, invalidate old visual approvals for changed pixels, and acquire a separately keyed fresh board review within the existing inclusive$4 reservation ceiling.

Antarctica2's already-paid first attempt passed the same bounded composition policy and independent visual inspection; its second attempt remained refused. The recovery path can select that authenticated earlier retained purchase without resetting the attempt high-water mark or buying a third image. It records the source purchase and selection evidence and requires a fresh review of the new pixels.

Head-safe release verification (frozen sources): `npm run check -- --maxWorkers=2` exited0, **175 files and2,546 tests passed,35 skipped**, including both TypeScript checks. Real-SQLite recovery coverage proves paid-image reuse, unchanged costs and attempts, authentic envelope checks, old approval invalidation and stale-claim rollback. Player tests find all five via pointer events at1280x800 and390x650 without a stuck cloud curtain. Live player verification remains required after generation completes.

## Pixel-correlation candidate filter, not visible-seam approval

Release `cc52a94` deployed as `dpl_6M7W4CQdnoBDYZx5PsgeeFnNLkZx`; only QA aliases changed. Server cron resumed the same game. Actual stored Sydney and Antarctica images were inspected independently (10/10 complete faces), and both boards passed freshly keyed LOW reviews. Antarctica2 selected its authentic paid first image while keeping attempt high-water2. No image was purchased for the recovery.

The next live evidence showed the axial-only candidate bound unnecessarily spending retries: Giza4's two paid images both correlated best at(-1,+1), with mean differences21.913 and17.176, yet independent native-image inspections found no conspicuous rectangle. Edge-specific shifts disagreed, so the scalar correlation was not proof of one rigid global displacement or a severe visible join. Tokyo supplied another low-difference diagonal example. Only the new game was parked again, revoking its claim while keeping paid answers and attempt limits.

The next derived policy permits integer offsets of at most1 **per axis** (diagonal distance is sqrt(2), not one pixel total), still requiring mean difference<=24. This is permission to construct a bounded, feathered candidate for mandatory native visual review, not permission to publish. Raw misalignment evidence remains unchanged; pixels are not translated; larger offsets and incompatible borders remain refused. Current severeSeam/faceReadable/faceLikeness gates remain mandatory. A new compositor version requires authentic free recomposition and fresh hash-bound review; deletion inventory must retain previous versioned review keys as well as current and legacy keys.

Implemented as `bounded-return/v3-head-safe-axis`. Frozen full check exited 0: **175 files, 2,554 tests passed, 35 skipped**, both TypeScript checks passed. Coverage includes actual textured fixtures for all eight neighboring offsets, exact unchanged outside/interior pixels, unchanged legacy refusal, and real-queue tests proving a tolerated diagonal that fails face readability or severe seams remains unpublishable and never buys a fourth attempt. Historical deletion inventory includes 730 keys per board (v7 plus 243 vectors across original, v2, current). At the second paused checkpoint: 27 settled images and 3 grouped reviews totaled **$0.919001** (images $0.907652, reviews $0.011349), no pending/unknown/reserved/conflicting records.

## Private verification of the completed product

The existing QA-only `/qa-review/[gameId]` route now also accepts an authenticated owner/admin's completed version8 local-patch game. It requires READY/DELIVERED, a completed generation job, nine generated version8 scene records and the matching published45-target configuration. It refreshes the existing asset signatures and uses the actual `GameShell` with `readOnlyPreview`, preserving the gift and normal play interactions while neither reading/writing the family's saved progress nor sending gameplay telemetry. The historical wizard-review branch is unchanged. Unfinished games do not become playable through this route.

Independent review found no auth/privacy/regression blocker. Focused verification covers26 route cases plus4 existing play-store cases. This support route is not evidence of successful live gameplay: that verification follows completion of the server-side game.

Frozen release check: `npm run check -- --maxWorkers=2` exited0, **176 files,2,580 tests passed,35 skipped**, both TypeScript checks passed. Generation continued independently on QA while these local tests ran.

## Exhaustion and review-only repair of already-paid pictures

The completed server pass stopped automatically at44 GENERATED and Greatwall5 FAILED after three image attempts. The ledger closed at **$2.194505**:64 settled images $2.152989 and12 grouped reviews $0.041516, with no pending/unknown/reserved charges. This is not a successful45-image game. Independent native inspection found another real blocker: Tokyo3's third image had a coherent but generic, insufficiently recognizable face despite the LOW Luna pass. Never promote that machine pass into a claim of verified identity.

A local background-join experiment preserves the selected child's existing paid pixels and its12px guard, changes nothing outside the original declared120px window, and feathers only a six-pixel irregular background boundary. The failed raw rectangular diagnostics remain unchanged. This is not another image generation and is not permission to publish. Tokyo's paid second candidate was additionally rejected by independent inspection for orphaned legs; the selected alternative is its first paid image. Greatwall5 selects paid attempt3. Both remain subject to fresh review against the canonical portrait.

The QA-only repair entrypoint stages exactly two authenticated paid candidates privately. It freezes all45 current row digests, the selected raw receipts, alpha/candidate digests, canonical identity/provenance and two future review keys before dispatch. No target is replaced at staging. The real queue has an early review-only branch that cannot dispatch images or reset image attempts. Two separately keyed SOL LOW reviews inspect the actual serial compositions and native face panels using the existing inclusive$4 ledger; a fail/unsure blocks the batch. Only two passing reviews allow an atomic two-target replacement with new machine bindings. The other43 pictures, geometry, attempts and costs remain unchanged. Four of those (Greatwall1–4) were still awaiting their first current grouped review because the fifth hide failed; they receive their own fresh bindings from the same SOL review, not historical or invented approval. The other39 target records remain unchanged. Publication rereads the full settled bills, retained replies, candidate/identity bytes and rederived verdicts; it does not trust a stored word `pass`.

The alpha/candidate assets and future retained-review keys are inventoried for deletion even if staging or a worker's acknowledgement is interrupted. Promotion moves private candidate bytes to their game asset path inside the same transaction. Payment/refund and canonical metadata are rechecked inside the transaction, not merely before preparing images.

This section records the implementation and candidate evidence, not a finished game. Final frozen test results, actual corrective review costs and live gameplay verification must be appended after they occur.

Frozen repair release: `npm run check -- --maxWorkers=2` exited0, **182 files,2,684 tests passed,35 skipped**, both TypeScript checks passed (357 seconds). The real SQLite integration starts with the actual four pending Greatwall siblings and proves their first fresh bindings, two corrected assets,39 byte-identical approved records and43 unchanged images/attempts/geometry/costs. Native-image/geometry substitution before staging, changed identity/refund during staging, lost commit acknowledgement and retained-answer replay are covered. Independent review verified notification routing and no fourth-image path. These are release tests, not the live corrective judge's result.

The pre-commit credential scanner falsely matched the substring `sk-` inside the descriptive repair-policy label. No credential was staged. The label was renamed to `publish-paid-join-after-canonical-sol-review/v1`; the32 publication/integration tests and TypeScript passed again after that label-only change.

Live staging correctly refused the study's authored-WEBP hash where its contract expects the normalized pinned-PNG hash. Independent comparison proved both decoded boards pixel-identical and both candidate PNGs byte-identical; only the private input metadata was corrected. The next preflight hit the route's60-second host limit before any repair audit or purchase. The review-only preparation route now allows300seconds, matching its native evidence/storage workload; the actual paid phases retain their own absolute deadlines. The22 route tests and TypeScript passed after this duration-only change. No source picture or attempt cap changed.

## Delivered and exercised end to end

Final runtime commit `74f20c3367e3123e090f74679a314da4d22723bc` deployed to QA as `dpl_FBeYzpH9TQaw9PiHc2KgUCZyAznU`. Only the QA aliases were promoted. At 2026-09-13 01:59:39 UTC the new game became ready and then DELIVERED; the generation job is DONE, with no last error. The repair audit is committed. The server cron performed both reviews and final publication without a creating-page nudge.

Both corrective SOL LOW reviews passed all five appearances on their respective boards with empty faults. Tokyo3 uses its authentic paid first image; Greatwall5 uses its paid third image. Their existing child pixels were preserved, not repainted. Exactly two images changed, four previously unreviewed Greatwall siblings acquired their first actual approval, and the other39 approved target rows stayed unchanged. No fourth image attempt or human approval was created.

An independent live database read verified all45 current shipping PNG digests, geometry digests and verdict digests against their current SYSTEM publication policies and the canonical identity digest. All are owned READY game assets, version8, with face likeness, readability and severe-seam checks passing. This is verification of the actual shipping bytes, not just target status counts.

### Live gameplay acceptance

The root agent exercised **all45 finds** through actual pointer clicks in the authenticated private QA preview of the published game, in route order: New York, Amazon, Paris, Marrakech, Giza, Tokyo, Greatwall, Sydney, Antarctica. The browser's actual measured viewport was1905x1009. Every board reached5/5, and the adventure passport showed9 completed boards and45/45 world stars. The three-star continuation choice was exercised by staying to find the remaining two. The serial transitions removed the old child, presented the next target, reopened the clouds, and returned to searching. Immediate found-state checks confirmed one success bubble and one particle celebration. The final browser error log was empty.

Six finds were exercised individually and39 through a bounded UI helper. The helper uses the game's visible hint and glow, not hidden game state or a direct progress mutation. One hint-center click on Amazon's peeking appearance missed; clicking the visible child's face succeeded immediately and advanced normally. Initial helper clicks during a board-opening animation were ignored; retrying after the actual open state worked. These were test-target/timing issues, not evidence of a frozen game. The magnifier can point above a face because the inherited anchor may include changed background; exact anatomical hint placement remains a non-blocking polish item and was not silently called perfect.

The three player/viewport suites were rerun on the final sources: **20 tests passed**, including the real viewport-hook pointer sequences at1280x800 and390x650, serial cloud transitions and three/five-star rules. These are jsdom integration tests, not a physical-phone test. The connected Chrome viewport override did not change its measured dimensions, so this session does **not** claim a live390px browser or physical-device visual check. Temporary overrides were reset.

The independent post-play read at02:26:25UTC, before opening the ordinary public gift link, confirmed zero new-game play sessions, progress events or found events. The published config digest remained `dd8f803a770e4c0956ae328d174fdc9c1150e649134c6dd6d6b18643170cfecb`. The old Omer game still had its prior2 sessions,106 events and42 found events, and its config digest remained `702beb123f668852274105136295bbaae7e5427b278d7f66020a3086c7dacd2a`. Its canonical pixels and paid ledger also match the frozen source evidence. The ordinary share URL was subsequently opened only to its unopened gift landing and left as the user-facing deliverable; no family finds were consumed there.

### Final generation cost and notification

| Operation | Settled calls | Recorded USD |
|---|---:|---:|
| Hide images, including failed attempts |64|2.152989|
| Grouped and corrective reviews |14|0.196446|
| New portrait render |0|0|
| **Total** |**78**|**2.349435**|

The two corrective SOL LOW reviews account for$0.154930 of that total. There are zero pending, unknown, conflicting or reserved charges. The existing inclusive$4 cap was not increased. This is the complete new-game generation ledger, including retries; it is not a provider invoice and excludes hosting/storage and previously authored base boards. The previous delivered Omer game cost$1.295679 under the same recorded-rate basis. The corrected run therefore cost$1.053756 more, about81.3%, rather than being claimed as a cost saving. Canonical identity reuse avoided another portrait purchase.

The ready notification was handed to the configured mail provider once, without fallback, under provider id `eb5fd87e-06dc-4049-ac34-b1fda2300cf2`. This proves provider acceptance, not inbox receipt. No separate concerns notice was generated because the final45 verdicts contain no outstanding faults. The actual active share URL was read from that persisted notification, not reconstructed or invented.

The already-authored boards were not regenerated. Their tiny distant background people can still contain the defects previously reported by the user; this release addresses Omer's canonical identity, bounded patch publication and playable flow, not a claim that all base artwork is flawless.
