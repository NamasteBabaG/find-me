/** Immutable Antarctica destination repair using already-paid source cells. */
import { mkdirSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { writeImmutableBytes } from "./board-conditioned-probe-replay";
import { loadBoardConditioningInputs } from "./board-conditioned-inputs";
import { sha256Bytes } from "../src/services/generation/fixed-sprite";
const read=(p:string)=>JSON.parse(readFileSync(p,"utf8"));
async function main(){
 const flag=(n:string,f:string)=>process.argv.find(a=>a.startsWith(`--${n}=`))?.slice(n.length+3)??f;
 const revision=flag("revision","geometry-v1"), face=Number(flag("cargo-face","30")), dy=Number(flag("cargo-dy","0")),dx=Number(flag("cargo-dx","0"));
 if(!/^[a-z0-9-]+$/.test(revision)||![face,dy].every(Number.isFinite))throw new Error("invalid revision");
 const baseline="work/open-placement-20260909/world-runtime-v2/antarctica/spec.json", spec=read(baseline), catalog=read(spec.catalogPath), board=catalog.boards[0];
 const out=`work/open-placement-20260909/antarctica-final-${revision}`;mkdirSync(out,{recursive:true});
 for(const [i,direction] of board.slots.entries()){
  const p=direction.placement.priorResultMetadata.path,b=readFileSync(p),prior=JSON.parse(b.toString("utf8")),slot=structuredClone(prior.slot);
  if(i===0){slot.eye.x+=18;slot.supportPointPx.x+=18;}
  if(i===1){slot.eye.y+=24;slot.supportPointPx.y+=24;slot.window.height+=48;}
  if(i===2){slot.faceHeightPx=face;slot.eye.y+=dy;slot.eye.x+=dx;}
  const metadata={slot,boardSha256:board.staticArt.sha256,foregroundSha256:direction.placement.foreground.sha256,semanticStatus:"pending",automaticRelease:false,
   revision:{id:revision,baselineSpec:baseline,priorContract:{path:p,sha256:sha256Bytes(b)},priorSlot:prior.slot,
    originalPaidSourceAndObservationUnchanged:true,originalForegroundUnchanged:true,protectedNeighborsUnchanged:true,paidCalls:0},
   authoring:{kind:"same-area-ground-and-foreground-repair",basis:i===0?"Move18nativepixels right within the same hut cast shadow, away from the original penguin while retaining the right-hand child's protected region. Scale and ground depth unchanged.":i===1?"Move24nativepixels forward/down onto the snow in front of the snowmobile ski, within the same snowmobile-shadow area. Source crown validity remains independently failed, not hidden by this geometry revision.":"Match local cargo-area child head size while retaining the original cargo foreground and authored eye column. No lower-body cut accepted unless the unchanged robust coverage and source-frame guards pass.",visualApproval:false}};
  const metaPath=`${out}/${slot.id}.json`,bytes=Buffer.from(JSON.stringify(metadata,null,2));writeImmutableBytes(metaPath,bytes);
  direction.placement.contract={path:metaPath,sha256:sha256Bytes(bytes)};direction.placement.priorResultMetadata=direction.placement.contract;
  direction.placement.eyeAnchorPx=slot.eye;direction.placement.eyeToChinPx=slot.faceHeightPx;direction.placement.contextRectPx=slot.window;
  direction.references.localStaticCrop=null;direction.references.localStaticCropRectPx=slot.window;direction.placement.modifiedByThisCatalog=true;
  writeImmutableBytes(`${out}/original-context-${i+1}.png`,await sharp(board.staticArt.path).extract(slot.window).png().toBuffer());
 }
 catalog.revision={id:revision,paidCalls:0,purpose:"Free source-preserving Antarctica repair; all source/geometry/semantic checks remain distinct"};
 const catalogPath=`${out}/catalog.json`;writeImmutableBytes(catalogPath,JSON.stringify(catalog,null,2));
 const destination={...spec,catalogPath};writeImmutableBytes(`${out}/spec.json`,JSON.stringify(destination,null,2));await loadBoardConditioningInputs(destination);
 console.log(JSON.stringify({spec:`${out}/spec.json`,newApiCalls:0}));
}
main().catch(e=>{console.error(e instanceof Error?e.message:e);process.exitCode=1;});
