# Journey Detectives placements — 8 October 2026

Current state: **27 reviewed examples on nine boards, including all three new Antarctica v9 appearances with visible winter hats and distinct muted outfits. Nothing in this round has been activated in QA or the storefront.** Definitions: `docs/art/journey-detectives-placements-20261008.json`. Art provenance: `docs/art/journey-detectives-authoring-20261007.json`. The completed samples were judged by `gpt-5.6-sol` medium before the requested provider change. Following the user's explicit preference on 9 October, prospective authoring selects **Opus 5.5 HIGH** for scene quality and **Sol 6.1 HIGH** for head continuity. In the earlier four paid comparisons, Sol matched all four reused controls in both efforts; Opus accepted the same good Antarctica hide in both. Those receipts are unchanged, and selecting HIGH made no new provider calls. These are limited development comparisons, not independent holdout validation or a new-model review of every sample. See `docs/VISUAL_REVIEW_MODEL_POLICY_20261008.md`.

The previous claim that all 27 examples were visually valid was incorrect. Wider inspection confirmed damage to the New York newsstand seller and a headless foreground walker in Tokyo. Both acceptances were withdrawn and all paid images/reviews retained. Marrakech hide 3 was also replaced at the user's request.

## Corrections and current examples

| Board | Reviewed examples | Current activities |
| --- | ---: | --- |
| New York | 3 | Florist, leaf drawing, newsstand; intact first retained candidate selected again |
| Amazon | 3 | Leaf shelter, fruit notes, rope instruments |
| Paris | 3 | Petanque, scooter, bread counter |
| Marrakech | 3 | Musicians, pottery basket, new kneeling sapling gardener |
| Giza | 3 | Camel guide, hand drum, sand model |
| Tokyo | 3 | New far-left claw-machine activity, origami, sweets by blue machines |
| Great Wall | 3 | Upper-left pinwheels, bowl by flowers, lantern/tea stall |
| Sydney | 3 | Shells, nature-art table, ice-cream queue |
| Antarctica | 3 on v9 | Sled/notebook, foreground ice/shadow screen, windsock/field case; selected attempts 2 / 3 / 2 |

New York required no new purchase. The retained first candidate has an intact seller in wide native context and a distinct dark-plum jacket/indigo trousers; the later broken navy-outfit candidate remains rejected. Metadata adoption records the actual retained pixels and original recipe rather than pretending a new prompt was purchased.

Tokyo hide 1 moved away from the food-stall/walker overlap to the far-left claw machine. The foreground snack-basket child and the original food-stall walker remain whole. Marrakech hide 3 moved from the standing mosaic portrait to a kneeling child handling a sapling, with connected own hands and natural knee support. Both replacements passed automatic wide-context review and native authoring inspection.

The user's quality policy remains explicit: coherent deletion of an entire bystander or benign detail/prop change does not require repainting. Partial people, headless bodies, disconnected limbs, unnatural support, hard joins, visibly wrong identity or photographic/spotlit integration are defects. No paid redraw was made merely to restore a completely removed child or an inconsequential prop.

## Antarctica revision

V6 and v7 were rejected for repetitive faces/wardrobe; v8 was rejected for an empty foreground and small distant people. All three had **zero personalized image purchases**. V9 retains the recognizable polar composition, adds activity throughout the lower field and enlarges/redistributes the station/whale children. The user approved its art on 8 October, requiring a winter hat on every personalized child.

The provider did not preserve the masked center exactly. Reinserting the scaled old center produced joins and clipped new margin people; that recomposition was rejected and retained separately. V8 was the intact native provider painting; it was subsequently rejected for density/scale. V9 is a new intact native two-reference edit, with native inspection of its foreground and upper human field. It preserves the earlier composition semantically; exact pixel preservation is not claimed. The source art and rejected versions remain retained.

