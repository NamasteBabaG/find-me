import { describe, expect, it } from "vitest";
import previews from "../../../../content/home/board-presentation.json";
import { boardThumbnail } from "../board-thumbnail";

describe("prepared public board thumbnails", () => {
  it("uses small current artwork only when the saved master hash matches", () => {
    expect(previews).toHaveLength(18);
    for (const p of previews) {
      const scene = { slug: p.route, art: { base: p.base, thumbnail: p.base } };
      const binding = { boardSlug: p.route, art: { base: p.base }, artSha256: p.sha256 };
      const saved = JSON.stringify([scene, binding]);
      expect(boardThumbnail(scene, { boards: [binding] })).toBe(p.thumbnail);
      expect(boardThumbnail(scene, { boards: [{ ...binding, artSha256: "different-master" }] })).toBe(p.base);
      expect(boardThumbnail(scene)).toBe(p.base);
      expect(boardThumbnail(scene, { boards: [{ ...binding, art: { base: "/different-master.webp" } }] })).toBe(p.base);
      expect(boardThumbnail({ ...scene, art: { base: "/older-release.webp", thumbnail: "/older-thumbnail.webp" } }, { boards: [binding] })).toBe("/older-thumbnail.webp");
      expect(JSON.stringify([scene, binding])).toBe(saved);
    }
  });
});
