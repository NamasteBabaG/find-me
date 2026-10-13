# v19 qualification: complete. The gate passed and four clean New York paintings were accepted by both reviewers (13 October 2026)

**Guy approved the $1.70 cap** on 13 October, after Codex's closure (`docs/CODEX_V19_RUNNERS_CLOSURE_20261013.md`, in the main checkout). The run used exactly the reviewed contract. Before launching:
- HEAD was `8a554067`, with a clean tree;
- every file matched the handoff's hashes;
- the launcher's dry run found the pins and the binding (`00e63dd1…`, manifest `f0ab9965…`) matching, with both keys present.

The run then went once with `-Spend`, with no retries. **Nothing in this report selects a release:** Codex reviews the pictures and the decisions first.

## Outcome

| | |
| --- | --- |
| Status | `complete`. The gate passed; four paintings were accepted, bound, pixel-checked and reviewed twice. |
| Spend | **$1.245589** of the $1.70 cap. Nothing is open, unknown or held. |
| Report | `work/private-pv19-runner/out/results.json` (private), with `run.log`, `renders/` and the ledger `purchases-pv19.sqlite` (`36005f9c…`, unchanged by reading it) |

**Charges** (all settled, from the ledger):

| Item | Count | Amount |
| --- | ---: | ---: |
| Opus qualification reviews | 5 | $0.528 |
| v19 paintings | 4 | $0.189 |
| Opus reviews of the paintings | 4 | $0.397 |
| Sol continuity reviews | 4 | $0.131 |
| **Total** | | **$1.246** |

Individual rates: Opus $0.096–0.118, painting $0.047, Sol $0.030–0.036. All fall inside the ranges the estimate used.

## The gate (pinned labels, reader v2)

| Picture | Label | Opus | Met |
| --- | --- | --- | --- |
| `B-a10` NY, v17 | reject | **retry, located**: the sign "repainted taller and covers the tops of the original '7E95' … reads as a broken '7F95'" (pictureWhole, severeSeam) | yes |
| `A-a10` NY, v17 | reject | **retry, located**: the new sign "ends short, and a flat blue ledge juts out to the right where the original wider sign base continues below the line" | yes |
| `A-a6` GW, v17 | pass | acceptable | yes |
| `B-a6` NY composed by v19 | pass | **acceptable**: the clean New York positive, with the doubled awning gone | yes |
| `B-a6` NY, v17 | observe-only | retry, located: "'LOO' at the top return join … offset ghost outlines" | (never gated) |

Both negatives were rejected for their actual faults, and both positives passed. The borderline v17 `B-a6` was again read as a ghost at the top join, as in the v18 qualification. Its v19 composition, the same painting with the awning restored, passed.

## The four v19 paintings (identities A and B, ages 6 and 10, `newyork-v12-1`)

| Case | Painting | v2 record | Restored pixels vs board | Opus v3 | Sol |
| --- | --- | --- | --- | --- | --- |
| A-a6 | accepted | bound, 37,076 | 36,348 / 36,348 equal | acceptable, no fault | pass |
| A-a10 | accepted | bound, 37,076 | 36,348 / 36,348 equal | acceptable, no fault | pass |
| B-a6 | accepted | bound, 37,076 | 36,348 / 36,348 equal | acceptable, no fault | pass |
| B-a10 | accepted | bound, 37,076 | 36,348 / 36,348 equal | acceptable, no fault | pass |

**My own look**, done before this report because v17's reviewers once passed broken signs. Every image is in `work/private-pv19-runner/out/`.

At play size (`review-shipping-4up.png`, `review-context-2x2.png`):
- Each child stands on the stoop between the woman with the stroller and the florist, on the steps, at a believable depth.
- The ten-year-olds read taller than the six-year-olds.
- The taxi, its "7E95" sign and the BLOOM awning are the board's own and continue naturally beyond the crop.

All four joins, 2× (`joins/all-*.png`), with 4–5× zooms where anything differed:

| Join | What it crosses | Finding |
| --- | --- | --- |
| Top (y=250) | the stair railing and the awning | continuous; BLOOM identical to the board |
| Bottom (the crop's edge) | the sign and the taxi roof | continuous: no step, no ledge (the v17 `A-a10` fault) |
| Left (x=60) | the woman's face | continuous in all four. In B-a10 the painter redrew her face slightly differently: one contour, no doubling and no cut (`joins/zoom-B-a10-…-40-380.png`). |
| Right (x=469) | the florist's hands and the cart | continuous. In B-a10 the hands are redrawn slightly, without a doubled handle (`…-430-500.png`). |

Inside the window, the potted plant and the railing's posts are redrawn a little differently from the board (`…-50-240.png`). That is coherent, and invisible at play size.

These are coherent changes to bystanders and props, which Guy's policy allows. I found no clipping, impossible anatomy or support, pasted-in look, or broken object.

## What this shows, and what it does not

**Shows:**
- v19 can produce New York paintings that both HIGH reviewers accept, with the protected sign and awning mechanically exact, in four of four first attempts.
- The v3 question with reader v2 separated the pinned controls as labelled.

**Does not show:**
- error rates (four paintings);
- any other hide or board, since v19's scenery covers only `newyork-v12-1`;
- real-photograph likeness (the identities are synthetic sheets);
- a complete 27-hide game.

The second harmless-change positive was excluded from this scope, as reviewed.

## Next, in Codex's order

1. Codex reviews the pictures and the decisions: `out/renders/`, the review sheets, `joins/` and `results.json`.
2. A release is selected explicitly for the real-photo test. Its manifest names v19 provisionally; nothing falls back automatically.
3. The photo test runs only with Guy's separate approval: a $1.30 cap, with spend estimated at $0.75–0.85.
4. Codex's non-blocking wording note on the photo runner (`photo-guard.ts` "At most"; `run-photo.ts` `*AtMost` plan fields) waits for the next reviewed photo-runner edit. Editing it now would change that runner's bound files.
