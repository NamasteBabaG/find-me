# Tokyo v6 — foreground scale reconstruction

2026-09-19. **User approved the composition with "מעולה הבא". Not an active board, not a completed collectible map. Continue the art sequence with China; retain the collectible issues below for later integration.**

## Receipt

- File: `output/imagegen/journey-tokyo-v6-coherent-scale.png`.
- Verified PNG 3840×2160, 16,857,205 bytes.
- SHA256: `80715bf1df5f523c9707384e5d250a5a4d7b113b3da41a562a0ced0315a2509c`.
- Prompt: `docs/art/journey-tokyo-v6-coherent-scale.prompt.txt`.
- Input: v5 Tokyo, explicitly used as an edit target with permission to rebuild the defective composition, not preserve its scale errors.
- Bundled Imagegen CLI; existing user-authorized API key; `gpt-image-2`, quality high, n=1. Completed in 120.1 seconds. One paid image request for this new user revision; exact charge not available.

## User issue addressed

The user correctly rejected the foreground craft/car activity as miniaturized relative to adjacent people and explicitly requested removal of the street dancers on the left. The remedy was not a local face enlargement: people, table scale, placement and ground contact needed reblocking together.

## Observed changes

- The left street dance group and its black loudspeaker are gone. The former arcade rhythm platform also disappeared despite permission to retain it; do not claim it is still present.
- The origami workshop now occupies the freed lower-left region on a full-sized open table. The cramped miniature wooden canopy is removed.
- The two model-car children and their low table are now a separate lower-center activity, not a tiny scene stacked underneath the workshop.
- The book/souvenir group has been simplified to a father and daughter with a lower display, so it no longer frames the middle as a giant structure next to a tiny workshop.
- Compared the three native-resolution crops side by side: foreground children's head/hand scale is now broadly comparable across the craft table, cars and reading activity, with appropriately sized furniture. This is a visual check, not a calibrated anatomical measurement or a claim of perfectly uniform size.
- Tokyo's neon signs, local warm shop light, robot/drinks, food counters, capsules, photo booth, vending machines and dog/umbrella activity remain recognizable. No new dance performance was substituted.
- A smaller distant crowd remains at the far-right edge. The scene still has some foreground-to-background scale change; this revision fixes the specific severe foreground mismatch rather than proving the entire scene orthographic.

## Inspection evidence

Full image viewed, then these crops extracted without resizing and individually viewed:

- `output/imagegen/journey-tokyo-v6-inspection/left-craft.png`: 1160×1050 at x220,y1030.
- `output/imagegen/journey-tokyo-v6-inspection/center-model-cars.png`: 910×830 at x1400,y1250.
- `output/imagegen/journey-tokyo-v6-inspection/right-reading.png`: 860×950 at x2230,y990.

## Collectibles — revalidation required, not preserved by assumption

v5's crop map is invalid for v6 and was marked source-rejected; no coordinates were carried forward. The gray/orange rocket and coral fan remain visible, but:

- The green frog on the relocated table now reads as a three-dimensional toy/figurine, not origami, and is left/low.
- The lucky-cat motif appears on a book rather than as the intended ceramic target; a correct unique figurine was not verified.
- Red bird/crane-like charms appear more than once on the navy bags. Unique-target identity is not established.
- The blue backpack is now larger and low on the book display rather than a small inner accessory.

Therefore this is explicitly an ART/COMPOSITION candidate, not a statement that six finalized search items work. Do not spend further paid edits on item placement in this turn before the user sees whether the scale correction is right. After art approval, correct/choose actual unique props and verify new native crops and HUD positions for this version.

## Release boundary

No app source, active catalog, public base, hitbox, personalized patch, live game or QA deployment was changed. Existing Tokyo games remain on their pinned prior assets. Keep v5 as rejected provenance, not as a fallback approved scene.
