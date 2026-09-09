# QA identity lifecycle fix — 9 September 2026

Scope: board-conditioned QA wizard identity only. No paid calls, deployment,
historical ledger edits, automatic reconciliation or replacement purchases.

## Fixed

- Identity sheet, avatar, original billing audit and child references publish in
  one database transaction. Game → Job → Child fences bind the live owner,
  photograph, name, age, asset IDs and exact lease attempt.
- QA pre-board deletion locks Game → Job before reading current identity IDs.
  It works whether deletion wins before or after image publication, including
  generation being disabled after the durable identity reservation. Metadata-only
  billing survives deletion; a late provider response cannot recreate images.
- An identity transport failure, existing reservation without output, unknown
  usage or failed identity enrollment becomes MANUAL_REVIEW with a classified
  hold. It does not loop through GENERATION_FAILED or starve the oldest queue
  entry. A lost lease/deletion cannot be overwritten by an obsolete runner.
- Known image billing is settled before publication; a sanitized billing-only
  response audit retains a safe request ID/usage even when image publication
  cannot happen. Unknown charge remains reserved/unknown, never inferred free.
- Successful QA enrollment checks the same exact lease attempt. Completion of
  the avatar step is written inside enrollment, not by a late unfenced update.

## Validation

Real disposable SQLite and synthetic image bytes/provider; no HTTP:

1. Delete while the paid response is pending: zero surviving images, exact bill retained.
2. Delete after publication: current sheet and avatar both removed.
3. Disable the flag while the call runs, then delete: reservation keeps cleanup fenced.
4. Replace the job lease while the call runs: no old-runner publication or hold.
5. Missing usage: private retained identity, explicit unknown hold, no repurchase.
6. Actual pipeline transport failure: MANUAL_REVIEW and queue moves to another game.
7. Actual pipeline existing reservation: zero additional provider calls.
8. Actual pipeline successful identity: normal nine-board enrollment, one charge.
9. Historical existing avatar without trustworthy billing: enrollment hold, no retry.
10. Stale enrollment attempt: game/job remain untouched.
11. Enrollment commits between deleteGame's initial style read and the identity
    helper's transactional read: explicit reroute to the fenced wizard deleter,
    never legacy cleanup or a repeated TOCTOU loop.

Legacy pipeline, fixed-world guards, queue, budget and wizard orchestration
regression suites also pass. Legacy generation behavior outside this QA identity
branch is unchanged. Operator reconciliation remains explicit manual work.
