# Board paint refinement — 27 September 2026

## Decision

**F-A remains open. None of this round's candidates is approved for bulk rendering, replacement in a game, or QA deployment.** This is a reproducible experiment, not a release. The user's broad permission enabled the experiments; it does not turn failed visual evidence into acceptance.

No existing runtime recipe, catalogue, game asset, identity, or QA deployment was changed. The added finishing functions are opt-in experimental building blocks, not wired into the generation runner. Current findings do not resolve the original placement/prop-preservation problems.

## Scope and evidence

Private evidence root: `storage/bar-paint-refinement-20260927/`. This folder is Git-ignored because it includes the child's identity and generated private assets. It is not a public review page or a substitute for a durable private backup.

Approved reference: `output/bar-material-review-20260923/dragon-stool-style-proof-v2.png`, SHA-256 `b8327c332d9af3cd6d7560ccd0d2a65d7112794965c71900faa48d48ce441e2c`. The paint reference was a crop at `(150,142,340,420)`. Identity remained the original `identity-normalized.png`; derived painted identity was used only in the explicitly named placement experiment below.

Inputs, prompts, masks, rendering policy, raw provider outputs, composed candidates and hashes were pinned per request. Purchases used the existing provider adapter and retained-purchase/ledger path, with fixed request keys and no automatic retries. Real image calls, not screenshots of mocks.

## Experiments and results

| Experiment | Result |
|---|---|
| Original hide-3, head-only medium edit | Provider moved the head; reapplying the original mask cut the new head and left old hair. Rejected. |
| Earlier grounded B candidate, head finish | More paint, but changed the face/head geometry. Rejected. |
| Painted canonical portrait | Better brushwork as a portrait; not proof of placement quality. Original canonical identity untouched. |
| Placement using that painted portrait | Changed pose/wardrobe and lost finish during placement. Rejected. |
| Close-up finishing of B | Promising paint, but changed facial geometry. Its early crop-roundtrip compositor was not suitable for pixel protection. |
| New native-mask finishing stage, four cases | Native protected pixels unchanged; painterly finish improves, but all four have facial-geometry drift. Ice also acquires an inappropriate warm cast; dragon-2 appears oversized. Rejected. |
| Free skin-only residual transfer | Exact protected pixels but unnatural cheek streaks/marks. Rejected by visual inspection. |
| Direct generation inside skin-only masks, dragon-3 and ice-1 | Features/outline preserved, but isolated orange patches rather than integrated painting. Ice colour conflicts with local light. Rejected. |

The four-case suite used dragon-1, dragon-2, dragon-3, and ice-1. Dragon-3 used the previous `b-v13-low.png` candidate; its already altered pose/scale must not be described as fixed by the finishing stage. Other bases are retained existing game crops. This round is **not** a new successful placement run across four boards.

## Additional visual challenge

An additional provider-model review (not Claude, not an independent human review) examined canonical identity, approved finish, before/after crops, identical face windows, and board context. Captures and raw answers are in:

- `engine-pilot/review-request.json` and `review-raw.json`: four whole-head finishes. All four geometry checks fail; no candidate recommended for human approval or bulk.
- `engine-pilot/review-skin-request.json` and `review-skin-raw.json`: two direct skin-only finishes. Geometry passes both; paint finish fails both, ice integration fails. No candidate recommended.

These advisory responses are not consumed by the product, and cannot automatically approve assets. Pixel protection and passing code tests do not certify art quality.

## What the code establishes

`board-face-finish.ts` prepares a square close-up with separately supplied canonical identity and approved paint reference. It validates the explicitly authored native mask/window before purchase and fingerprints the exact prompt, policy, references, target and mask. It reuses retained purchases and refuses changed inputs under the same purchase key.

Composition downsamples **only generated content**, then reapplies the native alpha onto the original crop. All pixels outside that alpha are preserved. This is stronger than round-tripping the entire face window, but says nothing about altered facial geometry *inside* an editable region. Every result is marked `requiresVisualReview: true`.

`board-skin-paint.ts` is a failed offline alternative retained for reproducibility, not an approved implementation. Its manually authored skin planes and residual transfer must not be used on other faces without authoring. It is neither face detection nor registration.

Masks/windows in these pilots are manually authored for Bar's specific appearances. They are not a general solution for 54 appearances, other identities or poses.

## Cost and verification

This round: **11 image purchases + 2 visual-model reviews**, all settled, no pending or unknown purchases.

- Images: 733,629 micro-USD.
- Reviews: 136,501 micro-USD.
- Total: **870,130 micro-USD = $0.870130**, conservative ledger estimate, not a reconciled supplier invoice.
- Script guard: $2 cumulative ceiling. The local ledger itself was initialized with $5; scripts enforce the stricter $2, and `budget.json` exposes both. Do not report its raw `remainingMicroUsd` as this experiment's spend allowance.
- Earlier v12 and A/B/C rounds are excluded from this total.

Full `npm run check` passed at the first finishing-stage checkpoint: 271 files, 3,483 passing tests, 2 expected failures and 35 skipped. Log: `storage/bar-paint-refinement-20260927/check.log`.

After the final skin experiments/CLI changes: `tsc --noEmit` passed and the three targeted suites passed **9/9**. The full suite was not rerun after those last changes. No live browser or QA deployment verification was performed because no release was made.

## Next technical decision, not another prompt-only retry

The experiments expose a tradeoff: freeing the whole head allows cohesive repainting but drifts identity geometry; locking almost everything leaves isolated patches. A next implementation must handle **geometry-aware registration and local illumination separately from paint synthesis**, or demonstrate another technique on the same fixed cases. This is a hypothesis, not a proven fix.

Do not simply increase quality, broaden a mask, blend the entire image or add more orange facial planes. Do not call a painted portrait an engine acceptance sample. Retain native facial feature alignment, head scale, youthful anatomy, local scene colour and all protected props. A result must pass in board context and at native size, not merely an enlarged face crop.

The original dragon-2 block-arch/crop-boundary defect is still open and must be resolved separately before placement acceptance. None of these facial experiments repairs it.

## Brief for Claude — independent challenge

1. Read this report and `CLAUDE_V12_SAMPLE_REVIEW_20260927.md`; inspect the actual approved reference.
2. Recompute request fingerprints and verify fixed-key replay cannot purchase again or accept different inputs. Run the three targeted suites.
3. Inspect the four whole-head cases and two direct skin-only cases against their own before images, both natively and in full-board context. Treat the model reviews as claims to challenge, not ground truth.
4. Verify exact protected pixels independently, including eyes/mouth/hair for direct skin-only cases. Do not infer visual acceptance from that result.
5. Challenge whether a geometry-registered finish can preserve local light without producing patches; propose one bounded falsifiable test, not a batch of new generations. No paid calls or shared-tree edits during read-only review.
6. Confirm no runtime import/activation, catalogue change or QA publication occurred. Return acceptance/rejection with located evidence. F-A stays open unless actual matching output is demonstrated.

User approval for further scoped work already exists; no need to ask them to approve each prompt variation. A new bulk run remains inappropriate while the visual gate fails.
