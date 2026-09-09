import { createHash } from "node:crypto";
import { z } from "zod";
import { pointInPolygon, sha256Rgba, type BoardIdentity, type PixelRect, type QaFlag, type SpriteTransform } from "./fixed-sprite";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const pointSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict();
const polygonSchema = z.array(pointSchema).min(3).refine((points) => Math.abs(points.reduce((area, a, i) => {
  const b = points[(i + 1) % points.length]!;
  return area + a.x * b.y - b.x * a.y;
}, 0)) > 1e-10, "Polygon must have positive area");
const dimensions = { width: z.number().int().positive(), height: z.number().int().positive() };
const boardSchema = z.object({ sha256: hashSchema, ...dimensions }).strict();

/** Pixel thresholds are source-resolution values. Defaults are conservative, not learned QA. */
export const fixedTemplateThresholdsSchema = z.object({
  boundaryBandPx: z.number().int().min(1).max(32).default(2),
  opaqueAlphaMin: z.number().int().min(1).max(255).default(224),
  faceAlphaMin: z.number().int().min(1).max(255).default(224),
  changeThreshold: z.number().int().min(1).max(255).default(1),
  maxBoundaryChangedPixels: z.number().int().nonnegative().default(0),
  maxSeamRgbJumpIncrease: z.number().min(0).max(255).default(32),
  maxSeamAlphaJumpIncrease: z.number().min(0).max(255).default(32),
  maxSeamOutlierEdges: z.number().int().nonnegative().default(0),
  maxProtectedFaceMissingPixels: z.number().int().nonnegative().default(0),
  maxChangedPixelsOutsideAllowedHeadRegion: z.number().int().nonnegative().default(0),
  minEditedVisiblePixels: z.number().int().nonnegative().default(1),
  frameClearancePx: z.number().int().min(1).max(32).default(1),
}).strict();

export const fixedTemplateRecipeSchema = z.object({
  version: z.literal("fixed-template/v1"),
  templateId: z.string().min(1),
  poseId: z.string().min(1),
  template: z.object({ rgbaSha256: hashSchema, ...dimensions }).strict(),
  editableMask: z.object({ sha256: hashSchema, encoding: z.literal("binary-0-1"), ...dimensions }).strict(),
  board: boardSchema,
  templateFrame: z.object({
    kind: z.literal("authored-template-frame"),
    /** Authored template coordinate, NOT a measured landmark on generated anatomy. */
    seatContact: pointSchema,
    /** Interior expected face coverage; exclude hair/silhouette antialiasing. */
    protectedFacePolygon: polygonSchema,
    /** Limits changed visible pixels, not the entire body and not a measured head bounding box. */
    allowedHeadRegion: polygonSchema,
  }).strict(),
  placement: z.object({
    /** Authored source-frame-to-board uniform scale. Never inferred from head size or alpha bounds. */
    scale: z.number().finite().positive(),
    destinationSeat: pointSchema,
  }).strict(),
  thresholds: fixedTemplateThresholdsSchema.default({}),
}).strict().superRefine((recipe, context) => {
  if (recipe.template.width !== recipe.editableMask.width || recipe.template.height !== recipe.editableMask.height) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Template and edit mask must use the same frame" });
  }
});
export type FixedTemplateRecipe = z.infer<typeof fixedTemplateRecipeSchema>;
export interface TemplateRgba { rgba: Uint8Array; width: number; height: number }
export interface TemplateMask { data: Uint8Array; width: number; height: number }
export class FixedTemplateError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "FixedTemplateError"; }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
/** Includes parsed/defaulted thresholds, so relaxing a gate changes the frozen recipe hash. */
export function fixedTemplateRecipeSha256(recipe: unknown): string {
  return createHash("sha256").update(canonical(fixedTemplateRecipeSchema.parse(recipe))).digest("hex");
}
function assertFrame(width: number, height: number, length: number, channels: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width * height > 25_000_000 || length !== width * height * channels) {
    throw new FixedTemplateError("invalid_frame", "Expected an exact positive frame of at most 25 million pixels");
  }
}
export function sha256TemplateMask(mask: TemplateMask): string {
  assertFrame(mask.width, mask.height, mask.data.length, 1);
  if (mask.data.some((value) => value !== 0 && value !== 1)) throw new FixedTemplateError("non_binary_mask", "Edit mask must contain only 0 (restore template) or 1 (keep edited RGBA)");
  return createHash("sha256").update(`fixed-template-mask/v1:${mask.width}x${mask.height}:`).update(mask.data).digest("hex");
}
function neighbors(index: number, width: number, height: number): number[] {
  const x = index % width;
  const y = Math.floor(index / width);
  return [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1, y > 0 ? index - width : -1, y + 1 < height ? index + width : -1].filter((i) => i >= 0);
}
function maxRgbDelta(a: Uint8Array, ai: number, b: Uint8Array, bi: number): number {
  return Math.max(Math.abs(a[ai]! - b[bi]!), Math.abs(a[ai + 1]! - b[bi + 1]!), Math.abs(a[ai + 2]! - b[bi + 2]!));
}
function visibleDelta(a: Uint8Array, b: Uint8Array, i: number): number {
  return Math.max(Math.abs(a[i + 3]! - b[i + 3]!), a[i + 3]! > 0 || b[i + 3]! > 0 ? maxRgbDelta(a, i, b, i) : 0);
}
function rgbJumpIncrease(before: Uint8Array, after: Uint8Array, i: number, j: number): number {
  // Compare each channel to itself; an existing red edge must not hide a new blue seam.
  let increase = 0;
  for (let c = 0; c < 3; c++) increase = Math.max(increase, Math.abs(after[i + c]! - after[j + c]!) - Math.abs(before[i + c]! - before[j + c]!));
  return increase;
}

