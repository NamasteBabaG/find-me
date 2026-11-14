import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { DETECTIVE_PATCH_BOARDS, DETECTIVE_SOURCE_NEIGHBORS } from "../content/detectives/runtime-release";
import { DETECTIVE_SOURCE_BOARDS } from "../content/detectives/source-release";
import { maskOf } from "../src/domain/scene/local-patch-hides";

// Only frozen public board bytes are used. No model, uploaded image or database.
async function main() {
  const folder = "demo/qa-detectives-v1";
  await mkdir(path.join("public", folder), { recursive: true });
  const manifest = [];
  for (const board of DETECTIVE_PATCH_BOARDS) {
    const art = DETECTIVE_SOURCE_BOARDS.find(source => source.board === board.board)!;
    const pixels = await readFile(art.path);
    const sha = createHash("sha256").update(pixels).digest("hex");
    if (sha !== art.sha256) throw Error(`Unexpected public board bytes for ${board.board}`);
    for (const hide of board.hides) {
      const registered = DETECTIVE_SOURCE_NEIGHBORS
        .find(entry => entry.boardId === board.board && entry.hideId === hide.id)!
        .neighbors.filter(neighbor => neighbor.sourceId.startsWith("source-"));
      if (registered.length !== 1) throw Error(`Missing unique public target head for ${hide.id}`);
      const head = registered[0]!.head;
      const body = maskOf(hide);
      const left = Math.min(body.left, head.left), top = Math.min(body.top, head.top);
      const rect = { left, top, width: Math.max(body.left + body.width, head.left + head.width) - left,
        height: Math.max(body.top + body.height, head.top + head.height) - top };
      const stem = `${folder}/${board.board}-${hide.targetId}`;
      await sharp(pixels).extract(rect).webp({ lossless: true }).toFile(`public/${stem}.webp`);
      await sharp(pixels).extract(head).webp({ lossless: true }).toFile(`public/${stem}-head.webp`);
      manifest.push({ board: board.board, targetId: hide.targetId, art: art.path.slice("public".length), rect, head });
    }
  }
  await writeFile("content/demo/qa-detective-art-v1.json", JSON.stringify(manifest, null, 2) + "\n");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
