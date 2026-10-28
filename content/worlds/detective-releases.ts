import type { DetectiveRelease } from "@/domain/search-level";
import { DETECTIVES_SCENE_VERSION } from "../../src/domain/scene/local-patch-versions";

/** Explicit source-bound Journey family; never substitute Explorers content. */
export const JOURNEY_DETECTIVE_RUNTIME_RELEASE: DetectiveRelease = Object.freeze({
  worldSlug: "journey", styleVersion: "local-patch-world-v1", sceneVersion: DETECTIVES_SCENE_VERSION,
});

/** The complete scene13 controlled creation/review/recovery/player contract has
 * qualified. New offers still require SEARCH_LEVEL_CHOICE plus the QA-only
 * v19/full-source/lean/dual-v3 configuration in create-flow.service. This entry
 * neither activates production nor establishes live generated-art acceptance. */
export const KINGDOM_DETECTIVE_RUNTIME_RELEASE: DetectiveRelease = Object.freeze({
  worldSlug: "kingdom", styleVersion: "local-patch-world-v1", sceneVersion: DETECTIVES_SCENE_VERSION,
});
export const DETECTIVE_RELEASES: readonly DetectiveRelease[] = Object.freeze([JOURNEY_DETECTIVE_RUNTIME_RELEASE, KINGDOM_DETECTIVE_RUNTIME_RELEASE]);
