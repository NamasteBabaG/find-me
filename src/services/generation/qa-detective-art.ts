import type { ArtRect, GameConfig, SceneConfig } from "@/domain/game/config";
import { QA_WIZARD_MOCK_STYLE } from "@/domain/generation/qa-wizard-mock";
import { DETECTIVES_SCENE_VERSION } from "@/domain/scene/local-patch-versions";
import { getDict, tf } from "@/i18n";
import fixtures from "../../../content/demo/qa-detective-art-v1.json";

type PixelRect = (typeof fixtures)[number]["rect"];

function normalized(rect: PixelRect, scene: SceneConfig): ArtRect {
  const { width, height } = scene.art;
  return { x: rect.left / width, y: rect.top / height, w: rect.width / width, h: rect.height / height };
}

/**
 * The zero-provider Detective test searches for the actors already painted
 * into the public boards. Keep the published scene order and target IDs so old
 * QA play links and progress use the same layout. Paid configs never enter.
 */
export function applyQaDetectiveArt(game: GameConfig): GameConfig {
  if (game.styleVersion !== QA_WIZARD_MOCK_STYLE) return game;
  const copy = getDict(game.locale).game.scene;
  const scenes = game.scenes.map(scene => {
    if (scene.version !== DETECTIVES_SCENE_VERSION || scene.worldSlug !== "journey") return scene;
    const targets = scene.targets.map(target => {
      const fixture = fixtures.find(row => row.board === scene.slug && row.art === scene.art.base && row.targetId === target.id);
      if (!fixture || target.qaPortraitUrl) return target;
      const rect = normalized(fixture.rect, scene);
      const head = normalized(fixture.head, scene);
      const stem = `/demo/qa-detectives-v1/${scene.slug}-${target.id}`;
      const item = copy.qaDetectivePortrait;
      return {
        ...target,
        item,
        mission: copy.qaDetectiveFind,
        qaPortraitUrl: `${stem}-head.webp`,
        sprite: { kind: "image" as const, url: `${stem}.webp`, width: fixture.rect.width, height: fixture.rect.height,
          rect, hitRect: rect, anchor: { x: head.x + head.w / 2, y: head.y } },
        spriteByVariant: undefined,
        adjust: undefined,
      };
    });
    const completeText = tf(copy.qaDetectiveBoardComplete, { n: targets.length });
    return { ...scene, targets, celebration: { ...scene.celebration, completeText } };
  });
  return { ...game, scenes };
}
