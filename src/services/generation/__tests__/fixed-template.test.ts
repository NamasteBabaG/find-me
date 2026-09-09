import { describe, expect, it } from "vitest";
import { sha256Rgba, type NormalizedPolygon } from "../fixed-sprite";
import {
  fixedTemplateManifest, fixedTemplateRecipeSchema, fixedTemplateRecipeSha256, processFixedTemplateEdit, sha256TemplateMask,
} from "../fixed-template";

const WIDTH = 32;
const HEIGHT = 40;
const BOARD = { sha256: "a".repeat(64), width: 200, height: 200 };
const box = (x: number, y: number, w: number, h: number): NormalizedPolygon => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
const pxBox = (x: number, y: number, w: number, h: number) => box(x / WIDTH, y / HEIGHT, w / WIDTH, h / HEIGHT);
function paint(rgba: Uint8Array, x: number, y: number, w: number, h: number, color = [90, 120, 150, 255]) {
  for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) rgba.set(color, (py * WIDTH + px) * 4);
}
function fixture() {
  const rgba = Buffer.alloc(WIDTH * HEIGHT * 4);
  paint(rgba, 10, 6, 10, 10);
  paint(rgba, 11, 16, 8, 20);
  // Invisible template RGB is still part of the immutable byte contract.
  paint(rgba, 1, 1, 1, 1, [41, 73, 99, 0]);
  const data = new Uint8Array(WIDTH * HEIGHT);
  for (let y = 3; y < 18; y++) for (let x = 7; x < 23; x++) data[y * WIDTH + x] = 1;
  const template = { rgba, width: WIDTH, height: HEIGHT };
  const edited = { rgba: Buffer.from(rgba), width: WIDTH, height: HEIGHT };
  paint(edited.rgba, 14, 10, 1, 1, [145, 110, 140, 255]);
  const editableMask = { data, width: WIDTH, height: HEIGHT };
  const recipe = fixedTemplateRecipeSchema.parse({
    version: "fixed-template/v1", templateId: "seated-template", poseId: "seat-front", board: BOARD,
    template: { rgbaSha256: sha256Rgba(rgba, WIDTH, HEIGHT), width: WIDTH, height: HEIGHT },
    editableMask: { sha256: sha256TemplateMask(editableMask), encoding: "binary-0-1", width: WIDTH, height: HEIGHT },
    templateFrame: { kind: "authored-template-frame", seatContact: { x: 0.55, y: 0.7 }, protectedFacePolygon: pxBox(12, 9, 5, 5), allowedHeadRegion: pxBox(8, 4, 14, 13) },
    placement: { scale: 0.5, destinationSeat: { x: 0.5, y: 0.65 } },
  });
  return { template, edited, editableMask, recipe, board: { ...BOARD } };
}
const run = (f = fixture(), expectedRecipeSha256 = fixedTemplateRecipeSha256(f.recipe)) => processFixedTemplateEdit({ ...f, expectedRecipeSha256 });
const codes = (result: ReturnType<typeof run>) => result.flags.map((flag) => flag.code);
function nativePixel(result: ReturnType<typeof run>, x: number, y: number) {
  const source = result.sourceImage;
  const i = ((y - source.crop.top) * source.width + x - source.crop.left) * 4;
  return [...source.rgba.subarray(i, i + 4)];
}

