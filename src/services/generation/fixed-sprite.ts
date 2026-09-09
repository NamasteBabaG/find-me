import { createHash } from "node:crypto";
import { z } from "zod";

/** This pilot never infers anatomy or searches for a different place on a board. */
const pointSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict();
const polygonSchema = z.array(pointSchema).min(3).refine((points) => {
  let twiceArea = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    twiceArea += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twiceArea) > 1e-10;
}, "Polygon must have positive area");
const landmarkNameSchema = z.enum(["headTop", "headBottom", "headCenter", "feet", "leftFoot", "rightFoot", "seatContact", "contact"]);
export type LandmarkName = z.infer<typeof landmarkNameSchema>;
export type NormalizedPoint = z.infer<typeof pointSchema>;
export type NormalizedPolygon = NormalizedPoint[];
const landmarksSchema = z.record(landmarkNameSchema, pointSchema).refine(
  (value) => Boolean(value.headTop && value.headBottom), "Explicit headTop and headBottom landmarks are required",
);
const boardSchema = z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/), width: z.number().int().positive(), height: z.number().int().positive() }).strict();
export type BoardIdentity = z.infer<typeof boardSchema>;

export const spriteSourceSchema = z.object({
  poseId: z.string().min(1),
  landmarks: landmarksSchema,
  /** An authored polygon INSIDE the face, excluding the silhouette's antialiased edge. */
  protectedFacePolygon: polygonSchema,
  /** Validation only: an authored landmark is never moved to a nearby alpha pixel. */
  landmarkTolerancePx: z.number().min(0).max(32).default(2),
}).strict();
export type SpriteSource = z.infer<typeof spriteSourceSchema>;

const visibleLandmarkNameSchema = z.enum(["eyeMidpoint", "chin", "leftFoot", "rightFoot", "soleMidpoint"]);
export type VisibleLandmarkName = z.infer<typeof visibleLandmarkNameSchema>;
type AnyLandmarkName = LandmarkName | VisibleLandmarkName;
const cellSchema = z.object({ id: z.string().min(1), left: z.number().int().nonnegative(), top: z.number().int().nonnegative(), width: z.number().int().positive(), height: z.number().int().positive() }).strict();
/** v3 does not rename an inferred skull measurement to make it look observable. */
export const visibleSpriteSourceSchema = z.object({
  measurementVersion: z.literal("visible-face/v1"),
  poseId: z.literal("standing"),
  landmarks: z.object({ eyeMidpoint: pointSchema, chin: pointSchema, leftFoot: pointSchema, rightFoot: pointSchema }).strict(),
  protectedFacePolygon: polygonSchema,
  landmarkTolerancePx: z.number().min(0).max(32).default(2),
  measurementFrame: z.object({
    rgbaSha256: z.string().regex(/^[a-f0-9]{64}$/), width: z.number().int().positive(), height: z.number().int().positive(),
    cell: cellSchema, coordinates: z.literal("cell-normalized-pixel-edges"),
  }).strict(),
}).strict().superRefine((source, ctx) => {
  const { eyeMidpoint, chin, leftFoot, rightFoot } = source.landmarks;
  if (eyeMidpoint.x === chin.x && eyeMidpoint.y === chin.y) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Visible eye midpoint and chin must be distinct" });
  if (leftFoot.x === rightFoot.x && leftFoot.y === rightFoot.y) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Two independently observed soles must be distinct" });
});
export type VisibleSpriteSource = z.infer<typeof visibleSpriteSourceSchema>;
type AnySpriteSource = SpriteSource | VisibleSpriteSource;
function isVisibleSource(source: AnySpriteSource): source is VisibleSpriteSource { return "measurementVersion" in source; }

export const fixedSlotContractSchema = z.object({
  version: z.literal("fixed-sprite/v2"),
  board: boardSchema,
  slotId: z.string().min(1),
  poseId: z.string().min(1),
  support: z.object({
    type: z.enum(["ground", "seat", "handhold", "surface"]),
    sourceLandmark: landmarkNameSchema,
    destination: pointSchema,
    tolerancePx: z.number().min(0).max(32),
  }).strict(),
  /** The immutable recipe names a measurement, never coordinates on a child's sheet. */
  scale: z.object({ kind: z.literal("landmark-distance"), from: landmarkNameSchema, to: landmarkNameSchema, destinationDistancePx: z.number().positive(), tolerancePx: z.number().min(0).max(32) }).strict(),
  /** Additional authored correspondences are checked, never used to distort the sprite. */
  anchorChecks: z.array(z.object({ sourceLandmark: landmarkNameSchema, destination: pointSchema, tolerancePx: z.number().min(0).max(32) }).strict()).default([]),
  allowedEnvelope: polygonSchema,
  forbiddenRegions: z.array(z.object({ id: z.string().min(1), polygon: polygonSchema }).strict()),
  /** The runner must verify this identity before compositing the board-sized foreground over the sprite. */
  foregroundMask: boardSchema.extend({ mode: z.literal("board-foreground-alpha") }).strict().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.support.type === "seat" && value.support.sourceLandmark !== "seatContact") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Seat support must use the explicit seatContact landmark, never feet" });
  }
  if (value.support.type === "ground" && !["feet", "leftFoot", "rightFoot"].includes(value.support.sourceLandmark)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ground support must use an explicit feet, leftFoot, or rightFoot landmark" });
  }
  if (value.support.type === "handhold" && value.support.sourceLandmark !== "contact") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Handhold support must use the explicit contact landmark" });
  }
  if (value.scale.from === value.scale.to) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Scale needs two distinct landmarks" });
  if (value.foregroundMask && (value.foregroundMask.width !== value.board.width || value.foregroundMask.height !== value.board.height)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Foreground dimensions must match the bound board" });
  }
});
export type FixedSlotContract = z.infer<typeof fixedSlotContractSchema>;

export const fixedSlotV3ContractSchema = z.object({
  version: z.literal("fixed-sprite/v3"), measurementVersion: z.literal("visible-face/v1"),
  board: boardSchema, slotId: z.string().min(1), poseId: z.literal("standing"),
  support: z.discriminatedUnion("type", [
    z.object({ type: z.literal("ground"), sourceLandmark: z.enum(["leftFoot", "rightFoot", "soleMidpoint"]), destination: pointSchema, tolerancePx: z.number().min(0).max(32) }).strict(),
    /** Peeking is authored at a visible eye point, never an invented hidden floor contact. */
    z.object({ type: z.literal("occluded-standing"), sourceLandmark: z.literal("eyeMidpoint"), destination: pointSchema, tolerancePx: z.number().min(0).max(32) }).strict(),
  ]),
  scale: z.object({ kind: z.literal("landmark-distance"), from: z.literal("eyeMidpoint"), to: z.literal("chin"), destinationDistancePx: z.number().positive(), tolerancePx: z.number().min(0).max(32) }).strict(),
  /** Optional art-direction band, jointly checked with facial scale; not a statistical confidence interval. */
  bodyScale: z.object({
    kind: z.literal("landmark-distance-interval"), from: z.literal("eyeMidpoint"), to: z.literal("soleMidpoint"),
    minDistancePx: z.number().finite().positive(), maxDistancePx: z.number().finite().positive(),
  }).strict().optional(),
  /** Optional sole-neighborhood occlusion, NOT inferred boot/calf segmentation. */
  requiredHiddenLandmarks: z.array(z.object({
    sourceLandmark: z.enum(["leftFoot", "rightFoot"]), radiusPx: z.number().finite().positive().max(16),
  }).strict()).length(2).refine((checks) => new Set(checks.map((check) => check.sourceLandmark)).size === 2, "Both distinct observed soles must be required").optional(),
  anchorChecks: z.array(z.object({ sourceLandmark: visibleLandmarkNameSchema, destination: pointSchema, tolerancePx: z.number().min(0).max(32) }).strict()).default([]),
  allowedEnvelope: polygonSchema,
  forbiddenRegions: z.array(z.object({
    id: z.string().min(1), polygon: polygonSchema,
    /** Omitted retains historical pre-mask checks and serialized contract shape. */
    scope: z.enum(["unoccluded", "final-visible"]).optional(),
  }).strict()),
  /** Unlike historical v2, v3 checks supplied decoded foreground RGBA before applying it. */
  foregroundMask: z.object({ rgbaSha256: z.string().regex(/^[a-f0-9]{64}$/), width: z.number().int().positive(), height: z.number().int().positive(), mode: z.literal("board-foreground-alpha") }).strict().optional(),
}).strict().superRefine((contract, ctx) => {
  if (contract.foregroundMask && (contract.foregroundMask.width !== contract.board.width || contract.foregroundMask.height !== contract.board.height)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Foreground dimensions must match the bound board" });
  if (contract.support.type === "occluded-standing" && !contract.foregroundMask) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["foregroundMask"], message: "Occluded standing requires an authored foreground mask; the eye anchor is not a ground-contact fallback" });
  if (contract.requiredHiddenLandmarks && (contract.support.type !== "occluded-standing" || !contract.foregroundMask)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["requiredHiddenLandmarks"], message: "Required hidden soles need occluded-standing support and an authored foreground mask" });
  if (contract.bodyScale && contract.bodyScale.minDistancePx > contract.bodyScale.maxDistancePx) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bodyScale"], message: "Standing body interval minimum must not exceed its maximum" });
});
export type FixedSlotContractV3 = z.infer<typeof fixedSlotV3ContractSchema>;

