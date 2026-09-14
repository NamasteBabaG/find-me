import {describe,it,expect} from 'vitest';
import {ADVENTURE_DENSITY_BOARDS,DENSITY_PATCH_BOARDS} from '../../../../content/adventures/density-boards';
import {ADVENTURE_THREE_BOARDS,THREE_PATCH_BOARDS} from '../../../../content/adventures/three-boards';
import {threeBoardConfig} from '../../../../scripts/lib/adventure-three-config';
import {attachAdventureBook} from '../compose';
import {overlaps} from '../content';
import {cropOf} from '../../scene/local-patch-hides';
import {emptyAdventureProgress,recordAdventureEvent,adventureAlbum,readAdventureProgress} from '../progress';
const fixture=()=>{
 const boards=DENSITY_PATCH_BOARDS,catalog=ADVENTURE_DENSITY_BOARDS;
 const config=threeBoardConfig({gameId:'expanded-test',childName:'TEST',avatarUrl:'/api/assets/test-avatar',patchUrls:Object.fromEntries(boards.flatMap(b=>b.hides.map(h=>[h.id,`/api/assets/${h.id}`]))),composedAt:'2026-09-14T12:00:00.000Z',fixture:true,boards,catalog});
 return attachAdventureBook(config,catalog,boards.map(b=>b.board));
};
describe('approved density-v3 nine-board game',()=>{
 it('compiles 27 serial hides and 54 optional discoveries with a bounded nine-node map',()=>{
  const config=fixture();expect(config.scenes).toHaveLength(9);expect(config.adventure!.boards.flatMap(b=>b.discoveries)).toHaveLength(54);
  for(const b of config.scenes){expect(b.appearancesPerBoard).toBe(3);expect(b.targets).toHaveLength(3);expect(b.findsRequiredToAdvance).toBe(3);}
  const nodes=config.worlds![0]!.nodes;expect(new Set(nodes.map(n=>`${n.x},${n.y}`)).size).toBe(9);
  for(const n of nodes){expect(n.x).toBeGreaterThan(0);expect(n.x).toBeLessThan(1);expect(n.y).toBeGreaterThan(0);expect(n.y).toBeLessThan(1);}
 });
 it('keeps all item-card pixels outside every personal return patch',()=>{
  for(const b of ADVENTURE_DENSITY_BOARDS.boards){if(b.status!=='ready')throw Error('not ready');expect([b.art.width,b.art.height]).toEqual([3840,2160]);expect(b.discoveries.map(d=>d.rarity)).toEqual(['common','common','common','rare','rare','epic']);
   const p=DENSITY_PATCH_BOARDS.find(p=>p.board===b.boardSlug)!;
   for(const hide of p.hides){const c=cropOf(hide),r={x:c.left/3840,y:c.top/2160,w:c.width/3840,h:c.height/2160};expect(b.personalZones).toContainEqual(r);for(const d of b.discoveries)expect(overlaps(r,d.cardCrop)).toBe(false);}
  }
 });
 it('does not mutate the family-tested three-board catalog',()=>{
  expect(THREE_PATCH_BOARDS).toHaveLength(3);expect(THREE_PATCH_BOARDS[1]!.hides[1]!.placement!.standingHeightPx).toBe(300);
  expect(ADVENTURE_THREE_BOARDS.boards.map(b=>b.status==='ready'&&b.sceneVersion)).toEqual([9,9,9]);
  expect(DENSITY_PATCH_BOARDS[1]!.hides[1]!.placement!.standingHeightPx).toBe(440);
 });
 it('collects every board once, awards nine postcards and survives reload without duplicates',()=>{
  const config=fixture(),book=config.adventure!;let progress=emptyAdventureProgress(config.gameId,book);
  for(const b of book.boards){
   for(const targetId of b.targetIds)progress=recordAdventureEvent(progress,config.gameId,book,{kind:'target-found',boardSlug:b.boardSlug,targetId,variant:'A'}).progress;
   for(const d of b.discoveries){const event={kind:'discovery-found' as const,boardSlug:b.boardSlug,discoveryId:d.id};progress=recordAdventureEvent(progress,config.gameId,book,event).progress;expect(recordAdventureEvent(progress,config.gameId,book,event).changed).toBe(false);}
  }
  progress=readAdventureProgress(JSON.parse(JSON.stringify(progress)),config.gameId,book);
  const album=adventureAlbum(progress);expect(album.stars.found).toBe(27);expect(album.discoveries).toEqual({collected:54,total:54});expect(album.postcards.collected).toBe(9);expect(album.allDiscoveries).toBe(true);
 });
});