describe("fixed template exact restoration and provenance", () => {
  it("accepts a bounded edit but keeps semantic judgment pending", () => {
    const result = run();
    expect(result.ok).toBe(true);
    expect(result.semanticStatus).toBe("pending");
    expect(result.automaticRelease).toBe(false);
    expect(result.metrics.changedVisiblePixels).toBe(1);
    expect(result.metrics.outsideMaskMismatchBytes).toBe(0);
    expect(result.metrics.protectedFaceMissingPixels).toBe(0);
  });

  it("restores every unmasked RGBA byte, including transparent RGB and alpha", () => {
    const f = fixture();
    paint(f.edited.rgba, 1, 1, 1, 1, [7, 8, 9, 255]);
    paint(f.edited.rgba, 12, 30, 1, 1, [0, 0, 0, 0]);
    const original = Buffer.from(f.template.rgba);
    const provider = Buffer.from(f.edited.rgba);
    const result = run(f);
    expect(result.ok).toBe(true);
    expect(result.metrics.providerOutsideMaskChangedPixels).toBe(2);
    expect(result.metrics.providerOutsideMaskChangedBytes).toBe(8);
    expect(codes(result)).toContain("provider_drift_restored");
    for (let p = 0; p < WIDTH * HEIGHT; p++) if (!f.editableMask.data[p]) expect(result.restored.rgba.subarray(p * 4, p * 4 + 4)).toEqual(original.subarray(p * 4, p * 4 + 4));
    expect(f.template.rgba).toEqual(original);
    expect(f.edited.rgba).toEqual(provider);
  });

  it("preserves all edited RGBA inside the mask, including antialiasing and invisible RGB", () => {
    const f = fixture();
    paint(f.edited.rgba, 9, 8, 1, 1, [219, 33, 71, 17]);
    paint(f.edited.rgba, 9, 9, 1, 1, [23, 77, 101, 0]);
    const result = run(f);
    expect(result.ok).toBe(true);
    for (let p = 0; p < WIDTH * HEIGHT; p++) if (f.editableMask.data[p]) expect(result.restored.rgba.subarray(p * 4, p * 4 + 4)).toEqual(f.edited.rgba.subarray(p * 4, p * 4 + 4));
    expect(nativePixel(result, 9, 8)).toEqual([219, 33, 71, 17]);
    expect(nativePixel(result, 9, 9)).toEqual([23, 77, 101, 0]);
  });

  it("rejects resized/reframed edits even when total byte count matches", () => {
    const f = fixture(); f.edited.width = HEIGHT; f.edited.height = WIDTH;
    expect(() => run(f)).toThrow(/exact authored template frame/);
  });

  it("rejects incorrect RGBA buffer length", () => {
    const f = fixture(); f.edited.rgba = Buffer.alloc(3);
    expect(() => run(f)).toThrow(/exact positive frame/);
  });

  it("binds the original template including invisible bytes", () => {
    const f = fixture(); f.template.rgba[(WIDTH + 1) * 4] = 42;
    expect(() => run(f)).toThrow(/Template RGBA bytes/);
  });

  it("rejects a stale mask hash and nonbinary masks instead of thresholding", () => {
    const stale = fixture(); stale.editableMask.data[10 * WIDTH + 10] = 0;
    expect(() => run(stale)).toThrow(/Edit mask bytes/);
    const nonbinary = fixture(); nonbinary.editableMask.data[10 * WIDTH + 10] = 255;
    expect(() => run(nonbinary)).toThrow(/only 0 .* or 1/);
  });

  it("rejects same-length masks with a different frame", () => {
    const f = fixture(); f.editableMask.width = HEIGHT; f.editableMask.height = WIDTH;
    expect(() => run(f)).toThrow(/Edit mask frame/);
  });

  it("rejects changed board hash and dimensions", () => {
    const f = fixture(); f.board.sha256 = "b".repeat(64);
    expect(() => run(f)).toThrow(/Board identity/);
    f.board = { ...BOARD, width: 201 };
    expect(() => run(f)).toThrow(/Board identity/);
  });

  it("requires the independently frozen recipe and rejects relaxed thresholds under its old hash", () => {
    const f = fixture(); const frozen = fixedTemplateRecipeSha256(f.recipe);
    f.recipe.thresholds.maxProtectedFaceMissingPixels = 10;
    expect(() => run(f, frozen)).toThrow(/independently frozen hash/);
    expect(() => processFixedTemplateEdit({ ...fixture(), expectedRecipeSha256: undefined as unknown as string })).toThrow(/independently frozen hash/);
    expect(() => processFixedTemplateEdit({ ...fixture(), recipe: undefined, expectedRecipeSha256: frozen })).toThrow();
  });

  it("hashes canonical recipe values rather than insertion order", () => {
    const recipe = fixture().recipe;
    expect(fixedTemplateRecipeSha256(Object.fromEntries(Object.entries(recipe).reverse()))).toBe(fixedTemplateRecipeSha256(recipe));
    expect(() => fixedTemplateRecipeSchema.parse({ ...recipe, anatomicalHeadHeight: 100 })).toThrow();
  });
});

