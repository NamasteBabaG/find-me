/** Offline evidence only. No provider, database, game or public asset writes.
 * Reconstructs each serial board with the exact retained shipping crop. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { BOARD_PAINT_SAMPLE } from "./lib/board-paint-sample";
import { LocalPatchBoardSchema, cropOf } from "../src/domain/scene/local-patch-hides";

const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
async function main() {
  const dir = path.resolve(BOARD_PAINT_SAMPLE.storage);
  const inputBytes = readFileSync(path.join(dir, "inputs.json"));
  const inputs = JSON.parse(inputBytes.toString());
  const board = LocalPatchBoardSchema.parse(inputs.boards[0].board);
  const original = readFileSync(board.art);
  if (board.board !== BOARD_PAINT_SAMPLE.slug || hash(original) !== inputs.boards[0].sourceSha256) throw Error("Sample art binding changed");
  const proofs = [];
  for (const hide of board.hides) {
    const prefix = `${hide.id}-attempt-1`;
    const bytes = readFileSync(path.join(dir, `${prefix}.png`));
    const technical = JSON.parse(readFileSync(path.join(dir, `${prefix}.json`), "utf8"));
    if (technical.inputsSha256 !== hash(inputBytes) || technical.sha256 !== hash(bytes)) throw Error("Sample evidence binding changed");
    const crop = cropOf(hide);
    const composed = await sharp(original).composite([{ input: bytes, left: crop.left, top: crop.top }]).png().toBuffer();
    const full = `${prefix}-full-board.png`;
    writeFileSync(path.join(dir, full), composed);
    writeFileSync(path.join(dir, `${prefix}-board-preview.webp`), await sharp(composed).resize(1920).webp({ quality: 90 }).toBuffer());
    // No aesthetic processing; native-size crop next to its source for inspection.
    const before = await sharp(original).extract(crop).png().toBuffer();
    const comparison = await sharp({ create: { width: 1024, height: 768, channels: 3, background: 'white' } })
      .composite([{ input: before, left: 0, top: 0 }, { input: bytes, left: 512, top: 0 }]).png().toBuffer();
    writeFileSync(path.join(dir, `${prefix}-before-after.png`), comparison);
    proofs.push({ hideId: hide.id, fullBoardSha256: hash(composed), cropSha256: hash(bytes), technicallyAccepted: technical.accepted });
  }
  const approvedFile = path.resolve('output/bar-material-review-20260923/dragon-stool-style-proof-v2.png');
  const approved = readFileSync(approvedFile);
  const panels = [await sharp(approved).resize(512, 768).png().toBuffer(), ...board.hides.map(h => readFileSync(path.join(dir, `${h.id}-attempt-1.png`)))];
  const sheet = await sharp({ create: { width: 2048, height: 768, channels: 3, background: 'white' } })
    .composite(panels.map((input, i) => ({ input, left: i * 512, top: 0 }))).png().toBuffer();
  writeFileSync(path.join(dir, 'approved-and-three-native-crops.png'), sheet);
  writeFileSync(path.join(dir, 'evidence.json'), JSON.stringify({ inputsSha256: hash(inputBytes), approvedFile, approvedSha256: hash(approved),
    enforcedSampleReservationCeilingMicroUsd: BOARD_PAINT_SAMPLE.capMicroUsd,
    comparison: 'Left to right: approved two-stage reference resized to shipping scale, then v12 hides 1/2/3 at native 512x768. No retouching.', proofs }, null, 2));
  console.log(JSON.stringify({ dir, serialBoards: proofs.length, paidCalls: 0 }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Evidence export failed'); process.exitCode = 1; });
