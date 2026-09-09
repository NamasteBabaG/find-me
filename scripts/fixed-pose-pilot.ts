/** Whole-body archetype pilot; free authoring/composition only. Paid calls use fixed-sprite-pilot. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve("work/fixed-sprite-pilot-20260908/standing-v1");
const BOARD = path.resolve("public/scenes/antarctica/refresh-20260907/base.webp");
const hash = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const json = (file: string, data: unknown) => writeFileSync(file, JSON.stringify(data, null, 2), { flag: "wx" });
const arg = (key: string, fallback = "") => process.argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;

async function prepare() {
  mkdirSync(ROOT, { recursive: false });
  const board = readFileSync(BOARD);
  const windows = [
    { id: "snow-ground", left: 780, top: 870, width: 600, height: 510 },
    { id: "cargo-occlusion", left: 1160, top: 430, width: 440, height: 430 },
  ];
  for (const win of windows) {
    const crop = await sharp(board).extract({ left: win.left, top: win.top, width: win.width, height: win.height }).png().toBuffer();
    writeFileSync(path.join(ROOT, `${win.id}.png`), crop, { flag: "wx" });
    const grid: string[] = [];
    for (let x = Math.ceil(win.left / 25) * 25; x < win.left + win.width; x += 25) grid.push(`<path d="M${x - win.left} 0V${win.height}" stroke="#00b7dc" opacity=".45"/><text x="${x - win.left + 1}" y="14" font-size="10" fill="black" stroke="white" stroke-width="2" paint-order="stroke">${x}</text>`);
    for (let y = Math.ceil(win.top / 25) * 25; y < win.top + win.height; y += 25) grid.push(`<path d="M0 ${y - win.top}H${win.width}" stroke="#00b7dc" opacity=".45"/><text x="1" y="${y - win.top - 2}" font-size="10" fill="black" stroke="white" stroke-width="2" paint-order="stroke">${y}</text>`);
    writeFileSync(path.join(ROOT, `${win.id}-grid.png`), await sharp(crop).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${win.width}" height="${win.height}">${grid.join("")}</svg>`) }]).png().toBuffer(), { flag: "wx" });
  }
  const previousPrompt = readFileSync("work/fixed-sprite-pilot-20260908/stages/style-seated-v1/prompt.txt", "utf8");
  const prompt = previousPrompt.slice(0, previousPrompt.indexOf("ONE PRECISE POSE:")) + `ONE PRECISE POSE:
ONE complete full-body standing girl, weight naturally balanced on BOTH feet, knees straight but relaxed, feet a small comfortable distance apart, the bottoms of both boots on the SAME horizontal ground level. Both entire boots and soles are clearly visible. Both arms hang relaxed beside her torso, no arm extended sideways, no crossed arms, no leaning, no sitting or crouching. Head upright, frontal face, pupils and the underside of the chin clearly visible. The viewpoint is gently from above like the nearby board children. Red padded winter jacket, blue snow trousers, grey mittens, brown-red winter boots; hood down, no hat. Eight-year-old child proportions, not a teenager or miniaturized adult. One connected body, two arms, two hands, two legs and two boots. Keep the facial drawing style and painted clothing language from image1; image2 is identity only.

OUTPUT:
Draw ONLY this one child on genuinely transparent alpha. No floor, ice, snow, scenery, props, cast shadow, halo, border, labels, other people or reference panels. Leave at least60clear pixels on ALLfour sides of the1024square canvas, including above the curls and below the soles. Whole head, curls, fingers and boots must fit without clipping. No artificial noise or skin pores, no photographic-looking face. Detailed warm drawn storybook child with expressive illustrated eyes and clearly drawn face shapes. Do not draw a hat. The same complete standing character will be placed unchanged at several compatible locations in the game.`;
  writeFileSync(path.join(ROOT, "prompt.txt"), prompt, { flag: "wx" });
  json(path.join(ROOT, "reference.json"), { boardFile: BOARD, boardSha256: hash(board), windows, promptSha256: hash(prompt), originalStylePromptSha256: hash(previousPrompt), method: "Standing full-body pose derived from previously user-accepted style direction; no head transplant, no new style iteration" });
  console.log(ROOT);
}

async function freeze() {
  const { sha256Rgba } = await import("../src/services/generation/fixed-sprite");
  const board = readFileSync(BOARD);
  const raw = await sharp(board).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const polygon = [
    [1287, 684], [1328, 663], [1355, 661], [1376, 664], [1410, 667],
    [1418, 679], [1417, 730], [1411, 740], [1365, 757], [1332, 750], [1286, 730],
  ];
  // This one-time polygon traces only opaque straight crate edges. It is not a
  // guessed silhouette around hair/foliage. Real board RGBA is restored inside it.
  const mask = Buffer.alloc(3072 * 2048 * 4);
  const inside = (x: number, y: number) => {
    let yes = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i]!, b = polygon[j]!;
      if ((a[1]! > y) !== (b[1]! > y) && x < (b[0]! - a[0]!) * (y - a[1]!) / (b[1]! - a[1]!) + a[0]!) yes = !yes;
    }
    return yes;
  };
  for (let y = 660; y <= 758; y++) for (let x = 1284; x <= 1475; x++) if (inside(x + .5, y + .5)) {
    const i = (y * 3072 + x) * 4;
    mask.set(raw.data.subarray(i, i + 4), i);
  }
  const maskFile = path.join(ROOT, "crate-foreground-v2.png");
  writeFileSync(maskFile, await sharp(mask, { raw: { width: 3072, height: 2048, channels: 4 } }).png().toBuffer(), { flag: "wx" });
  const p = (x: number, y: number) => ({ x: x / 3072, y: y / 2048 });
  const rect = (x: number, y: number, w: number, h: number) => [p(x, y), p(x + w, y), p(x + w, y + h), p(x, y + h)];
  const common = { version: "fixed-sprite/v3", measurementVersion: "visible-face/v1", board: { sha256: hash(board), width: 3072, height: 2048 }, poseId: "standing", anchorChecks: [] };
  const slots = [
    { id: "snow-ground", contract: { ...common, slotId: "antarctica-snow-ground-research-v1", support: { type: "ground", sourceLandmark: "soleMidpoint", destination: p(1044, 1134), tolerancePx: 5 },
      scale: { kind: "landmark-distance", from: "eyeMidpoint", to: "chin", destinationDistancePx: 24, tolerancePx: 3 },
      allowedEnvelope: rect(988, 910, 116, 229), forbiddenRegions: [{ id: "snowman-builder-face", polygon: rect(865, 980, 90, 83) }, { id: "brown-child-face", polygon: rect(1116, 1100, 90, 85) }] },
      window: { left: 780, top: 850, width: 600, height: 530 },
      annotation: "Open supported ground CONTROL, not a promised finished hiding spot. Fixed sole midpoint on the snow strip to the right of the snowman poles, left of brown-jacket child. Compare visible eye-midpoint-to-chin, not hats or entire silhouettes. Author-estimated24px face metric, frozen before source generation/observation; shadow/integration remains a visual review question." },
    { id: "cargo-occlusion", contract: { ...common, slotId: "antarctica-crate-research-v1", support: { type: "ground", sourceLandmark: "soleMidpoint", destination: p(1336, 741), tolerancePx: 5 },
      scale: { kind: "landmark-distance", from: "eyeMidpoint", to: "chin", destinationDistancePx: 22, tolerancePx: 3 },
      allowedEnvelope: rect(1280, 505, 116, 241), forbiddenRegions: [{ id: "yellow-child-face", polygon: rect(1368, 548, 64, 64) }, { id: "rear-child-face", polygon: rect(1270, 430, 64, 65) }],
      foregroundMask: { rgbaSha256: sha256Rgba(mask, 3072, 2048), width: 3072, height: 2048, mode: "board-foreground-alpha" } },
      foregroundFile: maskFile, window: { left: 1160, top: 430, width: 440, height: 430 },
      annotation: "Standing on snow behind the fixed cargo, NOT sitting on or emerging from its top. Foreground crate polygon traced once from straight opaque crate edges. Same-depth seated child to its right and yellow-jacket child farther behind provide approximate22px eye-midpoint-to-chin comparator. No existing face may be covered. Needs visual validation." },
  ];
  json(path.join(ROOT, "slots-v2.json"), { version: 2, status: "authored-candidates-not-human-approved", revisionReason: "Pre-render visual inspection: exclude the clear snow to the right of the main crate block. No child output or observation existed when revising.", createdAt: new Date().toISOString(), boardFile: BOARD, boardSha256: hash(board), foregroundPolygonBoardPixels: polygon, slots });
  const win = slots[1]!.window;
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${win.width}" height="${win.height}"><polygon points="${polygon.map(a => `${a[0]! - win.left},${a[1]! - win.top}`).join(" ")}" fill="#e7367e" fill-opacity=".35" stroke="#e7367e" stroke-width="1"/><circle cx="${1336 - win.left}" cy="${741 - win.top}" r="4" fill="#00ffff"/></svg>`);
  writeFileSync(path.join(ROOT, "crate-mask-review-v2.png"), await sharp(board).extract(win).composite([{ input: overlay }]).png().toBuffer(), { flag: "wx" });
  console.log(JSON.stringify({ slots: path.join(ROOT, "slots-v2.json"), sha256: hash(readFileSync(path.join(ROOT, "slots-v2.json"))) }));
}

async function proportionPrompt() {
  const source = readFileSync(path.join(ROOT, "prompt.txt"), "utf8");
  const prompt = source + `

CRITICAL BODY-PROPORTION CORRECTION:
The board's children have expressive relatively large illustrated heads on compact CHILD bodies. Do not draw the long-legged narrow-headed proportions of a realistic portrait or a fashion illustration. Keep Yuval recognizably eight years old in her face and expression, but translate her ENTIRE body into the same artist's stylized proportions, not just painted textures on a realistically proportioned body.
Target about FOUR skull-head-heights from crown to boot soles (ignore fluffy hair volume when counting heads). The vertical pupil-midpoint-to-sole distance should be approximately6 to7times the visible pupil-midpoint-to-chin distance, not10to11times. Shorten the torso and legs into coherent hand-drawn school-age-child proportions; never stretch the face, add a giant pasted head, make an infant, or use a chibi mascot style. This is the same richly illustrated age8girl with a naturally connected child neck/shoulders, compact winter clothes and shorter child legs, like image1's existing children.
Both soles still rest on one implied horizontal line and are fully visible. Arms hang down. No scene or ground, no props. Keep face identity and detailed confident drawn expression, but NO realistic skin rendering or adult body. The compact body proportions are more important than filling the1024canvas; retain generous transparent margins.`;
  const file = path.join(ROOT, "prompt-compact-body-v2.txt");
  writeFileSync(file, prompt, { flag: "wx" });
  json(path.join(ROOT, "body-proportion-hypothesis-v2.json"), { previousPromptSha256: hash(source), promptSha256: hash(prompt), hypothesis: "The current complete sprite has an eye-to-sole/eye-to-chin ratio10.53. Source-blind board diagnostics suggest roughly5.33–7.07, with low confidence and not certified ranges. Test coherent compact illustrated child proportions without changing the frozen slot geometry.", frozenSlotsSha256: hash(readFileSync(path.join(ROOT, "slots-v2.json"))), boardMeasurementReceiptSha256: hash(readFileSync("work/fixed-sprite-pilot-20260908/stages/original-board-metrics-v1/result.json")), noBoardContractRevision: true });
  console.log(file);
}

async function poseReference() {
  const dir = path.join(ROOT, "pose-reference-v5");
  mkdirSync(dir, { recursive: false });
  const board = readFileSync(BOARD);
  // A single original-board child is the pose/proportion exemplar, not a
  // two-person moodboard that requires the painter to invent another body.
  const crop = { left: 1048, top: 1055, width: 174, height: 223 };
  const reference = await sharp(board).extract(crop).png().toBuffer();
  writeFileSync(path.join(dir, "pose.png"), reference, { flag: "wx" });
  const prompt = `Asset: one reusable painted child sprite for this exact illustrated game.
Image 1 is the character to reinterpret: retain this illustrator's compact body proportions, the body's three-quarter angle, expression, broad painted shapes, winter coat, trousers and winter boots. It is a drawing reference, not a photographic person. Replace the central orange-and-green-coated illustrated boy with Yuval, the eight-year-old girl identified by image 2. Translate her recognizable face, warm light skin, brown eyes and long brown curls into image 1's drawing language. Do not preserve image 2's realistic portrait rendering.
Keep the reference boy's short illustrated torso and legs, generous illustrated head, natural stance, arm gesture and viewing angle. Her face should be visibly turned toward the viewer with a happy drawn expression, not a rigid front-facing photo portrait. No hat; curls replace the hat. Empty mittens, no rope or tool. Both complete boots must be visible in the reference's natural stance. Red winter coat, blue trousers, grey mittens and brown-red boots.
Output only that one whole-body illustrated girl, genuinely transparent background, with generous clear margins on all four sides. No snow, scenery, rope, props, cast shadow, halo, typography or additional people. Match the reference drawing itself rather than adding realistic detail or a noise filter. The entire child must belong to one drawing style.`;
  writeFileSync(path.join(dir, "prompt.txt"), prompt, { flag: "wx" });
  json(path.join(dir, "plan.json"), { version: 1, status: "hypothesis-not-approved", boardSha256: hash(board), crop, referenceSha256: hash(reference), promptSha256: hash(prompt), frozenSlotsSha256: hash(readFileSync(path.join(ROOT, "slots-v2.json"))), method: "One original-board visual pose/proportion exemplar instead of a multi-pose moodboard and numeric body instructions. Identity reference unchanged. MEDIUM only. Source observer and unchanged slots remain required.", exploratoryProportionRange: { eyeToSoleOverEyeToChin: [5, 7.5], provenance: "Source-blind board diagnostic with low confidence, exploratory NOT a certified scale gate" } });
  console.log(dir);
}

/** Free preparation: vary the child only, not the frozen pose, board or slot. */
async function secondIdentity() {
  const dir = path.join(ROOT, "second-identity-noa-v1");
  if (existsSync(dir)) throw new Error("Immutable second-identity inputs already exist");
  const sheetFile = path.resolve("work/placement/sheets/noa.png");
  const sheet = readFileSync(sheetFile);
  const metadata = await sharp(sheet).metadata();
  if (metadata.width !== 1024 || metadata.height !== 1024) throw new Error("Expected original full1024identity sheet");
  const identity = await sharp(sheet).extract({ left: 0, top: 0, width: 512, height: 512 }).png().toBuffer();
  const originalPrompt = readFileSync(path.join(ROOT, "pose-reference-v5/prompt.txt"), "utf8");
  if (!originalPrompt.includes("Yuval, the eight-year-old girl") || !originalPrompt.includes("long brown curls")) throw new Error("Frozen prompt changed");
  const prompt = originalPrompt.replace("Yuval, the eight-year-old girl", "Noa, the six-year-old girl").replace("long brown curls", "long softly wavy brown hair").replace("curls replace the hat", "her loose hair replaces the hat");
  mkdirSync(dir);
  writeFileSync(path.join(dir, "identity.png"), identity, { flag: "wx" });
  writeFileSync(path.join(dir, "prompt.txt"), prompt, { flag: "wx" });
  json(path.join(dir, "plan.json"), { version: 1, child: "Noa", ageYears: 6, identitySheetFile: sheetFile,
    identitySheetSha256: hash(sheet), identityCrop: { left: 0, top: 0, width: 512, height: 512 }, identityCropSha256: hash(identity),
    originalPromptSha256: hash(originalPrompt), promptSha256: hash(prompt),
    changed: ["name", "age", "identity hair description"], unchanged: ["style exemplar", "body pose", "wardrobe", "output dimensions", "quality MEDIUM"],
    rule: "A single source-only observation followed by unchanged frozen-slot placement. No per-child manual landmarks, slot movement or threshold changes. This file is preparation, not a paid render or approval." });
  console.log(dir);
}

