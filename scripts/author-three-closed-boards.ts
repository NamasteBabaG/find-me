/** Three-board source-blind destination revision. Free paired-silhouette geometry checks only. */
import { readFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";
import { loadBoardConditioningInputs } from "./board-conditioned-inputs";
import { writeImmutableBytes } from "./board-conditioned-probe-replay";
import { chooseRobustPeekCut, ROBUST_PEEK_CUT_VERSION } from "../src/services/generation/robust-peek-cut";
import { sha256Bytes } from "../src/services/generation/fixed-sprite";
import type { SimplePeekUncutInput } from "../src/services/generation/simple-peek";

const ENGINE = "work/board-conditioned-engine-20260909";
const ROOT = "work/open-placement-20260909/three-closed-v1";
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const bound = (path: string, bytes: Buffer) => ({ path, sha256: sha256Bytes(bytes) });
const writeJson = (p: string, v: unknown) => writeImmutableBytes(p, JSON.stringify(v, null, 2));
const rect = (r: number[]) => ({ left: Math.round(r[0]! * 1.6), top: Math.round(r[1]! * 1.6), width: Math.round(r[2]! * 1.6), height: Math.round(r[3]! * 1.6) });
type Open = { id: string; x: number; ground: number; height: number; face: number; person: number[]; action: string; basis: string; light: string; fill: string };
type Choice = { keep: string; sweep?: boolean } | Open;
const choices: Record<string, Choice[]> = {
  paris: [
    { keep: "paris-bakery-basket-peek", sweep: true },
    { keep: "paris-balcony-flower-peek" },
    { id: "paris-open-shaded-foreground-paving-v1", x: 1250, ground: 1230, height: 135, face: 19,
      person: [711, 1033, 67, 170],
      action: "Stand on the shaded foreground paving left of the flower bicycle, both shoes planted close together. Turn three-quarter LEFT toward the child on the tricycle, shoulders relaxed and one hand loosely holding a cardigan edge. Keep a readable part of the face; no bicycle, toy, floor, pedestal or scenery.",
      basis: "Visible blue-grey paving between the tricycle and flower bicycle, away from the chair legs. Nearby original standing children supply scale; 135 display-pixel height is a manual same-depth child estimate, not model-certified.",
      light: "Diffuse cool skylight in existing foreground building shade, no direct golden sun on the child",
      fill: "Weak warm stone bounce under cool blue-grey ambient, broad matte shadow planes" },
  ],
  sydney: [
    { id: "sydney-open-lifeguard-shade-v1", x: 510, ground: 611, height: 98, face: 14,
      person: [405, 507, 65, 103],
      action: "Stand in the shaded sand just in front of the left half of the lifeguard chair, both soles flat and clearly visible. Look three-quarter RIGHT toward the nearby children playing at the water, one hand lightly on the hip and the other relaxed. Draw only the complete small child, not chair, bucket, sand or a separate cast shadow.",
      basis: "Both feet sit in the chair's existing painted blue-grey cast-shadow region. The child is in front of the chair structure rather than threaded through its diagonal beams. Match nearby seated beach children's head scale.",
      light: "Soft beach skylight screened by the lifeguard chair and umbrella, shaded face and body without a bright orange hair rim",
      fill: "Muted warm sand reflection and faint cyan water bounce; restrained saturation relative to the sunny beach" },
    { id: "sydney-open-surfboard-shade-v1", x: 193, ground: 925, height: 128, face: 18,
      person: [234, 774, 68, 160],
      action: "Stand naturally on the shaded sand at the base of the upright surfboards, LEFT of the original orange-shirt child. Both shoes remain visible. Turn three-quarter RIGHT as if listening to that child, one forearm bent gently inward and the other relaxed. No surfboard, bucket, food, platform or background generated.",
      basis: "Original tall surfboards already shade their base. Position leaves the neighbouring orange-shirt child's face and body untouched and stays above the foreground picnic hats. Same-depth original child bounds the scale.",
      light: "Diffuse daylight in the upright surfboards' shade, no isolated bright portrait highlights",
      fill: "Low-contrast warm sand bounce with a little reflected teal, modest saturation in all body planes" },
    { keep: "sydney-near-rock-right-corner-peek", sweep: true },
  ],
  antarctica: [
    { id: "antarctica-open-hut-shadow-v1", x: 381, ground: 499, height: 84, face: 12,
      person: [411, 437, 55, 84],
      action: "Stand on the blue-grey snow in front of the hut platform, both insulated boots planted and fully visible. Turn three-quarter RIGHT to watch the nearby child carrying supplies, hands relaxed close to the coat. Small child proportions. No crate, snow mound, floor, prop or separate cast shadow.",
      basis: "Existing coherent hut/platform shadow on the snow supplies the contact environment. Child stands in front of the platform, not balancing on a rail. Neighbouring supply-carrying child at similar depth supplies the size reference.",
      light: "Cool diffuse light in the hut's existing shadow, with no direct sunlit face or bright studio rim",
      fill: "Soft blue snow bounce and very weak warm red-hut reflection, broad muted coat and face planes" },
    { id: "antarctica-open-snowmobile-shadow-v1", x: 400, ground: 706, height: 112, face: 17,
      person: [505, 590, 78, 140],
      action: "Stand with both insulated boots on the shaded snow immediately in front of the snowmobile, arms close and relaxed. Turn three-quarter RIGHT toward the child making a snowman, head gently tilted with interest. Preserve a visible face. Do not draw a snowmobile, snowman, snow block, ground or cast shadow.",
      basis: "Uses the already-painted snowmobile shadow instead of isolated sunlit snow. Same fixed support point as the previously generated standing experiment; geometry and visible contact still require the new composite review.",
      light: "Cool shaded snowmobile foreground, diffuse winter sky rather than direct sunshine",
      fill: "Blue-grey snow bounce, very restrained warm vehicle reflection; no glossy face or luminous winter coat" },
    { keep: "antarctica-foreground-cargo-wall-peek" },
  ],
};
const RUNS: Record<string, string[]> = { paris: ["world-paris-v2", "noa-paris"], sydney: ["world-sydney", "noa-sydney"], antarctica: ["world-antarctica", "noa-antarctica"] };

async function main() {
  for (const boardId of (process.argv[2] ?? "paris,sydney,antarctica").split(",")) {
    const catalog = read("work/fixed-world-simple-20260908/board-conditioned-engine-v1/visual-directions-v4.json");
    const board = catalog.boards.find((b: { boardId: string }) => b.boardId === boardId);
    if (!board || !choices[boardId]) throw new Error("Unconfigured board");
    const input = (await loadBoardConditioningInputs(read(`${ENGINE}/world-${boardId}-spec.json`)))[0]!;
    const originalSlots = board.slots;
    const dir = `${ROOT}/${boardId}`; mkdirSync(dir, { recursive: true });
    const clear = await sharp({ create: { width: 3072, height: 2048, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    writeImmutableBytes(`${dir}/clear.png`, clear);
    const audits = [];
    const slots = [];
    for (const [index, choice] of choices[boardId]!.entries()) {
      if ("keep" in choice) {
        const prior = structuredClone(originalSlots.find((s: { slotId: string }) => s.slotId === choice.keep));
        const originalDirection = input.slots.find(s => s.slot.id === choice.keep)!;
        if (!prior || !originalDirection || originalDirection.slot.pose === "standing") throw new Error("Missing retained clipped slot");
        const seeds = RUNS[boardId]!.map(run => {
          const originalIndex = input.slots.findIndex(s => s.slot.id === choice.keep);
          const seed = read(`${ENGINE}/${run}/result.json`).extracted.sprites.find((s: { slotId: string }) => s.slotId === choice.keep);
          return { run, source: { png: readFileSync(`${ENGINE}/${run}/sprite-${originalIndex + 1}.png`), sha256: seed.sha256,
            eye: seed.eye, chin: seed.chin, protectedFacePolygon: seed.protectedFacePolygon, measurement: seed.measurement } as SimplePeekUncutInput["source"] };
        });
        const offsets = choice.sweep ? [0, 5, -5, 10, -10, 15, -15, 20, -20, 25, -25].flatMap(dx => [0, 5, 10, 15, 20, 25, 30, 40].map(dy => ({ dx, dy }))) : [{ dx: 0, dy: 0 }];
        offsets.sort((a, b) => Math.abs(a.dx) + a.dy - Math.abs(b.dx) - b.dy);
        let chosen = null;
        for (const offset of offsets) {
          const slot = { ...originalDirection.slot, pose: originalDirection.slot.pose, eye: { x: originalDirection.slot.eye.x + offset.dx, y: originalDirection.slot.eye.y + offset.dy }, cutSelection: ROBUST_PEEK_CUT_VERSION };
          const checks = [];
          for (const s of seeds) {
            const d = Math.hypot(s.source.chin.x - s.source.eye.x, s.source.chin.y - s.source.eye.y);
            const result = await chooseRobustPeekCut({ board: input.board, foreground: originalDirection.foreground, slot, source: s.source }, { minCutY: Math.ceil(s.source.chin.y + d) });
            checks.push({ run: s.run, result });
            if (!result) break;
          }
          if (checks.length === 2 && checks.every(c => c.result)) { chosen = { slot, offset, checks }; break; }
        }
        if (!chosen) { console.log(`${boardId}/${choice.keep}: no robust same-pose pair; retained candidate NOT certified`); }
        const slot = chosen?.slot ?? { ...originalDirection.slot, cutSelection: ROBUST_PEEK_CUT_VERSION };
        const file = `${dir}/${choice.keep}.json`;
        const metadata = Buffer.from(JSON.stringify({ slot, boardSha256: board.staticArt.sha256, foregroundSha256: prior.placement.foreground.sha256,
          semanticStatus: "pending", authoring: { kind: "fixed-destination-revision", changedGeometry: chosen?.offset ?? null,
            samePoseTwoChildRobust: Boolean(chosen), allSixStressAudit: `${ROOT.replace("three-closed-v1", "robust-cut-audit-v2")}/${boardId}/audit.json`,
            basis: "Original board/foreground untouched; a single shared destination is tested against both paid same-pose silhouettes. No per-child placement offset.", paidCalls: 0 } }, null, 2));
        writeImmutableBytes(file, metadata);
        prior.placement = { ...prior.placement, contract: bound(file, metadata), priorResultMetadata: bound(file, metadata), eyeAnchorPx: slot.eye };
        slots.push(prior);
        audits.push({ slotId: choice.keep, mode: "clipped", sharedOffset: chosen?.offset ?? null, samePoseTwoChildRobust: Boolean(chosen),
          results: chosen?.checks.map(c => ({ run: c.run, lowerCutY: c.result!.lowerCutY, firstHiddenCut: c.result!.firstHiddenCut, margin: c.result!.margin })) ?? [] });
        if (chosen) for (const c of chosen.checks) writeImmutableBytes(`${dir}/${choice.keep}-${c.run}-context.png`, c.result!.composite.contextPng);
        console.log(JSON.stringify({ boardId, slotId: choice.keep, sharedOffset: chosen?.offset ?? null, samePoseTwoChildRobust: Boolean(chosen) }));
        continue;
      }
      const prior = structuredClone(originalSlots[index]), x = Math.round(choice.x * 1.6), ground = Math.round(choice.ground * 1.6), height = Math.round(choice.height * 1.6);
      const window = { left: x - 90, top: ground - height - 32, width: 180, height: height + 48 };
      const slot = { id: choice.id, mode: "open", pose: "standing", eye: { x, y: ground - height + Math.round(choice.face * 1.6) },
        faceHeightPx: choice.face * 1.6, standingHeightPx: height, supportPointPx: { x, y: ground }, window,
        forbiddenRects: [{ id: "original-comparator-person", ...rect(choice.person) }] };
      const file = `${dir}/${choice.id}.json`, maskPath = `${dir}/clear.png`;
      const metadata = Buffer.from(JSON.stringify({ slot, boardSha256: board.staticArt.sha256, foregroundSha256: sha256Bytes(clear), semanticStatus: "pending",
        authoring: { kind: "source-blind-open-candidate", comparatorRectDisplay1920: choice.person, basis: choice.basis,
          shadowPolicy: "Existing coherent ground shade; no invented detached cast shadow", scaleMeasurement: "manual board-relative estimate, pending composite QA", paidCalls: 0 } }, null, 2));
      writeImmutableBytes(file, metadata);
      Object.assign(prior, { slotId: choice.id, pose: { family: "standing", instruction: choice.action },
        lighting: { keyDirection: choice.light, colorTemperature: boardId === "antarctica" ? "Cool blue-grey winter shade" : "Cool neutral shade with gentle local warm bounce",
          relativeIntensity: "Match the adjacent original people's shaded exposure and restrained colour saturation; no hero spotlight, glossy face, bright orange hair rim or luminous clothes",
          fillAndBounce: choice.fill, shadow: "Broad matte shadow planes on face, hair, hands and clothes together. Preserve intrinsic complexion. No detached background or cast shadow." } });
      prior.placement = { ...prior.placement, contract: bound(file, metadata), priorResultMetadata: bound(file, metadata), foreground: bound(maskPath, clear), eyeAnchorPx: slot.eye,
        eyeToChinPx: slot.faceHeightPx, contextRectPx: window, anchorMode: "observed-soles" };
      prior.references = { localStaticCrop: null, localStaticCropRectPx: window, originalPersonExample: null, originalPersonExampleRectPx: rect(choice.person) };
      slots.push(prior); audits.push({ slotId: choice.id, mode: "open", status: "unrendered-source-blind-candidate", basis: choice.basis });
    }
    board.slots = slots; catalog.boards = [board];
    const catalogPath = `${dir}/catalog.json`; writeJson(catalogPath, catalog);
    const spec = read(`${ENGINE}/world-${boardId}-spec.json`); spec.catalogPath = catalogPath; spec.sourcePresentation = "local-composite/v5"; delete spec.slotDirectionOverrides;
    writeJson(`${dir}/spec.json`, spec); writeJson(`${dir}/authoring-audit.json`, { boardId, paidCalls: 0, semanticStatus: "pending", slots: audits });
    const markers = slots.map((s: any, i: number) => { const slot = read(s.placement.priorResultMetadata.path).slot, w = slot.window; return `<rect x="${w.left}" y="${w.top}" width="${w.width}" height="${w.height}" stroke="#ffe340" stroke-width="4" fill="none"/><circle cx="${slot.eye.x}" cy="${slot.eye.y}" r="7" fill="#ffe340"/><text x="${w.left}" y="${w.top-8}" font-size="25" fill="#ffe340">${i+1} ${slot.mode==='open'?'OPEN':'CLIPPED'}</text>${slot.supportPointPx?`<circle cx="${slot.supportPointPx.x}" cy="${slot.supportPointPx.y}" r="7" fill="#2cffee"/>`:''}`; });
    const candidatePng = await sharp(input.board.png).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="3072" height="2048">${markers.join("")}</svg>`) }]).png().toBuffer();
    writeImmutableBytes(`${dir}/candidates.png`, candidatePng);
    await loadBoardConditioningInputs(spec);
    console.log(JSON.stringify({ boardId, spec: `${dir}/spec.json`, loaderPreflight: "passed", allSlotsAuthored: 3, approved: false }));
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
