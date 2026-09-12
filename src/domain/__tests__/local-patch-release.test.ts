import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { findScene } from "../../../content/scenes";
import release from "../../../content/local-patch-world/art.json";
import { localPatchSceneRelease } from "../../../content/scenes/local-patch-release";
import paris from "../../../content/scenes/paris/scene.json";
import { WORLD_LOCAL_PATCH_HIDES, maskOf } from "../scene/local-patch-hides";
import { LOCAL_PATCH_HINTS, localPatchHint } from "../scene/local-patch-hints";
import { hintProblem, validateSceneDefinition } from "../scene/schema";

describe("the nine-board local-patch release", () => {
  it("publishes precisely the nine non-personalized bases used by the painter", async () => {
    expect(release.boards).toHaveLength(9);
    for (const board of WORLD_LOCAL_PATCH_HIDES) {
      const declared = release.boards.find(row => row.board === board.board)!;
      const scene = findScene(board.board, release.sceneVersion)!;
      expect(board.art).toBe(`public${declared.base}`);
      expect(scene.version).toBe(6);
      expect(scene.art.base).toBe(declared.base);
      expect(scene.art.sha256).toBe(declared.sha256);
      const bytes = await readFile(board.art);
      expect(createHash("sha256").update(bytes).digest("hex"), board.board).toBe(declared.sha256);
      const meta = await sharp(bytes).metadata();
      expect([meta.width, meta.height]).toEqual([3072, 2048]);
      const source = release.renderSources.find(row => row.board === board.board)!;
      const sourceBytes = await readFile(source.path);
      expect(createHash("sha256").update(sourceBytes).digest("hex")).toBe(source.sha256);
      const pixels = await sharp(bytes).ensureAlpha().raw().toBuffer();
      const sourcePixels = await sharp(sourceBytes).ensureAlpha().raw().toBuffer();
      expect(pixels.equals(sourcePixels), `${board.board}: same pixels on server and CDN`).toBe(true);
      expect(createHash("sha256").update(sourcePixels).digest("hex")).toBe(source.pixelsSha256);
      expect(validateSceneDefinition(scene).ok, board.board).toBe(true);
      expect(scene.art.foreground).toBeUndefined();
    }
  }, 30_000);

  it("gives all 27 placements their own bilingual hint and removes stale transforms in both variants", () => {
    const ids = WORLD_LOCAL_PATCH_HIDES.flatMap(board => board.hides.map(hide => hide.id));
    expect(Object.keys(LOCAL_PATCH_HINTS).sort()).toEqual([...ids].sort());
    for (const board of WORLD_LOCAL_PATCH_HIDES) for (const hide of board.hides) {
      const target = findScene(board.board, release.sceneVersion)!.targets.find(row => row.id === hide.targetId)!;
      const box = maskOf(hide);
      expect(target.mission).toEqual({ en: "Find {name}", he: "מצאו את {name}" });
      expect(hintProblem(localPatchHint(hide.id), target.mission, target.item)).toBeNull();
      for (const slot of target.slots) {
        expect(slot.hintText).toEqual(localPatchHint(hide.id));
        expect(slot.x).toBe((box.left + box.width / 2) / 3072);
        expect(slot.y).toBe((box.top + box.height / 2) / 2048);
        expect(slot.rotation).toBe(0);
        expect(slot.flip).toBe(false);
        expect(slot.layer).toBe("front");
        expect(slot.placement).toBeUndefined();
        expect(slot.hintZone.x).toBe(slot.x);
        expect(slot.hintZone.y).toBe(slot.y);
      }
    }
    expect(() => localPatchHint("missing-hide")).toThrow(/no authored hint/);
  });

  it("leaves paid historical scenes and their artwork immutable", () => {
    const original = structuredClone(paris);
    const current = localPatchSceneRelease(paris);
    expect(paris).toEqual(original);
    expect(findScene("paris", 5)!.art).toEqual(validateSceneDefinition(original).scene!.art);
    expect(findScene("paris")!.version).toBe(5);
    expect(findScene("paris", 5)!.targets[1]!.mission.he).toContain("קרוסלה");
    expect(validateSceneDefinition(current).scene!.targets[1]!.mission.he).not.toContain("קרוסלה");
  });
});
