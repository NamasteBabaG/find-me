# Judge contract and recovery — batch 1 handoff, 12 October 2026

Brief: `docs/CLAUDE_ENGINE_RECOVERY_IMPLEMENTATION_BRIEF_20261012.md` (Codex, committed unchanged). This is the blocking fix, handed over for Codex's independent review before any push, deployment or live recovery. Batch 2 (v16) follows in separate commits.

- **Worktree:** `C:\GNart\Work\find-me\work\claude-engine-recovery-20261012`
- **Branch:** `claude/engine-recovery-20261012`
- **Base:** `ee74b6c379b7ae475d4707a1f58f15127f0c06cc` (the QA deployment the brief names, verified on 12 October)
- **Code commit:** `15008ae066396211858f244b4455f6c9204bcf39`; this document and the brief are in the commit after it, whose SHA is in the handoff message

Nothing was deployed, no database outside local SQLite tests was touched, the stuck game was not run, no flag was changed, no provider was called and no customer data or reviewer text was used. All fixtures are synthetic.

## Root cause, confirmed in the code

1. The runtime anatomy question (Sol, `gpt-6.1-sol`, HIGH) asks for one case covering every person in the crop and to "summarize the observed connections in headTrace/bodyTrace".
2. Its parser capped `headTrace`, `bodyTrace` and `occlusion` at 600 characters, each fault location at 400 and the fault list at 8. None of these limits was stated to the judge.
3. Any one field over its limit made the whole answer `null`. The dual review turned that into `wireFault: "schema"` and `integration-review-unreadable` — the same code as a genuinely malformed reply — and the row became an evidence failure.
4. Evidence recovery allowed three questions, waited an hour, then allowed three more, without end, always asking the same question in substance. Each round bought a new Sol answer (a new fingerprint per round) that failed the same way.
5. A latent second defect of the same shape: a real anatomy fault described in more than 400 characters also made the answer unreadable, so a defect could be retried as "unreadable" instead of being repaired.
6. When the world could not fit the next $0.30 reservation (the incident: $4.701771 committed of $5, $0.298229 left, the automatic $4→$5 extension already used), the job returned to `QUEUED` with `recovery-budget-wait` every hour, forever, although nothing could change.

## What changed

### A. A versioned answer contract (prompt ↔ answer ↔ reader ↔ gate)

`src/domain/scene/local-patch-body-continuity.ts` now has three named readers. Every decision records the reader that made it, and a question is only ever decided by a reader its pinned version allows.

| Reader | Used for | Bounds |
| --- | --- | --- |
| `continuity-read/v1-strict-600` | every v1 stage written before readers were named (historical, unchanged) | the old 600/600/600, 400 per fault, 8 faults |
| `continuity-read/v1-output-bounded` | new answers to the unchanged v1 question, and the free re-reading of stored v1 answers | one bound derived from the question's own output ceiling (4,096 tokens): 16,384 characters per field (4 × ceiling), 32,768 per answer (8 × ceiling), 32 faults |
| `continuity-read/v2-crowd` | the new v2 crowd question | exactly the limits its prompt states (see below) |

Why these bounds: the v1 prompt states no limits, so the only honest bound is what the provider can return in one reply. No text field can be longer than the whole visible answer; an answer above eight characters per allowed token is abnormal and gets its own code (`oversize`). Nothing is truncated: the whole answer is parsed, so a fault or contradiction at the end of a long explanation stays a defect. The decision rules (`state`, `headConnection`, `visibleBody`, `faults`) are unchanged.

**v2 crowd question** (`local-patch-dual-high/v2`, opt-in only — see "Compatibility"): one entry per visible person (`ref`, `role: target|bystander`, the same per-person fields as a v1 case), at most 8 entries plus an `unlisted` count, traces 12–200 characters, occlusion ≤ 160, ≤ 3 faults of 8–200 characters each. The prompt is built from the same constants the reader enforces (`CROWD_CONTINUITY_LIMITS`). Each person is judged alone, so a good target never excuses a broken neighbour. The target must appear exactly once and be coherent; a missing or doubled target is a conflict, never a pass. A peeking head whose own body is hidden by a named solid occluder is valid (in v1 the single crowd case could never be in that state, so v1 keeps its rule). Size and cost: worst case about 2,900 visible tokens of the unchanged 4,096 ceiling, typical answers far smaller than the observed v1 answers; same model, effort, policy, reservation and rate card.

