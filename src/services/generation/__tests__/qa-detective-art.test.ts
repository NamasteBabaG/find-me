import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { DETECTIVE_SCENES } from "../../../../content/scenes";
import { composeScene } from "@/domain/game/compose";
import { GameConfigSchema, type GameConfig } from "@/domain/game/config";
import { targetGeometry } from "@/game/engine/target-geometry";
import { QA_WIZARD_MOCK_STYLE } from "@/domain/generation/qa-wizard-mock";
import { applyQaDetectiveArt } from "../qa-detective-art";

function savedGame(): GameConfig {
  const child = { name: "Demo", avatarUrl: "/demo/maya-face.svg" };
  return {
    version: 1, gameId: "qa-fixture-test", child, locale: "en", styleVersion: QA_WIZARD_MOCK_STYLE,
    packageTier: "ONE_WORLD", composedAt: "2026-01-01T00:00:00.000Z",
    scenes: DETECTIVE_SCENES.map(scene => ({
      ...composeScene(scene, child, scene.targets.map(target => ({
        targetId: target.id, sprite: { kind: "composed", faceUrl: child.avatarUrl, bodyTemplate: target.bodyTemplate },
      })), "en"),
      worldSlug: "journey", playMode: "find-any", appearancesPerBoard: 3, findsRequiredToAdvance: 3,
    })),
  };
}

describe("public art in the mock Detective Wizard", () => {
  it("keeps the 27 saved IDs and gives each a public portrait and source-aligned hit area", () => {
    const old = savedGame();
    const game = GameConfigSchema.parse(applyQaDetectiveArt(old));
    expect(game.scenes).toHaveLength(9);
    for (const [i, scene] of game.scenes.entries()) {
      expect(scene.targets.map(target => target.id)).toEqual(old.scenes[i]!.targets.map(target => target.id));
      expect(scene.targets).toHaveLength(3);
      for (const target of scene.targets) {
        expect(target.qaPortraitUrl).toBe(`/demo/qa-detectives-v1/${scene.slug}-${target.id}-head.webp`);
        for (const variant of ["A", "B"] as const) {
          const geometry = targetGeometry(scene, target, variant);
          expect(geometry.isPatch).toBe(true);
          expect(geometry.head.x).toBeGreaterThan(geometry.hitRect.x0);
          expect(geometry.head.x).toBeLessThan(geometry.hitRect.x1);
          expect(geometry.head.y).toBeGreaterThanOrEqual(geometry.hitRect.y0);
          expect(geometry.head.y).toBeLessThan(geometry.hitRect.y1);
        }
      }
    }
    expect(applyQaDetectiveArt(game)).toEqual(game);
  });

  it("does not transform paid art or different source boards", () => {
    const game = savedGame();
    const paid = { ...game, styleVersion: "local-patch-world-v1" };
    expect(applyQaDetectiveArt(paid)).toBe(paid);
    game.scenes[0]!.art = { ...game.scenes[0]!.art, base: "/scenes/new-source.webp" };
    expect(applyQaDetectiveArt(game).scenes[0]!.targets.every(target => target.sprite.kind === "composed")).toBe(true);
  });

  it("draws the exact public pixels at the registered New York position", async () => {
    const scene = applyQaDetectiveArt(savedGame()).scenes.find(board => board.slug === "newyork")!;
    const sprite = scene.targets.find(target => target.id === "hide-1")!.sprite;
    if (sprite.kind !== "image" || !sprite.rect) throw Error("Missing New York source art");
    const original = await readFile(join("public", scene.art.base));
    const crop = await sharp(original).extract({
      left: Math.round(sprite.rect.x * scene.art.width), top: Math.round(sprite.rect.y * scene.art.height),
      width: sprite.width, height: sprite.height,
    }).removeAlpha().raw().toBuffer();
    const stamped = await sharp(join("public", sprite.url)).removeAlpha().raw().toBuffer();
    expect(stamped.equals(crop)).toBe(true);
  });
});
