# local-patch-lean-review-recovery/v1: lean review recovery (20 October 2026)

This is Claude's handoff to Codex for independent QA. The diff is uncommitted in the isolated worktree (base `7efd9783`). This round made no provider purchase, no live database write, no deploy, no commit and no push.

The second lean QA world stopped at `local-patch:needs-release` after its seventh provider-declared review failure, with $2.20 of its $4.00 still free. This document refers to it only as "the second lean QA world". Its id, its child and its account stay in Codex's private evidence folder.

## 1. Root cause: verified versus hypothesis

**Verified in code, and reproduced by a test on the base before this change:**

1. **The fixed quota stops the world.** Every answer the provider ends `failed` (no text, no usage) is held as an unknown charge with its whole reservation. Each one consumes the world's fixed continuation quota: two under v1, four more under v2 (`recoverPreparedLocalPatchReviews`). The seventh parks the whole world for a person, however much budget is left. The test "parks for a person, within a slice, at the failure its continuations cannot cover" reproduces exactly that text. It still passes unchanged, for a world without the new pin.
2. **The strategy never changed.** After a failure the same pixels were asked again on Flex every time. The default tier was used only after a documented create refusal (`dualReview` → `dualQuestions(..., { tier: "flex" })`).
3. **The provider's reason was thrown away.** `OpenAiBackgroundReviews.retrieve` read `status`, `output`, `usage`, `model`, `incomplete_details` and `service_tier`, but never `body.error`. So no record says why the provider ended any of the seven `failed`.
4. **An answer already received was bought again.** When one of an image's two questions failed, the next evidence round rebuilt both questions with a new "Evidence attempt" and a new fingerprint. A lean world writes no checkpoint between its two answers, so the sibling answer that had arrived was never reused, and it was bought again.

   This follows from the code. In the second lean QA world's ledger, 5 of the 7 failures were continuity questions ($0.12 reserve) and 2 were bundles ($0.20). After each of the five, the bundle about the same pixels was asked again.

**Hypotheses, not verified:**

- **Why the provider ended 7 of 19 Flex responses `failed`.** Candidates are Flex capacity, a transient server error, or something about specific images (5 of the 7 were on one board). Nothing in the records can decide between them. Every request was sent with `store: false`, and a background response is then kept only about ten minutes for polling. A GET of those response ids now would almost certainly answer 404.

  If Codex wants to try, a read-only GET of one recorded response id with the QA key is the only provider check left. It must not be a POST. From the next failure on, the code and a scrubbed message are recorded (§3.1).
- **Whether those failures were billed.** This is unknown, and every one stays an unknown charge reserved in full.

## 2. Files changed and why

| File | Change |
|---|---|
| `src/domain/generation/background-provider-error.ts` (new) | Scrubs a response's own `error` to one code token plus a message of at most 160 characters. Removes URLs, data URIs, e-mail addresses, key-like and long tokens, markup and invisible/bidi characters. Classifies the failure as `provider-transient`, `unclassified`, `request-invalid`, `content-policy` or `account`. |
| `src/domain/generation/lean-review-recovery.ts` (new) | The release's terms, the strict pin reader (new-world byte for byte; existing-world with a bounded binding), and `leanFailureAdmission`: kind plus the per-image bound. |
| `src/domain/generation/world-budget.ts` | New record `world-automatic-review-recovery/v3` (policy `local-patch-review-interruption/v3`), at most 12 per world. It needs its own trusted verifier, and no key may be continued by more than one version. v1 and v2 records, limits and validation are untouched. |
| `src/domain/generation/background-review-round.ts` | The outcome event may carry `errorCode`. Earlier outcomes have none and are read as before. |
| `src/infra/generation/types.ts`, `src/infra/generation/openai-background-review.ts` | `retrieve` keeps the sanitized `providerError` of a response that did not complete. |
| `src/services/generation/continuity-background.ts` | Keeps the scrubbed error beside a failed reply (a new field, so earlier envelopes and their digests are unchanged). Records `errorCode` on the outcome and in the unknown reason. Adds `backgroundRoundsOnImage`, which reads every round about exactly one image's pixels from the record alone. |
| `src/services/generation/local-patch-review-interruption-recovery.ts` | Adds `providerFailureRefusal`: the kind check in every world, plus the per-role, per-image bound in a pinned world. Allocates v1 → v2 → v3, v3 only for a pinned, enrolled world. v3 proofs name the failure's kind and code. `continuationRecorded` and `isAutomaticReviewApproval` include v3. |
| `src/services/generation/subject-upgrade.ts` | `openAdmittedInterruptions` stops at once with the exact reason for a failure that is never asked again, so a slice parks instead of yielding. |
| `src/services/generation/local-patch-dual-review.ts` | In a pinned world, after a provider-declared failure about these exact pixels, both questions go to the default tier. An answer already received is replayed through `carriedLeanAnswers`, but only when the rebuilt question matches its recorded fingerprint byte for byte, its bill and envelope agree (`verifiedDualStage`), and it passes. |
| `src/services/generation/lean-review-recovery-pin.ts` (new) | Pin reader; `parkedHoldSha256` (moved here from the parked-wake module and re-exported there unchanged); `boundLeanRecoveryHold`. |
| `src/services/generation/lean-review-recovery.ts` (new), `scripts/lean-review-recovery.ts` (new) | The explicit path for an existing world (§4). |
| `src/services/generation/lean-release.ts` | A new lean draft receives the new-world pin in the same transaction as its lean pin. |
| `src/services/generation/local-patch-world.ts`, `local-patch-parked-wake.ts` | Wake and resume exactly the hold a person's release bound. Any other continuation hold is never woken. |
| `src/services/generation/local-patch-interruption-recovery.ts`, `local-patch-player.ts`, `board-wizard-budget.ts` | Publication accepts v3 records only for a pinned, enrolled world; the attempt-2 key mapping for v3. |

