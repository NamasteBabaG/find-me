import { readFileSync } from "node:fs";
import { loadBoardConditioningInputs } from "./board-conditioned-inputs";
import { chooseRobustPeekCut } from "../src/services/generation/robust-peek-cut";
import { findSimplePeekCut } from "../src/services/generation/simple-peek";
async function main(){
 const specPath=process.argv.find(a=>a.startsWith("--spec="))?.slice(7);if(!specPath)throw new Error("--spec required");
 const input=(await loadBoardConditioningInputs(JSON.parse(readFileSync(specPath,"utf8"))))[0]!;
 const result=JSON.parse(readFileSync("work/board-conditioned-engine-20260909/world-final-antarctica-v2/result.json","utf8")),s=result.appearances[2].sprite,d=input.slots[2]!;
 const source={...s,png:readFileSync("work/board-conditioned-engine-20260909/world-final-antarctica-v2/sprite-3.png")};
 const uncut={board:input.board,foreground:d.foreground,slot:{...d.slot,pose:"seated" as const},source};
 const options={minCutY:Math.ceil(s.chin.y+Math.hypot(s.chin.x-s.eye.x,s.chin.y-s.eye.y))};
 const observations:unknown[]=[];const first=await findSimplePeekCut(uncut,options),robust=await chooseRobustPeekCut(uncut,{...options,onCandidate:a=>observations.push(a)});
 console.log(JSON.stringify({first,accepted:robust!==null,margin:robust?.margin,cut:robust?.lowerCutY,observations},null,2));
}
main().catch(e=>{console.error(e instanceof Error?e.message:e);process.exitCode=1;});
