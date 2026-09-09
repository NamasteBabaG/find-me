import sharp from "sharp";
import { pointInPolygon, sha256Bytes, type PixelRect } from "./fixed-sprite";

type Point = { x: number; y: number };
type BoundImage = { png: Buffer; sha256: string };
export interface SimplePeekInput {
  source: BoundImage & {
    /** Source pixel-edge coordinates, not normalized and never alpha-snapped. */
    eye: Point; chin: Point; protectedFacePolygon: Point[];
    /** Exclusive horizontal cut. The final two rows must be behind the foreground. */
    lowerCutY: number;
    measurement: { kind: "manual-pilot" | "observed"; note: string };
  };
  board: BoundImage;
  /** Board-sized original-board RGB with authored occluder alpha. */
  foreground: BoundImage;
  slot: {
    id: string; pose: "side-lean" | "crouch" | "seated" | "front-peek" | "wave-peek";
    eye: Point; faceHeightPx: number; window: PixelRect;
    forbiddenRects?: (PixelRect & { id: string })[];
    /** Exact authored board-pixel feature outlines; unioned with legacy rectangles. */
    forbiddenPolygons?: { id: string; polygon: Point[] }[];
  };
}

export type SimplePeekUncutInput = Omit<SimplePeekInput, "source"> & { source: Omit<SimplePeekInput["source"], "lowerCutY"> };

/** Find only an already-hidden clipping row. The slot, uniform scale, landmarks
 * and mask remain byte-for-byte fixed. Null means this source cannot be safely
 * clipped here, not permission to move it or pretend a contact was observed. */
