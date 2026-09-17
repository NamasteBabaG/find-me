# הדרכון שלי — מסירה לקלוד לביקורת עצמאית

Date: 2026-09-17. Implementer: Codex. Reviewer: Claude, **not yet run**.

Branch: `codex/passport-20260917`, based on `1ec5f454` in `work/qa-discovery-tray-20260916`.
The implementation is local. **No QA/production deployment, database migration, paid generation or real-child public share was performed.** Do not infer deployment from the worktree directory name.

## Start here

Read `SOURCE_SPEC_HE_V1.md` and `IMPLEMENTATION_PLAN.md` beside this file, then review the diff from the base. The user's latest decisions override the original single-leaf description: desktop has two leaves **for the same board**, mobile combines their content on one page. A closed and open passport must remain the same height.

The user wants you to challenge correctness, privacy and the complete journey, then give the visual experience a demanding final polish. Do not replace the book with a grid of generic cards. Do not broaden into the wizard's other design work or undo earlier fixes.

## What is implemented

### One family, separate children

- Normal account entry is **האזור המשפחתי / Family area**, not My games. `/library` redirects normal users; the old test list remains QA-admin-only with `?tests=1`.
- The parent explicitly selects an existing child or starts a new child. Names/photos are never deduplication keys. Switching children after an upload requires a fresh draft.
- `FamilyChild` is the stable owner-scoped identity. `ChildProfile` remains per-adventure rendering input, so a later photo cannot overwrite an earlier adventure's assets.
- Checkout/payment bind the family child transactionally; unpaid drafts do not create empty passports. Unfinished own drafts can be resumed from the family area.
- Entitlements, choices and progress stay with the selected child. Test games without a family assignment are not silently migrated or relabelled.

### Passport and rewards

- Derived from the existing authoritative adventure progress: exactly three personal finds earn a stamp; six discoveries are a separate collection. No counter maintained by animation.
- One picture per completed place, defaulting to the last first-time find. Owner can choose any of the three; choice is persisted and reflected in sharing.
- Six fixed keepsake slots. Uncollected item names, pictures and facts are absent from the passport projection.
- Compact bound book, hinged opening, turning leaf on desktop, directional transition/swipe on mobile, edge arrows, keyboard/RTL, reduced motion, picture enlargement and separate fact/choice dialogs.
- Completion replaces the old success card for current three-hide boards: confirmed save → stamp → picture → collected keepsakes in about 2.4 seconds. Skip settles the page; it never advances. No auto-close.
- Replay retains earned progress/photo. Newly found discoveries persist even before finishing the replay. Repeated completion does not re-award a stamp or animate already-seen discoveries.
- Owner in-game reader and private family reader use the same book. Shared play guests use their existing local progress, without writing the owner's account.
- Home uses the same book with clearly labelled fictional public beach-demo assets. No Bar/Arbel/source photo was used for the marketing demo.

### Sharing and media

- Sharing is off by default; parent area only. Enabling/rotating requires a recent owner sign-in, server-bound recent preview proof and explicit consent. Revocation does not require fresh sign-in.
- Independent random `ppr_` capability, not a play token. URL secret is in the fragment; client sends it in the request body, not an indexed route/query.
- Anonymous projection uses a generic localized explorer alias, never the actual child's name/age/account/order. Read-only: no play/edit controls, no hidden-object solutions or raw game config.
- Server produces small composite crops (picture ≤900 px, item ≤192 px, avatar ≤256 px), not source photos or full personal boards. No image-generation call.
- Owner and shared requests recheck ownership/entitlement/deletion after media work. Selected-picture changes invalidate the old public picture handle. Rotation/revocation blocks new data **and** media requests.
- No-store/noindex/noreferrer; generic social metadata; no capability or child PII added to analytics. Already downloaded copies/screenshots cannot be recalled, as the consent explains.

## Code map

