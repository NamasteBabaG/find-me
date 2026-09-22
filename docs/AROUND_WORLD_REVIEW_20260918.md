# Around the World — current-board review

18 September 2026. The user approved Dinosaur Valley v2, paused new artwork, and requested all nine Around the World boards on one page before deciding what to refine.

## Review surface

- Local URL: `http://localhost:3034/reviews/around-the-world-20260918.html`
- Output: `public/reviews/around-the-world-20260918.html`
- Source manifest: `docs/art/around-world-review-20260918.json`
- Renderer options: `docs/art/around-world-review-20260918.options.json`
- Generated using Creative Production's shared `review_renderer.py`, `image-wall` preset. Original images are referenced directly, not copied, cropped, resized on disk, filtered or regenerated.
- Captions follow the world order in `content/worlds/journey/world.json`: New York, Amazon, Paris, Marrakech, Giza, Tokyo, Great Wall, Sydney, Antarctica. Clicking an image opens its full-resolution source; browser Back returns to the gallery.
- These are public base boards, without any child's private personal overlay. This is an art-comparison page, not a personalized game or approval workflow.

## Source validation

Resolved current source images through `content/adventures/wizard-release.ts`, `density-boards.ts`, `three-boards.ts` and the six density plans, checked against `content/adventures/wizard-art.json`. All nine files match their pinned SHA256 values and decode at 3840 × 2160. The older expansion review incorrectly uses earlier Marrakech/Tokyo versions; this page uses both `density-v3-items-v1` variants.

## Browser verification

- Local server returned HTTP 200 for the review page.
- All nine source images loaded successfully at 3840 × 2160.
- Inspected desktop screenshots at 1280 × 900 and 1120 × 900; responsive gallery shows three columns at the latter width.
- Inspected mobile at 360 × 740: all nine images loaded, a single column, no horizontal overflow.
- Clicked the Tokyo source link, verified a successful image-document response and the full-resolution dimensions, then returned to the review page.
- Dedicated verification browser closed afterward; existing local application server remains running.

No game runtime, discovery geometry, child overlays, catalog activation, Claude-owned UI, or QA deployment changed. User feedback on these boards is the next step. Dinosaur art approval does not close its still-pending discovery mapping or personalized gameplay checks.
