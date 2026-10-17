# LOW painter and Opus on Message Batches, pinned per new draft (16 October 2026)

Guy approved steps 1 and 2 of the wiring ("מסכים ומאשר"): LOW as the painter, and Opus's quality question through Anthropic's Message Batches, with rounds that last between runs. This was done on a separate branch, with no deployment and no spend.

Branch `claude/wiring-low-batch-20261016`, from `921cf306`.

**Not done:**
- nothing was bought, and no provider was called (every test uses a scripted fake);
- no flag, ceiling or model was changed anywhere live;
- nothing was deployed or pushed;
- there is no schema change and no DB change.

Codex's conditions for the wiring (closure of N1–N3) are mapped to evidence in §4.

**Review status (17 October 2026):** after seventeen read-only Codex passes that each held the branch and were each answered (§7), the eighteenth, on `57b17f9a`, is **PASS WITH FINDINGS**: no P0 and no P1, and two P2s, both disclosed (the daily-spend date, §6 item 14; a lock cycle in the engine that predates this branch, §6 item 22). The round lock that pass took on trust is since shown on PostgreSQL itself, with two connections (§6 item 21, §7). Deployment remains Codex's lane, and is not authorized.

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

**Only the outcome moves money (since Codex's sixth pass).** A round's terminal outcome (answered, fallback or held) is written first, under one name, and states what the ledger must hold: the answer's charge, zero, the presumption, or unknown. The ledger is then made to match it by whichever pass reads it, as often as needed, and only a still-pending reservation is ever changed: checked in the write's own transaction (`settle` with `onlyPending`), so a charge another writer held or settled meanwhile is left as it is, and an answer is delivered only on a charge it settled. A pass that decided otherwise from an older read loses the name and moves no money. **A bill the outcome states is counted in full whoever holds the key** (since Codex's sixteenth pass): above an unknown hold another writer made on the batch key, the difference is an unknown row of its own (`<batch key>:above-hold:<digest of the bill>`), so the hold stands as it was made and the ledger never counts less than the record states; a person reconciles the row with the key. A settlement of the key, by whoever made it, is a settlement of its one batch, and is left as it is.

**Never two purchases:**
- The intent is durable before the reservation, and each claim before its create.
- A create that did not answer (timeout, network, 5xx, an unreadable 2xx) is uncertain. It waits out a 15-minute grace.
- After the grace, only a search of the provider's batches decides, newest first, back to the intent. It looks only at batches created from the intent to the grace after the last claim, the one create that may have reached the provider: a batch created later is not a copy, running or not. It reads results only from the documented path built from a checked batch id.
  - **Nothing is ever sent again after a create that may have reached the provider.** At most one create of a round can reach it, so at most one copy of its question can exist; only the provider could make a second.
  - Every batch a search proves to carry the question is kept for good (`found-n`) before anything is decided; a later search that no longer sees it changes nothing.
  - A candidate that has not ended leaves the search undecided, and the round waits, **even when one batch is already proven**: recording that one could release the other's possible charge on the first one's outcome.
  - **A batch a search could not decide is kept by its id** (since Codex's fifteenth pass), as a batch it proved is: one still running, or one whose results it could not read, is recorded with the search (`pending`), and stays pending, whichever of two concurrent searches lands first, until a later search decides it: proves it, reads it without the question, or lists the whole window without it (`cleared`; each search is told which batches to watch). The round's batch is decided only once none is pending, and every finished round, an answered one included, searches on while one is: a copy one search saw running is never forgotten because another search did not see it.
  - One kept copy, with nothing undecided, is recorded as the round's batch.
  - None, after a complete search, presumes the create lost. **Its charge is settled at the most the batch rate could bill** (the batch reservation, as a conservative upper estimate) and never released. The question is then asked synchronously. Negative evidence never releases money and never sends anything.
  - **A presumed-lost round searches once more, a day after the presumption** (24 h 15 min), when any batch its create made has ended (a batch expires 24 hours after it is created; the two clocks may differ by five minutes each way) and is listed; a search that started before then does not count.
  - **Every copy of the question is read for its bill before it may be deleted**, in every finished round: the round's own batch by the outcome that read it, every other copy afterwards (`late-n`). What the provider returned is kept in the record (result type, receipt, model and usage; never the answer), so the evidence outlives the copy.
  - **A batch is read once, and its reading recorded before anything is decided from it** (rule 6, since Codex's eleventh pass): its first reading (`reading-<batch id in hex>`, one compare-and-set name per batch) is the one every decision about that batch comes from, the outcome for the round's own batch and `late-n` for a copy. **A reading binds the bill and the answer** (since the fourteenth pass): the result type, receipt, model and usage, and the answer by its digest (`answerSha256`, of the whole message in canonical form; never the answer itself), so a read that returns another answer, or another stop reason, under the same bill is another reading. **A search records the readings it proved its batches by** (since Codex's twelfth pass): the transport returns each proven batch with the results that proved it, a search that fails on a later read included (since the thirteenth), and they are recorded as that batch's first reading before the batch itself, so a later read that says otherwise can never become the reading decided from. **A batch read is a batch of the round** (since the thirteenth pass), found or not: a search that recorded a batch's reading and stopped before recording the batch has still made it one of the round's, to be decided from, billed and deleted like any other; and since the fourteenth such a reading keeps the round's search unfinished, whatever the last recorded search said, until a later search records the batch with what it finds. A copy is never read from the provider again: its bill comes from its recorded reading on every later pass, so a copy whose bill the ledger refuses costs no provider call again.
    - **Every bill beyond the batch key's is counted before it is recorded** (since the thirteenth pass, the fourth change of principle, extended by the fourteenth): a finished round's copy is counted before its first reading is recorded, and a later read that returned another bill (a provider fault, only a pass that read the batch while another recorded it can make one) is counted under its own key before it is recorded as a `reread`, and never decided from. Another answer under the same bill is a reread too, but no other charge: one bill is counted once. A count the ledger refuses is recorded all the same, so what was read is never lost, and raised; every pass that applies the record counts it again.
    - **The outcome is the first reading's, and a fault holds nothing by itself** (since the thirteenth pass): an unbilled first reading falls back, or holds at zero, whatever a later read says, and is decided from the record without reading the batch again (since the fourteenth); an answer is kept and delivered only from a read that gives it, answer and all. So the one case a fault holds is an answer whose first reading is on record but whose content no pass kept, read otherwise afterwards: it cannot be delivered, and the outcome written is a hold for a person, **at the bill that first reading states** (since the fifteenth pass: `charge: "known"`, priced exactly as the answer's delivery would settle it, and settled in full; unknown only when it cannot be priced). The answer is held; its bill is not.
    - **The record is applied whole**: the done step, before the gate lets anything follow, applies the outcome and counts every other bill on record (each copy's reading, each reread with another bill), and raises if it cannot. Housekeeping applies the outcome first, and reads copies only once it is applied; then it counts the other bills each on its own, so one the ledger refuses never keeps another copy from its bill or its deletion (since the fourteenth pass). The tick keeps a finished round with a reread in view for the same reason.
    - **A copy whose bill is the outcome's own is the outcome's charge** (since the twelfth pass; by bill since the fourteenth): the batch key counts it, so it is neither imported nor recorded as unknown, whatever the key's state, and a person's later settlement of the key stays a settlement.
  - **The batch key stands for the round's own batch only** (since Codex's eighth pass): the one its outcome read, or, for a create presumed lost, the presumption. **Every other copy is a charge of its own row**, whatever the batch key holds and whenever it is read:
    - a priced copy is imported in full by its receipt (`importSettled`: counted once per receipt, even in a held world or above the ceiling);
    - a copy whose bill cannot be stated (a tier with no rate, or an anomaly) is recorded as its own unknown charge at the synchronous reservation (`WorldBudget.recordUnknown`: no capacity needed, recorded in a held world too), and holds the world until a person reconciles that row. The row is bound to exactly what was billed: `<batch key>:copy:<batch id>:<digest>`, the digest of what the provider returned for the question, as `late-n` keeps it, less the answer's digest (since the fifteenth pass: two passes that read one bill with different answers at once count it once), in canonical form (object keys sorted at every depth, so the same values give the same key whatever order they were serialised in; since Codex's ninth and tenth passes). The same bill again is the same row, as a person left it (settled, linked or approved); another bill is another unknown charge, never one already reconciled;
    - a copy of a create presumed lost is counted on top of the presumption: more than was billed, never less;
    - a receipt already counted with other usage is recorded as a ledger conflict, which holds the world.
    Nothing about a copy reads or changes the batch key, so no settlement of it, then or later, by a pass or a person, changes how a copy is counted. The ledger never understates.
  - The round's batch and that presumption are one decision, made once. **It is made by the search that decides, in the slot it records what it found in** (since Codex's sixteenth pass: `found-n` with its `decision`), from the round as that record leaves it. **Every write of a round is serialized** (since the seventeenth pass): it first takes the round's intent row with a write that changes nothing (`lockRound`), so the deciding search builds its record and its decision from the round as it stands inside its own write. Whatever any pass recorded before (a batch, a batch's first reading, a candidate, a decision) is in what the decision sees, and nothing can be recorded between that read and the decision; a create's own record of its batch is written only while nothing is decided, in the same way. Records of earlier revisions decided under one shared compare-and-set name (`submitted`, which `presumed` takes too), and are read the same way; two records of the same decision are that one decision.
  - **A question falls back to its synchronous price only once no batch that could carry it is pending** (since the sixteenth pass): a round whose outcome is a fallback, decided before a search that started earlier named a candidate, waits until its housekeeping decides that candidate, so a copy's bill is counted before the question is bought again.
  - Two copies (which only the provider could make) hold the round at once and for good, with the charge unknown; its search for further copies goes on as housekeeping, so a deleted game's copies are all found and deleted. Copies found beside a presumption already decided are not a hold: the presumption settles, and each copy is read for its bill (below).
  - A search counts only a complete inventory: every list page to its documented end (`has_more`, with a cursor whenever more follow), and every ended batch's results matching that batch's own `request_counts` type by type, each id once. An empty, cut-off or self-contradicting results file is an error, never "not there" and never "unbilled". A search that fails after proving or seeing batches returns them, undecided, saying why (`failed`, since the thirteenth pass), naming the batch whose read failed (since the fifteenth): what it proved and saw is kept, and nothing is decided. Only a search that failed before it saw any batch throws.
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
  - Each game's state is read again just before its rounds are touched, and again before a cancel or a close: a game resumed meanwhile is left to its own slices.
  - A round that never reached the provider (stopped after its intent, or every create refused) ends at zero rather than waiting for a create that a stopped game never makes. The close first takes the claim a create would take, so a worker that resumed the game and claimed it keeps its create.
  - A reservation that commits after such a close read the ledger is never used, since nothing is sent under a closing claim. Its own worker reads the round again right after reserving and goes on to the never-created outcome, which settles it at zero; if that worker stopped first, the game's next slice applies that outcome.
  - Every finished round with housekeeping due (a search, a copy's bill, a deletion) is handled whatever its game's state: a held review parks its job, and a parked job runs no slice. Housekeeping moves no money its outcome did not decide, so it needs no slice.
  - Housekeeping runs in the order the money comes first: the ledger made to match the record (the outcome, and every reread); only once it does are copies read and deleted. A copy bearing the outcome's own reading is never imported at all (rule 6), so it can never become the canonical row of the answer's receipt and leave the answer undeliverable. Then the copies already known (their bills, their deletion where due) and the search for more, in turns: the known copies first one minute and the search first another (by a hash of the round and the minute, given a final mix so that this turn and the copies' order are independent choices), so however slow the provider, neither keeps the other out for good; what a search finds is read and deleted in the same pass when there is room. A search reads only batches the round does not know yet: a known copy is proven already, so one whose results cannot be read keeps no search waiting. A round's copies are read, and deleted, starting from a different copy each minute, chosen by a hash of the round and the minute, so a sweep that comes back to the round only every second or third minute does not meet the same copy first each time; a deletion the provider refuses never stops the others either. A copy whose bill the ledger or the record refuses stays unread, and so undeletable; the others are still read, and the billed ones deleted, before that refusal is raised. Each step of housekeeping (the outcome's ledger effect, the known copies' bills and deletions, the search for further copies) runs whatever failed before it, and every failure is raised at the end, together, so a bill the ledger keeps refusing never stops the search and no failure hides another. One copy that cannot be read, recorded or deleted never keeps the rest waiting for good.
  - An ended batch is read in two calls, not three: the status read carries the batch's result counts, which its results file is checked against.
- No provider call starts unless its whole timeout fits before the deadline of the slice or tick making it. A create is checked again after the ledger's work and after its claim; a claim it had no room to send is recorded as never sent.
- In the sweep, rounds start within the tick's 40-second window, and each round started has its own 95 seconds for its calls, so a slow first read never leaves the next one no room, tick after tick.
- Finished rounds of generating games are deleted by their own slices, or by the tick when the job is parked.
- A held round keeps its batches for the person, **unless its game was deleted**: then they are deleted at the provider too, as they are found, each read for its bill first and each pass recorded (`deleted-n`), while the unknown charge stays held in the ledger. The hold is the ledger's to keep; the imagery is the child's.
- **Failure handling (`80d7de72`):**
  - One game's unreadable record never stops the sweep of the others.
  - A round the slice cannot advance stops the slice with the job's FAILED status and reason, exactly as a failing review does.

### Tests

| Suite | Result |
| --- | --- |
| `quality-batch.test.ts`: real SQLite, ledger, retained store, dual review and world slice, with a scripted provider | **110/110** (21 in `1df2e366`, 2 in `80d7de72`, 6 for Codex's HOLD, 5 for the re-review, 6 for the third pass, 2 for the fourth, 7 for the fifth, 4 for the sixth, 4 for the seventh, 3 for the eighth, 4 for the ninth, 7 for the tenth, 7 for the eleventh, 11 for the twelfth, 4 for the thirteenth, 6 for the fourteenth, 5 for the fifteenth, 7 for the sixteenth, 1 for the seventeenth; 3 rewritten for the fourth, 1 extended for the fifth, 4 for the sixth, 5 for the seventh, 8 for the eighth, 2 for the ninth, 2 for the tenth, 8 for the eleventh, 10 for the twelfth, 3 for the thirteenth, 6 for the fourteenth, 8 for the fifteenth, 8 for the sixteenth and 4 for the seventeenth; 2 of the twelfth's removed with the fault hold they tested) |
| `quality-batch-round.test.ts`: the pure rules | **60/60** (16, plus 5 for the HOLD, 10 for the third pass, 5 for the fourth, 6 for the fifth, 7 for the sixth, 1 for the eighth, 2 for the tenth, 2 for the eleventh, 1 for the twelfth, 1 for the fourteenth, 4 for the fifteenth (two rules and two impossible records) and 1 for the sixteenth, with 2 extended for the twelfth and 1 for the seventeenth; 1 of the tenth's removed with the code it tested, and the twelfth's fault test replaced for the thirteenth) |
| `anthropic-message-batches.test.ts`: the transport on a scripted wire, plus pricing | **17/17** (8, plus 1 for the HOLD, 2 for the re-review, 1 for the third pass, 1 for the fifth, 1 for the sixth, 1 for the eleventh, 1 for the thirteenth and 1 for the fifteenth; the search's assertions extended for the twelfth, to the results it returns, and for the fifteenth, to the batches it names: three to a named, undecided search where a read failed, one to the new fields) |
| `world-budget.test.ts` and `board-wizard-budget.test.ts`: `WorldBudget.link`, `settle` with `onlyPending`, and `recordUnknown` | **51/51 and 5/5**, of which 5 and 2 are this branch's |
| `quality-batch.postgres.test.ts`: the round lock on PostgreSQL, two connections at once, with a scripted provider | **3/3 on PostgreSQL 16.14, three runs in a row** (§7). Runs only with `FINDME_PG_LOCK_URL`, a disposable database on the machine; `npm run check` and CI have none, so there it reports 3 skipped |

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
| Interruption or 5xx: no double purchase, no deletion of an uncertain charge | No create is ever sent twice. A create that did not answer is found by a complete search and recorded, or presumed lost and settled at the most the batch rate could bill; one decision, made once. A copy that turns up later is read for its bill before it is deleted, and counted as a charge of its own, in full beside the presumption; one whose bill cannot be stated holds the world. Uncertain charges are never released: marked unknown, or counted at their maximum. The interruption replays are tested. |
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
- **Codex's third pass: 42/42,** each killed by the test it targets, with the tree restored and verified. 28 from the earlier rounds were run again, re-anchored; 3 were retired with the code they guarded (the hold naming its batches, and the second round's open-hold search). The 14 new:
  - N1: a decision from the latest search instead of every kept copy; the duplicates step removed; a recorded batch beside another found; a round ending unsent after it found a copy; a search left open after a complete one;
  - N2: a close without its claim;
  - the F4 sibling: no game read before a cancel;
  - N3: a cancel without room; a deletion without room; a search's results reads, and its pages, without room; the results file read without room;
  - N4: the sweep skipping a live game's search; housekeeping that never searches.
- **Codex's fourth pass: 49/49,** each killed by the test it targets, with the tree restored and verified. 41 from the earlier rounds were run again, re-anchored, and 1 was retired with the check it guarded (the refusal of a copy found beside a recorded batch, removed by design). The 8 new: a create sent again after a search; a claim after an uncertain create accepted; a presumed-lost create settled at zero; a presumed fallback without its presumption; the presumption under its own name; no room check after the ledger's work; none after the claim; no budget per sweep round.
  - One first survived: the window opening before the records are read. Rounds now start until the window ends, so eight seconds of reading no longer kept them all out. Its test now reads for longer than the whole window, and kills it.
- **Codex's fifth pass: 75/75,** each killed by the test it targets, with the tree restored and verified. All 49 from the earlier rounds were run again, 5 of them re-anchored where the code moved. The 26 new:
  - the late search: never run (end to end, and in the pure rules); run forever; ended by a complete search that started before the day was out; a search that found nothing not recorded; the sweep not selecting it;
  - the late bill: never read; an unread copy deletable; its deletion accepted by the record; a late bill accepted for a round not presumed lost; a copy read twice; no copy due; copies beside a decided presumption held instead of read; a bill above the presumption not held; the ledger conflict not caught; an unpriced bill not held; earlier copies left out of the sum; a copy read without room for both its reads; the sweep not reading a live game's bill; the sweep not selecting a copy due its reading;
  - two reads: the status's counts ignored; the transport's status without counts; the results reading the record again anyway; the record read without room;
  - the reservation after a close: kept pending by its worker; left pending by the next slice.
  - One first survived: a late bill accepted for a round not presumed lost. Its test put the bill on a batch no search had found, which the record refused for that reason alone. The test now uses a found batch, and kills it.
  - The step order changed after the full run (a decided presumption now comes before a hold over copies), so every mutant of the pure rules was run again on the final file: 18/18.
- **Codex's sixth pass: 97/97,** each killed by the test it targets, with the tree restored and verified. 73 from the earlier rounds were run again: 14 re-anchored where the code moved, and 2 retargeted at renamed tests. 2 were retired with the code they guarded: a late bill refused for any round but a presumed-lost one (now allowed for every finished round), and the sweep reading only a live game's bills (now it does the whole housekeeping). The 24 new:
  - only the outcome moves money: the presumption settled before its outcome; the retained store recording a deleted game's charge first; the outcome not applied at the done step; a hold at zero held as unknown instead; the slice applying no outcome; and three records accepted that should be refused (an answer settling another charge than it states, a hold that states no charge, a hold that read another batch);
  - every copy read before it goes: a late bill accepted before the round finished, or for the batch its outcome read; the allowance ignoring the round's own bill, or taken from the reservation; an unknown charge compared; a bill's receipts dropped, a hold's receipts dropped, an unpriced conflict without its receipt, or without its usage;
  - order and window: the window ignored, in the transport and end to end; the window measured from the intent; the search run before the known copies; a found copy left for a later pass;
  - the tick: a live game's housekeeping skipped; a finished round with only deletions due not selected.
  - None survived. One test was made to need two ticks, so that the search alone, with nothing left to read, still brings a parked round back.
- **Codex's seventh pass: 104/104,** each killed by the test it targets, with the tree restored and verified. 93 from the earlier rounds were run again, 5 re-anchored where the code moved. 4 were retired with the shared allowance they guarded (ignoring the round's own bill, taking it from the reservation, comparing an unknown charge, leaving earlier copies out of the sum). The 11 new:
  - every copy taken as the presumption's stand-in; no stand-in at all; extra copies not imported, beside a held answer and beside an answered batch; an unpriced extra copy not held;
  - the hold's search counting found copies only;
  - copies read in the same order every tick; a refused deletion stopping the others;
  - outcomes settled without `onlyPending`; an answer linked on a charge not settled; the ledger ignoring `onlyPending`.
  - None survived.
- **Codex's eighth pass: 121/121,** each killed by the test it targets, with the tree restored and verified. 94 from the earlier rounds were run again: 2 re-anchored where the code moved (the guard now exempts every row but a new reservation; the reads rotate by a hash), and 2 retargeted at a renamed test. 10 were retired with the stand-in and the conflicts they guarded: every copy as the stand-in; no stand-in; a bill above the presumption not held; that conflict not caught; an unpriced late bill not held; extra copies not imported, beside a held answer and beside an answered batch; an unpriced extra not held; a conflict without its receipt, or without its usage. The 27 new:
  - every copy its own row: a priced copy not imported, in six tests (beside a presumption at its full bill; two late copies; beside a held answer; beside an answered batch; after another writer's hold; a day later); the stand-in brought back, after another writer's hold and over a settled presumption; a receipt conflict not caught;
  - an unpriced copy not recorded, alone and beside a held answer; recorded on the batch key; at the batch reservation; without its receipt; one key for every copy;
  - the ledger's `recordUnknown`: needing room; refused in a held world; accepting other terms; taking over a pending reservation; written as pending; the guard capping it; attempt 2's key unmapped;
  - the start: always the first copy; the minute alone, in the pure rule and end to end with the sweep coming back every other minute; changing within a minute; the deletions not rotated.
  - None survived.
- **Codex's ninth pass: 130/130,** each killed by the test it targets, with the tree restored and verified. All 121 from the earlier rounds were run again, 7 of them re-anchored where the code moved (the copy's key, the unknown row's refusals, the reading loop and its room check). The 9 new:
  - the copy's row without its reading, killed by both of Codex's replays (settled at zero; approved to continue) and by the row's key spelled out;
  - `recordUnknown` refusing a linked row, in the ledger and end to end;
  - one refused bill stopping the other copies' reading, or their deletion; its refusal not raised, from the reading or from the deletion.
  - None survived. The test for a key bound to its reading spells the key out (copy id and digest) rather than calling the function under test, so a mutant of that function cannot agree with itself.
- **Codex's tenth pass: 144/144,** each killed by the test it targets, with the tree restored and verified. All 130 from the earlier rounds were run again, 13 of them re-anchored where the code moved (failures now collected in lists; each housekeeping step wrapped; the key's canonical digest). The 14 new:
  - every reading counted: a copy's reading counted only after the record check; a losing pass's reading of the round's own batch not counted, or counted even when the outcome read exactly it; a failure to keep an answer, with no outcome recorded, not raised;
  - the outcome's reading: compared for any batch; an answer compared without its usage; a hold's results not compared;
  - the canonical form unsorted, in the pure rule and end to end; the key hashed without it;
  - housekeeping stopping at the first failure; its failures not raised; a deletion failure replacing the refusal before it; only the first of several failures raised.
  - None survived.
- **Codex's eleventh pass: 154/154,** each killed by the test it targets, with the tree restored and verified. 136 from the earlier rounds were run again, 14 of them re-anchored or retargeted where the code moved (a copy's recorded reading, the phases of housekeeping, the search's known batches, `lateCharge`'s amount). 8 were retired with the code they guarded: the tenth round's counting by a losing pass and its outcome comparison (six), a copy counted before the record check, and a found copy left for a later pass, which the turns now make a matter of a minute, not of correctness. The 18 new:
  - rule 6: the outcome decided from another reading; no hold on a reread before any outcome; a reread not detected; not counted at once; not recorded; not counted when the record is applied; its round out of the tick's view; a copy read again from the provider; the answer's usage not in canonical order;
  - copies read before the ledger matches the record;
  - the search never first; the search without the known batches, in the service and in the transport;
  - the pure rules: a reading's name not in hex; a reading of a batch the round does not know; a reread equal to the reading; a reread without a reading; a late bill other than the recorded reading.
  - One first survived: a copy read again from the provider. Its test stopped ticking once the further copy was deleted, so whether the refused copy came up again depended on the clock. It now runs all twelve ticks, and kills it.
- **Codex's twelfth pass: 175/175,** each killed by the test it targets, with the tree restored and verified. 151 from the earlier rounds were run again, 17 of them re-anchored where the code moved (the search's results in the transport, the done step's whole record, the tick's selection, `lateCharge`'s guard on the outcome's own reading, the hash's final mix, a held round's search). 3 were retired with the code they guarded: the hold `reconcile` wrote itself (now the `fault` step's), the reread counted inside `noteReading`, and the refusal of a reading of a batch the round does not know yet (a search now records the reading first). The 24 new:
  - a search's readings dropped by the service, or not returned by the transport;
  - the `fault` step: removed, in the pure rules and end to end; taken only by a round without a batch of its own, both ways; holding by no batch, both ways; its hold without the first reading; not taken after a search that recorded a reread; a batch the record read left unkept; a hold made mid-search searching on only over two copies, both ways;
  - the tick skipping a live game's faulted round, or not selecting it;
  - the done step applying the outcome alone;
  - a finished round's reread not counted where it is recorded, by its copies' reads or by its searches;
  - a copy bearing the outcome's own reading imported, or recorded as unknown; every copy taken for the outcome's;
  - the hash without its final mix, in the pure rule and end to end;
  - a reading accepted twice.
  - One first survived: the presumption under its own name. Its test injects a race at a fixed read of the round, and a search now reads the round once more before it records its batches, so the race fired one read early and no presumption was ever tried. It now fires one read later, and kills it. The full run was made before the two holds mid-search were closed (§7, the twelfth section's last findings). After the first, the 38 mutants of rounds 11 and 12, with the survivor and its new mutant, were run again: 38/38. After the second, the 33 mutants of the searches and the holds, the two new ones among them: 33/33.
- **Codex's thirteenth pass: 172/172,** each killed by the test it targets, with the tree restored and verified. 160 from the earlier rounds were run again, 12 of them re-anchored where the code moved (the search's waiting reasons, the transport's partial return, the decision by the round's batches, a round that read a copy never ending unsent, the outcome decided from the recorded reading, the tick's selection, a held round's search back to two known batches). 15 were retired with the code they guarded: the `fault` step and its hold (seven), the search's fault not held, the tick's pass over a live game's faulted round (two), the immediate counts in a copy's read and in a finished round's search (now inside `noteReading`, before the record; two), the keeping of unkept batches, and the twelfth follow-up's search rule (two). The 12 new:
  - another reading counted after its record; a refused count's reread not recorded, or not raised;
  - an answer read otherwise falling back instead of held; the outcome decided from the current read, end to end on the real transport;
  - the transport throwing away what it proved, in its test and end to end;
  - readings left out of the round's batches, in the pure rules and end to end; the search deciding by found ids; a round that read a copy ending unsent;
  - an undetected anomaly, against its money effect.
  - One first survived: an undetected anomaly. Since the outcome is now decided from the recorded reading, its test's hold came about with or without the anomaly, so the test asserted nothing the mutant changed. It now asserts the reread on record and the hold's reason, and kills it; a second entry kills it by its money effect (the priced reading left uncounted before the gate).
- **Codex's fourteenth pass: 181/181,** each killed by the test it targets, with the tree restored and verified. All 172 from the earlier rounds were run again, 10 of them re-anchored where the code moved (the anomaly's test and the reread's count in `noteReading`, the reread and copy counts now in `countBills`, the copy-of-the-outcome check by bill, the held round's search, and the outcome's application in housekeeping), and 1 was retired as equivalent: the search deciding by found ids, which since the adoption of unrecorded readings are the round's batches. The 10 new:
  - a finished round's copy not counted before its first reading; the gate not counting copies' bills; the copies' counts gating the other copies' reads;
  - the answer's digest dropped from a reading; a reread under the same bill counted as another charge;
  - a batch read and never recorded leaving the search complete, in the pure rules and end to end; such a batch not recorded by the next search; a held round searching only over two known batches;
  - an unbilled reading on record polled again.
  - Two first survived: a refused bill stopping the other copies' reads, because the count now comes before the reading, so the refusal no longer reached the line it guards; and readings left out of the round's batches, because the next search's adoption reached the same end. The first's test now runs a second pass in which the refused copy, its reading on record, comes first and a third copy must still be read; the second's test now asserts that the next search is told the batch is known, so it is never read again. Both are killed, with the mutants sharing their tests run again: 6/6.
- **Codex's fifteenth pass: 204/204,** each killed by the test it targets, with the tree restored and verified, in one full run with no survivor. 180 from the earlier rounds were run again, 20 of them re-anchored where the code moved (the search's waiting reasons, the transport's returns, the held round's search rule, the copy key, the undeliverable answer's hold, the sets each search is given, a search's record, an unfinished search and the adoption of unrecorded readings), and 1 was retired as equivalent: an unrecorded reading left out of the held rule's completeness, end to end, since every finished round with an unrecorded reading now searches by a rule of its own (its pure-rule twin still runs). The 24 new:
  - an undeliverable answer held as unknown; the known hold not applied to the ledger; a known hold without its bill or its batch accepted by the record;
  - a search's undecided batches not recorded; ignored by the round, in the pure rules and end to end; kept pending once proven; ignored by the search's completeness; clearing ignored, in the pure rules and end to end; clearing not recorded; the batches to watch not passed, by housekeeping and by the find step; the find step deciding its batch with a candidate pending; finished rounds not searching for pending batches, in the pure rules and end to end, or for unrecorded readings;
  - the transport leaving running or unreadable batches unnamed, clearing a batch it was not watching, clearing one it listed, clearing on a cut-off listing, and swallowing a failure before it saw any batch;
  - a copy's unknown row keyed with the answer's digest.
