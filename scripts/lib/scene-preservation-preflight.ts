/** Offline authoring diagnostic only. No image, provider, ledger or runtime imports.
 * Regions are HUMAN annotations, not detected objects. Passing this geometry
 * check is neither visual acceptance nor permission to render/publish. */
export type PixelRect = Readonly<{ left: number; top: number; width: number; height: number }>;
export type SceneRegion = Readonly<{ id: string; rect: PixelRect; protectPixels: boolean }>;

const right = (r: PixelRect) => r.left + r.width;
const bottom = (r: PixelRect) => r.top + r.height;
const contains = (a: PixelRect, b: PixelRect) => a.left <= b.left && a.top <= b.top && right(a) >= right(b) && bottom(a) >= bottom(b);
const intersects = (a: PixelRect, b: PixelRect) => a.left < right(b) && b.left < right(a) && a.top < bottom(b) && b.top < bottom(a);

function validRect(r: PixelRect) {
  return [r.left, r.top, r.width, r.height, right(r), bottom(r)].every(Number.isSafeInteger)
    && r.left >= 0 && r.top >= 0 && r.width > 0 && r.height > 0;
}

/** All coordinates are BOARD pixels, half-open rectangles. The editable box is
 * the actual composition permission, not just prose sent to the provider. */
export function inspectScenePreservation(input: {
  board: Readonly<{ width: number; height: number }>;
  crop: PixelRect;
  editable: PixelRect;
  regions: readonly SceneRegion[];
}) {
  const board = { left: 0, top: 0, ...input.board };
  if (!validRect(board) || !validRect(input.crop) || !contains(board, input.crop)
    || !validRect(input.editable) || !contains(input.crop, input.editable)) {
    throw Error("Scene preflight requires bounded integer board/crop/edit rectangles");
  }
  if (!input.regions.length || new Set(input.regions.map(r => r.id)).size !== input.regions.length
    || input.regions.some(r => !r.id.trim() || typeof r.protectPixels !== "boolean" || !validRect(r.rect) || !contains(board, r.rect))) {
    throw Error("Scene preflight requires nonempty, unique, bounded human annotations");
  }
  const issues: { regionId: string; code: "context-clips-region" | "context-misses-region" | "edit-touches-protected-region" }[] = [];
  for (const region of input.regions) {
    if (!contains(input.crop, region.rect)) issues.push({ regionId: region.id,
      code: intersects(input.crop, region.rect) ? "context-clips-region" : "context-misses-region" });
    if (region.protectPixels && intersects(input.editable, region.rect)) {
      issues.push({ regionId: region.id, code: "edit-touches-protected-region" });
    }
  }
  // Can relocation alone accommodate the current editable extent AND all
  // annotated context? This does not propose a new provider crop or scale.
  const required = [input.editable, ...input.regions.map(r => r.rect)];
  const left = Math.min(...required.map(r => r.left)), top = Math.min(...required.map(r => r.top));
  const requiredContext = { left, top, width: Math.max(...required.map(right)) - left, height: Math.max(...required.map(bottom)) - top };
  return {
    geometryClear: issues.length === 0,
    issues,
    requiredContext,
    fitsExistingCropSize: requiredContext.width <= input.crop.width && requiredContext.height <= input.crop.height,
    visualAcceptance: "not-assessed" as const,
  };
}