## 3. The new policy and its bounds

### 3.1 Every failure kind, and what happens next

| Kind | What happens |
|---|---|
| A read (GET) fails | The round waits and the same response is read later. Never a new purchase (unchanged). |
| Still `queued` or `in_progress` | The round waits. At its deadline (10 min Flex, 25 min default) it is cancelled once, then polled (unchanged). |
| Lost create | The charge is unknown in full, in the no-response shape. It is continued like before, now also under v3 in a pinned world. |
| Documented refusal at create (4xx with an error envelope) | Settled at the provider's documented zero. A Flex question goes once to the default tier. A refusal at the default tier is held for a person; it is never a loop (unchanged). |
| Ended `failed` with a recoverable code (`server_error`, `rate_limit_exceeded`, `vector_store_timeout`) or no code | The charge stays unknown in full and is continued. The next questions about the same pixels go to the default tier. The failure's code is recorded. |
| Ended `failed` (or `incomplete` by the content filter) with a `request-invalid`, `content-policy` or `account` code (quota, billing, credentials), priced or not | Nothing more is asked about those pixels, at any tier. The charge stays as it arrived: a bill stays settled, a missing one stays unknown in full. The world parks at once with the exact reason, naming the kind and the code (§8). |
| Invalid answer (completed but unreadable, truncated, wrong model) | The existing evidence policy: strict-json or compact, bounded per image. |
| Real quality or subject rejection | A repaint (unchanged). |

### 3.2 Bounds

All of these hold at once:

- **Per image** (existing): at most 4 review rounds, and an hour's wait after two transport failures in a row.
- **Per image and role, new in a pinned world:** a role's second default-tier failure on the same pixels is not continued. The world parks with the exact reason.
- **Per world:** 2 continuations under v1, 4 under v2 (only in an enrolled world), and 12 under v3 (only in a pinned world).
- **Money:** $4.00, with every unknown reservation counted in full. Every new question reserves before it is sent, and a reservation that does not fit is refused before dispatch: `cap_exceeded`, then a wait or a park with the exact budget reason. No continuation ever releases or reprices a reservation.

### 3.3 No double purchase

- One create per round, ever, behind a claim compare-and-set (unchanged).
- A replayed answer is never re-created: its round is terminal and its intent identical, so `askContinuityInBackground` proceeds without a create.
- v3 approvals are idempotent by their approval id (a hash of the proof).
- The image's record of a continuation is a compare-and-set, and a release compares against the exact hold it observed.
- The integration test runs two workers at once and asserts that no request body was ever sent twice.

### 3.4 Old records

- v1 and v2 limits, ids and proofs are built exactly as before.
- A round recorded before this change has no `errorCode`. It reads as `unclassified`, which is recoverable, so nothing earlier is read differently.
- A world without the pin behaves exactly as before. The tier switch, the replay, the per-image bound and v3 all need the pin. The kind check applies everywhere, but only a code recorded from now on can trigger it.

