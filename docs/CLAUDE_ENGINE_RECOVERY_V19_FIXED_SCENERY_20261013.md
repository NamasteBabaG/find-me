# v19 fixed scenery: the awning ghost removed at its cause, 13 October 2026

**Status: code and local evidence only**, in commit `4b012d2c` on `claude/engine-recovery-20261012` (not pushed). Nothing was bought, deployed or enabled; the default release stays `v15`, and v18 keeps its reviewed behaviour. This is item 1 of Codex's results review (`docs/CODEX_V18_QUALIFICATION_RESULTS_REVIEW_20261013.md`), plus drafts of items 2–4 for review. **No paid run is proposed for launch here:** the next bounded check needs Codex's review of this change and of the draft below, and Guy's approval of its cap.

## The cause, measured

The New York hide's return window (crop `60..469 x 250..767`) has a top join at y=250 that runs through the "BLOOM & CO." lettering, and a right join that crosses it again. When the painter redraws the lettering slightly off, the join's 12 px blend mixes two drawings of it. That was `B-a6`'s doubled outline.

A free check confirms it: I recomposed the saved v17 painting with no provider call (`r2/v19-recompose.ts`). The raw file reproduces the shipped crop pixel for pixel (393,216 of 393,216 pixels). The product's own seam analysis had measured that border as **misaligned by 1 px** (`dx = -1`), and the run admitted it under the one-pixel-per-axis tolerance. So the shift was detected, then allowed.

## What v19 changes

Release `LOCAL_PATCH_PROMPT_RELEASE=v19`:
- recipe `scene-integration-v8`;
- prompt `local-patch-prompt/v19-fixed-scenery`;
- opt-in for new hide rows only, as with v16–v18. Stored rows keep their pinned recipe.

**Fixed scenery, `local-patch-foreground/v2`.** Each hide has regions, and each region has a role:

| Region of `newyork-v12-1` | Role | Meaning |
| --- | --- | --- |
| The taxi roof sign and roof | `in-front` | v1's polygons, point for point, with v18's sentence. It stands in front of the support and may hide the feet. |
| The green awning, its lettering and scallops | `fixed` | Never painted. The child is kept clear of it. |

**Every composition restores the union from the board before the join.** This covers render, recompose, the self-repair join and restyle. It uses the same function and the same order as v18, so the blend at the join sees the board's pixels on both sides.

**Painter.** v19 sends v18's question plus one pinned sentence (`1d1f11c6b7e705a2`): "FIXED SCENERY: The green shop awning with its "BLOOM & CO." lettering … is not part of this edit. After painting, the original picture of it is drawn back over your result exactly as it is now, so leave it exactly as it is: never repaint, move, resize, copy or redraw it or its lettering. Keep the child, every hand and everything you paint clear of it." A hide with no scenery gets v17's exact question.

**Record and publication.** The record is:

```
{ version: "local-patch-foreground/v2", hideId,
  polygonSha256: "57e6e472…",   // the scenery sha
  alphaSha256: "f4b28cbe…",
  restoredPixels: 37076,
  imageSha256 }
```

A v19 row publishes only with this record on its exact image. A v1 record on a v19 row is refused, and so is a v2 record on a v18 row.

**Recovery plans.** R1's rule now applies to each region. faceRect, and protectedCore plus its 12 px guard, must be clear of every region. Otherwise the plan is refused:
- before anything is bought, at the diagnosis's answer, the applying phase and the painter's purchase;
- again afterwards, by the join and by publication.

The refusal names each region with its own bounds, because the union's bounds would cover half the crop and tell the diagnosis nothing: "The fixed scenery (…) … clear of each region: <sign> at {160,703,282,65}; <awning> at {243,230,269,118}."

**Diagnosis.** A `Fixed scenery DATA` paragraph lists each region's words, role and bounds. Everything else is v18's question, line for line.

**v18 and v1 unchanged.** The following are all pinned and pass unchanged:
- v1's polygons (`4be0c68a…`) and coverage (`7f2e115b…`);
- v18's sentence (`ffeb8a3fccc88a5c`);
- v18's diagnosis paragraph;
- v1's refusal wording.

## The geometry

The awning is traced on the shipped board's own pixels: the panel's slanted edge, the valance's left edge, every scallop and the crop's right edge. Its top lies above the return window.

| Coverage | Pixels |
| --- | ---: |
| Awning, any coverage | 26,151 |
| Awning, full coverage | 25,733 |
| Union with the sign | 37,076 |

The awning's bounds are `{243, 230, 269, 118}`.

**One correction made during this work.** My first trace put the slant on the cloth itself. Recomposed, `B-a6` then left a 1 px strip of the painter's own slanted edge just outside the region (visible only at 8x). The edges inside the return window now lie in the flat dark area just past the ink contour:
- the slant 2.5 px out;
- the valance 2 px out;
- the scallops 2.5 px below the cloth.

A painter offset of up to about 2 px leaves nothing of its own edge outside. No fully covered pixel of the first trace was lost.

