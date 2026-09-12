# Found feedback / apparent freeze — 2026-09-12

## Observed, not inferred

On the user's QA game, Amazon was at 2/5 and world progress at 5/45.
Clicking the already-found tree-hollow child produced no popup and no durable
marker. Exact found footprints were deliberately swallowed in SceneViewport;
the success effect disappeared after 2.2 seconds, and the HUD repeated its
original search title. Other distinct children and hints remained responsive.
The browser had no error/warning entries; the QA error-log scan over the last
30 minutes returned no errors. This establishes a silent-feedback defect,
not proof that every reported physical interaction was caused by it.

## Fix

- Find-any exact repeat hits emit a presentation-only acknowledgement. They
  dispatch no domain action, save no progress, award no star and send no event.
- Only one anchored popup exists; repeats cannot interrupt the original success
  timer, and a new find cancels any older acknowledgement-dismissal timer.
- Saved finds retain a noninteractive 24px star beside their actual footprint.
  Painted crops, target hit geometry and the player's camera do not change.
- English/Hebrew HUD explicitly asks for another hiding spot, counts remaining
  finds to unlock, then remaining finds to complete. The configured threshold
  governs the copy and the continue panel.
- Legacy serial play retains its existing focus/cloud-turn behavior.

## Verification

- Regression first failed on desktop and mobile against missing saved markers.
- Actual viewport/pointer/RAF tests cover repeat acknowledgements, unchanged
  saved progress and subsequent distinct hits, with no camera reset.
- Player test covers zero repeat dispatch/telemetry, one popup, stale timer
  cancellation, third-star unlock and next-board navigation.
- HUD matrix covers 0 through 5 finds, custom threshold, both locales and legacy
  requested hints.
- Independent review identified stale announcement cleanup and misleading
  final-board copy. Both were corrected before the full check.
- `npm run check -- --maxWorkers=2`: exit 0; 169 files, 2443 passed, 35 skipped.
- Isolated local browser at 390x650: repeat 2/5 stays 2/5 with acknowledgement;
  distinct target gives 3/5 and success popup; Continue opens Paris at 0/5 with
  world total still 6/45. No browser errors. Existing development-only Next
  image localPatterns forward-compatibility warning remains unrelated.

No generation request, new game, paid render, database mutation or artwork
change is needed for this fix. QA rollout and live verification are recorded
after deployment below.
