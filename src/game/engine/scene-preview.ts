import type { SceneConfig, TargetConfig } from "@/domain/game/config";
import { targetGeometry } from "./target-geometry";

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** A zoomed excerpt of the SAME board, not a larger child pasted onto it.
 * Draw rect and head share the game's normalized coordinate contract.
 */
export function scenePreview(scene: SceneConfig, target: TargetConfig, aspect = 4 / 5) {
  const geometry = targetGeometry(scene, target, "A");
  if (geometry.sprite.kind !== "image" || !geometry.sprite.rect) return null;
  const { width, height } = scene.art;
  const cropH = Math.min(height, width / aspect, Math.max(height * 0.48, (geometry.hitRect.y1 - geometry.hitRect.y0) * height * 4.5));
  const cropW = cropH * aspect;
  const x = clamp(geometry.center.x * width - cropW / 2, 0, width - cropW);
  const y = clamp(geometry.center.y * height - cropH / 2, 0, height - cropH);
  const placement = (r: { x: number; y: number; w: number; h: number }) => ({
    left: `${(r.x * width - x) / cropW * 100}%`, top: `${(r.y * height - y) / cropH * 100}%`,
    width: `${r.w * width / cropW * 100}%`, height: `${r.h * height / cropH * 100}%`,
  });
  return {
    sprite: geometry.sprite,
    baseStyle: placement({ x: 0, y: 0, w: 1, h: 1 }),
    patchStyle: placement(geometry.sprite.rect),
    bubbleStyle: { left: `${(geometry.head.x * width - x) / cropW * 100}%`, top: `${(geometry.head.y * height - y) / cropH * 100}%` },
    frame: { x, y, width: cropW, height: cropH },
  };
}
