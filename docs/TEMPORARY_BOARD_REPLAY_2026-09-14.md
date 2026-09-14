# Temporary board replay

Implemented locally on `codex/adventure-three-boards-20260914`, on top of Claude's collection UI integration (`625b655`, `a899652`). No QA or production deployment, database reset, new image generation, or customer-game mutation was performed for this change.

## Product contract

- A completed board opens on its earned progress **without immediate completion confetti or a blocking completion dialog**.
- **Play again / לשחק מחדש** is available in that board's HUD, its finish dialog, and under completed boards in the adventure bag. An ordinary entry still allows collecting any missing permanent discoveries.
- Replay is explicitly temporary. It starts with zero child finds and zero collected discoveries, keeps the existing artwork/hiding positions, and shows one child at a time as before. Every round gets a fresh player mount so old reveal, star-flight, hints, collection selection and completion timers cannot leak into it.
- Findings and discovery stickers count normally **within the round**. Repeated taps on the same discovery count only once. Finishing celebrates the round, not another award of its postcard or collectible.
- Stars, album entries, unlocks, variants, completion dates, and play counts already earned remain unchanged. Even a previously uncollected discovery found in replay is temporary; enter normally to add it to the album.
- Opening another board, returning to the map/world hub/bag, or refreshing ends replay. Refresh restores saved progress, not the temporary round.
- Account sync may continue merging genuine account progress, including another board's finds, but cannot fill the live replay. Replay never queues album events. Existing usage telemetry remains separate from rewards.
- Replay does not bypass locked or incomplete boards. Legacy sequential boards keep their existing replay-on-entry behavior, now without repeat permanent rewards.

## UX check and captured flow

Verified through normal UI clicks in a **separate verification game**, `game_adventure_bar_density_verify_v3`. The family's nine-board game was not played or reset by these checks. Captures are local, ignored assets under `storage/replay-qa-20260914/`; they are not published or committed with the source.

1. **Completed reentry — fixed.** Before the change, opening Giza with 3/3 child finds immediately showed the finish dialog, with no replay action. After the change the board stays available and displays Play again with a plain note that the stars and album stay unchanged. The control is visible on a narrow screen; no destructive-reset warning or confirmation loop is needed.

   ![Before: automatic completion](../storage/replay-qa-20260914/01-before-reentry.png)
   ![After: explicit replay](../storage/replay-qa-20260914/02-completed-reentry.png)

2. **New round — healthy.** After first earning the blue feather normally, replay displayed 0/3 stars and 0/6 discoveries. Finding Bar counted 1/3, followed by his next hiding spot. The same feather could be found again and displayed 1/6 with “מצאתם שוב”, not a second permanent reward. Landscape viewport: 844×390. The small replay label leaves the board visible and preserves the collection design.

   ![Replay at zero in landscape](../storage/replay-qa-20260914/03-replay-landscape.png)

3. **Exit and refresh — healthy.** Leaving the unfinished round restored Giza's earned 3/3 in the map and bag. The album still contained exactly one feather and one postcard. The bag's separate replay button launched another empty round. Refreshing that round restored 3/3 and 1/6 without a completion dialog. Portrait viewport: 390×844. Replay buttons have explicit board-specific accessible names, a saved-progress explanation, and minimum touch targets; they are not nested inside card buttons.

   ![Bag: permanent achievements retained](../storage/replay-qa-20260914/04-bag-preserved.png)
   ![Refresh: original 3/3 and 1/6](../storage/replay-qa-20260914/05-refresh-preserved.png)

4. **Replay completion — healthy.** All three Bar hiding spots were found again through UI clicks on desktop (1280×800). The finish dialog says “מצאתם שוב את כל המחבואים!”, explains that saved achievements are unchanged, and offers another round or continuing to discoveries. Returning to the bag still shows only the original three stars. No browser console errors were observed during this verification.

   ![The completed replay](../storage/replay-qa-20260914/06-replay-complete.png)

Limits: desktop browser with responsive viewport checks, not a physical phone, child usability study or full screen-reader/accessibility certification. Automated tests cover full-round completion, another replay, Hebrew/English bag controls, permanent-storage byte preservation, optional-item behavior, delayed account adoption, offline/reconnect, legacy boards and unchanged unlock/reward counts.

## Verification

- `npm run typecheck`: passed.
- Full suite `npm run test -- --maxWorkers=2`: **223 files passed; 3204 tests passed, 2 expected failures, 35 skipped**. No unexpected failure. Vitest **4.1.11**.
- Final focused run after the last replay regression/UI copy changes: **26 files, 217 tests passed** (`src/game`, `src/domain/game`, `src/domain/adventure`).
- No production build or deployment was run for this client-only change. Existing untracked `output/` and `tmp/` remain untouched and unstaged.

Implementation: the Zustand store owns in-memory `replay.discoveryIds` and `visitId`. Durable `progress` and `album` retain their existing schema and persistence paths; the player uses temporary mission/discovery state only for the current visit.
