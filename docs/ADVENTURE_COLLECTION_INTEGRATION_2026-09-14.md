# Claude collection design integrated with the reviewed Bar game

The parent explicitly requested adopting Claude's design work without losing
the nine-board game. The reviewed content/render work was first checkpointed as
`eeea2d0`. Claude's `73109f9` was then cherry-picked with attribution as `625b655`.
Both branches share base `5577cc1`; only `game.css` needed an automatic merge.
The separate transparent-star-ring overflow fix survived and its test passes.

## Preserved boundaries

Claude's changes introduce the collection strip, phone sheet, sticker flight,
rarity labels, album pages and their copy. No changes were made by the integration
to `content`, `public/scenes`, domain progress, the album store/sync, services,
generation engine, the approved personal images or saved game configuration.
The only addition under `src/game/engine` is `useWide.ts`, a responsive UI hook;
the viewport uses it to choose the desktop or phone pan padding.
The existing `openScene` playability guard still enforces board unlocking.
No API render, key change, database migration, reset, production build or deploy
was performed for this design integration. The root checkout and Claude's own
worktree were not edited.

## Integration correction

Actual phone clicks exposed a conflict between the new bounded camera and the
bottom hint card: New York's blue skate was drawn behind the card. Its exact
hint centre hit `.collect__seek-label`, not the board. Low-half items now put
focused guidance on the opposite edge on compact screens. A short landscape
screen uses the space beside the upper-right mission and leaves the left toolbar
clear. This preserves Claude's styling and zero outside-board phone panning;
it changes neither the collectible's coordinates nor its click handling.

The before/after browser reproduction is in ignored
`storage/adventure-density-preflight/claude-blue-skate-{hint,fixed}.png`.
The corrected click reached the stage and changed New York from 5/6 to 6/6.
A component regression test covers low-edge focused guidance versus high-edge
or first-level guidance. `verify-adventure-density.ps1` uses the new selectors,
supports separate desktop/mobile test sessions, and still asserts the actual
saved finds and discoveries; it never injects progress.

## Verification

- Type-check passed; six focused files passed all 50 tests, including collection,
  album, real viewport hit testing, sync, album store and the star-ring guard.
- The full parallel suite finished: 220 files passed, two files failed; 3183 tests
  passed, eight failed, two expected failures and 35 skipped. Six failures timed
  out at the existing 20 seconds, plus two orchestration state assertions in the
  same timed-out file. Do not label this a clean full-suite run.
- Both failing files were rerun unchanged with one worker: all 68 tests passed
  in 60 seconds, with no increased timeout. The engine files have no integration
  diff. This is consistent with contention/cascading timeouts, not proof from a
  single clean full rerun.
- The already completed guest album survived the UI replacement and refresh:
  27 finds, 54 collected stickers, nine postcards, no broken images. On a 390px
  viewport, document scroll width equalled its 375px client width.
- Replayed all nine boards with the integrated UI using actual pointer clicks:
  Giza at 1365 x 900, then the other eight at 390 x 844. All 27 child finds and
  54 discoveries were collected; New York's final discovery passed after the
  hint-card correction. No progress was injected.
- A separate fresh browser at 844 x 390 completed Giza's six discoveries and
  three finds with the short-landscape correction. The cover's start button
  required scrolling into view at this height.
- Final refresh retained 27 finds and 54 discoveries. Returning to the bag showed
  54 collected stickers and nine postcards, zero unloaded/broken image elements
  after loading settled, and equal document scroll/client widths (375px).
  Screenshots: ignored `storage/adventure-density-preflight/claude-album-final-`
  `{mobile,desktop}.png` and `density-landscape-giza-{collected,complete}.png`.
- Final type-check and the six focused files passed again (50/50 tests).

The fresh family handoff remains `game_adventure_bar_density_nine_v3`, with zero
finds and discoveries. Its link is in ignored
`storage/adventure-density-preflight/bar-game.json`; all automated play uses the
separate `game_adventure_bar_density_verify_v3` in isolated browser sessions.
Parent confirmation of Bar's repaired likeness is still pending.
