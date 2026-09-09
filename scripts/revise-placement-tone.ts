/** Free immutable authoring revision: calibrated local tone and optional height. */
import { readFileSync, mkdirSync } from "node:fs";
import { writeImmutableBytes } from "./board-conditioned-probe-replay";
import { sha256Bytes } from "../src/services/generation/fixed-sprite";
import { compositingToneSchema } from "../src/services/generation/compositing-tone";
const config = JSON.parse(readFileSync(process.argv[2]!,"utf8"));
if (!/^work\/open-placement-20260909\/[a-z0-9/-]+$/.test(config.out)) throw new Error("Versioned private output required");
const spec = JSON.parse(readFileSync(config.spec,"utf8"));
const catalog = JSON.parse(readFileSync(spec.catalogPath,"utf8"));
mkdirSync(config.out,{recursive:true});
for (const board of catalog.boards) for (const s of board.slots) {
  const change = config.slots[s.slotId]; if (!change) continue;
  const record = JSON.parse(readFileSync(s.placement.contract.path,"utf8"));
  if (change.tone) record.slot.compositingTone = compositingToneSchema.parse(change.tone);
  if (change.pixelRefinement) {
    if(!["bounded-transform-one-board-pixel/v2","connected-crown-fringe-bounded-feet/v3"].includes(change.pixelRefinement)||record.slot.pose!=="standing")throw new Error("Unknown standing pixel policy");
    record.slot.pixelRefinement=change.pixelRefinement;
  }
  if (change.standingHeightPx) {
    if (record.slot.pose !== "standing" || change.standingHeightPx < 0.75 * record.slot.standingHeightPx || change.standingHeightPx > record.slot.standingHeightPx) throw new Error("Only bounded authored standing-height attenuation allowed");
    record.slot.standingHeightPx = change.standingHeightPx;
  }
  record.semanticStatus = "pending";
  record.revision = {kind:"local-tone-and-scale-calibration",sourceContract:s.placement.contract,reason:config.reason,rawPaidSourceUnchanged:true};
  const file = `${config.out}/${s.slotId}.json`, bytes = Buffer.from(JSON.stringify(record,null,2));
  writeImmutableBytes(file,bytes);
  s.placement.contract = s.placement.priorResultMetadata = {path:file,sha256:sha256Bytes(bytes)};
}
const catalogPath = `${config.out}/catalog.json`;
writeImmutableBytes(catalogPath,JSON.stringify(catalog,null,2));
spec.catalogPath=catalogPath;
writeImmutableBytes(`${config.out}/spec.json`,JSON.stringify(spec,null,2));
console.log(JSON.stringify({out:config.out,paidCalls:0}));
