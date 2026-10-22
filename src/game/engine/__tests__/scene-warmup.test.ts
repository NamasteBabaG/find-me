import { describe, expect, it } from "vitest";
import { buildDemoConfig } from "@/services/demo";
import { emptyProgress, sceneProgress } from "@/domain/game/progress";
import { planScenePlay } from "@/domain/game/replay";
import { sceneWarmupUrls } from "../scene-warmup";

describe("scene entry image speculation", () => {
  it("uses the verified display base and the first variant the player will select", () => {
    const config = buildDemoConfig("en"), scene = config.scenes[0]!, progress = emptyProgress(config.gameId);
    const plan = planScenePlay(scene, sceneProgress(progress, scene.slug), config.gameId);
    const first = scene.targets.find(target => target.id === plan.order[0])!;
    const sprite = first.spriteByVariant?.[plan.variants[first.id]!] ?? first.sprite;
    expect(sceneWarmupUrls(scene, progress, config.gameId, "/scenes/display-bound.webp")).toEqual([
      "/scenes/display-bound.webp", sprite.kind === "image" ? sprite.url : sprite.faceUrl,
    ]);
  });

  it("resumes the saved layout past found targets without mutating progress", () => {
    const config = buildDemoConfig("en"), original = config.scenes[0]!;
    const scene = { ...original, playMode: "find-any" as const };
    const ids = [...scene.targets].reverse().map(target => target.id);
    const progress = emptyProgress(config.gameId);
    progress.scenes[scene.slug] = { plays: 0, completed: false, collectible: false, noHintClear: false, bonusFound: false,
      sceneVersion: scene.version, foundTargetIds: [ids[0]!], lastOrder: ids,
      lastVariants: Object.fromEntries(ids.map(id => [id, "B" as const])) };
    const before = JSON.stringify(progress), first = scene.targets.find(target => target.id === ids[1])!;
    const sprite = first.spriteByVariant?.B ?? first.sprite;
    expect(sceneWarmupUrls(scene, progress, config.gameId, "/display.webp")).toEqual(["/display.webp", sprite.kind === "image" ? sprite.url : sprite.faceUrl]);
    expect(JSON.stringify(progress)).toBe(before);
  });
});
