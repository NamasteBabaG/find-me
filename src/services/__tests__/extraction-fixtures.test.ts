import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { childProblem, diffToPatch, slotContext, type PatchResult } from "../generation/patch";

/**
 * The extraction, end to end, on pictures with a known answer.
 *
 * The shape tests feed childProblem numbers measured off real renders, and
 * the alpha test paints a blue ellipse on a flat board. Neither runs the
 * extraction on the things it actually gets wrong: hair the colour of the
 * wood behind it, a background that drifted a little everywhere, a figure the
 * model painted over, a head peeking above a block with hair falling beside
 * it. These scenes are drawn here, so every pixel of the child is known and
 * the alpha can be held to it. No private photo is involved.
 *
 * Two of them fail today and are marked so: they are the defects experiment 1
 * found, kept as tests rather than as memory.
 */

const ART = { width: 1024, height: 1024 };
const SLOT = { x: 0.5, y: 0.5, scale: 0.09 }; // a ~92px child, a 644px window

type Rgb = [number, number, number];
type Paint = (x: number, y: number) => Rgb;
type Box = [number, number, number, number];

/** A PNG from a paint function. */
async function picture(w: number, h: number, paint: Paint): Promise<Buffer> {
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y);
      buf.set([r, g, b], (y * w + x) * 3);
    }
  return sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

/** Wood: brown planks with a darker grain every few pixels. */
const wood: Paint = (x, y) => {
  const grain = (x * 7 + y * 3) % 23 < 4 ? -18 : 0;
  const plank = Math.floor(y / 40) % 2 === 0 ? 0 : -8;
  return [150 + grain + plank, 100 + grain + plank, 60 + grain + plank];
};

/** The child: a dark-brown hair cap over a skin-coloured head, a blue body; boxes in crop pixels. */
function childAt(cx: number, top: number, px: number) {
  const headR = px * 0.16;
  const headCy = top + headR * 1.2;
  const hairCy = top + headR * 0.9;
  const bodyTop = headCy + headR * 0.9;
  const bodyBottom = top + px;
  const bodyHalf = px * 0.17;
  const paint = (x: number, y: number): Rgb | null => {
    if (y >= bodyTop && y <= bodyBottom && Math.abs(x - cx) <= bodyHalf) return [40, 70, 190];
    if (Math.hypot(x - cx, y - headCy) <= headR) return [228, 184, 140];
    if (Math.hypot((x - cx) / 1.25, (y - hairCy) / 0.85) <= headR) return [88, 56, 30]; // hair, near the grain's brown
    return null;
  };
  const face: Box = [Math.round(cx - headR * 0.7), Math.round(headCy - headR * 0.3), Math.round(cx + headR * 0.7), Math.round(headCy + headR * 0.9)];
  const hair: Box = [Math.round(cx - headR * 1.2), Math.round(hairCy - headR * 0.8), Math.round(cx + headR * 1.2), Math.round(hairCy - headR * 0.1)];
  const body: Box = [Math.round(cx - bodyHalf), Math.round(bodyTop), Math.round(cx + bodyHalf), Math.round(bodyBottom)];
  return { paint, face, hair, body, headR };
}

/** Share of a box (crop pixels) the patch keeps opaque. */
async function kept(patch: PatchResult, ctx: ReturnType<typeof slotContext>, box: Box): Promise<number> {
  if (patch.width === 0) return 0;
  const { data, info } = await sharp(patch.webp).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  const px = Math.round(patch.geometry.rect.x * ART.width) - ctx.rect.x;
  const py = Math.round(patch.geometry.rect.y * ART.height) - ctx.rect.y;
  let n = 0;
  let hit = 0;
  for (let y = box[1]; y < box[3]; y++)
    for (let x = box[0]; x < box[2]; x++) {
      n++;
      const lx = x - px;
      const ly = y - py;
      if (lx >= 0 && ly >= 0 && lx < info.width && ly < info.height && data[ly * info.width + lx]! >= 128) hit++;
    }
  return hit / n;
}

/** The window, the child in its middle, and the extraction of `render` against `board`. */
async function run(board: Paint, render: (child: ReturnType<typeof childAt>, board: Paint) => Paint) {
  const ctx = slotContext(ART, SLOT);
  const { w, h } = ctx.rect;
  const child = childAt(w / 2, h / 2 - ctx.childPx / 2, ctx.childPx);
  const original = await picture(w, h, board);
  const edited = await picture(w, h, render(child, board));
  const patch = await diffToPatch({ originalCrop: original, editedCrop: edited, ctx, art: ART, slot: SLOT });
  return { ctx, child, patch };
}

