# v18 qualification: the gate stopped the run; two real breaks detected, one borderline artifact, 13 October 2026

> **Corrected after Codex's review** (`docs/CODEX_V18_QUALIFICATION_RESULTS_REVIEW_20261013.md`). This report first said the question was "right four times" and proposed making `B-a6` a known defect. That overreached. The doubled awning lettering exists, but whether it warrants a paid retry under Guy's rule (natural, playable pictures; clear defects judged at ordinary play zoom; harmless differences allowed) is a calibration question. `B-a6` stays a borderline case, the run stays failed, and there is no four-for-four claim.

Guy approved the $1.50 cap for this run on 13 October. It ran exactly as reviewed by Codex in `docs/CODEX_V18_REVIEW_FIXES_RECHECK_20261013.md`:
- the commit `e6e214cd`, with a clean worktree;
- the runner `919768994ed8…` and its self-test `eb50743bf85d…`;
- the manifest `450b0edfac9a…`.

A dry run first matched every pin and produced prompts byte-identical to the previous dry run.

## What happened

| | |
| --- | --- |
| Status | `gate-failed`, exit 1: the revised question did not qualify by the pre-registered rule, so nothing was painted |
| Purchases | four Opus HIGH reviews (v3 object-joins question, located reader), all settled |
| Spend | **$0.424480** of the $1.50 cap; nothing held, pending or unknown |
| Report | `work/private-v16-controlled-render-20261012/results-v18.json` (private), with the run log and the retained answers in the run's own ledger |

| Saved v17 picture | Expected | Opus v3 answer | Gate |
| --- | --- | --- | --- |
| `B-a10` NY | reject | retry, located: the repainted upper half of the 7E95 sign meets the kept lower half at a different size, and the lettering is cut so that it "reads like 7F95" | met |
| `B-a6` NY | pass | retry, located: the BLOOM & CO. awning lettering crossing the **top** join shows "doubled, offset ghost" contours | **not met** |
| `A-a6` GW | pass | acceptable | met |
| `A-a10` NY | observe | retry, located: the shortened sign above the join meets the original wider base, which "projects as a ledge to the right" | met (readable, decided) |

## Every answer checked against the pixels

I rebuilt the exact `JOIN_DETAIL` images Opus was shown (the runner's evidence path, release v3) and added magnified BEFORE/AFTER crops of the regions it named. The scripts are `r2/v18-join-evidence.ts`, `r2/v18-joins-zoom.ts` and `r2/v18-bottom-context.ts`; they are read-only, no provider is called and no ledger is touched.

- **`B-a10`.** The sign is broken as described: the known defect that v17's Opus passed as "softened lettering".
- **`B-a6`. A real artifact that every earlier reading missed; its severity is open.** In the painting, the letters B, L, O and O of the awning have a faint second, offset outline where the top join's blend band mixes the painter's slightly shifted lettering with the board's. The board is clean. It is plain at 2× and 4× and in the evidence image; it is much subtler than the sliced sign and makes no person or support impossible. v17's Opus and Sol both accepted this picture. I labelled it a clean control because I checked the taxi sign it was chosen for, not every join.
- **`A-a6`.** Its top and bottom joins match the board; the pass is consistent.
- **`A-a10`.** Across the crop's bottom edge, the board continues with the original, wider sign. The painting's shortened sign therefore leaves the original base sticking out as a flat ledge, with roof fragments on the pavement above it. That is a visible incoherence at the join, not only a coherent replacement. Codex had flagged this lower edge for scrutiny.

**So:** two rejections of clear physical discontinuities (`B-a10`, `A-a10`) and one pass (`A-a6`) are supported. `B-a6` is a detected real artifact whose rejection is not established as correct under the product's threshold. The gate failed as pre-registered, and the expectation for `B-a6` turned out to be untested rather than proven wrong. Four pictures are a small sample: this shows the question can see these defects, not its error rates.

## What this means

- **No paintings, and no retry.** The rule was: no paintings unless both controls pass. Relabelling `B-a6` after the fact and painting anyway would be exactly the move the gate exists to prevent.
- **A next check needs pinned expectations, including over-rejection controls.** `B-a10` stays the clear broken case and `A-a10` another real discontinuity. `B-a6` stays explicitly borderline. A New York positive needs all four joins and its context checked at pixel level, plus a harmless-change positive that must pass. All of it goes under a new run identity, with this run kept as failed. Codex's review sets the order: first remove the mechanical cause below, then a bounded check that paints new pictures and asks both reviewers.
- **A product finding.** The New York return window's top join crosses the awning lettering, so any painter offset there ghosts it. v18's outline restores only the taxi sign. Under the v3 question such a picture is a repair (one more painting); without v3 it shipped. An outline for the awning, or a top guard that clears the lettering, would remove the cause. I have not surveyed other hides for fixed lettering or objects crossing a join.
- **Labelling controls, lesson.** Inspect all four joins magnified before calling a picture clean, not only the object it was chosen for.

## Not claimed

- That Opus has a low false-rejection rate: no control was falsely rejected here, but there were only two controls.
- Anything about the v18 paintings: none were bought.
- Anything about real photographs: the identities were illustrated.
