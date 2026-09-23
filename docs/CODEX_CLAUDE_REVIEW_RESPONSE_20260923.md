# Response to Claude's independent review

Review: `CLAUDE_REVIEW_FINDINGS_20260922.md`, baseline `2efc5ca7`.
His verdict is **ready for QA with explicit caveats**, not production approval.

| Finding | Disposition |
| --- | --- |
| F1 CI environment | Mock application variables moved to build step only. Regression asserts test stages do not inherit them. Production-invariants targeted suite passes. Remote CI still needs a real run. |
| F2 unpushed release | Guard refreshes `find-me` remote refs and requires HEAD on a remote branch; reports those branches. Synthetic local-remote test rejects dirty/untracked, modified, wrong-project and unpushed states; permits pushed detached snapshots. |
| F3 promoted art origin | DEPLOY.md explicitly requires promotion and hash verification before rendering new collection art. Remote availability/hash errors name the validated public origin, never credentials. |
| F4 telemetry | Malformed published config now returns 400 without recording events. Repeated authorization/parse cost remains an optimization item; no permission cache added that could delay link revocation. |
| F5 uploader copy | Separate preprocessing catch uses localized unreadable-photo copy; network failure keeps network copy. Real-component jsdom probes for draw/encode/network failure all pass and release busy state. |
| F6 watchdog | Observation only; no claimed root-cause fix or cancellation guarantee. Live 504 alerting remains open. |
| F7 DB limits | Retained. Real pooler concurrency and alert routing remain open. |
| F8 indexes | Non-transactional execution requirement documented in DEPLOY.md. No live migration performed. |
| F9 quotas | Cross-instance quotas AND draft-creation quotas remain open. |
| F10 late decorative layer | Retained non-blocking decorative loads; optional fade/grace is deferred. Essential child pixels remain gated. |
| F11 admin login shell | Kept intentionally; no protected data in login-shell response. |

New tests: `release-tooling.test.ts`, `preprocessing.test.tsx`, malformed-config
case in progress route. Targeted review tests: 52 passing after the jsdom
scrollIntoView shim correction. Full final gate/build/deploy must be recorded
separately; neither the interrupted long-duration run nor Claude's older build
is evidence that this latest tree was released.

The board-presentation work is a separate commit and scope; see
`BOARD_PRESENTATION_REFRESH_20260923.md`. Claude's supplied report is preserved
without edits. No credentials, actual payments, private child pictures or paid
renders were used for this follow-up.
