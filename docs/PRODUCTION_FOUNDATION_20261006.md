# FindMe protected production foundation — 6 October 2026

This establishes a separate, protected environment. It is not approval to open
public purchases or to deliver production games. QA remains on its existing
project and database; the paused legacy production artifact remains untouched.

## Authorized infrastructure

The operator approved a separate Supabase project in the **Small Heroes** Pro
organization and its quoted additional **$10/month** cost. This is the database
project quote, not the total cost of hosting, generation or payment processing.

| Resource | Approved identity | State verified during setup |
| --- | --- | --- |
| Supabase | `find-me-production`, `pazdlpginuhnobeedzyn` | Healthy; Frankfurt (`eu-central-1`); PostgreSQL 17 |
| Application schema | `app` | Current Prisma source; 26 tables, 229 columns, 63 indexes, 26 foreign keys |
| Vercel | `find-me-production`, `prj_b2zHHVVG9B6ypJUsmXXUg3Uf62jG` | Separate project; Node 24; Frankfurt (`fra1`) |
| Vercel team | `team_2bLUDGyHayGB1UHIvcCBgyWh` | Existing Small Heroes team |
| Deployment protection | Vercel authentication on **all** deployments | Enabled; automatic custom-domain assignment disabled |

No QA/customer records, photos, assets, session tokens or provider keys were
copied. The new database has a private non-login owner role and a distinct
restricted runtime role. All application tables force RLS and permit only that
server role; API roles cannot read the schema. Application services still enforce
owner and guest authorization. The runtime credential has no DDL, owner-role,
superuser or RLS-bypass authority.

## Checked source and database boundary

`scripts/production-bootstrap.mjs` prepares schema-only SQL using an isolated
synthetic datasource. It pins the approved project and current Prisma source,
refuses an existing application schema and checks complete catalog metadata,
ownership, effective grants, private-role membership and RLS. The bootstrap was
applied to the new project and its live verifier passed before and after the
separate restricted runtime LOGIN setup. Credentials never appear in this report
or tracked source.

Preparation artifacts are ignored scratch. Follow
[`scripts/production-bootstrap.md`](../scripts/production-bootstrap.md); this
fresh bootstrap must never be reused as a reset or migration of an existing
customer database.

## Closed production behavior

`PURCHASING_ENABLED=off` closes new creation, photo upload, continuation purchases
and checkout in production before their mutations. Direct production mock-pay
routes return 404. Existing paid-game repair, gameplay, refunds and checkout
closure retain their separate paths. QA and development preserve their existing
creation flow. Enabling purchasing with mock payment is rejected by configuration.
The creation screen presents a short HE/EN prelaunch notice and demo link.

At this report's preparation, the exact pooler endpoint and runtime connection
probe were still pending normal Supabase dashboard sign-in. No production
deployment, health acceptance or default/custom-domain promotion is recorded.
Do not treat resource creation as completed application connectivity.

The protected foundation must use the fixed safe flags in
`scripts/production-prelaunch-proof.mjs`: purchasing and generation off; mock
generation/payment; console email; database storage; no analytics; no QA approval
or delivery overrides; no copied admin access. Independent database, session and
cron secrets belong only to the new project's secret manager.

## Deployment acceptance

Deploy from the dedicated production checkout using:

```powershell
node scripts/deploy-production-prelaunch.mjs --check --preflight <sanitized-live-evidence.json>
node scripts/deploy-production-prelaunch.mjs --deploy --preflight <sanitized-live-evidence.json>
```

The guard requires the correct project link, a clean pushed commit, successful
quality CI for that exact commit, and fresh live cloud/database evidence. A
schema-only artifact is insufficient. Runtime evidence must come from the exact
credential configured for Vercel production, validate its physical project,
`app` schema, `findme_runtime` identity and schema source marker, and pass an
authorized synthetic probe. Keep only sanitized identity and results.

The command pins safe build/runtime flags and deploys with `--skip-domain`; it
does not launch the shop, promote a custom domain or modify a database. Before
claiming a connected deployment, verify READY status, exact source identity,
remote build/private-asset audit and an authenticated database health round trip.
An unauthenticated request must encounter Vercel protection. Only the protected
default `vercel.app` alias may be assigned during this phase. Do not move
`findmeworlds.com` or alter `qa.findmeworlds.com`.

## Validation of this source

The complete local quality check passed: 351 test files, 4,498 passing tests,
two expected failures and 55 skips. After the final guard changes, TypeScript
and all 76 bootstrap/deployment-guard tests passed again. A local production
build with purchasing/generation disabled and a synthetic empty SQLite database
passed the private-asset audit with no leaks or tracing problems. This local
build is not a deployed PostgreSQL connectivity test or an exact-commit CI result.

## Public launch remains separate

The current production branch selection still uses the historical generation
path; the reviewed QA local-patch engine and its recovery/spend protections need
an explicit versioned production rollout and end-to-end proof. Disabled generation
is infrastructure containment, not evidence of engine parity or fulfillment.

The PayMe adapter and payment lifecycle still require implementation and the
verification described in
[`PREPRODUCTION_PAYMENT_VERIFICATION_20261005.md`](PREPRODUCTION_PAYMENT_VERIFICATION_20261005.md).
Before real customers, verify canonical-host private art access under deployment
protection, autonomous cron/queue/delivery, transactional mail, support handling,
retention/deletion, backup restoration and actual merchant/payment configuration.
Do not infer any of these from a healthy empty database or a successful build.