- **Codex's sixteenth pass: 214/214,** each killed by the test it targets, with the tree restored and verified. 204 from the earlier rounds were run again, 10 of them re-anchored where the code moved (the decision now in the search's record, by its completeness, by what is pending and by the round's batches; the record a search writes; the outcome's application and the slice's keys; the zero hold and the known bill), and 1 was retired as equivalent: the presumption's shared name, since no code writes a `presumed` event any more (a search records its decision in its own slot, and the record refuses two decisions in either form). The 11 new:
  - the row above another writer's hold not written, written at the whole bill, or written over a settled key; a slice not applying the record to a key it reads as unknown; a `37149e36` hold over a priceable answer applied at the reservation;
  - a decision on a round already decided; a decision while a batch is pending, in the slot test; a fallback asked synchronously while a batch is pending;
  - the record ignoring a search's decision, accepting one from an incomplete search, or one of a batch the round never found.
  - Three first survived. The decision without its search's completeness: a running candidate is now named, so the test of one batch proven beside another still running holds without it; it is killed by a new test, a search cut short (one that did not reach back to the intent names nothing it did not see), which proves a batch and must decide nothing. The presumption settling before its outcome: since the presumption is decided in its search's slot, the stale hold in its test landed before the presumption step ran; the hold now lands between that step's read and its write, and kills it. And the presumption's shared name, retired as above. The two were run again on the final code: 2/2.
