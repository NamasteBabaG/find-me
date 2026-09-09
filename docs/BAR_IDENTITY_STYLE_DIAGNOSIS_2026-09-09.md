# Bar QA identity style: stopped run and diagnosis

Scope: user explicitly requested stopping `game_d1f82bfqptb33vojg7nu` and diagnosing why the generated child looks photographic. No new generation, repair, resume, deployment, or code change was authorized/performed in this diagnostic turn.

## Stop and preservation

- Exact QA game changed to `MANUAL_REVIEW`; exact job changed to `DONE`, `currentStep=null`; `stepsJson.boardWizard.state=held`.
- This state blocks the next wizard slice. Changing the job/capsule also invalidates the in-flight writer's claim; no source assets, child data, or ledger entries were deleted.
- An audit row records the prior game/job/capsule states and explicit user stop. The read-only heartbeat `automation` was paused.
- Final readback: held/DONE, 9 ledger requests, $0.717921 settled/recorded; `board:marrakech:measure:1` unresolved with its $0.40 reserve retained. No pending request remained. The unknown reserve is not a confirmed charge or permission to retry. Total recorded plus reserved: $1.117921, under the $4 world cap.
- Three board attempts were recorded (New York, Amazon, Paris), none player-bound. Marrakech source was also paid while work was in flight; no completed Marrakech board was committed to the capsule.
- The creation UI displays 96% and completed-step ticks for the generic `MANUAL_REVIEW` status despite 0/27 appearances. This is misleading UI status mapping, not evidence that work is continuing or nearly complete.

## Confirmed route gap

1. Initial identity still uses `character-v2-child-age-detailed` (`src/infra/generation/character-prompt.ts:3`). It asks for detailed eyelids, softly modelled cheeks, clothing folds and photo likeness. It does forbid a photographic pasted face and glossy doll, so it is inaccurate to say there is no illustration instruction; the instruction is less specific than the new board-conditioned style contract.
2. `OpenAiAvatarProvider.createCharacter` (`src/infra/generation/openai.ts:259`) sends the original photo first and at most one optional board crop second. `boardStyle` (`src/services/generation/pipeline.ts:455`) loads the first pinned scene's first old target crop, not the current catalog's original-people style atlas. Its catch returns `undefined` and permits generation with a generic illustrated-storybook prompt. Whether this crop was missing for Bar is NOT established: the scoped runtime-log connector returned403 rather than log results.
3. `normalizeBoardWizardIdentity` (`src/services/generation/board-wizard-identity.ts:9`) only validates squarePNG shape, crops the top-left portrait, locates a face window, resizes and puts it on gray. It neither converts style nor judges it. The displayed avatar is derived from this newly generated sheet, not a separate completed style approval.
4. `generateBoardWizardIdentity` (`src/services/generation/board-wizard-identity-lifecycle.ts:65`) validates billing/ownership/lifecycle, persists images, then returns success. `pipeline.ts:243` enrolls the boards without an identity/style quality gate. Visual review is later, after board composition.
5. Earlier local proofs used `work/board-conditioned-engine-20260909/illustrated-face-reference-v4.json`: an explicitly `manualReferenceSelection:true` crop from an already illustrated sprite sheet. They did not prove the automatic stylization of a new uploaded photo. Treating their placement success as proof of the entire identity-to-game route was unwarranted.

## What is already present downstream

`src/services/generation/board-conditioned-source.ts:148` and onward supplies per-board context, three fixed-slot crops and original painted people. Its local-composite/v5 instructions explicitly say identity is not the rendering-style authority, and prohibit photorealistic skin, glossy curls and sticker polish. Thus the entire engine is not missing board conditioning. The initial identity is insufficiently aligned, and its quality is unchecked before it becomes a strong downstream reference. A realistic avatar alone does not prove every board render will be realistic; the propagation risk is real and the user correctly stopped before accepting it.

## Minimum corrective plan — not yet implemented

- Version the QA identity prompt and require a style reference built from original people in the currently pinned board catalog; never silently continue without it.
- Keep the child's photo authoritative for identity, age, skin and hair; make the board examples authoritative for linework, paint shapes, detail density and highlights. Preserve recognizable facial structure without portrait-level skin/hair texture.
- Add an identity/age/style gate before enrollment or board spending. An unapproved identity is held, not sent through all nine boards.
- Keep GPT Image2 MEDIUM, the existing budget and durable evidence. First prove one newly generated identity against the original board people, then one board from that same identity; do not repurchase a world to test the identity stage.
- Record exact identity prompt/style-reference provenance and render quality so the next diagnosis can establish which inputs were actually sent, not only which ones were possible.

No image generation or quality fix was run during this diagnosis. The existing user stop remains in force.
