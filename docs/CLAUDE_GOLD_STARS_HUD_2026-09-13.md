# Gold stars and the search HUD — 13 September 2026 (Claude)

Branch: `claude/gold-stars-hud-20260913`, cut from `codex/qa-five-hides-20260912` at `4dcfcea` (the deployment on `qa.findmeworlds.com` when this was written). Player side only: `src/game/*`, `src/styles/*`, `src/i18n/dictionaries/*`, two tests. Nothing under `src/services`, `src/infra`, `src/app/admin` or `src/domain` is touched; the five-hide rules (`playMode`, `sceneFoundIds`, `gameStars`, unlock at three, completion at five, resume of partial finds) are used as they are.

## What Guy asked for, and what changed

1. **The search HUD was too big and hid the board.** It is now one row that is always there — the child's face (64px, 56px on a phone, still the contained full portrait), one gold star slot per hiding spot, the hint — plus a caption ("2 more and the next place opens"). The words (mission, hint text) fold away six seconds after they change and unfold on a tap or a hint; the stars never fold. Taps pass through the card to the board; only its buttons catch them. On a 900px screen the folded card is about 300×70px; unfolded with the hint text, about 350×145px.
2. **The stars were not stars.** One vector gold star (`GoldStar`) everywhere: the tray, the flight, the finish card, the map, the bag, the hub. A find sends a star out of the child, over an arc, into its slot (`StarFlight`); the slot lights when it lands, with a ring and a "star" chime. The finish card pops the board's five (or three) in one after another, each a few semitones higher.
3. **No world stars inside the board.** "בעולם: 41/45" is gone from the HUD and from the finish card. The world's count lives on the map (a gold pill that opens the bag), in the bag (count + a gold meter), and in the hub.
4. **"ממשיכים" was unclear.** `scene.canContinue` is now "ממשיכים למקום הבא" / "On to the next place"; the unlock toast at the bottom is one slim row that leaves on its own after seven seconds. The rules copy was shortened to captions.

## Things Codex should know before merging

- `src/game/__tests__/find-any-player.test.tsx`: two pins changed on purpose. The CSS pin for the portrait cell now expects `var(--space-8)` (64px) and `calc(var(--space-6) + var(--space-1))` (56px) instead of 96/72px; the bag pin reads the world count from the counter's accessible name ("3 of 15 gold stars collected") instead of the old "World: 3/15" text. Everything else in that file, and the whole of `find-any-real-viewport.test.tsx`, passes unchanged.
- `MissionCard` lost the `worldStars` prop; `ScenePlayer` no longer imports `gameStars`. `SpeechBubble` lost its text-star prefix (the flight is the star now).
- `game.css`: the three layers of mission-card CSS (bottom pill, its mobile rules, the top-right override) are one HUD block now. `.wmap__stamp` (the emoji stamp) is gone; a map node wears a `StarTray` (three-hide boards) or a gold `StarCounter` pill (five-hide boards, five slots do not fit under a dot). `.scene__advance` is centred with auto margins, not a translateX, because its entrance animates `transform`.
- New tokens in `tokens.css`: `--gold-light/--gold/--gold-deep/--gold-edge/--gold-soft`, `--grad-gold`, `--shadow-glow-gold`. New keyframes in `animations.css`, all prefixed `fm-star-`/`fm-fly-`/`fm-count-`/`fm-meter-`.
- `sounds.ts`: a `PlayCue` type (`SoundCue | "star"`), a `STAR` phrase, and `play(cue, { pitch })`. The scene schema is untouched.
- Copy keys added to both dictionaries: `game.stars.{tray,counter,here,world}`, `game.complete.{threeStars,fiveStars}`, `game.passport.allStars`. Changed: `game.scene.{unlockRemaining,unlockRemainingOne,finishRemaining,finishRemainingOne,boardCompleted,boardStars,canContinue,unlocked,starEarned}` (he: "לוח" → "מקום"; en shorter). The test-pinned substrings ("עוד 3", "עוד מחבוא אחד", "5 כוכבים", "3 more", "1 more", "5 stars", "One star earned!") are all still there.

## Verified

- `npm run check` on this branch: 187 files, 2,783 tests, 35 skipped, exit 0.
- A disposable local five-hide game (nine real boards, five public-demo sprites each, local SQLite, no photo, no generation) played in a real browser at 900×620 and 375×812: the flight and the slot landing, the folding words, the caption changing 3→2→1, the unlock toast and the gold "next place" button after the third find, the five-star finish card, the map's gold node pill and counter, the bag's counter/meter/trays, the hub. No console errors from the app.
- Not verified here: a real generated child on QA (no five-hide game exists in the local database), RTL layout of the HUD on a Hebrew five-hide game (the fixture's source game is English; the RTL path was checked on a three-hide game only).

## Not done / open

- The original tools rail on the left (Codex) and the 220px pan padding are unchanged.
- `IslandGrid` (the pre-worlds fallback) still shows "★ n/5" as text.
- Not deployed anywhere. The QA site still runs `codex/qa-five-hides-20260912`; this branch is a superset of it and can be merged into it, or deployed from a worktree with `.vercel/project.json` copied in — Guy's call.
