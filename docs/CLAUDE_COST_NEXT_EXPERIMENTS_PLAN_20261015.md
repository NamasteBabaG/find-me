# The road to a $2 world: cost model, next experiments, morning recommendation (15 October 2026)

**Status: preparation only.** No provider call was made for this document.

- Nothing was rendered or judged, and nothing was deployed. No default or flag changed.
- Every dollar figure is labelled as one of:
  - **MEASURED:** a recorded conservative estimate, reconciled against usage, not an invoice;
  - **PUBLISHED:** a provider's price page, read on 15 October 2026;
  - **ASSUMED.**
- E1/E2's unused headroom is not a grant for anything below.

It answers Codex's 15 October return brief and the overnight brief in `work/codex-cost-results-review-20261015/`. It builds on:
- `docs/CLAUDE_COST_EXPERIMENTS_RESULTS_20261015.md` (E1/E2);
- `docs/CLAUDE_REVIEW_COST_PLAN_20261014.md` (the measured world).

## 1. The answer, for the morning

**A complete 27-hide world is projected at about $5.93 today:**
- This is a projection, not a measured complete world. The first full v19 QA world published 26 of 27 hides for $5.710087 in recorded conservative estimates; the figure extends that to 27.
- Reviews are 73% of it: Opus quality is $3.19 and Sol continuity $1.13.

**The published discount channels and LOW paintings bring the projection to about $2.56:**
- **Flex for Sol** halves Sol and stays synchronous.
- **Batch for Opus and for the painter** halves both, but is asynchronous.
  - Most batches finish in under an hour.
  - A request can expire unprocessed after 24 hours; expired requests are not billed.
  - A world needs several batches in sequence: painting, quality, continuity, repairs.
  - So Batch promises no delivery time.
- **The channels keep the model, effort, evidence and acceptance criteria as they are.** That keeps the intended task. It does not guarantee identical decisions: every answer is a sample. Before any use, the served tier, the payload, the billing and the recovery need contract tests.
- What remains is engineering, plus Guy's call on delivery time.
- **LOW is a separate quality change, not a transport one.** It needs checking at scale: E2 tested six paintings.

**The last step to about $2 needs a cheaper quality judge that qualifies.**
- With Sol HIGH replacing Opus, the model gives **$1.90–2.27** a world. The range is set by Sol HIGH's real price and how many paintings it rejects.
- **E3 decides this.** Its stage one, about $0.77, decides it outright if Sol HIGH misses a known defect.

**What does not get there:**
- **Prompt caching:** at most about 8% of an Opus question, and E1 never saw a cache hit.
- **Shorter answers:** about 5%.
- **A cheap pre-filter:** a net loss at the measured rejection rate.
- **Selective escalation behind Sol MEDIUM:** unsafe on E1's evidence.

**The order recommended:**
1. **Approve E3.** The cap is $4; the expected cost is about $0.8 if Sol HIGH fails stage one, $2.6 if it qualifies.
2. **Engineering, provider-free:**
   - a Flex adapter for Sol first, worth about −$0.60 a world, with Sol's model, effort and evidence unchanged, contract-tested with no live call;
   - Batch adapters for Opus and the painter, only if Guy accepts an open-ended delivery time: several sequential batches, each of which can expire after 24 hours.
3. **E4a:** LOW on all 27 hides, free checks and a visual review, cap $1.20.
4. **E4b:** one complete world, measured end to end, only in a configuration forecast well under its cap:
   - Sol HIGH quality, if E3 qualifies it: forecast $2.27, proposed cap $4;
   - not the synchronous Opus configuration, whose $4.53 forecast a $4 cap would stop.

## 2. A complete 27-hide world: the calculation

**Sources:**
- The script is `work/private-cost-analysis/world-cost.mjs`, with output in `world-cost.json` (SHA-256 `4adae322…`).
- Inputs come from three places:
  - the first full v19/dual-v3 QA world (14 October, read from its ledger in `CLAUDE_REVIEW_COST_PLAN_20261014.md` §1);
  - E1/E2;
  - the price pages.

### Inputs

