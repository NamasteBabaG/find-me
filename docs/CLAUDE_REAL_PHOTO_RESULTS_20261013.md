# Real-photo test with v19: complete. One sheet, three accepted hides, $0.62 (13 October 2026)

**Guy approved the $1.30 cap**, after Codex's review of the v19 results (`docs/CODEX_V19_QUALIFICATION_RESULTS_REVIEW_20261013.md` in the main checkout: PASS, with v19 selected explicitly for this test). The run used the reviewed contract unchanged. Before launching:
- HEAD was `8ae4512a`, with a clean tree;
- all eight photo-runner files and the three reused v18 files matched their reviewed hashes;
- the launcher's dry run found the manifest (`a2faf483…`) and the effective binding (`fb07ef85…`) matching, with both keys present.

The run then went once with `-Spend`. There was no retry and no fallback, and no stop condition was reached.

This report names no child and describes no child's appearance: the repository is public. The likeness comparison with the photograph is in private notes beside the run (see "Where everything is").

## Outcome

| | |
| --- | --- |
| Status | `complete`. One sheet was selected; three paintings were accepted, bound and reviewed twice; nothing is open. |
| Spend | **$0.622935** of the $1.30 cap. Nothing is pending, unknown or held, and there are no refusals. |
| Time | 7 minutes (18:01–18:08 UTC) |
| Report | `run/results.json` beside the photograph (private), with `run.log`, `sheets/`, `renders/` and the ledger `purchases.sqlite` (`d8a78694…`, unchanged by reading it) |

**Charges** (all settled, from the ledger):

| Item | Model | Amount |
| --- | --- | ---: |
| Identity sheet 1 | gpt-image-2 | $0.072450 |
| Identity review 1 | gpt-5.6-luna | $0.001314 |
| Painting, New York | gpt-image-2 | $0.047244 |
| Painting, Great Wall | gpt-image-2 | $0.047714 |
| Painting, Sydney | gpt-image-2 | $0.047264 |
| Opus v3 review, New York | claude-opus-5-5 | $0.115520 |
| Opus v3 review, Great Wall | claude-opus-5-5 | $0.099000 |
| Opus v3 review, Sydney | claude-opus-5-5 | $0.093328 |
| Sol continuity, New York | gpt-6.1-sol | $0.031033 |
| Sol continuity, Great Wall | gpt-6.1-sol | $0.035548 |
| Sol continuity, Sydney | gpt-6.1-sol | $0.032520 |
| **Total (11 purchases)** | | **$0.622935** |

The estimate was $0.75–0.85. Spend came in lower because the first sheet passed, so no second or third sheet was bought. As in pv19, every charge is a `conservative-upper-estimate` record, not a provider invoice.

## Identity (Phase A)

Sheet 1 went to the luna review: **identity, age, painted style and sheet layout all passed**, and the sheet was ready for publication. It was selected as "first-sufficient", with no repair and no comparison.

The reviewer's written reason is private, because it describes the child. One point from it matters here: its description of the hair matches the photograph, not the sheet (see "Likeness").

## The three paintings (`local-patch-prompt/v19-fixed-scenery`, age 6, portrait-only reference)

| Hide | Painting | Outline record | Opus v3 (reader v2) | Sol |
| --- | --- | --- | --- | --- |
| `newyork-v12-1` | accepted | v2, 37,076 restored | acceptable: all 13 checks pass, no fault | coherent, no fault |
| `greatwall-v12-1` | accepted | none (no scenery here), bound | acceptable: all 13 checks pass, no fault | coherent, no fault |
| `sydney-v12-1` | accepted | none (no scenery here), bound | acceptable: all 13 checks pass, no fault | coherent, no fault |

**Opus noted three small changes to the scene, and I see the same ones:**
- New York: "a few potted flowers at the stair base were cleanly replaced" by the child, and the stair railing now ends behind the child's shoulder.
- Great Wall: the neighbour's diabolo stick keeps its red spool. The child stands in front of it, so the spool's far end and the stick's tip are hidden behind the child's head. This is depth-consistent: the child is the closer figure.
- Sydney: "only a small new bubble appears, fully inside the scene", by the child's raised hand. The prompt asks to preserve each bubble. None was lost, and the added one reads as part of the bubble stream.

## Exact pixel checks (no threshold)

Script: `pixels.ts`, output in `review/pixels.json`.

| Hide | Shipping file = judged image | Pixels outside the return window | Differ from the board | Saved context = board + crop |
| --- | --- | ---: | ---: | --- |
| New York | yes (`0d851f38…`) | 180,836 | 0 | yes (0 bytes differ) |
| Great Wall | yes (`1c108d0f…`) | 30,720 | 0 | yes |
| Sydney | yes (`94c0a29b…`) | 45,136 | 0 | yes |

**New York's fixed scenery:**
- the union alpha, computed through the domain, is the reviewed one (`f4b28cbe…`), with 37,076 restored pixels;
- **all 36,348 fully covered pixels equal the board.**

The taxi sign and the BLOOM & CO. awning are the board's own.

## My visual review

### Placement and integration (wide contexts, the whole board at half size, and the joins at 2×)

- **New York:** the child stands on the pavement at the foot of the stoop, between the woman with the stroller and the florist. The ink line and palette match the neighbours. All four joins are continuous: the awning lettering, the sign and taxi roof, the woman's face and arm, and the florist's hands.
- **Great Wall:** the child stands on the plaza paving among the playing children, with the diabolo held as authored and the feet planted. The return window covers nearly the whole crop, so about 74% of it was repainted. The two women in front, the child in red behind and the child in blue are redrawn almost identically. All four joins are continuous.
- **Sydney:** the child stands barefoot on the sand, reaching into the stream of bubbles beside the toddler, with a cast shadow. The toddler, the crouching man and the surfboard table are intact. All four joins are continuous.

