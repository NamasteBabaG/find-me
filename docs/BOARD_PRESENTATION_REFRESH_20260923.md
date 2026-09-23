# Approved board presentation — 23 September 2026

## Cause and change

The public carousel used the older density-v3 Journey boards and the older
scene catalog for Kingdom. It did not follow the approved 18-board release.

`content/home/board-presentation.json` is now a small explicit public projection
of `TWO_WORLD_RELEASE_CATALOG` and `TWO_WORLD_RELEASE_ROUTES`: source hash,
revision, localized place name, thumbnail and six discovery names per board.
It contains no personal image, target position, storage path or generation prompt.
Rebuild with `npx tsx scripts/refresh-board-presentation.ts --apply`.
All 18 thumbnails are 960×540 derivatives with content-addressed filenames.
No AI rendering or edits to approved masters were performed.

## Surface inventory

| Surface | Source / action |
| --- | --- |
| Home world carousel, both languages | All 18 current boards and matching six discovery names |
| Creation world cards | First approved board of each world; unchanged map fallback for the third world |
| Historical marketing hero copies | Dragon-cave derivative refreshed; New York already current; third world unchanged |
| Current animated home hero and transformation example | Approved beach demo, intentionally unchanged: girl and geometry must stay matched |
| Playable beach demo and demo passport | Same approved fictional beach example; never substitute a real child's picture |
| Saved-game map thumbnails | Pinned `config.scenes[].art.thumbnail`, not a marketing override |
| Personal postcards, completion, family/shared passport | Pinned board + child's approved patch + measured crop, not a marketing override |
| Admin scene catalog | Actual generation catalog, deliberately not disguised with marketing art |
| Historical review HTML | Historical evidence, not storefront navigation |

The new two-world pilot already carries the approved bases. This presentation
change does NOT activate the pilot as the paid generation catalog, migrate saved
games or change which worlds can be purchased. Those are separate release gates.

## Verification

- Six focused suites: 13 tests passed, including byte-for-byte thumbnail rebuild,
  all 18 approved source hashes, both language projections and real picker props.
- Browser: all nine Journey images loaded; all nine Kingdom images loaded after
  scrolling lazy images into view. Desktop 1440px and mobile 390px inspected;
  zero horizontal overflow and no framework error overlay.
- Screenshots under untracked `tmp/boards-*`, not deployment content.
- A full-suite attempt was interrupted across a long host/session gap and
  produced anomalous 20+ minute test timings. It is NOT counted as a passing gate;
  rerun evidence must be recorded before release.

Claude reviewed `2efc5ca7`, not this later presentation patch. The distinction is
intentional: this document is the delta for his next review.
