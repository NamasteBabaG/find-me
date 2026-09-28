/** Offline preparation only. No database, credential, provider or publication. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { localPatchBoardForVersion } from "../src/domain/scene/local-patch-catalog";
import { cropOf } from "../src/domain/scene/local-patch-hides";
import { sceneBySlug } from "../src/services/scene-catalog.service";
import { readShippedBoardArt } from "../src/services/generation/local-patch-hide";
import { recomputePaidPatchJoin } from "../src/services/generation/local-patch-repair-compose";
import { sha256Bytes } from "../src/services/generation/fixed-sprite";

const rect = z.object({ left: z.number().int().nonnegative(), top: z.number().int().nonnegative(), width: z.number().int().positive(), height: z.number().int().positive() }).strict();
const specSchema = z.array(z.object({ board: z.string(), hideId: z.string(), attempt: z.number().int().min(1).max(3),
  rawBase64Path: z.string(), rawSha256: z.string().regex(/^[a-f0-9]{64}$/),
  returnWindow: rect, protectedCore: rect, faceRect: rect }).strict()).length(2);
async function main() {
  const [specPath, outputPath, ...extra] = process.argv.slice(2);
  if (!specPath || !outputPath || extra.length) throw Error("Usage: prepare-retained-collection-repair <private-spec.json> <private-output-dir>");
  const specifications = specSchema.parse(JSON.parse(readFileSync(specPath, "utf8")));
  const output = path.resolve(outputPath);
  mkdirSync(output, { recursive: true });
  const prepared = [];
  for (const spec of specifications) {
    const board = localPatchBoardForVersion(spec.board, 10), hide = board?.hides.find(h => h.id === spec.hideId);
    if (!board || !hide) throw Error("Unknown pinned collection appearance");
    const definition = sceneBySlug(spec.board, 10), original = await readShippedBoardArt(board.art, definition.art.sha256!);
    const raw = Buffer.from(readFileSync(spec.rawBase64Path, "utf8").trim(), "base64");
    if (sha256Bytes(raw) !== spec.rawSha256) throw Error("Paid source bytes changed");
    const alpha = Buffer.alloc(512 * 768), r = spec.returnWindow;
    const crop = cropOf(hide), world = { ...r, left: crop.left + r.left, top: crop.top + r.top };
    for (const other of board.hides.filter(h => h.id !== hide.id)) {
      const neighbour = cropOf(other);
      if (!(world.left + world.width <= neighbour.left || neighbour.left + neighbour.width <= world.left
        || world.top + world.height <= neighbour.top || neighbour.top + neighbour.height <= world.top)) throw Error("Return overlaps another appearance");
    }
    for (let y = 0; y < 768; y++) for (let x = 0; x < 512; x++) {
      const edge = Math.min(x - r.left, y - r.top, r.left + r.width - 1 - x, r.top + r.height - 1 - y);
      alpha[y * 512 + x] = Math.round(255 * Math.min(1, Math.max(0, edge / 6)));
    }
    const alphaPng = await sharp(alpha, { raw: { width: 512, height: 768, channels: 1 } }).toColourspace("b-w").png().toBuffer();
    const result = await recomputePaidPatchJoin({ beforePng: original, rawPng: raw, alphaPng, crop: cropOf(hide),
      returnWindow: r, protectedCore: spec.protectedCore, faceRect: spec.faceRect, boardSize: { width: 3840, height: 2160 } });
    // Immutable output: preparation cannot overwrite a previously inspected candidate.
    writeFileSync(path.join(output, `${spec.board}-candidate.png`), result.candidatePng, { flag: "wx" });
    writeFileSync(path.join(output, `${spec.board}-audit.json`), JSON.stringify(result.audit, null, 2), { flag: "wx" });
    prepared.push({ hideId: hide.id, attempt: spec.attempt, rawSha256: spec.rawSha256,
      originalBoardSha256: sha256Bytes(original), candidateSha256: result.candidateSha256,
      alphaSha256: sha256Bytes(alphaPng), alphaBase64: alphaPng.toString("base64"),
      protectedCore: spec.protectedCore, faceRect: spec.faceRect, returnWindow: r });
  }
  writeFileSync(path.join(output, "repairs.json"), JSON.stringify(prepared), { flag: "wx" });
  console.log(JSON.stringify({ prepared: prepared.map(p => ({ hideId: p.hideId, candidateSha256: p.candidateSha256 })), paidCalls: 0, liveMutations: 0 }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Preparation failed"); process.exitCode = 1; });
