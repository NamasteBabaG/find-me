import { describe, expect, it } from "vitest";
import { MAGIC_PILOT_CATALOG, MAGIC_PILOT_PATCH_BOARDS } from "../../../../content/adventures/magic-pilot";
import { threeBoardConfig } from "../../../../scripts/lib/adventure-three-config";
import { attachAdventureBook } from "../compose";
import { overlaps } from "../content";
import { cropOf, maskForHide } from "../../scene/local-patch-hides";
import { emptyAdventureProgress, recordAdventureEvent, adventureAlbum, readAdventureProgress } from "../progress";
import { projectPassport } from "../../passport/passport";

const input = () => ({ gameId: "magic-pilot-test", childName: "TEST", avatarUrl: "/api/assets/test-avatar",
  patchUrls: Object.fromEntries(MAGIC_PILOT_PATCH_BOARDS.flatMap(b => b.hides.map(h => [h.id, `/api/assets/${h.id}`]))),
  composedAt: "2026-09-18T10:00:00.000Z", fixture: true, boards: MAGIC_PILOT_PATCH_BOARDS, catalog: MAGIC_PILOT_CATALOG,
  world: { slug: "magic-pilot", name: "ממלכת הקסם", mapArt: "/worlds/kingdom/map.webp" },
});
const config = () => attachAdventureBook(threeBoardConfig(input()), MAGIC_PILOT_CATALOG, MAGIC_PILOT_PATCH_BOARDS.map(b => b.board));
describe("isolated three-board magic pilot", () => {
  it("binds three boards and passport pages to magic, never the old Journey map", () => {
    const c = config(), p = emptyAdventureProgress(c.gameId, c.adventure!);
    expect(c.scenes.map(s => s.slug)).toEqual(["magic-castlegate", "magic-giantlibrary", "fairyforest"]);
    expect(c.worlds![0]!.slug).toBe("magic-pilot");
    expect(projectPassport(c, p, {}, () => "/unused")).toMatchObject([{ id: "magic-pilot", title: "ממלכת הקסם", pages: [{ state: "available" }, { state: "locked" }, { state: "locked" }] }]);
    expect(() => threeBoardConfig({ ...input(), world: undefined })).toThrow("Pilot world must match");
  });
  it("keeps every complete return crop away from all six discoveries and leaves a safe seam band", () => {
    for (const board of MAGIC_PILOT_PATCH_BOARDS) {
      const plan = MAGIC_PILOT_CATALOG.boards.find(b => b.boardSlug === board.board)!;
      if (plan.status !== "ready") throw Error("missing master");
      expect(plan.discoveries.map(d => d.rarity).sort()).toEqual(["common", "common", "common", "epic", "rare", "rare"]);
      for (const hide of board.hides) {
        const r = cropOf(hide), m = maskForHide(hide);
        expect(Math.min(m.left, m.top, 512 - m.left - m.width, 768 - m.top - m.height)).toBeGreaterThanOrEqual(12);
        for (const d of plan.discoveries) expect(overlaps({ x: r.left / 3840, y: r.top / 2160, w: r.width / 3840, h: r.height / 2160 }, d.cardCrop)).toBe(false);
      }
    }
  });
  it("collects nine finds and eighteen items exactly once, persists and opens all three passport memories", () => {
    const c = config(), book = c.adventure!; let p = emptyAdventureProgress(c.gameId, book);
    for (const board of book.boards) {
      for (const targetId of board.targetIds) p = recordAdventureEvent(p, c.gameId, book, { kind: "target-found", boardSlug: board.boardSlug, targetId, variant: "A" }).progress;
      for (const d of board.discoveries) {
        const event = { kind: "discovery-found" as const, boardSlug: board.boardSlug, discoveryId: d.id };
        p = recordAdventureEvent(p, c.gameId, book, event).progress;
        expect(recordAdventureEvent(p, c.gameId, book, event).changed).toBe(false);
      }
    }
    p = readAdventureProgress(JSON.parse(JSON.stringify(p)), c.gameId, book);
    expect(adventureAlbum(p)).toMatchObject({ stars: { found: 9 }, discoveries: { collected: 18, total: 18 }, postcards: { collected: 3 } });
    const pages = projectPassport(c, p, {}, (board, _kind, id) => `/${board}/${id}`)[0]!.pages;
    expect(pages).toHaveLength(3);
    for (const page of pages) { expect(page.state).toBe("complete"); expect(page.photoUrl).toContain("hide-3"); }
  });
  it("refuses to publish unreviewed personal hit geometry", () => {
    expect(() => threeBoardConfig({ ...input(), fixture: false })).toThrow("Actual child geometry");
  });
});
