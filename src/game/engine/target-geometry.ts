import type { SceneConfig, SpriteRef, TargetConfig } from "@/domain/game/config";
import type { SlotVariant } from "@/domain/game/replay";
import { spriteRect, type NormRect, type Size } from "./viewport-math";

/**
 * One source of truth for where a target is drawn, where it can be tapped and
 * where its head is.
 *
 * This exists because those three used to be computed separately: a slot patch
 * is drawn at its own rect (it is a piece of the world), while hit-testing and
 * speech bubbles still used the slot the patch was generated at. The patch is
 * taller than the slot and sits higher, so the visible head — exactly what the
 * mission asks the child to find — was outside the tap area.
 */

/** Aspect (w/h) of the child's footprint. A slot patch hides a child of roughly 3:4. */
export function spriteAspect(sprite: SpriteRef): number {
  if (sprite.kind === "image") return sprite.rect ? 0.75 : sprite.width / sprite.height;
  return 100 / 140;
}

/** The sprite this variant draws (a patch belongs to one hiding spot). */
export function spriteFor(target: TargetConfig, variant: SlotVariant): SpriteRef {
  return target.spriteByVariant?.[variant] ?? target.sprite;
}

/** The slot-patch fields of a sprite, when it is one. */
export function patchOf(sprite: SpriteRef) {
  if (sprite.kind !== "image" || !sprite.rect) return null;
  return { rect: sprite.rect, hitRect: sprite.hitRect ?? sprite.rect, anchor: sprite.anchor };
}

export interface TargetGeometry {
  slot: TargetConfig["slots"][number];
  sprite: SpriteRef;
  /** Centre + height of the drawing, for the non-patch path. Normalized. */
  anchor: { x: number; y: number; scale: number };
  /** Where the child can be tapped (before finger padding). Normalized. */
  hitRect: NormRect;
  /** Where bubbles hang from. Normalized. */
  head: { x: number; y: number };
  /** Middle of the tap area — where the camera centres after a find. Normalized. */
  center: { x: number; y: number };
  /**
   * Where the level-2 glow and the level-3 zoom point.
   *
   * The authored zone is the level designer's intent for the slot, but the image
   * model places the painted child where it likes inside the window — sometimes
   * just outside that circle. A hint that glows next to her is worse than none,
   * so a patch keeps the authored radius and moves the centre onto the child.
   */
  hintZone: { x: number; y: number; r: number };
  isPatch: boolean;
}

function middle(r: NormRect): { x: number; y: number } {
  return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
}

export function targetGeometry(scene: SceneConfig, target: TargetConfig, variant: SlotVariant): TargetGeometry {
  const slot = (variant === "A" ? target.slots[0] : target.slots[1]) ?? target.slots[0];
  const adj = target.adjust ?? { dx: 0, dy: 0, scale: 1 };
  const anchor = { x: slot.x + adj.dx, y: slot.y + adj.dy, scale: slot.scale * adj.scale };
  const sprite = spriteFor(target, variant);
  const patch = patchOf(sprite);
  if (patch) {
    const r = patch.hitRect;
    const hitRect: NormRect = { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h };
    const center = middle(hitRect);
    return {
      slot,
      sprite,
      anchor,
      hitRect,
      head: patch.anchor ?? { x: r.x + r.w / 2, y: r.y },
      center,
      hintZone: { x: center.x, y: center.y, r: slot.hintZone.r },
      isPatch: true,
    };
  }
  const stage: Size = { width: scene.art.width, height: scene.art.height };
  const hitRect = spriteRect(anchor, stage, spriteAspect(sprite));
  return { slot, sprite, anchor, hitRect, head: { x: anchor.x, y: anchor.y }, center: { x: anchor.x, y: anchor.y }, hintZone: slot.hintZone, isPatch: false };
}
