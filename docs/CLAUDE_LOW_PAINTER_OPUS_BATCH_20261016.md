# LOW painter and Opus on Message Batches, pinned per new draft (16 October 2026)

Guy approved steps 1 and 2 of the wiring ("מסכים ומאשר"): LOW as the painter, and Opus's quality question through Anthropic's Message Batches, with rounds that last between runs. This was done on a separate branch, with no deployment and no spend.

Branch `claude/wiring-low-batch-20261016`, from `921cf306`.

**Not done:**
- nothing was bought, and no provider was called (every test uses a scripted fake);
- no flag, ceiling or model was changed anywhere live;
- nothing was deployed or pushed;
- there is no schema change and no DB change.

Codex's conditions for the wiring (closure of N1–N3) are mapped to evidence in §4.

## 1. LOW as the painter of new games (step 1)

**What changes.** A new QA local-patch draft created while `LOCAL_PATCH_PAINTER=low-v1` is set records an immutable pin, `aud_painter_release_<gameId>`, in the same transaction that creates the draft (`createDraft` and `beginWorldPurchase`), beside its review and budget pins. Every painting of that game is then bought at LOW: first pictures, repairs, quality-pilot images.
- The pin is the only thing that changes. The request is `LOCAL_PATCH_LOW_IMAGE_POLICY`, which is today's v12 request at low quality: the same model, size, background, rate card and reservation ($0.12 per painting), and the same judges.
- Quality is part of every painting's identity (`localPatchRenderPolicySha256`). So the pin is read per game (`localPatchPainterForGame`, in `pipeline.ts` and `queue.ts`), never from the deployment.

**What does not change:**
- A game without a pin keeps its content version's own quality: MEDIUM for v12, exactly as before. Every existing game and draft is in this group.
- The default is `by-version`. Deploying the code alone changes nothing, like v19 and dual-high-v3 before it.
- A pin that is not byte-for-byte the known receipt is refused. The game never falls back to MEDIUM or anything else.

**Qualified configuration only.**
- `low-v1` painted the first LOW world (27/27 accepted by Opus and Sol, 15 October) and E6a's three Antarctica hides, both with prompt release v19 and dual-high-v3.
- A draft created with `low-v1` outside QA + v19 + dual-high-v3 is refused, not downgraded.
- `/api/health` reports `painter: { newGames, qualified }` and returns 503 while an unqualified `low-v1` would refuse every new draft.
- The pin paints content version 12 only. A test pins that every version a new QA draft can be sold at is 12; Detectives has no release.

**Tests:**
- `painter-release.test.ts`: **19** tests. The message of `ba8f620c` says 13, which is my miscount; the file has 19.
- `new-draft-releases-health.test.ts`: the painter half.
- Mutants: 10/10, each killed by the test it targets. These cover:
  - the slice ignoring the pin;
  - the queue or pipeline reading another game's pin;
  - no qualification check;
  - no unstarted-draft check;
  - the pin read loosely;
  - any content version accepted;
  - either draft path not pinning;
  - health never failing.

## 2. A review bug found on the way: one pick per board review

**Not caused by this branch; present on the deployed engine.** `prepareLocalPatchBoardReview` picks a board's next appearance twice:
- once for the request it builds, with a saved quality answer's continuity question first;
- once for the question it asks, without that ordering.

**The failure.**
- A later sibling's quality answer is saved first.
- An earlier sibling then becomes ready, for example a repaint or a late first picture.
- The two picks differ, and the request is left with no appearance.
- The review throws (`Player assessment requires one age-bound integrated appearance`), and every later tick throws the same way. The world never moves.

A probe reproduced it on unmodified ordering before the fix.

**The fix.** The second pick uses the same order as the first. When the two picks already agree, which was every case that did not throw, nothing changes.
- Regression test: `local-patch-review-pick.test.ts`.
- The fix has its own commit, so it can be taken without the rest.

## 3. Opus's quality question through Message Batches (step 2)

### Per game, like the painter

