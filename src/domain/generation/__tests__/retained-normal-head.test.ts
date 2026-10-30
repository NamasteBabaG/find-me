import {it,expect} from 'vitest';
import {retainedNormalHeadRecoveryCandidate as candidate,retainedNormalHeadSchema,RETAINED_NORMAL_HEAD_VERSION} from '../retained-normal-head';
const guided={version:'single-low-guided-frame-recovery/v1',authorizationSha256:'a'.repeat(64),sourceImageSha256:'b'.repeat(64),sourceAssetId:'synthetic-source',sourceReviewRequestKey:'synthetic-original-review',originalAttempts:2,repairCyclesPreserved:3};
const row=(patch:object={})=>({status:'FAILED',attempts:3,assetId:'synthetic-current',judgeJson:JSON.stringify({guidedFrameRecovery:guided,selfRepair:{phase:'awaiting-review',cycle:3,subjectV2Cycles:3},...patch})});
it('can recover retained paid normal pixels after all finite repair cycles, without granting a new cycle',()=>expect(candidate(row())).toBe(true));
it('also checks earlier paid normal pixels after a concluded second-attempt repair',()=>expect(candidate({...row({guidedFrameRecovery:undefined}),attempts:2})).toBe(true));
it.each(['applying','diagnosing'])('preserves an already active %s phase',phase=>expect(candidate(row({selfRepair:{phase,cycle:3}}))).toBe(false));
it('does not replace a generated candidate or reuse a restored normal marker',()=>{
 expect(candidate({...row(),status:'GENERATED'})).toBe(false);
 expect(candidate(row({retainedNormalHead:{version:RETAINED_NORMAL_HEAD_VERSION}}))).toBe(false);
 expect(candidate(row({sourceBodyRepair:{}}))).toBe(false);
});
it('requires a complete versioned paid source and precise recovery audit address',()=>{
 const value={version:RETAINED_NORMAL_HEAD_VERSION,auditId:'aud_normal_head_'+'a'.repeat(40),authorizationSha256:'b'.repeat(64),sourceRequestKey:'synthetic-hide:standing:render:2',sourceFingerprint:'c'.repeat(64),sourcePayloadSha256:'d'.repeat(64),normalizedRawSha256:'e'.repeat(64),shippingSha256:'f'.repeat(64),geometrySha256:'a'.repeat(64),identitySha256:'b'.repeat(64),originalAttempt:2,sourceReviewRequestKey:'synthetic-review',sourceReviewFingerprint:'c'.repeat(64)};
 expect(retainedNormalHeadSchema.safeParse(value).success).toBe(true);
 for(const patch of [{auditId:'unrelated-audit'},{originalAttempt:3},{sourcePayloadSha256:'missing'}])expect(retainedNormalHeadSchema.safeParse({...value,...patch}).success).toBe(false);
});
