# A ~$3 world: LOW paintings, both reviews on Batch (15 October 2026)

**Status.**
- Preparation only: no provider call, no paid render, no live database, no flag, no deployment.
- Everything runnable here is provider-free. The next paid step is a separate proposal (§7) and needs Guy's own approval.

**The brief** (Guy, 15 October):
- About $3 on average for a complete 27-hide world. One world may run a little over.
- Cost comes down over time, with quality and completion kept.
- Opus stays on quality and Sol on continuity. The Sol-quality experiment is not repeated.
- Savings come first from cheaper painting, cheaper channels and less rework.

**Where the files are** (private, git-ignored; Codex reads the worktree):
- `work/private-cost-analysis/`: the accounting tool, the export, the path model and the truncation measurement.
- `work/private-channels/`: the two-phase batch purchase prototype and its tests.
- `work/private-e4a-runner/`: the LOW experiment on all 27 hides.

Hashes are in §8.

## 1. The honest average per delivered world

**Definition.** Spend on every finished world, delivered or not, divided by the worlds delivered.
- **In the numerator:**
  - identity, every painting, both reviews, rejections, diagnoses, repairs and re-asks;
  - the whole spend of parked, failed, refunded and deleted worlds.
- **Worlds still in progress wait.**
- **Pending and unknown charges are reported apart, as money at risk.** They are never counted as zero.
- **Development experiments are a separate account** and never enter this average.
- **$3 is a target for the average, not a stop.** The $5 world budget, the $6 QA draft policy, retry limits and the daily ceiling stay as they are, as separate safety mechanisms.

**Where it stands today.** The current engine is v19 with dual review v3. The only finished world in this round's records (14 October) parked at 26 of 27 for $5.710087. No delivered world under this engine is recorded here, and the export settles whether there is one.
- Until one is delivered, the honest average is undefined.
- That $5.71 stays in the numerator. For example, with ten later worlds delivered at $3 each, the average is $3.57, not $3.00.
- So completion is part of the cost: the average reaches the target only as parked worlds become rare.

**The tool.** `world-ledger.ts --qa-export <file>`, fed by `qa-ledger-export.sql`.
- **Reads only the ledger.** That is each world's `WorldBudgetLedger` snapshot, the only complete record of what was bought. `npm run game:status` misses every Opus, Sol and identity-check charge.
- **The export is read-only.** It is one SELECT in a READ ONLY transaction, rolled back.
  - Every name is schema-qualified as `qa."…"`. An unqualified name would read the production tables.
  - It exports ledger snapshots and, for those worlds only, status, engine, payment, ready and delivery times, refund and the latest job step.
  - No owner, email, child, title, picture, configuration or amount paid.
  - **Not run in this round:** there is no database access here, and its SQL is reviewed but never executed. Whoever holds QA read access runs it.
- **What it reports:**
  - the honest average, overall and per engine (`styleVersion`);
  - the average over delivered worlds only;
  - spend on undelivered worlds and money at risk;
  - **measured** delivery hours, from payment to READY (median, p90, max);
  - each review role's use of its output cap, which gives the QA world's truncations (§4.2).
- **Self-test:** 7 of 7.

**Development spend, its own account:**

| Run | Recorded |
| --- | ---: |
| v16 | $6.548524 |
| v17 | $1.185629 |
| v18 | $0.424480 |
| pv19 | $1.245589 |
| E1 | $4.625959 |
| E2 | $1.225106 |
| E3 | $0.434724 |
| **Local ledgers since 12 October** | **$15.690011** |
| The real-photo test (documented, ledger not reopened) | $0.62 |
| **Total** | **≈ $16.31** |

- The local-ledger total is read from copies of seven local ledgers (`experiments-cost.json`).
- Earlier work, such as the 8 October Detectives validation, is documented in its own reports.

## 2. The judges

They do not change:
- **Opus 5.5 HIGH** asks the quality question.
- **Sol 6.1 HIGH** asks the continuity question, and both must accept.
- **E3 decided at stage one:** Sol HIGH is not a qualified quality judge (`CLAUDE_E3_RESULTS_20261015.md`). It is not run again.

