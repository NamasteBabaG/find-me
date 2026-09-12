import { validateSceneDefinition, type SceneDefinition } from "@/domain/scene/schema";
import amazon from "./amazon/scene.json";
import paris from "./paris/scene.json";
import marrakech from "./marrakech/scene.json";
import giza from "./giza/scene.json";
import tokyo from "./tokyo/scene.json";
import greatwall from "./greatwall/scene.json";
import sydney from "./sydney/scene.json";
import antarctica from "./antarctica/scene.json";
import castlegate from "./castlegate/scene.json";
import fairyforest from "./fairyforest/scene.json";
import dragoncave from "./dragoncave/scene.json";
import icepalace from "./icepalace/scene.json";
import underwater from "./underwater/scene.json";
import cloudcity from "./cloudcity/scene.json";
import sweetworkshop from "./sweetworkshop/scene.json";
import giantlibrary from "./giantlibrary/scene.json";
import nightcarnival from "./nightcarnival/scene.json";
import dinovalley from "./dinovalley/scene.json";
import pyramids from "./pyramids/scene.json";
import tournament from "./tournament/scene.json";
import piratecove from "./piratecove/scene.json";
import wildwest from "./wildwest/scene.json";
import steamrail from "./steamrail/scene.json";
import futurecity from "./futurecity/scene.json";
import robotlab from "./robotlab/scene.json";
import beyondstars from "./beyondstars/scene.json";
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
import preRefresh from "./releases/pre-refresh-20260907.json";
// The first world before its hiding spots were re-planned (version 2 of nine boards, same art).
import prePlacement from "./releases/pre-placement-20260907.json";
// The first world before its hides were authored against the board's own occluders (version 3 of nine boards, same art).
import preForeground from "./releases/pre-foreground-20260907.json";
// Version 4 of the boards that got placement contracts on 8 September 2026 (sydney, paris, giza, antarctica; same art). Game 2 pins these.
import preContract from "./releases/pre-contract-20260908.json";
import { localPatchSceneRelease } from "./local-patch-release";
import { localPatchFiveSceneRelease, localPatchStrictSceneRelease } from "./local-patch-five-release";
import { WORLD_LOCAL_PATCH_HIDES } from "../../src/domain/scene/local-patch-hides";

/**
 * The scene catalog is data. Adding a world = adding a folder with
 * scene.json (+ art) and one import line here. Nothing else changes.
 *
 * Order here is the display order on the map and in the picker.
 */
const RAW_SCENES: unknown[] = [newyork, beyondstars, robotlab, futurecity, steamrail, wildwest, piratecove, tournament, pyramids, dinovalley, nightcarnival, giantlibrary, sweetworkshop, cloudcity, underwater, icepalace, dragoncave, fairyforest, castlegate, antarctica, sydney, greatwall, tokyo, giza, marrakech, paris, amazon, beach, jungle, space, city, ship, stadium, market, park, volcano];

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

// Old definitions remain addressable for paid games and interrupted jobs.
// Never silently substitute current art for a requested historical version.
// Engine-specific versions are explicit opt-ins. Legacy games and new games on
// other engines keep the default catalog's original placements and artwork.
const localPatchVersions = RAW_SCENES.filter(raw => WORLD_LOCAL_PATCH_HIDES.some(board => board.board === (raw as { slug: string }).slug)).map(localPatchSceneRelease);
const fiveHideVersions = RAW_SCENES.filter(raw => WORLD_LOCAL_PATCH_HIDES.some(board => board.board === (raw as { slug: string }).slug)).map(localPatchFiveSceneRelease);
const strictHideVersions = RAW_SCENES.filter(raw => WORLD_LOCAL_PATCH_HIDES.some(board => board.board === (raw as { slug: string }).slug)).map(localPatchStrictSceneRelease);
const HISTORICAL_SCENES: readonly SceneDefinition[] = [...preRefresh, ...prePlacement, ...preForeground, ...preContract, ...localPatchVersions, ...fiveHideVersions, ...strictHideVersions].map(raw => {
  const parsed = validateSceneDefinition(raw);
  if (!parsed.ok || !parsed.scene) throw new Error(`Invalid archived scene ${(raw as { slug: string }).slug}: ${parsed.errors.join(", ")}`);
  return parsed.scene;
});

export function findScene(slug: string, version?: number): SceneDefinition | undefined {
  const current = SCENE_CATALOG.find((e) => e.scene.slug === slug)?.scene;
  if (version === undefined || current?.version === version) return current;
  return HISTORICAL_SCENES.find(scene => scene.slug === slug && scene.version === version);
}