export async function findSimplePeekCut(input: SimplePeekUncutInput, options: { minCutY: number }): Promise<number | null> {
  const { source, slot } = input;
  const distance = Math.hypot(source.chin.x - source.eye.x, source.chin.y - source.eye.y);
  if (!Number.isFinite(distance) || distance <= 0 || source.chin.y <= source.eye.y
    || !Number.isInteger(options.minCutY) || options.minCutY < source.chin.y + distance
    || source.protectedFacePolygon.some(p => p.y >= options.minCutY)) throw new Error("SIMPLE_PEEK: clipping search must start at least one face distance below the chin and below the face polygon");
  const decode = async (image: BoundImage) => {
    if (sha256Bytes(image.png) !== image.sha256) throw new Error("SIMPLE_PEEK: bound image bytes changed");
    return sharp(image.png, { limitInputPixels: 25_000_000 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  };
  const [sprite, board, foreground] = await Promise.all([decode(source), decode(input.board), decode(input.foreground)]);
  const sw = sprite.info.width, sh = sprite.info.height, bw = board.info.width, bh = board.info.height;
  const scale = slot.faceHeightPx / distance, tx = slot.eye.x - source.eye.x * scale, ty = slot.eye.y - source.eye.y * scale;
  if (!Number.isFinite(scale) || scale <= 0 || scale > 1 || !Number.isFinite(tx) || !Number.isFinite(ty)
    || foreground.info.width !== bw || foreground.info.height !== bh) throw new Error("SIMPLE_PEEK: invalid fixed transform or foreground dimensions");
  for (let i = 0; i < bw * bh; i++) {
    if (board.data[i * 4 + 3] !== 255) throw new Error("SIMPLE_PEEK: board must be opaque");
    if (foreground.data[i * 4 + 3] && [0, 1, 2].some(c => foreground.data[i * 4 + c] !== board.data[i * 4 + c])) throw new Error("SIMPLE_PEEK: foreground contains pixels not from the bound original board");
  }
  let previousHidden = false;
  for (let y = Math.max(0, options.minCutY - 2); y < sh; y++) {
    let hidden = true, strongPixels = 0;
    for (let x = 0; x < sw; x++) {
      const alpha = sprite.data[(y * sw + x) * 4 + 3]!;
      if (!alpha) continue;
      if (alpha >= 32) strongPixels++;
      for (let by = Math.floor(ty + (y - 0.5) * scale); by < Math.ceil(ty + (y + 1.5) * scale); by++)
        for (let bx = Math.floor(tx + (x - 0.5) * scale); bx < Math.ceil(tx + (x + 1.5) * scale); bx++)
          if (bx < 0 || by < 0 || bx >= bw || by >= bh || foreground.data[(by * bw + bx) * 4 + 3] !== 255) hidden = false;
    }
    if (y + 1 >= options.minCutY && previousHidden && hidden && strongPixels > 0) return y + 1;
    previousHidden = hidden;
  }
  return null;
}

/** Separate upper-body pilot. Does not relax or produce fixed-sprite/v3 standing
 * evidence, infer feet/seat contact, search coordinates, or declare semantic QA. */
export async function composeSimplePeek(input: SimplePeekInput) {
  const { source, slot } = input;
  const finitePoint = (point: Point) => point && Number.isFinite(point.x) && Number.isFinite(point.y);
  const demand = (ok: unknown, message: string) => { if (!ok) throw new Error(`SIMPLE_PEEK: ${message}`); };
  demand([source.eye, source.chin, slot.eye].every(finitePoint), "finite eye/chin/anchor points required");
  demand(["side-lean", "crouch", "seated", "front-peek", "wave-peek"].includes(slot.pose) && slot.id?.trim(), "explicit supported pose and slot ID required");
  demand(["manual-pilot", "observed"].includes(source.measurement?.kind) && source.measurement.note?.trim(), "measurement provenance required");
  demand(source.protectedFacePolygon.length >= 3 && source.protectedFacePolygon.every(finitePoint), "protected face polygon required");
  const decode = async (image: BoundImage) => {
    demand(Buffer.isBuffer(image.png) && sha256Bytes(image.png) === image.sha256, "bound image bytes changed");
    return sharp(image.png, { limitInputPixels: 25_000_000 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  };
  const [sprite, board, foreground] = await Promise.all([decode(source), decode(input.board), decode(input.foreground)]);
  const sw = sprite.info.width, sh = sprite.info.height, bw = board.info.width, bh = board.info.height;
  demand(foreground.info.width === bw && foreground.info.height === bh, "foreground dimensions differ from board");
  demand(Number.isInteger(source.lowerCutY) && source.lowerCutY >= 2 && source.lowerCutY <= sh, "lowerCutY must be an explicit source row");
  const insideSource = (p: Point) => p.x >= 0 && p.y >= 0 && p.x < sw && p.y < source.lowerCutY;
  demand([source.eye, source.chin, ...source.protectedFacePolygon].every(insideSource), "face landmarks/polygon must be above the lower cut and inside the source");
  let area = 0;
  source.protectedFacePolygon.forEach((p, i) => { const q = source.protectedFacePolygon[(i + 1) % source.protectedFacePolygon.length]!; area += p.x * q.y - q.x * p.y; });
  demand(Math.abs(area) > 0.001, "protected face polygon has zero area");
  const validRect = (rect: PixelRect) => [rect.left, rect.top, rect.width, rect.height].every(Number.isInteger)
    && rect.left >= 0 && rect.top >= 0 && rect.width > 0 && rect.height > 0 && rect.left + rect.width <= bw && rect.top + rect.height <= bh;
  demand(validRect(slot.window) && (slot.forbiddenRects ?? []).every(validRect), "window/forbidden rectangles must be inside the board");
  for (const region of slot.forbiddenPolygons ?? []) {
    const polygon = region.polygon;
    demand(region.id?.trim() && Array.isArray(polygon) && polygon.length >= 3
      && polygon.every(p => finitePoint(p) && p.x >= 0 && p.y >= 0 && p.x <= bw && p.y <= bh), "forbidden polygons need an ID and at least three finite board-pixel points");
    let twiceArea = 0;
    polygon.forEach((p, i) => { const q = polygon[(i + 1) % polygon.length]!; twiceArea += p.x * q.y - q.x * p.y; });
    demand(Math.abs(twiceArea) > 0.001, "forbidden polygon has zero area");
  }
  demand(slot.eye.x >= 0 && slot.eye.y >= 0 && slot.eye.x < bw && slot.eye.y < bh, "fixed eye anchor outside board");
  const sourceFaceHeight = Math.hypot(source.chin.x - source.eye.x, source.chin.y - source.eye.y);
  demand(source.chin.y > source.eye.y && sourceFaceHeight > 0 && Number.isFinite(slot.faceHeightPx) && slot.faceHeightPx > 0, "positive visible face scale required");
  const scale = slot.faceHeightPx / sourceFaceHeight;
  demand(scale <= 1, "use a sufficiently resolved source; no pilot upscale");
  const translateX = slot.eye.x - source.eye.x * scale, translateY = slot.eye.y - source.eye.y * scale;
  const maskAlpha = (x: number, y: number) => x >= 0 && y >= 0 && x < bw && y < bh ? foreground.data[(y * bw + x) * 4 + 3]! : 0;
  const sourceAlpha = (x: number, y: number) => sprite.data[(y * sw + x) * 4 + 3]!;
  const measurements = {
    sourceFacePixels: 0, sourceFaceMissingPixels: 0, protectedFaceMaskedPixels: 0,
    unexpectedFrameContactPixels: 0, lowerCutStrongPixels: 0, lowerCutUnmaskedNativePixels: 0,
    lowerCutVisibleRasterPixels: 0, visiblePixels: 0, occludedPixels: 0,
    outsideBoardPixels: 0, outsideWindowPixels: 0, forbiddenPixels: 0,
  };
  for (let i = 0; i < bw * bh; i++) {
    demand(board.data[i * 4 + 3] === 255, "board must be opaque");
    if (foreground.data[i * 4 + 3]) demand([0, 1, 2].every(c => foreground.data[i * 4 + c] === board.data[i * 4 + c]), "foreground contains pixels not from the bound original board");
  }
  // Native checks include the entire transformed sample footprint and bilinear
  // fringe. A narrow leak cannot disappear merely through downsampling.
  const fullyMaskedSample = (x: number, y: number) => {
    for (let by = Math.floor(translateY + (y - 0.5) * scale); by < Math.ceil(translateY + (y + 1.5) * scale); by++)
      for (let bx = Math.floor(translateX + (x - 0.5) * scale); bx < Math.ceil(translateX + (x + 1.5) * scale); bx++)
        if (maskAlpha(bx, by) !== 255) return false;
    return true;
  };
  for (let y = 0; y < source.lowerCutY; y++) for (let x = 0; x < sw; x++) {
    const alpha = sourceAlpha(x, y);
    if (alpha && (x === 0 || x === sw - 1 || y === 0)) measurements.unexpectedFrameContactPixels++;
    if (y === source.lowerCutY - 1 && alpha >= 32) measurements.lowerCutStrongPixels++;
    if (alpha && y >= source.lowerCutY - 2 && !fullyMaskedSample(x, y)) measurements.lowerCutUnmaskedNativePixels++;
    if (!pointInPolygon({ x: x + 0.5, y: y + 0.5 }, source.protectedFacePolygon)) continue;
    measurements.sourceFacePixels++;
    if (alpha < 224) measurements.sourceFaceMissingPixels++;
    const bx = Math.floor(translateX + (x + 0.5) * scale), by = Math.floor(translateY + (y + 0.5) * scale);
    if (maskAlpha(bx, by)) measurements.protectedFaceMaskedPixels++;
  }
  for (const point of [source.eye, source.chin]) demand(sourceAlpha(Math.floor(point.x), Math.floor(point.y)) >= 224, "observed eye/chin does not touch opaque source pixels");
  const patch = Buffer.alloc(bw * bh * 4), composite = Buffer.from(board.data);
  const left = Math.floor(translateX - scale), right = Math.ceil(translateX + (sw + 1) * scale);
  const top = Math.floor(translateY - scale), bottom = Math.ceil(translateY + (source.lowerCutY + 1) * scale);
  demand((right - left) * (bottom - top) <= 25_000_000, "transformed layer too large");
  for (let by = top; by < bottom; by++) for (let bx = left; bx < right; bx++) {
    const sx = (bx + 0.5 - translateX) / scale - 0.5, sy = (by + 0.5 - translateY) / scale - 0.5;
    const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
    let a = 0, red = 0, green = 0, blue = 0, cutContribution = 0;
    for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
      const x = x0 + dx, y = y0 + dy;
      if (x < 0 || y < 0 || x >= sw || y >= source.lowerCutY) continue;
      const index = (y * sw + x) * 4, weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
      const weightedAlpha = sprite.data[index + 3]! * weight;
      a += weightedAlpha; red += sprite.data[index]! * weightedAlpha; green += sprite.data[index + 1]! * weightedAlpha; blue += sprite.data[index + 2]! * weightedAlpha;
      if (y >= source.lowerCutY - 2) cutContribution += weightedAlpha;
    }
    if (a <= 0) continue;
    const mask = maskAlpha(bx, by), finalAlpha = Math.round(a * (1 - mask / 255));
    if (cutContribution > 0 && mask !== 255) measurements.lowerCutVisibleRasterPixels++;
    if (mask > 0) measurements.occludedPixels++;
    if (!finalAlpha) continue;
    if (bx < 0 || by < 0 || bx >= bw || by >= bh) { measurements.outsideBoardPixels++; continue; }
    measurements.visiblePixels++;
    const inRect = (rect: PixelRect) => bx >= rect.left && by >= rect.top && bx < rect.left + rect.width && by < rect.top + rect.height;
    if (!inRect(slot.window)) measurements.outsideWindowPixels++;
    if ((slot.forbiddenRects ?? []).some(inRect)
      || (slot.forbiddenPolygons ?? []).some(region => pointInPolygon({ x: bx + 0.5, y: by + 0.5 }, region.polygon))) measurements.forbiddenPixels++;
    const index = (by * bw + bx) * 4;
    patch[index] = Math.round(red / a); patch[index + 1] = Math.round(green / a); patch[index + 2] = Math.round(blue / a); patch[index + 3] = finalAlpha;
    for (let c = 0; c < 3; c++) composite[index + c] = Math.round(patch[index + c]! * finalAlpha / 255 + board.data[index + c]! * (1 - finalAlpha / 255));
  }
  const checks = {
    sourceFaceOpaque: measurements.sourceFacePixels > 0 && measurements.sourceFaceMissingPixels === 0,
    protectedFaceVisible: measurements.protectedFaceMaskedPixels === 0,
    onlyLowerEdgeTruncated: measurements.unexpectedFrameContactPixels === 0,
    lowerCutHasSourceSupport: measurements.lowerCutStrongPixels > 0,
    lowerCutFullyOccluded: measurements.lowerCutUnmaskedNativePixels === 0 && measurements.lowerCutVisibleRasterPixels === 0,
    actualForegroundOcclusion: measurements.occludedPixels > 0,
    visibleFigure: measurements.visiblePixels > 0,
    withinBoard: measurements.outsideBoardPixels === 0,
    withinFrozenWindow: measurements.outsideWindowPixels === 0,
    forbiddenRegionsClear: measurements.forbiddenPixels === 0,
  };
  const image = (data: Buffer) => sharp(data, { raw: { width: bw, height: bh, channels: 4 } });
  const [patchPng, compositePng, contextPng] = await Promise.all([
    image(patch).png().toBuffer(), image(composite).png().toBuffer(), image(composite).extract(slot.window).png().toBuffer(),
  ]);
  return {
    version: "simple-peek-pilot/v1" as const, ok: Object.values(checks).every(Boolean), checks, measurements,
    transform: { scale, translateX, translateY }, slot, measurement: source.measurement,
    source: { sha256: source.sha256, eye: source.eye, chin: source.chin, protectedFacePolygon: source.protectedFacePolygon, lowerCutY: source.lowerCutY },
    boardSha256: input.board.sha256, foregroundSha256: input.foreground.sha256,
    patchPng, compositePng, contextPng,
    semanticStatus: "pending" as const, automaticRelease: false as const,
  };
}
