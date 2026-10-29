import { describe,it,expect } from 'vitest';
import { targetHeadReturnDecision as decide, targetHeadRepairContext, type TargetHeadEvidence } from '../target-head-return';
import { integrationDiagnosisPrompt } from '../../../services/generation/local-patch-integration-diagnosis';
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
 it('carries located crown loss into a new diagnosis while retaining historical prompts without the optional context',()=>{
  const raw=answer({shippingHead:{...head,top:325},shippingCrown:'fail'}),context=targetHeadRepairContext(raw,evidence)!;
  expect(context.evidence).toEqual(evidence);expect(context.answer.shippingHead.top).toBe(325);
  const input={ageYears:7,pose:'standing',support:'ground',envelope:{},sourceKeys:['synthetic-paid-image'],feedback:{},history:[]};
  expect(integrationDiagnosisPrompt(input)).not.toContain('FROZEN TARGET HEAD DATA');
  const prompt=integrationDiagnosisPrompt({...input,headContext:context});
  expect(prompt).toContain('"sourceKey":"synthetic-paid-image"');expect(prompt).toContain('"rawHead":{"left":180,"top":345');
  expect(prompt).toContain('A core starting below this crown repeats the clipping');expect(prompt).toContain('required18px guard');
 });
 it('creates no repair direction from a pass, uncertain crown or unreadable response',()=>{
  expect(targetHeadRepairContext(answer(),evidence)).toBeNull();
  expect(targetHeadRepairContext(answer({shippingCrown:'uncertain'}),evidence)).toBeNull();
  expect(targetHeadRepairContext('{broken',evidence)).toBeNull();
 });
 it('rejects a partially supplied legacy composition binding',()=>{
  expect(decide(answer(),{...evidence,sourceBindingVersion:'legacy-paid-join-head/v1'} as TargetHeadEvidence).disposition).toBe('unresolved');
 });
});