Three v9 placements have separate outfits, explicit age/support/light/occlusion instructions, bilingual hints and frozen diagnoses. Each requires an actual winter hat in both the drawing instructions and the support expectations supplied to the judge: plum wool hat, blue-grey knit hat, or charcoal ear-flap hat. The actual reference face and eyes remain visible; a bare head or a vague hood alone does not fulfill the authored requirement. The original rectangle-only validation missed neighboring heads crossed by all three return boundaries. Those windows were replaced before spending. All three new samples now pass the existing scene review and AFTER-only v2 head review. Native inspection includes final assembled pixels beyond the shipping crops; adjacent readers and walking children remain complete. The previous v5 acceptance is retained as superseded history, and current acceptance is bound to v9 and the three selected shipping hashes. Runtime playability remains untested.

### Source-boundary correction after independent review

The approved v9 art and all three target mask locations in board coordinates are unchanged. Context crops 1 and 2 move to show the adjacent head completely; hide 3 retains its context crop. Each now has an explicit crop-relative `returnRect`, with composition provenance `bounded-return/v4-authored-source-boundaries`. This is opt-in authoring only. Existing catalog definitions omit it and keep their exact historical 120px guard, pixels and fingerprints. Runtime publication does not yet accept this composition revision.

| Hide | Return region on the board (left, top, width, height) | Source-head treatment |
| --- | --- | --- |
| Antarctica 1 | 65, 585, 503, 665 | Teal companion and both lower map-reader heads wholly inside; notebook reader below wholly outside |
| Antarctica 2 | 120, 1540, 512, 520 | Blue ice companion head wholly inside; purple examiner and upper notebook reader heads outside |
| Antarctica 3 | 3348, 805, 492, 585 | Foreground blue walker head wholly inside; left helper and lower map-reader heads outside |

`docs/art/journey-detectives-boundary-head-zones-20261008.json` records source-hash-bound head/neck annotations and the rejected previous windows. Free regression tests reject all three old windows and accept the new ones, with the 12px feather kept off the annotated heads. This is a human-authored source constraint, not automatic face detection, not proof of every neighboring limb, and not acceptance of a future render. Final AFTER-pixel anatomy review remains necessary. The paid authoring entry point checks the annotations before any dispatch; its evidence crops and compositor use the same domain geometry function.

The validator also reports a scenery overlap between Tokyo 1 and 2's returned windows, not only their context crops. Neither reaches the sibling's target mask. The accepted retained board is preserved; its native visual evidence and exact reconstruction are the current acceptance evidence. New explicit windows must be disjoint. No new image was bought to remove an invisible scenery overlap.

## Prompt and evidence changes

- The optional per-hide `wardrobe` takes precedence over the board fallback. Hides without it retain historical behavior and fingerprints.
- `scene-integration-v4` has prompt version `v15-reference-neutral-integration`. It describes actual reference hairline, length, colour and texture rather than assuming dark curls. The local main worker now selects it for a fresh v12 hide row; normal generation and autonomous recovery share the same pinned-recipe resolver. Existing rows, including an existing v14 row with zero attempts or missing provenance, retain their stored/legacy recipe. A not-yet-created hide in a partially started game is also a fresh row; this is purchase-row pinning, not a new game-level release. These changes have not been deployed to QA.
- Follow-through inspection found the same dark-curl bias in surface-only restyling and the appended paint-style recovery instruction. The complete v15 request now neutralizes those directions as well. Historical v14 restyling text stays unchanged. Mocked provider tests cover both pinned recipes, retained-source replay and refusal to repurchase with swapped source pixels. This closes the instruction-routing gap; it is not a visual proof on a second reference.
- New Antarctica definitions use neutral pronouns and retain the mandatory hat. Unnecessary negative wording about curls has been removed. Some frozen outfits in the 24 paid examples remain gendered; do not rewrite their paid provenance. Reference-appropriate clothing in a future runtime catalog remains an activation check. Descriptions identifying an original bystander's dress or skirt are location clues, not target outfit instructions.
- New private reviews use `prepareFullBoardBoundaryEvidence`: compose on the actual full board, then extract registered native before/after context and all four continuous return-edge strips with 384 pixels of surrounding evidence. The old 192-pixel comparison stays the default for historical callers. The new helper is not yet wired into the active QA release.
- Synthetic regression evidence keeps the torso continuing below an erased head visible at a shipping-crop join. Renderer tests verify neutral wording, separate provenance and refusal to replay a new question against an old receipt.
- The observation parser accepts complete observations up to 600 characters. Required boundaries/checks and contradiction rejection remain enforced. Retained answers can be reparsed without repainting good images.

