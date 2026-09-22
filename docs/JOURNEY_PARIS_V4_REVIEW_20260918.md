# Paris v4 — contemporary Seine playday, first art proposal

2026-09-18. **User requested revision; NOT gameplay-ready.** No current scene, target mapping, personalized hide, public catalog or QA deployment changed.

## Subsequent user feedback

The generic block tower dominates the center and does not characterize Paris. Replace that emphasis with a bakery and abundant croissants. The portrait-model girl is cramped against the chair/furniture; fix her seating and spacing. Composition is not shallow enough: small distant people must become readable at a scale closer to the foreground. Add more distinctly Parisian activities. v5's prompt records these as ordered priorities; preserve v4 as evidence rather than overwriting it.

## Asset receipt

- `output/imagegen/journey-paris-v4-seine-playday.png`, PNG, verified 3840 × 2160, 17,900,430 bytes.
- SHA256 `77c99d80eb04216f909b833629c8de3885644d2f438a4eb2cd1440844c2a1418`.
- Prompt: `docs/art/journey-paris-v4-seine-playday.prompt.txt`.
- Input: approved dimensional-face style crop only, `tmp/imagegen/magic-dimensional-faces-style.png` (hash `e8cc2f2477f287e8c592837a82ccb043d2022c09de545cbedc56ac04bc7c5d70`). The old Paris board was NOT used as scene input.
- Existing authorized API credential; bundled Imagegen CLI, `gpt-image-2`, high quality, n=1, requested native 4K. API edit transport used for style-reference input, but creative intent was a completely new scene. One request, completed in 120.6 seconds. Exact billed cost unavailable from CLI. No upscaling, grading or sharpening after generation.

## Observed artwork

Paris has a brighter, more contemporary riverside identity: Seine cruise boat, stone bridge, Haussmann buildings, green booksellers' boxes, carousel and red cafe awning. Activities include enormous soap bubbles, scooters with helmets, portrait drawing, live music/dancing, mime, cafe/macaron tasting, block building, reading, a pigeon and toddler, and model boats in a shallow basin. Clothing is present-day rather than historical costumes. Native crops show individual facial structure and expressions. Do not infer perfect anatomy across every figure.

The foreground is still larger than the brief's desired uniform scale, and the center has some exposed paving; density/wide-view acceptance belongs to user review. The book displays skew toward antique prints rather than brightly colored children's picture books. These are review observations, not silently accepted requirements.

## Search items: explicit incomplete gate

The model did not obey the inner-band target constraints. Six requested target types do NOT equal six accepted targets.

| Target | Actual visual observation | Status |
| --- | --- | --- |
| Heart beret | Two red/white-heart berets: one on far-left bookstall (~7%,45%), one on foreground bicycle (~20%,85%) | Duplicate + placement failure |
| Star cup | Clear blue cup/yellow star at lower-left cafe (~19%,75%) | Present; margin/UI risk |
| Yellow toy bus | Clear bus among central foreground blocks (~55%,81%) | Present; too low |
| Ribbon key | Visible small key with teal ribbon at lower-left bicycle satchel (~27%,90%) | Present; too low |
| Violet paper boat | Clear boat on basin rim (~74%,78%) | Present; peripheral/low, conspicuous |
| Sideways Eiffel souvenir | No convincing separate metal souvenir identified in full image or enlarged book displays; printed towers and real tower do not count | Not verified / treat as missing |

Do not create active hitboxes from the prompt. The next local art correction must retain only one beret, move targets to safe interior positions and add a verifiable little Eiffel souvenir. User must first judge whether this contemporary Paris direction and character scale are right. No automatic Tokyo generation in this turn.

## Inspections

Full image plus native extraction-only crops inspected: `output/imagegen/journey-paris-v4-inspection/` — booksLeft, booksMiddle, cafeAndMime, playAndBoats, portraitFaces, foregroundFaces. Prompts and failed constraints are preserved, not hidden by the preview.

## Next gates

Art approval/corrections → local target correction and pixel-based mapping → actual desktop/mobile HUD and touch/zoom test → three fresh personal child hides → version-pinned gameplay integration. Current gameplay remains untouched. Marrakech's previous direction is preserved with its v8 local-target art candidate, separately documented.
