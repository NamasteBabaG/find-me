# Dinosaur Valley v2 — wider living valley

2026-09-18. User approved v2 art ("ניראה מעולה") and redirected work to a review of all nine Around the World boards. Not activated in the game or deployed to QA. First new board in the Time Travel art sequence; new art production is paused at the user's request.

## Receipt

- Master: `output/imagegen/timetravel-dinovalley-v2-wide-playfield.png`
- Verified: 3840 × 2160 PNG, 20,730,317 bytes; native requested dimensions, no post-generation upscaling.
- SHA256: `fa22e1fcf45f0f48a561459a16e62ddfbcbea73e323494961290faff4e540313`
- Prompt: `docs/art/timetravel-dinovalley-v2-wide-playfield.prompt.txt`
- Input: `output/imagegen/timetravel-dinovalley-v1-living-valley.png`
- Input SHA256: `445c12cf60830c81e73cbe1e2dd22e40fdfaf882f99d552bc18b98ac0a04958b`
- Route: existing authorized OpenAI API key through bundled Imagegen CLI, `gpt-image-2`, high quality, n=1. One successful edit, 126.7 seconds.
- This board used two paid calls total this turn: v1 composition plus v2 widening. Exact billed costs were not emitted by the CLI. Both versions are retained.
- No personal child photo, production asset overwrite, runtime/catalog change, hitbox publication or QA deployment.

## Inspected result

The full image and nine unscaled crops were viewed. The original dinosaurs and main activities remain recognizable in a wider valley. New peripheral groups include a family following hatchlings, a grandparent and child examining a fern, children crossing a broad low log with an adult, and a child with a basket beside a feathered dinosaur. Existing field activities are smaller and farther from the bottom edge. This is generated reframing, not a pixel-exact resize or a guarantee that each original figure is unchanged.

The valley has a distinct natural layout rather than rows of stalls: ferns, mossy logs, rocks, waterfalls, a stream, nests, a sleeping armored dinosaur and large herbivores. A small background time capsule explains the modern explorers. This is playful time-travel fantasy, not a scientifically dated reconstruction of species living together.

Representative faces, hands and animal surfaces remain detailed without broad smearing in the inspected crops. Adult and child facial shapes are individually modeled. The greens, rocks and explorer clothes are more earthy/olive than the brief's most saturated palette; the widened foliage also makes the overall image feel more shaded than a bright open courtyard. The user subsequently approved the art; no automatic brightness filter was applied.

## Six actual discovery candidates

Approximate centers below are visual observations, NOT final `visibleRect`/`hitRect` geometry and NOT a HUD/playtest pass.

| Intended rarity | Actual candidate | Approximate center | Native crop / finding |
| --- | --- | --- | --- |
| Common | Red binoculars / משקפת אדומה | x28%, y52% | `binoculars.png`: twin barrels, bridge and strap visible on mossy log. |
| Common | Yellow water flask / מימייה צהובה | x56%, y34% | `flask.png`: yellow body, turquoise cap and carry loop readable against backpack. |
| Common | Blue-handled brush / מברשת כחולה | x64%, y48% | `brush.png`: handle and separate bristles visible on rock. |
| Rare | Spiral fossil / מאובן ספירלי | x42%, y66% | `fossil.png`: clear cream spiral on gray rock. Raised fossil rather than strictly embedded; name does not promise a different construction. |
| Rare | Orange field notebook / מחברת כתומה | x56%, y70% | `notebook.png`: fern emblem, spine and page edges visible beside canvas bag. |
| Epic | Amber pendant / תליון ענבר | x81%, y70% | `amber.png`: teardrop amber body, loop and cord visible. The dark inclusion is not reliably identifiable as a fern, so do not describe it that specifically in the card/hint. |

Notebook and pendant moved upward from the problematic bottom band. The pendant remains right of the requested x75% boundary, although away from the lower-right corner, and the water flask is slightly high. These need real desktop/mobile HUD, pan and zoom verification before gameplay acceptance. The pendant is clear and relatively exposed; Epic is only its intended collection tier, not a tested difficulty rating. No claim is made that prompt coordinates were precisely obeyed.

Inspection folder: `output/imagegen/timetravel-dinovalley-v2-inspection/`. Additional crops: `faces.png`, `dinosaur.png`, `foreground.png`. These are extraction-only; the master was not altered.

## Next

Art is approved; gameplay integration remains pending. Before activation, map the six actual silhouettes, choose matching card crops and hints, check unique targets and HUD access, then select three protected personal hiding areas. The user requested an Around the World review first, so no further Time Travel rendering is underway. The next art topic in the catalog is Pyramid Builders (`pyramids`), not yet rendered. Magic mapping/playtest gaps remain open independently; art approval is not world-level gameplay completion.