This is private authoring validation with a parent-stated-age illustrated sample, not a customer/manual image approval step. Passing samples do not prove every future reference, age or generated game will succeed. A real short-straight-haired synthetic reference is still needed before general activation.

## Judge calibration and purchase safety

Two paid wider-context re-reviews of the retained broken New York and Tokyo images both returned a false pass. The New York seller's face is merged with a shelf; Tokyo retains a headless walking child's body below the edited region. Wider BEFORE/AFTER evidence alone therefore has not fixed the judge. Those images remain rejected despite the automatic responses; a successful replacement is not evidence that the defective candidate would be automatically refused next time.

The AFTER-only prototype extracts native focus panels and asks for head-to-neck-to-own-body traces, located defects and justified natural occlusion; coherent whole-person deletion remains permitted. The first v1 comparison detected the broken Tokyo walker but falsely passed the New York seller. V2 adds a deterministic enlargement of the same final head pixels and explicit outer-silhouette inspection. In its four development controls it rejected both known defects and accepted their two good counterparts. The shared service reproduces that paid prompt, labels and image hashes exactly. These are reused calibration controls, not an independent validation set, and the prototype is not connected to QA.

The initial local calibration used a request key containing a slash accepted by the budget ledger but rejected by the retained store. The old purchase path first checked the new storage address after provider dispatch, losing its response and receipt. Its full $0.20 reservation remains an **unknown possible charge**, not released or assigned zero cost. A corrected-key call was initially refused before dispatch; after explicit authoring allowance and fully reserved continuation approval, new v1/v2 comparisons were purchased under separate keys. None replaces or settles the original unknown.

The purchase service now reads and validates every new durable address before reserving or dispatching. An unavailable read or orphaned retained result cannot trigger a new purchase. If both retained envelopes are permanently refused after an answer, the service finishes an unknown-charge hold and returns the available bytes to the owner, instead of leaving a falsely in-flight reservation. Local unit and real SQLite regression tests cover these cases. A preflight read prevents the observed invalid-key dispatch; it does not guarantee that every later storage write will succeed or recover the response already lost.

## Evidence and accounting

The same isolated ledger now contains **42 settled image purchases and 51 settled judge purchases**, including all failed/superseded candidates and calibrations. Its conservative settled usage estimate is **$5.654234**. Reservations total **$0.350000**: the original lost $0.20 response and the earlier $0.15 Sol 6.1 comparison request with no response or usage. Recorded commitment is **$6.004234** against the approved **$7** private authoring ceiling, leaving **$0.995766** numerically uncommitted. No pending, conflict or confirmed overrun rows exist. These are usage estimates/reservations, not a provider invoice; base art and original identity creation are excluded.

The historical approval authorized a $6 ceiling and continuation while retaining the original $0.20 in full. The subsequent explicit reply `מאשר` authorized **$7 for four named model comparisons only**, with both unknown reservations retained. `WorldBudget.forAuthorizedAuthoring` requires a verified exact-world grant; customer/default worlds remain capped at $5. The original requests and prior approval are unchanged, and a separate continuation record binds the newer unknown without inventing a receipt. A diagnostic unauthenticated GET failed with DNS `ENOTFOUND` inside the sandbox and reached HTTP 401 outside it; this explains the environment problem but does not establish a zero charge. Connected MED/HIGH calls use new immutable keys. The private grant refuses image generation and other new comparison keys; the unused numerical balance is not general spending authority.

