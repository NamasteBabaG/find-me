import { adventureFixture } from "@/domain/adventure/__tests__/fixture";
import { attachAdventureBook } from "@/domain/adventure/compose";
import { GameConfigSchema, type GameConfig, type PlayWorld } from "@/domain/game/config";

/** Synthetic pixels/identities only. Never reads authored art or child photos. */
export function guestConfig(gameId = "synthetic-friends-game", worlds = 2): GameConfig {
  const fixture = adventureFixture(3), first = attachAdventureBook(fixture.config, fixture.catalog, ["pilot-test"]);
  const scene = first.scenes[0]!, board = first.adventure!.boards[0]!;
  const world = (index: number): PlayWorld => ({ slug: `world-${index}`, version: 1, name: `World ${index}`, tagline: "Synthetic", intro: "Synthetic",
    map: { width: 1600, height: 900, art: "/synthetic-map.webp", palette: { sky: "#fff", ground: "#fff", accent: "#fff" } },
    nodes: Array.from({ length: 9 }, (_, n) => ({ boardSlug: `board-${index}-${n + 1}`, routeIndex: n + 1, x: .5, y: .5, labelAnchor: "top", markerScale: 1, travelStyle: "walk" })),
    collectible: { id: `stamp-${index}`, name: "Stamp", piece: "Stamp", icon: "star" }, completion: { title: "Done", text: "Done", icon: "star" } });
  const allWorlds = Array.from({ length: worlds }, (_, n) => world(n + 1));
  const scenes = allWorlds.flatMap(w => w.nodes.map(node => ({ ...structuredClone(scene), slug: node.boardSlug, worldSlug: w.slug })));
  const boards = allWorlds.flatMap(w => w.nodes.map(node => ({ ...structuredClone(board), boardSlug: node.boardSlug, worldSlug: w.slug })));
  return GameConfigSchema.parse({ ...first, gameId, scenes, worlds: allWorlds, world: allWorlds[0],
    gift: { fromName: "Synthetic sender", message: "Not for guests" }, adventure: { ...first.adventure, boards } });
}
