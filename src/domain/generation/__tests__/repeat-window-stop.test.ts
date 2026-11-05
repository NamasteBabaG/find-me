import { describe,it,expect } from 'vitest';
import { sourcePlacementSha256 as hash } from '../../scene/source-placement-release';
import { locatedWindowFailure,repeatWindowStopped,windowFailureChargeSettled,REPEAT_WINDOW_STOP_VERSION,windowFailureFactSchema } from '../repeat-window-stop';
import { TARGET_HEAD_VISIBLE_VERSION } from '../target-head-return';
import { SINGLE_MEDIUM_VISUAL_REVIEW_VERSION } from '../single-visual-review';
const sha=(n:number)=>String(n).repeat(64),auth=sha(9);
function receipt(attempt:1|2){const returned={left:80,top:120,width:200,height:400},image=sha(attempt),authoredReturn={local:returned};
  return {hide:'synthetic-hide',reviewState:'board-review-complete',wireFault:null,qualityDisposition:{state:'retry'},authoredReturn,judgedSha256:image,
    verdict:{verdict:'fail',childComplete:'fail',pictureWhole:'fail',severeSeam:'fail',boundaryIntegrity:{top:{status:'fail'},left:{status:'pass'},right:{status:'pass'},bottom:{status:'pass'}}},
    boardReview:{dual:{single:SINGLE_MEDIUM_VISUAL_REVIEW_VERSION,imageSha256:image,authoredReturn,quality:{wireFault:null,
      requestKey:'synthetic:review:'+attempt,fingerprint:sha(attempt+2),policy:{effort:'medium',model:'gpt-6.1-sol'},
      raw:JSON.stringify({version:SINGLE_MEDIUM_VISUAL_REVIEW_VERSION,assessment:{},continuity:{},doubt:false,doubtReason:null,
        head:{version:TARGET_HEAD_VISIBLE_VERSION,rawHead:{left:110,top:105,width:70,height:80},shippingHead:{left:110,top:121,width:70,height:64},rawCrown:'pass',shippingCrown:'fail',observation:'Synthetic complete RAW head loses its upper portion at the actual returned top.'}}),
      headEvidence:{version:TARGET_HEAD_VISIBLE_VERSION,gameId:'synthetic-game',hideId:'synthetic-hide',sourceRequestKey:'synthetic:render:'+attempt,
        sourceFingerprint:sha(attempt+4),sourcePayloadSha256:sha(7),normalizedRawSha256:sha(8),shippingSha256:image,geometrySha256:sha(6),identitySha256:sha(7),returned,feather:12},
    }}}};}
const serialize=(x:ReturnType<typeof receipt>)=>JSON.stringify(x);
function fact(attempt:1|2){const j=serialize(receipt(attempt)),located=locatedWindowFailure(j);expect(located).not.toBeNull();
  return windowFailureFactSchema.parse({version:REPEAT_WINDOW_STOP_VERSION,authorizationSha256:auth,rowId:'synthetic-row',hideId:'synthetic-hide',attempt,
    previousReceiptSha256:attempt===2?hash(serialize(receipt(1))):null,...located});}
