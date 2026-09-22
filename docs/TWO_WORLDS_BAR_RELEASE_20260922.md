# Two-world Bar pilot — 22 September 2026

## Scope and release boundary

Private local pilot: Around the World and Enchanted Kingdom, nine boards each.
18 boards × 3 personal hides = 54 hides. Six discoveries per board = 108.
No production or QA catalogue activation is implied by importing this inventory.
The existing QA game and its progress are untouched.

## Resolved rendering failures

Four boards had failed the manual source-preservation review despite some
automated passes. Five placements were repaired from the original source with
identity-only head/neck masks, rather than regenerating an entire scene:

| Board | Rejected defect | Selected attempts for hides 1/2/3 |
| --- | --- | --- |
| Paris | Child scale and redrawn bakery cart | 2 / 1 / 3 |
| Tokyo | Neighbouring child removed; foreground woman changed | 1 / 3 / 3 |
| Sydney | Inappropriate surfboard/platform from an erroneous activity brief | 1 / 1 / 3 |
| Sweet workshop | Counter obscured the neighbouring child's face | 2 / 1 / 3 |

All four replacement groups passed the recorded automated review and manual
native/context inspection. This is local-pilot acceptance, not a claim of parent
approval of likeness. Rejected versions and their costs remain in the ledger.
Face and hair identity remain bound to Bar's canonical identity reference;
scene references supply pose, clothes and light, not a neighbouring face.

## Intake and privacy

`scripts/lib/two-worlds-reviewed.ts` checks the frozen source, identity, selected
pixels, technical receipts, grouped review, explicit final acceptance and
measured child geometry. Assembly fails closed on a hold or mismatch.
All new discovery-card regions avoid every full personal crop.
Public scene files contain no personalised child. Private patches, account
links and local persistence evidence stay under ignored storage/output paths.

## Test evidence

- Full suite: 255 files passed; 3,386 tests passed, 2 expected failures,
  35 skipped. No unexpected failure.
- Five dedicated release tests cover 18 unique boards, 54 hides, 108 discoveries,
  map coordinates, independent worlds, strict hold exclusion and real geometry.
- Real-pointer owner playtest completed all **18 boards, 54 hides and 108
  discoveries**, starting in Enchanted Kingdom before Around the World, without
  seeded progress. All 18 completion screens had zero document overflow.
- Database evidence after owner replay and guest play: revision 162, 54/54 stars,
  108/108 discoveries, 18/18 postcards. Replay/guest activity did not inflate or
  erase the owner's saved achievements.
- Paris replay at 390×844 starts with 0/3 hides and 0/6 items, then completes
  all three and all six through actual pointer clicks and panning.
- Passport: all 18 completed pages inspected with one decoded personal photo
  and six decoded discovery images each. Four layouts (390×844, 360×640,
  1366×768, 1440×900) have zero horizontal/vertical document overflow.
- Fresh guest player link opens the gift/game without marketing or family
  management navigation; both independent worlds begin at 0/27 for that guest.
  Castle guest play completed 3/3 and 6/6 at 360×640 after the fix below.
- TypeScript passed. Follow-up focused suites passed: 52 passport/release tests
  and 47 hit-testing/viewport/media tests (these sets overlap; do not add them).
  The full-suite count above predates the two final runtime fixes below.

## Additional defects found by real playtesting

### Passport media throttled ordinary fast reading

The route allowed only 120 media requests/minute. Eighteen pages require 126
images before turning-leaf requests, so the last page showed missing images
with HTTP 429. The bounded budget is now 360/minute in `LIMITS.passportMedia`;
QA access, authentication, ownership, deletion checks and private/no-store
responses are unchanged. Regression test failed at request 121 before the fix.
Tests also prove that request 361 is rejected before raster work and private
images remain inaccessible to anonymous/other owners. Actual 18-page reading
then passed, including the previously failing night-carnival page.

### Small-phone exact item clicks rejected due to overlapping padding

At 360×640, the castle's duck and knight puppet could not be collected because
two invisible 64px touch expansions overlapped. The hit tester only considered
expanded regions, even when the click was exactly on one visible object.
Exact discovery hits now precede padding; the actual child footprint retains
first priority, and ambiguous empty space still never guesses an item.
The real-viewport regression failed before the fix and passed after it.
The same guest browser then collected both previously unreachable items and
completed the castle without changes to its coordinates, artwork or progress.

## Cost boundary

New personal renders and their judges total **1,372,476 micro-USD ($1.372476)**
in the settled ledger, including rejected attempts. There are no pending or
unknown reservations. This excludes historical identity/base-board generation
and the five retained boards; it is not the total cost of a customer game.

## Reproduction

Worktree: `work/qa-passport-release-20260917`.

1. `scripts/two-worlds-game.ts --local-reviewed` assembles once in the isolated
   pilot database; it refuses to overwrite an existing game.
2. `powershell -NoProfile -File scripts/start-two-worlds-local.ps1` starts port
   3037 with paid generation disabled and an isolated Next output directory.
3. Set `BROWSER_CLI` to the installed agent-browser executable. Warm its daemon
   from the shell before running the Node orchestrator on Windows; a new daemon
   inheriting synchronous child pipes can leave `execFileSync` waiting.
4. Run `node scripts/two-worlds-browser-walk.mjs` with the warmed
   `BROWSER_SESSION`. The script uses real UI sign-in and pointer interactions.
5. `npx tsx scripts/magic-bar-local-evidence.ts --two-worlds` checks persisted
   54/108/18 totals. It never writes progress and cannot target another DB.

Browser snapshots, screenshots and per-board results are private under
`output/two-worlds-20260919/playtest`. Do not commit owner browser state, mail
links, SQLite files or personalised images.
