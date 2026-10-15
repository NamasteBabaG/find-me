# E3 results: Sol HIGH on quality, decided at stage one (15 October 2026)

**Status:**
- E3 ran once, on exactly the inputs Codex closed: head `9a6fe6e0`, manifest `e126d28d…`, binding `d6cffa8e…`, a clean tree.
- It used the reviewed launcher (`run-e3.ps1 -Spend`). Guy confirmed the $4 cap for both stages.
- **The run was decided at stage one, by its pinned rule. Nothing more was bought.** An early failure is a valid result; the run was not forced to completion.
- Nothing was deployed. No model, default, flag, label or cap changed. No painting was rendered, and no photograph was sent.

## Money: recorded conservative estimates, not invoices

| World | Bought | Recorded estimate |
| --- | ---: | ---: |
| `e3-judge-20261015:Q0` (Opus 5.5 HIGH, quality) | 2 | $0.216144 |
| `e3-judge-20261015:Q1` (Sol 6.1 HIGH, quality) | 1 | $0.059866 |
| `e3-judge-20261015:C` (Sol 6.1 HIGH, continuity) | 4 | $0.158714 |
| **Run** | **7 of 51** | **$0.434724** of the $4 cap |

- The ledger equals the report's rows: 434,724 micro-USD.
- Nothing is held, pending or unknown. No charge passed its reservation.
- The 44 questions not bought were not bought by design (a decided run), so none is an open purchase.
- Every amount is the product's `conservative-upper-estimate`, computed from retained usage and its rate card. No invoice was queried.

## Stage one, as it ran

| # | Question | Recorded estimate | Answer |
| ---: | --- | ---: | --- |
| 1 | Q0, Opus, on R12 (cut head) | $0.109704 | rejected, on faceReadable, childComplete and pictureWhole, with located faults |
| 2 | Q0, Opus, on R13 (shifted legs) | $0.106440 | rejected, on childComplete and pictureWhole, with located faults |
| 3 | C on R6 (cut head) | $0.036188 | repair: a located hard cut |
| 4 | C on R7 (hard: cut in the hair) | $0.040848 | repair: a located hard cut |
| 5 | C on R12 | $0.030718 | repair: a located hard cut |
| 6 | C on R13 | $0.050960 | **truncated**: every one of its 4,096 output tokens went to reasoning, so no answer text; unresolved |
| 7 | Q1, Sol HIGH, on R5 (wrong support) | $0.059866 | **accepted**: verdict pass, groundContact pass |

**Why the run stopped at question 7.** R5 is a verified reject in the gate tier: the child stands on the taxi's roof sign.
- Opus caught it in E1.
- Codex confirmed the defect by eye in its results review.
- Sol HIGH accepted it. Its reason: the child "stands coherently in the shop-side pedestrian area behind the foreground taxi sign".
- Continuity never rescues a wrong-support defect. So the candidate pair misses it, and the screen decided the run.

The label is unchanged. A judge's answer does not relabel a control.

## The three results, separately

**Q1: Sol 6.1 HIGH alone on today's quality question. Does not qualify.**
- It missed R5, the first falsification question, as all three Sol MEDIUM variants did in E1.
- It reasoned 1,898 tokens (Sol MEDIUM about 100) and still read the support the same way. The hypothesis that more reasoning would fix this is not supported on R5.
- Price, measured once: $0.0599 a question (13,442 input tokens, 2,626 output). The plan assumed about $0.06.
- It was asked one question, and the answer was read and complete (finish "stop").

**The candidate pair: Sol HIGH quality + continuity. Does not qualify.**
- Decided at R5, where neither review catches the defect.
- Nothing else of the pair was measured, by design.

**Today's pair: Opus quality + continuity. The cut test, read only where asked.** It stops all four cut controls:

| Control | Opus (Q0) | Continuity (C) | Stopped by |
| --- | --- | --- | --- |
| R12, cut head (gate) | caught (bought here) | repair, located | both |
| R13, shifted legs (gate) | caught (bought here) | truncated, no answer text | Opus; an unresolved continuity answer is never a pass either |
| R6, cut head (gate) | **accepted** (E1's identical request, reused) | repair, located | continuity |
| R7, cut in the hair (hard) | **accepted** (E1, reused) | repair, located | continuity |

- **Codex's correction 2 is answered on these four.** The complete live path stops them all, and continuity is what catches the two head cuts Opus misses.
- This is the cut test only, not a qualification of today's pair: the run was decided before stage two.

**Unreadable or truncated answers: one.** Continuity on R13 ran out of output on reasoning (`finish: length`, 4,096 of 4,096 tokens reasoning) and gave no answer text.
- It is the same failure the first full v19 QA world showed in 5 of 31 continuity answers.
- It came on the shifted-legs control, an unusually hard picture for that question.
- No other answer was unreadable or truncated.

## What this means for the cost plan

- **The replacement the $1.90–2.27 scenarios depended on is not qualified.** On this evidence, Sol HIGH misses a scene-plausibility defect that Opus catches.
- **Measured prices for the plan, one or two questions each:**
  - Sol HIGH quality: $0.060;
  - Opus quality: $0.106–0.110;
  - Sol continuity: $0.031–0.041 when it answers, $0.051 when it truncates.
- **What remains of `docs/CLAUDE_COST_NEXT_EXPERIMENTS_PLAN_20261015.md`** is today's judges with the published channels and LOW: about $2.56 projected. It needs engineering, Guy's delivery-time decision, and LOW proved at scale.
- **Going below that** would need a different, separately qualified change to the quality question, not this model swap.

## Evidence

All files are in the private runner (`work/private-e3-runner/`, git-ignored). The answers are in its ledger.

| File | SHA-256 |
| --- | --- |
| `out/purchases-e3.sqlite` (ledger and every retained answer) | `d02fc9de0ac62e86f198387b5f660af6eeff79b39a02e39488f6d75a259fe515` |
| `out/results.json` | `53dbcbc085d6ece62041431a10f05f0d0a1a37e3e0dc64e02edea78f7fb25eb3` |
| `out/run.log` | `61b9039bae44a93347a333e492c8716cf8a4618d385ea29a58fb0431f84b0329` |
| `out/timings.jsonl` | `e8edd9f50873a555a1b709e87445a1d1df7f3250548b0d6908934ff9dc75caa9` |
| `out/answers-summary.json` (from a copy of the ledger, by `look/read-answers.ts` `f1f48e35…`) | `9a2719ce70cd00f1b563c9b3db9ae59eb4dcaa7a42d6a02ec17d68120bfea101` |
| `logs/spend-e3.log` (the launcher's output, key-shaped text redacted) | `73ac88389a67af8490c933ea429df6b2bc1399f477349aae76e12a8e54abf22d` |

- E1's ledger is unchanged (`43a5c78d…`).
- The run's effective binding, recorded in the report, is `d6cffa8e4405ec89…`.
