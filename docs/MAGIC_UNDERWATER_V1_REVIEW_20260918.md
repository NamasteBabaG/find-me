# Underwater kingdom v1 — coral community

18 September 2026. **Art-review candidate, not a completed playable board.**

**Later user feedback:** this direction feels too dry/architectural. The user requested a much bluer genuinely underwater fantasy, less ground and structures, giant octopuses, a friendly whale and abundant colorful coral. v1 is retained as history; v2 is a new reef composition, not another cumulative edit of this master. See `art/magic-underwater-v2-blue-reef-wonders.prompt.txt` and the updated production brief.

## Scope and receipt

The user approved the ice-palace direction and requested the next board. This pass follows the planned underwater kingdom: a bright coral town around a dry air dome, many small activity groups, theme-specific clothing/light, and six integrated search props. Lessons from prior target-placement failures were reflected by specifying target stations before secondary activities, but output compliance still requires inspection.

- Prompt: `art/magic-underwater-v1-coral-community.prompt.txt`.
- Intent: a new composition. Images API edits endpoint was used to supply style references only; neither reference is the scene being edited.
- Reference 1: approved castle v18, converted to PNG without resizing at `tmp/imagegen/magic-castlegate-v18-style.png`, SHA-256 `94eab04031a84a7b9a4dc4209b84370ffdf774fe09e71d42786f2a2ad114f752`.
- Reference 2: approved dragon cave v3, `output/imagegen/magic-dragoncave-v3-bright-color.png`, SHA-256 `61f67d508594703924c50953b60445e0a2d0882dacd13a3efe979a9e0cfe6428`.
- Existing user-authorized Images API/key, bundled Imagegen CLI, `gpt-image-2`, high, n=1, 3840x2160. One successful invocation, 154.3 seconds, no retry.
- Master: `output/imagegen/magic-underwater-v1-coral-community.png`.
- Verified PNG dimensions: **3840x2160**, 19,515,234 bytes. No upscale.
- SHA-256: `403a152e64015c178e2db87c95dc4554e9af998d80e4dbb1d0f73a3fe8fbc564`.
- Six native unscaled inspection crops: `output/imagegen/magic-underwater-v1-inspection/`.
- No new key, private child photo, personal hide generation, source-code change, catalog activation or QA deployment. CLI supplied no exact spend receipt.

## Art observations

The picture has a distinct underwater setting: transparent dome ribs, coral-shell houses, merfolk, divers, fish and ray, octopus mail sorting and turtle delivery. Inside are equipment preparation, toy boats, shell study, bunting, a reading group, shell mosaic, model submarine repair, jewelry making and marine research. Costumes are lighter than the ice-palace outfits and light sources include seawater daylight plus warm shell lamps. Many characters and close activity groups fill the frame without a large empty floor or ocean. Some foreground figures still appear larger than the requested near-uniform scale; do not claim an exact zoom-out percentage or participant count.

Native samples show legible faces, object outlines, shell detail, glasses, magnifier, mask, boat and jewelry. No obvious broad smearing in those samples. Surface treatment is still fairly textured/earthy; brightness and palette acceptance remain with the user.

### Air/water boundary needs another look

Most interior children read as dry, and two exterior human divers have breathing equipment. The upper-right children and mermaid are very close together around the glass; the exact plane separating them is **visually ambiguous**, rather than clearly proving the children are inside and the mermaid outside. The lower-left mermaid reading nook also relies on the cutaway interpretation. Do not claim the air/water rule is fully validated. A future correction should clarify these local boundaries without expanding the dome into a giant empty composition.

## Six search props actually observed

All six planned object types are visually present. Centers below are approximate observations, not published hitboxes. Whole-image duplicate scans, card crops, mobile/desktop HUD clearance and child-patch separation have not passed.

| Planned rarity | Object | Approx. actual center | Review |
| --- | --- | --- | --- |
| Common | Yellow diving mask | x30%, y51% | Clear lens, nose and yellow rim at the gear table; promising interior candidate |
| Common | Red toy sailboat | x52%, y43% | Red/brown hull, cream sail, among differently colored boats; promising interior candidate |
| Common | Red/white lifebuoy | x53%, y57% | Clear ring on an internal rope railing; large and conspicuous, suitable for early success but not difficulty-approved |
| Rare | Pearl in open pink shell | x71%, y37% | Clearly visible shell and pearl; prominently presented rather than concealed; rarity and difficulty must not be conflated |
| Rare | Green magnifying glass | x71%, y88% | Clearly present, but too low for the conservative interior placement rule; no HUD approval |
| Epic | Seahorse jewelry | x50%, y89% | Recognizable gold/brass seahorse on jewelry tray, but very conspicuous, too low, and larger/more ornamental than the intended modest bronze pendant; no Epic concealment or chain-attachment acceptance |

Thus this is **six visible candidates, not a six-item gameplay pass**. The last two stations still drifted toward the foreground despite the prompt. Do not solve that with an invisible hotspot or untested coordinates. After art feedback, move/select suitable objects or verify a genuinely safe runtime presentation, and update names/cards/clues together. Keep current six-target plan provisional.

## Next boundary

Show the artwork for feedback with the discovery-placement caveat. Do not render cloud city or insert the personalized child until the appropriate next approval. Ice palace v2 and dragon cave v3 remain art-approved but retain their separately documented discovery gaps.
