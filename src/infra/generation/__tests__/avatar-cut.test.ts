import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { AVATAR_SIZE, avatarFromSheet, avatarDisplayFromSheet, faceWindow } from "../avatar-cut";

/**
 * A drawn child on a cream sheet: a round head with a wider mop of hair, a
 * neck, and shoulders wider than the head, with air all around — the shape
 * the identity sheet's portrait quadrant has.
 */
async function portrait(size = 512, { headCx = 250, headTop = 96, headR = 62, shoulderW = 300 } = {}): Promise<Buffer> {
  const hairCy = headTop + headR * 0.55;
  const headCy = headTop + headR + 10;
  const shoulderTop = headCy + headR + 28;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="100%" height="100%" fill="#f4f1ea"/>
    <rect x="${headCx - shoulderW / 2}" y="${shoulderTop}" width="${shoulderW}" height="${size - shoulderTop}" rx="40" fill="#3d6fb4"/>
    <rect x="${headCx - 18}" y="${headCy + headR - 6}" width="36" height="40" fill="#d9a066"/>
    <circle cx="${headCx}" cy="${headCy}" r="${headR}" fill="#e2b48c"/>
    <ellipse cx="${headCx}" cy="${hairCy}" rx="${headR * 1.25}" ry="${headR * 0.6}" fill="#5a3a1e"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe("the face window", () => {
  it("is a square around the head, not around the shoulders", async () => {
    const p = await portrait();
    const win = await faceWindow(p);
    const hairWidth = 62 * 1.25 * 2;
    // Wider than the hair, well narrower than the shoulders.
    expect(win.size).toBeGreaterThan(hairWidth);
    expect(win.size).toBeLessThan(300);
    // Centred on the head.
    expect(Math.abs(win.left + win.size / 2 - 250)).toBeLessThan(10);
    // Starts a little above the hair, never far below it.
    const hairTop = 96 + 62 * 0.55 - 62 * 0.6;
    expect(win.top).toBeLessThan(hairTop);
    expect(hairTop - win.top).toBeLessThan(40);
  });

  it("follows the head when it is not in the middle", async () => {
    const p = await portrait(512, { headCx: 170 });
    const win = await faceWindow(p);
    expect(Math.abs(win.left + win.size / 2 - 170)).toBeLessThan(10);
  });

  it("falls back to the whole portrait when there is nothing to measure", async () => {
    const blank = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#ffffff" } }).png().toBuffer();
    expect(await faceWindow(blank)).toEqual({ left: 0, top: 0, size: 300 });
  });
});

describe("the sticker cut from a sheet", () => {
  it("the display derivative preserves all portrait-cell corners without a circle or identity mutation", async () => {
    const sheet = await sharp(Buffer.from('<svg width="1024" height="1024"><rect width="1024" height="1024" fill="blue"/><rect width="512" height="512" fill="red"/></svg>')).png().toBuffer();
    const original = Buffer.from(sheet);
    const display = await avatarDisplayFromSheet(sheet, 1024);
    const { data, info } = await sharp(display).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(512); expect(info.height).toBe(512);
    for (const [x, y] of [[14, 14], [497, 14], [14, 497], [497, 497]]) {
      const i = (y! * info.width + x!) * 3;
      expect([...data.subarray(i, i + 3)]).toEqual([255, 0, 0]);
    }
    expect(sheet.equals(original)).toBe(true);
    await expect(avatarDisplayFromSheet(sheet, 512)).rejects.toThrow("identity raster");
  });
  it("fills the circle with the face", async () => {
    // A 2×2 sheet whose top-left quadrant is the portrait.
    const quadrant = await portrait(512);
    const sheet = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#f4f1ea" } })
      .composite([{ input: quadrant, left: 0, top: 0 }])
      .png()
      .toBuffer();
    const sticker = await avatarFromSheet(sheet, 1024);
    const meta = await sharp(sticker).metadata();
    expect(meta.width).toBe(AVATAR_SIZE);
    expect(meta.height).toBe(AVATAR_SIZE);
    // The middle of the sticker is skin, and a third of the way up it is hair:
    // the head fills the circle instead of floating in it.
    const { data, info } = await sharp(sticker).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => {
      const i = (y * info.width + x) * 3;
      return [data[i]!, data[i + 1]!, data[i + 2]!] as const;
    };
    const mid = at(256, 340);
    expect(mid[0]).toBeGreaterThan(200); // skin, not cream background (#f4f1ea has R=244 too, so check the blue channel)
    expect(mid[2]).toBeLessThan(170);
    const hair = at(256, 120);
    expect(hair[0]).toBeLessThan(120); // dark brown
  });
});