export interface QaFlag { code: string; severity: "error" | "info"; message: string }
export class FixedSpriteError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "FixedSpriteError"; }
}
export interface PixelRect { left: number; top: number; width: number; height: number }
export interface GridCell extends PixelRect { id: string }
export interface SpriteReview {
  /** sha256Rgba of the complete decoded sheet, not its encoded PNG bytes. */
  sourceSha256: string;
  cellId: string;
  figureCount: number;
  /** Explicitly confirms that required anatomy is present, including feet in a full seated pose. */
  completeFigure: boolean;
  extraProps: boolean;
  poseMatches: boolean;
  reviewer: string;
  note?: string;
}
export interface ExtractedSprite<Source extends AnySpriteSource = SpriteSource> {
  ok: boolean;
  flags: QaFlag[];
  rgba: Buffer;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  crop: PixelRect;
  cell: GridCell;
  source: Source;
  sourceSha256: string;
  /** Only v3: derived from two observed soles, never independently annotated or alpha-snapped. */
  derivedLandmarks?: { soleMidpoint: NormalizedPoint };
  extractionBinding?: { sourceMeasurementSha256: string; cleanedRgbaSha256: string; geometrySha256: string; qaSha256: string };
  review?: SpriteReview;
  measurements: {
    strongComponentCount: number;
    significantComponentCount: number;
    mainStrongPixels: number;
    retainedAlphaPixels: number;
    discardedAlphaPixels: number;
    rawFrameContactPixels: number;
    frameContactPixels: number;
    strongFrameContactPixels: number;
    frameBoundaryPixels: number;
    protectedFacePixels: number;
    protectedFaceMissingPixels: number;
    enclosedFaceHolePixels: number;
    exteriorFaceMissingPixels: number;
  };
}
type AnyExtractedSprite = ExtractedSprite<AnySpriteSource>;
function extractionGeometryHash(sprite: Pick<AnyExtractedSprite, "sourceWidth" | "sourceHeight" | "crop" | "cell">): string {
  return sha256Bytes(Buffer.from(JSON.stringify({ sourceWidth: sprite.sourceWidth, sourceHeight: sprite.sourceHeight, crop: sprite.crop, cell: sprite.cell })));
}
function extractionQaHash(sprite: Pick<AnyExtractedSprite, "ok" | "flags" | "review" | "measurements">): string {
  return sha256Bytes(Buffer.from(JSON.stringify({ ok: sprite.ok, flags: sprite.flags, review: sprite.review, measurements: sprite.measurements })));
}

export function sha256Bytes(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }
export function sha256Rgba(rgba: Uint8Array, width: number, height: number): string {
  assertRgba(rgba, width, height);
  return createHash("sha256").update(`fixed-sprite-rgba/v1:${width}x${height}:`).update(rgba).digest("hex");
}
function assertRgba(rgba: Uint8Array, width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || rgba.length !== width * height * 4) {
    throw new FixedSpriteError("invalid_rgba", "Expected positive integer dimensions and exactly width * height * 4 RGBA bytes");
  }
}
function flag(flags: QaFlag[], code: string, message: string, severity: QaFlag["severity"] = "error"): void { flags.push({ code, severity, message }); }

/** Includes the polygon boundary. Coordinates use pixel edges, with samples at pixel centres. */
export function pointInPolygon(point: NormalizedPoint, polygon: NormalizedPolygon): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j]!;
    const b = polygon[i]!;
    const cross = (point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x);
    if (Math.abs(cross) < 1e-10 && point.x >= Math.min(a.x, b.x) - 1e-10 && point.x <= Math.max(a.x, b.x) + 1e-10 && point.y >= Math.min(a.y, b.y) - 1e-10 && point.y <= Math.max(a.y, b.y) + 1e-10) return true;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function neighbours(index: number, width: number, height: number, visit: (next: number) => void, diagonal = true): void {
  const x = index % width;
  const y = Math.floor(index / width);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((!dx && !dy) || (!diagonal && dx && dy)) continue;
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && nx < width && ny >= 0 && ny < height) visit(ny * width + nx);
  }
}

/**
 * Extract only declared cells. Strong connected alpha identifies a main silhouette;
 * a three-pixel connected fringe preserves antialiasing. No hole is filled, and no
 * disconnected object is declared to be anatomy. Semantic review is indispensable
 * because two touching people or an attached prop can form one alpha component.
 */
