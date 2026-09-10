import sharp from "sharp";
import { pointInPolygon, sha256Bytes } from "./fixed-sprite";
import type { SimplePeekUncutInput } from "./simple-peek";
import { resolveStandingPixel, refineStandingPixelsByBoardTransform, STANDING_PIXEL_REFINEMENT_V2 } from "./standing-pixels";
import { CROWN_FRINGE_REFINEMENT_V3, validateConnectedCrownFringe } from "./crown-fringe";

type Point = { x: number; y: number };
export interface OpenPlacementInput extends Omit<SimplePeekUncutInput, "source" | "slot"> {
  source: SimplePeekUncutInput["source"] & {
    /** Observed anatomy, not the alpha bounding box of a possibly cropped bust. */
    standing: { complete: boolean; crown: Point; leftSole: Point; rightSole: Point;
      originalFrameClear: boolean };
  };
  slot: Omit<SimplePeekUncutInput["slot"], "pose"> & {
    pose: "standing"; mode: "open"; supportPointPx: Point; standingHeightPx: number;
    pixelRefinement?: typeof STANDING_PIXEL_REFINEMENT_V2 | typeof CROWN_FRINGE_REFINEMENT_V3;
  };
}

/** Whole-body composition. Geometry is necessary, never semantic release approval.
 * Uses observed soles for translation and observed crown-to-sole height for scale;
 * a truncated torso cannot become a standing child merely by touching its crop. */