- **Codex's seventeenth pass: 218/218,** each killed by the test it targets, in one full run with no survivor, with the tree restored and verified. All 214 from the earlier rounds were run again, 1 re-anchored (a search's record built inside its write). The 4 new: the decision read from the round before its write, against Codex's schedule and against the slot test; two records of one decision refused; two that differ accepted. Two changes have no mutant here, by design: the lock itself (SQLite, which the tests run on, serializes its writers by itself, so no test here can tell a write that takes the lock from one that does not; §6 item 21), and a create's check that nothing is decided (a create never writes after a search could decide).

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

**The full suite on the third round:**
- tsc is clean.
- Vitest: 5,131 passed, 2 expected failures, 55 skipped, **2 failed**: the same two load timeouts in `local-patch-incremental-review.test.ts`. Alone, on this code, that file passes 79/79.

**The full suite on the fourth round:**
- tsc is clean.
- Vitest: 5,137 passed, 2 expected failures, 55 skipped, **3 failed**, all in `local-patch-incremental-review.test.ts` under full-suite load: the same two 20-second timeouts, and a Prisma interactive transaction that timed out ("Transaction not found") in the painting code, which this branch does not change. Alone, on this code, that file passes 79/79.

**The full suite on the fifth round:**
- tsc is clean.
- Vitest: 5,153 passed, 2 expected failures, 55 skipped, **1 failed**: "retries malformed anatomy evidence…" in `local-patch-incremental-review.test.ts`, one of the same two 20-second timeouts under full-suite load. Alone, on this code, that file passes 79/79.

**The full suite on the sixth round:**
- tsc is clean.
- Vitest: 5,165 passed, 2 expected failures, 55 skipped, **1 failed**: the same "retries malformed anatomy evidence…" 20-second timeout under full-suite load. Alone, on this code, that file passes 79/79.

**The full suite on the seventh round:**
- tsc is clean.
- Vitest: 5,169 passed, 2 expected failures, 55 skipped, **2 failed**: the same two 20-second timeouts in `local-patch-incremental-review.test.ts` under full-suite load. Alone, on this code, that file passes 79/79.

**The full suite on the eighth round:**
- tsc is clean.
- Vitest: 5,173 passed, 2 expected failures, 55 skipped, **4 failed**, all timeouts under full-suite load in files this branch does not change: the same two 20-second timeouts in `local-patch-incremental-review.test.ts`, and two `production-bootstrap.test.ts` cases whose child process hit its limit (`spawnSync … ETIMEDOUT`), the pair that also timed out in the re-review round. Alone, on this code, the two files pass 96/96 (79 and 17).

**The full suite on the ninth round:**
- tsc is clean.
- Vitest: 5,178 passed, 2 expected failures, 55 skipped, **3 failed**: 20-second timeouts in `local-patch-incremental-review.test.ts` under full-suite load, the same two as before and a third test in that file. This branch does not change that file. Alone, on this code, it passes 79/79.

**The full suite on the tenth round:**
- tsc is clean.
- Vitest: 5,185 passed, 2 expected failures, 55 skipped, **5 failed**, all 20-second timeouts in `local-patch-incremental-review.test.ts` under full-suite load (the machine was slower this run: that file alone took 629 s against 483 s before). This branch does not change that file. Alone, on this code, it passes 79/79.

**The full suite on the eleventh round:**
- tsc is clean.
- Vitest: 5,195 passed, 2 expected failures, 55 skipped, **4 failed**, all timeouts under full-suite load in files this branch does not change: two in `local-patch-incremental-review.test.ts` (20 s) and two in `production-bootstrap.test.ts` (`spawnSync … ETIMEDOUT`). Alone, on this code, the two files pass 96/96.

**The full suite on the twelfth round:**
- tsc is clean.
- On `6b0654fa`: 5,209 passed, 2 expected failures, 55 skipped, **2 failed**: the same two 20-second timeouts in `local-patch-incremental-review.test.ts` under full-suite load.
- With the follow-up: 5,208 passed, 2 expected failures, 55 skipped, **3 failed**, all 20-second timeouts in that same file under full-suite load (the same two, and a third, as in the ninth round).
- This branch does not change that file. Alone, on each of the two trees, it passes 79/79.

**The full suite on the thirteenth round:**
- tsc is clean.
- Vitest: 5,211 passed, 2 expected failures, 55 skipped, **3 failed**, all 20-second timeouts in `local-patch-incremental-review.test.ts` under full-suite load, the same three as on the twelfth round's follow-up. This branch does not change that file. Alone, on this code, it passes 79/79.

**The full suite on the fourteenth round:**
- tsc is clean.
- Vitest: 5,218 passed, 2 expected failures, 55 skipped, **3 failed**: the same three 20-second timeouts in `local-patch-incremental-review.test.ts` under full-suite load. This branch does not change that file. Alone, on this code, it passes 79/79.

**The full suite on the fifteenth round:**
- tsc is clean.
- Vitest: 5,227 passed, 2 expected failures, 55 skipped, **4 failed**, all under full-suite load in files this branch does not change: the same three 20-second timeouts in `local-patch-incremental-review.test.ts`, and one `FriendPlay.test.tsx` case whose dialog had not yet closed when it looked. Alone, on this code, the two files pass 98/98 (79 and 19).

**The full suite on the sixteenth round:**
- tsc is clean.
- Vitest: 5,235 passed, 2 expected failures, 55 skipped, **4 failed**, all under full-suite load in files this branch does not change: two 20-second timeouts in `local-patch-incremental-review.test.ts`, and two `production-bootstrap.test.ts` cases whose child process hit its limit (`spawnSync … ETIMEDOUT`), as in the re-review, eighth and eleventh rounds. Alone, on this code, the two files pass 96/96 (79 and 17).

