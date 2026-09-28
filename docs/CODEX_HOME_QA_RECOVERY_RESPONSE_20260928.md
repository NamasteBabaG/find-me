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

QA now runs runtime `5f0f8759`, deployment `dpl_8ycF2sZufgoGddwJ3ie5QgCZhpvk`.
Clean guard, CI attempt 2, remote build/privacy, READY, exact commit metadata
and post-promotion alias were verified. See `QA_HOME_RECOVERY_RELEASE_20260928.md`.
Public production untouched; authenticated live acceptance still not claimed.

### Remote CI follow-up

Candidate `5f0f8759bf8d112d94049ec29a460786a3497fef` is pushed. CI run
`36385279674` attempt 1 passed all 277 test files and both validators, then
failed during Next's Google-font compilation, before privacy/source-drift
gates. Stack: Google loader line 122 dereferences the extension-regex match
of a font-file URL; the match was null. The CI log does not retain the failing
URL or upstream CSS, so a transient upstream response is a hypothesis, not
a proven cause. No application font/source change was made.

A read-only local probe through the installed Next CSS-fetch/parser helpers
against the same Rubik/Fredoka weight requests returned six and three unique
font URLs respectively, all matching the loader's extension rule. The local
build had already passed. One bounded rerun of the failed CI job was requested
on the unchanged candidate. Attempt 2 PASSED, completed 06:43:57 UTC:
277 files, 3,549 passed, both validators, disposable DB initialization,
production build/privacy (`privateLeaks: []`, `problems: []`) and source-drift
gate. No font/source change or third retry. The first failure's exact upstream
response remains unknown; recurrence warrants deterministic font-delivery
investigation rather than repeated retries.

## Claude handoff / remaining gates

Challenge released SHA `5f0f8759bf8d112d94049ec29a460786a3497fef`. Check one shared probe for
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
