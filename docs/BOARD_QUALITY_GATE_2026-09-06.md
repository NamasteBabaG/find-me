# Board quality gate — 6 September 2026

## Incident and release boundary

A newly delivered nine-board QA game had 27/27 legacy `ok` judgements. The reviewer saw the extracted patch on gray beside the identity sheet, NOT the final board. It therefore approved recognizable faces with physically unsupported bodies. A Giza patch also had actual transparent holes in its forehead and nose. These were not merely shadows or natural hiding.

This change is a containment and repair layer, **not certification of every slot or a 100% visual-quality guarantee**. Existing delivered games and their evidence are not silently rewritten. Variant B remains unverified and off by default. Production remains paused; deployment is to the separate QA project only.

## Implemented

1. `diff-v2-enclosed-interior`: flood-fill enclosed holes in the binary silhouette BEFORE feathering, keeping RGB from the generated image. Never widen the outside contour; preserve 8-connected openings. This addresses closed transparency holes, not open cuts, background drift, or incorrect model anatomy. Historical extraction remains available with `--fillHoles=false`.
2. `boardComposite`: exact base / foreground / current patch ordering and flipping, with a crop centred on the actual patch. No synthetic white-background interpretation of physical hiding.
3. `board-quality-v3-consensus`: final board + enlarged patch on gray + full identity sheet. Separate checks for identity, face integrity, physical placement and style. First `gpt-4o-2024-11-20`; only if all pass, independent `gpt-5.4-2026-03-05` review. Every required check must pass both reviews. Any failure rejects; uncertainty, missing fields, unreadable output, unknown usage or an unexpected served model holds for review. The second reviewer is not told the first verdict. Both are models, not humans, and errors may correlate.
4. Failed patches get bounded retries (six total maximum), reserved in the database before each provider call so process interruption cannot evade the cap; structured failed criteria add fixed repair instructions. Arbitrary model-generated prose is not inserted as instructions. Unknown verdicts are retained for human review instead of repeatedly purchasing replacements. A second reviewer failure preserves the first review's known cost and request evidence.
5. `QA_AUTO_APPROVE` now means clean games only. Shipping a known-problem game requires a SEPARATE explicit `QA_DELIVER_WITH_PROBLEMS=true` on `APP_ENV=qa`, default false. Old identity-only approvals are not treated as current contextual approval when resuming unfinished work. Missing-patch procedural fallbacks remain diagnostic, not automatic successful deliveries.
6. Raw generation is retained as `PATCH_EVIDENCE/PRIVATE`, including accepted attempts. Ledger records source/reference/output hashes, prompt, extraction version and linked asset ID. It is never in `GameConfig`; game deletion removes it and the 14-day diagnostic retention policy expires it. Billing is in the ledger, not duplicated on the evidence asset.
7. Supported-body prompt v6 and explicit Paris carousel/café actions. Café copy and body-template label no longer ask a child to be "behind" an overhead awning. Coordinates were NOT moved without a verified placement experiment. The body-template label was corrected after the six paid renders; their manifests preserve the actual earlier prompt, including its conflicting parenthetical label. No subsequent paid rerun is claimed.
8. Last-start cutoff reduced to 30 seconds within the 300-second tick, allowing for the painter and two reviewers. Health exposes the quality gate version and effective delivery policy, without secrets.
9. `scripts/audit-board-patch.ts`: reusable standalone audit of an existing patch. Free by default; an explicit execute flag and sufficient cent budget are required to call the API. Unique output directory, durable pre-call reservation, exact request usage/IDs, input and code hashes, no remote mutation and no automatic replay of a pending call.

## Evidence and limits

Private, ignored evidence: `work/quality-gate-20260906/`. It includes all 27 original patches, reference sheet, board composites, three reviewer experiments, six fresh medium-quality renders, 14 historical extraction comparisons and exact manifests. Do not commit personal assets or publish the package to a public site.

