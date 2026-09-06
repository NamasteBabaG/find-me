import sharp from "sharp";
import type { ArtRect, Size } from "./patch";

/** Same layer order and pixel rounding as SceneViewport. One current target is shown.
 * Crop is centred on the actual patch, never a guessed slot, with room to assess support.
 */
export async function boardComposite(input: {
  base: Buffer; foreground?: Buffer; art: Size; patch: Buffer; rect: ArtRect;
  layer?: "front" | "behindForeground"; flip?: boolean;
}): Promise<Buffer> {
  const { art, rect } = input;
  let patch = sharp(input.patch).resize(Math.round(rect.w * art.width), Math.round(rect.h * art.height));
  if (input.flip) patch = patch.flop();
  const child = { input: await patch.png().toBuffer(), left: Math.round(rect.x * art.width), top: Math.round(rect.y * art.height) };
  const fg = input.foreground ? [{ input: input.foreground, left: 0, top: 0 }] : [];
  const layers = input.layer === "behindForeground" ? [child, ...fg] : [...fg, child];
  const full = await sharp(input.base).composite(layers).png().toBuffer();
  const size = Math.min(art.width, art.height, Math.max(320, Math.ceil(Math.max(rect.w * art.width, rect.h * art.height) * 3)));
  const left = Math.max(0, Math.min(art.width - size, Math.round((rect.x + rect.w / 2) * art.width - size / 2)));
  const top = Math.max(0, Math.min(art.height - size, Math.round((rect.y + rect.h / 2) * art.height - size / 2)));
  return sharp(full).extract({ left, top, width: size, height: size }).png().toBuffer();
}
