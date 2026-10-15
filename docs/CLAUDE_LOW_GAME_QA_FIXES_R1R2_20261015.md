# The LOW world after Codex's QA: R1, R2, E5 and Antarctica (15 October 2026)

This answers Codex's brief "בריף תיקוני QA לעולם LOW ולמסלול Batch" (`work/codex-cost-results-review-20261015/CLAUDE_E4_E5_FOLLOWUP_BRIEF_20261015.md`), delivered through Guy. It follows `CLAUDE_LOW_GAME_REVIEW_FIXES_20261015.md`.

**What was not done**, as the brief requires:
- no new purchase or experiment, and nothing resent;
- no rendering;
- no live database, flag, ceiling or model change;
- no deployment;
- no automatic monitoring.

**The only network calls:**
- E5's own, already running;
- its reconcile-only finish, which made polls and reads, deleted the provider copies, and created and uploaded nothing;
- one read-only GET per batch object, as reconciliation evidence (§4).

| Item | State |
| --- | --- |
| 1. R1: an unknown charge re-asked under another key | **Closed.** Codex's repro now gives 2 calls, `incomplete` and `accounting.open`. The self-test passes 24/24. Mutants: see §1. |
| 2. R2: a batch duplicated on resume | **Closed.** Codex's repro now gives 0 creates. The self-tests pass 37/37 and 23/23. Mutants on the final code: 13/13 for R2, and the original 14/14. |
| 3. Cost and time wording | **Corrected** in three documents and in the cost tool (§3). |
| 4. E5 from what was already sent | §4. Uncertainty stays visible, and nothing was resent. |
| 5. Antarctica's hat | **Prepared** as content version 13. It is not wired: the historical versions are pinned unchanged, and nothing was rendered (§5). |

## 1. R1: an unknown charge holds its check

