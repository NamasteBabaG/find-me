import { beforeEach, describe, expect, it } from "vitest";
import { createPlayStore } from "../play-store";
import type { GameConfig } from "@/domain/game/config";

/**
 * A refresh must bring the player back to the world they were in. An auditor
 * finished a board in the second world, refreshed, and landed on the first
 * world's map: the completion was saved, the place was not.
 */
const slot = (id: string) => ({ id, x: 0.36, y: 0.71, scale: 0.075, rotation: 0, zIndex: 10, layer: "front", flip: false, hintZone: { x: 0.36, y: 0.71, r: 0.1 }, hintText: "somewhere on the left" });
const target = (id: string) => ({ id, targetType: "hide", difficulty: 1, mission: "Find Noa", item: "hat", success: ["!"], animation: "wave", slots: [slot(`${id}-a`), slot(`${id}-b`)], sprite: { kind: "image", url: "/s.webp", width: 1, height: 1 } });
const scene = (slug: string, worldSlug: string) => ({
  slug,
  version: 1,
  worldSlug,
  name: slug,
  tagline: "t",
  artStatus: "final",
  art: { width: 3072, height: 2048, base: "/b.webp", thumbnail: "/t.webp", palette: { sky: "#fff", ground: "#fff", accent: "#fff" } },
  targets: [target("a"), target("b"), target("c")],
  ambient: [],
  celebration: { kind: "confetti", completeText: "done" },
  collectible: { id: slug, name: slug, icon: "c" },
  sounds: {},
});
const world = (slug: string, boards: string[]) => ({
  slug,
  name: slug,
  tagline: slug,
  map: { art: "/m.webp", palette: { sky: "#fff", ground: "#fff", accent: "#fff" }, route: [] },
  nodes: boards.map((boardSlug, i) => ({ boardSlug, routeIndex: i, x: 0.1 * (i + 1), y: 0.5 })),
  collectible: { id: slug, name: slug, icon: "c" },
});
const config = {
  version: 1,
  gameId: "g_store",
  locale: "en",
  child: { name: "Noa", avatarUrl: "/a.png" },
  styleVersion: "collage-v1",
  packageTier: "TWO_WORLDS",
  composedAt: new Date(0).toISOString(),
  scenes: [scene("beach", "w1"), scene("castle", "w2")],
  worlds: [world("w1", ["beach"]), world("w2", ["castle"])],
} as unknown as GameConfig;
const copy = { wrongTarget: [], miss: [], bonus: [], hint: [] } as never;

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

beforeEach(() => {
  (globalThis as { window?: unknown }).window = { localStorage: new MemoryStorage(), matchMedia: () => ({ matches: true }) } as never;
});

describe("coming back to a multi-world game", () => {
  it("returns to the world of the last board opened", () => {
    const first = createPlayStore(config, { copy });
    first.getState().reveal();
    first.getState().goToMap(null, "w2");
    first.getState().openScene("castle");
    expect(first.getState().worldSlug).toBe("w2");

    const again = createPlayStore(config, { copy });
    again.getState().hydrate();
    expect(again.getState().worldSlug).toBe("w2");
    expect(again.getState().screen).toBe("map");
    expect(again.getState().progress.lastScene).toBe("castle");
  });

  it("offers the hub to a returning player who never chose a world", () => {
    const first = createPlayStore(config, { copy });
    first.getState().reveal();
    const again = createPlayStore(config, { copy });
    again.getState().hydrate();
    expect(again.getState().screen).toBe("worlds");
  });

  it("ignores a remembered world that this game does not have", () => {
    const first = createPlayStore(config, { copy });
    first.getState().reveal();
    window.localStorage.setItem("findme:progress:v1:g_store", JSON.stringify({ ...first.getState().progress, lastWorld: "gone" }));
    const again = createPlayStore(config, { copy });
    again.getState().hydrate();
    expect(again.getState().worldSlug).toBe("w1");
    expect(again.getState().screen).toBe("worlds");
  });
});
