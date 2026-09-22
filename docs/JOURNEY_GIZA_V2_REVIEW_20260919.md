# Giza v2 — painted materials, composition preserved

19 September 2026. **STYLE REJECTED by the user; do not promote.** User explicitly clarified that the current Giza composition and activities are excellent; only the excessively polished style should change. This overrides the earlier plan to relocate edge discoveries during this pass. After seeing v2 the user supplied a direct Sydney/Giza comparison and said Giza remains much too polished and smooth. The earlier inspection below records what changed, not a successful match to the approved style. v3 must use Sydney directly as the stylistic authority instead of the castle face crop.

## Receipt

- Output: `output/imagegen/journey-giza-v2-painted-materials.png`.
- Verified native **3840 x 2160 PNG**, 17,172,137 bytes; no output resize, filter or upscale.
- Output SHA256: `256bb8bd615854158acd3070acd5b9fd27aede2fd5c54c1c3df9985e59c5e083`.
- Prompt: `art/journey-giza-v2-painted-materials.prompt.txt`.
- Structural source: `public/scenes/adventure-giza-repaired-v1/base.webp`, 3840 x 2160, 11,710,436 bytes; SHA256 `ed3fa132942cef43daba21723f34641470153e954a13767dd178df7d27088e21`.
- Style-only reference: `tmp/imagegen/magic-dimensional-faces-style.png`, SHA256 `e8cc2f2477f287e8c592837a82ccb043d2022c09de545cbedc56ac04bc7c5d70`. Used for dimensional painted modeling and material brushwork, not the reference's medieval subject, composition or darker palette.
- Existing authorized API key; unchanged bundled Imagegen CLI, edit mode, `gpt-image-2`, high quality, n=1, `--no-augment`.
- First submission was rejected with HTTP 400 `unsupported_file_mimetype`: WebP was sent as application/octet-stream by the existing file-upload path. It produced no image. No key rotation or CLI modification.
- Mechanical format-only conversion via Sharp to `tmp/imagegen/journey-giza-repaired-v1-source.png`; 24,115,661 bytes. Both decoded RGB buffers have SHA256 `bae3b356bad7411fff39f26907d7b35d2d159bb8d86a37659a5c5b1b1dcc7568`, proving the PNG input has identical pixels to the source WebP.
- Retried submission using that PNG plus the same style reference and prompt. One completed render, 108.0 seconds. Exact billed cost was not emitted; do not invent a cost or claim a billing outcome for the rejected request.
- No overwrites of live art, catalog/runtime edits, personalized hides, DB writes, commit, push or QA deployment.

## Actual visual review

Viewed the full image and seven unscaled native crops under `output/imagegen/journey-giza-v2-inspection/`: `upper-left-workers`, `research-table`, `camel-key-materials`, `lower-left-rugs-pottery`, `storyteller-faces`, `sphinx-chameleon`, `scarab-hands-tools`.

The broad arrangement, shallow perspective and principal activity groups remain closely aligned with the source: scaffold/hoist workers, map-table archaeologists, Sphinx visitors, rug sellers, three camels, pottery, storyteller/tea group, stone relief documentation and artifact sorting. No new zoom-out or foreground miniaturization was introduced. The repaired blue-shirt/gray-shorts boy remains on the left scaffold.

Material changes are visibly concentrated in painted planes on stone, dry wood, matte fabric folds, hair and fur. Sphinx stone is less uniformly polished; rugs and pottery retain their patterns; metal and glazed ceramic still have selective highlights. Cream/gold stone, blue/coral textiles, green palms and pink flowers remain bright. Faces retain modeled volume. No broad smear, ghosted duplicate faces or double outlines were observed in the inspected crops.

This is a generative restyle, **not pixel-identical preservation**. Small pattern details, relief marks, individual facial features and the lower-center dog's expression have been redrawn. Do not claim every pixel, micro-action, silhouette or existing child patch is unchanged. The user must judge whether this amount of brushwork now matches the approved board family. Similar bearded male faces inherited from the original were not deliberately redesigned in this scope.

## Discovery preservation, not gameplay clearance

All six current target categories were visibly located in the generated image at approximately their source locations. The below percentages are visual observations, not interaction coordinates:

| Target | Approximate location | Actual review |
| --- | --- | --- |
| Blue feather | x7%, y23% | Clear feather on stone near cat; upper-left edge exposure remains. |
| Magnifying glass | x50%, y28% | Dark round lens with red handle on research table remains recognizable. |
| Purple hourglass | x21%, y80% | Purple frame and glass/sand shape remain on pottery crate; still low/left. |
| Golden key | x43%, y44% | Ring, shaft and teeth visible hanging among camel tassels. |
| Green chameleon | x97%, y39% | Small green lizard with curled tail remains on right stone ledge; right-edge/HUD risk unchanged. |
| Turquoise scarab | x88%, y88% | Blue-green scarab shape in gold frame remains on artifact crate; lower-right/HUD risk unchanged. |

No additional copy of these six was noticed in the full/crop review, but uniqueness was not validated with an exhaustive gameplay test. Existing config rectangles are normalized from a 2048 x 1152 review of the prior master. Do not replace the old base underneath old hitboxes, crops or personalized patches just because the broad positions look similar. Any later adoption requires verified new mapping/hashes, cards/hints, actual desktop/mobile HUD checks and compatible personalized hides.

## Next

Show this candidate at native 4K for art approval. Do not start another automatic corrective restyle or move to Amazon before feedback on this candidate. Source image and rejected/old assets remain intact.

Imagegen supplied the versioned API edit. Creative Production's source-preservation guidance determined the locked-layout scope and native face/material/prop inspection. Its direct board tool is not callable on this surface; deliver the local image inline rather than fabricate a creative-board session. API Troubleshooting routed the rejected file-format request to a pixel-preserving PNG conversion.
