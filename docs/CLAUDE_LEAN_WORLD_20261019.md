# local-patch-lean/v1: a world under three dollars (19 October 2026)

Guy's decision, 19 October: implement proposals 1–5 and 8 from the pilot cost analysis, have Codex review them, and run one QA verification game.

- **The cost target** is under $3 per world.
- **The ceiling** was raised to $4 later the same day: "שים תקרה ל4 דולר.. שלא ניפול או שהיצירה של המשחק לא תעצר בגלל סנטים בודדים". A world a few cents over $3 must never stop for them.

The pilot world (`game_j9mpft6aemfij36zegjk`) is the baseline:

- **Cost:** $8.92 settled plus $0.198 unknown. Of that:
  - Opus batch questions: $4.44 (97 questions);
  - paintings: $1.96 (59);
  - Sol continuity: $1.38 (44);
  - diagnoses: $1.07 (15).
- **Time:** about 17–20 minutes a picture.
- **First paintings:** all were LOW, and only 5 of 27 were accepted.

## What the release is

`local-patch-lean/v1` is one immutable pin (`lean-release.ts`, audit id `aud_lean_release_<game>`).

- **When it is written:** in the transaction that creates a new QA local-patch draft, when `LOCAL_PATCH_LEAN=lean-v1`.
- **What it replaces:** the LOW painter, Message Batches and six-dollar pins for that draft (`create-flow.service.ts`, `world-purchase.service.ts`).
- **Qualification:** only QA, prompt release v19 and dual review v3. Anything else fails the draft.
- **Exclusivity:** a draft that already carries a painter, channel or budget pin can never also become lean.
- **Reading it:** it is read byte for byte or refused (`leanReleaseOf`).
- **Other worlds:** every world without it keeps every contract it had.

| # | Proposal | Where |
|---|---|---|
| 1 | MEDIUM from the first painting | no LOW pin; `subjectDirectionFor` returns `quality: "medium"` for every lean direction |
| 2 | Sol 6.1 as the only judge, on Flex | `leanReviewPolicy` (visual-review-policy.ts); dual review's lean branch; background round; tier pricing |
| 3 | Planned variety | `local-patch-subject-paint/v4` (`subjectRenderDirectionV4`, `subjectSupportPoseV4`) |
| 4 | The Antarctica hat as E6a painted it | `LEAN_WARM_HAT_WARDROBE` / `lean-warm-hat/v1` |
| 5 | No paid diagnosis for a refusal of who the child is | `leanSubjectOnlyRefusal`; a third normal painting (`local-patch-world.ts`) |
| 8 | A hard ceiling | $4 (`LEAN_BOARD_WIZARD_CAP_MICRO_USD`); no five- or six-dollar policy can apply |

Plus one operational change: a lean world enrolls itself in the subject policy before its first painting (`lean-enrollment.ts`). The pilot was enrolled by hand 14 hours into the world.

### 2. The judge

There are two Sol HIGH questions per picture, both asked in the background, both on Flex, and both sent in the same slice:

