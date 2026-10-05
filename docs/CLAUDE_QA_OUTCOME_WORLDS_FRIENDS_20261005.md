# Claude QA outcome: worlds, continuation and friends — 2026-10-05

## Current verdict and scope

The installed Claude performed six read-only QA source reviews of the evolving release, plus the requested separate design review. The mock-return recheck found **no remaining mock QA blocker** in the reviewed repairs; the subsequent small design-follow-through recheck also found no concrete regression or release blocker in its four reviewed areas. This is source-review evidence: Claude did not run tests, a browser, PostgreSQL, payment providers or generation. It is not a production approval.

This release supports owner world selection, an authenticated parent continuation purchase for the same child, and independent friend progress on an eligible frozen nine-board game. Mock money is the QA boundary. Exact character age, versioned generation, automatic judging/recovery, all 27 hides and the $5/world limit remain outside these feature changes. The difficulty pilot is deferred.

## Review iterations and resolved defects

1. **Initial B1–B3:** draft edits could change a payable game; concurrent worlds could retain two first-purchase quotes; expired login lost purchase context. Repairs fence photo/name/child/package/world edits, claim the immutable payment attempt before provider dispatch, serialize child-backed purchases, reprice only undispatched orders, and retain validated child/world/game/age/return context through sign-in.

2. **Follow-up X1/I1–I7:** abandoned payments blocked the child indefinitely. Confirmed terminal unpaid closure now has a durable receipt and owner recovery route, including deleted games without restoring their art. Unknown outcomes never unlock replacement. Ordinary checkout uses the same durable claim. Genuine late PAID after FAILED reconciles the original session; duplicate paid orders retain financial truth and receive an audit without another generation. Family return links were repaired. Friend switching waits for saved progress; another tab stops the previous participant. Repeated rejected saves are bounded and recoverable through explicit feedback.

3. **Final R1/P2:** normalized dot segments could create an external redirect, and multi-world packages bypassed child payment serialization. Normalized return paths now reject that escape. Every child-backed tier shares the payment fence and paid-world overlap check. Pending multi-world drafts retain their original order and cannot be adopted as a single-world intent. Existing paid multi-world games continue to provide their worlds unchanged.

4. **Release-delta and final mock recheck:** anonymous mock cancel/decline destinations now preserve draft access, while owners use financial recovery. Mock destinations are built from the stored order, ignoring query-supplied URLs. A declined session resumes its exact saved URL only when ownership, fresh amount/currency and closure checks hold, without another provider call or key. Missing URLs, changed quotes and closure uncertainty remain blocked. Paid/closed/open recovery copy, valid-row outbox recovery and uncertain join retries were also corrected.

5. **Design follow-through:** map Go uses an existing emblem without revealing board art; invitation reasons, hidden/one-time link explanation, replacement and failed clipboard recovery preserve authorization/scope; parent/world pending labels and ready/preparing destinations preserve purchase context; guest collection panes are bounded below the participant strip. Claude confirmed those source repairs. Its remaining optional proposals and source-only test/rendering gaps remain in the design report, rather than being claimed as completed polish or child testing.

The reviews retained guest authorization, frozen GAME-only media, revocation/expiry checks, monotonic independent progress, retention and fenced deletion as sound by source reasoning.

## Remaining gates

Real PayMe contracts, genuine payment contradicting closure, durable refund settlement, ambiguous historical attempts, bounded provider operation times and PostgreSQL concurrency evidence remain open. See [pre-production payment verification](PREPRODUCTION_PAYMENT_VERIFICATION_20261005.md). SQLite concurrency assertions do not prove PostgreSQL Serializable behaviour. Mobile back-gesture evidence and child usability/difficulty testing remain separate.

The final local full test gate subsequently passed: 342 files, 4,303 passing tests, two expected failures and 55 skips. This independent execution is Codex evidence, not something Claude ran. Build and deployment are tracked in the [release record](QA_WORLDS_FRIENDS_RELEASE_20261005.md); this source-review verdict alone establishes neither.