A new QA local-patch draft created while `LOCAL_PATCH_QUALITY_CHANNEL=anthropic-batch-v1` is set records `aud_quality_channel_<gameId>`. Its receipt fixes:
- the model;
- the channel;
- the pricing rule;
- the six-hour deadline;
- the fallback rule.

**Qualification.** It is qualified only on QA with dual-high-v3, the question E5 asked. Elsewhere the draft is refused.

**What it covers.** Only the Opus scene-quality question; Sol's continuity question stays synchronous. A game without the pin is unchanged.

**Health.** `/api/health` reports `qualityChannel: { newGames, qualified, configured }`, and returns 503 when the setting is unqualified or has no Anthropic key.

### How an answer reaches the dual review unchanged

The dual review buys its quality question under `self-repair:board:<board>:<fingerprint>`. Everything downstream depends on that key and on a settled bill under it:
- replay;
- `verifiedDualStage`;
- the publication proof;
- re-reading;
- deletion.

So a batched question uses two keys:
1. **The batch key**, `self-repair:batch:<board>:<fingerprint>`. It is reserved before the batch is created, at half the synchronous reservation, because every batch rate is half. It settles at the price of the tier that served the answer. The answer is retained under it.
2. **The dual review's own key**, written straight in as a **linked alias** of the batch key's charge (`WorldBudget.link`): the identical bill, counted once, with the dual review's own reservation terms but **holding no capacity**, since the answer is already paid for. The same bytes are retained under it, after the alias; a copy lost in between is written by the next pass. (Until the review this was a reservation settled at once, which could refuse a paid answer near the ceiling; see §7, P1-5.)
3. The dual review then calls `buy` exactly as today. `purchaseOnce` replays the answer, and every check of a dual stage holds unchanged.

Retained bytes have the synchronous shape:
- the reply is read by the same code (`readAnthropicVisualReview`, now shared with the synchronous transport);
- `costUnknown: false` comes from the tier-aware price;
- the provenance fields are `channel: "anthropic-message-batches"` and `batchId`.

**The request.** It is the synchronous Messages body without `service_tier`, field for field (`anthropicVisualReviewBody`). A test pins the synchronous request byte for byte against the body written out by hand from the code before this branch (`921cf306`): prompt, labels, images and their order, and `standard_only`.

### Pricing by the tier that served it

`visualReviewBatchCharge`:
- **`service_tier: "batch"`** is priced at exactly half of every standard Opus rate. Anthropic: "All usage is charged at 50% of the standard API prices", checked 16 October. E5's 16,665 input and 1,842 output tokens give 51,750 micro-USD, as billed.
- **`"standard"`** is priced at the standard card.
- **Any other tier, no tier, or another model** is not priced. The answer is kept, its charge is held as unknown, and the question is never asked again automatically.

### The round, durable across worker slices

A round is append-only AuditLog rows under `generation:quality-batch`. Each event's id makes it happen once, which is the compare-and-set. No schema change is needed. The order is the proof:

```
intent ─► reserve batch key (half) ─► claim n ─► create ─► submitted ─► [cancel at deadline] ─► answered | fallback | held
```

**Never two purchases:**
- The intent is durable before the reservation, and each claim before its create.
- A create that did not answer (timeout, network, 5xx, an unreadable 2xx) is uncertain. It waits out a 15-minute grace.
- After the grace, only a search of the provider's batches decides, newest first, back to the intent. It reads results only from the documented path built from a checked batch id.
  - Two found hold the charge at once, as unknown. The round itself ends, naming every copy, only when no candidate still runs, so a deleted game's copies are all found and deleted.
  - A candidate that has not ended leaves the search undecided, and the round waits, **even when one batch is already proven**: recording that one could release the other's possible charge on the first one's outcome.
  - One batch found, with nothing undecided, is recorded.
  - Only proven absence allows a new claim and create. Absence is proven only by a complete inventory: every list page to its documented end (`has_more`, with a cursor whenever more follow), and every ended batch's results matching that batch's own `request_counts` type by type, each id once. An empty, cut-off or self-contradicting results file is an error, never "not there" and never "unbilled".