export interface FixedTemplateResult {
  /** Mechanical gates only. Never an identity/style/completeness approval. */
  ok: boolean;
  semanticStatus: "pending";
  automaticRelease: false;
  flags: QaFlag[];
  recipe: FixedTemplateRecipe;
  recipeSha256: string;
  provenance: { templateRgbaSha256: string; editedRgbaSha256: string; maskSha256: string; restoredRgbaSha256: string };
  /** Full frame preserves even invisible RGB bytes outside the edit mask. */
  restored: { rgba: Buffer; width: number; height: number };
  /** Original-resolution crop, not a board-resolution preview. */
  sourceImage: { rgba: Buffer; width: number; height: number; sourceWidth: number; sourceHeight: number; crop: PixelRect; rgbaSha256: string; transform: SpriteTransform };
  /** Transform on authored full template-frame coordinates. */
  transform: SpriteTransform;
  composite: { rgba: Buffer; left: number; top: number; width: number; height: number; purpose: "board-resolution-qa-preview-only"; sampling: "premultiplied-bilinear-uniform-v1" };
  metrics: {
    editablePixels: number; providerOutsideMaskChangedPixels: number; providerOutsideMaskChangedBytes: number;
    outsideMaskMismatchPixels: number; outsideMaskMismatchBytes: number;
    changedVisiblePixels: number; changedBoundaryPixels: number; opaqueBoundaryPixels: number;
    boundaryBandPixels: number; maxBoundaryBandOpaqueRgbDelta: number; maxBoundaryBandAlphaDelta: number;
    seamEdges: number; opaqueSeamEdges: number; seamOutlierEdges: number; maxSeamRgbJumpIncrease: number; maxSeamAlphaJumpIncrease: number;
    protectedFacePixels: number; protectedFaceMissingPixels: number; protectedFaceOutsideEditableMaskPixels: number;
    changedPixelsOutsideAllowedHeadRegion: number; frameContactPixels: number; visiblePixels: number; nativeOutsideBoardPixels: number;
  };
}

