import { validChildAge } from "./child-appearance";

/**
 * How busy the boards are to search: the parent's explicit choice under the
 * child's name (Guy, 2026-10-09). Every board still has three hiding places.
 *
 * It is a separate fact from the child's exact age (ChildProfile.ageYears),
 * which alone decides the drawn body: an eight-year-old may choose Explorers
 * and is still drawn as eight, and a five-year-old on Detectives is never given
 * an older body. It is never inferred from a name, a face, the passport or a
 * translated label.
 */
export const SEARCH_LEVELS = ["explorers", "detectives"] as const;
export type SearchLevel = (typeof SEARCH_LEVELS)[number];

export function isSearchLevel(value: unknown): value is SearchLevel {
  return typeof value === "string" && (SEARCH_LEVELS as readonly string[]).includes(value);
}

/** The level a draft or game plays. NULL predates the choice and keeps the
 * historical (Explorers) boards; a value outside the closed list is corrupt
 * data, never a default. */
export function storedSearchLevel(value: string | null | undefined): SearchLevel {
  if (value == null) return "explorers";
  if (!isSearchLevel(value)) throw new Error("Unknown search level");
  return value;
}

/** The card a stated age suggests. A badge only: it never selects a level and
 * never replaces a choice already made. Age 2, below both cards, suggests the
 * gentler search. */
export function recommendedSearchLevel(ageYears: unknown): SearchLevel | null {
  if (!validChildAge(ageYears)) return null;
  return ageYears <= 5 ? "explorers" : "detectives";
}

/** One content release that serves Detectives for one world on one engine. */
export interface DetectiveRelease { worldSlug: string; styleVersion: string; sceneVersion: number }

/**
 * The Detectives release of one engine, or null when it has none. A draft pins
 * ONE content version for all of its boards, so every Detectives release on an
 * engine shares it; a world is listed once.
 */
export function detectiveRelease(releases: readonly DetectiveRelease[], styleVersion: string): { sceneVersion: number; worlds: ReadonlySet<string> } | null {
  const own = releases.filter(release => release.styleVersion === styleVersion);
  if (!own.length) return null;
  const versions = new Set(own.map(release => release.sceneVersion));
  if (versions.size !== 1 || !own.every(release => Number.isInteger(release.sceneVersion) && release.sceneVersion > 0)) {
    throw new Error("Detectives releases on one engine must share one content version");
  }
  const worlds = new Set(own.map(release => release.worldSlug));
  if (worlds.size !== own.length) throw new Error("A world is listed twice as a Detectives release");
  return { sceneVersion: own[0]!.sceneVersion, worlds };
}
