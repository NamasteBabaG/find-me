import { describe, expect, it } from "vitest";
import { carouselWorlds } from "../worlds-data";

import { findScene } from "../../../../content/scenes";
import { boardPresentation, presentationMatchesScene } from "../../../../content/home/board-presentation";
import { COLLECTION_SCENE_VERSION } from "../../../../content/adventures/wizard-release";
describe("the worlds carousel", () => {
  it("shows every painted world whole, hiding spots included", () => {
    for (const world of carouselWorlds("en").filter((w) => !w.upcoming)) {
      for (const tile of world.tiles) {
        expect(tile.thumb, `${world.slug}/${tile.key} has a painting`).toBeTruthy();
        expect(tile.spots?.length, `${world.slug}/${tile.key} names its search objects`).toBe(["journey", "kingdom"].includes(world.slug) ? 6 : 3);
      }
    }
  });

  it("does not claim availability without the creation catalogue and has no unlock ladder", () => {
    for (const world of carouselWorlds("en")) {
      expect(world.available).toBe(false);
      expect(world).not.toHaveProperty("opensAfter");
    }
  });

  it("keeps ownership independent of current purchase availability", () => {
    const worlds = carouselWorlds("en");
    const second = worlds[1];
    if (!second || second.upcoming) return; // only meaningful once a second world ships
    const owned = carouselWorlds("en", [second.slug])[1]!;
    expect(owned.owned).toBe(true);
    expect(owned.available).toBe(false);
    expect(carouselWorlds("en", [second.slug])[0]!.owned).toBe(false);
  });

  it("explicitly marks the approved preview that differs from the v10 purchase", () => {
    for (const locale of ["he", "en"] as const) {
      const worlds = carouselWorlds(locale, [], { available: ["journey"], sceneVersion: COLLECTION_SCENE_VERSION });
      expect(worlds.filter(w => w.available).map(w => w.slug)).toEqual(["journey"]);
      expect(worlds.find(w => w.slug === "journey")?.previewArt).toBe(true);
      expect(worlds.find(w => w.slug === "kingdom")).toMatchObject({ available: false, previewArt: true });
      for (const world of worlds.filter(w => !w.upcoming)) {
        const differs = world.tiles.some(t => boardPresentation(t.key) && !presentationMatchesScene(t.key, findScene(t.key, COLLECTION_SCENE_VERSION)?.art));
        expect(world.previewArt).toBe(differs);
      }
    }
  });

  it("requires both path and content provenance before using a preview as purchase art", () => {
    const preview = boardPresentation("newyork")!;
    expect(presentationMatchesScene("newyork", preview)).toBe(true);
    expect(presentationMatchesScene("newyork", { ...preview, sha256: "0".repeat(64) })).toBe(false);
    expect(presentationMatchesScene("newyork", { base: preview.base })).toBe(false);
    expect(presentationMatchesScene("newyork", { ...preview, base: "/other.webp" })).toBe(false);
  });

  it("keeps the worlds still being painted apart from the ones on sale", () => {
    const worlds = carouselWorlds("en");
    const upcoming = worlds.filter((w) => w.upcoming);
    for (const world of upcoming) {
      expect(world.owned).toBe(false);
      expect(world.tiles.every((t) => t.soon)).toBe(true);
      expect(world.tiles.every((t) => t.spots === undefined)).toBe(true);
    }
    // Painted worlds come first, unpainted after, in journey order.
    const firstUpcoming = worlds.findIndex((w) => w.upcoming);
    if (firstUpcoming >= 0) expect(worlds.slice(firstUpcoming).every((w) => w.upcoming)).toBe(true);
  });
});