- A documented 4xx refusal with Anthropic's error envelope proves nothing was created.
  - `429` waits 5 minutes and tries again.
  - Others are held at zero.
- Of two workers, one claims; a test races three.

**The deadline: 6 hours, pinned.** A batch still running is cancelled, and cancelled again while it runs.
- **Unbilled results.** Anthropic documents errored, canceled and expired results as not billed. They settle the batch key at zero and leave the dual review's key free, so the dual review asks the same question synchronously, as for any game.
- **Invalid requests.** An `invalid_request` error is held at zero for a person; asking it again unchanged would be refused too.
- **No batch at all.** A round whose every create was refused before the deadline falls back without a search.

**An unknown charge is never deleted or discounted.** It holds the world. A held round needs a person; there is no admin tool for it yet.

**Interruptions.**
- A crash after the bill and before its record replays to the same state, with no second bill.
- So does a crash between the alias and its retained copy: the next pass writes the copy before the dual review buys.
- An alias reservation left by the earlier code settles into the alias as before.
- Tests replay each and compare the ledger entries byte for byte.

**Throughput.** One question per batch.
- Each slice polls every open round first (`advanceQualityBatches`), and never creates in that step.
- A board puts an appearance whose question is waiting last, so its siblings' questions go out meanwhile.
- With no open round, the ordering is unchanged.
- At half the reservation, 27 questions in flight hold $3.375. A full world waits for capacity through the existing budget wait, rather than failing.

**Deletion and stopped games.**
- The batch key enters the deletion inventory immediately before it is reserved, in the same step, so every reservation has its entry whatever stopped a worker earlier, and a retained answer is purged with the game.
- The scheduled tick sweeps rounds of games no longer generating (`sweepQualityBatches`):
  - running batches are cancelled;
  - ended ones are settled;
  - a deleted game's late answer has its bill recorded and its bytes not kept;
  - the provider's copies are deleted once acknowledged.
  - Each tick starts one round further on (the tick runs every minute), so a round that is slow on every tick cannot keep the sweep from the others.
  - The records are read in two queries, and the 40-second window for provider calls opens only after them.
  - Each game's state is read again just before its rounds are touched: a game resumed meanwhile is left to its own slices.
  - A round that never reached the provider (stopped after its intent, or every create refused) ends at zero rather than waiting for a create that a stopped game never makes.
- Finished rounds of generating games are deleted by their own slices.
- A held round keeps its batches for the person, **unless its game was deleted**: then they are deleted at the provider too, while the unknown charge stays held in the ledger. The hold is the ledger's to keep; the imagery is the child's.
- **Failure handling (`80d7de72`):**
  - One game's unreadable record never stops the sweep of the others.
  - A round the slice cannot advance stops the slice with the job's FAILED status and reason, exactly as a failing review does.

### Tests

