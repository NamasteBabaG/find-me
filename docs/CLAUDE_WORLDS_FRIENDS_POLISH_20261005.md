# Claude: worlds and friends polish, batch 1 (2026-10-05)

Branch `claude/worlds-friends-polish-20261005`, from `beab331a` ("Add owned worlds, continuation purchases and independent friends"). Not pushed. The first four commits (batch 1, batch 2 below, a small round-strip follow-up, and Guy's two follow-ups: an X on the friends dialogs, no tablet tip) are already in Codex's `codex/service-legal-20261001`. The fifth, Guy's QA round (below), was rebased onto that branch's head `6998af78`, so the branch now fast-forwards it. Batch 1 implements section 4 of `CLAUDE_DESIGN_REVIEW_WORLDS_FRIENDS_20261005.md` (the brief), except item 5 (invitation states, link-once, replace confirmation, clipboard fallback). Codex shipped item 5 before this, along with the Go emblem, purchase labels and `LinkButton` pending; none of that is touched here.

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
  - Batch 2 settles it: phones play upright (Guy), the turn tip says so to a phone held sideways, and the card now fits short upright phones.
- **The round strip on a phone held sideways.**
  - With its 64px button, the "Another player?" strip is about 24px taller than with the old 40px one.
  - At 640x360 it takes the top 95px, and the map only starts at about y=255.
  - Batch 2 removes the permanent strip (V16).
- **"To the parents' area" under the map is 76x17,** below the 48px adult floor.
  - `game.css` calls it a deliberate footnote.
  - A bigger target is also easier for a child to hit by accident. This is a product call, so it is left as is.
- **Not seen in a browser:**
  - the unlock toast (needs a board with more targets than finds required; unit-tested);
  - 844x390;
  - the English locale (unit-tested).
- **Fixture note.** The owner world selector names worlds in the game's stored `locale`. A fixture game without `locale` previews Hebrew worlds in English. Real games store it.

## Batch 2 (second commit, same day)

Guy's direction (2026-10-05): phones play upright, because sideways things disappear. He first allowed a "better sideways" tip on tablets, then withdrew it: tablets are never told which way to hold them.

1. **The turn tip follows the device.** `src/game/engine/useTurnTip.ts` decides it.
   - The previous tip ("more fun with the phone in landscape") showed on every upright phone. Now:
     - A phone held sideways: "Hold the phone upright to see everything 📱".
     - A phone upright, a tablet held either way (a touch screen whose short side is at least 600px), a mouse, or a screen of unknown size: nothing.
     - The tablet tip was removed in the fourth commit, at Guy's request.
2. **The round strip shows only while a round exists (V16).**
   - Its one line is "This round: {earned}/{total} ★"; the "Another player?" heading is gone.
   - Without a round, "Play from the beginning" is a quiet 64px text button under Go, shown once something is found.
   - That button's height comes out of the map's budget (`--wmap-again-height`), the same way the strip's height does.
   - On the map, an active round's strip has no "Continue this round", because Go already continues it. That option shows when the round is paused, and on the multi-world hub, which has no Go.
   - At 390 the strip is now 184px instead of about 265px (three stacked 64px buttons) (third commit).
3. **The map completion panel is a title, one line and two actions (V17).** `completedReplay` is removed.
4. **The completion card fits short phones held upright (screens up to 740px tall).**
   - Tighter gaps and title, the postcard sized by the screen's height (28dvh), and Stay beside the replay icon.
   - The block sits after the card's own rules in `game.css`. It first lost to `.complete__postcard .postcard { max-width: 320px }`, which came later at the same weight.
5. **The unlock toast lasts 4 seconds instead of 7**, since the HUD keeps the way forward.
6. **"Who found me?" (Q6).**
   - Players from the current invitation come first, then earlier, closed ones under their own heading. Headings appear only when they say something.
   - Each player's places sit on one wrapping strip of chips, marked by a shape and a count, never colour alone: `·` not visited, `○ 0` looked, `◐ 2/3` partly found, `★` all found. The words stay in the chip for screen readers.
   - Each card says "Last played {date}".
   - "New" stays on the cards for the whole visit after the seen-write, and clears on close. Acknowledging is unchanged.
7. **The guest switch (Q5).**
   - The button is "Another player" ("מחליפים שחקן"), enabled whenever play is live.
   - A tap waits for a save that is already on its way, busy and saying "Saving Fox's finds…". This uses the new `FriendProgressSync.saveNow()`, because `flush()` returns at once while a request is in flight.
   - A save that cannot be made opens a sheet: "Fox's finds aren't saved yet", with Save now and Keep playing. There is never a "switch anyway".
   - The status chip says "✓ Saved", and the lobby marks the chosen nickname with a ✓.
8. **The finale gate: the passport contract, named once.**
   - The gate is not removed. The server keeps older five-hide formats out of the passport on purpose (`passport.service.ts`: they "must not poison the current 3-find/6-discovery passport, nor invent extra stamps").
   - Page saves require three finds, and the seen list is capped at six.
   - Gating on adventure and album alone, as the brief proposed, would send delivered five-hide games into a passport the server refuses.
   - Instead, `PASSPORT_TARGETS`, `PASSPORT_DISCOVERIES`, `isPassportBoard` and `isPassportBook` (`src/domain/passport/passport.ts`) are read by every gate: ScenePlayer, GameShell, passport.service, projectPassport, passportPhoto and passportCeremony.
   - Behaviour is unchanged, and changing the contract later is one place.

Batch 2 verification:
- `npm run check` passes: 344 test files, 4330 passed, 2 expected fails, 55 skipped.
- New tests:
  - the turn tip;
  - report grouping, marks, and "New" kept for the visit;
  - the round strip, the quiet button and the trimmed panel;
  - the named passport contract.
- Three guest tests now describe the new flow: waiting for a save already on its way, and the not-saved sheet. They used to assert a disabled button.
- Browser, Hebrew, local fixture. Friends data was made through the real services (`work/friends-seed.ts`):
  - **Report at 390 and 320.** Current invitation first, earlier ones under their own heading, chips read shape-first right to left, and "New" stays after the seen-write.
  - **Map without a round.** No strip, and a 64px "לשחק מההתחלה" under Go.
  - **Map with a round.** "הסיבוב הזה: 0/27 ★". Active: "חזרה להתקדמות השמורה" and "לשחק מההתחלה", while Go says "אתם כאן". Paused: "ממשיכים בסיבוב הזה" and "לשחק מההתחלה".
  - **Turn tip, using screen size and touch emulation.**
    - Phone upright: none.
    - Phone sideways: the upright tip.
    - iPad upright: none (after the fourth commit; it showed the sideways tip before).
    - iPad sideways: none.
    - Desktop: none.
  - **Completion card.** Every action is in view at 320x640, 360x640, 375x667 and 390x844.
  - **Guest.**
    - The lobby marks the chosen nickname with a ✓.
    - The strip shows "מחליפים שחקן" and "✓ נשמר".
    - A failed save shows the "המציאות של שועל עדיין לא נשמרו" sheet, and the game stays.
    - Keep playing closes the sheet.
    - After a successful save, the switch opens the chooser.

## Guy's follow-ups (fourth commit)

- **The friends dialogs close with a plain ×**, in a 64px white circle like the world selector's, instead of the word "סגירה". Children read an X at a glance. The word stays the button's accessible name, so screen readers and the tests still find "Close".
- **No tablet tip.** Guy withdrew it. Only a phone held sideways is told to stand it up.

## Guy's QA round (fifth commit)

Guy tested the polish on QA (2026-10-05) and sent six screenshots. The commit sits on Codex's `6998af78`; the one conflict, the tray's `Collection.tsx`, keeps Codex's hidden-while-panning box and close-look dialog and adds the game's `dir` to each part, the new dialog included.

1. **Pricing is one price story.** The first world is 39₪ and each world after it 30₪ (`WORLD_PRICES`), so three package cards compared what is really one formula.
   - `Pricing` (`src/app/home/sections.tsx`) is one panel: "The first world", its price, what it includes and one way in ("Create the first adventure"); a "+" on the seam; "Each additional world", its price and where it is added (the family area).
   - Two or three worlds together cost exactly the sum, so they show only as small links ("2 worlds together: 69₪"), and only when the purchase policy allows them. QA sells only the first world, so none show there.
   - `choose` and `soon` are gone from the dictionaries, and the `.plan` styles with them.
2. **The whole adventure card enters the world.**
   - The play button is an `fm-stretch` link (new in `ui.css`); its cover spans the card, and manage and friends sit above it.
   - The first version failed in the browser. The button's hover lift and the global press feedback (`scale` and `filter`, `globals.css`) made the button the frame of its own cover, so the cover shrank to the button mid-press and the click landed on the card.
   - Now a stretched link keeps still, the global press feedback leaves it out, and the card lifts on hover and dims a little on press. `DESIGN_SYSTEM.md` records the rule.
3. **The card's words are whole on desktop.** The map, stretched to the column's height, grew wider than its column and covered the title. It keeps its 3:2 shape, centred on the sea.
4. **The bag keeps its corner in an English game inside the Hebrew site.**
   - `[dir="rtl"] .collect`, which fixed Hebrew games, matched the page's own `dir` and pushed the button left when the tray opened.
   - `.collect` is laid out left-to-right always; the button, the seek card, the tray and the close-look dialog carry the game's `dir`.
   - The tray never scrolls sideways (`overflow-x: hidden`): a long rarity word was wider than its column.
   - The same page-`dir` match turned Go's arrow and the buttons' arrows backwards in that game. `:dir(ltr)` rules, each in its own rule, turn them forward; a browser without `:dir()` keeps the old look.
5. **The completion card fits every phone height without scrolling.** The postcard is sized by the height left for it; under 600px the stars shrink and their words go. The passport finale has the same tier.
6. **Desktop mission card:** up to 400px from 900px wide (at 256px, "Find Yuval in another hiding spot!" broke into three lines), with balanced lines.
7. **Sharing a game.**
   - The long address is gone. The link is a ticket: "Noa's game link", the site's name, and its state ("Ready to send", "Link copied", or "A new link is ready. The previous one no longer works.").
   - Share and Copy are two equal buttons. "Replace link" is a quiet line below with what it is for, and still asks first in the product's dialog.
   - The address shows only if copying fails, selected for copying by hand.
   - A game without a child profile (my fixture's had none; real games get one when created) takes the family child's name instead of an empty one, in the ticket and in the share text.
   - On a phone the ticket keeps to two short lines (the site's name goes).
   - The unused `.fm-copy` field is gone.

Verification:
- `npm run check` on the rebased branch passes: 345 test files, 4376 passed, 2 expected fails, 55 skipped (before the rebase: 344 files, 4335 passed).
- New tests: the pricing story (one offer, the two prices, one link, bundle links only when allowed) and the share ticket (named, no address, the replaced state, Share after a replace, the replace confirmation sent once for this game).
- Browser (headless Chrome over CDP), Hebrew site, local fixture, mock providers, before and after the rebase:
  - Pricing at 1440 and 390: one offer, the "+" on the seam, no sideways scroll.
  - Child page at 1440: the title whole and the map in its column. A real mouse click on the card's title enters the world. "Who found me?" still opens its dialog. Hover shows a hand and lifts the card. Ordinary buttons still dip when pressed.
  - English game in the Hebrew site at 1440 and 390: Go's arrow points forward, the bag stays in its corner when the tray opens, the tray does not scroll sideways, and the long title takes one line at 1440.
  - Completion card (with Codex's map and replay icons) and passport finale at 320x460, 320x568, 360x560, 360x640, 375x553, 375x667, 390x664, 390x844, 412x780 and 430x740: every action in view, nothing scrolls.
  - Share at 1440 and 390: the named ticket; Copy writes the link; after a replace, Share and Copy use the new link, the old link opens "we couldn't open the game", and the new one opens the gift. No console errors.
- Not checked: a real share sheet (stubbed), the clipboard on a real iPhone, Safari.

Found while verifying, not changed:
- At 320x460 the Stay button shares a row with the map and replay icons, and its words take three lines. It fits, but it is cramped.
- Locally the family page shows the next world's price in dollars on the Hebrew site: the currency follows the visitor's country (`getCurrency`), not the language. From Israel it is ₪.

## Still open

- Codex settled two earlier items in `5d6fb1cf` (`QA_DESIGN_POLISH_RELEASE_20261005.md`): the parents' link under the map is a 48px target, and the completion card has a map icon beside replay.
- The brief asks for a Hebrew speaker to review the guest strings ("מחליפים שחקן" and the not-saved sheet).
- The cramped Stay at 320x460 (above), if it should change.
- Codex QAs this round: `CLAUDE_TO_CODEX_QA_BRIEF_20261005.md`.