| Area | Main files |
| --- | --- |
| Models | `prisma/schema.prisma`, generated test DDL `prisma/test-schema.sql` |
| Family ownership / payment binding | `src/services/family.service.ts`, `order.service.ts`, `src/app/create/{page.tsx,NameForm.tsx,actions.ts}` |
| Family account and owned play | `src/app/family/**`, `src/ui/Shell.tsx`, `/library` redirect |
| Pure projection | `src/domain/passport/passport.ts` |
| Preferences / media / sharing | `src/services/passport*.service.ts`, `src/app/api/passport/**` |
| Shared entry | `src/app/passport/**`, `src/ui/passport/SharedPassport.tsx` |
| Book + adult controls | `src/ui/passport/{PassportBook,OwnerPassport,PassportSharing}.tsx`, `passport.css`, `book-navigation.ts` |
| In-game completion/replay | `src/game/components/{AdventurePassport,PassportCompletion,PassportMemory}.tsx`, `store/play-store.ts`, `engine/passport-storage.ts` |
| Public example | `src/app/home/PassportDemo.tsx`, `src/domain/passport/demo.ts`, `public/demo/passport-v1`, `content/demo/passport-v1-assets.json` |
| Languages | Added keys in both HE/EN dictionaries; account copy updated by key, not replacing the dictionaries |

## Evidence and verification

- Production build passed after the final image-retry/progress-validation changes. 31 static pages; shared first-load JS 103 kB. Build trace privacy audit reports no private leaks and no problems. This is local tracing, **not** a deployed Vercel artifact measurement.
- Final focused gate: typecheck plus **56 tests in 8 files**, all passed. Real disposable SQLite, real raster decoding/crops, route authorization, completion, store replay and book interaction are covered.
- Full suite: `npm run check -- --maxWorkers=2` passed **246 files / 3326 tests**, with 2 expected failures and 35 skipped, zero unexpected failures (523.35 s). The final subsequent change only scoped homepage-demo introductory heading CSS so it cannot override the book's compact headings; it was rechecked visually and rebuilt.
- `scenes:validate` and `adventures:validate` passed. Existing scene scale warnings remain; no art/slot edits were made here.
- Browser completion: clicked the third actual child target in the fictional fixture, observed persisted completion and the one completion dialog.
- Browser replay: clicked all three actual hiding targets, observed no duplicate stamp/finds, and compared saved account progress before/after. Opened the passport from the actual game shell with zero vertical overflow.
- Browser sharing walk: owner reauthentication, preview, consent, anonymous read-only view; after revocation both data and image requests returned 404. Service tests also cover rotation, selected-picture change, sibling isolation and deletion.
- Missing image has two bounded retries; stamp and navigation remain. Invalid persisted album revision fails explicitly instead of manufacturing progress.

### Reader measurements

| Viewport | Book height | Vertical document overflow | Horizontal overflow |
| --- | --- | --- | --- |
| Desktop 1366×768 | 476 px, closed **and** open | 0 | 0 |
| Mobile 390×844 | 560 px | 0 | 0 |
| Mobile 360×740 | 510 px | 0 | 0 |
| Short mobile 360×640 | 510 px | 98 px | 0 |

All six item buttons and captions remain inside the paper. Fact dialog does not resize the book. Resize preserves the selected place. Native Chromium touch input verifies RTL rightward swipe moves forward, does not accidentally open the photo, and vertical scroll does not turn pages.

See `evidence/` for screenshots and machine-readable layout/replay/touch results. These contain only the already-public fictional demo child. Raw local logs and temporary login capabilities stay in ignored `output/passport`, not in Git.

## Reproduce safely

Use a separate worktree and its lockfile (Vitest 4.1.11). Earlier reviewers had different Vitest versions; do not assume equal results across installations. Do not run a production build while a dev server writes the same `.next` directory or locks Prisma's engine DLL.

1. Generate the local SQLite Prisma client with `npm run db:client:local`.
2. Run `npx tsx scripts/passport-smoke-fixture.ts`. It creates a **new** temporary database/storage directory and `output/passport/smoke-fixture.json`. It does not seed the configured QA/production database.
3. Use the generated `databaseUrl` and `storageRoot` as `DATABASE_URL` / `STORAGE_LOCAL_DIR`. Use `APP_URL=http://localhost:3022`, `APP_ENV=development`, `GENERATION_PROVIDER=mock`, `GENERATION_ENABLED=off`, `PAYMENT_PROVIDER=mock`, `EMAIL_PROVIDER=console`, `STORAGE_PROVIDER=local`, `ANALYTICS_PROVIDER=none`, `JOBS_MODE=inline`, and a local-only `SESSION_SECRET`.
4. Start `npm run dev -- --port 3022`. Open the short-lived `login` URL from the local fixture file. **Never commit that file or token.** For parent sharing reauth, use the local console email outbox, not a real email provider.
5. The fixture has nine explicit demo places, not nine saleable art boards: first place 3 finds/2 items, second 3/6, third 2/6, others empty. Complete the third place by clicking the last remaining child before the replay check.
6. Connect a local browser to the private passport. `node scripts/verify-passport-book.mjs <local-CDP-websocket>` saves layout evidence and leaves the reader on place 2 at 390×844. Then `verify-passport-touch.mjs` checks actual touch. `verify-passport-replay.mjs` is restricted to this localhost fictional fixture and checks the actual play route.
7. Public visual preview: `http://localhost:3022/#passport-demo-title`. Private family reader uses `/family/<childId>/passport`. The public example needs no owner login.

