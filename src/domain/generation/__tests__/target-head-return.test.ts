import { describe,it,expect } from 'vitest';
import { targetHeadReturnDecision as decide, type TargetHeadEvidence } from '../target-head-return';
const evidence:TargetHeadEvidence={version:'target-head-return/v1',gameId:'synthetic-game',hideId:'synthetic-hide',sourceRequestKey:'synthetic-paid-image',
 sourceFingerprint:'a'.repeat(64),sourcePayloadSha256:'b'.repeat(64),normalizedRawSha256:'c'.repeat(64),shippingSha256:'d'.repeat(64),geometrySha256:'e'.repeat(64),identitySha256:'f'.repeat(64),
 returned:{left:140,top:323,width:174,height:244},feather:12};
const head={left:180,top:345,width:70,height:80};
const answer=(patch:object={})=>JSON.stringify({version:'single-sol-medium/v1',head:{version:'target-head-return/v1',rawHead:head,shippingHead:head,rawCrown:'pass',shippingCrown:'pass',observation:'Synthetic native RAW and shipping preserve the complete visible crown.',...patch}});
describe('one-answer native target crown gate',()=>{
 it('admits complete visible native heads fully inside the opaque return',()=>expect(decide(answer(),evidence).disposition).toBe('pass'));
 it('refuses a verbal PASS locating the original Paris crown above the return',()=>expect(decide(answer({rawHead:{...head,top:305},shippingHead:{...head,top:323}}),evidence)).toMatchObject({disposition:'repair',reason:expect.stringContaining('opaque return')}));
 it('refuses the original Amazon crop even when the model says both crowns pass',()=>expect(decide(answer({rawHead:{left:340,top:117,width:80,height:110},shippingHead:{left:340,top:140,width:80,height:87}}),{...evidence,returned:{left:290,top:140,width:221,height:560}}).disposition).toBe('repair'));
 it.each(['rawCrown','shippingCrown'])('a visible %s defect cannot be outweighed by other quality passes',field=>expect(decide(answer({[field]:'fail'}),evidence).disposition).toBe('repair'));
 it.each(['rawCrown','shippingCrown'])('uncertain %s remains unresolved without automatically asking again',field=>expect(decide(answer({[field]:'uncertain'}),evidence).disposition).toBe('unresolved'));
 it('does not transfer a LOW answer into the native MEDIUM protocol',()=>expect(decide(answer().replace('single-sol-medium/v1','single-sol-low/v1'),evidence).disposition).toBe('unresolved'));
 it('refuses a head inside the feather rather than inside opaque pixels',()=>expect(decide(answer({rawHead:{...head,top:330},shippingHead:{...head,top:330}}),evidence).disposition).toBe('repair'));
 it('refuses an unexplained material RAW to shipping head discrepancy',()=>expect(decide(answer({shippingHead:{...head,left:200}}),evidence).disposition).toBe('repair'));
 it.each([null,'{broken',JSON.stringify({version:'single-sol-medium/v1'})])('missing or malformed head evidence is not a pass: %s',raw=>expect(decide(raw,evidence).disposition).toBe('unresolved'));
 it('rejects forged evidence and bounds',()=>{expect(decide(answer(),{...evidence,feather:0} as unknown as TargetHeadEvidence).disposition).toBe('unresolved');expect(decide(answer({rawHead:{...head,width:513}}),evidence).disposition).toBe('unresolved');});
});
