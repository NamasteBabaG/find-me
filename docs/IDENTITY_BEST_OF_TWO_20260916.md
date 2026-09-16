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
