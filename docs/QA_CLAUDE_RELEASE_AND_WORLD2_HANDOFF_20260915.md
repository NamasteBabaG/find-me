# Claude QA release and clean world-two foundation — 2026-09-15

## Released to QA only

- Source: `7c5c4c9b5626579abe3bf0970f7626fb8f07d5a0`, Claude's reviewed design/service/test work including the cost evidence document.
- Clean release checkout: `work/qa-claude-integration-20260915`, branch `codex/qa-claude-integration-20260915`.
- Project: `find-me-qa` / `prj_LbqCRqwU8WfZpeaWU7HTXM4SsfG4`.
- Deployment: `dpl_8yexNUjK9ohfR4nJvoZCUHoFEwZh`, READY.
- Deployment URL: https://find-me-3izu8w3n8-smallheroes-projects.vercel.app
- QA URL: https://qa.findmeworlds.com — resolved by `vercel inspect` to this deployment after promotion.
- Deployment metadata `releaseCommit` and `gitCommitSha` match the source. `APP_COMMIT=7c5c4c9` was provided for build/runtime.
- Built remotely with existing sensitive project settings; no environment secrets or budget settings were replaced. Sensitive env values are not downloadable, so the empty local pull was NOT used for a prebuilt deployment.
- No database schema changes, migrations, new paid render calls, catalog activation, or shop deployment.

## Verification

- Fresh isolated `npm ci --ignore-scripts`: lockfile Vitest 4.1.11, zero audit vulnerabilities reported.
- SQLite client generated for local tests. Full `npm run check -- --maxWorkers=4`: 235 files, 3261 passed, 2 expected failures, 35 skipped; no unexpected failures.
- `scenes:validate` and `adventures:validate` passed. Planned content remains planned; validation is not commercial activation.
- Remote production build used the PostgreSQL Prisma schema/client and passed Next build, type checking, private trace filtering and board catalog tracing audit.
- Unauthenticated QA home redirects to the access gate; health API returns 401.
- Existing authorized Chrome session still works: new name/age wizard, library with draft status, existing Sydney game with previous progress. No existing draft was submitted and no existing game target was clicked.
- Mobile demo at 390px: no positive horizontal overflow, compact controls, discovery tray opens and lists all six items and rarity labels. Viewport reset afterwards. No fresh personal generation/payment E2E performed.
- Authenticated health JSON could not be opened by the browser (ERR_BLOCKED_BY_CLIENT); this is NOT reported as a successful health endpoint check. Library and existing game loaded successfully against the live backend.

## Clean continuation

- Continue in `work/independent-worlds-pilot-20260915`, branch `codex/independent-worlds-pilot-20260915`.
- Merge `ce1b606` combines existing opt-in pilot `1e1013b` with Claude `7c5c4c9`.
- Only textual merge conflict: the duplicate CAS regression test. Kept Claude's manual Prisma delegate swap/restore; production fix was already identical.
- Both dictionaries merged by key; no whole-file replacement. Pilot-specific copy and logic remain present.
- Full merged check with Vitest 4.1.11, two workers: 236 files, 3275 passed, 2 expected failures, 35 skipped, no unexpected failures.
- This pilot merge is local, NOT the code deployed to QA in this release. Existing games were not opted into the independent-world policy.
- Root checkout remains dirty and was not modified. Claude's checkout was not modified. Use the explicit clean continuation path, not the root.

## Remaining gates (not declared closed)

- External-provider refund idempotency/claim, PayMe release, and PostgreSQL race/isolation verification.
- Wizard currently says worlds are played in order; reconcile that wording when independent-world selection is activated. Catalog package order is not necessarily a gameplay unlock dependency.
- Castle board first, visual approval before further boards. No paid call until the user approves an explicit spend ceiling, including base art and retries. Claude's historical hide costs omit base-board cost and are not themselves authorization.
- Existing documents: `INDEPENDENT_WORLDS_PILOT_V02.md`, `MAGIC_CASTLE_GATE_BRIEF_20260915.md`, `CLAUDE_FIRST_BOARD_COST_EVIDENCE_2026-09-15.md`.