**The hole** (Codex's `qa-e4c-inflight-independent-20261015.ts`):
- E4c's review asked continuity, and that purchase came back unknown.
- The run then asked the same question about the same pixels under a new key and world (`…:e4a-r`).
- When that answer passed, the run reported `complete` while `money.held` was true.

**The fix** (`work/private-e4c-runner/e4c-run.ts`):
- **The plan.** A hide whose E4a quality or continuity purchase is unknown or pending is planned as `held`. Nothing is bought for it until a person reconciles that charge.
- **The run.** An unresolved continuity purchase ends that check (`break`). It is never re-asked under another key. The hide is recorded as `held` in `openEvidence` and gets no new painting. An unresolved quality purchase already returned `held`.
- **Other hides continue.** Every purchase still counts toward the run's cap, so the total exposure stays bounded.
- **Images and accounting are reported apart.** The status comes from one pure function, `runStatus(stopped, imagesComplete, accountingOpen)`:
  - `complete` needs every hide's pixels accepted **and** no charge unknown or held;
  - accepted pixels with an open charge are `accounting-open`;
  - missing pixels are `incomplete`.

  The report also carries `images: {selected, of, complete}` and `accounting: {open}`. `money.held` and `accounting.open` come from the same audit, so `complete` with held money cannot be built.
- **History is unchanged.** No purchase was deleted, moved or re-keyed.

**Codex's repro, before and after.** The repro is copied to `work/private-e4c-runner/qa-repro/repro-first-unknown.ts`, with the scenario unchanged; only its output folder moved into mine.

| | Codex, before the fix | After |
| --- | --- | --- |
| Calls | quality `e4a`, continuity `e4a`, continuity **`e4a-r`** | quality `e4a`, continuity `e4a` |
| Status | **`complete`** | `incomplete` (images 0/1; accounting open) |
| Selected | 1 | 0 |
| `openEvidence` | none | `giza-v12-3`, `e4a`, **held** |
| `money.held` / held worlds | true / `…:review:giza-v12-3:e4a` | true / the same |
| Network calls / paintings | 0 / 0 | 0 / 0 |

**Self-test: 24/24** (`logs/selftest-e4c-6.log`). What changed:
- The plan: an UNKNOWN charge gives `held`, both for E4a's continuity and for E4a's quality.
- A timeout's unknown charge holds that check. It is not asked again under another key, nothing is painted, and the other hides go on.
- **An unknown quality charge holds the hide as well.** Only the quality question is bought: no continuity, no re-ask and no painting. The run is not complete. This scenario was missing, and the mutation run found the gap (below).
- The report keeps the held hide `incomplete`, with `images.complete=false`, `accounting.open=true` and `money.held=true`.
- A single unknown charge leaves a repaint's hide held, with no re-ask and no painting.
- A hide planned as held buys nothing.
- `runStatus` is pinned in all four combinations.
- An invariant is checked on every launch in the suite: no run reports `complete` while money or evidence is held.

**Mutants.** Each mutant re-opens one part of the hole. The original was restored, and its SHA-256 verified, after every mutant.
- **On a clean tree** (`mutate-r1.cjs`, `logs/mutate-r1.log`), mutants 1 to 4 were each killed by exactly their intended checks:
  1. **An unknown continuity charge re-asked under another key.** Three checks failed: the timeout hold, the images/accounting split, and the repaint's held hide.
  2. **The plan no longer holding an unknown charge.** The plan check failed.
  3. **A held plan entry judged like a review.** "a hide planned as held buys nothing" failed.
  4. **Accepted pixels with an open charge reported `complete`.** The `runStatus` check failed.
- **Two mutants survived**, and each says something:
  5. **Held money no longer opening the accounting** (only held evidence). This is an **equivalent mutant**: in every reachable state a held audit comes with a held evidence entry, because every unresolved purchase returns `held`. The audit term stays as defence in depth.
  6. **An unknown quality charge treated as open evidence.** This was a **missing test**. Scenario 2d now covers it. The strict re-run (`mutate-r1b.cjs 5 6`, `mutate-r1b.json`) counts a kill only when the intended check fails. It catches mutant 6 with exactly "an unknown quality charge holds the hide", and mutant 5 survives as the documented equivalent.
- **A first run was contaminated and discarded.** Mutants 4 to 6 were "killed" by 16 or 17 failures each. The Antarctica files I had added to this worktree had drifted the runners' binding, so every launch in the suite was refused. The clean run above replaces that run. The Antarctica files now live on their own branch (§5).

**The demo world under the corrected rule.** The real E4c run used the old rule. giza-v12-2's continuity was unknown in E4a ($0.066), and E4c re-asked it under `e4a-r`; the re-ask passed.
- That purchase stays in history as it is.
- Under R1 the demo world is **images complete, accounting open** until the $0.066 is reconciled.
- The game's giza-v12-2 picture is still admitted: its exact pixels have settled acceptances from both judges.

## 2. R2: a lost create cannot be duplicated

**The hole** (Codex's `qa-batch-resume-independent-20261015.ts`):
- `openaiBatches.find` read one page of 50 and declared the round absent while `has_more` was true.
- After a lost create response, `submitRound` therefore created a second batch.

**The fix:**
- **`providers.ts`: a complete search, or none.**
  - Both providers page newest-first: 100 per page, through `after` (OpenAI) or `after_id` (Anthropic).
  - The search continues until a page reaches the round's intent, minus 60 s of clock margin.
  - A page that cannot be read **fails** the search.
  - Running out of pages (50) is **undecided**.
  - An Anthropic candidate that has not ended is **undecided**: only its results' custom ids can prove or rule it out.
  - Absence is declared only from a complete read.
- **`batch-purchase.ts`: the create is claimed.**
  - After every reservation exists, a worker writes `phase: "creating", createAttemptAt` by compare-and-set on **both** the phase and the previous claim time.
  - *Corrected 16 October (Codex):* this held only within one process. The on-disk store's read, check and write had no lock between processes, so two processes could both claim. The store now does them under an exclusive lock file, E5 takes the durable run lock, and a two-process test proves one create (`CLAUDE_CODEX_E6_REVIEW_FIXES_20261016.md`).
  - **A grace period.** A claim younger than 15 minutes (`CREATE_GRACE_MS`) is presumed in flight: nothing is created, and no search is trusted.
  - **Older claims.** A batch proven to carry the round is recorded. Two batches hold the round. An undecided search waits. Only a proven absence lets the create be claimed again.
  - **An inconsistent record.** A claim with a reservation missing is held for a person.
  - **Older records.** A legacy `intent` record with every reservation present is searched first, so it is never re-created blindly.
- **`e5-run.ts`:** the file store uses the same compare-and-set.

**Codex's repro, before and after** (`work/private-channels/qa-repro/repro-batch-resume.ts`):

| | Codex, before the fix | After |
| --- | --- | --- |
| List pages read | 1 | 2 (the original batch is on page 2) |
| Creates after the lost response | **1** | 0 |
| Duplicate submission | **true** | false |
| Phase | submitted | submitted, with the original batch's id |
| Network calls | 0 | 0 |

**Self-tests:**
- **`selftest-channels.ts`: 37/37** (`logs/selftest-channels-final.log`). It covers:
  - the lost response leaving a claim;
  - the grace period;
  - an undecided search waiting;
  - only a proven absence re-creating;
  - **two workers racing**, in one process, against an in-memory store. A search barrier makes both search before either claims, so only the compare-and-set can stop the second create; the loser is refused by the claim. The cross-process case came later (16 October);
  - an inconsistent claim held;
  - crashes before, during and after the reservations;
  - a legacy intent.

  A crash now prints `FAIL`.
- **`selftest-e5.ts`: 23/23** (`logs/selftest-e5-reconcile.log`). Both providers are simulated with real paging.
  - OpenAI and Anthropic each find their batch behind 150 newer ones.
  - Both stay undecided when 5,001 newer batches exhaust the 50 pages.
  - A page that cannot be read fails the search, for both providers.
  - A running Anthropic candidate leaves the search undecided.
  - Four further checks cover the reconcile-only path (§4).

**Mutants:**
- **R2, 13/13 caught by the check meant for each** (`mutate-r2.cjs`, `mutate-r2.json`). Each mutant disables one guard:
  - waiting for a young claim;
  - the claim's time in the compare-and-set;
  - the compare-and-set itself;
  - recording the claim's time;
  - an undecided search waiting;
  - holding an inconsistent claim;
  - for each provider: first page only, the page cap read as absence, and an unreadable page read as the end;
  - a running Anthropic candidate.
- **The original 14/14** (`mutate-channels.cjs`), re-run on the R2 code, with two anchors updated to R2's renamed test and extended poll guard.
- Both suites were run again on the final code, after the reconcile change, with the same result.
- After every mutant both files were restored, and their SHA-256 was verified.

**A weakness found and fixed on the way.** The first R2 mutation run caught 8 of 12:
- **The two-workers test passed without any compare-and-set.** The second worker's search already saw the first worker's batch, so the race never happened. The search barrier above makes it real.
- **Two mutants were malformed** by my own mutator.
- **One mutant broke the whole suite** before its own check. It was replaced by a precise one.

## 3. Cost and time, stated once

| Claim | Corrected statement |
| --- | --- |
| What the LOW world recorded | **$4.846543 exposure** = **$4.780543 settled usage estimates** + **$0.066 unknown**, held in full. **No provider invoice has been verified.** |
| Path A2 for this world | **A Batch-rate projection, not a measured world price.** The settled purchases repriced at Batch's half come to $2.693757. The unknown $0.066 is added **in full**, never discounted, for **$2.759757**. With identity ($0.074) it is **≈ $2.83**. (The earlier $2.727 halved the unknown; corrected.) |
| Guy's target | About **$3 on average**, with reasonable exceptions. One world's projection does not establish an average. |
| E5 | Its 8 questions validate the **channel** and the **sample's cost**. They do not measure a world's price or the average. |
| Batch | It removes the **synchronous wait**. It does **not** remove timeouts, expiry or money uncertainty: a batch can expire, be cancelled at a deadline or lose its create response, and each leaves a charge unknown until it is reconciled. |
| 6 h | A **proposed product policy**, not a delivery-time promise. |
| Fallback at a deadline | **Only after the round is reconciled, and only for questions proven unbilled.** An unknown holds. |

**Corrected in:**
- `CLAUDE_FIRST_LOW_GAME_20261015.md`;
- `CLAUDE_COST_LOW_THREE_DOLLAR_PLAN_20261015.md`: the A2 table's worst case, "Batch has no timeout", the deadline and the fallback;
- `CLAUDE_LOW_GAME_REVIEW_FIXES_20261015.md`;
- `work/private-game/game-cost.ts`, which now outputs `settledMicroUsd`, `unknownMicroUsd`, `exposureMicroUsd` and `a2Projection {settledAtBatch, unknownHeldInFull, total}`.

Each corrected document opens with a dated note.

## 4. E5: what was already sent

**What ran, and how it ended.**
- **Sent:** 10 questions in four rounds at 14:06 UTC, with a $1 cap and a 3 h deadline. Each question is byte-identical, by fingerprint, to a paid synchronous question.
  - 4 Opus quality questions;
  - 4 Sol continuity questions;
  - 1 Opus and 1 Sol question, cancelled at once to observe cancel semantics.
- **E5 stopped itself** at 17:16:51 on its own limit, the deadline plus 10 minutes ("rounds still open long after their deadline"). OpenAI's cancel of the Sol batch took 10 min 7 s and finished 4 s later. So E5 left that round unreconciled, wrote no report, and deleted no provider copy.
- **I finished it from what was already sent.** A new reconcile-only mode in `e5-run.ts` (`run-e5.ps1 -Reconcile`):
  - reads the existing round records and refuses anything else;
  - can neither create nor search for a create;
  - polls, reconciles, writes `out-e5/e5.json`, and deletes the provider copies.

  It ran at 17:25 and **resent nothing**. It *attempted* to delete both Anthropic batches, and OpenAI's input and error files, but did not then check the acknowledgements (Codex, 16 October). A read-only check on 16 October proves every one of them gone: each answers 404 (`out-e5/cleanup-evidence.json`). OpenAI keeps its two batch objects, which hold metadata only and cannot be deleted. Its own tests are in `selftest-e5.ts` (now 23/23):
  - E5's exact stop, reproduced;
  - a new process reconciling with zero creates or uploads;
  - each OpenAI input file deleted by a process that never uploaded it. The deletion previously reached only the files the uploading process had seen; it now reads them from the batch object;
  - a refusal where nothing was sent.
- **Read-only evidence:** one GET per batch object, in `out-e5/provider-evidence.json` (`evidence-e5.ts`).

| Round | The provider's batch object | Ledger |
| --- | --- | --- |
| Opus, 4 quality questions | ended, **4 succeeded**; 14:06:22 → 15:40:46, **1 h 34 min** | 4 settled at batch rates, **$0.201198** |
| Sol, 4 continuity questions | `in_progress` from 14:07:35, **0 of 4 completed in 3 h**; cancelled at the deadline (cancelling 17:06:48 → cancelled 17:16:55); an error file of `batch_cancelled` lines, no output | 4 **unbilled**: cancelled, documented-unbilled; $0 |
| Opus, cancelled at once | ended, 1 canceled, in 20 s | unbilled, $0 |
| Sol, cancelled at once | cancelled **before it started** (`request_counts.total` 0); no output and no error file | **unknown: $0.033 held in full** |

**Money:**
- **$0.234198 exposure**: $0.201198 settled, plus $0.033 unknown. The cap was $1. No provider invoice has been verified.
- The unknown stays unknown. OpenAI documents that only completed requests are charged, and the batch object shows none were even counted, but our rule keeps a request without its own result unknown.
- A person reconciles it against OpenAI's usage, the same way as the E4a world's $0.066.

**The four Opus answers, against their synchronous twins** (identical questions):

| Question | Synchronous | Batch | Sync charge | Batch charge (standard equivalent) |
| --- | --- | --- | ---: | ---: |
| amazon-v12-3 | **retry**: severeSeam, pictureWhole, neighborsIntact | **acceptable**, no fault | $0.107720 | $0.051750 ($0.103500) |
| greatwall-v12-2 | retry, the same three faults | retry, the same three faults | $0.105136 | $0.053578 ($0.107156) |
| newyork-v12-1 | acceptable | acceptable | $0.100216 | $0.047028 ($0.094056) |
| tokyo-v12-1 | acceptable | acceptable | $0.101184 | $0.048842 ($0.097684) |

**What E5 establishes:**
- **The Anthropic channel works end to end:**
  - the request bodies are the product's own, minus `service_tier`;
  - custom ids are opaque;
  - answers are read through the product's readers, all with `end_turn`;
  - the served tier is reported as `batch`;
  - each answer is charged **exactly half** of its own standard equivalent.
  - Against the synchronous twins' charges, whose answers differ in length, it is $0.201198 against $0.414256 (48.6%).
- **Cancel semantics, on both providers:**
  - **Anthropic:** a cancelled request is a `canceled` result, documented-unbilled.
  - **OpenAI, cancelled in progress:** the batch writes `batch_cancelled` lines.
  - **OpenAI, cancelled before it starts:** the batch writes nothing at all. The purchase design rightly holds that as unknown.
- **The custom-id mapping and the reconcile path,** on real batches.

**What E5 does not establish:**
- **The Sol channel on OpenAI Batch:** the price, the served-tier field, the agreement of its answers, and the queue time. **OpenAI processed none of the 4 Sol questions in 3 hours.** The plan assumed 15 to 60 minutes a round. One sample is not a distribution, but on the day it was tested, A2's Sol half did not deliver.
- **That a batched Opus answer is the same decision as a synchronous one.** One of 4 differed.
  - On amazon-v12-3 the synchronous answer located a seam at the left join: a board figure's teal shirt cut along a straight vertical line and fading into the foliage. I looked at the pixels, and that edge is visible.
  - **The batch answer most likely missed a real defect.** That is within what is known of the judge: Opus HIGH caught 8 of 11 known defects in E1/E2. With n = 4 it cannot be blamed on the channel.
  - The game is unaffected. Its amazon-v12-3 is E4c's repaint, accepted synchronously by both judges.
- **A world's price, or the average.** These were 8 questions.

**What follows for A2.** These are projections, and no decision was taken:
- **Opus on Batch is validated** as a channel. Its half price is real, and one sample took 1.5 h.
- **Sol on Batch is not validated.** If Sol stays synchronous, this world's A2 projection becomes $0.606971 + $3.121070 / 2 + $1.052502 + $0.066 = **$3.286008**, ≈ $3.36 with identity. That compares with $2.759757 with Sol on Batch.
- The options are Guy's and Codex's to weigh:
  - a longer deadline, measured over more samples;
  - Sol synchronous;
  - Flex, where a timeout becomes an unknown charge.
- **The run's own stop limit must outlast the provider's cancel.** OpenAI's took 10 min 7 s. The product's rounds need either a longer limit or a reconcile step, like the one added here.

## 5. Antarctica: the hat Guy asked for, prepared as version 13

**The gap** (Codex's product note):
- All three child appearances in the demo's Antarctica are bare-headed, although Guy asked for winter hats there.
- **The cause is the content, not the painter.** The v12 board's wardrobe says *"Hood down enough to see canonical hair; do not replace hair with a neighbour hat or black hair."* (`content/adventures/two-worlds-production.ts:35`, carried through `wizard-refresh-release.ts` and `wizard-integrated-release.ts`).

**A constraint the fix has to respect.** The canonical-face paint prompt requires *"The face and characteristic hair must remain visible and readable"* (`local-patch-prompt.ts:452`, also `:466`). The player-review judge's identity check includes "characteristic hair". A hat that covers the hair would contradict the product's own identity rule, and is likely to be rejected by the judges, which costs money.

**Where it is:**
- **Branch `claude/antarctica-hat-v13-20261015`, commit `fd238042`,** in worktree `work/claude-antarctica-hat-v13-20261015`. It sits on top of this branch's `abb6be46`.
- **Why a separate worktree.** Every private runner here pins a reviewed binding that hashes `src/`, `content/` and `prisma/`. A product file added in this worktree drifts it. The E5 reconcile refused to run while the files were here, and three R1 mutation results were contaminated (see §1).
- **Checks:**
  - `tsc` is clean, the new test passes 5/5, and `adventures:validate` passes.
  - The full vitest run had 4 timeouts under heavy machine load, in two unrelated files: `production-bootstrap` and `local-patch-incremental-review`. Both pass on a re-run, 96/96.

**The prepared version** (`content/adventures/antarctica-winter-hat-v13.ts`):
- **The same board.** It is derived from the v12 Antarctica: the same masters, crops, masks, placements and hints, under ids `antarctica-v13-1..3`.
- **Only the wardrobe's lead sentence changes:**
  > Insulated polar coat with its hood down behind the neck, gloves, snow trousers and boots in source colours, and a warm knitted winter hat in a source colour worn pushed back off the forehead. The whole face, both eyebrows, the hairline and canonical hair at the brim and sides stay visible; the hat never covers the eyes or forehead and never replaces the hair with a neighbour's hat or black hair.
- **The identity authority after it is kept word for word:** "FACE AND HAIR come ONLY from the canonical child portrait…". No source character's hair is imported: the test forbids "curl" and "brown hair".
- **It refuses to build** if the v12 text it replaces ever changes.

**Not wired:**
- No catalog, release or publication policy imports it.
- Version 13 is not a collection version (`isCollectionVersion(13)` is false).
- The publication policy only admits `-v12-` ids.

**Test:** `src/domain/adventure/__tests__/antarctica-winter-hat-v13.test.ts`, 5/5. It pins:
- the historical v12 board `65a034e9…`, the v11 board `5121e136…` and the live catalog entry `929e39e5…`, by the same digest the release tests use;
- the hat and visible-face wording;
- the identity text, kept verbatim, with no curls or "brown hair" imported;
- geometry identical to v12;
- that nothing live carries version 13.

**Wiring it is a release step, Codex's lane:**
1. Add version 13 to the version predicates and the publication policy's id pattern.
2. Decide its prompt policy: the same v19 path.
3. Check that the player-review wording accepts hair partly under a hat. "Hair partly hidden behind a coherent foreground object" is already allowed; a hat is a garment, not a foreground object.
4. Validate with 3 hides at LOW, about $0.06 of paintings plus about $0.5 of reviews. **This is not authorized in this round.**

## 6. Final signatures

**Tracked files** are signed by their commits:
- **This document and the three corrected ones:** branch `claude/review-cost-experiments-20261014`; the commit is named in Guy's handoff.
- **The Antarctica version:** branch `claude/antarctica-hat-v13-20261015`, commit `fd238042`:
  - `content/adventures/antarctica-winter-hat-v13.ts`: `5833a8f466f579c3943fd15473e4cd616a556b45382b37fd407f67376cb8dd8b`
  - `src/domain/adventure/__tests__/antarctica-winter-hat-v13.test.ts`: `8f1991410b607dfc952cdd57c3e525e95059a685db2c25f69bc128266786479a`

**Private files** (git-ignored, in `work/claude-qa-v19-check-20261014`), full SHA-256:

| File | SHA-256 |
| --- | --- |
| `work/private-e4c-runner/e4c-run.ts` | `84263411fbc2b6a08a60c2e51ebfcb426c191e2ec040279dd74f2801cd713a4c` |
| `work/private-e4c-runner/selftest-e4c.ts` (24/24, `logs/selftest-e4c-6.log` `c2b7b980b1dd4fe835c8cc4683465faec754a1920b4d0898cf5fc63dc1d776e5`) | `4763bccc4d79c2c598ec3e7e8c876565c7bba7dd54bc64d9d3632b487978589d` |
| `work/private-e4c-runner/qa-repro/repro-first-unknown.ts` / `first-unknown-after-fix.json` | `b1f3c4aa08dab8da3bc16a0786bd21ece07696ab245551c2c5310db30e3cbc85` / `6774e6ea6f40a7107f4d81c59cb93989bb18b4f827af227f03ee2ec825e64d32` |
| `work/private-e4c-runner/mutate-r1.cjs` / `logs/mutate-r1.log` (the clean run) | `9e4635114ad5fc63a7954ccf1304dc4e4aeebece83cdcbf06c6e2f1d142276db` / `a855550b3c5e4998d6e8dce3bcda4e0447c1b21346a48222f46afec47aedf2a7` |
| `work/private-e4c-runner/mutate-r1b.cjs` / `mutate-r1b.json` (the strict run) | `cfba40c1ceca4a5d90e2e241731c048b9a9c8e86541649a34fab6b0850022edb` / `1cd7de47e04f72e28e2e95fa2c82f69b0f6624eefa3f0ec8ce1ec3943d28df91` |
| `work/private-channels/batch-purchase.ts` | `f17c35b2682c7bea0f70bb54b66f3047548fa55a39073024291431a3f4cbb30a` |
| `work/private-channels/providers.ts` | `33097cf1a1d7a5dab4a7622f2bb7294e4e501c53c9fc23e106cbcb8aba11130a` |
| `work/private-channels/e5-run.ts` | `f883d2a8863196aad07ad442d62a7bdbbcce6d14b20434aa011751bd34c99f2e` |
| `work/private-channels/run-e5.ts` | `b06854d862ecb17bf55cdeb0d4cb2fc64abe35615e88893816f7355af9ef09f3` |
| `work/private-channels/run-e5.ps1` | `403b37fd262a7f7eb4500a75148b46acbe967efb7bd769fcbe67163ea28474ef` |
| `work/private-channels/selftest-channels.ts` (37/37) | `59dee6b518ae1b134a791c17d96209342d692b213d08bb825e82c21d770c349c` |
| `work/private-channels/selftest-e5.ts` (23/23) | `998cc5eda377f78dca8bb6d53afa43af89c602a391a799a7b82cfcf6ce5190bd` |
| `work/private-channels/mutate-r2.cjs` / `mutate-r2.json` (13/13) | `60a55fd596476fe337a005adc31ca051df96bfa65ce223aacb4da21377e83632` / `93fa41a9b413256f2e740ba91e35f9e63b66424c9d33840810b624b053446122` |
| `work/private-channels/mutate-channels.cjs` / `mutate-channels.json` (14/14) | `2cd93822b1375e1a0790cefaafc205e9f9e087284ad007deb4c80baf08d20a30` / `fb78da7b60f229be34c189957ffa37305fb1d7a17773e68d88d37a717857ad2c` |
| `work/private-channels/qa-repro/repro-batch-resume.ts` / `batch-resume-after-fix.json` | `a13f61a8bed7f5deb7068f5b80f370aa539e08be94c3f788ef68f581c6b8cf3a` / `df9513d217352e5dc68655a4174931c433996aa1d5f1cff8b18dec2228241d09` |
| `work/private-channels/evidence-e5.ts` / `evidence-e5.ps1` | `1a8e54c30307e590bbfdb9356b527a40b768c9c9d19ca27d2e6d299505deb43b` / `81115cf1b654d0d047a88379c611b8561292ef2e1683ab451448ec9773a49fb1` |
| `work/private-channels/out-e5/e5.json` | `f9e6a1c74d6000460e687cc7d8b116e57d47d83e88307e0a4e42fb97c88a880d` |
| `work/private-channels/out-e5/provider-evidence.json` | `9fc7b428b26b3fefc08384a77f7e8f262750187ca291301c5a9537aeaf1f43e9` |
| `work/private-channels/out-e5/purchases-e5.sqlite` | `580c7c3d6fbb57c9e9236648bb308893c3ed5b2a3e29a2994843ba929144b3ff` |
| `work/private-channels/read-e5-answers.ts` / `read-e5-faults.ts` | `10ae9fbad3c0845426c1cb47468d3b68a7cdf8cfaf10afc5e1945ff1b3f9fb2c` / `f8ae6a0591921799abaf53e1eb95a83b2a53934e7014f2e8670a82d3b29e2245` |
| `work/private-game/game-cost.ts` / `game-cost.json` | `9b22eccade73d94193d5e5678cde427d953a8d3a10bed7c4e46ae99d987f700d` / `3f5785c0d62f7a1662fd10a3ccadc7910a50c042039e3d050637519133e34d0c` |

**What needs a person:**
- **Two unknown charges to reconcile** against OpenAI's usage, never by assumption:
  - E4a's giza-v12-2 timeout, $0.066;
  - E5's cancelled-before-start request, $0.033.
- **Decisions for Guy and Codex:**
  - the Sol channel (§4);
  - the Antarctica wiring and its 3-hide check (§5). Neither is authorized here.
