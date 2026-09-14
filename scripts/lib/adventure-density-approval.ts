import {createHash} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {cropOf,type LocalPatchBoard} from '../../src/domain/scene/local-patch-hides';
import type {ReadyAdventureBoard} from '../../src/domain/adventure/content';
export function assertDensityApproval(slug:string,board:LocalPatchBoard,plan:ReadyAdventureBoard){
 const approval=JSON.parse(readFileSync('content/adventures/density-v3/approval.json','utf8'));
 const sourceHash=approval.sourceHashes[slug];
 if(!sourceHash||approval.personalRenderingAllowed!==true||approval.contentVersion!==9||approval.ageYears!==5)throw Error('Current parent approval required');
 if(board.hides.length!==3||board.hides.some((h,i)=>h.id!==`adventure-${slug}-density-v3-${i+1}`))throw Error('Stale hide geometry prohibited');
 if(plan.sceneVersion!==11||JSON.stringify(plan.personalZones)!==JSON.stringify(board.hides.map(h=>{const c=cropOf(h);return{x:c.left/3840,y:c.top/2160,w:c.width/3840,h:c.height/2160};})))throw Error('Plan/patch crop mismatch');
 const original=readFileSync(`public/scenes/adventure-${slug}-density-v3/base.webp`);
 const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
 if(hash(original)!==sourceHash)throw Error('Approved base changed');
 const actual=hash(readFileSync(board.art));
 if(actual!==plan.art.sha256)throw Error('Plan art hash mismatch');
 if(actual!==sourceHash){
  const file='content/adventures/density-v3/item-repairs.json';
  const repair=existsSync(file)?JSON.parse(readFileSync(file,'utf8'))[slug]:null;
  if(!repair||repair.sourceSha256!==sourceHash||repair.outputSha256!==actual||repair.unchangedOutsideRegion!==true||repair.visualReviewAccepted!==true)throw Error('Unreviewed artwork change');
 }
}
