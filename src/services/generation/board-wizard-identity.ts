import sharp from "sharp";
import { faceWindow } from "../../infra/generation/avatar-cut";
import { sha256Bytes } from "./fixed-sprite";

export const BOARD_WIZARD_IDENTITY_VERSION = "illustrated-sheet-portrait-gray512/v1";
/** Character-v2 guarantees a2×2 sheet with a top-left portrait. Use only
 * that portrait as identity, never the sheet's pose grid or body lighting.
 * This is free deterministic cropping; no child-specific landmarks or paths. */
export async function normalizeBoardWizardIdentity(sheet: Buffer) {
  const metadata = await sharp(sheet, { limitInputPixels: 25_000_000 }).metadata();
  if (!metadata.width || metadata.width !== metadata.height || metadata.width < 8 || metadata.format !== "png") throw new Error("BOARD_IDENTITY: expected canonical square illustrated2×2 sheet");
  const half = Math.floor(metadata.width / 2);
  const portrait = await sharp(sheet).extract({ left: 0, top: 0, width: half, height: half }).png().toBuffer();
  const window = await faceWindow(portrait, { air: 1.55 });
  const face = await sharp(portrait).extract({ left: window.left, top: window.top, width: window.size, height: window.size }).resize(220, 220).flatten({ background: "#808080" }).png().toBuffer();
  const png = await sharp({ create: { width: 512, height: 512, channels: 4, background: "#808080" } }).composite([{ input: face, left: 146, top: 146 }]).png().toBuffer();
  return { png, sha256: sha256Bytes(png), sourceSha256: sha256Bytes(sheet), version: BOARD_WIZARD_IDENTITY_VERSION, portraitWindow: window };
}