interface ExtractionInput<Source> {
  rgba: Uint8Array;
  width: number;
  height: number;
  grid: { cells: GridCell[]; clearancePx?: number };
  cellId: string;
  source: Source;
  review?: SpriteReview;
}
export function extractSpriteCell(input: ExtractionInput<z.input<typeof visibleSpriteSourceSchema>>): ExtractedSprite<VisibleSpriteSource>;
export function extractSpriteCell(input: ExtractionInput<z.input<typeof spriteSourceSchema>>): ExtractedSprite;
export function extractSpriteCell(input: ExtractionInput<z.input<typeof spriteSourceSchema> | z.input<typeof visibleSpriteSourceSchema>>): AnyExtractedSprite {
  assertRgba(input.rgba, input.width, input.height);
  const source = input.source && "measurementVersion" in input.source ? visibleSpriteSourceSchema.parse(input.source) : spriteSourceSchema.parse(input.source);
  const flags: QaFlag[] = [];
  const clearance = input.grid.clearancePx ?? 2;
  if (!Number.isInteger(clearance) || clearance < 1) throw new FixedSpriteError("invalid_grid", "Grid clearance must be an explicit positive integer or the two-pixel default");
  const ids = new Set<string>();
  for (const cell of input.grid.cells) {
    if (!cell.id || ids.has(cell.id) || ![cell.left, cell.top, cell.width, cell.height].every(Number.isInteger) || cell.left < 0 || cell.top < 0 || cell.width <= 2 * clearance || cell.height <= 2 * clearance || cell.left + cell.width > input.width || cell.top + cell.height > input.height) {
      throw new FixedSpriteError("invalid_grid", "Cells require unique IDs, integer bounds inside the sheet, and space for their clearance");
    }
    ids.add(cell.id);
  }
  for (let i = 0; i < input.grid.cells.length; i++) for (let j = i + 1; j < input.grid.cells.length; j++) {
    const a = input.grid.cells[i]!;
    const b = input.grid.cells[j]!;
    if (a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height) throw new FixedSpriteError("overlapping_cells", "Explicit extraction cells must not overlap");
  }
  const cell = input.grid.cells.find((candidate) => candidate.id === input.cellId);
  if (!cell) throw new FixedSpriteError("missing_cell", `No explicit grid cell ${input.cellId}`);
  const sourceSha256 = sha256Rgba(input.rgba, input.width, input.height);
  if (isVisibleSource(source)) {
    const frame = source.measurementFrame;
    if (frame.rgbaSha256 !== sourceSha256 || frame.width !== input.width || frame.height !== input.height || frame.cell.id !== cell.id || frame.cell.left !== cell.left || frame.cell.top !== cell.top || frame.cell.width !== cell.width || frame.cell.height !== cell.height) {
      throw new FixedSpriteError("measurement_frame_mismatch", "Visible measurements must bind this exact decoded source sheet, dimensions, extraction cell and coordinate space");
    }
  }
  const width = cell.width;
  const height = cell.height;
  const pixelCount = width * height;
  const raw = Buffer.alloc(pixelCount * 4);
  for (let y = 0; y < height; y++) raw.set(input.rgba.subarray(((cell.top + y) * input.width + cell.left) * 4, ((cell.top + y) * input.width + cell.left + width) * 4), y * width * 4);
  const alpha = new Uint8Array(pixelCount);
  let rawFrameContactPixels = 0;
  for (let i = 0; i < pixelCount; i++) {
    alpha[i] = raw[i * 4 + 3]!;
    const x = i % width;
    const y = Math.floor(i / width);
    if (alpha[i]! > 0 && (x < clearance || x >= width - clearance || y < clearance || y >= height - clearance)) rawFrameContactPixels++;
  }
  const labels = new Int32Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  const components: { label: number; count: number }[] = [];
  for (let start = 0; start < pixelCount; start++) {
    if (alpha[start]! < 32 || labels[start]) continue;
    const label = components.length + 1;
    let head = 0;
    let tail = 1;
    queue[0] = start;
    labels[start] = label;
    while (head < tail) {
      const index = queue[head++]!;
      neighbours(index, width, height, (next) => {
        if (alpha[next]! >= 32 && !labels[next]) { labels[next] = label; queue[tail++] = next; }
      });
    }
    components.push({ label, count: tail });
  }
  components.sort((a, b) => b.count - a.count || a.label - b.label);
  const main = components[0];
  // A small detached hand must not disappear merely because the torso is large.
  const significant = components.filter((component) => component.count >= 8);
  if (!main) flag(flags, "missing_figure", "Cell has no connected strong alpha; a figure cannot be extracted");
  if (significant.length > 1) flag(flags, "ambiguous_components", `${significant.length} substantial disconnected components; alpha alone cannot decide whether they are extra figures, props, or detached anatomy`);
  const retained = new Uint8Array(pixelCount);
  const distance = new Uint8Array(pixelCount);
  let head = 0;
  let tail = 0;
  if (main) for (let i = 0; i < pixelCount; i++) if (labels[i] === main.label) { retained[i] = 1; queue[tail++] = i; }
  while (head < tail) {
    const index = queue[head++]!;
    if (distance[index]! >= 3) continue;
    neighbours(index, width, height, (next) => {
      if (!retained[next] && alpha[next]! > 0 && (!labels[next] || labels[next] === main?.label)) {
        retained[next] = 1; distance[next] = distance[index]! + 1; queue[tail++] = next;
      }
    });
  }
  let retainedAlphaPixels = 0;
  let discardedAlphaPixels = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let i = 0; i < pixelCount; i++) {
    if (retained[i]) {
      retainedAlphaPixels++;
      minX = Math.min(minX, i % width); maxX = Math.max(maxX, i % width);
      minY = Math.min(minY, Math.floor(i / width)); maxY = Math.max(maxY, Math.floor(i / width));
    } else {
      if (alpha[i]) discardedAlphaPixels++;
      raw[i * 4 + 3] = 0;
      alpha[i] = 0;
    }
  }
  if (discardedAlphaPixels) flag(flags, "detached_alpha_removed", `${discardedAlphaPixels} detached alpha pixels removed; no holes were filled`, "info");

  // Diagnose clipping on the retained figure. Detached faint dust is not a body
  // part. Strong anatomy inside the clearance remains a failure; even faint
  // connected fringe on the actual cell boundary remains a possible cut edge.
  let frameContactPixels = 0;
  let strongFrameContactPixels = 0;
  let frameBoundaryPixels = 0;
  for (let i = 0; i < pixelCount; i++) {
    if (!alpha[i]) continue;
    const x = i % width;
    const y = Math.floor(i / width);
    if (x < clearance || x >= width - clearance || y < clearance || y >= height - clearance) {
      frameContactPixels++;
      if (alpha[i]! >= 32) strongFrameContactPixels++;
    }
    if (x === 0 || x === width - 1 || y === 0 || y === height - 1) frameBoundaryPixels++;
  }
  if (strongFrameContactPixels || frameBoundaryPixels) {
    flag(flags, "cell_frame_contact", `${strongFrameContactPixels} retained strong pixels enter the cell clearance; ${frameBoundaryPixels} retained alpha pixels touch the actual boundary. Clipping or internal grid merging remains possible`);
  } else if (frameContactPixels) {
    flag(flags, "frame_clearance_fringe", `${frameContactPixels} retained alpha<32 fringe pixels enter the clearance, but no retained alpha touches the actual boundary`, "info");
  }
  if (rawFrameContactPixels > frameContactPixels) flag(flags, "detached_frame_dust_removed", `${rawFrameContactPixels - frameContactPixels} detached frame pixels were excluded from the cleaned-figure clipping check`, "info");

  // Flood background on the actual retained alpha. An arm gap outside the face
  // polygon is harmless, regardless of whether that gap is open or enclosed.
  const exterior = new Uint8Array(pixelCount);
  head = 0; tail = 0;
  const seed = (i: number) => { if (!exterior[i] && alpha[i]! < 224) { exterior[i] = 1; queue[tail++] = i; } };
  for (let x = 0; x < width; x++) { seed(x); seed((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { seed(y * width); seed(y * width + width - 1); }
  while (head < tail) neighbours(queue[head++]!, width, height, seed, false);
  let protectedFacePixels = 0;
  let protectedFaceMissingPixels = 0;
  let enclosedFaceHolePixels = 0;
  let exteriorFaceMissingPixels = 0;
  for (let i = 0; i < pixelCount; i++) {
    if (!pointInPolygon({ x: (i % width + 0.5) / width, y: (Math.floor(i / width) + 0.5) / height }, source.protectedFacePolygon)) continue;
    protectedFacePixels++;
    if (alpha[i]! < 224) {
      protectedFaceMissingPixels++;
      if (exterior[i]) exteriorFaceMissingPixels++; else enclosedFaceHolePixels++;
    }
  }
  if (!protectedFacePixels) flag(flags, "face_region_empty", "Protected face polygon covers no pixel centres");
  if (protectedFaceMissingPixels) flag(flags, "protected_face_hole", `${protectedFaceMissingPixels} protected face pixels are translucent or missing (${enclosedFaceHolePixels} enclosed; ${exteriorFaceMissingPixels} connected to exterior); reject without filling`);
  for (const [name, point] of Object.entries(source.landmarks)) {
    if (!point) continue;
    const px = point.x * width;
    const py = point.y * height;
    let covered = false;
    const tolerance = source.landmarkTolerancePx;
    // A visible sole on an integer pixel edge may touch the preceding pixel square,
    // even with zero tolerance. Historical v2 candidate enumeration stays unchanged.
    const previousSquare = isVisibleSource(source) ? 1 : 0;
    for (let y = Math.max(0, Math.floor(py - tolerance) - previousSquare); y <= Math.min(height - 1, Math.ceil(py + tolerance)); y++) {
      for (let x = Math.max(0, Math.floor(px - tolerance) - previousSquare); x <= Math.min(width - 1, Math.ceil(px + tolerance)); x++) {
        // Point-to-pixel-square distance permits explicit contact on the pixel edge.
        const dx = Math.max(x - px, 0, px - (x + 1));
        const dy = Math.max(y - py, 0, py - (y + 1));
        if (alpha[y * width + x]! >= 32 && Math.hypot(dx, dy) <= tolerance) covered = true;
      }
    }
    if (!covered) flag(flags, "landmark_not_on_alpha", `Declared ${name} is not supported by retained alpha within ${tolerance}px; the landmark was not moved`);
  }

  const review = input.review;
  if (!review || !review.reviewer.trim() || review.sourceSha256 !== sourceSha256 || review.cellId !== cell.id) {
    flag(flags, "semantic_review_required", "A reviewer must verify this exact sheet and cell contains one complete figure, no props, and the declared pose; connected alpha cannot establish this");
  } else {
    if (review.figureCount !== 1) flag(flags, "figure_count_mismatch", `Review reports ${review.figureCount} figures; exactly one is required`);
    if (review.completeFigure !== true) flag(flags, "incomplete_figure", "Review did not confirm all anatomy required for this pose; clipping or amputation must not be accepted");
    if (review.extraProps !== false) flag(flags, "extra_props", "Review found an extra prop or did not rule one out");
    if (review.poseMatches !== true) flag(flags, "pose_mismatch", "Review did not confirm the declared pose");
  }
  const crop: PixelRect = maxX < 0 ? { left: 0, top: 0, width: 1, height: 1 } : { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  const rgba = Buffer.alloc(crop.width * crop.height * 4);
  for (let y = 0; y < crop.height; y++) rgba.set(raw.subarray(((crop.top + y) * width + crop.left) * 4, ((crop.top + y) * width + crop.left + crop.width) * 4), y * crop.width * 4);
  const ok = !flags.some((item) => item.severity === "error");
  const measurements = { strongComponentCount: components.length, significantComponentCount: significant.length, mainStrongPixels: main?.count ?? 0, retainedAlphaPixels, discardedAlphaPixels, rawFrameContactPixels, frameContactPixels, strongFrameContactPixels, frameBoundaryPixels, protectedFacePixels, protectedFaceMissingPixels, enclosedFaceHolePixels, exteriorFaceMissingPixels };
  return {
    ok, flags, rgba, width: crop.width, height: crop.height,
    sourceWidth: width, sourceHeight: height, crop, cell: { ...cell }, source, sourceSha256, ...(review ? { review: { ...review } } : {}),
    ...(isVisibleSource(source) ? {
      derivedLandmarks: { soleMidpoint: { x: (source.landmarks.leftFoot.x + source.landmarks.rightFoot.x) / 2, y: (source.landmarks.leftFoot.y + source.landmarks.rightFoot.y) / 2 } },
      extractionBinding: { sourceMeasurementSha256: sha256Bytes(Buffer.from(JSON.stringify(source))), cleanedRgbaSha256: sha256Rgba(rgba, crop.width, crop.height), geometrySha256: extractionGeometryHash({ sourceWidth: width, sourceHeight: height, crop, cell }), qaSha256: extractionQaHash({ ok, flags, review, measurements }) },
    } : {}),
    measurements,
  };
}

export interface SpriteTransform { scale: number; translateX: number; translateY: number }
export interface RequiredHiddenLandmarkCheck {
  sourceLandmark: "leftFoot" | "rightFoot"; radiusPx: number; boardPoint: { x: number; y: number };
  landmarkToleranceBoardPx: number; radiusCoversLandmarkTolerance: boolean;
  landmarkFullyOpaque: boolean; boardDiscPixels: number; nonOpaqueForegroundPixels: number;
  strongSourcePixels: number; nativeAlphaPixels: number; notFullyMaskedNativePixels: number; visibleNativePixels: number;
  visibleBoardPixels: number; visiblePremaskedPreviewPixels: number; passed: boolean;
}
export interface FixedPlacement {
  ok: boolean;
  flags: QaFlag[];
  contract: FixedSlotContract | FixedSlotContractV3;
  /** Uniform source-cell-to-board transform. No bbox centres participate. */
  transform: SpriteTransform;
  landmarks: Partial<Record<AnyLandmarkName, { x: number; y: number }>>;
  /** Native cleaned pixels. Keep this asset for the zoomable game; never resize it to the preview. */
  sourceImage: {
    rgba: Buffer; width: number; height: number; sourceWidth: number; sourceHeight: number;
    crop: PixelRect; rgbaSha256: string;
    /** Cropped-image-to-board transform, equivalent to transform on original cell coordinates. */
    transform: SpriteTransform;
  };
  /** Board-resolution QA PREVIEW only. Encode unchanged and composite at (left, top). */
  composite: PixelRect & { rgba: Buffer };
  /** v3 only: retain pre-mask geometry even when a region explicitly opts into final-visible checking. */
  unoccludedComposite?: PixelRect & { rgba: Buffer };
  /** v3 player geometry. The native alpha-masked asset must NOT receive foreground alpha a second time. */
  visibility?: {
    sourceImage: FixedPlacement["sourceImage"];
    hitRect: { x: number; y: number; w: number; h: number } | null;
    /** A visible eye midpoint, not an invented head-top landmark. */
    headAnchor: NormalizedPoint;
    foregroundApplied: boolean;
    visibleSourcePixels: number; occludedSourcePixels: number; protectedFaceOccludedPixels: number;
  };
  measurements: {
    supportDistancePx: number; scaleDistancePx: number; scaleErrorPx: number;
    /** Present only when the v3 recipe explicitly declares bodyScale. */
    standingBodyDistancePx?: number; standingBodyErrorPx?: number;
    paintedPixels: number; outsideBoardPixels: number; outsideEnvelopePixels: number;
    nativeOutsideBoardPixels: number; nativeOutsideEnvelopePixels: number;
    forbiddenOverlaps: { id: string; pixels: number }[];
    nativeForbiddenOverlaps: { id: string; pixels: number }[];
    /** Only explicit final-visible regions: raw pre-mask measurements above are NEVER erased. */
    forbiddenScopeChecks?: { id: string; scope: "final-visible"; boardPixels: number; nativeSamples: number; premaskedPreviewPixels: number }[];
    /** Only when declared; checks both actual observed sole neighborhoods, not any-body occlusion. */
    requiredHiddenLandmarkChecks?: RequiredHiddenLandmarkCheck[];
  };
}

/** Exact uniform inverse mapping with premultiplied bilinear sampling, including transparent padding. */
function rasterize(sprite: AnyExtractedSprite, scale: number, translateX: number, translateY: number): FixedPlacement["composite"] {
  // Bilinear fringe may extend half a source pixel past the retained crop.
  const left = Math.floor(translateX + (sprite.crop.left - 0.5) * scale);
  const top = Math.floor(translateY + (sprite.crop.top - 0.5) * scale);
  const right = Math.ceil(translateX + (sprite.crop.left + sprite.width + 0.5) * scale);
  const bottom = Math.ceil(translateY + (sprite.crop.top + sprite.height + 0.5) * scale);
  const width = right - left;
  const height = bottom - top;
  if (!Number.isSafeInteger(width * height) || width <= 0 || height <= 0 || width * height > 25_000_000) throw new FixedSpriteError("render_too_large", "Contract produces an invalid or >25-million-pixel layer; no scale reduction was applied");
  const rgba = Buffer.alloc(width * height * 4);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = (left + x + 0.5 - translateX) / scale - sprite.crop.left - 0.5;
    const sy = (top + y + 0.5 - translateY) / scale - sprite.crop.top - 0.5;
    const x0 = Math.floor(sx);
    const y0 = Math.floor(sy);
    const fx = sx - x0;
    const fy = sy - y0;
    let alpha = 0;
    let red = 0;
    let green = 0;
    let blue = 0;
    for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
      const px = x0 + dx;
      const py = y0 + dy;
      if (px < 0 || px >= sprite.width || py < 0 || py >= sprite.height) continue;
      const index = (py * sprite.width + px) * 4;
      const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
      const weightedAlpha = sprite.rgba[index + 3]! * weight;
      alpha += weightedAlpha;
      red += sprite.rgba[index]! * weightedAlpha;
      green += sprite.rgba[index + 1]! * weightedAlpha;
      blue += sprite.rgba[index + 2]! * weightedAlpha;
    }
    const target = (y * width + x) * 4;
    if (alpha > 0) { rgba[target] = Math.round(red / alpha); rgba[target + 1] = Math.round(green / alpha); rgba[target + 2] = Math.round(blue / alpha); rgba[target + 3] = Math.round(alpha); }
    if (rgba[target + 3]) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  // Remove transparent sampling padding, which must not create a negative sharp
  // composite origin for a valid figure exactly on the board edge. This changes
  // the output storage rect, never its source-to-board transform.
  if (maxX < 0) return { left, top, width: 1, height: 1, rgba: Buffer.alloc(4) };
  const trimmedWidth = maxX - minX + 1;
  const trimmedHeight = maxY - minY + 1;
  const trimmed = Buffer.alloc(trimmedWidth * trimmedHeight * 4);
  for (let y = 0; y < trimmedHeight; y++) trimmed.set(rgba.subarray(((minY + y) * width + minX) * 4, ((minY + y) * width + maxX + 1) * 4), y * trimmedWidth * 4);
  return { left: left + minX, top: top + minY, width: trimmedWidth, height: trimmedHeight, rgba: trimmed };
}

export interface ForegroundRgba { rgba: Uint8Array; width: number; height: number }
interface PlacementInput { contract: unknown; board: BoardIdentity; sprite: AnyExtractedSprite; foreground?: ForegroundRgba }

/** Derive placement from observed source landmarks and a frozen destination recipe. */
export function computeFixedPlacement(input: PlacementInput): FixedPlacement {
  return placeAndEvaluate(input);
}

/** Negative controls and externally supplied placements are checked against the SAME recipe. */
export function evaluateFixedPlacement(input: PlacementInput & { transform: SpriteTransform }): FixedPlacement {
  if (!input.transform || !Number.isFinite(input.transform.scale) || input.transform.scale <= 0 || !Number.isFinite(input.transform.translateX) || !Number.isFinite(input.transform.translateY)) {
    throw new FixedSpriteError("invalid_transform", "An explicit finite positive uniform transform is required");
  }
  return placeAndEvaluate(input, input.transform);
}

function placeAndEvaluate(input: PlacementInput, suppliedTransform?: SpriteTransform): FixedPlacement {
  const parsed = z.union([fixedSlotContractSchema, fixedSlotV3ContractSchema]).safeParse(input.contract);
  if (!parsed.success) throw new FixedSpriteError("invalid_contract", `An explicit valid fixed-sprite/v2 or fixed-sprite/v3 contract is required: ${parsed.error.message}`);
  const contract = parsed.data;
  const board = boardSchema.parse(input.board);
  if (board.sha256 !== contract.board.sha256 || board.width !== contract.board.width || board.height !== contract.board.height) throw new FixedSpriteError("board_identity_mismatch", "Board hash or dimensions differ from the authored contract");
  const sprite = input.sprite;
  if (sprite.source.poseId !== contract.poseId) throw new FixedSpriteError("pose_identity_mismatch", "Sprite pose does not match this fixed slot");
  if ((contract.version === "fixed-sprite/v3") !== isVisibleSource(sprite.source)) throw new FixedSpriteError("measurement_version_mismatch", "v3 requires visible-face/v1 observations; historical v2 head measurements cannot be reinterpreted");
  const sourceLandmarks: Partial<Record<AnyLandmarkName, NormalizedPoint>> = { ...sprite.source.landmarks };
  if (isVisibleSource(sprite.source)) {
    if (!sprite.extractionBinding || sprite.extractionBinding.sourceMeasurementSha256 !== sha256Bytes(Buffer.from(JSON.stringify(sprite.source))) || sprite.extractionBinding.cleanedRgbaSha256 !== sha256Rgba(sprite.rgba, sprite.width, sprite.height) || sprite.extractionBinding.geometrySha256 !== extractionGeometryHash(sprite) || sprite.extractionBinding.qaSha256 !== extractionQaHash(sprite) || sprite.sourceSha256 !== sprite.source.measurementFrame.rgbaSha256) {
      throw new FixedSpriteError("extraction_binding_mismatch", "Visible source measurements, cleaned pixels, geometry or QA changed after their bound extraction");
    }
    const left = sprite.source.landmarks.leftFoot; const right = sprite.source.landmarks.rightFoot;
    sourceLandmarks.soleMidpoint = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
    if (sprite.derivedLandmarks?.soleMidpoint.x !== sourceLandmarks.soleMidpoint.x || sprite.derivedLandmarks?.soleMidpoint.y !== sourceLandmarks.soleMidpoint.y) throw new FixedSpriteError("derived_landmark_mismatch", "Sole midpoint must remain the deterministic midpoint of the two observed soles");
  }
  const names = Object.keys(sourceLandmarks) as AnyLandmarkName[];
  const sourcePx = (name: AnyLandmarkName) => {
    const point = sourceLandmarks[name];
    if (!point) throw new FixedSpriteError("missing_landmark", `Missing explicit ${name}`);
    return { x: point.x * sprite.sourceWidth, y: point.y * sprite.sourceHeight };
  };
  const from = sourcePx(contract.scale.from);
  const to = sourcePx(contract.scale.to);
  const sourceLength = Math.hypot(to.x - from.x, to.y - from.y);
  const derivedScale = contract.scale.destinationDistancePx / sourceLength;
  if (!Number.isFinite(derivedScale) || derivedScale <= 0) throw new FixedSpriteError("invalid_scale_reference", "Explicit scale reference has zero or invalid length");
  const anchor = sourcePx(contract.support.sourceLandmark);
  contract.anchorChecks.forEach((check) => sourcePx(check.sourceLandmark));
  const { scale, translateX, translateY } = suppliedTransform ?? {
    scale: derivedScale,
    translateX: contract.support.destination.x * board.width - anchor.x * derivedScale,
    translateY: contract.support.destination.y * board.height - anchor.y * derivedScale,
  };
  const landmarks: FixedPlacement["landmarks"] = {};
  for (const name of names) { const point = sourcePx(name); landmarks[name] = { x: translateX + point.x * scale, y: translateY + point.y * scale }; }
  const flags = [...sprite.flags];
  const actualSupport = landmarks[contract.support.sourceLandmark]!;
  const supportDistancePx = Math.hypot(actualSupport.x - contract.support.destination.x * board.width, actualSupport.y - contract.support.destination.y * board.height);
  const scaleDistancePx = sourceLength * scale;
  const scaleErrorPx = Math.abs(scaleDistancePx - contract.scale.destinationDistancePx);
  if (supportDistancePx > contract.support.tolerancePx + 1e-8) flag(flags, "support_check_failed", `${contract.support.sourceLandmark} misses the fixed support destination by ${supportDistancePx.toFixed(3)}px (limit ${contract.support.tolerancePx}px)`);
  if (scaleErrorPx > contract.scale.tolerancePx + 1e-8) flag(flags, "scale_check_failed", `${contract.scale.from} to ${contract.scale.to} measures ${scaleDistancePx.toFixed(3)}px instead of ${contract.scale.destinationDistancePx}px (tolerance ${contract.scale.tolerancePx}px)`);
  let bodyMeasurements: { standingBodyDistancePx: number; standingBodyErrorPx: number } | undefined;
  if (contract.version === "fixed-sprite/v3" && contract.bodyScale) {
    // Use the observed full-body frame, not cropped bounds or the visible
    // foreground-masked fraction. Translation cannot change this distance.
    const eye = sourcePx("eyeMidpoint");
    const sole = sourcePx("soleMidpoint");
    const standingBodyDistancePx = Math.hypot(eye.x - sole.x, eye.y - sole.y) * scale;
    const { minDistancePx, maxDistancePx } = contract.bodyScale;
    const standingBodyErrorPx = Math.max(minDistancePx - standingBodyDistancePx, standingBodyDistancePx - maxDistancePx, 0);
    bodyMeasurements = { standingBodyDistancePx, standingBodyErrorPx };
    if (standingBodyErrorPx > 1e-8) flag(flags, "body_scale_check_failed", `eyeMidpoint to derived soleMidpoint measures ${standingBodyDistancePx.toFixed(3)}px outside the authored [${minDistancePx}, ${maxDistancePx}]px standing-body interval`);
  }
  for (const check of contract.anchorChecks) {
    const actual = landmarks[check.sourceLandmark]!;
    const distance = Math.hypot(actual.x - check.destination.x * board.width, actual.y - check.destination.y * board.height);
    if (distance > check.tolerancePx + 1e-8) flag(flags, "anchor_check_failed", `${check.sourceLandmark} misses its authored destination by ${distance.toFixed(3)}px (limit ${check.tolerancePx}px)`);
  }
  const composite = rasterize(sprite, scale, translateX, translateY);
  let paintedPixels = 0;
  let outsideBoardPixels = 0;
  let outsideEnvelopePixels = 0;
  const forbiddenOverlaps = contract.forbiddenRegions.map((region) => ({ id: region.id, pixels: 0 }));
  let nativeOutsideBoardPixels = 0;
  let nativeOutsideEnvelopePixels = 0;
  const nativeForbiddenOverlaps = contract.forbiddenRegions.map((region) => ({ id: region.id, pixels: 0 }));
  // The zoomable asset retains source detail that a small preview may miss.
  // Check its projected alpha samples too, including faint hair/fringe pixels.
  for (let y = 0; y < sprite.height; y++) for (let x = 0; x < sprite.width; x++) {
    if (!sprite.rgba[(y * sprite.width + x) * 4 + 3]) continue;
    const bx = translateX + (sprite.crop.left + x + 0.5) * scale;
    const by = translateY + (sprite.crop.top + y + 0.5) * scale;
    if (bx < 0 || bx >= board.width || by < 0 || by >= board.height) nativeOutsideBoardPixels++;
    const point = { x: bx / board.width, y: by / board.height };
    if (!pointInPolygon(point, contract.allowedEnvelope)) nativeOutsideEnvelopePixels++;
    contract.forbiddenRegions.forEach((region, index) => { if (pointInPolygon(point, region.polygon)) nativeForbiddenOverlaps[index]!.pixels++; });
  }
  for (let y = 0; y < composite.height; y++) for (let x = 0; x < composite.width; x++) {
    if (!composite.rgba[(y * composite.width + x) * 4 + 3]) continue;
    paintedPixels++;
    const bx = composite.left + x;
    const by = composite.top + y;
    if (bx < 0 || bx >= board.width || by < 0 || by >= board.height) outsideBoardPixels++;
    const point = { x: (bx + 0.5) / board.width, y: (by + 0.5) / board.height };
    if (!pointInPolygon(point, contract.allowedEnvelope)) outsideEnvelopePixels++;
    contract.forbiddenRegions.forEach((region, index) => { if (pointInPolygon(point, region.polygon)) forbiddenOverlaps[index]!.pixels++; });
  }
  if (!paintedPixels) flag(flags, "empty_placement", "Uniform transform produces no visible alpha pixels");
  if (outsideBoardPixels || nativeOutsideBoardPixels) flag(flags, "outside_board", `${outsideBoardPixels} preview pixels and ${nativeOutsideBoardPixels} projected native alpha samples fall outside the board`);
  if (outsideEnvelopePixels || nativeOutsideEnvelopePixels) flag(flags, "outside_allowed_envelope", `${outsideEnvelopePixels} preview pixels and ${nativeOutsideEnvelopePixels} projected native alpha samples leave the authored safe envelope; no shrinking was applied`);
  forbiddenOverlaps.forEach((overlap, index) => {
    const region = contract.forbiddenRegions[index]!;
    if ("scope" in region && region.scope === "final-visible") return;
    const native = nativeForbiddenOverlaps[index]!;
    if (overlap.pixels || native.pixels) flag(flags, "forbidden_overlap", `${overlap.pixels} preview pixels and ${native.pixels} projected native alpha samples overlap forbidden region ${overlap.id}`);
  });
  const sourceImage: FixedPlacement["sourceImage"] = {
    rgba: sprite.rgba, width: sprite.width, height: sprite.height,
    sourceWidth: sprite.sourceWidth, sourceHeight: sprite.sourceHeight, crop: { ...sprite.crop },
    rgbaSha256: sha256Rgba(sprite.rgba, sprite.width, sprite.height),
    transform: { scale, translateX: translateX + sprite.crop.left * scale, translateY: translateY + sprite.crop.top * scale },
  };
  let visibility: FixedPlacement["visibility"];
  let visibleComposite = composite;
  let forbiddenScopeChecks: FixedPlacement["measurements"]["forbiddenScopeChecks"];
  let requiredHiddenLandmarkChecks: RequiredHiddenLandmarkCheck[] | undefined;
  if (contract.version === "fixed-sprite/v3") {
    visibility = visibleGeometry(contract, sprite, sourceImage, landmarks, flags, input.foreground);
    // Board preview applies the board mask exactly once AFTER resampling the unoccluded master.
    // Resampling a native pre-masked image would blur the foreground edge a second time.
    visibleComposite = input.foreground ? maskBoardComposite(composite, input.foreground) : composite;
    const scoped = contract.forbiddenRegions.filter((region) => region.scope === "final-visible");
    // Share this extra native-asset preview between the two opt-in visibility
    // gates. Historical recipes without either gate do not perform this work.
    const premasked = scoped.length || contract.requiredHiddenLandmarks ? rasterize({ ...sprite, rgba: visibility.sourceImage.rgba }, scale, translateX, translateY) : undefined;
    if (scoped.length) {
      // A second preview diagnoses fringe from the actual native-premasked asset.
      // It is not a claim of bit-identical browser filtering (see player adapter).
      forbiddenScopeChecks = scoped.map((region) => {
        let boardPixels = 0; let nativeSamples = 0; let premaskedPreviewPixels = 0;
        for (let y = 0; y < composite.height; y++) for (let x = 0; x < composite.width; x++) {
          if (!composite.rgba[(y * composite.width + x) * 4 + 3]) continue;
          const bx = composite.left + x; const by = composite.top + y;
          if (!pointInPolygon({ x: (bx + 0.5) / board.width, y: (by + 0.5) / board.height }, region.polygon)) continue;
          // A partly transparent mask never proves restoration, even if byte
          // rounding would make this particular faint source pixel disappear.
          if (!input.foreground || bx < 0 || by < 0 || bx >= board.width || by >= board.height || input.foreground.rgba[(by * board.width + bx) * 4 + 3] !== 255) boardPixels++;
        }
        for (let y = 0; y < sprite.height; y++) for (let x = 0; x < sprite.width; x++) {
          if (!sprite.rgba[(y * sprite.width + x) * 4 + 3]) continue;
          const bx = translateX + (sprite.crop.left + x + 0.5) * scale; const by = translateY + (sprite.crop.top + y + 0.5) * scale;
          if (pointInPolygon({ x: bx / board.width, y: by / board.height }, region.polygon) && (!input.foreground || !fullyOpaqueForegroundAt(input.foreground, bx, by))) nativeSamples++;
        }
        for (let y = 0; y < premasked!.height; y++) for (let x = 0; x < premasked!.width; x++) {
          if (premasked!.rgba[(y * premasked!.width + x) * 4 + 3] && pointInPolygon({ x: (premasked!.left + x + 0.5) / board.width, y: (premasked!.top + y + 0.5) / board.height }, region.polygon)) premaskedPreviewPixels++;
        }
        if (boardPixels || nativeSamples || premaskedPreviewPixels) flag(flags, "forbidden_overlap", `Final-visible forbidden region ${region.id} has ${boardPixels} non-fully-restored board pixels, ${nativeSamples} non-fully-masked native samples and ${premaskedPreviewPixels} native-premasked preview pixels; raw overlap measurements remain recorded`);
        return { id: region.id, scope: "final-visible" as const, boardPixels, nativeSamples, premaskedPreviewPixels };
      });
    }
    if (contract.requiredHiddenLandmarks) requiredHiddenLandmarkChecks = checkRequiredHiddenLandmarks(contract, sprite, visibility, landmarks, input.foreground!, visibleComposite, premasked!, flags);
  }
  return { ok: !flags.some((item) => item.severity === "error"), flags, contract, transform: { scale, translateX, translateY }, landmarks, sourceImage, composite: visibleComposite, ...(visibility ? { visibility, unoccludedComposite: composite } : {}), measurements: { supportDistancePx, scaleDistancePx, scaleErrorPx, ...bodyMeasurements, paintedPixels, outsideBoardPixels, outsideEnvelopePixels, nativeOutsideBoardPixels, nativeOutsideEnvelopePixels, forbiddenOverlaps, nativeForbiddenOverlaps, ...(forbiddenScopeChecks ? { forbiddenScopeChecks } : {}), ...(requiredHiddenLandmarkChecks ? { requiredHiddenLandmarkChecks } : {}) } };
}

/** Closed disc versus a pixel square, using authored board pixels throughout. */
function discIntersectsRect(point: { x: number; y: number }, radius: number, left: number, top: number, size = 1): boolean {
  const dx = Math.max(left - point.x, 0, point.x - left - size); const dy = Math.max(top - point.y, 0, point.y - top - size);
  return dx * dx + dy * dy <= radius * radius + 1e-10;
}

function visiblePixelsInDisc(layer: FixedPlacement["composite"], point: { x: number; y: number }, radius: number): number {
  let count = 0;
  const x0 = Math.max(0, Math.floor(point.x - radius) - layer.left - 1), x1 = Math.min(layer.width - 1, Math.floor(point.x + radius) - layer.left);
  const y0 = Math.max(0, Math.floor(point.y - radius) - layer.top - 1), y1 = Math.min(layer.height - 1, Math.floor(point.y + radius) - layer.top);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (layer.rgba[(y * layer.width + x) * 4 + 3] && discIntersectsRect(point, radius, layer.left + x, layer.top + y)) count++;
  return count;
}

/**
 * The disc is a frozen margin around an observed sole, not a guessed boot mask.
 * Radius is the entire authored margin: reject it if narrower than transformed
 * observation tolerance, never silently expand it. Require opaque original
 * foreground even at transparent source positions, plus
 * real strong source support and no remaining native/preview alpha. Therefore a
 * missing/transparent foot, half mask, or alpha rounded to zero cannot pass.
 * This does NOT prove the rest of a boot, calf, trouser leg or cloth edge is hidden.
 */
function checkRequiredHiddenLandmarks(contract: FixedSlotContractV3, sprite: AnyExtractedSprite, visibility: NonNullable<FixedPlacement["visibility"]>, landmarks: FixedPlacement["landmarks"], foreground: ForegroundRgba, boardPreview: FixedPlacement["composite"], premaskedPreview: FixedPlacement["composite"], flags: QaFlag[]): RequiredHiddenLandmarkCheck[] {
  const { scale, translateX, translateY } = visibility.sourceImage.transform;
  return contract.requiredHiddenLandmarks!.map(({ sourceLandmark, radiusPx }) => {
    const point = landmarks[sourceLandmark]!;
    const landmarkToleranceBoardPx = sprite.source.landmarkTolerancePx * scale;
    const radiusCoversLandmarkTolerance = radiusPx + 1e-10 >= landmarkToleranceBoardPx;
    const landmarkFullyOpaque = fullyOpaqueForegroundAt(foreground, point.x, point.y);
    let boardDiscPixels = 0; let nonOpaqueForegroundPixels = 0;
    for (let y = Math.floor(point.y - radiusPx) - 1; y <= Math.floor(point.y + radiusPx); y++) for (let x = Math.floor(point.x - radiusPx) - 1; x <= Math.floor(point.x + radiusPx); x++) {
      if (!discIntersectsRect(point, radiusPx, x, y)) continue;
      boardDiscPixels++;
      if (x < 0 || y < 0 || x >= foreground.width || y >= foreground.height || foreground.rgba[(y * foreground.width + x) * 4 + 3] !== 255) nonOpaqueForegroundPixels++;
    }
    let strongSourcePixels = 0; let nativeAlphaPixels = 0; let notFullyMaskedNativePixels = 0; let visibleNativePixels = 0;
    const x0 = Math.max(0, Math.floor((point.x - radiusPx - translateX) / scale) - 1), x1 = Math.min(sprite.width - 1, Math.floor((point.x + radiusPx - translateX) / scale));
    const y0 = Math.max(0, Math.floor((point.y - radiusPx - translateY) / scale) - 1), y1 = Math.min(sprite.height - 1, Math.floor((point.y + radiusPx - translateY) / scale));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!discIntersectsRect(point, radiusPx, translateX + x * scale, translateY + y * scale, scale)) continue;
      const i = (y * sprite.width + x) * 4;
      if (!sprite.rgba[i + 3]) continue;
      nativeAlphaPixels++;
      if (sprite.rgba[i + 3]! >= 32) strongSourcePixels++;
      if (!fullyOpaqueForegroundAt(foreground, translateX + (x + 0.5) * scale, translateY + (y + 0.5) * scale)) notFullyMaskedNativePixels++;
      if (visibility.sourceImage.rgba[i + 3]) visibleNativePixels++;
    }
    const visibleBoardPixels = visiblePixelsInDisc(boardPreview, point, radiusPx);
    const visiblePremaskedPreviewPixels = visiblePixelsInDisc(premaskedPreview, point, radiusPx);
    const passed = radiusCoversLandmarkTolerance && landmarkFullyOpaque && boardDiscPixels > 0 && nonOpaqueForegroundPixels === 0 && strongSourcePixels > 0 && notFullyMaskedNativePixels === 0 && visibleNativePixels === 0 && visibleBoardPixels === 0 && visiblePremaskedPreviewPixels === 0;
    if (!passed) flag(flags, "required_foot_occlusion_failed", `${sourceLandmark} must be hidden within its authored ${radiusPx}px board-space sole disc (observation tolerance ${landmarkToleranceBoardPx}px): ${nonOpaqueForegroundPixels} nonopaque mask pixels, ${strongSourcePixels} strong source support pixels, ${notFullyMaskedNativePixels} not-fully-masked native pixels, ${visibleNativePixels} visible native pixels, ${visibleBoardPixels} board-preview pixels and ${visiblePremaskedPreviewPixels} native-premasked preview pixels`);
    return { sourceLandmark, radiusPx, boardPoint: { ...point }, landmarkToleranceBoardPx, radiusCoversLandmarkTolerance, landmarkFullyOpaque, boardDiscPixels, nonOpaqueForegroundPixels, strongSourcePixels, nativeAlphaPixels, notFullyMaskedNativePixels, visibleNativePixels, visibleBoardPixels, visiblePremaskedPreviewPixels, passed };
  });
}

