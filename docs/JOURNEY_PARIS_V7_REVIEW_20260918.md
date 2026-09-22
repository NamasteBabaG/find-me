# Paris v7 — balanced French play plaza

2026-09-18. **User approved the art direction with "מעולה תמשיך". Not gameplay-ready: search-object gate below remains open. No active catalog, personal patch, hitbox or QA deployment was changed.**

## Source and output

- Output: `output/imagegen/journey-paris-v7-balanced-french-plaza.png`.
- Verified PNG, 3840×2160, 19,735,540 bytes. Native 4K output, no upscaling.
- SHA256: `f5058abc88c623c5dea6c4bf98e75d471c8f8a23fe20c3e1c6ee01fe683fc7c9`.
- Prompt: `docs/art/journey-paris-v7-balanced-french-plaza.prompt.txt`.
- Image 1: v6 Paris composition revision. Image 2: approved `timetravel-dinovalley-v2-wide-playfield.png`, explicitly restricted to group scale and shallow composition, not subject matter or palette.
- Bundled Imagegen CLI edit route, existing user-authorized API credential, `gpt-image-2`, quality high, n=1, requested 3840×2160. No exact billing receipt or elapsed time was returned in the recovered tool output; neither is inferred.
- Previous v6 restored the artist but retained the oversized bakery. The user's new feedback superseded that pending intermediate: remove the cafe child's cream moustache, shrink the bakery and restore more varied French stories.

## Visual checks actually performed

Full-board inspection plus native-resolution crops in `output/imagegen/journey-paris-v7-inspection/` (`cafe-faces.png`, `artist-seating.png`, `bakery-faces.png`).

- The cafe boy no longer has white food/paint around his mouth or chin. The inspected children have continuous illustrated skin tones rather than the white cream markings in v5.
- The bakery frontage is now a compact upper-right kiosk. Bread-making and cargo delivery are distinct smaller activities nearby rather than one immense storefront/counter. Together they still occupy a substantial right-hand region; this is a reduction, not elimination of bakery emphasis.
- The central portrait artist and girl are present. Her stool, legs and shoes are separate from the artist's chair and easel, with open ground between the furniture.
- Visible French stories: red-curtain puppet theatre, petanque, green book/postcard stalls, accordion and violin performance, dancing children, cafe with macarons, flower seller, bubbles, mime, toy-sailboat basin, hopscotch, scooter and pastry workshop/delivery.
- The river/bridge/Haussmann buildings/Eiffel strip contains no miniature pedestrian crowd. The playfield is shallower than v5 with activities arranged across the frame; some foreground-to-rear scale variation remains.
- The crepe cart and carousel requested in the prompt did not survive this revision. They are not claimed present; the other activities provide the intended variety.
- Fine grain remains visible on cloth, paving and some faces at 1:1. No claim of completely smooth textures or completed style approval.

## Search-object gate — NOT passed

Do not activate or reuse old hitboxes. The requested inner safe zone was not obeyed:

| Requested target | Observed result | Gate |
| --- | --- | --- |
| Coral heart beret | Heart-marked red object on the lower-left chair, but reads as a cushion rather than a beret | Shape failure and peripheral |
| Blue star cup | Clearly visible on the lower-left cafe table | Too peripheral; HUD not tested |
| Yellow toy bus | Visible in the very low left bread basket | Bottom-edge risk |
| Brass key / teal ribbon | Visible on right delivery satchel | Right-edge risk |
| Violet paper boat | Clearly visible on inner basin rim, roughly x53%, y61% | Candidate only, bounds/HUD not tested |
| Bronze Eiffel souvenir | Visible upright on low postcard table, rather than lying diagonally | Orientation, size and bottom-edge risk |

No production target map was generated from prompt coordinates. Art approval must be followed by local object correction/mapping and actual HUD/play checks. Do not replace a base image underneath existing personalized patches or collected-item coordinates.

## Handoff

Art direction approved; continue the agreed art-review sequence with Tokyo. Keep v5/v6 as provenance only. Paris still requires local object correction/mapping and HUD checks before personalization or deployment. The approval to continue art does not mark its object gate complete.
