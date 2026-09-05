import type { LocalizedText } from "@/i18n/config";

/**
 * What a parent buys is a WORLD: nine boards, twenty-seven searches, one
 * illustrated journey. Packages differ only in how many worlds are included.
 *
 * Prices are per currency, in minor units (agorot / cents). The currency
 * follows the visitor's location; see i18n/server.
 */
export const BOARDS_PER_WORLD = 9 as const;
export const MISSIONS_PER_BOARD = 3 as const;
/** Kept under the old name because scene JSON and the renderer still say "scene". */
export const TARGETS_PER_SCENE = MISSIONS_PER_BOARD;

export type PackageTier = "ONE_WORLD" | "TWO_WORLDS" | "ALL_WORLDS";
export type Currency = "ILS" | "USD";

export interface PackageDefinition {
  tier: PackageTier;
  name: LocalizedText;
  worldCount: number;
  /** Minor units per currency: ILS agorot, USD cents. */
  prices: Record<Currency, number>;
  /** Approximate first-play time, shown as a product target — not a promise. */
  playtime: LocalizedText;
  popular: boolean;
}

export const PACKAGES: Record<PackageTier, PackageDefinition> = {
  ONE_WORLD: {
    tier: "ONE_WORLD",
    name: { en: "First Adventure", he: "ההרפתקה הראשונה" },
    worldCount: 1,
    prices: { ILS: 3900, USD: 990 },
    playtime: { en: "around half an hour", he: "בערך חצי שעה" },
    popular: false,
  },
  TWO_WORLDS: {
    tier: "TWO_WORLDS",
    name: { en: "Big Journey", he: "המסע הגדול" },
    worldCount: 2,
    prices: { ILS: 6900, USD: 1990 },
    playtime: { en: "around an hour", he: "בערך שעה" },
    popular: true,
  },
  ALL_WORLDS: {
    tier: "ALL_WORLDS",
    name: { en: "All Worlds", he: "כל העולמות" },
    worldCount: 3,
    prices: { ILS: 9900, USD: 2990 },
    playtime: { en: "an hour or two", he: "שעה–שעתיים" },
    popular: false,
  },
};

export const PACKAGE_ORDER: PackageTier[] = ["ONE_WORLD", "TWO_WORLDS", "ALL_WORLDS"];

export function isPackageTier(value: unknown): value is PackageTier {
  return value === "ONE_WORLD" || value === "TWO_WORLDS" || value === "ALL_WORLDS";
}

export function isCurrency(value: unknown): value is Currency {
  return value === "ILS" || value === "USD";
}

export function priceFor(tier: PackageTier, currency: Currency): number {
  return PACKAGES[tier].prices[currency];
}

export function boardsFor(tier: PackageTier): number {
  return PACKAGES[tier].worldCount * BOARDS_PER_WORLD;
}

export function searchesFor(tier: PackageTier): number {
  return boardsFor(tier) * MISSIONS_PER_BOARD;
}

export function tierForWorldCount(worldCount: number): PackageTier | null {
  return PACKAGE_ORDER.find((t) => PACKAGES[t].worldCount === worldCount) ?? null;
}

/** A tier is purchasable only when enough worlds exist to fill it. */
export function purchasableTiers(activeWorldCount: number): PackageDefinition[] {
  return PACKAGE_ORDER.map((t) => PACKAGES[t]).filter((p) => p.worldCount <= activeWorldCount);
}

// ─── Upgrades ────────────────────────────────────────────────

export interface UpgradeOffer {
  /** How many worlds this offer adds. */
  addsWorlds: number;
  /** What the parent will own afterwards. */
  totalWorlds: number;
  tier: PackageTier;
  price: number;
}

/**
 * The price of adding worlds is the difference between what you own and what
 * you would own. That is not a discount policy, it is the whole rule: buying
 * one world and upgrading twice costs exactly the same as buying all three, so
 * nobody is ever punished for starting small.
 */
export function upgradePrice(ownedWorlds: number, targetWorlds: number, currency: Currency): number | null {
  const from = tierForWorldCount(ownedWorlds);
  const to = tierForWorldCount(targetWorlds);
  if (!to || targetWorlds <= ownedWorlds) return null;
  const base = from ? priceFor(from, currency) : 0;
  return priceFor(to, currency) - base;
}

/**
 * What to offer a parent who already owns some worlds: one more, or all the
 * rest. Nothing at all once they own everything that exists.
 */
export function upgradeOffers(ownedWorlds: number, availableWorlds: number, currency: Currency): UpgradeOffer[] {
  const offers: UpgradeOffer[] = [];
  const most = Math.min(availableWorlds, PACKAGES.ALL_WORLDS.worldCount);
  for (const totalWorlds of [ownedWorlds + 1, most]) {
    if (totalWorlds <= ownedWorlds || totalWorlds > most) continue;
    if (offers.some((o) => o.totalWorlds === totalWorlds)) continue;
    const tier = tierForWorldCount(totalWorlds);
    const price = upgradePrice(ownedWorlds, totalWorlds, currency);
    if (!tier || price === null) continue;
    offers.push({ addsWorlds: totalWorlds - ownedWorlds, totalWorlds, tier, price });
  }
  return offers;
}

// ─── Money ───────────────────────────────────────────────────

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

/** The worlds a tier includes, in world order, restricted to what is active. */
export function defaultWorldSelection(tier: PackageTier, activeSlugs: readonly string[]): string[] {
  return activeSlugs.slice(0, PACKAGES[tier].worldCount);
}
