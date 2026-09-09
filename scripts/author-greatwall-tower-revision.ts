/** Free original-board authoring; no image API or source-pixel edits. */
import { mkdirSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { writeImmutableBytes } from "./board-conditioned-probe-replay";
import { loadBoardConditioningInputs } from "./board-conditioned-inputs";
import { pointInPolygon, sha256Bytes } from "../src/services/generation/fixed-sprite";
async function main() {
  const out = "work/open-placement-20260909/greatwall-tower-authoring-v3";
  mkdirSync(out, { recursive: true });
  const spec = JSON.parse(readFileSync("work/open-placement-20260909/world-runtime-v2/greatwall/spec.json", "utf8"));
  const catalog = JSON.parse(readFileSync(spec.catalogPath, "utf8"));
  if(process.argv.includes("--inspect-only")) {
    writeImmutableBytes(`${out}/original-notch-detail.png`,await sharp(catalog.boards[0].staticArt.path).extract({left:245,top:295,width:110,height:90}).resize(440,360).png().toBuffer());
    console.log(`${out}/original-notch-detail.png`);return;
  }
  writeImmutableBytes(`${out}/original-tower-context.png`, await sharp(catalog.boards[0].staticArt.path).extract({ left:130, top:90, width:830, height:500 }).png().toBuffer());
  const board = catalog.boards[0], direction = board.slots[2], oldId = direction.slotId, oldPath = direction.placement.priorResultMetadata.path;
  const original = JSON.parse(readFileSync(oldPath, "utf8"));
  const id = "greatwall-upper-tower-solid-parapet-v1", window = { left:130, top:90, width:830, height:500 };
  const decoded = await sharp(board.staticArt.path).ensureAlpha().raw().toBuffer({ resolveWithObject:true });
  const rgba = Buffer.alloc(decoded.data.length);
  // Preserve the OPEN notch: it is not foreground. Side masonry starts at310;
  // the center begins only at the original lower stone front at365.
  const stone = [{x:257,y:310},{x:297,y:310},{x:297,y:365},{x:317,y:365},{x:317,y:310},{x:340,y:310},{x:340,y:555},{x:257,y:555}];
  for(let y=310;y<555;y++) for(let x=257;x<340;x++) if(pointInPolygon({x:x+.5,y:y+.5},stone)) {
    const p=(y*decoded.info.width+x)*4; decoded.data.copy(rgba,p,p,p+4);
  }
  const fgPng = await sharp(rgba,{raw:{width:decoded.info.width,height:decoded.info.height,channels:4}}).png().toBuffer();
  const fgPath = `${out}/original-solid-tower-parapet.png`; writeImmutableBytes(fgPath,fgPng);
  const slot = { ...original.slot, id, eye:{x:302,y:295}, supportPointPx:{x:292,y:454}, standingHeightPx:180, faceHeightPx:20,
    window, forbiddenRects:[
      {id:"left-kite-flyer-face",left:205,top:215,width:60,height:85},
      {id:"left-kite-flyer-raised-hand",left:258,top:230,width:28,height:42},
      {id:"right-blue-shirt-child-face",left:331,top:249,width:54,height:73},
      {id:"right-blue-shirt-child-hands",left:330,top:302,width:56,height:33},
    ], forbiddenPolygons:[], compositingTone:{version:"local-exposure-chroma/v1",exposureStops:-.18,saturation:.78} };
  const metadata = { slot, boardSha256:board.staticArt.sha256, foregroundSha256:sha256Bytes(fgPng), semanticStatus:"pending", automaticRelease:false,
    authoring:{kind:"new-upper-tower-parapet-location", paidCalls:0, priorRejectedLocation:"food-area lantern; explicitly rejected, not retained",
      physicalSupport:"Complete standing child on the implied roof-walk floor behind the original stone parapet. The open crenellation is retained, not replaced with an opaque background rectangle; both soles are behind the lower real masonry.",
      scaleBasis:"Nearby tower children at the same elevation have roughly35–45px heads and14–18px eye-to-chin distances. A180px complete source places this child's eye-to-chin near14px, not a giant foreground-sized head.",
      originalForegroundRegion:stone, originalRgbCopiedExactly:true, fixedForFutureChildren:true, visualApproval:false },
    revision:{id:"upper-tower-v3", priorContract:{path:oldPath,sha256:sha256Bytes(readFileSync(oldPath))}, originalPaidSourceAndMeasurementsPreserved:true,
      adjustmentFromProofV2:"Exact stepped masonry mask, preserving the central open notch; native support/eye translated2px left to clear the protected neighbor edge. Scale/height and all protection rectangles unchanged.",
      sourcePoseReuse:"Existing complete standing body, relaxed folded hands, readable three-quarter face. The paid food-area prompt is retained only in proof provenance, not used for future tower generation."} };
  const metaPath=`${out}/${id}.json`, metaBytes=Buffer.from(JSON.stringify(metadata,null,2));writeImmutableBytes(metaPath,metaBytes);
  direction.slotId=id; direction.placement={...direction.placement,contract:{path:metaPath,sha256:sha256Bytes(metaBytes)},priorResultMetadata:{path:metaPath,sha256:sha256Bytes(metaBytes)},
    eyeAnchorPx:slot.eye,eyeToChinPx:slot.faceHeightPx,contextRectPx:window,foreground:{path:fgPath,sha256:sha256Bytes(fgPng)},modifiedByThisCatalog:true};
  direction.references={...direction.references,localStaticCrop:null,localStaticCropRectPx:window,originalPersonExample:null,originalPersonExampleRectPx:{left:330,top:246,width:59,height:88}};
  direction.notes=["Completely new tower location; not the rejected lantern.","Free proof keeps old source prose strictly as paid provenance. Future catalog below has explicit tower-specific direction."];
  catalog.revision={id:"upper-tower-proof-v3",paidCalls:0,purpose:"Free geometry plausibility proof using original paid source; not a claim of tower-conditioned generation",automaticRelease:false};
  const proofPath=`${out}/proof-catalog.json`;writeImmutableBytes(proofPath,JSON.stringify(catalog,null,2));
  const proofSpec={...spec,catalogPath:proofPath};writeImmutableBytes(`${out}/proof-spec.json`,JSON.stringify(proofSpec,null,2));
  const mapping=board.slots.map((s:{slotId:string},i:number)=>({sourceSlotId:i===2?oldId:s.slotId,destinationSlotId:s.slotId}));
  writeImmutableBytes(`${out}/source-destination-mapping.json`,JSON.stringify(mapping,null,2));
  await loadBoardConditioningInputs(proofSpec);
  const future=structuredClone(catalog), tower=future.boards[0].slots[2];
  tower.pose.instruction="Draw a COMPLETE standing child for the upper tower roof-walk, both shoes visible in the source. Relax shoulders, hands gently folded at the waist, body three-quarter LEFT among the nearby kite-flying children. A readable face may glance naturally UP-RIGHT toward a kite. Stand behind the original solid stone parapet; it hides the lower body after placement. No lantern, food, kite, wall, prop or detached shadow generated.";
  tower.lighting={keyDirection:"Open upper-left daylight on the upper tower roof-walk",colorTemperature:"Warm soft daylight with pale grey/tan tower-stone fill",
    relativeIntensity:"Match neighboring original tower children's matte faces and clothing at the same elevation; not the lower food area, a shop or lantern light. No bright portrait face or orange hair halo.",
    fillAndBounce:"Soft tan-grey stone bounce from the tower parapet and roof, weak cool sky fill",
    shadow:"Coherent soft painted shade on the face, hair, hands and clothing. Feet and lower body will be hidden by real foreground stone, not a generated shadow."};
  tower.notes=["Future-generation direction for the NEW upper tower; source pixels in the free proof were generated for a different original position and are not evidence of a new generation call."];
  future.revision={id:"upper-tower-runtime-v3",paidCalls:0,purpose:"Correct per-slot tower conditioning for future child generation; free reuse proof has distinct immutable source intent",automaticRelease:false};
  const futurePath=`${out}/catalog.json`;writeImmutableBytes(futurePath,JSON.stringify(future,null,2));
  const futureSpec={...spec,catalogPath:futurePath};writeImmutableBytes(`${out}/spec.json`,JSON.stringify(futureSpec,null,2));
  await loadBoardConditioningInputs(futureSpec);
  console.log(JSON.stringify({out,proofSpec:`${out}/proof-spec.json`,futureSpec:`${out}/spec.json`,mapping:`${out}/source-destination-mapping.json`,sourcePixelsRepainted:false,newApiCalls:0}));
}
main().catch(e=>{console.error(e instanceof Error ? e.message : e);process.exitCode=1;});