/** No network, image repair, hole fill, alpha flattening, hair-shape constraint, or nonuniform warping. */
export function processFixedTemplateEdit(input: {
  recipe: unknown; expectedRecipeSha256: string; template: TemplateRgba; edited: TemplateRgba; editableMask: TemplateMask; board: BoardIdentity;
}): FixedTemplateResult {
  const recipe = fixedTemplateRecipeSchema.parse(input.recipe);
  const recipeSha256 = fixedTemplateRecipeSha256(recipe);
  if (input.expectedRecipeSha256 !== recipeSha256) throw new FixedTemplateError("stale_recipe", "Recipe does not match its independently frozen hash");
  const { width, height } = recipe.template;
  for (const frame of [input.template, input.edited]) {
    assertFrame(frame.width, frame.height, frame.rgba.length, 4);
    if (frame.width !== width || frame.height !== height) throw new FixedTemplateError("frame_mismatch", "Edited and original images must use the exact authored template frame; no resizing is performed");
  }
  const templateRgbaSha256 = sha256Rgba(input.template.rgba, width, height);
  if (templateRgbaSha256 !== recipe.template.rgbaSha256) throw new FixedTemplateError("template_hash_mismatch", "Template RGBA bytes do not match the recipe");
  const maskSha256 = sha256TemplateMask(input.editableMask);
  if (input.editableMask.width !== width || input.editableMask.height !== height) throw new FixedTemplateError("mask_frame_mismatch", "Edit mask frame differs from the template");
  if (maskSha256 !== recipe.editableMask.sha256) throw new FixedTemplateError("mask_hash_mismatch", "Edit mask bytes do not match the recipe");
  if (input.board.sha256 !== recipe.board.sha256 || input.board.width !== recipe.board.width || input.board.height !== recipe.board.height) throw new FixedTemplateError("board_mismatch", "Board identity/frame differs from the frozen recipe");
  const template = input.template.rgba;
  const edited = input.edited.rgba;
  const mask = input.editableMask.data;
  const rgba = Buffer.from(template);
  const count = width * height;
  const flags: QaFlag[] = [];
  const fail = (code: string, message: string) => flags.push({ code, severity: "error", message });
  const thresholds = recipe.thresholds;
  const metrics: FixedTemplateResult["metrics"] = {
    editablePixels: 0, providerOutsideMaskChangedPixels: 0, providerOutsideMaskChangedBytes: 0, outsideMaskMismatchPixels: 0, outsideMaskMismatchBytes: 0,
    changedVisiblePixels: 0, changedBoundaryPixels: 0, opaqueBoundaryPixels: 0, boundaryBandPixels: 0, maxBoundaryBandOpaqueRgbDelta: 0, maxBoundaryBandAlphaDelta: 0,
    seamEdges: 0, opaqueSeamEdges: 0, seamOutlierEdges: 0, maxSeamRgbJumpIncrease: 0, maxSeamAlphaJumpIncrease: 0,
    protectedFacePixels: 0, protectedFaceMissingPixels: 0, protectedFaceOutsideEditableMaskPixels: 0, changedPixelsOutsideAllowedHeadRegion: 0,
    frameContactPixels: 0, visiblePixels: 0, nativeOutsideBoardPixels: 0,
  };
  for (let p = 0; p < count; p++) {
    const i = p * 4;
    if (mask[p]) { rgba.set(edited.subarray(i, i + 4), i); metrics.editablePixels++; }
    else {
      let bytes = 0;
      for (let c = 0; c < 4; c++) if (edited[i + c] !== template[i + c]) bytes++;
      metrics.providerOutsideMaskChangedBytes += bytes;
      if (bytes) metrics.providerOutsideMaskChangedPixels++;
    }
  }
  // Independent exact postcondition, including transparent RGB. Never ignore alpha-zero pixels here.
  for (let p = 0; p < count; p++) if (!mask[p]) {
    let bytes = 0;
    for (let c = 0; c < 4; c++) if (rgba[p * 4 + c] !== template[p * 4 + c]) bytes++;
    metrics.outsideMaskMismatchBytes += bytes;
    if (bytes) metrics.outsideMaskMismatchPixels++;
  }
  if (metrics.outsideMaskMismatchBytes) fail("outside_mask_invariance", "Restoration failed exact outside-mask RGBA equality");
  if (metrics.providerOutsideMaskChangedBytes) flags.push({ code: "provider_drift_restored", severity: "info", message: `${metrics.providerOutsideMaskChangedPixels} provider-changed outside-mask pixels were restored byte-for-byte` });
  if (!metrics.editablePixels) fail("empty_editable_mask", "No pixels are editable");

  // Manhattan-distance interior band; the first ring borders immutable pixels or the canvas edge.
  const distance = new Uint8Array(count);
  const queue = new Int32Array(count);
  let tail = 0;
  for (let p = 0; p < count; p++) if (mask[p]) {
    const x = p % width; const y = Math.floor(p / width);
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1 || neighbors(p, width, height).some((n) => !mask[n])) { distance[p] = 1; queue[tail++] = p; }
  }
  for (let head = 0; head < tail; head++) {
    const p = queue[head]!;
    if (distance[p]! >= thresholds.boundaryBandPx) continue;
    for (const n of neighbors(p, width, height)) if (mask[n] && !distance[n]) { distance[n] = distance[p]! + 1; queue[tail++] = n; }
  }
  const scale = recipe.placement.scale;
  const transform: SpriteTransform = {
    scale,
    translateX: recipe.placement.destinationSeat.x * recipe.board.width - recipe.templateFrame.seatContact.x * width * scale,
    translateY: recipe.placement.destinationSeat.y * recipe.board.height - recipe.templateFrame.seatContact.y * height * scale,
  };
  let minX = width; let minY = height; let maxX = -1; let maxY = -1;
  for (let p = 0; p < count; p++) {
    const i = p * 4; const x = p % width; const y = Math.floor(p / width);
    const point = { x: (x + 0.5) / width, y: (y + 0.5) / height };
    const changed = visibleDelta(template, rgba, i) >= thresholds.changeThreshold;
    if (changed) {
      metrics.changedVisiblePixels++;
      if (!pointInPolygon(point, recipe.templateFrame.allowedHeadRegion)) metrics.changedPixelsOutsideAllowedHeadRegion++;
    }
    if (pointInPolygon(point, recipe.templateFrame.protectedFacePolygon)) {
      metrics.protectedFacePixels++;
      if (rgba[i + 3]! < thresholds.faceAlphaMin) metrics.protectedFaceMissingPixels++;
      if (!mask[p]) metrics.protectedFaceOutsideEditableMaskPixels++;
    }
    if (distance[p]) {
      metrics.boundaryBandPixels++;
      metrics.maxBoundaryBandAlphaDelta = Math.max(metrics.maxBoundaryBandAlphaDelta, Math.abs(template[i + 3]! - rgba[i + 3]!));
      if (template[i + 3]! >= thresholds.opaqueAlphaMin && rgba[i + 3]! >= thresholds.opaqueAlphaMin) metrics.maxBoundaryBandOpaqueRgbDelta = Math.max(metrics.maxBoundaryBandOpaqueRgbDelta, maxRgbDelta(template, i, rgba, i));
      if (distance[p] === 1) {
        if (changed) metrics.changedBoundaryPixels++;
        if (rgba[i + 3]! >= thresholds.opaqueAlphaMin) metrics.opaqueBoundaryPixels++;
      }
      // Inspect the whole configured band, not only the exact mask crossing.
      // An edit one pixel inside an unchanged outer ring can still form a visible seam.
      for (const n of neighbors(p, width, height)) {
        if (mask[n] && !distance[n]) continue; // deeper editable hair is not an immutable seam
        if (mask[n] && distance[n] && n < p) continue; // count each interior edge once
          const j = n * 4;
          metrics.seamEdges++;
          const alphaIncrease = Math.max(0, Math.abs(rgba[i + 3]! - rgba[j + 3]!) - Math.abs(template[i + 3]! - template[j + 3]!));
          let rgbIncrease = 0;
          if ([template[i + 3]!, template[j + 3]!, rgba[i + 3]!, rgba[j + 3]!].every((a) => a >= thresholds.opaqueAlphaMin)) {
            metrics.opaqueSeamEdges++;
            rgbIncrease = rgbJumpIncrease(template, rgba, i, j);
          }
          metrics.maxSeamRgbJumpIncrease = Math.max(metrics.maxSeamRgbJumpIncrease, rgbIncrease);
          metrics.maxSeamAlphaJumpIncrease = Math.max(metrics.maxSeamAlphaJumpIncrease, alphaIncrease);
          if (rgbIncrease > thresholds.maxSeamRgbJumpIncrease || alphaIncrease > thresholds.maxSeamAlphaJumpIncrease) metrics.seamOutlierEdges++;
      }
    }
    if (rgba[i + 3]! > 0) {
      metrics.visiblePixels++;
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      if (x < thresholds.frameClearancePx || y < thresholds.frameClearancePx || x >= width - thresholds.frameClearancePx || y >= height - thresholds.frameClearancePx) metrics.frameContactPixels++;
      // Whole native-pixel footprint, not merely a downsampled preview that can hide small protrusions.
      if (transform.translateX + x * scale < -1e-9 || transform.translateY + y * scale < -1e-9 || transform.translateX + (x + 1) * scale > recipe.board.width + 1e-9 || transform.translateY + (y + 1) * scale > recipe.board.height + 1e-9) metrics.nativeOutsideBoardPixels++;
    }
  }
  if (metrics.changedVisiblePixels < thresholds.minEditedVisiblePixels) fail("insufficient_visible_edit", "No sufficient visible edit was produced; identity is still unverified");
  if (metrics.changedBoundaryPixels > thresholds.maxBoundaryChangedPixels) fail("edit_touches_mask_boundary", "Visible changes reach the edit-mask boundary");
  if (metrics.seamOutlierEdges > thresholds.maxSeamOutlierEdges) fail("boundary_seam_discontinuity", "Opaque RGB or alpha discontinuity increased across the immutable/editable seam");
  if (!metrics.protectedFacePixels) fail("empty_protected_face_region", "Protected face polygon covers no source pixel centres");
  if (metrics.protectedFaceOutsideEditableMaskPixels) fail("face_outside_editable_mask", "Protected face coverage is not entirely inside the declared editable mask");
  if (metrics.protectedFaceMissingPixels > thresholds.maxProtectedFaceMissingPixels) fail("protected_face_missing_alpha", "Protected face region contains missing alpha; no pixels were filled");
  if (metrics.changedPixelsOutsideAllowedHeadRegion > thresholds.maxChangedPixelsOutsideAllowedHeadRegion) fail("edit_outside_allowed_head_region", "Changed visible pixels extend beyond the authored allowed head region");
  if (metrics.frameContactPixels) fail("template_frame_contact", "Retained visible content reaches the required template-frame clearance; clipping was not repaired");
  if (!metrics.visiblePixels) fail("empty_template_result", "The restored result has no visible pixels");
  if (metrics.nativeOutsideBoardPixels) fail("outside_board", "Native visible pixel footprints extend beyond the board; no shrink or re-anchoring was applied");
  const crop: PixelRect = maxX < 0 ? { left: 0, top: 0, width: 1, height: 1 } : { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  const native = Buffer.alloc(crop.width * crop.height * 4);
  for (let y = 0; y < crop.height; y++) native.set(rgba.subarray(((crop.top + y) * width + crop.left) * 4, ((crop.top + y) * width + crop.left + crop.width) * 4), y * crop.width * 4);
  const sourceImage = { rgba: native, width: crop.width, height: crop.height, sourceWidth: width, sourceHeight: height, crop, rgbaSha256: sha256Rgba(native, crop.width, crop.height), transform: { scale, translateX: transform.translateX + crop.left * scale, translateY: transform.translateY + crop.top * scale } };
  return {
    ok: !flags.some((item) => item.severity === "error"), semanticStatus: "pending", automaticRelease: false, flags, recipe, recipeSha256,
    provenance: { templateRgbaSha256, editedRgbaSha256: sha256Rgba(edited, width, height), maskSha256, restoredRgbaSha256: sha256Rgba(rgba, width, height) },
    restored: { rgba, width, height }, sourceImage, transform, composite: preview(sourceImage), metrics,
  };
}

