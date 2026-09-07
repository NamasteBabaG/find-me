/** Validate frozen board hashes and render planning proposals, never certificates.
 * Safe to rerun while the planner progresses: completed previews are immutable.
 */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {z} from 'zod';
const root=path.resolve(process.argv.find(a=>a.startsWith('--root='))?.slice(7)??'output/journey-fixed-plans-20260907');
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const unit=z.number().min(0).max(1);
const rectangle=z.object({x:unit,y:unit,w:unit,h:unit}).strict();
const candidate=z.object({targetId:z.string(),usable:z.boolean(),pose:z.enum(['standing','seated','crouching','swimming','peeking']),footX:unit,footY:unit,bodyHeight:z.number().min(0).max(.25),visibleBox:rectangle,support:z.string(),occlusion:z.string(),foregroundPolygon:z.array(z.object({x:unit,y:unit}).strict()).max(96),instructions:z.string(),limitations:z.string()}).strict();
const schema=z.object({placements:z.array(candidate).length(3),summary:z.string()}).strict();
const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
async function main(){
 const inputs=JSON.parse(readFileSync(path.join(root,'inputs.json'),'utf8')) as Array<{slug:string;boardPath:string;boardHash:string;scenePath:string;sceneHash:string;targets:string[]}>;
 let ready=0,pending=0,blocked=0;
 mkdirSync(path.join(root,'previews'),{recursive:true});
 const cards=[];
 for(const input of inputs){
  const resultFile=path.join(root,'calls',input.slug,'result.json');
  if(!existsSync(resultFile)){pending++;continue;}
  const board=readFileSync(input.boardPath),scene=readFileSync(input.scenePath);
  if(sha(board)!==input.boardHash||sha(scene)!==input.sceneHash)throw Error(`${input.slug}: input drift`);
  const plan=schema.parse(JSON.parse(readFileSync(resultFile,'utf8')));
  if(new Set(plan.placements.map(p=>p.targetId)).size!==3||plan.placements.some(p=>!input.targets.includes(p.targetId)))throw Error(`${input.slug}: target mismatch`);
  const colors=['#ff4980','#00bcae','#7556ef'],parts=[],rows=[];
  for(const [index,p] of plan.placements.entries()){
   if(!p.usable){blocked++;rows.push(`<li>${escape(p.targetId)}: REJECTED — ${escape(p.limitations)}</li>`);continue;}
   const b=p.visibleBox;
   if(p.bodyHeight<.015||b.w===0||b.h===0||b.x+b.w>1.000001||b.y+b.h>1.000001||(p.foregroundPolygon.length>0&&p.foregroundPolygon.length<3))throw Error(`${input.slug}/${p.targetId}: invalid usable geometry`);
   const c=colors[index],x=Math.round(b.x*3072),y=Math.round(b.y*2048),w=Math.round(b.w*3072),h=Math.round(b.h*2048),fx=Math.round(p.footX*3072),fy=Math.round(p.footY*2048);
   parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}" fill-opacity=".12" stroke="${c}" stroke-width="5"/><circle cx="${fx}" cy="${fy}" r="8" fill="${c}" stroke="white" stroke-width="2"/><rect x="${x}" y="${Math.max(0,y-36)}" width="230" height="32" rx="6" fill="${c}"/><text x="${x+8}" y="${Math.max(25,y-12)}" font-family="Arial" font-size="23" fill="white">${index+1}. ${escape(p.targetId)}</text>`);
   if(p.foregroundPolygon.length)parts.push(`<polygon points="${p.foregroundPolygon.map(v=>`${Math.round(v.x*3072)},${Math.round(v.y*2048)}`).join(' ')}" fill="${c}" fill-opacity=".2" stroke="${c}" stroke-width="3" stroke-dasharray="8 5"/>`);
   rows.push(`<li><strong>${escape(p.targetId)} · ${p.pose}</strong><p>${escape(p.support)}</p><p>${escape(p.occlusion)}</p><p>${escape(p.instructions)}</p><p>Limitations: ${escape(p.limitations)}</p></li>`);
  }
  const previewDir=path.join(root,'previews',input.slug);mkdirSync(previewDir,{recursive:true});
  const previewFile=path.join(previewDir,'overlay.webp');
  if(!existsSync(previewFile)){
   const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="3072" height="2048">${parts.join('')}</svg>`);
   writeFileSync(previewFile,await sharp(board).composite([{input:svg}]).webp({quality:94}).toBuffer(),{flag:'wx'});
   writeFileSync(path.join(previewDir,'source.json'),JSON.stringify({resultHash:sha(readFileSync(resultFile)),boardHash:sha(board),qualified:false},null,2),{flag:'wx'});
  }else if(JSON.parse(readFileSync(path.join(previewDir,'source.json'),'utf8')).resultHash!==sha(readFileSync(resultFile)))throw Error(`${input.slug}: existing preview drift`);
  ready++;cards.push(`<section><h2>${escape(input.slug)} — DRAFT ONLY</h2><a href="${input.slug}/overlay.webp"><img src="${input.slug}/overlay.webp" alt="Draft placement overlay for ${escape(input.slug)}"></a><p>${escape(plan.summary)}</p><ol>${rows.join('')}</ol></section>`);
 }
 const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>First world — placement drafts</title><style>body{margin:24px auto;max-width:1300px;padding:0 20px;background:#faf7f1;color:#19182c;font:18px/1.55 system-ui}section{background:white;border-radius:20px;padding:24px;margin:24px 0}img{width:100%;height:auto}strong{color:#433097}aside{background:#ffebaf;padding:20px;border-radius:14px}</style><h1>First world: fixed placement drafts</h1><aside>NOT approved hiding spots. Boxes are model proposals, not rendered children. ${ready}/9 boards have validated draft coordinates; ${pending} pending, ${blocked} proposed slots explicitly rejected. No catalog changes or live generation changes.</aside>${cards.join('')}</html>`;
 // A current index is a derived navigation view; source plans/overlays are immutable.
 writeFileSync(path.join(root,'previews','index.html'),html);
 console.log(JSON.stringify({draftBoards:ready,pendingBoards:pending,rejectedProposals:blocked,qualifiedSlots:0,index:path.join(root,'previews','index.html')}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
