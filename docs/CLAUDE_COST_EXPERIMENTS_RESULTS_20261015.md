# Cost experiments E1 and E2: results, for Codex's independent evaluation (15 October 2026)

**Status:**
- Guy approved both caps (E1 up to $7, E2 up to $3).
- Both runs ran once, on exactly the inputs Codex closed: head `92d256a6`, all 24 private hashes matching, a clean tree.
- Both completed within their caps, with no retries.
- **$5.85 of the $10 approved was spent.**
- Nothing was deployed, and no model, default, flag, ceiling or required hide count changed. **No model is selected here.**
- The runs' outputs stay in the private runners (`out/`), hashed below.

## Money, reconciled

| Run | Committed | Cap | Rows summed | Held / pending / unknown | Charged past a reservation |
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
  - board people are removed;
  - the child is oversized for the scene;
  - the style is flatter;
  - for identity B, the hair is straight black where the portrait's is curly.

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

**A miss here is an acceptance.** No judge rejected a control on another check, except J2's softened R1.

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

**Sol at MEDIUM barely reasons:** about 100 reasoning tokens a question. The continuity review, at HIGH, uses about 1,900. This may be why it misses physical-plausibility faults. It is a hypothesis, not a finding.

## Two controls to settle before any further paid run

Every judge accepted both of these. Labels are not changed after seeing answers; the results above stand as recorded.
- **R7 (cut head, built from G4).** In the judge's view the cut is real, but at board scale the flat top of the curly hair blends into the flowers behind it. It may be a fair hard case or a weak control.
- **R11 (a 3-year-old stated as 10).** By eye this painting (B-a3, v15) reads as a school-age child, about the size of the other children, not a toddler. It may not be a valid wrong-age negative.

Both should be decided and pinned before a new run, not after one.

## What this means for cost (a rough projection, not a claim)

**The QA world's measured $5.71** breaks down as:
- quality review (Opus): $3.07;
- continuity (Sol HIGH): $1.09;
- paintings (MEDIUM): $1.42;
- identity: $0.13.

**LOW paintings** at the observed 5 of 6 acceptance would need about 32 paintings at $0.018, about $0.58, for 27 hides. That is about $0.85 less per world, or roughly $4.9. A refused painting is not reviewed, so its retry costs only another painting. Six paintings are too few to rely on.

**The quality judge is the largest cost, and Sol MEDIUM did not hold its quality** on these controls. E1 gives no safe saving yet. **The $2 target is still not reachable from these two steps.**

## Proposals for Codex and Guy (none started)

1. **A bounded QA-world trial of LOW paintings** with today's reviews, to measure acceptance and retries at scale. This is Codex's suggested next step for a passing screening. It needs its own review and cap.
2. **Sol HIGH as the quality judge, on the same 21 controls.**
   - The qualification is now absolute, so only the new variant need be asked: 21 questions on the same blind binding. This run's J0 answers stay the diagnostic.
   - It costs perhaps $0.06–0.07 a question, about $1.5 for the run.
   - Settle R7 and R11 first.
3. **Mini is not worth further work as configured.** A different request shape (mask handling, input fidelity) would be a new experiment, if ever.

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
