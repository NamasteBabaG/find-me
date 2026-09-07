import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { sceneBySlug } from "../scene-catalog.service";
import { demoPatchCoverage } from "../demo";
import { loadSceneArt, clearSceneArtCache } from "../generation/scene-art";
import release from "../../../content/scenes/releases/refresh-20260907.json";
import archive from "../../../content/scenes/releases/pre-refresh-20260907.json";

describe("new art must not replace an old game's geometry or image", () => {
  it("keeps all 27 previous definitions and selects an explicit version", () => {
    expect(release.boards).toHaveLength(27);
    for (const row of release.boards) {
      const old = sceneBySlug(row.slug, row.previousVersion), current = sceneBySlug(row.slug);
      expect(old.art.base).toBe(archive.find(a => a.slug === row.slug)!.art.base);
      expect(old.version).toBe(1); expect(current.version).toBe(2);
      expect(current.art.base).toBe(row.base); expect(current.art.foreground).toBeUndefined();
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
