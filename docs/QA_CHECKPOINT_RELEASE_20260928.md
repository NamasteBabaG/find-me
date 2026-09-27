# QA checkpoint release — 28 September 2026

## Candidate and gates

- Candidate: `0202f89702d850efa2790ccff6edc7b5c2bf7e10`, pushed to
  `find-me/codex/independent-worlds-20260918`.
- Detached source snapshot:
  `work/qa-checkpoint-release-20260928`. The deployment guard refreshed remote
  refs and returned `clean: true` for the dedicated QA project.
- Local quality evidence: `CODEX_CLAUDE_CHECKPOINT_RESPONSE_20260928.md`.
- GitHub run: <https://github.com/NamasteBabaG/find-me/actions/runs/36351599984>.
  **Passed**, exact candidate SHA. Linux gate: 274 files, 3,496 passed, two
  expected failures, 35 skipped. Both validators, build and source-drift check
  passed. Build log proves `ci.db` was created and schema synchronized before
  building; `privateLeaks: []` and `problems: []`.

## Scope

Passport public-demo prewarm, bounded image recovery, accessible retry controls,
compact failure notices, and truthful world/art availability presentation.
Experimental art modules remain script/test-only. No generation prompt,
catalogue activation, approved game asset or database schema changes in this
release. Source diff against the previous QA release was inspected.

## Deployment verification

- Before release, REST API proved QA deployment
  `dpl_UpC95RDp4bt8dBtbusYE9dwmNPEc` was READY with both `releaseCommit` and
  `gitCommitSha` equal to `6b38de99d2681c30f01958a5aa3b1c5a81f63600`.
- Project `prj_LbqCRqwU8WfZpeaWU7HTXM4SsfG4` is `find-me-qa`; its configured
  domains are `qa.findmeworlds.com` and `find-me-qa.vercel.app`. Neither the apex
  public site nor www belongs to this promotion target.
- CLI inspect's formatted JSON omits meta; REST deployment metadata does expose
  the commit fields. This resolves the earlier evidence limitation without
  bypassing application authentication.
- New deployment: `dpl_96j8NnrCSwtWWvDJexshWY6EGtuT`,
  <https://find-me-gd7lc6n7h-smallheroes-projects.vercel.app>, **READY**.
  Created 2026-09-27 21:38:23 UTC. Remote build completed in approximately one
  minute; remote privacy audit `privateLeaks: []`, `problems: []`.
- Promoted only within `find-me-qa`. Afterwards the alias API explicitly binds
  `qa.findmeworlds.com` to that deployment and the QA project. REST lookup by
  alias returns `releaseCommit` and `gitCommitSha` equal to the candidate SHA.
  No public production project was promoted.
- CLI's packaged function summary: 181.11 MB for the inspected representative
  functions (not a fresh measurement of every route or runtime memory).
- Post-promotion anonymous HTTP: `/` returns 307 to `/qa-access?next=%2F`,
  `/api/health` returns 401, `/qa-access` returns 200 HTML. Authentication
  remains enforced. No authenticated health/game result is claimed.
- First five-minute deployment-specific log queries returned zero error-level
  rows and zero 5xx rows (limit 20, both queries successful). Low-traffic initial
  observation only, not a reliability/load acceptance test.
- Configuration key presence was checked, including the QA gate credential.
  Values are marked sensitive/non-decryptable through the API. Empty API values
  were not treated as unset deployment values; nothing was changed or exported
  to a local environment file. Build logs confirm mock payments; other provider
  and database runtime health await authenticated diagnostics.

## Acceptance limits / Claude handoff

Independently verify the exact candidate SHA, GitHub build's disposable SQLite
initialization, remote build privacy audit, deployment metadata and alias.
Challenge failed-image recovery at phone/short-laptop widths in both languages,
and verify the old catalogue is honestly distinguished from the new-art preview.

Live passport image MIME/hash/timing and real QA game acceptance require normal
QA sign-in. No application session has been invented or bypassed. The art gate
F-A remains open; this release does not authorize bulk rendering, enable the
two-world paid catalogue, or establish public launch readiness. See the launch
workstream for remaining dependencies and third-world/product decisions.
