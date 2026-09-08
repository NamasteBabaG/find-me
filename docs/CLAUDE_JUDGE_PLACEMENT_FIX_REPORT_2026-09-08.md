# Judge and placement fix — execution report (8 September 2026)

Answering `docs/CODEX_BRIEF_JUDGE_PLACEMENT_2026-09-08.md`, section 9. Written by Claude for Codex and Guy. Game 2 of the QA world is `game_hbdy0m0ihjv1faritkh0` (scenes at version 4; parked in MANUAL_REVIEW, untouched). Private evidence lives in `work/codex-judge-audit-20260908/` on Guy's machine and is not in git.

**תקציר לגיא.** מצאתי מה נכשל בכל שלב במשחק 2: השופט המהיר (gpt-4o) דחה כמעט את כל ההצצות הטובות בגלל "רגליים חסרות"; Sol אישר חמישה מחבואים בגודל שגוי; הצייר צייר גדול מדי בשלושה מקומות ופעם אחת צייר מחדש את האבן; והמעבר השני (החיתוך) הזיז את הילדה מתוך הקאנו למים בכל ששת הניסיונות. שלחתי תיקונים לכל שלב: חוזה מיקום למחבוא (גובה עמידה מהשכנים, כמה ממנה נראה, נקודת התמיכה), ניסוח נפרד לכל מצב הסתרה, ראיות מלאות לכל ניסיון במסך האדמין, שופט עם בדיקת גודל יחסי ומדיניות חדשה, החלפת המעבורת בסידני במחבוא מתחת לכיסא המציל, והאיזל בפריז. מה שלא הצלחתי: גלאי אוטומטי להזזה של המעבר השני — שני מדדים נמדדו ואף אחד לא מפריד. פרטים, מספרים ותמונות למטה.

## 1. Findings

| # | Finding (brief) | Status | Where |
| --- | --- | --- | --- |
| P1-A | Admin shows raw renders as "what the model painted", not the judged composite | confirmed, fixed | `AttemptStrip.tsx`, `attemptsForAdmin` |
| P1-B | No exact judge wire images per attempt; only the last judgement per row | confirmed, fixed | `slot-patches.ts` (`judgeImageAssetIds`, `judgeImageHashes`, `judgement`, `failedAt`) |
| P1-C | Fast-judge fail ends the chain; uncertain never escalates | confirmed, fixed | `judge.ts` policy `screen`; uncertain with checks escalates |
| P1-D | Bad accepts on scale (ferry, sledge, stall, carousel) with all checks passed | confirmed (5/5 exact composites), fixed by contract guard + `relativeScale` + 4.5× window | `patch.ts`, `board-verdict.ts`, `board-composite.ts` |
| P1-E | Geometry guard permissive (2× height, 4.9 heights drift pass) | confirmed, fixed where a contract exists (fixtures in `placement-contract.test.ts`); generic limits unchanged elsewhere | `childProblem` |
| P1-F | Two occlusion modes contradict each other in the prompts; polygon diagnostics skipped in layer mode | confirmed, fixed | `occlusionMode`, `slotPrompt` v9, `mattePrompt` wire v5, `matteHint`, `polygonMask(…, "diagnose")` |
| P2-G | `repairInstruction` swaps the pose ("complete standing body") on a peek | confirmed, fixed | `repairInstruction(judgeJson, placement)` |
| P2-H | Ledger outcome truncated to 80 chars; no stage label | confirmed, fixed | `problem`, `failedAt` |
| P2-I | Admin adjust dx/dy/scale does nothing for a painted patch | confirmed, fixed (form replaced by a note for image patches) | `page.tsx` |
| P2-J | Hit rect covers the hidden body in layer mode | confirmed, fixed | `visibleGeometry`, stored `hitRect`/`anchor` |
| new-1 | Pass two moved the child (amazon/canoe: 6/6 attempts) — painter renders were fine | confirmed by overlay; **no detector shipped** (see §7); prompt wording strengthened | `mattePrompt` |
| new-2 | Painter redrew the block in layer mode (giza/stones att 1): matte cut along the *new* block, composite over the *old* one → torso over sand | confirmed; `occluderShift` now measured in layer mode (recorded, not rejecting) | `extract.ts` |
| new-3 | Spots restored to v2 have no recipe, so the judge had no idea they were peeks | confirmed, fixed (recipe derived from body template + mission for the judge only) | `recipeOf` |
| new-4 | **Layer mode asks the painter to ignore an object that is still in its crop**, and it often does not: it paints the child cut off behind the easel or the block, and the board's own copy of that object is then drawn over an already-cut child | confirmed twice (giza/stones att 1 of game 2; paris/awning trial of 8 Sep); **not fixed** — see §8b | `slotPrompt` layer branch |
| qa2-1 | **A private child image survived game deletion.** A deferred attempt that resumes re-extracts and overwrites its own `patchAssetId`/`compositeAssetId`; the picture the pointer had named was then referenced by nothing, so `deleteGame` could not find it | confirmed by Codex's failing test, reproduced here, **fixed** | append-only `evidenceAssetIds` + checkpoint per picture; the check is now in the product suite |
| qa2-2 | The carousel's foreground polygon sits on the **paving in front of the carousel**, not on its fascia, so the layer copied cobblestones over the child's legs and cut them in mid-air | confirmed on the board, **fixed** by making the spot an open standing spot with no layer | `author-hides.ts`, `content/scenes/paris/scene.json` |
| qa2-3 | `author-hides.ts` replaced the whole `placement` object, so re-running it would have deleted all four contracts and restored an older scale | confirmed, **fixed**: it now carries the contract across and refuses a scale that disagrees with it by more than 15% | `author-hides.ts` |
| qa2-4 | The contract's `visible` meant "head to seat" in the prompt and "the whole silhouette" in the guard, and crouching and swimming wrongly got the seat's hang tolerance | confirmed, **fixed**: one meaning in both places, and only a seat lets a body hang below its support | `slotPrompt`, `shapeContract` |
| qa2-5 | The judge's wire evidence was two parallel arrays: three hashes, two stored pictures, and a failed store shifted the ids | confirmed, **fixed**: one `{role, sha256, assetId}` record per image, shown in the admin strip | `slot-patches.ts`, `render-evidence.ts` |
| qa2-6 | "Eight renders" was reported as two spots fixed; the trials script also overwrote its own directories | confirmed, **corrected** in §2b: zero spots are approved end to end, and each trial now gets its own directory | §2b, `spot-trials.ts` |
| qa2-7 | Admin thumbnails were 96 px and did not open, which is the one thing the strip exists for | confirmed, **fixed**: every picture opens at full size | `AttemptStrip.tsx` |
| — | Codex hypothesis "sydney/ferry can be fixed by a better recipe" | contradicted: passengers' heads are ~40 px on the art, no child-sized child is recognisable; spot replaced | §5 |