## 3. The paths compared

**Model:** `paths.mjs`, output in `paths.json`.
- **Inputs.** It uses `world-cost.json`'s inputs unchanged:
  - the measured world (26 of 27);
  - the E1 and E2 prices;
  - the published discounts.
  The two paths in the brief reproduce its figures. Path A is $2.93. Path B is $2.63 here: the brief's $2.56 asks Sol only after Opus accepts, and B here asks both together in the first pass.
- **Rework** is every purchase beyond one painting, one Opus question and one Sol question per hide: repaints, re-reviews, truncation re-asks and the diagnosis.
- **Delivery time** comes from measured call medians (E1–E3):

  | Call | Median |
  | --- | --- |
  | Opus | 26 s |
  | Sol continuity | 72 s (p90 105 s) |
  | Painting | 18 s |

  - Today's pacing: one paid review per one-minute tick, and Sol outlives one tick.
  - **Batch queue time is ASSUMED, at 15–60 minutes a round.** Anthropic publishes "most batches within an hour, at most 24 h". OpenAI publishes "within 24 h, often sooner".

| Path | World | Batch rounds | Typical delivery | Worst case | Moving parts |
| --- | ---: | ---: | --- | --- | --- |
| P0 today: MEDIUM; Opus and Sol synchronous | $5.93 | 0 | ~1.8 h (modelled) | slow slices, retries | today's code |
| A: LOW synchronous, Opus on Batch, Sol on Flex | $2.93 | 2–3 | ~1–3 h | each Opus round up to 24 h; a Flex timeout is an unknown charge that holds the world | Anthropic batch adapter; Flex inside the 270 s slice |
| **A2: LOW synchronous, Opus and Sol on Batch, first pass in one round, 6 h deadline** | **$3.01** | 2 | ~0.7–2.2 h | ~8 h: at the deadline, every open question goes synchronous at standard price | one two-phase batch purchase, two provider adapters |
| H: A2, with rework asked synchronously | $3.34 | 1 | ~0.7–1.5 h | ~8 h | A2, plus today's synchronous path |
| B: A2, plus paintings and identity on Batch | $2.63 | 3 | ~0.9–3.1 h | ~8 h | A2, plus an images batch (see below) |

**Sensitivity.** A2's margin is thin. If LOW reworks more than the measured MEDIUM world did, A2 drifts over $3. That is the number E4a starts to measure (§7).

| More rework | A2 | B |
| --- | ---: | ---: |
| none (measured) | $3.01 | $2.63 |
| +20% | $3.12 | $2.73 |
| +50% | $3.30 | $2.88 |

**Why A2.**
1. **It meets "about $3" with the fewest moving parts.**
   - One purchase pattern covers both reviews.
   - No review call runs inside a serverless slice.
   - Sol's first-pass question is asked in the same round as Opus's. It costs $0.08 a world more than asking Sol after Opus accepts, and saves a whole round of waiting.
2. **Sol on Flex (path A) is the riskier half-price.** Flex runs synchronously inside a 270-second slice.
   - Sol already takes 72 s (p90 105 s) at standard, and Flex is documented as slower.
   - A 429 when Flex has no capacity is documented as unbilled.
   - A timeout is not: it becomes an unknown charge, which holds the world until a person reconciles it.
   - Batch costs the same as Flex and has no timeout.
3. **H misses the target ($3.34).** Rework at standard price costs $0.33 a world.
4. **B saves $0.38 more but adds the hardest part.** That part is an images batch:
   - multipart edits become JSON lines carrying image data, in files of at most 200 MB;
   - the painter's inputs, including the child's identity sheet, are held by the provider until deleted.

   Under the rule "don't add complexity for cents", B waits until the measured average under A2 is over $3.

   A2 also leaves something with the provider for a while. A review question carries the child's portrait, and a batch holds it until it is deleted, where a synchronous call does not. So the adapters delete each batch after reconciliation, and the privacy notice is checked before any batched world (§5.2).