| Suite | Result |
| --- | --- |
| `quality-batch.test.ts`: real SQLite, ledger, retained store, dual review and world slice, with a scripted provider | **34/34** (21 in `1df2e366`, 2 in `80d7de72`, 6 for Codex's HOLD, 5 for the re-review) |
| `quality-batch-round.test.ts`: the pure rules | **21/21** (16, plus 5 for the HOLD) |
| `anthropic-message-batches.test.ts`: the transport on a scripted wire, plus pricing | **11/11** (8, plus 1 for the HOLD and 2 for the re-review; 3 updated) |
| `world-budget.test.ts` and `board-wizard-budget.test.ts`: `WorldBudget.link` | 3 and 1 new |

Among the first 23:
- **A whole 27-appearance world** reaches READY with:
  - 27 published appearances;
  - 0 Opus questions asked synchronously, and 27 Sol questions;
  - 27 batches of one question each;
  - a settled total of exactly renders + 27 × 9,000 (Opus at half of 18,000) + 27 × 10,000 (Sol);
  - 27 linked aliases;
  - every quality stage verified by `verifiedDualStage`;
  - every provider copy deleted.
- The deadline-cancel fallback.
- A lost create recorded by search, and one proven absent and re-created once.
- Two batches held.
- Refusals.
- Unpriced tiers and models.
- Invalid and server errors.
- Resume after both interruptions.
- An unpinned game untouched.
- A sync-owned question never batched.
- Missing configuration refused.
- Deletion and the sweep.
- An unreadable round stops the slice with its reason, and the sweep moves past it.
- Purge.
- The pin.

**Mutants:** see §5.

## 4. Codex's conditions, one by one

| Condition | Where it holds |
| --- | --- |
| Pricing by the tier actually served | `visualReviewBatchCharge`: batch at half, standard at standard, anything else held as unknown. Tests cover each tier, no tier and another model. |
| Durable waiting beyond the worker window | AuditLog rounds plus the per-slice poller. The question waits across any number of invocations (deadline test: 6 h). |
| Interruption or 5xx: no double purchase, no deletion of an uncertain charge | Claims, grace and a search that proves absence only from a complete inventory: one batch recorded only when no other could still carry the question, two held. Uncertain charges are only ever marked unknown, never settled or deleted. The interruption replays are tested. |
| 27 valid approved results before READY | The whole-world test: READY only with 27 published appearances, each with a verified quality stage. A held world parks, and is never READY. |
| A runner's `complete` with `money.held` is not readiness | In the product, a held charge holds the world: no reservation, no publication. The unpriced tests show this. |
| The judges' questions and the quality requirement unchanged | Same params minus `service_tier`; same reader; same `verifiedDualStage`. Sol is untouched. |
| Channel savings are not a measured average | See the cost statement below. |

**Cost.** This branch's configuration is LOW paintings, Opus on Batch and Sol synchronous. For the 15 October demo world, its **projection** is **$3.286008, ≈ $3.36 with identity**: $0.606971 + $3.121070 / 2 + $1.052502 + the unknown $0.066 in full (`CLAUDE_LOW_GAME_QA_FIXES_R1R2_20261015.md` §4). This is a projection, not a measured price or average.
- With Sol on Flex as well, the projection is ≈ $2.83. That is not wired here; it needs a 5xx policy.
- Guy's target is about $3 on **average** across 27-hide worlds. One world proves no average.
- **E5's caution stands.** One of four Opus batch answers passed a seam that its synchronous twin had located. That is answer-to-answer variance of the same question, n = 4; it is no evidence for or against a difference between channels.

## 5. Mutation checks

Each mutant edits one anchor and runs only its targeted tests. Each counts only when the test written for it fails. The tree is restored in `finally`, and the files are proven byte-identical afterwards.

- **Step 1:** 10/10.
- **Step 2 and the pick fix: 24/24,** each killed by the test it targets, with the tree restored and verified. The 24 mutants were:
  - the pick fix reverted;
  - the gate ignored;
  - no ordering behind open rounds;
  - the synchronous owner not checked;
  - a full batch reservation;
  - the claim race ignored;
  - no grace;
  - two batches not held;
  - a permanent refusal retried;
  - batch priced at the standard rate;
  - any tier priced;
  - an invalid request falling back;
  - never cancelled;
  - unbilled results not settled;
  - never linked;
  - a deleted game's answer raising;
  - the sweep taking generating games;
  - the synchronous body losing its tier;
  - the search going past the intent;
  - a 404 on deletion not accepted;
  - an unenveloped 4xx treated as a refusal;
  - the channel pin read loosely;
  - the channel pin unqualified;
  - an early unsent fallback.
- **Follow-up `80d7de72`: 3/3:**
  - the poller's error left unsurfaced;
  - the sweep stopping at a bad game;
  - a corrupt intent raising a TypeError.
- **Codex's HOLD (§7): 22/22,** each killed by the test it targets, with the tree restored and verified:
  - P1-5 and the alias: the alias reserving capacity again; the guard counting aliases; the ledger's link needing room; linking to another operation; overwriting a row; attempt 2's canonical key unmapped; a lost copy never repaired;
  - P1-1: results not counted; a page's end not required; a cursor not required; counts not required in the search; `processing` ignored; results read from a batch that has not ended;
  - P1-2: one proven batch recorded before an undecided search;
  - P1-3: no inventory before the reservation; the inventory after it;
  - P1-4: held rounds never purged; a hold forgetting the batches it found; the sweep blind to deletion; the slice purging held rounds of a live game;
  - P2-6: no rotation;
  - P2-7: the shared helper drifting (labels after images).
- **Codex's re-review: 31/31,** each killed by the test it targets, with the tree restored and verified. The first round's 22 were run again as 23, re-anchored where the sweep and the transport changed: the completeness check is now two mutants (the total unchecked; ids not distinct), and the deletion mutant now blinds the sweep's shared `deletedGame`. The 8 new:
  - F1: types not matched, killed both by the transport's test and end to end on the real transport;
  - F2: the hold ending the search early; the search going on without holding the charge;
  - F3: the window opening before the records are read;
  - F4: the game's state not read again;
  - F5: a stopped game's unsent round left waiting;
  - F6: a search out of pages not saying so.

**The full suite (`npm run check`) on `1df2e366`:**
- tsc is clean.
- Vitest: 5,089 passed, 2 expected failures, 55 skipped, **2 failed**. The 2 failures are the same two tests that failed the same way on step 1 alone: `local-patch-incremental-review.test.ts` "retries malformed anatomy evidence…" and "asks a cut-off anatomy answer again…", each a 20-second timeout under full-suite load.
- Alone, the file passes 79/79 at both stages.
- Timed back to back with only those two tests, the code before step 2 (`ba8f620c`) and after it are the same: 13.07 / 12.84 / 13.06 / 12.80 s against 12.96 / 12.81 / 12.86 / 12.93 s. Step 2 adds nothing measurable; the timeouts belong to load.

**The full suite on the HOLD fixes:**
- tsc is clean.
- Vitest: 5,107 passed, 2 expected failures, 55 skipped, **2 failed**: the same two load timeouts in `local-patch-incremental-review.test.ts`. Alone, that file passes 79/79.
- The ledger commit `233c55e7` alone, on `fcf4c0ea`: tsc clean, and the three ledger test files pass 70/70.

**The full suite on the re-review fixes:**
- tsc is clean.
- Vitest: 5,112 passed, 2 expected failures, 55 skipped, **4 failed**, all timeouts under full-suite load: the same two in `local-patch-incremental-review.test.ts` (20 s), and two in `production-bootstrap.test.ts` (15 s), the pair that also timed out on step 1. Neither test file is changed by this branch, and nothing under `prisma/` or the bootstrap code is either.
- Alone, the two files pass 96/96 (79 and 17).

## Commits

| Commit | What |
| --- | --- |
| `afbd8ee2` | fix(review): one pick for a board's request and its question |
| `ba8f620c` | feat(qa): pin the LOW painter on new local-patch drafts |
| `1df2e366` | feat(qa): Opus quality questions through Anthropic Message Batches |
| `80d7de72` | fix(qa): a batch round that cannot be advanced is surfaced, not repeated |
| `fcf4c0ea` | docs(qa): LOW painter and Opus on Message Batches, per new draft |
| `233c55e7` | feat(budget): link a second key to a settled charge without capacity (Codex P1-5) |
| `b90d818d` | fix(qa): the batch channel's recovery, deletion and alias (Codex HOLD) |
| the commit carrying this section | fix(qa): the batch channel after Codex's re-review (F1-F5) |

Each was verified on its own in a clean worktree:
- `afbd8ee2`: tsc and its regression test;
- `ba8f620c`: tsc and 23 files, 309 tests, including the env schema tests.

The split was proven exact: replaying step 2's edits onto the step-1 versions reproduces the final files byte for byte.

## 6. Open, for a decision

1. **Deployment:** Codex's lane, and not authorized now.
   - It is two settings, `LOCAL_PATCH_PAINTER=low-v1` and `LOCAL_PATCH_QUALITY_CHANNEL=anthropic-batch-v1`, with no migration.
   - `/api/health` shows both.
   - The first paid world on them is the real test of the channel's latency and of its average.
2. **A held round has no admin action.** A person reconciles its charge (the existing continuation approval). Re-asking that question needs a new tool or a code change.
3. **The worst case of an uncertain create** waits until the candidate batch ends (at most 24 h). Its id is unknown, so it cannot be cancelled.
4. **The search reads the results of every batch** created in the workspace after the intent. If the Anthropic workspace is shared with another product, those results pass through memory, never storage. This happens only after an uncertain create.
5. **Sol on Flex** (≈ $2.83 projected) is the next step toward $3. E6b's evidence is 3/4 at half price, with one 503 held.
6. **The scheduled sweep's first query** (`action` across every game's AuditLog rows) has no index on `action`. It runs once a tick and is fine at QA's size; at a large size it would need an index, which is a schema change.
7. **A world parked for a person** (NEEDS_RELEASE or exhausted) runs no slice, so its open rounds are neither polled nor cancelled at their deadline until it resumes. Each batch still ends within 24 h, and its reservation stays counted meanwhile.
8. **The sweep reads every game's round record each minute** to find the rounds with work. Fine at QA's size; at scale it would want a cursor or an index (a schema change).
9. **Batch ids.** Anthropic's reference says "The format and length of IDs may change over time." The transport accepts only `msgbatch_` followed by letters and digits. A new format fails closed: every create becomes uncertain and every batched question waits, so a deployment would show it at once, but it would stall the channel until the pattern is widened.
10. **A dedicated Anthropic workspace (Codex F6).** A search after a lost create reads every batch the API key's workspace created after the round's intent, newest first, up to 20 pages of 1,000. Deeper than that it stays undecided, and so does the round: nothing is created or released, and the waiting reason says the list was too long. A workspace used only by this channel keeps the search to this product's own batches (27 per world), far below the limit. Making the search resumable across passes is the fix if that ever changes.
11. **A provider answer that contradicts itself** (Codex F1) leaves its round waiting, with the charge pending, until a person looks. The stalled-generation alert reports the game.

