# Passport review fixes and QA handoff — 17 September 2026

Base: Claude `980ca39b`, incorporating Codex `00368e48`. Release worktree:
`work/qa-passport-release-20260917`, branch `codex/passport-qa-20260917`.
The existing developer worktrees and their servers were not changed.

## Findings resolved

- Existing paid games receive an owner-fenced FamilyChild link. Backfill and lazy
  repair use a deterministic **per-game** ID; names/photos never merge siblings.
  The completion endpoint also repairs the link before resolving the passport.
- Added the PostgreSQL DDL/backfill, isolated to `qa` during rollout. No game
  config, render, payment, status or progress is rewritten. Older app code remains
  compatible; application rollback does not require destructive schema rollback.
- Shares have random 256-bit capabilities, stored as SHA-256 hashes, and expire
  after 30 days. Rotating SESSION_SECRET does not invalidate their media IDs.
- Deleting any adventure revokes that child's passport link. A future purchase
  cannot revive it. Revocation happens before engine-specific cleanup and inside
  album deletion too. The parent-facing copy explains the policy.
- The capability URL is shown only at issuance. Reload preserves active status
  and the disable action; replacing a lost link requires preview and consent.
- A legacy non-3/6 game is omitted from the current passport, rather than breaking
  the child's valid chapters. Its family adventure entry remains available.
- Family reconciliation is outside the committed payment transaction. A failed
  reconciliation cannot roll back money, payment events or the paid game state.
- Repeated world titles receive numbered suffixes, preserving separate purchases.

## Additional measured layout fix

Claude's zero page-overflow measurement did not detect content clipped *inside*
the book. The desktop actions and mobile second keepsake row could be hidden.
The desktop photo now yields to its leaf, and short-view typography/photo sizing
keeps all six keepsakes within the paper. Book/cover dimensions and animation
remain unchanged. No wizard changes.

Browser: Chromium, HE/RTL and EN/LTR, fictional public beach fixture. At 360×640,
360×740, 390×844 and 1366×768: zero horizontal/vertical page overflow with the
parent panel collapsed; all six collected items inside the page. Also checked
1254×620 EN: zero overflow. Adult preview intentionally expands below the book.
Opening and page navigation were exercised. Real iOS/Safari not tested.

## Verification

- Full `npm run check -- --maxWorkers=4`: 246 files, 3331 passed, 2 expected-fail,
  35 skipped; zero unexpected failures. Additional new sharing-UI regression and
  book interaction tests: 11/11 passed. Full build typecheck includes that test.
- Real SQLite tests cover family repair, paid event fault injection, expiry,
  rotation, session-secret rotation, privacy and deletion/non-reactivation.
- `scenes:validate` and `adventures:validate`: passed.
- `npm run build`: passed, including board trace/privacy audit: no private leaks,
  missing assets or catalog problems.
- Browser sharing: fresh parent login → preview → consent → issue → reload
  (active with no recoverable URL) → confirm disable. Shared endpoint changed from
  200 to 404. No real child's passport was shared.

## QA schema receipt

Supabase project `vvqjmaubdjndmjvcfxve`, schema **qa only**. PostgreSQL migration
`qa_passport_family_and_expiring_shares`, applied through the authenticated
connector after a transaction/rollback dry run. The same SQL lives in
`prisma/changes/20260917-passport.sql`. A repeated run rolled back successfully
to verify idempotence.

- 15 games retained; 14 eligible paid games linked; 14 family children; 0 shares.
- Protected-game-field fingerprint before and after:
  `fc7529d85720f19e27a948930fea921d`.
- All three new tables have RLS enabled and no anon/authenticated SELECT grants.
  They are server-owned Prisma tables, not direct browser Data API tables.
- Advisors reported only informational RLS-without-policy notices, expected for
  deliberately server-only tables. See the [Supabase explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- No passport tables were added to `public`; no production shop deployment.

Vercel project secrets are marked sensitive and cannot be pulled. Therefore the
QA build uses the existing remote secret store, not invented/local credentials.
The optional guarded migration runner requires a real PostgreSQL client and an
authorized QA connection; the live migration above was verified via the connector,
not by claiming the CLI runner had credentials it did not have.

## Scope not closed by this work

Provider refund concurrency, PayMe readiness and the broader production-release
PostgreSQL gate are unchanged. This QA passport migration is not a certification
of those unrelated paths. No paid render, real payment or email was triggered.
