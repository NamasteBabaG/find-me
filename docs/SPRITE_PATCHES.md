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
   The patch is an `image` sprite with a `rect`, so the renderer draws it where it belongs while the
   hit-test still uses the slot footprint (the child), not the patch.

Because the child is seen small, patches are tiny (a few tens of KB). A whole game is a handful of
small images — the "sprite sheet of the child in every world" the product needs, produced once.

## Cost

One inpaint call per slot. 3 worlds × 3 spots × 2 variants = 18 calls (54 for 9 worlds).
Variant B can be generated lazily on the first replay. With a cheap inpainting model
(Flux Fill / SDXL-inpaint class, ~$0.005–0.02 per call) a 3-world game costs $0.10–0.40 to
generate, well inside the ~25% margin target. The face sticker (avatar) stays a single generation
that seeds every patch with the same likeness.

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
```

The landing page's "From photo to character" section reads `public/demo/patches/beach-sandcastle-A.json`
automatically: once the patch exists, the world card shows the character painted into the beach,
glowing, with the speech bubble anchored at the slot. Without it, the card shows the world alone.

## Production pipeline (when a real generation provider is wired)

`GenerationProvider.generateTargetSprite()` receives `{ scene, target, slot, contextCrop, mask, avatar, prompt }`
and returns the edited crop. `runGenerationPipeline` then runs the same diff step (shared with the
script), stores the patch as a `GAME` asset and writes the sprite as
`{ kind: "image", url, width, height, rect: { x, y, w, h } }` (fractions of the art) into the config.
QA in `/admin` shows the patch on the world exactly as the player sees it; "regenerate" re-runs one slot.

## Rules that keep it excellent

- The context crop must include the objects that will occlude the child (castle, parasol, rock): the
  model needs to see them to paint the child behind them.
- Ask the model to keep the child *small like the people nearby*; the prompt states the pixel height.
- Never let the model touch pixels outside the mask; the diff step throws away tiny drift anyway,
  but big drift (a re-rendered crop) produces a patch as large as the crop.
- Keep `slot.scale` honest — it drives the crop size, the mask, the prompt and the hit-test.
