import { describe, expect, it } from "vitest";
import { carouselWorlds } from "../worlds-data";

/**
 * What the shop shows a visitor: everything.
 *
 * The blur and the padlock came off. A world is shown whole — paintings,
 * places, hiding spots — and one line says what it is to this visitor: theirs
 * already, next on the journey, or still being painted. Ownership is read from
 * the database and passed in, so it survives closing the tab; this test pins
 * the shape of that decision, not the storage.
 */
describe("the worlds carousel", () => {
  it("shows every painted world whole, hiding spots included", () => {
    for (const world of carouselWorlds("en").filter((w) => !w.upcoming)) {
      for (const tile of world.tiles) {
        expect(tile.thumb, `${world.slug}/${tile.key} has a painting`).toBeTruthy();
        expect(tile.spots?.length, `${world.slug}/${tile.key} names its hiding spots`).toBe(3);
      }
    }
  });

  it("leaves the first world without a step to name, and names the step for every later one", () => {
    const [first, ...rest] = carouselWorlds("en");
    expect(first?.opensAfter).toBeUndefined();
    expect(first?.owned).toBe(false);
    for (const world of rest) expect(world.opensAfter, `${world.slug} should say which world comes before it`).toBeTruthy();
  });

  it("says a world the visitor has paid for is theirs, and drops the ladder line for it", () => {
    const worlds = carouselWorlds("en");
    const second = worlds[1];
    if (!second || second.upcoming) return; // only meaningful once a second world ships
    const owned = carouselWorlds("en", [second.slug])[1]!;
    expect(owned.owned).toBe(true);
    expect(owned.opensAfter).toBeUndefined();
    expect(carouselWorlds("en", [second.slug])[0]!.owned).toBe(false);
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