**Error classes** are now separate everywhere a reply is read: `syntax`, `shape` (wrong field/enum/type), `length`, `count`, `oversize`, `ids` (missing, duplicate or foreign case), `empty`, provider `transport` (timeout/http/no-content), `truncated` (finish reason), `wrong-model`, and the two visual ones, `unsure` and `conflict`. Each failed round is logged in the receipt (`evidenceAttempts`) as role, kind, code and JSON path (for example `continuity length at cases.0.headTrace`), never reviewer text; `lastError` carries the same codes.

**Publication gate** (`allowedDualPublication`): verifies the pinned version (v1 or v2), both paid stages against the ledger and retained envelopes (unchanged checks, now shared as `verifiedDualStage`), and re-reads the continuity answer with the reader its decision names. A recorded re-reading must match the exact answer (request key, fingerprint, SHA-256 of the text), its previous reader and its own result, or publication is refused. A reader from another question's version is refused.

### B. Recovery that diagnoses and changes the question

`src/domain/scene/local-patch-evidence-policy.ts` (pure) replaces the hour-cycle rule:

- **Free first.** A stored, complete, transport-clean answer that was decided by a superseded reader is re-read once under the current reader, with no reservation, provider, spend switch or new image. The re-reading is recorded beside the original stage (`reading`: reader, previous reader, source key, fingerprint, text hash, result); the original record and the original receipt (kept in `reviewHistory`) are untouched.
- **Format** failures (`syntax`, `shape`, `ids`, `empty`): the identical question is never bought twice; the next one is `strict-json/v1` (exact JSON, exact keys, every id).
- **Size** failures (`length`, `count`, `oversize`, `truncated`): the next question is `compact/v1` (short traces, every defect still reported).
- **Transport** failures repeat the same question; two in a row wait out the outage (1 hour), and the wait never resets a count. A log entry whose time cannot be read never waits forever: it stops automatic questions for that image.
- **Visual uncertainty** (`unsure`, `conflict`): one `decide/v1` question; if the reviewer is still uncertain about the same pixels, `pictureWhole` becomes `unsure` and the existing bounded image route takes over. A malformed or missing answer never authorizes a new image.
- **Limits:** an escalated strategy that fails twice is retired; a candidate image gets at most 4 review rounds in total (first review included), whatever the strategy or pause. Each strategy change or stop records a structured `evidenceDiagnosis` (cause, candidate image, rounds, strategies tried, next step).
- **Order:** every appearance gets its first picture and first review before any second round for an appearance that already had one, so the budget can still finish the others. A worker slice still buys at most one new review question (now also enforced for dual games without the player flag).
- **Truthful end state:** when the only unfinished appearances have no question left, or the next required purchase cannot fit the authorized world budget and nothing in flight can return capacity, the job is parked as `local-patch:recovery-exhausted` (FAILED, never polled, game stays `TARGETS_GENERATING`). The parent sees "Preparation needs service attention" (`preparationState: attention`); the admin order page shows the reason; the operator alert text names it. While a reservation is still pending the job keeps the existing budget wait. A reservation of unknown outcome is named in the reason: it stays held until a person reconciles it, so waiting cannot return it. Nothing is deleted, approved, or handed to the parent.
- **Alert, as it works today (unchanged):** the existing health sweep sends one alert per game, ever, and only for games paid within the last 24 hours. A world that was already alerted (for example while it waited for budget) is not alerted again when it parks, and the stuck game, paid on 11 October, may receive no alert at all: Codex should read its state directly after the deployment.
- **A behaviour change for older worlds:** the hourly budget wait used to apply to every local-patch world at its ceiling. A v10/v11 world at its $4 ceiling (no automatic extension exists for it) with nothing pending now parks with the exact amounts instead of re-queuing every hour forever. It does not fail the game and does not occupy the queue; `local-patch-paid-repair.test.ts` was updated to assert this. If Codex prefers the old hourly wait for v8–v11, it is a one-line version condition in `deferBudget`.
- **Un-parking** a world after a service decision is an operator write (as for `local-patch:needs-release`, which also has no tool): set the job back to `QUEUED` / `local-patch` under its current `attempts`. A released world that still cannot progress parks again on its next slice, after any free decisions, without a purchase.
- The Opus quality answer for the same candidate is replayed, never re-bought, while the anatomy answer is recovered (the replay now also reproduces the exact strategy it was asked with). Two independent HIGH answers bound to the same candidate remain required for publication. No single-judge, MED or manual path was added.

