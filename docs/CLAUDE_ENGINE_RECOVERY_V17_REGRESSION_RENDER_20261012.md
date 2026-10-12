# v17 regression render: results, 12 October 2026

This is the paid run of the reviewed seven-case manifest (`docs/art/v17-prop-support-regression-manifest-20261012.json`, SHA-256 `bde2e3ca63ea0570…`).

- **Commit:** `f03361fc` of `claude/engine-recovery-20261012`.
- **Runner:** the private runner answered in `work/private-v16-controlled-render-20261012/RUNNER-V17-FIXES.md`. Its hashes match that document: `v17-guard.ts` `d9473c62…`, `v17-run.ts` `871f57e8…`, `run-v17.ts` `35f4b953…`.
- **Approval:** Guy approved the spend on 12 October 2026 ("מאשר לך להמשיך בניסוי בתשלום").
- **Runner review:** Codex closed the runner's last R3 fix in `docs/CODEX_V17_RUNNER_R3_CLOSURE_20261012.md` while the run was in progress, so no runner review gate is open.
  - The run itself never stopped or met an unknown purchase.
  - The evidence for those paths is the offline tests, not this run.
- **Scope:** no code changed. No deployment, live database, flag change or customer image.

This version corrects the first one (`eb0db023`) after Codex's independent review (`docs/CODEX_V17_PAID_RENDER_REVIEW_20261012.md`). It changes four things:
- the acceptance policy behind the New York finding;
- the reviewer interpretation;
- the certainty of the cause;
- the reservation peak.

**Bottom line:**
- **What v17 changed in these samples.** These are seven deliberately chosen regression cases at two hides, with one painting each. They are not a success rate.
  - At Great Wall the toy is held in all four. Under v16, three of these four left a disc unheld.
  - At New York no child stands on the taxi sign, in all three.
- **Reviews.** Both HIGH reviewers accepted all seven: Opus 7/7 acceptable under `quality-read/v1-located-600`, and Sol 7/7 pass.
- **Spend.** The settled ledger total is $1.185629 of the $3 cap. The highest committed total while reservations were open was about $1.45.
- **A real defect.** In `B-a10-newyork` the newly drawn taxi sign meets the original lower part of the sign at the crop's bottom edge. The lettering is cut there, and the left face shows a doubled edge.
  - This is a visible seam in the finished image, and it should be rejected.
  - The sign being moved or redrawn is not the defect. Guy's policy allows a coherent change.
- **The quality gate accepted it.** Opus saw the symptom ("lettering looks slightly softened") and classed it as harmless. That is a false acceptance, not a reader failure.
- **Cause, as a hypothesis.** The return window crosses the sign, so whatever the painter does to the sign ships; this mechanism is verified. The hide's envelope, its sidewalk support and the age-driven body height likely pull the feet into the sign. The run did not isolate that from the v17 wording.
- **Recommendation.** Keep v15 as the release, and do not promote v17 on this evidence.

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
- `evidence-v17.ts`, which rebuilds the exact review evidence of one case.

## Spend: $1.185629 of the $3 cap

All 21 requests are settled. Nothing is reserved, pending, held or of unknown cost.

| Purchase | Count | Total | Each |
| --- | ---: | ---: | ---: |
| Painting | 7 | $0.329598 | $0.047 |
| Opus 5.5 HIGH quality review | 7 | $0.613512 | $0.088 |
| Sol 6.1 HIGH continuity review | 7 | $0.242519 | $0.035 |
| **Total** | 21 | **$1.185629** | |

