import type { LocalizedText } from "@/i18n/config";

/**
 * Packages are the only pricing axis: more worlds, more searches.
 * Every world always has exactly TARGETS_PER_SCENE missions.
 */
export const TARGETS_PER_SCENE = 3 as const;

export type PackageTier = "SMALL" | "BIG" | "WORLD";

export interface PackageDefinition {
  tier: PackageTier;
  name: LocalizedText;
  sceneCount: number;
  priceAgorot: number;
  /** Approximate first-play time, shown as a product target — not a promise. */
  playtime: LocalizedText;
  popular: boolean;
  /** Pre-selected worlds so a parent can just continue. */
  recommendedScenes: string[];
}

export const PACKAGES: Record<PackageTier, PackageDefinition> = {
  SMALL: {
    tier: "SMALL",
    name: { en: "Little Taste", he: "טעימה קטנה" },
    sceneCount: 3,
    priceAgorot: 1990,
    playtime: { en: "10–15 min", he: "10–15 דקות" },
    popular: false,
    recommendedScenes: ["beach", "jungle", "space"],
  },
  BIG: {
    tier: "BIG",
    name: { en: "Big Adventure", he: "ההרפתקה הגדולה" },
    sceneCount: 6,
    priceAgorot: 3990,
    playtime: { en: "20–30 min", he: "20–30 דקות" },
    popular: true,
    recommendedScenes: ["beach", "jungle", "space", "city", "ship", "stadium"],
  },
  WORLD: {
    tier: "WORLD",
    name: { en: "Around the World", he: "מסביב לעולם" },
    sceneCount: 9,
    priceAgorot: 5990,
    playtime: { en: "35–50 min", he: "35–50 דקות" },
    popular: false,
    recommendedScenes: ["beach", "jungle", "space", "city", "ship", "stadium", "market", "park", "volcano"],
  },
};

export const PACKAGE_ORDER: PackageTier[] = ["SMALL", "BIG", "WORLD"];

export function isPackageTier(value: unknown): value is PackageTier {
  return value === "SMALL" || value === "BIG" || value === "WORLD";
}

export function searchesFor(tier: PackageTier): number {
  return PACKAGES[tier].sceneCount * TARGETS_PER_SCENE;
}

/**
 * A tier is purchasable only when enough worlds are active.
 * This is the feature flag that hides 6/9 while only 3 worlds exist.
 */
export function purchasableTiers(activeSceneCount: number): PackageDefinition[] {
  return PACKAGE_ORDER.map((t) => PACKAGES[t]).filter((p) => p.sceneCount <= activeSceneCount);
}

/** Hebrew-style price for internal/admin screens; customer UI uses i18n formatPrice(). */
export function formatPriceILS(agorot: number): string {
  const shekels = agorot / 100;
  return `${Number.isInteger(shekels) ? shekels : shekels.toFixed(2)} ₪`;
}

/** Default worlds for a tier, restricted to the ones currently active, filled from the rest. */
export function defaultSceneSelection(tier: PackageTier, activeSlugs: readonly string[]): string[] {
  const want = PACKAGES[tier].sceneCount;
  const preferred = PACKAGES[tier].recommendedScenes.filter((s) => activeSlugs.includes(s));
  const rest = activeSlugs.filter((s) => !preferred.includes(s));
  return [...preferred, ...rest].slice(0, want);
}
