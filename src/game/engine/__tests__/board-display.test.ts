import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import entries from "../../../../content/board-display-art.json";
import journey from "../../../../content/adventures/wizard-refresh-art.json";
import kingdom from "../../../../content/adventures/wizard-kingdom-art.json";
import type { SceneConfig } from "@/domain/game/config";
import { resolveDisplayBoardUrl } from "../board-display";

const digest = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const sceneFor = (e: typeof entries[number]) => ({ art: { base: e.source, width: e.width, height: e.height } }) as SceneConfig;

describe("immutable source-bound player transport", () => {
  it("only uses the derivative for the exact saved master, dimensions and path", () => {
    expect(entries).toHaveLength(18);
    for (const e of entries) {
      const scene = sceneFor(e), board = { artSha256: e.sourceSha256, art: { base: e.source } };
      const saved = JSON.stringify([scene, board]);
      expect(resolveDisplayBoardUrl(scene, board)).toBe(e.display);
      expect(resolveDisplayBoardUrl(scene)).toBe(e.source);
      expect(resolveDisplayBoardUrl(scene, { ...board, artSha256: "f".repeat(64) })).toBe(e.source);
      expect(resolveDisplayBoardUrl(scene, { ...board, art: { base: "/other.webp" } })).toBe(e.source);
      expect(resolveDisplayBoardUrl({ ...scene, art: { ...scene.art, width: 1920 } }, board)).toBe(e.source);
      expect(JSON.stringify([scene, board])).toBe(saved);
    }
    const legacy = { art: { base: "/scenes/legacy/base.webp", width: 3840, height: 2160 } } as SceneConfig;
    expect(resolveDisplayBoardUrl(legacy, { artSha256: entries[0]!.sourceSha256 })).toBe(legacy.art.base);
  });
  it("ships smaller WebP files with unchanged dimensions and byte-bound provenance for every canonical board", async () => {
    const masters = [...journey, ...kingdom];
    expect(new Set(entries.map(e => e.source)).size).toBe(masters.length);
    for (const e of entries) {
      expect(masters).toContainEqual({ path: `public${e.source}`, sha256: e.sourceSha256 });
      const original = readFileSync(`public${e.source}`), display = readFileSync(`public${e.display}`);
      expect(digest(original)).toBe(e.sourceSha256);
      expect(digest(display)).toBe(e.displaySha256);
      expect(e.display).toContain(e.displaySha256.slice(0, 16));
      expect(display.length).toBe(e.displayBytes);
      expect(original.length).toBe(e.sourceBytes);
      expect(display.length).toBeLessThan(original.length);
      expect(e.maxChannelError).toBeLessThanOrEqual(2);
      expect(e.recipe).toBe("webp-near60/v1");
      const metadata = await sharp(display).metadata();
      expect([metadata.width, metadata.height, metadata.format, metadata.hasAlpha]).toEqual([e.width, e.height, "webp", false]);
    }
  });
});
