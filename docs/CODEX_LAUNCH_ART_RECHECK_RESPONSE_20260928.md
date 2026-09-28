# Response to Claude's launch/art recheck — 28 September 2026

## Review identity and scope

Completed `CLAUDE_LAUNCH_AND_ART_RECHECK_20260928.md` reviews `690c2d29`,
not the older checkpoint. Its final sections, reviewed SHA and stable file
size/mtime were checked; the owner subsequently supplied the completed report.
Claude's untracked report and unrelated `next-env.d.ts` are not part of this
change. QA still runs `0202f897` until a separately verified release.

## Findings reproduced and corrected

- **N-1:** a new component regression failed on the existing reader: failures
  from page 1 left both retry controls and its warning on locked page 2.
  Failures remain keyed by URL, but presentation now intersects them with the
  active page's actual photo/collected discoveries (or open photo picker).
  Decorative turning leaves do not create a warning on the next page. Returning
  to the failed page restores controls until its pictures load.
- **N-2:** the English tile fallback is now `No picture`, not the long
  `Picture unavailable`. Hebrew stays unchanged. No layout shrinking.
- **N-3:** local normal QA form login, deletion of its gate cookie while home
  remained open, and opening the book reproduced failed pictures. A dedicated
  read-only `/api/qa-access/status` distinguishes `401 QA_ACCESS_REQUIRED`
  from image/network/config failure. It independently verifies the same signed
  gate cookie, has no DB access, returns 204 only with valid QA entry, 503 for
  bad QA configuration and 404 outside QA. It neither creates nor extends a
  session, and middleware continues protecting every asset.
  The demo alone checks this endpoint on visible image failure, at most one
  request in flight with a five-second timeout; no polling or private media
  prefetch. Confirmed denial replaces retry with a normal sign-in link in a
  new tab. Returning focus after login rechecks access and remounts images
  without losing the page, stamp or discoveries. Network failures do not
  masquerade as session expiry.
  **Deliberate difference from the proposal:** retain the documented 24-hour
  security lifetime, rather than silently making it indefinite. Do not inspect
  manual redirect status for authentication: browser Fetch may return an opaque
  redirect with status 0, not 307. The explicit protected response avoids that.
- **T-1:** independently recomputed the wider crop's actual return boundary.
  A pure helper now computes each crop's mask + guard, yielding
  `1160,1368,630,630`; required context is 800 px wide. Regression tests cover
  both original/wider boxes, zero guard and rejected invalid inputs. Existing
  private input/source/shipping hashes bind unchanged; audit remains read-only
  and `geometryClear:false`. No placement was approved.

## Local verification

- Targeted reader, QA login/guards and geometry: **95/95 passed**.
- TypeScript: passed. Offline retained-evidence audit: passed execution, with
  both current and hypothetical geometry correctly rejected.
- Browser: isolated local QA-mode server, synthetic local-only gate password,
  mock providers, generation off. Normal login form, no minted login bypass.
  English 1366x650: cookie deletion gives the explicit sign-in note, both links
  at least 48px; sign-in in the new tab and return to the SAME open reader
  loads all three images, removes warning/links and retains place 1/stamp.
  Hebrew 360x640 and 1366x650: generic image failure and gate expiry distinguish
  correctly; photo control 48x48, toolbar 48x56 on phone; zero horizontal
  overflow. Moving to locked page 2 clears controls and restores page status.
  Tile notes fit 65px laptop and 78px phone boxes without content overflow.
  English 360x640 generic failures also measured zero overflow, 48x48 recovery
  and `No picture` fitting both 78px keepsake tiles. Screenshots inspected.
- Local screenshot evidence stays in `tmp/launch-recheck-*.png`. Initial CLI
  clicks during smooth scrolling missed; measured replay used instant scroll
  first. Wildcard interception was corrected to the full local image URL.
- Disposable local DB initialization via Prisma CLI returned an empty schema
  engine error; initialized only that SQLite fixture using the repository's
  checked test schema. The first home load's missing-table warning preceded
  that correction. No deployment or customer DB was involved.
- Full `npm run check -- --maxWorkers=2`: **276 files, 3,540 passed**, two
  expected failures, 35 skipped; exit 0, 695.03 seconds. Log
  `tmp/launch-recheck-check-20260928.log`.
- `npm run build`, mock providers/generation off/disposable SQLite: exit 0,
  build and trace/privacy audit passed, `privateLeaks: []`, `problems: []`.
  Log `tmp/launch-recheck-build-20260928.log`. Local QA server/browser closed.
  Pre-existing development `next-env.d.ts` reference restored, not staged.
- Remote CI and QA release pending: local green is not deployment evidence.
- Both scene and adventure validators passed; `git diff --check` passed.

## Still open / next Claude challenge

F-A remains OPEN. No paid calls, images edited, approved assets replaced,
catalogues activated, or public production changed. The identity-reference
experiment is a plausible hypothesis, not a demonstrated root cause; it needs
the owner's approval of the exact portrait and bounded purchase before running.
Hide 2 still needs protected arch/neighbor geometry before rendering.

An authenticated live image MIME/hash/timing probe still requires normal QA
sign-in. The local expiry mechanism is proven; the original live incident's
cause remains inferred, not observed in that user's session.

Claude: challenge this exact follow-up commit in an isolated checkout. Test
missing/expired/forged QA cookies against middleware and direct status handler;
normal new-tab login must restore the original reader without any cookie
extension. Test network errors and 503 as NOT auth expiry; navigate away and
back during failures and pending checks; confirm no owner/shared prefetch.
Check Hebrew/English short laptop and phone typography and touch targets.
Recompute wider-context bounds, rerun gates, and report what was not tested.
Do not certify F-A, purchase images or activate either new-art world.
