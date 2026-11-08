import { describe, expect, it } from 'vitest';
import { SOURCE_HEAD_RECOVERY_AUTHORITIES } from '../../../../content/adventures/source-head-recovery-v1';
import { SOURCE_PLACEMENT_RELEASE } from '../../../../content/adventures/source-placement-release';
import { authoredLocalPatchReturnContract } from '../../scene/local-patch-return-region';
import { assertSourceHeadAuthority, sourceHeadAuthorityFor, sourceHeadAuthorityForPlacement, sourceHeadAlpha, pointInSourceHeadPolygon,
  composeSourceHead, sourceHeadPaintDirection, sourceHeadMarker, sourceHeadMarkerSchema, type SourceHeadAuthority, type SourceHeadPixels } from '../source-head-recovery';

const a=SOURCE_HEAD_RECOVERY_AUTHORITIES[0],publicParent=SOURCE_PLACEMENT_RELEASE.inventory.find(p=>p.hideId===a.hideId)!;
const parent=authoredLocalPatchReturnContract({contentVersion:12,boardId:a.boardId,hideId:a.hideId,source:a.source,
  crop:a.crop,child:a.child,authored:a.returned,sourcePlacement:{manifestSha256:'a'.repeat(64),basePlacementSha256:a.basePlacementSha256}});
function fixture(){
  const data=new Uint8Array(512*768*4);for(let i=0;i<data.length;i+=4){data[i]=72;data[i+1]=101;data[i+2]=130;data[i+3]=255;}
  const scene:SourceHeadPixels={data,width:512,height:768,channels:4},raw={...scene,data:new Uint8Array(data)};
  // Only a new, synthetic central face differs. Its surrounding public ring
  // remains identical, while unrelated paid context is deliberately corrupted.
  for(let y=280;y<360;y++)for(let x=220;x<285;x++){const i=(y*512+x)*4;raw.data[i]=180;raw.data[i+1]=80;raw.data[i+2]=50;}
  for(let y=510;y<570;y++)for(let x=150;x<350;x++){const i=(y*512+x)*4;raw.data[i]=255;raw.data[i+1]=0;raw.data[i+2]=255;}
  return {scene,raw};
}
describe('finite public source-head recovery',()=>{
  it('binds the real immutable Explorer source and original placement without modifying either',()=>{
    expect(publicParent.sceneVersion).toBe(12);expect(publicParent.source).toEqual(a.source);
    expect(publicParent.basePlacementSha256).toBe(a.basePlacementSha256);
    expect(publicParent.base).toEqual({crop:a.crop,child:a.child,returnRect:a.returned});
    expect(sourceHeadAuthorityFor(parent)).toEqual(a);
    expect(sourceHeadAuthorityForPlacement(publicParent)).toEqual(a);
    expect(sourceHeadAuthorityForPlacement({...publicParent,effective:{...publicParent.effective,returnRect:{...publicParent.effective.returnRect,width:publicParent.effective.returnRect.width-1}}})).toBeNull();
    for(const wrong of [{...parent,contentVersion:13 as const},{...parent,hideId:'different-hide'},
      {...parent,crop:{...parent.crop,left:parent.crop.left+1}},
      {...parent,source:{...parent.source,sha256:'f'.repeat(64)}},
      {...parent,sourcePlacement:{...parent.sourcePlacement!,basePlacementSha256:'f'.repeat(64)}}])
      expect(sourceHeadAuthorityFor(wrong)).toBeNull();
  });
  it('opens the complete original target hair/face silhouette and keeps every registered other head, hands and counter closed',()=>{
    const alpha=sourceHeadAlpha(a);expect(alpha.some(v=>v===255)).toBe(true);
    let erased=0,missingTargetPixels=0,editedProtectedPixels=0;
    for(let y=0;y<768;y++)for(let x=0;x<512;x++){
      if(pointInSourceHeadPolygon(a.sourceHeadCore,x+.5,y+.5)){if(alpha[y*512+x]!==255)missingTargetPixels++;erased++;}
      if((y>=a.protectedBelow||a.protectedHeads.some(p=>pointInSourceHeadPolygon(p,x+.5,y+.5)))&&alpha[y*512+x]!==0)editedProtectedPixels++;
    }
    expect(erased).toBeGreaterThan(15000);expect(missingTargetPixels).toBe(0);expect(editedProtectedPixels).toBe(0);
    expect(alpha[490*512+190]).toBe(0);expect(alpha[540*512+320]).toBe(0);
  });
  it('keeps the full original source body/props instead of copying the painter’s remodeled counter',()=>{
    const {scene,raw}=fixture(),sceneBefore=new Uint8Array(scene.data),rawBefore=new Uint8Array(raw.data);
    const result=composeSourceHead(a,scene,raw),alpha=sourceHeadAlpha(a);let different=0,wrongPixels=0;
    for(let i=0;i<alpha.length;i++)for(let c=0;c<4;c++){
      if(result.pixels[i*4+c] !== (alpha[i]?raw.data[i*4+c]:scene.data[i*4+c]))wrongPixels++;
      if(result.pixels[i*4+c]!==scene.data[i*4+c])different++;
    }
    expect(different).toBeGreaterThan(0);expect(wrongPixels).toBe(0);expect(scene.data).toEqual(sceneBefore);expect(raw.data).toEqual(rawBefore);
    expect(result.proof).toMatchObject({outsideMaskChangedPixels:0,sourceBodyChangedPixels:0,protectedHeadChangedPixels:0,shift:{dx:0,dy:0},borderMeanDiff:0});
    const i=(530*512+180)*4;expect(result.pixels.slice(i,i+4)).toEqual(scene.data.slice(i,i+4));
    expect(result.pixels.slice(i,i+4)).not.toEqual(raw.data.slice(i,i+4));
  });
  it('refuses a changed native head boundary before admitting an ordinary review',()=>{
    const {scene,raw}=fixture();raw.data.fill(255);
    expect(()=>composeSourceHead(a,scene,raw)).toThrow('unchanged seam/alignment limits');
  });
  it('refuses invented masks and non-native or shifted raster frames',()=>{
    const f=fixture(),forged={...a,protectedBelow:600} as unknown as SourceHeadAuthority;
    expect(()=>assertSourceHeadAuthority(forged)).toThrow('unknown public permission');
    expect(()=>composeSourceHead(a,f.scene,{...f.raw,width:511})).toThrow('native aligned RGBA');
  });
  it('requires one distinct fourth key with immutable ancestry and never claims artistic approval',()=>{
    const m={version:'source-head-recovery/v1',authorizationSha256:'a'.repeat(64),authoritySha256:'b'.repeat(64),
      rowId:'synthetic-row',hideId:a.hideId,originalAttempts:3,authorizedAttempt:4,previousJudgeSha256:'c'.repeat(64),requestKey:a.hideId+':peeking:render:4'};
    expect(sourceHeadMarker({judgeJson:JSON.stringify({sourceHeadRecovery:m})})).toEqual(m);
    expect(sourceHeadMarkerSchema.safeParse({...m,originalAttempts:0}).success).toBe(false);
    expect(sourceHeadMarkerSchema.safeParse({...m,authorizedAttempt:5}).success).toBe(false);
    const prompt=sourceHeadPaintDirection(a,7);expect(prompt).toContain('SOURCE HEAD RECOVERY');
    expect(prompt).toContain('FRONT blonde lavender-apron cupcake decorator');expect(prompt).toContain('DIFFERENT original people');
    expect(prompt).toContain('fresh ordinary MEDIUM');expect(()=>sourceHeadPaintDirection(a,0)).toThrow('stated child age');
  });
});
