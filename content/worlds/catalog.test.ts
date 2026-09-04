import { describe, expect, it } from "vitest";
import { WORLD_CATALOG, activeWorlds, allWorlds, findWorld, worldOfBoard } from "./index";
import { UPCOMING_WORLDS } from "./upcoming";
import { allScenes } from "../scenes";
import { BOARDS_PER_WORLD, boardSlugs, nodeFor } from "@/domain/world";

describe("world catalog", () => {
  it("loads every world and validates it on the way in", () => {
    expect(allWorlds().length).toBeGreaterThan(0);
    for (const w of allWorlds()) expect(w.nodes).toHaveLength(BOARDS_PER_WORLD);
  });

  it("only points at boards that exist", () => {
    const known = new Set(allScenes().map((s) => s.slug));
    for (const w of allWorlds()) for (const slug of boardSlugs(w)) expect(known.has(slug)).toBe(true);
  });

  it("gives every active board a world, and every board one world only", () => {
    for (const scene of allScenes()) {
      if (!scene.active) continue;
      const w = worldOfBoard(scene.slug);
      expect(w, `board "${scene.slug}" belongs to no world`).toBeDefined();
      expect(allWorlds().filter((x) => x.nodes.some((n) => n.boardSlug === scene.slug))).toHaveLength(1);
    }
  });

  it("keeps every node inside the map with room for a tap target", () => {
    for (const w of allWorlds()) {
      for (const n of w.nodes) {
        expect(n.x, `${w.slug}/${n.boardSlug} x`).toBeGreaterThan(0.04);
        expect(n.x, `${w.slug}/${n.boardSlug} x`).toBeLessThan(0.96);
        expect(n.y, `${w.slug}/${n.boardSlug} y`).toBeGreaterThan(0.04);
        expect(n.y, `${w.slug}/${n.boardSlug} y`).toBeLessThan(0.96);
      }
    }
  });

  it("prints node-spacing warnings without failing the build", () => {
    for (const entry of WORLD_CATALOG) for (const w of entry.warnings) console.log(`[world:${entry.world.slug}] ${w}`);
    expect(WORLD_CATALOG.every((e) => Array.isArray(e.warnings))).toBe(true);
  });

  it("finds worlds and nodes by slug", () => {
    const first = activeWorlds()[0]!;
    expect(findWorld(first.slug)).toBe(first);
    expect(findWorld("nope")).toBeUndefined();
    expect(nodeFor(first, boardSlugs(first)[0]!)).toBeDefined();
  });

  it("never teases a world it already ships", () => {
    // The shop reads both lists. A world in each would appear twice in the
    // carousel — once playable, once locked and "being painted now" — which is
    // the sort of thing nobody notices until a customer does.
    const shipped = new Set(allWorlds().map((w) => w.slug));
    const teased = UPCOMING_WORLDS.map((w) => w.slug);
    expect(teased.filter((slug) => shipped.has(slug))).toEqual([]);
  });

  it("gives every world a distinct order, shipped or not", () => {
    const orders = [...allWorlds().map((w) => w.order), ...UPCOMING_WORLDS.map((w) => w.order)];
    expect(new Set(orders).size).toBe(orders.length);
  });
});
