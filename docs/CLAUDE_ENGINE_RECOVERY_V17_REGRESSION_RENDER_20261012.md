# v17 regression render: results, 12 October 2026

This is the paid run of the reviewed seven-case manifest (`docs/art/v17-prop-support-regression-manifest-20261012.json`, SHA-256 `bde2e3ca63ea0570…`).

- **Commit:** `f03361fc` of `claude/engine-recovery-20261012`.
- **Runner:** the private runner answered in `work/private-v16-controlled-render-20261012/RUNNER-V17-FIXES.md`. Its hashes match that document: `v17-guard.ts` `d9473c62…`, `v17-run.ts` `871f57e8…`, `run-v17.ts` `35f4b953…`.
- **Approval:** Guy approved the spend on 12 October 2026 ("מאשר לך להמשיך בניסוי בתשלום").
  - Codex had not yet rechecked the runner's last R3 fix (the stop on an unconcluded painting and the report invariant).
  - The run never reached that path, because every painting concluded.
- **Scope:** no code changed. No deployment, live database, flag change or customer image. This document is the only commit.

**Bottom line:**
- **What v17 fixed.** It fixed both defects it was written for:
  - At Great Wall the toy is held in all four cases. Under v16, three of these four left a disc unheld.
  - At New York no child stands on the taxi sign.
- **Reviews.** Both HIGH reviewers accepted all seven: Opus 7/7 acceptable under `quality-read/v1-located-600`, and Sol continuity 7/7 pass.
- **Spend.** $1.19 of the $3 cap.
- **New defect.** By eye, two of the three New York paintings changed the taxi roof sign. The sign is a board object that should never change. Neither reviewer noticed.
- **Cause.** The cause is the hide's geometry, not the new wording. `newyork-v12-1` has an envelope too short for a standing 10-year-old whose feet stay above the sign, and the return window ships everything the painter does to that sign.
- **Recommendation.** Keep v15 as the release. Fix the hide, or at least its v17 wording, before promoting v17. Re-run the three New York cases.

## What ran

| | |
| --- | --- |
| Cases | The seven reviewed cases, in order: A-a3, A-a10, B-a6 and A-a6 at `greatwall-v12-1`; B-a10, A-a10 and B-a6 at `newyork-v12-1`. One painting each, no retries. |
| Arm | `local-patch-prompt/v17-age-body-prop-support`, recipe `scene-integration-v6`, identity `board-matched-identity/v5`. The five v5 sheets from 12 October were reused byte for byte, and each SHA-256 was checked before any reservation. |
| References | The same two synthetic portraits as the v16 render. No customer or tester image was read or sent. |
| Reviews | The same product-identical v12 player-review evidence as the v16 render. Quality was read with `quality-read/v1-located-600` and continuity with `continuity-read/v1-output-bounded`. |
| Ledger | A private SQLite ledger, `purchases-v17.sqlite`, with one world per reference × age. The $3 cap was enforced in the ledger under the run lock and the reservation mutex. |
| Run | 16:55–17:10 UTC, report `complete`, exit 0. The lock and the mutex were released, and only the run identity row remains. |

The private evidence is in `work/private-v16-controlled-render-20261012/` (git-ignored):
- `results-v17.json`, `progress-v17.json`, `renders-v17/`, `prompts-v17/`.
- The figures in `report/v17-*.jpg`.
- The read-only scripts that drew the figures: `zoom-v17.ts`, `compare-v17.ts`, `sign-v17.ts`, `signzoom-v17.ts`, `seam-v17.ts`, `envelope-v17.ts`, `board-v17.ts`, `feet-v17.ts`, `peek-v17.ts`.
- `ledger-v17.ts`, which splits the spend.

## Spend: $1.1856 of the $3 cap

All 21 requests are settled. Nothing is reserved, pending, held or of unknown cost.

