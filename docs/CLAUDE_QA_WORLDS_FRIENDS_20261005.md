# Claude QA brief — owner worlds, continuation and friends

Review the current source in this checkout independently and read-only. The human explicitly requested your QA diagnosis and recommendations. Challenge the implementation rather than accepting the author's claims. Do not edit files, run commands, contact providers, open customer data, or read .env*, .vercel, work/, output/, databases, logs or credentials. Read only repository source, synthetic tests, prisma schema/changes, and docs. No third-world creation or difficulty pilot in this assignment.

## Authorized product work

1. A persistent owner world selector on the map, including single-world games. Owned worlds appear first; a neutral illustrated preview leads to the parent purchase area without revealing personalized boards. Historical games keep their frozen configs and replay progress.
3. Continue the same child's passport into another authored world. Current pricing is 39 ILS first world, 30 ILS subsequent worlds. Only a verified PAID webhook starts generation. Preserve the selected child/world/age and return context. Multiple tabs, provider timeout and retries must not cause a duplicate checkout, charge, draft or game. A fresh photo is required here because the approved identity binds to a world-specific style atlas; do not weaken that contract to claim reuse.
4. Parent-controlled friends invitations to one frozen, already generated nine-board world. Friends have distinct anonymous participant IDs and independent progress. No login, email, age, free text or chat. Fixed optional nickname presets; same preset does not merge participants. Current participant can resume; another participant starts from zero while earlier results remain. Owner reports distinguish unvisited from playable-board visit with zero finds. Updates become seen only when the report cards were actually viewed. One optional fixed postcard after all target finds; discoveries stay optional. Invitation expiry 30 days, results removed 90 days after earlier revocation or natural expiry. Rotation/revocation must also block subsequent private media reads. Assets already downloaded cannot be recalled, stated in parent copy.

Difficulty calibration is deliberately deferred for the parent's return. Existing age/body/style/judge contracts, autonomous repairs, all 27 hides, and $5 per-world limit remain unchanged. Production/payment activation is outside this QA release.

## Source to inspect

- src/domain/{family-worlds,world-purchase,guest-sharing}.ts
- src/services/{family-worlds,world-purchase,world-purchase-checkout,guest-sharing,order,family,retention,adventure-album}.service.ts
- src/app/api/friends/**; src/app/api/family/worlds/**; src/app/api/assets/[assetId]/route.ts
- src/app/family/[childId]/**; src/app/friends/**; checkout/create continuation changes
- src/ui/friends/**; src/game/components/{OwnerWorldSelector,GameShell,ScenePlayer,AdventurePassport,PassportCompletion,WorldMap}*
- src/game/engine/{friend-progress,album-storage,progress-storage,round-storage}.ts; src/game/store/play-store.ts
- prisma/schema.prisma, prisma/changes/20261005-friends-world-purchases.sql, scripts/qa-friends-world-migrate.mjs
- Related synthetic unit/integration tests and src/i18n/dictionaries/world-features.ts

## Challenge checklist

- Find a real failure path for same-device sibling switching, stale tabs, offline reload, newer local find during an in-flight acknowledgement, corrupt local cache and canceled navigation.
- Check UI feedback, focus/Escape/back, minimum 64px child targets, mobile RTL, reduced motion, no store/payment inside scenes and short child copy.
- Check checkout idempotency and payment status/price authority, unsupported real adapter safety, expired-session return context and age locking.
- Try source-level guest authorization bypasses: foreign participant, other world/game, PRIVATE/IDENTITY assets, legacy normal signatures, refunds, source config repair, revoked/expired grant, deletion racing writes, future seen revision and unseen report rows.
- Check schema-qualified PostgreSQL, additive migrations, server-only RLS/grants, lifecycle cleanup and retained owner results.
- Distinguish a proven defect from speculation; give severity, file/line, trigger, consequence, and smallest repair. Review tests skeptically.

Return a concise evidence-backed report with concrete blockers first, then worthwhile improvements, and a prioritized continuation plan. State your validation limits. Do not claim browser or live PostgreSQL testing from reading tests. If there are no blockers, say so explicitly with the remaining limitations. A separate design brief will follow only after functional issues are addressed.

## Follow-up review after your first report

Please independently recheck the current sources against your first findings B1–B3 and M1–M4. Do not assume these repairs are correct:

- B1: draft mutations take a game write fence and reject any pending dispatched payment attempt (including an expired non-null claim, since provider acknowledgement remains uncertain). Photo intake claims PHOTO_VALIDATING before external work. See draft-checkout-lock.ts, create-flow.service.ts, family.service.ts and world-purchase tests.
- B2: child-wide checkout serialization and sibling pending-attempt checks; repricing is allowed only before the provider was ever dispatched. Once dispatched, retry preserves the provider key and amount. Check simultaneous different-world checkout and late PAID webhook behaviour.
- B3: safe parent sign-in return target preserves explicit game/child/world/age/return context through family login and magic-link action; external paths and redirect loops are refused.
- M1/M2: stale invitations report inactive and can be replaced while old results remain; unsupported historical world controls are filtered by server-side eligibility.
- M3/M4: first saved reaction wins; a permanent progress rejection reloads server truth and rebases valid local events. Switching players must drain the current outbox before replacing the participant cookie; saving/offline controls stay disabled and failure keeps the current identity. Examine the new component and engine regression tests for misleading mocks.
- Canceled world navigation keeps the history marker until route replacement commits.

The author also used a disposable local SQLite fixture with synthetic geometric assets and no provider calls for real-browser checks. This is not a PostgreSQL concurrency proof or a new generation-quality pilot. QA received only the additive server-only table migration; existing game-content fingerprints were unchanged. Ask for further evidence where source review cannot settle a concern. All read-only restrictions above still apply.

## Final review focus after the second report

Recheck X1 and I1–I3, I5–I7 against current code. The payment team added ordinary durable claims and is implementing confirmed provider closure; inspect the final files rather than accepting that description. Unknown attempts must never be released only because of elapsed time. A FAILED event does not establish that a provider session is terminal. Check abandoned mock checkout → confirmed close → another world, late PAID after close, closure racing a paid webhook, duplicate paid orders, stale parent tabs, and immutable unknown keys/prices.

Return fallbacks now point to an existing child page; expired session/token recovery preserves only validated local context. The friends engine restores valid parts of an outbox, bounds repeated permanent rejections with an explicit reopen state, and receives a non-authorizing localStorage participant-change signal so an old tab stops accepting finds. Nine-board engine tests now use the real domain merge as their server instead of simply echoing submitted JSON.

I4 product interpretation: “seen” means the report's relevant cards were actually viewed in an authorized family session, including through the child's owner passport. This is intentionally not a separate parent-only notification inbox. No guest can open or acknowledge owner reports. Flag misleading copy or a privacy bypass, but do not add an unapproved parental gate to every report view.

The author has additionally checked actual QA PostgreSQL catalog metadata against the strict migration assertion: 33 columns, 12 indexes, 3 primary keys and 5 foreign keys passed. That evidence establishes deployed schema shape, not concurrent Prisma service behavior. Browser checks established native magic-link login, a single-world selector, switching to the second owned world, a 30 ILS continuation with frozen age/context, a real playable guest visit with zero finds, and separate results for two guests with the same nickname. Navigation cancellation timing and PostgreSQL service concurrency remain distinct evidence gaps; do not fabricate them. State which gaps block a QA release and which are requirements before production.
