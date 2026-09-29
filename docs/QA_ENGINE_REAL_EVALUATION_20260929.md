# Real engine evaluation — 29 September 2026

The user requested an actual engine test after photographic faces, isolated
portrait lighting and damaged neighbouring people appeared in a delivered game.
This evaluation ran the application's real draft, generation, diagnosis, judge
and accounting services against OpenAI in an isolated SQLite database. Payment
was a local mock and email was suppressed. No customer game was replaced.

The original upload had expired. The retained approved canonical portrait was
used as the input reference, with age 8. Consequently this run tests scene
integration and recovery, not likeness against the original photograph.

## Observed result

- Fresh draft selected v12, nine current boards and all 27 authored hides.
- At the bounded stopping point all 27 had image assets; 19 had complete passing
  quality receipts, four awaited another board review, and four remained failed.
- Pending review: Giza 2, Tokyo 2, Antarctica 1 and 3. Failed: Great Wall 1–3
  (style/seam) and Antarctica 2 (registration). A generated asset is not approval.
- The judge correctly rejected a removed Tokyo neighbour and a second face
  painted onto the foreground woman. Tokyo 3 subsequently passed a replacement
  review; Tokyo 2's autonomous correction still awaited review.
- Known provider cost was $3.466026. One interrupted image retained its complete
  $0.12 unknown reservation, bringing committed spend to $3.586026. The remaining
  $0.413974 could not cover the next pre-existing $0.50 review reservation. The
  original $4 world ceiling was not raised or reset.
- The engine kept the game in automatic recovery budget wait. It did not publish
  failed pictures, remove hides, invent passes or request parental quality approval.

These are results of a run resumed while the fixes below were developed. The
final scoped-review and diagnostic-geometry changes have integration coverage,
but this report does not claim a complete real-provider pass of the final code.

## Fixes prompted by evidence

1. **Interrupted image recovery.** Preserve sanitized provider failure receipts.
   A narrow engine policy may advance an interrupted first render to its next
   ordinary attempt, at most once per hide and two distinct hides per v12 world.
   It keeps the missing charge UNKNOWN and reserved, never dispatches its old key
   again and does not permit billing conflicts, invalid credentials or quota
   refusals. Delivery requires real quality approval of the replacement. A
   bounded automatic recovery record is distinct from an operator grant.
2. **Daily spend accounting.** A single purchase was counted from its ledger,
   asset and variant mirrors. Daily guards now use the ledger as authority and
   deduplicate those mirrors while retaining pending/unknown reserves and
   uncovered historical costs. This was verified against the real test ledger.
3. **Focused recovery reviews.** When unchanged sibling images already have
   matching image, geometry and identity approvals, a new v12 repair review
   submits only the remaining appearances. Each still receives all mandatory
   checks, native closeups and four neighbour comparisons. Existing paid full
   questions remain replayable; omitted siblings retain their original receipts.
   New one/two-hide requests reserve $0.30/$0.40, with the same overall ceiling.
4. **Feasible diagnostic plans.** A Great Wall diagnosis was rejected for
   overlapping another hide's crop, information the diagnostic model had not
   been given. New diagnostic cycles explicitly include those forbidden regions
   in crop coordinates. Historical in-flight questions retain their exact prompt.

## Verification boundaries

Integration tests cover durable interruption recovery, competing workers, loss
between ledger and image-row writes, refund barriers, unchanged budget limits,
one/two-hide review publication, untouched sibling receipts, corrupted review
scope, exact evidence binding and local sibling geometry. No real provider is
called by the test suite.

This is evidence of improved recovery and accounting, not proof of perfect
generation. Before declaring the QA engine fully ready, a final real-provider
game must pass all 27 appearances within the supported cost and latency bounds.
The remaining style/registration failures and recovery cost still need evidence
from that complete run. Private images, SQLite files and provider replies remain
outside Git under the local evaluation directory.
