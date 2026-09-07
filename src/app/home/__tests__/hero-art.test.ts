import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import art from "../../../../content/home/hero-art.json";
import { sceneBySlug } from "@/services/scene-catalog.service";

describe("marketing board copies", () => {
  it("matches the current catalog, actual image bytes and cache-busting URL", async () => {
    expect(art.map(row => row.slug)).toEqual(["newyork", "dragoncave", "futurecity"]);
    for (const row of art) {
      const scene = sceneBySlug(row.slug);
      expect(row.source).toBe(scene.art.base);
      expect(row.sceneVersion).toBe(scene.version);
      expect(row.sourceSha256).toBe(scene.art.sha256);
      const source = readFileSync(`public${row.source}`), actual = readFileSync(`public${row.assetPath}`);
      expect(createHash("sha256").update(source).digest("hex")).toBe(row.sourceSha256);
      expect(createHash("sha256").update(actual).digest("hex")).toBe(row.assetSha256);
      expect(row.src).toBe(`${row.assetPath}?v=${row.assetSha256.slice(0, 16)}`);
      expect(actual.length).toBe(row.bytes);
      const expected = await sharp(source).resize({ width: 1400 }).webp({ quality: 82, effort: 6 }).toBuffer();
      expect(actual.equals(expected)).toBe(true);
    }
  });
});
