# QA v19 release and six-dollar enrollment, 14 October 2026

Owner authorization: **up to $6 per world for NEW QA games**. This is a request-admission ceiling, not a fixed charge, and does not authorize a paid render during this release. Existing games retain their original grants; the generic/production ceiling stays $5.

## Release scope

- Dedicated project: find-me-qa; custom alias qa.findmeworlds.com. Its Vercel production target is this QA project, separate from the business production project.
- Release checkout: codex/qa-v19-six-dollar-20261014, based on reviewed integration 49f7f192 and historical live QA ee74b6c3.
- Prospective configuration: LOCAL_PATCH_PROMPT_RELEASE=v19, LOCAL_PATCH_VISUAL_REVIEW=dual-high-v3, LOCAL_PATCH_PLAYER_REVIEW=on. Scene-quality: claude-opus-5-5 HIGH; head/continuity: gpt-6.1-sol HIGH. Model policies and historical reader contracts are unchanged.
- No schema, art, package/dependency, search-level activation, payment-provider or daily-spend-limit change. No customer photo, saved game or private asset is modified or published by this release.

## Budget authority and preservation

The creation transaction writes an immutable SYSTEM AuditLog pin only for an unstarted new QA/db/v19/v3 local-patch DRAFT, after its visual-review pin. Later deployments cannot enroll an existing draft. The policy contains no child data. Admission resolves exact pinned authority inside the ledger transaction and requires the current paid, owned, non-refunded nine-board v12 world.

Snapshots and caller JSON cannot grant $6. Tampered, foreign or mismatched pins fail closed. The same resolver is used by ordinary purchases, image/review interruption recovery, accounting display and identity-source accounting. Original $4-to-$5 emergency receipts remain exact and cannot stack on a new $6 world. UNKNOWN, pending, conflict and provider-overrun amounts remain fully retained and included in admission.

The ceiling controls authorization before dispatch. If a provider later reports an overrun, the full bill is retained and the world is held; it is never clamped to $6 or discarded.

## Scheduler and permanent exhaustion

The scheduler finishes Sol for an already-paid passing Opus answer before opening another Opus review. Both the first and final review phases re-read pending checkpoints after a paid stage. This is only a scheduling hint: the existing paid gate still validates complete durable evidence, current pixels, questions, identity and lifecycle before dispatch/publication. Free decisions from saved answers remain first.

If identity work cannot fit under its verified final ceiling, with no open purchase or unresolved charge that could change capacity, the job parks at the existing recovery-exhausted marker. It does not endlessly requeue, authorize broken art, drop a hide or request human image approval. Finite budget still cannot guarantee delivery of every possible real-provider failure sequence.

## Provider-free full-world rehearsal

The real product planner, 27-hide publication gates and CAS ledger run against synthetic images/providers. Settled amounts cycle through observed usage from earlier experiments, including identity. No real provider was called and no money was spent. These results establish orchestration/accounting behavior; they do not measure visual quality or real-world latency.

| Scenario | Published / required | Game | Purchases: paintings / Opus / Sol | Settled USD | Ceiling |
| --- | ---: | --- | --- | ---: | ---: |
| New QA, all accepted | 27 / 27 | DELIVERED | 27 / 27 / 27 | 4.989208 | 6 |
| New QA, three distinct first-attempt Opus rejections followed by valid replacements | 27 / 27 | DELIVERED | 30 / 30 / 27 | 5.426984 | 6 |
| Historical grant, same observed cost cycle and completion-first scheduler | 25 / 27 | parked | 27 / 25 / 25 | 4.707250 | 5 |

Delivered cases have no pending or UNKNOWN purchase. The historical case preserves its $5 grant. This supersedes the earlier report's categorical statement that every clean v3 world is impossible under $5: a separate cheapest-observed-cost control did deliver at $4.589495. What remains supported is insufficient reliable repair/admission margin under $5, not a universal mathematical minimum.

Private reproducibility evidence stays outside git: release review logs and the provider-free rehearsal fixture/results in ignored work directories. No private paid answers or child images are included here. The rehearsal's post-slice reservation samples are not a peak-concurrency measurement.

## Verification and rollout

Local results on the release implementation:

| Check | Result |
| --- | --- |
| Complete check, three workers, corrected network guard | 379 / 379 files; 4,979 passed, 2 expected failures, 55 skipped; 983 s |
| Final health/config regression and QA access checks | 16 / 16; typecheck passed after the health mapping fix |
| Full-world provider-free rehearsal | 3 / 3 scenarios; results above |
| Scene and adventure validators | passed |
| Build, private-asset tracing and player-performance artifact audits | passed; privateAssetBytesRead 0, privateLeaks empty, performance problems empty |

The full run began before the six new health assertions were added. They and the existing QA access cases passed separately afterward; remote CI must cover the complete final commit. Local Windows Prisma schema-engine startup failed, so the disposable build SQLite tables were created through the repository's hash-verified applyTestSchema helper, then the ordinary build and audits passed. Remote CI keeps its unchanged Prisma db-push step. This is not a PostgreSQL migration or rollback rehearsal.

Focused budget, lifecycle, receipt and interruption checks pass, including cross-instance last-capacity contention, preserved UNKNOWN on restart, tampering/refund/ownership refusal, full overrun retention, accounting above $5 and bounded review recovery above $5. The complete suite, validators, build/private-asset audit, exact-commit remote CI and live deployment checks are release gates; deployment evidence is recorded separately after execution.

The local complete check uses three workers. Its network guard does not alter application flags and refuses external HTTP/TCP while allowing only the local Windows tsx named pipe. Earlier discarded runs used a guard that forced QA flags or threw fetch synchronously; those failures were reproduced as harness defects, corrected without UI changes, and affected tests were independently re-run.

Rollout: commit named reviewed files, push the release branch, wait for completed CI on that exact commit, stage on find-me-qa with public release variables and APP_COMMIT, verify READY and health, then promote the same staged deployment to the QA alias. Keep protection, credentials, daily spend ceiling and the business production project intact.

Live health must show v19, dual-high-v3, both HIGH roles, the new $6 policy, historical default $5, a reachable database and the released commit. A synthetic wizard smoke stops before a photo upload, checkout or paid generation. For a subsequent owner-run full game, start a **new draft after this release**; an older open wizard is not the qualified new policy.

## CI timing correction

The first remote run on 39c61416 (38512429916) passed 4,984 assertions, with one 20-second timeout in the v3 native-pixel/publication regression (379 of 380 files passed). That test builds two 4K fixtures, runs four retained review stages and compares magnified native joins. Its assertions and production deadlines are unchanged; only that integration test now has a bounded 60-second allowance. The corrected test is run locally, followed by fresh complete remote CI and a deployment of the corrected exact commit. The candidate on 39c61416 is not promoted.
