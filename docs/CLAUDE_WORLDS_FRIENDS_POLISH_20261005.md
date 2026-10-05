# Claude: worlds and friends polish, batch 1 (2026-10-05)

Branch `claude/worlds-friends-polish-20261005`, from `beab331a` ("Add owned worlds, continuation purchases and independent friends"). One commit, not pushed. It implements section 4 of `CLAUDE_DESIGN_REVIEW_WORLDS_FRIENDS_20261005.md` (the brief), except item 5 (invitation states, link-once, replace confirmation, clipboard fallback). Codex shipped item 5 before this, along with the Go emblem, purchase labels and `LinkButton` pending; none of that is touched here.

## What changed, by brief item

1. **Counts come from the game, not the copy (V1, copy part).**
   - Every fixed "three/five/nine/27" in the child's copy is now a placeholder filled from the config:
     - gift lead (`{spots}`, `{required}`);
     - map spots (`{n}`), album continue note (`{required}`);
     - passport progress and photo wait (`{n} of {total}`);
     - world preview (`{places}`);
     - Stay (`{n}`).
   - The completion card says `{n} gold stars!`. `threeStars`, `fourStars` and `fiveStars` are gone.
   - `PassportPageView` gains `total` (the board's own target count), so `PassportBook` never assumes 3.
   - `projectPassport` treats a page as complete when finds reach `board.targetIds.length`, instead of `finds === 3`.
   - The finale gate (exactly 3 targets and 6 discoveries) is unchanged; it belongs to batch 2.
2. **64px child controls (V2).**
   - The round strip and the "next place is open" toast lose `fm-btn--sm`. A contextual rule in `game.css` gives them `--touch-kid`. This is the same pattern as `.wmap__actions` and `.wmap__complete-actions`; `fm-btn--kid` would have set the strip's text at `fs-400`.
   - The in-game passport's "To the map" button gets `--touch-kid`.
   - The HUD hint, Continue and replay needed nothing. A live board already raises `--touch-min` to `--touch-kid` (`.scene`, `game.css`), so they measure 64x64 in the browser at 390 and 1440. The doc that said "48px hint" was stale, so no `::after` ring was added. `DESIGN_SYSTEM.md` now says what the browser measures: the card is 72px tall, not 56px.
3. **One gold action per completion surface (V3).**
   - `SceneCompleteCard`:
     - the way forward is the one large primary;
     - "Stay and find {n} more" shows only while discoveries remain;
     - replay is a 64px icon (`ToolIcon` "replay");
     - "To the map" is gone, as the brief asked. System Back goes to the map (`GameShell`), and the board's map button is reachable again after Stay. The card itself covers that button, though, so when there is no Stay (nothing left to find, or a board without discoveries) the card's on-screen exits are the next place and replay. If that should change, a quiet map icon beside replay is the cheap addition.
     - The demo keeps "Play again" as its single primary.
   - `PassportCompletion`:
     - the Skip button is gone; a tap anywhere on the page settles the flourish;
     - Stay is counted, and absent when nothing is left;
     - the passport link stays.
   - `MissionCard` after Stay: Continue is first and gold; Play again is second and white (`mission__continue--secondary`).
4. **A still "{n} left" badge (V6).**
   - It appears on the bag once the hiding spots are done and discoveries remain, as `.collect__left`, physically left of the button.
   - It never animates, so readers with reduced motion get it too.
   - It hides while the tray is open, so the two never share the screen.
6. **One face on the map (V4).**
   - The header portrait is removed; the marker on the painting is the child.
   - The marker and the family-page sticker are contained, not cropped to a circle (`object-fit: contain`, `--radius-2`).
7. **Passport frame (V13).**
   - While the owner's book loads, a frame the size of the book holds its space, with a dashed seal and "Opening the passport…".
   - A failure is said inside the same frame, with its retry.
   - On a phone held sideways (max-height 480px), the words and retry sit at the top of the frame so they stay in view.

Also:
- The parent invitation dialog keeps the scope sentence visible. Lifetime and "closing cannot recall copies" now sit behind a 48px "How long it lasts and what closing does" summary, which has the FAQ's "+" to "×" marker.

## Verification

- `npm run check` passes: tsc, then 343 test files, 4321 passed, 2 expected fails, 55 skipped.
- New tests:
  - `adventure-passport.test.tsx`: frame while waiting, failure and retry inside the frame, the 64px way back.
  - The badge in both motion settings and in Hebrew.
  - MissionCard order after Stay.
  - The map's one face.
  - Counted Stay, and no Stay when nothing is left.
- Tests whose fixed strings or Skip button this change replaced now assert the new behaviour.
- Browser, Hebrew, local SQLite fixture, owner session, mock providers. 390x844, 320x640 and 640x360 unless noted:
  - The map has no header face. The marker is contained. Every place name has a 64px hit area. The round strip is 64px.
  - The finale has no Skip, and a tap inside settles it. Actions: next place (gold), "נשארים למצוא עוד 6 תגליות", open passport. All are 64px.
  - After Stay, Continue is gold and first, and Play again is white.
  - Badge timeline after Stay:
    - 0 ms: badge;
    - about 1.2 s: the tray's own peek opens and the badge hides;
    - about 4 s: badge again, still.
    - Reduced motion: badge shown, no animation.
  - A replay's completion card shows "3 כוכבי זהב!", one gold primary, counted Stay and the replay icon. There is no map button.
  - World preview: "9 מקומות", taken from the world.
  - Passport: frame while the request is held, failure plus retry inside the frame, and the book after retry.
  - Friends dialog: summary 48px with its marker; the notes are hidden until opened.
  - No console errors.

## Found while verifying, not changed here

- **Completion card and finale on short screens.**
  - At 640x360 (a phone held sideways) the card's actions are all below the fold.
  - At 320x640 the gold action is in view, but Stay and the replay icon are below it, under the postcard.
  - The finale's actions sit 178px below inside the dialog.
  - Both are reachable only by scrolling, while the game asks children to turn the phone sideways.
  - This was there before this change; removing buttons made both shorter.
  - The demo already sizes its postcard by container height (`.game--demo .complete__postcard .postcard`). The real card needs a landscape layout, for example the postcard beside the actions. Suggested for batch 2.
- **The round strip on a phone held sideways.**
  - With its 64px button, the "Another player?" strip is about 24px taller than with the old 40px one.
  - At 640x360 it takes the top 95px, and the map only starts at about y=255.
  - The strip rework (V16, batch 2) is what fixes this: it should not sit above the map permanently.
- **"To the parents' area" under the map is 76x17,** below the 48px adult floor.
  - `game.css` calls it a deliberate footnote.
  - A bigger target is also easier for a child to hit by accident. This is a product call, so it is left as is.
- **Not seen in a browser:**
  - the unlock toast (needs a board with more targets than finds required; unit-tested);
  - 844x390;
  - the English locale (unit-tested).
- **Fixture note.** The owner world selector names worlds in the game's stored `locale`. A fixture game without `locale` previews Hebrew worlds in English. Real games store it.

## Left for batch 2 (from the brief)

- The finale gate (3 targets and 6 discoveries), with a five-target fixture.
- Report grouping, and "new" kept visible for the session.
- The guest switch sheet.
- The round-strip rework: the permanent "Another player?" strip on the map (V16). Do this first; see the landscape note above.
- The map completion panel trim (V17).
- The landscape completion layout above.
