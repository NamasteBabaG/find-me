import { describe,expect,it } from 'vitest';
import { SOURCE_HEAD_RECOVERY_AUTHORITIES } from '../../../../content/adventures/source-head-recovery-v1';
import { composeSourceHead,sourceHeadAlpha,type SourceHeadPixels } from '../source-head-recovery';
import { composeSourceHeadProtectedJoin,SOURCE_HEAD_JOIN_VERSION } from '../source-head-join';

const a=SOURCE_HEAD_RECOVERY_AUTHORITIES[0],alpha=sourceHeadAlpha(a);
function fixture(){
 const data=new Uint8Array(512*768*4);
 for(let y=0;y<768;y++)for(let x=0;x<512;x++){const i=(y*512+x)*4;data[i]=(x*13+y*17)%160;data[i+1]=(x*19+y*7)%160;data[i+2]=(x*11+y*23)%160;data[i+3]=255;}
 const scene:SourceHeadPixels={data,width:512,height:768,channels:4},raw={...scene,data:new Uint8Array(data)};
 for(let i=0;i<alpha.length;i++)if(alpha[i]){raw.data[i*4]=210;raw.data[i*4+1]=20;raw.data[i*4+2]=30;}
 return{scene,raw};
}
describe('additive protected source head join',()=>{
 it('does not compare deliberately replaced whole hair against old hair, while retaining every native paid head pixel and every SOURCE body pixel',()=>{
  const {scene,raw}=fixture();expect(()=>composeSourceHead(a,scene,raw)).toThrow('unchanged seam/alignment limits');
  const result=composeSourceHeadProtectedJoin(a,scene,raw);
  expect(result.proof).toMatchObject({version:SOURCE_HEAD_JOIN_VERSION,borderMeanDiff:0,paidHeadChangedPixels:0,outsideMaskChangedPixels:0,sourceBodyChangedPixels:0,protectedHeadChangedPixels:0,shift:{dx:0,dy:0}});
  let wrongHead=0,wrongSource=0;
  for(let i=0;i<alpha.length;i++)for(let c=0;c<4;c++)if(result.pixels[i*4+c]!==((alpha[i]?raw:scene).data[i*4+c])){if(alpha[i])wrongHead++;else wrongSource++;}
  expect(wrongHead).toBe(0);expect(wrongSource).toBe(0);expect(result.proof).not.toHaveProperty('artApproved');
 });
 it('still refuses an exterior above24 and forged or non-native permissions',()=>{
  const {scene,raw}=fixture();for(let i=0;i<alpha.length;i++)if(!alpha[i])for(let c=0;c<3;c++)raw.data[i*4+c]=255;
  expect(()=>composeSourceHeadProtectedJoin(a,scene,raw)).toThrow('protected exterior exceeds unchanged24 limit');
  expect(()=>composeSourceHeadProtectedJoin({...a,protectedBelow:600} as unknown as typeof a,scene,raw)).toThrow('unknown public permission');
  expect(()=>composeSourceHeadProtectedJoin(a,scene,{...raw,width:511})).toThrow('native aligned RGBA');
 });
 it('reports discarded RAW context motion separately and never translates or resizes the actual head',()=>{
  const {scene,raw}=fixture();
  // Smooth, uniquely textured SOURCE: a shifted context has a measurable
  // registration minimum, but the returned head keeps its original native axes.
  for(let y=0;y<768;y++)for(let x=0;x<512;x++){const i=(y*512+x)*4;for(let c=0;c<3;c++)scene.data[i+c]=Math.round(80+25*Math.sin(x/19)+25*Math.cos(y/13)+15*Math.sin((x+y)/9+c));}
  for(let y=0;y<768;y++)for(let x=0;x<512;x++)if(!alpha[y*512+x]){
   const i=(y*512+x)*4,j=(Math.max(0,y-1)*512+x)*4;for(let c=0;c<3;c++)raw.data[i+c]=scene.data[j+c]!;
  }
  const r=composeSourceHeadProtectedJoin(a,scene,raw);expect(r.proof.discardedRawBackgroundBestShift.dy).toBe(1);
  expect(r.proof.shift).toEqual({dx:0,dy:0});expect(r.proof.paidHeadChangedPixels).toBe(0);expect(r.proof.outsideMaskChangedPixels).toBe(0);
  const center=(310*512+245)*4;expect(r.pixels.slice(center,center+4)).toEqual(raw.data.slice(center,center+4));
 });
});
