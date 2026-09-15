# Castle v8 — brighter daylight

## Subsequent user rejection

The user rejected this version for different brushwork and over-smoothed,
sculptural surface rendering. Brightness metrics below do not demonstrate style
preservation. Do not use v8 as the source for another correction cascade.
The next explicitly authorized pass restarts from early v1 plus approved Giza.

User feedback: the entire v7 board was too dark. This pass requests lighting and
exposure only, preserving composition, people, props and matte material treatment.

- Route: bundled imagegen CLI, existing authorized API key, one edit invocation.
- Model `gpt-image-2`, high quality, n=1, 3840x2160 PNG, no augmentation.
- Input `output/imagegen/magic-castlegate-v7-clean-density.png`.
- Exact prompt `docs/art/magic-castlegate-v8-bright-daylight.prompt.txt`.
- Output `output/imagegen/magic-castlegate-v8-bright-daylight.png`.
- Measured 3840x2160, 18,777,912 bytes; no local upscale.
- SHA256 `0d2f03c5c2850745e93e1117cda9aefae5c91263d0d1cd889264c5db1811ae06`.
- CLI reported 115.2 seconds. Actual billed cost/usage unavailable, not zero.

Full-image inspection: clearly brighter faces, cloth, foreground and stone;
colors are more vivid, dark outlines and contact shadows remain. Overall staging
and stories remain recognizable. This is generative editing, not pixel-identical
exposure adjustment; some small details drift, so coordinates must be mapped only
on the final accepted version.

Diagnostic only: after resizing both files to 384x216, mean weighted **encoded**
RGB luma (0.2126 R + 0.7152 G + 0.0722 B) increased from 85 to 120/255; pixels
below 64 decreased from 40% to 20%. This verifies a substantial brightness change,
not a calibrated physical exposure value or proof of visual acceptance.

Originals retained, local raw outputs gitignored, no QA/public asset replacement.
Existing discovery uniqueness/readability and new window/awning depth review
remain open. Not declared gameplay-ready; no personal patches or further bases.