- **What the amounts are.** Every amount has `costBasis: conservative-upper-estimate`: a settled accounting amount derived from provider usage, not a vendor invoice.
- **Against the estimate.** The estimate was $1.16, so the settled total is 2.2% higher.
- **Reservation peak.** The highest committed total while reservations were open was not the final total.
  - Replaying the run's sequential purchase order puts the peak at **$1.449989**: $1.149989 settled plus the $0.30 reservation of the last continuity review.
  - This is reconstructed (Codex's figure, which I reproduced), not captured telemetry.

## Results

Under "By eye", **bold** marks a visible defect that should be rejected.

| Case | Why it was in the set | v16 | v17 Opus | v17 Sol | v17 by eye |
| --- | --- | --- | --- | --- | --- |
| A-a3-greatwall | v16 unheld disc | retry (`pictureWhole`) | acceptable | pass | Toy held; nothing left on the ground |
| A-a10-greatwall | v16 unheld disc | retry (`pictureWhole`) | acceptable | pass | Toy held |
| B-a6-greatwall | v16 unheld disc and the 390-character answer | unreadable (strict reader) | acceptable | pass | Toy held by its handle |
| B-a10-newyork | v16 shoes on the taxi sign | retry (support) | acceptable | pass | Feet on the lowest step. **Seam: the new sign meets the original lower part at the crop's bottom edge, with the lettering cut and a doubled left edge** |
| A-a10-newyork | v16 borderline, just above the sign | acceptable | acceptable | pass | Feet on the sidewalk. The sign is shortened at its right end, a change that is not by itself a defect. Its long lower edge with paving texture to the right deserves boundary scrutiny. |
| A-a6-greatwall | control | acceptable | acceptable | pass | Toy held |
| B-a6-newyork | control | acceptable | acceptable | pass | Feet on the lowest step; sign coherent |

The manifest's four pass conditions:
1. **Great Wall toy: met, 4 of 4, by eye and by Opus.**
   - Each child holds a short bar with the two discs hanging from it, which is the toy the board actually draws.
   - Nothing of the replaced boy's toy remains (`report/v17-greatwall-closeup.jpg`).
2. **New York support: met, 3 of 3.** No shoe is on the sign. In `B-a10` the edit that moved the feet also left a seam through the sign (finding 1).
3. **Controls: met.** Both are acceptable. Identity, gender and hair are unchanged from v16: A is the short-haired blond boy and B the girl with long dark curls.
4. **Age: met.** At Great Wall the 3-year-old A is visibly smaller than the 10-year-old A, and both stand on the paving.

## Finding 1: a visible seam through the taxi sign, accepted by the quality reviewer

**What is wrong.** `report/v17-newyork-seam.jpg` shows the sign across the crop's bottom edge, 3×, in the board art and in each v17 composite.

| Painting | The sign | Verdict by eye |
| --- | --- | --- |
| `B-a10` | Drawn about 15 px lower. At the crop's bottom edge the painting gives way to the board's own sign base, so "7E95" is cut in half along the seam, and the left face shows a ghost outline. | A broken join: reject. |
| `A-a10` | About 35 px shorter. Its right end stops where the boy's right shoe now stands, and sidewalk is painted where the board has the end of the sign. | A coherent change, not by itself a defect. The lower edge to the right deserves boundary scrutiny; it is not ground truth for a fail. |
| `B-a6` | Unchanged. | Coherent. |

Under Guy's acceptance policy, clean complete removal, replacement or repositioning of a prop passes when the final scene stays natural. The failure is the partial old object joined to a new one, not the change.

**What the reviewers said.**
- **Opus noticed the symptom and misclassified it.** On `B-a10` it wrote, among the neighbours, "The taxi roof sign lettering looks slightly softened at the top but stays a coherent sign". On the bottom boundary it wrote "The taxi and its roof sign stay whole, with only minor softening of the lettering". Its `pictureWhole`, `severeSeam` and bottom `boundaryIntegrity` are all pass, with no faults.
  - A reader cannot turn that explicit pass into a fail by matching words.
  - The fault is the question and its evidence.
- **What the evidence showed Opus.** `evidence-v17.ts` rebuilds the exact images it received.
  - **The bottom return comparison.** It shows the cut at native scale, about 20 px letters, with nothing marking where the join runs.
  - **The AFTER close-up.** It ends exactly at the returned area, so the cut sign runs off its edge. The question tells the reviewer that an evidence-crop edge is not a game cut.
- **Sol was not asked about this.** Its assigned question is head and body continuity. Its pass says nothing about lettering or props, and it is not a second detector that failed.

**Why it happens: verified mechanism, hypothesis for the cause.**
- **Verified: the window ships the sign.** The crop is 512×768 at board (560,0). The child's envelope is (180,370,170,290), and with the 120 px guard the return window is (60,250,410,518). That window ends at the crop's bottom edge and crosses the sign, which fills about y 704–768. Codex rebuilt all seven outputs through `composeBoundedLocalPatch` pixel for pixel, so edited sign pixels inside this window really ship.
- **Hypothesis: the hide's own constraints pull the feet down.** `newyork-v12-1` (`content/adventures/three-boards.ts`, `[560,0,180,370,170,290,"standing"]`, carried unchanged through `two-worlds-release.ts`, `wizard-refresh-release.ts` and `wizard-integrated-release.ts`) has an envelope 290 px tall whose bottom edge lies on the stoop at y=660. Its placement says `standingHeightPx: 300` and support "pedestrian park paths and shop-side sidewalks", and the sidewalk is lower, behind the sign.
- **Observed: the feet always land below the envelope.** In all 9 paintings of this hide (v15, v16 and v17 for these three cases) the feet are below the envelope (`report/v17-newyork-envelope.jpg`).
- **Not established.** None of this proves that geometry alone caused the edits, that a 10-year-old cannot fit at this depth, or that the v17 wording played no part. The visible envelope can legitimately describe an occluded pose, and no experiment isolated these variables.

**A straight return cut does not fix it.** Codex re-composed the three retained New York paintings, free, with the return window ending at y=704, the sign's highest point.
- The compositor permitted all three.
- Both 10-year-olds lost their shoes, and their legs ended in the stair tread above an intact sign.
- The sign's top slants, and a horizontal cut is not a silhouette of the generated child.

## Smaller observations

- **Duplicated SUPPORT text.** The SUPPORT sentence of every three-boards hide repeats itself ("pedestrian park paths and shop-side sidewalks, safely away from the taxi roadway; pedestrian park paths …"). `three-boards.ts` sets `placement.support` to the board's `ground`, and `local-patch-prompt.ts` prints both. It is harmless and noted only for a later release, since the v15–v17 prompt bytes are pinned.
- **The Great Wall toy now matches the board.** v15 turned it into a two-stick diabolo, and v17 draws the bar with two hanging discs that the board actually shows. That is the `PROP_SUPPORT_PLACEMENT_REWRITES` wording doing what it says.

## Recommendations (none done here; each needs its owner's decision)

1. **Keep `LOCAL_PATCH_PROMPT_RELEASE=v15`.** v17 corrected both v16 defects in these samples, but it should not be promoted while a New York painting can ship a broken sign that the quality gate accepts.
2. **Design the New York support, envelope, return window and occlusion together**, as a versioned contract for fresh games only.
   - **Rejected:** the horizontal return cut, and any rule that every object must keep its exact shape, size, position and lettering. That rule is outside Guy's acceptance policy and would revive costly false rejections.
   - **Preparing:** the provider-free design and tests are the follow-up to this report.
3. **Revise the quality question for visible broken continuity**, under a new name. It must reject a partial old object joined to a new one, a broken silhouette, a conspicuous seam, impossible support or broken anatomy, and keep accepting coherent changes and natural occlusion.
4. **The next paid manifest must test both sides**, under a new run identity and its own approval:
   - the saved `B-a10` image must be rejected by the revised judge;
   - a coherent saved control must still pass;
   - new New York paintings must stay natural.

   Its estimate must include those saved-image reviews and its own reservation peak. The earlier "$0.51 for three new cases" did not.

## Not tested

- More than one painting per cell. Everything above is n=1 per reference × age × hide.
- Hides other than these two. Other props in other hands and other hides whose envelope sits above their support were not painted.
- Repairs, self-repair diagnosis and the identity feedback path under v17. Only first paintings were bought.
- A real photograph turned into an illustration. These references are painted portraits.
- Any real child, any game, the live queue, Postgres, the parked customer game, or production readiness.