## 4. The explicit path for a world whose 2+4 is spent

The unpinned second lean QA world is never released automatically. A person runs:

```
npx tsx scripts/lean-review-recovery.ts plan  --game=<gameId>
npx tsx scripts/lean-review-recovery.ts apply --game=<gameId> --operator=<operatorId> --plan=<planSha256>
```

**`plan`** reads only. It is eligible only when all of these hold:

- the world is a paid, unrefunded, lean, enrolled, nine-board v12 world in generation, not deleted and not ready;
- it carries no pin yet;
- the job is `FAILED` at `local-patch:needs-release`, and its reason is exactly the spent-continuations hold (`SPENT_CONTINUATIONS_HOLD`);
- v1 and v2 are spent;
- nothing is pending, and there is no overrun, conflict or over-cap;
- every uncontinued unknown is an admitted interruption whose kind may continue.

It returns the binding: the job id, the hold's digest (`parkedHoldSha256`: job id, the moment the reason was written, and the reason), the held request keys, and the ledger's digest (audit plus continuation counts).

**`apply`** checks the plan's digest and writes one audit row and nothing else: `aud_lean_review_recovery_<gameId>`, `ADMIN`, the operator id. Inside one serializable transaction it reads the job and the ledger again and compares them with the binding. It writes neither, because a write would move the hold the pin binds. Applying the same plan again changes nothing; a different plan is refused.

**After the pin:**

1. The scheduled tick gives exactly that hold its turns (`local-patch-parked-wake/v1`: 3 per hold, 10 minutes apart).
2. The world's own slice continues the held key under v3 and re-queues the job, compared on the hold it observed.
3. A refusal that waiting cannot change replaces the hold with the exact reason, so it is never woken again.

## 5. Test results

These are local runs with mocks and a temporary SQLite database; nothing live. All Vitest runs used `--maxWorkers=1`, from the worktree root.

| Command | Exit | Result |
|---|---|---|
| `node node_modules/typescript/bin/tsc --noEmit` | 0 | clean |
| `npx vitest run src/domain/generation/__tests__/lean-review-recovery.test.ts src/domain/generation/__tests__/background-review-round.test.ts src/infra/generation/__tests__/openai-background-review.test.ts src/services/generation/__tests__/continuity-background.test.ts src/services/generation/__tests__/local-patch-interruption-recovery.test.ts src/services/generation/__tests__/world-budget-review-recovery-v2.test.ts src/services/generation/__tests__/lean-release.test.ts --maxWorkers=1` | 0 | 7 files, 59 tests passed |
| `npx vitest run src/services/generation/__tests__/local-patch-lean-world.test.ts --maxWorkers=1` (whole final file) | 0 | 15 / 15 passed (2527 s): the 12 existing worlds, which carry no pin, unchanged, including the 2+4 park text; plus the 3 new ones |
| `npx vitest run src/services/generation/__tests__/local-patch-subject-upgrade.test.ts src/services/generation/__tests__/local-patch-incremental-review.test.ts src/services/generation/__tests__/local-patch-deletion.test.ts src/services/generation/__tests__/local-patch-player.test.ts src/services/generation/__tests__/dual-review-reserve.test.ts src/services/generation/__tests__/local-patch-review-recovery.test.ts "src/app/qa/subject-upgrade/[gameId]/__tests__/actions.test.ts" --maxWorkers=1` | 0 | 7 files, 124 tests passed |
| `npx vitest run src/services/generation/__tests__/local-patch-dual-world.test.ts src/services/generation/__tests__/local-patch-subject-v2-world.test.ts --maxWorkers=1` | 0 | 2 files, 8 tests passed |

What the new tests prove:

- **The parked world's situation, synthetically.** Seven provider-declared failures after 2+4, with headroom left.
  - A pinned world continues under v3 and publishes all 27 appearances.
  - Each failed picture's bundle is asked twice, once on Flex and once at the default tier.
  - Its continuity answer is received once and replayed, never bought again.
  - All seven unknowns stay reserved in full, at 7 × $0.20.
  - The committed total stays at or under $4.
  - No request body is ever sent twice, even with two concurrent slices.
