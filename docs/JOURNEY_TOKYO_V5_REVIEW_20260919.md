# Tokyo v5 — art and six observed target candidates

2026-09-19. **REJECTED by user for inconsistent human scale in the foreground. Not deployed or gameplay-certified.**

## Blocking user feedback after presentation

The origami/craft and toy-car groups look miniaturized compared with the neighboring foreground dancers and book/souvenir group despite sharing the same foreground depth. This is an invalid composition, not justified by sitting/kneeling or age. User explicitly requested removal of the left street-dance group and a general scene correction. v6 must reconstruct consistent human, furniture and ground scale rather than preserve these defective positions. The v5 item-crop draft remains tied to the rejected v5 checksum and must not be copied onto a new image.

## Receipt

- Output: `output/imagegen/journey-tokyo-v5-inner-props.png`.
- Verified PNG 3840×2160, 15,726,553 bytes. Native requested 4K, no upscale.
- SHA256: `b39e30749a143c2bb8e833b3c4080d751b90a35e9f3fd3a67f8c606874486335`.
- Final prompt: `docs/art/journey-tokyo-v5-inner-props.prompt.txt`.
- Input: Tokyo v4, whose original scene brief is `docs/art/journey-tokyo-v4-neon-play-plaza.prompt.txt`.
- Bundled Imagegen CLI edit, authorized existing API credential, `gpt-image-2`, high quality, n=1. v5 completed in 105.1 seconds. Two calls in this Tokyo cycle; exact billing unavailable.

## Result and limits

The bright blue/pink neon, warm food counters, contemporary clothes, varied activities and overall shallow plaza composition remain. The miniature yellow robot on the outer stool and giant crane on the bottom bag are gone. The coral fan and lucky cat are smaller; the crane now hangs on an interior blue souvenir container. The origami frog has a squatter silhouette.

However the model removed the blue fish banner and yellow robot without delivering verified small replacements inside. Do NOT claim all six prompted targets survived. Instead, adapt the tentative collectible plan to six actual visible props already present in the final art. The toy rocket and miniature blue backpack replace those missing objects. This avoids inventing target coordinates for absent assets or repeatedly regenerating the approved-looking scene to chase the original plan.

The scene is visually preserved, not pixel-identical to v4: this was an image edit, not a deterministic masked patch. Small receding figures remain at the far-right edge. Not all activities in the initial long brief were delivered; the bubble performer is absent. These are recorded rather than claimed complete.

## Six crops inspected at native pixels

| Target | Draft rarity | Observation |
| --- | --- | --- |
| Toy rocket | Common | Gray/orange toy held diagonally by child in capsule group; clearly recognizable |
| Flower fan | Common | Coral fan with white floral detail in mint tote |
| Lucky cat | Common | White ceramic cat, raised paw and red collar on interior shelf |
| Origami frog | Rare | Small squat green folded paper figure on craft table; recognition should be playtested |
| Red crane charm | Rare | Folded red bird attached to an interior blue container by a ring |
| Mini blue backpack | Epic | Small navy backpack-shaped hanging accessory with straps/front pocket, amid souvenirs |

All six native inspection crops exist in `output/imagegen/journey-tokyo-v5-inspection/target-*.png`. Crop rectangles are recorded in `docs/art/journey-tokyo-v5-target-draft.json`, based on those actual extractions, not the prompt's requested positions. They include contextual margins and are not click hitboxes. The rarity mix remains 3 common / 2 rare / 1 epic, but was rebalanced to observed visibility rather than retaining unsuitable labels from the pre-render plan.

All selected crops are in the interior horizontal band (approximately x44%–66%) and above the bottom 20%. The frog and cat are lower (about y74%–78%) than the original preferred y72% boundary. This is not a proven HUD-safe claim: real desktop/mobile HUD, pan/zoom and item recognizability checks remain required. No final difficulty or universal uniqueness guarantee is implied by these visual inspections.

## Release boundary

No active scene, existing personalized patch, collection ID, game, public asset, app source or QA deployment was changed. User art approval, production item mapping, HUD/difficulty playtest and three personalized child hiding spots are still separate gates. Keep the original Tokyo scene version-pinned for current games.