| Input | Value | Kind |
| --- | --- | --- |
| Hides accepted in the measured world | 26 of 27, for $5.710087 | MEASURED |
| Paintings / Opus questions / Sol questions / diagnoses | 30 / 30 / 31 / 1 | MEASURED |
| Per accepted hide: paintings, Opus, Sol, diagnosis | 1.154, 1.154, 1.192 (5 truncation re-asks), 0.038 | MEASURED (one world) |
| MEDIUM painting | $0.0473 (E2 MEDIUM: $0.0471) | MEASURED |
| LOW painting | $0.0179 | MEASURED, n=6 |
| LOW seam pass | 5 of 6 | MEASURED, n=6, not a rate |
| Opus 5.5 HIGH quality question | $0.1024 (E1: $0.1052) | MEASURED |
| Sol 6.1 HIGH continuity question | $0.0351, truncations included (E2: $0.0293) | MEASURED |
| Sol 6.1 HIGH **quality** question | $0.06 ($0.05–0.07) | ASSUMED: E3 measures it |
| Self-repair diagnosis (gpt-5.6-sol) | $0.056 | MEASURED |
| Identity sheet and its check | $0.0736 | MEASURED |
| Sol 6.1 Flex / Batch | half of Standard ($1/$5 per M vs $2/$10) | PUBLISHED |
| Opus 5.5 Message Batches | half ($2/$10 per M vs $4/$20) | PUBLISHED |
| gpt-image-2 Batch | half; no Flex | PUBLISHED |

**Correction:** the identity stage is $0.0736. Earlier documents, mine and Codex's `cost-economics.py`, used "identity $0.13", which also held the world's one self-repair diagnosis. The results document is corrected.

### The $2 bar

$2 minus identity, over 27 hides, is **$0.0713 per accepted hide**, every retry included. Today a hide costs $0.2168.

### Scenarios (not measured worlds)

| Configuration | Per hide | World |
| --- | ---: | ---: |
| Today: MEDIUM, Opus, Sol (projected from the measured 26 of 27 world) | $0.2168 | **$5.93** |
| + Sol on Flex | $0.1948 | $5.33 |
| + LOW paintings | $0.1650 | $4.53 |
| + Opus on Batch | $0.1059 | $2.93 |
| + paintings on Batch: today's judges, every published discount | $0.0935 | **$2.56** |
| Sol HIGH quality (if qualified), LOW, Sol on Flex | $0.0814 | $2.27 |
| Sol HIGH quality, LOW on Batch, Sol on Flex | $0.0690 | **$1.90** |
| the same, Sol HIGH at $0.07 a question | $0.0748 | $2.06 |
| the same, 20% more review rounds | $0.0828 | $2.27 |
| the same, LOW passing the seam check 2 times in 3 | $0.0721 | $1.98 |
| One combined Sol HIGH review (unqualified hypothesis) | $0.0539 | $1.49 |

**Retry accounting.** Every purchase is multiplied by how often it repeats per accepted hide in the measured world:
- **Paintings and Opus:** 4 of 30 paintings were rejected.
- **Sol:** 5 of 31 answers hit the 4,096-token cap and were re-asked.
- **Diagnosis:** one per world.
- **A LOW painting the seam check refuses** costs only another painting: no review is bought for it.
- **Rejection rates for new configurations** are not measured. The "20% more review rounds" row shows the sensitivity.

**What the figures exclude, and why:**
- **Reservations are not spend.** A world reserves $0.25 for an Opus question, $0.066 for Sol and $0.12 for a painting. These figures count only what was recorded.
- **Unknown charges are not modelled, and they are money at risk.** A purchase that timed out or lost its connection may have been billed. It keeps its conservative hold, and nothing more is bought until it is reconciled. It also stalls delivery.
- **Hosting, payment fees, tax and shared board creation are excluded.**
- **The rate card is conservative:**
  - it prices Sol input at $2.50 per million where the published rate is $2.00;
  - so every Sol figure here is about 6–7% above the published price.

## 3. What the existing evidence says, for free

**1. Composition of a review question** (`work/private-cost-analysis/composition.ts`):
- **Method.** It rebuilds the exact requests with the reviewed builders. It counts tokens with the product's own published-rule estimator. It subtracts E1's real bills.
- **An Opus quality question:**
  - is 16,508 input tokens (median), of which images are 11,646 (70%);
  - carries 12 images:
    - the board, 1,705 tokens;
    - the portrait, 361;
    - BEFORE, 1,120;
    - AFTER, 1,680;
    - four return views, 3,780;
    - four join views, 3,000.
  - **The eight edge views are 41% of its input, about 26% of its price.** This is the largest input lever, and it is a review-strength change (§4).
