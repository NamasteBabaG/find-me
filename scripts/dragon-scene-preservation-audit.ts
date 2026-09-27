/** READ ONLY, offline. Recheck retained hide-2 evidence; never renders or writes.
 * Run: npx tsx scripts/dragon-scene-preservation-audit.ts */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { LocalPatchBoardSchema, cropOf, maskOf } from "../src/domain/scene/local-patch-hides";
import { BOARD_PAINT_SAMPLE } from "./lib/board-paint-sample";
import { inspectScenePreservation } from "./lib/scene-preservation-preflight";
import { LOCAL_PATCH_RETURN_GUARD, LOCAL_PATCH_COMPOSITION_VERSION } from "../src/services/generation/local-patch-seam";

const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
async function main() {
  if (process.argv.length !== 2) throw Error("This offline audit accepts no overrides");
  const dir = path.resolve(BOARD_PAINT_SAMPLE.storage);
  const inputBytes = readFileSync(path.join(dir, "inputs.json"));
  const inputs = JSON.parse(inputBytes.toString("utf8"));
  const board = LocalPatchBoardSchema.parse(inputs.boards[0].board);
  if (board.board !== BOARD_PAINT_SAMPLE.slug || board.art !== "public/scenes/magic-dragoncave-refresh-v3/base.webp") throw Error("Unexpected board");
  const hide = board.hides.find(h => h.id === `${BOARD_PAINT_SAMPLE.slug}-2`);
  if (!hide) throw Error("Missing hide 2");
  const prefix = `${hide.id}-attempt-1`;
  const art = readFileSync(board.art);
  const delivered = readFileSync(path.join(dir, `${prefix}.png`));
  const technical = JSON.parse(readFileSync(path.join(dir, `${prefix}.json`), "utf8"));
  if (hash(art) !== inputs.boards[0].sourceSha256 || hash(delivered) !== technical.sha256
    || hash(inputBytes) !== technical.inputsSha256) throw Error("Retained evidence binding mismatch");
  const size = await sharp(art).metadata();
  const crop = cropOf(hide), providerMask = maskOf(hide);
  if (technical.compositionVersion !== LOCAL_PATCH_COMPOSITION_VERSION) throw Error("Composition version changed; review this audit");
  // composeBoundedLocalPatch returns a guard around the provider mask, clipped
  // to the crop. The mask is NOT the hard pixel-preservation boundary.
  const left = Math.max(crop.left, providerMask.left - LOCAL_PATCH_RETURN_GUARD);
  const top = Math.max(crop.top, providerMask.top - LOCAL_PATCH_RETURN_GUARD);
  const editable = { left, top,
    width: Math.min(crop.left + crop.width, providerMask.left + providerMask.width + LOCAL_PATCH_RETURN_GUARD) - left,
    height: Math.min(crop.top + crop.height, providerMask.top + providerMask.height + LOCAL_PATCH_RETURN_GUARD) - top };
  // Conservative human-authored rectangle on the PUBLIC source board. Includes
  // surrounding pixels; not an exact prop mask and never fed to a painter.
  const region = { id: "arch-and-loose-block", rect: { left: 990, top: 1510, width: 420, height: 400 }, protectPixels: true };
  const inspection = { board: { width: size.width!, height: size.height! }, crop, editable, regions: [region] };
  const current = inspectScenePreservation(inspection);
  const widerContextOnly = inspectScenePreservation({ ...inspection, crop: { left: 970, top: 1300, width: 820, height: 768 } });
  const before = await sharp(art).extract(crop).removeAlpha().raw().toBuffer();
  const output = await sharp(delivered).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (output.info.width !== crop.width || output.info.height !== crop.height || output.info.channels !== 3) throw Error("Unexpected delivered dimensions");
  let measuredPixels = 0, changedPixels = 0, maxChannelDelta = 0;
  for (let y = Math.max(region.rect.top, crop.top); y < Math.min(region.rect.top + region.rect.height, crop.top + crop.height); y++) {
    for (let x = Math.max(region.rect.left, crop.left); x < Math.min(region.rect.left + region.rect.width, crop.left + crop.width); x++) {
      const offset = ((y - crop.top) * crop.width + x - crop.left) * 3;
      const delta = Math.max(...[0, 1, 2].map(c => Math.abs(before[offset + c]! - output.data[offset + c]!)));
      measuredPixels++; if (delta) changedPixels++; maxChannelDelta = Math.max(maxChannelDelta, delta);
    }
  }
  console.log(JSON.stringify({ version: "dragon-scene-preservation-audit/v1", paidCalls: 0, writes: 0,
    sourceSha256: hash(art), inputsSha256: hash(inputBytes), deliveredSha256: hash(delivered), crop, providerMask, editable,
    manualAnnotation: region, current, widerContextOnly,
    annotationIntersectionDiff: { measuredPixels, changedPixels, maxChannelDelta, meaning: "Rectangle includes scenery; not a semantic prop-preservation score" },
    conclusion: "Neither existing geometry nor wider context alone protects the prop. No candidate approved or installed. F-A remains open."
  }, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Offline audit failed"); process.exitCode = 1; });
