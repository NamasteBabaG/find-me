# Independent adventures — implementation checkpoint

## Implemented

- No purchase prerequisite between worlds. Catalog order is presentation only.
- One-world choice swaps immediately; multi-world choice requires exactly the
  package count and preserves a previous valid selection on return.
- Package, chooser and checkout share engine-version-filtered availability.
- Checkout names the selected worlds, including its compact mobile summary.
- Scene replacement is an atomic transaction: pre-resolve versions, claim the
  unchanged draft, replace scenes and transition/audit together. A concurrent
  paid/refunded order or changed draft loses the claim rather than being rewritten.
- Family-child binding is preserved. Same-name siblings do not merge. Two games
  for one child contribute to that child's existing passport.

## Tests

Eight real-SQLite regressions cover independent/nonadjacent selections, engine
availability, rollback on insert failure, failed-payment return, payment race and
sibling isolation. The old implementation failed five of the initial six cases.
Four chooser tests cover single/multi choice, Hebrew/English and stale defaults.

Full check after integration: 252 files, 3,357 pass, 2 expected-fail, 35 skipped.
An isolated local mock/legacy-engine draft selected Kingdom alone through the
actual browser action, returned with that selection intact, and reached checkout.
Database verification showed its nine Kingdom scenes. Hebrew chooser had zero
horizontal overflow at 360, 390, 1366 and 1440 widths. This was NOT a new magic
personal-generation or real-payment test.

## Content and pilot status — not for sale yet

Approved 4K castle-v18/library-v5/forest-v6 masters and authoring records are now
committed, including the independent art branch checkpoint `c99276b7`.
The application copy is `cf6a402a`. No personal photo is part of those commits.

`content/adventures/magic-pilot.ts` and `scripts/magic-pilot-preflight.ts` are
AUTHORING ONLY. They do not add a world to the catalog or alter live games.
Preflight validates the exact master hashes, native 3840x2160 sizes and full
patch-crop exclusion from all 18 discovery card crops. Nine proposed crops pass
those geometry gates. No personal render is approved or purchased.

Visual inspection of the diagnostic sheet still found masks requiring refinement:
castle dancing-child head, library story-circle head and foreground reader hair,
forest gardener hat, plus overlapping neighbors/foreground props. Therefore do
not render these proposals yet. Keep source children entirely within their edit
masks, preserve neighboring faces and foreground occlusion, then inspect again.
Geometry passing is not visual approval.

## Next work

1. Finish visual mask authoring, then reuse the retained-purchase local-patch
   engine and existing reference/identity gates for the three-board Bar pilot.
2. Verify all nine personal hides, 18 discoveries, replay and passport end to end.
3. Continue the remaining six magic boards after that pilot, not before it.

QA's local-patch engine still offers only Journey, because Kingdom does not yet
have all nine ready v10 boards. This intentional gate must not be relaxed to
pretend three approved art masters are a complete sellable world.
No production migration, live payment, refund-provider or PostgreSQL-load gate
is closed by this checkpoint.
