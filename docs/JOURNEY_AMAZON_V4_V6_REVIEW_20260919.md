# Amazon v4–v6 — living rainforest and modest wider framing

## Current status

**v6 ART APPROVED by the user on 2026-09-19; not a gameplay release.** After reviewing the wider image, the user replied: "אחלה מאושר". This approves `journey-amazon-v6-gentle-wide-shallow.png` and its wider framing, following the request for shallow perspective, consistent proportions and no miniature groups at the bottom. The approved file is pinned by its SHA-256 in the receipt below. Gameplay acceptance gates remain open.

At the art-approval checkpoint no active scene image, catalogue entry, collectible hitbox, personal child patch, database, game or QA deployment was changed. Existing games are untouched. Do not reuse their coordinates or patches with this image. **Later on 19 September:** a separate local 3-hide/6-discovery pilot was authored and played; see `JOURNEY_REFRESH_PERSONAL_PILOT_20260919.md`. This did not activate the refreshed image in the live catalogue or QA.

## Source and generation receipts

All files below are under `output/imagegen/`, all are native 3840 × 2160 PNGs. Generated with the bundled Imagegen CLI, `gpt-image-2`, high quality, n=1, through the previously authorized existing API key. No SDK wrapper, upscaling, sharpening, color filter or deterministic image retouching was used. Native crops are inspection artifacts only.

| Version | File | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| v4 | `journey-amazon-v4-living-rainforest.png` | 18,654,004 | `0daddf790102b06bd2cfdeaa88a77fc8102103936f8358185f4d1467c4125634` |
| v5 | `journey-amazon-v5-interior-natural-targets.png` | 17,451,928 | `366b693379b045d1e026340d4e0ec79be563dc485b6320ef21b4748e73dd4b6f` |
| v6 | `journey-amazon-v6-gentle-wide-shallow.png` | 19,923,303 | `94449debc3adf89774ece806b68f815053c53e5b485f0cb2b569e8497356c86a` |

v4 was a new composition, with Giza v4 and the user's Sydney crop as brushwork/dimensional-style references only. The old Amazon was not an image input. v5 used only v4 to reduce and move oversized targets. v6 used only v5 as its edit source. The v6 request took 117.7 seconds; one paid render was made for this wider-framing request.

Prompts:

- `art/journey-amazon-v4-living-rainforest.prompt.txt`
- `art/journey-amazon-v5-interior-natural-targets.prompt.txt`
- `art/journey-amazon-v6-gentle-wide-shallow.prompt.txt`

Creative Production's source-preservation and camera/framing guidance informed the edit. Its board tool was discoverable only behind the orchestration interface, not as the direct callable UI tool required by the skill; no wrapped board call, invented board ID, second widget or substitute server was used. Delivery is the local image inline.

## Earlier corrections and their limits

v4 established the wildlife-rich scene and legible dimensional faces, but several search objects were excessively large/exposed and the wooden carving was too low. v5 reduced these. Native v5 inspection showed a second bird-shaped carving among the canoe luggage; the shell did not move to the exact location requested in the prompt. Therefore neither prompt compliance nor complete collectible readiness was asserted.

The user then approved the visual direction and requested a wider view. This is not approval of hitboxes, difficulty or object uniqueness.

## v6 actual visual review

Viewed the whole frame and five native, unscaled crops under `output/imagegen/journey-amazon-v6-inspection/`: `lower_left`, `lower_middle`, `lower_right`, `upper_boardwalk`, `wildlife`.

- The wider view is visible: more continuous foliage, roots, boardwalk and foreground surround the original groups. There is no added distant crowd or deep receding river corridor.
- The father and child making a leaf boat at lower left remain readable and comparable in head/hand scale to the adjacent foreground children. The central leaf-rubbing and weaving groups and the right-hand book-reading family remain coherent. This is a visual comparison, not a numerical proof of every person's scale.
- The main activities remain: boardwalk exploration, map reading, canoeing, insect observation, leaf boat building, leaf rubbing, weaving and wildlife-book reading.
- Jaguars, snakes, macaws, sloths, capybaras, caiman, otters, toucan and iguana remain visibly identifiable. Animals are not automatically new collectibles.
- The dimensional painted faces, fabric and foliage remain detailed in the inspected regions, with no broad edit-smear observed. This is not exhaustive anatomical certification of every hand or every leaf.
- The six intended target types are visible in interior positions. The extra canoe bird was changed into an otter-like figure, **not** the requested tied seed pouch; do not claim that instruction was literally satisfied. It is no longer the same bird-shaped duplicate, but the carving/animal distinction still needs the collectible review.
- Some small illustrated details changed during the edit. No exact pixel preservation is claimed.

## Approximate target centres in the returned v6 art

These are **visual review notes only**, measured approximately from the full frame, not production hitboxes or click targets.

| Target | Approximate x/y of whole canvas | Observation |
| --- | --- | --- |
| Red binoculars | 41.5% / 55.6% | Recognizable two barrels, lying on map/satchel |
| Yellow bottle | 53.3% / 56.1% | Yellow body, teal cap, upright on stump |
| Orange frog | 32.2% / 54.7% | Small orange frog on the observation root/rock |
| Blue butterfly | 56.3% / 61.5% | Blue wings at stump/basket edge |
| Spiral shell | 32.7% / 65.3% | Readable russet spiral among roots |
| Carved wooden bird | 36.2% / 31.4% | Brown carved-looking bird on boardwalk by seed pod |

All six are away from the frame boundaries and within the planning safe region. This does **not** substitute for real desktop/mobile HUD, pan and zoom testing. Rarity, occlusion/difficulty, unique identity, thumbnail extraction, final hitboxes and three personalized child hides remain separate acceptance gates.

## Handoff

Preserve v6 as the approved Amazon art master and retain v4/v5 as history. No further framing/style rerender is needed without new feedback. Before integration, close collectible uniqueness/difficulty and HUD checks, author image-specific hitboxes and three personalized child hides, then test the real game. Do not replace active assets underneath existing coordinates or patches. Recording this approval did not generate images or deploy anything.