- **The Sol continuity question** is 6 images, 2,946 tokens.

**2. Caching is not a lever.**
- Two hides of the same child share only the first 4.4 KB of the 8.8 KB prompt (any two hides: 0.9 KB). The per-hide images come after it.
- **What it could save on Opus:** a cached prefix would save about 8% of the question. Reordering to share the portrait and board too would save at most 13–14%, and that reordering is a new question version.
- **Sol never hit the cache.** E1's Sol J1 and J2 requests for the same control were sent about 18 seconds apart (`run.log`), with prompts identical up to the last sentence, and J2 read 0 cached tokens. So did all 98 E1/E2 reviews (Codex's decomposition).
- No saving here assumes caching.

**3. Sol MEDIUM's misses are systematic, not random:**
- R5 (wrong support) and R10 (age) were missed by all three Sol MEDIUM variants.
- R4 (floating toy) was missed by two of them, R3 by one.
- They reasoned about 100 tokens a question.
- E3's stage one asks Sol HIGH these first.

**4. Lean evidence is neither shown to hurt nor to help.**
- Sol MEDIUM full and lean caught 6 of 11 each. Lean caught R4 where full missed it, and missed R3 where full caught it.
- At this n they are indistinguishable.

**5. A cheap pre-filter loses money.**
- A cheap reviewer that rejects early saves the expensive review only on what it rejects. That is 4 of 30 in the measured world: about $0.014 of Opus per painting, against $0.043 for Sol MEDIUM on every painting.
- Escalating only what the cheap reviewer doubts is unsafe on E1's evidence: Sol MEDIUM passed 5–6 of 11 known defects.

**6. A combined review saves at most the continuity call:**
- about $0.04 a hide, synchronous, or $0.02 on Flex;
- it gives up the second, independent look;
- it is a hypothesis that needs its own qualification.

**7. Exact reuse:**
- **E1's 21 Opus answers** are reused by E3, only for byte-identical requests. E1's ledger is pinned by hash and read from a copy.
- **E1's Sol MEDIUM answers** cannot stand for Sol HIGH: effort is in the fingerprint.
- **E2's six LOW paintings** (children A-a6 and B-a6, on NY-1, GW-1 and AM-3) can stand in E4a only where the complete painting request is identical.
- Nothing existing answers Sol HIGH on quality, or continuity on the controls.

**8. Published channel prices,** read on 15 October 2026 from the OpenAI pricing and flex pages and Anthropic's batch page:
- **Sol 6.1:** Flex and Batch at $1/$5 per million, Standard $2/$10. Only Flex's documented 429 "Resource Unavailable" is stated as unbilled. That is not every 429, and not every missing receipt.
- **Opus 5.5:** Batch at $2/$10, Standard $4/$20; vision and thinking are supported in batches. Errored, canceled and expired batch requests are documented as unbilled.
- **gpt-image-2:** Batch at half price on image edits; no Flex.

## 4. Cheaper judging, compared: nothing assumed safe

