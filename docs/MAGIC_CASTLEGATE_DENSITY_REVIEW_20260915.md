# Castle density/detail refinement after v4

User requested more board detail and a few more characters, retaining the latest
matte material treatment. No personal target rendering, catalog activation,
wizard edit or deployment is included.

## Iterations (record all requests, including rejected candidates)

Bundled imagegen CLI/API route with the existing authorized key, `gpt-image-2`,
high quality, n=1 per request, 3840x2160 PNG. Cost receipts are not exposed by the
CLI; actual billed costs remain unknown, not zero. No budget settings changed.

1. v4 input -> `output/imagegen/magic-castlegate-v5-story-density.png`.
   Prompt: `docs/art/magic-castlegate-v5-story-density.prompt.txt`.
   126.4s, native 3840x2160, 17,180,614 bytes.
   SHA256 `66537d4494c512841aceaa96fb3963bd35351b9199954594c9f82b5ca57b9b1e`.
   Added useful tailoring/workshop/bakery props, customer and paint helper.
   Failed preservation: seated toy-workshop child removed; upper-window and
   parapet characters changed instead of being additional figures. Requested six
   new people were not verified as six net additions. Not selected as final.
2. v5 input -> `output/imagegen/magic-castlegate-v6-extra-people.png`.
   Prompt: `docs/art/magic-castlegate-v6-extra-people.prompt.txt`.
   117.5s, native 3840x2160, 16,629,703 bytes.
   SHA256 `29665f53229a3c7ffc2ad2aebc56d8865ce3ca4128357b27bfc13c08c7c3db08`.
   Restored a seated workshop boy and added upper-right window people, but
   replaced chalk players rather than preserving them and introduced conspicuous
   doubled/ghosted contours. **Rejected**; do not promote this image.
3. Clean v4 input again -> `output/imagegen/magic-castlegate-v7-clean-density.png`.
   Prompt: `docs/art/magic-castlegate-v7-clean-density.prompt.txt`.
   Recovery uses the clean source rather than propagating v6 defects.
   122.8s, native 3840x2160, 17,003,074 bytes.
   SHA256 `5fbd4e7391e89351f5ab96957d5222d3e5fcf1bdf1d194e0cf0e7900421f562e`.
   **Selected enriched preview**, not a gameplay-ready scene.

## v7 inspection

Full-image review shows six additional people relative to v4: two new children
playing at lower left, adult/child at upper-right bakery window, bakery customer
carrying bread, and kneeling child at far lower right. The seated workshop boy
is present. Existing chalk players remain as a two-child interaction but their
poses/activity changed to blocks, so do not claim pixel/pose preservation.

Work surfaces gained sewing tools, envelope bundles, wood-working details,
crates and small play pieces. The matte material family, framing and shallow
stage remain recognizable. The pronounced double-outline artifacts in v6 are
reduced in this clean-source candidate; this does not constitute a complete
anatomy/occlusion acceptance pass.

Upper-right new window figures meet the bakery awning in an ambiguous overlap;
review that local depth before shipping. Existing silver-key readability and
wooden-dragon uniqueness problems remain open. No final target mapping or
personal patches should be derived until local repairs and art approval.

Raw generation candidates remain local and gitignored under `output/imagegen/`.
They are not a remote backup. Existing v4 is retained unchanged as the clean
rollback/reference. No rendering after this clean-source recovery is authorized
by this work log itself.
