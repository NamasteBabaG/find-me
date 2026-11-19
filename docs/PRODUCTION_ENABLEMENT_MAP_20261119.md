# Production enablement map: what a real Kingdom v6 order crosses (2026-11-19)

This is a read-only trace of `claude/kingdom-v6-launch-20261119`, done with an agent's help. **No gate has been opened.** Check each line again when the reviewed enablement change is written. Line numbers drift.

## Summary

Today a real production Kingdom order never reaches the v6 engine:

1. **Startup refuses v6.** `env.ts:203` makes `env()` throw when `KINGDOM_GENERATION_RELEASE` is not v1 outside QA. With the default v1, a world would be pinned to the $4 policy, with no refund outcome.
2. **Payments refuse to start.** With purchasing on, `env.ts:246` calls `paymentReadiness`, and the remaining `PAYME_QUALIFICATION_GAPS` throw.
3. **The root gate is the draft engine.** `create-flow.service.ts:296` gives a non-QA draft no style version, so it is born on the legacy collage engine. No local-patch, Sunburst, lean or Kingdom pin is ever written.
4. **Each v6 piece is then QA-only on its own:** the pins, the Sunburst painter, the $7 ceiling, the spend permission, the identity stage, the budget chain and the orphan-image closer.

## Category (a): must open for the v6 path, in this order

Everything else in the ~160 checks (86 files) is a QA or operator tool and should stay QA-only: completion grants, repairs, crowns, prop joins, review-existing and restore modes, the QA cost panel, the QA gate itself.

| # | Where | What it decides today in production |
|---|---|---|
| 1 | `src/lib/env.ts:203` | v6 can't be selected outside QA |
| 2 | `container.ts:106` → `domain/generation/detectives-operational-policy.ts:26` | no Detectives operational release, so Kingdom is filtered out |
| 3 | `container.ts:158` | no dual-review v3 pin, so the lean pin and enrollment refuse |
| 4 | `container.ts:166` | no Sunburst painter for new drafts, so the Kingdom pin returns early |
| 5 | `create-flow.service.ts:296`, then `:330` | the draft engine (root gate), and the Detectives scene-13 offers |
| 6 | `lean-release.ts:57`, `painter-release.ts:45`, `identity-source-release.ts:16`, `source-family-scope.ts:51` | the draft pins throw outside QA |
| 7 | `detectives-operational-policy` (services `:37`), `kingdom-generation-release.ts:100` | the checkout seal and the v6 pin |
| 8 | `local-patch-spend-pause.ts:25` | every local-patch world parks as "spend-paused" indefinitely |
| 9 | `pipeline.ts:105` | the local-patch identity stage returns silently |
| 10 | `board-conditioned-wizard.ts:134` | throws for every hide, review and self-repair |
| 11 | `board-wizard-identity-lifecycle.ts:28` | the identity sheet can't be bought, and the world is held |
| 12 | `kingdom-generation-release.ts:122` | there is no $7 ceiling outside QA |
| 13 | `board-wizard-budget-extension.ts:45` | **throws** at the end of the budget chain, so every audit and reservation throws. It must return null (or be skipped for Kingdom) outside QA. |
| 14 | `local-patch-pending-image.ts:54` | the v6 orphan-painting closer never runs |

**Unclear (c), decide from how QA actually ran v6:**
- `identity-reason-recovery.ts:25` (an automatic cron wake);
- `local-patch-player-review.ts:36`;
- the status route `:110` / `:186` (the parent's "budget held" signal and the identity-hold marker);
- `lean-release.ts:101`.

## Product questions for the enablement change

- **How is v6 chosen in production?** Today `KINGDOM_GENERATION_RELEASE` selects it (`kingdom-generation-release.ts:53`). Proposal: a new Kingdom draft in production is always v6 once the launch switch is on.
- **Several qualifiers combine "qa" with release flags in one function.** These are `painter-release.ts:45`, `lean-release.ts:57`, the detectives operational policy `:26` and `qa-world-budget-policy.ts:7`. Dropping only the APP_ENV term would also change Journey and Explorers, which has not been traced.
- **What does "the owner may spend" mean in production** (`local-patch-spend-pause.ts:25`)? Proposal: any paid, unrefunded order, under the daily ceiling and the $7 world ceiling.

## Non-APP_ENV prerequisites

- **Payments:**
  - a PayMe sandbox run;
  - the remaining `PAYME_QUALIFICATION_GAPS`;
  - `PURCHASING_ENABLED=on`.
  - The checkout no longer refuses PayMe: it declares `checkoutRetryLeavesUnreachableSale`, the hosted-page retry contract.
- **Configuration:**
  - `STORAGE_PROVIDER=db`;
  - `GENERATION_PROVIDER=openai`, `GENERATION_MODEL=gpt-image-2`, `GENERATION_QUALITY=medium`;
  - the OpenAI and Anthropic keys;
  - `LOCAL_PATCH_PROMPT_RELEASE=v19`, `LOCAL_PATCH_IDENTITY_SOURCE=full-source-v1`;
  - `LOCAL_PATCH_VISUAL_REVIEW=dual-high-v3`, `LOCAL_PATCH_LEAN=lean-v1`, `LOCAL_PATCH_PAINTER=sunburst-v1`;
  - `SEARCH_LEVEL_CHOICE=on`;
  - `CRON_SECRET` and the production cron;
  - Resend email.
- **Production database and storage.** See the 2026-10-02 full review: raw SQL ignores the qa schema, and images live in Postgres. Production stays paused until these are settled.
- **Not traced:**
  - whether Kingdom is listed as a legacy collage world in production (`purchasableWorlds` depends on the active scenes in the database);
  - the health route's production view;
  - the quality-batch sweeps.