/** All contributing mask pixels must be alpha255; no float epsilon can forgive alpha254. */
function fullyOpaqueForegroundAt(foreground: ForegroundRgba, bx: number, by: number): boolean {
  const sx = bx - 0.5; const sy = by - 0.5; const x0 = Math.floor(sx); const y0 = Math.floor(sy);
  const fx = sx - x0; const fy = sy - y0;
  for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
    if ((dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) <= 0) continue;
    const x = x0 + dx; const y = y0 + dy;
    if (x < 0 || y < 0 || x >= foreground.width || y >= foreground.height || foreground.rgba[(y * foreground.width + x) * 4 + 3] !== 255) return false;
  }
  return true;
}

/** Board mask alpha sampled in board-pixel-centre coordinates; never resize the reusable native master. */
function foregroundAlpha(foreground: ForegroundRgba, bx: number, by: number): number {
  const sx = bx - 0.5; const sy = by - 0.5; const x0 = Math.floor(sx); const y0 = Math.floor(sy);
  const fx = sx - x0; const fy = sy - y0;
  let alpha = 0;
  for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
    const x = x0 + dx; const y = y0 + dy;
    if (x < 0 || y < 0 || x >= foreground.width || y >= foreground.height) continue;
    alpha += foreground.rgba[(y * foreground.width + x) * 4 + 3]! * (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
  }
  return alpha;
}

