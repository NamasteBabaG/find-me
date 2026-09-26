# QA release receipt — recheck fixes — 2026-09-26

- Released code: `6b38de99d2681c30f01958a5aa3b1c5a81f63600` on `codex/independent-worlds-20260918`, pushed to `find-me`.
- Target: dedicated `find-me-qa` project `prj_LbqCRqwU8WfZpeaWU7HTXM4SsfG4`; **not the public production storefront**.
- Clean detached checkout: `work/qa-recheck-fixes-release-20260926`; deploy guard refreshed the remote and verified the clean, pushed SHA before upload. Implementation worktree's pre-existing `next-env.d.ts`, unrelated untracked report and `tmp/` were not included.
- Deployment: `dpl_UpC95RDp4bt8dBtbusYE9dwmNPEc`, READY.
- URL: https://find-me-fidrq056j-smallheroes-projects.vercel.app
- Promoted alias: https://qa.findmeworlds.com — verified using `/v4/aliases/qa.findmeworlds.com` after promotion.
- `/v13/deployments/...` through authenticated CLI returned both `meta.releaseCommit` and `meta.gitCommitSha` equal to the released SHA. No claim that the connector exposes these fields.
- Build: 31 static pages; function size 181.11 MB; private-asset audit `privateLeaks: []`, `problems: []`.
- GitHub CI run [36263914900](https://github.com/NamasteBabaG/find-me/actions/runs/36263914900): success. 267 suites / 3,458 passed / 2 expected fail / 35 skipped; both content validators, production build, privacy audit and generated-source drift check passed.
- Browser: 16 viewport/language combinations passed after real local collection and find interactions. Zero dialog scroll and page overflow; visible actions >=48px (primary 64px), all button text inside its target; final-board return reaches the map. English uses deliberately long six-item names. Actual screenshots inspected, including 1280×600 and 360×640. Local evidence: `output/passport/short-viewports/`.
- Initial post-promotion error-log query (10 minutes, this deployment): no matching logs. This is not evidence of live gameplay traffic.
- Unauthenticated `HEAD /api/health` returns 401 at the QA gate. Live authenticated game/health/database checks were **not** completed in this pass. Protection was not bypassed or disabled.

## Scope and next review

See `CODEX_BOARD_PAINT_RECHECK_RESPONSE_20260926.md` for the complete response and independent Claude brief. F-B/C/D are addressed; F-A stays OPEN. No real-provider v12 sample, bulk rendering, existing-asset replacement, or QA database migration was performed. Awaiting the separately requested three-hide sample approval.

This receipt is committed after the released source; its documentation-only SHA is not the running application SHA.