### C. Money

Unchanged: the $5 world ceiling, the one automatic $4→$5 extension, the $0.30 reservation per question, the rate card, `purchaseOnce` and every ledger rule. No reservation was reduced, no charge released. The free decision never touches the ledger.

New bound per candidate image: at most 5 review questions (4 rounds; a passing Opus answer is never asked again for the same pixels, so only the round in which it passes asks both reviewers), one reservation at a time. Before this change the bound was the world ceiling itself. The ledger's own $5 refusal does not name the refused reservation (the identity-stage deferral depends on that), so the parking reason states the exact remaining amount and ceiling, and the dry run states the reservation per question; no refusal metadata is invented.

### D. Dry-run recovery plan

`planLocalPatchEvidenceRecovery` and `npx tsx scripts/local-patch-evidence-plan.ts <gameId>` (read-only: no reservation, dispatch, row or audit write; output holds hide ids, plan classes, codes and micro-USD only). Per appearance: `approved`, `free-pass` / `free-repair` / `free-undecided` (decided from an answer already paid for), `unverifiable`, `first-review`, `evidence-question` (with role, strategy and round), `evidence-wait`, `evidence-exhausted`, `image-route`, `unpainted`. Summary: counts, a lower bound of paid questions still needed, whether the next $0.30 question fits under the current ceiling, and plain notes. When the ceiling shown is still $4, the note says that the one automatic extension to $5 is decided by the pipeline at its first refusal (only where policy allows it), not by the plan. It promises no completion.

Applying the free decisions needs no separate tool: the automatic pipeline does it first in every slice, fenced by the job lease, the game fence and the row's exact receipt, and it is idempotent (a decided answer is never re-read). Refunded, stopped, deleted, tampered or foreign evidence is never decided.

## Compatibility map

| Situation | Behaviour |
| --- | --- |
| Games pinned to `local-patch-dual-high/v1` (all current QA games, including the stuck one) | Same question text byte for byte (SHA-256 asserted in a test), same fingerprints; new answers read by the output-bounded reader; stored answers re-read for free once |
| New drafts with `LOCAL_PATCH_VISUAL_REVIEW=dual-high-v1` (current QA value) | Still v1 |
| New drafts with `LOCAL_PATCH_VISUAL_REVIEW=dual-high-v2` (new value; explicit choice) | Pinned `local-patch-dual-high/v2`: same models, effort and policies, the crowd question and reader |
| Pin that is not byte-for-byte a known release | Refused ("refusing a fallback"), as before |
| v1 stages written before readers were named | Read strictly at publication, exactly as before; a short answer that passed still passes |
| Delivered games, historical drafts, non-dual games | Never rewritten; the single-judge path keeps its questions and gains only the bounded recovery and the same classified log |

## Recovery path proposed for the stuck game (for Codex, after review)

1. Before deploying, run the read-only dry run from the reviewed commit (the script exists only there) against the QA database, with the same access used for `npm run game:status`: `npx tsx scripts/local-patch-evidence-plan.ts <gameId>`. Expected from the reconstruction: 16 `free-pass` (if their stored answers are the coherent ones the brief describes), 11 `first-review`, 22 paid questions still needed, `nextQuestionFits: false`. Any `free-repair`, `free-undecided` or `unverifiable` row is a real finding to read before deploying.
2. Deploy with the flags unchanged. The stuck job is `QUEUED` in the budget wait, so the cron's first tick after its hourly backoff runs the new code with no manual step: it decides the 16 without a purchase and parks the world as `recovery-exhausted` with the exact budget reason; the 11 stay untouched.
3. Finishing the 11 needs a service decision. Within the fixed $5 ceiling none is automatic (at least 22 questions at a $0.30 reservation each, $0.298229 left). This batch creates no such path.

