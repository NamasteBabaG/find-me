import { describe, expect, it } from "vitest";
import { BOARDS_PER_WORLD } from "../package";
import {
  HIDES_PER_BOARD, LOCAL_PATCH_BOARD, LOCAL_PATCH_CROP, LOCAL_PATCH_MASK_GROUND, LOCAL_PATCH_MASK_LEFT, POSE_MASK,
  LocalPatchBoardSchema, WORLD_LOCAL_PATCH_HIDES, WORLD_LOCAL_PATCH_HIDE_COUNT,
  LOW_POSES, assertPlaceable, cropOf, hidesCollide, maskInCrop, maskOf,
} from "../scene/local-patch-hides";

describe("where a child is painted into a board", () => {
  it("gives every board of the world its three places", () => {
    expect(WORLD_LOCAL_PATCH_HIDES).toHaveLength(BOARDS_PER_WORLD);
    for (const board of WORLD_LOCAL_PATCH_HIDES) expect(LocalPatchBoardSchema.parse(board).hides).toHaveLength(HIDES_PER_BOARD);
    expect(WORLD_LOCAL_PATCH_HIDES.flatMap(b => b.hides)).toHaveLength(WORLD_LOCAL_PATCH_HIDE_COUNT);
  });

  it("names every hide once across the whole world", () => {
    const ids = WORLD_LOCAL_PATCH_HIDES.flatMap(b => b.hides.map(h => h.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps every crop inside its board and every mask inside its crop", () => {
    for (const pose of Object.keys(POSE_MASK) as (keyof typeof POSE_MASK)[]) {
      const box = maskInCrop(pose);
      expect(box.left + box.width).toBeLessThanOrEqual(LOCAL_PATCH_CROP.width);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.top + box.height).toBeLessThanOrEqual(LOCAL_PATCH_CROP.height);
    }
    for (const board of WORLD_LOCAL_PATCH_HIDES) for (const hide of board.hides) {
      const crop = cropOf(hide);
      expect(crop.left + crop.width).toBeLessThanOrEqual(LOCAL_PATCH_BOARD.width);
      expect(crop.top + crop.height).toBeLessThanOrEqual(LOCAL_PATCH_BOARD.height);
    }
  });

  it("never lets one hide's sprite carry the child from another", () => {
    // The sprite is cut from the finished board at the crop rectangle, so a crop
    // that reaches into a neighbour's masked area shows that neighbour twice.
    for (const board of WORLD_LOCAL_PATCH_HIDES) expect(() => assertPlaceable(board)).not.toThrow();
  });

  it("catches the collision it exists to catch", () => {
    const a = { id: "a", left: 1000, top: 1200, pose: "standing" as const };
    // 130 to the right: the second mask starts inside the first crop.
    expect(hidesCollide(a, { id: "b", left: 1130, top: 1200, pose: "standing" as const })).toBe(true);
    // Far enough apart in x that neither crop reaches the other's mask.
    expect(hidesCollide(a, { id: "b", left: 1000 + LOCAL_PATCH_CROP.width, top: 1200, pose: "standing" as const })).toBe(false);
    expect(() => assertPlaceable({ board: "test", art: "x.png", ground: "sand", sittable: true, hides: [a, { id: "b", left: 1130, top: 1200, pose: "standing" as const }, { id: "c", left: 0, top: 0, pose: "kneeling" as const }] }))
      .toThrow(/too close/);
  });

  it("refuses a crop that runs off the edge of the board", () => {
    const offEdge = { id: "off", left: LOCAL_PATCH_BOARD.width - 10, top: 1200, pose: "standing" as const };
    expect(() => assertPlaceable({ board: "test", art: "x.png", ground: "sand", sittable: true, hides: [offEdge, { id: "b", left: 0, top: 0, pose: "standing" as const }, { id: "c", left: 1600, top: 0, pose: "kneeling" as const }] }))
      .toThrow(/off the edge/);
  });

  it("refuses a child sitting on a road, however well she would be drawn", () => {
    // A crouching child in the middle of a Tokyo crossing passes every check the
    // judge has and still reads as a mistake, so the ground says whether people
    // put their bodies on it.
    const road = { board: "tokyo", art: "x.png", ground: "wet crossing", sittable: false,
      hides: [{ id: "a", left: 0, top: 0, pose: "crouching" as const }, { id: "b", left: 1200, top: 0, pose: "standing" as const }, { id: "c", left: 2400, top: 0, pose: "walking" as const }] };
    expect(() => assertPlaceable(road)).toThrow(/nobody sits on/);
    expect(() => assertPlaceable({ ...road, sittable: true })).not.toThrow();
    for (const board of WORLD_LOCAL_PATCH_HIDES) {
      if (board.sittable) continue;
      expect(board.hides.every(h => !LOW_POSES.includes(h.pose))).toBe(true);
    }
  });

  it("puts the mask where the placement says, in board coordinates", () => {
    const standing = POSE_MASK.standing;
    expect(maskOf({ id: "x", left: 1408, top: 1088, pose: "standing" as const }))
      .toEqual({ left: 1408 + LOCAL_PATCH_MASK_LEFT, top: 1088 + LOCAL_PATCH_MASK_GROUND - standing.height, width: standing.width, height: standing.height });
    // A lower pose keeps the same ground line and only rises less far above it.
    const sitting = maskOf({ id: "x", left: 1408, top: 1088, pose: "sitting-cross-legged" as const });
    expect(sitting.top + sitting.height).toBe(1088 + LOCAL_PATCH_MASK_GROUND);
  });
});
