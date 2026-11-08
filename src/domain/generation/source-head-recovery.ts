import { createHash } from 'node:crypto';
import { z } from 'zod';
import { SOURCE_HEAD_RECOVERY_AUTHORITIES } from '../../../content/adventures/source-head-recovery-v1';
import type { AuthoredLocalPatchReturnContract, PatchRectangle } from '../scene/local-patch-return-region';

export const SOURCE_HEAD_RECOVERY_VERSION = 'source-head-recovery/v1' as const;
export const SOURCE_HEAD_RECOVERY_ACTION = 'generation:source-head-recovery/v1';
export type SourceHeadAuthority = typeof SOURCE_HEAD_RECOVERY_AUTHORITIES[number];
export const sourceHeadHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const same = (a: unknown, b: unknown) => sourceHeadHash(a) === sourceHeadHash(b);
export function assertSourceHeadAuthority(a: SourceHeadAuthority) {
  if (!SOURCE_HEAD_RECOVERY_AUTHORITIES.some(p => same(p,a))) throw Error('SOURCE_HEAD: unknown public permission');
}
export function sourceHeadAuthorityFor(parent: AuthoredLocalPatchReturnContract): SourceHeadAuthority | null {
  const a = SOURCE_HEAD_RECOVERY_AUTHORITIES.find(a => a.hideId === parent?.hideId);
  return a && parent.contentVersion === a.sceneVersion && parent.boardId === a.boardId && same(parent.source,a.source)
    && same(parent.crop,a.crop) && same(parent.child,a.child) && same(parent.local,a.returned)
    && parent.sourcePlacement?.basePlacementSha256 === a.basePlacementSha256 ? a : null;
}
/** Legacy scene12 keeps its implicit v3 return and its absence of a v4 paid
 * receipt. Its already-pinned source placement can still authorize this NEW
 * finite strategy, without rewriting the old painting/question contracts. */
type SourceHeadPlacement={boardId:string;hideId:string;sceneVersion:number;source:{art:string;sha256:string;width:number;height:number};
  basePlacementSha256:string;effective:{crop:PatchRectangle;child:PatchRectangle;returnRect:PatchRectangle}};
