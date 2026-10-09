import type { DetectiveRelease } from "@/domain/search-level";

/**
 * Detectives board releases that may be sold. Empty on purpose.
 *
 * The journey Detectives art and its 27 placements are authored
 * (docs/DETECTIVES_PLACEMENTS_AUTHORING_20261008.md), but they are not a
 * runtime release yet: discoveries, postcards, thumbnails, the art manifest,
 * the identity-style source and a content version the engine accepts are all
 * missing. A world is listed here only when that whole chain is validated.
 * Until then Detectives is never offered for it, and a Detectives draft never
 * falls back to Explorers boards.
 */
export const DETECTIVE_RELEASES: readonly DetectiveRelease[] = [];
