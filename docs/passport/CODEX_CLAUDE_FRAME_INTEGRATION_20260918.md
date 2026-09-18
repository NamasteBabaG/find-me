# Claude passport frame integration — 18 September 2026

## Scope

Integrated the design deltas of `a15bccd3` and `28a1cea1` onto our existing
`e49edacd` passport integration. Not a wholesale branch merge: `525e5ab5` changes
package prices and is outside the design handoff; it has NOT been taken.

- Balanced memory/keepsakes halves on mobile; the print grows in its allotted space.
- Real photo/action separation: 16px desktop, 8px phone.
- Removed the visible enlargement caption; retained button name, title and zoom cursor.
- Preserved our shared responsive stamp, no mirrored reverse, guest isolation,
  owner authorization, stored cursor and finale integration.
- Browser verification exposed another problem: a short grid row let an image
  retain its intrinsic height behind overflow clipping. A zero-minimum grid row,
  zero-minimum image and `object-fit: contain` now keep the entire memory visible.
- Guest images compose authorized board/sprite pixels rather than using the owner
  media endpoint. Container-relative sizing now fits that entire composition to
  the same frame. No change to the sprite coordinates or its occlusion.

## Evidence

- Full check: 252 files; 3,357 passed, 2 expected-fail, 35 skipped; no unexpected
  failures; TypeScript passed. 379.59 seconds.
- Focused passport/book/finale tests: 31 passed, including two new language cases
  for an accessible, caption-free enlargement button and working dialog.
- Disposable SQLite fixture with fictional public-demo assets only. Mock providers,
  generation off. No real child data or account progress changed; no paid calls.
- Owner passport in English and Hebrew at 1440x900, 1366x768, 390x844, 360x740,
  360x640: no document overflow or leaf overflow, six keepsakes stay on paper.
  Rotated stamp/action clearance 3.86–4.64px. Accessible image loaded via owner API.
- Photo enlargement, discovery details and next-page navigation exercised.
- Independent guest session: gift → map → board → three real pointer finds →
  completion dialog → passport. Five viewport sizes: no internal reader overflow,
  composited photo fits inside its frame, no outbound account/home links.
- The first local fixture start used the wrong storage env name; corrected to
  `STORAGE_LOCAL_DIR` and repeated the image checks. This was a test harness setup
  error, not a claim of an application image-service regression.
- Screenshots under ignored `output/passport/integration-*`. No credentials or
  personal output committed. Real Safari/device-touch not tested in this pass.

## QA deployment receipt

- Application commit `fddc7bc354861c6c82d0917494788d4da2e4adb7`, branch
  `codex/independent-worlds-20260918`, pushed with a clean worktree.
- QA-only project `find-me-qa` / `prj_LbqCRqwU8WfZpeaWU7HTXM4SsfG4`.
  CLI production target refers to that QA project's slot, not customer production.
- Deployment `dpl_Hu3qmp4XcPwJVMGqF8YbKzabuQda`, created 2026-09-18 13:27:49
  Asia/Jerusalem. Ready, promoted and verified by inspecting the QA alias.
- Immutable URL: <https://find-me-7rq2nelj9-smallheroes-projects.vercel.app>.
  User URL: <https://qa.findmeworlds.com>.
- Remote Next 15.5.25 build passed, with type checking, 31 static pages and
  privacy/tracing audit passing; no private leaks. Inspected function 177.64MB.
- QA anonymous navigation still reaches the normal access gate. Both the fresh
  automation browser and the existing in-app browser require sign-in. The QA
  password is unavailable from local/pulled sensitive environment exports, so
  post-login LIVE UI smoke is pending user sign-in; do not label it completed.
  No password reset, credential change, bypass or gate removal was attempted.
- Exact-deployment error-log scan, last 15 minutes, returned no matching logs.
  This is a limited observation, not an authenticated end-to-end live test.
- No environment settings, schema or real child assets were changed.
- Rollback: `dpl_Dt7bVgpzgjsMqy9pPbdxiZHViZ7Z` / `e49edacd`.
