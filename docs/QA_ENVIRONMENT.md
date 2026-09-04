# The QA environment

A second deployment that is a production build in every way except one: it pays
with the mock provider. Work goes here first and only reaches the shop after it
has been looked at.

## Why it exists

A QA audit found the live site running `generation=openai` with `payment=mock`
and `email=console` at the same time — real renders, a pretend till, and no
delivery. That is a hole when it happens by accident on the shop, and it is
exactly what a staging box is *for* when it is declared.

`NODE_ENV` cannot tell the two apart: both run a production build. `APP_ENV`
does. In `qa` the mock till alongside real generation is allowed and the app
wears a striped banner saying payments are simulated — a QA box that looks like
the shop is how someone comes to believe they bought something. In `production`
that combination refuses to boot (`src/lib/env.ts`).

## What is where

| | Shop | QA |
| --- | --- | --- |
| Vercel project | `find-me` | `find-me-qa` |
| `APP_ENV` | `production` | `qa` |
| Payment | PayMe (when live) | `mock` |
| Generation | `openai` | `openai` — same model, same cost |
| Email | `resend` (when live) | `console` (writes to the outbox) |
| Database | Supabase `find-me`, `public` schema | Supabase `find-me`, **`qa` schema** |

One Supabase project, two schemas. QA games, orders and uploaded photos never
appear in the shop's library because they are not in the same tables. A separate
Supabase project would isolate the credentials too and costs $10/month; the
schema is free and is one `DROP SCHEMA qa CASCADE` away from gone.

## Deploying to it

The projects are not linked to GitHub, so deployment is a command rather than a
push. From the repo root, without disturbing the shop's own link:

```bash
VERCEL_ORG_ID=team_2bLUDGyHayGB1UHIvcCBgyWh VERCEL_PROJECT_ID=prj_LbqCRqwU8WfZpeaWU7HTXM4SsfG4 npx vercel deploy --prod
```

The shop is the same command with its own project id, and should only run after
QA has been looked at.

## Secrets

Three values are set by hand, because nothing automated should be handling them.

- **`SESSION_SECRET`** — a *new* one. It signs sessions and asset URLs, so
  sharing the shop's would make a QA session valid against real data:

  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))" | npx vercel env add SESSION_SECRET production
  ```

- **`DATABASE_URL`** — the same Supabase transaction pooler URL the shop uses,
  with `schema=qa` added. The direct host is IPv6-only and Vercel egresses IPv4,
  so it must be the pooler.

- **`OPENAI_API_KEY`** — the same key. Generation is real here; that is the
  point, and `GENERATION_ENABLED=off` stops it without a deploy.

## First run

The build generates the Prisma client but never migrates, so the `qa` schema
starts empty. Once `DATABASE_URL` is set, push the tables into it once:

```bash
node scripts/prisma-generate.mjs
npx prisma db push --schema prisma/generated/schema.postgres.prisma
```

Then check the deployment agrees with all of the above:

```
GET /api/health   →   appEnv: "qa", db.ok: true, providers.payment: "mock"
```
