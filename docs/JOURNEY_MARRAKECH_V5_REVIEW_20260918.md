# Marrakech v5 — wide red-city festival

2026-09-18. User subsequently approved the art direction ("מגניב") and asked to continue. **This v5 file is not gameplay-ready; its original target placement and scale still fail.** See `JOURNEY_MARRAKECH_V8_REVIEW_20260918.md` for the later local item correction. No existing board, personal child patch, target geometry, catalog or QA deployment changed.

## Receipt

- Master: `output/imagegen/journey-marrakech-v5-wide-festival.png`
- Verified: 3840 × 2160 PNG, 19,069,124 bytes. Native requested dimensions; no post-generation enlargement, brightness adjustment or sharpening.
- SHA256: `065299bfc0042333614256e9e860270f119832f7d62dfac63f93fc776248edee`
- Prompt: `docs/art/journey-marrakech-v5-wide-festival.prompt.txt`
- Inputs: v4 scene (`20ab6f304b51f2931e9c8cc4ad32bc5769106b69da3ad30c4e07baf119809c67`), then the style-only castle face crop (`e8cc2f2477f287e8c592837a82ccb043d2022c09de545cbedc56ac04bc7c5d70`).
- Route: bundled Imagegen CLI, `gpt-image-2`, high quality, n=1, using the existing user-authorized API credential. v5 completed in 116.4 seconds. This turn used two successful image requests total (v4 and v5); exact billed cost not returned by CLI.
- Both versions preserved. No private child photo used.

## Visual findings

The full image and eight native, extraction-only crops were inspected. Red/rose architecture, square minaret, blue mosaic, rugs, oranges, local crafts and family activities give the scene a more distinct location than the old brown market. More contemporary shirts, trousers, shoes, stroller and bicycle coexist with local garments. Music, puppet storytelling, tea, juice, kite making, fountain play and rug peekaboo are present. The wider view adds peripheral groups and keeps the original activity cluster. A precise population count was not made.

Faces in the sampled storytelling and tile/juice groups have modeled volume and individual expressions. The closest cobbler remains larger than the intended uniform 14–16% figure-height target. Some shaded areas remain warm/dark; user feedback must judge whether the overall brightness and red balance meet the intended direction. No claim of perfect anatomy in every figure.

## Actual target observations — not production mapping

Coordinates are approximate centers from visual inspection of the output, not prompt coordinates or final hitboxes.

| Intended tier | Candidate | Actual center | Finding |
| --- | --- | --- | --- |
| Common | Blue amulet | x39%, y26% | Clear blue circular pendant and cord. Higher than planned; upper HUD access untested. |
| Common | Striped slipper | x22%, y90% | Clear complete red/cream striped shoe, but too low, too far left and oversized for the brief. |
| Common | Crescent cup | x52%, y64% | Turquoise cup, handle and crescent visible. Still held by a child instead of placed freely on the tray; signature remains visible. |
| Rare | Key with tassel | x70%, y92% | Bow, teeth, shaft and tassel clear. Far too low and conspicuously oversized, so not a suitable difficulty/placement yet. |
| Rare | Violet gecko | x40%, y84% | Purple lizard-like silhouette on tile, too low. Short/stubby tail and toy-like proportions need a closer anatomy/asset decision; do not claim a clean animal target yet. |
| Epic | Silver camel figurine | x57%, y87% | Metal camel-like keepsake identifiable in basket. Too large, exposed and low; not an accepted Epic search challenge. |

The model did not obey the requested inner-band positions even after the targeted v5 correction. The positions must not be copied from the prompt into a game map. The next production pass must solve target placement/scale and lizard anatomy, then verify uniqueness, native crops, tap areas and live HUD safety. Do not hide these failures behind an art approval.

Inspection folder: `output/imagegen/journey-marrakech-v5-inspection/` (`amulet`, `slipper`, `cup`, `key`, `gecko`, `camel`, `storyFaces`, `craftFaces`). Sources remain unaltered.

## Handoff boundary

Present the red-city direction to the user with the unresolved search-item issue stated. Do not start Paris or another automatic paid revision in this turn. All eight requested refresh briefs and their six planned items are preserved in `JOURNEY_REFRESH_BRIEFS_20260918.md`; New York is unchanged. A new scene needs new target geometry and new personal patches before replacing active gameplay.
