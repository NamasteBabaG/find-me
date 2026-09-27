# Diagnostic gate correction and cron observation

## Scope

No new completed Claude review of `0202f897` was present at the start of this
pass. The latest report still reviewed `8d13cc69` / `47f1bf05`, already handled.
Continued bounded launch-readiness work without changing the QA deployment,
runtime engine, database, credentials, catalogue or approved images.

## Public-demo asset probe: reproduced and fixed

The existing CLI could print `passed: false` for a wrong/missing Content-Type
but return process status 0. Its prefix test also accepted `image/webp-not-really`
and rejected a case-insensitive valid media type. This could make a scripted
acceptance check appear successful despite invalid response metadata.

The JSON result and exit status now share one predicate requiring HTTP 200,
the expected SHA-256 and exact normalized WebP media type (parameters allowed).
The fixed QA origin, approved public paths, manual redirect policy and normal
login requirement are unchanged.

Eleven subprocess tests run the actual CLI using a synthetic fetch transport
and public repository assets. No real session or network is used. Before the
fix, four tests failed; afterwards all eleven passed. Coverage includes valid
MIME, MIME parameters/case, HTML/missing/prefix MIME, redirects, non-200 status,
corrupted bytes, absent password, failed login and prohibited origin override.
Successful output is checked not to contain the synthetic password or cookie.
The focused probe, asset-decoding and release-tooling run passed 14/14 tests.
Full repository check passed: **275 files, 3,507 tests**, two expected failures,
35 skipped, exit 0 (682.69 seconds). Log retained locally at
`tmp/passport-probe-check-20260928.log`. The final added transport-count
assertions were also rerun independently: 11/11 and `tsc --noEmit` passed.
No application source, dependencies or content changed, so no local production
rebuild or QA deployment was needed for this operator-tool correction.

This is an operator-tool correction, not evidence that the live nine images
now load correctly. Authenticated QA image diagnosis remains open.

## Read-only live cron observation

Used the linked QA project's existing Vercel CLI authorization. Queried request
logs only; did not invoke jobs/tick, generate a game, read customer assets or
change configuration. No raw log messages, child identifiers or credentials
were copied into this report.

- A project-scoped 24-hour 5xx query (no branch filter, limit 100) returned zero
  rows, exit 0. This is the API's available log window, not proof of complete
  historical retention or resolution of the 21 September incident.
- A bounded 30-minute tick query returned 29 GET requests from
  `2026-09-27T21:32:29.308Z` through `2026-09-27T22:00:29.240Z`, all HTTP 200.
- Each of those requests included an `end` timing: minimum 1,944ms, maximum
  2,808ms, mean about 2,141ms. Timings were parsed from the end event, not the
  near-zero start event.
- Authorization, notification-retry, generation and retention phase markers
  were present for all 29 requests. These observations span the previous and
  current QA deployments; they demonstrate scheduled execution survives the
  recent promotion, not actual image-provider work or load acceptance.

The historical 300-second timeout's root cause remains unproven. Close its
launch gate only after a real controlled generation under overlap/slow-I/O
conditions with evidence that paid work, leases and retries remain correct.

## Claude handoff / next steps

Challenge the subprocess harness as well as the script: a matching image hash
must not hide an invalid MIME, redirects must never be followed, and failed
login must prevent image requests. No live password is needed to reproduce.
Read the exact tested commit and do not infer a new deployed runtime from this
tool-only change. QA remains `0202f897`; F-A remains open. Continue the remaining
launch gates in `CODEX_LAUNCH_WORKSTREAM_20260927.md`.
