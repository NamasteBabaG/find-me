# Board-conditioned QA wizard integration

This is a **new authenticated QA creation route**, not an expansion of the deliberately stricter admin probe/import routes. It does not claim semantic approval or deploy itself.

## Runtime contract

`content/board-conditioned-qa/catalog.json` must satisfy `boardConditionedCatalogSchema` in `src/services/generation/board-conditioned-catalog.ts`:

```ts
{
  version: "board-conditioned-qa-catalog/v1",
  revision: "immutable-revision-id",
  worldSlug: "journey",
  sourcePresentation: "local-composite/v5",
  boards: [{
    boardId: "newyork", sceneVersion: 1,
    board: { path: "public/scenes/.../board.png", sha256: "..." },
    slots: [{
      // Every existing BoardSlotDirection field: slot, context,
      // originalPeople, poseDescription, wardrobe, lighting.
      foreground: { path: "public/board-conditioned/<revision>/<board>/<slot>.png", sha256: "..." },
      hintText: { he: "...", en: "..." }
    }] // exactly three
  }] // exactly nine unique boards
}
```

No child, identity image, uploaded-photo path, HTTP URL, work-folder asset, or arbitrary server path is allowed. Static files are root-contained and hash-verified. Scene pins must exactly match the selected one-world checkout. Unsupported packages/worlds stop explicitly rather than falling through to the old painter. The deploy must include the catalog and the exact PNG assets in the server function trace; do not indiscriminately bundle unrelated board assets into a serverless function.

## Opt-in and actual path

- `APP_ENV=qa`, `QA_BOARD_CONDITIONED_WIZARD=true`, DB storage, real-generation/tester allowlist and generation kill switch all remain mandatory.
- Identity and board rendering require `GENERATION_PROVIDER=openai`, `GENERATION_MODEL=gpt-image-2`, `GENERATION_QUALITY=medium`. Board source is explicitly MEDIUM regardless of historical LOW defaults. Observer remains Sol HIGH.
- The normal photo/email/checkout flow and identity generation are retained. Before identity spend, all nine board files are preflighted and an identity reserve is made in the durable world ledger.
- Identity uses a single image HTTP attempt in this opted-in QA path. Its pre-reservation fingerprints photo bytes, style bytes, identity prompt/version, model and MEDIUM quality. The canonical2×2 illustrated sheet remains the paid identity asset. A free deterministic normalizer selects the mandated top-left portrait with the existing conservative face-window helper and presents it small on a512gray canvas, avoiding reuse of the sheet's other pose layouts. Both canonical and normalized hashes are pinned; no hand-picked Yuval crop is used.
- After identity succeeds, the legacy generation job atomically becomes `fixed-sprite-board-wizard-v1`. Its paidAt/order/draft state is preserved. Unlike the operator route, this is explicitly designed for checkout-created games.
- The ordinary cron/poll queue dispatches one board per tick through the same source, observer, extraction, compositor and replaying player adapter as the probes. It never calls the legacy target painter for these games.
- All nine first attempts run before retries. A rejected sheet/board gets at most one second sheet attempt. Both charges and both checkpoints are retained. This is a **whole-sheet retry**, not an implemented isolated-cell repair optimization.
- A source/geometry rejection does not stop untouched boards. Ambiguous paid output, a budget hold, changed identity, corrupted frozen assets or lost ownership prevents further paid dispatch and needs reconciliation.

## Cost

The existing exact identity receipt is included, not rounded `Asset.costCents` and not assumed free. All subsequent source, observer and final-review reservations use the same CAS-backed world ledger. A transactional wrapper narrows its five-dollar historical ceiling to **$4 for new reservations**, while preserving actual provider overrun bills. Identity reserves $0.50; each board source $0.20, observer $0.40, and each final Sol HIGH review $0.40. These are sequential worst-case reservations, not predictions or invoices. A request can therefore be refused while some actual money remains. Settled final-review usage uses the existing `judgeCharge` ratecard and exact request ID; an unknown charge retains its reservation and holds further spend.

