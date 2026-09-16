# Bounded automatic identity selection

## Product decision

No parental likeness approval step. Current local-patch catalog v9 generates one identity sheet, reviews it, and creates at most one repair when identity or age is doubtful. A side-by-side comparison with the source photograph selects the closer usable candidate. Remaining subjective identity/age warnings do not stop identity handoff.

The selected receipt preserves the actual checks and `approved` value. `automaticSelection` is separate publication authority, not a fabricated pass. The original checks and both purchases remain auditable.

## Boundaries

- Two identity renders maximum across queue ticks, with separate idempotent reservations.
- Two reviews maximum: original and comparative. No retries to resolve a subjective tie.
- Existing inclusive world budget remains unchanged. If there is no headroom for the repair and comparison, use the usable original.
- Unknown billing, deleted/replaced jobs, missing source/style evidence and two unusable layouts remain protected technical stops. This is not an unconditional promise that technical failures can never stop a job.
- Existing board-patch anatomy, seam and quality checks remain unchanged.
- Applies to catalog v9 only; historical pinned content retains its policy.
- No changes to Claude's wizard, UI, source photo crop, or checkout.

## Persistence and privacy

`identityBestOfTwo` checkpoint retains first, second and selected asset IDs. The second candidate and checkpoint are committed in the same fenced transaction. Selection atomically updates the profile and appends its receipt. The repaired prompt includes the uncropped original only as context; the existing crop still identifies the intended child.

Both candidates are private. Game deletion now includes candidate assets, including the unselected one, while preserving existing shared-asset protections. Canonical reuse resolves the selected candidate's own render/review bill.

## Verification

- Actual SQLite pipeline tests cover either winner despite uncertainty/age failure, sufficient-first, three request-window resume without duplicate purchase, budget fallback and removal of both candidates on deletion.
- Removing the new pipeline branch causes both winner regression tests to fail: old behavior is MANUAL_REVIEW instead of TARGETS_GENERATING.
- Gate tests reject stale selection fingerprints, incorrect candidate bindings and unusable layouts.
- Focused gate/lifecycle/canonical-reuse run: 75 tests passed.
- Full project verification: 235 files passed, 3268 tests passed, 2 expected failures, 35 skipped (before the additional budget-fallback test). The final focused 75-test run includes that additional case and the canonical billing-key change. Final TypeScript check passed.

No paid provider request was made during implementation. An existing MANUAL_REVIEW job is not silently reset by installing this change; operational resumption must validate its exact retained evidence.

## QA release

- Runtime commit: `b6b1a0bf` on `codex/identity-best-of-two-20260916` (based on Claude's `bce81167`).
- Project: `find-me-qa` only; no production-store deployment.
- Deployment: `dpl_GGFR8TAH6PNW3anU6vbKLZS8fxF6`, READY.
- Immutable URL: https://find-me-gbsr9sgua-smallheroes-projects.vercel.app
- Promoted to https://qa.findmeworlds.com and resolved back to that exact deployment with `vercel inspect`.
- Linux/PostgreSQL Prisma build, Next.js type checking and packaged-art tracing audit passed; no schema migration.
- Authenticated browser homepage smoke passed. Diagnostic API access remained gated (`QA_ACCESS_REQUIRED` from CLI); no authenticated DB-health claim is made.
- Deployment error-log query: no entries found in the first ten minutes. This is a limited smoke check, not a full live generation exercise.
- No existing held game was reset or repurchased. In particular, Arbel's held job requires a separate evidence-checked continuation; the deployment alone does not resume it.

## Explicitly authorized continuation, after release

The user subsequently requested resumption. Executed the scoped script `scripts/qa-resume-arbel-identity-20260916.sql` first with ROLLBACK, then with COMMIT. It locks and checks the exact Game/Job/Child, original image hashes, paid order, nine v9 scenes with no targets, unchanged settled ledger revision 3, and the original subjective identity/age receipt. It retains prior state in `identity-best-of-two:resume` and changes only this job to QUEUED and game to AVATAR_GENERATING. No assets, charges, approval findings or attempts were erased.

Verified afterward: the deployed worker claimed attempt 2, checkpoint policy is `identity-best-of-two/v1`, both original charges remain settled, and only `wizard:identity:2` is newly pending. The authenticated creating page shows “מציירים את ארבל…” at 8%, with no stopped error. This confirms actual resumption, not completed game delivery. The normal queue owns subsequent work.
