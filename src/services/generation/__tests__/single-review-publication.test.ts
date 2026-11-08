import { describe,expect,it,vi } from 'vitest';
import { auditWorldBudget,type WorldAutomaticReviewRecoveryV5,type WorldBudget } from '../world-budget';
import { localPatchBudgetReadyForPublication } from '../local-patch-interruption-recovery';

describe('single-document transport recovery at the financial publication boundary',()=>{
 const worldId='synthetic-medium-publication:board-wizard';
 const approval:WorldAutomaticReviewRecoveryV5={version:'world-automatic-review-recovery/v5',worldId,
  approvalId:'synthetic-verified-transport',requestKey:'self-repair:board:castlegate:'+'a'.repeat(64),scope:'judge',
  operationFingerprint:'b'.repeat(64),reserveMicroUsd:207000,unknownReasons:['Synthetic terminal response without usage'],
  policyId:'single-sol-medium-transport-recovery/v1',grantSha256:'c'.repeat(64),variantId:'synthetic-row',imageSha256:'d'.repeat(64),
  authorizationSha256:'e'.repeat(64),authorizedAt:'2026-11-08T00:00:00.000Z'};
 function fixture(value:unknown=approval,pending=false){
  // A read-only audit already admitted by the ledger's recovery policy. This
  // boundary must additionally authenticate its persisted source/image proof.
  const audit={...auditWorldBudget({worldId,requests:[]}),reservedMicroUsd:207000,committedMicroUsd:207000,
   remainingMicroUsd:3793000,unknownRequestKeys:[approval.requestKey],pendingRequestKeys:pending?['live-question']:[]};
  const budget={audit:vi.fn(async()=>structuredClone(audit)),readContinuationApproval:vi.fn(async()=>value)} as unknown as Pick<WorldBudget,'audit'|'readContinuationApproval'>;
  return {budget,audit};
 }
 it.each([12,13])('keeps the full unknown reservation while permitting a verified MEDIUM continuation in scene%i',async version=>{
  const f=fixture(),before=structuredClone(f.audit),verify=vi.fn(async a=>a===approval);
  expect(await localPatchBudgetReadyForPublication(f.budget,worldId,version,{reviewRecoveryV3:true,singleLowContinuation:verify})).toBe(true);
  expect(verify).toHaveBeenCalledExactlyOnceWith(approval);expect(f.audit).toEqual(before);expect(f.audit.reservedMicroUsd).toBe(207000);
 });
 it.each([12,13])('refuses an absent or rejected proof verifier in scene%i',async version=>{
  const f=fixture();expect(await localPatchBudgetReadyForPublication(f.budget,worldId,version,{reviewRecoveryV3:true})).toBe(false);
  expect(await localPatchBudgetReadyForPublication(f.budget,worldId,version,{reviewRecoveryV3:true,singleLowContinuation:async()=>false})).toBe(false);
 });
 it('keeps pending provider work and unsupported old scene contracts blocked',async()=>{
  const pending=fixture(approval,true),verify=vi.fn(async()=>true);
  expect(await localPatchBudgetReadyForPublication(pending.budget,worldId,12,{singleLowContinuation:verify})).toBe(false);
  expect(verify).not.toHaveBeenCalled();
  expect(await localPatchBudgetReadyForPublication(fixture().budget,worldId,11,{singleLowContinuation:verify})).toBe(false);
 });
 it('does not turn an ordinary operator unknown allowance into delivery authority',async()=>{
  const {policyId:_policy,grantSha256:_grant,variantId:_row,imageSha256:_image,...base}=approval;
  const ordinary={...base,version:'world-unknown-continuation/v1',operatorId:'synthetic-owner'};
  expect(await localPatchBudgetReadyForPublication(fixture(ordinary).budget,worldId,12,{singleLowContinuation:async()=>true})).toBe(false);
 });
});
