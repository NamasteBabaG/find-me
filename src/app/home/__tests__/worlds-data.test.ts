import { describe, expect, it } from "vitest";
import { carouselWorlds } from "../worlds-data";

/**
 * What the shop shows a visitor, and what it hides.
 *
 * The lock is not decoration: it is the sequential-purchase rule made visible,
 * and a parent who has already paid for a world must never meet it. That has to
 * hold across sessions, which is why ownership is read from the database and
 * passed in here rather than remembered in the browser — this test pins the
 * shape of that decision, not the storage.
 */
describe("the worlds carousel", () => {
  it("leaves the first world open to everyone", () => {
    const [first] = carouselWorlds("en");
    expect(first?.opensAfter).toBeUndefined();
    expect(first?.tiles.every((t) => !t.blurred)).toBe(true);
  });

  it("locks every world after the first for a visitor who owns none", () => {
    for (const world of carouselWorlds("en").slice(1)) {
      expect(world.opensAfter, `${world.slug} should say which world opens it`).toBeTruthy();
    }
  });

  it("veils a locked world's paintings, and only where a painting exists", () => {
    // A world still being written has nothing to put behind glass; it shows its
    // nine place names instead, which is a promise rather than a tease.
    for (const world of carouselWorlds("en").slice(1)) {
      for (const tile of world.tiles) {
        expect(tile.blurred, `${world.slug}/${tile.key}`).toBe(Boolean(tile.thumb));
      }
    }
  });

  it("opens a world the visitor has paid for", () => {
    const worlds = carouselWorlds("en");
    const second = worlds[1];
    if (!second || second.upcoming) return; // only meaningful once a second world ships
    const owned = carouselWorlds("en", [second.slug])[1]!;
    expect(owned.opensAfter).toBeUndefined();
    expect(owned.tiles.some((t) => t.blurred)).toBe(false);
  });

  it("does not describe the hiding spots of a world you cannot play", () => {
    // The spot list is part of what is being sold; a locked tile shows the place
    // and the picture behind glass, and keeps the rest for after the purchase.
    for (const world of carouselWorlds("en").slice(1)) {
      expect(world.tiles.every((t) => t.spots === undefined)).toBe(true);
    }
  });
});
