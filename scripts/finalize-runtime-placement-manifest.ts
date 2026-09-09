/** Create new immutable runtime contracts; original paid catalogs remain intact. */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { writeImmutableBytes } from "./board-conditioned-probe-replay";
const manifest=JSON.parse(readFileSync("work/open-placement-20260909/world-final-manifest-v1.json","utf8"));
for(const entry of manifest.boards){
 const spec=JSON.parse(readFileSync(entry.spec,"utf8"));
 const catalog=JSON.parse(readFileSync(spec.catalogPath,"utf8")); const board=catalog.boards[0];
 const slots:Record<string,unknown>={};
 for(const s of board.slots){
  const record=JSON.parse(readFileSync(s.placement.contract.path,"utf8"));
  if(record.slot.mode==="open")slots[s.slotId]={pixelRefinement:"bounded-transform-one-board-pixel/v2",
    ...(board.boardId==="tokyo"&&s.slotId.includes("crossing")?{tone:{version:"local-exposure-chroma/v1",exposureStops:-.35,saturation:.72}}:{})};
 }
 const out=`work/open-placement-20260909/world-runtime-v1/${board.boardId}`;
 const config={spec:entry.spec,out,reason:"Versioned one-native-pixel contour refinement; unchanged authored ground/geometry/masks. Tokyo crossing receives local subdued night exposure. Raw paid observations and sources retained; visual approval still required.",slots};
 const file=`work/open-placement-20260909/runtime-${board.boardId}-v1.json`;
 writeImmutableBytes(file,JSON.stringify(config,null,2));
 execFileSync(process.execPath,["--import","tsx","scripts/revise-placement-tone.ts",file],{stdio:"inherit"});
 entry.spec=`${out}/spec.json`;
}
writeImmutableBytes("work/open-placement-20260909/world-runtime-manifest-v1.json",JSON.stringify(manifest,null,2));
