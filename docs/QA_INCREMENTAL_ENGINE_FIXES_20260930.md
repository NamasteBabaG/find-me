# v12 engine implementation — 30 September 2026

Implemented after the read-only Claude/Codex diagnosis of commit
`9913779edd35886659db9a81a62f8451858731d7`. This release changes generation and
accounting, without changing the catalogue, prices, child age contract, or the
27-appearance publication requirement.

## Implemented behaviour

- A ready v12 appearance can be reviewed before either sibling has a candidate
  or approval. One question carries eight images: original board, canonical
  identity, native BEFORE/AFTER with head inset, and all four neighbour pairs.
  The reservation is $0.30 rather than the full board's $0.50. This fits the
  evaluated run's original $0.413974 headroom. Reservations are not prices.
- Unsupplied appearances receive no writes or inferred verdicts. Existing
  approvals are preserved only when their image, geometry and identity bindings
  remain valid. All 27 individual publication proofs are still required.
- New independent paid questions bind their own supplied appearance, rather
  than the changing attempt metadata of an omitted, unapproved sibling.
  Historical paid full questions remain replayable on their original keys.
- Missing or malformed judge evidence requests a new review of the same
  pixels, never an image redraw. After three questions the queue backs off for
  one hour, excludes that outage from ordinary game selection, and permits an
  automatic fresh evidence question afterwards. All purchases still consult
  daily/world limits. Historical v10/v11 image recovery keeps its old routing.
- Ready reviews run before new paid diagnostics/replacements. Between complete
  repair cycles, less-retried appearances take priority; frozen diagnosis or
  application phases still finish/replay before switching appearances. A
  reservation refusal does not prevent cheaper independent work in the slice.
- First-image interruption recovery and its accounting verifier now derive
  valid poses from the actual v12 catalogue. All 27 authored hides are covered,
  including crouching and sitting-cross-legged. Existing bounds on automatic
  image interruption authority are unchanged.
- Daily spend uses immutable retained-purchase creation dates, counts shared
  provider receipts once, and includes every outstanding pending/UNKNOWN
  reservation even in a ledger untouched today. Imported historical receipts
  without retained timestamps use conservative ledger dates. Such legacy bills
  can still be overcounted after a later ledger update; they are never erased.

## Verification

- Local broad run: 290 test files passed, 3,722 tests passed, two expected
  failures, 55 skips. The later evidence-backoff addition passed its separate
  ten-test integration/unit run. The exact release commit must also pass CI.
- Focused headroom, replay, publication and accounting run: 66 tests passed.
- TypeScript check and both catalogue validators passed. Current v12 validator
  verified nine 4K masters, 27 hides and mandatory style/light/neighbour checks.
- The normal creation pipeline's synthetic-provider integration reaches
  DELIVERED with all 27 appearances, independent reviews and 54 discoveries.
  Tests prohibit live provider traffic. This proves orchestration and durable
  publication bindings, not real-provider visual quality or cost.
- A compositor refusal's durable feedback and next diagnosis were verified
  directly, separately from the new between-cycle scheduling order.

## Real-provider continuation: incomplete

The retained isolated evaluation `game_o1dwr4o3dhdglmbtx6jz` was resumed under
its existing $4 cap. No QA/customer database was changed and mail was suppressed.
Read-only reconstruction confirmed a single Antarctic appearance can now be
reviewed without approved siblings; Giza and Tokyo each use the same eight-image
scope. Great Wall still requires an automatically repaired candidate first.

The actual Giza judge dispatch returned a transport failure with no request ID,
model, usage or verifiable charge. Its $0.30 reservation remains UNKNOWN in
full, alongside the pre-existing $0.12 image reservation. A subsequent run
outside the restricted network correctly replayed the held result instead of
buying it again. Known settled cost remained $3.466026; committed cost is now
$3.886026, leaving $0.113974 under the original cap. These figures are recorded
estimates/reservations, not a new provider invoice. All 19 prior approvals,
asset IDs and placement metadata remained unchanged; all 27 rows were retained.

This does **not** prove real-provider 27/27 completion on the release. UNKNOWN
charges require verifiable reconciliation or a separately bounded continuation
policy; they cannot be zeroed on a timer. No automatic judge-UNKNOWN authority
or higher emergency cap is introduced by this release. The spending-policy
question is unresolved and the cap remains $4.

## Remaining diagnosis work

- A finite cap can still be exhausted. The old budget wait alone cannot resolve
  a permanently insufficient balance; this release lowers review peak demand
  and improves fairness, but does not promise unconditional completion.
- Adding evidence at actual player zoom/viewport scale and comparing a separate
  illustrated style reference are controlled visual experiments, not verified
  corrections. No new visual threshold or unmeasured reference change is used
  to mint quality passes.
- Original-upload likeness cannot be established from this retained run: its
  source was a previously approved canonical portrait, not the expired original
  child photo. Fresh real-provider testing remains necessary.

Private images, retained raw answers and the SQLite evaluation stay under
ignored `tmp/`; they are excluded from the release.
