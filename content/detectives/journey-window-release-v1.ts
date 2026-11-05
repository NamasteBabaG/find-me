import { sourcePlacementSha256 } from '../../src/domain/scene/source-placement-release';
import { sourceBodyManifestSchema } from '../../src/domain/scene/source-body-repair';
import { SOURCE_BODY_REPAIR_MANIFEST } from './source-body-repair';
import { DETECTIVE_PROP_JOIN } from './prop-joins';
import { propJoinContractSchema } from '../../src/domain/generation/prop-join';
import { DETECTIVE_SOURCE_PLACEMENT_RELEASE } from './source-placement-release';
import { authoredLocalPatchReturnContract,localPatchReturnRegion } from '../../src/domain/scene/local-patch-return-region';
import { validateSourceBodyGeometry } from '../../src/domain/scene/source-body-repair';
import { prepareSourceNeighborContract } from '../../src/domain/scene/local-patch-source-neighbors';
const immutable=<T>(v:T):T=>{if(v&&typeof v==='object'){for(const child of Object.values(v))immutable(child);Object.freeze(v);}return v;};

/** Prospective public authoring companion. The frozen scene13/source releases
 * remain its parent, never edited in place. Envelope size is not child scale:
 * pose, standing height, support, identity and all quality checks stay required. */
export const JOURNEY_WINDOW_RELEASE = 'journey-window-release/v1' as const;
export const JOURNEY_WINDOW_MANIFEST = immutable({
  version: JOURNEY_WINDOW_RELEASE,
  parentManifestSha256: SOURCE_BODY_REPAIR_MANIFEST.parentManifestSha256,
  entries: [
    { hideId: 'paris-detectives-hide-2', parent: { left:193,top:133,width:242,height:594 }, returned:{ left:193,top:85,width:242,height:642 }, behind:'a man\'s shoe and bicycle wheel' },
    { hideId: 'newyork-detectives-hide-2', parent: { left:130,top:280,width:290,height:340 }, returned:{ left:130,top:249,width:290,height:371 }, behind:'bench readers\' jeans and knees' },
    { hideId: 'giza-detectives-hide-2', parent: { left:118,top:208,width:232,height:390 }, returned:{ left:118,top:150,width:232,height:448 }, behind:'a standing man\'s jeans',
      wardrobeReplacement:{from:'for listening to the drum',to:'for playing with the wooden hoop'} },
  ],
} as const);
export const JOURNEY_WINDOW_MANIFEST_SHA256 = sourcePlacementSha256(JOURNEY_WINDOW_MANIFEST);
/** The target head/body still open wholly; no neighbouring head or protected
 * prop opens. Existing body and historical repair grants keep their old hash. */
export const JOURNEY_WINDOW_BODY_MANIFEST = immutable(sourceBodyManifestSchema.parse({ ...SOURCE_BODY_REPAIR_MANIFEST,
  entries: structuredClone(SOURCE_BODY_REPAIR_MANIFEST.entries).map(g=>g.hideId==='giza-detectives-hide-2' ? { ...g,
    returnRect:JOURNEY_WINDOW_MANIFEST.entries[2].returned,
    editableRects:[...g.editableRects,{left:130,top:162,width:196,height:164}],
  }:g),
}));
export const JOURNEY_WINDOW_BODY_SHA256 = sourcePlacementSha256(JOURNEY_WINDOW_BODY_MANIFEST);
/** Same scooter anchor and protected upper pixels; only its exact return binding
 * changes. Its correction remains a candidate requiring ordinary fresh review. */
export const JOURNEY_WINDOW_PROP_JOIN=immutable(propJoinContractSchema.parse({...DETECTIVE_PROP_JOIN,returned:JOURNEY_WINDOW_MANIFEST.entries[0].returned}));

/** The scene validator also validates the prospective companion, not just its
 * historical parent. Never infer foreground or body permission from a model. */
export function assertJourneyWindowRelease(){
  const same=(a:unknown,b:unknown)=>sourcePlacementSha256(a)===sourcePlacementSha256(b);
  if(sourcePlacementSha256(JOURNEY_WINDOW_MANIFEST)!==JOURNEY_WINDOW_MANIFEST_SHA256
    ||sourcePlacementSha256(JOURNEY_WINDOW_BODY_MANIFEST)!==JOURNEY_WINDOW_BODY_SHA256
    ||!same(JOURNEY_WINDOW_PROP_JOIN,{...DETECTIVE_PROP_JOIN,returned:JOURNEY_WINDOW_MANIFEST.entries[0].returned}))throw Error('JOURNEY_WINDOWS: authoring digest changed');
  if(new Set(JOURNEY_WINDOW_MANIFEST.entries.map(e=>e.hideId)).size!==3)throw Error('JOURNEY_WINDOWS: exact three unique windows required');
  for(const g of JOURNEY_WINDOW_BODY_MANIFEST.entries){const entry=DETECTIVE_SOURCE_PLACEMENT_RELEASE.inventory.find(e=>e.hideId===g.hideId)!;
    const parent=authoredLocalPatchReturnContract({contentVersion:13,boardId:entry.boardId,hideId:entry.hideId,source:entry.source,
      crop:entry.effective.crop,child:entry.effective.child,authored:entry.effective.returnRect,
      sourcePlacement:{manifestSha256:JOURNEY_WINDOW_MANIFEST.parentManifestSha256,basePlacementSha256:entry.basePlacementSha256}});
    validateSourceBodyGeometry(g,parent,entry.sourceNeighbors!.contract.neighbors);
  }
  for(const change of JOURNEY_WINDOW_MANIFEST.entries){const entry=DETECTIVE_SOURCE_PLACEMENT_RELEASE.inventory.find(e=>e.hideId===change.hideId)!;
    const parent=SOURCE_BODY_REPAIR_MANIFEST.entries.find(e=>e.hideId===change.hideId)?.returnRect??entry.effective.returnRect,r=change.returned;
    if(!same(parent,change.parent)||r.left!==parent.left||r.width!==parent.width||r.top+r.height!==parent.top+parent.height||r.top>=parent.top||parent.top-r.top>64)
      throw Error('JOURNEY_WINDOWS: only the classified top strip can open');
    localPatchReturnRegion(entry.effective.crop,entry.effective.child,r);
    const context={boardId:entry.boardId,hideId:entry.hideId,source:entry.source,crop:entry.effective.crop,returnRect:r};
    if(!prepareSourceNeighborContract({...entry.sourceNeighbors!.contract,...context},context).ok)throw Error('JOURNEY_WINDOWS: original head crosses boundary');
  }
  return {version:JOURNEY_WINDOW_RELEASE,hides:27,changedWindows:3};
}