**Checks (tests and the authoring scripts).**
- It never covers the envelope.
- It never covers the florist's cap below the valance, the shop side left of the panel, or the space above the envelope where a head can rise.
- In the 15 retained New York paintings (v15–v17), every child's head stays about 20 px or more below it. This was checked by eye at half size and is not a measurement.
- A plan putting the child under the awning is refused, as above.

**Residuals I found and did not chase**, all below anything visible at play zoom:
- **The awning's lower-left corner post (x 293–297, y 300–312).** It sits on the region's edge. In `B-a6` the painter drew it about 2 px left, so v19 shows part of the board's post (the region's edge crosses it) and, beside it, the painter's (15 pixels): two thin lines about 2 px apart. v17 had only the painter's post. It is 50 px from the nearest join.
- **One scallop cusp.** It may keep a faint trace of the painter's cusp below the board's.
- **The stair railing.** It crosses the top join at x≈173. It is thin and not lettering, and is not restored.
- **A raised hand.** One that reached into the awning would be cut by it. This was not seen in 15 paintings, and the sentence tells the painter to keep hands clear.

## Evidence that the cause is gone

1. **A synthetic regression on the product path.** A painter redraws only the awning, 3 px right and 2 px down. The test is in `local-patch-foreground.test.ts`; it goes through the product's render and bounded join, with a fake painter and an in-memory ledger:
   - v18: all 12,946 fully covered awning pixels past the blend are the painter's offset copy, and all 2,417 of them inside the top join's blend are neither drawing. That is the ghost.
   - v19: all 25,733 are the board's.
   - The two releases differ nowhere else.
   - A replay re-derives the same picture, and only one painting is bought.
2. **The three saved v17 New York paintings, recomposed free** (`r2/v19-recompose.ts`). Each reproduces its shipped v17 crop exactly, then is composed as v19 would compose it.

   | Painting | v17 seam (border mean difference) | v19 seam | Sign and awning |
   | --- | --- | --- | --- |
   | `B-a6` | misaligned, 1 px tolerated (18.6) | aligned, fade (11.4) | every fully covered pixel is the board's |
   | `A-a10` | aligned (13.1) | aligned (6.7) | every fully covered pixel is the board's |
   | `B-a10` | aligned (14.7) | aligned (6.6) | every fully covered pixel is the board's |

   The pictures differ only where the scenery has coverage. Images are in `work/private-v16-controlled-render-20261012/r2/v19-recompose/` (git-ignored); each sheet shows board, v17 and v19, top to bottom or left to right:
   - `*-awning.png`: BLOOM doubled in v17 and clean in v19;
   - `*-bottom-sign.png`: the sliced and ledged signs replaced by the board's whole sign, the legs ending behind it;
   - `*-scallops.png` and `*-slant.png`;
   - `*-sliver.png`: the corner post at 8x.

   These are **not v19 paintings**: the painter never received v19's words. They show what the composition does to known bad paintings, nothing about how a v19 painter places the child.

## A performance defect found on the way, fixed

Coverage was computed by testing every sample against every edge. With the awning's 92 points, one v19 lookup cost **about 6 s of CPU** (v18: 0.23 s). That lookup runs at every composition and inside publication's database transaction.

It now computes each sample row's edge crossings once (same expression) and walks them in order (same strict comparison). The coverage is byte-identical. A test compares it with the old per-sample method on the sign, the union and 24 random polygons, including self-crossing ones and points on the sample grid. No pinned coverage sha moved with this change. The awning's pins changed only later, with the margin correction above.

A lookup now takes about 15 ms (v19) or 10 ms (v18). This touches v18's path for speed only: same bytes.

## Other hides: the survey (Codex item 1, second half)

**Method (read-only, `r2/join-survey.ts`).** For all 54 v12 hides, the board's own pixels ±20 px across each of the four joins, one sheet per board in `r2/join-survey/`. The window is mask ±120, clipped to the crop. No v12 hide has an authored return window, so this is exactly what the engine composes. Joins that cross people are left to the continuity review.

**Fixed lettering or fine fixed detail that a join crosses:**

