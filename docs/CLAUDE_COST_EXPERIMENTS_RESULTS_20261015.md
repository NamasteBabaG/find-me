# Cost experiments E1 and E2: results, for Codex's independent evaluation (15 October 2026)

> **Codex reviewed this on `bd5d8e4e`.** It accepted the evidence's integrity and accounting, with three corrections, applied here:
> - the money is recorded conservative estimates, not provider invoices;
> - E1 tested the quality role, not the whole live two-review gate;
> - the historical labels stay, and any future control changes are versioned.
>
> The frozen results and receipts are unchanged.

**Status:**
- Guy approved both caps (E1 up to $7, E2 up to $3).
- Both runs ran once, on exactly the inputs Codex closed: head `92d256a6`, all 24 private hashes matching, a clean tree.
- Both completed within their caps, with no retries.
- **$5.85 in recorded conservative cost estimates, of the $10 approved.**
- Nothing was deployed, and no model, default, flag, ceiling or required hide count changed. **No model is selected here.**
- The runs' outputs stay in the private runners (`out/`), hashed below.

## Money: recorded conservative estimates, reconciled against retained usage and receipts

**These are not provider invoices.**
- Every one of the 112 ledger entries has `costBasis: conservative-upper-estimate`. Each amount is computed from the provider's retained usage and the application's rate cards.
- The reconciliation below is exact between the ledger, its rows and the retained receipts.
- No provider invoice or account billing was queried.
- The relative cost evidence stands.

| Run | Recorded estimate | Cap | Rows summed | Held / pending / unknown | Charged past a reservation |
| --- | ---: | ---: | ---: | --- | --- |
| E2, painters | **$1.225106** | $3.00 | $1.225106, equal | none | none |
| E1, judges | **$4.625959** | $7.00 | $4.625959, equal | none | none |
| **Total** | **$5.851065** | $10.00 | | | |

E1 by world:
- J0: $2.208167
- J1: $0.898049
- J2: $0.860164
- J3: $0.659579

E2 has six worlds; none came near $5, and the largest was $0.47.

## E2, the painters

| Painter | Product checks | Both reviews | Painting, median | Per hide both reviews accepted |
| --- | --- | --- | ---: | ---: |
| P1, gpt-image-2 LOW | **5 of 6** | **5 of 5** | $0.0178 | $0.160 (six cases, the refused painting included) |
| P2, gpt-image-1-mini MEDIUM | **0 of 6** | none reviewed | $0.0168 | none accepted |
| P0, gpt-image-2 MEDIUM (Amazon only) | 2 of 2 | 2 of 2 | $0.0471 | $0.163 (two cases; not comparable with the six-case figures) |

**On the two Amazon cases P0 painted**, the matched comparison is: P0 2 of 2, P1 1 of 2, P2 0 of 2.

**Median times:** painting 15.8 s (LOW), 17.3 s (Mini), 32.2 s (MEDIUM). Quality review 20–26 s, continuity review 25–72 s.