| Purchase | Count | Total | Each |
| --- | ---: | ---: | ---: |
| Painting | 7 | $0.3296 | $0.047 |
| Opus 5.5 HIGH quality review | 7 | $0.6135 | $0.088 |
| Sol 6.1 HIGH continuity review | 7 | $0.2425 | $0.035 |
| **Total** | 21 | **$1.1856** | |

The estimate was $1.16, so the actual cost was 2.6% higher. The highest committed total was the final one, $1.1856.

## Results

Under "By eye", **bold** marks a changed board object.

| Case | Why it was in the set | v16 | v17 Opus | v17 Sol | v17 by eye |
| --- | --- | --- | --- | --- | --- |
| A-a3-greatwall | v16 unheld disc | retry (`pictureWhole`) | acceptable | pass | Toy held; nothing left on the ground |
| A-a10-greatwall | v16 unheld disc | retry (`pictureWhole`) | acceptable | pass | Toy held |
| B-a6-greatwall | v16 unheld disc and the 390-character answer | unreadable (strict reader) | acceptable | pass | Toy held by its handle |
| B-a10-newyork | v16 shoes on the taxi sign | retry (support) | acceptable | pass | Feet on the lowest step; **sign moved down, its "7E95" cut by the crop's bottom edge** |
| A-a10-newyork | v16 borderline, just above the sign | acceptable | acceptable | pass | Feet on the sidewalk; **sign shortened at its right end to make room for a shoe** |
| A-a6-greatwall | control | acceptable | acceptable | pass | Toy held |
| B-a6-newyork | control | acceptable | acceptable | pass | Feet on the lowest step; sign unchanged |

The manifest's four pass conditions:
1. **Great Wall toy: met, 4 of 4, by eye and by Opus.**
   - Each child holds a short bar with the two discs hanging from it, which is the toy the board actually draws.
   - Nothing of the replaced boy's toy remains (`report/v17-greatwall-closeup.jpg`).
2. **New York support: met for the feet, 3 of 3.** No shoe is on the sign. But in two of the three the feet got there because the painter edited the sign (finding 1).
3. **Controls: met.** Both are acceptable. Identity, gender and hair are unchanged from v16: A is the short-haired blond boy and B the girl with long dark curls.
4. **Age: met.** At Great Wall the 3-year-old A is visibly smaller than the 10-year-old A, and both stand on the paving.

## Finding 1: v17 edits the taxi sign at New York, and both reviewers pass it

**What changed.** `report/v17-newyork-seam.jpg` shows the sign across the crop's bottom edge, 3×, in the board art and in each v17 composite:

| Painting | The sign |
| --- | --- |
| `B-a10` | Drawn about 15 px lower. At the crop's bottom edge the painting gives way to the board's own sign base, so "7E95" is cut in half along the seam, and the sign's left end shows a ghost outline. |
| `A-a10` | About 35 px shorter. Its right end stops where the boy's right shoe now stands, and sidewalk is painted where the board has the end of the sign. |
| `B-a6` | Unchanged. |

v15 and v16 kept the sign's shape, position and number (`report/v17-newyork-sign.jpg`).

**What the reviewers said.**
- Opus accepted both changed paintings and passed `pictureWhole` and `groundContact`. Its reasons say the opposite of what the pictures show:
  - `B-a10`: "Integration is clean and the four boundaries are intact."
  - `A-a10`: "all neighbours and boundaries are intact."
- Sol passed both. Its question is about bodies, not objects.

