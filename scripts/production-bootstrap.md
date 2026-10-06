# Guarded production bootstrap preparation

This tool prepares an empty **FindMe** application schema on the separately
approved Supabase project `pazdlpginuhnobeedzyn`. Its project display name is not
an authority check. It never connects to PostgreSQL, loads local dotenv files,
copies QA/customer rows, generates a Prisma client or applies SQL.

```powershell
node scripts/production-bootstrap.mjs --prepare --project-ref pazdlpginuhnobeedzyn --schema app --app-env production --output output/production-bootstrap/initial
node scripts/production-bootstrap.mjs --verify-artifacts --project-ref pazdlpginuhnobeedzyn --schema app --app-env production --output output/production-bootstrap/initial
```

The installed Prisma CLI generates a schema-only diff in an isolated temporary
directory, using an unreachable synthetic localhost datasource. Unsupported DDL
fails closed. Every application table, index and foreign-key relation is
qualified with `app`. The reviewed output directory is ignored scratch, never a
place for credentials. The script and focused tests are the releasable source.

The output consists of `preflight.sql`, `bootstrap.sql`, `verify.sql` and
`manifest.json`. The manifest pins the normalized current Prisma source hash,
DDL/preflight/bootstrap/verification hashes, complete columns, primary keys, indexes and
foreign-key actions. Verify the hashes again before using the reviewed SQL.

## Execution boundary

Only the authorized operator may execute the reviewed SQL using the exact
Supabase MCP `project_id` above. SQL cannot derive the physical Supabase project
ref from the shared database name `postgres`; the executor must verify that
external identity before sending any statement. Never run this against QA or
reuse it as an existing production migration.

1. Check project health, identity, region and explicitly private/unexposed `app`
   schema policy through sanitized platform metadata. Review hashes and SQL.
2. Run `preflight.sql`. It refuses any existing `app` namespace, private role or
   application tables in `public`/`qa`. It does not inspect customer rows.
3. Run `bootstrap.sql` in its transaction. There is no `IF NOT EXISTS` fallback,
   data-copy statement, password or existing-schema modification.
4. Run `verify.sql` and retain only its sanitized counts/hash/phase result.
   The complete generated metadata is compared with PostgreSQL catalogs,
   including defaults/nullability, index keys/uniqueness/validity and foreign-key
   namespace/deletion actions. Existing schema markers must match the exact
   source/project. Every table must have the expected owner, FORCE RLS and one
   policy limited to the runtime DB role. API roles must have no effective access
   or membership in either private role. Future default object grants are
   checked separately from current table grants.
5. Provision only the runtime credential through the authorized secret-safe
   path. The bootstrap creates `findme_runtime` as **NOLOGIN**. The verifier
   deliberately accepts its later LOGIN state, reports `runtime_login`, and
   continues to reject privileged attributes, inherited roles and schema/DB
   CREATE authority. Require `false` before credential setup and `true` after
   it. `findme_owner` must remain NOLOGIN throughout. Never select/store/print
   `rolpassword` or write a plaintext credential into SQL, artifacts or source.
6. Test the runtime connection only with authorized synthetic fixtures, then
   store its connection string solely in the new environment's secret manager,
   with explicit `schema=app`. Do not use the privileged migration connection
   as the application's runtime connection.

`findme_owner` is a dedicated non-login schema/table owner. Its private defaults
are configured globally **for that newly created role only**, because a
per-schema REVOKE cannot subtract a creator's global default grants. Supabase's
managed `postgres` defaults remain untouched. `findme_runtime` has only schema
USAGE and application CRUD (plus sequence USAGE/SELECT if ever separately
approved). The server policy permits all rows for that trusted application role;
custom owner/guest authorization remains in application services, not Supabase
Auth JWT policies. Neither private role is granted to API users.

PostgreSQL 17 implicitly grants a non-superuser CREATEROLE creator ADMIN on
created roles. The bootstrap does not grant ADMIN back to its grantor. It checks
the creator's effective SET authority and adds only `SET TRUE` to `postgres`
when necessary, without enabling LOGIN or widening either private role's
administrative attributes. See the PostgreSQL 17
[createrole_self_grant documentation](https://www.postgresql.org/docs/17/runtime-config-client.html#GUC-CREATEROLE-SELF-GRANT).

## Readiness limits

This is infrastructure preparation, not public-launch approval. Keep generation
disabled, `PURCHASING_ENABLED=off` and the production deployment protected. The
app's QA password gate does not operate under `APP_ENV=production`; verify the
separate purchase gate and the unavailable production mock-payment endpoint.
Verify canonical-host art access, backups and
synthetic restoration, cron/retention, auth/email and complete deletion before
processing real data. Real payment-provider and financial-lifecycle verification
remain separate prerequisites documented in
`docs/PREPRODUCTION_PAYMENT_VERIFICATION_20261005.md`.

Future migrations must explicitly use the owner role for new objects and
repeat source/constraint/RLS/grant verification. This fresh bootstrap refuses
existing schemas and must never become a reset or data migration command.
