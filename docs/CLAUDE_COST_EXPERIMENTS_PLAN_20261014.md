# Cost experiments: judge on Sol MED, short answers, lean evidence, cheaper paintings (14 October 2026)

Guy accepted Codex's cost recommendation. This plan turns its first steps into two bounded experiments. All the controls come from synthetic children; no customer picture is used.

Status:
- Nothing has been bought.
- No deployed judge, painter, model or flag has changed.
- Each paid run needs Codex's review of its code and runner, then Guy's approval of one stated cap.

**The target** is Codex's:
- $2 as the **average production cost of a game, retries included**, with all 27 hides kept;
- the world's stop ceiling is set from the results, so one faulty hide does not strand a game before delivery.

## 1. What a game costs today, measured

The first full v19/v3 QA world cost $5.710087, read-only from its ledger.

| Purchase | Count | Total | Each | What drives it |
| --- | --- | --- | --- | --- |
| Opus 5.5 HIGH quality review | 30 | $3.073 | $0.102 | Input is 16,892 tokens, two thirds of the price. Output is 1,743 tokens, of which about 700 are the visible answer. |
| Sol 6.1 HIGH continuity review | 31 | $1.088 | $0.035 | Output is 2,374 tokens, of which 1,901 (80%) are reasoning. 5 of the 31 hit the 4,096 cap. |
| Painting, gpt-image-2 MEDIUM 768×1152 | 30 | $1.420 | $0.047 | Output is 1,108 tokens, 70% of the price. The text prompt is 1,460 tokens (15%); the input images are 848 tokens (14%). |
| Identity sheet, diagnosis, style check | 3 | $0.130 | | |

**Where the review images go.** These are the mean tokens over all 54 v12 hides, under each provider's published rule (`work/reserve-measure/evidence-weights.mjs`):

| Quality question (12 images) | Claude tokens | Share | What it shows |
| --- | --- | --- | --- |
| Original board, 1536×864 | 1,705 | 14% | the whole scene, for scale and style |
| Portrait, 512×512 | 361 | 3% | identity |
| BEFORE context | 1,308 | 11% | native pixels around the hide |
| AFTER context and native closeup | 2,045 | 17% | the final pixels |
| **4 return comparisons** | **4,066** | **34%** | **BEFORE and AFTER strips again, pixel for pixel, side by side** |
| 4 magnified joins | 2,386 | 20% | v3's fix for the missed sign break |

| Continuity question (6 images) | OpenAI tokens | Share |
| --- | --- | --- |
| AFTER context | 1,181 | 36% |
| Head detail (same pixels) | 342 | 10% |
| **4 AFTER strips (same pixels)** | **1,803** | **54%** |

The strips add no pixel the context lacks. Both models see these images at native resolution: none is downscaled. What the strips add is attention to each join, and that is exactly what an experiment has to show can be dropped. Fewer files would not by themselves mean fewer tokens; these numbers count tokens, not files.

## 2. Experiment E1: the judge

| Variant | Quality judge | Answer | Evidence |
| --- | --- | --- | --- |
| J0, baseline | Opus 5.5 HIGH | today's | today's v3 question (12 images) |
| J1 | **Sol 6.1 MEDIUM** | today's | today's |
| J2 | Sol 6.1 MEDIUM | **short when passing**: one line per passing check; on failure a check, a location and a short reason, as today | today's |
| J3 | Sol 6.1 MEDIUM | short when passing | **lean**: without the 4 return comparisons (8 images) |

- **The continuity question (Sol HIGH) is unchanged** in E1.
- **Output cap.** J1–J3 keep a 6,500-token cap. Codex warned against cutting the cap until answers truncate again.
- **One question, one answer.** Each variant is a versioned question built by the product's own code, with its own fingerprint. Nothing is re-asked within a variant.

### Controls

Labels are pinned before anything is bought. They come from earlier controlled runs of identities A and B.

