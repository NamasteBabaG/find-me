# Independent review of the audit-remediation batch — 22 September 2026

**Reviewed:** `50d3a0d9` → `2efc5ca7` on `codex/independent-worlds-20260918` (the later `ad3ce696` is documentation only).
**Method:** read-only. No source edit, commit, push, deployment, migration, credential, payment, email or paid render.
Every executed check ran in a throw-away detached worktree at `2efc5ca7` with local SQLite and mock providers; that
worktree was deleted afterwards. Codex's own worktree was not modified.

## הכרעה (Hebrew summary for Guy)

**מוכן ל־QA עם הסתייגויות מפורשות.** קוד הריצה של כל תשעת התחומים שביקשת לאתגר אומת באופן עצמאי — לא רק
בבדיקות הירוקות של קודקס אלא בבדיקות שכתבתי והרצתי בעצמי (יחידה, HTTP חי, דפדפן חי). לא נמצא פגם ריצה שחוסם QA.
שני דברים חייבים תיקון **באותו סבב** לפני שמכריזים על הסבב כסגור, ושניהם בכלי הפריסה ולא במוצר:
(1) ה־workflow של CI **ייכשל בהרצה הראשונה ב־GitHub** — משתני הסביבה ברמת ה־job מפילים 4 בדיקות ב־
`production-invariants.test.ts` (שוחזר: 23/23 בסביבה נקייה, 4 נופלות עם הסביבה של ה־workflow);
(2) שער הפריסה הנקייה מאשר commit שלא נדחף ל־remote (שוחזר על `2efc5ca7` עצמו, שאינו על שום ענף מרוחק).
היתר — הערות ברמת P2/P3 ושערי שחרור שכבר מתועדים כפתוחים.

---

## 1. Verdict

**Ready for QA with explicit non-blocking caveats.**

The runtime patch is sound: every claim I could exercise held under independent tests. Two defects sit in the
batch's *tooling* deliverables and should be fixed in the same batch (F1, F2). Nothing below reopens the release
gates the remediation note already lists; those remain open and are not restated as regressions.

## 2. What was executed vs. inspected

| Check | Executed / inspected | Result |
| --- | --- | --- |
| `npm run typecheck` on `2efc5ca7` | executed | clean |
| The eight suites named in the brief | executed | 3 + 3 + 2 files, **68 tests passed** |
| `npm run check -- --maxWorkers=4` | executed, **under the CI job's environment** (`quality.yml` env block) | **261/262 files; 4 failures in `production-invariants.test.ts`** — see F1 |
| `npm run check` — the failing file alone with a bare environment | executed | 23/23 pass (the failure is environmental, not a code regression) |
| `scenes:validate`, `adventures:validate` | executed | pass |
| `npm run build` + private-asset trace audit | executed | `privateLeaks: []`, `problems: []` |
| CI drift check (`git status` after build, as `git diff --exit-code` would see it) | executed (Windows) | no tracked drift |
| `scripts/deploy-qa-clean.mjs --check` | executed (never `--deploy`) | refuses wrong project, refuses an untracked file, refuses a modified tracked file; **accepts detached HEAD and an unpushed commit** — see F2 |
| Admin/outbox fail-closed | unit tests + **live HTTP** against a mock server (anonymous, ordinary signed-in parent, admin) | pass — see §4 |
| Progress telemetry authorization matrix | unit tests + **live HTTP** (11 cases) | 24/24 pass — see §4 |
| Guest player really sends and is granted its capability | **live headless browser**: gift → welcome → map → board → real find → beacon | beacon answered **204** for a guest with no session (only possible with a valid `playToken`); the beacon body itself is not retained by DevTools, so the field was proved indirectly plus by `telemetry.test.ts` |
| Checkout quota | unit tests + **live browser**, 12 real form submissions on one draft | limited after 10 (11 with one dev-server module reload in between); the limited call made **no provider call and no `checkout_started` event** |
| Photo preprocessing failure recovery | **new jsdom test** driving the real `PhotoUploader` with a throwing `drawImage`, then a throwing `toBlob`, plus a working control | 3/3: busy released, error shown, `fetch` never called; control uploads and navigates |
| Preload barrier | Codex's stalled-foreground test executed; `preloadVerdict`/`assetPlan` read | pass; essential-only verdict is correct |
| Runtime DB URL | tests executed; Prisma 6 parameter names checked; every `$transaction` timeout in `src` listed | pass — see F7 |
| Touch targets 320/360/390/1440 × he/en | **live browser**, real rectangles | 16/16: nothing under 48px, every control inside the viewport, `overflowX = 0`; 320px header screenshots inspected |
| Tick diagnostics | tests executed; route read | pass — see F6 |
| FK index migration | read; Prisma index names vs SQL names compared | consistent — see F8 |
| Remote CI run, Linux, branch protection | **not executed** (no push allowed) | unverified, as the note already states |
| Real pooler, real cron root cause, real PSP, real mail | **not executed** (out of scope) | unverified, as the note already states |

