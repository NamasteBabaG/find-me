import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { passportRaster, type DecodedBoard } from "../passport-media.service";

/**
 * Passport pictures used to composite the child's patch onto the whole board, PNG-encode the board and then crop it.
 * passportRaster crops first and lays in only the part of the patch inside the crop. It must give the same picture.
 */
async function board(width: number, height: number): Promise<Buffer> {
  // A board with detail everywhere (no flat areas that would hide an offset by one pixel).
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 3;
    pixels[i] = (x * 7 + y * 3) % 256; pixels[i + 1] = (x * 2 + y * 11) % 256; pixels[i + 2] = (x * y) % 256;
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

async function sprite(width: number, height: number): Promise<Buffer> {
  // A patch with soft alpha, as a painted child's patch has at its edges.
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    pixels[i] = 250; pixels[i + 1] = (x * 5) % 256; pixels[i + 2] = (y * 3) % 256; pixels[i + 3] = (x + y) % 256;
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/** The previous implementation, verbatim in its raster steps. */
async function wholeBoard(base: Buffer, crop: { x: number; y: number; w: number; h: number }, outputWidth: number, patch?: { bytes: Buffer; left: number; top: number; width: number; height: number }) {
  const { width: W, height: H } = await sharp(base).metadata();
  let raster = sharp(base, { limitInputPixels: 50_000_000 });
  if (patch) raster = raster.composite([{ input: await sharp(patch.bytes, { limitInputPixels: 50_000_000 }).resize(patch.width, patch.height, { fit: "fill" }).png().toBuffer(), left: patch.left, top: patch.top }]);
  const composite = patch ? await raster.png().toBuffer() : base;
  const left = Math.floor(crop.x * W!), top = Math.floor(crop.y * H!);
  return sharp(composite).extract({ left, top, width: Math.min(W! - left, Math.ceil(crop.w * W!)), height: Math.min(H! - top, Math.ceil(crop.h * H!)) })
    .resize({ width: outputWidth, withoutEnlargement: true }).webp({ quality: 86 }).toBuffer();
}

async function decoded(base: Buffer): Promise<DecodedBoard> {
  const { data, info } = await sharp(base).raw().toBuffer({ resolveWithObject: true });
  return { data, info: { width: info.width, height: info.height, channels: info.channels as DecodedBoard["info"]["channels"] } };
}

async function pixels(webp: Buffer) {
  return sharp(webp).raw().toBuffer({ resolveWithObject: true });
}

describe("passport pictures, cropped before compositing", () => {
  it("gives the same photo as compositing the whole board, with the patch partly outside the crop", async () => {
    const base = await board(640, 360), raw = await decoded(base);
    const patch = { bytes: await sprite(60, 90), left: 300, top: 120, width: 96, height: 140 };
    const crop = { x: 0.4, y: 0.3, w: 0.2, h: 0.4 }; // overlaps the patch's left part only
    const before = await pixels(await wholeBoard(base, crop, 900, patch));
    const after = await pixels(await passportRaster({ raw, crop, outputWidth: 900, patch }));
    expect(after.info).toMatchObject({ width: before.info.width, height: before.info.height, channels: before.info.channels });
    expect(Buffer.compare(after.data, before.data)).toBe(0);
  });

  it("gives the same photo when the patch lies wholly inside the crop", async () => {
    const base = await board(640, 360), raw = await decoded(base);
    const patch = { bytes: await sprite(40, 60), left: 290, top: 140, width: 48, height: 72 };
    const crop = { x: 0.4, y: 0.3, w: 0.25, h: 0.5 };
    const before = await pixels(await wholeBoard(base, crop, 900, patch));
    const after = await pixels(await passportRaster({ raw, crop, outputWidth: 900, patch }));
    expect(Buffer.compare(after.data, before.data)).toBe(0);
  });

  it("gives the same discovery card, resized down", async () => {
    const base = await board(640, 360), raw = await decoded(base);
    const crop = { x: 0.1, y: 0.2, w: 0.3, h: 0.3 };
    const before = await pixels(await wholeBoard(base, crop, 64));
    const after = await pixels(await passportRaster({ raw, crop, outputWidth: 64 }));
    expect(after.info.width).toBe(64);
    expect(Buffer.compare(after.data, before.data)).toBe(0);
  });
});
