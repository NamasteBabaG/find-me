type Point = { x: number; y: number };
export const STANDING_PIXEL_REFINEMENT_V2 = "bounded-transform-one-board-pixel/v2" as const;
/** Refines a semantically observed contour point by at most THREE native pixels.
 * This is raster quantization, never an anatomy search or bounding-box inference.
 * Raw model readings remain in the immutable observation receipt. */
export function resolveStandingPixel(point: Point, rgba: Buffer, width: number, height: number): Point | null {
  let nearest: Point | null = null, best = Infinity;
  for (let y = Math.floor(point.y) - 3; y <= Math.ceil(point.y) + 3; y++)
    for (let x = Math.floor(point.x) - 3; x <= Math.ceil(point.x) + 3; x++) {
      const distance = Math.hypot(x - point.x, y - point.y);
      if (distance > 3 || distance >= best || x < 0 || y < 0 || x >= width || y >= height || rgba[(y * width + x) * 4 + 3]! < 224) continue;
      nearest = { x, y }; best = distance;
    }
  return nearest;
}

type StandingPoints = { crown: Point; leftSole: Point; rightSole: Point };
type ResolvedPoints = { [K in keyof StandingPoints]: Point | null };
type Transform = { scale: number; translateX: number; translateY: number };

/** An opt-in quantization repair, never a search for anatomy. Only an already
 * semantically observed sole whose three-pixel lookup failed may search farther.
 * Its nearest opaque candidate must be within12 source pixels, strictly inside
 * a quarter of the two observed feet's separation, and move EVERY corner of the
 * full source image by at most ONE native board pixel beyond the existing3px
 * renderer. Its baseline keeps standard-resolved points and raw readings only
 * where the standard lookup failed. The crown stays at3px. */