async function compose() {
  const { extractSpriteCell, computeFixedPlacement, evaluateFixedPlacement, fixedPlacementManifest, fixedSlotV3ContractSchema, visibleSpriteSourceSchema, sha256Rgba } = await import("../src/services/generation/fixed-sprite");
  const slotsFile = arg("slots", path.join(ROOT, "slots-v2.json"));
  const sourceFile = arg("source", "work/fixed-sprite-pilot-20260908/stages/standing-archetype-yuval-v1/sheet.png");
  const observationFile = arg("observation", "work/fixed-sprite-pilot-20260908/stages/standing-observation-v1/result.json");
  const out = arg("out", path.join(ROOT, "automatic-v1"));
  const slotsBytes = readFileSync(slotsFile), slots = JSON.parse(slotsBytes.toString("utf8"));
  const observerBytes = readFileSync(observationFile), observed = JSON.parse(observerBytes.toString("utf8"));
  const sourceBytes = readFileSync(sourceFile), receiptBytes = readFileSync(path.join(path.dirname(sourceFile), "result.json"));
  const requestBytes = readFileSync(path.join(path.dirname(sourceFile), "request.json"));
  const observationRequestBytes = readFileSync(path.join(path.dirname(observationFile), "request.json"));
  const receipt = JSON.parse(receiptBytes.toString("utf8")), request = JSON.parse(requestBytes.toString("utf8"));
  const observationRequest = JSON.parse(observationRequestBytes.toString("utf8"));
  const lowContinuation = process.argv.includes("--low-pilot");
  if (lowContinuation && process.argv.includes("--paired-low")) throw new Error("Choose paired comparison OR LOW continuation");
  const expectedQuality = process.argv.includes("--paired-low") || lowContinuation ? "low" : "medium";
  const u = receipt.usage;
  if (observed.approved !== true || observed.costUnknown !== false || !observed.source || observed.wireMatchesRecordedInput !== true
      || observed.sourceImage?.sha256 !== hash(sourceBytes) || receipt.outputSha256 !== hash(sourceBytes) || receipt.costUnknown !== false
      || receipt.model !== "gpt-image-2" || receipt.attempts !== 1 || request.settings?.quality !== expectedQuality || request.policy?.imageQuality !== expectedQuality
      || request.settings?.modelRequested !== "gpt-image-2" || !(receipt.costCents > 0) || !Number.isFinite(receipt.costCents)
      || !/^req_/.test(receipt.providerRequestId ?? "") || !/^req_/.test(observed.requestId ?? "")
      || !(observed.costCents > 0) || !Number.isFinite(observed.costCents) || observed.modelReturned !== "gpt-5.6-sol"
      || !u || !["inputTokens", "outputTokens", "textInputTokens", "imageInputTokens"].every(k => Number.isSafeInteger(u[k]) && u[k] >= 0)
      || u.inputTokens !== u.textInputTokens + u.imageInputTokens || u.outputTokens <= 0
      || observationRequest.settings?.sourceReceiptSha256 !== hash(receiptBytes)) throw new Error("No usable hash-bound known approved-quality image and automatic source observation; no manual fallback");
  let continuationContext;
  if (lowContinuation) {
    const { validateLowContinuationRequest } = await import("./fixed-low-continuation-policy");
    const d = path.dirname(sourceFile);
    continuationContext = await validateLowContinuationRequest(request, { prompt: readFileSync(path.join(d, "prompt.txt")), style: readFileSync(path.join(d, "style.png")), identity: readFileSync(path.join(d, "identity.png")) });
    if (!process.argv.includes("--solve-scale") || !arg("scale-step")) throw new Error("LOW continuation requires an explicit bounded scale-search policy");
  } else if (expectedQuality === "low") {
    const { validateLowPairRequest } = await import("./fixed-quality-policy");
    const d = path.dirname(sourceFile);
    const baseline = await validateLowPairRequest(request, { prompt: readFileSync(path.join(d, "prompt.txt")), style: readFileSync(path.join(d, "style.png")), identity: readFileSync(path.join(d, "identity.png")) });
    if (hash(slotsBytes) !== baseline.proof.slotsFileSha256 || !process.argv.includes("--solve-scale") || Number(arg("scale-step")) !== baseline.proof.scaleStepPx) throw new Error("LOW comparison changed frozen slots or automatic scale policy");
  }
  const missingHistoricalCaptures: string[] = [];
  for (const [name, bytes] of [["source.png", sourceBytes], ["source-receipt.json", receiptBytes], ["source-request.json", requestBytes]] as const) {
    const capturedPath = path.join(path.dirname(observationFile), name);
    if (name !== "source.png" && !existsSync(capturedPath) && process.argv.includes("--allow-historical-observation")) {
      // Explicit research-only replay: earlier observation recorded the receipt
      // hash, but did not copy both receipt files. Do not fabricate old captures.
      missingHistoricalCaptures.push(name);
      continue;
    }
    const captured = readFileSync(capturedPath);
    if (!captured.equals(bytes) || !observationRequest.inputs?.some((i: { file: string; sha256: string }) => i.file === name && i.sha256 === hash(bytes))) throw new Error(`Observer's captured ${name} does not match the source evidence`);
  }
  const source = visibleSpriteSourceSchema.parse(observed.source);
  const r = await sharp(sourceBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const board = readFileSync(slots.boardFile), bm = await sharp(board).metadata();
  if (slots.boardSha256 !== hash(board) || bm.width !== 3072 || bm.height !== 2048) throw new Error("Frozen board mismatch");
  const extracted = extractSpriteCell({ rgba: r.data, width: r.info.width, height: r.info.height, grid: { cells: [source.measurementFrame.cell], clearancePx: 2 }, cellId: "standing", source,
    review: { sourceSha256: sha256Rgba(r.data, r.info.width, r.info.height), cellId: "standing", figureCount: observed.observation.figureCount, completeFigure: observed.observation.completeFigure, extraProps: observed.observation.extraProps, poseMatches: observed.observation.poseMatches, reviewer: `${observed.modelReturned}:${observed.promptVersion}`, note: "One paid source-only semantic measurement; not identity/style approval" } });
  mkdirSync(out, { recursive: false });
  const evidence = { slotsFileSha256: hash(slotsBytes), observationSha256: hash(observerBytes), observationRequestSha256: hash(observationRequestBytes), sourceFileSha256: hash(sourceBytes), sourceReceiptSha256: hash(receiptBytes), sourceRequestSha256: hash(requestBytes), imageRequestId: receipt.providerRequestId, observationRequestId: observed.requestId, missingHistoricalCaptures, productionEvidenceEligible: missingHistoricalCaptures.length === 0,
    ...(continuationContext ? { lowContinuation: continuationContext } : {}),
    processorFiles: ["scripts/fixed-pose-pilot.ts", "src/services/generation/fixed-sprite.ts", "src/services/generation/fixed-scale-solver.ts"].map(file => ({ file, sha256: hash(readFileSync(file)) })) };
  json(path.join(out, "inputs.json"), { ...evidence, source, slotsFile, sourceFile, observationFile, slots, extracted: { ok: extracted.ok, flags: extracted.flags, measurements: extracted.measurements } });
  const results = [];
  for (const slot of slots.slots) {
    const contract = fixedSlotV3ContractSchema.parse(slot.contract);
    let foreground;
    if (slot.foregroundFile) {
      const f = await sharp(readFileSync(slot.foregroundFile)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      foreground = { rgba: f.data, width: f.info.width, height: f.info.height };
    }
    const input = { contract, board: { sha256: hash(board), width: 3072, height: 2048 }, sprite: extracted, foreground };
    const nominal = computeFixedPlacement(input);
    let scaleSearch;
    let candidate = nominal;
    if (process.argv.includes("--solve-scale")) {
      const { solveFixedScale } = await import("../src/services/generation/fixed-scale-solver");
      const step = arg("scale-step");
      const { placement, ...search } = solveFixedScale({ ...input, sprite: extracted, policy: { version: "fixed-scale-solver/v1", ...(step ? { stepPx: Number(step) } : {}) } });
      scaleSearch = search;
      candidate = placement ?? nominal;
      json(path.join(out, `${slot.id}-scale-search.json`), search);
    }
    const pivotName = contract.support.sourceLandmark;
    const pivot = pivotName === "soleMidpoint" ? extracted.derivedLandmarks!.soleMidpoint : source.landmarks[pivotName];
    const scale = candidate.transform.scale * 1.5;
    const cases = [
      { id: "candidate", value: candidate, corruption: null },
      { id: "floating", value: evaluateFixedPlacement({ ...input, transform: { ...candidate.transform, translateY: candidate.transform.translateY - 35 } }), corruption: { dy: -35 } },
      { id: "oversized", value: evaluateFixedPlacement({ ...input, transform: { scale, translateX: contract.support.destination.x * contract.board.width - pivot.x * extracted.sourceWidth * scale, translateY: contract.support.destination.y * contract.board.height - pivot.y * extracted.sourceHeight * scale } }), corruption: { scaleFactor: 1.5, fixedAnchor: pivotName } },
    ];
    const diagnosticFace = arg("diagnostic-face");
    if (diagnosticFace) {
      const distance = Number(diagnosticFace);
      if (!Number.isFinite(distance) || distance < 1 || distance > 100) throw new Error("Diagnostic face must be between1and100board pixels");
      const eye = source.landmarks.eyeMidpoint, chin = source.landmarks.chin;
      const diagnosticScale = distance / Math.hypot((eye.x - chin.x) * extracted.sourceWidth, (eye.y - chin.y) * extracted.sourceHeight);
      cases.push({ id: `diagnostic-face-${distance}`, value: evaluateFixedPlacement({ ...input, transform: { scale: diagnosticScale,
        translateX: contract.support.destination.x * contract.board.width - pivot.x * extracted.sourceWidth * diagnosticScale,
        translateY: contract.support.destination.y * contract.board.height - pivot.y * extracted.sourceHeight * diagnosticScale } }),
        corruption: { scaleFactor: diagnosticScale / nominal.transform.scale, fixedAnchor: pivotName } });
    }
    for (const c of cases) {
      const dir = path.join(out, `${slot.id}-${c.id}`);
      mkdirSync(dir);
      const p = c.value.composite, visible = c.value.visibility!.sourceImage;
      const native = await sharp(visible.rgba, { raw: { width: visible.width, height: visible.height, channels: 4 } }).png().toBuffer();
      const patch = await sharp(p.rgba, { raw: { width: p.width, height: p.height, channels: 4 } }).png().toBuffer();
      const composite = await sharp(board).composite([{ input: patch, left: p.left, top: p.top }]).png().toBuffer();
      const context = await sharp(composite).extract(slot.window).png().toBuffer();
      writeFileSync(path.join(dir, "native-visible.png"), native, { flag: "wx" });
      writeFileSync(path.join(dir, "patch.png"), patch, { flag: "wx" });
      writeFileSync(path.join(dir, "context.png"), context, { flag: "wx" });
      const preview = await sharp(composite).resize(1536, 1024).png().toBuffer();
      writeFileSync(path.join(dir, "board.png"), preview, { flag: "wx" });
      json(path.join(dir, "manifest.json"), { ...fixedPlacementManifest(c.value, extracted), evidence, ...(scaleSearch ? { scaleSearch } : {}), corruption: c.corruption, annotation: slot.annotation, imageFiles: { nativeSha256: hash(native), patchSha256: hash(patch), contextSha256: hash(context), boardPreview: { sha256: hash(preview), width: 1536, height: 1024, role: "downsampled-review-preview-not-player-master" } }, visualStatus: "not-yet-reviewed" });
      const recipe = slot.judgeRecipe ?? {
        pose: "standing",
        support: slot.id === "snow-ground" ? "Snow ground between the blue-coated snowman builder on the left and the standing orange-green-coated child on the right. Verify actual contact and depth; a nominal coordinate is not visual proof of grounding." : "Snow behind the cargo crates near the hut deck. Verify that she occupies real space behind, not inside or on the crate.",
        occlusion: slot.foregroundFile ? "The actual cargo crate in front should hide the lower body at its real boundary, not nearby people. The face must remain unobstructed." : "No authored foreground object; the complete child must be visible and supported.",
        occlusionMode: slot.foregroundFile ? "layer" : "open",
      };
      json(path.join(dir, "judge-case.json"), { protocol: "fixed-pose-review/v1", manifest: path.resolve(dir, "manifest.json"), inputs: path.resolve(out, "inputs.json"), slotId: slot.id, patch: path.resolve(dir, "patch.png"), composite: path.resolve(dir, "context.png"), identity: path.resolve(arg("identity", "work/codex-judge-audit-20260908/pilot/sheet.png")), childName: arg("child", "Yuval"), ageYears: Number(arg("age", "8")), recipe, control: c.corruption !== null, expectedGeometryPassed: c.value.ok });
      results.push({ slot: slot.id, case: c.id, ok: c.value.ok, flags: c.value.flags, measurements: c.value.measurements, transform: c.value.transform, headAnchor: c.value.visibility!.headAnchor, hitRect: c.value.visibility!.hitRect, protectedFaceOccludedPixels: c.value.visibility!.protectedFaceOccludedPixels });
    }
  }
  json(path.join(out, "summary.json"), { ...evidence, sourceMeasuredOnce: true, allCasesUseExactSameSource: true, noManualSourcePoints: true, automaticRelease: false, results });
  console.log(JSON.stringify({ out, extracted: extracted.ok, results: results.map(x => ({ slot: x.slot, case: x.case, ok: x.ok, flags: x.flags.filter(f => f.severity === "error") })) }));
}

const command = process.argv[2] === "prepare" ? prepare : process.argv[2] === "freeze" ? freeze : process.argv[2] === "compose" ? compose : process.argv[2] === "proportion-prompt" ? proportionPrompt : process.argv[2] === "pose-reference" ? poseReference : process.argv[2] === "second-identity" ? secondIdentity : undefined;
if (!command) { console.error("Commands: prepare | freeze | compose | proportion-prompt | pose-reference | second-identity"); process.exitCode = 1; }
else command().catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1; });
