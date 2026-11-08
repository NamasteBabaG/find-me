import sharp from 'sharp';
import { composeSourceHead, sourceHeadAlpha, type SourceHeadAuthority } from '../../domain/generation/source-head-recovery';
import { composeBoundedLocalPatch } from './local-patch-seam';
import { sha256Bytes } from './fixed-sprite';
import { composeSourceHeadProtectedJoin, SOURCE_HEAD_JOIN_VERSION } from '../../domain/generation/source-head-join';

export async function sourceHeadMaskPng(a:SourceHeadAuthority){
  const alpha=sourceHeadAlpha(a),pixels=Buffer.alloc(512*768*4,255);
  for(let i=0;i<alpha.length;i++)pixels[i*4+3]=255-alpha[i]!;
  return sharp(pixels,{raw:{width:512,height:768,channels:4}}).png().toBuffer();
}
/** Same paid native frame; only source-authored head/hair pixels are returned.
 * The helper is shared by rendering and independent publication reproduction. */
export async function applySourceHeadPixels(beforePng:Buffer,rawPng:Buffer,a:SourceHeadAuthority,join?:typeof SOURCE_HEAD_JOIN_VERSION){
  if(sha256Bytes(beforePng)!==a.sourcePngSha256)throw Error('SOURCE_HEAD: public source pixels changed');
  const crop=await sharp(beforePng,{limitInputPixels:8294400}).extract(a.crop).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const raw=await sharp(rawPng,{limitInputPixels:8294400}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const made=(join===SOURCE_HEAD_JOIN_VERSION?composeSourceHeadProtectedJoin:composeSourceHead)(a,{data:crop.data,width:crop.info.width,height:crop.info.height,channels:crop.info.channels},
    {data:raw.data,width:raw.info.width,height:raw.info.height,channels:raw.info.channels});
  return {png:await sharp(made.pixels,{raw:{width:512,height:768,channels:4}}).png().toBuffer(),
    proof:{...made.proof,sourcePngSha256:sha256Bytes(beforePng),normalizedRawSha256:sha256Bytes(rawPng)}};
}
export async function reproduceSourceHeadShipping(beforePng:Buffer,rawPng:Buffer,a:SourceHeadAuthority,join?:typeof SOURCE_HEAD_JOIN_VERSION){
  const made=await applySourceHeadPixels(beforePng,rawPng,a,join);
  const joined=await composeBoundedLocalPatch(beforePng,a.crop,made.png,a.child,{requireAligned:true,returnRect:a.returned});
  if(!joined.usable)throw Error('SOURCE_HEAD: unchanged original return has no valid join');
  return {png:await sharp(joined.candidate,{limitInputPixels:8294400}).extract(a.crop).png().toBuffer(),proof:made.proof};
}
