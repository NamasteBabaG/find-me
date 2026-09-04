# Slot patches — painting the child into a pre-rendered world

## The problem

Worlds are illustrated once and never re-rendered. The only thing that changes per game is the child.
A character rendered on its own (any style, any model) and pasted onto the world never blends: the
light, the line quality, the palette and, above all, the occlusion are wrong. It always reads as a sticker.

## The idea

Don't render the child in isolation. Render the child **into the world**, but only in a small window:

1. **Context crop.** For every hiding slot (3 per world × 2 variants) cut a square around the slot
   (~7× the child's height, 384–768px) out of the base art, plus a mask marking where the child goes.
2. **Inpaint.** Give an image model the crop, the mask, the child's reference (photo or the illustrated
   character) and a prompt built from the scene data (mission, body template). The model paints the
   child *in that spot*, in the picture's own style and light, behind whatever is naturally in front.
3. **Diff to a patch.** Compare the result with the original crop and keep only the changed pixels
   (threshold → open → feather). What remains is a small transparent image: the child, their shadow,
   and any object the model redrew in front of them.
4. **Place.** The patch goes back at the exact same pixel coordinates. Backgrounds stay untouched.
   The patch is an `image` sprite carrying the whole tap contract (below).

Because the child is seen small, patches are tiny (a few tens of KB). A whole game is a handful of
small images — the "sprite sheet of the child in every world" the product needs, produced once.

## The tap contract

A patch is a piece of the world, so where it is *drawn* is not where the child *is*. Three
rectangles/points, all in fractions of the art, and every one of them comes from the patch's own
alpha — never from the slot the patch was generated at, which sits lower and smaller:

| field     | meaning                                  | used by                                   |
| --------- | ---------------------------------------- | ----------------------------------------- |
| `rect`    | where the patch image is drawn           | `SceneViewport`, `StaticScenePreview`     |
| `hitRect` | the painted child's own footprint        | hit-testing (plus finger padding)         |
| `anchor`  | top-centre of the head                   | speech bubbles, the level-3 magnifier     |

`scripts/patch-hitbox.ts` computes `hitRect`/`anchor` from the finished `.webp`; `slot-patch.ts import`
does it automatically for new patches. `src/game/engine/target-geometry.ts` is the single place that
turns a target + variant into `{ hitRect, head, center }` so drawing, tapping and bubbles cannot drift
apart — they did once, and tapping the visible head did nothing. `automatedQa` refuses a patch that is
missing either field, and `/admin/scenes/<slug>` draws the hitbox and head point over the world.

## Cost

One inpaint call per slot, plus one identity sheet per child.

**Measured**, generating every hiding spot of all nine worlds (`gpt-image-2`, quality `medium`,
1024x1024, two input images):

A world is nine boards of three missions each, so **one world is 27 hiding
spots** — not nine. (That arithmetic was wrong here until a live game counted
itself.)

| | |
| --- | --- |
| one model call | **$0.07** and ~55s (2,944 tokens: 1,188 in, 1,756 out) |
| per hiding spot | one call for 26 of 27 in the authoring run; budget **~$0.08** with retries |
| **one world, variant A** | 1 identity sheet + 27 spots = **~$2.00** and ~25 minutes |
| one world, both variants | 1 sheet + 54 spots = **~$3.85** |

At ILS 39 that is roughly a fifth of the revenue for a one-world game — workable,
but it is the number that decides whether `GENERATION_BOTH_VARIANTS` can ever be
turned on, and the number to beat with a cheaper inpaint model.

At ILS 39 for three worlds that is about 8% of revenue on generation for a variant-A game — inside the
margin, with room for the retries a hard photo needs. Every call records its real `usage`, model,
attempts and duration on the `TargetVariantAsset` row, so this table is refreshed from data rather than
re-estimated. `npx tsx scripts/prepare-boards.ts generate` writes the same numbers to
`work/boards/cost.json`. Cheaper inpaint models (Flux Fill / SDXL-inpaint class) are the fallback if
the mix shifts.

