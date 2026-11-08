import { z } from 'zod';
import { assertSourceHeadAuthority, sourceHeadAlpha, sourceHeadHash, type SourceHeadAuthority, type SourceHeadPixels } from './source-head-recovery';

/** Additive composition policy. The original paid v1 request and v1 composer
 * remain unchanged. An editable hair colour cannot be a source-match sample. */
export const SOURCE_HEAD_JOIN_VERSION = 'source-head-join/v2' as const;
export const SOURCE_HEAD_JOIN_ACTION = 'generation:source-head-join/v2' as const;
const digest=z.string().regex(/^[a-f0-9]{64}$/);
export const sourceHeadJoinMarkerSchema=z.object({version:z.literal(SOURCE_HEAD_JOIN_VERSION),authorizationSha256:digest,
  recoveryAuthorizationSha256:digest,authoritySha256:digest,replayRowInvariantSha256:digest,sourceRequestKey:z.string().max(240),
  sourceFingerprint:z.string().max(500),sourcePayloadSha256:digest}).strict();
export type SourceHeadJoinMarker=z.infer<typeof sourceHeadJoinMarkerSchema>;

/** Keep the exact paid head at native axes and every other pixel from SOURCE.
 * The 24 limit measures the protected EXTERIOR of the editable head, not the
 * hair/face we explicitly requested to replace. No RAW shift is applied:
 * unreturned background movement is reported separately from output geometry.
 * Full head containment, style and neck continuity still need a fresh MEDIUM. */
export function composeSourceHeadProtectedJoin(a:SourceHeadAuthority,scene:SourceHeadPixels,raw:SourceHeadPixels){
  assertSourceHeadAuthority(a);
  if(![scene,raw].every(p=>p.width===512&&p.height===768&&p.channels===4&&p.data.length===512*768*4))
    throw Error('SOURCE_HEAD_JOIN: native aligned RGBA required');
  const alpha=sourceHeadAlpha(a),points:{x:number;y:number}[]=[],pixels=new Uint8Array(scene.data);
  for(let y=0;y<768;y++)for(let x=0;x<512;x++){
    const p=y*512+x;
    if(alpha[p]){for(let c=0;c<4;c++)pixels[p*4+c]=raw.data[p*4+c]!;}
    else if(x>=12&&x<500&&y>=12&&y<756&&[[-12,0],[12,0],[0,-12],[0,12]].some(([dx,dy])=>alpha[(y+dy!)*512+x+dx!]))points.push({x,y});
  }
  const score=(samples:typeof points,dx:number,dy:number)=>{
    let sum=0;for(const p of samples){const i=(p.y*512+p.x)*4,j=((p.y+dy)*512+p.x+dx)*4;
      for(let c=0;c<3;c++)sum+=Math.abs(scene.data[i+c]!-raw.data[j+c]!)/3;}
    return samples.length?sum/samples.length:Infinity;
  };
  // Registration is diagnostic only. Keep its whole search footprint OUTSIDE
  // the intended new hair, so a shift is not rewarded/punished for hair colour.
  const registration=points.filter(p=>{
    for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++)if(alpha[(p.y+dy)*512+p.x+dx])return false;
    return true;
  });
  const zero=score(points,0,0);let observed={dx:0,dy:0,score:score(registration,0,0)};
  for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
    const s=score(registration,dx,dy);if(s<observed.score-1e-9||Math.abs(s-observed.score)<1e-9&&Math.hypot(dx,dy)<Math.hypot(observed.dx,observed.dy))observed={dx,dy,score:s};
  }
  if(!Number.isFinite(zero)||zero>24)throw Error('SOURCE_HEAD_JOIN: protected exterior exceeds unchanged24 limit');
  let outsideChanged=0,headChanged=0;
  for(let i=0;i<alpha.length;i++){
    const expected=alpha[i]?raw.data:scene.data;let changed=false;
    for(let c=0;c<4;c++)if(pixels[i*4+c]!==expected[i*4+c])changed=true;
    if(changed){if(alpha[i])headChanged++;else outsideChanged++;}
  }
  if(outsideChanged||headChanged)throw Error('SOURCE_HEAD_JOIN: native copy or SOURCE preservation changed');
  return {pixels,proof:{version:SOURCE_HEAD_JOIN_VERSION,maskSha256:sourceHeadHash([...alpha]),joinPoints:points.length,
    borderMeanDiff:zero,shift:{dx:0,dy:0},discardedRawBackgroundBestShift:observed,discardedRawBackgroundRegistrationPoints:registration.length,
    outsideMaskChangedPixels:outsideChanged,sourceBodyChangedPixels:outsideChanged,protectedHeadChangedPixels:outsideChanged,
    paidHeadChangedPixels:headChanged}};
}
