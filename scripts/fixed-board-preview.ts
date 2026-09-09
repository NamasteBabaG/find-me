/**
 * FREE offline research preview. No provider, credentials, ledger, server or DB.
 * Run from repository root:
 *   node --import tsx scripts/fixed-board-preview.ts --case=... --case=... --out=work/.../new-preview
 * Each case is fully replayed before any output is written. We reuse the exact
 * verified QA raster, not native-player resampling (whose pixel parity remains
 * unverified), and never use candidate board.png or reapply foreground masks.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import sharp from "sharp";
import { z } from "zod";
import { validateFixedPoseReviewCase, type ValidatedFixedPoseCase } from "./fixed-pose-evidence";

const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const NOTICE = "Research preview, visual review pending; not production approval. Separate visual rejections remain in force.";
const inputsBoardSchema = z.object({ slots: z.object({ boardFile: z.string().min(1), boardSha256: z.string().regex(/^[a-f0-9]{64}$/) }) });
const rectSchema = z.object({ left: z.number().int().nonnegative(), top: z.number().int().nonnegative(), width: z.number().int().positive(), height: z.number().int().positive() });

/** Additional multi-target checks; per-case provenance is checked by the existing validator. */
export function assertCompatiblePreviewCases(cases: readonly ValidatedFixedPoseCase[]): void {
  if (cases.length === 0) throw new Error("At least one --case is required");
  const first = cases[0]!;
  const sourceEvidence = (item: ValidatedFixedPoseCase) => {
    const e = item.manifest.evidence;
    return [e.sourceFileSha256, e.sourceRequestSha256, e.sourceReceiptSha256, e.observationSha256, e.observationRequestSha256,
      item.evidence.imageRequestId, item.evidence.observationRequestId, item.sourceImageQuality, item.manifest.source,
      item.manifest.sourceImage.rgbaSha256];
  };
  const slots = new Set<string>();
  for (const [index, item] of cases.entries()) {
    if (item.caseData.control || item.manifest.corruption != null || !item.caseData.expectedGeometryPassed || !item.manifest.ok
      || !item.evidence.geometryPassed || item.evidence.geometryFailureAllowed || item.manifest.flags.some(flag => flag.severity === "error")) {
      throw new Error("Only non-control, geometry-passed candidate cases may appear on the board");
    }
    // The validator binds caseData.slotId to the frozen wrapper's local slot.id,
    // then binds that slot's contract to the manifest. A contract intentionally
    // may use a namespaced ID; the two labels are not required to be identical.
    if (slots.has(item.manifest.contract.slotId)) throw new Error("Each candidate must have a distinct frozen contract slot ID");
    slots.add(item.manifest.contract.slotId);
    if (!isDeepStrictEqual(item.manifest.contract.board, first.manifest.contract.board)) throw new Error("All cases must bind the same original board and dimensions");
    if (!isDeepStrictEqual(sourceEvidence(item), sourceEvidence(first))) throw new Error("All cases must reuse the same source, extraction and source-only observation");
    if (item.caseData.childName !== first.caseData.childName || item.caseData.ageYears !== first.caseData.ageYears
      || !isDeepStrictEqual(item.evidence.reference, first.evidence.reference)) throw new Error("All cases must bind the same child, age and identity evidence");
    const rect = rectSchema.parse(item.manifest.composite), board = item.manifest.contract.board;
    if (rect.left + rect.width > board.width || rect.top + rect.height > board.height) throw new Error("Verified board patch must fit without clipping");
    for (let prior = 0; prior < index; prior++) {
      const other = cases[prior]!.manifest.composite;
      if (rect.left < other.left + other.width && other.left < rect.left + rect.width
        && rect.top < other.top + other.height && other.top < rect.top + rect.height) {
        throw new Error(`Overlapping patch rectangles (${cases[prior]!.caseData.slotId}, ${item.caseData.slotId}) require separate depth review; this preview does not reorder or remask them`);
      }
    }
  }
}

export function parseFixedBoardPreviewArgs(args: readonly string[]) {
  const cases: string[] = []; let out: string | undefined;
  for (const arg of args) {
    if (arg.startsWith("--case=") && arg.slice(7).trim()) cases.push(arg.slice(7));
    else if (arg.startsWith("--out=") && arg.slice(6).trim() && out === undefined) out = arg.slice(6);
    else throw new Error(`Unsupported or duplicate argument: ${arg}. Use repeated --case=... and one --out=work/.../new-directory`);
  }
  if (!cases.length || !out) throw new Error("Required: at least one --case=... and one --out=work/.../new-directory");
  return { cases, out };
}

/** Parent must already exist. Resolve junctions before accepting an ignored-work destination. */
async function outputDirectory(requested: string): Promise<string> {
  const root = await realpath(path.resolve("work"));
  const requestedAbsolute = path.resolve(requested);
  const parent = await realpath(path.dirname(requestedAbsolute));
  const relative = path.relative(root, parent);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Preview output must be a new directory beneath ignored work/");
  const output = path.join(parent, path.basename(requestedAbsolute));
  if (output === root) throw new Error("A new preview directory, not work/ itself, is required");
  return output;
}

