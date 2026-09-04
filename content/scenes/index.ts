import { validateSceneDefinition, type SceneDefinition } from "@/domain/scene/schema";
import newyork from "./newyork/scene.json";
import beach from "./beach/scene.json";
import jungle from "./jungle/scene.json";
import space from "./space/scene.json";
import stadium from "./stadium/scene.json";
import city from "./city/scene.json";
import market from "./market/scene.json";
import park from "./park/scene.json";
import ship from "./ship/scene.json";
import volcano from "./volcano/scene.json";

/**
 * The scene catalog is data. Adding a world = adding a folder with
 * scene.json (+ art) and one import line here. Nothing else changes.
 *
 * Order here is the display order on the map and in the picker.
 */
const RAW_SCENES: unknown[] = [newyork, beach, jungle, space, city, ship, stadium, market, park, volcano];

export interface CatalogEntry {
  scene: SceneDefinition;
  warnings: string[];
}

function loadCatalog(): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  const slugs = new Set<string>();
  for (const raw of RAW_SCENES) {
    const result = validateSceneDefinition(raw);
    if (!result.ok || !result.scene) {
      const slug = (raw as { slug?: string })?.slug ?? "(unknown)";
      throw new Error(`Invalid scene definition "${slug}":\n  ${result.errors.join("\n  ")}`);
    }
    if (slugs.has(result.scene.slug)) throw new Error(`Duplicate scene slug "${result.scene.slug}"`);
    slugs.add(result.scene.slug);
    entries.push({ scene: result.scene, warnings: result.warnings });
  }
  return entries;
}

export const SCENE_CATALOG: readonly CatalogEntry[] = loadCatalog();

export function allScenes(): SceneDefinition[] {
  return SCENE_CATALOG.map((e) => e.scene);
}

export function findScene(slug: string): SceneDefinition | undefined {
  return SCENE_CATALOG.find((e) => e.scene.slug === slug)?.scene;
}