- **An unpinned world** parks exactly as before (the existing test). It is released only by `plan` and `apply`:
  - a wrong digest or an unbounded operator is refused, and nothing is written;
  - apply leaves the job and the ledger byte for byte unchanged;
  - the scheduled tick then wakes exactly the bound hold;
  - a pass that writes the v3 approval and stops before the image records it is finished later with the same approval, never a second one;
  - the world then publishes.
- **A `content-policy` failure** parks at once with its exact reason. It is never woken or asked again, and more slices change nothing. Once deleted, the world is never resumed.
- **Ledger:** v3 needs its own verifier, is idempotent, stops at 12, and never continues a key that v1 or v2 already continued. It refuses invalid shapes. With 18 unknowns continued ($3.60 of $4.00), a $0.25 question is refused before anything is sent.
- **Transport and scrubbing:** missing, long and malicious errors; a code that is not a token; a missing usage or tier. A completed response keeps no error.
- **Background round:** a failed GET, then a running response, then a terminal failure with a code. The code lands on the outcome and in the reason. A failure without a code is recorded exactly as before.
- **The per-role, per-image bound:** Flex, then default, then a second default failure, which is refused. Never-again kinds are refused at any count. A world without the pin applies only the kind check.

Not run: the full `npm run check` and CI on an exact SHA. Both remain required before release.

## 6. Still unknown

- Why the provider failed those seven answers, and whether they were billed (§1).
- **Whether the default tier fails less on the same pixels.** Nothing has measured it yet. The bound makes a repeated failure stop with its reason instead of looping.
- **Whether the second lean QA world can finish within $4.00.** It has $2.20 free and 24 appearances to go, and every unknown stays counted. If the ceiling is reached, it parks with the exact budget reason. It never overspends.
- **A Flex answer cancelled at its 10-minute deadline** that ends `cancelled` with no usage is still not an admitted interruption. That is unchanged and not seen in this world. It parks for a person with its reason.
- **The planner is not aligned with the engine** (details in §8).
- **Two hours per world was not proven.** No synthetic test can show it.

## 7. What Codex must verify before releasing the existing world

1. Review this diff. Run the full `npm run check` and CI on the exact SHA; this round ran only focused files.
2. Deploy to QA through the normal release flow, with Guy's approval.
3. Verify the deployed SHA and authorized health.
4. Read the world again, read-only, and confirm it is unchanged since the snapshot:
   - the same job hold (status, step, reason and `updatedAt`);
   - settled 798509 and unknown 1000000 micro-USD across 7 keys;
   - v1 = 2, v2 = 4, nothing pending.
5. Open the world's admin order page on QA (`/admin/orders/<gameId>`, §9). The release form appears only while the plan is eligible. It shows the committed total, the cap and what remains, and carries that plan's digest; `plan` (§4) prints the same plan from a terminal. Expect it to be eligible, with no refusals, holding exactly the one key the hold names, of shape `provider-failed`, with refusal `null`.
6. With Guy's explicit go-ahead, an administrator ticks the confirmation and releases the world from that form (or runs `apply` with that plan digest).

   Afterwards confirm:
   - exactly one new audit row;
   - the job row byte for byte unchanged;
   - the ledger snapshot unchanged.
7. On the next scheduled tick, watch for:
   - a parked-wake receipt for the hold;
   - a v3 approval (`auto-review-v3-<proof hash>`) whose audit row is recorded on the image;
   - the job re-queued;
   - the held image's next questions at `...-background-default/lean-v1`;
   - no request body sent twice;
   - the committed total at or under 4000000 micro-USD;
   - any new failure recording `errorCode`.
8. If it parks again, read `lastError`. It names the kind and code, the per-image bound, the v3 count or the budget. Do not reset it, delete an unknown or approve art by hand.

Note: the worktree path and the branch name chosen for this task contain the child's first name. Rename them before anything is pushed to the public repository.

## 8. Codex QA round 1 (20 October): R1 and R2 fixed

Codex's independent QA (`requires-fixes`) reproduced two defects. Both are fixed in the same worktree, still uncommitted. Nothing that passed was rewritten:

- the 59 focused tests;
- the carry case where quality passed and only continuity failed.

### R1 (P1): a never-again failure that arrived with usage was asked again

**Cause.** A response the provider ended `failed` with a usage it bills was settled as an unusable answer. Only an unknown charge reached the never-again check (`admittedInterruption` → `providerFailureRefusal`). So the evidence policy asked the same pixels again, and the tier switch sent that question at default. Codex saw a content-policy failure with usage dispatched twice: Flex, then default, at the same painting attempt.

