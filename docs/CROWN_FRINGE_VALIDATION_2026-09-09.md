# Crown hair-fringe validation — opt-inv3

Policy: `connected-crown-fringe-bounded-feet/v3`.

This is a correction to hair-edge validation, not a larger transform correction.
An observed hair extremum can be antialiased while the actual head, face and
body remain complete. Treating that hair pixel like an opaque face or sole
incorrectly rejected three paid examples. Moving the crown to nearby solid hair
would have exceeded the existing one-native-board-pixel transform limit, so that
approach was not adopted.

## Required evidence

Only when the existing three-source-pixel opaque-crown search fails, v3 checks:

- The original semantically observed crown has nonzero alpha; it is not a guessed alpha-box apex.
- Through8-connected nonzero-alpha pixels inside a12-source-pixel radius, the crown reaches an alpha≥224 contour.
- That contour connects to BOTH the same child's opaque observed eye and chin, within a plausible head region.
- Complete-figure and original-frame-clear observations are still required. Invalid/implausible head observations and disconnected specks are rejected.

The **original crown coordinate is retained**. No image pixel, source landmark
receipt, authoring anchor or scale target changes. Provenance separately records
the raw alpha, connected contour, distances, connected facial landmarks and zero
additional crown transform shift. The existing strong-top distance limit of two
native board pixels remains mandatory.

Feet still use the unchangedv2 bounded refinement: alpha≥224, source radius≤12,
disjoint quarter-foot neighborhoods, and full-image affine AND actual rounded
raster movement≤one native board pixel. Face opacity, foreground face visibility,
scale, ground contact, original frame, fixed window and protected-neighbor guards
are unchanged. Geometry still does not approve identity, anatomy, lighting or
style; the final composite requires visual review.

## Evidence

The three existing private paid sources were evaluated with v3 in memory only:
Sydney lifeguard, Sydney rocks and Paris bakery. All three passed geometric
checks, with **byte-identical prior patch PNGs and identical transforms**. Neither
the paid observation receipts nor the production catalog was changed. Costs:0.

Detailed local evidence (contains private child-image paths; do not publish):
`work/open-placement-20260909/crown-contour-evidence-v1/v3-evaluation/findings.json`.

Tests cover those coordinate/alpha patterns using synthetic images, zero alpha,
disconnected spark, distant solid pixels, wrong component, missing facial pixels,
incomplete/clipped head, implausible head, hidden face, native-top bound and both
passing/failing sole precision. Older absent-policy/v2 behavior and fingerprints
are retained. This policy is explicitly versioned and must only enter a new
authoring/replay revision after review; never relabel historical receipts.