## 3. Findings, by severity

### F1 — HIGH (blocks the CI deliverable, not the runtime): the workflow's job-level environment breaks four tests

`.github/workflows/quality.yml:15-26` sets `APP_ENV: development`, `PAYMENT_PROVIDER`, `GENERATION_PROVIDER`,
`EMAIL_PROVIDER`, `ANALYTICS_PROVIDER` … for **every step**, including `npm run check` (line 33).
`src/lib/__tests__/production-invariants.test.ts:17-22` builds its environment with `vi.stubEnv` on top of the real
`process.env` and never clears `APP_ENV`; with `APP_ENV=development` inherited from the job, the "live shop refuses to
boot" cases (lines 34–47) never throw and "is what production defaults to" (84–87) reads `development`.

Reproduction (done): `npx vitest run src/lib/__tests__/production-invariants.test.ts` → 23/23 with a bare shell;
the same command with the workflow's env block exported → **4 failed** (`expected [Function] to throw`, `expected
'development' to be 'production'`). The full `npm run check` under that environment: 261 files pass, this one fails.

Smallest fix: move the `env:` block from the job to the **build step only** (`Production build and private-asset
audit`), leaving `NEXT_TELEMETRY_DISABLED` and `APP_COMMIT` at job level; `npm run check` needs no application
environment (Codex's own green run proves it). Alternative: have the test's `BASE` set `APP_ENV: ""`… but `env()`
validates the enum, so the workflow change is the right one. Acceptance: the workflow is green on its first remote run.

### F2 — MEDIUM: the clean-deploy guard accepts an unpushed, detached commit

`scripts/deploy-qa-clean.mjs:11-13` checks dirtiness and that `HEAD` is a hash; nothing checks that the commit is
on a remote branch or on the intended branch. Reproduction (done, `--check` only): on a detached worktree at
`2efc5ca7` the guard printed `{"target":"find-me-qa","commit":"2efc5ca7…","clean":true}` — and `git branch -r
--contains 2efc5ca7` is empty. `APP_COMMIT` would then name a commit that exists only on one laptop, which defeats
the provenance the guard was added for.

Smallest fix: refuse unless `git branch -r --contains HEAD` is non-empty (or `git rev-list --count @{u}..HEAD` is 0),
and print the branch in the `--check` JSON. Acceptance: `--check` on an unpushed commit exits non-zero.

### F3 — MEDIUM (operational trap): collection art is read from the *promoted* alias, not from the deployment being built

`src/services/generation/collection-art.ts:9-16` derives the CDN origin from `APP_URL`, i.e. `qa.findmeworlds.com`.
A freshly deployed-but-not-promoted build (exactly what `deploy-qa-clean.mjs --skip-domain` produces) therefore fetches
`public/scenes/adventure-*/base.webp` from the **currently promoted** deployment. The pinned hash (line 20) makes this
fail closed — but any release that changes a manifest hash and renders before promotion throws `COLLECTION_ART:
static image unavailable`/`local pixels changed` at render time. The self-origin (`VERCEL_URL`) is not usable
because deployment URLs sit behind Vercel SSO protection on `find-me-qa`, so the choice is understandable — it just
needs to be an explicit rule.

Smallest fix: document "promote before any render that needs new collection art" in `DEPLOY.md`, and make the error
message say which origin it read from. Optional: a build-time check that the manifest hashes equal the promoted
alias's files.

### F4 — LOW: telemetry validation is expensive per beacon and turns a bad config into a 500

`src/app/api/play/progress/route.ts:36-48`: every accepted beacon costs two game reads (`findUnique` here and inside
`resolvePlayToken`, which also selects `configJson`) and a full `parseGameConfig` of the published config (large for a
two-world adventure). The route allows 240 requests/min per caller before this work. Also `parseGameConfig` (line 48)
throws on an invalid config → unhandled → 500 rather than 403/400. Not reproduced live (all fixtures parse), but the
path is unguarded.

Smallest fix: wrap the parse in `try` → 400; cache `{sceneSlugs, targetIds}` per `gameId` in a small in-memory map
keyed by `updatedAt`, or select only the fields needed. Acceptance: a beacon for a game whose `configJson` is `"{}"`
answers 400, and repeated beacons do not re-parse the config.

### F5 — LOW: a local decode failure is reported as a network failure

`src/app/create/photo/PhotoUploader.tsx:201-218`: `forUpload` now runs inside the `try`, so a throwing decoder or
canvas releases `busy` (verified with the jsdom probe), but the `catch` sets `p.network` — "We couldn't connect.
Check your connection and try again." — for an error that has nothing to do with the connection.

Smallest fix: catch the preprocessing step separately and show `p.unreadable` (already in the dictionary).

### F6 — LOW: the tick watchdog is observation only, and the deferral condition is one-sided

`src/app/api/jobs/tick/route.ts:50-51` logs `deadline-exceeded` but cannot end the request; the only real bound
is the DB socket timeout (F7). Lines 66-70 defer when fewer than `SLICE_MS` remain **before** generation, but
retention (line 71) still runs if ≥30s remain after a slice that ran to its deadline — fine, but a
`runRetentionIfDue` that itself hangs is bounded only by F7. The `log("start")` on line 50 fires before
`qaAccessDenied`, so every unauthenticated probe writes a line. None of this is wrong; it is the honest limit of
what the batch claims ("root cause remains unproven").

Smallest fix: none required for QA; keep the 504 alert routing on the list.

### F7 — LOW: `socket_timeout=30` is compatible with the code, with one thing to watch

`src/infra/db/runtime-url.ts:7-9` caps `connect_timeout`/`pool_timeout` at 10s and `socket_timeout` at 30s — valid
Prisma 6 PostgreSQL connector parameters, applied only to the runtime client (`src/infra/db/prisma.ts:13`), and
migrations keep their own URL. I listed every `$transaction` timeout in `src`: 15s, 20s, 30s (most), **60s**
(`local-patch-human-approval.ts:171`) and **120s** (`local-patch-partial-release.ts:158`). `socket_timeout` is
per statement, so multi-statement transactions of 60–120s are fine as long as no single statement exceeds 30s;
none I read does. With `pool_timeout=10`, overlapping cron invocations will now surface as `P2024` errors instead of
hangs — which is the intent, but they will appear as `[jobs/tick] failed` lines and need the alert routing that is
still open.

### F8 — LOW: the index migration cannot be applied through a transactional migration tool

`prisma/changes/20260922-fk-indexes.sql:6-12` uses `CREATE INDEX CONCURRENTLY`, which is refused inside a
transaction. Supabase's `apply_migration` wraps a migration in one; the statements have to go through
`execute_sql` one at a time (or `psql`), with `search_path` set as the header says. Names match Prisma's defaults
(`Game_ownerId_idx` etc., verified against `prisma/test-schema.sql`), so a later `db push` will not duplicate them.
Coverage matches the advisor's seven per schema.

### F9 — LOW (pre-existing, partly acknowledged): the draft is the cheap side of the checkout quota

`src/app/create/actions.ts:88-97` fences per caller IP and per draft, per process. Draft creation itself is not
rate-limited, so a caller can spread attempts over drafts; the IP bucket still holds, per instance. The limited
answer made no provider call and no analytics event in the live run (11 × `303`, then `200` with the
`TOO_MANY_REQUESTS` notice and nothing after it). Acknowledged as "distributed limits still open"; add "draft
creation" to that line.

### F10 — LOW: foreground can now pop in after the curtain opens

`src/game/components/SceneViewport.tsx:262-266` fires decorative loads without awaiting them, so a slow foreground
appears over an already-open board. That is the intended trade (a hung foreground must not block), but before this
change the foreground was always in place at open. Consider a short grace for decorative art (≤1.5s) before opening,
or a fade-in, so a late foreground never lands over the child mid-search. Design call, not a defect.

### F11 — INFO: non-admin responses on admin pages are HTTP 200

The admin layout answers anonymous and non-admin visitors with its login shell and never renders the page, so the
page-level `requireAdmin` (`src/lib/server/require-admin.ts`) is the guard for independently rendered segments,
exactly as the unit test proves. Live: `/admin/costs`, `/admin/orders`, `/admin/orders/[gameId]` returned no table,
no e-mail, no game id for anonymous and for an ordinary parent (status 200, login shell); `/dev/outbox` returned 404
for both and 200 for the admin. If a 404 is wanted for probing resistance, add `requireAdmin` to the layout as well.

## 4. What passed independently (so Codex does not have to re-prove it)

- **Admin surface:** all five pages plus `admin/identity-reuse`, `admin/orders/[gameId]/identity-pilot`, the five
  `/api/admin/**` routes and `admin/actions.ts` check `currentAdmin()` before data (read); live probes above.
- **Telemetry matrix (live):** known `gameId` alone → 403; matching link (`target_found`, `game_completed`) → 204;
  another game's link → 403; tampered link → 403; unknown target → 400; unknown scene → 400; unknown game → 403;
  malformed body → 400; owner session without a link → 204; a different signed-in parent → 403; 51 events → 400.
  Every event shape the store actually emits (`play-store.ts:346-399`) passes validation; the bonus find emits no
  `target_found`, so it cannot poison a batch.
- **Checkout quota (live):** ten checkouts start, the next is refused before any provider work.
- **Uploader (jsdom):** decoder throw, encoder throw, and a working control.
- **Preload:** stalled foreground opens the board; a failed essential still fails the verdict.
- **Deploy guard:** wrong project, untracked file, modified tracked file all refused.
- **Touch targets:** 48px everywhere at 320/360/390/1440 in both locales; header at 320px inspected in both
  languages (flag hidden, CTA intact, no clipping).
- **Build:** production build with zero private leaks; no tracked-file drift after build.

## 5. Not verified here

Remote CI execution and branch protection; Linux-specific behaviour of the suite; the real pooler under overlapping
cron runs; the cron 504 root cause; PayMe; real e-mail; live owner/guest telemetry on QA after deployment; the CDN
path on a promoted deployment. All are already listed as open in `CODEX_AUDIT_REMEDIATION_20260922.md`.

## 6. State of Codex's worktree at the end of this review

At the start `work/qa-passport-release-20260917` was clean apart from `tmp/`. At the end it carried **new,
uncommitted work unrelated to this batch** (hero/board presentation: `content/home/*`, `public/home/boards/`,
`src/app/home/worlds-data.ts`, `src/app/create/scenes/page.tsx`, new tests). I did not touch it. It means the
review tip `2efc5ca7` is no longer what that tree builds, and `deploy-qa-clean.mjs --check` would now refuse it.
