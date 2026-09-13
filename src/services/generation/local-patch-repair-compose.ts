import sharp from "sharp";
import { createHash } from "node:crypto";
import { LOCAL_PATCH_BOARD, LOCAL_PATCH_CROP } from "../../domain/scene/local-patch-hides";
import { analysePatchSeam, type PatchRegion, type SeamReport } from "./local-patch-seam";
import type { PatchGeometry } from "./patch";

export const LOCAL_PATCH_REPAIR_COMPOSITION_VERSION = "paid-mask-join/v1";
const GUARD = 12, FEATHER_RADIUS = 3, PIXELS = LOCAL_PATCH_CROP.width * LOCAL_PATCH_CROP.height;
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const fail = (reason: string): never => { throw new Error(`LOCAL_PATCH_REPAIR_COMPOSE: ${reason}`); };
const inside = (x: number, y: number, r: PatchRegion) => x >= r.left && x < r.left + r.width && y >= r.top && y < r.top + r.height;
const grow = (r: PatchRegion, amount: number): PatchRegion => ({ left: r.left - amount, top: r.top - amount, width: r.width + amount * 2, height: r.height + amount * 2 });
function validRect(r: PatchRegion, bounds: PatchRegion, name: string) {
  if (![r.left, r.top, r.width, r.height].every(Number.isSafeInteger) || r.width <= 0 || r.height <= 0
    || !inside(r.left, r.top, bounds) || !inside(r.left + r.width - 1, r.top + r.height - 1, bounds)) fail(`${name} must be an integer rectangle inside its bounds`);
}

export type PaidPatchJoinInput = {
  /** Full original authored board; caller binds its hash to the paid operation. */
  readonly beforePng: Buffer;
  readonly rawPng: Buffer;
  /** Exact grayscale (PNG colour type0), 8bit, one-channel blend weights. */
  readonly alphaPng: Buffer;
  readonly crop: PatchRegion;
  /** Crop-local, previously declared uniform120 return window; caller authenticates it. */
  readonly returnWindow: PatchRegion;
  readonly protectedCore: PatchRegion;
  readonly faceRect: PatchRegion;
};
export type PaidPatchJoinResult = {
  readonly version: typeof LOCAL_PATCH_REPAIR_COMPOSITION_VERSION;
  readonly candidatePng: Buffer;
  readonly candidateSha256: string;
  readonly geometry: PatchGeometry;
  readonly audit: {
    readonly state: "UNREVIEWED";
    readonly sourceSha256: string; readonly rawSha256: string; readonly resizedRawSha256: string; readonly alphaSha256: string;
    readonly crop: PatchRegion; readonly returnWindow: PatchRegion; readonly protectedCore: PatchRegion; readonly protectedWithGuard: PatchRegion; readonly faceRect: PatchRegion;
    readonly originalRawSeamReport: SeamReport;
    readonly protectedGuardPx: 12; readonly maximumFeatherWidthPx: 6;
    readonly blendedPixels: number; readonly paidPixels: number; readonly originalPixels: number;
    readonly outsideChangedPixels: 0; readonly protectedChangedPixels: 0;
  };
};

/** Require one connected paid region and no enclosed original-image islands. */
function connected(mask: Uint8Array, label: number, start: number) {
  const seen = new Uint8Array(PIXELS), queue = new Int32Array(PIXELS); let head = 0, tail = 1; queue[0] = start; seen[start] = 1;
  while (head < tail) {
    const p = queue[head++]!, x = p % 512, y = Math.floor(p / 512);
    for (const n of [x > 0 ? p - 1 : -1, x < 511 ? p + 1 : -1, y > 0 ? p - 512 : -1, y < 767 ? p + 512 : -1]) {
      if (n >= 0 && !seen[n] && mask[n] === label) { seen[n] = 1; queue[tail++] = n; }
    }
  }
  for (let p = 0; p < PIXELS; p++) if (mask[p] === label && !seen[p]) fail(label ? "alpha contains disconnected paid islands" : "alpha encloses original-image holes");
}

