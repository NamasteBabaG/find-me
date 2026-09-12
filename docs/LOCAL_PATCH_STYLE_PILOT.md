# Opt-in public style pilot

This is a standalone visual experiment, not proof of a deployed queue or a complete game. It never creates or changes an order, target, accepted image or email.

## Free preparation (default)

From the repository root:

```
npx tsx scripts/local-patch-style-pilot.ts --dry-run
```

No network, database, reservation or key is needed. The script writes only under `work/pilot/local-patch-style-v1`: the fixed public demo photo, the actual v7 identity style atlas, Sydney board people, the third placement's original crop and exact mask, and a free five-context packing sheet. Age 8 is an explicit synthetic test parameter, not a claim about the pictured person.

## Paid execution requires separate explicit authorization

After reviewing the prepared inputs, the caller may load their existing `OPENAI_API_KEY` into the process and run:

```
npx tsx scripts/local-patch-style-pilot.ts --spend
```

The script does not discover, create, persist or print keys. It buys at most one MEDIUM board-matched identity, one MEDIUM local patch, one LOW local patch at exactly the same placement, and three Luna LOW reviews. All purchases share one real CAS ledger in the isolated `pilot.sqlite`. The **inclusive reservation ceiling is $0.60**, with no cap override or ledger reset. A provider overrun must still be recorded honestly and prevents further purchases; a reservation ceiling is not a guaranteed provider invoice.

Both patches use the same original crop, mask, normalized identity portrait, board-people reference and prompt. Only output quality changes. The initial identity review sees the full identity sheet, as in the real gate; patch reviewers see its normalized 256px portrait. The two patch images are not a statistically controlled experiment: stochastic variation remains.

The identity uses the existing production request builder. A script-local, serial fetch interceptor retains its bounded raw response through `purchaseOnce` before allowing the same transport to process it from an offline replay. Patch purchases use the existing painter and durable boundary. Raw responses and typed estimated charge evidence live in the existing retained-purchase FileBlob store, in the same isolated SQLite database. Invalid model or unpriceable usage holds the experiment; no automatic replacement is bought. An over-bound response cannot be retained and leaves a reservation requiring reconciliation rather than permission to retry.

Re-running unchanged inputs replays fixed purchase keys. Changed inputs refuse. Do not delete or reinitialize this directory to obtain another allowance. A failed paid run may leave only partial visual outputs; its database remains the authoritative receipt and retention record.

## Readout

`comparison-identity-before-medium-low.png` contains the full identity sheet, original crop, MEDIUM crop and LOW crop. Review beside `board-people.png`, the full `medium-board.png` and `low-board.png`, at game zoom and at readable face scale. This comparison decides whether LOW is worth a broader test; it never enables LOW in production. The three raw review responses are advisory and cannot silently replace the user's visual preference.

`cost-report.json` names each operation, input fingerprint, raw validated usage, estimated amount and cost basis. Amounts are computed from the reviewed rate cards, not provider invoices. If execution stops early, inspect the isolated ledger and retained evidence before deciding anything else.

The free five-context atlas proves packing only. Its 1536px reference exceeds the current 1024px reference cap; no combined-atlas request is sent. A later atlas experiment needs an explicit transport/layout/extraction contract and five-output tests. Pixel count alone proves neither lower cost nor adequate face detail.
