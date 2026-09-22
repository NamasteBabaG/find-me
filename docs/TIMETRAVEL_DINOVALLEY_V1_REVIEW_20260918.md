# Dinosaur Valley v1 — internal first-pass review

2026-09-18. Internal candidate; not presented as user-approved and not activated in a game.

- Master: `output/imagegen/timetravel-dinovalley-v1-living-valley.png`
- Verified: 3840 × 2160 PNG, 19,478,671 bytes, no upscaling.
- SHA256: `445c12cf60830c81e73cbe1e2dd22e40fdfaf882f99d552bc18b98ac0a04958b`
- Prompt: `docs/art/timetravel-dinovalley-v1-living-valley.prompt.txt`
- Style input: `tmp/imagegen/magic-dimensional-faces-style.png`, SHA256 `e8cc2f2477f287e8c592837a82ccb043d2022c09de545cbedc56ac04bc7c5d70`.
- One successful call through the authorized API/bundled Imagegen CLI, `gpt-image-2`, high, n=1, 129.8 seconds. Exact billed cost not returned by CLI.

Full-board visual check: lush bright natural valley, friendly dinosaurs with varied silhouettes, modern explorers and naturally distributed activities instead of stalls. Faces and environment are detailed, with material-aware lighting. All six intended object concepts are visible at full-board review scale.

Critical placement failures: orange notebook at approximately x50%, y89% and amber pendant at x83%, y88% are too close to bottom/right HUD zones. Fossil is low (approximately x34%, y83%) and binoculars are far left (approximately x15%, y62%). The brush and bottle are in more useful interior positions. Foreground humans are larger than the planned zoomed-out scale. No hitbox or gameplay approval is implied.

Before user handoff, one targeted v2 edit is requested: pull back around 30%, preserve the recognizable scene within a wider valley, add small human interactions around the newly visible perimeter, and shift all six targets with their activities into the central playfield. Source v1 is retained unchanged. Prompt: `docs/art/timetravel-dinovalley-v2-wide-playfield.prompt.txt`. No child photo, runtime/catalog changes, or QA deployment.
