# Fixed-source failure diagnostics — 9 September 2026

The Image2 provider now emits a strict, sanitized `fixed-source-failure/v1` receipt on every post-dispatch failure. It contains the bound world/request/fingerprint, requested model/quality, HTTP status, safe provider request ID, whitelisted API error code/type, transport/JSON classification, model-match status and usage-validation flags. It does **not** retain raw API messages, response bodies, prompts, images, tokens or arbitrary error/model strings.

An optional failure sink preserves existing successful-source fingerprints. The operator probe writes `source-failure-receipt.json` and an immutable private database checkpoint. Both actual QA creation routes save the same receipt through their existing claim/lease-fenced database writes. Diagnostic checkpoints are included in scoped deletion inventory. Diagnostic persistence is not billing settlement: a failed sink leaves the sanitized receipt on the typed error, retains the existing pending/unknown charge behavior, and never grants a retry.

Unknown usage, invalid request IDs or an unexpected model retain the reservation; no zero charge is inferred. Non-200 responses with valid trusted charge evidence remain billed before invalid output is rejected, as before. No automatic retry or quality/model fallback was added.

## Historical Antarctica failure

Read-only inspection of `work/board-conditioned-engine-20260909/world-final-antarctica-v1` found only the frozen plan and input assets. Its SQLite `FileBlob` table is empty. The budget request is unknown, with one generic reason and no retained HTTP status, provider request ID or charge evidence. Consequently, the precise old API failure, generated output and actual charge cannot be reconstructed from retained local evidence. The historical ledger and its 20-cent reservation were not changed. This implementation improves subsequent failures; it does not manufacture a retrospective receipt.

## Verification

No live API calls. Focused suites cover HTTP 401/403/429/500/503, quota vs rate limit, invalid/missing usage, model mismatch, unsafe IDs, non-JSON responses, transport timeout, diagnostic-storage failure, immutable/scope-checked database persistence, actual QA failure checkpointing, lifecycle deletion and existing wizard/generation behavior. 134 tests in six suites passed; TypeScript was clean.
