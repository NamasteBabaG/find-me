import { describe, expect, it } from "vitest";
import { en } from "../dictionaries/en";
import { he } from "../dictionaries/he";

function leaves(value: unknown, prefix = ""): Record<string, string> {
  if (typeof value === "string") return { [prefix]: value };
  return Object.fromEntries(Object.entries(value as object).flatMap(([key, child]) =>
    Object.entries(leaves(child, prefix ? `${prefix}.${key}` : key))));
}

const placeholders = (value: string) => [...new Set([...value.matchAll(/\{([a-zA-Z]+)\}/g)].map(m => m[1]))].sort();

describe("current product copy", () => {
  it("keeps Hebrew and English keys and runtime placeholders aligned", () => {
    const english = leaves(en), hebrew = leaves(he);
    expect(Object.keys(hebrew).sort()).toEqual(Object.keys(english).sort());
    for (const key of Object.keys(english)) {
      expect(placeholders(hebrew[key]!), key).toEqual(placeholders(english[key]!));
      expect(hebrew[key]?.trim(), key).not.toBe("");
    }
  });
  it("does not market a fixed hide count or an album that standard purchases do not include", () => {
    for (const dict of [en, he]) {
      const home = Object.values(leaves(dict.home)).join(" ");
      expect(home).not.toMatch(/81|שלושה מחבואים בכל|three hiding spots in each|COMMON|RARE|EPIC/);
      expect(dict.home.pricing.feats.boards).toContain("{boards}");
      expect(dict.home.pricing.feats.boards).not.toContain("{spots}");
      expect(dict.game.replay.note).toBeTruthy();
    }
  });
  it("does not promise no charge after an unknown error", () => {
    for (const dict of [en, he]) {
      expect(Object.values(dict.appError).join(" ")).not.toMatch(/לא חויב|nothing was charged|not charged/i);
    }
  });
});
