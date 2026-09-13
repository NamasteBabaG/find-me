# Explicit QA release of a retained subset

This is an administrator-authorized exception for an unpublished, paid, terminal
v9 local-patch game. It is not an automatic relaxation of generation quality or
of the five-placement authoring catalog.

## Contract

- The original nine boards and 45 target/variant rows remain intact.
- The administrator explicitly names failed appearances to omit. Only failed
  rows can be omitted; a pointer to an older retained candidate is preserved as
  evidence, not treated as a usable current appearance. Each board must retain
  four or five existing appearances.
- No renderer, judge, attempt reset, deletion, or new image charge is invoked.
- Retained images without a completed board review are admitted by a separate
  human decision. Their machine reports are not changed to `pass`.
- The decision binds the owner, canonical identity, inventory, pixel digests,
  geometry, attempts, existing reports, worker attempt and settled ledger.
- Normal composition remains strict without this durable authorization. A
  changed or missing binding cannot be silently re-created during assembly.
- Publication uses the normal fenced finalizer, privacy handling, share link
  and notification outbox. Replays do not duplicate the release or its mails.

## Player behavior

The shipped `SceneConfig` explicitly declares four or five appearances and must
match its target count. Finding three unlocks the next board; finding every
included appearance completes the current board. Stars, the completion card,
gift screen, map and ready email use the published inventory.

For Omer's September 13 release, Sydney and Greatwall each retain four; the
other seven boards retain five. The result is nine boards and 43 stars, not a
45-star game with two unreachable targets.

## Operator surface

The order page displays eligible failed omissions and the count of unreviewed
retained images. Its native form requires every omission, a reason and explicit
human authorization. The `partial-release` POST route is QA-only, administrator
authenticated, same-origin and body-bounded. The publication service repeats the
ownership, settled-budget and inactive-worker checks independently.

Private QA review renders the published game without saving the family's
progress. A complete release must be verified there and through its player link.

## Regression coverage

- Four stars, unlock at three, completion at four, mixed-world total 43 and
  persistence without duplicate rewards; legacy serial and authored-five rules.
- Retained subset publication through SQLite and durable blobs, unchanged 45-row
  inventory/ledger/reports, replay and interrupted acknowledgement recovery.
- Refusal of unrelated ownership, refunds, active workers, unresolved spend,
  changed images or geometry, unapproved omissions and stale finalizers.
- QA/admin/origin/form guards, truthful ready mail and deletion-time redaction
  of the human decision's private metadata.