**Fix.** The decision now reads the failure's recorded code, never its charge. It applies in every enrolled world, before any tier is chosen or question sent:

- `permanentFailureOnImage` (continuity-background.ts) reads every round about exactly these pixels. Any round whose recorded code is request-invalid, content-policy or account stops every further question about them.
- `dualReview` checks it first. The background wrapper checks it again after every answer that has just ended, before anything else is read, sent or bought.
- The charge is kept exactly as it arrived. A bill stays settled; nothing is turned into an unknown to reach the stop. A missing bill stays unknown and reserved in full.
- The world parks with the exact reason. For a priced failure that is `<key>: the provider ended it failed (<kind>: <code>); a <kind> failure is never asked again automatically; nothing more is asked about these pixels until a person decides`. An unpriced one keeps the continue-in-slice text of the interruption path.
- Also included: a response cut short by the provider's content filter (`incomplete`, `content_filter`) now records `content_filter`, a content-policy code.
- Unchanged: a failed or timed-out GET still waits and never buys.

### R2 (P2): a credential-shaped code was persisted

**Cause.** `providerErrorCode` accepted any lower-case token under 65 characters. A synthetic `sk-` plus 48 letters was kept as `providerError.code` and copied to the outcome and the ledger reason. No real secret was involved.

**Fix.** A code is kept only in the documented shape: lower-case words joined by `_ . : -`, at most 48 characters. Anything code-shaped that could be a credential, a token or an id is recorded as `withheld` and read as unclassified. That covers:

- a credential prefix with its secret part (`sk-`, `sk_live_`, `pk_`, `rk-`, `org-`, `sess-`, `ghp_`, `xoxb-`, `AKIA`, a JWT, and others), in any case;
- more than 48 characters, or a word longer than 24;
- a word of 12 or more characters containing digits;
- a token not in the documented shape.

It applies to `code` and to the `type` fallback alike. A documented refusal at create (`BackgroundReviewRefused.errorType`) goes through the same filter, because it is recorded in the round, its zero receipt and the hold. Anything that is not one token is still no code at all. The message scrubbing is unchanged.

### Regression tests