function maskBoardComposite(composite: FixedPlacement["composite"], foreground: ForegroundRgba): FixedPlacement["composite"] {
  const rgba = Buffer.from(composite.rgba);
  let minX = composite.width; let minY = composite.height; let maxX = -1; let maxY = -1;
  for (let y = 0; y < composite.height; y++) for (let x = 0; x < composite.width; x++) {
    const i = (y * composite.width + x) * 4; const bx = composite.left + x; const by = composite.top + y;
    const maskAlpha = bx >= 0 && by >= 0 && bx < foreground.width && by < foreground.height ? foreground.rgba[(by * foreground.width + bx) * 4 + 3]! : 0;
    rgba[i + 3] = Math.round(rgba[i + 3]! * (1 - maskAlpha / 255));
    if (!rgba[i + 3]) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  if (maxX < 0) return { left: composite.left, top: composite.top, width: 1, height: 1, rgba: Buffer.alloc(4) };
  const width = maxX - minX + 1; const height = maxY - minY + 1; const trimmed = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) trimmed.set(rgba.subarray(((minY + y) * composite.width + minX) * 4, ((minY + y) * composite.width + minX + width) * 4), y * width * 4);
  return { left: composite.left + minX, top: composite.top + minY, width, height, rgba: trimmed };
}

function visibleGeometry(contract: FixedSlotContractV3, sprite: AnyExtractedSprite, master: FixedPlacement["sourceImage"], landmarks: FixedPlacement["landmarks"], flags: QaFlag[], foreground?: ForegroundRgba): NonNullable<FixedPlacement["visibility"]> {
  const expected = contract.foregroundMask;
  if (expected && !foreground) throw new FixedSpriteError("missing_foreground", "Declared foreground mask must be supplied and verified before visible placement");
  if (!expected && foreground) throw new FixedSpriteError("undeclared_foreground", "Foreground occlusion is not permitted without a frozen mask identity");
  if (foreground) {
    assertRgba(foreground.rgba, foreground.width, foreground.height);
    if (foreground.width !== expected!.width || foreground.height !== expected!.height || sha256Rgba(foreground.rgba, foreground.width, foreground.height) !== expected!.rgbaSha256) throw new FixedSpriteError("foreground_identity_mismatch", "Foreground decoded RGBA hash or dimensions differ from the frozen v3 contract");
  }
  const rgba = Buffer.from(master.rgba);
  const { scale, translateX, translateY } = master.transform;
  if (foreground && scale > 1) flag(flags, "foreground_upscale_unsupported", "A board mask can contain details between upscaled native sample centres; the native masked asset is not approved. Use a sufficiently resolved source or a separate runtime foreground layer, not a guessed mask");
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  let visibleSourcePixels = 0; let occludedSourcePixels = 0; let protectedFaceOccludedPixels = 0;
  for (let y = 0; y < master.height; y++) for (let x = 0; x < master.width; x++) {
    const i = (y * master.width + x) * 4; const before = rgba[i + 3]!;
    if (!before) continue;
    if (foreground) rgba[i + 3] = Math.round(before * (1 - foregroundAlpha(foreground, translateX + (x + 0.5) * scale, translateY + (y + 0.5) * scale) / 255));
    if (rgba[i + 3]! < before) occludedSourcePixels++;
    const sourcePoint = { x: (sprite.crop.left + x + 0.5) / sprite.sourceWidth, y: (sprite.crop.top + y + 0.5) / sprite.sourceHeight };
    if (before >= 224 && rgba[i + 3]! < 224 && pointInPolygon(sourcePoint, sprite.source.protectedFacePolygon)) protectedFaceOccludedPixels++;
    if (rgba[i + 3]! < 32) continue;
    visibleSourcePixels++;
    minX = Math.min(minX, translateX + x * scale); minY = Math.min(minY, translateY + y * scale);
    maxX = Math.max(maxX, translateX + (x + 1) * scale); maxY = Math.max(maxY, translateY + (y + 1) * scale);
  }
  if (!visibleSourcePixels) flag(flags, "fully_occluded_figure", "No visible strong source alpha remains after declared foreground occlusion");
  if (contract.support.type === "occluded-standing" && !occludedSourcePixels) flag(flags, "occluded_standing_not_occluded", "The declared foreground must actually occlude this standing source; an eye anchor does not create a fallback open-ground placement");
  if (protectedFaceOccludedPixels) flag(flags, "foreground_face_occlusion", `${protectedFaceOccludedPixels} protected face pixels are obscured by the declared foreground`);
  const eye = landmarks.eyeMidpoint!;
  if (foreground && foregroundAlpha(foreground, eye.x, eye.y) > 31) flag(flags, "foreground_eye_occlusion", "The measured eye midpoint is obscured; it cannot be used as a visible player anchor");
  const hitRect = visibleSourcePixels ? { x: minX / contract.board.width, y: minY / contract.board.height, w: (maxX - minX) / contract.board.width, h: (maxY - minY) / contract.board.height } : null;
  const headAnchor = { x: eye.x / contract.board.width, y: eye.y / contract.board.height };
  if (hitRect && (headAnchor.x < hitRect.x || headAnchor.y < hitRect.y || headAnchor.x > hitRect.x + hitRect.w || headAnchor.y > hitRect.y + hitRect.h)) flag(flags, "visible_anchor_outside_hit_rect", "Measured eye midpoint is outside the visible hit geometry");
  return { sourceImage: { ...master, rgba, rgbaSha256: sha256Rgba(rgba, master.width, master.height) }, hitRect, headAnchor, foregroundApplied: Boolean(foreground), visibleSourcePixels, occludedSourcePixels, protectedFaceOccludedPixels };
}

