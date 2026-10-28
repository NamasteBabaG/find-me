import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {describe,it,expect} from 'vitest';
import native from './authoring-v1.json';
import {KINGDOM_DETECTIVE_SOURCE_BOARDS as sources} from './source-release';
import {KINGDOM_DETECTIVE_PATCH_BOARDS as boards,KINGDOM_DETECTIVE_ADVENTURE_CATALOG as album,KINGDOM_DETECTIVE_SOURCE_NEIGHBORS as neighbors} from './runtime-release';
import {assertDetectiveSourcePlacementReleaseHash,KINGDOM_DETECTIVE_SOURCE_PLACEMENT_RELEASE as release,KINGDOM_DETECTIVE_SOURCE_PLACEMENT_BASE as base} from './source-placement-release';
import {assertDetectiveSourcePlacementReleaseHash as assertJourney,DETECTIVE_SOURCE_PLACEMENT_RELEASE_SHA256 as journeyHash} from '../source-placement-release';
import {DETECTIVE_PATCH_BOARDS as journey} from '../runtime-release';
import {detectiveFamilyForBoard,detectiveFamilyForWorld} from '../families';
import {findScene} from '../../scenes';
import {validateDetectiveSourcePlacementRelease} from '../../../src/domain/scene/source-placement-release';
import {cropOf,maskForHide,assertPlaceable} from '../../../src/domain/scene/local-patch-hides';
import {localPatchReturnRegion,sourceHeadIntersectsReturnBoundary} from '../../../src/domain/scene/local-patch-return-region';
import {buildBoardWizardIdentityStyle} from '../../../src/services/generation/board-wizard-identity-style';
import {identityStyleCatalogSha256} from '../../../src/services/generation/local-patch-identity-catalog';

describe('approved Kingdom Detective family',()=>{
  it('freezes the exact nine art versions, native provenance and complete content',()=>{
    expect(native.boards.map(b=>[b.board,b.artVersion])).toEqual([
      ['castlegate',3],['fairyforest',11],['dragoncave',8],['icepalace',3],['underwater',5],['cloudcity',6],['sweetworkshop',3],['giantlibrary',18],['nightcarnival',2]]);
    expect(native.transform).toEqual({scaleX:2,scaleY:2,kernel:'lanczos3',native4k:false});
    expect(boards).toHaveLength(9);expect(boards.flatMap(b=>b.hides)).toHaveLength(27);
    expect(album.boards.flatMap(b=>b.status==='ready'?b.discoveries:[])).toHaveLength(54);
    expect(new Set(album.boards.flatMap(b=>b.status==='ready'?b.discoveries.map(d=>d.id):[])).size).toBe(54);
    expect(()=>assertDetectiveSourcePlacementReleaseHash()).not.toThrow();
    expect(()=>assertJourney()).not.toThrow();expect(journey).toHaveLength(9);
    expect(journeyHash).toBe('f3bc050a8b258050da9a91982cf3de6709e80069eae40582123fafb63c2d8027');
  });
  it.each(sources)('ships only the frozen child-free $board raster, with its declared actual dimensions',async s=>{
    const bytes=await readFile(s.path),m=await sharp(bytes).metadata();
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(s.sha256);
    expect(m).toMatchObject({format:'webp',width:3344,height:1882});expect(bytes.length).toBeLessThan(20*1024*1024);
    const n=native.boards.find(b=>b.board===s.board)!;expect(s.width).toBe(n.nativeWidth*2);expect(s.height).toBe(n.nativeHeight*2);
    expect(s.path).toBe(`public/scenes/kingdom-${s.board}-detectives-v1/base.webp`);
    const scene=findScene(s.board,13)!;expect(scene.art.base).toBe('/'+s.path.slice(7));expect(scene.targets).toHaveLength(3);
    expect(findScene(s.board,12)?.art.base).not.toBe(scene.art.base);assertPlaceable(s.definition,s);
  });
  it('keeps every listed source head inside the opaque return or completely outside it',()=>{
    expect(neighbors).toHaveLength(27);
    for(const b of boards) for(const h of b.hides){
      const entry=neighbors.find(n=>n.hideId===h.id)!,region=localPatchReturnRegion(cropOf(h),maskForHide(h),h.returnRect).region;
      expect(entry.neighbors.some(n=>n.sourceId==='source-child')).toBe(true);
      for(const n of entry.neighbors) expect(sourceHeadIntersectsReturnBoundary(region,n.head),h.id+'/'+n.sourceId).toBe(false);
      const raw=native.boards.find(n=>n.board===b.board)!.roles.find(r=>r.id===h.id)!;
      expect(raw.head[0]).toBeGreaterThanOrEqual(raw.box[0]!);expect(raw.head[1]).toBeGreaterThanOrEqual(raw.box[1]!);
      expect(raw.head[0]!+raw.head[2]!).toBeLessThanOrEqual(raw.box[0]!+raw.box[2]!);
      expect(raw.head[1]!+raw.head[3]!).toBeLessThanOrEqual(raw.box[1]!+raw.box[3]!);
    }
    expect(()=>validateDetectiveSourcePlacementRelease(release,base)).toThrow('explicitly selected release');
    expect(()=>validateDetectiveSourcePlacementRelease(release,base,'kingdom-detectives/v1')).not.toThrow();
  });
  it('selects a separate nine-source atlas and rejects an unknown world or board',async()=>{
    const f=detectiveFamilyForWorld('kingdom');expect(f.boards).toBe(boards);
    expect(detectiveFamilyForBoard('giantlibrary')).toBe(f);expect(()=>detectiveFamilyForWorld('unknown')).toThrow();
    expect(()=>detectiveFamilyForBoard('newyork-explorer')).toThrow();
    const atlas=await buildBoardWizardIdentityStyle(undefined,'board-matched-identity/v6','kingdom',undefined,{sceneVersion:13});
    expect(atlas.examples.map(e=>e.boardId)).toEqual(sources.map(s=>s.board));
    expect(atlas.catalogSha256).toBe(await identityStyleCatalogSha256('castlegate',13));
    expect(atlas.catalogSha256).not.toBe(await identityStyleCatalogSha256('newyork',13));
  },30000);
});
