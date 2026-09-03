import type { SpriteRef } from "@/domain/game/config";
import { ComposedSprite } from "./ComposedSprite";

/** Renders either a procedural composed sprite or a generated image sprite. */
export function Sprite({ sprite, className, title }: { sprite: SpriteRef; className?: string; title?: string }) {
  if (sprite.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={sprite.url} alt={title ?? ""} className={className} draggable={false} width={sprite.width} height={sprite.height} />;
  }
  return <ComposedSprite faceUrl={sprite.faceUrl} bodyTemplate={sprite.bodyTemplate} className={className} title={title} />;
}
