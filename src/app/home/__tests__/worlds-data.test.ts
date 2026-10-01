import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { carouselWorlds } from "../worlds-data";
import { hasPlaceEmblem } from "../PlaceEmblem";
import { WorldsCarousel } from "../WorldsCarousel";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getDict } from "@/i18n";

import { boardPresentation, presentationMatchesScene } from "../../../../content/home/board-presentation";
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());
describe("the worlds carousel", () => {
  it("teases every place with its own symbol, without sending paintings or discovery clues", () => {
    for (const world of carouselWorlds("en").filter((w) => !w.upcoming)) {
      expect(world.tiles).toHaveLength(9);
      for (const tile of world.tiles) {
        expect(tile.label).toBeTruthy();
        expect(hasPlaceEmblem(tile.key), `${world.slug}/${tile.key} needs a destination symbol`).toBe(true);
        expect(tile).not.toHaveProperty("thumb");
        expect(tile).not.toHaveProperty("spots");
      }
      expect(JSON.stringify(world)).not.toMatch(/\/(?:scenes|api\/assets)\//);
    }
  });

  it("renders destination illustrations with no board image elements in either language", () => {
    for (const locale of ["he", "en"] as const) {
      for (const world of carouselWorlds(locale)) {
        const html = renderToStaticMarkup(createElement(WorldsCarousel, { worlds: [world], copy: getDict(locale).home.worlds }));
        expect(html).not.toContain("<img");
        expect(html.match(/class=\"place-emblem\"/g)).toHaveLength(9);
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

  it("keeps purchase availability independent of the destination illustrations", () => {
    for (const locale of ["he", "en"] as const) {
      const worlds = carouselWorlds(locale, [], { available: ["journey"] });
      expect(worlds.filter(w => w.available).map(w => w.slug)).toEqual(["journey"]);
      expect(worlds.find(w => w.slug === "kingdom")).toMatchObject({ available: false });
      expect(worlds.find(w => w.slug === "timetravel")).toMatchObject({ available: false });
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
      expect(world.tiles.every((t) => !("spots" in t) && !("thumb" in t))).toBe(true);
    }
    // Painted worlds come first, unpainted after, in journey order.
    const firstUpcoming = worlds.findIndex((w) => w.upcoming);
    if (firstUpcoming >= 0) expect(worlds.slice(firstUpcoming).every((w) => w.upcoming)).toBe(true);
  });
});