| Where | Cases |
|---|---|
| `local-patch-lean-world.test.ts` | `it.each` over four cases: bundle + content-policy priced; continuity + account priced; bundle + request-invalid priced; continuity + content-policy unpriced. Each asserts exactly one dispatch of that role about the pixels, on Flex, and none at the default tier; at most two dispatches about them in all. It also asserts a park with the kind and code, never woken; the charge exactly as it arrived (settled, or unknown at the role's reserve in full); and that three more slices change nothing. It uses the existing fake with one new `failureUsage` option, not a copy of the file. |
| | With the new stop disabled for one run, the priced bundle case fails: the world never parks, as in Codex's reproduction. It was restored at once. |
| `continuity-background.test.ts` | `permanentFailureOnImage` against real round records: priced (settled, outcome `unusable`), unpriced (unknown in full), a content filter, an account code; and no stop for recoverable codes, a withheld code or other pixels. |
| `openai-background-review.test.ts` | A credential-shaped `code`, and `type` in upper case, on a failed response. A refused create through `code`, `type`, a numeric `code` with a `type` fallback, and no code. The content-filter `incomplete`. |
| `lean-review-recovery.test.ts` (domain) | Codex's exact case; about 20 credential, token and id shapes, each also through the `type` fallback and checked never to appear in the result; documented codes and ordinary words kept; the bound at 48 and 49 characters; fallback rules; `permanentProviderFailure`. |

### The planner (reported separately, not aligned)

`planLocalPatchEvidenceRecovery` and `nextDualReviewPurchase` (`scripts/local-patch-evidence-plan.ts`) are a read-only operator report; no engine decision reads them. For any lean world they still predict a different question from the engine's:

| | The planner predicts | The engine asks |
|---|---|---|
| Question | Synchronous Opus 5.5 HIGH quality | Sol 6.1 bundle (quality plus subject) in the background |
| Reserve | v3, 250000 micro-USD | 200000 micro-USD |
| Tier | none | Flex, or default after a refusal or a failure on the same pixels |
| Received answers | not modelled | replayed |
| Permanent failures | not modelled | stopped |

That gap predates this change (local-patch-lean/v1), and this change widens it. It was not changed in this round. Do not rely on it for a lean world; aligning it means running the dual review's decisions read-only.

### Results of this round

All runs used `--maxWorkers=1`; nothing live.

| Command | Exit | Result |
|---|---|---|
| `node node_modules/typescript/bin/tsc --noEmit` | 0 | clean |
| the 7 focused files (same command as §5) | 0 | 7 files, 63 tests (59 + 4 new) |
| `npx vitest run src/services/generation/__tests__/local-patch-lean-world.test.ts --maxWorkers=1 -t "Codex QA R1"` | 0 | 4 passed, 15 skipped (211 s) |
| `npx vitest run src/services/generation/__tests__/local-patch-lean-world.test.ts --maxWorkers=1` (whole file) | 0 | 19 / 19 passed (2442 s) |
| `npx vitest run` over local-patch-subject-v2-world, local-patch-dual-world, local-patch-subject-upgrade, local-patch-incremental-review, local-patch-deletion, local-patch-player, dual-review-reserve, local-patch-review-recovery and the QA subject-upgrade actions, `--maxWorkers=1` | 0 | 9 files, 132 tests passed (1717 s) |
| `git diff --check` | 0 | clean |

Not run in this round either: the full `npm run check`, the build and CI on an exact SHA. All three remain required before release.

Codex closed R1 and R2 in its round 2 (focused 63/63, independent probes 3/3, permanent world cases 4/4). The 26 files were then committed exactly as Codex hashed them (`85b427c5`, branch `claude/lean-review-recovery-20261020`, a name without the child's) and pushed.

## 9. The admin release form (21 October)

Guy chose to release the parked world from a page rather than the script, which needs the QA database credentials. The page follows the existing per-game admin forms (`LocalPatchRepairResumeForm` and `resumeLocalPatchRepairsAction`).

**`LeanReviewRecoveryForm`** sits on `/admin/orders/[gameId]`:
- It renders only for an administrator (`currentAdmin`); without one it never reads the plan.
- It renders only while `planLeanReviewRecovery` is eligible.
- It shows the committed total, the cap and what remains. It renders no request key, child, photograph or account.
- It carries the game id and the plan digest in hidden fields, plus one required confirmation.

**`applyLeanReviewRecoveryAction`** (`src/app/admin/actions.ts`):
- QA access and an administrator are required, as for every admin action.
- Before anything is attempted, it requires all of these:
  - `APP_ENV=qa`;
  - same origin, including a forwarded host;
  - exactly one game id, matching the id pattern;
  - exactly one 64-character hex plan digest;
  - exactly one confirmation equal to `LEAN_REVIEW_RECOVERY_CONFIRMATION`.
- The operator is the authenticated administrator; a forged `operatorId` field is ignored.
- It calls `applyLeanReviewRecovery` with that digest. That function re-plans, compares the digest, and re-reads the hold and the ledger in a serializable transaction (§4).
- Any failure becomes `?leanRecovery=blocked`, never with private detail. Success, or the same plan applied again, becomes `?leanRecovery=applied`.
- The order page shows one notice for each.

**Tests:**
- `LeanReviewRecoveryForm.test.tsx`:
  - renders one bound release, with the digest, the confirmation and one submit;
  - shows the money and never the key;
  - never acts on render;
  - is hidden when the plan refuses;
  - never reads the plan without an administrator.
- `src/app/admin/__tests__/lean-review-recovery-action.test.ts`:
  - the session administrator and the exact digest are bound;
  - an idempotent repeat is reported as released;
  - 14 refusal modes are checked before the release is attempted: production, no admin, QA access denied, cross origin, missing origin, cross site, unconfirmed, wrong confirmation, duplicate id, duplicate plan, duplicate confirmation, malformed plan, missing plan and invalid id;
  - a failure becomes a safe notice.
- The existing admin tests still pass with the new import.

**Review.** Codex reviewed the change read-only on 21 October (CLI, `exec -s read-only`): `VERDICT: PASS`, no P0 to P3 findings.
- Typecheck exit 0; the admin tests 11 files, 116 tests; `git diff --check` exit 0.
- It traced the planner's reads: no reservation, release, write or provider call on render.
- One note: the surrounding order page already creates a share link for a playable game. That branch does not run for a parked world in generation.
