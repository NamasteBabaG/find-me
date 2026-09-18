# Fairy forest — individual faces and interior targets

User approved v3 color/stories and requested more natural, varied faces and rounded figures. Also explicitly requested no collectible targets at corners/edges where HUD obscures them.

## Generated candidates

- v4: `output/imagegen/magic-fairyforest-v4-faces-volume-safe-items.png`, bundled Images API CLI, gpt-image-2 high, 119.1s. Native 3840×2160 verified. Face edit subtle; several edge props only shrank rather than moving. Not accepted as a completed fix.
- v5: `output/imagegen/magic-fairyforest-v5-distinct-faces-interior-props.png`, same route/model, 125.4s. Native 3840×2160 verified. Noticeably more modeled cheeks/eyes/noses and less cartoon-simple faces; setting and story arrangement remain visually recognizable. No pixel-exact preservation claim: both are full-board AI edits.
- Native unscaled face inspection crop: `output/imagegen/magic-fairyforest-v5-face-detail.png`. This is an extraction, not added detail or a generated closeup.
- Exact prompts saved under `docs/art/`, matching v4/v5 filenames.
- Two API calls this turn; actual supplier cost unavailable, not zero. No further calls pending.

## Visual acceptance and remaining issues

v5 is an art candidate for user feedback, NOT gameplay-ready. Colorful forest, fairies, trolls and playful scenes retained. Faces have stronger natural form; some round-eyed similarity remains and the user must judge the balance.

The dotted mug moved toward the right side of the rabbit table, dragonfly pin moved to the turtle basket and was removed from the bottom basket, striped sock shifted left. The shell left the bottom-right seed table, but the model drew TWO red spiral shells near the root slide/pond. This duplication must be repaired before authoring search hotspots. The acorn whistle still needs close confirmation; do not claim six unique validated targets. The blue brush remains rather large. UI-safe placement is improved, not a tested guarantee across viewport transforms.

No runtime HUD/mobile validation, no catalog registration, no personal hides, no QA deployment, no Git push this turn. All new outputs are local under ignored output/imagegen; not backed up remotely. Stop for style feedback rather than silently launch more render iterations.
