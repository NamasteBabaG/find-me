import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { sceneBySlug } from "../scene-catalog.service";
import { demoPatchCoverage } from "../demo";
import { loadSceneArt, clearSceneArtCache } from "../generation/scene-art";
import release from "../../../content/scenes/releases/refresh-20260907.json";
import archive from "../../../content/scenes/releases/pre-refresh-20260907.json";
import prePlacement from "../../../content/scenes/releases/pre-placement-20260907.json";
import preContract from "../../../content/scenes/releases/pre-contract-20260908.json";

describe("new art must not replace an old game's geometry or image", () => {
  it("keeps all 27 previous definitions and selects an explicit version", () => {
    expect(release.boards).toHaveLength(27);
    for (const row of release.boards) {
      const old = sceneBySlug(row.slug, row.previousVersion), current = sceneBySlug(row.slug);
      expect(old.art.base).toBe(archive.find(a => a.slug === row.slug)!.art.base);
      expect(old.version).toBe(1);
      // The refresh made version 2 of every board. The first world's nine boards went on to version 3
      // when their hiding spots were re-planned and to version 4 when the hides were authored against the
      // board's own occluders; four of them (sydney, paris, giza, antarctica) went on to version 5 on
      // 8 September 2026 when their spots got placement contracts and two spots moved (same art
      // throughout); every earlier version stays addressable for games pinned to it.
      const rePlanned = prePlacement.some(p => p.slug === row.slug);
      const contracted = preContract.some(p => p.slug === row.slug);
      expect(current.version).toBe(contracted ? 5 : rePlanned ? 4 : 2);
      const v2 = sceneBySlug(row.slug, 2);
      expect(v2.version).toBe(2); expect(v2.art.base).toBe(row.base);
      if (rePlanned) { const v3 = sceneBySlug(row.slug, 3); expect(v3.version).toBe(3); expect(v3.art.base).toBe(row.base); }
      if (contracted) {
        const v4 = sceneBySlug(row.slug, 4); expect(v4.version).toBe(4); expect(v4.art.base).toBe(row.base);
        // The archived version keeps its own foreground layer file; the current one may point at a newer file or none.
        if (v4.art.foreground) expect(existsSync(path.join(process.cwd(), "public", v4.art.foreground))).toBe(true);
      }
      expect(current.art.base).toBe(row.base);
      // A foreground layer (the occluders cut out of the board) exists only where a hide was authored, and then the file exists.
      if (current.art.foreground) expect(existsSync(path.join(process.cwd(), "public", current.art.foreground))).toBe(true);
      else expect(current.art.foreground).toBeUndefined();
      for (const file of [old.art.base, current.art.base, current.art.thumbnail]) expect(existsSync(path.join(process.cwd(), "public", file))).toBe(true);
      const bytes = readFileSync(path.join(process.cwd(), "public", current.art.base));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(current.art.sha256);
    }
  });
  it("fails closed when a historical version is unavailable", () => {
    expect(() => sceneBySlug("paris", 999)).toThrow("version 999");
    expect(() => sceneBySlug("does-not-exist", 1)).toThrow();
  });
  it("does not claim old demo patches validate refreshed art", () => {
    const scene = sceneBySlug("paris");
    expect(demoPatchCoverage(scene.slug, scene.targets).ready).toBe(0);
  });
  it("verifies the base bytes even when a path was previously cached", async () => {
    clearSceneArtCache(); const scene = sceneBySlug("paris");
    await loadSceneArt("http://localhost:3000", scene.art.base);
    await expect(loadSceneArt("http://localhost:3000", scene.art.base, "0".repeat(64))).rejects.toThrow("hash mismatch");
    await expect(loadSceneArt("http://localhost:3000", scene.art.base, scene.art.sha256)).resolves.toBeInstanceOf(Buffer);
  });
});
