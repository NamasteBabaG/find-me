import {createHash} from 'node:crypto';
import {readFileSync,realpathSync,existsSync} from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {z} from 'zod';
import {DENSITY_PATCH_BOARDS,DENSITY_SPECS} from '../../content/adventures/density-boards';
import {LocalPatchBoardSchema} from '../../src/domain/scene/local-patch-hides';
import {ReadyAdventureBoardSchema} from '../../src/domain/adventure/content';
import {validateReviewedChildGeometry,type ReviewedChildGeometry} from './adventure-three-config';
import {assertDensityApproval} from './adventure-density-approval';
export const densityHash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const geometry=z.object({x:z.number(),y:z.number(),w:z.number(),h:z.number(),headX:z.number(),headY:z.number()});
const entry=z.object({hideId:z.string(),source:z.string(),sourceSha256:z.string().length(64),receipt:z.string(),receiptSha256:z.string().length(64),inputs:z.string(),inputsSha256:z.string().length(64),geometry,visualAccepted:z.literal(true),observations:z.string().min(12)});
export const DensityReviewSchema=z.object({accepted:z.literal(true),version:z.literal('density-nine-reviewed/v1'),reviewer:z.literal('assistant-visual-review'),parentLikenessConfirmation:z.literal('pending'),avatarSha256:z.string().length(64),identitySha256:z.string().length(64),entries:z.array(entry).length(27)});
type Entry=z.infer<typeof entry>;
/** Private read boundary: no public folder, traversal, arbitrary file or symlink escape. */
function privateFile(relative:string){
 if(!/^storage\/adventure-bar-(?:20260914|expansion-20260914|density-20260914)\/[a-z0-9-]+\.(?:png|json)$/.test(relative))throw Error('Unexpected private review path');
 const root=realpathSync(path.dirname(relative)),actual=realpathSync(relative);
 if(path.dirname(actual)!==root)throw Error('Private review path escapes its directory');
 return readFileSync(actual);
}
export function assertVisualSelection(e:Entry,receipt:{accepted?:boolean;costUnknown?:boolean;refusedBecause?:unknown},rejectedSources:readonly string[]){
 validateReviewedChildGeometry(e.geometry);
 if(e.visualAccepted!==true||receipt.accepted!==true||receipt.costUnknown!==false||receipt.refusedBecause!=null)throw Error(`Unapproved or technically refused patch: ${e.hideId}`);
 if(rejectedSources.includes(path.basename(e.source)))throw Error(`Parent/visual rejection cannot publish: ${e.hideId}`);
}
/** Loads only an explicitly sealed set. No latest-file fallback, paid calls or writes. */
export async function loadDensityReviewedAssets(reviewPath='storage/adventure-bar-density-20260914/final-review.json'){
 const review=DensityReviewSchema.parse(JSON.parse(privateFile(reviewPath).toString()));
 const oldDir='storage/adventure-bar-20260914',oldReview=JSON.parse(privateFile(`${oldDir}/final-review.json`).toString()),oldInputsBytes=privateFile(`${oldDir}/inputs.json`),oldInputs=JSON.parse(oldInputsBytes.toString());
 const identityReview=JSON.parse(privateFile(`${oldDir}/identity-review.json`).toString());
 const identity=privateFile(`${oldDir}/identity-normalized.png`),avatar=privateFile(`${oldDir}/avatar.png`);
 if(oldReview.accepted!==true||oldReview.inputsSha256!==densityHash(oldInputsBytes)||identityReview.accepted!==true||identityReview.inputsSha256!==oldReview.inputsSha256||identityReview.identitySha256!==densityHash(privateFile(`${oldDir}/identity.png`))||review.identitySha256!==densityHash(identity)||review.avatarSha256!==densityHash(avatar)||oldReview.avatarSha256!==review.avatarSha256)throw Error('Unapproved or changed canonical identity/avatar');
 const rejectionPath='storage/adventure-bar-density-20260914/parent-feedback-rejections.json';
 if(!existsSync(rejectionPath))throw Error('Parent feedback record required');
 const rejected=JSON.parse(privateFile(rejectionPath).toString()).rejections.map((r:{image:string})=>r.image) as string[];
 const ids=review.entries.map(e=>e.hideId),expected=DENSITY_PATCH_BOARDS.flatMap(b=>b.hides.map(h=>h.id));
 if(new Set(ids).size!==27||expected.some(id=>!ids.includes(id)))throw Error('Exactly one reviewed result per expected hide is required');
 for(const s of DENSITY_SPECS)assertDensityApproval(s.patchBoard.board.replace('adventure-',''),s.patchBoard,s.plan);
 const patches:Array<{id:string;buffer:Buffer}>=[],geometryMap:Record<string,ReviewedChildGeometry>={};
 for(const board of DENSITY_PATCH_BOARDS)for(const hide of board.hides){
  const e=review.entries.find(e=>e.hideId===hide.id)!;
  const buffer=privateFile(e.source),receiptBytes=privateFile(e.receipt),inputBytes=privateFile(e.inputs),receipt=JSON.parse(receiptBytes.toString()),frozen=JSON.parse(inputBytes.toString());
  assertVisualSelection(e,receipt,rejected);
  if(e.sourceSha256!==densityHash(buffer)||e.receiptSha256!==densityHash(receiptBytes)||e.inputsSha256!==densityHash(inputBytes))throw Error(`Changed reviewed bytes: ${hide.id}`);
  if(e.source.startsWith(`${oldDir}/`)){
   if(e.inputs!==`${oldDir}/inputs.json`||e.source!==`${oldDir}/${oldReview.patchSources[hide.id]}`||oldReview.patches[hide.id]!==e.sourceSha256||e.receipt!==e.source.replace('.png','-technical.json'))throw Error('Original family result must match its approved source');
   const pinned=oldInputs.boards.find((b:{board:{board:string}})=>b.board.board===board.board);
   if(!pinned||pinned.sourceSha256!==densityHash(readFileSync(board.art))||JSON.stringify(pinned.board.hides.find((h:{id:string})=>h.id===hide.id))!==JSON.stringify(hide))throw Error('Original family hide/source changed');
  }else{
   const frozenBoard=LocalPatchBoardSchema.parse(frozen.board);
   if(JSON.stringify(frozenBoard)!==JSON.stringify(board)||frozen.plan.art.sha256!==densityHash(readFileSync(board.art))||frozen.identitySha256!==review.identitySha256||frozen.ageYears!==5||receipt.inputsSha256!==e.inputsSha256||receipt.sha256!==e.sourceSha256||e.receipt!==e.source.replace('.png','.json'))throw Error(`Frozen render input mismatch: ${hide.id}`);
   const spec=DENSITY_SPECS.find(s=>s.patchBoard.board===board.board);
   if(spec&&JSON.stringify(ReadyAdventureBoardSchema.parse(frozen.plan))!==JSON.stringify(spec.plan))throw Error('Collectible mapping changed after render');
   if(!path.basename(e.source).startsWith(`${hide.id}-`))throw Error('Patch belongs to a different hide');
   if(receipt.effectiveHide&&(receipt.effectiveHide.id!==hide.id||receipt.effectiveHide.left!==hide.left||receipt.effectiveHide.top!==hide.top))throw Error('Repair moved outside the reviewed patch');
  }
  const meta=await sharp(buffer).metadata();if(meta.width!==512||meta.height!==768)throw Error('Invalid personal patch dimensions');
  patches.push({id:hide.id,buffer});geometryMap[hide.id]=e.geometry;
 }
 return{review,patches,geometry:geometryMap,avatar};
}
