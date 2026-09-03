import { describe, expect, it } from "vitest";
import {
  PACKAGES,
  PACKAGE_ORDER,
  boardsFor,
  formatMoney,
  isPackageTier,
  priceFor,
  purchasableTiers,
  searchesFor,
  tierForWorldCount,
  upgradeOffers,
  upgradePrice,
  type Currency,
} from "@/domain/package";

const CURRENCIES: Currency[] = ["ILS", "USD"];

describe("packages", () => {
  it("sells worlds: 9 boards and 27 searches each", () => {
    expect(boardsFor("ONE_WORLD")).toBe(9);
    expect(searchesFor("ONE_WORLD")).toBe(27);
    expect(boardsFor("ALL_WORLDS")).toBe(27);
    expect(searchesFor("ALL_WORLDS")).toBe(81);
  });

  it("prices the ladder as briefed", () => {
    expect(formatMoney(priceFor("ONE_WORLD", "ILS"), "ILS", "he")).toBe("39 ₪");
    expect(formatMoney(priceFor("TWO_WORLDS", "ILS"), "ILS", "he")).toBe("69 ₪");
    expect(formatMoney(priceFor("ALL_WORLDS", "ILS"), "ILS", "he")).toBe("99 ₪");
    expect(formatMoney(priceFor("ONE_WORLD", "USD"), "USD")).toBe("$9.90");
    expect(formatMoney(priceFor("ALL_WORLDS", "USD"), "USD")).toBe("$29.90");
  });

  it("hides tiers there are not enough worlds for", () => {
    expect(purchasableTiers(1).map((p) => p.tier)).toEqual(["ONE_WORLD"]);
    expect(purchasableTiers(2).map((p) => p.tier)).toEqual(["ONE_WORLD", "TWO_WORLDS"]);
    expect(purchasableTiers(3).map((p) => p.tier)).toEqual(PACKAGE_ORDER);
  });

  it("only accepts the tiers it defines", () => {
    expect(isPackageTier("ONE_WORLD")).toBe(true);
    expect(isPackageTier("SMALL")).toBe(false);
    expect(tierForWorldCount(2)).toBe("TWO_WORLDS");
    expect(tierForWorldCount(7)).toBeNull();
  });
});

describe("upgrades", () => {
  it("never costs more to arrive one world at a time", () => {
    for (const currency of CURRENCIES) {
      const all = priceFor("ALL_WORLDS", currency);
      const stepByStep = priceFor("ONE_WORLD", currency) + upgradePrice(1, 2, currency)! + upgradePrice(2, 3, currency)!;
      const oneThenTwo = priceFor("ONE_WORLD", currency) + upgradePrice(1, 3, currency)!;
      expect(stepByStep).toBe(all);
      expect(oneThenTwo).toBe(all);
      expect(priceFor("TWO_WORLDS", currency) + upgradePrice(2, 3, currency)!).toBe(all);
    }
  });

  it("charges the difference, in both currencies", () => {
    expect(formatMoney(upgradePrice(1, 2, "ILS")!, "ILS", "he")).toBe("30 ₪");
    expect(formatMoney(upgradePrice(1, 3, "ILS")!, "ILS", "he")).toBe("60 ₪");
    expect(formatMoney(upgradePrice(2, 3, "ILS")!, "ILS", "he")).toBe("30 ₪");
    expect(formatMoney(upgradePrice(1, 2, "USD")!, "USD")).toBe("$10");
  });

  it("refuses a downgrade or a world count that is not sold", () => {
    expect(upgradePrice(2, 1, "ILS")).toBeNull();
    expect(upgradePrice(1, 1, "ILS")).toBeNull();
    expect(upgradePrice(1, 4, "ILS")).toBeNull();
  });

  it("offers one more world or all the rest, and nothing once everything is owned", () => {
    const one = upgradeOffers(1, 3, "ILS");
    expect(one.map((o) => [o.addsWorlds, o.price])).toEqual([
      [1, 3000],
      [2, 6000],
    ]);
    // With two owned, one more IS all the rest: offer it once, not twice.
    const two = upgradeOffers(2, 3, "ILS");
    expect(two.map((o) => [o.addsWorlds, o.price])).toEqual([[1, 3000]]);
    expect(upgradeOffers(3, 3, "ILS")).toEqual([]);
    // A world that does not exist yet is never offered.
    expect(upgradeOffers(1, 1, "ILS")).toEqual([]);
    expect(upgradeOffers(1, 2, "ILS").map((o) => o.addsWorlds)).toEqual([1]);
  });

  it("names the tier the parent ends up owning", () => {
    expect(upgradeOffers(1, 3, "ILS").map((o) => o.tier)).toEqual(["TWO_WORLDS", "ALL_WORLDS"]);
  });
});
