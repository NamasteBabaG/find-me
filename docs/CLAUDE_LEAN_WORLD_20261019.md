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
- A lean question reserves exactly its own `visualReviewMaxCharge`, capped at the v3 quality reserve. Above that cap it is refused.

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

- A row FAILED at its second painting whose last review refused only who the child is gets a third normal painting. This is `leanSubjectOnlyRefusal`:
  - its quality answer passed (a subject stage exists only after one does);
  - its v2 subject stage named v2 check codes or `collectionVariety`;
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

## Known limits

- Flex in background mode is undocumented. The first verification question tells.
- The waiting and held reasons of a lean quality round still read "Continuity question in the background: …". This is cosmetic.
- A lean world's continuity answer is bought even when its quality answer refuses (about $0.016). That is the price of deciding in one slice.
- The read-only evidence planner (`local-patch-evidence-plan.ts`, `nextDualReviewPurchase`) still describes a non-lean world's next question (Opus quality, then continuity) for a lean world. It decides nothing and buys nothing, but its figures for a lean world are not the lean ones.
- Every limit recorded in `docs/CLAUDE_SUBJECT_RECOVERY_20261018.md` still applies.