## Tooling

```bash
# 1. export the crop + mask + prompt for a slot
npx tsx scripts/slot-patch.ts export beach sandcastle A
#    → work/patches/beach-sandcastle-A.crop.png / .mask.png / .json (the prompt is printed)

# 2. generate: give the model the crop, the mask, the character reference and the prompt.
#    Ask for the SAME size image back; only the masked area should change.

# 3. import the edited crop → transparent patch + rect JSON (+ a preview on the world)
npx tsx scripts/slot-patch.ts import beach sandcastle A path/to/edited.png
#    → public/demo/patches/beach-sandcastle-A.webp + .json, work/patches/...preview.png

# (re)compute the tap contract of existing patches from their alpha
npx tsx scripts/patch-hitbox.ts [dir=public/demo/patches]
```

The landing page's "From photo to character" section reads `public/demo/patches/beach-sandcastle-A.json`
automatically: once the patch exists, the world card shows the character painted into the beach,
glowing, with the speech bubble anchored at the slot. Without it, the card shows the world alone.

## The production pipeline

`GENERATION_PROVIDER=openai` turns this on. `runGenerationPipeline` then does, per game:

1. **Identity sheet** (one call). `AvatarProvider.createCharacter()` redraws the uploaded photo as a
   2x2 sheet of the same child — portrait, standing, from behind, crouching — in the worlds' style.
   It is stored PRIVATE as an `IDENTITY_SHEET` asset and is the reference for every patch, which is
   what keeps her the same child in nine worlds. The round cover avatar is cut from its top-left
   quadrant, so it costs nothing extra.
2. **One call per hiding spot.** `AvatarProvider.editSlotCrop()` gets the context crop, the mask and
   the sheet. The result goes through the shared `diffToPatch`, and the patch is stored as a `GAME`
   asset with its geometry on a `TargetVariantAsset` row — one row per (target, variant), with its
   own status, attempts, model, token usage, duration and cost. That is the unit QA approves and
   "regenerate" re-runs; a bad spot B never touches a good spot A.
3. **Compose.** `composeGameConfig` reads those rows into `spriteByVariant`, each sprite carrying
   `rect`, `hitRect` and `anchor`. `automatedQa` refuses a patch missing either of the last two.

`GENERATION_BOTH_VARIANTS=true` generates spot B as well; by default only A is generated, which is a
complete playable game at half the cost. Rate limiting lives in the provider (`GENERATION_RPM`), so
27 spots pace themselves instead of bursting into a 429.

## Preparing a board

A world is ready to receive a child when all six of its spots are places a child can be painted into.
That is a property of the scene, not of any child, so it is checked without spending anything:

```bash
npx tsx scripts/prepare-boards.ts audit           # every world; work/boards/index.html to look at
npx tsx scripts/prepare-boards.ts generate beach  # real patches + measured cost per spot
```

`audit` renders the six windows of each world with the paint area drawn on top, and refuses a slot that
is jammed against an edge (the model cannot paint an occluder that is outside the window), too small to
recognise, or too big to be hiding.

## Isolating the child

`images/edits` does not paint only inside the mask: it returns a fresh rendering of the whole crop that
merely resembles the input. Three things turn that into a clean patch, and all three are needed:

1. **Colour match.** Fit the edited crop back to the original on the pixels *outside* the paint area,
   where nothing should have changed. This removes the global drift that otherwise leaves sand and
   castle edges in the patch.
2. **Two-tier threshold + main blobs.** Inside the paint ellipse a small difference counts; outside it
   only a large one does. What survives is reduced to the largest connected blob plus nearby fragments
   (a hat brim behind a post is part of her; flip-flops two metres away are not).
3. **Shape check.** `childProblem()` refuses a patch that is not roughly the height we asked for,
   is wider than it is tall, is scattered rather than solid, or sits away from the slot. Area alone
   passes a repainted sandcastle, so the rule looks at proportions instead.

