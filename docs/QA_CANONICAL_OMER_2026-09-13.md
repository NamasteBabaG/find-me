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

Only the declared child box plus a 32px context guard may be returned, not the entire provider context. The child's box stays opaque. The guard carries the 12px fade only when the existing seam diagnostic permits it. An unusable boundary remains a billed, retained refusal, never a hard-paste approval. These deterministic metrics are not a visual guarantee: the final visual review also checks the actual individual composition.

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