5. **Delivery time stays close to today's,** if batch rounds take under an hour.
   - Today's reviews are serialized at one per minute: about 1.5 h for a world.
   - A batch round answers all 54 first-pass questions at once.
   - The tail is what changes. Without a deadline, a world could wait 24 h per round. **With a deadline, the worst case is bounded.** The 6 h here is a proposal.
   - Choosing the deadline, and accepting that a world past it pays standard price for what is left, is **an explicit product decision for Guy** (§6).
   - The FAQ promises no delivery time: "After payment is confirmed, the game is created and checked."

## 4. LOW on all 27 hides: E4a, and the truncated answers

### 4.1 The E4a runner

**What it runs** (contract pinned in `e4a-guard.ts`):
- **Painter.** gpt-image-2 LOW paints all 27 journey hides through the product's own v19 path:
  - prompt `local-patch-prompt/v19-fixed-scenery`;
  - `scene-integration-v8`;
  - `board-matched-identity/v5`;
  - the product's LOW policy, pinned by its SHA-256.
- **Child.** One **synthetic** child: identity A, age 6, a pinned sheet. No customer picture, and nothing derived from one, is read, painted or sent.
- **Checks.** The product's own checks accept or refuse each painting. A refused painting gets the product's second attempt, and only that.
- **The New York scenery check** is pinned to E2's restored pixels.
- **The gate:** stage B may be bought only when at least 24 of 27 hides have an accepted painting.
- **Stage A** (paintings) and **stage B** (reviews) are separate launches. Stage B is bought only when asked for and past the gate.
- **The reviews.** Stage B asks today's two questions, blind under opaque 8-hex wire ids (`candidate-binding/v2`):
  - Opus first;
  - Sol only where Opus accepted, and only on an answer that was read and not truncated.
