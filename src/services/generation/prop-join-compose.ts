import sharp from "sharp";
import type { PropJoinContract } from "../../domain/generation/prop-join";
import { composeBoundedLocalPatch } from "./local-patch-seam";
import { sha256Bytes as sha } from "./fixed-sprite";

/** One deterministic candidate chosen by the public source join, without an
 * image provider or a visual verdict. The ordinary judge still decides it. */
export async function composeRegisteredProp(before:Buffer,rawPng:Buffer,c:PropJoinContract){
 if(c.crop.width!==512||c.crop.height!==768||c.anchor.left+c.anchor.width>512||c.anchor.top+c.anchor.height>768
  ||c.returned.top+c.returned.height>768||c.protectedAbove>=c.returned.top+c.returned.height||c.pivotX<0||c.pivotX>=512)throw Error('PROP_JOIN: invalid public source geometry');
 const normalized=await sharp(rawPng,{limitInputPixels:8294400}).resize(512,768,{fit:'fill'}).png().toBuffer();
 const reference=await sharp(before).extract(c.crop).ensureAlpha().raw().toBuffer(),raw=await sharp(normalized).ensureAlpha().raw().toBuffer();
 const weight=(y:number)=>Math.max(0,Math.min(1,(y-c.protectedAbove)/(c.returned.top+c.returned.height-c.protectedAbove)));
 const sample=(x:number,y:number,ch:number)=>{
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  if(ix<0||iy<0||ix>=511||iy>=767)return raw[(Math.max(0,Math.min(767,Math.round(y)))*512+Math.max(0,Math.min(511,Math.round(x))))*4+ch]!;
  return raw[(iy*512+ix)*4+ch]!*(1-fx)*(1-fy)+raw[(iy*512+ix+1)*4+ch]!*fx*(1-fy)
   +raw[((iy+1)*512+ix)*4+ch]!*(1-fx)*fy+raw[((iy+1)*512+ix+1)*4+ch]!*fx*fy;
 };
 const score=(sx:number,dy:number)=>{let sum=0,weights=0;
  for(let y=c.anchor.top;y<c.anchor.top+c.anchor.height;y++)for(let x=c.anchor.left;x<c.anchor.left+c.anchor.width;x++){
   const i=(y*512+x)*4,r=reference[i]!,g=reference[i+1]!,b=reference[i+2]!,w=(r+g+b<330||r>65&&r>1.25*b&&g>1.2*b)?4:1;
   const sy=y-dy*weight(y),scale=1+(sx-1)*weight(y),xx=c.pivotX+(x-c.pivotX)/scale;
   for(let ch=0;ch<3;ch++)sum+=w*(sample(xx,sy,ch)-reference[i+ch]!)**2;weights+=w*3;
  }return sum/weights;
 };
 let best={sx:1,dy:0,score:score(1,0)};const initialScore=best.score;
 if(initialScore<c.minInitialScore)return null;
 for(let s=100;s<=c.maxScalePercent;s+=2)for(let dy=c.minDy;dy<=c.maxDy;dy+=2){const v=score(s/100,dy);if(v<best.score)best={sx:s/100,dy,score:v};}
 const relativeScore=best.score/initialScore;
 if(relativeScore>c.maxRelativeScore||best.sx===1&&best.dy===0)return null;
 const pixels=Buffer.from(raw);
 for(let y=c.protectedAbove;y<768;y++)for(let x=c.pivotX;x<512;x++){
  const w=weight(y),scale=1+(best.sx-1)*w,xx=c.pivotX+(x-c.pivotX)/scale,yy=y-best.dy*w;
  for(let ch=0;ch<4;ch++)pixels[(y*512+x)*4+ch]=Math.round(sample(xx,yy,ch));
 }
 const changed=await sharp(pixels,{raw:{width:512,height:768,channels:4}}).png().toBuffer(),options={playerReview:true,returnRect:c.returned};
 const baseline=await composeBoundedLocalPatch(before,c.crop,normalized,c.child,options),proposed=await composeBoundedLocalPatch(before,c.crop,changed,c.child,options);
 if(!proposed.usable)return null;
 const baselinePng=await sharp(baseline.candidate).extract(c.crop).png().toBuffer(),shipping=await sharp(proposed.candidate).extract(c.crop).png().toBuffer();
 const baselinePixels=await sharp(baselinePng).ensureAlpha().raw().toBuffer(),after=await sharp(shipping).ensureAlpha().raw().toBuffer();
 let protectedChangedPixels=0,outsideReturnChangedPixels=0;
 for(let y=0;y<768;y++)for(let x=0;x<512;x++){
  const i=(y*512+x)*4;
  if(y<c.protectedAbove&&after.subarray(i,i+4).compare(baselinePixels.subarray(i,i+4)))protectedChangedPixels++;
  if((x<c.returned.left||x>=c.returned.left+c.returned.width||y<c.returned.top||y>=c.returned.top+c.returned.height)
   &&after.subarray(i,i+4).compare(reference.subarray(i,i+4)))outsideReturnChangedPixels++;
 }
 if(protectedChangedPixels||outsideReturnChangedPixels)return null;
 return {shipping,report:proposed.report,compositionPermission:proposed.compositionPermission,proof:{...best,initialScore,relativeScore,
  protectedChangedPixels:0 as const,outsideReturnChangedPixels:0 as const,normalizedRawSha256:sha(normalized),sourcePngSha256:sha(before),beforeImageSha256:sha(baselinePng),imageSha256:sha(shipping)}};
}