## Checks run on the code commit

| Command | Result |
| --- | --- |
| `npm run check -- --maxWorkers=4` (tsc + vitest) | passed: 373 files; 4,824 tests passed, 2 expected failures, 55 skipped; 778 s |
| `npm run scenes:validate`, `npm run adventures:validate` | passed (no content changed; run as CI runs them) |
| `npx prisma db push` on a throwaway SQLite, then `npm run build`, with CI's synthetic environment | passed: 41 static pages; `finalize-build-traces` read 0 private-asset bytes; `audit-board-catalog-tracing` `status: pass`, `privateLeaks: []`, `problems: []`; `audit-player-performance` `status: pass`, `problems: []` |
| `git diff --exit-code` after the build (CI's generated-source drift check) | no drift |

An earlier full run, before the last fixes, failed `production-bootstrap.test.ts` once: its child process timed out at 15 s under the full load. Alone it passes 17/17 in 0.9 s, and it passed in the final run. Codex has documented this timeout before.

Targeted runs used `node node_modules/vitest/vitest.mjs run <file> [-t <name>]`. `local-patch-incremental-review.test.ts` alone takes about 8 minutes, and `local-patch-dual-world.test.ts` about 7.

## Evidence

Local, synthetic, mocked providers, real SQLite, real shipped v12 board art.

- **Contract:** the three observed lengths (1013/954/466, 1817/1602/779, 2169/2232/655) are refused by the strict reader with `length at cases.0.headTrace` and accepted by the output-bounded reader; coherent+fault, missing head, merged face, headless body, impossible connection and disconnected limb after 2,000-character explanations stay defects; natural occlusion with a named occluder and clean deletion pass; oversize, syntax, ids, shape, length and count get their own codes and paths; the v2 limits stated in the prompt equal the enforced ones; neither reader decides the other question's answer.
- **Dual pipeline** (`local-patch-incremental-review.test.ts`, 40 tests):
  - long answers publish with exactly 2 provider calls and 1 picture; a long answer with a late fault goes to repair;
  - malformed answers ask standard → strict → strict and stop (4 calls in total, 1 Opus, 1 picture);
  - an answer the provider cut off (`finish_reason: length`) is a size failure: standard → compact → compact, then stop (4 calls, 1 picture), logged as `truncated`;
  - uncertainty asks one decisive question, then the image route;
  - a v2 game publishes only on a crowd answer; pins v1/v2/none/tampered;
  - the deployed reader's refusal is decided for free at $0.298229 remaining with an identical ledger, and forged re-readings are refused;
  - refunded, stopped, deleted and tampered evidence is never decided.
- **Whole world** (`local-patch-dual-world.test.ts`):
  1. 9 boards, 27 appearances, long answers at the observed lengths and a real defect in the first picture of two appearances: delivered with 27 targets; 29 paintings (the 2 defects repainted once), 29 Opus and 29 Sol calls, all HIGH; 27 publication records; the ledger settled to exactly 29 × 48,800 + 29 × 18,000 + 29 × 10,000 micro-USD above the seed, nothing held or reserved.
  2. 11 October replay: 16 deployed-reader refusals and 11 painted-but-unreviewed appearances at $4.701771 of $5 after the automatic extension. The dry run reports 16 `free-pass`, 11 `first-review`, 22 questions, `nextQuestionFits: false`, and changes nothing. One slice decides the 16 with zero provider calls and an identical ledger, leaves the 11 byte-for-byte unchanged, and parks as `recovery-exhausted`; later ticks change nothing; the parent sees `attention`.
  3. With a reservation still in flight the world waits for budget instead of parking.
- **Failing without each fix** (each fix undone alone, the file restored and checked by SHA-256):
  - deployed 600-character reader → the three observed-length tests, the late-defect test and the free-decision test fail (5);
  - no round cap → the two cap tests fail;
  - no retirement of a failed strategy → 3 fail;
  - no escalation (the identical question again) → 6 fail;
  - no free pass in the world → the 11 October replay fails;
  - waiting instead of parking → the 11 October replay fails;
  - a cut-off answer classified as a format failure → the truncation test fails.
- **Other consumers of the new state:**
  - the queue excludes both parked steps (`fixed-world-queue.test.ts`, whose pinned query now names both);
  - the status route still reads the job only for local-patch games (`status/route.test.ts`; my first draft read it for every game, and the full run caught it);
  - a v10/v11 world at its $4 ceiling parks with the exact amounts and never calls the diagnostic (`local-patch-paid-repair.test.ts`);
  - an outage record whose time cannot be read stops automatic questions for that image instead of waiting forever (`local-patch-review-recovery.test.ts`).
- Tests that encoded the old policy were rewritten to the new one:
  - three immediate timeouts: now two, then a wait, then the existing two-continuation bound holds the world;
  - endless unreadable rounds: now the strict question twice, then parked;
  - the v10/v11 hourly budget wait: now parked (above).

## Visual control plan (prepared, not run)

The tests above prove integration and decisions, not that the reviewers see defects. This plan measures that. It makes paid calls, so it needs an explicit spend authorization and is not part of this batch.

- **Material:** public board art and the public demo hides only. No customer or tester-child image goes to a provider.
- **Pairs:** for each appearance, the intact composite and one broken variant made locally and deterministically (sharp), cycling through the classes the contract must refuse:
  - hard cut: the patch shifted 12 px across one join;
  - missing head: the head box restored from the clean board;
  - merged face: the face blended 70% into the board;
  - disconnected limb: one limb region offset from the body;
  - impossible occlusion: the board's foreground layer drawn under the child where it must cover them.
- **Valid cases that must pass:** natural occlusion (the real foreground layer over part of the body, with a nameable solid occluder) and a clean bystander deletion (a bystander covered by a clone of nearby background).
- **Size:** 5 calibration boards (15 pairs, 2 occlusion and 2 deletion cases: 34 images) and 2 holdout boards (6 pairs, 2 and 2: 16 images), 50 images in all. Each image gets the exact runtime questions: Opus quality, and Sol continuity in both v1 (output-bounded reader) and v2 (crowd). That is 150 questions, at most $45 reserved at $0.30 each. The settled cost follows the rate card and is expected far below the reservation. Run it in a separate synthetic world ledger, never a customer world.
- **Holdouts:** the holdout boards are run once, after any prompt or threshold change is frozen on the calibration boards.
- **Report:**
  - per defect class: broken refused (by either reviewer, as at publication) and intact refused;
  - unresolved and read-fault rates, by code;
  - answer lengths against the stated limits;
  - v1 against v2;
  - settled cost per question.
- **Proposed bar on the holdout:**
  - no broken image passes both reviewers;
  - at most one of the 10 intact or valid images is refused;
  - no read fault survives the recovery strategies.

## Not verified

- A live vision model: these tests prove the integration and the decisions, not that Sol or Opus detect every real defect. The control plan above is prepared and was not run.
- A full paid game, real wall-clock time and real cost.
- The migration-free deployment on QA, the dry run against the real QA database and the stuck game's actual stored answers (the 16 are assumed to be the coherent answers the brief describes).
- iPad performance (separate device acceptance).
- The v2 question with the real Sol model (opt-in; QA keeps v1 until it is chosen).
- The parking reason's clause for reservations of unknown outcome: the text only (no test builds an approved unknown at the ceiling); the decision it accompanies is the tested one.
- Un-parking after a service decision: an operator write, described above, not exercised here.

## Found, not changed

The Opus quality reader has the same latent shape: `integrationEvidence` and `boundaryIntegrity` observations are capped at 600 characters, fault locations at 300, and the player-review prompt states only "keep reason under 300 characters". Nothing in the incident failed there (Opus passed 16/16). Changing it alters publication for many games, so it belongs in its own versioned change.