- **Reuse.** Only fully matching requests are reused: a relaunch replays this run's own identical purchases (same world, key, fingerprint and scope) and buys nothing twice. Nothing is carried over from earlier runs.
- **Reports.**
  - An orderly report is written at every stop: complete, gated, stopped or refused.
  - Each report gives the money (committed, by world, against the cap), the rates (accepted, refused with the product's reason, rejected, unread, truncated, accepted by both) and contact sheets per board.
- **Guards.** Drift against the reviewed manifest is refused before the first purchase. So are a run lock held by another launch and a reservation that would pass the run's cap. Every world's worst case is admitted against the product's $5 budget.

**What it is, and is not.** A seam check alone does not qualify LOW's painting quality:
- **Stage A** shows how often the product's own checks accept LOW on all 27 hides, which is the rework the cost model needs.
- **Stage B** is the quality evidence: both qualified judges on every accepted painting.
- **The gate** only decides whether stage B is worth buying.

**Tests (provider-free):**
- **Self-test.** `selftest-e4a.ts` gives **55 of 55** in 22.5 minutes, on the pinned manifest (`logs/selftest-e4a-final-2.log`). An earlier full run (`selftest-e4a-final.log`) was cut off by a session restart at 41 checks, with no failure. It is kept as it is, not overwritten.
  - The sections are pins, blind, stage A, gate, stage B, money, R1, cap and lock.
  - A fake painter and fake reviewers run behind the product's real code paths.
  - The checks include: a refused painting gets attempt 2; a gate below 24 refuses stage B; a relaunch replays everything; a charge past its reservation holds its world; and drift before or after a stop is refused with zero purchases.
- **Mutations.** `mutate-e4a.cjs` gives **17 of 17**, each caught by its own check, in 41 minutes (`logs/mutate-e4a.json`). Each mutant disables one guard. The originals are restored and verified by hash.

### 4.2 The truncated answers

**Method.**
- **Data.** Every paid review in the seven local ledgers carries its raw usage: 202 answers. `truncation.ts` produces `truncation.json`.
- **Caps.** Opus `max_tokens` 6,500; Sol `max_completion_tokens` 4,096.

| Review | Answers | At the cap | Reasoning: mean / p90 / max | Visible answer: mean / p90 / max |
| --- | ---: | ---: | --- | --- |
| Opus quality | 83 | 0 | 757 / 1,383 / 1,932 | 1,073 / 1,184 / 1,319 |
| Sol continuity | 55 | 1 | 1,568 / 2,444 / 4,096 | 593 / 809 / 890 |
| Sol quality (E1 MEDIUM, E3 HIGH) | 64 | 0 | 205 / 426 / 1,898 | 577 / 728 / 815 |

**What the answers show:**
- **The visible answer is never what runs out.**
  - Sol's longest visible answer is 890 tokens, 22% of its cap.
  - The one truncation (E3, R13 "shifted legs") spent all 4,096 tokens on reasoning and returned no text at all.
  - The QA world's 5 truncations of 31 also ran out on reasoning (`CLAUDE_REVIEW_COST_PLAN_20261014.md`). Each was re-asked once, and all five recovered.
  - **So shorter or more structured answer fields cannot prevent this.**
- **Opus never came near its cap.** Its longest output was 3,251 of 6,500. No change.
- **What truncation costs.** In the QA world it was 5 extra Sol questions:
  - about $0.18 a world at standard, $0.09 on Batch;
  - about 3% of a $3 world.

  Under A2 a re-ask joins the rework round, so it adds no waiting.
- **The QA world's own 5 answers** are in its ledger. The export's review-output report (§1) counts them once it is run.

**Three options that keep reasoning effort HIGH:**
1. **Recommended now: re-ask a reasoning-only truncation with more room.**
   - **What changes.** A Sol answer that hits its cap with no visible text is re-asked once, with the same question, images, model and effort, at `max_completion_tokens` 8,000. That is the cap the product's other Sol HIGH calls already use: board judge, pose observer, sprite landmarks.
   - **What stays.** First questions keep 4,096 and their $0.066 reservation. Only the re-ask reserves more: 10,016 × 2.5 + 8,000 × 10 = $0.105.
   - **What it needs:**
     - a new pinned review release for the re-ask (its fingerprint changes);
     - Codex's review;
     - a one-question check on R13, about $0.05–0.09.
2. **Later, with requalification: trace only the people the patch can touch.**
   - **Why.** Today's crowd inspection traces every visible person in the context. A person entirely outside the painted window is original board pixels, which the patch cannot change.
   - **The change.** Asking for traces only of people who intersect the window or cross its four joins cuts the reasoning and the trace text where truncation happens: crowded boards.
   - **What it needs.** It is a new question, so it is requalified on the E1/E3 controls (cuts, shifted legs, orphan limbs) for about $1–2.
   - **The saving** is at most about $0.1–0.2 a world at Batch prices.
3. **Later, bundled with option 2 if review cost becomes binding: compact visible fields.**
   - **The ceiling** is about 5% of review spend (`CLAUDE_REVIEW_COST_PLAN_20261014.md`).
   - **The limit:** it does not touch reasoning-only truncation.

## 5. The discounted channels

### 5.1 Verified support and prices (read 15 October 2026)

| Purchase | Model | Endpoint | Standard | Batch | Flex | Source |
| --- | --- | --- | --- | --- | --- | --- |
| Quality question | `claude-opus-5-5` | Message Batches (`/v1/messages/batches`) | $4 / $20 per M | **$2 / $10** | — | Anthropic pricing and batch documentation |
| Continuity question | `gpt-6.1-sol` | Batch `/v1/chat/completions`; Flex `service_tier: "flex"` | $2 / $10 per M (the product prices input at $2.50) | **$1 / $5** | $1 / $5 | OpenAI pricing page |
| Painting, identity | `gpt-image-2` | Batch `/v1/images/edits` (the model page lists `v1/batch`) | text $5, image $8, output $30 per M | **half** | not offered | OpenAI pricing page; the gpt-image-2 model page |

**What each provider documents:**
- **Anthropic.**
  - Errored, canceled and expired requests are not billed.
  - `custom_id` must match `^[a-zA-Z0-9_-]{1,64}$`.
  - Results arrive unordered and stay available for 29 days.
  - Most batches finish within an hour, and every batch within 24 h.
- **OpenAI Batch.**
  - Supported endpoints include `/v1/chat/completions` and `/v1/images/edits`.
  - A batch holds up to 50,000 requests in a file of at most 200 MB.
  - Output order may differ from input order; results are matched by `custom_id`.
  - Only completed requests are charged. Unfinished requests of an expired batch are cancelled and written to the error file.
  - Output files are deleted 30 days after completion. A cancel finishes in-flight requests, for up to 10 minutes.
- **OpenAI Flex.**
  - It is billed at Batch rates.
  - Only "429 Resource Unavailable" is documented as unbilled.
  - A request timeout of 15 minutes is recommended.
- **Not yet verified:** how image inputs and the mask are passed in a batched edit. The JSON form (`images: [{image_url | file_id}]`, `mask`) is described by third parties, while OpenAI's reference page refused the fetch. This only matters for path B.

### 5.2 The two-phase purchase (prototype)

`work/private-channels/batch-purchase.ts`, with `selftest-channels.ts` at **33 of 33**. It runs against the product's real `WorldBudget` class and type-checks clean. `mutate-channels.cjs` disables one rule at a time, and its own check catches **14 of 14**; the original is restored and verified by hash.

**How a purchase is split:**
1. **Submit.**
   - Write the round's intent, with an opaque round id and opaque `custom_id`s derived by hash, so the provider never sees a game id or a request key.
   - Reserve every question. A round is refused before anything is reserved if its sum passes the world's budget, if the world is held, or if a key is already in the ledger.
   - Then create the batch and record its id.
   - The create is called only after every reservation exists, and the intent exists before the first reservation. So a missing reservation on a resume **proves** nothing was created.
   - With every reservation present, only the provider can tell, and **only a proven absence allows a create.** OpenAI is checked by the round's metadata; Anthropic by the custom ids in ended batches' results.
   - Two batches for one round hold every item as unknown.
2. **Poll, on later ticks.** A running round is left alone until its deadline. At the deadline it is cancelled once.
3. **Reconcile, once the batch has ended.** Results are matched only by custom id.

   | Result | What happens |
   | --- | --- |
   | Exactly one success | retained with its bill, then settled |
   | A missing result, a duplicate, the wrong model, or a success without usage | **unknown**: held, never re-bought |
   | Errored, canceled or expired | settled at zero as documented-unbilled, with the provider's result as evidence |

   - After an unbilled result the question may be asked again, under a new key, in the next round or synchronously.
   - The exception is an invalid request, which is never resubmitted unchanged.
4. **Accounting by the tier actually served.**
   - Batch rates apply only when the result says the batch tier served it. Anthropic reports `usage.service_tier: "batch"`. What OpenAI reports is for E5 to establish.
   - Anything else is priced at standard and flagged, so the ledger may overstate and never understates.
   - The rate card reproduces recorded bills exactly:
     - Opus 109,704;
     - Sol 36,188;
     - the LOW painting 17,814.
   - Batch amounts are half of each.

**What the product would need later** (not in this round):
- a durable round table (a migration, QA first);
- batch rates in the pricing; today's Opus pricing refuses any `service_tier` other than standard, which would make every batch answer an unknown charge;
- the review stage reorganised into rounds, with the deadline fallback through `purchaseOnce` under new keys;
- real adapters for Anthropic batches and for OpenAI files and batches. After reconciliation they delete the provider's copies: the Anthropic batch, and OpenAI's input and output files. A review question carries the child's portrait, so the privacy notice is checked as well;
- Codex to confirm that a zero settlement under `provider-billed` with the result as evidence is the right basis, or to add a third basis.

### 5.3 Waiting time

| | Delivery |
| --- | --- |
| Today (modelled) | ~1.8 h a world |
| A2, typical (ASSUMED queue) | ~0.7–2.2 h |
| A2, worst, with a 6 h deadline | ~8 h |

Batch queue times are the one number no document gives, and they decide whether A2 lengthens creation. E5 (§7) measures them.

## 6. Decisions for Guy

1. **The delivery deadline** for a batched world:
   - **Proposed:** 6 h.
   - **The trade:** past it, the world's open questions are asked at standard price.
   - **The alternative:** with no discounted channel at all, a LOW world stays at about $5.12. Of that, $3.19 is Opus, the largest single cost; Batch halves it.
2. **B, the paintings on Batch,** stays parked until the measured average under A2 is over $3.
3. **The next paid experiment:** §7.

## 7. The recommendation

**Preferred path: A2.** LOW paintings synchronous, Opus quality and Sol continuity on Batch through one two-phase purchase, the first pass in one round, rework in a second, and a deadline fallback.

**Proven:**
- the prices and support in §5.1;
- the judges, qualified and unchanged;
- LOW's price per painting, $0.0179 (n = 6);
- the measured world's multipliers, for MEDIUM;
- the purchase design, provider-free (33 checks, 14 of 14 mutants caught);
- the accounting and the export;
- the measured call latencies.

**Assumed:**
- LOW's rework on all 27 hides. Six paintings are not a rate: 5 of 6 passed the seam check, and 5 of 5 were accepted by the reviews.
- Batch queue times.
- That a batched answer is the same decision as a synchronous one. It is the same model and the same request, but that is still a sample.
- OpenAI's served-tier field.

**The next small, decisive experiment: E4a stage A.**
- **What:** 27 LOW paintings of the synthetic child through the product's v19 path, with the product's checks and its second attempt.
- **Cost:**
  - expected about $0.55;
  - about $1 even if every hide needs both attempts (54 × $0.018);
  - the runner's hard cap is $5, shared with stage B.
- **Requested approval: up to $1.50, stage A only.**
- **Why it decides:**
  - Fewer than 24 of 27 accepted by the product's own checks takes LOW off the road to $3, for $1 instead of $4.
  - Past the gate, its rates replace the six-painting screen in the cost model.
- **Then, as separate proposals:**
  - **Stage B,** the quality evidence:
    - at standard prices, about $3.6, within the same $5 cap;
    - or, once Codex has passed the batch purchase and real adapters are built, through Batch for about $1.9. That doubles as the channel test at product scale: 27 Opus and about 24 Sol questions in real batches, their queue time and their tier fields.
  - **E5,** a small channel contract test before anything batched runs:
    - 4 Opus and 4 Sol requests already answered synchronously in E1 and E3, re-asked through each batch API, for about $0.30 (cap $1);
    - it checks the served tier, the batch price, queue time, the custom id mapping, cancel semantics, and agreement on clear cases.

## 8. Files and hashes

| File | SHA-256 |
| --- | --- |
| `work/private-cost-analysis/world-ledger.ts` | `871b7ce555c88eef…` |
| `work/private-cost-analysis/qa-ledger-export.sql` | `cd2efc4e5d36a4e2…` |
| `work/private-cost-analysis/experiments-cost.json` | `66f76a15bdf1d9ef932199c43bbb120829998dc215b4a510e669ddc57e452c01` |
| `work/private-cost-analysis/paths.mjs` / `paths.json` | `4f8a123d5cfe4b39…` / `91d992b8391ac543…` |
| `work/private-cost-analysis/truncation.ts` / `truncation.json` | `3a240a65fcb0d40d…` / `f3eb1e1587ae0646…` |
| `work/private-channels/batch-purchase.ts` / `selftest-channels.ts` / `mutate-channels.json` | `18bc2d09e49d54f8…` / `6f28168d2b5cacaf…` / `aecf98ae37cded9b…` |
| `work/private-e4a-runner/` `e4a-run.ts` / `e4a-guard.ts` / `run-e4a.ts` / `run-e4a.ps1` | `9fd521bf2e12c323…` / `3d9e306c6717a38f…` / `072bd7a80c7f739d…` / `59ff6c445f026324…` |
| `work/private-e4a-runner/` `manifest-e4a.json` (effective binding `82776c940e438e83`, matches the dry run) | `14c4fdc7691a1a17…` |
| `work/private-e4a-runner/` `selftest-e4a.ts` / `logs/selftest-e4a-final-2.log` | `9c0fd53f9b3dad1d…` / `8424d156990fe1ab…` |
| `work/private-e4a-runner/` `mutate-e4a.cjs` / `logs/mutate-e4a.json` | `76b1d40d21ccbad8…` / `28adba77d460d54b…` |