describe("fixed template mechanical gates never repair evidence", () => {
  it("rejects protected face holes without filling them", () => {
    const f = fixture(); paint(f.edited.rgba, 14, 11, 1, 1, [90, 120, 150, 0]);
    const result = run(f);
    expect(result.ok).toBe(false);
    expect(result.metrics.protectedFaceMissingPixels).toBe(1);
    expect(codes(result)).toContain("protected_face_missing_alpha");
    expect(nativePixel(result, 14, 11)[3]).toBe(0);
  });

  it("rejects face alpha loss connected to exterior too", () => {
    const f = fixture(); paint(f.edited.rgba, 10, 11, 5, 1, [90, 120, 150, 0]);
    const result = run(f);
    expect(result.metrics.protectedFaceMissingPixels).toBe(3);
    expect(codes(result)).toContain("protected_face_missing_alpha");
    expect(nativePixel(result, 12, 11)[3]).toBe(0);
  });

  it("allows changed hair silhouette inside the editable/allowed region", () => {
    const f = fixture();
    paint(f.edited.rgba, 9, 7, 1, 4, [40, 35, 30, 255]);
    paint(f.edited.rgba, 10, 6, 2, 1, [90, 120, 150, 0]);
    const result = run(f);
    expect(result.ok).toBe(true);
    expect(result.sourceImage.crop.left).toBe(9);
    expect(nativePixel(result, 9, 8)).toEqual([40, 35, 30, 255]);
  });

  it("reports actual boundary changes independently of opaque template content at the boundary", () => {
    const result = run();
    expect(result.metrics.opaqueBoundaryPixels).toBeGreaterThan(0);
    expect(result.metrics.changedBoundaryPixels).toBe(0);
    const f = fixture(); paint(f.edited.rgba, 7, 10, 1, 1, [90, 120, 150, 255]);
    const boundary = run(f);
    expect(boundary.metrics.changedBoundaryPixels).toBe(1);
    expect(codes(boundary)).toContain("edit_touches_mask_boundary");
  });

  it("detects an opaque RGB seam even if the boundary-change count is explicitly relaxed", () => {
    const f = fixture(); f.recipe.thresholds.maxBoundaryChangedPixels = 100;
    paint(f.edited.rgba, 14, 17, 1, 1, [255, 255, 255, 255]);
    const result = run(f);
    expect(result.metrics.maxSeamRgbJumpIncrease).toBe(165);
    expect(result.metrics.maxBoundaryBandOpaqueRgbDelta).toBe(165);
    expect(result.metrics.seamOutlierEdges).toBeGreaterThan(0);
    expect(codes(result)).toContain("boundary_seam_discontinuity");
    expect(codes(result)).not.toContain("edit_touches_mask_boundary");
  });

  it("detects an alpha seam without manufacturing replacement pixels", () => {
    const f = fixture(); paint(f.edited.rgba, 14, 17, 1, 1, [90, 120, 150, 0]);
    const result = run(f);
    expect(result.metrics.maxSeamAlphaJumpIncrease).toBe(255);
    expect(result.metrics.maxBoundaryBandAlphaDelta).toBe(255);
    expect(codes(result)).toContain("boundary_seam_discontinuity");
    expect(nativePixel(result, 14, 17)[3]).toBe(0);
  });

  it("gates discontinuities one pixel inward across the full configured boundary band", () => {
    const f = fixture();
    // y=16 is the second ring; y=17, the exact mask edge, remains unchanged.
    paint(f.edited.rgba, 14, 16, 1, 1, [255, 255, 255, 255]);
    const result = run(f);
    expect(result.metrics.changedBoundaryPixels).toBe(0);
    expect(result.metrics.maxBoundaryBandOpaqueRgbDelta).toBe(165);
    expect(result.metrics.seamOutlierEdges).toBeGreaterThan(0);
    expect(codes(result)).toContain("boundary_seam_discontinuity");
  });

  it("does not let an existing edge in one color channel hide a new seam in another", () => {
    const f = fixture();
    paint(f.template.rgba, 13, 15, 3, 3, [255, 120, 0, 255]);
    paint(f.template.rgba, 14, 16, 1, 1, [0, 120, 0, 255]);
    f.recipe.template.rgbaSha256 = sha256Rgba(f.template.rgba, WIDTH, HEIGHT);
    f.edited.rgba = Buffer.from(f.template.rgba);
    paint(f.edited.rgba, 14, 16, 1, 1, [0, 120, 255, 255]);
    const result = run(f);
    expect(result.metrics.changedBoundaryPixels).toBe(0);
    expect(result.metrics.maxSeamRgbJumpIncrease).toBe(255);
    expect(codes(result)).toContain("boundary_seam_discontinuity");
  });

  it("rejects changed visible pixels outside the allowed head region without resizing them", () => {
    const f = fixture(); paint(f.edited.rgba, 14, 4, 1, 1, [90, 120, 150, 255]);
    f.recipe.templateFrame.allowedHeadRegion = pxBox(10, 6, 10, 10);
    const result = run(f);
    expect(result.metrics.changedPixelsOutsideAllowedHeadRegion).toBe(1);
    expect(codes(result)).toContain("edit_outside_allowed_head_region");
    expect(nativePixel(result, 14, 4)[3]).toBe(255);
  });

  it("does not call invisible RGB changes visible head edits", () => {
    const f = fixture(); paint(f.edited.rgba, 22, 3, 1, 1, [31, 49, 73, 0]);
    expect(run(f).ok).toBe(true);
  });

  it("fails empty, subpixel, or noneditable protected regions", () => {
    const tiny = fixture(); tiny.recipe.templateFrame.protectedFacePolygon = pxBox(12, 9, 0.1, 0.1);
    expect(codes(run(tiny))).toContain("empty_protected_face_region");
    const outside = fixture(); outside.recipe.templateFrame.protectedFacePolygon = pxBox(12, 19, 2, 2);
    expect(codes(run(outside))).toContain("face_outside_editable_mask");
    const empty = fixture(); empty.editableMask.data.fill(0); empty.recipe.editableMask.sha256 = sha256TemplateMask(empty.editableMask);
    expect(codes(run(empty))).toContain("empty_editable_mask");
  });

  it("holds unchanged output rather than claiming a new identity was generated", () => {
    const f = fixture(); f.edited.rgba = Buffer.from(f.template.rgba);
    expect(codes(run(f))).toContain("insufficient_visible_edit");
  });

  it("rejects true frame clipping already in the template, without silently dropping it", () => {
    const f = fixture(); paint(f.template.rgba, 12, 39, 1, 1, [90, 120, 150, 255]);
    f.recipe.template.rgbaSha256 = sha256Rgba(f.template.rgba, WIDTH, HEIGHT);
    const result = run(f);
    expect(codes(result)).toContain("template_frame_contact");
    expect(nativePixel(result, 12, 39)[3]).toBe(255);
  });
});