**Why it happens.** The hide's own numbers explain it (`report/v17-newyork-envelope.jpg`):
- **The envelope.** `newyork-v12-1` (`content/adventures/three-boards.ts`, `[560,0,180,370,170,290,"standing"]`, carried unchanged through `two-worlds-release.ts`, `wizard-refresh-release.ts` and `wizard-integrated-release.ts`) gives the child an envelope 290 px tall whose bottom edge, y=660 in the 768 px crop, lies on the stoop.
- **The placement.** The placement says `standingHeightPx: 300` and support "pedestrian park paths and shop-side sidewalks". The sidewalk is lower, behind the taxi sign, which fills about y 704–768 and ends at the crop's bottom edge.
- **Every version broke the envelope.** In all 9 paintings of this hide (v15, v16 and v17 for these three cases), the feet are below the envelope. How far below depends on how tall the child is drawn:
  - v15 draws the 10-year-olds short, so their feet stopped just above the sign.
  - v16 draws them taller, and their feet landed on the sign, or just above it.
  - v17 is told never to stand on a vehicle or foreground object, so it moved or shortened the sign.
  - The 6-year-old B is short enough that her feet stop above the sign, and her sign is untouched.
- **Why the change ships.** The return window is the envelope plus the 120 px guard (`localPatchReturnRegion`, no `returnRect` on this hide), and it reaches the crop's bottom edge. The whole sign is inside what ships, so any change the painter makes to it is delivered.

**What this means beyond New York.** The v12 player review can pass a changed board object inside the return window, even one cut at the boundary it reports as intact. This run cannot say how often that happens. It is one hide, two paintings and n=1 per cell.

## Smaller observations

- **Duplicated SUPPORT text.** The SUPPORT sentence of every three-boards hide repeats itself ("pedestrian park paths and shop-side sidewalks, safely away from the taxi roadway; pedestrian park paths …"). `three-boards.ts` sets `placement.support` to the board's `ground`, and the prompt prints both. It is harmless and noted only for a later v17 cleanup, since v15 prompt bytes are pinned.
- **The Great Wall toy now matches the board.** v15 turned it into a two-stick diabolo, and v17 now draws the bar with two hanging discs that the board actually shows. That is the `PROP_SUPPORT_PLACEMENT_REWRITES` wording doing what it says.

## Recommendations (none done; each needs its owner's decision)

1. **Keep `LOCAL_PATCH_PROMPT_RELEASE=v15`.** v17 is the better candidate than v16 and fixed both of v16's defects, but it should not be promoted while one of its hides edits the board.
2. **`newyork-v12-1`: fix the geometry first, then the wording.** A standing 10-year-old does not fit the 290 px envelope, so wording alone can only choose where the drawing breaks it. The options, Codex's call:
   - **(a) Authoring: an authored `returnRect` that ends on the sign's top rim.** The rim is about y 704 of the crop, 44 px below the envelope, which is more than the 12 px feather margin. Add v17 wording that the child stands on the sidewalk behind the sign and the sign hides the shoes. The sign then always comes back from the board, in front of the feet. However, `local-patch-render.ts:310` refuses an authored return window on any repair attempt, so repairs of this hide need a design decision first.
   - **(b) Authoring: a taller envelope that reaches the sidewalk line.** It is for new rows only.
   - **(c) Wording only, v17 rows, untested.** "The taxi roof sign is a fixed foreground object: keep it exactly as drawn; never move, shorten or redraw it; it may hide the shoes." This protects the sign but leaves the envelope too short.
3. **Object integrity in the quality question.** Add one check: "every non-person object inside the returned area keeps its shape, size, position and lettering; a changed object is a located fail." It belongs in a newly named question version, with its bytes hash-pinned like the readers, so stored answers keep their meaning. This is a Codex review item.
4. **A small re-run once 2 or 3 exists.** Run the three New York cases (both 10-year-olds and the 6-year-old control) on the same pinned sheets, as a new run identity: 3 paintings and 6 reviews, about $0.51. Use a $1 cap. It needs Guy's approval.

## Not tested

- More than one painting per cell. Everything above is n=1 per reference × age × hide.
- Hides other than these two. Other props in other hands and other hides whose envelope sits above their support were not painted.
- Repairs, self-repair diagnosis and the identity feedback path under v17. Only first paintings were bought.
- A real photograph turned into an illustration. These references are painted portraits.
- Any real child, any game, the live queue, Postgres.
