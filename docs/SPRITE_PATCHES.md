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

| | |
| --- | --- |
| one model call | **$0.07** and ~55s (2,944 tokens: 1,188 in, 1,756 out) |
| per hiding spot | one call for 26 of 27 spots; budget **~$0.08** with retries |
| a 3-world game, variant A only | 1 sheet + 9 spots = **~$0.70**, ~10 minutes |
| a 3-world game, both variants | 1 sheet + 18 spots = **~$1.30** |
| all nine worlds, variant A | 27 spots = ~$2.00 |

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
   is wider than it is tall, or is centred away from the slot. Area alone passes a repainted sandcastle.

## When a spot fails

`scripts/compare-edit.ts` tells the three cases apart in one call — it measures
how much of the crop actually changed:

* **She was painted where we were not looking.** High diff, empty patch. This was
  eight of twenty-seven spots on the first run: `images/edits` reads the mask as
  "where you may edit", not "put her exactly here", so she lands a little outside
  the ellipse and a tight clip throws her away. The search area (`--grow`,
  default 3.6x the child) is what fixes it, not another roll.
* **The whole window was re-rendered.** High diff everywhere, and the "patch" is
  the entire 648px crop. `childProblem()` rejects it as far taller than the child
  we asked for. Another roll usually works.
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

## Rules that keep it excellent

- The context crop must include the objects that will occlude the child (castle, parasol, rock): the
  model needs to see them to paint the child behind them.
- Ask the model to keep the child *small like the people nearby*; the prompt states the pixel height.
- Never let the model touch pixels outside the mask; the diff step throws away tiny drift anyway,
  but big drift (a re-rendered crop) produces a patch as large as the crop.
- Keep `slot.scale` honest — it drives the crop size, the mask and the prompt. It no longer drives the
  hit-test: that comes from the patch itself.
