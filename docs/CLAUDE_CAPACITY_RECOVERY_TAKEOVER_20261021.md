# Capacity recovery: why lean worlds park, and the takeover of lean-capacity-recovery/v1

**Date:** 21–22 October 2026.
**Branch:** `claude/capacity-recovery-takeover-20261021`, based on `1372ecb6`.
**Not deployed. No grant applied. No live record changed.**

## Why lean worlds stop

QA data from 19–21 October shows one event behind every park of a lean world. Sol on Flex answers `failed` with `server_is_overloaded`, with no output and no usage.

| Day (UTC) | Flex answers received | Ended failed | Share failed |
|---|---|---|---|
| 19 Oct | 33 | 1 (+1 cancelled) | 3–6% |
| 20 Oct | 58 | 10 | 15% |
| 21 Oct | 9 | 12 (all `server_is_overloaded`) | 57% |

On 21 October, 8 of 10 bundle questions ended this way.

Each failure did three things at once:

- **It held money.** The failure was held as an unknown charge at the full reservation: $0.20 for a bundle, $0.12 for continuity. That is five to seven times a real Flex answer.
- **It spent a continuation.** Each one used up one automatic continuation out of 2 under v1, 4 under v2 and 12 under v3.
- **It parked the world.** When those continuations ran out, the world parked for a person.

The parked QA world held $3.48 of such reservations against $1.90 of settled spend, with 4 of its 27 hides done. Every earlier park was answered with more quota, never with a different rule.

## What is not done: an inferred zero

`claude/failed-review-no-charge-20261021` (never committed) settled such a failure at `provider-billed: $0`. Codex's review rejected it, and the review is right.

- OpenAI documents only the synchronous Flex `429 Resource Unavailable` as unbilled.
- A background response that ended `failed / server_is_overloaded` is not named.
- `usage: null` is an inference, not a bill.

The rule kept here: the decision to retry is separate from knowing the charge. An overloaded answer stays an unknown charge, reserved in full.

## What the branch carries

### Codex's lean-capacity-recovery/v1

Codex wrote this work. It was uncommitted when Codex stopped and handed it over: 24 paths, taken over byte for byte.

- **A grant one person authorizes, for one world.** It is a QA admin grant with a $12 cumulative cap. It is bound to:
  - the world, its source revision and the earlier $6 grant;
  - the exact hold and the ledger (its revision and hash);
  - evidence of at least two `server_is_overloaded` failures on different current images.
- **v4 continuations.** At most 32 of them, and only for evidenced overloads. The historical v1 to v3 bounds keep their meaning.
- **New questions on the default tier.** After the grant, new questions in that world go to the default tier. A round already begun keeps its keys and tier (R19–R22).
- **Publication.** Publishing requires each continuation's exact SYSTEM proof.

### Changes made after the takeover

1. **Test fix.** `local-patch-lean-world.test.ts` passed `{ fence }` to `prepareLocalPatchBoardReview`, whose dependencies are only `readBoardArt`. TypeScript refused it. Codex's last TypeScript run had been stopped, so this was never caught.
2. **Fix: a reused bundle keeps its old tier only when it replays exactly** (`dualQuestions`).
   - **The bug.** After a reference revision, every accepted appearance is asked again with the new identity. The reused quality answer was rebuilt with its old Flex tier, but the new identity gives it a new key, so it was a new question. Under the grant, its continuity question went to the default tier. The next pass saw the Flex round and asked the continuity again on Flex. The continuity was bought twice, and new questions went out on Flex after the grant.
   - **The fix.** The reused tier is kept only while `questionStarted` finds that exact question; otherwise the round's tier is used.
3. **The all27 capacity scenario now checks what the design promises.** It used to check "every create after the grant is default". It now checks:
   - every round begun after the grant is asked at the default tier;
   - a round whose intent was recorded on Flex before the grant may finish its other question on Flex (one tier per round, R22);
   - no question is asked twice in one round, across the whole run. A round is identified by appearance, identity, pixels, geometry, painting and evidence attempt.

   The run records when each question was decided, from its round's intent.

## Evidence

Synthetic providers only. Run in separate worktrees on 21–22 October.

| What | Result |
|---|---|
| TypeScript | passes |
| `world-budget-capacity-recovery`, `LeanCapacityRecoveryForm`, `identity-source-revision` (service and admin action), status route | 5 files, 219/219 |
| Capacity tier tests (pending default/Flex, completed Flex replay ×2) | 4/4 |
| All27 capacity scenario, with the fix | passes (618 s): READY after the grant, every round begun after it at the default tier, nothing asked twice |
| The same scenario with the reuse-tier fix removed | fails the tier check, on rounds begun after the grant on Flex |
| Full suite at `c4d8ae72` | TypeScript passes; 5633 tests pass; one file fails to load (see below) |
| Full suite at `f1028ec9` (clean tree, 4 workers) | TypeScript passes; 418 files pass, 1 skipped; 5642 tests pass, 2 expected failures, 58 skipped |

At `c4d8ae72`, `board-wizard-recovery.test.ts` fails before any of its tests run. It mocks `../board-wizard-identity-gate` with a single function. The budget's capacity reader now loads `identity-source-revision-state`, which builds its schema from that module's `identityProvenanceSchema`. `f1028ec9` keeps the module's real exports in the mock and replaces only the approval gate.

## Limits

- **Three paths changed after Codex's last reviewed snapshot (R22).** A headless run that ended without a report changed `lean-capacity-recovery.ts` and two test files. They are included as found and covered by the tests above. They were not compared with R22, because no copy of R22 exists, only its hashes.
- **Scope of this release.** It only lets a person release a parked world. It does not make capacity recovery automatic for new worlds. That needs a cap decision: reservations held in full make a bad day cost more committed money.
- **What it does not prove.** None of this is a completed live world, a deployment, or a grant.
