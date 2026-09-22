# Claude — independent challenge of Codex's audit fixes

Guy explicitly asks you to independently verify Codex's changes, return concrete
findings to Codex, and let Codex implement the follow-up. **Read-only review**:
no source edits, commits, deployment, migrations, credential changes, real payment,
email delivery or paid rendering. Do not inspect `.env*`, private child assets,
storage, browser sessions, tokens or credentials. Use synthetic fixtures only.

## Exact code

Worktree: `C:/GNart/Work/find-me/work/qa-passport-release-20260917`.
Branch: `codex/independent-worlds-20260918`.
Baseline before this batch: `50d3a0d9`.
Code review tip: `2efc5ca7` (later handoff-only documentation is not code).
Guy will forward this brief to Claude; return the review for Codex to address.
Inspect `git diff 50d3a0d9 2efc5ca7 -- src prisma scripts/deploy-qa-clean.mjs .github`
against this committed review tip, not the old root worktree and not your old
`06699403`/`771120ed` base. Read `CODEX_AUDIT_REMEDIATION_20260922.md` for the
claimed evidence and explicit open gates. **Challenge those claims**; do not
take green tests as proof that the changed contract is correct.

## Highest-value challenges

1. Are independently rendered admin pages and the outbox fail-closed before
   data reads? Try anonymous, non-admin and valid administrator. Does the layout
   mask a data read even when the page appears safe?
2. Can checkout bypass either caller/draft quota or contact the provider after
   rejection? Distributed limits are explicitly still open.
3. Can an unrelated owner, revoked/wrong-game link or known game id forge events?
   Does a real shared player still send its capability, including sendBeacon?
   Are tokens ever persisted/logged? Do all actual store event shapes pass?
4. Does the preload change ever open without the real child/background? Prove a
   hung optional resource does not block, while a hung essential resource does.
   Consider a scene switch, decode failure and mounted-image gate.
5. Does photo preprocessing failure actually restore usable controls? Test a
   rejected/throwing browser decoder/canvas rather than only reading the try block.
6. Does `APP_URL` select the correct CDN without forwarding QA credentials to an
   untrusted/request-selected URL? Verify production without QA cookies; retain
   pinned hash/MIME/size/no-redirect defenses.
7. Are Prisma 6 URL parameters appropriate for the deployed pooler? Are schema,
   escaped credentials and stricter limits preserved? Do not confuse a client
   timeout/watchdog with server-side cancellation or a proved cron root cause.
   Can notification/retention work still exceed the budget? Return precise gaps.
8. CI must work from a clean clone, without private files or paid keys. Examine
   Linux compatibility and source drift checks. Does the deploy guard really
   refuse wrong-project/dirty releases and expose the correct commit?
9. Check index migration coverage and safety. No live schema application is
   claimed; avoid running the SQL against a real database in this review.
10. Check 320/360/390/1440 widths, both locales: real control rectangles must be
   inside the viewport, not merely hidden by overflow rules. Keep the existing
   visual design of the landing/game/passport.

## Reproduction commands

```text
npm run typecheck
npx vitest run src/app/admin/__tests__/page-auth.test.ts src/app/api/play/progress/route.test.ts src/app/create/__tests__/checkout-action.test.ts
npx vitest run src/app/api/jobs/tick/route.test.ts src/infra/db/__tests__/runtime-url.test.ts src/services/generation/__tests__/collection-art.test.ts
npx vitest run src/game/__tests__/find-any-real-viewport.test.tsx src/game/engine/__tests__/telemetry.test.ts
npm run check -- --maxWorkers=4
npm run scenes:validate
npm run adventures:validate
```

Do not share a `.next` directory or regenerate Prisma while somebody else's
server is running. Coordinate/isolate before any build/browser test.

## Return format

Return findings ordered by severity with exact file/line, observed defect,
reproduction and smallest corrective action. State what you actually executed
versus inspected, identify blocked checks, and finish with one verdict:
**ready for QA**, **ready with explicit non-blocking caveats**, or **not ready**.
Mention remaining release gates, but do not duplicate them as newly introduced
regressions. Do not return an approval without independently checking the patch.
