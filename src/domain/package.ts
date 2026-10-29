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

/**
 * One price for every world (Guy, 2026-10-29: 29 ₪ a world for the launch): the first, the second and a world
 * added months later cost the same, so a purchase never depends on what the child already owns.
 */
export const WORLD_PRICE: Record<Currency, number> = { ILS: 2900, USD: 1000 };
export function worldPurchasePrice(worldCount: number, currency: Currency): number {
  if (!Number.isSafeInteger(worldCount) || worldCount < 1) throw Error("Invalid world count");
  const total = worldCount * WORLD_PRICE[currency];
  if (!Number.isSafeInteger(total)) throw Error("Invalid purchase amount");
  return total;
}

export interface PackageDefinition {
  tier: PackageTier;
  name: LocalizedText;
  worldCount: number;
  /** Minor units per currency: ILS agorot, USD cents. */
  prices: Record<Currency, number>;
  /** Approximate first-play time, shown as a product target — not a promise. */
  playtime: LocalizedText;
}

export const PACKAGES: Record<PackageTier, PackageDefinition> = {
  ONE_WORLD: {
    tier: "ONE_WORLD",
    name: { en: "First adventure", he: "הרפתקה ראשונה" },
    worldCount: 1,
    prices: { ILS: worldPurchasePrice(1, "ILS"), USD: worldPurchasePrice(1, "USD") },
    playtime: { en: "around half an hour", he: "בערך חצי שעה" },
  },
  TWO_WORLDS: {
    tier: "TWO_WORLDS",
    name: { en: "Two worlds", he: "שני עולמות" },
    worldCount: 2,
    prices: { ILS: worldPurchasePrice(2, "ILS"), USD: worldPurchasePrice(2, "USD") },
    playtime: { en: "around an hour", he: "בערך שעה" },
  },
  ALL_WORLDS: {
    tier: "ALL_WORLDS",
    // Historical database key; this always buys exactly three chosen worlds.
    name: { en: "Three worlds", he: "שלושה עולמות" },
    worldCount: 3,
    prices: { ILS: worldPurchasePrice(3, "ILS"), USD: worldPurchasePrice(3, "USD") },
    playtime: { en: "an hour or two", he: "שעה–שעתיים" },
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
  return worldPurchasePrice(PACKAGES[tier].worldCount, currency);
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
  /** What this child will own afterwards. */
  totalWorlds: number;
  /** Package of new worlds being bought, not a lifetime tier. */
  tier: PackageTier;
  price: number;
}

/**
 * Every added world costs the world price, including after a price change
 * or a long gap. Previous amounts paid are never subtracted from a new order.
 */
export function upgradePrice(ownedWorlds: number, targetWorlds: number, currency: Currency): number | null {
  if (!Number.isSafeInteger(ownedWorlds) || ownedWorlds < 0 || !Number.isSafeInteger(targetWorlds) || targetWorlds <= ownedWorlds) return null;
  return worldPurchasePrice(targetWorlds - ownedWorlds, currency);
}

/**
 * One, two or three more choices from the available catalog. No lifetime
 * all-world bundle, including when the catalog grows beyond three worlds.
 */
export function upgradeOffers(ownedWorlds: number, availableWorlds: number, currency: Currency): UpgradeOffer[] {
  const offers: UpgradeOffer[] = [];
  for (const tier of PACKAGE_ORDER) {
    const totalWorlds = ownedWorlds + PACKAGES[tier].worldCount;
    if (totalWorlds > availableWorlds) continue;
    const price = upgradePrice(ownedWorlds, totalWorlds, currency);
    if (price === null) continue;
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