The updated free audit verifies all 42 provider-image derivatives and all 51 retained settled reviews, reparses the 27 selected scene reviews and Antarctica head reviews, binds native acceptance to current hashes and reconstructs all nine boards exactly. It verifies the four new-model receipts, keeps both failed broad calibrations, v1's false pass, v2's limited success and both financial unknowns, and compares every historical request with the snapshot taken before the $7 approval. It makes zero provider calls and does not claim every historical provider response was recovered. Opus JSON fences are handled by the new strict-envelope parser; reparsing its two retained answers required no extra purchase.

## Checks

Before the independent-review follow-up, a full `npm run check -- --maxWorkers=2` passed TypeScript and 362 of 363 test files: 4,665 tests passed, one failed, two expected failures and 55 skipped. The failure was an unrelated offline production-bootstrap subprocess exceeding its 15-second Windows timeout. A subsequent isolated one-worker run of that file plus renderer, wide-evidence and boundary-parser files passed all four files and 57 tests. That earlier full invocation is recorded as a timeout failure, not relabeled green.

After the purchase preflight/hold fix, TypeScript and a focused six-file check passed **83 tests** covering paid-operation recovery, real SQLite retained storage, renderer provenance, wide evidence, boundary observations and the AFTER-only prototype. These source tests made no provider calls. The prototype's live visual detection remains unverified.

After the source-boundary and complete v15 recovery fixes, TypeScript and six focused files passed **134 tests**: return-region geometry (including all three old failing source borders), actual bounded composition, renderer/receipt pinning, scene-integration routing, purchase recovery and real SQLite retention. The first sandboxed invocation could not load tests due to Windows `EPERM` on `realpath`; the permitted local rerun ran the actual tests. An initial new test fixture lacked the placement required by the integrated painter and was corrected to an explicit synthetic placement. A full run was interrupted when the additional restyle bias was found; no full-pass claim is made for that interrupted run.

The final `npm run check -- --maxWorkers=4` passed TypeScript and **365 of 365 test files: 4,683 passed, 2 expected failures, 55 skipped** (465.12 seconds). Its ignored local log is `work/review-fixes-full-check-20261008.log`. The free retained-art/receipt audit again confirmed exact reconstruction of eight boards, 24 selected native acceptances, three pending appearances, 39 settled image requests, 39 settled judge requests, one unknown and zero new provider calls. These results validate the source changes and recorded evidence, not a successful new generative judge calibration or an updated QA deployment.

The earlier `scenes:validate`, `adventures:validate`, `git diff --check` and all 27 placement geometry/source checks passed; these are not visual or live-QA acceptance. The full check before the later $7 allowance and response-envelope fix passed TypeScript and **367/367 test files: 4,698 passed, 2 expected failures, 55 skipped** (464.86 seconds). All 27 source/placement definitions and both prospective authoring dry runs passed without provider calls. The newer four-file focused run passed **25 tests**, including retention of both unknown reservations at the new approved cap and rejection of ambiguous fenced responses, mismatched evidence and broken boundaries. The final full run is recorded in the model-policy report. Live model comparisons are separately evidenced there; none proves QA activation.

Free source check:

```powershell
npx tsx scripts/validate-detectives-placements.ts
```

## Before activation

Both exact model IDs passed live inference, and the four approved MED/HIGH comparisons are complete. **HIGH is selected for both roles by the user's subsequent instruction.** Remaining work is broader validation on unseen defects and a second reference, including the prepared short-straight-haired synthetic reference; binding the placements, policies and actual click/head/discovery geometry to a new runtime release; and authenticated player-flow verification. Antarctica sample rendering is complete. The comparison follow-up made exactly four paid review calls and zero new image renders; the subsequent HIGH-default change made no additional paid calls. Preserve historical games, all required hides and the customer per-world cap. No commit, push or QA deployment occurred in this round.
