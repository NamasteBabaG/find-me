/** Free destination authoring only. Keeps the paid source pose, wardrobe/light,
 * original board foreground pixels and all protected people unchanged. */
import { mkdirSync, readFileSync } from "node:fs";
import { loadBoardConditioningInputs } from "./board-conditioned-inputs";
import { writeImmutableBytes } from "./board-conditioned-probe-replay";
import { pointInPolygon, sha256Bytes } from "../src/services/generation/fixed-sprite";
import sharp from "sharp";
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
async function main() {
  const flag = (name: string, fallback: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
  const x = Number(flag("x", "1390")), y = Number(flag("y", "1795")), revision = flag("revision", "counter-support-v1");
  if (![x, y].every(Number.isInteger) || !/^[a-z0-9-]+$/.test(revision)) throw new Error("invalid authored coordinate/revision");
  const originalSpec = read("work/open-placement-20260909/world-runtime-v1/greatwall/spec.json"), catalog = read(originalSpec.catalogPath);
  const direction = catalog.boards[0].slots[2], originalPath = direction.placement.priorResultMetadata.path, originalBytes = readFileSync(originalPath), metadata = JSON.parse(originalBytes.toString("utf8"));
  const previousSlot = structuredClone(metadata.slot), dx = x - previousSlot.supportPointPx.x, dy = y - previousSlot.supportPointPx.y;
  metadata.slot.supportPointPx = { x, y }; metadata.slot.eye = { x: previousSlot.eye.x + dx, y: previousSlot.eye.y + dy };
  if (process.argv.includes("--wide")) metadata.slot.window = { left: 1170, top: 1490, width: 450, height: 450 };
  metadata.authoring = { ...metadata.authoring, kind: "original-counter-floor-contact-revision", basis: "Place the complete child on the higher landing BEHIND the existing food parapet, with soles fully covered by original solid wall pixels. No wall extension, pixel deletion, source modification or shadow invention. Preserved source intent and existing person/hand protections. Visual and source-measurement checks remain pending.", visualApproval: false };
  metadata.revision = { kind: "fixed-contact-geometry-only", priorMetadata: { path: originalPath, sha256: sha256Bytes(originalBytes) }, previousSlot,
    originalPaidSpriteUnchanged: true, originalForegroundUnchanged: true, originalPersonProtectionsUnchanged: true, automaticRelease: false };
  const out = `work/open-placement-20260909/greatwall-${revision}`, metadataPath = `${out}/${direction.slotId}.json`;
  mkdirSync(out, { recursive: true });
  if (process.argv.includes("--lantern")) {
    const board = await sharp(catalog.boards[0].staticArt.path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const fg = await sharp(direction.placement.foreground.path).ensureAlpha().raw().toBuffer();
    const polygon = [[320,155],[341,158],[357,170],[371,190],[375,207],[370,225],[355,240],[330,246],[307,244],[284,236],[272,217],[269,195],[277,176],[297,162]].map(([x,y]) => ({ x:1170+x!, y:1490+y! }));
    for (let y = 1640; y <= 1740; y++) for (let x = 1435; x <= 1550; x++) if (pointInPolygon({ x:x+.5, y:y+.5 }, polygon)) {
      const p = (y * board.info.width + x) * 4; board.data.copy(fg, p, p, p+4);
    }
    const png = await sharp(fg, { raw: { width:board.info.width, height:board.info.height, channels:4 } }).png().toBuffer();
    const fgPath = `${out}/original-lantern-and-food-wall-foreground.png`; writeImmutableBytes(fgPath, png);
    metadata.foregroundSha256 = sha256Bytes(png);
    metadata.revision.originalForegroundUnchanged = false;
    metadata.revision.originalForegroundExtendedWith = { object:"existing foreground hanging lantern beside food parapet", polygon,
      method:"exact original static-board RGBA copied within manually traced opaque lantern body; no generated/recolored/invented pixels", semanticStatus:"pending" };
    direction.placement.foreground = { path:fgPath, sha256:sha256Bytes(png) };
    metadata.authoring.originalForegroundUnchanged = false;
    metadata.authoring.foregroundPreservesOriginalBoardRgbExactly = true;
    metadata.slot.forbiddenRects.push({ id:"original-person-at-right-pole", left:1594, top:1669, width:112, height:312 });
    metadata.revision.addedProtection = "Original person at the right pole, newly included by the wider context. All former protections retained.";
    metadata.authoring.basis = "Complete child stands on the paved food landing immediately behind the existing hanging lantern, looking toward the food-sharing children. Original opaque lantern pixels hide the lower body and support point. Original food-wall mask and protected people/hand geometry remain. Source pose, wardrobe and local daylight unchanged; no generated prop/shadow or lower-body deletion.";
  }
  const bytes = Buffer.from(JSON.stringify(metadata, null, 2)); writeImmutableBytes(metadataPath, bytes);
  direction.placement.contract = { path: metadataPath, sha256: sha256Bytes(bytes) }; direction.placement.priorResultMetadata = direction.placement.contract;
  direction.placement.eyeAnchorPx = metadata.slot.eye;
  direction.placement.contextRectPx = metadata.slot.window;
  direction.references.localStaticCropRectPx = metadata.slot.window;
  if (direction.placement.supportPointPx) direction.placement.supportPointPx = metadata.slot.supportPointPx;
  catalog.revision = { id: revision, purpose: "Correct real food-area ground contact using unchanged paid standing source", paidCalls: 0, originalForegroundUnchanged: !process.argv.includes("--lantern"), visualApproval: false };
  const catalogPath = `${out}/catalog.json`; writeImmutableBytes(catalogPath, JSON.stringify(catalog, null, 2));
  const spec = { ...originalSpec, catalogPath }; writeImmutableBytes(`${out}/spec.json`, JSON.stringify(spec, null, 2));
  await loadBoardConditioningInputs(spec);
  writeImmutableBytes(`${out}/original-context.png`, await sharp(catalog.boards[0].staticArt.path).extract({ left: 1170, top: 1490, width: 450, height: 450 }).png().toBuffer());
  console.log(JSON.stringify({ out, spec: `${out}/spec.json`, support: metadata.slot.supportPointPx, eye: metadata.slot.eye, paidCalls: 0, loader: "passed" }));
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
