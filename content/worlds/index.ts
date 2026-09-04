import { findScene } from "../scenes";
import { BOARDS_PER_WORLD, WorldDefinitionSchema, boardSlugs, type WorldDefinition } from "@/domain/world";
import journey from "./journey/world.json";
import kingdom from "./kingdom/world.json";
import timetravel from "./timetravel/world.json";

/**
 * The world catalog is data, like the scene catalog. Adding a world = a folder
 * with world.json (+ map art) and one import line here.
 *
 * Order here is the order worlds are offered and played.
 */
const RAW_WORLDS: unknown[] = [journey, kingdom, timetravel];

export interface WorldCatalogEntry {
  world: WorldDefinition;
  warnings: string[];
}

function loadCatalog(): WorldCatalogEntry[] {
  const entries: WorldCatalogEntry[] = [];
  const slugs = new Set<string>();
  const claimed = new Map<string, string>();
  for (const raw of RAW_WORLDS) {
    const parsed = WorldDefinitionSchema.safeParse(raw);
    if (!parsed.success) {
      const slug = (raw as { slug?: string })?.slug ?? "(unknown)";
      throw new Error(`Invalid world definition "${slug}":\n  ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ")}`);
    }
    const world = parsed.data;
    if (slugs.has(world.slug)) throw new Error(`Duplicate world slug "${world.slug}"`);
    slugs.add(world.slug);

    const warnings: string[] = [];
    const order = world.nodes.map((n) => n.routeIndex).sort((a, b) => a - b);
    if (order.some((n, i) => n !== i + 1)) throw new Error(`World "${world.slug}": routeIndex must be 1..${BOARDS_PER_WORLD} with no gaps`);
    for (const slug of boardSlugs(world)) {
      // A board belongs to exactly one world: two worlds sharing one would make
      // ownership and progress ambiguous.
      const owner = claimed.get(slug);
      if (owner) throw new Error(`Board "${slug}" is already in world "${owner}"`);
      claimed.set(slug, world.slug);
      if (!findScene(slug)) throw new Error(`World "${world.slug}" refers to unknown board "${slug}"`);
    }
    // Nodes that overlap cannot both be tapped on a phone.
    for (const a of world.nodes) {
      for (const b of world.nodes) {
        if (a.routeIndex >= b.routeIndex) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) < 0.07) warnings.push(`nodes "${a.boardSlug}" and "${b.boardSlug}" are close enough to overlap on a phone`);
      }
    }
    entries.push({ world, warnings });
  }
  return entries.sort((a, b) => a.world.order - b.world.order);
}

export const WORLD_CATALOG: readonly WorldCatalogEntry[] = loadCatalog();

export function allWorlds(): WorldDefinition[] {
  return WORLD_CATALOG.map((e) => e.world);
}

export function activeWorlds(): WorldDefinition[] {
  return allWorlds().filter((w) => w.active);
}

export function findWorld(slug: string): WorldDefinition | undefined {
  return WORLD_CATALOG.find((e) => e.world.slug === slug)?.world;
}

/** Which world a board belongs to. */
export function worldOfBoard(boardSlug: string): WorldDefinition | undefined {
  return allWorlds().find((w) => w.nodes.some((n) => n.boardSlug === boardSlug));
}
