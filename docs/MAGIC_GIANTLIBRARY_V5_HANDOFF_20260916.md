# Approved library v5 — six discoveries authored

The user approved v5 art and authorized selecting usable existing props rather than repainting the board. This supersedes the unresolved **planned** six-item list in earlier review notes. No new render occurred and no original art pixels were changed.

| ID | Hebrew name | Rarity / provisional difficulty | Why this candidate |
|---|---|---|---|
| reading-globe | גלובוס | Common / 1 | Recognizable globe beside the reading nook |
| winged-book | ספר מכונף | Common / 1 | Distinct flying book beside the librarian |
| owl-cover-book | ספר עם ינשוף | Common / 1 | Illustrated owl on a large book cover, NOT the owl sculpture upstairs |
| atlas-magnifier | זכוכית מגדלת | Rare / 2 | Lies flat and blends with the atlas's warm colors |
| golden-shelf-vase | כד זהוב | Rare / 2 | Small warm-colored object within rows of similar spines |
| purple-hair-ribbon | סרט סגול לשיער | Epic / 3 | Thin purple ribbon in the foreground reader's hair; requires closer search |

Names explicitly distinguish an owl-covered book from the other owl ornament. Do not revert to generic 'owl'. The silver object beside the story group was rejected as ambiguous. Red spectacles remain decorative duplicates, not targets. Low-edge quill, paper fox and crescent bookmark also remain decorative, not targets.

## Files and verification

- Reproducible authoring: `scripts/author-giantlibrary-v5.ts`.
- Artwork: `public/scenes/magic-giantlibrary-v5/base.webp`.
- Thumbnail and provenance in the same directory.
- Normalized rectangles, bilingual names/hints/stories, category and rarity: `public/scenes/magic-giantlibrary-v5/discoveries.draft.json`.
- Six inspected square source crops: `output/imagegen/magic-giantlibrary-v5-authoring/*.png` (local ignored inspection outputs).
- Native dimensions: 3840 x 2160; lossless WebP decoded RGB verified identical to approved PNG.
- PNG SHA-256: `5e63c03c9272e611e6a0a09ea16fae1d4a30f6c0326bbd3e44cbdfdc9285ee61`.
- WebP SHA-256: `1d2b5586f7fcc59fd310904bd01c4f7ed06f10c9e47725fbfc8486a86068e415`.
- DiscoverySchema, six unique IDs, non-overlapping hit areas, source hash, card/visible/hit containment and 3/2/1 counts pass.
- All visible bounds lie inside x24–76%, y28–75%; actual extreme values are narrower in x. No corner target.
- 36 analytical camera reachability/round-trip checks passed using production viewport math: six targets across 360x800, 390x844, 844x390, 1024x768, 1440x900, 1920x1080 at twice fit scale.

## HUD scope and remaining gates

Read actual Collection/game CSS and docking logic in this art worktree: mission top-right, collection bottom, selected hint docking changes after focus, compact phone sheet. Interior placement reduces edge obstruction risk. This is NOT a live browser proof, nor a claim about Claude's latest checkout. Camera math tests do not measure the HUD's rendered rectangles or prove touch interaction.

Status stays `authored-not-playtested`, `catalogActivated: false`, `personalHides: 0`. Before release: integrate into the latest compatible app checkout, test each item with selection/hints/collection expanded and collapsed on desktop and mobile, inspect the round card rendering, pan/zoom/tap and replay, then calibrate difficulty with children. Preserve all six rectangles when placing personalized hides. No QA deployment or edits to Claude's application work in this turn.
