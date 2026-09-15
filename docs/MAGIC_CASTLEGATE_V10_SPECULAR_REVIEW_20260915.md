# Castle v10 — subtle non-metal specular reduction

User liked v9 and requested slightly weaker specular on non-metal objects.
Interpreted the Hebrew typo as metal/non-metal; stated that interpretation before
the edit. Scope: one finish correction, not new people or another style direction.

- Source: `output/imagegen/magic-castlegate-v9-style-reset-density.png` only.
- Prompt: `docs/art/magic-castlegate-v10-subtle-specular.prompt.txt`.
- Route: existing authorized key, bundled imagegen CLI edit, gpt-image-2 high,
  n=1, 3840x2160, no augmentation. CLI elapsed 119.3 seconds.
- Output: `output/imagegen/magic-castlegate-v10-subtle-specular.png`.
- Measured 3840x2160, 17,899,655 bytes; no local upscale or color processing.
- SHA256 `47bd941c4a0fa901723cf9e6b2da7d45caa4712911a6889971d19f73acddf4fc`.
- Actual billing/usage unavailable, not zero. Raw outputs local and gitignored.

Full image and native crop inspected. Non-metal highlights appear more subdued,
especially on wood, cloth and faces. Main people/groups and shallow layout remain
recognizable. However, image also appears darker and some fine brush texture has
softened; this is not a pixel-preserving specular-only adjustment. The requested
15-20% was prompt guidance, not a measured material property. Keep user-liked v9
intact as fallback. v10 is a review candidate, not a silently accepted replacement.

No QA/public/catalog changes, no personal patches. Discovery validation remains
open. No additional correction render made in this turn.
