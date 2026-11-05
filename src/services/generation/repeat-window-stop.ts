import type { Prisma } from '@prisma/client';
import { JOURNEY_WINDOW_MANIFEST } from '../../../content/detectives/journey-window-release-v1';
import { sourcePlacementSha256 as hash } from '../../domain/scene/source-placement-release';
import { locatedWindowFailure, repeatWindowStopped, windowFailureChargeSettled, REPEAT_WINDOW_STOP_VERSION, windowFailureFactSchema, type WindowFailureFact } from '../../domain/generation/repeat-window-stop';
import { journeyWindowReleaseOf } from './journey-window-release';
import { PrismaWorldBudgetStore } from '../../infra/db/prisma-world-budget-store';
const action='local-patch:located-window-failure/v1';
const auditId=(f:WindowFailureFact)=>'aud_window_failure_'+hash(f);
type Row={id:string;status:string;attempts:number;judgeJson:string|null};
const sourceId=(authorizationSha256:string,rowId:string)=>'aud_window_source_'+hash([authorizationSha256,rowId,2]);
/** Freeze which first decision actually started attempt2. A superseded reading
 * of attempt1 can never be picked later just because it happens to match. */
export async function recordWindowAttemptSource(tx:Prisma.TransactionClient,gameId:string,row:Row,nextAttempt:number){
  if(nextAttempt!==2||row.attempts!==1||row.status!=='FAILED')return;
  const pin=await journeyWindowReleaseOf(tx,gameId);if(!pin)return;
  const id=sourceId(pin.authorizationSha256,row.id),metaJson=JSON.stringify({version:'window-attempt-source/v1',authorizationSha256:pin.authorizationSha256,rowId:row.id,attempt:2,previousReceiptSha256:hash(row.judgeJson)});
  const saved=await tx.auditLog.upsert({where:{id},update:{},create:{id,actorType:'SYSTEM',action:'local-patch:window-attempt-source/v1',entityType:'Game',entityId:gameId,metaJson}});
  if(saved.metaJson!==metaJson)throw Error('WINDOW_STOP: previous attempt decision changed');
}
/** Called in the same fenced transaction as the verified ordinary review. */
export async function recordWindowFailure(tx:Prisma.TransactionClient,gameId:string,row:Row){
  if(row.attempts!==1&&row.attempts!==2||row.status!=='FAILED')return;
  const pin=await journeyWindowReleaseOf(tx,gameId);if(!pin)return;
  const located=locatedWindowFailure(row.judgeJson);if(!located)return;
  const j=JSON.parse(row.judgeJson!);if(j.authoredReturn?.sourcePlacement?.manifestSha256!==pin.manifestSha256
    &&j.authoredReturn?.sourcePlacement?.manifestSha256!==pin.bodyManifestSha256
    &&j.authoredReturn?.sourcePlacement?.manifestSha256!==JOURNEY_WINDOW_MANIFEST.parentManifestSha256)return;
  let previousReceiptSha256:string|null=null;
  if(row.attempts===2){const source=await tx.auditLog.findUnique({where:{id:sourceId(pin.authorizationSha256,row.id)}});if(!source)return;
    const p=JSON.parse(source.metaJson??'null');
    if(source.actorType!=='SYSTEM'||source.actorId!==null||source.action!=='local-patch:window-attempt-source/v1'||source.entityType!=='Game'||source.entityId!==gameId
      ||p?.version!=='window-attempt-source/v1'||p.authorizationSha256!==pin.authorizationSha256||p.rowId!==row.id||p.attempt!==2)throw Error('WINDOW_STOP: previous decision binding differs');
    previousReceiptSha256=p.previousReceiptSha256;
  }
  const fact=windowFailureFactSchema.parse({version:REPEAT_WINDOW_STOP_VERSION,authorizationSha256:pin.authorizationSha256,
    rowId:row.id,hideId:j.hide,attempt:row.attempts,previousReceiptSha256,...located}),metaJson=JSON.stringify(fact);
  const kept=await tx.auditLog.upsert({where:{id:auditId(fact)},update:{},create:{id:auditId(fact),actorType:'SYSTEM',action,entityType:'Game',entityId:gameId,metaJson}});
  if(kept.metaJson!==metaJson)throw Error('WINDOW_STOP: conflicting immutable failure fact');
}
/** Never memoizes absence: a late paid answer is reconsidered on every slice.
 * Unknown or pending charges are not interpreted as a zero-cost refusal. */
export async function windowStoppedRows(db:Prisma.TransactionClient,gameId:string,rows:readonly Row[]){
  const blocked=new Set<string>(),pin=await journeyWindowReleaseOf(db,gameId);if(!pin||!rows.some(r=>r.status==='FAILED'&&r.attempts===2))return blocked;
  const records=await db.auditLog.findMany({where:{entityType:'Game',entityId:gameId,action}});
  const ledger=await PrismaWorldBudgetStore.forReadOnlyTransaction(db).read(gameId+':board-wizard');
  const facts:WindowFailureFact[]=[];
  for(const record of records){const p=windowFailureFactSchema.safeParse(JSON.parse(record.metaJson??'null'));if(!p.success)throw Error('WINDOW_STOP: unreadable failure fact');const f=p.data;
    if(record.id!==auditId(f)||record.actorType!=='SYSTEM'||record.actorId!==null||f.authorizationSha256!==pin.authorizationSha256
      ||record.metaJson!==JSON.stringify(f))throw Error('WINDOW_STOP: foreign or changed failure fact');
    const settled=(key:string,fingerprint:string,scope:'image'|'judge')=>{const b=ledger?.snapshot.requests.find(b=>b.requestKey===key);
      return windowFailureChargeSettled(b,key,fingerprint,scope);};
    if(settled(f.renderRequestKey,f.renderFingerprint,'image')&&settled(f.reviewRequestKey,f.reviewFingerprint,'judge'))facts.push(f);
  }
  for(const row of rows)if(repeatWindowStopped(row,facts,pin.authorizationSha256))blocked.add(row.id);
  return blocked;
}
