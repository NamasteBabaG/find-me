import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { keyMagenta, mattePrompt, prepareSlotMatte } from "../openai";

describe("pass two on the wire", () => {
  it("sends the render and the crop as opaque 1024 squares, in that order", async () => {
    const edited = await sharp({ create: { width: 500, height: 500, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 0.5 } } }).png().toBuffer();
    const original = await sharp({ create: { width: 500, height: 500, channels: 3, background: "#445566" } }).png().toBuffer();
    const wire = await prepareSlotMatte({ edited, original, hint: "", label: "t" });
    for (const buf of [wire.edited, wire.original]) {
      const meta = await sharp(buf).metadata();
      expect([meta.width, meta.height, meta.channels]).toEqual([1024, 1024, 3]);
    }
  });

  it("asks for the same framing with everything but the child painted magenta, hidden parts included", () => {
    const p = mattePrompt("The child is peeking. The barrel hides the child from the chest down.");
    expect(p).toMatch(/exactly the same framing/);
    expect(p).toMatch(/Do not zoom in, crop, move, resize, redraw/);
    expect(p).toMatch(/pure magenta #FF00FF/);
    expect(p).toMatch(/paint it magenta as well, including where it overlaps her/);
    expect(p).toMatch(/Which child: The child is peeking\./);
    expect(mattePrompt("")).not.toMatch(/Which child/);
  });

  it("keys the magenta to alpha: the body by place, the rim un-blended, a pink shirt untouched", async () => {
    // A 24x24 frame on the key with an 8x8 child block (8..15), a one-pixel half-magenta rim
    // around it (7 and 16), and a 3x3 pink patch inside the body where a shirt might be. The key
    // is what the model painted, not #FF00FF: one render came back on (248,10,223).
    const W = 24, key = [248, 10, 223], child = [200, 150, 100], pink = [255, 105, 180];
    const blend = child.map((c, i) => Math.round(0.5 * c + 0.5 * key[i]!));
    const raw = Buffer.alloc(W * W * 3);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const inBody = x >= 8 && x <= 15 && y >= 8 && y <= 15;
      const inRim = !inBody && x >= 7 && x <= 16 && y >= 7 && y <= 16;
      const inPink = x >= 10 && x <= 12 && y >= 10 && y <= 12;
      const c = inPink ? pink : inBody ? child : inRim ? blend : key;
      raw.set(c, (y * W + x) * 3);
    }
    const png = await sharp(raw, { raw: { width: W, height: W, channels: 3 } }).png().toBuffer();
    const { data } = await sharp(await keyMagenta(png)).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => Array.from(data.subarray((y * W + x) * 4, (y * W + x) * 4 + 4));
    expect(at(0, 0)[3]).toBe(0);
    expect(at(14, 14)).toEqual([...child, 255]);
    // The pink patch is inside the body: opaque and its own colour, not keyed as a half-magenta.
    expect(at(11, 11)).toEqual([...pink, 255]);
    // The rim: half alpha, in the body's own colour (the pink pixel is one of thirteen inside pixels within reach).
    const rim = at(7, 11);
    expect(rim[3]).toBeGreaterThanOrEqual(120);
    expect(rim[3]).toBeLessThanOrEqual(136);
    for (let k = 0; k < 3; k++) expect(Math.abs(rim[k]! - child[k]!)).toBeLessThanOrEqual(12);
  });

  it("a half blend of the key with dark hair is half alpha, not opaque", async () => {
    // A plain colour distance read this pixel as 95% opaque: the blend passes through purples far from the key.
    const W = 24, key = [245, 7, 240], hair = [60, 30, 10];
    const blend = hair.map((c, i) => Math.round(0.5 * c + 0.5 * key[i]!));
    const raw = Buffer.alloc(W * W * 3);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const inBody = x >= 8 && x <= 15 && y >= 8 && y <= 15;
      const inRim = !inBody && x >= 7 && x <= 16 && y >= 7 && y <= 16;
      raw.set(inBody ? hair : inRim ? blend : key, (y * W + x) * 3);
    }
    const png = await sharp(raw, { raw: { width: W, height: W, channels: 3 } }).png().toBuffer();
    const { data } = await sharp(await keyMagenta(png)).raw().toBuffer({ resolveWithObject: true });
    const rim = Array.from(data.subarray((11 * W + 7) * 4, (11 * W + 7) * 4 + 4));
    expect(rim[3]).toBeGreaterThanOrEqual(115);
    expect(rim[3]).toBeLessThanOrEqual(140);
    for (let k = 0; k < 3; k++) expect(Math.abs(rim[k]! - hair[k]!)).toBeLessThanOrEqual(8);
  });

  it("a lone strand with no body beside it is un-blended and cannot stay pink", async () => {
    // A single 60% key / 40% hair pixel in the open: keyed by the distance along the magenta axis, and the
    // colour it is given has no more red-and-blue over green than the un-blend allows.
    const W = 24, key = [245, 7, 240], hair = [60, 30, 10];
    const blend = hair.map((c, i) => Math.round(0.4 * c + 0.6 * key[i]!));
    const raw = Buffer.alloc(W * W * 3);
    for (let i = 0; i < W * W; i++) raw.set(key, i * 3);
    raw.set(blend, (11 * W + 11) * 3);
    const png = await sharp(raw, { raw: { width: W, height: W, channels: 3 } }).png().toBuffer();
    const { data } = await sharp(await keyMagenta(png)).raw().toBuffer({ resolveWithObject: true });
    const px = Array.from(data.subarray((11 * W + 11) * 4, (11 * W + 11) * 4 + 4));
    expect(px[3]).toBeGreaterThan(60);
    expect(px[3]).toBeLessThan(140);
    expect(Math.min(px[0]!, px[2]!) - px[1]!).toBeLessThanOrEqual(8);
  });

  it("a speck of key inside the hair is keyed, a pink shirt among pink is not", async () => {
    const W = 24, key = [245, 7, 240], hair = [60, 30, 10], pink = [255, 105, 180];
    const speck = hair.map((c, i) => Math.round(0.4 * c + 0.6 * key[i]!));
    const raw = Buffer.alloc(W * W * 3);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const inBody = x >= 6 && x <= 17 && y >= 6 && y <= 17;
      // Hair on the left half of the body, a pink shirt on the right half, one speck of key in the hair.
      const c = !inBody ? key : x <= 11 ? (x === 8 && y === 11 ? speck : hair) : pink;
      raw.set(c, (y * W + x) * 3);
    }
    const png = await sharp(raw, { raw: { width: W, height: W, channels: 3 } }).png().toBuffer();
    const { data } = await sharp(await keyMagenta(png)).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => Array.from(data.subarray((y * W + x) * 4, (y * W + x) * 4 + 4));
    expect(at(8, 11)[3]).toBeLessThan(160);
    expect(Math.min(at(8, 11)[0]!, at(8, 11)[2]!) - at(8, 11)[1]!).toBeLessThanOrEqual(8);
    expect(at(15, 11)).toEqual([...pink, 255]);
    expect(at(9, 9)).toEqual([...hair, 255]);
  });

  it("refuses an answer that is not on a magenta key", async () => {
    const scene = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#6699cc" } }).png().toBuffer();
    await expect(keyMagenta(scene)).rejects.toThrow(/magenta key/);
  });
});
