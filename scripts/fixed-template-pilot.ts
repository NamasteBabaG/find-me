/** Local authored-template probe. No provider calls, game writes, or automatic acceptance. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { sha256Rgba } from "../src/services/generation/fixed-sprite";
import { fixedTemplateRecipeSchema, fixedTemplateRecipeSha256, sha256TemplateMask, processFixedTemplateEdit, fixedTemplateManifest } from "../src/services/generation/fixed-template";

const flag = (name: string, fallback = "") => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const sha = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
const save = (file: string, value: unknown) => writeFileSync(file, JSON.stringify(value, null, 2), { flag: "wx" });
const root = path.resolve("work/fixed-sprite-pilot-20260908/template-v1");
const png = (rgba: Buffer, width: number, height: number) => sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
const decode = async (file: string) => {
  const r = await sharp(readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { rgba: r.data, width: r.info.width, height: r.info.height };
};

async function author() {
  // A one-time authoring candidate, NOT a reusable human-approved pose or measured new anatomy.
  mkdirSync(root, { recursive: true });
  const templateFile = path.resolve("work/fixed-sprite-pilot-20260908/stages/style-seated-v1/sheet.png");
  const identityFile = path.resolve("work/fixed-sprite-pilot-20260908/stages/style-seated-v1/identity.png");
  const styleFile = path.resolve("work/fixed-sprite-pilot-20260908/stages/style-seated-v1/style.png");
  const boardFile = path.resolve("public/scenes/antarctica/refresh-20260907/base.webp");
  const template = await decode(templateFile);
  if (template.width !== 1024 || template.height !== 1024) throw new Error("Unexpected template frame");
  const mask = new Uint8Array(1024 * 1024);
  const rgba = Buffer.alloc(1024 * 1024 * 4);
  const overlay = Buffer.from(template.rgba);
  for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) {
    const p = y * 1024 + x;
    // Hair falls over the upper jacket: edit rectangle includes that overlap. Hands, lap,
    // seat silhouette, knees and boots remain entirely immutable; no hair clipping repair.
    mask[p] = x >= 190 && x < 750 && y < 460 ? 1 : 0;
    rgba[p * 4 + 3] = mask[p] ? 0 : 255;
    if (mask[p] && template.rgba[p * 4 + 3]! > 0) { overlay[p * 4] = 220; overlay[p * 4 + 2] = 160; }
  }
  const maskFile = path.join(root, "mask.png");
  writeFileSync(maskFile, await png(rgba, 1024, 1024), { flag: "wx" });
  writeFileSync(path.join(root, "mask-review.png"), await sharp(await png(overlay, 1024, 1024)).flatten({ background: "#8a8a8a" }).png().toBuffer(), { flag: "wx" });
  const recipe = fixedTemplateRecipeSchema.parse({
    version: "fixed-template/v1", templateId: "winter-seated-body-authoring-v1", poseId: "seated-hands-in-lap",
    template: { rgbaSha256: sha256Rgba(template.rgba, 1024, 1024), width: 1024, height: 1024 },
    editableMask: { sha256: sha256TemplateMask({ data: mask, width: 1024, height: 1024 }), encoding: "binary-0-1", width: 1024, height: 1024 },
    board: { sha256: sha(readFileSync(boardFile)), width: 3072, height: 2048 },
    templateFrame: { kind: "authored-template-frame", seatContact: { x: 415 / 1024, y: 630 / 1024 },
      protectedFacePolygon: [{ x: .432, y: .14 }, { x: .51, y: .135 }, { x: .523, y: .203 }, { x: .488, y: .235 }, { x: .441, y: .21 }],
      allowedHeadRegion: [{ x: 190 / 1024, y: 0 }, { x: 750 / 1024, y: 0 }, { x: 750 / 1024, y: 460 / 1024 }, { x: 190 / 1024, y: 460 / 1024 }] },
    placement: { scale: 60 / 177, destinationSeat: { x: 1930 / 3072, y: 1778 / 2048 } },
  });
  const prompt = `Edit IMAGE 1, a 1024x1024 transparent PNG seated winter pose template. IMAGE 2 is the child's face identity; IMAGE 3 shows the exact painted children's-book board style.

Personalize ONLY the head, face, curls and neck of the template to unmistakably depict the 8-year-old girl in IMAGE 2. Match her eye spacing, eyebrows, nose, youthful cheek/jaw shape, skin tone and brown curly hair, but DRAW them in the bold inked painterly storybook style of IMAGE 3. This is a warm expressive illustrated child, not a photographic adult portrait and not glossy 3D. Use a gentle natural smile, clear eye contours, clean block-painted shading. No hat.

The FIRST IMAGE is the exact coordinate frame and body pose, not a loose inspiration. Keep the head's centre, size, tilt and neck attachment exactly in place. Keep the same red coat, collar, arms, mittens together on lap, hip silhouette, bent knees, pants and boots at their original pixel positions. Do NOT zoom, recenter, rotate or resize the subject. Do NOT enlarge the head to improve recognizability. Hair may be personalized within the given upper area, but do not move the jacket/body or leave remnants of another head.

The edit mask covers the head/hair and their overlap over the upper jacket. Leave the coat texture and outline unchanged where no hair change is needed, especially near the horizontal lower mask edge at y=460. The finished head must join the original neck/collar without a cut, duplicated line, hole or colour seam. Everything below y=460 must remain unchanged. Keep genuine transparent alpha outside the character and fully opaque skin inside the face. No floor, seat, prop, snow, shadow, text, labels or other people. Return precisely the same 1024x1024 transparent canvas with the same seated child body. Only the identity of the existing head is being corrected.`;
  const promptFile = path.join(root, "prompt.txt");
  writeFileSync(promptFile, prompt, { flag: "wx" });
  save(path.join(root, "plan.json"), { version: 1, status: "authored-candidate-not-approved", templateFile, maskFile, boardFile, identityFile, styleFile, promptFile,
    promptSha256: sha(prompt), inputHashes: { "template.png": sha(readFileSync(templateFile)), "identity.png": sha(readFileSync(identityFile)), "style.png": sha(readFileSync(styleFile)) },
    recipe, recipeSha256: fixedTemplateRecipeSha256(recipe),
    annotation: "The reused body is an authored test template, not an observed pelvis or a human-approved template. Upper-jacket overlap is editable because the existing hair covers it. All lower-body pixels are restored exactly. No age/body compatibility claim beyond this eight-year-old pilot.",
    contextWindow: { left: 1500, top: 1360, width: 920, height: 688 },
  });
  console.log(JSON.stringify({ plan: path.join(root, "plan.json"), recipeSha256: fixedTemplateRecipeSha256(recipe) }));
}

async function compose() {
  const planFile = flag("plan", path.join(root, "plan.json")), editedFile = flag("edited"), out = flag("out");
  if (!editedFile || !out) throw new Error("Explicit --edited and unused --out required");
  const plan = JSON.parse(readFileSync(planFile, "utf8"));
  const paidDir = path.dirname(editedFile);
  const receiptBytes = readFileSync(path.join(paidDir, "result.json"));
  const requestBytes = readFileSync(path.join(paidDir, "request.json"));
  const receipt = JSON.parse(receiptBytes.toString("utf8")), request = JSON.parse(requestBytes.toString("utf8"));
  if (receipt.outputSha256 !== sha(readFileSync(editedFile)) || request.settings.planSha256 !== sha(readFileSync(planFile))
      || request.settings.kind !== "fixed-template-personalization" || receipt.costUnknown) throw new Error("Edited file does not match known paid request and frozen plan");
  const template = await decode(plan.templateFile), edited = await decode(editedFile), m = await decode(plan.maskFile);
  const binary = new Uint8Array(m.width * m.height);
  for (let p = 0; p < binary.length; p++) {
    if (m.rgba[p * 4 + 3] !== 0 && m.rgba[p * 4 + 3] !== 255) throw new Error("Non-binary API mask");
    binary[p] = m.rgba[p * 4 + 3] === 0 ? 1 : 0;
  }
  const board = readFileSync(plan.boardFile), bm = await sharp(board).metadata();
  const result = processFixedTemplateEdit({ recipe: plan.recipe, expectedRecipeSha256: plan.recipeSha256, template, edited, editableMask: { data: binary, width: m.width, height: m.height }, board: { sha256: sha(board), width: bm.width!, height: bm.height! } });
  mkdirSync(out, { recursive: false });
  const full = await png(result.restored.rgba, result.restored.width, result.restored.height);
  const native = await png(result.sourceImage.rgba, result.sourceImage.width, result.sourceImage.height);
  const patch = await png(result.composite.rgba, result.composite.width, result.composite.height);
  const composite = await sharp(board).composite([{ input: patch, left: result.composite.left, top: result.composite.top }]).png().toBuffer();
  writeFileSync(path.join(out, "restored.png"), full, { flag: "wx" });
  writeFileSync(path.join(out, "native.png"), native, { flag: "wx" });
  writeFileSync(path.join(out, "patch.png"), patch, { flag: "wx" });
  writeFileSync(path.join(out, "on-grey.png"), await sharp(full).flatten({ background: "#8a8a8a" }).png().toBuffer(), { flag: "wx" });
  const context = await sharp(composite).extract(plan.contextWindow).png().toBuffer();
  writeFileSync(path.join(out, "context.png"), context, { flag: "wx" });
  writeFileSync(path.join(out, "board.png"), composite, { flag: "wx" });
  const processorFiles = ["scripts/fixed-template-pilot.ts", "src/services/generation/fixed-template.ts", "src/services/generation/fixed-sprite.ts"].map(file => ({ file, sha256: sha(readFileSync(file)) }));
  save(path.join(out, "manifest.json"), { ...fixedTemplateManifest(result), processorFiles, paidProvenance: { requestSha256: sha(requestBytes), receiptSha256: sha(receiptBytes), providerRequestId: receipt.providerRequestId }, planSha256: sha(readFileSync(planFile)), editedFileSha256: sha(readFileSync(editedFile)), contextSha256: sha(context), imageFileHashes: { restored: sha(full), native: sha(native), patch: sha(patch), board: sha(composite) } });
  console.log(JSON.stringify({ out, mechanicalPass: result.ok, flags: result.flags, metrics: result.metrics, automaticRelease: false }));
}
const command = process.argv[2];
const f = command === "author" ? author : command === "compose" ? compose : undefined;
if (!f) { console.error("Commands: author | compose --edited=... --out=..."); process.exitCode = 1; }
else f().catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1; });
