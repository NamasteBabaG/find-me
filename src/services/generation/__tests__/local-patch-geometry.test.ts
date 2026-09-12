import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  LOCAL_PATCH_BOARD, WORLD_LOCAL_PATCH_HIDES, cropOf, maskOf, type LocalPatchHide,
} from "../../../domain/scene/local-patch-hides";
import { sceneBySlug } from "../../scene-catalog.service";
import { localPatchGeometry } from "../local-patch-geometry";

/**
 * Where a finished hide can be tapped, and what the board looks like once every
 * patch of it is drawn.
 *
 * No database, no ledger, no provider: this is the picture arithmetic on its
 * own, which is the part a player actually experiences.
 */

const BOARD_COLOUR = { r: 210, g: 190, b: 150, alpha: 255 };
const board = () => sharp({ create: { ...LOCAL_PATCH_BOARD, channels: 4, background: BOARD_COLOUR } }).png().toBuffer();

/** A crop of the board with a figure of `colour` standing in the pose's own box. */
async function painted(hide: LocalPatchHide, colour: { r: number; g: number; b: number }, fill = 0.6, darken = 0) {
  const crop = cropOf(hide), box = maskOf(hide);
  // `darken` stands in for a real render returning its whole crop repainted
  // rather than handing the board's own bytes back.
  const cut = await sharp({ create: { width: crop.width, height: crop.height, channels: 4,
    background: { r: BOARD_COLOUR.r - darken, g: BOARD_COLOUR.g - darken, b: BOARD_COLOUR.b - darken, alpha: 255 } } }).png().toBuffer();
  const figure = await sharp({ create: {
    width: Math.round(box.width * fill), height: Math.round(box.height * fill),
    channels: 4, background: { ...colour, alpha: 255 },
  } }).png().toBuffer();
  return sharp(cut).composite([{
    input: figure,
    left: box.left - crop.left + Math.round(box.width * (1 - fill) / 2),
    top: box.top - crop.top + Math.round(box.height * (1 - fill) / 2),
  }]).png().toBuffer();
}

const pixelAt = async (png: Buffer, x: number, y: number) => {
  const { data } = await sharp(png).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  return { r: data[0]!, g: data[1]!, b: data[2]! };
};

describe("the tap contract of a finished hide", () => {
  const hide = WORLD_LOCAL_PATCH_HIDES[0]!.hides[1]!;

  it("v8 keeps a preserved face above the hinted mask tappable without making the entire context clickable", async () => {
    const shifted = { ...hide, mask: { left: 190, top: 335, width: 110, height: 240 } };
    const original = await board(), crop = cropOf(shifted);
    const patchPng = await sharp(original).extract(crop).composite([{
      input: Buffer.from('<svg width="110" height="330"><ellipse cx="55" cy="46" rx="45" ry="45" fill="#493422"/><rect x="15" y="70" width="80" height="260" fill="#dd804a"/></svg>'),
      left: 190, top: 237,
    }]).png().toBuffer();
    const measured = await localPatchGeometry({ hide: shifted, boardPng: original, patchPng, contentVersion: 8 });
    const hit = measured.geometry.hitRect;
    const face = { x: (crop.left + 245) / LOCAL_PATCH_BOARD.width, y: (crop.top + 285) / LOCAL_PATCH_BOARD.height };
    expect(face.x).toBeGreaterThanOrEqual(hit.x);
    expect(face.x).toBeLessThanOrEqual(hit.x + hit.w);
    expect(face.y).toBeGreaterThanOrEqual(hit.y);
    expect(face.y).toBeLessThanOrEqual(hit.y + hit.h);
    expect(hit.w * LOCAL_PATCH_BOARD.width).toBeLessThanOrEqual(158);
    expect(hit.h * LOCAL_PATCH_BOARD.height).toBeLessThan(768);
    const legacy = await localPatchGeometry({ hide: shifted, boardPng: original, patchPng, contentVersion: 7 });
    expect(legacy.geometry.hitRect.y).toBeGreaterThan(face.y);
  });

  it("finds the child inside the box, not the whole box", async () => {
    const box = maskOf(hide);
    const measured = await localPatchGeometry({ hide, boardPng: await board(), patchPng: await painted(hide, { r: 20, g: 40, b: 180 }) });
    expect(measured.basis).toBe("measured");
    const hit = measured.geometry.hitRect;
    expect(hit.x * LOCAL_PATCH_BOARD.width).toBeGreaterThanOrEqual(box.left);
    expect((hit.x + hit.w) * LOCAL_PATCH_BOARD.width).toBeLessThanOrEqual(box.left + box.width);
    expect(hit.w * LOCAL_PATCH_BOARD.width).toBeCloseTo(box.width * 0.6, -1);
    // The bubble hangs from the top of what was painted, not from the box.
    expect(measured.geometry.anchor.y * LOCAL_PATCH_BOARD.height).toBeGreaterThan(box.top);
  }, 60_000);

  it("falls back to the box it asked for when the painter filled almost none of it", async () => {
    // A sliver is not a child, and a hide the player cannot tap is worse than a
    // tap area that is a little generous.
    const box = maskOf(hide);
    const measured = await localPatchGeometry({ hide, boardPng: await board(), patchPng: await painted(hide, { r: 20, g: 40, b: 180 }, 0.05) });
    expect(measured.basis).toBe("declared");
    expect(measured.geometry.hitRect.w * LOCAL_PATCH_BOARD.width).toBeCloseTo(box.width, 4);
  }, 60_000);

  it("measures nothing when the painter changed nothing", async () => {
    const crop = cropOf(hide);
    const untouched = await sharp(await board()).extract(crop).png().toBuffer();
    const measured = await localPatchGeometry({ hide, boardPng: await board(), patchPng: untouched });
    expect(measured.basis).toBe("declared");
    expect(measured.measuredFraction).toBe(0);
  }, 60_000);
});

