/** New revision only: full standing sources behind real masks need no synthetic lower cut. */
import { mkdirSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { loadBoardConditioningInputs } from "./board-conditioned-inputs";
import { writeImmutableBytes } from "./board-conditioned-probe-replay";
import { sha256Bytes } from "../src/services/generation/fixed-sprite";
import { prepareBoardConditionedSource } from "../src/services/generation/board-conditioned-source";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const writeJson = (p: string, v: unknown) => writeImmutableBytes(p, JSON.stringify(v, null, 2));
const bound = (path: string, bytes: Buffer) => ({ path, sha256: sha256Bytes(bytes) });
const ROOT = "work/open-placement-20260909/three-closed-v2";
const policy = { quality: "medium" as const, reserveMicroUsd: 200_000, providerNamespace: "authoring:preflight", timeoutMs: 1000,
  rateCard: { id: "preflight-no-call", textInput: 5, imageInput: 8, imageOutput: 30 } };
async function main() {
  for (const boardId of ["paris", "sydney", "antarctica"]) {
    const originalSpec = read(`work/open-placement-20260909/three-closed-v1/${boardId}/spec.json`);
    const catalog = read(originalSpec.catalogPath), board = catalog.boards[0], dir = `${ROOT}/${boardId}`;
    mkdirSync(dir, { recursive: true });
    for (const direction of board.slots) {
      const metadata = read(direction.placement.priorResultMetadata.path);
      const converted = boardId === "paris" && direction.slotId === "paris-bakery-basket-peek"
        || boardId === "sydney" && direction.slotId === "sydney-near-rock-right-corner-peek";
      const protectPenguin = boardId === "antarctica" && direction.slotId === "antarctica-open-hut-shadow-v1";
      if (!converted && !protectPenguin) continue;
      if (converted) {
        const paris = boardId === "paris", id = paris ? "paris-bakery-complete-standing-layer-v1" : "sydney-rock-complete-standing-layer-v1";
        const supportY = paris ? 1875 : 1355, standingHeightPx = paris ? 290 : 240;
        delete metadata.slot.cutSelection;
        Object.assign(metadata.slot, { id, mode: "open", pose: "standing", supportPointPx: { x: metadata.slot.eye.x, y: supportY }, standingHeightPx });
        metadata.authoring = { kind: "complete-standing-with-original-foreground", paidCalls: 0,
          scaleMeasurement: "Manual native board-scale estimate, requires new source/composite verification",
          basis: paris
            ? "Complete child stands on the implied shop floor behind existing bread-basket counter pixels. Anchor column has solid original foreground from y1671 to1916; authored support y1875 lies inside it, with native mask side room121/43px. No lower body cut inferred."
            : "Complete child stands on the implied rock-pool floor behind the existing foreground rock face. Anchor column has solid original foreground from y1181 to1398; support y1355 lies inside it, with side room68/71px. No cut, new rock or shadow drawn.",
          formerBustedSourcePairNotCertified: true, originalForegroundUnchanged: true,
          shadowPolicy: "Ground contact is hidden by real foreground, not by deleting child pixels or drawing a detached shadow", semanticStatus: "pending" };
        direction.slotId = id;
        direction.pose = { family: "standing", instruction: paris
          ? "Draw a COMPLETE standing child for the bakery position, both shoes visible in this source. Torso three-quarter LEFT toward the shop visitors, one hand relaxed near the cardigan and the other making a small conversational gesture. All lower-body pixels will go behind the existing bread baskets. No basket, counter, baguette, floor or shadow generated; retain a readable three-quarter face."
          : "Draw a COMPLETE standing child for the rock-pool position, both shoes visible in this source. Turn three-quarter LEFT toward the children exploring the rock pools, hands gently together at the waist and shoulders relaxed. Existing real rock pixels hide the lower body after placement. Do not draw a rock, water, floor, prop or cast shadow. Keep a readable part of the face." };
        direction.placement.anchorMode = "observed-soles";
      }
      if (protectPenguin) metadata.slot.forbiddenRects.push({ id: "original-penguin-whole-body", left: 520, top: 670, width: 72, height: 133 });
      const file = `${dir}/${direction.slotId}.json`, bytes = Buffer.from(JSON.stringify(metadata, null, 2));
      writeImmutableBytes(file, bytes);
      direction.placement.contract = bound(file, bytes); direction.placement.priorResultMetadata = bound(file, bytes);
    }
    const catalogPath = `${dir}/catalog.json`; writeJson(catalogPath, catalog);
    const spec = { ...originalSpec, catalogPath }; writeJson(`${dir}/spec.json`, spec);
    const input = (await loadBoardConditioningInputs(spec))[0]!;
    const preflight = await prepareBoardConditionedSource(input, policy);
    const markers = input.slots.map((s, i) => {
      const w = s.slot.window, point = s.slot.mode === "open" ? s.slot.supportPointPx! : s.slot.eye;
      return `<rect x="${w.left}" y="${w.top}" width="${w.width}" height="${w.height}" stroke="#ffe340" stroke-width="3" fill="none"/><circle cx="${s.slot.eye.x}" cy="${s.slot.eye.y}" r="6" fill="#ffe340"/><circle cx="${point.x}" cy="${point.y}" r="6" fill="#20ffff"/><text x="${w.left}" y="${w.top-8}" font-size="24" fill="#ffe340">${i+1} ${s.slot.mode==='open'?'WHOLE':'CLIPPED'}</text>`;
    });
    writeImmutableBytes(`${dir}/candidates.png`, await sharp(input.board.png).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="3072" height="2048">${markers.join("")}</svg>`) }]).png().toBuffer());
    writeJson(`${dir}/preflight.json`, { boardId, spec: `${dir}/spec.json`, sourcePresentation: input.sourcePresentation,
      quality: "medium", loader: "passed", sourceContractValidation: "passed", contractSha256: preflight.contractSha256,
      note: "Preflight policy is no-call, not the production billing fingerprint. Whole-body source and semantic composite checks remain pending.",
      paidCalls: 0, automaticRelease: false, slots: input.slots.map(s => ({ id: s.slot.id, mode: s.slot.mode ?? "clipped", pose: s.slot.pose, cutSelection: s.slot.cutSelection ?? null })) });
    console.log(JSON.stringify({ boardId, spec: `${dir}/spec.json`, loader: "passed", contractValidation: "passed", paidCalls: 0 }));
  }
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
