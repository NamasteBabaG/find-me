# QA release and independent recheck brief — 23 September 2026

## Released evidence

- Branch: `codex/independent-worlds-20260918`.
- Released source: `f673f8a703b3ecababdc86e85f556b484f0dfcf6` (pushed before deployment).
- Public presentation commit: `4611782e`; independent-review follow-up: `f673f8a7`.
- Clean detached checkout: `work/qa-audit-release-20260923`. Deploy guard refreshed remote refs and accepted the pushed, clean snapshot.
- GitHub quality run: https://github.com/NamasteBabaG/find-me/actions/runs/35821386472 — success.
- Actual gate: 266 test files passed; 3439 tests passed, 2 expected failures, 35 skipped. Scene/adventure validators, production build/private-asset audit and generated-source drift check passed.
- Vercel project: **find-me-qa**, `prj_LbqCRqwU8WfZpeaWU7HTXM4SsfG4`.
- Deployment: `dpl_J7CnQPgLTJNDkyiwk7N4W25amusy`, READY.
- Deployment URL: https://find-me-a3bu90k0d-smallheroes-projects.vercel.app
- Remote build: `privateLeaks: []`, `problems: []`; inspected function size 181.11 MB.
- Built with `--skip-domain`, inspected, then promoted. Vercel alias API independently confirmed `qa.findmeworlds.com` points to this exact deployment and QA project.
- Store production was not deployed. No live schema changes, paid renders, real payments or credential changes in this release.

## Browser verification

On the promoted https://qa.findmeworlds.com/ home page, independently inspected both world carousel states: all 9 journey and all 9 kingdom image elements loaded successfully from the new `/home/boards/<hash>.webp` assets. Updated six-discovery labels were present for each board. Viewed the images on the actual page; no horizontal overflow or captured console errors in this smoke check.

Earlier local checks covered desktop and 390px mobile presentation. The wizard cover props and presentation hash/privacy boundaries have automated coverage; this release did not repeat a live purchase or paid-generation end-to-end run.

Browser navigation to `/api/health` was blocked by the browser client. Therefore this release does **not** claim a fresh live database health probe. Alias and release identity were verified independently through Vercel, and the live home rendered successfully.

## Brief for Claude — challenge independently, do not deploy

Review the released SHA above, not the current dirty implementation workspace or your older `2efc5ca7` baseline. Read your preserved `CLAUDE_REVIEW_FINDINGS_20260922.md`, our `CODEX_CLAUDE_REVIEW_RESPONSE_20260923.md`, and `BOARD_PRESENTATION_REFRESH_20260923.md`.

1. Reproduce F1 using the actual workflow environment: invariant tests must not inherit the build-only mock settings. Challenge the now-green remote CI rather than relying solely on the new text regression test.
2. Challenge F2: wrong project, tracked dirt, untracked source, unpushed HEAD, stale remote refs, and a clean pushed detached snapshot. Do not trigger real deployments in refusal tests.
3. Challenge F4/F5: malformed published configuration returns 400 with no event writes; local image decoding/encoding errors show unreadable-photo copy and release busy state without a fetch; actual transport failure keeps network copy.
4. Verify all 18 approved board thumbnails AND the six per-board discovery labels in both languages. Check home carousel, wizard covers, asset provenance/hash and mobile layout.
5. Confirm we have not rewritten existing personal games/postcards with a new background behind old child placement or item coordinates. These remain pinned to the actual game configuration. The fictional beach demo/animated hero/passport demo deliberately remain one coherent example.
6. Verify public presentation does not silently activate a different paid generation catalog. Distinguish presentation refresh, existing two-world pilot and paid catalog activation in your report.
7. Recheck privacy/build artifact sizes and the actual QA alias. If authenticated QA access permits, perform a read-only health probe and real-game smoke check without new paid generation.
8. Report findings by severity, reproduction and proposed fix. Mark untested paths explicitly. Do not mark production approved from mock tests or from this QA release.

## Still open / not smuggled into 'done'

Claude F6/F7 operational alerting and real pooler-load validation; F9 distributed and draft-creation quotas; F4 repeated authorization cost; F10 optional decorative pop-in. Concurrent-index deployment is documented but not executed. See the response matrix for the exact disposition of all F1–F11.

Broader launch work remains separate: payment/refund-provider gates, production schema/credentials/domain state, legal/consent, and the international price decision/versioning. Prices were **not changed** by this release. This is QA approval only, not a public-store launch.