| Option | Saving a world (from today's $5.93) | Quality risk | What decides it | Cost to decide |
| --- | ---: | --- | --- | ---: |
| Sol on Flex | −$0.60 | low: same model, effort, evidence and criteria; answers are samples, so decisions are not guaranteed identical | contract tests of the served tier, payload, billing and recovery; Flex's 429 rate and latency | $0 to build; a later QA observation, not authorized now |
| Opus on Batch | −$1.60 (with LOW) | low, as above | the same contract tests; Guy's call on an open-ended delivery time | $0 to build |
| Painter on Batch | −$0.37 (LOW, identity sheet included) | low, as above: a painting is a sample too | the same contract tests | $0 to build |
| LOW paintings | −$0.80 | medium: one in six refused, six samples | E4a at scale, then E4b | ≤ $1.20, then ≤ $4 |
| Sol HIGH replaces Opus on quality | −$1.3 synchronous; −$2.3 with Sol on Flex | high: Sol MEDIUM caught 6 of 11 | E3 | ≤ $4 (stage one ~$0.77) |
| Leaner evidence (fewer or smaller edge views) | ≤ −$0.83 (Opus, synchronous) | medium-high: the edge views exist for joins | a new question version on control set v2 | ~$2.5 |
| Shorter visible answers | ~−$0.28 | low-medium | the same qualification | (with the above) |
| Prompt caching (reordered question) | ≤ −8% to −14% of Opus | low, but it is a new question | not worth a run now | — |
| Cheap pre-filter | net loss | — | arithmetic, §3.5 | free |
| Escalate only what a cheap judge doubts | — | unsafe on E1's evidence | E1 | free |
| One combined Sol HIGH review | a further −$0.41 below Sol HIGH + continuity | high: no second look | its own qualification, only after E3 | later |

## 5. Control set v2 (pinned for E3)

E1's 21 controls are kept with their labels and wire IDs. Each gets a tier, and three gate controls are new.

| Tier | Controls |
| --- | --- |
| gate (decides) | 8 good (G1–G8); 12 rejects (R1–R6, R8–R10, R12, R13, R14) |
| hard (read, reported, never decides) | R7: the flat boundary in G4's hair, next to the flowers |
| observe-only | R11 (its age label is not visual ground truth); O1; O2 |

**The new gate controls:**
- **R12, cut head (wire `6238b3f2`).** G3's head is returned to the board from above the hair to below the nose; an isolated lower face remains. Codex confirmed it as unequivocal. Bytes `36ff26de…`.
- **R13, shifted legs (wire `e8723edc`).** It replaces the first draft's torso band (wire `a20a1435`, never bought). Codex's control preview showed that band reads as a child behind flowers, which is allowed occlusion.
  - On New York, any band returned to the board shows a plank, a pot or flowers.
  - So the new construction is `shift-rect/v1` (`e3-guard.ts`): G2's legs from mid-thigh to the shins move 28 px sideways (rectangle 196,598,140×78) and meet neither the hips nor the shoes.
  - No object in front explains it.
  - Bytes `0bdefc4c…`. It was checked by eye at the judge's own view (`dry-run/evidence/R13-shift-legs-G2/after.png`).
- **R14, age (wire `0379ff12`).** G4's ten-year-old, judged as a stated three-year-old. It replaces R11 in the gate.

E1's labels, receipts and scores are untouched.

## 6. E3: Sol HIGH on quality, and the whole live pair, staged

**Prepared and dry-run. Not run.** The runner is in `work/private-e3-runner/`, git-ignored.

### What it asks

**Three roles, each in its own world:**
- **Q0:** today's Opus HIGH quality question.
  - E1 settled 21 identical requests; they are reused, fingerprint by fingerprint, from a copy of E1's pinned ledger.
  - Only 3 are bought: R12, R13 and R14.
- **Q1:** Sol 6.1 HIGH asked today's quality question, full answer.
- **C:** today's continuity question (Sol HIGH).

That is **51 questions**. All are built by the reviewed builders on the opaque wire ID; no label reaches a judge.

**The selftest checks what is sent:** it captures the outgoing body of all 72 built questions and finds no ID, label, tier, reason or file name.

### Stage one

Stage one is 13 questions, about $0.77, bought first:
- **The cut test, whatever the candidate does.**
  - It puts today's pair on R6, R7, R12 and R13: Q0 on R12 and R13, and C on all four.
  - This answers Codex's correction 2: does the complete live decision path catch unequivocal cuts?
- **Q1 on R5, R10, R4, R3, R14, R12 and R13**, in that order: Sol MEDIUM's misses first.
  - The run is decided at Q1's first miss: a verified reject not caught on its class's check with a located fault, an unreadable answer, or a truncated one.
  - One such miss disqualifies Q1 under the pinned absolute rule, and nothing more is bought.
  - A decided run reports Q1 as not qualifying, and the cut test.

### Stage two

Stage two is the other 38 questions, about $1.8.

### Qualification, against the gate tier only

**Q1 alone (E1's rule):**
- every gate good passed;
- every gate reject caught on its class's check with a located fault;
- nothing unread or truncated.

**Each pair, as the live gate decides** (ship only if quality accepts AND continuity passes):
- every gate good shipped;
- every gate reject caught by quality, or, for a cut figure, by a located continuity repair;
- nothing unread, unresolved or truncated.

**Reported but never deciding:** the hard and observe-only rows, each role's cost and token profile, and Sol HIGH's real price per question.

### Money, caps and stops

**Estimates:**
- **Stage one:** about $0.77.
- **Full run:** about $2.4–2.9.
  - Q1 is about $0.06 × 24; Sol HIGH quality has never been measured.
  - C is about $0.035 × 24.
  - Q0 is about $0.104 × 3.

**Proposed cap: $4.** It is the run's reservation limit, spanning its three worlds; each world stays far under the product's $5.

**Before the first purchase, the run checks:**
- the manifest and the product versions;
- the effective binding: sources, runner and E1 builder files, pictures, boards, hides, every question's fingerprint, and E1's ledger;
- the reuse plan;
- admission: every question's maximum charge must fit its reservation, and every world's worst case the product's budget.

**It stops on:**
- a reservation that would pass the cap;
- any charge past its reservation (the world is held and nothing qualifies);
- an open or unknown charge;
- drift in the binding, on resume too;
- a second launch.

**Money is settled before anything qualifies.**

### Bound inputs

| Input | SHA-256 |
| --- | --- |
| `manifest-e3.json` | `7b708217ba39c745e63c9883726f3a5e7ca05fd86713245636f8b4086e562312` |
| effective binding (`dry-run/effective-binding.json`) | `b62ea01bfd83952ebe1989832117cae759a393202314026f5f563349d3f909d6` (binding digest `ce7aad46e74d34a2`) |
| E1's ledger, reused from a copy | `43a5c78d22f24df0c45d29f14da9e35de89f892d0e36d7ed8230087cc0da7627` |
| `e3-guard.ts` | `4e9243e8484cadc6789f7844351aa7dd4e3ff79265115e6a024b9b6164c3cddd` |
| `e3-run.ts` | `09c461530201a2c66c728148f4fd2ed9c5c305e050584cac36dcee858dd4db65` |
| `run-e3.ts` | `a2a64b0ba53eaa8c60a83a988d03d9b96c8c3fc422d2a4192a3bd1e6007faea4` |
| `run-e3.ps1` | `36a0e9e7148ff1810ab97ae0ab67dfc579c6b3299dc3a6d0de95a6d8bd53d0a7` |
| `binding.ts`, `run-guard.ts` (copies Codex reviewed) | `a84e3b42…`, `de249a64…` |
| R12 / R13 built pictures | `36ff26de…`, `0bdefc4c…` |

### Checks

**The dry run matches the manifest:**
- 21 Q0 answers reused as planned, 3 to buy;
- 51 questions admitted;
- the largest maximum charges are Q0 227,632, Q1 125,025 and C 62,475 micro-USD, against reservations of 250,000 and 66,000;
- the worst worlds are Q0 0.71, Q1 3.10 and C 1.48 dollars, against the product's $5.

**The selftest and the mutation check:** see §10 for their final results.

## 7. E4: LOW at full scale, reshaped into two steps

**Why it is reshaped:**
- Codex's version was one complete LOW world with today's two reviews. That forecasts about **$5.1**: 27 × ($0.0248 + $0.1182 + $0.0418 + $0.0022) + $0.07.
- About 85% of it would buy reviews in a configuration §2 says must change anyway.
- What LOW still has to prove is cheaper to learn first.

### E4a: LOW on all 27 hides, free checks only (prepared as a specification; runner not yet built)

**What it paints:**
- One synthetic child: identity A-a6, the v16 controlled sheet, the same one E2 used.
- All 27 journey hides (9 boards × 3), with gpt-image-2 LOW, through the product's `renderLocalPatchHide`.
- The prompt release is v19, the same as E2.

**What judges it:**
- the product's free deterministic join check, with `LOCAL_PATCH_PLAYER_REVIEW=on`, as in QA;
- contact sheets for Codex and Guy to inspect;
- **no paid review.**

**What it measures:**
- LOW's seam-pass rate on 27 hides (E2 had 6);
- its visual acceptability on every board: style, identity, scale and placement.

**Reuse:**
- E2's three LOW paintings of A-a6 (NY-1, GW-1, AM-3) are reused only where the complete painting request fingerprint matches E2's ledger.
- Everything else is bought.

**Money:**
- **Forecast:** 24 new paintings × $0.0179 ≈ $0.43, plus repaints.
- **Cap: $1.20.** That allows one repaint per seam refusal and nothing more.

**Stops:**
- more than 8 seam refusals among the first 27 paintings: LOW is not viable at scale on this evidence;
- any unknown charge or overrun;
- drift;
- the cap.

**Nothing is published.**

### E4b: one candidate world, measured end to end (specified; built after E3)

**How it runs:**
- **Code path:** the product's own world runner (`runLocalPatchWorldSlice`, with the painter injected), in a private runner with a SQLite database and DB storage. The provider-free test `local-patch-dual-world.test.ts` already runs a 27-hide world this way.
- **Identity:** a pre-built synthetic identity sheet, so no customer photograph is used. E4b therefore does not measure identity generation: its identity line carries the measured world's $0.0736, allocated, not measured again.
- **Judges:** the configuration chosen after E3:
  - Sol HIGH quality with Sol continuity, both on Flex; two questions to one vendor, which Guy decides;
  - or, if Sol HIGH fails, Opus quality with Sol continuity on Flex.
- **Painter:** LOW.

**What it measures:**
- the complete world: identity, every painting, review, rejection, re-ask, truncation and repair;
- the price per completed world;
- delivery time.

**Publication criteria are the product's own:**
- all 27 hides accepted by both reviews, each with a publication record for exactly its pixels;
- a clean ledger.

They are evaluated locally. Nothing is published or emailed.

**Forecast and cap.** E4b runs only in a configuration forecast well under its cap:
- **Sol HIGH quality (only if E3 qualifies it), Sol on Flex, LOW:** forecast $2.27; proposed cap $4.
- **Opus with Sol on Flex and LOW, synchronous: not proposed.** Its forecast is $4.53. A $4 cap would stop it before completion, and the product refuses a world past $5. It becomes a candidate only once the Opus Batch adapter exists: forecast $2.93, cap $4.
- **A run that reaches its cap stops.** It reports what it bought and claims no completed world.

**Stops:**
- the cap;
- any unknown charge or overrun;
- drift;
- a hide failing its third attempt;
- any repair cycle past the second.

## 8. Engineering for the channels: contract-tested provider-free, no live call authorized

**1. A Flex adapter for Sol** (`service_tier: "flex"`), worth about −$0.60 a world. It needs:
- **A rate card priced by the tier actually served.** The response carries `service_tier`.
- **Only Flex's documented 429 "Resource Unavailable" is treated as unbilled.** Its reservation is released, and the purchase may be retried later.
- **Every other failure keeps its hold.** Another 429, a timeout or a missing receipt keeps its conservative hold as an unknown charge, and nothing more is bought until it is reconciled.
- **There is no automatic paid fallback.** A Standard fallback, if ever wanted, must be bound in the experiment, admitted at Standard's price, and idempotent.
- **A longer timeout.**
- **A pin by review release.** Worlds keep the release they started with.

**2. Batch adapters for Opus and the painter** (about −$2.0 a world with LOW: Opus −$1.60, the painter −$0.37). A purchase becomes two-phase:
- submitted under an opaque `custom_id`. Anthropic accepts only `^[a-zA-Z0-9_-]{1,64}$`, so the colon-bearing request keys need a durable mapping, recorded before submission;
- pending, recorded in the ledger;
- settled from the batch result.

Results arrive unordered: only a mapped, unique result settles its purchase, and anything unresolved keeps its reservation until reconciled. Errored, canceled and expired requests are documented as unbilled, but an expired purchase must still be found, reconciled and released. Today `purchaseOnce` buys synchronously, so this is the larger change.

**3. Sol continuity truncations: 5 of 31 answers ran out of output on reasoning.** Each wasted a full question. A free look at the 5 retained answers comes before any cap change: a higher cap raises every reservation.

## 9. Assumptions, and what would change the conclusion

- **The measured world is one world.** Its multipliers (1.15 paintings and Opus questions, 1.19 Sol questions per hide) may not hold for LOW or for Sol HIGH. The sensitivity rows bound this; E4b measures it.
- **Sol HIGH's price per quality question ($0.05–0.07) is assumed.** At $0.07 the best configuration is $2.06, not $1.90.
- **LOW's 5 of 6 seam pass and 5 of 5 review acceptance are screening observations.** At 2 in 3, the best configuration is $1.98.
- **The channel discounts are published list prices.**
  - Flex can return 429s and time out more often.
  - Batch requests can expire after 24 hours, and a world needs several batches in sequence, so no delivery time is promised.
  - Neither changes the model, effort, evidence or criteria, but every decision is a sample. Contract tests come before any use.
- **All figures are on the product's conservative rate card.** Invoices should be somewhat lower: Sol input is priced 25% above its published rate.
- **The $2 figures need everything at once.** No single change gets there:
  - Sol HIGH must qualify on quality;
  - the Flex and Batch channels must be built;
  - LOW must hold at scale.

## 10. Status of the preparation, and checks

**The selftest** (`work/private-e3-runner/logs/selftest-e3.log`) runs provider-free, with the network blocked and synthetic bills. It covers:
- the pins, including stage one and `shift-rect`'s rules;
- that no label reaches any of the 72 outgoing questions;
- Q0's reuse, and its refusals when not as planned;
- stage one: decided at the first miss, by an unread or a truncated answer; relaunching decides again and buys nothing; a stage-two miss does not stop the run;
- Q1 alone and both pairs, with continuity counted only for cuts;
- the hard and observe-only tiers never deciding;
- the money settled first: overrun, an open purchase, and passing the cap;
- admission;
- drift before the first purchase and on resume: product source, an E1 builder file, a board pixel, a hide's geometry;
- cap, lock and identity;
- E1's ledger and the saved pictures unchanged.

**Results, on the pinned runner** (`e3-guard.ts` `4e9243e8…`, `e3-run.ts` `09c46153…`; manifest `7b708217…`; binding `ce7aad46…`):

| Check | Command (from the worktree root) | Result |
| --- | --- | --- |
| Types | `node node_modules/typescript/bin/tsc -p work/private-e3-runner/tsconfig.json` | exit 0 |
| Dry run | `APP_ENV=qa LOCAL_PATCH_PLAYER_REVIEW=on OPENAI_API_KEY= ANTHROPIC_API_KEY= node node_modules/tsx/dist/cli.mjs work/private-e3-runner/run-e3.ts` | exit 0; the binding matches the manifest; 21 reused, 3 to buy, 51 admitted |
| Selftest | the same environment, `work/private-e3-runner/selftest-e3.ts` (file `e5232baf…`) | **85/85, exit 0**, 25 min; log `eb2376fb…` |
| Mutation check | `node work/private-e3-runner/mutate-e3.cjs` (file `d747f490…`) | **29/29 caught by their own check, exit 0**, 78 min; both sources restored and hash-verified; log `19abcfb9…` |
| After the mutation check | `sha256sum -c` against the hashes taken before, then the dry run again | both sources OK, no backup left; the binding still matches the manifest |

**The run before this one failed one check.** The test that plans to reuse an unbought Q0 was refused, but by the new stage-one guard (stage one still bought R12's Q0), not by the reuse check it targets. The test now also drops R12's Q0 from stage one, so the reuse check is what refuses. The test asserts the reuse check's own reason: "R12-cut-head-G3 (E1 never asked it)".

**The mutation check** counts a break as caught only when the check meant to catch it fails. A crash, or another check failing first, is reported as a wrong catch. Its 29 breaks cover:
- what the judges are shown;
- Q0's reuse: the request compared, the plan enforced, E1's ledger pinned;
- stage one: deciding at a miss, truncation, the buying order, a decided run's open ends, its manifest pin and its rules;
- the pairs: continuity counted only for cuts, a good picture blocked by a repair, an unresolved answer, a missed reject;
- the tiers;
- the money: an overrun named, an open run never qualifying, the cap;
- admission;
- drift;
- E1's builder files bound;
- the lock;
- the pinned controls: the manifest compared, carried controls compared with E1, repeated wire ids, built picture bytes, `shift-rect`'s two rules.

No product source changed, so the repository's full suite was not rerun.

**Not done:**
- the E4a and E4b runners: specified here, built after Codex agrees on the shape;
- the Flex and Batch adapters: engineering for Guy's go-ahead.