/** Serialisable audit record excludes the bulky RGBA buffer. */
export function fixedPlacementManifest(placement: FixedPlacement, sprite: AnyExtractedSprite) {
  const { rgba, ...composite } = placement.composite;
  const { rgba: nativeRgba, ...sourceImage } = placement.sourceImage;
  const visibleSource = placement.visibility ? (({ rgba: _rgba, ...rest }) => rest)(placement.visibility.sourceImage) : undefined;
  const unoccluded = placement.unoccludedComposite ? (({ rgba: pixels, ...rest }) => ({ ...rest, rgbaSha256: sha256Rgba(pixels, rest.width, rest.height) }))(placement.unoccludedComposite) : undefined;
  return {
    version: placement.contract.version === "fixed-sprite/v3" ? "fixed-sprite-manifest/v3" as const : "fixed-sprite-manifest/v2" as const,
    ok: placement.ok,
    contract: placement.contract,
    source: { sheetRgbaSha256: sprite.sourceSha256, cell: sprite.cell, sourceWidth: sprite.sourceWidth, sourceHeight: sprite.sourceHeight, crop: sprite.crop, landmarks: sprite.source.landmarks, protectedFacePolygon: sprite.source.protectedFacePolygon, review: sprite.review, measurements: sprite.measurements,
      ...(isVisibleSource(sprite.source) ? { measurementVersion: sprite.source.measurementVersion, measurementFrame: sprite.source.measurementFrame, derivedLandmarks: sprite.derivedLandmarks, extractionBinding: sprite.extractionBinding, derivation: "soleMidpoint = (observed leftFoot + observed rightFoot) / 2; not an alpha-supported anatomical point" } : {}),
    },
    transform: placement.transform,
    sourceImage: { ...sourceImage, resolution: "native-cleaned" as const, rgbaSha256: sha256Rgba(nativeRgba, sourceImage.width, sourceImage.height) },
    landmarks: placement.landmarks,
    composite: { ...composite, purpose: "board-resolution-qa-preview-only" as const, rgbaSha256: sha256Rgba(rgba, composite.width, composite.height), sampling: "premultiplied-bilinear-uniform-v1" },
    measurements: placement.measurements,
    flags: placement.flags,
    ...(placement.visibility ? { visibility: {
      ...placement.visibility, sourceImage: { ...visibleSource!, resolution: "native-foreground-alpha-applied" as const },
      geometryBasis: "visible native alpha >=32; head anchor is observed eyeMidpoint", foregroundAlreadyApplied: placement.visibility.foregroundApplied,
      nativeForegroundSampling: "board-mask-" + "bilinear-at-native-pixel-centres", compositeForegroundSampling: "board-pixel-alpha-exact-after-unoccluded-resampling",
    }, unoccludedComposite: unoccluded, constraintGeometryBasis: placement.measurements.forbiddenScopeChecks ? "unoccluded native samples and board preview; explicitly scoped final-visible forbidden regions additionally use verified mask and native-premasked preview" : "unoccluded native samples and board preview",
    ...(placement.measurements.forbiddenScopeChecks ? { forbiddenScopeGeometryBasis: "Explicit final-visible regions additionally require fully opaque board/native mask coverage and zero native-premasked preview overlap; source face protection, unscoped regions and other geometry remain unoccluded" } : {}),
    ...(placement.measurements.requiredHiddenLandmarkChecks ? { requiredHiddenLandmarkGeometryBasis: "Both observed sole discs require opaque original foreground, nonempty strong native source support and zero native/board/premasked-preview visibility; this is not whole-boot/calf/cloth segmentation" } : {}),
    semanticStatus: "pending" as const, automaticRelease: false as const } : {}),
  };
}