export async function composeOpenPlacement(input: OpenPlacementInput) {
  const { source, slot } = input;
  const demand = (ok: unknown, why: string) => { if (!ok) throw new Error(`OPEN_PLACEMENT: ${why}`); };
  const decode = async (image: { png: Buffer; sha256: string }) => {
    demand(sha256Bytes(image.png) === image.sha256, "bound image bytes changed");
    return sharp(image.png, { limitInputPixels: 25_000_000 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  };
  const [sprite, board, foreground] = await Promise.all([decode(source), decode(input.board), decode(input.foreground)]);
  const sw = sprite.info.width, sh = sprite.info.height, bw = board.info.width, bh = board.info.height;
  const finite = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y);
  const rawAnatomy = source.standing;
  demand(rawAnatomy && [rawAnatomy.crown, rawAnatomy.leftSole, rawAnatomy.rightSole, source.eye, source.chin,
    slot.supportPointPx, slot.eye].every(finite), "explicit finite observed anatomy and authored support required");
  const standard = { crown: resolveStandingPixel(rawAnatomy.crown, sprite.data, sw, sh),
    leftSole: resolveStandingPixel(rawAnatomy.leftSole, sprite.data, sw, sh), rightSole: resolveStandingPixel(rawAnatomy.rightSole, sprite.data, sw, sh) };
  demand(slot.pixelRefinement === undefined || slot.pixelRefinement === STANDING_PIXEL_REFINEMENT_V2 || slot.pixelRefinement === CROWN_FRINGE_REFINEMENT_V3, "unknown pixel refinement policy");
  const crownFringe = slot.pixelRefinement === CROWN_FRINGE_REFINEMENT_V3 && !standard.crown
    ? validateConnectedCrownFringe({ ...rawAnatomy, eye: source.eye, chin: source.chin, rgba: sprite.data, width: sw, height: sh }) : null;
  // A validated hair extremum keeps its ORIGINAL semantic coordinate. The
  // existing feet-only transform refinement remains bounded by1board pixel.
  const supported = crownFringe?.accepted ? { ...standard, crown: rawAnatomy.crown } : standard;
  const refinement = slot.pixelRefinement ? refineStandingPixelsByBoardTransform(rawAnatomy, supported, sprite.data, sw, sh, slot) : null;
  const resolved = refinement?.resolved ?? standard;
  const anatomy = { ...rawAnatomy, crown: resolved.crown ?? rawAnatomy.crown,
    leftSole: resolved.leftSole ?? rawAnatomy.leftSole, rightSole: resolved.rightSole ?? rawAnatomy.rightSole };
  demand(slot.pose === "standing" && slot.mode === "open" && slot.id.trim(), "standing open contract required");
  demand(source.measurement.note.trim() && ["observed", "manual-pilot"].includes(source.measurement.kind), "measurement provenance required");
  demand(foreground.info.width === bw && foreground.info.height === bh, "foreground dimensions differ");
  const rectValid = (r: typeof slot.window) => [r.left, r.top, r.width, r.height].every(Number.isInteger)
    && r.left >= 0 && r.top >= 0 && r.width > 0 && r.height > 0 && r.left + r.width <= bw && r.top + r.height <= bh;
  demand(rectValid(slot.window) && (slot.forbiddenRects ?? []).every(rectValid), "invalid authored window");
  demand(source.protectedFacePolygon.length >= 3 && source.protectedFacePolygon.every(finite), "face polygon required");
  const alpha = (p: Point) => p.x >= 0 && p.y >= 0 && p.x < sw && p.y < sh
    ? sprite.data[(Math.floor(p.y) * sw + Math.floor(p.x)) * 4 + 3]! : 0;
  const sole = { x: (anatomy.leftSole.x + anatomy.rightSole.x) / 2,
    y: Math.max(anatomy.leftSole.y, anatomy.rightSole.y) };
  const observedHeight = sole.y - anatomy.crown.y;
  const face = Math.hypot(source.chin.x - source.eye.x, source.chin.y - source.eye.y);
  demand(face > 0 && source.chin.y > source.eye.y && observedHeight > face
    && Number.isFinite(slot.standingHeightPx) && slot.standingHeightPx > 0
    && Number.isFinite(slot.faceHeightPx) && slot.faceHeightPx > 0, "invalid height contract");
  // A full standing body is sized by the authored standing-height contract.
  // Face size is an upper bound/readability check, not a second conflicting
  // transform which can turn a long-legged source into a giant.
  const scale = slot.standingHeightPx / observedHeight;
  demand(scale > 0 && scale <= 1, "source resolution insufficient");
  const translateX = slot.supportPointPx.x - sole.x * scale;
  const translateY = slot.supportPointPx.y - sole.y * scale;
  const measurements = { sourceFacePixels: 0, sourceFaceMissingPixels: 0, protectedFaceMaskedPixels: 0,
    visiblePixels: 0, outsideBoardPixels: 0, outsideWindowPixels: 0, forbiddenPixels: 0,
    sourceStrongTop: sh, sourceStrongBottom: -1,
    standingHeightPx: observedHeight * scale, soleHeightDifferencePx: Math.abs(anatomy.leftSole.y - anatomy.rightSole.y) * scale,
    renderedFaceHeightPx: face * scale,
    supportDepthTolerancePx: Math.min(slot.faceHeightPx / 2, slot.standingHeightPx * .1),
    eyeAnchorErrorPx: Math.hypot(translateX + source.eye.x * scale - slot.eye.x, translateY + source.eye.y * scale - slot.eye.y) };
  // Contour quantization may move two valid observed shoe edges to opposite
  // sides of a tight depth-band boundary. Do not widen that authored band:
  // only a previously accepted refinement, a RAW depth already inside it,
  // and <=1 native-board-pixel movement of EACH actual sole can qualify.
  // Bounding the full-image transform alone is insufficient: the higher foot
  // can move several pixels while the lower foot still anchors the image.
  const footContactQuantization = measurements.soleHeightDifferencePx > measurements.supportDepthTolerancePx && refinement?.provenance.applied && refinement.provenance.rawTransform
    ? (() => {
      const rawTransform = refinement.provenance.rawTransform!;
      const mapped = (p: Point, t: { scale: number; translateX: number; translateY: number }) => ({ x: p.x * t.scale + t.translateX, y: p.y * t.scale + t.translateY });
      const rawSoles = { left: mapped(rawAnatomy.leftSole, rawTransform), right: mapped(rawAnatomy.rightSole, rawTransform) };
      const rasterSoles = { left: mapped(anatomy.leftSole, { scale, translateX, translateY }), right: mapped(anatomy.rightSole, { scale, translateX, translateY }) };
      const rawSoleHeightDifferencePx = Math.abs(rawSoles.left.y - rawSoles.right.y);
      const maxSoleLandmarkDisplacementPx = Math.max(...(["left", "right"] as const).map(side => Math.hypot(rawSoles[side].x - rasterSoles[side].x, rawSoles[side].y - rasterSoles[side].y)));
      const rawDepthWithinAuthoredBand = rawSoleHeightDifferencePx <= measurements.supportDepthTolerancePx;
      const applied = rawDepthWithinAuthoredBand && maxSoleLandmarkDisplacementPx <= 1
        && refinement.provenance.maxRawCornerDisplacementPx !== null && refinement.provenance.maxRawCornerDisplacementPx <= 1;
      return { version: "raw-valid-depth-bounded-sole-quantization/v1" as const, applied, rawSoleHeightDifferencePx,
        rasterSoleHeightDifferencePx: measurements.soleHeightDifferencePx, authoredTolerancePx: measurements.supportDepthTolerancePx,
        rawDepthWithinAuthoredBand, rawSoles, rasterSoles, maxSoleLandmarkDisplacementPx, maxAllowedDisplacementPx: 1 as const,
        maxRawImageDisplacementPx: refinement.provenance.maxRawCornerDisplacementPx };
    })() : null;
  for (let i = 0; i < bw * bh; i++) {
    demand(board.data[i * 4 + 3] === 255, "board must be opaque");
    if (foreground.data[i * 4 + 3]) demand([0, 1, 2].every(c => foreground.data[i * 4 + c] === board.data[i * 4 + c]), "foreground is not original board RGB");
  }
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    if (alpha({ x, y }) >= 224) { measurements.sourceStrongTop = Math.min(measurements.sourceStrongTop, y); measurements.sourceStrongBottom = Math.max(measurements.sourceStrongBottom, y); }
    if (!pointInPolygon({ x: x + .5, y: y + .5 }, source.protectedFacePolygon)) continue;
    measurements.sourceFacePixels++;
    if (alpha({ x, y }) < 224) measurements.sourceFaceMissingPixels++;
    const bx = Math.floor(translateX + x * scale), by = Math.floor(translateY + y * scale);
    if (bx >= 0 && by >= 0 && bx < bw && by < bh && foreground.data[(by * bw + bx) * 4 + 3]) measurements.protectedFaceMaskedPixels++;
  }
  const resized = await sharp(source.png).resize(Math.max(1, Math.round(sw * scale)), Math.max(1, Math.round(sh * scale))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const patch = Buffer.alloc(bw * bh * 4), composite = Buffer.from(board.data);
  const left = Math.round(translateX), top = Math.round(translateY);
  for (let y = 0; y < resized.info.height; y++) for (let x = 0; x < resized.info.width; x++) {
    const si = (y * resized.info.width + x) * 4, a = resized.data[si + 3]!;
    if (!a) continue;
    const bx = left + x, by = top + y;
    if (bx < 0 || by < 0 || bx >= bw || by >= bh) { measurements.outsideBoardPixels++; continue; }
    const bi = (by * bw + bx) * 4, finalAlpha = Math.round(a * (1 - foreground.data[bi + 3]! / 255));
    if (!finalAlpha) continue;
    measurements.visiblePixels++;
    const inside = (r: typeof slot.window) => bx >= r.left && by >= r.top && bx < r.left + r.width && by < r.top + r.height;
    if (!inside(slot.window)) measurements.outsideWindowPixels++;
    if ((slot.forbiddenRects ?? []).some(inside) || (slot.forbiddenPolygons ?? []).some(r => pointInPolygon({ x: bx + .5, y: by + .5 }, r.polygon))) measurements.forbiddenPixels++;
    for (let c = 0; c < 3; c++) {
      patch[bi + c] = resized.data[si + c]!;
      composite[bi + c] = Math.round(resized.data[si + c]! * finalAlpha / 255 + board.data[bi + c]! * (1 - finalAlpha / 255));
    }
    patch[bi + 3] = finalAlpha;
  }
  const checks = {
    completeFigure: anatomy.complete && anatomy.originalFrameClear && Object.values(resolved).every(Boolean) && anatomy.crown.y < source.eye.y
      && anatomy.leftSole.y > source.chin.y && anatomy.rightSole.y > source.chin.y
      && Math.abs(anatomy.crown.y - measurements.sourceStrongTop) * scale <= 2
      && Math.abs(sole.y - measurements.sourceStrongBottom) * scale <= 2
      && (alpha(anatomy.crown) >= 224 || crownFringe?.accepted === true)
      && [source.eye, source.chin, anatomy.leftSole, anatomy.rightSole].every(p => alpha(p) >= 224),
    standingScaleAgrees: Math.abs((measurements.sourceStrongBottom - measurements.sourceStrongTop) * scale / slot.standingHeightPx - 1) <= .15,
    faceReadableAndNotOversized: measurements.renderedFaceHeightPx >= 8 && measurements.renderedFaceHeightPx <= slot.faceHeightPx * 1.15,
    // Feet can be staggered in depth on a painted ground plane: identical image
    // y is not required. Keep a bounded contact band; semantic contact is still pending.
    feetOnSupport: (measurements.soleHeightDifferencePx <= measurements.supportDepthTolerancePx || footContactQuantization?.applied === true) && slot.supportPointPx.x >= 0 && slot.supportPointPx.x < bw
      && slot.supportPointPx.y >= 0 && slot.supportPointPx.y < bh,
    sourceFaceOpaque: measurements.sourceFacePixels > 0 && measurements.sourceFaceMissingPixels === 0,
    protectedFaceVisible: measurements.protectedFaceMaskedPixels === 0,
    visibleFigure: measurements.visiblePixels > 0,
    withinBoard: measurements.outsideBoardPixels === 0,
    withinFrozenWindow: measurements.outsideWindowPixels === 0,
    forbiddenRegionsClear: measurements.forbiddenPixels === 0,
  };
  const image = (data: Buffer) => sharp(data, { raw: { width: bw, height: bh, channels: 4 } });
  const [patchPng, compositePng, contextPng] = await Promise.all([image(patch).png().toBuffer(), image(composite).png().toBuffer(), image(composite).extract(slot.window).png().toBuffer()]);
  return { version: "open-placement/v1" as const, ok: Object.values(checks).every(Boolean), checks,
    measurements: footContactQuantization ? { ...measurements, footContactQuantization } : measurements,
    transform: { scale, translateX, translateY }, slot, source: { sha256: source.sha256, eye: source.eye, chin: source.chin, standing: rawAnatomy,
      rasterStanding: refinement ? { version: slot.pixelRefinement!, ...anatomy, refinement: refinement.provenance,
        ...(slot.pixelRefinement === CROWN_FRINGE_REFINEMENT_V3 ? { crownFringe } : {}) }
        : { version: "bounded-three-source-pixel-contour/v1", ...anatomy } },
    measurement: source.measurement, boardSha256: input.board.sha256, foregroundSha256: input.foreground.sha256,
    patchPng, compositePng, contextPng, semanticStatus: "pending" as const, automaticRelease: false as const };
}
