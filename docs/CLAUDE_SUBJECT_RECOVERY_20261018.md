# Child appearance and automatic review recovery — 18 October 2026

The pilot exposed children who looked older or less like their photograph, repeated the reference portrait's expression and head turn, or lacked required winter hats. Three synchronous continuity questions also timed out without receipts and exhausted the historical automatic continuation limit. This change adds an explicit per-world subject contract and durable background continuity, so the engine can reject these appearances, repaint them and continue without discarding uncertain charges.

Branch `codex/subject-recovery-20261018`, base `4f680644`. Implementation began with Claude Max; Codex owns the integrated changes and verification. This document describes source behavior. It does **not** assert that new live art, a complete game, a lower average price or a deployment has been verified.

## Scope and authorization

Enrollment is opt-in and immutable: `local-patch-subject-upgrade/v1` records the owner, child age, exact original-photo and canonical-identity hashes, all authored subject plans, review release, continuity transport and recovery policy. Games without enrollment retain their historical questions, pins and paid receipts. No migration, global model switch, new game, new identity purchase or payment rewrite is required.

The current QA pilot has a total supplier cap of USD6. The prior evidence records USD2.348769 settled and USD0.198 retained for three uncertain questions, a USD2.546769 commitment. These are usage-based estimates and reservations, not verified provider invoices. Remaining room is USD3.453231; neither the upgrade nor unused room authorizes an increase. All 27 playable hides and the existing visual, accounting, privacy and deletion gates remain mandatory.

## Appearance and painting

- `subject-policy.ts` assigns each authored hide a contextual action, head direction, gaze and expression. Three hides on one board receive distinct head directions, expressions and hand/body gestures. Authored feet, cover and support remain authoritative. Antarctica explicitly requires a warm hat without hiding the recognisable face.
- The subject reader checks original-photo likeness, agreement with the canonical illustrated face, face visibility, apparent age, planned action/head/expression and required clothing. Every check requires an observation; a failure needs a location. An uncertain or contradictory answer never passes. A broad apparent-age range is uncertainty; an estimate clearly outside the stated child's age derives a failure even if the model claims pass. Subject uncertainty also blocks the historical peeking age-only waiver.
- Enrolled new paintings receive the scene crop, native canonical portrait and privately owned original photograph, bounded to 384px. The photograph supplies identity and age only; the scene supplies style, light and geometry. Ownership, private status, liveness, age and source bytes are verified before use.
- A world pinned to exact LOW can keep LOW for pose or wardrobe corrections. A face/likeness/age fault, final attempt, diagnosed redraw, or unrecognised base policy selects explicit MEDIUM. This choice and the source-photo/direction hashes belong to the new render fingerprint. Interrupted attempts resolve their attempt number before constructing the direction. Historical purchased keys replay their original fingerprint; a different quality never silently replaces a purchased operation.

## Two independent judges, with subject checks inside Opus

For new candidate pixels, the complete Opus HIGH quality inspection and subject inspection use one Anthropic Batch request when the exact maximum quote fits the existing quality reservation. An oversized packet keeps the complete ordinary quality inspection and a separate subject inspection. This choice is deterministic before purchase; evidence, output caps and reservations are unchanged. The versioned `quality-subject-answer/v1` wrapper requires both complete inner documents. The strict reader does not extract a convenient fragment from surrounding prose. Raw paid provider text is preserved; `qualityStageRaw` and `subjectStageRaw` derive the two readings deterministically.

In a combined request, a subject failure or uncertainty rejects and routes the candidate to repair before purchasing Sol continuity. Sol HIGH remains an independent continuity judge. A verified legacy quality answer can replay for free and use a separate subject-only Opus Batch question. A fresh continuity pass is checkpointed before a separate subject question and reused only for identical image, geometry, identity, question and settled bill. The separate path can cost an additional Opus inspection; the normal budget gate admits it individually within the same world cap.

Every publication/protection read requires all three logical proofs: quality, continuity and subject. A combined subject proof must share the exact Opus request key, fingerprint, raw body and charge with its quality proof, and match the enrolled photograph and hide plan. The report counts this shared charge once. The ledger remains the accounting authority. A subject-format retry uses a new bounded evidence attempt rather than replaying the same unreadable wrapper forever.

## Durable continuity and uncertain charges

New enrolled Sol continuity uses the same HIGH model in OpenAI Responses background mode, `store:false`, with a new transport/policy fingerprint. The provider response ID is durably recorded. A round has one create claim; subsequent slices poll that ID. Failed GETs wait. Missing, expired or unpriced results remain held at the full unknown reservation. A documented refusal before creation is recorded from real evidence; it does not trigger an automatic paid fallback.

`advanceContinuityInBackground` reconciles existing recorded responses at the start of a slice, before held-job or hide-selection gates. It validates the current world's intent and matching ledger reservation and only polls recorded IDs or records a genuinely lost create. It never creates or reserves a new question. This prevents an accepted sibling or another held question from delaying an already-created response until temporary retention expires.

Historical `world-automatic-review-recovery/v1` retains its limit of two. An enrolled world may use version 2 for at most four additional admitted interruptions; a key already continued is never continued twice. The retained original unknown bill is not released or fabricated. Only the exact no-response review shape with genuine ledger and retained-byte bindings is eligible. Background results containing an unpriced answer remain a safe hold rather than qualifying as no-response recovery.

