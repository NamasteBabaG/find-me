# Castle item corrections — v12 local composite

The user approved correcting five item areas while leaving the accepted v10
artwork and copper bell intact. This is item-art/mapping work, not authorization
for more worlds, personal renders or a deployment.

## Result

- Base: `output/imagegen/magic-castlegate-v12-items.png`, 3840x2160.
- SHA256: `ac096862c6b86d2f4b2fc8062084e98f3f7c01fbdee9d4341f1a950c9439955c`.
- Source: v10, SHA256 `47bd941c4a0fa901723cf9e6b2da7d45caa4712911a6889971d19f73acddf4fc`.
- Full board is NOT a new full-board rerender. Seven local regions were assembled
  from generated close-crop edits into the immutable original; a narrow feather
  blends seams. Generated 1024-square repairs were downsampled to their original
  512/600-square context geometry. Do not describe this as a new native 4K render.
- Verified **zero changed pixels outside the seven local repair regions**.
- Main scene, people, exposure and all other artwork retain original pixels.
- Final cropped cards visually inspected: all six target identities readable.

## Attempts and provenance

1. One masked 4K edit via bundled CLI, gpt-image-2 high, returned in 122.0 seconds.
   Failed visual acceptance: removed feather/key/map, malformed moon, changed
   masked context. Raw v11 and diagnostic composite are REJECTED. Never publish.
2. Five separate local crop edits via same bundled CLI, gpt-image-2 high, each
   1024x1024. Feather 141.1s, dragon 138.9s, key 140.8s, map 142.1s, moon 136.4s.
   Inputs all came from v10, not rejected v11. No SDK wrapper or model switch.
3. Pure local assembly adjustment: expanded lower toy repair upward to erase the
   original floating heads; excluded original red spool from the feather blend.
   No additional generation.

Six total CLI invocations. Actual cost/usage unavailable, not zero. No budget
setting changes. Raw files in ignored output directory are LOCAL, not backed up
by git. Exact crop requests and assembly are reproducible from
`scripts/castlegate-item-crops.mjs`; initial rejected prompt and mask preparation
are in `docs/art/magic-castlegate-v11-items.prompt.txt` and
`scripts/castlegate-item-repair.mjs`.

## Authored item coordinates (native pixels)

| ID | Rarity | Visible/hit rectangle x,y,w,h |
| --- | --- | --- |
| copper-bell | common | 665,1206,60,76 |
| wooden-dragon | common | 1386,690,96,99 |
| striped-feather | common | 862,628,40,64 |
| silver-key | rare | 2639,860,63,43 |
| folded-map | rare | 3258,1261,95,76 |
| moon-brooch | epic | 2245,223,39,42 |

The copper bell is unchanged. The two original feathers became one smaller
striped feather. The ambiguous lower beasts became a horse and one winged dragon;
the upper dragon-like toy became a wooden cat. Key has a readable bow/shaft/teeth.
Map is smaller among fruit. Moon is a smaller rotated crescent, not a large ring.

Rarity/difficulty remain the planned 3 common / 2 rare / 1 epic. The key did not
retain the requested strap occlusion and moon is still in the banner's central
fold; don't claim every camouflage instruction was fulfilled. Tune difficulty
after runtime playtesting rather than making them illegible to meet labels.

## Mapping and checks

`scripts/map-castlegate-items.ts` pins the source hash, authors bilingual names,
actual-position hints and stories, normalizes visible/hit/card rectangles and
validates all six with the existing `DiscoverySchema`. Hit rectangles are within
visible rectangles as the current schema requires; no domain contract changed.

Generated authoring assets under `output/imagegen/castlegate-item-crops/`:
- `discoveries.draft.json`: `authored-not-playtested`, NOT a ready catalog entry.
- `<item-id>-card.png`: lossless crops of final board pixels.
- `six-item-review.png`: enlarged diagnostic contact strip, not new detail.
- `receipt.json`: source/output hashes and outside-region pixel preservation.

Passed: six schema validations, bounds, distinct IDs by authored definition,
pairwise non-overlapping hits, source hash, script syntax and git diff whitespace.
Visual review covered full board, local contexts and all six card crops.

Still open: in-game mobile zoom/touch/HUD validation, user visual approval of
item repair, personal hiding zones and their protection of these item crops,
eventual runtime/catalog integration. No existing game or QA asset changed.
