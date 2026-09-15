# Castle v4 — material-only repaint

User feedback: v3 still treated hair, fabric, stone, wood and metal with the
same glossy highlight language. User requested correcting this throughout.
This pass intentionally excludes people additions, face redesign and discovery
repairs to isolate the material problem.

## Execution and file

- Continued existing authorized API/key workflow; one edit invocation.
- Bundled imagegen CLI, `gpt-image-2`, **high** quality, n=1, 3840x2160 PNG.
- Input: `output/imagegen/magic-castlegate-v3-diversity.png`.
- Exact prompt: `docs/art/magic-castlegate-v4-material-separation.prompt.txt`.
- Output: `output/imagegen/magic-castlegate-v4-material-separation.png`.
- Measured: **3840x2160**, 18,096,606 bytes. Native returned dimensions; no upscale.
- SHA256: `df3398cbffddaeeaa5afa9c1d3eb9a76c6502aa886e9a443d15284e431e44a9c`.
- CLI reported 123.0 seconds. Actual cost/usage receipt unavailable; not assumed zero.
- Original versions retained. Raw PNGs are local gitignored artifacts, not a remote backup.

All outputs are under:
`C:/GNart/Work/find-me/work/independent-worlds-pilot-20260915/output/imagegen/`.

## Inspection

Reviewed the full board and an unscaled 1160x1000 diagnostic crop at
left=1480, top=900, saved as `magic-castlegate-v4-material-detail.png`.
The crop is a diagnostic view, not a modified or sharpened replacement image.

Compared with v3, limestone is visibly chalkier and less amber; paving no longer
has the same continuous gold bevel pattern. The blue worker's cloth has broader
matte fold shading, with much less shiny stippling. Hair has less gold outlining;
wood is drier with more subdued grain. The copper bell/pewter still retain small
light accents. Dark drawn edges, scene layout, faces and dense activity remain
recognizable. This is a visual judgment, not a measured physical reflectance test.

Trade-off: the image is less amber/warm overall than v3. Some light accents remain
on wood chips and clothing decoration; do not claim all nonmetal highlights were
removed or the output is physically perfect. User material/style approval remains
the gate. Existing key/wooden-dragon discovery issues were deliberately NOT fixed
in this pass; no gameplay-ready status, public asset replacement or deployment.
