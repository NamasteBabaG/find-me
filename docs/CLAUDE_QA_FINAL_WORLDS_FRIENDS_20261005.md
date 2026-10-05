# Final targeted Claude QA — worlds and friends

The human requested your automatic independent QA. Review current repository source and synthetic tests read-only. Do not edit, run commands, access providers, or read .env*, .vercel, work/, output/, databases, credentials, customer photos or logs. No difficulty pilot, third world or production/payment activation. Return findings here, not a plan-file write.

Prior independent source reviews covered owner world selection, same-child continuation, independent guests, private media, reports and retention. B1–B3 and M1–M4 were repaired and re-reviewed. The remaining blocker was X1: an abandoned payment never closed and blocked the child forever. The author also found and repaired a corresponding first-purchase dispatch race.

Challenge the final repair; do not trust this description. Start with:

- src/services/{checkout-close,world-purchase-checkout,order,draft-checkout-lock}.service.ts (draft-checkout-lock.ts has no .service suffix)
- src/infra/payment/{types,mock}.ts; src/app/checkout/**; src/app/api/checkout/** if present
- src/services/__tests__/{world-purchase,payment-checkout-reconciliation,checkout-photo-ownership}.test.ts and any new checkout-close tests
- src/app/create/actions.ts; src/domain/world-purchase.ts; src/lib/safe-redirect.ts; auth magic-link recovery
- src/game/engine/friend-progress.ts and tests; src/ui/friends/FriendPlay.tsx and tests
- Relevant public privacy/terms copy and bilingual src/i18n/dictionaries/world-features.ts

The intended invariants are:

1. Both first and continuation checkout durably fence the exact draft/photo and provider attempt before dispatch. Unknown acknowledgement never permits a new key or price. FAILED is not assumed terminal. Provider time elapsed alone never releases an attempt.
2. A parent can finish or safely close an earlier payment. Only confirmed terminal-unpaid provider closure clears the blocking state. Mock Cancel uses this flow and an old mock payment page cannot later pay after confirmed close. Closed/deleted historical draft rows must have an owner recovery path without resurrection or asset exposure.
3. Closure racing verified PAID cannot erase money or start generation without a paid webhook. A genuine late provider payment is preserved, and a second paid order for the same game is durably flagged without restarting generation or double counting success.
4. Abandon → close → another world works. Same-child pricing remains server-authoritative (39 then30 ILS); sibling checkout cannot charge two first-world prices concurrently.
5. Safe login/recovery preserves explicit child/world/game/age/return context. Return fallbacks exist. Open redirects and ownership bypasses remain refused.
6. Friends retain valid pending events when rebasing a damaged cache; repeated permanent rejection is bounded with explicit reopen feedback. Non-authorizing participant-change signals stop old-tab play, while cookie/server checks remain authoritative. Starting another participant waits for acknowledged progress and a successful fresh inspection, then opens the nickname chooser directly. Inspection/save failure keeps the current game/identity intact.

“Seen” is deliberately a viewed-card state in an authorized family session, including the child's owner passport; it is not a separate parent-only notification inbox. Guest access to owner reports is forbidden.

Evidence already obtained by the author: real local-browser native login, one/two-world navigation, 30 ILS continuation and frozen age/context, playable guest visit with zero finds, separate results for identical nicknames, and actual QA PostgreSQL schema metadata (33 columns,12 indexes,3 PKs,5 FKs). Browser art/data were disposable synthetic/public fixtures; no image provider was called. These are not a real PostgreSQL service-concurrency proof, a phone-back-gesture trace, or a child difficulty/usability pilot. Existing engine age/style/judge/all27/$5 rules remain untouched.

Report proven remaining blockers first, with trigger, file/line, consequence and smallest sound repair. Separate evidence gaps from proven defects; say which prevent QA release and which must be settled before production. Do not recommend ignoring uncertain provider sessions by age. Do not repeat already fixed issues without checking the current implementation. If no source-level blocker remains, state that plainly with the validation limits and next overall-plan steps.
