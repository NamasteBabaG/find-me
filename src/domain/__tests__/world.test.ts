import { describe, expect, it } from "vitest";
import {
  BOARDS_PER_WORLD,
  boardSlugs,
  collectedPieces,
  currentBoard,
  EMPTY_PROGRESS,
  isBoardPlayable,
  isWorldComplete,
  nextBoard,
  nodeStates,
  outOfOrderWorlds,
  WorldDefinitionSchema,
  type WorldDefinition,
} from "@/domain/world";

const ORDER = ["beach", "ship", "city", "market", "park", "stadium", "jungle", "volcano", "space"];

/** A world shaped like World 1, built through the schema so defaults apply. */
const world: WorldDefinition = WorldDefinitionSchema.parse({
  slug: "journey",
  order: 1,
  name: { en: "The Wonderful Journey", he: "המסע המופלא" },
  tagline: { en: "nine destinations", he: "תשעה יעדים" },
  intro: { en: "A magical passport", he: "דרכון קסום" },
  map: { width: 2048, height: 1280, art: "/worlds/journey/map.webp", palette: { sky: "#a5e6ff", ground: "#f4d9a0", accent: "#ff8a4c" } },
  // Deliberately out of order in the file: routeIndex is the journey, not array order.
  nodes: [...ORDER]
    .map((slug, i) => ({ boardSlug: slug, routeIndex: i + 1, x: 0.1 + i * 0.09, y: 0.5, iconAsset: `/worlds/journey/${slug}.webp` }))
    .reverse(),
  collectible: { id: "stamp", name: { en: "Passport", he: "דרכון" }, piece: { en: "stamp", he: "חותמת" }, icon: "🛂" },
  completion: { title: { en: "What a journey", he: "איזה מסע" }, text: { en: "done", he: "הושלם" }, icon: "🌍" },
  version: 1,
});

describe("world definition", () => {
  it("orders the journey by routeIndex, not by how the file happens to list nodes", () => {
    expect(boardSlugs(world)).toEqual(ORDER);
    expect(world.nodes).toHaveLength(BOARDS_PER_WORLD);
  });

  it("refuses a world that is not nine boards", () => {
    const eight = { ...world, nodes: world.nodes.slice(1) };
    expect(WorldDefinitionSchema.safeParse(eight).success).toBe(false);
  });
});

describe("progression", () => {
  it("starts the child at the first destination with the second waking up", () => {
    const states = nodeStates(world, EMPTY_PROGRESS);
    expect(states.beach).toBe("current");
    expect(states.ship).toBe("next");
    expect(states.city).toBe("future");
    expect(currentBoard(world, EMPTY_PROGRESS)).toBe("beach");
  });

  it("moves the marker on as boards are finished, whatever order they arrive in", () => {
    const progress = { completedBoards: ["ship", "beach"] };
    const states = nodeStates(world, progress);
    expect(states.beach).toBe("completed");
    expect(states.ship).toBe("completed");
    expect(states.city).toBe("current");
    expect(states.market).toBe("next");
    expect(currentBoard(world, progress)).toBe("city");
    expect(nextBoard(world, progress)).toBe("city");
  });

  it("keeps finished boards open and the rest closed but friendly", () => {
    const progress = { completedBoards: ["beach"] };
    expect(isBoardPlayable(world, progress, "beach")).toBe(true);
    expect(isBoardPlayable(world, progress, "ship")).toBe(true); // current
    expect(isBoardPlayable(world, progress, "space")).toBe(false); // a later destination
    expect(isBoardPlayable(world, progress, "nowhere")).toBe(false);
  });

  it("opens the whole world once the journey has been finished", () => {
    const done = { completedBoards: ORDER };
    expect(isWorldComplete(world, done)).toBe(true);
    for (const slug of ORDER) expect(isBoardPlayable(world, done, slug)).toBe(true);
    // The marker stays at the last destination rather than falling off the end.
    expect(currentBoard(world, done)).toBe("space");
    expect(nextBoard(world, done)).toBeNull();
    expect(collectedPieces(world, done)).toBe(9);
  });

  it("counts only pieces from this world", () => {
    expect(collectedPieces(world, { completedBoards: ["beach", "somewhere-else"] })).toBe(1);
  });
});

describe("worlds are bought in order", () => {
  const world = (slug: string, order: number) => ({ slug, order }) as never;
  const three = [world("journey", 1), world("second", 2), world("third", 3)];

  it("accepts the first world on its own", () => {
    expect(outOfOrderWorlds(["journey"], three)).toEqual([]);
  });

  it("accepts the first two", () => {
    expect(outOfOrderWorlds(["journey", "second"], three)).toEqual([]);
  });

  it("does not care what order they were listed in", () => {
    expect(outOfOrderWorlds(["second", "journey"], three)).toEqual([]);
  });

  it("refuses the second world without the first", () => {
    // A journey that starts in the middle, with the harder boards, for a child
    // who has not played the easier ones.
    expect(outOfOrderWorlds(["second"], three)).toEqual(["journey"]);
  });

  it("refuses a gap in the middle", () => {
    expect(outOfOrderWorlds(["journey", "third"], three)).toEqual(["second"]);
  });
});