- **The bundle:** the v3 object-joins quality question with the v2 subject inspection (`combinedQualitySubjectQuestion`, now carrying its base question's judge, transport and tier). It is the same question Opus was asked, answered by Sol.
- **The continuity question:** the historical AFTER-only question (v3 asks v1's), with its output cap raised to 8,000. A reasoning-only truncation is billed and decides nothing (E3, R13).

**Why continuity stays separate.**

- In E3 the AFTER-only continuity question caught two cut controls (R6 and R7) that the quality judge missed. The quality judge sees BEFORE, where the bystander's head is intact.
- A single combined question would save about $0.003–0.005 a picture: roughly $0.10 a world, at the same latency, since both questions now go out together.
- Keeping the isolation is worth more.

**Policies.**

- There are four exact, frozen policies (`LEAN_REVIEW_POLICIES`): `visual-review-{scene-quality|head-continuity}-sol-high-background-{flex|default}/lean-v1`.
- They price under `visual-review-sol-tiers-2026-10-19`.
- Every historical policy object is byte-identical, which a test pins by its exact JSON.

**Flex and its fallback.**

- The background body asks `service_tier: policy.serviceTier ?? "default"`, so every historical body is unchanged.
- When the provider refuses a lean Flex create, the slice returns `pending` rather than `held`, and the next slice asks the same question at the default tier. This is the documented "nothing created" refusal, settled at 0 as before.
  - The default tier is a different policy, so it has a different fingerprint, key and round.
  - A default-tier refusal holds the world, as every refusal did.
- Whether OpenAI serves Flex in background mode is not documented. The verification game's first question answers that.

**Pricing.**

- `visualReviewCharge(policy, model, usage, servedTier)` prices a lean answer by the tier its response says served it: `flex` at exactly half of every standard rate, `default` at the standard card.
- Any other tier, or a missing one, cannot be priced, so the charge is unknown and held.
- A reservation (no served tier) is the standard card, because a Flex request may be served at the default tier.
- A lean question reserves its role's lean amount, `LEAN_REVIEW_RESERVE_MICRO_USD` (quality $0.20, continuity $0.12; Codex P1-2 below), and is refused if its own request could cost more.

**Background rounds.**

- `askContinuityInBackground` accepts the historical continuity policy or exactly one lean policy of the question's role.
- A lean intent records `policyVersion`. Historical intents have none, so their bytes are unchanged.
- The sweep rebuilds each round's policy from its intent (`backgroundPolicyOfIntent`). An unknown version is refused.
- `backgroundRoundState` reads whether a key's round was refused, for the fallback above.

**Deciding a picture.**

- The quality answer is replayed from its round (`buy`). The continuity question was already sent beside it, so when its answer is kept the picture is decided in the same slice.
- After a passing continuity answer, a lean world goes straight to the subject gate (bundled, so nothing more is asked). It writes no "subject review is next" checkpoint.
- **Verification:** `verifiedDualStage(..., { allowLean })` admits the lean policies of the stage's role.
- **Publication:** a lean world is always enrolled. Its subject stage must be the bundle's, the same request as its quality stage. Its stages are verified under the lean policies.

### 3. Planned variety

- The v4 direction tells the painter the plan's head, gaze and expression as "this appearance's own planned look". The plan already gives the three hides of a board three different heads and expressions.
- It still never becomes a requirement: the judge reads local-patch-subject/v2 unchanged, and the collection's one-third rule stays as the safety net.
- **The prompt line removed.** The v12 painter recipe tells every painter "Participate in the scene naturally; a readable three-quarter face is welcome". This is the likely source of the pilot's nine "three-quarter, open-smile, watching" appearances. v4 drops that sentence, and every earlier painter keeps it byte for byte.

### 4. The hat

- In a lean world, Antarctica's wardrobe is content v13's lead: a knitted hat "worn pushed back off the forehead", with the whole face, both eyebrows, the hairline and the canonical hair at the brim and sides visible. It replaces the enrolled `WARM_HAT_WARDROBE` ("over the crown and the top of the hair").
- E6a painted it 3 of 3 at the first LOW painting.
- No content version changes, and v13 stays unwired.

### 5. Repairs without a paid diagnosis

**What counts.**

- A row FAILED at its second painting whose last review refused only who the child is gets a third normal painting. This is `leanSubjectOnlyRefusal` (`lean-repair.ts`, made strict after Codex P1-1):
  - its quality answer is acceptable;
  - its continuity answer, read beside the refusal, passes;
  - its v2 subject reading is a definite refusal (located failures, or a collection-variety refusal of a pass);
  - all about the same pixels.

**How it works.**

- That row is kept out of self-repair, and the slice paints its attempt 3 through `runLocalPatchHide(..., finalRepair: true)`.
- That path is the adaptive recovery the strict worlds always had. Its strategies (identity-lock, age-proportions, placement-lock) come from the two refusals' typed codes, plus the v4 direction with the refused codes and located defects.

**What still gets a diagnosis.**

- Any other refusal, and a third refusal, goes to self-repair with its diagnosis, as before.
- An interrupted third painting resumes through `localPatchAttemptPlan`'s existing resume of attempt 3.

### 8. The ceiling

- `readLeanWorldBudget` returns $4 for a lean world from its pin alone. It comes first in the resolver chain, so the six-dollar policy and the five-dollar automatic extension never apply.
- `activateLocalPatchEmergencyBudget` also refuses a lean world explicitly.
- `$4` is the board-wizard default, but it is named separately (`LEAN_BOARD_WIZARD_CAP_MICRO_USD`), so a later change to the default does not move it.
- A lean world waiting for in-flight answers to return capacity backs off 3 minutes, not an hour (`LEAN_RECOVERY_BACKOFF_MS`): a Sol answer settles in minutes.

### Enrollment

`enrollLeanWorld` runs in the claimed slice, under the fence, before anything else that slice does.

- **What it writes:** the same `local-patch-subject-upgrade/v1` receipt an owner's enrollment writes. The receipt names the actor `SYSTEM` and the operator `system:local-patch-lean/v1`.
  - `subjectUpgradeOf` admits SYSTEM only with exactly that operator, and that operator only as SYSTEM.
- **What it binds:** the same live private photograph, identity, age and plan.
- **When it refuses:** no confirmed payment, not v3, no background transport, a missing or foreign photograph or identity, or any painting already started. The world then parks with the reason, having bought nothing.

## The cost, honestly

Measured on the pilot ledger:

| Item | Tokens | Cost |
|---|---|---|
| MEDIUM painting | 1,108 output, about 3,450 input | $0.055 |
| Sol bundle on Flex | about 15,000 input, about 3,400 output | about $0.034 (est.) |
| Sol continuity on Flex | 4,484 input, 2,005 output (avg) | about $0.016 |

- **Sol bundle at standard:** E3's quality answer alone was 13,442 in and 2,626 out, $0.0599 at standard. The bundle adds the photograph and the subject text.
- **Sol continuity at standard:** $0.031.
- **One attempt** is therefore about $0.105, and identity about $0.07.
- **A world:**
  - every first painting accepted: about $2.91;
  - 10% repainted: about $3.2;
  - Flex refused for every question (default tier): about $4.3, which the $4 ceiling stops near the end.

**What has to happen for $3:**

- Flex served in background mode;
- first-pass acceptance near or above 90%. MEDIUM, v2, planned looks and the hat attack the pilot's four first-painting failure causes;
- no dependence on Opus.

**The safety net instead of an Opus sample.** After the verification game, Claude (Opus 5.5) reviews every accepted appearance on the same pixels. That gives 100% coverage, where the product sample would cover 10%, at no API cost, and it measures Sol's misses directly.

## Tests

- `lean-release.test.ts` (11 tests):
  - historical policy bytes, and lean policies exactly;
  - tier pricing (half, standard, unknown; E3's bill);
  - background body tier, fingerprints and max charge;
  - the v4 direction, POSE line and hat for all 27 hides;
  - the repair codes;
  - `leanSubjectOnlyRefusal` positives and negatives;
  - the pin through the real draft path, instead of the LOW, batch and $6 pins, with an unpinned control;
  - qualification refusals, and refusal beside another pin;
  - a tampered pin;
  - the $4 ceiling: a reservation refused at it, and the five-dollar activation refused for a lean world but granted for the same world without its pin.
- `subject-photo-evidence.test.ts`: a lean world's direction is v4 at MEDIUM even from a LOW base, keeps v3 as replay-only legacy, and gives Antarctica the pushed-back hat.
- `status/route.test.ts`: the lean ceiling is read first and shown, and held above.
- `local-patch-lean-world.test.ts`: a whole synthetic paid world. The world:
  - enrolls itself as SYSTEM;
  - paints every painting MEDIUM with its own planned look and the pushed-back hat;
  - sends each picture's two Sol questions together on Flex;
  - gets one Flex refusal (429) and asks that question at the default tier;
  - repaints a child refused twice for a different face a third time with the located defect and no diagnosis;
  - sends a twice-broken join to self-repair with exactly one diagnosis;
  - publishes all 27 under the lean policies, each priced by its served tier;
  - stays under three dollars with nothing pending or unknown.

## Codex review round 11 (19 October): HOLD with three P1s, all fixed

**P1-1. The no-diagnosis shortcut admitted continuity failures and subject uncertainty.**

- A lean subject refusal now reads the continuity answer that was sent beside it before the refusal is recorded (`leanContinuityBeside`):
  - it waits while that answer is still running;
  - a broken join adds its located defect to the refused verdict;
  - an answer that cannot be read leaves the refusal without a passing continuity stage.
- `leanSubjectOnlyRefusal` (now in `lean-repair.ts`) re-reads every part from the receipt, under the reader each stage names, about exactly these pixels. It requires all of:
  - an acceptable quality answer (the bundle's quality part);
  - a readable, passing continuity answer;
  - a definite subject refusal: located failures, or a pass the collection refused for variety. Uncertainty does not count.
- Anything else goes to self-repair and its diagnosis.
- `lean-repair.test.ts` covers each case Codex named: continuity missing, broken or unreadable, subject `unsure`, a quality defect, another picture, a v1 policy, a pose code.

**P1-2. Lean reservations could not pass the interruption-recovery gates.**

- A lean question now reserves its role's amount from `LEAN_REVIEW_RESERVE_MICRO_USD`: $0.20 for the bundle and $0.12 for continuity.
  - Both are added to each role's set of recoverable amounts (`dualReviewReserves`), which both recovery gates read, so a lost lean create is recovered like any other.
  - Every historical amount is still admitted, and nothing else is.
- **Why not the historical $0.25/$0.30.** The first fix used those flat amounts. Measured on the shipped art, the real maximums are about $0.17 (bundle, about 28,000 input tokens bounded) and $0.10 (continuity, about 9,000). Flat amounts tied up about $0.55 a picture in flight, against $0.32 now. In the synthetic world, a slice reviewing many boards then hit the $4 ceiling and waited.
- Each amount is above the most its request can be billed. A request that could cost more is refused before anything is reserved.
- `local-patch-lean-world.test.ts` loses one lean create and shows the world finish: the charge stays unknown in full, and the ordinary review recovery continues it.

**P1-3. A crash after a recorded Flex refusal could strand its reservation.**

- `settleRefusal` finishes a refused round from its recorded event: the zero receipt (if it was not kept) and the settlement. It is idempotent.
- It runs in three places:
  - in the create;
  - when the round is asked again;
  - in the sweep (`reconcileRefusedBackgroundRound`).
- The lean fallback to the default tier requires that reconciliation to have settled the Flex reservation.
- `continuity-background.test.ts` stops a create after its refusal was recorded, and after its receipt was kept, and shows each finished: once by the round asked again, once by the sweep, with nothing sent twice.

## The first lean QA world (19 October): three engine gaps it found, and the fixes

QA world `game_hzju9scobvssvl0tojca` ran on 1360a90b from 11:27 UTC. Flex in background mode works: answers came back at exactly half the standard price, most within 0:29–2:50 (median about 1:30). Three things a synthetic world had not shown:

**1. One slow answer held back its whole board.**
- New York hide 1's continuity answer was still queued at Flex when its 25-minute deadline cancelled it (11:31–11:57, charged nothing).
- Its two siblings, painted at the same time, got no question for the whole half hour. The board review picks one appearance per pass, and it kept picking hide 1: its quality answer was saved, so `continuityFirst` put it first. The rule that sends a waiting appearance last ("its siblings' questions are sent meanwhile") covered Message Batches rounds only.
- Every pass also rebuilt the board's evidence (40–70 s) just to find the answer still pending.
- **Fix:** `backgroundReviewWaiting` names every appearance whose background question has not ended, read in one query, and `prepareLocalPatchBoardReview` sends it last with the Message Batches ones. When every appearance of a board waits, the world loop's existing check skips the board without rebuilding it.

**2. Twenty-five minutes is too long to wait on Flex.**
- **Fix:** a lean Flex question is cancelled after 10 minutes (`LEAN_FLEX_CANCEL_AFTER_MS`); its appearance's evidence question is asked again. Default-tier and historical questions keep 25 minutes.

**3. A provider-declared failure parked the world for a person.**
- At 12:21 a Paris bundle came back `failed` from the provider: no text, no usage.
- Whether it was billed cannot be stated, so the engine kept it as an unknown charge (correct). But the automatic recovery admitted only one unknown shape: no answer at all (a synchronous timeout). The world parked as `local-patch:needs-release`, and QA has no release button.
- **Fix:** the recovery (`interruptionShape`) also admits a background response its provider ended `failed`, with no text and no usage. The shape must match exactly what its round recorded: the same response id, `unpriced`, provider status `failed`.
- The charge stays unknown and counted in full, under the same per-world limits (two continuations under v1, four more under v2), and the same pixels are asked again.
- Anything else stays parked: a failure with usage or text, another status, another reason.
- **How the world goes on: local-patch-continue-in-slice/v1** (Codex rounds 14 to 16).
  - **Round 14 (P1):** a parked world is never chosen by the scheduled selection, so a recovery that runs only inside the world's own slice needed a person, or the owner's open page, to tick it.
  - **Rounds 15 and 16:** a scheduled-tick pass over parked worlds was tried, then dropped. Releasing jobs parked for a person raised one problem after another:
    - its time inside another game's turn;
    - telling the engine's own holds from an operator's;
    - fairness between parked worlds;
    - races with the owner's tick.
  - **The answer is the one round 14 offered:** a world whose ledger is held only by interruptions the continuation admits never parks.
    - `openAdmittedInterruptions` (a cheap read) groups the uncontinued unknown answers by the image each asked about, using its background round's binding. Every one must be admitted, or it is "blocked" and a person decides.
    - At a park point (a held review, or the held ledger at the end of a slice), such a world yields, queued: a candidate of the scheduled selection, under its own claim.
    - The next slice starts with `continueAdmittedReviewInterruptions`, while it has time, under its own claim (each write checks the slice's fence). It prepares one image at a time, alone (75 s of room needed), on unchanged pixels only, and continues that image's interrupted questions together.
    - An image with a background question still asked (its create claimed) is deferred, so its interruptions are continued together once its whole round has ended. Every slice first advances the world's background rounds, and a claimed Flex round ends within 10 minutes (answered, refused, cancelled or lost), so a deferral always ends. An intent the held ledger refused to send was never claimed, and never defers.
    - A continuation a slice could not complete ("blocked") parks the world at that slice's park point instead of yielding again.
    - No parked job is released anywhere on this path.
  - **Round 16, two failures on one image:** a lean bundle and its continuity question are asked side by side and can fail together. `recoverPreparedLocalPatchReviews` authorizes each question on its own and records them all on the image in one transaction (`reviewInterruptions` keeps every one), so neither is stranded by the other's round.
    - The image's evidence log gets **one** transport entry for that round, not one per question. Two consecutive transport entries mean a provider outage and wait an hour (`local-patch-evidence-recovery/v2`), and the rest of the engine already writes one entry per failed round. Written per question, one double failure waited an hour. The entry is the question the policy had escalated, if any (at most one role is escalated per round), so the next round keeps that question's strategy. A single question is logged exactly as before.
  - **A provider-declared failure is admitted only on this path** (`admitProviderFailed`, which requires `releaseParkedJob: false`). Every older caller admits the no-response shape alone, exactly as deployed. Its unconditional re-queue therefore reaches nothing new; it is a pre-existing limit, recorded below.
  - **A world parked before this existed (the QA world since 12:21)** is resumed only by a tick that names it, its owner's page (`resumeParkedInterruption`), and only when:
    - the hold the engine recorded names one of its open interruptions (`<requestKey>: …`);
    - every unknown answer holding the ledger is admitted;
    - after the continuation the ledger is no longer held.
    The job is re-queued compared on the hold it observed (reason and version), so a hold placed meanwhile stays.

**Tests:**
- a world whose one continuity answer stays running: both siblings are asked after it and decided before it answers;
- a world whose bundle the provider ends `failed`: only ordinary slices, never parked, READY, the $0.20 kept unknown;
- a world whose bundle and continuity question both end `failed`: never parked, no hour's outage wait, READY; both continued and recorded on the image in one step, one evidence entry for the round;
- a world with seven failed bundles (two continuations under v1, four under v2): the first six are continued, and the seventh parks it for a person within a slice, never yielding again;
- a world already parked by the engine on such a failure:
  - the scheduled tick never chooses it;
  - a tick naming it, under an operator's hold on that same world, neither continues nor releases anything;
  - with its round's recorded end altered, nothing happens;
  - with the record intact it is continued, re-queued and finishes, never parked again;
- the shape rules, one by one;
- the deadline per policy.

For fixes 1 and 2, each of five mutants is caught by its own test: the fix removed, the deadline swapped or applied to all, an ended round still named, an unreadable record skipped. Five admission mutants of fix 3 are caught by their own tests (93f78a1f): the shape not admitted, the round cross-check removed, a failure with usage admitted, the evidence code, and the no-response shape broken.

**Still open:**
- **The provider's error code for a failed response is not kept.** The adapter reads status and usage only, so a Flex capacity failure cannot be told from any other.
- **The ready email's provider error is not kept either** (`local-patch-notifications.ts`). On QA the pilot world's mail failed only for its non-Guy recipient, and the cause is unrecorded.

## Known limits

- Flex in background mode is undocumented. On the first QA world it worked at half price, but one answer in about fifteen was still queued at 25 minutes and one ended `failed`.
- **Pre-existing, unchanged:** the world slice's `needs-release` branch and the subject upgrade re-queue any parked job once an admitted no-response timeout is continued, without comparing the hold they observed (Codex round 16). A provider-declared failure never takes that path.
- **A world parked before local-patch-continue-in-slice/v1** resumes only through a tick that names it (its owner's page). The scheduled tick never chooses a parked world.
- The waiting and held reasons of a lean quality round still read "Continuity question in the background: …". This is cosmetic.
- A lean world's continuity answer is bought even when its quality answer refuses (about $0.016). That is the price of deciding in one slice.
- The read-only evidence planner (`local-patch-evidence-plan.ts`, `nextDualReviewPurchase`) still describes a non-lean world's next question (Opus quality, then continuity) for a lean world. It decides nothing and buys nothing, but its figures for a lean world are not the lean ones.
- Every limit recorded in `docs/CLAUDE_SUBJECT_RECOVERY_20261018.md` still applies.
