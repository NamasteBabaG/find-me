import sharp from 'sharp';
import { sourceCrownContractFor } from '../../domain/scene/source-crown-return';
import type { AuthoredLocalPatchReturnContract } from '../../domain/scene/local-patch-return-region';
import { composeBoundedLocalPatch } from './local-patch-seam';
import { sha256Bytes as sha } from './fixed-sprite';

/** No painter, coordinate warp, silhouette invention or artistic approval.
 * Returns one candidate only when the settled RAW reproduces the old image
 * and the source-qualified top-band correction preserves all other pixels. */
export async function composeSourceCrown(before:Buffer,raw:Buffer,parent:AuthoredLocalPatchReturnContract){
 const c=sourceCrownContractFor(parent);if(!c||sha(await sharp(before,{limitInputPixels:8294400}).ensureAlpha().raw().toBuffer())!==c.sourcePixelsSha256)return null;
 const normalized=await sharp(raw,{limitInputPixels:8294400}).resize(512,768,{fit:'fill'}).png().toBuffer();
 const original=await composeBoundedLocalPatch(before,c.crop,normalized,c.child,{requireAligned:true,playerReview:true,returnRect:c.parentReturned});
 const corrected=await composeBoundedLocalPatch(before,c.crop,normalized,c.child,{requireAligned:true,playerReview:true,returnRect:c.returned});
 if(!original.usable||!corrected.usable)return null;
 const baseline=await sharp(original.candidate).extract(c.crop).png().toBuffer(),shipping=await sharp(corrected.candidate).extract(c.crop).png().toBuffer();
 if(sha(baseline)===sha(shipping))return null;
 const a=await sharp(baseline).ensureAlpha().raw().toBuffer(),b=await sharp(shipping).ensureAlpha().raw().toBuffer(),source=await sharp(before).extract(c.crop).ensureAlpha().raw().toBuffer();
 let outsideReturnChangedPixels=0,changedBelowBandPixels=0;const unchangedBelowTop=c.parentReturned.top+12;
 for(let y=0;y<768;y++)for(let x=0;x<512;x++){const i=(y*512+x)*4;
  if(y>=unchangedBelowTop&&!a.subarray(i,i+4).equals(b.subarray(i,i+4)))changedBelowBandPixels++;
  if((x<c.returned.left||x>=c.returned.left+c.returned.width||y<c.returned.top||y>=c.returned.top+c.returned.height)
    &&!source.subarray(i,i+4).equals(b.subarray(i,i+4)))outsideReturnChangedPixels++;
 }
 if(outsideReturnChangedPixels||changedBelowBandPixels)return null;
 return{baseline,shipping,seam:corrected.report,compositionPermission:corrected.compositionPermission,
  proof:{normalizedRawSha256:sha(normalized),sourcePngSha256:sha(before),baselineImageSha256:sha(baseline),imageSha256:sha(shipping),returned:c.returned,
    outsideReturnChangedPixels:0 as const,unchangedBelowTop,changedBelowBandPixels:0 as const}};
}