### What the shape check measures, and against what

Every threshold here decides whether a roll that has already been paid for is kept, so each one is
measured against something that is actually on the canvas:

| Check | Measured as | Rejected when |
| --- | --- | --- |
| Height | painted height ÷ the height asked for | below 0.45 or above 2.2 |
| Proportion | painted width ÷ painted height | above 1.6 |
| Solidity | blob area ÷ the painted bounding box | below 0.22 |
| Distance | offset ÷ **max(painted height, height asked for)** | above 2.5 |

Two of these used to be measured against the wrong thing, and between them they threw away roughly
half of every roll paid for:

* **Solidity used to be absolute area** — the blob against the area a whole child would cover. A child
  crouched behind market sacks shows a third of her silhouette, which is exactly the hiding the prompt
  asked for, and she was rejected for it. Judged against her own outline she passes, while scenery
  edges scattered across a person-sized box still do not.
* **Distance used to be measured in the height we asked for, and held to 1.6.** A child painted 1.7×
  larger than requested stands proportionally further from the slot point, so one deviation was
  counted twice — and the limit itself was too tight. The model reads the mask as "where you may
  edit" and puts her at the nearest place that makes sense: behind the lifebuoy, in front of the bus,
  under the kite. That is two body-heights out often enough, she is still at the landmark the mission
  names, and the tap contract follows the patch rather than the slot, so she is perfectly playable.
  The search area (`grow`) already bounds how far she can be found at all; this rule only has to catch
  the edge of it.

Both are pinned by `src/services/__tests__/child-problem.test.ts`, whose cases are real renders with
their real numbers. Move a threshold and that file should be what argues with you.

## When a spot fails

**Look at the render before paying for another.** Rejected renders are kept: the pipeline stores them
privately against the variant row (`rejectedAssetIdsJson`), and the authoring script leaves the last one
at `work/patches/<world>-<spot>-<variant>.edited.png`. `diagnose` reads one back and prints the numbers
above, for free:

```bash
npx tsx scripts/slot-patch.ts diagnose market spices A
```

A run of height rejections at one slot is usually not a bad model but a slot whose `scale` disagrees
with the board's own perspective — the model paints a person the size that spot really is. `diagnose`
prints the scale that would match one render; for the whole picture, ask the game:

```bash
npm run game:status -- <gameId> --scales
```

That re-measures every render the game already threw away, so it costs nothing, and reports the
median painted height against the asked height per spot. One render being off is chance, so it only
calls a slot wrong on three or more. From the validation game:

```
park/picnic         1.75x over  5 renders   slot scale 0.05    → 1.7x bigger than this slot asks
jungle/binoculars   3.11x over  8 renders   slot scale 0.06    → 3.1x bigger than this slot asks
space/astronaut     0.53x over  4 renders   slot scale 0.055   → 1.9x smaller than this slot asks
```

`jungle/binoculars` had failed nine times across three runs, and every render was a child, in the
right place, about three times too large — the model will not be talked out of the board's own
perspective. The answer is usually to **move the slot**, not to raise its `scale`: the scale that
would match here is 0.187, and `scenes:validate` already warns above 0.085, because a child that big
does not have to be looked for.

`scripts/compare-edit.ts` tells the three cases apart in one call — it measures
how much of the crop actually changed:

* **She was painted where we were not looking.** High diff, empty patch. This was
  eight of twenty-seven spots on the first run: `images/edits` reads the mask as
  "where you may edit", not "put her exactly here", so she lands a little outside
  the ellipse and a tight clip throws her away. The search area (`--grow`,
  default 3.6x the child) is what fixes it, not another roll.
* **The whole window was re-rendered.** High diff everywhere, and the "patch" is
  the entire 648px crop. `childProblem()` rejects it as far taller than the child
  we asked for. This is the most expensive failure mode left, and the prompt is
  built against it — it opens and closes by refusing to redraw anything. Another
  roll usually works.