**The full suite on the seventeenth round:**
- tsc is clean.
- Vitest: 5,238 passed, 2 expected failures, 55 skipped, **2 failed**: the same two 20-second timeouts in `local-patch-incremental-review.test.ts` under full-suite load. This branch does not change that file. Alone, on this code, it passes 79/79.

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
| `e086b10c` | fix(qa): the batch channel after Codex's re-review (F1-F5) |
| `dd26cc03` | fix(qa): the batch channel's records hold under time and concurrency (Codex's third pass) |
| `454a233d` | fix(qa): the batch channel never sends twice and never releases on absence (Codex's fourth pass) |
| `9bf6aa17` | fix(qa): the batch channel reads a late copy's bill before deleting it (Codex's fifth pass) |
| `19131d6d` | fix(qa): only a batch round's outcome moves money, and every copy is read before it goes (Codex's sixth pass) |
| `f993b3a7` | fix(qa): a batch round's key stands for one batch, and every other copy is a charge of its own (Codex's seventh pass) |
| `98a52e29` | fix(qa): every copy beyond a batch round's own is a ledger row of its own, with no stand-in (Codex's eighth pass) |
| `1140ce2b` | fix(qa): a batch copy's unknown row is bound to its reading, and one refused bill never holds up the others (Codex's ninth pass) |
| `198f32b0` | fix(qa): every reading of a batch is counted, and one failure never stops the rest of housekeeping (Codex's tenth pass) |
| `d407538c` | fix(qa): a batch is read once, its reading recorded before anything is decided from it (Codex's eleventh pass) |
| `6b0654fa` | fix(qa): a search keeps the reading it proved a batch by, and a fault holds an open round by its next step (Codex's twelfth pass) |
| `8c0623d2` | fix(qa): a hold made while a search was undecided searches on (Codex's twelfth pass, a follow-up found while answering; reverted in the thirteenth) |
| `e878f0b7` | fix(qa): another reading is counted before it is recorded, and the outcome is always the first reading's (Codex's thirteenth pass) |
| `37149e36` | fix(qa): every bill beyond the batch key's is counted before it is recorded, and a reading binds its answer (Codex's fourteenth pass) |
| `da3bcfa6` | fix(qa): a held answer's bill is counted in full, and what a search could not decide is kept by its id (Codex's fifteenth pass) |
| `4e57f87d` | fix(qa): a bill is counted in full above another writer's hold, and the round's batch is decided in its search's slot (Codex's sixteenth pass) |
| `57b17f9a` | fix(qa): a round's writes are serialized, and its decision is built inside its own write (Codex's seventeenth pass) |
| `5ae2b312` | docs(qa): Codex's eighteenth pass, PASS WITH FINDINGS |
| the commit carrying this section | test(qa): the round lock on PostgreSQL, two connections at once |

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
8. **The sweep reads every game's round record each minute** to find the rounds with work, in two queries with no deadline of their own (its provider window opens only after them). Fine at QA's size; at scale it would want a cursor or an index (a schema change).
9. **Batch ids.** Anthropic's reference says "The format and length of IDs may change over time." The transport accepts only `msgbatch_` followed by letters and digits. A new format fails closed: every create becomes uncertain and every batched question waits, so a deployment would show it at once, but it would stall the channel until the pattern is widened.
10. **A dedicated Anthropic workspace (Codex F6).** A search after a lost create reads every batch the API key's workspace created after the round's intent, newest first, up to 20 pages of 1,000, and only while the request has time left. Beyond that it stays undecided, and so does the round: nothing is created or released, and the waiting reason says why. Codex accepted this for the QA channel. A workspace used only by this channel keeps the search to this product's own batches, but does not guarantee the limit: at 27 batches per world, 741 worlds already make 20,000. Making the search resumable across passes is the fix before that volume.
11. **A provider answer that contradicts itself** (Codex F1) leaves its round waiting, with the charge pending, until a person looks. The stalled-generation alert reports the game.
12. **Accepted residuals of "never send twice" (Codex's fourth pass).**
    - A create presumed lost that in fact made its batch costs twice: the batch, counted at its maximum, and the synchronous question. Only a create whose answer was lost and whose batch no complete search found after 15 minutes can do this.
    - Copies the provider itself might make of one request: every copy a search finds is read for its bill before deletion, and since the eighth pass each one beyond the round's own batch is counted as a charge of its own row, a presumed-lost create's copies included. A search runs only after a create that did not answer (or while a hold searches), so a copy the provider made of a create that answered normally is never seen: a client cannot stop a provider from billing twice for one request.
    - A search that proves a copy and then fails on a later read keeps that proof (since the thirteenth pass), and names the batch it could not read (since the fifteenth).
    - The presumption counts the most a batch can be billed at Anthropic's documented batch rate (half of standard), which is what the batch reservation covers. Since the fifth pass, every copy a search finds, then or a day later, is read for its bill, and since the eighth it is counted in full beside the presumption (§7). What remains: a batch the provider never lists, even a day later, is never read, so if the standard tier served it, it is under-counted by up to half its standard price.
13. **Residuals of the fifth pass.**
    - A late copy whose results cannot be read stays undeleted and unread, and is tried again each tick. Anthropic keeps results for 29 days, against the read a day after the presumption.
    - A copy whose bill cannot be stated, or a receipt counted with other usage, holds the world even when its game is already READY. Nothing else is bought for that world; a person reconciles it.
    - A reservation left by a worker that stopped right after reserving, after a close, is settled at the game's next slice. A game that never runs another slice keeps it pending: capacity reserved in a world that buys nothing more, with nothing spent. The same holds for any outcome whose ledger step a stopped worker left undone, in a round with nothing else to do.
    - The search for a presumed-lost round's copy a day later is subject to F6: in a workspace with more than 20 pages of newer batches it stays undecided and runs again each tick. Newer batches no longer keep it undecided themselves (sixth pass): only those created inside the round's window are candidates.
    - The window assumes, as the grace always did, that a create's batch exists within 15 minutes of its claim. A batch the provider created later would not be found, and its bill would not be read.
14. **Residuals of the eighth pass.**
    - **Daily spend dates an imported copy's bill by its world ledger's last update (Codex's P2-5, not fixed).** The ledger has no date per charge; the daily ceiling dates a bill by its retained purchase, and an imported copy has none, so it falls back to the ledger's `updatedAt`, exactly as imported identity bills already do. An old copy's bill is then counted again on any later day the same world's ledger changes. The world's own total counts each receipt once; only the daily attribution moves, and only upward, so the daily guard can pause work early, never let it overspend. At E5's size (16,665 tokens in, 1,842 out), a copy is about 5.2¢ at the batch rate, or 10.4¢ if the standard tier served it. A copy whose bill cannot be stated is an unknown row, counted every day until a person reconciles it, by design. The fix needs a per-charge date: a dated ledger row (a format change), a dated companion record, or reading each copy's `late-n` event, which would add a scan of `AuditLog` (no index on `action`) to every daily check. Proposed for the deployment review, together with the identity imports. Codex's ninth pass reproduced it (a 9,000 micro-USD bill from the day before counted nothing toward the day until an unrelated ledger write that day, then 0.9¢) and found the disclosure accurate.
    - A copy of a create presumed lost is counted on top of the presumption, which already counts the most that create's batch could cost. A found copy can therefore be counted twice in part: more, never less.
    - After a presumption in a world already held, the synchronous question is refused (`world_held`) and the review stops with that error, as any purchase in a held world does, until a person reconciles the held charge.
15. **Residuals of the eleventh pass (rule 6).**
    - Since the thirteenth pass a provider that answers one batch differently on two reads holds the round only when the first reading is an answer whose content no pass kept (the pass that read it stopped before keeping it, or a search read it): that answer cannot be delivered, and waits for a person. Otherwise the first reading decides, and the other reading is counted beside it. Only two reads of the same batch that disagree can cause either: two passes at once, or the search that proved the batch and the poll after it.
    - A round with a reread on record is kept in the tick's view for good, so its counts are re-applied every minute (idempotently: no new money). Rereads are provider faults, so these rounds should be rare.
    - Outcomes still wait for the ledger: while the outcome's application keeps failing, the round's copies are neither read nor deleted, and the failure is raised on every pass for a person.
16. **Residuals of the twelfth pass.**
    - A transport that proves a batch without returning its results leaves that batch's first reading to the next read of it. The real transport always returns them; the interface keeps them optional only for scripted providers. With the real transport, every copy a round knows was found by a search, which recorded its reading, so its bill needs no provider call: the copy-read path (its rotation, room checks and turns between the known copies and the search) now serves only a copy known without a reading. Its tests keep that path working with a scripted search that keeps no readings.
17. **Residuals of the thirteenth pass.**
    - A pass that stops between counting a bill and recording its reading leaves the charge in the ledger with nothing on record: more, never less. The ledger row (an import by its receipt, or an unknown row named after the copy and its digest) names what was read.
    - A bill whose count the ledger refuses is recorded and raised. Until a later pass counts it (the done step, housekeeping, the tick), capacity can be admitted ahead of it, as for any bill the ledger refuses; the slice that hit the refusal fails meanwhile.
    - The record and the ledger cannot commit together: the ledger is a compare-and-swap snapshot of its own, outside the round's transaction. Counting first is what makes "nothing on record is uncounted" hold without it; a charge counted just after a reservation another pass made is an ordinary late bill, which the ceiling then holds the world over.
    - A copy's other reading that happens to be the outcome's own bill, counted before that outcome was recorded, is imported; the outcome's settlement then links to it, and the answer waits for a person. Only a provider that returned one message for two batches could make it.
18. **Residuals of the fourteenth pass.**
    - **What "counted before it is recorded" covers.** A finished round's copies and every reread are counted before they are recorded. An open round's readings are not: until the round decides, a batch it read may still turn out to be its own batch, which the batch key's reservation counts at the batch rate. Its copies are counted when the round decides, by the step that applies the outcome, before anything follows from it. Meanwhile another question of the same world can be admitted ahead of a second copy, or ahead of the part of a reading above the batch rate (a standard-tier answer, at most the reservation again). Both are counted in full when the round decides, and the ceiling then holds the world over them.
    - A pass that read the round as open, and recorded a copy's first reading after another pass's outcome made it a copy, leaves that copy's bill to the next application of the record, a moment later: a gate in that moment can admit capacity ahead of it, by at most one copy's bill.
    - A held round searches whenever its latest recorded search was unfinished (restored from `8c0623d2`, so a record that commit could write keeps its behaviour). An open round's complete search that finds nothing new is not recorded, so a round held after such a search can search once more than it needs to: one more read of the provider's list, which creates and releases nothing.
    - Records written by the branch's intermediate commits exist only in tests: nothing on this branch was ever deployed. Their readings carry no answer digest, so a read of their batch with the same bill reads as another reading, which holds an answer for a person rather than delivering it: conservative.
19. **Residuals of the fifteenth pass.**
    - **What clears a pending batch.** A read without the question, or a listing of the whole window, back to the intent, that no longer shows it. A provider list that showed a batch running and later leaves it out of such a listing while it still exists clears it: the same trust in the provider's list as item 12's last point.
    - **A batch whose results never match its own record** stays pending. An open round waits on it, as item 11 already says of the round's own batch; a finished round searches every tick until the provider answers it consistently, a list read and that batch's reads each time, creating and releasing nothing.
    - **A held answer whose bill is known** holds the world only as an overrun: a bill within the reservation is settled, and the round's hold parks the job (`NEEDS_RELEASE`) for a person, as every hold does. Nothing more is bought for the game meanwhile. Such a bill usually has no retained purchase (no pass kept its answer), so the daily spend dates it by its ledger's last update, as item 14 says of imported copy bills: counted on the day it is settled, and again on any later day that ledger changes. Before, held as unknown, it was counted as a reservation every day.
    - **Rounds decided while a concurrent search named a candidate** (two passes searching at once after a lost create) search on after their outcome, answered ones included, until the candidate is decided: one search per tick or slice, for at most as long as the candidate runs (a batch ends within 24 hours).
    - **Size.** A `found` event names every batch in the window its search could not decide, each once: in a workspace busy with other questions, a few dozen ids.
    - **Records of the fourteenth round's commit** keyed a copy's unknown row with the answer's digest. They exist only in tests; counting such a record's copies again under the bill's key would add one row per copy: more, never less.
20. **Residuals of the sixteenth pass.**
    - **A decision is made on the record as it stands.** The deciding search reads the round in the slot it writes, so nothing recorded before its decision goes unseen. A candidate that a search started before the decision names only after it (a provider list that showed it to that search and not to the deciding one) is a later copy: watched, billed and deleted by the round's housekeeping like any copy, and a fallback waits for it before the question is asked synchronously. An answered round delivers its answer meanwhile, as it would beside any copy found after it.
    - **A row above another writer's hold** waits for a person with the key: one who settles the key and not the row leaves it counted and unknown, which holds the world: more, never less, until both are reconciled. A key settled by a person stands as their settlement of its one batch, whatever amount they chose.
    - **A fallback whose pending candidate is never decided** (a provider that never answers that batch consistently, item 19) waits for good: its board's review stays pending and the game stalls, as an open round already does on such a batch (item 11).
    - Records of the fifteenth round's commit decided by a `submitted` or `presumed` event after the search's own record; they are read as before.
21. **Residuals of the seventeenth pass.**
    - **The round's lock** is a write to its intent row that changes no stored value (the database still writes the row). On Postgres it holds that row until the write commits, so the writes of one round wait for each other (a few milliseconds each); a write of another round is not held by it, though fenced writes also take the game's and the job's rows, as they always did. The suite runs on SQLite, which serializes all of its writers by itself, so it shows the decision built inside its own write, not the lock's own effect. That effect is shown on PostgreSQL 16.14 by `quality-batch.postgres.test.ts` (§7): on two connections, the second write of a round waits on the first's transaction, gets the intent row only once the first commits, and decides from what the first committed; without the lock it does not wait, and records "presumed lost" beside the batch's reading. That test needs a disposable local database, so CI does not run it.
    - **Two records of one decision** are read as that decision. Two that differ (a `presumed` beside a `submitted`, or two batches) make the record unreadable, and the round waits for a person; only writers of earlier revisions, which take no lock, could make them, and none ever ran outside tests.
    - A create's record of its batch is skipped when the round's batch is already decided. A create answers within its 90-second timeout, long before the 15-minute grace lets any search decide, so this never happens; if it did, its batch would be a copy, found, billed and deleted like any other.
22. **Found outside this branch (Codex's eighteenth pass, P2).** The local-patch worker's own fence takes the job's row and then the game's (`local-patch-world.ts`, for example on the way to `parkExhausted`), while deletion takes the game's row and then the job's (`local-patch-deletion.ts`). On Postgres the two can wait for each other; the database then aborts one of them, which fails and is tried again, and nothing is half committed. It predates this branch (Codex checked the parent versions), and the batch channel's lock adds no new order: the round's intent row is always taken first, and nothing else takes it. Fixed separately, in the engine rather than here: `d0720081` on `claude/game-job-lock-order-20261017`, outside this branch and its release.

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

**F4's remaining window.** See the third round below: the read is now repeated before the cancel itself.

### Codex's third pass on `e086b10c`: HOLD, and the third round

Codex closed F1 (it ran 605 two-line type and count combinations with no wrong acceptance or refusal) and accepted F6's disposition as "an acceptable disclosed QA liveness limitation". It found that the second round's fixes held in their own reproductions but not in sibling paths, all of them about time and concurrency:

| # | Finding | Fix | Regression test |
| --- | --- | --- | --- |
| N1 (P1) | The open duplicate search kept only the ledger hold, not the copies it had proven. A later search that saw fewer copies (one deleted by someone else) could fall back and settle at zero, answer and link, or close as never created. | Every batch a search proves to carry the question is kept for good (`found-n` events) before anything is decided. Two kept copies hold the round at once and for good. One kept copy is the round's batch even when a later search no longer sees it, so it is never "proven absent". | A copy that vanishes from the list after it was proven: nothing is created again and nothing is released. The pure rules: two copies hold, and a later empty search changes nothing. |
| N2 (P1) | The sweep's "never created" close could race a resumed worker's create, and settle the reservation at zero while that create was in flight. | A close first takes the claim the create would take (`claim-n`, marked closing). A worker that claimed it first keeps its create, and the close stands down; a worker that comes second is refused its claim. The game is also read again just before a close. | Codex's interleaving: a worker's claim lands right after the sweep read the round; the close stands down, the reservation stays, and the round goes on. |
| F4, again | A game resumed while the sweep waited on a slow status read could still have its batch cancelled. | The game is read again after the status and before the cancel. | The game resumes during the status read: its batch runs on. |
| N3 (P2) | The deadline admitted a round, but did not bound the calls after it: a search could make every list and results read, 30 s each, past the tick's limit. | No provider call starts unless its whole timeout fits before the deadline: each page and results read of a search, both reads of `results()`, the cancel, and each deletion. A search out of time is undecided and says so. | Codex's case on the real transport (ten ended batches, 29 s per answer): every read starts with 30 s to spare, and then the search stops. A slow status leaves the cancel to the next tick. Slow deletions spread over ticks, each recorded (`deleted-n`). |
| N4 (P2) | A held review parks its job while the game stays TARGETS_GENERATING, so neither a slice nor the sweep went on searching for further copies. | The duplicate hold is terminal at once, and its search for further copies is housekeeping: the slices do it, and the sweep does it for every game, generating or not. It only reads the provider and records what it finds. | A live game whose job is parked: the sweep finds the third copy, and nothing is deleted (a live game's copies stay for the person), bought or released. |

**The record format changed again, before any deployment.** `found-n` events keep the copies; `deleted-n` events record each pass's deletions (a round can be cleaned over several passes); a claim may be `closing`; `held` no longer names batches.

**The windows that remain.** A game resumed after the last read and before the close's claim is safe: the claim decides, and the worst case is that a resumed game's question falls back to the synchronous price. A game resumed after the last read and before a cancel costs the same fallback, never money that is not counted.

### Codex's fourth pass on `dd26cc03`: HOLD, and a change of principle

Codex confirmed that the same-name claim now excludes competing creates on every create path, that a close interrupted after its claim finishes without creating, that concurrent `found-n` and `deleted-n` writers keep the union, and that a live game's sweep only searches. It then found four P1 and two P2 findings, all about decisions taken from a negative search or a stale read:

| # | Finding | Answer | Regression test |
| --- | --- | --- | --- |
| P1 | A stale negative search could close the round and settle its reservation at zero after another pass had recorded a copy. | **Negative evidence never releases money.** A complete search that finds nothing presumes the create lost and settles its charge at the most it could be (the reservation, as a conservative upper estimate). The zero settlement remains only for rounds no create ever reached (nothing claimed, or every create refused outright), which never search. | A lost create no search finds: settled at its reservation, never at zero, with one create in all; the question is asked synchronously. |
| P1 | A stale recovery pass could create again after another pass had made the round terminal `held`. | **Nothing is ever sent again after a create that may have reached the provider.** The round only searches; the step that created after a negative search is gone, and the record refuses a claim after an uncertain create. | The same lost create: `["create", "find"]` and nothing more. The pure rules: no create step after an uncertain claim, and such a record refused. |
| P1 | A search that proved a copy and then failed on a later read lost that proof. | Harmless now: losing a proof can only lead to the presumption, which counts the maximum and releases nothing. The proof gathered before the error is still not kept (§6). | Covered by the two above. |
| P1 | A late search proving a second copy could make a round that had already recorded its batch unreadable. | With one create, a second copy can only come from the provider. The record no longer refuses a copy found beside the recorded batch: it holds an undecided round, and keeps a decided one readable, with every copy in its deletions. The round's batch and the presumption are one decision under one compare-and-set name. | A stale negative search loses the decision to a pass that recorded the batch right after its last read: no presumption, nothing counted as lost, the round readable. |
| P2 | The fixed sweep window starved a round whose first read was slow (a 29-second status left no room for the cancel, tick after tick). | Rounds start within the window; each started round has its own 95 seconds for its calls (three reads of up to 30 seconds), always inside the tick's deadline. | A status slow on every tick: the cancel follows in the same tick, each call started with room for its timeout. Four slow deletions: three in one round, the fourth on the next tick. |
| P2 | A create's room was checked before the ledger's work and the claim, not at dispatch. | Room for the whole 90-second create is checked again after the ledger's work and after the claim. A claim with no room left is recorded as never sent (`refused`, `not-sent`), so the next pass may claim again. | Codex's probe (101 seconds, 11 of them in the ledger): nothing claimed or sent. An 11-second claim write: claimed, recorded as never sent, nothing created. |

### Codex's fifth pass on `454a233d`: HOLD, and the fifth round

Codex confirmed the change of principle in every path it traced: recovery never calls `create`, a later create needs a recorded refusal of the one before it, the record refuses a claim after an uncertain create, and no negative search settles a possibly sent create at zero. The shared `submitted`/`presumed` name excludes both decisions taking effect. It found two P1 and two P2 findings, about what happens after the presumption and at the edges of a sweep round:

| # | Finding | Fix | Regression test |
| --- | --- | --- | --- |
| P1 | A presumed-lost round stopped searching, so a batch the provider listed later escaped deletion with its game. | A presumed-lost round searches once more a day after the presumption, until a complete search started after then is recorded. The sweep includes such rounds for every game. | Codex's case: the batch is not listed after the grace, then is, and the game is deleted. Nothing looks for it before the day is out; then it is found, read and deleted, and never searched again. A search that finds nothing ends it too. |
| P1 | The presumption is not an upper bound for every tier the branch prices, and a losing search could read a larger bill that housekeeping then deleted unrecorded. | A copy of a presumed-lost round is read for its bill before it may be deleted; the record refuses its deletion first. The copies read must fit in the presumption together. A bill above it, or one that cannot be stated, is recorded beside it as a ledger conflict at its full amount (the synchronous reservation when unpriced), which holds the world. | Codex's interleaving and numbers: the presumption wins, the losing search's copy was served by the standard tier at 134,000 micro-USD against 125,000. Its bill is read, the conflict recorded, the world held, and only then the copy deleted. Also an unpriced late copy, and two copies within the presumption each but above it together. |
| P2 | An ended batch took three reads (status, the record again inside `results`, the results file), and eight seconds of database time left the third no room, tick after tick. | `status` returns the ended batch's result counts, and `results` takes them, so an ended batch is two reads. | Codex's case on the real transport: an eight-second round read and 29 seconds per call; the round is settled in one sweep, with the status and the file as the only calls. |
| P2 | A reservation could commit after an unsent close had read the ledger, and stay pending for good. | The creating worker reads the round again right after reserving; a closing claim means nothing will be sent, so it settles its reservation at zero. A worker that stopped before that leaves it to the game's next slice, which settles it. | Codex's interleaving: the close runs between the worker's inventory entry and its reservation; the reservation ends settled at zero, with nothing sent. The same with the worker stopping right after reserving: the next slice settles it. |

**The record format changed again, before any deployment.** `late-n` events record each late copy's bill; a `found` event's time is when its search started.

### Codex's sixth pass on `9bf6aa17`: HOLD, and a second change of principle

Codex confirmed the zero settlements of the fifth round (a close must win the claim a create would need; no path zeroes a reservation under a create that may have been sent), the concurrent late-sum retry, that the ledger conflict is committed before `evidence_conflict` is caught, and that no new path creates, cancels, links or falls back. It found three P1 findings and one P2. Two were the same kind as before: a decision taken on an older read still moved money, and evidence was dropped before a deletion. Rather than patch them, the round changes the principle again:

| # | Finding | Answer | Regression test |
| --- | --- | --- | --- |
| P1 | A stale duplicate hold could win the terminal outcome after the presumption had settled its charge: the world was left unheld, and both copies were deleted unread with their game. | **Only the outcome moves money.** Every terminal outcome is written first and says what the ledger must hold; it is then applied by whichever pass reads it, and only to a still-pending reservation. Nothing settles, releases or marks a charge before the outcome is recorded, so a pass that lost the outcome moved nothing; that includes the retained store, which for a deleted game recorded the charge itself before any outcome existed. **Every copy is read before it goes**, in every finished round, against what the ledger counted beyond the round's own batch. | Codex's interleaving, the hold winning just before the presumption: the charge is held as unknown, never settled at the presumption; the game deleted, both copies are read, their receipts kept, and only then deleted. A deleted game's answer: every ledger write is watched, and the charge leaves its reservation only after the outcome is recorded. A copy found beside an answered batch: billed again, it holds the world. |
| P1 | A search kept undecided by unrelated newer batches, and running before the late bill was read, could starve a known copy's bill for good. | Housekeeping reads the known copies' bills and deletes them first, and searches last. The search looks only at batches created in the round's window (from the intent to the grace after the last claim), so newer batches never keep it undecided. | Two known copies and a search taking 70 seconds on every tick: both read and deleted in the first tick. A day-later search with an unrelated batch running: complete in one pass. The transport leaves out batches created after the window. |
| P1 | An unpriced late bill kept only a substitute receipt; the original receipt and usage were gone once the copy was deleted. | Every bill read keeps what the provider returned for the question (result type, receipt, model, usage; never the answer) in the round's record, and an unpriced conflict carries the original receipt and usage. The same for a hold that read the round's own batch. | The unpriced copy: its receipt and usage in the record and in the conflict, after its deletion. The deleted game's unpriced answer: the hold keeps its receipt and usage. |
| P2 | A parked game (still generating, its job parked) never had a late copy deleted once its bill was read: only its slices deleted, and they do not run. | The scheduled tick does every finished round's housekeeping, generating game or not. | The unpriced copy of a parked game is read and deleted by scheduled ticks alone. |

**The record format changed again, before any deployment.** `answered` carries the charge evidence it settles; `held` states its charge (`zero` with its result, or `unknown`) and, when it read the round's batch, that batch and its receipts; `late-n` carries its receipts and applies to every finished round.

### Codex's seventh pass on `19131d6d`: HOLD, and the batch key's one batch

Codex confirmed that the shared outcome name keeps two ordinary passes from applying different outcomes, that the decision slot holds, that receipts never carry the answer, that every known copy's deletion follows its recorded bill, and that no new call starts without room. It found three P1 findings and two P2:

| # | Finding | Answer | Regression test |
| --- | --- | --- | --- |
| P1 | A copy's bill recorded while the held charge was unknown was never compared again once that charge was settled (by a person), so a second bill could go uncounted. | **The batch key stands for one batch; every other copy is a charge of its own,** imported into the ledger in full by its receipt when it is read, whatever the batch key holds. Whoever settles the key later settles it for its one batch; nothing has to be compared again. | A held answer's copy read while the charge is unknown is imported at once; a person then settles the held charge at its own bill, and the copy stays counted beside it. |
| P1 | A held round whose own batch was later settled gave that settlement to a new copy as its allowance. | No allowance is shared: a copy beyond the round's own batch is imported as its own charge, whether it is read before or after the key is settled. | The same test: a copy read only after the person's settlement is imported in full. An unpriced copy is counted at the synchronous reservation and holds the world. |
| P1 | A hold over the create's own batch and one found copy stopped searching: the predicate counted only found copies. | The search counts every copy the round knows, the recorded one included. | The pure rules: a recorded batch and one copy found by an undecided search keep the hold searching. |
| P2 | One copy whose reads always time out starved the readable copies after it, tick after tick. | Each tick starts reading copies one further on; a deletion the provider refuses no longer stops the others either. | Codex's case (an eight-second round read, thirty-second failures): the readable copy is read and deleted within two ticks. A copy the provider will not delete: the others go. |
| P2 | `applyTerminal` checked "pending" and then settled in a separate transaction. | `WorldBudget.settle` takes `onlyPending`, checked inside the write's transaction; every outcome settles with it, and an answer is delivered only on a charge it settled. | The ledger: a held or settled request is left as it is. Codex's case: a hold made right after the outcome's read stands, and the answer waits for a person. |

The record format is unchanged by the seventh round; the ledger gains imported rows, one per extra copy's receipt.

### Codex's eighth pass on `f993b3a7`: HOLD, and no stand-in

Codex confirmed, by offline probes:
- two passes racing for `late-1` record one bill, and the losing pass reads the round again;
- a crash after a priced import and before its `late-n` replays to one row and one charge;
- a receipt collision with other operation metadata keeps a durable `evidence_conflict` and holds the world;
- `onlyPending` is checked inside the ledger's transaction, and the board wizard's wrapper passes it on;
- the shared decision slot, outcome-first, and the limits on creating still hold, and every provider call keeps its deadline check;
- imported rows are counted in world audits, judge totals and the admin cost display, and survive the game's deletion without a retained answer.

It found two P1 findings and three P2:

| # | Finding | Answer | Regression test |
| --- | --- | --- | --- |
| P1 | An unpriced extra copy, imported as a settled estimate, was held only if the batch key was already settled. With the key unknown, a person who reconciled only the original batch left the copy's estimate as an ordinary resolved charge, and the world unheld. A crash between the import and its conflict did the same. | An unpriced copy is its own unknown row at the synchronous reservation (`WorldBudget.recordUnknown`, under `<batch key>:copy:<batch id>`), written once and independent of the batch key. It holds the world until a person reconciles that row. | Codex's order: the unpriced copy is read while the held charge is unknown; a person settles the original batch; housekeeping runs again. The copy's row is still unknown and the world still held. Also the unpriced copy beside a presumption, with its receipt in the row's reason. |
| P1 | The first copy of a presumed-lost create stood in for the presumption, even when no settled presumption covered it. With the batch key held by another writer, a 134,000 bill was neither imported nor a conflict, and the copy was deleted. | **No stand-in.** Every copy beyond the round's own batch is imported in full by its receipt (recorded unknown when unpriced), whatever the batch key holds. A presumed-lost create's copy is counted on top of the presumption. | Codex's case: the reservation is held as unknown right after the presumption is recorded, before it is applied. A day later the copy (standard tier, 134,000) is imported in full before it is deleted. The held world buys no synchronous question. The standard-tier and two-copy cases: each copy imported in full beside the presumption, with no conflict. |
| P2 | The sweep's round rotation and the copy rotation both used the minute. A round visited every other minute met the same unreadable copy first every time, so its readable copy was never read. | The copy order starts at a hash of the round and the minute, not at the minute alone. | The pure rule: a round visited every second minute with two copies, every third with three, and every second with four meets every start; within one minute the start does not change. End to end: the sweep comes back only on even minutes, and the readable copy is read and deleted. |
| P2 | Three deletion refusals of 30 seconds each used up the round on every tick, so a fourth copy that could be deleted never was. | Deletions start from the same hashed copy as the reads. | Codex's case: three 30-second refusals and one copy that would go at once; that copy is deleted within a few ticks. The immediate-refusal test now runs in a minute whose order starts with the refused copy. |
| P2 | Imported copy bills take the ledger's mutable date in the daily spend, so an old bill can count against a later day's ceiling. | **Not fixed; disclosed (§6, item 14).** Only the daily attribution moves, and only upward; the world total counts each receipt once. Imported identity bills already use the same fallback. | None. |

A copy that repeats a receipt already counted, with other usage, is now tested as well: the conflict holds the world, and the copy's bill is still recorded and the copy deleted, so the pass does not fail on it every tick.

The record format is unchanged by the eighth round. The ledger gains an unknown row, `<batch key>:copy:<batch id>`, for each copy whose bill cannot be stated.

### Codex's ninth pass on `98a52e29`: HOLD, and a copy's row bound to its reading

Codex confirmed, by offline probes against the real ledger and housekeeping functions:
- replaying an unchanged unpriced reading gives one unknown row and one bill, and a replay after a person's ordinary settlement of that row keeps the settlement;
- priced imports are durable before `late-n`, and receipt conflicts stay durable holds;
- different copies get different unknown rows, priced copies are imported in full whatever the batch key holds, and counting a found copy on top of the presumption is conservative, never an under-count;
- the new unknown rows reach audits, `unknownRequestKeys`, judge reservations, the daily spend's outstanding reservations and the admin's unknown totals, and match no automatic recovery pattern;
- every non-test `createRequest` caller creates a pending reservation, a linked alias, a recorded unknown charge or an imported settled charge, so limiting the ceiling to pending reservations lets no dispatch through;
- never twice, the decision slot and outcome-first are unchanged, and the hashed start answers the eighth pass's synchronization.

It found one P1 and two P2, one of them the disclosed daily spend:

| # | Finding | Answer | Regression test |
| --- | --- | --- | --- |
| P1 | A copy's unknown row was keyed by its batch alone. If the worker stopped after the row and before `late-n`, and a person then reconciled the row (settled at zero, or approved to continue), a replay that read another receipt for the same copy reused the reconciled row: the copy was deleted with nothing unknown and the world unheld. | The row is bound to its reading: `<batch key>:copy:<batch id>:<digest>`, the digest of what the provider returned for the question, as `late-n` keeps it. The same reading again is the same row, as the person left it; any other reading is another unknown charge at the synchronous reservation, and holds the world. | Codex's sequence through the real housekeeping: the worker stops right after the copy's row commits; a person settles it at zero (in a second test, approves it to continue); the copy, read again, returns another receipt. A second unknown row holds the world, the first stays as the person left it, and the copy is deleted once both are in the ledger. |
| P2 | `recordUnknown` refused a row a person had reconciled into a linked alias (a settlement whose receipt the ledger already counted). A replay then failed on every pass, and because reading comes before deletion, none of the round's copies was ever deleted. | The same terms again return the row as it stands, linked included; only a reservation still pending, another origin or other terms are refused. Separately, a copy whose bill the ledger or the record refuses no longer stops the others: it stays unread, and so undeletable, while the others are read and the billed ones deleted, and the refusal is raised after them. | The ledger: a row reconciled into an alias is returned as it stands. End to end: that reconciliation after the stop, then the replay records the bill and deletes both batches. And a copy whose bill the ledger refuses on every write, read first: the other copy is read, recorded and deleted, and the refusal is raised. |
| P2 | Imported copy bills take the ledger's mutable date in the daily spend (reproduced again). | **Not fixed; disclosed (§6, item 14).** Codex found the disclosure accurate. | None. |

The ledger format is unchanged; only the key of a copy's unknown row now ends in its reading's digest. Nothing has run on the eighth round's key outside tests.

### Codex's tenth pass on `1140ce2b`: HOLD, and every reading counted

Codex confirmed the ninth round's sequential fix (an unchanged reading reuses its row, a changed receipt creates another), that returning a reconciled linked row is consistent with the ledger's contract, that the change grants no dispatch and leaves approvals alone, and that never twice, the decision slot, outcome-first and the room checks are unchanged. It found two P1 findings and three P2:

| # | Finding | Answer | Regression test |
| --- | --- | --- | --- |
| P1 | A pass that read a copy while another pass recorded that copy's bill returned early on the batch id alone, so a different reading of its own was never counted: with the first reading priced and the second unpriced, the copy was deleted with the second reading nowhere in the ledger. | **Every reading is counted, under its own key, before anything else.** `recordLate` counts this pass's reading first (an import by its receipt, or an unknown row by its digest) and only then checks whether the copy is already recorded: the same reading is the same row, another reading another charge. The same holds for the round's own batch: a pass that loses the outcome to a different reading (the store refuses its different answer, or its outcome write loses) counts its reading as a copy's would be, unless the recorded outcome read exactly it (`qualityBatchOutcomeRead`). | Codex's schedule, with one pass held up inside the provider read: the other records a priced reading and deletes the copy; the held-up pass's unpriced reading becomes an unknown row of its own and holds the world. The same for the round's own batch: the answer stands, the losing pass's reading is counted. And two passes reading the same unpriced answer of the own batch: one unknown charge, not two. |
| P1 | A copy whose bill the ledger kept refusing stopped the search for further copies for good: housekeeping raised the refusal before the search. | Housekeeping runs each step whatever failed before it (the outcome's ledger effect, the known copies, the search and what it finds) and raises every failure at the end. | Codex's case: a deleted game's held round with its search open, one known copy's bill refused on every write, a third copy that ends later. The third is found, read and deleted; so is the second; the refused one stays unread. |
| P2 | Equivalent usage serialised in another key order gave another digest, so a replay could record a second unknown charge for the same bill. | The digest is of a canonical form: object keys sorted at every depth, arrays in order, a null distinct from a missing key (`qualityBatchCanonicalJson`). | The pure rule, nested objects included. End to end: the replay returns the same answer with its usage keys reversed, and the person's reconciliation of the first row stands, with nothing unknown. The row's key is spelled out in a test with a separate canonical form. |
| P2 | A failure to record the copies' deletion replaced the earlier refusal of a bill, so the refusal was lost. | Every failure of a pass is raised: one as it is, several together (`AggregateError`, with each message). | A refused bill and a failed deletion record in one pass: both reported. Also: a failure to keep a batch's answer, with no outcome recorded, is still raised, and the next pass answers. |
| P2 | Imported copy bills take the ledger's mutable date in the daily spend (reproduced again). | **Not fixed; disclosed (§6, item 14).** Codex found the disclosure accurate. | None. |

The record and ledger formats are unchanged by the tenth round.

### Codex's eleventh pass on `198f32b0`: HOLD, and a third change of principle

Codex confirmed that `qualityBatchOutcomeRead` had no false match among the outcomes a reconcile could lose to, that identical priced imports deduplicate, that the commit added no create, cancel or fallback path, and that aggregated failures still reach the slice's FAILED status and the sweep's count. It found three P1 findings and one P2. Three of the four, like the ninth and tenth passes before them, came from one batch being read differently by different passes: each fix closed one interleaving and exposed the next. Rather than patch a fourth, the round changes the principle, as the fourth and sixth did:

**Rule 6: a batch is read once, and its reading recorded before anything is decided from it.** The first reading of each batch is written under a compare-and-set name of its own (`reading-<batch id in hex>`). The round's outcome is decided only from that reading, and a copy's bill (`late-n`) is that reading, on every pass; a copy is never read from the provider again. A later read that returned anything else (only a pass that read the batch while another was recording it can make one) is a provider fault: recorded (`reread`), counted at once as a charge of its own, never decided from; a round with no outcome yet is held for a person.

| # | Finding | Answer | Regression test |
| --- | --- | --- | --- |
| P1 | A reading was discarded when reconciliation failed before an outcome was visible: two passes read the round's own batch differently, the first kept its answer and paused before its outcome, the second's different answer was refused by the store and raised with nothing counted. And a variant settled at zero: a priced first reading failed to keep its answer, and a later read said canceled. | Rule 6. The first reading is recorded before the answer is kept or anything decided; the second pass's different reading is a reread, counted at once, and the round, with no outcome yet, is held with its first reading. A canceled reading after a billed one is a reread too: nothing falls back, nothing settles at zero. | Codex's interleaving: the first pass pauses after keeping its answer; the second reads an unpriced answer, which is counted and holds the round; the first's outcome then loses. The canceled-after-billed case: held, the charge unknown, nothing asked synchronously. |
| P1 | After a failed application of the outcome, housekeeping went on to read a copy carrying the answer's own receipt and imported it, so the settlement that followed linked the batch key, and the delivery gate refused a linked charge for good. | Copies are read and deleted only once the ledger matches the record (the outcome, and every reread). A copy bearing the answer's receipt is then the answer's own charge, deduplicated by the ledger. | Codex's sequence: the answer recorded with its charge pending, the ledger unavailable for a while, a copy with the identical receipt found meanwhile; once the ledger settles, the copy is read, nothing is imported, and the answer is delivered (its alias linked, its continuity question asked). |
| P1 | A known copy whose bill the ledger kept refusing was re-read from the provider on every pass, and with 29.9-second reads that left the search no room to prove a further copy, for good. | Rule 6: a copy is read once; its recorded reading is its bill from then on, so a refused bill costs no provider call. Two more: a search reads only batches the round does not know yet (`find` takes the known ids), so a known copy whose results cannot be read keeps no search waiting; and the known copies and the search take turns going first, by minute. | Codex's schedule on a fake clock (29.9 seconds a read; a search lists and proves each candidate, each only with 31 seconds left; the first copy's bill refused on every write): the first copy is read once, and the third is found, billed and deleted. A known copy whose results always time out: the turns, and the search skipping it, let the third be found and deleted. The transport: a search does not read a known batch's results. |
| P2 | Priced evidence hashed its usage without the canonical form, so a replay with reordered usage recorded a false conflict. | Under rule 6 a copy is not read again, so its bill never changes form. For the round's own batch, the answer's usage is put in canonical key order before it is kept and priced, so the same answer read again is the same retained record and the same charge; `usageId` hashes the canonical form everywhere. | A priced copy stopped after its import: its bill is recorded once, with no conflict, though the provider now serialises it otherwise. The round's own batch stopped after keeping its answer and read again with reordered usage: answered, settled, no conflict. |

The daily-spend attribution (§6, item 14) is unchanged and still disclosed.

**The record format changed again, before any deployment.** `reading` and `reread` events; the ledger is unchanged. The ninth round's replay tests now show rule 6 instead: after a stop, the copy's bill on the next pass is its recorded reading, whatever the provider returns later, and a person's reconciliation of it stands.

### Codex's twelfth pass on `d407538c`: HOLD, and the reading a search proved by

Codex confirmed that reordered usage gives identical retained bytes and no reread, that a complete search returning no new ids selects a sole copy recorded earlier rather than presuming the create lost, that the new event names match the record's id pattern, that a record without `reading` events stays readable, and that the commit adds no second-create path and no decision-slot or room-check regression. It found three P1 findings and two P2, one of them the disclosed daily spend. All three P1s are places where rule 6 was not yet applied everywhere; the principle stands, and each fix extends it:

| # | Finding | Answer | Regression test |
| --- | --- | --- | --- |
| P1 | A search read a batch's results to prove it, but kept only the id. After a lost create, discovery read a priced answer (134,000 micro-USD), the next read said canceled, and the round fell back at zero, settled the key at zero, and deleted the batch. | The transport returns each proven batch with the results that proved it, and a search records them as that batch's first reading before it records the batch (rule 6). The later canceled read is then a reread: never decided from, counted, and the round, with no outcome yet, held. | Codex's case on the scripted provider: the search proves the batch by its priced answer, and the next read says canceled. The round is held with its charge unknown and the search's reading, the canceled read is recorded as a reread, and the batch is kept. The transport test asserts that a proven batch comes back with its results. |
| P1 | The done step applied only the outcome. The gate could let a fallback proceed while a reread another pass recorded was still uncounted: Codex's numbers had 3,950,000 against a 4,000,000 ceiling with 4,084,000 owed. And an open round with a reread was outside the tick's view. | The done step applies the whole record (the outcome and every reread) before anything follows from it, and raises if it cannot. A reread before any outcome holds the round by its next step (`fault` in the pure rules), whichever pass takes it, before the reread is counted, so a count that fails decides nothing. The tick holds such a round even in a live game, as a stopping pass, and keeps a finished round with a reread in view. | Codex's interleaving: the first pass pauses before its fallback; the second reads a priced answer, holds the round, and fails to count it; the fallback loses, and the reread is counted when the record is applied. Codex's numbers: the reread's 134,000 is counted before the 250,000 synchronous reservation, which then no longer fits. A search that reads a batch otherwise while another batch still runs: held at once. A worker that stops between the reread and the hold: the tick holds the round and counts the reread, reading no batch. |
| P1 | `applyTerminal` returned without error when another writer held the batch key. Housekeeping then imported a copy carrying the answer's identical receipt as the canonical row, a person's later settlement of the key became a linked alias, and the gate refused a linked charge for good. | A copy whose reading is the outcome's own reading (the same message and usage) is the outcome's bill, which the batch key counts. It is neither imported nor recorded as unknown, whatever the key's state. | Codex's case: the key is held by another writer right after the answer is recorded, and a copy with the same message is read while it is held. Nothing is imported, the person's settlement stays a settlement, and the answer is delivered. The unpriced twin: a copy of a held unpriced answer adds no unknown charge. And a finished round's search that records a reread counts it before the slice goes on. |
| P2 | The phases' turn and the order of two copies came from the low bit of the same hash. FNV-1a's odd multiplier makes that bit follow the characters' parity, so the two moved in lockstep. With one copy and the search both failing slowly, the readable copy got no call in 240 visits. | The hash ends with a final avalanche mix (murmur3's), so every bit depends on every character and the two choices are independent. | Codex's schedule both ways round (the failing copy first, or second): the readable copy is read and deleted. The pure rule: visited every one, two or three minutes, all four pairings of turn and order occur. |
| P2 | Imported copy bills take the ledger's mutable date in the daily spend (reproduced again). | **Not fixed; disclosed (§6, item 14).** | None. |

The record format is unchanged by the twelfth round: a hold from a fault of the round's own batch keeps that batch's first reading as its `results`. The transport's `find` now returns `results` beside `proven`.

Two more, found while answering, both about a hold the `fault` step makes mid-search:
- A search that records a batch's reading and stops before recording the batch, twice and differently, would leave the round held on the fault with that batch unknown to it: never read as a copy, and never deleted with its game. The `fault` step now keeps every batch the record read before it holds. Test: two such searches, then the hold keeps the batch and counts the reread; the game deleted, the batch's bill is taken from its first reading and the batch is deleted.
- A fault can now hold a round while its search is undecided, with one batch known and another candidate still running. A held round searched on only over two known copies, so that candidate, if it carried the question, would never have been found, billed or deleted. A held round now searches whenever a search came before the hold and the latest left something undecided. Test: the search-fault test's running candidate is a copy; it ends after the hold, and once the game is deleted the tick finds it, reads its bill and deletes it. The pure rules: such a hold searches; one after a complete search does not.

Ten earlier tests were adjusted, none of them weakened: three exact event lists now include the readings a search records; three injected races fire one read later, as a search now reads the round once more before it records its batches; and four tests whose copies must be read from the provider (one read only, the room for both reads, the turns, a copy that cannot be read) now use a scripted search that keeps no readings (§6, item 16), since a search that keeps them leaves nothing to read.

### Codex's thirteenth pass on `6b0654fa` and `8c0623d2`: HOLD, and a fourth change of principle

Codex confirmed that the ten adjusted tests keep their behavioural assertions, that the `outcomes` comparison compares the whole canonical receipt (a missing own reading or other usage never matches), that a concurrent live sweep applies an answer recorded after its selection without polling, cancelling, creating or linking, and that the commits add no second create, no change to the decision slot and no room-check regression. It found five P1 findings and the disclosed P2. As in the ninth to eleventh passes, all five came from what the record held between two steps of a pass: a search's proof between its reads, a reading before its batch, a reread before its count, a fault before its hold, an undecided search before its record. Three of the five came from a choice the eleventh and twelfth rounds had made: record another reading first, and make a fault hold its round. The round changes that choice, as the fourth, sixth and eleventh changed theirs, instead of patching the interleavings:

**Rule 6, revised: another reading is counted before it is recorded, and the outcome is always the first reading's.** A batch read is a batch of the round. A later read that returns anything else is counted as a charge of its own first, then recorded; a count the ledger refuses is recorded all the same and raised. Nothing is decided from it: an unbilled first reading falls back or holds at zero whatever a later read says, and an answer is delivered only from a read that gives it, so the one case a fault holds is an answer whose first reading is on record but whose content no pass kept. The `fault` step, the hold it wrote, its keeping of unkept batches and the tick's stopping pass for a live game's faulted round are gone.

| # | Finding | Answer | Regression test |
| --- | --- | --- | --- |
| P1 | A later transport error in the same search (a 503 on the next candidate) threw away the reading of a batch it had already proved, and a later canceled read of that batch settled it at zero. | The transport returns what it proved when a later read fails: the batches and their results, undecided, with the reason (`failed`). A search that proved nothing still throws. | The transport: A proves, B answers 503; A comes back with its results. End to end on the real transport, scripted: A's priced answer is kept as its first reading though the search failed on B; the next search completes, A is the round's batch, its next read says canceled, and the round is held with A's first reading: nothing settled at zero, nothing asked synchronously. |
| P1 | A first reading recorded before its batch's `found` was left out of the round when nothing faulted: a later empty search presumed the create lost (125,000) beside a durable 134,000 reading, and the batch was never billed or deleted. | A batch read is a batch of the round (`batchIds` holds every batch with a reading), and the search decides by the round's batches, not its found ids: such a batch is the round's batch, never presumed lost. | Codex's case: the search records the reading and stops before `found-1`; later searches no longer list the batch. It becomes the round's batch, is answered from its next read at 9,000, and is deleted with its game. The pure rules: a read batch is the round's, and counts for two copies and for late bills; a round that read one never ends unsent. |
| P1 | The done step applied an older read of the round: a reread recorded while it was at the ledger stayed uncounted, and the gate admitted 250,000 in a world whose recorded charges already came to 4,084,000 of 4,000,000. | Another reading is counted before it is recorded, so nothing on record is ever uncounted, whatever any pass read before. | Codex's schedule: the gate reads the finished round, and while it is at the ledger the slow poll counts and records its priced reading; the reservation that follows sees it, and does not fit. And the order itself: a reread whose record fails as it is written is in the ledger all the same. |
| P1 | A stale reconciliation wrote its fallback after a fault was durable, so the round was never held. | A fault no longer has to hold its round: the outcome is the first reading's, and that fallback is it. The other reading is counted beside it. | Codex's interleaving: the first pass decides from canceled and pauses before its fallback; the second reads a priced answer whose count the ledger refuses, which is recorded and raised. The fallback then stands, the priced reading is counted before anything follows from that outcome, and the question is asked synchronously, as for any unbilled result. |
| P1 | An undecided search that found nothing new was not recorded, so a fault hold kept an older complete flag and stopped searching for a candidate still running. | No fault holds a round mid-search any more: a search's other reading is counted and recorded, and the round searches on as before. | A search reads a batch otherwise than its recorded reading while another copy still runs: the other reading is counted, nothing is decided, and the round waits; the other copy then ends, two copies hold the round, and both are billed (the first from its first reading) and deleted with the game. |
| P2 | Imported copy bills take the ledger's mutable date in the daily spend (reproduced again). | **Not fixed; disclosed (§6, item 14).** | None. |

The record format is unchanged by the thirteenth round: no `fault` hold is written any more, and a batch with a `reading` is one of the round's whether or not a `found` names it. The transport's search can return `failed` beside what it proved. Three tests of the twelfth round were rewritten for the new rule (the refused count with the stale fallback; the search's other reading; a finished round's search that reads a copy otherwise, which now takes two searches at once, since a search never reads a batch the round has read), two were removed with the fault hold they tested (the live game's faulted round, and the unkept batch the fault kept, which the orphan-reading test now covers), and the pure rules' fault test was replaced. The twelfth round's follow-up `8c0623d2` (a held round searching whenever its latest search was undecided) is reverted with the hold it served: no fault holds a round mid-search any more, and a hold over two or more known batches searches on, as before.

### Codex's fourteenth pass on `e878f0b7`: HOLD, and the rule's reach

Codex confirmed that a priced reread is counted before its record even when that record fails, that the real transport, given a local HTTP stub, keeps A's proof when reading B answers 503, that records without readings still parse, that `submitted` and `presumed` still share one name, and that the commit adds no second create and no room-check regression. It found four P1 findings and two P2, one of them the disclosed daily spend. The thirteenth round's principle held; what Codex found was where it did not yet reach: a copy's first reading, an answer's content, a batch read and not recorded, the twelfth round's records, and an unbilled reading still waiting on the provider.

| # | Finding | Answer | Regression test |
| --- | --- | --- | --- |
| P1 | A late copy's first reading was on record but uncounted until its `late-n`: after a presumption settled at 125,000, a search recorded a 134,000 copy and stopped, and the gate admitted 250,000 into a world then 84,000 over its 5,000,000 ceiling. | A finished round's copy is counted before its first reading is recorded; the done step counts every copy's reading on record (and every reread) before the gate lets anything follow; housekeeping counts them too, each on its own. | Codex's numbers, both ways: the gate reads the round just before the search records the copy, and the copy, counted first, keeps the 250,000 reservation out; and the ledger refuses the copy's count when it is read, so its reading is recorded uncounted, and the gate counts it before the reservation, which then does not fit. |
| P1 | A reading bound only the bill: another answer under the same message id, model and usage compared equal, and was delivered (Codex's probe turned a recorded `fail` into a delivered `pass`). | A reading binds the answer by its digest (the whole message in canonical form): another answer, or another stop reason, under the same bill is another reading, held rather than delivered, and counted once, as one bill. | Codex's case, two ways: the first reading's answer could not be kept; the next read returns another answer, then another stop reason, under the same bill. Held, the reread recorded, nothing imported, nothing linked, nothing asked. |
| P1 | A reading entered the round's batches at once, but the undecided search that read it was recorded later, or never: a hold over it and an earlier copy kept the earlier search's complete flag, and stopped searching for a candidate still running. | A batch read that no search recorded keeps the round's search unfinished, whatever the last recorded search said, and the next search records it with what it finds. | Codex's case: a complete search records A and stops before deciding; a newer one reads B while C runs and stops before recording it; the round holds over A and B and searches on; the game deleted, C ends and is found, and all three are billed and deleted. The pure rules: unfinished until recorded, then complete. |
| P1 | Reverting the held-round search rule changed how a valid record of the twelfth round's (a fault hold over one batch, its search undecided) is handled: it stopped searching. | The twelfth round's rule is restored: a held round searches whenever a search came before it unfinished. Nothing of this branch was ever deployed, so such records exist only in tests; the rule keeps them working anyway. | The pure rules: such a fault hold searches on. |
| P2 | An unbilled first reading on record still needed another successful provider read to finish its round: with the batch's record unreadable, it waited for good (a probe at day 31). | A batch whose first reading is on record and gives no answer is decided from that reading without reading the batch again. | Codex's case: the search records a canceled reading, and every later status read fails; the round falls back at zero, with no status read, and the question is asked synchronously. |
| P2 | Imported copy bills take the ledger's mutable date in the daily spend (reproduced again). | **Not fixed; disclosed (§6, item 14).** | None. |

The record format changed again, before any deployment: a reading's receipts carry `answerSha256` for an answer. Earlier tests were adjusted in four places, none weakened: the replayed-copy helper's stop (three tests) now comes after the copy's reading as well as its count, since the count now comes first; the copy that vanished answers rather than cancels, since a canceled reading on record now decides at once; the refused copy's ledger refuses from the hold, since the hold now counts the copies; and the refused reread's race starts before the first reading, since a reading on record is no longer read again. Two more were strengthened after the mutation run (§5): the refused copy's test runs a second pass, and the orphan reading's asserts that no search reads the batch again.

### Codex's fifteenth pass on `37149e36`: HOLD, and what a search saw

Codex confirmed that the answer's digest closes the delivery of another answer, or another stop reason, for new readings; that an unbilled first reading on record reaches its fallback with no status call; that a reading of an earlier revision, without the digest, is held conservatively when read again; that `submitted` and `presumed` still share one name; and that the commit adds no second create, no change to the decision slot and no room-check regression. It found two P1 findings and two P2, one of them the disclosed daily spend. The two P1s are the round's principles not yet reaching two things: the bill of a held answer, and what a search saw but could not decide.

| # | Finding | Answer | Regression test |
| --- | --- | --- | --- |
| P1 | A hold over an answer that could not be delivered marked the batch key unknown at its 125,000 reservation, though the first reading stated a priceable 134,000 standard-tier bill. Nothing ever counted the difference: the copy check skips the outcome's own reading, and the reread had the same bill. | **The answer is held; its bill is not.** The hold states the bill its first reading states (`charge: "known"`, priced exactly as the answer's delivery would settle it) and settles the batch key at it, in full; it is unknown only when that bill cannot be priced. An overrun then holds the world by the ledger's own rule, and the round's hold parks the job either way. | Codex's numbers, both ways (another answer, another stop reason): the batch key is settled at 134,000, an overrun, and the gate's application, a slice's housekeeping and a sweep leave the ledger exactly as it was. Four earlier tests whose undeliverable first readings were priced now assert the bill settled instead of unknown. |
| P1 | A concurrent search that saw a candidate still running, and found nothing new, was discarded: the hold kept the other search's complete flag and stopped searching, and the candidate, a copy, was never billed or deleted. | **What a search saw is never thrown away.** A batch a search could not decide (still running, or one whose results it could not read) is recorded by its id (`pending`), whichever search lands first, until a later search decides it: proves it, reads it without the question, or lists the whole window without it (`cleared`; the transport is told which batches to watch). The round's batch is decided only with none pending, and every finished round, an answered one included, searches on while one is. | Codex's schedule both ways (the complete search landing first, and the one that saw C): the hold names C and searches on; once the game is deleted and C ends, C is found, billed and deleted with A and B. An open round never decides its batch while another search's candidate is pending, and decides once a later search clears it. An answered round, decided before a concurrent search named two candidates, searches on, counts and deletes the copy among them, clears the other, and then stops searching. The transport: running and unreadable batches named; a watched batch cleared only by a read without the question or by a listing of the whole window. |
| P2 | Two passes that recorded a copy's first reading at once, with different answers under one unpriced bill, counted it twice: the copy's unknown row was keyed by the whole reading, the answer's digest included. | A copy's unknown row is keyed by its bill (the reading less the answer's digest): one bill, one row, however many passes count it at once and whatever answer each read. | Codex's barrier (both passes' snapshots taken before either records the first reading): one first reading, one reread, and one unknown row at the synchronous reservation beside the presumption. |
| P2 | Imported copy bills take the ledger's mutable date in the daily spend (reproduced again). | **Not fixed; disclosed (§6, item 14).** | None. |

The record format changed again, before any deployment: a `found` event can name the batches its search could not decide (`pending`) and the pending ones it decided carry no copy (`cleared`); a `held` event can state a known charge (`charge: "known"`, with its `evidence`); a copy's unknown row is keyed by its bill. The transport's search now names what it could not decide, and when a later read fails it returns, undecided, what it proved and saw; only a search that failed before it saw any batch still throws. Earlier tests were adjusted in eight places, none weakened: the six tests of an undeliverable priced answer now assert its bill settled (two of them at Codex's numbers, with the record applied again); the forgotten-copy test's event list now includes the search that cleared the other batch; and the late unpriced copy's key, spelled out apart from the code, leaves out the answer's digest. Three transport tests now expect a named, undecided search where a read failed, rather than a throw.

### Codex's sixteenth pass on `da3bcfa6`: HOLD, and the decision in its search's slot

Codex confirmed that a known hold from a pending key settles the first reading's 134,000 in full, with evidence identical to the delivery's (namespace, receipt, canonical usage digest, model, tier-aware pricing and rounding); that the copy key now leaves out the answer's digest and keeps the bill; that the pending and cleared folding keeps proven and read batches, and the added tests' landing orders keep pending ids; and that the commit adds no second create, cancel or link path and no regression in the transport's deadline checks or its new returns. It found two P1 findings and the disclosed daily spend:

| # | Finding | Answer | Regression test |
| --- | --- | --- | --- |
| P1 | A known outcome bill was still under-counted when another writer held the batch key as unknown, before the outcome's application read it or between that read and its settlement: the hold kept 125,000 against a 134,000 bill, with nothing raised. A hold the fourteenth round recorded over a priceable undeliverable answer was applied at the reservation too. | **A bill the outcome states is counted in full whoever holds the key.** Above an unknown hold, the difference is an unknown row of its own, named after the bill, and the hold stands as it was made; a person reconciles the row with the key. A slice applies the record to every key it reads as pending or unknown. The fourteenth round's hold over a priceable answer is applied at that answer's bill. | Codex's race both ways (the hold made before the application read the key, and between that read and the settlement): the hold stands at 125,000, a row of 9,000 is beside it, and applying the record again by a slice and by the tick counts it once. When the gate's write of that row fails, the next slice's housekeeping writes it. A record as `37149e36` wrote it is applied at 134,000. |
| P1 | The find step checked for pending candidates on one read and decided the round's batch in a later write: a candidate another search recorded between them went unseen, and a canceled batch fell back at zero while that candidate was pending. | **The decision is made in the slot its search records in** (`found-n` with `decision`), from the round as that record leaves it: a search that recorded first took the slot, so the deciding search reads the round again and sees it. And **a fallback asks the question synchronously only once no batch that could carry it is pending**, which covers a candidate that a search started before the decision names after it. | A search held between reading the round and recording what it found, while another records a running copy: its record loses the slot, it reads again, nothing is decided, and the two copies then hold the round. A search cut short (it did not reach back to the intent) that proved a batch decides nothing; the next, complete, decides. Codex's schedule as it can still happen (the decision first, the stale search's candidate after it): the canceled batch is settled at zero as documented, the question waits, the copy is billed when it ends, and only then is the question asked. |
| P2 | Imported copy bills take the ledger's mutable date in the daily spend (reproduced again). | **Not fixed; disclosed (§6, item 14).** | None. |

The record format changed again, before any deployment: a `found` event can carry its search's `decision` (`submitted` with its batch, or `presumed`, for its claim), read as the `submitted` or `presumed` it decides; earlier records' own `submitted` and `presumed` events are read as before, and one round has one decision in either form. The ledger gains a row above an unknown hold, `<batch key>:above-hold:<digest>`, only when another writer holds the key. Earlier tests were adjusted in eight places, none weakened: four event lists or decision reads now find the decision in its search's record; two races that injected another pass's record before a decision now inject it right after, since before is no longer possible (a stale decision loses its slot), so they test what they were written for, a presumption with a copy beside it, and a hold that takes the outcome between the presumption step's read and its fallback (moved there after the mutation run, §5); and the fourteenth round's unrecorded-batch test now starts from a record of the code before this one, written directly, since a search can no longer stop between its record and its decision. The round-15 test of an open round with a pending candidate now asserts that no decision exists in either form.

### Codex's seventeenth pass on `4e57f87d`: HOLD, and the round's writes serialized

Codex confirmed the accounting: answered outcomes, known holds and priceable `37149e36` holds each counted 134,000 from a pending key or beside an existing 125,000 unknown hold, applying the record three times added nothing, and reordered evidence gave the same row above the hold. It found no other money release, deletion before reading, cancel, link or deadline regression. It found two P1 findings and the disclosed daily spend. Both P1s were the same gap the sixteenth round closed for search records, left open for the other writes a decision depends on:

| # | Finding | Answer | Regression test |
| --- | --- | --- | --- |
| P1 | A decision written under its own name (a `submitted` of an earlier revision's search, or a create's) and a search's decision did not contend: both could commit, and the round, with two decisions, could no longer be read. | **Every write of a round is serialized** by the round's lock (its intent row, taken with a write that changes nothing), and a create's record of its batch is written only while nothing is decided, checked inside its own write. Two records of the same decision are read as that decision; two that differ are still refused, and only a writer of an earlier revision could make them. | The pure rules: two records of one decision read as one, and the round polls its batch; two that differ (another batch, or a presumption) are refused. |
| P1 | A search records a batch's first reading before its own record, under the reading's own name: a reading committed just before a decision went unseen by it, and a complete search that had been shown nothing presumed the create lost beside a proven, priced answer (134,000 counted with the 125,000 presumption, and the question asked again). | **The deciding search builds its record and its decision from the round as it stands inside its own write**, with the round's writes serialized: a reading committed before it is in what it sees, so its batch is the round's, never presumed lost. | Codex's schedule: just before S1, shown no batch, writes what it found, S2 proves B, records B's first reading, and stops before its own record. S1's decision names B, which is answered at 9,000; nothing is presumed, nothing asked synchronously. And the sixteenth round's slot test now holds S1 just before that write, not at a read, since the decision no longer reads the round outside it. |
| P2 | Imported copy bills take the ledger's mutable date in the daily spend (reproduced again). | **Not fixed; disclosed (§6, item 14).** | None. |

The record format is unchanged by the seventeenth round. Earlier tests were adjusted in five places, none weakened: four races that injected another pass's records, or held a pass, at a read of the round now do it where the code still makes that read, since the decision's own read now happens inside its write, uncounted (the stale search that stands down and the sixteenth round's slot test, now held just before the deciding write; the copy beside a presumption, and the hold that takes the outcome after it, one read earlier); and the sixteenth round's pure test of two records of one decision, which expected the record refused, now expects it read as one decision, with two that differ refused.

### Codex's eighteenth pass on `57b17f9a`: PASS WITH FINDINGS

No P0 and no P1: both of the seventeenth pass's P1 findings are closed. Codex confirmed that every write of the module goes through `writeEvent` or `writeFromRound` and takes the round's lock before the game's and the job's fences, the round read and the write; that the deciding search builds its event and its decision from the round read inside that transaction, so a reading committed before it gives its batch through the round's batches, and a candidate through its pending ones; that no path of the current code writes two different decisions, the create's included; that two records of one decision fold into one and two that differ are still refused; that the fallback waits for a pending candidate with no bypass beyond one named after the gate's own read; and that it found no other path that settles a possible charge at zero, releases it, drops a known bill or deletes a copy before its bill is in the record, nor any new create, cancel, link or deadline regression. On Postgres, with the production setup's Read Committed isolation and transaction pooling, an `UPDATE` takes the row lock even when it writes the value already there, and the round read after it sees every write committed before it. Its in-memory probes reproduced the two repaired schedules correctly; they do not stand for a run on Postgres, which no test here makes.

| # | Finding | Answer |
| --- | --- | --- |
| P2 | Imported copy bills take the ledger's mutable date in the daily spend (reproduced again). | **Not fixed; disclosed (§6, item 14).** |
| P2 | The local-patch worker's fence takes the job's row, then the game's; deletion takes the game's, then the job's: a lock cycle that Postgres resolves by aborting one, which is retried. It predates this branch. | **Disclosed (§6, item 22)** and proposed as a separate fix in the engine; the batch channel's lock adds no new order. |

Codex also sharpened two statements of §6 item 21, now corrected: the lock changes no stored value but is still a physical write, and fenced writes contend on the game's and the job's rows as well as on the round's.

### The round lock on PostgreSQL (17 October)

Codex's release review asked for the lock on PostgreSQL itself: two connections that really contend for one intent row. A probe of two requests through a connector had not overlapped. `quality-batch.postgres.test.ts` runs Codex's seventeenth-pass schedule through the product's own code on PostgreSQL 16.14 (a disposable local container; read committed, as on Supabase). It uses two clients of one connection each with `pgbouncer=true`, as production's runtime client, a third connection that only watches, and a scripted provider. W1 proves the batch and is held inside one of its round writes, its event written and not committed. W2's complete search was shown no batch, and its write records that and decides. Its schema is its own, dropped at the end. The file's PostgreSQL client is generated on the product's own Prisma runtime, so the product's own error checks see its errors.

| Case | What PostgreSQL showed (three runs) |
| --- | --- |
| W1 held inside the batch's first reading | W2 `active`, waiting on `Lock`/`transactionid`; `pg_blocking_pids` = W1; its statement the round lock (`UPDATE "AuditLog" SET "actorType" = $1 WHERE id = $2 AND actorType = $3`); its `ShareLock` on W1's transaction not granted; W1 `idle in transaction` after its `INSERT`. W2 waited 527–549 ms against a 500 ms hold, got the row 4 ms after W1 was let go, and decided from W1's reading: `found-1` names the batch, `submitted`, one decision, answered at 9,000 micro-USD, no Opus question asked synchronously, one create. |
| W1 held inside its own decision | The same wait (524–532 ms). W2 then recorded nothing: W1's `found-1` is the round's only decision. |
| Control: W2's round lock left out, as before `57b17f9a` | W2 never waited. It committed `found-1` deciding "presumed lost" while W1's reading was still uncommitted, and the reading then committed beside it: the contradiction the lock prevents. |

What this shows is the lock's own effect under PostgreSQL's row locks and read committed snapshots, on the code at `57b17f9a`. It does not cover Supavisor itself (a transaction pooler gives a transaction one server connection, which is all the lock needs), and it is not the engine's job/game lock cycle (§6 item 22), which remains a separate fix.
