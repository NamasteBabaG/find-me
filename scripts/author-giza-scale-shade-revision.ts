/** Free, immutable Giza destination calibration; no API, mask or source edits. */
import { mkdirSync, readFileSync } from "node:fs";
import { loadBoardConditioningInputs } from "./board-conditioned-inputs";
import { writeImmutableBytes } from "./board-conditioned-probe-replay";
import { sha256Bytes } from "../src/services/generation/fixed-sprite";

async function main() {
  const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
  const flag = (n: string, fallback: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? fallback;
  const revision = flag("revision", "scale-shade-v1"), face = Number(flag("face", "22"));
  if (!/^[a-z0-9-]+$/.test(revision) || !Number.isFinite(face) || face < 18 || face > 35) throw new Error("invalid bounded authoring revision");
  const manifestPath = "work/open-placement-20260909/world-runtime-manifest-v2.json";
  const manifest = read(manifestPath), base = manifest.boards.find((b: { spec: string }) => /\/giza\//.test(b.spec));
  if (!base) throw new Error("Giza missing from baseline manifest");
  const spec = read(base.spec), catalog = read(spec.catalogPath), board = catalog.boards.find((b: { boardId: string }) => b.boardId === "giza");
  if (!board || board.slots.length !== 3) throw new Error("expected Giza three-slot catalog");
  const out = `work/open-placement-20260909/giza-${revision}`; mkdirSync(out, { recursive: true });
  const adjustments = [];
  for (const index of [0, 2]) {
    const direction = board.slots[index], previousPath = direction.placement.priorResultMetadata.path, previousBytes = readFileSync(previousPath);
    const previous = JSON.parse(previousBytes.toString("utf8")), priorSlot = structuredClone(previous.slot);
    // Export only the authored contract, never stale sample checks/transform from
    // the historic authoring metadata. Actual results come from the shared replay.
    const slot = structuredClone(previous.slot);
    if (index === 0) slot.faceHeightPx = face;
    slot.compositingTone = { version: "local-exposure-chroma/v1", exposureStops: index === 0 ? -.35 : -.65, saturation: index === 0 ? .78 : .70 };
    const metadata = { slot, boardSha256: board.staticArt.sha256, foregroundSha256: direction.placement.foreground.sha256,
      semanticStatus: "pending", automaticRelease: false, authoring: { kind: "whole-child-scale-and-light-calibration", paidCalls: 0,
        basis: index === 0 ? "Reduce the side-lean child's eye-to-chin size from35 to22nativepixels to match nearby same-depth original worker faces. Fixed eye point, real slab mask, pose and all protection geometry remain. Moderate whole-child exposure/chroma reduction, without targeting complexion."
          : "Match the existing fabric-canopy shade with bounded whole-child linear-light exposure and chroma reduction. Source light/wardrobe/pose, exact placement, original foreground and protected neighbors remain unchanged.",
        visualApproval: false },
      revision: { id: revision, baselineSpec: base.spec, priorContract: { path: previousPath, sha256: sha256Bytes(previousBytes) }, priorSlot,
        originalPaidSourceAndObservationsUnchanged: true, originalForegroundUnchanged: true, protectedRegionsUnchanged: true } };
    const metadataPath = `${out}/${direction.slotId}.json`, bytes = Buffer.from(JSON.stringify(metadata, null, 2));
    writeImmutableBytes(metadataPath, bytes);
    direction.placement.contract = { path: metadataPath, sha256: sha256Bytes(bytes) }; direction.placement.priorResultMetadata = direction.placement.contract;
    direction.placement.eyeToChinPx = slot.faceHeightPx; direction.placement.modifiedByThisCatalog = true;
    adjustments.push({ slot: index + 1, slotId: slot.id, oldFaceHeightPx: priorSlot.faceHeightPx, newFaceHeightPx: slot.faceHeightPx,
      eyeUnchanged: slot.eye, tone: slot.compositingTone, foregroundSha256: direction.placement.foreground.sha256 });
  }
  catalog.revision = { id: revision, baselineSpec: base.spec, purpose: "Giza post-composite scale and local shade correction", paidCalls: 0, visualApproval: false };
  const catalogPath = `${out}/catalog.json`; writeImmutableBytes(catalogPath, JSON.stringify(catalog, null, 2));
  const destination = { ...spec, catalogPath }; writeImmutableBytes(`${out}/spec.json`, JSON.stringify(destination, null, 2));
  await loadBoardConditioningInputs(destination);
  writeImmutableBytes(`${out}/adjustments.json`, JSON.stringify({ baselineManifest: manifestPath, baselineSpec: base.spec, adjustments,
    newApiCalls: 0, sourcePixelsEdited: false, sourceRawAlphaChanged: false, slot2Unchanged: true, semanticStatus: "pending" }, null, 2));
  console.log(JSON.stringify({ spec: `${out}/spec.json`, loader: "passed", adjustments, newApiCalls: 0 }));
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
