# Claude audit follow-up and independent-worlds implementation

2026-09-15. Reviewed baseline: `df3ce2e`, including Claude's service fix
`f76d86c` and merge `67c8f56`. Work is isolated on
`codex/independent-worlds-pilot-20260915`; no root-checkout edits, wizard edits,
database migration, personal render, QA push or production deployment.

Claude continued wizard design work while this review ran. His later
`bcf1176` is **not merged or reviewed here**; wait for the user's handoff and
compare the actual diff before combining it. In particular both branches may
touch dictionary files: preserve changes by key, never replace whole files.

## Verified regression found after the service fixes

**Generation pipeline converts a lost status CAS into generation failure.**

`transitionGame` now correctly raises `GameStatusConflict`, but the pipeline's
generic catch treated it as a provider failure and could transition the winning
worker's game to `GENERATION_FAILED`.

Two regression tests stage a real competing SQLite write immediately before the
status CAS, with and without a new job lease. Both failed before the fix:
expected `TARGETS_GENERATING`, received `GENERATION_FAILED`. Both pass afterward.
The tests do not replace the service with a mock failure; a spy controls timing
while the actual DB writes and CAS execute. No image provider call is made.

The pipeline now catches this conflict separately. It neither rewinds the game
nor records a failure. It requeues only the lease it still owns, guarded by job
ID, RUNNING status and the claimed attempt number. A replacement worker's lease
is left alone. This is a compatibility fix for the new CAS behavior, not removal
of Claude's concurrency protection.

## Verification performed

| Check | Result / boundary |
| --- | --- |
| Clean dependency install | `npm ci --ignore-scripts`, then local SQLite Prisma client generation. Vitest **4.1.11**, not the shared Vitest 3.2.7 installation. Lock unchanged. |
| First full check | 235 files, 3,257 passing tests, 2 expected failures, 35 skipped. |
| Second full check | 236 files, 3,272 passing tests, 2 expected failures, 35 skipped. No unexpected failure. This ran before the final UI regression/copy/harness adjustments. |
| Final typecheck | Passed after final runtime/UI/harness edits. |
| Final affected test run | 32 files, **265 tests passed**: game, adventure domain and Claude's interrupted-writes real-SQLite tests. Includes the added bag UI round-trip test. |
| Content validators | `scenes:validate` and `adventures:validate` passed. Existing size/proximity warnings remain; a validator pass is not art approval. |
| Patch hygiene | `git diff --check` passed. |
| Production build/deploy | Not performed in this step. No claim of release readiness. |

New regression coverage includes opt-in schema, replay new/old discoveries,
duplicate prevention, guest/owner/release storage isolation, offline owner refresh
and GET-before-POST reconnect, storage quota failure, bag return, invalid server
snapshot refusal and late network responses after unmount.

## Browser evidence

The opt-in development harness mounts the real GameShell with public beach/demo
art, a separate local guest game ID and telemetry off. It does not expose Bar or
write the family account. English/Hebrew fixtures use different game IDs because
their frozen book content differs; changing a delivered book in place is not a
supported language-switch mechanism.

At 1280×720, completed all three serial hides. One was found using Enter and
arrow-key crosshair movement only (A07 reverified). Started explicit replay:
zero round stars and zero discoveries. Found the previously uncollected anchor
bucket: round 1/6, permanent album 1/6, permanent stars 3/3 and postcard 1/1.
Opened the bag and returned: round still 1/6 with zero replay stars. Refreshed:
map, no automatic replay/confetti; bag still contained bucket and 3/3 stars.

At 390×844, inspected the Hebrew board, compact discovery control, bag button,
readable bag and return-to-round action. No framework error overlay or browser
error logs observed. The full-screen board reported one CSS pixel of document
overflow; not represented as an exhaustive all-device pan-boundary approval.

A06 home-header link remeasured without entering the wizard: 48×48 at width 360;
80.34×40 at 390 and 1440; focusable with tabIndex 0 and no horizontal homepage
overflow. Thus 48×48 is specifically the compact breakpoint, not all widths.

The first localhost harness navigation encountered the pre-existing host's
session cookie with no local DATABASE_URL. It was rerun on 127.0.0.1, isolating
cookies and requiring no account/DB. No user session was changed.

## Open release gates — not silently declared fixed

1. **Provider-side refund duplication**: Claude explicitly left external refund
   invocation outside the database claim. Needs a separate idempotent operation
   contract/state design and tests before real-payment release.
2. **PayMe readiness** remains an infrastructure/provider/policy release gate.
3. **Image multi-frame and pixel-cap rejection fixtures** remain absent as Claude
   reported. Existing tests do not prove those two guards independently.
4. **PostgreSQL concurrency** is not proven by SQLite regression coverage. In
   particular differing payment-event races and audit transaction behavior need
   explicit provider/database release tests; these are risks, not newly verified
   PostgreSQL bugs in this report.
5. The new replay policy is opt-in only. Real account browser QA, the new pilot
   game's deliberate composition/activation and deployment occur after approved
   magic assets exist. Local/fake-network tests are not that production E2E test.
6. Claude's in-progress wizard and all associated newer commits need review when
   the user hands them over. No merge or cherry-pick of that ongoing work here.

## Next handoff

Product decisions: `INDEPENDENT_WORLDS_PILOT_V02.md`.
First-board preparation: `MAGIC_CASTLE_GATE_BRIEF_20260915.md`.

Stop before paid rendering. Obtain a first-board spending ceiling, verify actual
provider/model estimate against it, then produce castle gate only. Do not render
the next two boards before actual first-board art/game approval.
