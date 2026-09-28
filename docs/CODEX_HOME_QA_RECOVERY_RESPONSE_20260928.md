# Home-wide QA recovery — 28 September 2026

## Review provenance and scope

Claude's completed `CLAUDE_QA_RECHECK_RELEASE_REVIEW_20260928.md` reviews
runtime `12028c17`. It was stable at 10,759 bytes, modification time 08:09:50
Israel, when read after 08:38. SHA-256:
`a00a9cc5a8331fe0c032ba41306c076bf43cf9e23c0e780041cf964a369fa1d9`.
This is NOT the older review of `690c2d29`. Claude independently accepted the
previous QA release, with no blocking code finding, and retained F-A as open.

This follow-up addresses I-4: the same expired gate affects other public home
images and the game decoder, but only the passport previously explained how
to sign in again. I-1 through I-3 describe limits of the previous recovery;
there is no claim that standalone readers now retain a denied check across
arbitrary navigation. No authentication/session policy is changed.

## Implementation

- QA-only home boundary shares one failure-triggered, five-second-bounded
  status check across same-origin DOM image failures and the off-DOM game
  decoder. No periodic polling, session extension or speculative downloads.
- A confirmed `401 QA_ACCESS_REQUIRED` exposes normal new-tab sign-in. Network
  failure, unrelated 401, 404 and 503 do not masquerade as session expiry.
- Returning after normal sign-in retries only failed mounted images and
  notifies failed game/passport/transformation components. Children stay
  mounted, retaining reader/game state. Removed portrait fallbacks remount;
  the transformation composition waits for both layers again.
- Outside the enabled QA-home boundary the new provider is inert. Private
  owner/shared readers retain their existing behavior, not a page-wide probe.
  Standalone demo passport recovery remains available outside this context.

## Reproduction and browser evidence

Local QA-mode server only, synthetic local password, mock providers, generation
off and the existing disposable SQLite review fixture. All entry used the
normal password form; no live QA session, private photos or customer DB used.

- Static hero/board failures after cookie deletion triggered one shared check.
  Normal sign-in in a second tab and return restored widths 720/3840 and
  removed the note, without reloading the original home page.
- Real ScenePlayer decoder failure was induced by aborting the exact public
  demo base URL. With a valid gate it showed ordinary retry, not sign-in.
  Cookie deletion plus focus changed it to sign-in; removing interception,
  normal second-tab login and return recovered the 3840px board.
- Hebrew transformation portrait/patch failures: removed portrait and hidden
  composition before sign-in; on return, 1024px portrait and 512px patch,
  composition visible, note gone. Uncached image probes used query suffixes;
  these are controlled diagnostics, not a claim of observing natural expiry
  on the live deployment.
- Screenshots inspected: English desktop and 360x640, Hebrew 360x640,
  English game fallback 1366x650. Zero horizontal overflow in measured phone
  states; global sign-in links 48px high, game sign-in 64px high. No browser
  JS errors or framework error overlay recorded.
- Layout caveat: on the English 360x640 game fallback, the fixed global note
  partially overlaps the duplicate inline sign-in button. The global 48px
  action remains fully visible and operable. Desktop actions do not overlap.
  This is a QA-only presentation limitation, not claimed perfect layout.
- Evidence remains private/untracked under `tmp/home-qa-*.png`. Browser and
  local server were closed after probes. No live-game acceptance claimed.

## Gates and release status

Initial full run: 276 files passed, one homepage-order test failed because
the disabled provider unnecessarily called the i18n hook. Fixed by separating
the active provider; targeted homepage/provider tests then passed 9/9.
Transformation/provider targeted tests after recovery coverage: 16/16.
Final full run: **277 files, 3,549 passed, two expected failures, 35 skipped**;
exit 0, 521.12 seconds. TypeScript passed in the same command. Log:
`tmp/home-qa-recovery-check-final-20260928.log`.
Both content validators passed (existing advisory warnings retained).

The first build attempt stopped at Prisma DLL regeneration with Windows EPERM
while the full test process held that DLL. It did not reach Next build. Retry
after tests release the engine, not a passing build claim. The final
`npm run build` then passed, exit 0, with mock providers/generation off and the
disposable SQLite fixture. Trace/privacy audit: `privateLeaks: []`,
`problems: []`. Log: `tmp/home-qa-recovery-build-final-20260928.log`.
`git diff --check` passed. No generated source changes were introduced.

QA remains runtime `12028c17`, deployment `dpl_9v4FLqBL3gBXmFneuEAR8QfDLWNn`.
No follow-up release yet. Public production untouched.

## Claude handoff / remaining gates

Challenge the exact follow-up SHA once committed. Check one shared probe for
simultaneous static, decoder and passport failures; genuine network failure
must not announce auth expiry. Sign in normally in another tab, return without
reloading, and verify images recover without losing finds/page/discoveries.
Include removed portrait fallback and two-layer transformation, home QA-off,
private owner/shared routes, navigation during pending checks and mobile note
overlap. Check CI and release identity independently; local proof is not live
authenticated acceptance.

F-A remains OPEN. No art/placement, purchase, catalogue activation, schema or
production changes. Exact portrait/one bounded identity-reference experiment
still awaits owner approval. Live image MIME/hash/timing and real game
acceptance still require normal QA sign-in. Third-world theme, legal/operator
details, payment integration and coordinated credential rotation remain
separate launch dependencies.