Planning and recovery select a specific hide with `onlyHideId`. They do not rely on the board's ordinary next-candidate picker: enrollment deliberately removes old subject-less protection, and Batch may have left an interrupted GENERATED appearance without a quality checkpoint while a sibling has an old acceptance. Only uncontinued unknown keys are matched; old paid questions remain candidates in their original form.

## QA operator and release sequence

`planSubjectUpgrade` is read-only. `applySubjectUpgrade` is idempotent and revalidates the exact plan under Game then Job locks, including confirmed unrefunded payment, live owner/child/private assets, all nine v12 boards, lease and ledger. It refuses an active lease, pending request, conflicting bill, unsupported hold or changed plan. No paid request is sent by enrollment itself.

The operator CLI remains available. The existing authenticated owner can also use the private QA-only route `/qa/subject-upgrade/[gameId]`; no admin role is granted. Page and action require QA environment/access and owner session; the action also checks same-origin POST, exact plan hash and existing tester/spend guard. A USER enrollment receipt must name that owner. No photograph, email or credential is displayed on this page.

1. Freeze and review source, complete `npm run check`, then push a clean named commit and require completed CI on that exact SHA, including validators and build/private-asset audits.
2. Deploy that SHA only to the linked dedicated `find-me-qa` project. Retain a clean baseline deployment; temporarily enable only the already-authorized QA tester for this pilot and verify the QA domain's deployment.
3. Open the owner operator plan. Require the genuine third unknown to map to its exact hide, old uncertain reservations to remain intact, and the unchanged USD6 cap. Apply the current plan once.
4. Let the normal creation page and cron advance idempotent slices. Observe ledger, Batch/background rounds, per-hide subject outcomes, repairs and actual art. A synthetic READY result is not live acceptance.
5. Verify all 27 accepted appearances, full board composition, an opening playable game and player link. Record actual outcomes and costs, including reservations. Restore the clean QA baseline at completion or safe stop and verify the alias. Never report an incomplete world as ready.

## Verification record and limits

Before the final integrated snapshot, Codex observed 47 independent pure acceptance checks and 66 focused tests passing, including a synthetic all-27 upgrade/recovery/publication and legitimate source-photo purge. Claude's first read-only review found an exact-hide selection issue; the subsequent `onlyHideId` fix and realistic missing-checkpoint regression are part of final verification. A completed follow-up review confirmed that fix and the integrated safety/binding paths, conditional on proving admission for oversized questions. The subsequent 22-test reservation/subject suite passed: all 162 authored-plan/retry combinations use maximal evidence, a 768px square photo and attempt99; an oversized bundle is split into admitted full inspections, and a smaller packet stays combined. Claude's final focused admission review returned **PASS**, no new P0/P1, after reading the exact builder, null/separate path, strict subject readers and maximal-reservation test. Codex re-ran the independent pure harness: **47/47**, zero network or provider purchases, source unchanged. The full repository check is a separate release gate; its result must come from a completed command exit.

Residual limits:

- SQLite race tests do not prove Postgres lock timing; the first real QA run needs scoped observation.
- Background responses are retained temporarily by the provider. The non-spending sweep reduces avoidable delay; unavailable receipts still cause an honest full-reservation hold. A create whose response arrives only after the lost-create grace can remain conservatively overreserved.
- Evidence rounds, repaint attempts and automatic continuation counts remain bounded. The engine may safely stop when evidence, quality or funds are insufficient. An estimate is not permission to exceed a reservation or world cap.
- Restyle/recompose keeps existing subject pixels; the enrolled subject gate still has to approve them. A redraw receives the new subject/photo direction.
- Combining Opus inspections and selective MEDIUM is intended to reduce redundant purchases. Actual usage, quality and cost of all 27 successes must be measured. One pilot cannot establish a USD3 population average.


## Subject painter correction after actual art review

`local-patch-subject-paint/v2` is a distinct painter direction for new purchases in already enrolled worlds. The historical v19 support recipe asks for relaxed arms, while the subject plan requires another gesture; the historical diagnosis also asks to preserve the faulty pose. The new recipe keeps authored support, depth and safe geometry and lets the immutable subject plan alone specify the arms, head, gaze and expression. A planned-action repair now repeats the actual action rather than only its check code. The enrolled subject policy, plan digest, strict acceptance reader, age checks, hat requirement and full-27 publication gate are unchanged.

Started image requests are matched against their exact current, v1-subject or pre-enrollment fingerprints. A new recipe is never substituted under a started key, a foreign fingerprint still refuses, and an unknown without a retained receipt remains unknown. New attempts retain distinct request identities.

`subject-format-recovery/v2` is a recovery diagnostic, not an acceptance-reader replacement. It checks every strict-schema issue in a retained subject answer. Only otherwise complete answers whose sole errors are observation/location strings over the existing 400-character maximum select the existing `compact/v1` question. The raw answer, original fault and previous history are retained unchanged. A newly overlong reply records the length category, so the existing compact escalation limit and total evidence-round cap still retire repeated failures. The same models, evidence, output caps and reservations remain in force.

This corrects a cause of repeated paid refusals; it does not establish successful art, a complete live world or a lower average price. Real generation must still pass the exact-commit release checks and the unchanged engine gates.