## 7. Codex's review of `fcf4c0ea`: HOLD, and the fixes

Codex reviewed `921cf306..fcf4c0ea` read-only and held it: five P1 findings and two P2, no P0. Every finding was accepted and fixed on this branch.

Codex also confirmed, from source and offline probes:
- pricing by the served tier, with a standard-tier answer recorded in full as an overrun;
- the alias's accounting once established (`purchaseOnce`, `verifiedDualStage`, world totals, daily spend, the admin display);
- the per-game pins;
- the pick fix;
- the synchronous transport, byte-identical for 1, 2 and 30 images;
- no path from a held ledger to READY.

| # | Finding | Fix | Regression test |
| --- | --- | --- | --- |
| P1-1 | The search took an empty or cut-off results file, or a list page without its end, as proof that a lost create made nothing. | A result set counts only when it adds up to the batch's own `request_counts`, with none still processing and each id once. A list page must say `has_more`, with a cursor whenever more follow. `results()` reads the batch's own record first. Anything less throws, and a throw never permits a create. | Transport: eight incomplete answers, each refused; the same file whole proves absence. |
| P1-2 | One proven batch was recorded while another candidate still ran. A canceled first result then released the reservation and asked the question synchronously. | An undecided search waits, even with one batch proven. Two proven still hold. | Codex's scenario: no synchronous question, no terminal record, the reservation still pending; then held with both batches named. |
| P1-3 | A crash between the intent and the batch key's inventory entry left the key out of deletion's inventory for good. | The entry is written in the step that reserves the key, immediately before the reservation. The separate write after the intent is gone. | A trigger stops the worker right after the intent; resumed, answered and deleted, both retained copies are gone. |
| P1-4 | A deleted game's held round never had its provider batch deleted. | A hold names the batches it found but never recorded. A finished round's batches are deleted at the provider once kept, and a held round's too when its game is deleted (`qualityBatchCleanupDue`). The unknown charge stays held. | An unpriced answer: kept while the game lives, deleted with the game, the charge still unknown, nothing bought. The two-batch hold: both deleted. |
| P1-5 | The alias needed a full synchronous reservation, so a paid answer near the ceiling was refused for good. | `WorldBudget.link` writes the alias straight in. It needs no capacity and grants no dispatch. It accepts only a settled, unconflicted charge of the same scope and operation, and is idempotent. The board wizard's ceiling no longer counts an alias, and attempt 2's keys map as for every other call. | Ledger (3 tests); the $4 board-wizard ceiling with Codex's numbers (191,000 left, alias 250,000, Sol 66,000); Codex's scenario end to end at the world's edge: the paid answer replays and Sol is asked, with no second Opus purchase. |
| P2-6 | The sweep always started at the first round, so one slow round starved every round after it. | Each tick (every minute) starts one round further on. | Codex's scenario on a fake clock: the slow round fails on every tick, and the other game's round is still reached. |
| P2-7 | The synchronous-body test derived its expectation from the helper both routes share. | The request is pinned byte for byte against a body written out by hand from `921cf306`. | Changing the shared helper now fails it. |

