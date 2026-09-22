# Marrakech — local search-item correction after art approval

2026-09-18. The user approved v5's visual direction and asked to continue. **v8 is the corrected art candidate; it is not an activated or playtested board.**

## Final asset

- `output/imagegen/journey-marrakech-v8-inner-targets.png`, 3840 × 2160, 23,327,761 bytes.
- SHA256 `a17bef0ac10f636897fe76ee1a5c14d661c5149ab4995ba4f8e21e57fc437155`.
- Exact original source: approved v5, hash `065299bfc0042333614256e9e860270f119832f7d62dfac63f93fc776248edee`.
- Existing authorized API credential, bundled Imagegen CLI, `gpt-image-2`, high quality. No new private portrait supplied. Six image calls for this Marrakech correction: one 4K multi-region attempt, then five native 1024px crop edits. The final mask composition did not use a further API request. CLI does not return billed cost.

## What actually happened

The first whole-frame masked edit removed three unwanted foreground props reasonably, but changed other surfaces, misplaced the camel, and confused the added slipper/gecko/key. **v6 was rejected.** A rectangle-based composition of that output was also not accepted.

Five separate crop edits then rendered the small slipper, key, gecko and camel, plus cloth behind the removed original camel. The crop outputs still reinterpreted some surrounding geometry. **Do not use those whole crops as replacement scene tiles.** v7's broad rectangle composition was rejected, particularly at the tea-table leg and tile grid.

v8 uses tightly masked API-rendered prop silhouettes over the approved original surfaces, plus four local cleanup areas. No new illustrations were procedurally drawn. No face, outfit, framing, brightness or global texture revision. The mechanical composition preserves every original pixel outside the authorized cleanup/insertion masks: **0 changed pixels outside; 227,356 changed pixels inside** (about 2.74% of the full canvas). This proves source preservation, not perfect local seam quality or gameplay readiness.

Reproducibility: `scripts/art/marrakech-v6-item-masks.mjs`, `marrakech-v7-crop-masks.mjs`, and `marrakech-v8-preserve-surface.mjs`. Original, rejected outputs, masks, prompts and inspection crops are preserved. Crop prompt text and instructions are in the v7 script and `output/imagegen/journey-marrakech-v7-evidence/`. First attempt's prompt is `docs/art/journey-marrakech-v6-inner-targets.prompt.txt`.

## Pixel inspection

The full final board, four native target crops, both unchanged target crops and four removal areas were inspected. All six distinctive target designs are visibly present. The red/cream slipper is now beside the story group; the key has a single bow, shaft, teeth and magenta tassel beside the pastry tray; the violet gecko has a slender tail and splayed feet on the central fountain mosaic; the small metal camel stands among the tile display. Old large foreground versions are removed. The camel puppet in the story is a visibly different cloth prop, not a duplicate silver target.

The amulet and crescent cup are pixel-identical to v5. The amulet remains higher than the original planning band; do not claim a live HUD-safety pass. The compact targets need actual zoom/touch and age-appropriate difficulty verification; rarity alone is not that evidence. The outer cleanup textures were reconstructed locally, not guaranteed to duplicate the previously occluded material. Fine seam and placement feedback remains welcome before activation.

Observed candidate positions and hints: `docs/art/journey-marrakech-v8-target-draft.json`. These are approximate visual boxes, NOT final game hitboxes. No imported old coordinates.

## Boundary

No `public/scenes`, child patches, catalog, gameplay progress or QA deployment changed. Existing games continue to use their original version-pinned boards. Paris is the next new art direction, not an automatic world-wide release. This art correction does not close the new-board personalization or live playtest gates.