describe("the extraction on a drawn scene", () => {
  it("keeps the face, the hair and the body of a child standing on wood", async () => {
    const { ctx, child, patch } = await run(wood, (c, board) => (x, y) => c.paint(x, y) ?? board(x, y));
    expect(childProblem(patch)).toBeNull();
    expect(await kept(patch, ctx, child.face)).toBeGreaterThan(0.97);
    expect(await kept(patch, ctx, child.hair)).toBeGreaterThan(0.9);
    expect(await kept(patch, ctx, child.body)).toBeGreaterThan(0.97);
  }, 30_000);

  it("does not mistake a background that drifted a little everywhere for the child", async () => {
    // Every pixel of the re-render is a few levels off, the way images/edits returns a window.
    const { ctx, child, patch } = await run(wood, (c, board) => (x, y) => {
      const own = c.paint(x, y);
      if (own) return own;
      const [r, g, b] = board(x, y);
      const d = ((x * 13 + y * 7) % 11) - 5;
      return [r + d, g + d, b + d];
    });
    expect(childProblem(patch)).toBeNull();
    // The patch is the child plus a margin, not the window.
    expect(patch.shape.height).toBeLessThan(ctx.childPx * 1.3);
    expect(patch.shape.width).toBeLessThan(ctx.childPx * 0.6);
    expect(await kept(patch, ctx, child.face)).toBeGreaterThan(0.97);
  }, 30_000);

  // Experiment 1, wildwest/horses: the model painted the child over a boy in a
  // yellow hat, and where the hat became sand the change was under the
  // threshold. The hat's brim survived behind her head on the board.
  it.fails("covers what the model painted OVER, so the board's old figure does not show through", async () => {
    const ctx = slotContext(ART, SLOT);
    const { w, h } = ctx.rect;
    const c = childAt(w / 2, h / 2 - ctx.childPx / 2, ctx.childPx);
    // The board has a straw hat brim across where the head will be, wider than
    // the hair, and straw on wood is a change of about twenty levels — real,
    // visible, and under the extraction's threshold of 28.
    const brim: Box = [c.hair[0] - 12, c.hair[1] - 4, c.hair[2] + 12, c.hair[1] + 6];
    const board: Paint = (x, y) => (x >= brim[0] && x < brim[2] && y >= brim[1] && y < brim[3] ? [170, 120, 78] : wood(x, y));
    const { patch } = await run(board, (child) => (x, y) => child.paint(x, y) ?? wood(x, y));
    expect(childProblem(patch)).toBeNull();
    // The strip of brim that pokes out beyond the hair must be in the patch (as wood), or the hat shows through.
    const pokes: Box = [brim[0], brim[1], c.hair[0], brim[3]];
    expect(await kept(patch, ctx, pokes)).toBeGreaterThan(0.9);
  }, 30_000);

  // Experiment 1, antarctica/ice: a head peeking above a block with a strand
  // of hair falling beside the block is one child, and every knob rejects her
  // as "painted in pieces" although the composite on the board is right.
  it.fails("accepts a head above a block with hair falling beside it as one child", async () => {
    const ctx = slotContext(ART, SLOT);
    const { w, h } = ctx.rect;
    const px = ctx.childPx;
    const blockTop = h / 2;
    const board: Paint = (x, y) => (y >= blockTop && Math.abs(x - w / 2) <= px * 0.6 ? [200, 225, 245] : wood(x, y));
    const headR = px * 0.16;
    const headCy = blockTop - headR * 0.6;
    const render: Paint = (x, y) => {
      if (y < blockTop && Math.hypot(x - w / 2, y - headCy) <= headR) return [228, 184, 140];
      if (y < blockTop && Math.hypot((x - w / 2) / 1.25, (y - headCy + headR * 0.3) / 0.85) <= headR) return [88, 56, 30];
      // the strand: beside the block, below the head, a quarter of the head's area
      if (x >= w / 2 + px * 0.62 && x < w / 2 + px * 0.62 + headR * 0.5 && y >= blockTop && y < blockTop + headR * 1.6) return [88, 56, 30];
      return board(x, y);
    };
    const patch = await diffToPatch({ originalCrop: await picture(w, h, board), editedCrop: await picture(w, h, render), ctx, art: ART, slot: SLOT });
    expect(childProblem(patch)).toBeNull();
  }, 30_000);
});
