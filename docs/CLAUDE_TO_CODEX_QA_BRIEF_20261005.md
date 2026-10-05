# Claude to Codex: QA for Guy's QA round (2026-10-05)

Guy tested the worlds and friends polish on QA, sent six screenshots, and asked that when I finish, Codex QAs the result. This brief is that request. What changed and why is in `CLAUDE_WORLDS_FRIENDS_POLISH_20261005.md`, section "Guy's QA round".

Please check every item below, on QA where it can be seen there, and record PASS or FAIL per check with evidence (screenshots, measured sizes) in a QA note of yours, for example `docs/CODEX_QA_WORLDS_FRIENDS_ROUND_20261005.md`. Where something fails, say what, where and at what size before fixing it, so Guy and I can see what QA found.

## Where it is

- Branch `claude/worlds-friends-polish-20261005`, local and not pushed. Worktree `C:/GNart/Work/find-me/work/claude-worlds-friends-polish-20261005`.
- It sits on your `codex/service-legal-20261001` at `6998af78`: `b5fff01d` (the code) and one docs commit after it (the polish doc and this brief). If your branch has not moved since `6998af78`, `git merge --ff-only claude/worlds-friends-polish-20261005` takes both; otherwise cherry-pick the two.
- My rebase had one conflict, `src/game/components/Collection.tsx`. I kept your `obscured` box, magnifier button and close-look `<dialog>`, and added the game's `dir` to the button, the seek card, the tray and your dialog (item 3 says why). Please check that your panning behaviour and the close look still work as you built them.
- `npm run check` on the rebased branch passes: 345 test files, 4376 passed, 2 expected fails, 55 skipped (before the rebase: 344 files, 4335 passed).
- Nothing here touches generation, payment, prices, the purchase policy, the passport contract (3 targets / 6 discoveries) or the database.

## The checks

Sizes: desktop 1440x900 and 1024x768; phones 390x844, 375x667, 360x640, 320x568, and the short visible heights a browser's bars leave (390x664, 375x553, 320x460). Use real phones where you can (iPhone Safari, Android Chrome); I could only use headless Chrome.

### 1. Pricing (home page, `#pricing`)

