# Castle v9 — early-source style reset and inhabited paving

## Scope and provenance

User explicitly approved returning to the early castle with Giza as the actual
style reference, and requested more people and situations on exposed paving.
One paid edit invocation; no automatic correction loop, no personalized child,
no QA deployment, no catalog or wizard change.

- Bundled imagegen CLI, existing authorized key, `gpt-image-2`, high, n=1.
- Inputs: `output/imagegen/magic-castlegate-v1.png` (edit target) and
  `output/imagegen/giza-style-reference.png` (style only).
- Exact prompt: `docs/art/magic-castlegate-v9-style-reset-density.prompt.txt`.
- Output: `output/imagegen/magic-castlegate-v9-style-reset-density.png`.
- Measured 3840x2160, 20,398,161 bytes. No local upscale or color processing.
- SHA256: `9c7d737399c487d54d153b54db829cc8ec49d5d43a3da7657f8b7f78ba42aba1`.
- CLI reported 130.0 seconds. Billed cost and usage unavailable, not zero.
- Source files retained; gitignored raw outputs remain local, not remote backup.

## Inspection

Full-frame and native 1160x1000 diagnostic crop inspected. Crop is
`output/imagegen/magic-castlegate-v9-detail.png` at x1480,y900; original unchanged.

Compared with rejected v8, more visible irregular contours and interior texture,
less polished/plastic shading. Density is materially higher: new children playing
with blocks at lower left and middle, toy comparisons at the central workshop,
new bakery visitors, a flower-carrying visitor, additional gate visitors and a
child beside the banner. Broad foreground paving is broken into smaller gaps.
Do not claim exactly 16 additions: that was a prompt target, not a verified count.

Remaining limitations: overall image is still warm/brown and relatively dark;
block-building groups repeat; several male faces still share beard/hair patterns.
The workshop seated child was changed rather than strictly preserved. The six
search items are NOT accepted: the feather and crescent appear oversized, key
readability and wooden-dragon uniqueness still need exact inspection/correction.
Style improvement is an assessment, not user approval or proof of exact matching.

Next gate is user visual review. Do not silently promote this to gameplay or
start Bar patches. No further paid render dispatched in this pass.
