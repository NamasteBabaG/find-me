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

One inpaint call per slot. 3 worlds × 3 spots × 2 variants = 18 calls (54 for 9 worlds); ship
variant A only (9 calls for 3 worlds) and generate B lazily on the first replay.

**The per-call cost is not yet measured.** The script currently uses `gpt-image-2`, which is billed by
image input/output tokens rather than a flat per-image price, and the account is rate-limited on images
per minute — so a real run needs a queue, not a burst of 18 calls. Before committing to a price, record
`usage`, retries, model and wall-clock for every call and derive the real number from a batch of ten
children. Cheaper inpaint models (Flux Fill / SDXL-inpaint class) are the fallback if the measured cost
does not fit the margin. The face sticker (avatar) stays a single generation that seeds every patch with
the same likeness.

## Tooling (today: manual, with the image model in chat)

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

## Production pipeline (when a real generation provider is wired)

`GenerationProvider.generateTargetSprite()` receives `{ scene, target, slot, contextCrop, mask, avatar, prompt }`
and returns the edited crop. `runGenerationPipeline` then runs the same diff step (shared with the
script), stores the patch as a `GAME` asset and writes the sprite as
`{ kind: "image", url, width, height, rect, hitRect, anchor }` (fractions of the art) into the config.
QA in `/admin` shows the patch on the world exactly as the player sees it; "regenerate" re-runs one slot.

## Rules that keep it excellent

- The context crop must include the objects that will occlude the child (castle, parasol, rock): the
  model needs to see them to paint the child behind them.
- Ask the model to keep the child *small like the people nearby*; the prompt states the pixel height.
- Never let the model touch pixels outside the mask; the diff step throws away tiny drift anyway,
  but big drift (a re-rendered crop) produces a patch as large as the crop.
- Keep `slot.scale` honest — it drives the crop size, the mask and the prompt. It no longer drives the
  hit-test: that comes from the patch itself.
