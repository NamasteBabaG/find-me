# QA home recovery release — 28 September 2026

## Candidate and gates

- Runtime candidate: `5f0f8759bf8d112d94049ec29a460786a3497fef`.
- Scope: Claude I-4, normal QA sign-in recovery for home static art, game demo,
  passport and transformation examples. No gate lifetime/authentication, art,
  catalogue, schema, payments or generation changes.
- Local full gate: 277 files, 3,549 passed, two expected failures, 35 skipped.
  Both validators and production build/privacy passed. Browser evidence and
  the small-phone duplicate-note overlap caveat are in
  `CODEX_HOME_QA_RECOVERY_RESPONSE_20260928.md`.
- CI run `36385279674`, attempt 2: SUCCESS on exact candidate, completed
  2026-09-28 06:43:57 UTC. Full tests, both validators, disposable SQLite build,
  private-asset audit and source-drift passed. Actual logs show 3,549 passed,
  `privateLeaks: []`, `problems: []`. Attempt 1's font URL parsing failure is
  retained in the response document; the unchanged rerun passed.
- Reused free clean detached snapshot `work/qa-recheck-release-20260928`,
  advanced from `12028c17` to the candidate after clean status and no active
  Node process referenced that path. No worktree files were discarded.
- Guard refreshed remote refs, confirmed clean pushed source and dedicated
  project `prj_LbqCRqwU8WfZpeaWU7HTXM4SsfG4` / team
  `team_2bLUDGyHayGB1UHIvcCBgyWh`. Project domains verified as only
  `qa.findmeworlds.com` and `find-me-qa.vercel.app`.

## Deployment

Candidate `dpl_8ycF2sZufgoGddwJ3ie5QgCZhpvk`,
<https://find-me-mpxa8fuyh-smallheroes-projects.vercel.app>, uploaded with
`--skip-domain`. Build started 06:46:35 UTC; privacy audit passed at
06:48:10 UTC (`privateLeaks: []`, `problems: []`), build completed 06:48:15 UTC.
Waited through output finalization until REST returned READY, dedicated QA
project, and both `releaseCommit` / `gitCommitSha` exactly matching candidate.
Only then promoted `find-me-qa`, replacing previous QA `12028c17` /
`dpl_9v4FLqBL3gBXmFneuEAR8QfDLWNn`.

After promotion, independent alias API and deployment-by-domain REST lookups
both bind `qa.findmeworlds.com` to the new deployment, READY, exact candidate
in both metadata fields, and dedicated QA project. Anonymous live checks:
root 307 to normal QA sign-in; status 401 JSON `QA_ACCESS_REQUIRED`; health
401; sign-in page 200 HTML. Responses remain private/no-store. No invented
session or gate bypass. Public production has not been promoted. No claim
of authenticated live gameplay or a production observability acceptance scan.

## Independent challenge / limits

Claude: review this exact candidate, not only `12028c17`. Independently verify
CI, alias/source identity, recovery after normal new-tab sign-in, shared probe
deduplication, generic-network failures not mistaken for auth expiry, retained
finds/reader state and removed transformation fallback recovery. Check QA-off
and owner/shared readers remain inert. Review the disclosed mobile overlap.
Report actual tested viewports/browsers and what remains untested.

No authenticated live game or image MIME/hash/timing acceptance yet. Do not
infer it from anonymous gate checks or deployment readiness. F-A remains OPEN;
no paid identity-reference experiment, new placement or approved image
replacement. This is not launch or mass-rendering approval.
