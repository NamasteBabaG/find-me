# China v7 — gentle widening of user-approved v6

## Status

Art candidate for user review, **not active or gameplay-ready**. User approved v6's direction, then requested a little zoom-out, more situations and careful preservation of detail. This output is a single image edit using v6 as its only source; no rejected China v4/v5 input was used. No application, catalog, existing game, personalized hide or QA deployment changed.

## Artifact and generation receipt

- Output: `output/imagegen/journey-china-v7-gentle-wide-more-stories.png`.
- Source: `output/imagegen/journey-china-v6-fresh-festival-courtyard.png`.
- Prompt: `docs/art/journey-china-v7-gentle-wide-more-stories.prompt.txt`.
- Route: explicitly authorized existing-key OpenAI API, bundled Imagegen CLI, `gpt-image-2`, high quality, one edit call; 115.0 seconds reported.
- Actual PNG: **3840×2160**, **18,318,844 bytes**.
- SHA-256: `4b0b208fa6cf6eca396309cfb82a6653ef9fb42c6c70c81db4d95d04de9e61c8`.
- Exact cost not returned; do not infer a billing receipt.

Creative Production source-preservation guidance shaped the brief: preserve approved scene/story/brush language while widening modestly. Imagegen provided the actual raster edit. The source was not hand-painted, composited or upscaled after generation.

## Visual comparison and inspection

Viewed whole v6 and v7 plus native-resolution left, center, right and central-item crops under `output/imagegen/journey-china-v7-inspection/`.

The framing is wider and existing groups are generally smaller together rather than a separately miniaturized lower-left activity island. Heads/hands of the left dough-making group remain comparable to nearby puppet/picnic families. Some normal depth/age variation remains; this is not exact orthographic geometry or a measured uniform transform.

Retained main scenes: green parade dragon with children, lion costume and helpers, grandfather/shuttlecock, diabolo play, dumpling cart, grandmother/dough animals, central lantern/paper cutting, water calligraphy and dog prints, shadow-puppet screen and children, grandparents' chess, picnic family, knot-making boy. The Great Wall remains a thin backdrop rather than a large empty vista. Controlled painted outlines/face volume remain visible in inspection crops; no photographic faces introduced.

New situations visibly present: sugar-figure artisan left; father/children making a large red carp lantern at lower-right; children doing a tangram puzzle in front. Not every requested supporting figure was added; no exact additional-person-count claim. Extra baskets/paving were also generated.

Do not claim literal pixel preservation or that no detail changed: the front mandarin-retrieval moment of v6 was replaced by the new tangram group, small face/prop details changed during generation, and the sugar sculpture is not a crisply identifiable butterfly. The main scene families are preserved, not every original pixel or micro-action. User must review the new framing before any further country.

## Search-object gate — still open

| Intended target | Observed result | Status |
| --- | --- | --- |
| Purple lotus fan | Clear on inner central lantern table | Candidate; HUD/hitbox not tested |
| Blue wave bottle | Moved onto central worktable, clearly visible | Candidate; not final mapping |
| Cloud hand drum | Red circular handled object near dough workshop, motif not a verified white cloud | Needs shape/name verification or repair |
| Brass compass | Two dial-like discs on chess ledge rather than one unambiguous hinged compass, fairly low | Reject target form/placement |
| Jade turtle | Clear turtle on newly added front tangram table, too low | Reposition before game use |
| Small red dragon toy | Old lower-left toy remained and more red dragon forms appeared in new baskets | Duplicate + placement failure |

No target coordinates/JSON have been certified. Do not reuse v6/v5 requested positions as actual v7 coordinates. Finish unique silhouettes, safe interior placement, six crop cards and real desktop/mobile HUD/zoom tests before connecting this version to a game. This review does not silently approve the art or close item gates.
