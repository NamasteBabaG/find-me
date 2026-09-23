import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import rows from "../../../../content/home/board-presentation.json";
import { boardPresentation, worldPresentation } from "../../../../content/home/board-presentation";
import { TWO_WORLD_RELEASE_CATALOG, TWO_WORLD_RELEASE_ROUTES } from "../../../../content/adventures/two-worlds-release";
import { carouselWorlds } from "../worlds-data";

const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
describe("approved two-world display sources", () => {
  it("binds all 18 public previews and discovery names to the latest approved release", async () => {
    expect(rows).toHaveLength(18);
    expect(new Set(rows.map(row => row.route)).size).toBe(18);
    for (const route of TWO_WORLD_RELEASE_ROUTES) {
      const actual = boardPresentation(route.route)!;
      const approved = TWO_WORLD_RELEASE_CATALOG.boards.find(board => board.boardSlug === route.slug)!;
      if (approved.status !== "ready") throw Error(`Unapproved board ${route.slug}`);
      expect(actual).toMatchObject({ world: route.world, board: route.slug, base: approved.art.base, sha256: approved.art.sha256, version: approved.sceneVersion, name: approved.name });
      expect(actual.discoveries).toEqual(approved.discoveries.map(d => ({ id: d.id, name: d.name })));
      expect(actual.discoveries).toHaveLength(6);
      expect(boardPresentation(route.slug)).toEqual(actual);
      const source = readFileSync(`public${actual.base}`), thumb = readFileSync(`public${actual.thumbnail}`);
      expect(hash(source)).toBe(approved.art.sha256);
      expect(hash(thumb)).toBe(actual.thumbnailSha256);
      expect(actual.thumbnail).toBe(`/home/boards/${hash(thumb)}.webp`);
      const expected = await sharp(source).resize(960, 540).webp({ quality: 85 }).toBuffer();
      expect(thumb.equals(expected)).toBe(true);
      expect(thumb.length).toBeLessThan(400_000);
      for (const locale of ["he", "en"] as const) {
        const tile = carouselWorlds(locale).find(w => w.slug === route.world)!.tiles.find(t => t.key === route.route)!;
        expect(tile.thumb).toBe(actual.thumbnail);
        expect(tile.label).toBe(actual.name[locale]);
        expect(tile.spots).toEqual(actual.discoveries.map(d => d.name[locale]));
      }
    }
  });
  it("shares approved covers with the wizard without changing map or saved-game definitions", () => {
    expect(worldPresentation("journey")).toEqual(boardPresentation("newyork"));
    expect(worldPresentation("kingdom")).toEqual(boardPresentation("castlegate"));
    expect(worldPresentation("timetravel")).toBeUndefined();
    expect(boardPresentation("missing")).toBeUndefined();
    const json = JSON.stringify(rows);
    for (const forbidden of ["/api/assets/", "storage/", "avatar", "hitRect", "targetImages", "patchSources"]) expect(json).not.toContain(forbidden);
  });
});
