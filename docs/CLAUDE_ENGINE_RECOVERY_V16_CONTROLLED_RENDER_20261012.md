# v16 controlled render: results, 12 October 2026

The paid comparison proposed in the batch 2 handoff (`docs/CLAUDE_ENGINE_RECOVERY_BATCH2_V16_20261012.md`), run on the batch 2 tip `af7ef0fbfb697248b30dd3488d0f2fda8090d410` of `claude/engine-recovery-20261012`. Guy approved the spend on 12 October 2026 ("יש ישור על הוצאה של הרינדור המבוקר - רוץ"). No code changed. No deployment, live database, flag change or customer image. This document is the only commit.

**Bottom line:**
- Keep `LOCAL_PATCH_PROMPT_RELEASE=v15`.
- In this sample v16 delivered fewer first paints than v15: 12 of 18 against 17 of 18.
- The failures were not identity, gender or age. They came from two side effects of the new body paragraph:
  - a held prop was left behind;
  - a taller child stood on the wrong support.
- One correct Opus fail was unreadable only because of a 300-character bound that the model is never told about.

## What ran

| | |
| --- | --- |
| References | 2 synthetic portraits, generated from text by gpt-image-2 (1024, medium): **A**, a fictional boy with short straight light-brown hair; **B**, a fictional girl with long dark curly hair. No customer or tester image was read or sent. |
| Arms | **v15**: identity style `board-matched-identity/v4`, recipe `scene-integration-v4`. **v16**: style `board-matched-identity/v5`, recipe `scene-integration-v5` (`local-patch-prompt/v16-age-body-neutral`). |
| Ages | 3, 6, 10 |
| Hides | `greatwall-v12-1` (standing; "Replace ONLY the teal jacket boy playing diabolo", source head/hand scale) · `amazon-v12-3` (sitting; "the blue-shirt boy", "same natural child scale as the girl") · `newyork-v12-1` (standing; "match the scale of nearby children") |
| Calls | 2 references, 12 identity sheets (`OpenAiAvatarProvider.createCharacter`, `qaStyleContract`), 36 paintings (`renderLocalPatchHide` → `buyLocalPatch`), 33 Opus 5.5 HIGH quality and 33 Sol 6.1 HIGH continuity reviews |
| Review evidence | Identical to the v12 player review (`local-patch-board-review.ts`): the board, 192 px context, the shipping crop composited onto it, the close-up with the return guard, four boundary strips, `ready-only/v1`, `APP_ENV=qa`, `LOCAL_PATCH_PLAYER_REVIEW=on`. Read with `parseVisualSceneVerdicts`, `localPatchQualityDisposition` and `readLocalPatchBodyContinuity(…, CONTINUITY_READER_BOUNDED)`. |
| Ledger | Every purchase went through `purchaseOnce` on a private SQLite ledger (`WorldBudget` with one world per reference × age × arm). A re-run replays and never re-buys. The runner refused any reservation that could pass $10, counting those in flight. |

The private folder is `work/private-v16-controlled-render-20261012/` (git-ignored). It holds `run.ts`, `results.json`, `reviews/*.json` (raw answers and receipts), `renders/`, `sheets/` and `report/*.png` (labelled grids).

## Spend: $6.55 of the $10 cap

All 116 requests are settled (`audit.ts`). Nothing is reserved, pending or of unknown cost.

| Purchase | Count | Total | Each |
| --- | ---: | ---: | ---: |
| Synthetic reference | 2 | $0.106 | $0.053 |
| Identity sheet | 12 | $0.869 | $0.072 |
| Painting | 36 | $1.653 | $0.046 |
| Opus 5.5 HIGH quality review | 33 | $2.879 | $0.087 |
| Sol 6.1 HIGH continuity review | 33 | $1.041 | $0.032 |
| **Total** | 116 | **$6.549** | |

A reviewed hide costs about $0.165: painting $0.046 + the two reviews $0.119. The reviews cost 2.6× the painting.

## Results

| | v15 | v16 |
| --- | ---: | ---: |
| Paintings | 18 | 18 |
| Refused by the seam check | 1 | 2 |
| Reviewed by both HIGH reviewers | 17 | 16 |
| Opus: acceptable | 17 | 12 |
| Opus: retry, with a located fault | 0 | 3 |
| Opus: unreadable | 0 | 1 (a located fail, see finding 3) |
| Sol continuity: pass | 17 / 17 | 16 / 16 |
| **Delivered on the first painting** | **17 / 18** | **12 / 18** |

The seam refusals were `B-a3-v15-newyork`, `B-a3-v16-amazon` and `B-a10-v16-amazon`, each a border best matched at a 1–3 px shift. At n=36 they say nothing about either arm.

### What held in both arms
- **Identity:** every painting is recognisably its reference.
- **Gender:** girl B is a girl in all 15 of her paintings, including the 10 on the two hides written "Replace ONLY the … boy". The v15 wording did not flip her gender in this sample. The v16 neutral wording is hygiene here, not an observed fix.
- **Hair (identity v4 against v5):** A kept short straight light hair in all six sheets, under v4 and v5 alike. B kept long dark curls under both. The dark-curl bias that motivated v5 did not appear with these references. v5 shows no regression, and no benefit is proven by this run.
- **Age:** the sheets and paintings change visibly with age in both arms.
  - New York: v16's spread is wider (the 3-year-old smaller, the 10-year-old taller).
  - Amazon (sitting): v16's spread is not wider.
  - Great Wall: mixed.
  - With one painting per cell, there is no reliable size conclusion.