const row=()=>({id:'synthetic-row',status:'FAILED',attempts:2,judgeJson:serialize(receipt(2))});
describe('two conclusive paid attempts stop only the unchanged next painting',()=>{
  it('requires settled matching charge evidence independently for paintings and judgments',()=>{
    const settled={requestKey:'synthetic:review',scope:'judge',state:'settled',operationFingerprint:sha(1),conflicts:[],evidence:{amountMicroUsd:35000}};
    expect(windowFailureChargeSettled(settled,settled.requestKey,sha(1),'judge')).toBe(true);
    for(const state of ['pending','unknown'])expect(windowFailureChargeSettled({...settled,state},settled.requestKey,sha(1),'judge'),state).toBe(false);
    expect(windowFailureChargeSettled({...settled,state:'unknown',evidence:undefined},settled.requestKey,sha(1),'judge')).toBe(false);
    expect(windowFailureChargeSettled({...settled,conflicts:[{}]},settled.requestKey,sha(1),'judge')).toBe(false);
    expect(windowFailureChargeSettled(settled,'other-key',sha(1),'judge')).toBe(false);
    expect(windowFailureChargeSettled(settled,settled.requestKey,sha(2),'judge')).toBe(false);
    expect(windowFailureChargeSettled(settled,settled.requestKey,sha(1),'image')).toBe(false);
    expect(windowFailureChargeSettled({...settled,evidence:undefined},settled.requestKey,sha(1),'judge')).toBe(false);
    expect(windowFailureChargeSettled(undefined,settled.requestKey,sha(1),'judge')).toBe(false);
  });
  it('requires two independent painting requests and judgments, not two reads of one refusal',()=>{
    expect(repeatWindowStopped(row(),[fact(1),fact(2)],auth)).toBe(true);
    expect(repeatWindowStopped(row(),[fact(2),fact(2)],auth)).toBe(false);
    expect(repeatWindowStopped(row(),[fact(1),{...fact(2),renderRequestKey:fact(1).renderRequestKey}],auth)).toBe(false);
    expect(repeatWindowStopped(row(),[fact(1),{...fact(2),reviewRequestKey:fact(1).reviewRequestKey}],auth)).toBe(false);
    expect(repeatWindowStopped(row(),[fact(1),{...fact(2),imageSha256:fact(1).imageSha256}],auth)).toBe(false);
  });
  it.each(['geometry','edge','class','grant','row','corrected','single','superseded'])('does not transfer another %s to the next purchase',fault=>{
    const a=fact(1),b=fact(2),r=row();if(fault==='geometry')a.contractSha256=hash('other geometry');if(fault==='edge')a.edge='right';if(fault==='class')a.kind='seam';
    if(fault==='grant')a.authorizationSha256=sha(8);if(fault==='row')a.rowId='other-row';if(fault==='corrected')r.judgeJson+=' ';if(fault==='single')a.attempt=2;
    if(fault==='superseded')b.previousReceiptSha256=hash('different first decision');
    expect(repeatWindowStopped(r,[a,b],auth)).toBe(false);
  });
  it.each(['PENDING','GENERATED','APPROVED'])('preserves %s work including an already-started third',status=>{
    expect(repeatWindowStopped({...row(),status},[fact(1),fact(2)],auth)).toBe(false);
    expect(repeatWindowStopped({...row(),status,attempts:3},[fact(1),fact(2)],auth)).toBe(false);
  });
  it.each(['diagnosing','applying'])('does not discard a frozen %s repair',phase=>{const j={...receipt(2),selfRepair:{phase}};
    expect(repeatWindowStopped({...row(),judgeJson:JSON.stringify(j)},[fact(1),fact(2)],auth)).toBe(false);});
  it.each(['wire','unresolved','uncertain','doubt','not-located','no-head','raw-only','wrong-policy','unbound-head','several-edges'])('never counts %s as a conclusive window refusal',fault=>{
    const j=receipt(2),q=j.boardReview.dual.quality,answer=JSON.parse(q.raw);
    if(fault==='wire')j.wireFault='http' as unknown as null;
    if(fault==='unresolved')j.qualityDisposition.state='unresolved';if(fault==='uncertain')answer.head.shippingCrown='uncertain';
    if(fault==='doubt'){answer.doubt=true;answer.doubtReason='Synthetic uncertainty in the target head';}
    if(fault==='not-located')j.verdict.boundaryIntegrity.top.status='pass';if(fault==='no-head')delete answer.head;
    if(fault==='raw-only'){answer.head.shippingCrown='pass';j.verdict.severeSeam='pass';}
    if(fault==='wrong-policy')q.policy.effort='high';if(fault==='unbound-head')q.headEvidence.shippingSha256=sha(8);
    if(fault==='several-edges')j.verdict.boundaryIntegrity.right.status='fail';q.raw=JSON.stringify(answer);
    expect(locatedWindowFailure(serialize(j))).toBeNull();
  });
});
