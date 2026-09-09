# Claude — ביקורת מלאה של מסלול יצירת משחק ב־QA

## המנדט של גיא

Codex מבצע; אתה בודק ומבקר באופן עצמאי. בדוק את **המסלול האמיתי של משתמש שמעלה תמונה חדשה ב־QA**, לא רק פרוב מקומי או גלריה של יובל. חפש פגמים בכל הגבולות, ואל תסתפק בכך שבדיקות יחידה ירוקות. המטרה: תשעה בורדים, שלושה מקומות קבועים בכל בורד, ילד/ה מזוהים שמשתלבים בסגנון, גיל, גודל, פוזה, לבוש ותאורה מקומית.

**עדכון מגיא לאחר כתיבת הבריף:** הוא אישר ש־Codex ישלים את התיקון, יבצע איתך ביקורת עצמאית, ואז ייצור משחק בדיקה חדש לבר בן5 מהתמונה של המשחק שנעצר, כדי שיוכל לשחק בבוקר. היעד נשאר עד$4 לריצה החדשה, כולל כל שלביה. הריצה הישנה והחיוב הלא־פתור שלה נשמרים בנפרד ולא נמחקים. תפקידך כרגע ביקורת לקריאה בלבד: אל תחדש ריצה, תקנה תמונות או תשנה נתונים בעצמך. לאחר הביקורת Codex יטפל בממצאים ויבצע את הריצה המאושרת. אין צורך להמציא מחדש את מנוע המיקום.

## Incident and evidence, not assumptions

- QA game `game_d1f82bfqptb33vojg7nu` was started by Guy with a different child's photo. He rejected its photographic-looking identity avatar and requested a stop.
- Its recorded stop is `Game.MANUAL_REVIEW`, job `DONE`, `boardWizard.state=held`. No model call may be dispatched by reloading `/creating`, a direct job tick, cron, or this audit.
- Last verified incident readback: $0.717921 recorded costs, plus a $0.40 unresolved Marrakech measurement reserve; $1.117921 committed. This is a historical checkpoint, **not a fresh balance or all confirmed charges**. Keep the same ledger. Do not erase the unknown reserve.
- Earlier local proofs used an explicitly manually selected, already illustrated identity reference. They proved parts of placement, not the automatic fresh-photo-to-player path.
- The old identity prompt did contain illustration instructions, but still used an optional legacy board crop and detailed portrait cues. Missing-reference fallback existed; we did **not** establish whether Bar's actual call lacked that reference. Do not claim that as fact.
- Full diagnosis: `docs/BAR_IDENTITY_STYLE_DIAGNOSIS_2026-09-09.md`.

## Changes to review in this checkpoint

1. `src/infra/generation/character-prompt.ts`, `types.ts`, `openai.ts`: explicit QA-only `board-matched-identity/v1` contract, prompt `character-v3-board-matched-matte`. Photo controls identity/age/hair/skin; original board people control painted linework, grouped matte forms and detail density. No photoreal pores, glossy studio portrait or invented golden curls. Neutral identity lighting does **not** replace per-slot illumination. Legacy prompt behavior is unchanged outside this explicit contract. The 2x2 identity layout is retained.
2. `src/services/generation/board-wizard-identity-style.ts`: mandatory1024 atlas from original-people crops in all nine current, hash-verified catalog boards. No child/private images and no generic/HTTP fallback. Generation sends the exact verified atlas bytes. Review whether these nine examples actually show people large enough to communicate the intended style.
3. `board-wizard-identity-lifecycle.ts` + `pipeline.ts`: immutable generation provenance in `sheet:painted` (prompt version, model-quality intent, original-photo hash/ID/crop/age and style atlas/catalog hashes). Generation remains GPT Image2 MEDIUM and one automatic identity generation attempt. Missing QA character provider must not fall through to legacy avatar creation.
4. `board-wizard-identity-gate.ts` + `src/infra/generation/identity-style-reviewer.ts`: one Sol HIGH identity/age/painted-style/layout review **before board enrollment/spending**. Reviews the same parent-selected photo crop, generated sheet and original-people atlas. Four explicit passes and trustworthy request-level usage are required. Fail/uncertain/transport/malformed output holds without automatic image repair or a second judge purchase. Known costs settle even when content is unusable; unresolved charges retain their reservation. Metadata-only receipt pins exact input hashes/settings, not an untraceable boolean.
5. `board-conditioned-wizard.ts`: enrollment separately demands a matching, paid approval; existing pre-gate capsules cannot obtain approval by surviving deployment. Each completed board is reviewed on its exact composed pixels **before buying the next board**, rather than postponing every review until the whole world has been rendered. Individual bad/unknown slots stay recorded and do not starve other boards. Stop/refund/deletion/status fences apply before dispatch and when committing results; daily/policy failures become explicit holds.
6. `/api/games/[gameId]/status`, `creation-progress.ts`, `CreatingStatus.tsx`: held/partial work is not96% or completed milestones. `job.DONE` only ends a slice, not a world. Check both pre-enrollment identity holds and post-enrollment board holds. No automatic tick nudges while held.
7. `order.service.ts`, `create/actions.ts`: review the ownership boundary for an anonymous uploaded photo adopted at checkout. The exact private original-photo asset must follow the authorized draft/child owner atomically; no foreign/shared assets may be transferred. This is necessary for secure generation and later deletion.

