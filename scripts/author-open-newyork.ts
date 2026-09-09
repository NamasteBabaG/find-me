/** Source-blind placement candidates, never labelled approved by this authoring step. */
import { readFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";
import { sha256Bytes } from "../src/services/generation/fixed-sprite";
import { writeImmutableBytes } from "./board-conditioned-probe-replay";

async function main() {
  const supplied = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], "utf8")) : null;
  const boardId = supplied?.boardId ?? "newyork";
  if (!/^[a-z]+$/.test(boardId)) throw new Error("Safe board ID required");
  const revision = supplied?.keepSlots ? 2 : 1;
  const root = supplied?.out ?? (supplied ? `work/open-placement-20260909/${boardId}-v${revision}` : "work/open-placement-20260909/newyork-v2");
  if (!/^work\/open-placement-20260909\/[a-z0-9/-]+$/.test(root)) throw new Error("Private versioned authoring directory required");
  mkdirSync(root, { recursive: true });
  const catalog = JSON.parse(readFileSync("work/fixed-world-simple-20260908/board-conditioned-engine-v1/visual-directions-v4.json", "utf8"));
  const board = catalog.boards.find((b: { boardId: string }) => b.boardId === boardId);
  if (!board) throw new Error("Board absent from catalog");
  const candidates: { id: string; x: number; ground: number; height: number; face: number; person: number[]; action: string }[] = supplied?.candidates ?? [
    { id: "newyork-open-taxi-front-v1", x: 550, ground: 950, height: 130, face: 18,
      person: [802, 840, 62, 170], action: "Stand naturally on the pavement in front of the taxi, feet together, arms relaxed. Turn three-quarter right watching the violin player; keep the face recognizable." },
    { id: "newyork-open-crossing-v1", x: 790, ground: 835, height: 120, face: 17,
      person: [850, 710, 62, 150], action: "Stand on the crossing beside the rear of the taxi, both feet planted. Look three-quarter left toward the street with one hand gently holding the jacket lapel, no waving." },
    { id: "newyork-open-pretzel-front-v1", x: 1135, ground: 1118, height: 144, face: 20,
      person: [960, 930, 67, 175], action: "Stand in front of the pretzel cart lower panel, both shoes on the pavement. Turn three-quarter right toward the vendor, with a small conversational gesture close to the body. No food or prop in hands." },
  ];
  if (candidates.length !== 3) throw new Error("Exactly three authored candidates required");
  if (supplied?.wardrobe) board.wardrobe = supplied.wardrobe;
  const ratio = 1.6; // Coordinates reviewed on the 1920x1280 display of the native 3072x2048 art.
  const clear = await sharp({ create: { width: 3072, height: 2048, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  const maskPath = `${root}/clear.png`; writeImmutableBytes(maskPath, clear);
  const bound = (path: string, bytes: Buffer) => ({ path, sha256: sha256Bytes(bytes) });
  const markers: string[] = [];
  board.slots = candidates.map((c, i) => {
    if (supplied?.keepSlots?.[i]) {
      const retained = board.slots.find((s: { slotId: string }) => s.slotId === supplied.keepSlots[i]);
      if (!retained) throw new Error("Requested retained slot is absent");
      return structuredClone(retained);
    }
    const prior = structuredClone(board.slots[i]);
    const x = Math.round(c.x * ratio), ground = Math.round(c.ground * ratio), height = Math.round(c.height * ratio);
    const window = { left: x - 90, top: ground - height - 32, width: 180, height: height + 48 };
    const slot = { id: c.id, mode: "open", pose: "standing", eye: { x, y: ground - height + Math.round(20 * ratio) },
      faceHeightPx: c.face * ratio, standingHeightPx: height, supportPointPx: { x, y: ground }, window };
    const metadata = Buffer.from(JSON.stringify({ slot, boardSha256: board.staticArt.sha256, foregroundSha256: sha256Bytes(clear),
      semanticStatus: "pending", authoring: { kind: "source-blind-candidate", comparatorRectDisplay1920: c.person,
        scaleBasis: "Manual board-context estimate; requires two-child composite and semantic review before approval", paidCalls: 0 } }, null, 2));
    const file = `${root}/${c.id}.json`; writeImmutableBytes(file, metadata);
    const [px, py, pw, ph] = c.person;
    Object.assign(prior, { slotId: c.id, pose: { family: "standing", instruction: c.action } });
    prior.lighting = { keyDirection: "Upper-left late-afternoon daylight across the street", colorTemperature: "Warm daylight, cool blue-grey building shade",
      relativeIntensity: i === 2 ? "Restrained midtones beside the shaded lower cart; no brighter than the nearby original children" : "Medium street exposure matching the original crossing children, no studio glow",
      fillAndBounce: i === 2 ? "Weak warm wood and bread-cart bounce, cool pavement fill" : "Subtle warm yellow taxi bounce, cool pavement fill",
      shadow: "Broad painted shadow planes under chin, inside sleeves and between legs; preserve original pavement and do not paint a separate shadow or scenery" };
    if (supplied?.lighting) prior.lighting = supplied.lighting;
    if (supplied?.slotLighting?.[i]) prior.lighting = supplied.slotLighting[i];
    Object.assign(prior.placement, { contract: bound(file, metadata), priorResultMetadata: bound(file, metadata), foreground: bound(maskPath, clear),
      eyeAnchorPx: slot.eye, eyeToChinPx: slot.faceHeightPx, contextRectPx: window, anchorMode: "observed-soles" });
    prior.references = { localStaticCrop: null, localStaticCropRectPx: window, originalPersonExample: null,
      originalPersonExampleRectPx: { left: Math.round(px! * ratio), top: Math.round(py! * ratio), width: Math.round(pw! * ratio), height: Math.round(ph! * ratio) } };
    markers.push(`<rect x="${window.left}" y="${window.top}" width="${window.width}" height="${window.height}" fill="none" stroke="#fbda26" stroke-width="4"/><circle cx="${x}" cy="${ground}" r="7" fill="#fbda26"/><text x="${x}" y="${ground + 32}" fill="#fbda26" font-size="28">${i + 1}</text>`);
    return prior;
  });
  catalog.boards = [board];
  const catalogPath = `${root}/catalog.json`; writeImmutableBytes(catalogPath, JSON.stringify(catalog, null, 2));
  const originalSpec = JSON.parse(readFileSync(`work/board-conditioned-engine-20260909/world-${boardId}-spec.json`, "utf8"));
  originalSpec.catalogPath = catalogPath; delete originalSpec.slotDirectionOverrides;
  if (supplied?.sourcePresentation) originalSpec.sourcePresentation = supplied.sourcePresentation;
  writeImmutableBytes(`${root}/spec.json`, JSON.stringify(originalSpec, null, 2));
  const overlay = Buffer.from(`<svg width="3072" height="2048" xmlns="http://www.w3.org/2000/svg">${markers.join("")}</svg>`);
  writeImmutableBytes(`${root}/candidates.png`, await sharp(readFileSync(board.staticArt.path)).composite([{ input: overlay }]).png().toBuffer());
  console.log(JSON.stringify({ root, slots: board.slots.map((s: { slotId: string }) => s.slotId), approved: false, paidCalls: 0 }));
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