**The new order's own window.** Writing the alias first means a worker that stops between the alias and its retained copy would leave a paid answer the dual review could not replay. The next pass writes the copy before the dual review buys. A trigger test stops that write once and checks the review goes on without a second purchase.

**A record-format change, before any deployment.** The `deleted` event now names every batch it deleted (`batchIds`), and a `held` event may name the batches a hold found. Nothing has run on the old format outside tests.

### Codex's re-review of `b90d818d`: HOLD, and the second round

Codex re-reviewed the two fix commits read-only. It closed P1-5 and P2-7 outright, and confirmed:
- `WorldBudget.link`: it needs a settled, unconflicted charge of the same scope and operation; it overwrites nothing; the guard's exemption covers only linked rows; attempt 2 maps both keys; a held world stays held;
- the alias's new order: no reader does anything irreversible between the alias and its copy, and deletion is covered in each window;
- no retained-record key in the channel can be written before its inventory entry.

It found two P1 and four P2 findings, each a sibling of a first-round fix:

| # | Finding | Fix | Regression test |
| --- | --- | --- | --- |
| F1 (P1) | Results whose types contradict the batch's per-type counts were accepted. A counted success returned as "canceled" settled the reservation at zero and asked the question synchronously. | Results must match the batch's record type by type: every count it states, each id once. A contradiction throws, so the charge stays pending and the round waits. | Transport: a counted success returned as canceled, expired or errored; the reverse; a type the record does not count; one extra line of such a type; the search refusing the same. End to end, on the real transport with a scripted wire, Codex's reproduction stays pending, with no fallback and no synchronous question. |
| F2 (P1) | Two proven copies ended the search while a third candidate still ran. That copy escaped a deleted game's deletion. | Two proven copies hold the charge at once, but the round ends, naming every copy, only when no candidate still runs. | Codex's three copies: held at once with the round still open; after the game's deletion nothing is deleted until the third ends; then all three are named and deleted. |
| F3 (P2) | Reading the records before the first provider call could use up the sweep's whole window. | Two reads for the whole inventory, and the window opens once they are done. The tick gives the sweep until the generation slice's own reserve. | Eight seconds of reading on a fake clock: the deleted game's batch is still cancelled in the same tick. |
| F4 (P2) | A game resumed after the records were read could have its running batch cancelled as a stopped game's. | The game's state is read again just before each of its rounds is touched. | Resumed between the reads and the processing: its batch is left running. |
| F5 (P2) | A deleted game's round, stopped after its intent and before any reservation, stayed open forever. | A game that is not generating creates nothing. A round at its create step, where nothing has ever reached the provider, ends as never-created, at zero. | Codex's crash window: the round ends with nothing billed and drops out of later sweeps. |
| F6 (P2) | A complete inventory deeper than 20 pages (20,000 batches newer than the round's intent) leaves the search undecided forever. | **Not fixed; documented (§6).** The search fails closed: nothing is created and nothing is released. It now says why (`truncated`). | Transport: a search that runs out of pages is undecided and says it was truncated. |

**F4's remaining window.** A game resumed between that read and the cancel itself (milliseconds) can still have its batch cancelled. The question is then asked synchronously at the standard price; the ledger stays exact.
