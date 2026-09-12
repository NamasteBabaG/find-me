import { describe, expect, it } from "vitest";
import { findScene } from "../../../../content/scenes";
import { localPatchBoardsForVersion, localPatchBoardForVersion } from "../local-patch-catalog";
import { assertPlaceable, cropOf, maskOf, LocalPatchBoardSchema } from "../local-patch-hides";
import { SceneDefinitionSchema } from "../schema";

describe("frozen legacy catalog and authored five-hide release", () => {
  it("keeps9×3 legacy and preserves the authored9×5 release at version7", () => {
    const old = localPatchBoardsForVersion(6), next = localPatchBoardsForVersion(7);
    expect(old).toHaveLength(9); expect(next).toHaveLength(9);
    expect(old.flatMap(b => b.hides)).toHaveLength(27);
    expect(next.flatMap(b => b.hides)).toHaveLength(45);
    expect(localPatchBoardsForVersion(9)).toEqual([]);
    expect(localPatchBoardForVersion("sydney", 5)).toBeNull();
    for (const board of next) {
      const legacy = findScene(board.board, 6)!, scene = findScene(board.board, 7)!;
      expect(legacy.targets).toHaveLength(3); expect(legacy.playMode).toBeUndefined();
      expect(scene.targets).toHaveLength(5);
      expect(scene).toMatchObject({ playMode: "find-any", appearancesPerBoard: 5, findsRequiredToAdvance: 3 });
      expect(scene.art).toEqual(legacy.art);
      expect(findScene(board.board)!.targets).toHaveLength(3);
    }
  });

  it("every placement has local light, child wardrobe, support, depth, non-colliding windows and exact hints", () => {
    const ids = new Set<string>();
    for (const board of localPatchBoardsForVersion(7)) {
      expect(() => assertPlaceable(board)).not.toThrow();
      expect(board.wardrobe!.length).toBeGreaterThan(30);
      expect(new Set(board.hides.map(h => h.placement!.depth))).toEqual(new Set(["near", "middle", "deep"]));
      const scene = findScene(board.board, 7)!;
      for (const hide of board.hides) {
        expect(ids.has(hide.id)).toBe(false); ids.add(hide.id);
        const crop = cropOf(hide), mask = maskOf(hide), target = scene.targets.find(t => t.id === hide.targetId)!;
        expect(mask.left).toBeGreaterThanOrEqual(crop.left); expect(mask.top).toBeGreaterThanOrEqual(crop.top);
        expect(mask.left + mask.width).toBeLessThanOrEqual(crop.left + crop.width);
        expect(mask.top + mask.height).toBeLessThanOrEqual(crop.top + crop.height);
        expect(hide.placement!.lighting.length).toBeGreaterThan(15);
        expect(hide.placement!.support.length).toBeGreaterThan(15);
        expect(target.mission).toEqual({ en: "Find {name}", he: "מצאו את {name}" });
        expect(target.item).toEqual({ en: "the hidden explorer", he: "הדמות המסתתרת" });
        for (const slot of target.slots) {
          expect(slot.hintText).toEqual(hide.hint);
          expect(slot.hintZone.x).toBeCloseTo((mask.left + mask.width / 2) / scene.art.width);
          expect(slot.flip).toBe(false); expect(slot.rotation).toBe(0);
        }
      }
    }
    expect(ids.size).toBe(45);
  });

  it("rejects partial/mixed count contracts before a purchase", () => {
    const board = localPatchBoardsForVersion(7)[0]!, scene = findScene(board.board, 7)!;
    expect(LocalPatchBoardSchema.safeParse({ ...board, hides: board.hides.slice(0, 4) }).success).toBe(false);
    expect(SceneDefinitionSchema.safeParse({ ...scene, targets: scene.targets.slice(0, 4) }).success).toBe(false);
    expect(SceneDefinitionSchema.safeParse({ ...scene, findsRequiredToAdvance: 5 }).success).toBe(false);
    expect(SceneDefinitionSchema.safeParse({ ...scene, playMode: undefined }).success).toBe(false);
  });
});
