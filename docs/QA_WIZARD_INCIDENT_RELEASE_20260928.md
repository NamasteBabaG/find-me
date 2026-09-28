# QA wizard incident release — 28 September 2026

## Verified release

- Runtime: `ad0892c54b0afb8b015f7fedd6b48b4cfcf555dd`.
- CI `36436983835`: SUCCESS, completed 2026-09-28T14:46:56Z.
- Local gate: 277 files, 3,551 passed, 2 expected failures, 35 skipped;
  both validators and disposable-SQLite production build/privacy passed.
- Clean detached release checkout: `work/qa-recheck-release-20260928`.
- Clean deployment guard refreshed remote proof before QA deployment.
- Deployment: `dpl_CDvbisdWZF6fPXguvCJeJrjKDqCj`.
- URL: `https://find-me-ot5qwyok7-smallheroes-projects.vercel.app`.
- Dedicated QA project: `prj_LbqCRqwU8WfZpeaWU7HTXM4SsfG4`.
- Remote build compiled at 14:58:41Z; privateLeaks/problems were empty at
  14:59:36Z; build completed at 14:59:41Z. Private build log retained under
  `tmp/wizard-incident-remote-build-20260928.log`.
- READY and exact releaseCommit/gitCommitSha verified before separate QA-only
  promotion. After promotion, both alias API and deployment-by-domain REST
  returned this deployment and commit for `qa.findmeworlds.com`.
- Anonymous probes: root 307, QA status 401 JSON, health 401 JSON, gate 200 HTML.

Public production was not promoted. This is not authenticated end-to-end
acceptance and does not resolve the failed generation.

## Scope and limits

Photo success now reads the persisted draft through a fresh document GET;
four wizard components no longer prefetch guarded future steps before writes.
Saved-photo resume respects nextHref. Rejected admin images use contain and
offer a full-image link. The original blank-checkout cause remains unproven;
the owner's draft was not resubmitted. No generation recipe or state changed.

## Independent review handoff

Review this exact runtime, not the older 12028c17 review. Challenge photo
success, paid-photo resume, guarded-step navigation and full-image inspection
with a synthetic draft. Do not submit the owner's draft or purchase images.
Keep wizard mitigation separate from terminal generation recovery. See
`CODEX_QA_GENERATION_INCIDENT_20260928.md` for retained-byte diagnosis and the
private review gallery; no rejected attempt is approved by this release.
