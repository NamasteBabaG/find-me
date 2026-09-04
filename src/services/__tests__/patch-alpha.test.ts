import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { diffToPatch, slotContext } from "../generation/patch";

/**
 * A finished patch has to be a solid child with a soft rim, not a ghost.
 *
 * Feathering the whole mask left the body itself half-transparent: across one
 * nine-board game only a fifth of the drawn pixels were fully opaque, and in the
 * board that reads as a washed-out child you can see the bus through. The edge
 * still has to be soft or she gets a cut-out outline, so the two are measured
 * separately here — the middle of her opaque, the rim not.
 */

const ART = { width: 2048, height: 2048 };
const SLOT = { x: 0.5, y: 0.5, scale: 0.06 };

/** A flat board, and the same board with a child-shaped blob painted into it. */
async function pair(): Promise<{ original: Buffer; edited: Buffer }> {
  const ctx = slotContext(ART, SLOT);
  const { w, h } = ctx.rect;
  const original = await sharp({ create: { width: w, height: h, channels: 3, background: "#d8c9a8" } })
    .png()
    .toBuffer();
  const childPx = ctx.childPx;
  const overlay = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${childPx * 0.275}" ry="${childPx * 0.5}" fill="#2a6fb0"/></svg>`,
  );
  const edited = await sharp(original).composite([{ input: overlay }]).png().toBuffer();
  return { original, edited };
}

/** Share of drawn pixels that are fully opaque, and the share that are a soft edge. */
async function opacity(webp: Buffer): Promise<{ opaque: number; soft: number }> {
  const { data } = await sharp(webp).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  let drawn = 0;
  let opaque = 0;
  for (const a of data) {
    if (a < 16) continue;
    drawn++;
    if (a >= 250) opaque++;
  }
  return { opaque: opaque / Math.max(1, drawn), soft: 1 - opaque / Math.max(1, drawn) };
}

describe("the alpha of a finished patch", () => {
  it("makes the child's body opaque and leaves the rim soft", async () => {
    const { original, edited } = await pair();
    const ctx = slotContext(ART, SLOT);
    const patch = await diffToPatch({ originalCrop: original, editedCrop: edited, ctx, art: ART, slot: SLOT });
    const { opaque, soft } = await opacity(patch.webp);
    expect(opaque).toBeGreaterThan(0.7); // she is a child, not a ghost
    expect(soft).toBeGreaterThan(0.02); // and still not a sticker with a cut edge
  }, 30_000);

  it("keeps the soft alpha when asked to", async () => {
    const { original, edited } = await pair();
    const ctx = slotContext(ART, SLOT);
    const patch = await diffToPatch({ originalCrop: original, editedCrop: edited, ctx, art: ART, slot: SLOT, options: { solidify: false } });
    const { opaque } = await opacity(patch.webp);
    expect(opaque).toBeLessThan(0.7);
  }, 30_000);
});