describe("fixed template native geometry and manifest", () => {
  it("anchors the authored template seat, not feet, head height, or the changing crop bounds", () => {
    const f = fixture(); const first = run(f);
    paint(f.edited.rgba, 9, 7, 1, 4, [40, 35, 30, 255]);
    const changedHair = run(f);
    expect(changedHair.transform).toEqual(first.transform);
    expect(changedHair.transform.translateX + f.recipe.templateFrame.seatContact.x * WIDTH * changedHair.transform.scale).toBeCloseTo(100);
    expect(changedHair.transform.translateY + f.recipe.templateFrame.seatContact.y * HEIGHT * changedHair.transform.scale).toBeCloseTo(130);
    for (const result of [first, changedHair]) {
      expect(result.sourceImage.transform.translateX).toBeCloseTo(result.transform.translateX + result.sourceImage.crop.left * result.transform.scale);
      expect(result.sourceImage.transform.translateY).toBeCloseTo(result.transform.translateY + result.sourceImage.crop.top * result.transform.scale);
      expect(result.sourceImage.transform.scale).toBe(0.5);
    }
  });

  it("keeps native crop pixels and dimensions while the preview is board resolution", () => {
    const f = fixture(); const result = run(f);
    expect(result.sourceImage.width).toBe(10);
    expect(result.sourceImage.height).toBe(30);
    expect(result.composite.height).toBeLessThan(result.sourceImage.height);
    expect(result.composite.purpose).toBe("board-resolution-qa-preview-only");
    for (let y = 0; y < result.sourceImage.height; y++) for (let x = 0; x < result.sourceImage.width; x++) {
      const source = result.sourceImage;
      const frameIndex = ((source.crop.top + y) * WIDTH + source.crop.left + x) * 4;
      expect(source.rgba.subarray((y * source.width + x) * 4, (y * source.width + x) * 4 + 4)).toEqual(result.restored.rgba.subarray(frameIndex, frameIndex + 4));
    }
  });

  it("fails out-of-board geometry rather than shrinking or moving the template", () => {
    const f = fixture(); f.recipe.placement.destinationSeat = { x: 0, y: 0 };
    const result = run(f);
    expect(result.ok).toBe(false);
    expect(result.transform.scale).toBe(0.5);
    expect(result.metrics.nativeOutsideBoardPixels).toBeGreaterThan(0);
    expect(codes(result)).toContain("outside_board");
  });

  it("records frame semantics, all thresholds and image hashes without serializing RGBA arrays", () => {
    const result = run(); const manifest = fixedTemplateManifest(result);
    expect(manifest.version).toBe("fixed-template-manifest/v1");
    expect(manifest.recipe.templateFrame.kind).toBe("authored-template-frame");
    expect(manifest.thresholds).toEqual(result.recipe.thresholds);
    expect(manifest.sourceImage.resolution).toBe("native-restored");
    expect(manifest.sourceImage.rgbaSha256).toBe(sha256Rgba(result.sourceImage.rgba, result.sourceImage.width, result.sourceImage.height));
    expect(manifest.fullFrame.rgbaSha256).toBe(sha256Rgba(result.restored.rgba, WIDTH, HEIGHT));
    expect(manifest.sourceImage).not.toHaveProperty("rgba");
    expect(manifest.composite).not.toHaveProperty("rgba");
    expect(manifest.automaticRelease).toBe(false);
    expect(manifest.semanticStatus).toBe("pending");
  });
});