- One panel, not three cards. Hebrew: "העולם הראשון" with its price, what it includes and one gold "יוצרים את ההרפתקה הראשונה" (to `/create`); a yellow "+" on the seam; "כל עולם נוסף" with its price, the line about adding it from the family area, and the same-child note.
- From Israel the prices are 39₪ and 30₪; elsewhere $22 and $17 (`getCurrency` follows the visitor's country, not the language).
- QA sells only the first world, so there are no "2 עולמות יחד" links. Locally, with every tier allowed, two such links appear under "כל עולם נוסף".
- At 720px and narrower the panel stacks and the "+" sits on the horizontal seam. Nothing scrolls sideways at 320.
- English: the same in English ("The first world", "Each additional world").

### 2. The child's page: the whole card enters the world (`/family/<child>`)

- A click or tap anywhere on an adventure card (the map, the title, the progress dots, the world chips, empty space) opens the world, the same as the gold button.
- "ניהול המשחק", "מזמינים חברים לשחק" and "מי מצא אותי?" each still do their own thing and do not open the world.
- Desktop: a hand over the card, the card lifts on hover and the gold button glows; the button itself does not jump. Pressing dims the card slightly. Nothing shrinks under the pointer (that was the bug: the click landed beside the button).
- Keyboard: Tab stops once per card, on the gold button, and Enter opens the world. A screen reader meets one link per card.
- Desktop (two columns): the title "מסביב לעולם" is whole, and the map stays in its column, centred, with the child's marker where it was.
- A card whose game is not ready has no stretched link (expected).
- Ordinary buttons elsewhere still dip when pressed (the global press feedback leaves out only `.fm-stretch`).

### 3. The bag: an English game inside the Hebrew site, and Hebrew games

To see Guy's case: set the site to עברית and open an English game (a game whose locale is `en`).

- Opening the tray does not move the bag: it stays in the bottom-right corner, at the same x before and after, on desktop and phone. The tray opens above it, aligned to the right, in English.
- The tray never scrolls sideways, also with a long rarity word ("Extraordinary").
- On the map, Go's arrow points forward. Arrows on the game's other buttons point the way the game reads.
- Hebrew game on the Hebrew site (regression check, since the old `[dir="rtl"]` rule is gone):
  - the bag in the bottom-right corner, before and after opening;
  - the tray reads right to left;
  - the count badge on the button and the "N left" badge to the button's left, as before;
  - a found sticker's green tick at its top left (top right in English).
- After tapping a discovery, the seek card reads in the game's direction, the magnifier opens your close-look dialog in the game's direction, and close and Escape return focus to the thumbnail.
- Panning hides and restores the bag as you built it.
- In browsers without `:dir()` (Chrome before 120, Safari before 16.4), arrows in the mixed case may still point backwards. The bag's fix does not depend on `:dir()`.

### 4. The completion card and the passport finale fit every phone

- Finish a place on each phone size above. The whole card is in view without scrolling: title, stars, postcard, the gold way forward, Stay, and your map and replay icons. Every child control is at least 64px.
- Under 600px of height the "N gold stars!" line is hidden (the stars stay), and the stars and title are smaller. The postcard shrinks with the height (to 72px at the least) and is at most 320px wide on tall screens.
- At 320x460 Stay shares a row with the map and replay icons and its words take three lines. It fits, but it is cramped; please judge it on a real small phone.
- The passport finale (a world's last place, when the passport fills): every action in view at the short heights. The photograph gives way first, and the place's name stays.
- The demo on the home page: its completion card is unchanged at 390 and on desktop.

### 5. The desktop mission card (top right in the game)

- From 900px wide the card is up to 400px wide. "Find Yuval in another hiding spot!" (and the Hebrew mission line) takes one line beside the face and Hint, and the lines are balanced when it does wrap.
- It overlaps neither the tool rail nor the bag at 1024 and 1440. Below 900px it keeps the 256px cap, and your compact phone rules are unchanged.

### 6. Sharing a game (`/library/<game>`)

- The page shows no long `/play/...` address anywhere. The ticket reads "🔗 קישור המשחק של <name>" with "<site> · מוכן לשליחה" under it.
- The name comes from the game's child profile, as before. If a game has none (my fixture's had none; real games get one when created), it falls back to the family's child, and with neither the ticket says "קישור למשחק" rather than leave a gap.
- Copy: the button and the ticket say "הקישור הועתק". The pasted text is the full link, and it opens the game in a private window.
- Share on a phone: the system share sheet opens with "איפה <name>?", the text and the link. Cancelling changes nothing. On a desktop without a share sheet, Share copies.
- Replace link asks first, in the product's dialog. After confirming:
  - the ticket says "יש קישור חדש. הקישור הקודם כבר לא עובד.";
  - Share and Copy send the new link;
  - the old link opens "לא הצלחנו לפתוח את המשחק";
  - the new link opens the gift.
  Replace twice: each replace ends the one before.
- If copying fails (deny clipboard permission), a line says so and the address field appears, selected, ready to copy by hand.
- At 390 and 320 the ticket keeps to two lines (the site's name goes) and the buttons stack. Nothing scrolls sideways.
- English: "<Name>'s game link", "Ready to send", "Link copied". The gift greeting and delete sections are unchanged.

## What I could not check

- Safari, physical phones, a real share sheet (I stubbed it) and the clipboard on a real iPhone.
- Read-back from the headless clipboard was unreliable, so I recorded what the page wrote to it.
- On my fixture, the English game is a copy of a Hebrew one, so its discovery names are Hebrew. A real English game has English names.

## If you want my local harness

In my worktree, all git-ignored:
- `work/polish/fixture-he.json` is the fixture: the SQLite URL, the secret and the storage root.
- `work/qa-logins.ts` writes fresh single-use sign-in links.
- `work/qa-playlink.ts` writes the game's current link after a replace.
- `work/qa-extras.ts` creates the English copy of the game.
- `work/polish/harness/verify4.mjs` checks the finale and the card at ten phone sizes.
- `work/polish/harness/verify5.mjs` checks pricing, the card click, the English game and sharing. It drives headless Chrome through `work/browser/cdp.mjs` against a dev server on 3450 with mock providers, using the same environment as the fixture.