const escapeHtml = (value: unknown) => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export async function writeFixedBoardPreview(caseFiles: readonly string[], requestedOut: string) {
  const out = await outputDirectory(requestedOut);
  if (caseFiles.length === 0) throw new Error("At least one --case is required");
  const verified: ValidatedFixedPoseCase[] = [];
  // Sequential replay bounds peak memory. No paid judge or ledger is involved.
  for (const file of caseFiles) verified.push(await validateFixedPoseReviewCase(file));
  assertCompatiblePreviewCases(verified);
  const first = verified[0]!, boardIdentity = first.manifest.contract.board;
  // The validator captures inputs internally. Bind this reread before using its
  // board path, then retain this one board buffer for the entire assembly.
  const inputsBytes = await readFile(first.caseData.inputs);
  if (hash(inputsBytes) !== first.evidence.inputsSha256) throw new Error("Inputs changed after validation");
  const inputs = inputsBoardSchema.parse(JSON.parse(inputsBytes.toString("utf8")));
  const boardBytes = await readFile(inputs.slots.boardFile);
  if (hash(boardBytes) !== boardIdentity.sha256 || inputs.slots.boardSha256 !== boardIdentity.sha256) throw new Error("Original board changed after validation");
  const meta = await sharp(boardBytes).metadata();
  if (meta.width !== boardIdentity.width || meta.height !== boardIdentity.height || (meta.pages ?? 1) !== 1 || (meta.orientation ?? 1) !== 1) throw new Error("Original board frame differs from the frozen contracts");
  for (const item of verified) {
    if (hash(item.patchPng) !== item.evidence.patchSha256) throw new Error("Validated patch bytes changed");
    const patchMeta = await sharp(item.patchPng).metadata(), rect = item.manifest.composite;
    if (patchMeta.width !== rect.width || patchMeta.height !== rect.height) throw new Error("Verified patch dimensions differ from its exact QA rectangle");
  }
  // Fractional source transforms were already rasterized and byte-verified by
  // evaluateFixedPlacement through the validator. No new resize/rounding here.
  const boardPng = await sharp(boardBytes).composite(verified.map(item => ({ input: item.patchPng,
    left: item.manifest.composite.left, top: item.manifest.composite.top }))).png().toBuffer();
  const report = {
    version: "fixed-board-preview/v1", notice: NOTICE, createdAt: new Date().toISOString(),
    childName: first.caseData.childName, ageYears: first.caseData.ageYears,
    board: { ...boardIdentity, file: path.resolve(inputs.slots.boardFile) },
    output: { file: "board.png", sha256: hash(boardPng), width: boardIdentity.width, height: boardIdentity.height },
    composition: "Exact replayed board-resolution QA patches, once on the original board; no native resampling, placement changes, foreground reapplication or candidate-board restoration",
    overlapPolicy: "Reject any overlapping final patch rectangles; edge-touching is allowed. No target-to-target occlusion is inferred.",
    sourceMeasuredOnce: true, browserPixelParity: "unverified", semanticStatus: "pending", automaticRelease: false, paidCalls: 0,
    cases: verified.map((item, index) => ({ caseFile: path.resolve(caseFiles[index]!), slotId: item.caseData.slotId, contractSlotId: item.manifest.contract.slotId,
      researchMode: item.researchMode, sourceImageQuality: item.sourceImageQuality,
      boardPatch: item.manifest.composite, sourceCellToBoard: item.manifest.transform,
      nativeCropToBoard: item.manifest.visibility!.sourceImage.transform,
      hitRect: item.manifest.visibility!.hitRect, eyeAnchor: item.manifest.visibility!.headAnchor,
      measurements: item.manifest.measurements, recipe: item.caseData.recipe, evidence: item.evidence })),
  };
  const rows = report.cases.map(item => `<tr><td>${escapeHtml(item.slotId)}<br><small>${escapeHtml(item.contractSlotId)}</small></td><td>${escapeHtml(item.sourceImageQuality)} / ${escapeHtml(item.researchMode)}</td><td>${escapeHtml(item.evidence.caseSha256)}</td></tr>`).join("\n");
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fixed board research preview</title>
<style>body{font:16px system-ui;margin:24px;background:#f5f3ee;color:#242424}h1{font-size:24px}.notice{padding:16px;background:#fff1bd;border:1px solid #bd9a32}img{display:block;width:100%;height:auto;background:white}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #bbb;padding:8px;text-align:left;overflow-wrap:anywhere}p{max-width:1000px}</style>
<h1>${escapeHtml(report.childName)}, age ${report.ageYears} — ${report.cases.length} fixed appearances</h1>
<p class="notice">${escapeHtml(NOTICE)}</p><p>Geometry and captured evidence replayed. This is a full-resolution board QA image, not a deployed game or a native-player pixel-parity claim. Sole checks do not prove complete boot/calf concealment.</p>
<p><a href="board.png">Open original-size ${boardIdentity.width} × ${boardIdentity.height} PNG</a> · <a href="report.json">Read complete provenance</a></p><img src="board.png" alt="Research board preview for ${escapeHtml(report.childName)}">
<h2>Included evidence</h2><table><thead><tr><th>Frozen slot</th><th>Source / context</th><th>Case SHA-256</th></tr></thead><tbody>${rows}</tbody></table></html>`;
  // Exclusive new directory; existing previews are never overwritten. All
  // validation/encoding completes before this first filesystem mutation.
  await mkdir(out, { recursive: false });
  await writeFile(path.join(out, "board.png"), boardPng, { flag: "wx" });
  await writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2), { flag: "wx" });
  await writeFile(path.join(out, "index.html"), html, { flag: "wx" });
  return { out, boardSha256: report.output.sha256, cases: report.cases.length, paidCalls: 0, automaticRelease: false };
}

// The pilot and all recorded relative paths are explicitly repository-root based.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve("scripts/fixed-board-preview.ts")) {
  Promise.resolve().then(() => parseFixedBoardPreviewArgs(process.argv.slice(2))).then(args => writeFixedBoardPreview(args.cases, args.out))
    .then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