## 2. Chains (before)

Built by `work/codex-judge-audit-20260908/rebuild-chains.ts`. Exactness per tile: original crop **exact** (scene version 4 art is unchanged); painter render **exact** (the REJECTED_PATCH asset Codex saved); pass-two answer **exact** (the PATCH_EVIDENCE blob pulled from QA's `FileBlob`); extracted patch and judge composite **reconstructed with the same extraction code** (MATTE_VERSION unchanged since the game) and **not hash-verified** — the pipeline did not keep the wire images then (P1-B). Accepted spots: patch and rect **exact**, composition by the same composer. Sheets: `work/codex-judge-audit-20260908/chains/*.png` (six tiles: crop, render, matte, patch, composite, render with the matte silhouette outlined).

| Chain | Label | What actually happened | Stage |
| --- | --- | --- | --- |
| giza/stones att 3 | rejected, looks good | head and shoulders over the block, matte sits on the painted child, composite plausible | judge (fast, bodyPlacement) |
| giza/stones att 6 | rejected, looks good | same | judge (fast) |
| marrakech/spices att 1 | rejected, looks good | peek between the cones | judge (fast) |
| sydney/rocks att 2 | rejected, looks good | crouching on the rock among the children | judge (fast) |
| tokyo/blossom att 1 | rejected, looks good | whole child standing on the crossing | judge (fast) |
| giza/stones att 2 | rejected, arguable | head over the block's corner | judge (Sol) |
| giza/stones att 1 | rejected, correctly | painter redrew the block; torso ends over sand in the composite | painter (scene drift) |
| marrakech/spices att 3 | rejected, correctly | sitting on top of the spice mound | judge |
| amazon/canoe att 1 | rejected, correctly | pass two moved her a body-width into the water (cyan silhouette in tile 6 is in the water; the render has her in the canoe) | matte |
| amazon/canoe att 2 | rejected by the guard (55% unchanged) | moved again | matte |
| antarctica/sledge | accepted, looks bad | seated 448 px where the boy on the next sledge sits ~300 px (1.47×) | painter + judge |
| giza/stall | accepted, looks bad | seated 403 px, ~1.4× the neighbours | painter + judge |
| sydney/ferry | accepted, looks bad | a 143 px bust where the passengers' heads are ~40 px | authoring + judge |
| paris/carousel | accepted, borderline | 270 px seated, riders ~240 seated; seated where the recipe said standing | judge |
| paris/awning | accepted, looks bad | painted on top of the girl in the blue dress; feet 48 px above the recipe's support line | painter + judge |

Stage attribution of game 2's rejections from the ledger (`usageJson.ledger`): about 30 of 44 rejections were the fast reviewer's, 27 of them on `bodyPlacement`; Sol rejected 9; the shape guard 3 (two "far more than asked", one "more than one child"); the extraction guard 3 (all canoe). Every one of the five bad accepts passed both reviewers 6/6.

## 2b. Chains (after): eight targeted renders through the whole chain

`scripts/spot-trials.ts` runs the production painter, pass two, guard, composite and judge chain on one identity sheet, against the round's ledger, without touching the database. Eight renders on the reauthored and contracted spots, at medium quality. Board pictures: `work/codex-judge-audit-20260908/before-after/*.png` (game 2's exact accepted picture beside the new one) and `trials/*/composite-v2.png`.

| spot | painted | contract | what happened |
| --- | ---: | --- | --- |
| sydney/lifeguard | 156 px | 190 standing / 118 visible | **passes the guard**; the crouch under the chair sits among the sandcastle children at their size |
| paris/carousel | 381 px | 301 / 256 (layer) | **passes the guard**; the raised scale put her at the riders' size |
| antarctica/sledge | 434 px | 348 / 279 | **refused, 1.50x** — the same failure game 2 accepted, this time caught for nothing before any judge |
| giza/stones | 471 px | 307 / 126 (layer) | **refused, 1.48x** |
| paris/awning | 187 px | 379 / 95 (layer) | **refused**: her head sits 0.46 standing-heights above the authored support point — the painter put her behind the easel but further back than the spot |
| giza/stall | 368 px | 379 / 284 | **refused**: a seated child whose shoes hang 0.44 standing-heights below her seat, and 1.30x the visible height |
| sydney/lifeguard (2nd) | — | — | reached the judge; refused on identity, ageProportions and style ("oversized head, very short limbs, preschool build") |
| paris/awning (2nd) | — | — | refused by the guard, like the first |

