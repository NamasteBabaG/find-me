/** Free original-board-only fixed-slot authoring. No provider, source sprite or database access. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import type { JudgeRecipe } from "../src/infra/generation/types";
import { sha256Bytes, sha256Rgba, fixedSlotV3ContractSchema, pointInPolygon, type NormalizedPolygon } from "../src/services/generation/fixed-sprite";

const BOARD_FILE = path.resolve("public/scenes/antarctica/refresh-20260907/base.webp");
const OUT = path.resolve("work/fixed-sprite-pilot-20260908/standing-v1/hut-crate-authoring-v1");
const BOARD_SHA256 = "551bbb397f07047a940397e2c51522e7ab76d5b6585caa7188d3dd5e57c3de5e";
const WIDTH = 3072;
const HEIGHT = 2048;
const WINDOW = { left: 240, top: 340, width: 740, height: 440 };
const write = (name: string, bytes: Buffer | string) => writeFileSync(path.join(OUT, name), bytes, { flag: "wx" });
const json = (name: string, value: unknown) => write(name, JSON.stringify(value, null, 2));

async function board() {
  const bytes = readFileSync(BOARD_FILE);
  if (sha256Bytes(bytes) !== BOARD_SHA256) throw new Error("Original board hash changed; do not silently reuse the authored coordinates");
  const raw = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (raw.info.width !== WIDTH || raw.info.height !== HEIGHT || raw.info.channels !== 4) throw new Error("Original board dimensions or decoded channels changed");
  return { bytes, raw };
}

async function inspect() {
  const { bytes } = await board();
  if (existsSync(OUT)) throw new Error("Inspection directory exists; historical evidence will not be overwritten");
  mkdirSync(OUT);
  const crop = await sharp(bytes).extract(WINDOW).png().toBuffer();
  write("original-crop.png", crop);
  const lines: string[] = [];
  for (let x = Math.ceil(WINDOW.left / 25) * 25; x < WINDOW.left + WINDOW.width; x += 25) lines.push(`<path d="M${x - WINDOW.left} 0V${WINDOW.height}"/><text x="${x - WINDOW.left + 2}" y="14">${x}</text>`);
  for (let y = Math.ceil(WINDOW.top / 25) * 25; y < WINDOW.top + WINDOW.height; y += 25) lines.push(`<path d="M0 ${y - WINDOW.top}H${WINDOW.width}"/><text x="2" y="${y - WINDOW.top - 2}">${y}</text>`);
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WINDOW.width}" height="${WINDOW.height}"><style>path{stroke:#00b7dc;stroke-opacity:.45;stroke-width:1}text{font:10px sans-serif;fill:#111;stroke:white;stroke-width:2;paint-order:stroke}</style>${lines.join("")}</svg>`);
  write("coordinate-grid.png", await sharp(crop).composite([{ input: overlay }]).png().toBuffer());
  json("inspection.json", { version: "original-board-inspection/v1", createdAt: new Date().toISOString(), boardFile: BOARD_FILE, boardSha256: BOARD_SHA256, boardWidth: WIDTH, boardHeight: HEIGHT, window: WINDOW, source: "original board only; no generated child was loaded", status: "manual-authoring-pending" });
  console.log(OUT);
}

async function details() {
  const { bytes } = await board();
  const crops = [
    { id: "crate-detail", left: 500, top: 425, width: 220, height: 255 },
    { id: "mauve-comparator", left: 670, top: 535, width: 90, height: 160 },
    { id: "green-comparator", left: 840, top: 530, width: 115, height: 190 },
  ];
  for (const crop of crops) {
    const native = await sharp(bytes).extract({ left: crop.left, top: crop.top, width: crop.width, height: crop.height }).png().toBuffer();
    write(`${crop.id}.png`, native);
    write(`${crop.id}-3x.png`, await sharp(native).resize(crop.width * 3, crop.height * 3, { kernel: "nearest" }).png().toBuffer());
  }
  json("detail-windows.json", { boardSha256: BOARD_SHA256, crops, enlargedImages: "3x nearest-neighbour inspection only; coordinates and measurements refer to original board pixels" });
}

async function fallbackDetails() {
  const { bytes } = await board();
  for (const crop of [
    { id: "freestanding-detail", left: 250, top: 870, width: 220, height: 165 },
    { id: "snow-green-comparator", left: 325, top: 692, width: 145, height: 197 },
    { id: "snow-blue-comparator", left: 125, top: 798, width: 150, height: 215 },
  ]) {
    const native = await sharp(bytes).extract({ left: crop.left, top: crop.top, width: crop.width, height: crop.height }).png().toBuffer();
    write(`${crop.id}.png`, native);
    write(`${crop.id}-3x.png`, await sharp(native).resize(crop.width * 3, crop.height * 3, { kernel: "nearest" }).png().toBuffer());
  }
}

async function fallbackInspect() {
  const { bytes } = await board();
  const window = { left: 70, top: 660, width: 650, height: 470 };
  const native = await sharp(bytes).extract(window).png().toBuffer();
  write("freestanding-crates-original.png", native);
  const marks: string[] = [];
  for (let x = Math.ceil(window.left / 25) * 25; x < window.left + window.width; x += 25) marks.push(`<path d="M${x - window.left} 0V${window.height}"/><text x="${x - window.left + 2}" y="14">${x}</text>`);
  for (let y = Math.ceil(window.top / 25) * 25; y < window.top + window.height; y += 25) marks.push(`<path d="M0 ${y - window.top}H${window.width}"/><text x="2" y="${y - window.top - 2}">${y}</text>`);
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${window.width}" height="${window.height}"><style>path{stroke:#00b7dc;stroke-opacity:.45;stroke-width:1}text{font:10px sans-serif;fill:#111;stroke:white;stroke-width:2;paint-order:stroke}</style>${marks.join("")}</svg>`);
  write("freestanding-crates-grid.png", await sharp(native).composite([{ input: overlay }]).png().toBuffer());
  json("fallback-inspection.json", { boardSha256: BOARD_SHA256, window, reason: "Hut crate appears close to wall; no certified standing-depth floor gap. Inspect a nearby freestanding rectangular crate instead, without any generated child." });
}

async function freeze() {
  const { bytes, raw } = await board();
  if (!existsSync(path.join(OUT, "freestanding-crates-grid.png"))) throw new Error("Inspect the original fallback and coordinates before freezing");
  const finalNames = ["foreground.png", "foreground-mask-preview.png", "contract-review.png", "manual-comparators.json", "authoring.json", "slots.json"];
  if (finalNames.some(name => existsSync(path.join(OUT, name)))) throw new Error("A frozen candidate artifact already exists; never overwrite or silently retune it");
  const p = (x: number, y: number) => ({ x: x / WIDTH, y: y / HEIGHT });
  const rect = (x: number, y: number, w: number, h: number): NormalizedPolygon => [p(x, y), p(x + w, y), p(x + w, y + h), p(x, y + h)];
  const foregroundPolygonsBoardPixels = [
    [[273, 894], [314, 882], [363, 899], [365, 902], [365, 955], [319, 965], [275, 950], [273, 946]],
    [[335, 933], [390, 917], [442, 935], [443, 994], [391, 1011], [335, 987]],
  ];
  const polygons = foregroundPolygonsBoardPixels.map(poly => poly.map(([x, y]) => p(x!, y!)));
  const foreground = Buffer.alloc(WIDTH * HEIGHT * 4);
  let restoredOriginalPixels = 0;
  for (let y = 880; y <= 1012; y++) for (let x = 272; x <= 444; x++) {
    if (!polygons.some(poly => pointInPolygon(p(x + 0.5, y + 0.5), poly))) continue;
    const index = (y * WIDTH + x) * 4;
    foreground.set(raw.data.subarray(index, index + 4), index);
    restoredOriginalPixels++;
  }
  const foregroundPng = await sharp(foreground, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } }).png().toBuffer();
  const decoded = await sharp(foregroundPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (!decoded.data.equals(foreground) || decoded.info.width !== WIDTH || decoded.info.height !== HEIGHT) throw new Error("Lossless mask round-trip or frame mismatch");
  const foregroundFile = path.join(OUT, "foreground.png");
  const comparators = [
    { id: "green-jacket-blue-hat", crop: "snow-green-comparator.png", cropFrame: { left: 325, top: 692, width: 145, height: 197 }, eyeMidpointBoardPixels: { x: 425, y: 736 }, chinBoardPixels: { x: 425, y: 761 }, estimatedDistanceRangePx: [22, 28], depthNote: "Standing on nearby snow behind/right of the selected crates; boots around y865–880." },
    { id: "blue-jacket-orange-hat", crop: "snow-blue-comparator.png", cropFrame: { left: 125, top: 798, width: 150, height: 215 }, eyeMidpointBoardPixels: { x: 182, y: 858 }, chinBoardPixels: { x: 185, y: 885 }, estimatedDistanceRangePx: [24, 31], depthNote: "Standing beside the penguin left/front of the selected crates; boots around y995–1010." },
  ].map(c => ({ ...c, eyeToChinDistancePx: Math.hypot(c.eyeMidpointBoardPixels.x - c.chinBoardPixels.x, c.eyeMidpointBoardPixels.y - c.chinBoardPixels.y), method: "manual visual estimate on native crop plus 3x nearest-neighbour inspection", eligibleForAutomaticCalibration: false, sourceImageSha256: sha256Bytes(readFileSync(path.join(OUT, c.crop))) }));
  const contract = fixedSlotV3ContractSchema.parse({
    version: "fixed-sprite/v3", measurementVersion: "visible-face/v1", board: { sha256: BOARD_SHA256, width: WIDTH, height: HEIGHT },
    poseId: "standing", slotId: "antarctica-freestanding-left-crates-research-v1",
    support: { type: "ground", sourceLandmark: "soleMidpoint", destination: p(318, 928), tolerancePx: 4 },
    scale: { kind: "landmark-distance", from: "eyeMidpoint", to: "chin", destinationDistancePx: 26, tolerancePx: 3 },
    anchorChecks: [], allowedEnvelope: rect(253, 728, 128, 211),
    forbiddenRegions: [
      { id: "pink-jacket-rear-child-face", polygon: rect(237, 639, 76, 80) },
      { id: "green-jacket-blue-hat-face", polygon: rect(388, 713, 71, 72) },
      { id: "blue-jacket-orange-hat-face", polygon: rect(149, 829, 90, 80) },
      { id: "red-jacket-left-edge-face", polygon: rect(0, 771, 100, 108) },
      { id: "red-jacket-snowmobile-face", polygon: rect(539, 837, 91, 96) },
      { id: "blue-jacket-snowmobile-face", polygon: rect(638, 838, 82, 98) },
      { id: "brown-jacket-hut-edge-face", polygon: rect(662, 681, 83, 85) },
      { id: "snowman-face", polygon: rect(136, 595, 85, 86) },
    ],
    foregroundMask: { rgbaSha256: sha256Rgba(foreground, WIDTH, HEIGHT), width: WIDTH, height: HEIGHT, mode: "board-foreground-alpha" },
  });
  const window = { left: 70, top: 660, width: 650, height: 470 };
  const annotation = "Original-board-only MANUAL candidate, not approved. Standing on the implied snow plane behind the rear/upper-left freestanding crate, below-left of the hut. The fixed sole midpoint is intentionally hidden by the existing wooden crate. It is NOT a seat or the crate top. Face scale26±3px uses approximate visible eye-midpoint-to-chin estimates on two nearby snow-level children, not skull/hat height. No generated child was loaded, fitted or composited during authoring. Native foreground pixels restore the two actual crate blocks, not an invented floor or shadow. Visual grounding, identity, style, proportions and cut-edge integration remain pending.";
  const judgeRecipe = {
    pose: "standing",
    support: "The child stands on snow BEHIND the rear/upper-left of the two freestanding wooden crates below-left of the hut. The support is a manually inferred hidden snow-plane contact around board(318,928), not the crate top, a seated contact, or a measured visible sole. The crate's existing shadow/contact with the snow supplies the scene's grounding cue. Require ordinary illustrated-game depth plausibility: no obvious levitation, body emerging from solid wood, or floating cut edge. Do not demand a new visible foot or millimetre-exact 3D proof when the actual crate legitimately hides it.",
    occlusion: "The existing crate top/sides must cleanly occlude the lower body at their real wooden boundary; the second front/right crate is also a foreground layer. The face and recognizable head must remain visible. No existing nearby face may be obscured, especially the green-jacket blue-hat child above-right, blue-jacket orange-hat child on the left, or pink-jacket child behind. Do not mistake normal foreground overlap with wood for missing anatomy; inspect the supplied whole-body source separately for completeness.",
    occlusionMode: "layer",
    scaleAndComparators: "Manual original-board estimates only: green-jacket blue-hat child eye→chin approximately25px (uncertainty22–28), blue-jacket orange-hat child approximately27px (uncertainty24–31). They are on nearby snow but not proven identical depth. Candidate target26±3px was fixed without fitting a generated child. Judge visually coherent illustrated child proportions and perspective, not only numerical face size. Uniform placement cannot correct a long-body/frontal source.",
    approval: "Research candidate. Geometric checks are not identity, style, depth or visual approval; automatic release remains false.",
  };
  const slot = { id: "freestanding-left-crates", contract, foregroundFile, window, annotation, judgeRecipe };
  const polygonSvg = foregroundPolygonsBoardPixels.map(poly => `<polygon points="${poly.map(([x, y]) => `${x! - window.left},${y! - window.top}`).join(" ")}" fill="#ed3293" fill-opacity=".35" stroke="#ed3293" stroke-width="1"/>`).join("");
  const sourceCrop = await sharp(bytes).extract(window).png().toBuffer();
  const svg = (contents: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${window.width}" height="${window.height}">${contents}</svg>`);
  const maskPreview = await sharp(sourceCrop).composite([{ input: svg(polygonSvg) }]).png().toBuffer();
  const forbiddenSvg = contract.forbiddenRegions.map(region => `<polygon points="${region.polygon.map(a => `${a.x * WIDTH - window.left},${a.y * HEIGHT - window.top}`).join(" ")}" fill="none" stroke="#ef4b35" stroke-width="1.5"/>`).join("");
  const pointsSvg = comparators.map(c => `<path d="M${c.eyeMidpointBoardPixels.x - window.left - 4} ${c.eyeMidpointBoardPixels.y - window.top}h8m-4 -4v8" stroke="#04daff" stroke-width="1.5"/><circle cx="${c.chinBoardPixels.x - window.left}" cy="${c.chinBoardPixels.y - window.top}" r="3" fill="none" stroke="#04daff" stroke-width="1.5"/>`).join("");
  const envelopeSvg = `<rect x="${253 - window.left}" y="${728 - window.top}" width="128" height="211" fill="none" stroke="#00c757" stroke-width="2"/><path d="M${318 - window.left - 6} ${928 - window.top}h12m-6 -6v12" stroke="#04daff" stroke-width="2"/><text x="${253 - window.left}" y="${728 - window.top - 7}" fill="#111" stroke="white" stroke-width="2" paint-order="stroke" font-family="sans-serif" font-size="12">MANUAL CANDIDATE — NOT APPROVED</text>`;
  const review = await sharp(sourceCrop).composite([{ input: svg(polygonSvg + forbiddenSvg + pointsSvg + envelopeSvg) }]).png().toBuffer();
  write("foreground.png", foregroundPng); write("foreground-mask-preview.png", maskPreview); write("contract-review.png", review);
  json("manual-comparators.json", { measurementVersion: "manual-board-visible-face-estimates/v1", boardSha256: BOARD_SHA256, automaticCalibration: false, comparators, decision: "Target26±3px is one-time manual art direction between nearby snow-level figures, not an observer-certified depth calibration." });
  const authoring = {
    version: "fixed-slot-authoring/v1", createdAt: new Date().toISOString(), status: "manual-candidate-not-approved", automaticRelease: false,
    boardFile: BOARD_FILE, boardSha256: BOARD_SHA256, decodedBoardRgbaSha256: sha256Rgba(raw.data, WIDTH, HEIGHT), boardWidth: WIDTH, boardHeight: HEIGHT,
    processor: { file: "scripts/fixed-slot-authoring.ts", sha256: sha256Bytes(readFileSync(path.resolve("scripts/fixed-slot-authoring.ts"))) },
    authoringInputs: "Original board and deterministic crops/grid only. No produced child, observation receipt or candidate composite was read by this script.",
    sourceMeasurementPolicy: "Per-child source landmarks remain independently and automatically measured; these manual board comparator estimates are never copied into source measurements.",
    rejectedHutLocation: { approximateCrateBounds: { left: 550, top: 550, width: 115, height: 115 }, reason: "Central deck crate is too close to the red wall to establish a usable behind-crate standing strip. Proposed y640–650 support could be inside its footprint. A porthole also contradicts the assumed blank-wall backdrop. No hut contract was frozen." },
    support: { boardPixels: { x: 318, y: 928 }, type: "manually inferred hidden snow-plane contact", basis: "Open snowy floor behind a freestanding crate, with rear projected floor contact roughly y935–950. Feet are meant to be hidden by the existing box; exact 3D depth is uncertain.", approved: false },
    foreground: { file: foregroundFile, encodedSha256: sha256Bytes(foregroundPng), rgbaSha256: contract.foregroundMask!.rgbaSha256, polygonsBoardPixels: foregroundPolygonsBoardPixels, restoredOriginalPixels, method: "Binary pixel-centre polygon inclusion; exact original board RGBA inside manually traced wooden blocks, zero RGBA outside. No snow shadow, pallet gap or body was synthesized." },
    uncertainty: ["Manual polygon edges may need rejection after visual cut-edge review; they must not be retuned silently after fitting a child.", "Nearby comparators differ in depth and pose. Their coordinates are approximate inspection notes, not validated anatomical measurements.", "A geometry-compatible child still needs independent identity/style/proportion/depth review.", "Existing crate shadows are preserved, but the source's visible upper body must read as behind the wood, not growing from it."],
    files: { originalCrop: "freestanding-crates-original.png", coordinateGrid: "freestanding-crates-grid.png", maskPreview: "foreground-mask-preview.png", contractReview: "contract-review.png", comparators: "manual-comparators.json", slots: "slots.json" },
  };
  json("authoring.json", authoring);
  json("slots.json", { version: 2, status: "authored-candidates-not-human-approved", createdAt: authoring.createdAt, boardFile: BOARD_FILE, boardSha256: BOARD_SHA256, sourceBlindAuthoring: true, sourceBlindnessScope: authoring.authoringInputs, authoringMetadataFile: path.join(OUT, "authoring.json"), foregroundPolygonsBoardPixels, slots: [slot] });
  console.log(JSON.stringify({ slotsFile: path.join(OUT, "slots.json"), slotsSha256: sha256Bytes(readFileSync(path.join(OUT, "slots.json"))), foregroundRgbaSha256: contract.foregroundMask!.rgbaSha256, restoredOriginalPixels, automaticRelease: false }));
}

async function clarifyJudgeRecipe() {
  // Preserve the source-blind frozen geometry and its original receipt. This
  // separate revision only exposes comparator prose under the JudgeRecipe API.
  const priorFile = path.join(OUT, "slots.json");
  const priorBytes = readFileSync(priorFile);
  const priorSha256 = sha256Bytes(priorBytes);
  if (priorSha256 !== "d37fd4cef6304db5daf9f1c78ce9f3829a4fa71afceeaa62b8e57be88987e641") throw new Error("Unexpected original authoring recipe; do not clarify an unknown revision");
  const prior = JSON.parse(priorBytes.toString("utf8"));
  const geometrySha256 = sha256Bytes(Buffer.from(JSON.stringify(prior.slots.map((slot: { contract: unknown }) => slot.contract))));
  for (const slot of prior.slots) {
    slot.judgeRecipe.comparators = slot.judgeRecipe.scaleAndComparators;
    delete slot.judgeRecipe.scaleAndComparators;
  }
  const afterGeometrySha256 = sha256Bytes(Buffer.from(JSON.stringify(prior.slots.map((slot: { contract: unknown }) => slot.contract))));
  if (afterGeometrySha256 !== geometrySha256) throw new Error("Judge wording correction changed frozen geometry");
  prior.judgeRecipeRevision = { version: 2, priorFile, priorSha256, geometrySha256, reason: "Rename scaleAndComparators to the supported JudgeRecipe.comparators field; no wording, geometry, source, mask, thresholds or support change." };
  json("slots-judge-v2.json", prior);
  console.log(JSON.stringify({ slotsFile: path.join(OUT, "slots-judge-v2.json"), slotsSha256: sha256Bytes(readFileSync(path.join(OUT, "slots-judge-v2.json"))), originalSlotsSha256: priorSha256, geometrySha256 }));
}

async function clarifyAuthoringScope() {
  const priorFile = path.join(OUT, "slots-judge-v2.json");
  const priorBytes = readFileSync(priorFile);
  const priorSha256 = sha256Bytes(priorBytes);
  if (priorSha256 !== "4b992122b04fdd4bde1d37d4ac81453f220fe81948e171da0b72f5a4ca52ca46") throw new Error("Unexpected judge-recipe revision");
  const slots = JSON.parse(priorBytes.toString("utf8"));
  const geometrySha256 = sha256Bytes(Buffer.from(JSON.stringify(slots.slots.map((slot: { contract: unknown }) => slot.contract))));
  if (geometrySha256 !== "f9b281ba0d68b375acf60a30d7fc4bbfb35017936a61041a4b5c6db679cb031d") throw new Error("Scope clarification must not change original geometry");
  const scope = "Only the original board and deterministic crops/grid were inputs to this authoring step and script. The author had previously reviewed generated standing sources in earlier work, so this is NOT a blinded study or a claim of no prior source knowledge. The candidate geometry was frozen before its first composition, without loading/fitting a produced child during this authoring step; no per-child retuning occurred.";
  const originalMetadataFile = path.join(OUT, "authoring.json");
  const originalMetadataBytes = readFileSync(originalMetadataFile);
  const metadata = JSON.parse(originalMetadataBytes.toString("utf8"));
  metadata.scopeClarification = { createdAt: new Date().toISOString(), originalBoardOnlyAuthoringInputs: true, blindedStudy: false, authorPreviouslyReviewedGeneratedSources: true, frozenBeforeFirstCompositionAgainstThisCandidate: true, scope, originalMetadataFile, originalMetadataSha256: sha256Bytes(originalMetadataBytes) };
  const metadataFile = path.join(OUT, "authoring-scope-v3.json");
  json("authoring-scope-v3.json", metadata);
  delete slots.sourceBlindAuthoring;
  delete slots.sourceBlindnessScope;
  slots.originalBoardOnlyAuthoringInputs = true;
  slots.authoringInputScope = scope;
  slots.authoringMetadataFile = metadataFile;
  slots.authoringScopeRevision = { version: 3, priorFile, priorSha256, geometrySha256, reason: "Clarify original-board-only inputs for this authoring step, not a blinded study. No geometry, mask, wording of judge instructions or source transform changed." };
  json("slots-judge-v3.json", slots);
  console.log(JSON.stringify({ slotsFile: path.join(OUT, "slots-judge-v3.json"), slotsSha256: sha256Bytes(readFileSync(path.join(OUT, "slots-judge-v3.json"))), geometrySha256, metadataFile }));
}

async function jointResearchRevision() {
  const { bytes } = await board();
  const priorFile = path.join(OUT, "slots-judge-v3.json");
  const priorBytes = readFileSync(priorFile);
  const priorSha256 = sha256Bytes(priorBytes);
  if (priorSha256 !== "9c6bd3417c8338aac4a4a8dfdf23e69ef85d659d629517f2ade7d7b90f3680c5") throw new Error("Unexpected prior authoring revision");
  const names = ["slots-judge-v4.json", "authoring-joint-v4.json", "contract-review-v4.png", "clothing-overlap-review-v4.png"];
  if (names.some(name => existsSync(path.join(OUT, name)))) throw new Error("Joint research revision already exists; no per-child retuning or overwrite");
  const wrapper = JSON.parse(priorBytes.toString("utf8"));
  const slot = wrapper.slots[0];
  const previousContractSha256 = sha256Bytes(Buffer.from(JSON.stringify(slot.contract)));
  const forbiddenBefore = JSON.stringify(slot.contract.forbiddenRegions);
  const supportBefore = JSON.stringify(slot.contract.support);
  const maskBefore = JSON.stringify(slot.contract.foregroundMask);
  const foregroundBytes = readFileSync(slot.foregroundFile);
  const foreground = await sharp(foregroundBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (sha256Rgba(foreground.data, foreground.info.width, foreground.info.height) !== slot.contract.foregroundMask.rgbaSha256) throw new Error("Frozen crate mask changed");
  const p = (x: number, y: number) => ({ x: x / WIDTH, y: y / HEIGHT });
  slot.contract.scale.destinationDistancePx = 25;
  slot.contract.scale.tolerancePx = 5;
  slot.contract.bodyScale = { kind: "landmark-distance-interval", from: "eyeMidpoint", to: "soleMidpoint", minDistancePx: 120, maxDistancePx: 165 };
  slot.contract.allowedEnvelope = [p(253, 728), p(386, 728), p(386, 939), p(253, 939)];
  slot.contract = fixedSlotV3ContractSchema.parse(slot.contract);
  if (JSON.stringify(slot.contract.forbiddenRegions) !== forbiddenBefore || JSON.stringify(slot.contract.support) !== supportBefore || JSON.stringify(slot.contract.foregroundMask) !== maskBefore) throw new Error("Research revision altered protected faces, anchor or crate mask");
  const priorApproval = slot.judgeRecipe.approval;
  const judgeRecipe: JudgeRecipe = {
    pose: "standing",
    support: "Occluded standing behind the rear/upper-left freestanding wooden crate below-left of the hut. The lower body can be hidden by the real wood. Treat this as a simple illustrated hiding place: no detailed pelvis, seating, riding, waterline or visible-foot contact is required. The fixed source/board anchor is a deterministic placement aid, not proof of physical grounding. Reject obvious levitation or a child growing out of solid wood, but do not require hidden feet to be shown.",
    occlusion: "Judge the supplied enlarged VISIBLE PATCH and the final board crop. The visible player patch already has the real crate foreground mask applied; source completeness was checked separately by the source observer and an unmasked whole-body source is NOT supplied here. Missing lower limbs at the actual wooden crate edge are intentional and valid. The face must stay clear. A shallow foreground mitten-over-trouser overlap with the green-jacket child is an expressly allowed illustrated crowd overlap because the inserted child is closer; it is not claimed to be empty snow. Reject merged/enlarged hands, body fusion, or any obstruction of an existing face. All original face exclusions and actual crate pixels remain fixed.",
    occlusionMode: "layer",
    comparators: "The original green-jacket blue-hat child has a manually estimated eye→chin span around25px and eye→sole around129–144px. The blue-jacket orange-hat child is around27px eye→chin and roughly137–152px eye→sole. Ages and exact depths are unknown. The revised face20–30px AND eye→sole120–165px bands are BROAD MIXED-AGE(2–10) ART-DIRECTION ALLOWANCES, NOT statistical confidence intervals or universal anatomical ratios. The review-informed revision acknowledges prior26px and20px diagnostics; it is not a blinded calibration. Judge coherent illustrated age/proportions and recognizable identity together, not identical face size for all neighboring children.",
  };
  // Mirror the strict paid-evidence wire contract here, without importing any CLI.
  z.object({ pose: z.string().min(1), support: z.string().min(1), occlusion: z.string().min(1), occlusionMode: z.enum(["open", "clipped", "layer"]), comparators: z.string().min(1).optional(), visibleFraction: z.number().min(0).max(1).optional() }).strict().parse(judgeRecipe);
  slot.judgeRecipe = judgeRecipe;
  slot.approvalMetadata = { status: "research-candidate-not-approved", automaticRelease: false, priorApprovalNote: priorApproval, geometryPassIsNotSemanticApproval: true };
  slot.annotation = "One-time REVIEW-INFORMED research revision: mixed-age stylized face20–30px and full observed eye→sole120–165px, broad art direction rather than statistical calibration. Original anchor, crate mask and every face exclusion preserved. Right envelope edge381→386 explicitly permits shallow foreground mitten-over-background-trouser overlap, not empty space. No seating, pelvis fitting or visible hidden-foot requirement. Frozen before the first source test against this revision; not a claim of source blindness or automatic approval.";
  slot.recommendedScaleSearchPolicy = { version: "fixed-scale-solver/v1", stepPx: 0.2, maxCandidates: 65, expectedUncappedCandidateCount: 51, reason: "The ten-pixel face interval would exceed the65-call cap at0.1px; choose the declared0.2px policy rather than silently truncate." };
  const metadata = {
    version: "fixed-slot-review-informed-revision/v4", createdAt: new Date().toISOString(), status: "research-candidate-not-approved", automaticRelease: false,
    priorFile, priorSha256, previousContractSha256, newContractSha256: sha256Bytes(Buffer.from(JSON.stringify(slot.contract))),
    boardFile: BOARD_FILE, boardSha256: BOARD_SHA256, foregroundFile: slot.foregroundFile, foregroundEncodedSha256: sha256Bytes(foregroundBytes), foregroundRgbaSha256: slot.contract.foregroundMask.rgbaSha256,
    frozenBeforeFirstSourceTestAgainstThisRevision: true, reviewInformed: true, blindedStudy: false,
    context: "The author and coordinator previously viewed produced source and26/20px diagnostic placements under the prior failed contract. This explicitly authorized one-time authoring revision is informed by that review; it is not a runtime per-child movement or a fabricated pass of the original recipe. This command reads only original board, prior recipe and frozen crate mask; it does not load, fit or compose a generated child.",
    bodyAndFace: { faceDistanceRangePx: [20, 30], standingBodyDistanceRangePx: [120, 165], interpretation: "Broad art-direction allowances for illustrated mixed-age children2–10, not statistical confidence intervals. Both conditions apply jointly, in addition to envelope/face/foreground guards." },
    clothingOverlapAllowance: { previousRightEdgePx: 381, newRightEdgePx: 386, inspectionFrame: { left: 355, top: 790, width: 70, height: 110 }, observation: "Original-board close inspection shows the x381–386 strip aroundy837 crosses the green child's trouser/knee, NOT empty snow.", authorization: "Coordinator explicitly permits shallow foreground mitten-to-background-trouser overlap by illustrated depth order. It does not authorize face obstruction, merged hands or fused bodies." },
    invariants: { sameBoard: true, sameSupport: true, sameForegroundBytes: true, sameForbiddenFaces: true, noSourcePixelsChanged: true },
    strictJudgeRecipe: { approvalMovedToSlotMetadata: true, onlySupportedKeys: Object.keys(judgeRecipe), sourceCompletenessNotMisrepresentedAsSuppliedJudgeInput: true },
    processor: { file: "scripts/fixed-slot-authoring.ts", sha256: sha256Bytes(readFileSync(path.resolve("scripts/fixed-slot-authoring.ts"))) },
  };
  const window = slot.window;
  const crop = await sharp(bytes).extract(window).png().toBuffer();
  const points = (poly: NormalizedPolygon) => poly.map(a => `${a.x * WIDTH - window.left},${a.y * HEIGHT - window.top}`).join(" ");
  const reviewSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${window.width}" height="${window.height}"><polygon points="${points(slot.contract.allowedEnvelope)}" fill="none" stroke="#00bf63" stroke-width="2"/>${slot.contract.forbiddenRegions.map((f: { polygon: NormalizedPolygon }) => `<polygon points="${points(f.polygon)}" fill="none" stroke="#e94545" stroke-width="1.5"/>`).join("")}<path d="M${318 - window.left - 5} ${928 - window.top}h10m-5 -5v10" stroke="#00cfff" stroke-width="2"/><rect width="${window.width}" height="25" fill="white" fill-opacity=".92"/><text x="7" y="18" font-family="sans-serif" font-size="13">REVIEW-INFORMED v4: face20–30 / body120–165; NOT APPROVED</text></svg>`);
  write("contract-review-v4.png", await sharp(crop).composite([{ input: reviewSvg }]).png().toBuffer());
  const frame = metadata.clothingOverlapAllowance.inspectionFrame;
  const originalDetail = await sharp(bytes).extract(frame).png().toBuffer();
  const detailOverlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="70" height="110"><path d="M26 0V110M0 47H70" stroke="#e94545" stroke-width=".5"/><path d="M31 0V110" stroke="#00cfff" stroke-width=".5"/></svg>`);
  const markedDetail = await sharp(originalDetail).composite([{ input: detailOverlay }]).png().toBuffer();
  write("clothing-overlap-review-v4.png", await sharp(markedDetail).resize(420, 660, { kernel: "nearest" }).png().toBuffer());
  json("authoring-joint-v4.json", metadata);
  wrapper.authoringMetadataFile = path.join(OUT, "authoring-joint-v4.json");
  wrapper.authoringInputScope = metadata.context;
  wrapper.reviewInformedRevision = { version: 4, priorFile, priorSha256, newContractSha256: metadata.newContractSha256, frozenAt: metadata.createdAt, automaticRelease: false };
  json("slots-judge-v4.json", wrapper);
  console.log(JSON.stringify({ slotsFile: path.join(OUT, "slots-judge-v4.json"), slotsSha256: sha256Bytes(readFileSync(path.join(OUT, "slots-judge-v4.json"))), newContractSha256: metadata.newContractSha256, foregroundRgbaSha256: slot.contract.foregroundMask.rgbaSha256, recommendedScaleSearchPolicy: slot.recommendedScaleSearchPolicy, automaticRelease: false }));
}

async function main() {
  if (process.argv[2] === "inspect") return inspect();
  if (process.argv[2] === "details") return details();
  if (process.argv[2] === "fallback-inspect") return fallbackInspect();
  if (process.argv[2] === "fallback-details") return fallbackDetails();
  if (process.argv[2] === "freeze") return freeze();
  if (process.argv[2] === "clarify-judge-recipe") return clarifyJudgeRecipe();
  if (process.argv[2] === "clarify-authoring-scope") return clarifyAuthoringScope();
  if (process.argv[2] === "joint-research-revision") return jointResearchRevision();
  throw new Error("Usage: node --import tsx scripts/fixed-slot-authoring.ts inspect|details|fallback-inspect|fallback-details|freeze|clarify-judge-recipe|clarify-authoring-scope|joint-research-revision");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
