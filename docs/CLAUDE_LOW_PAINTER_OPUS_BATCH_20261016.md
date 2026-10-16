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
2. **The dual review's own key**, reserved at the synchronous amount and settled with the identical bill. The ledger records it as a **linked alias**, counted once. The same bytes are retained under it.
3. The dual review then calls `buy` exactly as today. `purchaseOnce` replays the answer, and every check of a dual stage holds unchanged.

Retained bytes have the synchronous shape:
- the reply is read by the same code (`readAnthropicVisualReview`, now shared with the synchronous transport);
- `costUnknown: false` comes from the tier-aware price;
- the provenance fields are `channel: "anthropic-message-batches"` and `batchId`.

**The request.** It is the synchronous Messages body without `service_tier`, field for field (`anthropicVisualReviewBody`). A test pins that the synchronous body is unchanged: same fields, same order, `standard_only`.

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
  - One batch found is recorded.
  - Two found hold the round, with the charge unknown.
  - A candidate that has not ended leaves the search undecided, and the round waits.
  - Only proven absence allows a new claim and create.
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
- So does a crash between the alias's reservation and its settlement.
- Tests replay both and compare the ledger entries byte for byte.

**Throughput.** One question per batch.
- Each slice polls every open round first (`advanceQualityBatches`), and never creates in that step.
- A board puts an appearance whose question is waiting last, so its siblings' questions go out meanwhile.
- With no open round, the ordering is unchanged.
- At half the reservation, 27 questions in flight hold $3.375. A full world waits for capacity through the existing budget wait, rather than failing.

**Deletion and stopped games.**
- The batch key enters the deletion inventory before it is reserved, so a retained answer is purged with the game.
- The scheduled tick sweeps rounds of games no longer generating (`sweepQualityBatches`):
  - running batches are cancelled;
  - ended ones are settled;
  - a deleted game's late answer has its bill recorded and its bytes not kept;
  - the provider's copies are deleted once acknowledged.
- Finished rounds of generating games are deleted by their own slices. A held round keeps its batch for the person.
- **Failure handling (`80d7de72`):**
  - One game's unreadable record never stops the sweep of the others.
  - A round the slice cannot advance stops the slice with the job's FAILED status and reason, exactly as a failing review does.

### Tests

| Suite | Result |
| --- | --- |
| `quality-batch.test.ts`: real SQLite, ledger, retained store, dual review and world slice, with a scripted provider | **23/23** (21 in `1df2e366`, plus 2 in `80d7de72`) |
| `quality-batch-round.test.ts`: the pure rules | **16/16** |
| `anthropic-message-batches.test.ts`: the transport on a scripted wire, plus pricing | **8/8** |

Among the 23:
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
| Interruption or 5xx: no double purchase, no deletion of an uncertain charge | Claims, grace and search: one batch recorded, two held. Uncertain charges are only ever marked unknown, never settled or deleted. Both interruption replays are tested. |
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

**The full suite (`npm run check`) on `1df2e366`:**
- tsc is clean.
- Vitest: 5,089 passed, 2 expected failures, 55 skipped, **2 failed**. The 2 failures are the same two tests that failed the same way on step 1 alone: `local-patch-incremental-review.test.ts` "retries malformed anatomy evidence…" and "asks a cut-off anatomy answer again…", each a 20-second timeout under full-suite load.
- Alone, the file passes 79/79 at both stages.
- Timed back to back with only those two tests, the code before step 2 (`ba8f620c`) and after it are the same: 13.07 / 12.84 / 13.06 / 12.80 s against 12.96 / 12.81 / 12.86 / 12.93 s. Step 2 adds nothing measurable; the timeouts belong to load.

## Commits

| Commit | What |
| --- | --- |
| `afbd8ee2` | fix(review): one pick for a board's request and its question |
| `ba8f620c` | feat(qa): pin the LOW painter on new local-patch drafts |
| `1df2e366` | feat(qa): Opus quality questions through Anthropic Message Batches |
| `80d7de72` | fix(qa): a batch round that cannot be advanced is surfaced, not repeated |

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