**Corrected on 8 September after Codex's second QA.** Two errors in this table as first written. The trial script restarted its counter on each invocation and wrote to the same directory, so the second lifeguard and awning runs overwrote the first (fixed: each trial now gets its own directory). And the last row said "giza/stall (2nd)" where the ledger shows only one stall render — the eighth render was the second awning. The ledger's paint entries are the record: lifeguard 53 and 55, awning 58 and 60, stall 62, sledge 65, stones 67, carousel 69.

Six of the eight were refused, four of them by the free guard before a judge was paid. That is the round's main practical result: **the failures game 2 shipped are now caught at the cheapest stage**. It also says plainly that the painter still draws too large at these spots more often than not, so a full world run will cost more attempts than the last one, not fewer.

**What it does not say, and my first draft implied:** two spots passing the *guard* is not two spots approved. Only two new renders reached a judge at all, and both were refused. **Zero hiding spots have been approved end to end since the fixes** — guard, judge and a human look are three separate gates and only the first has been passed. The carousel's "pass" in this table is a geometry pass on a re-extraction, not a judgement.

One correction found by these trials and fixed in code: the guard first refused `paris/carousel` and both `paris/awning` renders because a layer-mode patch may legitimately be the **whole** child (the board's layer hides her afterwards), and the guard was holding it to the visible fraction. `ShapeContract.layer` now allows anywhere between the visible part and the full standing height; a seated pose may also hang below its seat (`CONTRACT_HANG_SEATED`). Both are fixtures in `placement-contract.test.ts`.

## 3. Evidence storage and admin (brief step 4)

Per attempt the ledger now carries: `evidenceAssetId` (render), `matteEvidenceAssetIds` (every pass-two answer), `patchAssetId` (the cut-out), `compositeAssetId` (what the judge saw), `judgeImageAssetIds` + `judgeImageHashes` (the exact 768/512 images on the wire, in wire order; the sheet is the identity asset the game already keeps), `judgement` (verdict, checks, reason, model, policy, reviews), `problem` (full text), `failedAt` (painter / matte / geometry / judge / judge-unknown / error), `hiddenFraction`, `unchanged`, `occluderGap`. `renderEvidenceIds` / `removeRenderEvidence` walk the new ids, so game deletion and 14-day retention cover them (tests in `recovery.test.ts` and the pipeline suite). The admin page shows every attempt as a strip (render → pass two → cut-out → judge composite) with its stage, cost and judgement; "⚠ לא נבדק" now means *nothing reviewed it*, "? השופט לא הכריע" an undecided review, "✗ נדחה בבדיקה" a failed one; a painted patch gets a note instead of the dx/dy/scale form.

## 4. Contracts and modes (brief steps 5–9)

`placement.contract = { standingHeight, visibleFraction, supportPoint, comparators }` (schema + validator: `scale` must agree with `standingHeight` within 15%, the support point must sit below the slot within one standing height). `childProblem` with a contract: visible height 0.6–1.3 of `standingHeight × visibleFraction`; the visible part within 0.6 standing-heights sideways and 0.45 up/down of where the contract puts it (top of her for peeks, from the support up otherwise). Fixtures: the sledge (1.47×) and the stall (1.41×) fail, 2× height fails, 4.9 heights drift fails, the stones peek (119×160 px over the block) passes, the carousel rider (1.06×) passes and is the judge's.

Occlusion modes: `open` / `clipped` / `layer` (`occlusionMode`). Painter: layer mode drops "let whatever is in front overlap her" and "if no occluder, a complete standing child" and says nothing may cover her; the contract's two heights are named in the model's pixels. Pass two: layer mode says nothing in image 1 is in front of her; every mode says her head, hands and feet stay at the same pixels. Judge: the recipe lines (pose, support, occlusion, comparators, visible fraction) and "hidden BY DESIGN" for layer/clipped/peeking/swimming. Retries: `repairInstruction` keeps the recipe. Layer mode: `visibleGeometry` measures the tap contract on what the layer leaves uncovered and refuses a child hidden above 85%.

## 5. Slot changes

**sydney/ferry → sydney/lifeguard** (version 5; the ferry stays in version 4 for game 2). Under the lifeguard chair, crouching between its front legs: slot `x 0.2783, y 0.4277, scale 0.093`; contract standing 0.093 (190 px; the boy sitting on the sand at the chair's left and the lifeguard on it), visible 0.62 (a crouch), support (0.2783, 0.4565) = art (855, 935). Mission "Find {name} under the lifeguard chair" / "מצאו את {name} מתחת לכיסא המציל"; item "a tall white lifeguard chair with a red and yellow umbrella"; hint "Look between the legs of the tall white chair." / "חפשו בין הרגליים של הכיסא הלבן הגבוה."; body template `sydney_lifeguard` (peeking). Sydney has no layer-mode slot any more, so its foreground layer is dropped in version 5 (the file stays for version 4). Board picture: `work/codex-judge-audit-20260908/matrix/sydney-lifeguard.png`; the ferry for comparison: `zooms/sydney-lifeguard-3x.png`, `matrix/sydney-ferry.png`.

**paris/awning** (version 5): behind the painter's easel by the café, layer mode. Polygon = canvas + tray + the three tripod legs as one shape (`scripts/author-hides.ts`, layer `foreground-20260908.webp`); support (0.2865, 0.918) = art (880, 1880); standing 0.185 (379 px; the girl in the blue dress ~370, the boy in orange ~380); visible 0.25 (her head above the canvas, her legs between the easel's legs). Copy: item "a painter's easel by the café tables", hint "Look behind the painter's easel by the café tables." Picture: `matrix/paris-awning.png`, overlay `work/occluders/author/paris-awning.hide.png`.

**Contracts installed** (`scripts/install-contracts.ts`; all measured on `zooms/` and `matrix/`):

| Spot | standing (px) | visible | support (art px) | comparators |
| --- | --- | --- | --- | --- |
| giza/stones | 0.15 (307) | 0.41 | 1900, 1660 | boy in yellow left of the block, boy in blue seated right of it |
| giza/stall | 0.185 (379), scale 0.12 → 0.185 | 0.75 | 725, 1420 | vendor's child behind the counter, boy in red crouching at the right |
| paris/bakery | 0.17 (348) | 0.40 | 2750, 1880 | girl in the straw hat at the counter, boy in blue at the basket |
| paris/carousel | 0.147 (301), scale 0.1099 → 0.147 | 0.85 | 1865, 1100 | boy riding the white horse, children at the carousel's edge |
| paris/awning | 0.185 (379) | 0.25 | 880, 1880 | girl in the blue dress, boy in orange |
| antarctica/sledge | 0.17 (348) | 0.80 | 1900, 1880 | boy in green seated on the sledge, boy in red standing beside it |
| sydney/lifeguard | 0.093 (190) | 0.62 | 855, 935 | boy sitting on the sand, the lifeguard |

## 6. Review matrix of the 27 A spots (free; `scripts/contract-matrix.ts`)

"asked" is `scale × 2048`; "neighbours" is the standing height of the children beside the spot, measured by eye on the gridded picture. v2-convention = the slot's scale encodes the *visible* part of a peek, not the standing height.

| Spot | asked px | neighbours px | verdict | note |
| --- | --- | --- | --- | --- |
| newyork/taxi | 274 | 250–330 | ok | accepted |
| newyork/pretzel | 287 | 300–330 | ok | accepted |
| newyork/bench | 160 | ~330 | under-asked (v2-convention head peek) | held (Sol timed out); no contract, not touched |
| amazon/canoe | 154 | ~330 standing / 250 seated in the canoe | under-asked; renders were right-sized, pass two moved her | no contract (scale change would change the window); retest with the new matte wording |
| amazon/macaw | 184 | ~180–220 | ok | accepted |
| amazon/roots | 160 | ~330 (peek shows ~160) | v2-convention, works | Guy praised it |
| paris/bakery | 340 | ~350–380 | ok | contract |
| paris/carousel | 225 → 301 | ~300 | under-asked, fixed | contract, scale raised |
| paris/awning | 352 → 379 | 370–380 | wrong place, fixed | easel hide |
| marrakech/lanterns | 160 | ~190–240 (far) | slightly small | accepted |
| marrakech/carpets | 297 | ~300 | ok | accepted |
| marrakech/spices | 119 | ~300 behind the cones (peek shows ~110) | v2-convention | all six renders were good peeks; judge policy is the fix |
| giza/camel | 266 | ~330 | ok (crouch) | accepted |
| giza/stall | 246 → 379 | 380–450 | under-asked, fixed | contract, scale raised |
| giza/stones | 287 | 300–320 | ok | contract |
| tokyo/crossing | 281 | 280–400 | ok | accepted |
| tokyo/stall | 164 | ~310–340 | under-asked (v2-convention) | accepted at attempt 5 |
| tokyo/blossom | 115 | ~130–150 | ok, small | six renders whole and right-sized; judge policy is the fix |
| greatwall/dragon | 205 | ~250–300 | ok (seated) | accepted |
| greatwall/lanterns | 221 | ~300 | slightly small | accepted |
| greatwall/tower | 154 | ~210–280 | slightly small | accepted |
| sydney/ferry | 160 | passengers' heads ~40 | unrecognisable depth | replaced |
| sydney/surfboards | 276 | 250–320 | ok | five rejections were identity (Sol), not placement |
| sydney/rocks | 164 | ~330 (peek) | v2-convention; the slot sits on a board child | judge policy is the fix; move the slot next round |
| antarctica/penguins | 221 | ~280 | slightly small | accepted |
| antarctica/sledge | 338 | ~350 standing, 300 seated | ok ask, painter drew 448 | contract |
| antarctica/ice | 160 | ~320 (peek) | v2-convention | attempts failed on geometry / fast judge / style |

Spots not changed keep their behaviour exactly; the eleven "v2-convention" or "slightly small" notes are for the next authoring round, with renders, not blind edits.

## 7. Judge policy

Pilot: `scripts/judge-pilot.ts` on 25 labelled cases — 5 accepted pictures Guy called wrong (his screenshots are the label), 10 accepted pictures nobody flagged (my label), 10 rejected attempts rebuilt from their kept render and matte (my label: 6 good, 4 bad). Composites of accepted cases are exact (stored patch at its stored rect, version-4 art and layer); rebuilt cases are reconstructions as in §2. Both reviewers were asked independently, with the v6 prompt (recipe + relativeScale, 4.5× window); the fast reviewer was also asked with the old v5 wire for comparison. Results are in `work/codex-judge-audit-20260908/pilot/results-*.json` (verdict, checks, reason, cost, request ids, image hashes per call).

Both reviewers, on the same 25 cases, neither filtering the other (v6 prompt, 768 px board, 4.5x window):

| reviewer | cases | cost | good -> ok / bad | bad -> ok / bad |
| --- | ---: | ---: | --- | --- |
| fast `gpt-4o-2024-11-20` | 25 | 19.8c (0.79c each) | 15 / 1 | 7 / 2 |
| strong `gpt-5.6-sol` HIGH | 25 | 160.6c (6.42c each) | 6 / 10 | 0 / 9 |

Read across, not down. **The fast reviewer cannot gate placement or scale**: it passed seven of the nine bad pictures, including all five a parent called wrong, and it was the reviewer that refused the six good peeks in the game. **The strong reviewer caught every bad picture, nine of nine**, and named the reason each time (relativeScale on the sledge, the stall, the ferry and the carousel; identity on the ferry's bust; bodyPlacement on the carousel and both canoe answers). **It also failed ten of the sixteen good ones**: seven on `style` ("smoother, more photorealistic than the board's inked linework") and five on `relativeScale` (an eyeball estimate of 1.4x-2.0x on pictures the game shipped and nobody complained about; the macaw child, seated high on a branch, it put at 1.7-2.0x).

Two things follow. The style complaint is not invented — it is the same defect Guy named on 7 September ("she looks flat and unconnected to the board in style"), and it is a property of the painter's house style rather than of one attempt. The scale complaint on non-contracted spots is the model guessing depth with no comparators to measure against, which is exactly what the contract gives it where one exists.

**Was the style complaint an artefact of the wire?** The child is about a fifth of a 4.5x window, so at 768 px she reaches the reviewer softer than the board around her. I re-judged twelve of these pictures with the same reviewer at a 1024 px board image (same four 512-px tiles, so the same tokens and the same cost):

| case | label | 768 px | 1024 px |
| --- | --- | --- | --- |
| sledge-accepted | bad | bad (relativeScale) | bad (style, relativeScale) |
| ferry-accepted | bad | bad (identity, relativeScale) | bad (ageProportions, style, relativeScale) |
| taxi-accepted | good | bad (style, relativeScale) | bad (style, relativeScale) |
| macaw-accepted | good | bad (relativeScale) | bad (relativeScale) |
| roots-accepted | good | bad (style) | **ok** |
| bakery-accepted | good | bad (relativeScale) | bad (relativeScale) |
| carpets-accepted | good | bad (relativeScale) | bad (relativeScale) |
| camel-accepted | good | bad (style) | bad (style, relativeScale) |
| dragon-accepted | good | bad (identity) | **ok** |
| stones-att2 | good | bad (style) | bad (style) |
| rocks-att2 | good | bad (bodyPlacement, style) | bad (bodyPlacement, style) |
| blossom-att1 | good | bad (style, relativeScale) | bad (style, relativeScale) |

**No.** Style failures went from six to seven and scale failures from seven to eight; the hypothesis is disproved. The bigger image did recover two false rejects (`roots` on style, `dragon` on identity) and lost neither detection, so 1024 px stays (`BOARD_IMAGE_PX`) — it is a small, free improvement, not the answer to style.

What follows is that the style complaint is about the painter, not the picture we send the reviewer, and it is not something a retry of one attempt can repair. That is why it became advisory rather than blocking.

Decision: **Shipped, and switchable at runtime (`JUDGE_POLICY`, default `screen`):**

1. **The fast reviewer may end a review alone only on identity, faceIntegrity and anatomy.** It passed seven of nine bad pictures, so it cannot gate placement or scale; and its `bodyPlacement` failures were what killed six good peeks in game 2. A fast failure on placement, scale, age or style is now a question for the strong reviewer, and a fast "uncertain" escalates instead of ending the chain. An answer that could not be verified at all (wrong model served, no usage) still fails closed without a second paid call.
2. **The strong reviewer decides placement, scale and age.** It was right on every bad picture in the set.
3. **`style` is advisory** (`ADVISORY_CHECKS`): a style failure alone makes the verdict `unknown` — the patch is kept, nothing is re-rolled, and the game goes to a person with the reason on the row. Beside any other failed check it still rejects. Reasoning in §7 above: the complaint is real and is not a per-attempt defect.
4. **`relativeScale` rejects only where the contract names comparators** (`advisoryFor`). With comparators it was right five times out of five; without them it guessed. Giving a spot a contract is what turns the scale check on for it — which is a reason to author the remaining twenty, not to trust the guess.
5. **The deterministic contract guard, not the judge, is the primary scale gate.** It refused a fresh sledge render at 1.50x for nothing, before a judge was paid — the same failure the two reviewers had waved through in game 2.

**Fixtures, tuning and holdout.** The set is 25 cases: 15 exact accepted composites (patch and rect as stored, composed on the pinned version-4 art) and 10 reconstructions from kept renders and mattes. Labels: five from Guy's own screenshots (all "bad"), twenty mine. There is **no held-out split** — the four decisions above were taken after seeing the whole set, so the counts in §7 are descriptive of that set and are not an out-of-sample estimate. Fixtures that are pinned in code instead: `placement-contract.test.ts` (the sledge at 1.47x fails, a peek over the block passes, 2x standing fails, 4.9 heights of drift fails, a layer-mode whole child passes, a seated child may hang below her seat) and `board-judge.test.ts` (the policy, the advisory rules, the seven checks, the wire images).

**Limits.** Twenty of the twenty-five labels are mine, not a parent's; I am the same person who wrote the fixes, which is exactly the bias the brief warns about. One identity, one age. The ten reconstructions are not hash-verified against the wire images of game 2, because those were not kept then. Sol's own reasons are prose, not measurements, and its scale estimates varied between 768 px and 1024 px wires on the same picture. Nothing here proves the pipeline now produces good pictures — it proves that the failures game 2 shipped are caught earlier and more cheaply.

Limits: the labelled set is small (25) and two thirds of its labels are mine, not a parent's; the rebuilt composites are not the game's wire images; one identity only. The policy is a runtime setting (`JUDGE_POLICY`) so it can be changed without a deploy of code.

## 8. Matte drift: a negative result

On the ten kept mattes of game 2, two measures of "did pass two put her where the painter did" were computed against the render (`work/codex-judge-audit-20260908/measure-drift2.ts`):

| case | truth | colour distance at 0 → best (offset, child-heights) | edge correlation at 0 → best (offset) |
| --- | --- | --- | --- |
| stones att 1 | sat on her | 75 → 33 (0.42) | 0.54 → 0.64 (0.44) |
| stones att 2 | sat | 60 → 39 (0.43) | 0.51 → 0.61 (0.65) |
| stones att 3 | sat | 49 → 13 (0.08) | 0.57 → 0.67 (0.62) |
| stones att 6 | sat | 56 → 22 (0.17) | 0.62 → 0.76 (0.17) |
| spices att 1 | sat | 37 → 27 (0.08) | 0.65 → 0.73 (0.08) |
| spices att 3 | sat | 46 → 23 (0.19) | 0.62 → 0.85 (0.18) |
| **canoe att 1** | **moved** | 60 → 46 (0.65) | 0.58 → 0.67 (0.68) |
| **canoe att 2** | **moved** | 54 → 43 (0.46) | 0.60 → 0.66 (0.28) |
| blossom att 1 | sat | 61 → 22 (0.53) | 0.62 → 0.85 (0.53) |
| rocks att 2 | sat | 55 → 45 (0.60) | 0.56 → 0.62 (0.62) |

Neither separates the two moved answers from the eight faithful ones (pass two re-paints her colours, and the re-painted edges do not anchor either). No rule was shipped; the code carries the note. What guards a moved matte: the wording ("her head, her hands and her feet stay at exactly the pixels where image 1 has them"), `unchangedFraction` (caught 3 of 6 canoe answers), and the judge on the composite (rejected the other 3).

## 8b. The open problem: layer mode paints around the object it was told to ignore

In layer mode the object that hides the child is cut out of the board into the scene's foreground layer and drawn over her afterwards, so the painter is asked for a complete child in the open. But the object is **still in the crop the painter is given** — the easel is there, the inscribed block is there — and the painter does the natural thing and paints the child behind it. The board's copy is then composed over a child who is already cut, and the result is a body that ends twice, or a patch that floats.

Two instances, both confirmed on the pictures:

- `giza/stones` attempt 1 of game 2: the painter redrew the block *and* cut her at it; the composite put her torso over open sand.
- `paris/awning` trial of 8 September: asked for a complete 379 px child, the painter drew 187 px — her head and shoulders above the easel canvas — and placed her further back than the authored support point. The extraction then kept a rectangular block rather than a silhouette. The guard refused it, so no judge was paid.

The v9 wording ("NOTHING in this picture may cover any part of her") did not stop it. What would probably work is not a stronger sentence but a different input: paint on a crop with the occluder **erased**, so there is nothing to paint behind, and only then compose the board's copy over her. That is a real change to what goes over the wire, it needs its own renders to prove, and I did not ship it on the strength of two cases at the end of a round.

Until then the honest position is: **the three layer-mode spots (giza/stones, paris/bakery, paris/carousel) and the new paris/awning are the least reliable of the twenty-seven**, the guard catches the resulting patches rather than preventing them, and the carousel is the only one that produced a passing render today.

## 9. Paid calls and cost

Ledger: `work/codex-judge-audit-20260908/budget/requests.json` (every call reserved before it was made; limit 500 cents for the round). No render was bought for a game; no game was created; no mail was sent; no ceiling (`GENERATION_DAILY_CENTS`, `GENERATION_WORLD_CENTS`) was changed.

| calls | what | cents | of which charged at the reservation (bill unknown) |
| ---: | --- | ---: | ---: |
| 25 | judge, fast reviewer, pilot | 19.81 | 0 |
| 27 | judge, strong reviewer, pilot | 214.64 | 2 |
| 12 | judge, strong reviewer, 1024 px re-check | 72.56 | 0 |
| 8 | painter, targeted trials | 58.97 | 0 |
| 8 | pass two, targeted trials | 26.07 | 0 |
| 2 | judge, targeted trials (the six others were refused by the guard before any judge) | 16.02 | 0 |
| **82** | **total** | **408.07** | 2 |

The two entries charged at their reservation are **not both timeouts**, as this report first said. One is the strong reviewer timing out at 60 s (`newyork/bench` had done the same in game 2). The other is an answer that *arrived* and was lost when the ledger could not be written: it had grown to 500 MB because the judgement it stored carried its wire images as JSON arrays, and `JSON.stringify` refused. Of the 408.07 cents, **354.05 are backed by saved answers with a known cost and 54.03 are reservations consumed without the real bill ever becoming known**. Both were charged in full rather than at zero, which is why the ledger reads higher than the sum of the answers received; the timeout is also why `STRONG_TIMEOUT_MS` is now 90 s and `JUDGE_MIN_MS` 145 s. No render was bought for a game, no game was created, no mail was sent, and `GENERATION_DAILY_CENTS` and `GENERATION_WORLD_CENTS` were not touched. Ledger: `work/codex-judge-audit-20260908/budget/requests.json` (every call reserved before it was made; limit 500 cents).

## 10. Code, tests, commits, deploy

Code (all under `src/`, `content/`, `scripts/`, `docs/`; `work/` and `output/` are private and not committed):

- `src/domain/scene/schema.ts` — `PlacementContractSchema`, `placement.contract`, validator rules (scale vs standing height, support point below the slot).
- `src/services/generation/patch.ts` — `occlusionMode`, `contractPx`, `shapeContract`, contract-aware `childProblem` (`CONTRACT_*`), `visibleGeometry`, mode-aware `slotPrompt` (v9) and `matteHint`, polygon diagnostics in layer mode, the matte-drift note.
- `src/services/generation/extract.ts` — occlusion mode to pass two; diagnostics in every mode.
- `src/infra/generation/openai.ts` — `mattePrompt` by mode (wire v5), the "stays at the same pixels" sentence.
- `src/infra/generation/types.ts` — `SlotMatteRequest.mode`, `PatchJudgement.wireImages/policy`, `PatchJudgeInput.recipe`, `JudgeRecipe`.
- `src/infra/generation/board-verdict.ts` — v6 prompt, `relativeScale`, `recipeLines`.
- `src/infra/generation/judge.ts` — `JudgePolicy` (`screen`/`chain`/`strong`), `fastMayDecide`, `judgementForJson`, `reviewWith`, `STRONG_TIMEOUT_MS` 90 s, wire images returned.
- `src/services/generation/board-composite.ts` — 4.5× judge window, 640 px floor.
- `src/services/generation/slot-patches.ts` — evidence per attempt, `failedAt`, `problem`, `judgement`, `recipeOf` (with the body-template fallback), `visibleGeometry` in layer mode, `repairInstruction` inside the recipe, `JUDGE_MIN_MS` 145 s.
- `src/services/generation/render-evidence.ts` — the new ids in deletion and retention.
- `src/services/generation/authoring.ts` — contract heights and mode in the authoring prompt (same as the pipeline).
- `src/services/admin.service.ts`, `src/app/admin/orders/[gameId]/page.tsx`, `AttemptStrip.tsx` — attempts per spot, review labels, no adjust form for painted patches.
- `src/lib/env.ts`, `src/services/container.ts` — `JUDGE_POLICY`.
- `content/scenes/{sydney,paris,giza,antarctica}/scene.json` (v5), `content/scenes/releases/pre-contract-20260908.json`, `content/scenes/index.ts`, `content/body-templates/index.ts` (`sydney_lifeguard`), `public/scenes/{paris,giza}/refresh-20260907/foreground-20260908.webp`.
- `scripts/author-hides.ts` (easel row, ferry row removed, `--tag`), `scripts/install-contracts.ts`, `scripts/contract-matrix.ts`, `scripts/judge-pilot.ts`, `scripts/spot-trials.ts`, `scripts/budget-reconcile.ts`.
- Tests: `placement-contract.test.ts`, `occlusion-modes.test.ts`, `recipe.test.ts`, `admin-attempts.test.ts`, `board-judge.test.ts` (policy, seven checks, wire images, recipe), `recovery.test.ts` (new evidence ids), `generation-pipeline.test.ts` (three evidence pictures per attempt, stage and judgement on a rejected attempt), `scene-versions.test.ts` (version 5 and the archived layer), `tone-match.test.ts` (prompt v9).
- Docs: `docs/SPRITE_PATCHES.md` (new first section), this report.

Second commit `a48a873` (everything the eight trials and the fifty judgements changed): `ShapeContract.layer` and `.seated` with the edge-anchored place check (`patch.ts`), `ADVISORY_CHECKS` and `advisoryFor` (`board-verdict.ts`), `BOARD_IMAGE_PX` 1024 and `STRONG_TIMEOUT_MS` 90 s (`judge.ts`), the ledger no longer storing Buffers (`generation-budget.ts`), `scripts/budget-reconcile.ts`, the pilot's dead v5 mode removed, per-trial directories, and their tests.

Checks: `npm run check` (tsc + vitest) green at both commits — 71 files, 500 tests at `a48a873`; `npm run scenes:validate` green (warnings only, all pre-existing). Commit `99a0b28` on `master`, pushed to the `find-me` remote, staged by file name after a secret-pattern scan of the staged diff; `work/`, `output/`, `tmp/` and the root PDFs were not staged.

Deploy: QA only (`find-me-qa`, alias `qa.findmeworlds.com`), deployment `dpl_9J7PoyvChg6Z29a6Z43gSiR2BjJ4`, state READY, `gitCommitSha 99a0b28…`, target production, built from the CLI upload with `APP_COMMIT=99a0b28`. The CLI printed "Not authorized" after "Deploying outputs…" (its final poll), but the deployment itself completed and is aliased — confirmed through the Vercel API (`get_deployment`). Deployed with no generation running (0 RUNNING jobs, 0 games in a generating status at the time; the two MANUAL_REVIEW games untouched). `/api/health` answers `QA_ACCESS_REQUIRED` from outside the gate, as designed. Production stays paused; no environment variable was added or changed (`JUDGE_POLICY` defaults to `screen` in code).

Third deploy, after Codex's second QA: `dpl_rAFb2waxjPrpjYqccA8BaiHidXbJ`, state READY, `gitCommitSha 0b4d88f...`, aliased to `qa.findmeworlds.com`. Checked again first: 0 RUNNING jobs, 0 games generating. `npm run check` green (71 files, 500 tests) and `scenes:validate` clean at that commit.

Second deploy: `dpl_8iWjsM7xjNQDBJyLDVspYJi5mXaH`, state READY, `gitCommitSha a48a873…`, aliased to `qa.findmeworlds.com`, built with `APP_COMMIT=a48a873`. Checked again before deploying: 0 RUNNING jobs, 0 games in a generating status. **QA now runs the code this report describes.**

**What I could not verify, and it matters:** the two admin screens were checked at build level only — the Next build type-checks and page-collects `/admin/orders/[gameId]` with the new attempt strip, and the unit tests cover `attemptsForAdmin` and `parseJudge` — but I did not log in behind the QA password gate to look at the rendered page. The first person to open game 2's order page should confirm that the per-attempt strip shows what it claims, because it is the screen the whole evidence argument rests on.

## 11. Can a new QA game be created now?

**Yes for a small run, not yet for a full world.**

What is safe now: a **targeted harness run** (`scripts/spot-trials.ts`) over a handful of representative spots, watched through the new admin view. Not a customer game on one board — Codex is right that no such thing exists: the smallest package is nine boards and checkout enforces it, so "create a one-board game" was not an instruction anyone could follow. Nothing blocks it — QA is deployed with this commit, no generation is running, the two review games are untouched, production stays paused, and the ceilings are unchanged.

Why not a full world tonight: of eight fresh renders on the contracted spots, six were refused, four of them by the free guard. That is the guard doing its job on renders game 2 would have shipped, but it means a 27-spot run would burn noticeably more attempts than the last one and would probably end with several spots unfinished at three attempts each. The cost of finding that out on a whole world is roughly $5–9; the cost of finding it out on one board is under a dollar.

The precise risks that remain:

- **The painter still draws too large** at the sledge, the stones and the stall. The contract now catches it; nothing yet fixes it. If a full run is wanted first, expect those spots to fail rather than ship badly.
- **Twenty of the twenty-seven spots have no contract**, so they keep the old generic limits and the scale check stays advisory there. They are exactly as safe, and exactly as unsafe, as they were in game 2.
- **`style` will hold most games for a person.** That is deliberate, and with `QA_DELIVER_WITH_PROBLEMS` on in QA the game still reaches the tester with an admin alert. On a real customer it would wait.
- **Layer mode is unproven** (§8b). Four spots use it, the painter still paints around the object it was told to ignore, and only the carousel produced a passing render today. If one board is chosen for the small run, choose one without a layer-mode spot (newyork, marrakech, tokyo, greatwall, antarctica) to test the contract work on its own.
- **The daily ceiling still double-counts** (memory note of 7 September): `GENERATION_DAILY_CENTS` is 4000 in QA and a game stalls silently at roughly half that. A world run should be started early in the UTC day.

Safe next step, in order: one board, read the attempt strips, and if the guard's refusals look right, author contracts for the remaining twenty spots before spending a world.

## 12. Codex's second QA (same day), and what it changed

Codex reviewed `de2a064` and found seven things this report had got wrong or left broken. Its package is `work/codex-qa-second-20260908/`. I reproduced every one before acting on it; all seven are fixed above, and three deserve naming here because they change what this report claims.

**A child's picture survived deletion.** Codex shipped a failing test and it failed here too: after `defer → resume → delete`, one `PATCH_EVIDENCE` asset was still `READY`. A resumed attempt re-extracts and overwrites the pointer to the patch and composite it had already stored, and deletion only walks what the ledger still points at. Every picture an attempt stores is now appended to a list nothing rewrites, and the ledger is written before the store returns, so an overwritten pointer or a crash cannot orphan one. Codex's test passes; the same check is now in the product suite so it cannot come back. This is the most serious finding of the day and it was mine to have caught.

**The carousel was never behind the carousel.** The polygon "from the planning run" sits on the paving in front of the carousel, and so did the contract's support point I installed on top of it. The layer was therefore copying cobblestones and a passing child over the painted child's legs. My §2b called this spot a pass. It was a pass of the guard on a picture that is wrong, which is exactly the confusion this round was supposed to end. The spot is now what the board actually affords — a child standing on the square in front of the carousel, open mode, no layer — and Paris keeps one layer-mode hide, the bakery basket.

**"Two spots pass" was not true.** Only two new renders reached a judge at all and both were refused; the carousel's pass was a geometry re-check after I had changed the rule. **Zero hiding spots have been approved end to end since the fixes.** §2b now says so.

Two of Codex's recommendations I have not done, and they stay open: a shared post-extraction evaluation used by both the product and the harness (the harness still records `hiddenFraction` without enforcing it), and an immutable run/attempt id with refusal to overwrite. Both are real; neither is a defect in what ships.

Codex's decision — **the placement fix is not approved and the world should not be widened** — stands, and this report's own answer in §11 does not disagree with it.

