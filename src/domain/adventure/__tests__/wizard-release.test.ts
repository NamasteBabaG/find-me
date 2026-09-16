import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { findScene } from "../../../../content/scenes";
import { COLLECTION_PATCH_BOARDS, WIZARD_ADVENTURE_CATALOG } from "../../../../content/adventures/wizard-release";
import files from "../../../../content/adventures/wizard-art.json";
import { localPatchBoardsForVersion } from "../../scene/local-patch-catalog";
import { composeGame, composeScene } from "../../game/compose";
import { attachAdventureBook } from "../compose";
import { cropOf, maskOf } from "../../scene/local-patch-hides";

describe("wizard collection release", () => {
  it("ships 9 × 3 plus 9 × 6 without reinterpreting historical 45-hide games", () => {
    expect(localPatchBoardsForVersion(9).flatMap(b => b.hides)).toHaveLength(45);
    expect(localPatchBoardsForVersion(10).flatMap(b => b.hides)).toHaveLength(27);
    expect(WIZARD_ADVENTURE_CATALOG.boards.flatMap(b => b.status === "ready" ? b.discoveries : [])).toHaveLength(54);
    expect(localPatchBoardsForVersion(99)).toEqual([]);
    for (const board of COLLECTION_PATCH_BOARDS) {
      expect(findScene(board.board, 10)?.targets).toHaveLength(3);
      expect(findScene(board.board, 9)?.targets).toHaveLength(5);
      expect(JSON.stringify(board)).not.toMatch(/\bBar\b|Age five|five-year-old|curly hair|curls/);
    }
  });
  it("binds all three generated rectangles without repainting any collection card", () => {
    const child = { name: "Test", avatarUrl: "/api/assets/ast-avatar-test" };
    const scenes = COLLECTION_PATCH_BOARDS.map(board => {
      const def = findScene(board.board, 10)!;
      const sprites = board.hides.map(hide => {
        const c = cropOf(hide), m = maskOf(hide);
        return { targetId: hide.targetId, sprite: { kind: "image" as const,
          url: `/api/assets/ast-${hide.id}`, width: c.width, height: c.height,
          rect: { x: c.left / 3840, y: c.top / 2160, w: c.width / 3840, h: c.height / 2160 },
          hitRect: { x: m.left / 3840, y: m.top / 2160, w: m.width / 3840, h: m.height / 2160 },
        } };
      });
      return { ...composeScene(def, child, sprites, "he"), worldSlug: "journey", playMode: "find-any" as const,
        appearancesPerBoard: 3 as const, findsRequiredToAdvance: 3 as const };
    });
    const config = attachAdventureBook(composeGame({ gameId: "game-test", child, scenes, locale: "he", packageTier: "ONE_WORLD", styleVersion: "local-patch-world-v1" }), WIZARD_ADVENTURE_CATALOG, scenes.map(s => s.slug));
    expect(config.adventure?.boards).toHaveLength(9);
    expect(config.adventure?.boards.every(b => b.targetIds.length === 3 && b.discoveries.length === 6 && b.collectionUi === "guided-v1")).toBe(true);
    expect(() => attachAdventureBook(config, WIZARD_ADVENTURE_CATALOG, scenes.map(s => s.slug))).toThrow("immutable");
  });
  it("pins exactly the same 4K child-free pixels for rendering, play, cards and deployment", async () => {
    expect(files).toHaveLength(9);
    for (const plan of WIZARD_ADVENTURE_CATALOG.boards) {
      if (plan.status !== "ready") throw Error("Planned board");
      const file = files.find(a => a.path === `public${plan.art.base}`)!;
      expect(file.sha256).toBe(plan.art.sha256);
      const bytes = await readFile(file.path);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(file.sha256);
      expect(await sharp(bytes).metadata()).toMatchObject({ width: 3840, height: 2160 });
    }
  });
});
