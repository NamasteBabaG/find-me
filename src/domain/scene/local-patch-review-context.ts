import type { PatchRectangle } from "./local-patch-return-region";

/** Native source context for annotated neighbors. Existing v12 questions keep
 * exactly their 192 px window; the new family may expand it to contain every
 * registered source head. No pixels outside the actual source are invented. */
export function sourceNeighborReviewContext(crop: PatchRectangle, source: { width: number; height: number },
  heads: readonly PatchRectangle[], sceneVersion: number): PatchRectangle {
  const padding = sceneVersion === 13 ? Math.max(192, ...heads.flatMap(head => [
    crop.left - head.left, crop.top - head.top,
    head.left + head.width - crop.left - crop.width, head.top + head.height - crop.top - crop.height,
  ])) : 192;
  const left = Math.max(0, crop.left - padding), top = Math.max(0, crop.top - padding);
  return { left, top, width: Math.min(source.width, crop.left + crop.width + padding) - left,
    height: Math.min(source.height, crop.top + crop.height + padding) - top };
}