**By eye** (`out/review/e2-review.png`, one labelled image of all six cases; `out/contact/` per case):
- **LOW is close to the MEDIUM paintings** in placement, scale, style and likeness on all five accepted cases (New York A and B, Great Wall A and B, Amazon A).
- **The refused LOW painting** (Amazon B, "border differs by 33.3") shows why. The repainted window does not meet the board: the book is doubled at the right edge, and there is a line along the bottom. The check was right.
- **Mini repainted the whole window every time.** All six were refused with the border differing by 27.7–40.3 against a limit of 24. In the pictures:
  - the redrawn window no longer meets the board (the seam check's reason);
  - the child is oversized for the scene;
  - the rendering is flat and cartoon-like;
  - for identity B, the hair is straight black where the portrait's is curly.

  Mini also removed bystanders, which is not itself a defect under the product's rules. These four are the reasons.

  The Mini request itself worked: the risk flagged in the handoff did not occur. As configured, its result is unusable.

## E1, the judges

**No variant qualifies against the pinned labels, J0 included.**

**Every variant passed all 8 verified good pictures.** There were no false rejections, no unread answers and no truncation. The rejects tell the difference:

| Verified reject | J0 Opus HIGH | J1 Sol MED | J2 Sol MED short | J3 Sol MED short + lean |
| --- | --- | --- | --- | --- |
| R1 broken join (sliced sign) | caught | caught | rejected, but softened (`unclassified`), so not counted | caught |
| R2 broken join (ledge) | caught | caught | caught | caught |
| R3 floating toy | caught | caught | caught | **accepted** |
| R4 floating toy | caught | **accepted** | **accepted** | caught |
| R5 standing on the taxi sign | caught | **accepted** | **accepted** | **accepted** |
| R6 cut head (built, G1) | **accepted** | caught | caught | caught |
| R7 cut head (built, G4) | **accepted** | **accepted** | **accepted** | **accepted** |
| R8, R9 likeness | caught | caught | caught | caught |
| R10 10-year-old stated as 3 | caught | **accepted** | **accepted** | **accepted** |
| R11 3-year-old stated as 10 | **accepted** | **accepted** | **accepted** | **accepted** |
| **Caught** | **8 of 11** | **6 of 11** | **5 of 11** | **6 of 11** |

**Every miss is a passing answer, with one exception: J2 on R1.**
- J2 claims a rejection there, but its reading carries an unclassified field.
- Under the pinned rules that is softened, not a qualified located rejection.
- It is not an acceptance either.

**What Sol MEDIUM misses and Opus catches** are scene plausibility and age:
- a child standing on the taxi's roof sign;
- a toy floating in the air (two of the three Sol variants);
- a 10-year-old painted where a 3-year-old was stated.

**Sol caught one built cut head (R6) that Opus missed.**

| | J0 | J1 | J2 | J3 |
| --- | ---: | ---: | ---: | ---: |
| Price per question, median | $0.104 | $0.042 | $0.040 | $0.030 |
| Price, p95 | $0.120 | $0.045 | $0.045 | $0.037 |
| Input tokens, median | 16,508 | 13,448 | 13,534 | 9,705 |
| Output tokens, median (p95) | 1,831 (2,560) | 817 (1,076) | 583 (997) | 591 (1,226) |
| Reasoning tokens, median | n/a | **109** | **93** | **89** |
| Seconds, median | 26.3 | 28.7 | 23.0 | 19.9 |

**Sol at MEDIUM barely reasons:** about 100 reasoning tokens a question. The continuity review, at HIGH, uses about 1,900.
- This may be why it misses physical-plausibility faults. It is a hypothesis, not a finding.
- It does not show that HIGH would catch them. HIGH's quality and cost have to be measured on this task.

**Codex visually confirmed** that R5 (the support) and R4 (the floating toy) show their defects. So the Sol variants' misses stand even if the disputed controls below are set aside. **No safe model replacement is supported.**

## What E1 tested, and what it did not

**E1 asked the quality question only.** The live gate has two reviews: the quality question and a separate Sol HIGH continuity question. E1 did not ask the continuity question about any control.
- Opus's quality question accepted both built cut heads. That is a demonstrated weakness of that question on this evidence.
- It does not show that the whole live pair would approve a cut head: the continuity review might catch it.
- Nor may the continuity review be presumed to catch it.

**Before any judge policy claims autonomous protection against cut figures,** the complete decision path must be tested on unequivocal cut-head and cut-body negatives, with both roles' raw answers kept. This qualifies a new judge policy. It is not a call for human approval of every customer image.

## The controls after this run (Codex's correction 3)

**Every judge accepted R7 and R11.** The historical labels stay, and this run's scores (8, 6, 5 and 6 of 11) are not altered or used to qualify anything after the fact.
- **R6** stays a useful defect case. Opus accepted it; the Sol variants rejected it.
- **R7 (cut head, built from G4)** is kept as a disclosed **hard case**. The flat boundary is visible in the hair, but next to the flowers its severity is less decisive.
- **R11 (a 3-year-old stated as 10)** does not convincingly show a toddler against a ten-year-old. The request's age label is not visual ground truth, so it should not be the decisive age negative.

**Before another paid experiment, a new control-set version is pinned:**
- R7 disclosed as hard;
- R11 resolved or replaced;
- unmistakable cut-head and cut-body negatives added;
- unchanged controls keep their wire IDs.

Earlier answers may be reused only where the complete effective request and its evaluator are unchanged. See `docs/CLAUDE_COST_NEXT_EXPERIMENTS_PLAN_20261015.md`.

## What this means for cost: a scenario, not a measurement

**LOW lowers the painting cost; it does not touch the reviews.** In the six-case LOW arm, 690,944 of the 798,418 recorded micro-USD (86.5%) went to the two reviews. Those are this experiment's costs, not a population estimate.

**The earlier QA world's recorded $5.71** (26 of 27 hides published) breaks down as:
- quality review (Opus): $3.07;
- continuity (Sol HIGH): $1.09;
- paintings (MEDIUM): $1.42;
- the identity sheet and its check: $0.07;
- one self-repair diagnosis: $0.06.

An earlier version of this list gave "identity: $0.13"; that line also held the diagnosis.

**A scenario, not a measured world or a proven acceptance rate.** Hold that world's review spend fixed and substitute LOW paintings at the six-case 5 of 6 acceptance. That needs about 32 paintings at $0.018, about $0.58, for 27 hides: roughly $0.85 less, about $4.9 a world. A refused painting is not reviewed, so its retry costs only another painting.

**The tested safe choices do not reach $2.** Sol MEDIUM did not hold the quality bar, and E1 gives no safe saving on the largest cost. That does not show $2 is impossible with a redesigned, qualified review workflow.

## Next (prepared, none started)

`docs/CLAUDE_COST_NEXT_EXPERIMENTS_PLAN_20261015.md` prepares the next steps for Codex's review. None has a grant; earlier unused headroom is not one.
1. **E3: Sol HIGH as the quality judge**, on a new pinned control-set version.
   - Both review roles are asked, so the complete decision path is measured, and today's pair is tested on unequivocal cuts.
   - It is staged: a run is decided, and stops buying, at Sol HIGH's first miss.
2. **LOW at full scale, in two steps:**
   - **E4a:** all 27 hides, free checks and a visual review, no paid review;
   - **E4b:** one candidate world, run only in a configuration forecast well under its cap.
   - The original one-world trial with today's reviews would spend about 85% of its roughly $5.1 on reviews in a configuration the cost model says must change.

**Mini is not worth further work as configured.** A different request shape (mask handling, input fidelity) would be a new experiment, if ever.

## Evidence

| Output | SHA-256 |
| --- | --- |
| `work/private-e1-runner/out/results.json` | `71bc636be95640e65d582e1072fe39feccbfd7a78c24bc63733957c43c0e7c62` |
| `work/private-e1-runner/out/run.log` | `af7e345566597ae7ac27691f6e9c49e1ca83f602d0e59eca04ade007395843f3` |
| `work/private-e1-runner/out/purchases-e1.sqlite` | `43a5c78d22f24df0c45d29f14da9e35de89f892d0e36d7ed8230087cc0da7627` |
| `work/private-e1-runner/out/timings.jsonl` | `ea4963bd1c1af4e17c7090d225620328e57199c2a11a4620257a3c425884d6c4` |
| `work/private-e2-runner/out/results.json` | `b33b7058d2692fd85bd3a00227059a773d33f5533d23ec0ff2f7986dee212b8a` |
| `work/private-e2-runner/out/run.log` | `f64f6754bcbf6684603f7734c30af48b6ee980e46c7bce80d528be1649c92929` |
| `work/private-e2-runner/out/purchases-e2.sqlite` | `09e83f75aa978471d138307bf73cd7ac0bbc3509f0d1d7295e1165a50f71cad7` |
| `work/private-e2-runner/out/progress.json` | `141c3dfb89edfd8d844c7236a7d8fe3b31c3cdb7dbc90c483be5d958d4eb6431` |
| `work/private-e2-runner/out/timings.jsonl` | `773ad451e1e362c9db7aa20f2fa9a43e94952f8aeecb211410278c859dd3195e` |
| `work/private-e2-runner/out/review/e2-review.png` | `63d726d0ea6d2754746b36c9499caa102154ae1ea4a1123d3ec607ec6357a628` |

**Every retained answer is in each run's purchases database:**
- E1: all 84 answers.
- E2: 14 reviews (two for each of the 7 accepted paintings) and its 14 paintings. The paintings are in `out/renders/`, the per-case contact sheets in `out/contact/`, and the launch logs in `logs/spend-e1.log` and `logs/spend-e2.log`.

`out/review/e2-review.png` was made afterwards from the outputs by `look/review-sheet.ts`, which changes no run file.
