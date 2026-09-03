import type { SceneConfig } from "@/domain/game/config";
import { spriteAspect, targetGeometry } from "../engine/target-geometry";
import { Sprite } from "./Sprite";

/**
 * Non-interactive render of a scene with all three targets at one variant.
 * Used by admin QA and the scene authoring preview. Percent positioning
 * keeps it exact at any size because the box has the art's aspect ratio.
 */
export function StaticScenePreview({ scene, variant, showZones = false, labels = true }: { scene: SceneConfig; variant: "A" | "B"; showZones?: boolean; labels?: boolean }) {
  const items = scene.targets.map((t) => ({ t, ...targetGeometry(scene, t, variant) }));
  const render = (layer: "front" | "behindForeground") =>
    items
      .filter((i) => (i.slot.layer ?? "front") === layer)
      .map(({ t, slot, sprite, anchor, isPatch }) => {
        const rect = sprite.kind === "image" ? sprite.rect : undefined;
        // A slot patch is a piece of the world painted with the child: draw it exactly where it was cut from (same as SceneViewport).
        const box: React.CSSProperties = isPatch && rect
          ? { left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%`, zIndex: slot.zIndex, transform: slot.flip ? "scaleX(-1)" : "none" }
          : { left: `${anchor.x * 100}%`, top: `${anchor.y * 100}%`, height: `${anchor.scale * 100}%`, aspectRatio: String(spriteAspect(sprite)), zIndex: slot.zIndex, transform: `translate(-50%, -50%) rotate(${slot.rotation}deg)${slot.flip ? " scaleX(-1)" : ""}` };
        return (
          <div key={t.id} className="scene-preview__sprite" style={box}>
            <Sprite sprite={sprite} className="stage__sprite" title={t.item} />
          </div>
        );
      });

  return (
    <div className="scene-preview" style={{ aspectRatio: `${scene.art.width} / ${scene.art.height}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={scene.art.base} alt="" className="scene-preview__layer" />
      {render("behindForeground")}
      {scene.art.foreground ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={scene.art.foreground} alt="" className="scene-preview__layer" style={{ zIndex: 20 }} />
      ) : null}
      {render("front")}
      {showZones
        ? items.map(({ t, slot }) => (
            <div key={`${t.id}-zone`} className="scene-preview__zone" style={{ left: `${slot.hintZone.x * 100}%`, top: `${slot.hintZone.y * 100}%`, width: `${slot.hintZone.r * 200}%`, aspectRatio: "1", zIndex: 30 }} />
          ))
        : null}
      {/* QA: the box a child actually taps, and the point the bubble hangs from. */}
      {showZones
        ? items.map(({ t, hitRect, head }) => (
            <div key={`${t.id}-hit`} className="scene-preview__hit" style={{ left: `${hitRect.x0 * 100}%`, top: `${hitRect.y0 * 100}%`, width: `${(hitRect.x1 - hitRect.x0) * 100}%`, height: `${(hitRect.y1 - hitRect.y0) * 100}%`, zIndex: 32 }}>
              <span className="scene-preview__head" style={{ left: `${((head.x - hitRect.x0) / (hitRect.x1 - hitRect.x0)) * 100}%`, top: `${((head.y - hitRect.y0) / (hitRect.y1 - hitRect.y0)) * 100}%` }} />
            </div>
          ))
        : null}
      {labels
        ? items.map(({ t, anchor }) => (
            <span key={`${t.id}-label`} className="scene-preview__label" style={{ left: `${anchor.x * 100}%`, top: `calc(${(anchor.y + anchor.scale / 2) * 100}% + 4px)`, zIndex: 33 }}>
              {t.item} · {variant}
            </span>
          ))
        : null}
      {scene.bonus ? (
        <div className="scene-preview__sprite" style={{ left: `${(variant === "A" ? scene.bonus.slots[0] : scene.bonus.slots[1]).x * 100}%`, top: `${(variant === "A" ? scene.bonus.slots[0] : scene.bonus.slots[1]).y * 100}%`, height: `${scene.bonus.scale * 100}%`, aspectRatio: "1", zIndex: 25 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={scene.bonus.sprite} alt={scene.bonus.name} />
        </div>
      ) : null}
    </div>
  );
}