describe("a board with all three of its patches drawn", () => {
  it("keeps every child whole on paris, where two crops overlap", async () => {
    // paris-3 and paris-5 share a 128px strip of crop. That neither crop holds
    // the other CHILD is what assertPlaceable proves - and it proves it about
    // rectangles, not about the picture. This draws the actual board, in the
    // order the player draws it, and looks.
    const paris = WORLD_LOCAL_PATCH_HIDES.find(b => b.board === "paris")!;
    const order = sceneBySlug("paris").targets.map(t => paris.hides.find(h => h.targetId === t.id)!);
    expect(order.map(h => h.id)).toEqual(["paris-3", "paris-4", "paris-5"]);

    const colours = [{ r: 220, g: 20, b: 20 }, { r: 20, g: 200, b: 20 }, { r: 20, g: 20, b: 220 }];
    const patches = await Promise.all(order.map((h, i) => painted(h, colours[i]!)));
    const composed = await sharp(await board())
      .composite(order.map((h, i) => ({ input: patches[i]!, left: cropOf(h).left, top: cropOf(h).top })))
      .png().toBuffer();

    // Each child is still her own colour in the middle of her own box, after
    // every later patch has been drawn over the board.
    for (const [i, h] of order.entries()) {
      const box = maskOf(h);
      const middle = await pixelAt(composed, box.left + Math.round(box.width / 2), box.top + Math.round(box.height / 2));
      expect(middle, `${h.id} was painted over by a neighbour`).toEqual(colours[i]);
    }

    // And the shared strip belongs to exactly ONE of them, uniformly.
    //
    // A real render returns its whole crop repainted, not the board's own bytes
    // back, so the two patches disagree everywhere they overlap. What must not
    // happen is a strip made of both - a visible band down the middle of it. A
    // per-patch tint stands in for that repainting, and the strip must come out
    // entirely the colour of whichever patch the player draws last.
    const tinted = await Promise.all(order.map((h, i) => painted(h, colours[i]!, 0.6, 6 * (i + 1))));
    const layered = await sharp(await board())
      .composite(order.map((h, i) => ({ input: tinted[i]!, left: cropOf(h).left, top: cropOf(h).top })))
      .png().toBuffer();
    const strip = { left: cropOf(order[2]!).left, right: cropOf(order[0]!).left + cropOf(order[0]!).width };
    expect(strip.right).toBeGreaterThan(strip.left);
    const last = { r: BOARD_COLOUR.r - 18, g: BOARD_COLOUR.g - 18, b: BOARD_COLOUR.b - 18 };
    for (const x of [strip.left + 2, Math.round((strip.left + strip.right) / 2), strip.right - 2]) {
      for (const y of [1400, 1600, 1800]) {
        expect(await pixelAt(layered, x, y), `the shared strip is not all one patch at ${x},${y}`).toEqual(last);
      }
    }
  }, 120_000);
});