## Finding 1: a held prop is left behind (Great Wall, v16 only, 3 of 6)

In `A-a3-v16`, `B-a6-v16` and `A-a10-v16`, one disc of the replaced boy's toy stands or hangs on its bar beside the new child, held by nobody.
- Opus failed all three under `pictureWhole`, with the location (one of the three answers is the unreadable one, finding 3).
- Sol passed them all. This is a prop, not body continuity.
- By eye it is plain (`report/greatwall-toy-closeup.png`).

Under v15, no Great Wall painting was flagged. Two v15 paintings (`B-a3`, `B-a10`) also keep that disc on its bar, but tied by a string to the new diabolo, and Opus accepted them. The leftover is therefore not new in v16. v16 makes it free-standing, visible and failed.

**Cause, as far as the evidence shows:**
- The authored placement says "Preserve the diabolo, sticks, strings and balanced stance. His hands hold the same sticks". The board draws a two-disc toy hanging from an L-shaped bar in the boy's hand. The painter reconciles the two differently each time.
- v16's new paragraph tells the painter that the replaced person only locates the edit and that the child is drawn taller or shorter than them. The child's hands then move, and nothing says the prop goes with them.

## Finding 2: a taller child stands on the wrong support (New York, v16)

In `B-a10-v16-newyork`, the girl's sneakers rest on the taxi's roof sign. Opus: "she reads as standing on the taxi rather than on the sidewalk or steps".
- `A-a10-v16` stands just above the same sign. Opus passed it, and by eye it is borderline.
- The v15 10-year-olds stand a little higher, on the step.

This hide replaces nobody. Its prompt asks for "pedestrian park paths and shop-side sidewalks, safely away from the taxi roadway" and to "preserve the authored support". It is likely the same paragraph seen from the other side. Once nearby people no longer set the height, the taller body moved its feet down as well as its head up, and it left the step. By eye on the close-ups (`B-a10`, v16 against v15), the head is clearly higher and the feet slightly lower.

## Finding 3: a correct fail was unreadable because of a 300-character location (all v12, both arms)

`B-a6-v16-greatwall` came back complete: end_turn, a JSON fence, every check, all four boundaries, and a located `pictureWhole` fail on the floating disc.
- The product read it as unreadable: `parseVisualSceneVerdicts` → null, `localPatchQualityDisposition` → `unresolved`.
- The only reason is that the fault location is 390 characters, while `faults[].where` allows 300 (`local-patch-judge.ts:136`).
- Re-read with only that location shortened to 300 characters, the same answer is `{"state":"retry","faults":["pictureWhole"]}` (`work/private-v16-controlled-render-20261012/reread.ts`, free).

The v12 player-review prompt shows the location as `"where":"visible location and defect"` with no length. The neighbouring fields allow 600: `integrationEvidence` and the boundary observations.

Batch 1 named this as latent (`docs/CLAUDE_ENGINE_RECOVERY_BATCH1_20261012.md`, last section). Here it happened on 1 of 33 live Opus answers, and on a correct, actionable fail.

In production, an over-long location is classified as `shape`, the format family, so the recovery asks again with `strict-json/v1`, and those calls are paid. Only `compact/v1` (the size family) states "at most 300 characters", and this path never chooses it. The same long location can therefore recur until `recovery-exhausted`, where a repaint was the right answer.

## Smaller observations (by eye; both reviewers accepted them)
- `B-a6-v16-amazon`: the painter put a small patch of turquoise water behind the girl's head where the board has a mossy bank. It is minor and reads as part of the river further back.
- `A-a3-v15-greatwall`: the old disc became one end of the new diabolo. Odd, but held, and accepted.

## Recommendations (none done; each needs its owner's decision)

1. **Keep v15 as the release.** Do not set `LOCAL_PATCH_PROMPT_RELEASE=v16` on QA on the strength of this run.
2. **v16.1 wording, v16 rows only, untested.** Add two sentences to the AGE, BODY AND IDENTITY paragraph:
   - "Anything the replaced person was holding or using goes to the new child's hands whole, or is removed whole; never leave part of it standing, hanging or floating where their hand was."
   - "Keep the authored support contact: a taller or shorter child changes where the head reaches, never where the feet or seat rest."

   Then re-run only what failed: Great Wall and New York, both references, ages 3 and 10, v16.1 against the v15 paintings already bought (they replay free). That is 8 paintings + 16 reviews: about $1.30, or $1.60 if the four identity sheets are bought again. Use a $3 cap. It needs Guy's approval.
3. **Fault location bound, its own versioned reader.** Accept `faults[].where` up to 600 for v12 integrated verdicts, under a newly named reader (as batch 1 did for continuity), so stored answers are re-read free before any reservation. This changes publication for answers that are unreadable today, so it is a Codex review item.
4. **`greatwall-v12-1` content:** its text describes a diabolo, but the board shows a toy on a bar. Fixing the content would change the hash-pinned v15 prompt, so any correction belongs to the v16 rewrites (`AGE_BODY_PLACEMENT_REWRITES`), not to the shared hide.

## Not tested
- More than one painting per cell. Every difference above is n=1 per reference × age × arm × hide; finding 1 is 3 of 6 against 0 of 6 flagged.
- Hides other than these three. 28 hides carry scale anchors, and other props in other hands were not painted.
- Identity v5 on the case that motivated it. These references did not reproduce the dark-curl bias.
- Repairs, self-repair diagnosis and the identity feedback path under v16. Only first paintings were bought.
- Any real child, any game, the live queue, Postgres.