export function refineStandingPixelsByBoardTransform(raw: StandingPoints, standard: ResolvedPoints,
  rgba: Buffer, width: number, height: number, destination: { supportPointPx: Point; standingHeightPx: number }) {
  const transform = (p: StandingPoints): Transform | null => {
    const x = (p.leftSole.x + p.rightSole.x) / 2, y = Math.max(p.leftSole.y, p.rightSole.y), span = y - p.crown.y;
    if (!(span > 0) || !Number.isFinite(span) || !(destination.standingHeightPx > 0)) return null;
    const scale = destination.standingHeightPx / span;
    return { scale, translateX: destination.supportPointPx.x - x * scale, translateY: destination.supportPointPx.y - y * scale };
  };
  const footSeparation = Math.hypot(raw.leftSole.x - raw.rightSole.x, raw.leftSole.y - raw.rightSole.y);
  const quarter = footSeparation / 4, radius = Math.min(12, quarter);
  const nearest = (p: Point): Point | null => {
    let found: Point | null = null, best = Infinity;
    for (let y = Math.floor(p.y) - 12; y <= Math.ceil(p.y) + 12; y++) for (let x = Math.floor(p.x) - 12; x <= Math.ceil(p.x) + 12; x++) {
      const distance = Math.hypot(x - p.x, y - p.y);
      if (distance > 12 || distance >= quarter || distance >= best || x < 0 || y < 0 || x >= width || y >= height || rgba[(y * width + x) * 4 + 3]! < 224) continue;
      found = { x, y }; best = distance;
    }
    return found;
  };
  const needed = !standard.leftSole || !standard.rightSole;
  const candidate: ResolvedPoints = { crown: standard.crown, leftSole: standard.leftSole ?? nearest(raw.leftSole), rightSole: standard.rightSole ?? nearest(raw.rightSole) };
  const rawTransform = transform(raw);
  const baseline = { crown: standard.crown ?? raw.crown, leftSole: standard.leftSole ?? raw.leftSole, rightSole: standard.rightSole ?? raw.rightSole };
  const baselineTransform = transform(baseline);
  const allPresent = candidate.crown && candidate.leftSole && candidate.rightSole;
  const refinedTransform = allPresent ? transform(candidate as StandingPoints) : null;
  let maxCornerDisplacementPx: number | null = null;
  let maxRawCornerDisplacementPx: number | null = null;
  let maxRasterCornerDisplacementPx: number | null = null;
  if (baselineTransform && refinedTransform) {
    const displacement = (from: Transform) => Math.max(...[{ x: 0, y: 0 }, { x: width, y: 0 }, { x: 0, y: height }, { x: width, y: height }].map(p =>
      Math.hypot((refinedTransform.scale - from.scale) * p.x + refinedTransform.translateX - from.translateX,
        (refinedTransform.scale - from.scale) * p.y + refinedTransform.translateY - from.translateY)));
    maxCornerDisplacementPx = displacement(baselineTransform);
    maxRawCornerDisplacementPx = rawTransform ? displacement(rawTransform) : null;
    // The compositor rounds resize dimensions and translation to integers.
    // Bound those actual raster corners too; two independent rounding changes
    // must not turn a subpixel affine correction into a2pixel PNG movement.
    const rasterCorner = (t: Transform, right: boolean, bottom: boolean) => ({ x: Math.round(t.translateX) + (right ? Math.max(1, Math.round(width * t.scale)) : 0),
      y: Math.round(t.translateY) + (bottom ? Math.max(1, Math.round(height * t.scale)) : 0) });
    maxRasterCornerDisplacementPx = Math.max(...[[false, false], [true, false], [false, true], [true, true]].map(([right, bottom]) => {
      const a = rasterCorner(baselineTransform, right!, bottom!), b = rasterCorner(refinedTransform, right!, bottom!);
      return Math.hypot(a.x - b.x, a.y - b.y);
    }));
  }
  const distance = (key: keyof StandingPoints) => candidate[key] ? Math.hypot(candidate[key]!.x - raw[key].x, candidate[key]!.y - raw[key].y) : null;
  const leftDistance = distance("leftSole"), rightDistance = distance("rightSole");
  // Disjoint quarter-foot neighborhoods cannot collapse two observations onto
  // one shoe or cross their ownership. This also bounds any standard companion
  // sole when the other sole needs the expanded refinement.
  const unambiguous = footSeparation > 0 && leftDistance !== null && rightDistance !== null && leftDistance < quarter && rightDistance < quarter
    && candidate.leftSole && candidate.rightSole && Math.hypot(candidate.leftSole.x - candidate.rightSole.x, candidate.leftSole.y - candidate.rightSole.y) > footSeparation / 2;
  const accepted = needed && !!standard.crown && !!allPresent && !!unambiguous && maxCornerDisplacementPx !== null && maxCornerDisplacementPx <= 1
    && maxRasterCornerDisplacementPx !== null && maxRasterCornerDisplacementPx <= 1;
  const reason = !standard.crown ? "crown-not-supported-within-three-pixels" : !needed ? "standard-three-pixel-support-sufficient"
    : !allPresent ? "no-opaque-sole-inside-bounded-neighborhood" : !unambiguous ? "ambiguous-foot-ownership"
      : maxCornerDisplacementPx === null ? "invalid-standing-transform" : maxCornerDisplacementPx > 1 ? "moves-full-image-more-than-one-board-pixel"
        : maxRasterCornerDisplacementPx === null || maxRasterCornerDisplacementPx > 1 ? "moves-raster-more-than-one-board-pixel" : "accepted-bounded-quantization";
  return { resolved: accepted ? candidate : standard, provenance: { version: STANDING_PIXEL_REFINEMENT_V2, applied: accepted, needed,
    raw, baseline, nearest: candidate, sourceDistances: { crown: distance("crown"), leftSole: leftDistance, rightSole: rightDistance },
    sourceRadiusPx: radius, footSeparationPx: footSeparation, rawTransform, baselineTransform, refinedTransform,
    maxCornerDisplacementPx, maxRawCornerDisplacementPx, maxRasterCornerDisplacementPx, reason } };
}
