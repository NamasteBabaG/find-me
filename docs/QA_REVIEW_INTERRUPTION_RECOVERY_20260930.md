# Automatic recovery of interrupted v12 evidence reviews

A paid game could remain parked after a review returned no response and its charge became UNKNOWN. The incremental review release reduced the reservation peak, but did not recover this accounting hold. This change allows a bounded new evidence question about the same retained pixels.

## Policy and invariants

- Applies only to v12, one supplied hide, the `ready-only/v1` review scope, an exact fingerprinted catalog question and its original 300,000 micro-USD reservation.
- Requires a retained transport/no-response result: timeout, unknown billing, and null raw answer, usage, request ID, model and finish reason. HTTP errors, usable unpriced answers, authentication/quota refusals and wrong models do not qualify.
- Requires the existing paid, owned, unpublished game; rejects refunds, deletion, changed rows, mixed content versions, billing conflicts and overruns.
- The original request and all of its UNKNOWN reservation remain unchanged. Its key cannot dispatch again. A new review attempt changes the question fingerprint, uses medium reasoning and keeps the exact image evidence.
- At most two interrupted reviews may continue automatically per world. The four-dollar QA ceiling remains enforced by the existing transactional reservation guard.
- Recovery is an append-only software policy record, not provider billing evidence or a quality approval. Publication still requires actual valid approvals for all 27 hides.
- Recovery is integrated at the review result boundary and when a directly ticked existing world is parked. A crash between durable accounting and the variant transition replays without a second purchase. Historical grouped questions and manual continuation rules remain intact.

## Verification

Typecheck passes. SQLite regression cases cover preserved pixels and sibling approvals, crash replay, privacy inventory, nontransport refusals, refunds, bounded continuation, and the main world slice with insufficient budget. Core ledger tests cover authority, input binding, the two-review bound and the unchanged four-dollar ceiling. The full exact-commit CI gate must pass before QA promotion.

The existing isolated real-provider fixture was checked using only its retained records. The verification script disables network, reads no credentials, starts no new provider purchase and sends no email. It recovered one interrupted Giza review with zero new spend. Its 27 assets and geometry, prior approvals and original UNKNOWN requests were unchanged:

| Measurement | Before | After |
| --- | ---: | ---: |
| Accounting held | yes | no |
| Settled micro-USD | 3,466,026 | 3,466,026 |
| UNKNOWN reserved micro-USD | 420,000 | 420,000 |
| Committed micro-USD | 3,886,026 | 3,886,026 |
| Remaining micro-USD | 113,974 | 113,974 |

This fixture remains incomplete, with 19 existing approvals. The next review needs a 300,000 micro-USD reservation, which exceeds the remaining balance. Recovery removes the UNKNOWN hold; it does not solve exhausted budget or prove 27/27 delivery. No emergency budget increase was activated.

A requested live pipeline tick was rejected by automatic approval review because it could make a paid OpenAI call with private child images without explicitly identifying the data and destination in its approval. The retained-only verification completed instead; no new live-provider validation is claimed.