/** The native crop is untouched. Resampling happens only in this disposable board-resolution preview. */
function preview(source: FixedTemplateResult["sourceImage"]): FixedTemplateResult["composite"] {
  const { scale, translateX, translateY } = source.transform;
  const left = Math.floor(translateX - scale / 2); const top = Math.floor(translateY - scale / 2);
  const width = Math.ceil(translateX + (source.width + 0.5) * scale) - left;
  const height = Math.ceil(translateY + (source.height + 0.5) * scale) - top;
  assertFrame(width, height, width * height * 4, 4);
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = (left + x + 0.5 - translateX) / scale - 0.5; const sy = (top + y + 0.5 - translateY) / scale - 0.5;
    const x0 = Math.floor(sx); const y0 = Math.floor(sy); const fx = sx - x0; const fy = sy - y0;
    let alpha = 0; let red = 0; let green = 0; let blue = 0;
    for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
      const px = x0 + dx; const py = y0 + dy;
      if (px < 0 || py < 0 || px >= source.width || py >= source.height) continue;
      const i = (py * source.width + px) * 4;
      const a = source.rgba[i + 3]! * (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
      alpha += a; red += source.rgba[i]! * a; green += source.rgba[i + 1]! * a; blue += source.rgba[i + 2]! * a;
    }
    const i = (y * width + x) * 4;
    if (alpha > 0) { rgba[i] = Math.round(red / alpha); rgba[i + 1] = Math.round(green / alpha); rgba[i + 2] = Math.round(blue / alpha); rgba[i + 3] = Math.round(alpha); }
  }
  // Trim only disposable sampling padding, so valid edge placements do not acquire
  // negative compositor origins merely from completely transparent preview pixels.
  let minX = width; let minY = height; let maxX = -1; let maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (rgba[(y * width + x) * 4 + 3]) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  const trimmedWidth = maxX < 0 ? 1 : maxX - minX + 1; const trimmedHeight = maxY < 0 ? 1 : maxY - minY + 1;
  const trimmed = Buffer.alloc(trimmedWidth * trimmedHeight * 4);
  if (maxX >= 0) for (let y = 0; y < trimmedHeight; y++) trimmed.set(rgba.subarray(((minY + y) * width + minX) * 4, ((minY + y) * width + minX + trimmedWidth) * 4), y * trimmedWidth * 4);
  return { rgba: trimmed, left: left + (maxX < 0 ? 0 : minX), top: top + (maxY < 0 ? 0 : minY), width: trimmedWidth, height: trimmedHeight, purpose: "board-resolution-qa-preview-only", sampling: "premultiplied-bilinear-uniform-v1" };
}

/** Byte-free manifest, with original and native hashes, authored frame semantics, and every gate threshold. */
export function fixedTemplateManifest(result: FixedTemplateResult) {
  const { rgba: _native, ...sourceImage } = result.sourceImage;
  const { rgba: previewRgba, ...composite } = result.composite;
  return {
    version: "fixed-template-manifest/v1" as const, ok: result.ok, semanticStatus: result.semanticStatus, automaticRelease: result.automaticRelease,
    recipe: result.recipe, recipeSha256: result.recipeSha256, provenance: result.provenance, thresholds: result.recipe.thresholds,
    fullFrame: { width: result.restored.width, height: result.restored.height, rgbaSha256: result.provenance.restoredRgbaSha256 },
    transform: result.transform, sourceImage: { ...sourceImage, resolution: "native-restored" as const },
    composite: { ...composite, rgbaSha256: sha256Rgba(previewRgba, composite.width, composite.height) }, flags: result.flags, metrics: result.metrics,
    semanticLimitations: ["Authored template-frame geometry is not an observation of generated anatomy", "Identity, style, hair plausibility, and anatomical completeness require separate semantic review"],
  };
}
