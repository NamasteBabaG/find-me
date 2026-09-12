import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import release from "../../../content/local-patch-world/art.json";
import { sha256Bytes } from "./fixed-sprite";

/** Public WebP and frozen server PNG have different encodings but identical
 * decoded pixels. Both byte hashes and the common RGBA pixel hash are pinned in
 * the release. This reuses the already-packaged, child-free PNG without a CDN
 * fetch or another 59MB inside each server function. */
export async function readPinnedLocalPatchArt(art: string, publishedSha256: string, root = process.cwd()): Promise<Buffer | null> {
  const board = release.boards.find(row => `public${row.base}` === art);
  if (!board) return null;
  if (board.sha256 !== publishedSha256) throw new Error(`LOCAL_PATCH_HIDE: ${art} is not the art this scene ships`);
  const source = release.renderSources.find(row => row.board === board.board);
  if (!source || !/^content\/board-conditioned-qa\/[A-Za-z0-9_-]+\/[a-z0-9-]+\/board\.png$/.test(source.path))
    throw new Error(`LOCAL_PATCH_HIDE: no packaged render source for ${board.board}`);
  const expectedRoot = await realpath(path.join(root, "content/board-conditioned-qa"));
  const absolute = await realpath(path.resolve(root, source.path));
  const relative = path.relative(expectedRoot, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("LOCAL_PATCH_HIDE: render source leaves packaged artwork root");
  const bytes = await readFile(absolute);
  if (bytes.length > 32 * 1024 * 1024 || sha256Bytes(bytes) !== source.sha256)
    throw new Error(`LOCAL_PATCH_HIDE: packaged render source changed for ${board.board}`);
  const image = sharp(bytes, { limitInputPixels: 3072 * 2048 });
  const meta = await image.metadata();
  if (meta.width !== board.width || meta.height !== board.height || (meta.pages ?? 1) !== 1 || (meta.orientation ?? 1) !== 1)
    throw new Error(`LOCAL_PATCH_HIDE: wrong packaged raster for ${board.board}`);
  if (sha256Bytes(await image.ensureAlpha().raw().toBuffer()) !== source.pixelsSha256)
    throw new Error(`LOCAL_PATCH_HIDE: packaged pixels differ from the published board ${board.board}`);
  return bytes;
}
