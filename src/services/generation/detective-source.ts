import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { detectiveFamilyForBoard } from "../../../content/detectives/families";

/** Local, hash-bound artwork only. No runtime import from work/, network fetch,
 * private reference, generated personal sample or provider purchase. */
export async function readDetectiveSourceArt(slug: string, root = process.cwd()): Promise<Buffer> {
  const board = detectiveFamilyForBoard(slug).sources.find(b=>b.board===slug)!;
  const allowed = await realpath(path.join(root, "public/scenes"));
  const file = await realpath(path.join(root, board.path));
  const relative = path.relative(allowed, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw Error("DETECTIVES_SOURCE: source leaves shared artwork root");
  const bytes = await readFile(file);
  if (bytes.length > 32 * 1024 * 1024 || createHash("sha256").update(bytes).digest("hex") !== board.sha256)
    throw Error(`DETECTIVES_SOURCE: approved pixels changed for ${slug}`);
  const image = await sharp(bytes, { limitInputPixels: 3840 * 2160 }).metadata();
  if (image.width !== board.width || image.height !== board.height || (image.pages ?? 1) !== 1 || (image.orientation ?? 1) !== 1)
    throw Error(`DETECTIVES_SOURCE: wrong raster for ${slug}`);
  return bytes;
}
