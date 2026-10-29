import sharp from "sharp";
import { guidedFrameGeometry, guidedFrameOverlay, type GuideRect } from "../../domain/generation/guided-frame-recovery";

/** Supply the actual original scene beyond the crop as well as its local
 * whole-body frame. This never changes the edited source, mask or return size. */
export async function localPatchPlacementGuidePixels(input: {
  sourcePng: Buffer; crop: GuideRect; child: GuideRect; returned: GuideRect; heads: readonly GuideRect[];
}): Promise<Buffer> {
  const { crop, child, returned, heads } = input, geometry = guidedFrameGeometry(child, returned);
  const meta = await sharp(input.sourcePng, { limitInputPixels: 8_294_400 }).metadata();
  if (!meta.width || !meta.height) throw Error("PLACEMENT_GUIDE: source dimensions required");
  const left = Math.max(0, Math.min(crop.left, ...heads.map(h => h.left)) - 80);
  const top = Math.max(0, Math.min(crop.top, ...heads.map(h => h.top)) - 80);
  const right = Math.min(meta.width, Math.max(crop.left + crop.width, ...heads.map(h => h.left + h.width)) + 80);
  const bottom = Math.min(meta.height, Math.max(crop.top + crop.height, ...heads.map(h => h.top + h.height)) + 80);
  const context = { left, top, width: right - left, height: bottom - top };
  const outline = (r: GuideRect, colour: string, local = false) =>
    `<rect x="${r.left + (local ? crop.left : 0) - left}" y="${r.top + (local ? crop.top : 0) - top}" width="${r.width}" height="${r.height}" fill="none" stroke="${colour}" stroke-width="4"/>`;
  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${context.width}" height="${context.height}">`
    + outline(crop, "white") + outline(returned, "#ffb020", true) + outline(geometry.target, "#00b8ff", true)
    + heads.map(h => outline(h, "#ff40b0")).join("") + "</svg>";
  const local = await sharp(input.sourcePng).extract(crop).composite([{ input: Buffer.from(guidedFrameOverlay(child, returned)) }]).png().toBuffer();
  const contextual = await sharp(input.sourcePng).extract(context).composite([{ input: Buffer.from(overlay) }]).png().toBuffer();
  const panel = await sharp(contextual).resize(512, 736, { fit: "contain", background: "#ffffff" }).png().toBuffer();
  const label = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="32"><rect width="512" height="32" fill="white"/><text x="12" y="22" font-family="sans-serif" font-size="16" fill="#202020">ORIGINAL SOURCE CONTEXT - reference only</text></svg>');
  return sharp({ create: { width: 1024, height: 768, channels: 4, background: "#ffffff" } })
    .composite([{ input: local, left: 0, top: 0 }, { input: label, left: 512, top: 0 }, { input: panel, left: 512, top: 32 }]).png().toBuffer();
}
