/** Free diagnostic crops; leaves masters unchanged and makes no provider/database calls. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { MAGIC_PILOT_CATALOG, MAGIC_PILOT_PATCH_BOARDS } from "../content/adventures/magic-pilot";
import { cropOf, maskForHide } from "../src/domain/scene/local-patch-hides";

async function main() {
  const dir = path.resolve("output/magic-pilot-preflight-20260918"); await mkdir(dir, { recursive: true });
  for (const board of MAGIC_PILOT_PATCH_BOARDS) {
    const plan = MAGIC_PILOT_CATALOG.boards.find(p => p.boardSlug === board.board);
    if (plan?.status !== "ready") throw new Error("Missing approved art");
    const source = await readFile(board.art), meta = await sharp(source).metadata();
    if (createHash("sha256").update(source).digest("hex") !== plan.art.sha256 || meta.width !== 3840 || meta.height !== 2160) throw new Error("Master bytes/size mismatch");
    const crops = await Promise.all(board.hides.map(async hide => {
      const m = maskForHide(hide);
      const overlay = Buffer.from(`<svg width="512" height="768"><rect x="${m.left}" y="${m.top}" width="${m.width}" height="${m.height}" fill="none" stroke="#ff00ff" stroke-width="3"/><text x="12" y="28" fill="#ff00ff" font-size="22">${hide.targetId}</text></svg>`);
      return sharp(source).extract(cropOf(hide)).composite([{ input: overlay }]).png().toBuffer();
    }));
    await sharp({ create: { width: 1536, height: 768, channels: 4, background: "#ddd" } }).composite(crops.map((input, i) => ({ input, left: i * 512, top: 0 }))).png().toFile(path.join(dir, `${board.board}-zones.png`));
  }
  await writeFile(path.join(dir, "manifest.json"), JSON.stringify({ personalRenderApproval: false, catalogActivated: false, boards: MAGIC_PILOT_PATCH_BOARDS, catalog: MAGIC_PILOT_CATALOG }, null, 2));
  console.log(JSON.stringify({ dir, boards: 3, proposedHides: 9, protectedDiscoveries: 18, paidCalls: 0, personalRenderApproval: false }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
