/** All rectangles are native pixels. `local` is crop-relative, `region` board-relative. */
export type PatchRectangle = { left: number; top: number; width: number; height: number };
export const LOCAL_PATCH_RETURN_GUARD = 120;
export const LOCAL_PATCH_RETURN_FEATHER = 12;
export const LOCAL_PATCH_COMPOSITION_VERSION = "bounded-return/v3-head-safe-axis";
export const AUTHORED_PATCH_COMPOSITION_VERSION = "bounded-return/v4-authored-source-boundaries";
export type LocalPatchCompositionVersion = typeof LOCAL_PATCH_COMPOSITION_VERSION | typeof AUTHORED_PATCH_COMPOSITION_VERSION;

const valid = (r: PatchRectangle) => [r.left, r.top, r.width, r.height].every(Number.isInteger)
  && r.left >= 0 && r.top >= 0 && r.width > 0 && r.height > 0;

/** Preserve the historical guard exactly unless an author explicitly supplies a window.
 * Validate before purchasing, and reuse the same rectangle for composition and evidence.
 * This is a geometric contract, not an anatomy or visual-acceptance check.
 */
export function localPatchReturnRegion(crop: PatchRectangle, child: PatchRectangle, authored?: PatchRectangle) {
  if (!valid(crop) || !valid(child) || child.left + child.width > crop.width || child.top + child.height > crop.height) {
    throw new Error("LOCAL_PATCH: invalid declared child box");
  }
  const left = Math.max(0, child.left - LOCAL_PATCH_RETURN_GUARD);
  const top = Math.max(0, child.top - LOCAL_PATCH_RETURN_GUARD);
  const local = authored ?? { left, top,
    width: Math.min(crop.width, child.left + child.width + LOCAL_PATCH_RETURN_GUARD) - left,
    height: Math.min(crop.height, child.top + child.height + LOCAL_PATCH_RETURN_GUARD) - top };
  if (!valid(local) || local.left + local.width > crop.width || local.top + local.height > crop.height) {
    throw new Error("LOCAL_PATCH: invalid authored return window");
  }
  if (Math.min(child.left - local.left, child.top - local.top,
    local.left + local.width - child.left - child.width,
    local.top + local.height - child.top - child.height) < LOCAL_PATCH_RETURN_FEATHER) {
    throw new Error("LOCAL_PATCH: declared child box has no safe seam margin");
  }
  return { local: { ...local }, region: { ...local, left: crop.left + local.left, top: crop.top + local.top },
    compositionVersion: authored ? AUTHORED_PATCH_COMPOSITION_VERSION : LOCAL_PATCH_COMPOSITION_VERSION };
}

/** The source, authored child envelope and actual return are one immutable v4
 * contract. Historical v3 receipts do not carry it. Pixels are still unreviewed;
 * a valid contract cannot supply an anatomy or visual verdict. */
export function authoredLocalPatchReturnContract(input: {
  contentVersion: number; boardId: string; hideId: string;
  source: { art: string; sha256: string; width: number; height: number };
  crop: PatchRectangle; child: PatchRectangle; authored: PatchRectangle;
  sourcePlacement?: { manifestSha256: string; basePlacementSha256: string };
}) {
  const { source, crop } = input;
  if (![12, 13].includes(input.contentVersion) || input.contentVersion === 13 && !input.sourcePlacement || !input.boardId || !input.hideId
    || !source.art.startsWith("public/scenes/") || !/^[a-f0-9]{64}$/.test(source.sha256)
    || !Number.isSafeInteger(source.width) || !Number.isSafeInteger(source.height)
    || source.width < 1 || source.height < 1 || crop.left + crop.width > source.width
    || crop.top + crop.height > source.height)
    throw Error("LOCAL_PATCH: authored return requires its pinned integrated-family source geometry");
  if (input.sourcePlacement && (Object.keys(input.sourcePlacement).sort().join(",") !== "basePlacementSha256,manifestSha256"
    || ![input.sourcePlacement.manifestSha256, input.sourcePlacement.basePlacementSha256].every(v => /^[a-f0-9]{64}$/.test(v))))
    throw Error("LOCAL_PATCH: invalid immutable source-placement binding");
  const returned = localPatchReturnRegion(crop, input.child, input.authored);
  return { version: AUTHORED_PATCH_COMPOSITION_VERSION, contentVersion: input.contentVersion as 12 | 13,
    boardId: input.boardId, hideId: input.hideId, source: { ...source }, crop: { ...crop },
    child: { ...input.child }, local: returned.local, region: returned.region,
    ...(input.sourcePlacement ? { sourcePlacement: { manifestSha256: input.sourcePlacement.manifestSha256, basePlacementSha256: input.sourcePlacement.basePlacementSha256 } } : {}) };
}
export type AuthoredLocalPatchReturnContract = ReturnType<typeof authoredLocalPatchReturnContract>;

export function rectanglesIntersect(a: PatchRectangle, b: PatchRectangle): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width
    && a.top < b.top + b.height && b.top < a.top + a.height;
}

/** A source head must lie entirely outside the return, or inside its opaque interior.
 * Callers supply source-hash-bound annotations; this does not detect unannotated heads
 * or prove that a generated body joins correctly. Complete removals remain allowed.
 */
export function sourceHeadIntersectsReturnBoundary(region: PatchRectangle, head: PatchRectangle): boolean {
  if (!valid(region) || !valid(head)) throw new Error("LOCAL_PATCH: invalid source head geometry");
  if (!rectanglesIntersect(region, head)) return false;
  return head.left < region.left + LOCAL_PATCH_RETURN_FEATHER || head.top < region.top + LOCAL_PATCH_RETURN_FEATHER
    || head.left + head.width > region.left + region.width - LOCAL_PATCH_RETURN_FEATHER
    || head.top + head.height > region.top + region.height - LOCAL_PATCH_RETURN_FEATHER;
}

export type { AuthoredLocalPatchRecoveryContract } from "./local-patch-authored-recovery";