| Evaluation | Result | Rate-based cost, US cents |
| --- | --- | ---: |
| 4o contextual reviewer alone, six existing patches | 4 pass, 2 fail; missed café placement | 3.256000 |
| 5.4 contextual reviewer alone, same six patches | 4 pass, 1 fail, 1 uncertain; missed carousel placement | 8.689500 |
| Consensus on all 27 existing patches | 16 pass, 9 fail, 2 uncertain | 49.884750 |
| Six new medium-quality renders, same child and three reported spots | 2 pass, 1 uncertain, 2 shape rejects, 1 reviewer reject | 49.998750 |
| OpenAI total | No pending/unknown charges | **111.829000** |

These are diagnostic results on one identity, with reviewer design informed by the reported defects. They are NOT blind held-out performance estimates. A higher rejection count does not prove that every rejection is correct. The known carousel, café and facial-hole cases no longer pass the combined gate. Natural carpet/boat/surfboard hiding controls passed. A known good peeking-head case still fails the pre-existing shape rule; no thresholds were loosened to make the gate green.

Fourteen old paid renders were re-extracted for free: zero shape pass/fail flips. This is regression evidence, not semantic proof of every changed pixel. A synthetic complete-extraction test reproduces skin nearly the colour of sand and verifies recovery of model RGB and opaque alpha. The two newly generated Giza views are not the lost original raw render, so they cannot prove recovery of that original face.

Claude Code independent review was attempted read-only, but stopped without a review result. Its CLI reported `error_max_budget_usd`, with $3.112680 usage despite a $1.50 limit. No further call was made. Combined reported API-equivalent cost for the round: **$4.230970**. Claude approval is pending, not granted. This value is reported usage, not confirmation of a cash invoice.

## Verification

- TypeScript clean and 367 tests / 51 files passed after the final code changes.
- 36 scene definitions validate; one existing inactive-beach size warning remains.
- New tests exercise real extraction from RGB inputs, closed vs open alpha holes, foreground order, both reviewer requests and costs, fail/unknown behavior, model/usage guard, safe retry advice, raw evidence privacy, deletion and expiry, and clean-only auto-delivery.
- Reusable audit CLI dry-run produced input images and plan without a paid request.
- Local main dev server and Prisma provider were not restarted or regenerated. Remote current game has not been changed. No human end-to-end new-game visual certification has been claimed.

## Required next acceptance work

1. Human review of all 27 current composites, especially the 11 flagged cases. Review both original and proposed replacement at normal play scale and find-zoom; record false positives too.
2. Do not simply rerender the whole game blindly. Repair one rejected target, retain its original, compare on board and replace only an approved result. A replacement is not yet applied to the existing delivered game by this change.
3. Author each fixed slot as a physical contract: support surface, safe body region, real occluder, protected face zone, expected scale and allowed pose. Invalid slots should be moved or removed, not accommodated by a permissive judge.
4. Validate the contracts on several distinct test identities, all 27 A slots per sellable world; B must complete the same validation before its flag is enabled. The renderer must keep face, hitbox and bubble consistent after any geometry replacement.
5. Move from colour difference as the primary silhouette toward a measured segmentation/matte strategy with protected facial interior, if open cuts remain frequent. Do not buy a wholesale model switch without a labelled held-out comparison.
6. Claude second review: concentrate on fail-closed behavior, the raw evidence lifecycle, cost accounting after interruption, actual foreground composition, and the CLI's reservation/refusal behavior. Existing game repair and slot certification are still open.

## Audit command

```powershell
npx tsx scripts/audit-board-patch.ts --scene=paris --target=awning --variant=A --patch=work/cell/patch.webp --geometry=work/cell/cell.json --reference=work/child-sheet.png --out=work/audit-unique
```

The geometry file may contain `geometry.rect`, `rectNorm` or a normalized `rect`. Add `--execute --budget-cents=12` only for an authorized paid audit. Pricing/reservation sources: [GPT-4o](https://developers.openai.com/api/docs/models/gpt-4o), [GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4), [vision token calculation and limitations](https://developers.openai.com/api/docs/guides/images-vision). Standard rates, no assumed cache discount; reasoning output is included.
