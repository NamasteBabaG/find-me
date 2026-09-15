# Castle gate v1 — render receipt and first visual review

Date: 2026-09-15. Status: **art candidate only; not gameplay-ready**.

## Generation provenance

- User authorized the first base render with the existing key after planning.
- Route: bundled imagegen Python CLI, Images edit API, `gpt-image-2`, quality `medium`, `n=1`, size `3840x2160`, PNG output, no prompt augmentation.
- Exact prompt: `docs/art/magic-castlegate-v1.prompt.txt`.
- Style source: `public/scenes/adventure-giza-repaired-v1/base.webp`, SHA-256 `ed3fa132942cef43daba21723f34641470153e954a13767dd178df7d27088e21`.
- Sent reference: lossless PNG conversion of the source at unchanged 3840×2160 dimensions (`output/imagegen/giza-style-reference.png`). No child's photo was transmitted.
- First invocation was rejected with HTTP 400 `unsupported_file_mimetype`: the WebP file was transmitted as `application/octet-stream`. It produced no image.
- Second invocation used the PNG reference and succeeded, reporting 77.3 seconds. One generated candidate, no art-correction requests. SDK transport retry behavior was not instrumented.
- The CLI does not expose a saved provider usage receipt. **Actual billed cost is unknown**, not zero and not inferred from historical personal-patch prices. No budget environment variables were changed.

## Output

- Native returned file: `output/imagegen/magic-castlegate-v1.png`.
- Measured dimensions: **3840×2160**, PNG, **18,378,832 bytes**. No local upscale or image-content changes.
- SHA-256: `d02eb926f7d90139400c7ba833a449e13aa5c50ac285c5e9d2d58a7b0005e32e`.
- Absolute location: `C:/GNart/Work/find-me/work/independent-worlds-pilot-20260915/output/imagegen/magic-castlegate-v1.png`.
- Raw images and diagnostic crops are local, gitignored under `output/imagegen/`. The tracked prompt and this document preserve reproducibility/provenance, but are not a backup of the binary.

## Visual assessment

The returned illustration has a closed castle gate, shallow elevated staging,
visible drawn contours and textured warm/cool paint. Sewing, puppets, toy repair,
music, bread trading, a picnic, chalk play, shield painting, chess and kite repair
provide varied human activity across the frame. Foreground people do not become
giants. Top architecture still occupies a substantial strip; the requested
60–70 character target was not verified by an exact count. Art direction requires
the user's approval, not just technical size validation.

Full-image review plus native-pixel crops found material discovery failures:

| Intended discovery | Observed result | Acceptance |
| --- | --- | --- |
| Copper bell | A recognizable small handled bell is on the messenger's lower-left table. | Candidate located; size, uniqueness and mobile hit area still need final mapping. |
| Wooden dragon | Toy shelves contain carved animals, including large ambiguous horse/dragon-like forms. A single clearly winged dragon toy matching the brief was not verified. | Not accepted. |
| Striped feather | Multiple large feathers appear by the sewing materials, including another on the lower table. | Fails uniqueness and intended small scale. |
| Silver key | The guard's table has oversized entangled key-like metal shapes, without a clean single small key silhouette. | Not accepted. |
| Folded map | A recognizable folded route-marked paper sits in the right produce basket. It is larger and more exposed than the planned Rare treatment. | Located, but difficulty needs correction/review. |
| Moon brooch | The blue banner fastening is a large circular ring rather than a crescent. | Fails requested shape and intended subtlety. |

The six requested objects were included in the prompt; this is **not** a claim
that all six were delivered correctly. Do not create final cards or hit areas
from the planning coordinates. No comprehensive anatomy or mobile gameplay
acceptance pass has been completed for this candidate.

## Next gate

Present the whole board for approval of style, scale and crowd density first.
If accepted compositionally, a separately scoped local repair pass should make
the six targets unique and recognizable, reduce exposed Rare objects, and remove
the extra feathers. Inspect the repaired output before mapping coordinates.
Do not automatically rerender the whole board, generate personal patches, or
dispatch the library/forest. Their plans and all 18 discovery definitions are in
`MAGIC_FIRST_THREE_ART_PLAN_20260915.md`.

No catalog activation, existing-game changes, wizard edits, QA deployment or
production deployment occurred during this art pass.
