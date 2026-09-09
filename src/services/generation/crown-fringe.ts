type Point = { x: number; y: number };
export const CROWN_FRINGE_REFINEMENT_V3 = "connected-crown-fringe-bounded-feet/v3" as const;

/** Validates a semantically observed hair extremum, without changing its
 * coordinate or using an alpha bounding box to invent a crown. Antialiased hair
 * is not a face/sole: its nonzero alpha must lead to solid hair within12px AND
 * belong to the same connected head as the child's opaque eye and chin.
 * This does not approve anatomy, style, scale, frame clearance or placement. */
export function validateConnectedCrownFringe(input: {
  crown: Point; eye: Point; chin: Point; complete: boolean; originalFrameClear: boolean;
  rgba: Buffer; width: number; height: number;
}) {
  const { crown, eye, chin, rgba, width, height } = input;
  const inside = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.y >= 0 && p.x < width && p.y < height;
  const at = (p: Point) => inside(p) ? rgba[(Math.floor(p.y) * width + Math.floor(p.x)) * 4 + 3]! : 0;
  const rawAlpha = at(crown), faceSpan = Math.hypot(chin.x - eye.x, chin.y - eye.y);
  let contour: Point | null = null, contourDistancePx: number | null = null;
  let localConnectedPixels = 0, headConnectedPixels = 0, eyeConnected = false, chinConnected = false;
  const result = (accepted: boolean, reason: string) => ({
    version: CROWN_FRINGE_REFINEMENT_V3, accepted, reason,
    rawCrown: { ...crown }, usedCrown: { ...crown }, rawAlpha,
    sourceRadiusPx: 12, contour, contourDistancePx, localConnectedPixels, headConnectedPixels,
    eyeConnected, chinConnected, coordinateChanged: false as const, additionalCrownTransformShiftPx: 0,
  });
  if (rgba.length !== width * height * 4 || !input.complete || !input.originalFrameClear)
    return result(false, "complete-unclipped-source-required");
  if (![crown, eye, chin].every(inside) || rawAlpha === 0) return result(false, "raw-crown-has-no-alpha");
  if (!(faceSpan > 0) || !(chin.y > eye.y) || crown.y < 1 || crown.x < 1 || crown.x >= width - 1
    || !(crown.y < eye.y) || eye.y - crown.y < faceSpan * .25 || eye.y - crown.y > faceSpan * 3.5
    || Math.abs(crown.x - eye.x) > faceSpan * 2)
    return result(false, "crown-outside-plausible-observed-head");
  if (at(eye) < 224 || at(chin) < 224) return result(false, "opaque-observed-face-required");

  //8-connected antialias topology, constrained to the twelve-source-pixel disk.
  // A disconnected spark cannot jump across transparent pixels to nearby hair.
  const start = { x: Math.floor(crown.x), y: Math.floor(crown.y) };
  const neighbors = [-1, 0, 1].flatMap(dy => [-1, 0, 1].filter(dx => dx || dy).map(dx => ({ dx, dy })));
  const seen = new Set<number>([start.y * width + start.x]), queue: Point[] = [start];
  let best = Infinity;
  for (let index = 0; index < queue.length; index++) {
    const p = queue[index]!;
    const distance = Math.hypot(p.x - crown.x, p.y - crown.y);
    if (at(p) >= 224 && distance <= 12 && distance < best) { contour = p; contourDistancePx = distance; best = distance; }
    for (const { dx, dy } of neighbors) {
      const q = { x: p.x + dx, y: p.y + dy }, id = q.y * width + q.x;
      if (seen.has(id) || !inside(q) || Math.hypot(q.x - crown.x, q.y - crown.y) > 12 || !at(q)) continue;
      seen.add(id); queue.push(q);
    }
  }
  localConnectedPixels = queue.length;
  if (!contour) return result(false, "no-connected-solid-hair-within-twelve-source-pixels");

  // Nearby opacity alone is insufficient: it may be another component. Stay in
  // a conservative head region and require the solid contour to reach BOTH of
  // this child's already-observed facial landmarks through nonzero alpha.
  const region = { left: Math.max(0, Math.floor(eye.x - faceSpan * 2.5)),
    right: Math.min(width - 1, Math.ceil(eye.x + faceSpan * 2.5)),
    top: Math.max(0, Math.floor(crown.y - 12)), bottom: Math.min(height - 1, Math.ceil(chin.y + faceSpan * .5)) };
  const headQueue: Point[] = [contour], headSeen = new Set<number>([contour.y * width + contour.x]);
  const eyeId = Math.floor(eye.y) * width + Math.floor(eye.x), chinId = Math.floor(chin.y) * width + Math.floor(chin.x);
  for (let index = 0; index < headQueue.length; index++) {
    const p = headQueue[index]!, id = p.y * width + p.x;
    if (id === eyeId) eyeConnected = true;
    if (id === chinId) chinConnected = true;
    if (eyeConnected && chinConnected) break;
    for (const { dx, dy } of neighbors) {
      const q = { x: p.x + dx, y: p.y + dy }, nextId = q.y * width + q.x;
      if (headSeen.has(nextId) || q.x < region.left || q.x > region.right || q.y < region.top || q.y > region.bottom || !at(q)) continue;
      headSeen.add(nextId); headQueue.push(q);
    }
  }
  headConnectedPixels = headSeen.size;
  return result(eyeConnected && chinConnected, eyeConnected && chinConnected ? "connected-antialiased-hair-extremum" : "hair-contour-not-connected-to-observed-face");
}