/** Deterministic re-composition only. It makes NO visual/identity approval and
 * preserves the raw rectangular refusal as separate evidence. No purchases,
 * segmentation or geometry inferred from changed background happen here. */
export async function recomputePaidPatchJoin(input: PaidPatchJoinInput): Promise<PaidPatchJoinResult> {
  const { crop, returnWindow, protectedCore, faceRect } = input;
  const bounds = { left: 0, top: 0, ...LOCAL_PATCH_CROP };
  validRect(crop, { left: 0, top: 0, ...LOCAL_PATCH_BOARD }, "crop");
  if (crop.width !== 512 || crop.height !== 768) fail("crop must be512x768");
  validRect(returnWindow, bounds, "returnWindow"); validRect(protectedCore, returnWindow, "protectedCore");
  const protectedWithGuard = grow(protectedCore, GUARD);
  validRect(protectedWithGuard, returnWindow, "protectedCore plus12px guard"); validRect(faceRect, protectedCore, "faceRect");
  if (faceRect.width < 30 || faceRect.height < 30) fail("faceRect must be at least30x30 native pixels");
  for (const [name, bytes] of [["board", input.beforePng], ["raw", input.rawPng], ["alpha", input.alphaPng]] as const) {
    if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > 32 * 1024 * 1024) fail(`${name} payload is empty or too large`);
  }
  const options = { limitInputPixels: 8_294_400, failOn: "error" as const };
  const [boardMeta, rawMeta, alphaMeta] = await Promise.all([
    sharp(input.beforePng, options).metadata(), sharp(input.rawPng, options).metadata(), sharp(input.alphaPng, options).metadata(),
  ]);
  if (!["png", "webp"].includes(boardMeta.format ?? "") || boardMeta.width !== LOCAL_PATCH_BOARD.width || boardMeta.height !== LOCAL_PATCH_BOARD.height
    || (boardMeta.pages ?? 1) !== 1 || boardMeta.depth !== "uchar" || (boardMeta.orientation ?? 1) !== 1) fail("board must be a single unrotated8bit authored3072x2048 image");
  if (rawMeta.format !== "png" || (rawMeta.pages ?? 1) !== 1 || rawMeta.depth !== "uchar" || (rawMeta.orientation ?? 1) !== 1
    || !((rawMeta.width === 768 && rawMeta.height === 1152) || (rawMeta.width === 512 && rawMeta.height === 768))) fail("raw must be a single unrotated8bit768x1152 or512x768 PNG");
  if (alphaMeta.format !== "png" || alphaMeta.width !== 512 || alphaMeta.height !== 768 || (alphaMeta.pages ?? 1) !== 1
    || alphaMeta.channels !== 1 || alphaMeta.depth !== "uchar" || alphaMeta.hasAlpha || alphaMeta.isPalette || input.alphaPng[24] !== 8 || input.alphaPng[25] !== 0) fail("alpha must be a512x768 single-channel8bit grayscale PNG");
  const raw = await sharp(input.rawPng, options).resize(512, 768, { fit: "fill" }).png().toBuffer();
  const [original, paid, alpha] = await Promise.all([
    sharp(input.beforePng, options).extract(crop).ensureAlpha().raw().toBuffer(),
    sharp(raw, options).ensureAlpha().raw().toBuffer(),
    sharp(input.alphaPng, options).toColourspace("b-w").raw().toBuffer(),
  ]);
  if (alpha.length !== PIXELS || original.length !== PIXELS * 4 || paid.length !== PIXELS * 4) fail("decoded channel count changed");
  const hard = new Uint8Array(PIXELS), positive = new Uint8Array(PIXELS);
  for (let p = 0; p < PIXELS; p++) {
    const x = p % 512, y = Math.floor(p / 512), value = alpha[p]!;
    if (original[p * 4 + 3] !== 255 || paid[p * 4 + 3] !== 255) fail("board and paid crop must be opaque");
    if (!inside(x, y, returnWindow) && value !== 0) fail("alpha changes pixels outside returnWindow");
    if (inside(x, y, protectedWithGuard) && value !== 255) fail("alpha changes protected child or12px guard");
    if ((x === 0 || y === 0 || x === 511 || y === 767) && value !== 0) fail("alpha must close inside the crop");
    hard[p] = value >= 128 ? 1 : 0; positive[p] = value > 0 ? 1 : 0;
  }
  const seed = protectedCore.top * 512 + protectedCore.left;
  connected(hard, 1, seed); connected(hard, 0, 0); connected(positive, 1, seed);
  let blendedPixels = 0, paidPixels = 0, originalPixels = 0;
  const out = Buffer.from(original);
  for (let p = 0; p < PIXELS; p++) {
    const x = p % 512, y = Math.floor(p / 512), value = alpha[p]!;
    if (value > 0 && value < 255) {
      let nearBoundary = false;
      for (let dy = -FEATHER_RADIUS; dy <= FEATHER_RADIUS && !nearBoundary; dy++) for (let dx = -FEATHER_RADIUS; dx <= FEATHER_RADIUS; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < 512 && yy < 768 && dx * dx + dy * dy <= FEATHER_RADIUS ** 2 && hard[yy * 512 + xx] !== hard[p]) { nearBoundary = true; break; }
      }
      if (!nearBoundary) fail("fractional alpha lies beyond the6px feather band");
      blendedPixels++;
    } else if (value === 255) paidPixels++; else originalPixels++;
    // A zero-width hard paste is not a feathered background join.
    for (const n of [x < 511 ? p + 1 : -1, y < 767 ? p + 512 : -1]) if (n >= 0 && Math.abs(value - alpha[n]!) === 255) fail("alpha contains an unfeathered hard boundary");
    const weight = value / 255;
    for (let channel = 0; channel < 3; channel++) out[p * 4 + channel] = Math.round(paid[p * 4 + channel]! * weight + original[p * 4 + channel]! * (1 - weight));
  }
  const candidatePng = await sharp(out, { raw: { width: 512, height: 768, channels: 4 } }).png().toBuffer();
  const region = { ...returnWindow, left: crop.left + returnWindow.left, top: crop.top + returnWindow.top };
  const tile = await sharp(raw).extract(returnWindow).png().toBuffer();
  const originalRawSeamReport = await analysePatchSeam(input.beforePng, region, tile, { allowedRect: { left: 0, top: 0, width: region.width, height: region.height } });
  const geometry: PatchGeometry = {
    rect: { x: crop.left / LOCAL_PATCH_BOARD.width, y: crop.top / LOCAL_PATCH_BOARD.height, w: crop.width / LOCAL_PATCH_BOARD.width, h: crop.height / LOCAL_PATCH_BOARD.height },
    hitRect: { x: (crop.left + protectedCore.left) / LOCAL_PATCH_BOARD.width, y: (crop.top + protectedCore.top) / LOCAL_PATCH_BOARD.height, w: protectedCore.width / LOCAL_PATCH_BOARD.width, h: protectedCore.height / LOCAL_PATCH_BOARD.height },
    anchor: { x: (crop.left + faceRect.left + faceRect.width / 2) / LOCAL_PATCH_BOARD.width, y: (crop.top + faceRect.top) / LOCAL_PATCH_BOARD.height },
  };
  return { version: LOCAL_PATCH_REPAIR_COMPOSITION_VERSION, candidatePng, candidateSha256: digest(candidatePng), geometry,
    audit: { state: "UNREVIEWED", sourceSha256: digest(input.beforePng), rawSha256: digest(input.rawPng), resizedRawSha256: digest(raw), alphaSha256: digest(input.alphaPng),
      crop: { ...crop }, returnWindow: { ...returnWindow }, protectedCore: { ...protectedCore }, protectedWithGuard, faceRect: { ...faceRect }, originalRawSeamReport,
      protectedGuardPx: GUARD, maximumFeatherWidthPx: 6, blendedPixels, paidPixels, originalPixels, outsideChangedPixels: 0, protectedChangedPixels: 0 } };
}
