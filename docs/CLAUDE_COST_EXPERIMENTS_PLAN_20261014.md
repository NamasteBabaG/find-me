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
| Cut figure (built by an exact local edit) | two good paintings with the top of the head cut straight, back to the original board pixels | reject |
| Weak likeness (built) | A's painting judged against B's portrait, and the reverse | reject |
| Wrong age or scale (built) | a 10-year-old painting judged as age 3, and a 3-year-old judged as age 10 | reject |
| Observe only, never counted | B-a6 NY v17 (the borderline doubled awning letters); the v16 seam-shift pictures | |

### Measures and acceptance

Each variant is compared with the labels and with J0. A variant passes only if all of these hold:
- it catches **every** reject that J0 catches, each with a located fault in the right check;
- it rejects no more good controls than J0 does;
- every answer is read by its reader;
- truncation is no more frequent than J0's.

The run reports its measurements:
- input, reasoning and visible output tokens;
- the price per question (median, p95 and maximum);
- the time per question.

These are measurements, not projections.

### Size and cap

There are about 20 controls:
- J1–J3: about 60 Sol questions at about $0.04–0.05 each.
- J0 baseline: 11 new Opus questions at $0.10. The nine pv19 and gate pictures already have paid Opus v3 answers, and those are reused, not bought again.

**Expected: about $3.8. Proposed cap: $5.50,** enforced by the ledger as in pv19.

## 3. Experiment E2: the painter, in parallel

| Variant | Model and quality | Size sent | Note |
| --- | --- | --- | --- |
| P0, baseline | gpt-image-2 MEDIUM | 768×1152 | existing paintings of the same cases; nothing bought |
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

**Cases.** New York 1, Great Wall 1 and Amazon 3, each for identities A and B at age 6: 6 cases per variant, 12 paintings in all.

**Checks on each painting:**
- the product's deterministic checks (seam and fixed scenery);
- the current reviews (Opus v3 and Sol);
- a contact sheet beside the P0 painting of the same case, for likeness and style by eye.

Guy has the final word on likeness and style.

**Expected: about $1.9** (paintings $0.2, reviews $1.6). **Proposed cap: $2.75.**

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
3. Guy approves E1 ($5.50) and E2 ($2.75), or either one.
4. Run, report, and Codex reviews the results.
5. Only then is anything adopted, in a new release that new drafts pin. Existing worlds keep their release.
