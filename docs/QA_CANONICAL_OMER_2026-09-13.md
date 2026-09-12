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
