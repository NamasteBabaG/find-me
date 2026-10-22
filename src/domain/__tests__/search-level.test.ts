import { describe, expect, it } from "vitest";
import { detectiveRelease, isSearchLevel, SEARCH_LEVELS, storedSearchLevel } from "../search-level";
import { DETECTIVE_RELEASES } from "../../../content/worlds/detective-releases";

describe("search level", () => {
  it("is a closed list of two", () => {
    expect(SEARCH_LEVELS).toEqual(["explorers", "detectives"]);
    expect(isSearchLevel("explorers")).toBe(true);
    expect(isSearchLevel("detectives")).toBe(true);
    for (const value of ["", "Explorers", "מגלים", "easy", null, undefined, 1]) expect(isSearchLevel(value)).toBe(false);
  });

  it("keeps the historical boards for a game from before the choice, and refuses corrupt values", () => {
    expect(storedSearchLevel(null)).toBe("explorers");
    expect(storedSearchLevel(undefined)).toBe("explorers");
    expect(storedSearchLevel("detectives")).toBe("detectives");
    expect(() => storedSearchLevel("hard")).toThrow();
  });

  it("pins one content version per engine for Detectives", () => {
    expect(detectiveRelease([], "local-patch-world-v1")).toBeNull();
    const release = detectiveRelease([{ worldSlug: "journey", styleVersion: "local-patch-world-v1", sceneVersion: 13 },
      { worldSlug: "journey", styleVersion: "collage-v1", sceneVersion: 4 }], "local-patch-world-v1");
    expect(release?.sceneVersion).toBe(13);
    expect([...release!.worlds]).toEqual(["journey"]);
    expect(() => detectiveRelease([{ worldSlug: "journey", styleVersion: "s", sceneVersion: 13 }, { worldSlug: "kingdom", styleVersion: "s", sceneVersion: 14 }], "s")).toThrow();
    expect(() => detectiveRelease([{ worldSlug: "journey", styleVersion: "s", sceneVersion: 13 }, { worldSlug: "journey", styleVersion: "s", sceneVersion: 13 }], "s")).toThrow();
  });

  it("registers only the complete Journey13 local-patch family with no legacy-engine fallback", () => {
    expect(DETECTIVE_RELEASES).toEqual([{ worldSlug: "journey", styleVersion: "local-patch-world-v1", sceneVersion: 13 }]);
    const release = detectiveRelease(DETECTIVE_RELEASES, "local-patch-world-v1");
    expect(release?.sceneVersion).toBe(13);
    expect([...release!.worlds]).toEqual(["journey"]);
    expect(detectiveRelease(DETECTIVE_RELEASES, "collage-v1")).toBeNull();
  });
});
