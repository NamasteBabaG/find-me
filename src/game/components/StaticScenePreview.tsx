import type { SceneConfig } from "@/domain/game/config";
import { Sprite, spriteAspect } from "./Sprite";

/**
 * Non-interactive render of a scene with all three targets at one variant.
 * Used by admin QA and the scene authoring preview. Percent positioning
 * keeps it exact at any size because the box has the art's aspect ratio.
 */
export function StaticScenePreview({ scene, variant, showZones = false, labels = true }: { scene: SceneConfig; variant: "A" | "B"; showZones?: boolean; labels?: boolean }) {
  const items = scene.targets.map((t) => {
    const slot = variant === "A" ? t.slots[0] : t.slots[1];
    const adj = t.adjust ?? { dx: 0, dy: 0, scale: 1 };
    return { t, slot, x: slot.x + adj.dx, y: slot.y + adj.dy, scale: slot.scale * adj.scale };
  });
  const render = (layer: "front" | "behindForeground") =>
    items
      .filter((i) => (i.slot.layer ?? "front") === layer)
      .map(({ t, slot, x, y, scale }) => (
        <div key={t.id} className="scene-preview__sprite" style={{ left: `${x * 100}%`, top: `${y * 100}%`, height: `${scale * 100}%`, aspectRatio: String(spriteAspect(t.sprite)), zIndex: slot.zIndex, transform: `translate(-50%, -50%) rotate(${slot.rotation}deg)${slot.flip ? " scaleX(-1)" : ""}` }}>
          <Sprite sprite={t.sprite} className="stage__sprite" title={t.item} />
        </div>
      ));

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
      {labels
        ? items.map(({ t, x, y, scale }) => (
            <span key={`${t.id}-label`} className="scene-preview__label" style={{ left: `${x * 100}%`, top: `calc(${(y + scale / 2) * 100}% + 4px)`, zIndex: 31 }}>
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
