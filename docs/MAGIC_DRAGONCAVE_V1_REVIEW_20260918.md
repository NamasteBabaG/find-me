# Dragon cave v1 — first scene-lighting candidate

18 September 2026. **Review candidate only. Not approved, not mapped for play, not deployed.**

## Scope and method

The user authorized adding scene-specific lighting, frame palette and clothing/color direction to all six remaining Kingdom briefs, then rendering the first board. All six sections of `MAGIC_REMAINING_PRODUCTION_BRIEFS_20260918.md` now contain dedicated directions; the cross-board requirement is also recorded in `CHILD_FIRST_BOARD_ART_DIRECTION.md`.

Imagegen's bundled CLI / previously authorized Images API route was used, not the built-in image tool. One approved castle v18 image was a style reference, not a canvas to preserve. Because a reference was supplied, the endpoint was Images **edit**, with a prompt requesting a completely new cave scene.

- Prompt: `art/magic-dragoncave-v1-scene-lighting.prompt.txt`.
- Model: `gpt-image-2`; quality: `high`; requested size: `3840x2160`; n=1.
- Initial WebP-reference request was rejected with HTTP 400 `unsupported_file_mimetype` (`application/octet-stream`). No image returned. The CLI was not modified.
- Converted the same reference losslessly to PNG and retried the unchanged prompt once. Successful invocation reported **135.0 seconds**. No subsequent generative edit or additional artistic retry.
- Supplier cost/usage receipt not emitted by this CLI; no exact spend claim is made.
- No child's original photo, identity sheet or private gameplay image was sent.

## Output

- Master: `output/imagegen/magic-dragoncave-v1-scene-lighting.png`.
- Actual file: RGB PNG, **3840 × 2160**, 17,994,838 bytes. No upscale applied.
- SHA-256: `2cfb3399042ea7b179379c71e0ac3727ee296eed2f93398d69b83e8e26890e30`.
- Eight native, unscaled inspection crops under `output/imagegen/magic-dragoncave-v1-inspection/`.
- Existing masters, personal hides, runtime catalog and QA remain unchanged.

## Visual findings

The scene reads as a bright open limestone cave with visible sky apertures, shaded niches, warm stone bounce and broadly consistent illumination on people and props. There are distinct caregiving, bubbles, wing measurement, feeding, medical, nest, painting, toy and sewing activities. Dragons are friendly. Cotton, baskets, rock and wood are predominantly matte, while lenses, bubbles and bell have localized reflections. Faces have modeled volume and the inspected surfaces do not exhibit the previous iterative smear failure.

This is not an unconditional style pass. The palette remains more earthy/cream-dominant than the bright-color brief; the cast is visibly below the requested roughly 45 people, with several larger foreground figures. These density/color/scale differences should be considered in user art review, rather than claimed to match the prompt exactly. The image is not an approved gameplay master merely because it is 4K.

## Search-object review

Whole image plus native crops inspected. Centers below are rough visual estimates, **not authored coordinates or HUD tests**.

| Requested target | Result | Acceptance |
| --- | --- | --- |
| Blue/white striped egg | Recognizable in nest, about x25%, y22% | Too high for the planned conservative safe zone; needs actual HUD review or alternative |
| Red grooming brush | Red-backed handled tool in basket, about x31%, y50% | Bristles obscured; identification is less clear than requested. Do not blindly label/map it |
| Star biscuit | Several star-shaped biscuits on feeding trays | Not a unique target; must be changed or replaced in the final discovery selection |
| Purple goggles | Clear two-lens goggles hanging on equipment stand, about x62%, y24% | Good silhouette; higher than planned, HUD clearance unverified |
| Blue handbell | Clearly rendered on folded cloths, about x66%, y90% | Reject current position for gameplay target: too close to lower UI edge |
| Copper paw badge | Readable raised paw on bag, about x56%, y86% | Reject current position for gameplay target: too low; also more prominent than intended Epic |

The six requested categories were attempted, but **this is not a six-discovery accepted set**. No hitboxes, rarity acceptance, collectible cards or personal hide slots were published. Before play, either select six unique, clearly recognizable interior-safe actual objects and update the brief consistently, or produce an approved correction/fresh master. Do not map prompt coordinates or silently accept duplicate stars.

## Boundaries

No personal child generation, app code changes, database updates, push or QA deployment in this pass. The remaining five boards have updated lighting briefs but were not rendered. The user-facing deliverable is the first cave art candidate and the updated six-board brief, with the limitations above disclosed.
