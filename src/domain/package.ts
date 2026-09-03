import type { LocalizedText } from "@/i18n/config";

/**
 * Packages are the only pricing axis: more worlds, more searches.
 * Every world always has exactly TARGETS_PER_SCENE missions.
 *
 * Prices are per currency, in minor units (agorot / cents). The currency
 * follows the parent's language (he → ILS, en → USD); see i18n/config.
 */
export const TARGETS_PER_SCENE = 3 as const;

export type PackageTier = "SMALL" | "BIG" | "WORLD";
export type Currency = "ILS" | "USD";

export interface PackageDefinition {
  tier: PackageTier;
  name: LocalizedText;
  sceneCount: number;
  /** Minor units per currency: ILS agorot, USD cents. */
  prices: Record<Currency, number>;
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
    prices: { ILS: 2900, USD: 900 },
    playtime: { en: "10–15 min", he: "10–15 דקות" },
    popular: false,
    recommendedScenes: ["beach", "jungle", "space"],
  },
  BIG: {
    tier: "BIG",
    name: { en: "Big Adventure", he: "ההרפתקה הגדולה" },
    sceneCount: 6,
    prices: { ILS: 3900, USD: 1200 },
    playtime: { en: "20–30 min", he: "20–30 דקות" },
    popular: true,
    recommendedScenes: ["beach", "jungle", "space", "city", "ship", "stadium"],
  },
  WORLD: {
    tier: "WORLD",
    name: { en: "Around the World", he: "מסביב לעולם" },
    sceneCount: 9,
    prices: { ILS: 5900, USD: 1800 },
    playtime: { en: "35–50 min", he: "35–50 דקות" },
    popular: false,
    recommendedScenes: ["beach", "jungle", "space", "city", "ship", "stadium", "market", "park", "volcano"],
  },
};

export const PACKAGE_ORDER: PackageTier[] = ["SMALL", "BIG", "WORLD"];

export function isPackageTier(value: unknown): value is PackageTier {
  return value === "SMALL" || value === "BIG" || value === "WORLD";
}

export function isCurrency(value: unknown): value is Currency {
  return value === "ILS" || value === "USD";
}

export function priceFor(tier: PackageTier, currency: Currency): number {
  return PACKAGES[tier].prices[currency];
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

/** Minor units → display string with the currency's own convention. */
export function formatMoney(minor: number, currency: Currency, locale: "en" | "he" = "en"): string {
  const n = minor / 100;
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2);
  if (currency === "USD") return `$${s}`;
  return locale === "he" ? `${s} ₪` : `₪${s}`;
}

/** Internal/admin screens: amount with its currency, Hebrew convention. */
export function formatPriceILS(minor: number, currency: Currency = "ILS"): string {
  return formatMoney(minor, currency, "he");
}

/** Default worlds for a tier, restricted to the ones currently active, filled from the rest. */
export function defaultSceneSelection(tier: PackageTier, activeSlugs: readonly string[]): string[] {
  const want = PACKAGES[tier].sceneCount;
  const preferred = PACKAGES[tier].recommendedScenes.filter((s) => activeSlugs.includes(s));
  const rest = activeSlugs.filter((s) => !preferred.includes(s));
  return [...preferred, ...rest].slice(0, want);
}
