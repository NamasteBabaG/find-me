import {describe,it,expect} from 'vitest';
import {visibleHeadPolicyRecoveryCandidate as candidate} from '../visible-head-policy-recovery';
import {TARGET_HEAD_VISIBLE_VERSION} from '../target-head-return';

const proof={version:'target-head-return/v1',gameId:'synthetic-game',hideId:'synthetic-hide',sourceRequestKey:'synthetic-render',
 sourceFingerprint:'a'.repeat(64),sourcePayloadSha256:'b'.repeat(64),normalizedRawSha256:'c'.repeat(64),shippingSha256:'d'.repeat(64),geometrySha256:'e'.repeat(64),identitySha256:'f'.repeat(64),
 returned:{left:88,top:216,width:324,height:452},feather:12};
const head={left:176,top:222,width:116,height:113};
const receipt=()=>({reviewState:'board-review-complete',verdict:{verdict:'fail',faults:[{check:'childComplete',where:'HEAD_RETURN: synthetic planning clearance refusal'}]},
 boardReview:{dual:{quality:{headEvidence:proof,raw:JSON.stringify({version:'single-sol-medium/v1',doubt:false,head:{version:'target-head-return/v1',rawHead:head,shippingHead:head,
 rawCrown:'fail',shippingCrown:'fail',observation:'Synthetic intact six-pixel crown requires a new versioned question.'}})}}}});
const row=(j:unknown=receipt())=>({status:'FAILED',assetId:'synthetic-paid-candidate',judgeJson:JSON.stringify(j)});

describe('bounded head policy recovery scheduling',()=>{
 it('schedules a head-only historical refusal for authentication, never a PASS',()=>expect(candidate(row())).toBe(true));
 it('does not select unrelated quality damage or a previous approval',()=>{
  const j=receipt();j.verdict.faults.push({check:'neighborsIntact',where:'Synthetic duplicate head'});expect(candidate(row(j))).toBe(false);
  expect(candidate(row({...receipt(),verdict:{verdict:'pass',faults:[]}}))).toBe(false);
 });
 it.each(['diagnosing','applying'])('never rewrites an in-flight %s phase',phase=>expect(candidate(row({...receipt(),selfRepair:{phase,cycle:2}}))).toBe(false));
 it('does not loop after a version transition or accept a foreign policy',()=>{
  expect(candidate(row({...receipt(),headPolicyVersion:TARGET_HEAD_VISIBLE_VERSION}))).toBe(false);
  expect(candidate(row({...receipt(),headPolicyVersion:'foreign-version'}))).toBe(false);
  expect(candidate(row({...receipt(),visibleHeadRecovery:{version:'visible-head-policy-recovery/v1'}}))).toBe(false);
 });
 it('leaves uncertainty, actual edge crossings and large geometry differences on their existing path',()=>{
  for(const patch of [{rawCrown:'uncertain'},{shippingHead:{...head,top:216}},{shippingHead:{...head,width:140}}]){
   const j=receipt(),raw=JSON.parse(j.boardReview.dual.quality.raw);Object.assign(raw.head,patch);j.boardReview.dual.quality.raw=JSON.stringify(raw);
   expect(candidate(row(j))).toBe(false);
  }
 });
 it('requires a close-edge head and complete old policy evidence',()=>{
  const j=receipt(),raw=JSON.parse(j.boardReview.dual.quality.raw);raw.head.rawHead.top=240;raw.head.shippingHead.top=240;j.boardReview.dual.quality.raw=JSON.stringify(raw);
  expect(candidate(row(j))).toBe(false);
  expect(candidate({status:'FAILED',assetId:null,judgeJson:JSON.stringify(receipt())})).toBe(false);
  expect(candidate({status:'FAILED',assetId:'synthetic',judgeJson:'{broken'})).toBe(false);
 });
});