export function sourceHeadAuthorityForPlacement(entry:SourceHeadPlacement|null|undefined):SourceHeadAuthority|null{
  const a=SOURCE_HEAD_RECOVERY_AUTHORITIES.find(a=>a.hideId===entry?.hideId);
  return a&&entry?.sceneVersion===a.sceneVersion&&entry.boardId===a.boardId&&same(entry.source,a.source)
    &&entry.basePlacementSha256===a.basePlacementSha256&&same(entry.effective.crop,a.crop)
    &&same(entry.effective.child,a.child)&&same(entry.effective.returnRect,a.returned)?a:null;
}
type Point = readonly [number,number];
export function pointInSourceHeadPolygon(p: readonly Point[], x: number, y: number) {
  let inside = false;
  for (let i=0,j=p.length-1;i<p.length;j=i++) {
    const a=p[i]!,b=p[j]!;
    if ((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}
const within = (r:{left:number;top:number;width:number;height:number},x:number,y:number) =>
  x>=r.left && x<r.left+r.width && y>=r.top && y<r.top+r.height;
export function sourceHeadAlpha(a: SourceHeadAuthority) {
  assertSourceHeadAuthority(a);
  const alpha = new Uint8Array(512*768);
  for (let y=0;y<768;y++) for (let x=0;x<512;x++) {
    const editable = pointInSourceHeadPolygon(a.editableHead,x+.5,y+.5) && y<a.protectedBelow
      && !a.protectedHeads.some(p => pointInSourceHeadPolygon(p,x+.5,y+.5))
      && !a.protectedRects.some(r => within(r,x,y));
    if (editable) {
      if (x<a.returned.left+12 || y<a.returned.top+12 || x>=a.returned.left+a.returned.width-12
        || y>=a.returned.top+a.returned.height-12) throw Error('SOURCE_HEAD: edit leaves unchanged return interior');
      alpha[y*512+x]=255;
    }
  }
  for (let y=0;y<768;y++) for (let x=0;x<512;x++)
    if (pointInSourceHeadPolygon(a.sourceHeadCore,x+.5,y+.5) && !alpha[y*512+x])
      throw Error('SOURCE_HEAD: original target hair or face remains outside the mask');
  return alpha;
}
export type SourceHeadPixels = { data: Uint8Array; width:number; height:number; channels:number };
/** New paid head pixels only, at native axes. No past head is moved/resized and
 * no face is pasted from another appearance. All source body/props stay exact. */
export function composeSourceHead(a: SourceHeadAuthority, scene: SourceHeadPixels, raw: SourceHeadPixels) {
  assertSourceHeadAuthority(a);
  if (![scene,raw].every(p=>p.width===512&&p.height===768&&p.channels===4&&p.data.length===512*768*4))
    throw Error('SOURCE_HEAD: native aligned RGBA required');
  const alpha=sourceHeadAlpha(a),points:{x:number;y:number}[]=[],pixels=new Uint8Array(scene.data);
  for(let y=0;y<768;y++)for(let x=0;x<512;x++)if(alpha[y*512+x]){
    const i=(y*512+x)*4;for(let c=0;c<4;c++)pixels[i+c]=raw.data[i+c]!;
    if ([[-12,0],[12,0],[0,-12],[0,12]].some(([dx,dy])=>!alpha[(y+dy!)*512+x+dx!])) points.push({x,y});
  }
  const score=(dx:number,dy:number)=>{
    let sum=0,n=0;
    for(const p of points){const x=p.x+dx,y=p.y+dy;if(x<0||y<0||x>=512||y>=768)continue;
      const i=(p.y*512+p.x)*4,j=(y*512+x)*4;for(let c=0;c<3;c++)sum+=Math.abs(scene.data[i+c]!-raw.data[j+c]!)/3;n++;}
    return n?sum/n:Infinity;
  };
  const zero=score(0,0);let best={dx:0,dy:0,score:zero};
  for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const s=score(dx,dy);
    if(s<best.score-1.5 || s<best.score-1e-9&&Math.hypot(dx,dy)<Math.hypot(best.dx,best.dy))best={dx,dy,score:s};}
  if(best.score>zero-1.5)best={dx:0,dy:0,score:zero};
  if(!Number.isFinite(zero)||zero>24||best.dx||best.dy)throw Error('SOURCE_HEAD: new head boundary exceeds unchanged seam/alignment limits');
  return {pixels,proof:{version:SOURCE_HEAD_RECOVERY_VERSION,maskSha256:sourceHeadHash([...alpha]),
    joinPoints:points.length,borderMeanDiff:zero,shift:{dx:best.dx,dy:best.dy},outsideMaskChangedPixels:0 as const,
    sourceBodyChangedPixels:0 as const,protectedHeadChangedPixels:0 as const}};
}
const digest=z.string().regex(/^[a-f0-9]{64}$/),key=z.string().regex(/^[A-Za-z0-9_:.-]{1,240}$/);
export const sourceHeadMarkerSchema=z.object({version:z.literal(SOURCE_HEAD_RECOVERY_VERSION),authorizationSha256:digest,
  authoritySha256:digest,rowId:key,hideId:key,originalAttempts:z.literal(3),authorizedAttempt:z.literal(4),
  previousJudgeSha256:digest,requestKey:key}).strict();
export type SourceHeadMarker=z.infer<typeof sourceHeadMarkerSchema>;
export function sourceHeadMarker(row:{judgeJson:string|null}) {
  try{const p=sourceHeadMarkerSchema.safeParse(JSON.parse(row.judgeJson??'null')?.sourceHeadRecovery);return p.success?p.data:null;}catch{return null;}
}
export function sourceHeadPaintDirection(a:SourceHeadAuthority,ageYears:number){
  assertSourceHeadAuthority(a);if(ageYears!==a.ageYears)throw Error('SOURCE_HEAD: stated child age must match this public source-body permission');
  return `SOURCE HEAD RECOVERY ${SOURCE_HEAD_RECOVERY_VERSION}. FIRST image is the unchanged ORIGINAL512x768 source crop. `
    +`Replace ONLY the complete head, hair, hairline, face and neck of the FRONT blonde lavender-apron cupcake decorator with the exact canonical child's face and hair at stated age${ageYears}. `
    +'The opaque native alpha mask defines the only permitted edit. The blue-apron boy behind/right and the left tray decorator are DIFFERENT original people: preserve their complete faces, hair, necks and bodies exactly. '
    +'Keep the original target apron, shoulders, arms, decorating hands, spoon, counter, cupcakes and all other people at their source coordinates. Do not copy a head from another scene, move a body, draw a second child or restyle the background. '
    +'Keep the original target head angle and neck join, looking down toward the decorating task with a natural task-focused expression; do not turn it into a front-facing portrait. The source body and its existing hand action are fixed, not a request to redraw a historical body or gesture plan. '
    +'PHOTO and CANONICAL define identity, facial geometry, hair pattern/length and age only. Source people define painted contour weight, local contrast, softness and lighting at the native scale. Draw the whole new canonical hairstyle inside the permitted head area without clipped/faded hair, a residual blonde ponytail, blur, halo or photographic microdetail. '
    +'Return only the unmarked512x768 original crop. A fresh ordinary MEDIUM review must still establish complete hair/head, face likeness, age, source people, pose, supported body, style, sharpness and every join.';
}