* **The picture came back untouched.** Mean diff near zero, "no changed pixels".
  Another roll, and if it persists the slot is the problem.

`prepare-boards generate` skips spots that already have a patch, so a retry pass
is cheap and targeted:

```bash
npx tsx scripts/prepare-boards.ts generate park ship --tries=4   # only the missing spots
```

A spot that keeps failing is telling you something about the slot: too little to
hide behind, or a situation the model cannot picture. `--pose` gives it a
concrete instruction, and moving the slot is a legitimate answer.

## Shape is not identity

The checks above ask whether the patch is shaped like a child. They do not ask whether it *is* the
child, and over one nine-board game four of twenty-six accepted patches were not: a scooter with
nobody on it, a horse's head, a pair of legs, and a partial body. Nothing downstream could tell —
the composer places what it is given and automated QA measures rectangles.

So a vision model looks at the cut-out beside the identity sheet and answers one narrow question:
**is this her, with her face visible?** That is the test the game itself needs. A child peeking over a
market basket with only her head showing passes, because that is the hiding we asked for; a pair of
legs does not, because nobody can find "Noa" in something with no face.

```bash
npx tsx scripts/judge-patches.ts <gameId> --out=work/judged   # judge a game's finished patches, write back nothing
```

That script is how the judge was measured before it was allowed to reject anything a customer had
paid for: on those twenty-six patches it rejected exactly the four bad ones — naming the horse — and
passed all twenty-two good ones. It costs about $0.0026 a judgement against $0.07 for a roll.

A judge that cannot answer never guesses. The patch is kept, the row records `unknown`, and the
pipeline sends that game to `MANUAL_REVIEW` rather than delivering it on the strength of its
rectangles. With no judge configured (the default, and every mock setup) nothing changes.

## A bigger child is a cheaper child

From one nine-board run (27 spots, 33 rolls), grouped by the height the slot asks for:

| Child height | Painted | Rolls per finished spot |
| --- | --- | --- |
| 140px+ | 3 of 3 | 1.3 |
| 110–139px | 2 of 5 | 2.5 |
| 95–109px | 7 of 11 | 1.9 |
| under 95px | 5 of 8 | 2.4 |

One run and 27 spots is not a law, but the top row is worth noticing: the largest slots landed every
time on barely more than one roll each, and everything smaller cost roughly twice as much. That is
the honest tension in slot authoring — `scenes:validate` warns when a slot is large because "children
should have to look", and this is what the difficulty costs. A slot that keeps failing for height is
also usually one whose `scale` disagrees with the board's own perspective; `diagnose` prints the scale
that would have matched.

The most expensive failure mode by far is the model returning a fresh painting of the whole window.
It is inherent to `images/edits` — the mask guides the model, it does not constrain it — so the prompt
is written against it and the retry is the fallback.

## The child has to be painted in the boards' style

The identity sheet is generated from a **piece of a real board** (`styleReference()`), not from a
description of one. Words do not carry a painting style: asked for "warm storybook collage", the model
draws its own house style — a soft, nearly photographic child — who then cannot be painted into a
cel-shaded world without looking pasted on. The prompt names the failure explicitly ("no photographic
skin, no rendered strands of hair") because naming it is what stops it.

```bash
npx tsx scripts/character.ts assets/random-girl.png --out=work/char --style=beach
npx tsx scripts/character.ts assets/random-girl.png --out=work/plain --style=none   # the old behaviour
```

## Rules that keep it excellent

- The context crop must include the objects that will occlude the child (castle, parasol, rock): the
  model needs to see them to paint the child behind them.
- Ask the model to keep the child *small like the people nearby*; the prompt states the pixel height.
- Never let the model touch pixels outside the mask; the diff step throws away tiny drift anyway,
  but big drift (a re-rendered crop) produces a patch as large as the crop.
- Keep `slot.scale` honest — it drives the crop size, the mask and the prompt. It no longer drives the
  hit-test: that comes from the patch itself.
