/** Offline SQL exporter for the authenticated QA connector. Never executes SQL.
 * Only the immutable, reviewed 18-board pilot is transferable; no live game,
 * payment, entitlement, public catalog or earned progress is overwritten.
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { loadReviewedTwoWorlds, sha } from './lib/two-worlds-reviewed';
import { twoWorldsConfig } from './lib/two-worlds-config';
import { prepareAdventureConfig } from '../src/services/adventure-content.service';

const GAME='game_two_worlds_bar_qa_20260922_v1', OWNER='usr_two_worlds_bar_qa_20260922', CHILD='fam_two_worlds_bar_qa_20260922';
const EMAIL='two-worlds-bar-qa-20260922@findme.local';
const CHUNK=262144;
const dir=path.resolve('storage/two-worlds-bar-20260919/qa-transfer');
const q=(s:string)=>`'${s.replaceAll("'","''")}'`;
type Asset={id:string;key:string;file:string;sha256:string;bytes:number;width:number;height:number;type:'AVATAR'|'TARGET_SPRITE'};
type Manifest={gameId:string;ownerId:string;childId:string;configJson:string;evidence:Record<string,string>;assets:Asset[]};
async function main(){
 const project=JSON.parse(readFileSync('.vercel/project.json','utf8'));
 if(project.projectId!=='prj_LbqCRqwU8WfZpeaWU7HTXM4SsfG4')throw Error('Dedicated QA project required');
 const [mode,indexRaw,offsetRaw]=process.argv.slice(2);
 if(mode==='prepare'){
  const r=await loadReviewedTwoWorlds();
  if(r.boards.length!==18||r.patches.length!==54||r.holds.length)throw Error('Complete reviewed inventory required');
  mkdirSync(dir,{recursive:true});const assets:Asset[]=[],patchUrls:Record<string,string>={};
  async function asset(name:string,bytes:Buffer,type:Asset['type']){
   const meta=await sharp(bytes).metadata();if(!meta.width||!meta.height||(meta.pages??1)!==1)throw Error('Invalid raster');
   const id=`ast_tw_qa_20260922_${name}`,file=path.join(dir,`${name}.png`);
   writeFileSync(file,bytes);
   assets.push({id,key:`private-pilots/${GAME}/${name}.png`,file,sha256:sha(bytes),bytes:bytes.length,width:meta.width,height:meta.height,type});
   return `/api/assets/${id}`;
  }
  const avatarUrl=await asset('avatar',r.avatar,'AVATAR');
  for(const p of r.patches)patchUrls[p.id]=await asset(p.id,p.bytes,'TARGET_SPRITE');
  const config=await prepareAdventureConfig(twoWorldsConfig({gameId:GAME,childName:'בר',avatarUrl,patchUrls,geometry:r.geometry,composedAt:'2026-09-22T00:00:00.000Z',boards:r.boards,catalog:r.catalog}),r.catalog,r.boards.map(b=>b.board),path.resolve('public'));
  const m:Manifest={gameId:GAME,ownerId:OWNER,childId:CHILD,configJson:JSON.stringify(config),evidence:r.evidence,assets};
  writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(m,null,2));
  console.log(JSON.stringify({gameId:GAME,assets:assets.length,bytes:assets.reduce((n,a)=>n+a.bytes,0),chunks:assets.map(a=>Math.ceil(a.bytes/CHUNK)),configSha256:sha(m.configJson)}));return;
 }
 const m:Manifest=JSON.parse(readFileSync(path.join(dir,'manifest.json'),'utf8'));
 if(m.gameId!==GAME||m.ownerId!==OWNER||m.childId!==CHILD||m.assets.length!==55)throw Error('Manifest mismatch');
 if(mode==='chunk'){
  const index=Number(indexRaw),offset=Number(offsetRaw),a=m.assets[index];
  if(!a||!Number.isSafeInteger(offset)||offset<0||offset>=a.bytes||offset%CHUNK)throw Error('Invalid chunk');
  const bytes=readFileSync(a.file);if(bytes.length!==a.bytes||sha(bytes)!==a.sha256)throw Error('Changed source');
  const part=bytes.subarray(offset,offset+CHUNK);
  console.log(JSON.stringify({query:`DO $pilot$ DECLARE part bytea:=decode(${q(part.toString('base64'))},'base64'); current_data bytea; BEGIN
   IF ${offset}=0 THEN INSERT INTO qa."FileBlob" (key,data,"contentType") VALUES (${q(a.key)},decode('','hex'),'image/png') ON CONFLICT (key) DO NOTHING; END IF;
   SELECT data INTO current_data FROM qa."FileBlob" WHERE key=${q(a.key)} FOR UPDATE;
   IF current_data IS NULL THEN RAISE EXCEPTION 'missing chunk prefix'; END IF;
   IF octet_length(current_data)=${offset} THEN UPDATE qa."FileBlob" SET data=data||part WHERE key=${q(a.key)};
   ELSIF octet_length(current_data)>=${offset+part.length} AND substring(current_data FROM ${offset+1} FOR ${part.length})=part THEN NULL;
   ELSE RAISE EXCEPTION 'conflicting chunk, refusing overwrite'; END IF;
   END $pilot$; SELECT octet_length(data) AS bytes FROM qa."FileBlob" WHERE key=${q(a.key)};`}));return;
 }
 if(mode==='signin-sql'){
  const token=randomBytes(32).toString('base64url'),id=`mlt_${randomBytes(16).toString('hex')}`;
  const url=new URL('/auth/magic-link','https://qa.findmeworlds.com');url.searchParams.set('token',token);url.searchParams.set('next',`/library/${GAME}`);
  writeFileSync(path.join(dir,'owner-signin.json'),JSON.stringify({ownerSignIn:url.toString()}));
  console.log(JSON.stringify({query:`INSERT INTO qa."MagicLinkToken" (id,"userId","tokenHash","expiresAt") SELECT ${q(id)},id,${q(createHash('sha256').update(token).digest('hex'))},now()+interval '15 minutes' FROM qa."User" WHERE id=${q(OWNER)} AND email=${q(EMAIL)} RETURNING id;`}));return;
 }
 if(mode!=='publish-sql')throw Error('Use prepare, chunk INDEX OFFSET, publish-sql or signin-sql');
 const reviewed=await loadReviewedTwoWorlds();
 if(JSON.stringify(reviewed.evidence)!==JSON.stringify(m.evidence))throw Error('Approval evidence changed');
 const sourceBytes=[reviewed.avatar,...reviewed.patches.map(p=>p.bytes)];
 for(const [i,a]of m.assets.entries())if(sha(readFileSync(a.file))!==a.sha256||sha(sourceBytes[i]!)!==a.sha256)throw Error('Source changed');
 const checks=m.assets.map(a=>`IF NOT EXISTS(SELECT 1 FROM qa."FileBlob" WHERE key=${q(a.key)} AND octet_length(data)=${a.bytes} AND encode(sha256(data),'hex')=${q(a.sha256)} AND "contentType"='image/png') THEN RAISE EXCEPTION 'unverified blob: ${a.id}'; END IF;`).join('\n');
 const rows=m.assets.map(a=>`(${q(a.id)},${q(OWNER)},${q(a.type)},'GAME',${q(a.key)},'image/png',${a.width},${a.height},${a.bytes},'two-worlds-reviewed-v1',${q(`${GAME}:${a.sha256}`)},0,'READY')`).join(',\n');
 const scenes=JSON.parse(m.configJson).scenes as Array<{slug:string;version:number}>;
 if(scenes.length!==18)throw Error('Incomplete scenes');
 const sceneRows=scenes.map((s,i)=>`(${q(`gsc_${GAME}_${i}`)},${q(GAME)},${q(s.slug)},${s.version},${i},'QA_OK',${q(JSON.stringify(s))})`).join(',\n');
 console.log(JSON.stringify({query:`DO $pilot$ BEGIN
  ${checks}
  IF EXISTS(SELECT 1 FROM qa."Game" WHERE id=${q(GAME)}) THEN
   IF NOT EXISTS(SELECT 1 FROM qa."Game" WHERE id=${q(GAME)} AND "ownerId"=${q(OWNER)} AND "familyChildId"=${q(CHILD)} AND "configJson"=${q(m.configJson)}) THEN RAISE EXCEPTION 'unrelated existing game'; END IF;
  ELSE
   INSERT INTO qa."User" (id,email,locale) VALUES (${q(OWNER)},${q(EMAIL)},'he');
   INSERT INTO qa."FamilyChild" (id,"ownerId","displayName") VALUES (${q(CHILD)},${q(OWNER)},'בר');
   INSERT INTO qa."Asset" (id,"ownerId",type,visibility,"storagePath","mimeType",width,height,bytes,provider,"providerRequestId","costCents",status) VALUES ${rows};
   INSERT INTO qa."Game" (id,"ownerId","familyChildId","packageTier",title,status,"sceneCount","styleVersion",locale,"draftToken","configJson","updatedAt","paidAt","readyAt","deliveredAt") VALUES
    (${q(GAME)},${q(OWNER)},${q(CHILD)},'TWO_WORLDS','בר בשני עולמות — 18 בורדים','DELIVERED',18,'two-worlds-reviewed-v1','he',${q(`draft_${GAME}`)},${q(m.configJson)},now(),now(),now(),now());
   INSERT INTO qa."Order" (id,"userId","gameId","amountAgorot","packageTier","paymentStatus",provider,"paidAt") VALUES (${q(`ord_${GAME}`)},${q(OWNER)},${q(GAME)},0,'TWO_WORLDS','PAID','mock',now());
  END IF;
  INSERT INTO qa."GameScene" (id,"gameId","sceneSlug","sceneVersion","orderIndex","generationStatus","configJson") VALUES ${sceneRows} ON CONFLICT ("gameId","sceneSlug") DO NOTHING;
 END $pilot$;
 SELECT id,status,"sceneCount",json_array_length(("configJson"::json)->'scenes') AS boards FROM qa."Game" WHERE id=${q(GAME)};`}));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Transfer failed');process.exitCode=1;});