The pre-existing daily spend calculation is conservative and includes aggregate assets, variants and ledgers; it can count imported identity twice. It is a safety ceiling, not the exact world cost. Exact run cost is the request ledger.

## Private human review, not publication

Only a board with all three replay-qualified geometries becomes private player assets. There are no procedural fallbacks. Assets, exact cleanup inventory, scene config and progress commit together. A complete nine-board result writes a full real GameShell config at `MANUAL_REVIEW`, never READY/DELIVERED, never a public bearer link, and sends no delivery mail.

The final visual stage runs one appearance per later queue tick (never three90-second reviewers after a source/observer pair). It uses `OpenAiPatchJudge` strong policy, **gpt-5.6-sol HIGH**, one attempt, against crops assembled from the actual final premasked player PNGs, including any deterministic RGB grading. Each recipe supplies authored light/exposure/saturation, actual foreground presence, physical support and original same-depth comparators. Identity, face integrity, age, anatomy, placement, scale and style are measured. Style-bad or uncertain results are kept for human review, not bought again. Exact wire/prompt/image hashes and private crop/patch evidence bind the receipt to the player placement. Missing billing remains a financial hold; a response lacking all seven passes never becomes a visual pass.

The creation status page exposes `/qa-review/<gameId>` only after 27/27 geometry success and a terminal review/held state. The route requires QA plus the owner/admin account; image URLs require the same session. The real GameShell supports the actual journey, zoom and target interaction for human testing. A compact expandable notice reports passed and unresolved visual checks. If the budget or an unknown review stops the later review stage, the complete private geometry preview is still available with explicit unresolved flags, never falsely approved. An incomplete world remains without a full game config; **all27 slot statuses and recorded cost/reserves remain visible on the creation page**, including failed boards.

Each uploaded child gets its own canonical illustrated identity, immutable child/age/name bindings, ledger, sources, observations and private assets. No Yuval/Noa ID or paid probe image is hardcoded.

Deletion uses the same Game→Job fence as checkpoint writes, purges exact private source/measurement/player/context/visual-wire/receipt inventory (including both attempts), clears the child images when unshared, and retains only the separate accounting ledger. Paid late responses cannot save images after deletion.

## Verification and remaining external work

Free tests exercise catalog bounds/no child paths, atomic four-dollar cap and two-attempt isolation, real disposable-SQLite enrollment from checkout state, identity-cost inclusion, all-nine-before-retry scheduling, stop after two failures, no fallback/publication, complete 27-image-ref private config, deletion, and changed-child refusal. The SQLite orchestration test uses **synthetic mocked engine results**, not paid renders or semantic approval. Existing extraction/player tests own the actual pixel gates.

Still required by the root task before enabling for the user:

1. Supply and review the real child-free nine-board catalog/masks.
2. Verify exact public-asset file tracing and deploy to QA only.
3. Run a real new-child game and inspect actual receipts, all composites, desktop/mobile zoom and taps.
4. Inspect the real final Sol HIGH receipts and human QA; the source observer is **not** the final review. This integration never turns geometry alone into semantic approval or automatic release.
5. Consider a future isolated-cell second attempt; current second attempts buy another three-pose sheet.

No deployment, external database write or paid request was performed by this integration subtask.

## Root deployment preflight update — 9 September 2026

The root task separately verified the actual Supabase project `find-me`
(`vvqjmaubdjndmjvcfxve`) and the documented isolated `qa` schema. The ledger
table was absent, so the additive migration `qa_board_conditioned_world_budget_ledger`
created **only** `qa."WorldBudgetLedger"` with the seven Prisma-model columns.
RLS is enabled and all table privileges are revoked from PUBLIC, anon and
authenticated. The existing Prisma owner connection retains server access.
Post-migration column checks passed; anon/authenticated SELECT both returned
false. `public."WorldBudgetLedger"` was absent before and after: production
tables were not migrated or modified. No game, child or image row was written
by this schema preflight.

This is not evidence of a successful live new-child run or deployment.
