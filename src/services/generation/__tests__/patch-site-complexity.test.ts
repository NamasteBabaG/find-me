import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { findPatchSites, scorePatchSite } from "../patch-site-complexity";

const flat = () => sharp({ create: { width: 400, height: 400, channels: 3, background: { r: 214, g: 190, b: 140 } } }).png().toBuffer();
async function withStructure() {
  const towers = Array.from({ length: 8 }, (_, i) => ({
    input: Buffer.from(`<svg width="18" height="${60 + i * 12}"><rect width="18" height="${60 + i * 12}" fill="rgb(90,70,40)"/></svg>`),
    left: 30 + i * 40, top: 120,
  }));
  return sharp({ create: { width: 400, height: 400, channels: 3, background: { r: 214, g: 190, b: 140 } } })
    .composite(towers).png().toBuffer();
}

describe("choosing where a local patch may be taken from", () => {
  it("calls flat paint plain, because a redraw of it cannot be noticed", async () => {
    const score = await scorePatchSite(await flat(), { left: 40, top: 40, width: 210, height: 300 });
    expect(score.verdict).toBe("plain");
    expect(score.detail).toBeLessThan(1);
    expect(score.edgeFraction).toBe(0);
  });

  it("calls drawn structure busy, because the render brings back a different version of it", async () => {
    const score = await scorePatchSite(await withStructure(), { left: 20, top: 100, width: 340, height: 200 });
    expect(score.verdict).toBe("busy");
    expect(score.edgeFraction).toBeGreaterThan(0);
    expect(score.reason).toMatch(/drawn structure/);
  });

  it("ranks the plainest rectangles first, which is what picks a hide", async () => {
    const board = await withStructure();
    const sites = await findPatchSites(board, { width: 120, height: 120 }, { step: 40, limit: 4 });
    expect(sites.length).toBeGreaterThan(1);
    for (const [i, site] of sites.entries()) if (i) expect(site.detail).toBeGreaterThanOrEqual(sites[i - 1]!.detail);
    // The quietest area of this board is above the towers.
    expect(sites[0]!.detail).toBeLessThan(1);
  });

  it("refuses a rectangle too small to say anything about", async () => {
    await expect(scorePatchSite(await flat(), { left: 0, top: 0, width: 4, height: 4 })).rejects.toThrow(/at least 8 pixels/);
  });
});