Tests: `npm run check -- --maxWorkers=2`; focused files are the passport directories, family/passport service tests, share route test, passport completion and play-store album tests. Build: `npm run build` with isolated environment and the dev server stopped.

## Challenge these before a release

1. **Schema deployment is not done.** New `FamilyChild`, `PassportPagePreference`, `PassportShare` and nullable Game relation need a reviewed additive PostgreSQL migration, tested against a disposable PostgreSQL database first. No force reset and no automatic legacy identity matching. SQLite tests do not prove PostgreSQL concurrent behavior.
2. **Repeat purchase of the same world for the same child** currently appears as a distinct game/chapter, not a merged child–world stamp set. The service never mixes rendering generations. Before offering repeat purchase, either prevent it in the catalog or explicitly specify a canonical child/world entitlement; do not silently union pictures/progress across games. This remains a difference from the spec's absolute child–world–board uniqueness wording.
3. **World divider presentation** is currently compressed into the world selector, place strip and per-page world heading. There is not yet a separate illustrated world-divider spread with its own visited-count panel. The nine places and their stamp states are present. Please challenge this deliberate compact presentation against the original divider acceptance item; do not describe that exact item as implemented.
4. **Preparing content** has an explicit preparing message/count; until a valid finalized config exists, its nine placeholder pages are not fabricated. The spec permits early pages but the implementation does not assume unknown content.
5. **Ceremony acknowledgement offline:** local seen state is retained; an unsent owner acknowledgement is retried on the next completion, not by a general background-sync worker. Another device can show the ceremony before it syncs. Earned finds/items remain idempotent and independent of this presentation metadata.
6. **Composite support:** crop service supports the approved local-patch boards. It fails visibly for extra transformed/foreground rendering instead of making an incorrect keepsake. Validate each newly introduced render mode; do not bypass this guard.
7. Test Safari/iOS and a physical touch device, 200% zoom, long localized board/item names, extremely short desktop windows, and the parent-sharing panel. The no-scroll measurements apply to the reader at the sizes above, not to the deliberately longer adult consent form or the whole marketing homepage.
8. Validate a second **different** world purchase for the same child through the real staging checkout/provider path, including concurrent callbacks and refunds. Current evidence uses an isolated mock fixture/services; no paid image generation or real-payment end-to-end run happened in this change.
9. The pre-existing release gates (provider refund claim, PayMe readiness, PostgreSQL production-path verification) are not fixed or waived by this feature. Do not call this a production release approval.

## Reviewer acceptance walk

- Same-name siblings remain distinct; fresh and resumed drafts choose the intended child without changing another adventure's photo.
- Two personal finds plus six items: no stamp. Third find with zero/two/six items: stamp, stable photo and six slots; safe continuation.
- Skip, Escape, stay, next place, world end, picture selection/save failure, reload and a second device.
- Replay a finished place, collect only a new object, leave immediately: object persists, picture/stamp untouched. Replay without new objects: no re-award.
- Open/close/turn repeatedly, resize while reading, RTL/LTR keyboard and touch, image errors and reduced motion. No clipped items or unexpected photo zoom.
- Share cannot be enabled from a player token or another account. Consent/preview expire and are bound to session, child and language. Old images/data stop after revoke/rotation/delete/refund.
- Anonymous network contains only approved projected data and small media, no hidden discoveries, source photo, target positions, internal game/child IDs or private bundle URLs. Generic OG and no indexing.
- Home demo is clearly fictional/read-only and writes no account progress. No public link to a real child's passport is added for marketing.

Deliver findings with reproducible evidence and severity. The user will decide on final visual polish after trying the book; no one has yet certified it as "WOW" on their behalf.
