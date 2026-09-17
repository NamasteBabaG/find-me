# Shared game / passport guest navigation

## Scope

A recipient of `/play/<token>` stays in the game, its map and its local
passport. The parent-area shortcut is now passed only after the existing
server-side session/owner comparison succeeds. Signing in as a different
parent does not enable it. The owner's account-backed passport is unchanged.

Invalid, revoked and not-ready player links no longer offer a homepage exit.
The read-only `/passport#<token>` brand is a label, not a homepage link.
Both shared route branches now have a small retry-in-place error boundary,
instead of the site's fallback with family/home links and payment instructions.
Only the safe error digest is displayed; raw exception text is not exposed.

This is navigation isolation, **not** a browser kiosk or a new authorization
boundary. A visitor can still type another URL. Existing account checks,
capabilities, share expiry/revocation, asset checks and the QA gate remain intact.
External recipients in QA still need QA access. No environment or schema change,
no paid generation, no modification to real family progress or shares.

## Verification

- Before the fix: 8 new regression assertions failed on the existing parent/home
  exits; the owner-preservation case passed.
- After: `npm run check -- --maxWorkers=4` passed: 250 files, 3344 tests passed,
  2 expected failures and 35 skipped. No unexpected failure; TypeScript passed.
- Regression coverage: anonymous and signed-in non-owner, owner, invalid,
  revoked, not-ready, missing config, shared passport loading/view/error,
  retry-in-place on both shared route error boundaries.
- React review: no new data fetches, client-side permission checks, dependencies
  or effects. Navigation authorization remains on the server. Native retry
  buttons and translated Hebrew/English copy.
- Real Chromium in an isolated guest session, localhost:3034, with a NEW
  disposable SQLite fixture and fictional public beach assets. Added local
  player/passport capabilities to the reusable smoke-fixture script.
- Opened gift -> map -> beach; found all three child appearances with native
  pointer input; completion ceremony -> passport -> return to the same board.
- Collected the star-mould discovery; after browser reload: all 3 finds and the
  1 discovery persisted, with replay available. No `/api/play/album` or
  `/api/passport` account requests from the guest player's session.
- No outbound anchors in gift/map/player/passport. Mobile passport at 390x844:
  zero horizontal/vertical page overflow. Browser error list empty.
- Separate read-only passport loaded via its capability, opened its book and
  displayed memories/discoveries without play/edit/account/home links.
- Screenshots in ignored `output/passport/guest-*.png`; no private child assets
  or login material added to Git.

## Release boundary

Deploy only to `find-me-qa` (`prj_LbqCRqwU8WfZpeaWU7HTXM4SsfG4`). Do not exempt
shared routes from the QA gate. The preceding QA application is `a07bc191`
at https://find-me-4k6jd6otw-smallheroes-projects.vercel.app and can be restored
without a migration. Deployment receipt follows after live verification.

## QA receipt

- Application commit `d26fb24a`, pushed and deployed from a clean release tree.
- `find-me-qa`, READY: `dpl_HytrsFyR8ZiMd8mTEgbRQTJ8Gumw`.
- Immutable: https://find-me-csnnu2o0z-smallheroes-projects.vercel.app
- Promoted and explicitly aliased to https://qa.findmeworlds.com; CLI inspection
  confirms the new deployment. This is the QA project's production target,
  not the product's production shop.
- Remote Next.js 15.5.25 build passed in about two minutes. Privacy/trace audit:
  no private leaks or problems; reported function size 177.64 MB.
- Live Chrome with existing QA access: invalid player link has only its
  explanatory message, no home link. Shared passport without a capability has
  the unavailable message and retry, with a non-link brand and no site exits.
- Anonymous HEAD still returns 307 to `/qa-access`, private/no-store, noindex.
- Error-level deployment logs, final 15-minute window: no matching logs.
  This is a bounded smoke check; monitoring/drains were not changed or audited.
- Full guest gameplay was verified on the isolated fictional fixture described
  above, not by creating or mutating a live personal game.
