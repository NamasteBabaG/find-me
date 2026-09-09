# Bar5 QA night run — 10 September 2026

## Outcome: blocked, not a playable world

The style/pipeline fix was deployed to **QA only**, commit `c3d6601`, deployment `dpl_AoYsPbMD2Fpk5wMiNpkTQzvRJM1L`. A new Bar age5 game was created through the actual upload, crop, checkout, signed SandboxPay webhook and creation queue. No real payment was charged. Original stopped game and its ledger were not modified.

The new identity passed Sol HIGH identity, age, painted-style and sheet-layout checks. The paid NewYork three-pose sheet is retained. The first pose observation failed without a complete response/usage receipt; therefore no slot has been materialized yet. The game is held at MANUAL_REVIEW, not delivered.

Private run identifiers and child artwork remain in the gitignored `work/claude-qa-review-20260910/NIGHT_RUN.md` and runtime database, not this document or git.

## Cost, USD

| Operation | Known amount |
|---|---:|
| GPT Image2 MEDIUM identity | 0.072470 |
| Sol HIGH identity/style gate | 0.025160 |
| GPT Image2 MEDIUM NewYork three-pose source | 0.076014 |
| **Known total** | **0.173644** |
| Unresolved observation reservation | **0.400000** |
| **Committed including unresolved reserve** | **0.573644** |
| Inclusive run cap | 4.000000 |

This is not budget exhaustion. The existing no-new-dispatch-on-unknown-charge guard stopped the run. No reserve was erased, expired, relabeled as known usage or moved to a new ledger. No replacement source was purchased.

## Evidence and diagnosis

- Observation ledger reason: `board-observation-transport-or-response-unresolved`.
- Original observer catch combines fetch/network, local90s timeout, body read and outer JSON parse failures. The reason alone cannot distinguish them.
- The live wizard caught `BoardPoseObservationError` but retained only `String(error)`, discarding its partial receipt, including any available requestId/httpStatus. This is a concrete observability defect.
- The exact private source checkpoint exists; the first measurement checkpoint does not.
- Vercel logs for the precise deployment show jobs/tick HTTP200 plus a Fontconfig warning, not a provider receipt or evidence establishing the failure cause.
- Route maxDuration is300s; source120s plus observer90s is210s before other work. There is no proven direct timeout mismatch. Raising observer timeout without splitting bounded stages risks consuming the route's remaining time.
- Existing same-sheet landmark remeasurement requires a known, immutable first observation. It must not be silently repurposed as permission to retry a transport failure with unknown billing.

Next safe recovery requires authentic provider evidence for the missing charge and missing measurement, or separately explicit authorization for an unresolved-charge recovery policy that retains the full reserve and inclusive cap. Accounting reconciliation alone cannot invent missing landmarks.

## Independent Claude review

[Claude review](https://claude.ai/chat/e68fc62e-00a6-4755-90e1-b5c5028946b9) was actually submitted and answered. Claude reports inspecting source at c3d6601 through existing access, including identity gate, source conditioning, observer, solver, wizard, budget and review paths. It did not run tests, generate images or verify deployment. No child images or credentials were sent.

It supports the photo-identity / board-style separation, local per-board conditioning, measured anchors, enrollment stop/refund fence and bounded accounting. Its strongest concern is geometry-only construction of a playable config despite failed visual verdicts. That code observation is correct, but the severity depends on the release boundary: this config intentionally belongs to authenticated private QA with MANUAL_REVIEW and automaticRelease:false so a human can inspect failures. A private reviewable artifact must not be reported as visually approved or publicly releasable. The public/admin approval boundaries require separate review before adopting a change that would prevent the user seeing failed candidates.

Follow-up source verification found **no publication bypass**: `/qa-review/[gameId]` requires QA plus an authenticated owner/admin, MANUAL_REVIEW and the completed geometry inventory; it displays passed/27 and failures. `resolvePlayToken` permits public play only through READY/DELIVERED. Wizard share-link/legacy-admin publication additionally fails closed on the older exact fixed-sprite-v3 staging contract. Therefore do not adopt Claude's proposed all-visual-pass condition for private inspection; keep private reviewability distinct from approval.

Claude also sums worst-case reservations in discussing economics. Reservations are serially settled into actual costs, so their sum is not a measured world price. The real run figures above are the authoritative current cost evidence.

## Verification completed before this run

- Full check after base fix:127 test files /1883 tests, TypeScript clean.
- Enrollment stop/refund race follow-up:52 targeted tests, TypeScript clean; three race regressions failed before the fix and passed after.
- Clean deployment trace:9 catalog boards,27 slots,36 PNG assets; private-child artifacts excluded.
- New upload ownership verified Game→Child→originalPhoto, separate from historical ownerless source asset.
- Live style gate passed; this is not proof of final placement, scale, contact or local lighting. Those stages remain unverified on this child because observation stopped first.

## Diagnostic repair after the live failure

The observer now captures a bounded allowlisted failure projection: typed request/body/JSON/charge stage, elapsed time, timeout classification, safe provider requestId/status and numeric usage when present. The live wizard persists it behind the existing Game/Job fence and binds it to the exact retained source and logical observation attempt. Existing deletion inventory includes both source and measurement attempts. Arbitrary provider text, secrets, prompts and images are excluded.

Observer settings/prompt/policy fingerprints, source and measurement formats, ledger transitions, quality checks and retry prohibitions are unchanged. This cannot recreate the already-lost response or survive an uncatchable process kill; it makes future caught failures diagnosable.

Verification:118 focused tests passed, then full `npm run check` passed127 files /1893 tests with TypeScript clean. Independent read-only review found no billing/scope/privacy/deletion regression.

No complete world, gameplay click/zoom verification or morning-playable promise is claimed.