## Trace the entire actual route

| Boundary | Required evidence / failure to look for |
|---|---|
| QA access → draft → name/age/photo | Correct owner or draft-token proof; age2–10; parent crop honored; original photo private; different uploads cannot share identity/cache accidentally. |
| Package/world → checkout → payment | Exactly the supported nine-board world; currency remains location-driven, not language-driven; redirect cannot mark payment; signed/mock-QA webhook remains authoritative; repeated checkout and webhook idempotency. |
| Paid job → identity | Current verified atlas reaches the actual image provider, not just a helper test; MEDIUM/model settings and no SDK hidden retries; actual wire photo and style hashes match provenance; optional legacy boardStyle cannot become the QA path. |
| Identity → style approval → enrollment | Gate runs once, before any board purchase; no ready-avatar bypass; no missing/old/stale approval accepted; stop/delete/refund during image or judge cannot attach assets, enroll or revive the game. |
| Frozen catalog → per-board source | Actual board, all three authored local contexts, original people, requested poses, weather/clothes and lighting are sent for that board. Identity image must not dictate photographic finish or a universal pose/light. |
| Source → measurement → extraction | Three cells retained independently where supported; actual per-child landmarks, not Yuval coordinates; wrong-source/extra-prop/face/edge guards retained; measurement recovery does not buy a replacement image. |
| Sprite → final board | Ground/seat/contact anchors, same-depth size comparators, correct foreground mask and natural partial face visibility. No huge head, body ending in air, sunlight inside a shaded shop, summer shirt in snow, or illuminated standing figure with no plausible ground contact/shadow. Open figures are allowed when they blend. |
| Final composition → Sol review | Judge sees exact player pixels and useful neighbours; hidden feet alone are not an anatomy failure; giant/miniature figures and photographic style do not pass because identity matches. Output completeness, model/tier, usage and immutable hashes are validated. |
| Failures → retry/budget | Max two source attempts per board; bounded remeasurement on the same paid sheet; no silent reset of $4 inclusive ledger. Check identity review is included. Actual costs, conservative estimates and unresolved reserves are reported separately. |
| Full assembly → private player |27 distinct real appearances; no fallback stickers; correct frozen board pixels, geometry and hints; owner/admin-only `/qa-review`, private assets and no automatic public publication. Test zoom, horizontal pan, mobile portrait/landscape, clicks at multiple zoom levels, foreground occlusion and progress. |
| Stop/delete/refund/reload | No further purchase or state resurrection; exact private images/checkpoints removed on deletion while billing metadata survives; expired/replaced credentials/capsules fail closed. |

Key remaining code: `board-conditioned-source.ts`, `board-conditioned-generation.ts`, `board-conditioned-catalog.ts`, `board-pose-observer.ts`, `board-sprite-extraction.ts`, `board-conditioned-player.ts`, `board-wizard-review-input.ts`, `board-wizard-visual-judge.ts`, `board-wizard-budget.ts`, `queue.ts`, `qa-review.service.ts`, private asset routes, `src/game/engine/target-geometry.ts`.

## Test evidence and limits

All checks in this implementation turn are free: synthetic provider replies, disposable SQLite, actual static catalog validation and retained evidence. The final complete `npm run check` passed127files /1883tests, with TypeScript clean, including checkout ownership, pre-enrollment held UI and per-slice identity approval. Focused suites cover identity style contract, atlas hashes, review cost/receipt reuse, fail/uncertain/malformed/unknown responses, no-approval enrollment, and actual pipeline stop/deletion/lease behavior. Wizard orchestration tests explicitly mock only the already-tested identity-approval boundary; do not mistake their synthetic sprites for visual proof.

**Not proven by this checkpoint:** that the new prompt produces a satisfactory Bar/new-child identity, that Sol's style gate is well calibrated on real new outputs, or that a full fresh-photo world passes visually under $4. A green test suite is not proof of those claims. Do not call the engine perfect or27/27 visually approved. The existing geometric gallery and the new route guards are separate evidence.

The newly authorized run should use staged validation: one fresh identity → style comparison against original board people → one board with three appearances from that exact identity → continue the remaining boards when the gates permit. Reuse the identity; do not buy it again. Stop at an unresolved charge or a systemic mismatch that cannot be resolved within authority/budget. Use no HIGH image experiments. Guy will judge the playable result in the morning; do not replace that pending human review with a claim of perfection.

## Your deliverable

Give Guy a short Hebrew verdict and Codex prioritized actionable findings, each with file/line, failing scenario, evidence, consequence and smallest safe correction. Separate P0/P1 blockers from improvements. Reproduce with a failing test when possible. Explicitly state which paths were exercised, which were only read, whether the deployed QA commit matches the reviewed commit, and which visual checks still require a new paid result. Be free to challenge our design, but preserve the user's fixed-place/per-board-conditioning workflow and stop/budget/privacy constraints.
