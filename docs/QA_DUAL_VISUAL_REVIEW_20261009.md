# QA: two independent HIGH visual reviews — 9 October 2026

This release connects the previously compared providers to the main fresh-game pipeline in the dedicated `find-me-qa` project. It does not activate detective artwork or change production.

## Prospective contract

- With `APP_ENV=qa` and `LOCAL_PATCH_VISUAL_REVIEW=dual-high-v1`, a new local-patch draft receives an immutable SYSTEM policy record in the same transaction as its creation. The additional-world purchase flow does the same. Existing drafts and delivered games keep their own policy.
- `claude-opus-5-5`, HIGH, reviews reference likeness, child age/body, style, lighting, natural scene integration and the four compositing boundaries. The existing strict player-visible-defect schema remains in force.
- After that review passes, `gpt-6.1-sol`, HIGH, receives only final context pixels, a target head detail and four continuous AFTER boundary strips. Its case covers all visible people, including bystanders. An intact target does not excuse a cut or impossible head/body connection elsewhere in the patch context. Clean complete removal of scenery or a bystander remains allowed.
- Both settled retained answers must pass before publication. Missing, malformed, truncated, wrong-model or contradictory answers cannot publish. A concrete anatomy refusal enters the existing automatic image repair route. Unreadable evidence is retried without repainting the image or repurchasing a good Opus review.
- Enrollment requires both configured provider credentials. Health reports the prospective policy and credential availability without exposing credentials. Existing pinned games can finish even if enrollment of further games is later disabled.

## Money, recovery and privacy

Each role has its own fingerprint binding the model, effort, rate card, prompt, labels, image hashes and candidate identity. Each request is inventoried before dispatch, reserved through `purchaseOnce`, retained and fenced against cancelled/deleted games and lost worker ownership. A worker slice buys at most one new review; the next slice reuses the completed role.

Each review reserves $0.30 separately; the two reservations are sequential rather than a simultaneous $0.60 requirement. Settlement records the conservative usage estimate. An unverified charge remains reserved and is never reset to zero. The existing narrow interrupted-review recovery retains the unknown amount and bounds new evidence questions. Other unverified billing still follows the existing hold/reconciliation policy; no fabricated receipt is introduced.

The customer limit remains **$5 per world**. The private authoring allowance and private ledger are excluded from this release. No extra paid inference or image generation was performed for this deployment work. A complete new 27-hide world has not yet been run with both runtime judges, so this release does not establish its total cost, completion rate or wall-clock time.

Publication re-reads both retained answers and their settled ledger records. A UI flag, an Opus-only pass, a human image approval or an unbound saved answer cannot replace them. The policy record contains no child information. Existing asset visibility, ownership, deletion inventories and shared-game progress are preserved.

## Other included engine safeguards

The reference-neutral v15 painter removes the previously hard-coded dark-curl instruction from fresh v12 appearances, restyling and recovery. Already pinned appearance recipes keep their original wording and receipt identity. Optional authored return rectangles preserve the historical geometry default when absent. Detective authoring metadata is included for regression evidence only; no new public art or active catalog release is part of this deployment.

The durable purchase store validates a new storage address before reservation and provider dispatch. A retention failure after dispatch preserves an unknown charge rather than allowing an unaccounted retry.

## Verification and limits

Mocked transport and real local SQLite tests cover draft enrollment, historical compatibility, both publication gates, independent anatomy refusal, evidence-only retry, good-review reuse, missing credentials, worker deadlines and retained timeout billing. These tests make zero provider calls. The release must additionally pass `npm run check`, scene/adventure validators and the production build/private-asset audit, with completed CI for the exact pushed commit before promotion.

The final local `npm run check -- --maxWorkers=4 --reporter=verbose` passed TypeScript and **366/366 files: 4,701 passed, 2 expected failures, 55 skipped** (706.21 seconds). Scene and adventure validators passed, including the existing 18-board v12 catalog. The six new pipeline cases also passed in isolation. The earlier run exposed a historical advisory-receipt compatibility regression; the production predicate was corrected, all 23 notification/publication tests passed, and the complete final check above includes that correction. A later exact-commit CI/build result is required independently of these local results.

The earlier live comparison is recorded in `VISUAL_REVIEW_MODEL_POLICY_20261008.md`: both HIGH transports worked; Sol rejected two reused known defects and accepted their intact counterparts. Those controls were not an independent holdout, and the runtime crowd-wide question is broader than the targeted authoring calibration. The new main-pipeline wiring is therefore not a claim of perfect visual detection or a completed live-world acceptance test.

Release procedure: stage in the dedicated QA project without changing its domain; verify the built commit and health configuration; then promote that same deployment. Do not change production, replay old customer purchases or create a paid test game merely to check deployment.

The separate implementation brief for Claude is `CLAUDE_EXPLORERS_DETECTIVES_WIZARD_20261009.md`. Its illustrated difficulty cards and detective catalog activation are not implemented by this engine release.
