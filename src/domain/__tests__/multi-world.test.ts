import { describe, expect, it } from "vitest";
import { allWorlds } from "../../../content/worlds";
import { boardSlugs } from "../world";
import { composeWorld } from "../game/compose";
import { gameWorlds, scenesOfWorld, worldOfScene, type GameConfig, type SceneConfig } from "../game/config";
import { emptyProgress, sceneProgress, type GameProgress } from "../game/progress";

/**
 * A game that spans more than one journey.
 *
 * The catalog and the price list have offered two- and three-world packages for
 * a while, but the play runtime held exactly one world: the config had a single
 * `world`, and the composer took it from whichever board happened to be first.
 * A QA audit spelled out what that meant — eighteen boards drawn on world one's
 * map, a counter that reads "10 of 9", and world two's destinations unlocked
 * because progress was counted across the whole game.
 *
 * These are the properties that make the difference, on the real catalog rather
 * than a fixture: the numbers only mean something if they are nine and nine.
 */
const CHILD = { name: "Bar", avatarUrl: "https://example.test/avatar.png" };

function configFor(worldCount: number): GameConfig {
  const worlds = allWorlds()
    .slice(0, worldCount)
    .map((w) => composeWorld(w, CHILD, "en"));
  const scenes: SceneConfig[] = worlds.flatMap((w) =>
    boardSlugs(w).map(
      (slug) =>
        ({
          slug,
          worldSlug: w.slug,
          version: 1,
          name: slug,
          tagline: "",
          artStatus: "final",
          art: { width: 3072, height: 2048, base: "", thumbnail: "", palette: w.map.palette },
          targets: [],
          celebration: { kind: "stars", completeText: "" },
          collectible: { id: `c_${slug}`, name: slug, icon: "*" },
          sounds: {},
        }) as unknown as SceneConfig,
    ),
  );
  return {
    version: 1,
    gameId: `gam_${worldCount}`,
    locale: "en",
    child: CHILD,
    styleVersion: "v1",
    packageTier: worldCount === 1 ? "ONE_WORLD" : worldCount === 2 ? "TWO_WORLDS" : "ALL_WORLDS",
    scenes,
    worlds,
    world: worlds[0],
    composedAt: new Date(0).toISOString(),
  };
}

/** Mark every board of one world finished. */
function finish(progress: GameProgress, config: GameConfig, worldSlug: string): GameProgress {
  const scenes = Object.fromEntries(
    scenesOfWorld(config, worldSlug).map((s) => [s.slug, { completed: true, plays: 1, foundTargets: [], collected: true, lastVariants: {}, lastOrder: [] }]),
  );
  return { ...progress, scenes: { ...progress.scenes, ...scenes } } as GameProgress;
}

describe("a game that spans several worlds", () => {
  it.each([
    [1, 9],
    [2, 18],
    [3, 27],
  ])("carries %i worlds and %i boards", (worldCount, boards) => {
    const config = configFor(worldCount);
    expect(gameWorlds(config)).toHaveLength(worldCount);
    expect(config.scenes).toHaveLength(boards);
  });

  it("gives every board back to the world it came from", () => {
    const config = configFor(3);
    for (const world of gameWorlds(config)) {
      for (const slug of boardSlugs(world)) {
        expect(worldOfScene(config, slug)?.slug, slug).toBe(world.slug);
      }
    }
  });

  it("splits the boards nine and nine, never eighteen on one map", () => {
    const config = configFor(2);
    for (const world of gameWorlds(config)) {
      expect(scenesOfWorld(config, world.slug), world.slug).toHaveLength(9);
    }
  });

  it("counts progress inside a world, so a finished journey cannot read 10 of 9", () => {
    const config = configFor(2);
    const [first, second] = gameWorlds(config);
    if (!first || !second) throw new Error("expected two worlds");

    const progress = finish(emptyProgress(config.gameId), config, first.slug);
    const doneIn = (slug: string) => scenesOfWorld(config, slug).filter((s) => sceneProgress(progress, s.slug).completed).length;

    expect(doneIn(first.slug)).toBe(9);
    expect(doneIn(first.slug)).toBeLessThanOrEqual(first.nodes.length);
    // And finishing the first journey must not light up the second.
    expect(doneIn(second.slug)).toBe(0);
  });

  it("keeps each world's own keepsake and map, not the first world's", () => {
    const config = configFor(3);
    const [a, b, c] = gameWorlds(config);
    const icons = [a?.collectible.icon, b?.collectible.icon, c?.collectible.icon];
    expect(new Set(icons).size, `keepsakes: ${icons.join(", ")}`).toBe(3);
    const arts = [a?.map.art, b?.map.art, c?.map.art];
    expect(new Set(arts).size, `maps: ${arts.join(", ")}`).toBe(3);
  });

  it("still reads a config written before worlds existed", () => {
    const config = configFor(1);
    const old = { ...config, worlds: undefined };
    expect(gameWorlds(old)).toHaveLength(1);
    expect(worldOfScene(old, old.scenes[0]!.slug)?.slug).toBe(config.world?.slug);
  });
});
