# QA launch/art recheck follow-up release — 28 September 2026

## Candidate and scope

- Candidate: `12028c17bd1c9939a2ad7dd971b3b012b6a35fd3`, pushed to
  `find-me/codex/independent-worlds-20260918`.
- Clean detached source: `work/qa-recheck-release-20260928`.
- Dedicated target: `find-me-qa`, project
  `prj_LbqCRqwU8WfZpeaWU7HTXM4SsfG4`, team
  `team_2bLUDGyHayGB1UHIvcCBgyWh`. Configured domains are only
  `qa.findmeworlds.com` and `find-me-qa.vercel.app`, both verified.
- Scope: active-page-only image errors, short English tile fallback, normal
  QA sign-in recovery without extending the 24-hour gate session, and corrected
  offline wider-crop geometry. No generation recipe, approved image, database
  schema or catalogue activation changes.
- Source response and independent challenge brief:
  `CODEX_LAUNCH_ART_RECHECK_RESPONSE_20260928.md`.

## Gates

- Local full gate: 276 files, 3,540 passed, two expected failures, 35 skipped;
  exit 0. Targeted four suites: 95/95. TypeScript and both validators passed.
- Local production build/privacy passed with no private leaks or problems.
- Browser verification used normal QA form entry on an isolated local server,
  synthetic local-only credentials, mock providers and a disposable database.
  See the response document for viewport, failure, focus and recovery evidence.
- Clean deployment guard refreshed remote refs and confirmed the exact pushed
  candidate and dedicated QA project.
- GitHub CI: <https://github.com/NamasteBabaG/find-me/actions/runs/36377617926>.
  SUCCESS on the exact candidate, completed 2026-09-28 04:37:09 UTC. Linux
  check: 276 files / 3,540 passed / two expected failures / 35 skipped. Both
  validators, production build/private-asset audit and source-drift gate passed.
  Actual logs confirm creation of the disposable `ci.db` and empty
  `privateLeaks` / `problems` arrays.

## Deployment verification

- Previous QA: `0202f89702d850efa2790ccff6edc7b5c2bf7e10`, READY deployment
  `dpl_96j8NnrCSwtWWvDJexshWY6EGtuT`, verified before release.
- New deployment: `dpl_9v4FLqBL3gBXmFneuEAR8QfDLWNn`,
  <https://find-me-jqn5lj93o-smallheroes-projects.vercel.app>, created
  2026-09-28 04:40:29 UTC. Guard deployed a clean pushed snapshot with
  `--skip-domain`; domain promotion was a separate verified step.
- Remote build completed at 04:41:44 UTC. Its logs show the new status route,
  `privateLeaks: []` and `problems: []`. The first readiness assertion refused
  promotion while finalization was still pending; no promotion occurred until
  a fresh REST response proved READY and both commit metadata fields matched.
- Promoted only `find-me-qa`. Alias API now binds `qa.findmeworlds.com` to the
  new deployment and QA project. REST lookup by that alias is READY and returns
  both `releaseCommit` and `gitCommitSha` exactly equal to the candidate.
- Anonymous live checks: root 307 to `/qa-access?next=%2F`; new status endpoint
  401 JSON `QA_ACCESS_REQUIRED`, private/no-store; health 401; gate page 200
  HTML. No authentication bypass, invented session or authenticated game
  acceptance is claimed. Public production was not promoted.

## Acceptance limits / Claude handoff

Independently challenge the exact candidate SHA, not the previous reviewed
`690c2d29`. Verify CI, deployment identity and privacy evidence before calling
this release live. Exercise missing/expired/forged gate cookies, normal new-tab
sign-in and return to the same open reader; expiry must not be extended. A
network failure, generic 401 or 503 must not be mislabeled as QA sign-in expiry.
Check navigation away/back during image failure and pending checks, no
owner/shared private-image prefetch, Hebrew/English short laptop and phone
controls, and the wider-crop geometry recomputation.

F-A remains OPEN. Geometry still rejects hide 2; no new placement or art is
approved. No paid image calls, image replacements or public production changes.
The suggested reference-image experiment remains unperformed. Authenticated
live image MIME/hash/timing and real game acceptance still require normal QA
entry; a local stale-session reproduction does not prove the original live
incident's root cause. Other launch dependencies remain in the workstream.