| Class (Codex's list) | Pictures | Label |
| --- | --- | --- |
| Good | 4 v19 NY paintings (pv19, pixel-verified); A-a6 GW v17; B-a6 NY composed by v19; 2 v15 paintings on Amazon and GW, after my visual check | pass |
| Broken background join | B-a10 NY v17 (the taxi sign sliced at the seam); A-a10 NY v17 (the ledge cut at the crop's edge) | reject |
| Unnatural object or body | A-a10 GW v16 and A-a3 GW v16 (a toy left floating in the air) | reject |
| Wrong support | B-a10 NY v16 (feet on the taxi's roof sign) | reject |
| Cut figure (built by an exact local edit) | two good NY v19 paintings (A-a6, B-a10) with the top of the head returned to the original board's pixels in one reviewed rectangle | reject |
| Weak likeness (built) | A's painting judged against B's portrait, and the reverse | reject |
| Wrong age or scale (built) | a 10-year-old painting judged as age 3, and a 3-year-old judged as age 10 | reject |
| Observe only, never counted | B-a6 NY v17 (the borderline doubled awning letters); B-a10 Amazon-3 v16 (the 1 px seam shift) | |

That makes 21 controls: 8 good, 11 reject, 2 observe-only.

**How the cut figures are built.** Each is one rectangle of a good painting returned to the original board's pixels, from above the hair to just above the eyebrows.
- **Chosen by eye.** The rectangle is chosen on a pixel grid and pinned with the result's SHA-256. Two automatic constructions left the head whole: the painter repaints the scenery around the child, so the difference from the board never isolates her.
- **New York only.** Only New York's hide adds the child in front of plain scenery. Amazon-3 and Great Wall-1 replace a child the board already has, so a rectangle returned there grafts that child's hair onto ours. That is a different failure, and not this control.

**What the judge is shown** (Codex's R1). Each control reaches the judge only under a pinned opaque wire ID: a random token, the same for all four variants, carrying nothing of its label, class, release or identity. The descriptive names, labels and reasons stay in the local manifest and report. The self-test captures the exact outgoing request of all 84 questions and checks that none of them leaks. It also checks that changing every local name, label, class and reason changes no question.

### Measures and qualification

**Qualification is absolute** (Codex's R2), against the pinned labels and never against what J0 happened to catch. A variant qualifies only if all of these hold:
- the run is complete and financially closed: nothing open, unknown, held, charged past its reservation, or over the cap (R3);
- **all 8 verified good pictures pass**;
- **all 11 verified rejects are caught**, each by its own class's check with a located fault;
- no answer is unread or truncated.

The two observe-only pictures stay outside the score. On a run that is not complete, the scores are provisional, not a qualification.

**J0 is a diagnostic beside the gate, never the bar.** The report lists, per Sol variant, the rejects caught by J0 only or by the variant only, and the good pictures each rejected. A bad baseline can neither lower the bar nor block a good candidate. If a label is ever disputed, it is resolved and pinned before a new paid run, never after seeing which model failed.

The run reports its measurements:
- input, reasoning and visible output tokens;
- the price per question (median, p95 and maximum);
- the time per question.

These are measurements, not projections.

### Size and cap

21 controls × 4 variants = 84 questions, one answer each, no retries.
- **J0 is bought fresh for all 21.** Nine of these pictures already have paid Opus v3 answers from pv19, but those were asked with other bindings, inside the pipeline's worlds. The Sol variants must be compared with Opus on the same question text and evidence. The earlier answers become a free repeatability check. Reusing them would save about $0.93.
- **Each variant buys in its own world.** The product refuses any world past $5, and the 84 questions together cost more. The runner's self-test caught this. The run's own cap spans the four worlds. Before any database is touched, the runner refuses if a world could reach $5 even if every answer cost its maximum (J0's worst case is $4.82).

| Variant | Each, about | Total, about | Basis |
| --- | ---: | ---: | --- |
| J0 Opus HIGH | $0.103 | $2.16 | the nine pv19 Opus bills, $0.096–0.118 |
| J1 Sol MEDIUM | $0.06 | $1.26 | the input bound and the pv19 Sol bills |
| J2 short | $0.055 | $1.16 | |
| J3 short and lean | $0.05 | $1.05 | |

**Expected: about $5.6** ($5.0–6.2). **Proposed cap: $7.00,** enforced by the ledger as in pv19.
- Each question reserves $0.25, and is admitted only if the most it can be billed fits that.
- The run can therefore never commit more than the cap.
- The earlier $3.8 and $5.50 assumed the reuse above and Sol at $0.04–0.05.

## 3. Experiment E2: the painter, in parallel

| Variant | Model and quality | Size sent | Note |
| --- | --- | --- | --- |
| P0, baseline | gpt-image-2 MEDIUM | 768×1152 | saved paintings from the same prompt where they exist; painted only for Amazon-3 (see below) |
| P1 | **gpt-image-2 LOW** | 768×1152 | the same request in every other respect. The owner already accepted LOW for the earlier five-hide boards. |
| P2 | **gpt-image-1-mini MEDIUM** | 1024×1536 | Mini takes only standard sizes; the output is reduced to the shipping 512×768 like today's |

**Estimated price per painting**, from the published token prices with our measured input:

| Variant | Price | Change |
| --- | --- | --- |
| P0 | $0.047 | |
| P1 | about $0.019 | about −60% |
| P2 | about $0.017 | about −64% |
| Mini LOW | about $0.007 | |

Mini LOW is left for later. A cheaper painter that needs more repairs can cost more in the end, so the measure is the **price per accepted hide**.

**Cases.** New York 1, Great Wall 1 and Amazon 3, each for identities A and B at age 6: 6 cases for P1 and for P2.

**The MEDIUM baseline (P0)** must come from the same prompt:
- **New York** has the pv19 v19 paintings.
- **Great Wall:** the v17, v18 and v19 painter prompts are byte for byte the same there, so the v17 paintings serve. Both passed both reviews.
- **Amazon 3** has only v15 and v16 paintings, from other prompts. P0 paints its two cases, so E2 buys 14 paintings, not 12.

**Checks on each painting:**
- the product's deterministic checks (seam and fixed scenery). A painting they refuse is a result, recorded and not reviewed;
- the current reviews (Opus v3 and Sol);
- a contact sheet per case: the portrait, the MEDIUM painting, P1 and P2, for likeness and style by eye.

Guy has the final word on likeness and style.

**How E2 is read** (Codex's comparison note):
- **Results are paired per case:** the MEDIUM painting beside P1 and P2.
- **Saved MEDIUM paintings are visual references only.** The same prompt text does not establish the same effective images, sheet, mask, policy or compositor, so they enter no aggregate.
- **Aggregates cover matched cases only:** P1 against P2 on all six, and P0, P1 and P2 on the two Amazon cases P0 painted. P0's paid cost stays separate and is never set against P1's or P2's six-case figures.
- **The price per accepted hide includes refused paintings.** E2 has no retries and no identity stage, so it is not yet the average cost of a delivered game.
- **One painting per case and painter is a first screening.** It can justify a separately bounded QA-world trial of a cheaper painter. It does not establish production failure rates.

**Expected: about $2.25** (paintings $0.31, reviews of up to 14 accepted paintings $1.94). **Proposed cap: $3.00.** The earlier $2.75 left out the two Amazon P0 paintings and their reviews.

## 4. What the product needs first

These changes are provider-free, opt-in and versioned. None is a default.

1. **A judge choice in the review policy.** The quality role can be asked of `gpt-6.1-sol` at MEDIUM with a 6,500 cap; Opus stays the default. The input bound and admission already cover Sol (`visual-review-input-bound.ts`).
2. **A short-when-passing answer instruction**, versioned, read by the current quality reader. Its observation fields need only 12 characters.
3. **A lean quality question** without the return comparisons. This is a new question version: its own instructions, labels and evidence ids, with the joins kept.
4. **Painter policies** for gpt-image-2 LOW on v12 and for gpt-image-1-mini, each with its own model check and rate card.
5. **A private runner per experiment** (from the pv19 runner). It binds the effective experiment, pins the cases and labels, enforces a hard cap, never retries, and writes a report from the ledger. It is self-tested and mutation-checked.

## 5. Later steps, only if needed

- **One comprehensive Sol judge** with a second question only for an undecided case (Codex step 4). Until it is qualified, this would change the two-questions-per-hide policy, and two questions to one model are not independent.
- **Prompt caching.** Our requests cannot be cached as they stand:
  - The binding ends the instruction block. Sol's identical prefix (about 900 tokens) is under OpenAI's 1,024-token minimum, and all 31 Sol bills show `cached_tokens: 0`.
  - For gpt-image-2 edits, cached input pricing does not apply to `/v1/images/edits`.
  - Reordering the quality question (instructions, portrait and board first, the binding last) could cache about 4,000 tokens per hide on the same board. That is a few cents per world.
- **Batch API.** Batch is half price for the image models and the review models. It trades latency (up to 24 hours) for the biggest single saving, and it would change how a world is scheduled.

## 6. A projection to check, not a promise

This is per world, at the QA world's retry mix. Each step's saving is measured before the next step counts on it.

**What E1 does not change** (Codex's note): the continuity review stays Sol HIGH.
- At about $0.035 each, the 27 first-pass continuity reviews alone are about $0.95.
- That leaves about $1.05 of the $2 target for every quality review, painting, identity step and retry.
- A later MED or lean continuity qualification may be needed. It is neither authorized nor implemented.

| Step | About |
| --- | --- |
| Today | $5.71 |
| Sol MED as the quality judge | $4.1 |
| Plus short answers and lean evidence (and no continuity strips) | $3.7 |
| Plus gpt-image-2 LOW paintings | $2.9 |
| Plus one comprehensive judge with escalation | $2.1 |

## 7. Order and gates

1. Commit the product opt-ins in focused, tested commits, then build the runners with a dry run.
2. Codex reviews the code, the runners, the pinned controls and labels, and the caps.
3. Guy approves E1 ($7.00) and E2 ($3.00), or either one.
4. Run, report, and Codex reviews the results.
5. Only then is anything adopted, in a new release that new drafts pin. Existing worlds keep their release.
