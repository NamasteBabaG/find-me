import { SCENE_CATALOG, findScene } from "../../content/scenes";
import type { SceneDefinition } from "@/domain/scene/schema";
import type { Container } from "./container";

/**
 * Catalog = JSON definitions (code) ∩ operational overrides (DB).
 * A world is sellable only if it is active in both.
 */
export async function activeScenes(c: Container): Promise<SceneDefinition[]> {
  // Admin overrides live in the DB; the catalog is the source of truth, so a missing DB only disables the overrides.
  let off = new Set<string>();
  try {
    const overrides = await c.db.sceneOverride.findMany();
    off = new Set(overrides.filter((o) => !o.active).map((o) => o.slug));
  } catch (err) {
    console.warn("[scenes] overrides unavailable, using the catalog as-is:", err instanceof Error ? err.message.split("\n")[0] : err);
  }
  return SCENE_CATALOG.map((e) => e.scene).filter((s) => s.active && !off.has(s.slug));
}

export async function activeSceneSlugs(c: Container): Promise<string[]> {
  return (await activeScenes(c)).map((s) => s.slug);
}

export function sceneBySlug(slug: string): SceneDefinition {
  const s = findScene(slug);
  if (!s) throw new Error(`Unknown scene "${slug}"`);
  return s;
}

export async function catalogForAdmin(c: Container) {
  const overrides = new Map((await c.db.sceneOverride.findMany()).map((o) => [o.slug, o]));
  return SCENE_CATALOG.map(({ scene, warnings }) => ({
    scene,
    warnings,
    override: overrides.get(scene.slug) ?? null,
    effectiveActive: scene.active && (overrides.get(scene.slug)?.active ?? true),
  }));
}

export async function setSceneActive(c: Container, slug: string, active: boolean, note?: string): Promise<void> {
  sceneBySlug(slug);
  await c.db.sceneOverride.upsert({
    where: { slug },
    create: { slug, active, note: note ?? null },
    update: { active, note: note ?? null },
  });
}
