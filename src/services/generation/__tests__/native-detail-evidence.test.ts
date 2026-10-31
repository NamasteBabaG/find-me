import sharp from "sharp";
import { describe,expect,it } from "vitest";
import { nativeDetailQuestion } from "../native-detail-evidence";
import { nativeDetailSubjectDirection } from "../native-detail-painter";
import { prepareVisualReview,visualReviewMaxCharge } from "../visual-review";
import { sha256Bytes } from "../fixed-sprite";
import { NATIVE_DETAIL_VERSION,nativeDetailRefused,NATIVE_DETAIL_REPAIR_DIRECTION } from "../../../domain/generation/native-detail";
import { SINGLE_MEDIUM_VISUAL_REVIEW_VERSION } from "../../../domain/generation/single-visual-review";

const png=(color:string,width=512,height=768)=>sharp({create:{width,height,channels:3,background:color}}).png().toBuffer();
async function fixture(){
 const [source,raw,shipping]=await Promise.all([png('#798a9b'),png('#314253'),png('#536475')]);
 const question=prepareVisualReview({combined:SINGLE_MEDIUM_VISUAL_REVIEW_VERSION,role:'scene-quality',effort:'medium',judge:'gpt-6.1-sol',transport:'responses-background',tier:'flex',
  prompt:'Synthetic complete quality, identity, anatomy and head question',images:[raw,shipping],labels:['native-provider-raw','native-shipping-crown']});
 return{source,raw,shipping,question};
}

describe('native detail evidence and prospective painting',()=>{
 it('adds exact aligned source pixels to the same ordinary MEDIUM, preserving every RAW/shipping byte and legacy question',async()=>{
  const f=await fixture(),before={fp:f.question.fingerprint,prompt:f.question.prompt,labels:[...f.question.labels],hashes:f.question.images.map(sha256Bytes)};
  const next=await nativeDetailQuestion(f.question,{hideId:'synthetic-hide',...f});
  expect(next.evidence).toEqual({version:NATIVE_DETAIL_VERSION,sourceCropSha256:sha256Bytes(f.source),rawSha256:sha256Bytes(f.raw),shippingSha256:sha256Bytes(f.shipping),width:512,height:768});
  expect(next.question.images).toEqual([f.source,f.raw,f.shipping]);expect(next.question.images.slice(-2)).toEqual(f.question.images);
  expect(next.question.policy).toEqual(f.question.policy);expect(next.question.fingerprint).not.toBe(before.fp);
  expect({fp:f.question.fingerprint,prompt:f.question.prompt,labels:f.question.labels,hashes:f.question.images.map(sha256Bytes)}).toEqual(before);
  expect(next.question.prompt).toContain('sharper unused RAW background is NOT evidence');
  const charge=visualReviewMaxCharge(next.question);expect(charge.ok).toBe(true);if(charge.ok)expect(charge.microUsd).toBeLessThanOrEqual(250000);
 });
 it('reuses an already identical source image without another token-bearing copy',async()=>{
  const f=await fixture(),q=prepareVisualReview({...f.question,images:[f.source,...f.question.images],labels:['original native source',...f.question.labels]});
  const next=await nativeDetailQuestion(q,{hideId:'synthetic-hide',...f});
  expect(next.question.images).toEqual(q.images);expect(next.question.labels[0]).toContain('native-original-source');
 });
 it.each(['raw','shipping'] as const)('refuses %s evidence that differs from the existing paid-question input',async field=>{
  const f=await fixture(),changed={...f,[field]:await png('red')};
  await expect(nativeDetailQuestion(f.question,{hideId:'synthetic-hide',...changed})).rejects.toThrow('exact existing RAW and SHIPPING');
 });
 it.each([[256,384],[512,767]])('rejects a source at %sx%s instead of resizing it into apparent agreement',async(width,height)=>{
  const f=await fixture();await expect(nativeDetailQuestion(f.question,{hideId:'synthetic-hide',...f,source:await png('red',width,height)})).rejects.toThrow('aligned single native512x768');
 });
 it('requires an explicit located native-detail style refusal, never a statistic, generic failure or successful review',async()=>{
  const f=await fixture(),{evidence}=await nativeDetailQuestion(f.question,{hideId:'synthetic-hide',...f});
  const refusal={styleMatch:'fail',faults:[{check:'styleMatch',where:'NATIVE_DETAIL: target eye contours are blurred beside the original clear face.'}]};
  expect(nativeDetailRefused(evidence,refusal)).toBe(true);
  expect(nativeDetailRefused(undefined,refusal)).toBe(false);
  expect(nativeDetailRefused(evidence,{...refusal,styleMatch:'pass'})).toBe(false);
  expect(nativeDetailRefused(evidence,{...refusal,faults:[{check:'styleMatch',where:'Higher numeric detail score'}]})).toBe(false);
  expect(nativeDetailRefused(evidence,{...refusal,faults:[{check:'childComplete',where:refusal.faults[0]!.where}]})).toBe(false);
  expect(NATIVE_DETAIL_REPAIR_DIRECTION).toContain('Do not run a blur/sharpen/noise/texture treatment');
 });
 it('versions future paint directions and preserves the complete original replay ancestry, references and quality',()=>{
  const text='Synthetic canonical child at unchanged depth',photoPng=Buffer.from('synthetic photo bytes'),photoSha256=sha256Bytes(photoPng),policySha256='a'.repeat(64),quality='medium' as const;
  const original={text,photoPng,photoSha256,policySha256,quality,wardrobe:'synthetic coat',sha256:sha256Bytes(Buffer.from(JSON.stringify([text,'synthetic coat',photoSha256,policySha256,quality])))};
  const next=nativeDetailSubjectDirection(original)!;
  expect(next.text).toContain('NATIVE DETAIL MATCH native-detail/v1');expect(next.legacy).toEqual([original]);
  expect(next.photoPng).toBe(original.photoPng);expect(next.photoSha256).toBe(original.photoSha256);expect(next.policySha256).toBe(original.policySha256);expect(next.quality).toBe(original.quality);
  expect(next.sha256).toBe(sha256Bytes(Buffer.from(JSON.stringify([next.text,next.wardrobe,next.photoSha256,next.policySha256,next.quality]))));
  expect(nativeDetailSubjectDirection(next)).toBe(next);expect(nativeDetailSubjectDirection(undefined)).toBeUndefined();expect(original.text).toBe(text);
 });
});
