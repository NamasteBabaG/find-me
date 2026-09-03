# Deploying "איפה אני?"

Production is a Vercel project (`find-me`, team `smallheroes-projects`) backed by a Supabase
Postgres. Everything below is the current state, not a plan.

## What is already set up

| | |
| --- | --- |
| App | https://find-me-smallheroes-projects.vercel.app |
| Database | Supabase project `find-me` (`vvqjmaubdjndmjvcfxve`), region `eu-central-1` |
| Schema | applied — 18 tables, identical to `prisma/schema.prisma` |
| PostgREST | locked out: RLS on every table with no policies, and `anon`/`authenticated` have no grants. The app talks to Postgres through Prisma as the owner, and nothing should reach these tables through the public API. |

## The one manual step: DATABASE_URL

Supabase generates the database password at project creation and never shows it again through the
management API, so it has to be copied by a human — it should not travel through a chat log.

1. Open the [database settings](https://supabase.com/dashboard/project/vvqjmaubdjndmjvcfxve/settings/database)
   and copy the password (or **Reset database password** and copy the new one).
2. Give it to Vercel — the CLI prompts for the value, so the password is never in your shell history:

   ```bash
   npx vercel env add DATABASE_URL production
   ```

   Paste the **transaction pooler** URL, which is what a serverless function should use:

   ```
   postgresql://postgres.vvqjmaubdjndmjvcfxve:PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
   ```

   (The direct connection is `db.vvqjmaubdjndmjvcfxve.supabase.co:5432` — use it for migrations from a
   laptop, not from a lambda.)
3. Redeploy: `npx vercel --prod`.

A `postgres://` URL switches Prisma to the Postgres schema automatically (`scripts/prisma-generate.mjs`),
so nothing else changes. To re-apply the schema after a model change:

```bash
DATABASE_URL="postgresql://…" npm run db:push:postgres
```

## Environment

Set in production today:

| variable | value | why |
| --- | --- | --- |
| `SESSION_SECRET` | random 48 chars | signs sessions, share links and asset URLs. Production refuses to boot with the dev default. |
| `STORAGE_PROVIDER` | `db` | a serverless host has no disk that survives; blobs live in `FileBlob`. |
| `JOBS_MODE` | `inline` | generation runs inside the webhook request — there is no worker yet. |
| `PAYMENT_PROVIDER` | `mock` | **no real money moves yet.** PayMe is a skeleton. |
| `EMAIL_PROVIDER` | `console` | **no mail is sent yet.** Resend is written but unproven. |
| `GENERATION_PROVIDER` | `openai` | real identity sheet + slot patches. |
| `OPENAI_API_KEY` | set | |
| `GENERATION_QUALITY` | `medium` | what the worlds were rendered at. |
| `ANALYTICS_PROVIDER`, `ADMIN_EMAILS`, `QA_AUTO_APPROVE` | | |

The container says out loud, at boot, which of these are still mocks. A provider that is named but not
built (`STORAGE_PROVIDER=supabase`, `GENERATION_PROVIDER=replicate`, `ANALYTICS_PROVIDER=posthog`)
fails at startup rather than quietly serving a mock.

## Cost per game

`GENERATION_BOTH_VARIANTS=false` (the default) generates one hiding spot per target: a complete
playable game at half the price. Measured at quality `medium`: $0.07 and ~55s per model call, and 26
of 27 spots needed exactly one call. A three-world game is one identity sheet plus nine spots — about
**$0.70** and ten minutes. At ILS 39 that is roughly 8% of revenue.

Ten minutes is longer than any serverless request, so generation runs in slices. `POST /api/jobs/tick`
does as much of one game as fits in four minutes and returns; the job stays RUNNING and the next tick
resumes exactly where it stopped. Two things call it:

* the `/creating` page the parent is watching, once per poll — fast while they are there;
* a Vercel cron every five minutes (`vercel.json`), authenticated with `CRON_SECRET` — so a game
  finishes even if they close the tab.

Both are safe to run at once: every step is idempotent and a finished hiding spot is skipped. If the
plan does not allow a five-minute cron, lower the frequency — the page still drives the common case.
A dedicated worker (Trigger.dev / Inngest) can replace the cron later; `JobRunner` is the seam.

## Before charging anyone

1. Confirm the cron actually fires on this plan (Vercel → Project → Cron Jobs), or move to a worker.
2. A real payment provider: `src/infra/payment/payme.ts` currently throws.
3. Real email: `EMAIL_PROVIDER=resend`, proven end to end.
4. Object storage for the blobs if volume grows; `FileBlob` in Postgres is fine for a pilot.
