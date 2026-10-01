import { gameWorlds, type GameConfig } from "../game/config";
import type { AdventureProgress } from "./progress";

/** The finds a game's account album holds, by board. Only what the summary reads. */
export type FoundSoFar = Pick<AdventureProgress, "finds"> & { book: { boards: ReadonlyArray<{ boardSlug: string; targetIds: readonly string[] }> } };

/**
 * One world of a game as the family area shows it: its map, how far the child has come, and where they stand.
 * The same counts as the child's map: a place is stamped once every hiding spot on it was found, and every
 * hiding spot found is a gold star.
 */
export type WorldSummary = {
  slug: string;
  name: string;
  map: { art: string; width: number; height: number };
  places: number;
  stamped: number;
  stars: number;
  starsTotal: number;
  /** Where the child stands: the first place on the route not finished yet, or the last place once all are. */
  here: { boardSlug: string; name: string; x: number; y: number };
  /** Each place in route order: stamped, where the child stands, or still ahead. */
  route: Array<"stamped" | "here" | "ahead">;
};

/**
 * Pure: no account, asset or URL. `progress` is null when the account keeps no album for this game (an older
 * format whose progress lives in the child's browser): the map is still shown, with the child at the start.
 */
export function summarizeWorlds(config: GameConfig, progress: FoundSoFar | null): WorldSummary[] {
  const scenes = new Map(config.scenes.map(scene => [scene.slug, scene]));
  return gameWorlds(config).flatMap(world => {
    const route = world.nodes.filter(node => scenes.has(node.boardSlug)).sort((a, b) => a.routeIndex - b.routeIndex);
    if (route.length === 0) return [];
    const places = route.map(node => {
      const board = progress?.book.boards.find(b => b.boardSlug === node.boardSlug);
      const total = board ? board.targetIds.length : scenes.get(node.boardSlug)!.targets.length;
      const found = board ? new Set(progress!.finds.filter(f => f.boardSlug === node.boardSlug && board.targetIds.includes(f.targetId)).map(f => f.targetId)).size : 0;
      return { node, total, found, stamped: total > 0 && found >= total };
    });
    const here = places.find(place => !place.stamped) ?? places[places.length - 1]!;
    return [{
      slug: world.slug,
      name: world.name,
      // The smaller map, where a world ships one: the same picture at the same proportions.
      map: { art: world.map.artPortrait ?? world.map.art, width: world.map.width, height: world.map.height },
      places: places.length,
      stamped: places.filter(place => place.stamped).length,
      stars: places.reduce((n, place) => n + place.found, 0),
      starsTotal: places.reduce((n, place) => n + place.total, 0),
      here: { boardSlug: here.node.boardSlug, name: scenes.get(here.node.boardSlug)!.name, x: here.node.x, y: here.node.y },
      route: places.map(place => place.stamped ? "stamped" : place === here ? "here" : "ahead"),
    }];
  });
}