| Risk | Hides and joins |
| --- | --- |
| High (lettering, faces, eyes) | `newyork-v12-1` top and right (awning: done) and bottom (sign: v18); `giantlibrary-v12-1/2/3` (book titles; a cover with lettering at `-3` bottom); `paris-v12-3` left (cart lettering); `tokyo-v12-2` top and right (toy-machine print); `underwater-v12-2` top (octopus eyes); `fairyforest-v12-1` top, at the crop edge (a tree's eye); `antarctica-v12-1` top (plaque) |
| Moderate (repeated fine structure) | `newyork-v12-3` bottom (bike spokes); `paris-v12-2` right (accordion); `nightcarnival-v12-2` (lights, violin strings); `marrakech-v12-2` left (carpet); icepalace (ice edges); sweetworkshop (rows of sweets); `castlegate-v12-1` bottom (open book); `cloudcity-v12-1` right (ropes); `amazon-v12-3` right (notebook); `greatwall-v12-2` right (paper-cut); `giza-v12-1` bottom (carpet) |

**Decision needed before v19 is enabled generally.** v19 helps only where scenery is authored. Options:

- **A. Author fixed scenery for the high-risk list:** 8 hides with the same method (board-traced, margins, the same checks, free recomposition of any retained paintings). It is precise, needs no spend, and takes a few hours each. It does not scale to new worlds without the same work.
- **B. A content-aware join** that routes the seam through flat pixels instead of a straight edge. This is general, but it is a new composition algorithm with its own risks and its own validation.
- **C. Leave the remaining hides to the v3 object-joins review.** It saw `B-a6`'s ghost. Each catch costs about one more painting, and a miss ships.

**My recommendation:** keep v19 opt-in, do A for the high-risk list before any general enablement, keep C as the safety net, and treat B as research. A smaller mechanical guard is also possible: the seam analysis already measured `B-a6`'s shift. Where a join crosses authored fine detail, the one-pixel tolerance could be withheld. It is not done here.

## Severity controls (Codex item 2): proposed, pinned before any purchase

| Case | Picture | Expectation | Purpose |
| --- | --- | --- | --- |
| `B-a10` NY, v17 | `8987d91b…` | reject, decided and located | clear broken object |
| `A-a10` NY, v17 | `7f5d3801…` | reject, decided and located | real discontinuity (ledge) |
| `A-a6` GW, v17 | `e164056c…` | pass | the uncontested clean positive |
| `B-a6` NY, recomposed under v19 (same retained painting; new sha from `r2/v19-recompose`) | to be pinned | pass | clean New York positive, with harmless change: the painter redrew the flowers at the right join coherently. All four joins checked here: top and right clean once restored, left continuous (the woman with the stroller), bottom the board's sign. Codex should inspect it before it is pinned. |
| `B-a6` NY, v17 | `7a0d1c84…` | **borderline: asked and recorded, never gated** | severity calibration, as Codex required |

A second harmless-change positive from another board is still open. I propose picking it by the same four-join inspection, with the label reviewed before purchase.

## Draft of the next bounded check (Codex items 3–4): not launched

- **Identity.** A new run `pv19-<date>` and a new runner and self-test derived from the v18 ones. The release is switched to v19, the qualification list is replaced, and the current reader v2 is used. A new manifest pins every picture hash, expectation, the commit and the cap. The v18 run stays failed and untouched.
- **Phase 1.** Opus HIGH, the v3 object-joins question, on the five cases above.

  **The gate:** both negatives must be decided, located rejections; both positives must pass. The borderline case is recorded only. If the gate fails, nothing is painted.
- **Phase 2**, only past the gate. Four new v19 paintings of `newyork-v12-1` (identities A and B, ages 6 and 10). Each is reviewed by Opus (v3) and Sol (continuity). There are no retries.

  **The pre-registered reading:**
  - Mechanical: every painting's sign and awning are the board's; this is checked from the receipts.
  - Visual: each reviewer decision is checked against the pixels by me, then by Codex.
  - Four paintings show whether v19 can work, not its rates.
- **Estimate from the v17 and v18 ledgers.** Observed rates are $0.046–0.048 a painting, $0.080–0.119 an Opus review and $0.027–0.041 a Sol review.

  | Phase | Bound |
  | --- | ---: |
  | Phase 1, 5 reviews | ≤ $0.60 |
  | Phase 2, 4 × (painting + Opus + Sol) | ≤ $0.84 |
  | **Total** | **≤ $1.44** |

  The expected spend is about $1.25. **Proposed cap $1.70**, which allows for token variance and the reservation per review. A sixth qualification case (the second harmless-change positive) would add at most $0.12 and still fits. This needs Guy's approval after Codex's review.
- **After it.** A separately scoped real-photo test: a real photograph of a 6-year-old, provided by Guy for this test. It is kept only in a private, git-ignored folder and has been sent to no provider; its runner is built and reviewed before any spend, under its own cap. No name or photo of the child belongs in this repository. Then release checks, CI, QA, and a 27-hide game, per Codex's order.

## Checks run

- `npm run check` on the final code: tsc clean; 4,960 tests passed and 2 failed. Both failures are timeouts in `local-patch-incremental-review.test.ts` (20 s limit; 10.3 s and 10.6 s alone). That file does not touch New York, the outline or v19, and passes alone, 72 of 72. An earlier full run, before the margin correction, had the same two plus two in `production-bootstrap.test.ts`; both files passed alone (89 of 89).
- Foreground tests:
  - domain 9;
  - service 22, including the v19 suite;
  - the v19 end-to-end recovery test on the real database, ledger and diagnosis: a plan under the awning goes back to diagnosis unbought, and the clear plan ships bound to the v2 record.
- Authoring and evidence scripts, all read-only, under `work/private-v16-controlled-render-20261012/r2/`:
  - `awning-trace`, `awning-margin`;
  - `v19-pins`, `v19-points`, `v19-timing`;
  - `v19-recompose`, `v19-sliver`, `v19-scallops`;
  - `join-survey`.

  The v17 ledger's hash was the same before and after reading its charges.
