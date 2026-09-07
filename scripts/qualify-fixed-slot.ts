/** Immutable evidence for ONE slot/identity/age/scene version.
 * prepare is free. Render with the approved image CLI into raw.png.
 * inspect is free; judge explicitly spends at most one dual-review reservation.
 * Never publishes a demo patch or calls the image API. Use a fresh directory for retries.
 * tsx scripts/qualify-fixed-slot.ts prepare <dir> <scene> <target> <age> <reference>
 * tsx scripts/qualify-fixed-slot.ts inspect <dir>
 * tsx scripts/qualify-fixed-slot.ts judge <dir>
 * tsx scripts/qualify-fixed-slot.ts review-rejected <dir>  (diagnosis only, never certification)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { slotOf, cropOf } from "../src/services/generation/authoring";
import { prepareSlotEdit, SLOT_WIRE_VERSION } from "../src/infra/generation/openai";
import { childProblem, diffToPatch, paintMask, PROMPT_VERSION, EXTRACTION_VERSION } from "../src/services/generation/patch";
import { boardComposite } from "../src/services/generation/board-composite";
import { OpenAiPatchJudge } from "../src/infra/generation/judge";
import { boardJudgeReserveCents, BOARD_JUDGE_VERSION } from "../src/infra/generation/board-verdict";
import { envKey } from "./slot-patch";
import { validChildAge } from "../src/domain/child-appearance";

const hash = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
async function main() {
  const [mode, dirArg, slug, target, ageArg, refPath] = process.argv.slice(2);
  if (!mode || !dirArg || !["prepare", "inspect", "judge", "review-rejected"].includes(mode)) throw new Error("See usage in scripts/qualify-fixed-slot.ts");
  const dir = path.resolve(dirArg);
  const file = (name: string) => path.join(dir, name);
  const save = (name: string, value: unknown) => writeFileSync(file(name), JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
  if (mode === "prepare") {
    const ageYears = Number(ageArg);
    if (!slug || !target || !refPath || !validChildAge(ageYears)) throw new Error("Need scene, target, age 2–10, reference");
    if (existsSync(dir)) throw new Error("Use a fresh evidence directory; refusing overwrite");
    const c = slotOf(slug, target, "A", { ageYears, outputPx: 1024 });
    const original = await cropOf(c), ref = readFileSync(refPath);
    const wire = await prepareSlotEdit({ crop: original, paintMask: paintMask(c.ctx, c.art, c.slot), reference: ref, prompt: c.prompt, label: c.name });
    mkdirSync(dir, { recursive: true });
    for (const [name, b] of [["original.png", original], ["scene.png", wire.crop], ["mask.png", wire.mask], ["reference.png", wire.reference], ["prompt.txt", wire.promptSent]] as const) writeFileSync(file(name), b, { flag: "wx" });
    save("input.json", { slug, target, variant: "A", ageYears, sceneVersion: c.scene.version, sceneHash: hash(JSON.stringify(c.scene)), artHash: c.scene.art.sha256, promptVersion: PROMPT_VERSION, wireVersion: SLOT_WIRE_VERSION, extractionVersion: EXTRACTION_VERSION, hashes: Object.fromEntries(["original.png", "scene.png", "mask.png", "reference.png", "prompt.txt"].map(n => [n, hash(readFileSync(file(n)))])) });
    console.log(`Prepared ${c.name}, age ${ageYears}, scene v${c.scene.version}. No API calls.`);
    return;
  }
  const input = JSON.parse(readFileSync(file("input.json"), "utf8"));
  const c = slotOf(input.slug, input.target, "A", { ageYears: input.ageYears, outputPx: 1024 });
  if (hash(JSON.stringify(c.scene)) !== input.sceneHash || PROMPT_VERSION !== input.promptVersion || EXTRACTION_VERSION !== input.extractionVersion) throw new Error("Inputs/code changed; use a new cell");
  for (const [name, expected] of Object.entries(input.hashes)) if (hash(readFileSync(file(name))) !== expected) throw new Error(`Evidence changed: ${name}`);
  const raw = readFileSync(file("raw.png"));
  const fitted = await sharp(raw).resize(c.ctx.rect.w, c.ctx.rect.h, { kernel: "lanczos3" }).png().toBuffer();
  const patch = await diffToPatch({ originalCrop: readFileSync(file("original.png")), editedCrop: fitted, ctx: c.ctx, art: c.art, slot: c.slot });
  const base = readFileSync(path.join(process.cwd(), "public", c.scene.art.base));
  if (c.scene.art.sha256 && hash(base) !== c.scene.art.sha256) throw new Error("Runtime art hash mismatch");
  const boardCrop = await boardComposite({ base, art: c.art, patch: patch.webp, rect: patch.geometry.rect, layer: c.slot.layer, flip: c.slot.flip });
  if (mode === "inspect") {
    const problem = childProblem(patch);
    writeFileSync(file("patch.webp"), patch.webp, { flag: "wx" });
    writeFileSync(file("on-board.png"), boardCrop, { flag: "wx" });
    save("extraction.json", { rawHash: hash(raw), patchHash: hash(patch.webp), boardCropHash: hash(boardCrop), geometry: patch.geometry, expected: patch.expected, largest: patch.largest, shapeProblem: problem, renderCostUnknown: true, note: "Bundled CLI does not save usage; do not report the render as free or a measured price. This is one identity/one roll, not slot certification." });
    console.log(JSON.stringify({ name: c.name, shapeProblem: problem, onBoard: file("on-board.png") }));
    return;
  }
  const extraction = JSON.parse(readFileSync(file("extraction.json"), "utf8"));
  if (extraction.rawHash !== hash(raw) || extraction.patchHash !== hash(patch.webp) || extraction.boardCropHash !== hash(boardCrop)) throw new Error("Derived evidence changed since inspection");
  if (extraction.shapeProblem && mode !== "review-rejected") throw new Error("Shape rejected; no need to pay a judge");
  const key = envKey("OPENAI_API_KEY");
  if (!key) throw new Error("Missing existing OpenAI key");
  save("judge-reservation.json", { at: new Date().toISOString(), maxCents: boardJudgeReserveCents("Yuval"), version: BOARD_JUDGE_VERSION });
  const judgement = await new OpenAiPatchJudge(key).judge({ patchPng: patch.webp, boardCrop, reference: readFileSync(file("reference.png")), ageYears: input.ageYears, childName: "Yuval", label: c.name });
  save("judgement.json", { ...judgement, diagnosticOnly: mode === "review-rejected", releaseEligible: !extraction.shapeProblem && judgement.verdict === "ok" });
  console.log(JSON.stringify({ name: c.name, verdict: judgement.verdict, checks: judgement.checks, costCents: judgement.costCents, costUnknown: judgement.costUnknown, reason: judgement.reason }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
