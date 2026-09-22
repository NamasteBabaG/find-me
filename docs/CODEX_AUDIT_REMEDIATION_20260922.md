# Audit remediation — 22 September 2026

## Scope and release state

Baseline: `50d3a0d9` on `codex/independent-worlds-20260918`.
Claude's report audited the older `771120ed` deployment. Its dirty-tree and
missing-merge findings were already resolved by the `fc5f0a7e` QA release.
This new remediation batch is **not deployed**: Guy requested an independent
Claude review, findings returned to Codex, and another verification pass.

## Implemented in this batch

- Sensitive admin pages check `requireAdmin()` before reading data, independently
  of the layout. The dev/QA mail outbox also requires an administrator.
- Checkout applies the existing rate limiter both per caller and per draft
  before provider invocation. This is still a per-process limiter, not a
  distributed rate-limit claim.
- Play telemetry requires either the owning session or the existing verified,
  active player capability for the same game. Deleted/unplayable games and
  unknown scene/target identifiers are rejected. Capabilities are not passed
  into event persistence or analytics. Guest capabilities are passed explicitly
  from the server player route through the store, not guessed from the URL.
- Optional foreground/bonus loads no longer delay the essential-pixel barrier.
  The background and all child pixels still must load/decode. Existing mounted
  image decode checks are retained.
- Photo preprocessing now sits inside the upload error handler, so preprocessing
  failure releases the busy state.
- Published child-free collection artwork is fetched from the deployment's
  configured HTTPS `APP_URL` instead of a hard-coded QA domain. Hash, MIME,
  redirect and byte bounds remain. QA cookies are used only when the QA gate
  is enabled; a production CDN request need not carry a QA cookie.
- Runtime PostgreSQL connections cap connect/pool waits at 10 seconds and
  query waits at 30 seconds, retaining stricter existing settings. SQLite and
  migration connections are unchanged. This is Prisma's **client query timeout**,
  not a claim that a database-side `statement_timeout` migration was applied.
- Tick requests log safe phase/timing markers and an overrun watchdog. They
  defer new generation if startup/notifications consumed the available window.
  There is no `Promise.race` returning success over detached paid writes.
- Seven FK indexes are added to the schema and regenerated SQLite test DDL.
  `prisma/changes/20260922-fk-indexes.sql` prepares PostgreSQL application;
  **no live schema was changed**. Seven per schema explains the audit's 14.
- GitHub Actions quality gate: locked install, typecheck/tests, both content
  validators, production build/private trace audit and generated-source drift.
  No customer credentials, paid providers or deployment token in this workflow.
  Remote CI execution/branch protection still require verification after push.
- `scripts/deploy-qa-clean.mjs` rejects dirty source and the wrong Vercel project,
  supplies `APP_COMMIT` to build/runtime and uploads without promoting an alias.
- Header/footer and carousel hit targets are 48px. The dots remain visually
  small. Narrow English headers were also corrected after actual clipping was
  observed despite a zero horizontal-scroll measurement.

## Evidence

- `npm run check -- --maxWorkers=4`: 262 files, **3,430 passed**, 2 expected-fail,
  35 skipped; no unexpected failures, TypeScript clean. Subsequent narrow-header
  CSS correction and tick formatting receive final targeted/build checks.
- Both scene/adventure validators passed. Existing scale warnings relate to
  the older catalog; no claim of new catalog activation is made.
- Final production build passed after the narrow-header correction; 58 route
  traces audited, no private leaks or audit problems. The empty synthetic build
  DB had no SceneOverride table, so catalog overrides used their documented
  fallback (a build warning, not a claim of a fully provisioned database).
- Tick/telemetry targeted rerun after final formatting: 6/6 passed.
- Real browser: English home at desktop/390px/320px; Hebrew home at desktop
  and 320px. Header controls measured 48px high; final 320px bounding rectangles
  remain within the visible document. Anonymous costs route exposes only the
  login shell; anonymous outbox shows not-found, not email contents.
- Screenshots are local temporary evidence under `tmp/audit-*`, not shipped.
- Live logs independently confirmed four `/api/jobs/tick` 504s from the earlier
  `dpl_51WZqoABnH9n2b7xfWBr7BPbE8Fd` deployment on 21 September, around
  21:45–21:48 UTC. Each says 300 seconds and has no inner phase evidence.
  **Root cause remains unproven.** New diagnostics/timeouts need live validation.
- Timeout parameter reference: [Prisma 6 PostgreSQL connector](https://www.prisma.io/docs/orm/v6/overview/databases/postgresql).

## Remaining work — not silently closed

| Audit task | State / next acceptance condition |
| --- | --- |
| DB credential rotation | Needs inventory of active consumers and coordinated rotation/health checks. No secret was read from git history or rotated here. |
| Production 503 / www certificate | Reported outage; public launch/holding-page and DNS action are separate. Production remains untouched. |
| Dirty QA / Claude port merge | Already closed in the prior clean `fc5f0a7e` release. |
| USD tiers | Awaiting choice between $19/$29/$49 and $29/$39/$49. Existing $22/$39/$56 unchanged; ILS 49/89/139 unchanged. |
| Cron | Defensive code and diagnostics implemented; DB-side timeout, alert routing and real-run resolution still open. |
| Public product migrations / QA isolation | No production migration or new Supabase project created; prepare/rehearse against a backed-up isolated schema before promotion. |
| Admin / checkout / distributed limiter | First two implemented. Cross-instance quota store remains open. |
| PayMe / refunds | Sandbox credentials/provider contract and refund claim lifecycle still open; no actual charge/refund attempted. |
| Email | Outbox secured. Real QA sender/domain provisioning and delivered-email validation still open. |
| Legal / consent / contact | Operator identity, approved policies and versioned consent remain open; do not publish invented legal terms. |
| Marketing metadata / analytics | Not changed in this batch. Third-party tracking/consent, favicon/OG/sitemap remain work. |
| CI / deploy provenance | Workflow and clean-deploy guard implemented; remote execution and branch protection not yet verified. |
| FK indexes | Prepared and exercised through SQLite fixtures, not applied to either live schema. |
| Telemetry / collection CDN | Implemented; live owner/guest and CDN paths still need acceptance after review/deployment. |
| CreatingStatus i18n / priceVersion | Not changed yet. |
| Preload / upload error handling | Implemented. |
| Judge golden set | Not changed; no new paid image calls. |
| Touch targets | Implemented and browser-measured; independent visual challenge requested. |
| Post-pilot upgrades / reveal / family navigation | Still separate product work, not part of this hardening patch. |

## Independent review gate

The local `claude` CLI is installed but `claude auth status` returned
`loggedIn: false`, `authMethod: none`. No existing connected Claude surface was
available in the browser inventory. Guy was asked to run `claude auth login`;
no password/API key is requested in chat. Guy subsequently chose to forward the
brief himself; local CLI login is no longer a handoff prerequisite. Code review
tip is `2efc5ca7`, not deployed or pushed. The deploy guard was exercised in
`--check` mode and correctly rejected the current tree's untracked `tmp/`;
no deployment was attempted. The review brief is
`CLAUDE_INDEPENDENT_REVIEW_20260922.md`. Do not label this batch Claude-approved
or promote it to QA until that review has actually returned and findings have
been addressed.
