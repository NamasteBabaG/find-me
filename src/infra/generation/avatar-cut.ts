import sharp from "sharp";

/**
 * The round face sticker, cut from the child's identity sheet.
 *
 * The sheet's top-left quadrant is a head-and-shoulders portrait on a plain
 * background, and the model leaves air around it: cut as a whole, the face
 * filled about half of the sticker and the rest was empty white — on the map
 * marker and in the mission card the child was a small head in a big circle.
 *
 * So the head is measured first. Everything that is not the background is the
 * child; the widest rows of the top of that shape are the head (hair
 * included, shoulders excluded); the sticker is a square around that, with a
 * little air above the hair. Nothing here is a face detector: it is the
 * outline of a drawing on a flat background, which is what a sheet is.
 */

export const AVATAR_SIZE = 512;
/** The white ring around the face, in sticker pixels. */
const RING = 22;

/** A square in the portrait's own pixels. */
export interface FaceWindow {
  left: number;
  top: number;
  size: number;
}

interface FaceOptions {
  /** Colour distance from the background above which a pixel is the child. */
  tolerance?: number;
  /** How much wider than the head the window is. */
  air?: number;
}

/**
 * Where the head is in a portrait on a plain background.
 *
 * Measured on a small copy: the background is the colour of the corners; the
 * child is every pixel further from it than `tolerance`; the head is the
 * median width of the rows in the upper part of the child's outline, which
 * is robust to a stray pixel and to shoulders wider than the face. With no
 * child found at all (a blank or a photograph with no flat background) the
 * window is the whole portrait, which is what was shipped before.
 */
export async function faceWindow(portrait: Buffer, options: FaceOptions = {}): Promise<FaceWindow> {
  const tolerance = options.tolerance ?? 30;
  const air = options.air ?? 1.32;
  const meta = await sharp(portrait).metadata();
  const fullW = meta.width ?? 0;
  const fullH = meta.height ?? 0;
  if (!fullW || !fullH) throw new Error("Cannot read the portrait's dimensions");
  const whole: FaceWindow = { left: 0, top: 0, size: Math.min(fullW, fullH) };

  const small = 160;
  const { data, info } = await sharp(portrait).resize(small, small, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const px = (x: number, y: number): [number, number, number] => {
    const i = (y * w + x) * 3;
    return [data[i]!, data[i + 1]!, data[i + 2]!];
  };
  // The background: the average of the four corners, each a small patch.
  const corners: Array<[number, number]> = [
    [0, 0],
    [w - 6, 0],
    [0, h - 6],
    [w - 6, h - 6],
  ];
  const bg: [number, number, number] = [0, 0, 0];
  let count = 0;
  for (const [cx, cy] of corners) {
    for (let y = cy; y < cy + 6; y++) {
      for (let x = cx; x < cx + 6; x++) {
        const p = px(x, y);
        bg[0] += p[0];
        bg[1] += p[1];
        bg[2] += p[2];
        count++;
      }
    }
  }
  bg[0] /= count;
  bg[1] /= count;
  bg[2] /= count;
  const isChild = (x: number, y: number) => {
    const p = px(x, y);
    return Math.max(Math.abs(p[0] - bg[0]), Math.abs(p[1] - bg[1]), Math.abs(p[2] - bg[2])) > tolerance;
  };

  // Per row: the outline's span. A row counts when it holds more than a speck.
  const spans: Array<{ y: number; x0: number; x1: number } | null> = [];
  for (let y = 0; y < h; y++) {
    let x0 = -1;
    let x1 = -1;
    let n = 0;
    for (let x = 0; x < w; x++) {
      if (!isChild(x, y)) continue;
      n++;
      if (x0 < 0) x0 = x;
      x1 = x;
    }
    spans.push(n >= 3 ? { y, x0, x1 } : null);
  }
  const rows = spans.filter((s): s is NonNullable<typeof s> => s !== null);
  if (rows.length < 8) return whole;
  const top = rows[0]!.y;
  const bottom = rows[rows.length - 1]!.y;
  const height = bottom - top + 1;
  // The head lives in the upper part of the outline. The band skips the very
  // top (a hair tip is narrow) and stops well before shoulders can start.
  const band = rows.filter((r) => r.y >= top + height * 0.08 && r.y <= top + height * 0.42);
  if (band.length < 4) return whole;
  const widths = band.map((r) => r.x1 - r.x0 + 1).sort((a, b) => a - b);
  const centres = band.map((r) => (r.x0 + r.x1) / 2).sort((a, b) => a - b);
  const headWidth = widths[Math.floor(widths.length / 2)]!;
  const headCentre = centres[Math.floor(centres.length / 2)]!;
  // The window: a square around the head with air, and a little more above it.
  let size = headWidth * air;
  size = Math.max(size, Math.min(w, h) * 0.3);
  size = Math.min(size, Math.min(w, h));
  let left = headCentre - size / 2;
  let winTop = top - size * 0.07;
  left = Math.max(0, Math.min(w - size, left));
  winTop = Math.max(0, Math.min(h - size, winTop));
  // Back to the portrait's own pixels.
  const sx = fullW / w;
  const sy = fullH / h;
  const sizePx = Math.round(size * Math.min(sx, sy));
  return {
    left: Math.max(0, Math.min(fullW - sizePx, Math.round(left * sx))),
    top: Math.max(0, Math.min(fullH - sizePx, Math.round(winTop * sy))),
    size: sizePx,
  };
}

/** A square portrait crop as a round sticker with the white outline. */
export async function roundSticker(square: Buffer): Promise<Buffer> {
  const portrait = await sharp(square).resize(AVATAR_SIZE, AVATAR_SIZE).png().toBuffer();
  const inner = AVATAR_SIZE / 2 - RING;
  const circle = Buffer.from(`<svg width="${AVATAR_SIZE}" height="${AVATAR_SIZE}"><circle cx="${AVATAR_SIZE / 2}" cy="${AVATAR_SIZE / 2}" r="${inner}" fill="#fff"/></svg>`);
  const outline = Buffer.from(`<svg width="${AVATAR_SIZE}" height="${AVATAR_SIZE}"><circle cx="${AVATAR_SIZE / 2}" cy="${AVATAR_SIZE / 2}" r="${AVATAR_SIZE / 2 - 2}" fill="#fff"/></svg>`);
  const masked = await sharp(portrait).composite([{ input: circle, blend: "dest-in" }]).png().toBuffer();
  return sharp(outline).composite([{ input: masked, blend: "over" }]).png().toBuffer();
}

/**
 * The round avatar from a 2×2 identity sheet: the top-left quadrant is the
 * portrait, the head is found in it, and the sticker is cut around the head.
 */
export async function avatarFromSheet(sheet: Buffer, sheetSize: number): Promise<Buffer> {
  const half = Math.floor(sheetSize / 2);
  const portrait = await sharp(sheet).extract({ left: 0, top: 0, width: half, height: half }).png().toBuffer();
  const win = await faceWindow(portrait);
  const square = await sharp(portrait).extract({ left: win.left, top: win.top, width: win.size, height: win.size }).png().toBuffer();
  return roundSticker(square);
}