### Proportions

Standing height in crop pixels, head top to soles, read by eye from 25 px rules (±10 px):

| Hide | Authored reference | Painted | Ratio |
| --- | ---: | ---: | ---: |
| New York | 300 | ~322 | +7% |
| Great Wall | 444 | ~532 | +20% |
| Sydney | 496 | ~448 | −10% |

**The reference is not a cap:** the prompt calls it "a reference not a cap for a different-aged child". Both reviewers passed `scaleRight` and `ageAppropriate` everywhere.

**Sydney has an internal check:** the child is about 1.19× the height of the toddler alongside, close to the expected ratio between six and three years.

**Great Wall is the one to look at.** The child is drawn about a fifth taller than the reference. The child stands slightly in front of the other children, which accounts for part of that, and does not read as oversized in the wide context.

### Face brightness

Mean luma of a small cheek patch. The patches are saved in `face-light-patches.png` so their placement can be checked.

| Hide | Child | Neighbours |
| --- | ---: | --- |
| New York | 119 | 128 (woman), 121 (florist) |
| Great Wall | 150 | 124, 127 (the two women in front) |
| Sydney | 167 | 157 (toddler) |

The child is neither darkened nor glowing:
- in New York and Sydney the child sits within or near the neighbours' range;
- in Great Wall the child's face is the brightest relative to its neighbours, but part of that gap is skin tone (an older pair of women), not light.

Opus passed `lightingMatch` in all three, reporting no rim light, glow or spotlight. My look agrees.

### Wardrobe (a design observation, not a fault)

The painter receives only the portrait, and each board authors the outfit in its prompt. The children therefore wear New York's "muted teal autumn jacket", Great Wall's stand-collar jacket and Sydney's beach clothes.

In New York the authored jacket is the same colour as the two adults' jackets beside the child. This is by design and both reviewers accept it. Whether the child should blend in that much with the adults nearby is a product question for Guy.

## Likeness (summary; the details are private)

- **Across the three boards the child is consistent:** the same face, hair and expression in all three, close to the sheet. Great Wall is the closest.
- **Against the photograph:**
  - The sheet carries the expression, the ears, the face's proportions, the hair's length and fringe, and (in the sheet only) the clothing.
  - **The hair's colour and texture drifted at the sheet stage**, and the eyebrows and eyes came out warmer. The paintings follow the sheet, so they inherit the drift.
  - The identity reviewer passed the sheet anyway: its own description of the hair matches the photograph rather than the sheet.
- So the identity gate let a visible hair drift through, and the hair is the first thing a player sees at play size.
- **Whether the family would recognise the child is Guy's call:** Guy knows the child. The comparison images are private (below).

## What this shows, and what it does not

**Shows:**
- The product path can take a real photograph to three accepted hides in about seven minutes: a painted sheet, a single gate, three v19 paintings, and two HIGH reviews on each.
- All of it came in at $0.62, inside the cap, with nothing open.
- v19's New York protection held exactly on a third identity.

**Does not show:**
- error rates (one child, three hides; every first attempt passed);
- recognition by the family (Guy);
- a complete 27-hide game;
- other ages or other photographs.

The hair drift is one case, and it may not repeat for another photograph.

## Where everything is (all private, outside git)

Beside the photograph in `C:/GNart/Work/find-me/work/private-real-photo-20261013/`:

**`run/`: the runner's own outputs, unchanged since it finished.** Hashes are in `review/run-files.sha256`.
- `results.json`, `run.log`, `progress.json`
- `sheets/sheet-1.png`
- `renders/<hide>-raw|shipping|context.png`
- `purchases.sqlite`

**`review/`: read-only views, produced by the scripts in `work/private-real-photo-review/` (in this worktree).**
- The sheet: `photo-vs-sheet-1.png`, `eyes-photo-vs-sheet-1.png`, `faces-photo-sheet-ny-gw-syd.png`. These carry the photograph.
- The three hides in context:
  - `wide-side-by-side.png`, plus `<hide>-wide.png` (crop ±360 px at 1×);
  - `<hide>-board-half.png` (the whole board at half size);
  - `<hide>-board-vs-painting.png` and `<hide>-change-map.png`.
- The joins: `joins/<hide>-{top,bottom,left,right}.png` and `joins/<hide>-all.png`. The zoom is in `zooms/`.
- Proportions and light: `ruler-3up.png`, `face-light-patches.png`.
- The judges: `answers.json` holds every original Opus and Sol answer and the luna receipt, with each request's charge, usage, payload hash and fingerprint. It was read from a copy of the ledger; the original's hash is the same before and after.
  - 10 of the 11 purchases keep their original response as a retained-purchase record.
  - The eleventh, the luna identity review, is recorded the product's way (`reviewBoardWizardIdentity`): a settled ledger entry plus its receipt in the audit log (checks, reason, request id, charge). The product keeps no retained-purchase record for that review.
- `pixels.json`, and `LIKENESS_NOTES.md` (the private likeness comparison).

**A note on `run/`.** While the run was going, I wrote one comparison image into `run/review/` and moved it out to `review/` within a minute. The runner never reads that folder, and `run/` now holds only the runner's outputs.

## Next, in Codex's order

1. Codex reviews the sheet, the three contexts, the decisions and the ledger.
2. Guy looks at the likeness: the private face lineup against the real child.
3. Then the decision on a QA release and a complete 27-hide game.

**The hair drift belongs in that decision.** If it repeats, the fix belongs at the sheet and its gate, not in the painter. Codex's non-blocking wording note on the photo runner still waits for its next reviewed edit.
