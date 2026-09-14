/** Recover retained Paris-3 output after a local composition exception. No API. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import {PrismaClient} from '@prisma/client';
import {PrismaRetainedPurchaseStore} from '../src/infra/db/prisma-retained-purchase-store';
import {composeBoundedLocalPatch} from '../src/services/generation/local-patch-seam';
import {cropOf,LocalPatchBoardSchema} from '../src/domain/scene/local-patch-hides';
const hash=(v:Buffer)=>createHash('sha256').update(v).digest('hex');
async function main(){
 const slug=process.argv[3]??'paris';if(!['paris','antarctica'].includes(slug))throw Error('No reviewed recovery for that board');
 const dir=path.resolve('storage/adventure-bar-density-20260914'),inputs=readFileSync(`${dir}/${slug}-inputs.json`),frozen=JSON.parse(inputs.toString()),board=LocalPatchBoardSchema.parse(frozen.board),hide=board.hides[slug==='paris'?2:0]!;
 const key=`${hide.id}:${hide.pose}:render:1`,db=new PrismaClient({datasources:{db:{url:`file:${dir.replaceAll('\\','/')}/purchases.sqlite`}}});
 try{
  const retained=await new PrismaRetainedPurchaseStore(db).get(frozen.version,key);
  if(!retained?.evidence||retained.unknownReason)throw Error('Missing settled retained purchase');
  const painted=JSON.parse(retained.bytes.toString());if(painted.rejected!==null||!painted.bytesBase64)throw Error('Provider refusal');
  const raw=await sharp(Buffer.from(painted.bytesBase64,'base64')).resize(512,768).png().toBuffer();
  writeFileSync(`${dir}/${hide.id}-retained-raw.png`,raw);
  if(process.argv[2]!=='--compose'){console.log('Retained raw recovered, no API calls');return;}
  const child=slug==='paris'?{...hide.mask!,height:368}:{left:360,top:325,width:140,height:300};
  const source=await sharp(board.art).png().toBuffer(),bounded=await composeBoundedLocalPatch(source,cropOf(hide),raw,child);
  const shipping=await sharp(bounded.candidate).extract(cropOf(hide)).png().toBuffer(),prefix=`${dir}/${hide.id}-composition-recovery`;
  writeFileSync(`${prefix}.png`,shipping);
  writeFileSync(`${prefix}.json`,JSON.stringify({accepted:bounded.usable,inputsSha256:hash(inputs),sha256:hash(shipping),refusedBecause:bounded.usable?null:'render',renderFault:bounded.usable?null:'quality-seam',seam:bounded.report,compositionPermission:bounded.compositionPermission,costUnknown:false,renderCents:retained.evidence.amountMicroUsd/10000,replayed:true,visualReview:'pending',recovery:{reason:'Authored lower mask edge lacked seam margin; narrowed only lower composition envelope after inspecting retained pixels',originalRequestKey:key,retainedPayloadSha256:retained.payloadSha256,child,additionalPaidCalls:0}},null,2));
  console.log(JSON.stringify({accepted:bounded.usable,additionalPaidCalls:0}));
 }finally{await db.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
