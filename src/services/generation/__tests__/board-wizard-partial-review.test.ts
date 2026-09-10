import { describe, expect, it } from "vitest";
import { findScene } from "../../../../content/scenes";
import journey from "../../../../content/worlds/journey/world.json";
import { composeScene } from "../../../domain/game/compose";
import { GameConfigSchema } from "../../../domain/game/config";
import { composePartialBoardWizardReview, type PartialWizardReviewRecord } from "../board-wizard-partial-review";

export function partialReviewFixture() {
  const gameId = "synthetic-partial", ownerId = "owner";
  const boards = journey.nodes.map((n, i) => ({ boardId: n.boardSlug, state: i < 5 ? "geometry-ok" : "needs-repair",
    assetIds: [0, 1, 2, 3].map(j => `${n.boardSlug}-${j}`), playerBindingSha256: "a".repeat(64),
    visual: [1, 2, 3].map(j => ({ patchAssetId: `${n.boardSlug}-${j}` })) }));
  const record: PartialWizardReviewRecord = { gameId, ownerId, state: "review-required", automaticRelease: false,
    childName: "Synthetic", avatarAssetId: "avatar", boards };
  const scenes = boards.map((b, i) => {
    const def = findScene(b.boardId)!;
    const scene = composeScene(def, { name: "Synthetic", avatarUrl: "/api/assets/avatar" }, def.targets.map((t, j) => ({
      targetId: t.id, sprite: { kind: "image" as const, url: `/api/assets/${b.boardId}-${j + 1}`, width: 100, height: 100 },
    })), "he");
    scene.art = { ...scene.art, base: `/api/assets/${b.boardId}-0`, thumbnail: `/api/assets/${b.boardId}-0` };
    delete scene.art.foreground;
    scene.worldSlug = "journey";
    return { gameId, sceneSlug: b.boardId, sceneVersion: def.version, orderIndex: i, generationStatus: "GENERATED", configJson: JSON.stringify(scene) };
  });
  return { gameId, ownerId, locale: "he", styleVersion: "fixed-sprite-board-wizard-v1", record, scenes, composedAt: new Date("2026-09-10T00:00:00.000Z") };
}

describe("read-only retained partial QA game", () => {
  it("delivers 5 existing boards/15 image targets in route order without a misleading 9-node world or modifying input", () => {
    const input = partialReviewFixture(), before = structuredClone(input);
    input.scenes.reverse(); before.scenes.reverse();
    const result = composePartialBoardWizardReview(input)!;
    expect(GameConfigSchema.safeParse(result).success).toBe(true);
    expect(result.scenes.map(s => s.slug)).toEqual(input.record.boards.slice(0, 5).map(b => b.boardId));
    expect(result.scenes.flatMap(s => s.targets)).toHaveLength(15);
    expect(result.world).toBeUndefined(); expect(result.worlds).toBeUndefined();
    expect(result.scenes.every(s => s.worldSlug === undefined)).toBe(true);
    expect(result.composedAt).toBe("2026-09-10T00:00:00.000Z"); expect(input).toEqual(before);
  });
  it.each(["running", "deleted"])("does not project a %s capsule", state => {
    const input = partialReviewFixture(); input.record.state = state;
    expect(composePartialBoardWizardReview(input)).toBeNull();
  });
  it.each(["gameId", "ownerId"] as const)("rejects a mismatched %s", field => {
    const input = partialReviewFixture(); input.record[field] = "someone-else";
    expect(composePartialBoardWizardReview(input)).toBeNull();
  });
  it("allows an explicitly held capsule but never converts failed boards into available ones", () => {
    const input = partialReviewFixture(); input.record.state = "held";
    expect(composePartialBoardWizardReview(input)!.scenes).toHaveLength(5);
    input.record.boards.forEach(b => b.state = "needs-repair");
    expect(composePartialBoardWizardReview(input)).toBeNull();
  });
  it.each(["broken-json", "wrong-game", "wrong-version", "not-generated", "foreign-sprite", "composed-sprite", "second-foreground", "missing-binding"])("omits %s rather than manufacturing a replacement", failure => {
    const input = partialReviewFixture(), first = input.scenes[0]!, scene = JSON.parse(first.configJson);
    if (failure === "broken-json") first.configJson = "{";
    else if (failure === "wrong-game") first.gameId = "other";
    else if (failure === "wrong-version") first.sceneVersion++;
    else if (failure === "not-generated") first.generationStatus = "PENDING";
    else if (failure === "missing-binding") input.record.boards[0]!.playerBindingSha256 = undefined;
    else {
      if (failure === "foreign-sprite") scene.targets[0].sprite.url = "/api/assets/another-child";
      if (failure === "composed-sprite") scene.targets[0].sprite = { kind: "composed", faceUrl: "/api/assets/avatar", bodyTemplate: "fallback" };
      if (failure === "second-foreground") scene.art.foreground = "/old/foreground.png";
      first.configJson = JSON.stringify(scene);
    }
    const result = composePartialBoardWizardReview(input)!;
    expect(result.scenes).toHaveLength(4); expect(result.scenes.some(s => s.slug === first.sceneSlug)).toBe(false);
  });
  it("does not add a duplicate board or use a variant URL outside the retained target", () => {
    const input = partialReviewFixture(); input.scenes.push({ ...input.scenes[0]! });
    expect(composePartialBoardWizardReview(input)!.scenes).toHaveLength(5);
    const scene = JSON.parse(input.scenes[1]!.configJson);
    scene.targets[0].spriteByVariant = { B: { ...scene.targets[0].sprite, url: "/api/assets/other-child" } };
    input.scenes[1]!.configJson = JSON.stringify(scene);
    expect(composePartialBoardWizardReview(input)!.scenes).toHaveLength(4);
  });
});
