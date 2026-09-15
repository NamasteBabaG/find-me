import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { allWorlds } from "../../../../content/worlds";
import { boardSlugs } from "@/domain/world";
import { journeyPresentation } from "../../../../content/home/journey-art";
import { carouselWorlds } from "../worlds-data";

describe("approved first-world presentation art", () => {
  it("covers all nine places with hash-bound 16:9 masters and current thumbnails", async () => {
    const slugs = boardSlugs(allWorlds().find(w => w.slug === "journey")!);
    expect(slugs).toHaveLength(9);
    for (const slug of slugs) {
      const art = journeyPresentation(slug)!;
      expect(art).toBeDefined();
      expect(createHash("sha256").update(readFileSync(`public${art.base}`)).digest("hex")).toBe(art.sha256);
      const thumb = await sharp(`public${art.thumbnail.split("?")[0]}`).metadata();
      expect([thumb.width, thumb.height]).toEqual([960, 540]);
      expect(carouselWorlds("he")[0]!.tiles.find(t => t.key === slug)?.thumb).toBe(art.thumbnail);
    }
    expect(journeyPresentation("dragoncave")).toBeUndefined();
  });
});
