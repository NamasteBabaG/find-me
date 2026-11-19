# Launch plan — from "the engine works" to "pay me, go" (2026-11-19)

The goal is a state where a parent pays, uploads a photo, closes the browser, and gets a playable 27/27 world by email without anyone touching it.

- **Owner:** Claude drives the whole track.
- **Engine changes:** these ride a **new Kingdom version (v6)**, so every existing pin, game and Journey world stays byte-identical. Claude implements on `claude/kingdom-v6-launch-20261119` (from `55aa9783`). Codex reviews, runs CI and releases to QA, as usual.
- **Not repeated here:** the findings themselves are in Codex's `work/qa-claude-engine-finish-review-20261119/CLAUDE-REVIEW.md`.

## Guy's budget decision (2026-11-19)

| Spend for one world | What happens |
|---|---|
| up to $4 | target; nothing is blocked at $4 |
| above $5 | **Guy gets an alert** (email) once per world; the world keeps going |
| $7 | hard ceiling: the world stops, the order is **refunded automatically**, and the parent is told |

- The reservation rules stay unchanged. Every UNKNOWN is counted in full, and nothing is released on silence.
- Only the ceiling moves: from 4.0 to 7.0, pinned per new v6 world.

## T1 — Engine v6 (Claude implements, Codex reviews and releases)

| # | Change | Closes |
|---|---|---|
| 1 | v6 pin: $7 ceiling, $5 alert, $7 stop with refund and parent notice | P1-6 |
| 2 | Unreadable completed review: one re-ask on the same pixels, then a repaint inside the hide's attempts. Never park while attempts and budget remain. The stop names its cause. | P0-1 |
| 3 | Neighbor reader v3: metadata-only doubt is a note, not "unresolved". `invalid-registration` plus a reported defect becomes a repair, not a freeze. | P0-1 |
| 4 | Provider waits: Sol 429 at create waits and retries under a new key (backoff up to about 6 h). Image interruptions are admitted by budget, not by "attempt 1 / 2 hides". | P0-2 |
| 5 | Cron: fair selection (next-run time, not oldest-paid). Backoff and a named park for a world that keeps throwing. The pending ready mail goes out on the next tick. The stale alert works from progress, not from claims. | P0-3, P1-7 |
| 6 | Self-repair over budget becomes a proper budget park. The orphan image closer works for Sunburst. | P1-4, P1-5 |

Every change gets a local failure-injection test, with mock providers at no cost.

## T2 — Payments (PayMe)

- `src/infra/payment/payme.ts` is a skeleton today. Implement checkout, webhook signature verification and refund against PayMe's documented API.
- **Needs from Guy:** a PayMe merchant account (sandbox first, then live). Guy puts the keys into Vercel himself; Claude never sees them.
- **Test:** a sandbox payment on QA leads to PAID via the webhook only, and a refund comes back.

## T3 — Production enablement

- The local-patch/Kingdom engine runs only when `APP_ENV=qa` (64 checks in 43 files). Production needs, at minimum:
  - the tester-only spend guard replaced by "any paid order";
  - the daily spend ceiling;
  - the cron on;
  - production env, storage and DB;
  - the legal pages;
  - an operator alert address.
- One reviewed change, not a scatter of flag flips. Production is not unpaused as it is today.

## T4 — Qualification on QA (paid; needs Guy's explicit OK on the amount)

- Turn the QA cron on (tester-only).
- Run five fresh v6 worlds with different tester photos and ages (including 5–6). The /creating page stays closed, and nobody intervenes.
- Expected cost: about $3.40 each, at most $7 each.
- **Pass:**
  - at least 4 of 5 reach DELIVERED with no manual action;
  - every stop is a named state with an alert;
  - no world takes over 3 h;
  - no UNKNOWN is left at the end;
  - every picture is checked at play scale.

## T5 — Launch

- Deploy production with PayMe live.
- Watch the first real orders through the alerts.
- The $5 alert and the $7 refund are the safety net.
