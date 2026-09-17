"use client";

import type { GameConfig } from "@/domain/game/config";
import type { AdventureProgress } from "@/domain/adventure/progress";
import type { CSSProperties } from "react";
import { passportPhoto, passportPhotoCrop } from "@/domain/passport/passport";
import { AlbumCrop } from "./Album";

/** Guest rendering uses pixels already authorized for this player, no image API. */
export function PassportMemory({ config, progress, boardSlug, targetId, label }: { config: GameConfig; progress: AdventureProgress; boardSlug: string; targetId: string; label: string }) {
  const scene = config.scenes.find(s => s.slug === boardSlug);
  const board = config.adventure?.boards.find(b => b.boardSlug === boardSlug);
  const photo = passportPhoto(progress, boardSlug, targetId);
  if (!scene || !board || !photo || photo.targetId !== targetId) return null;
  const target = scene.targets.find(t => t.id === photo.targetId);
  const binding = board.targetImages.find(t => t.targetId === photo.targetId)?.[photo.variant];
  const sprite = target?.spriteByVariant?.[photo.variant] ?? target?.sprite;
  if (!binding || sprite?.kind !== "image" || !sprite.rect) return null;
  const crop = passportPhotoCrop(binding.hitRect, scene.art), rect = sprite.rect;
  return <div className="passport-memory-fit" style={{ "--memory-aspect": crop.w * scene.art.width / (crop.h * scene.art.height) } as CSSProperties}><AlbumCrop art={scene.art} crop={crop} label={label} className="passport-memory"><img src={sprite.url} alt="" draggable={false} style={{ position: "absolute", maxWidth: "none", left: `${(rect.x - crop.x) / crop.w * 100}%`, top: `${(rect.y - crop.y) / crop.h * 100}%`, width: `${rect.w / crop.w * 100}%`, height: `${rect.h / crop.h * 100}%` }} /></AlbumCrop></div>;
}
