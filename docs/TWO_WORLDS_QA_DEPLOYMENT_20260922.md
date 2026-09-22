# Two-world QA publication — 2026-09-22

## Published revision

- Code/content commit: `3c730675`.
- Integrated release: `fc5f0a7ecaa167fc26e8846f2271fa6a7d4d8a0c`.
- Claude QA port merged; existing newer passport crop-fit/mobile rules retained.
  Package pricing and the remaining handoff/test updates are included.
- Branch pushed to `find-me/codex/independent-worlds-20260918`.
- Deployment: `dpl_BJMo3M41ZyoJ2f6aHCYS4RMnU8Yc`, READY, promoted to
  `https://qa.findmeworlds.com` on the dedicated `find-me-qa` project.
- Deployment source: clean detached worktree `work/qa-two-worlds-release-20260922`.
  No private files, temporary output or local build directories were uploaded.
- This note is a receipt; it does not change the deployed application revision.

## Verification

- `npm run check`: 256 files, 3,390 passed, 2 expected-fail, 35 skipped;
  no unexpected failures; TypeScript passed.
- Remote production build passed; private build-trace audit has no private files
  and no leaks. Dedicated QA uses Vercel's production deployment target; this
  does **not** deploy the customer production project.
- `scenes:validate` and `adventures:validate` passed (existing scale warnings
  concern the separate older catalog).
- New isolated mock-paid game: `game_two_worlds_bar_qa_20260922_v1`.
- Database verification: DELIVERED, 2 worlds, 18 scenes all QA_OK, 55 READY
  private assets (54 child patches and avatar). 54 hides and 108 discoveries.
- Every private blob's length, MIME and SHA-256 were verified against the
  reviewed source before atomic publication. A transient connector failure was
  resumed using current byte lengths and idempotent chunks, not overwritten.
- No existing game, owner progress, customer payment, catalog entitlement or
  production data was modified. No new paid rendering was performed.

## Remaining live acceptance

The complete local UI walkthrough and owner/guest/replay/passport evidence are
recorded in `TWO_WORLDS_BAR_RELEASE_20260922.md`.

The final live browser check is **not yet complete**: the in-app browser is at
the normal QA password gate, and the user was asked to sign in there. No gate
bypass or auth weakening was introduced. Once signed in, use the isolated
owner's normal one-use sign-in (`two-worlds-qa-transfer.ts signin-sql`) and the
library's existing player-link flow; then verify the shared game and passport.
Do not commit login links, tokens, cookies or personalized image files.

The new content is published as the complete reviewed QA pilot. Activating it
as the paid wizard's general catalog is a separate release decision; this
publication does not silently change what an existing purchase contains.
