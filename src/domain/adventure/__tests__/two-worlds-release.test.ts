import {describe,it,expect} from 'vitest';
import {TWO_WORLD_RELEASE_BOARDS,TWO_WORLD_RELEASE_CATALOG,TWO_WORLD_RELEASE_ROUTES,TWO_WORLD_WORLD_ART,TWO_WORLD_VISUAL_HOLDS} from '../../../../content/adventures/two-worlds-release';
import {TWO_WORLD_PATCH_BOARDS} from '../../../../content/adventures/two-worlds-production';
import {twoWorldsConfig} from '../../../../scripts/lib/two-worlds-config';
import {selectReviewedInventory} from '../../../../scripts/lib/two-worlds-reviewed';
import {assertPlaceable,cropOf} from '../../scene/local-patch-hides';
import {overlaps} from '../content';
import {attachAdventureBook} from '../compose';
import {emptyAdventureProgress,recordAdventureEvent,adventureAlbum} from '../progress';
import {projectPassport} from '../../passport/passport';
describe('two-world reviewed authoring release',()=>{
 it('contains exactly nine unique routes per world, 54 hides and 108 discoveries',()=>{
  expect(TWO_WORLD_RELEASE_BOARDS).toHaveLength(18);
  expect(new Set(TWO_WORLD_RELEASE_ROUTES.map(r=>r.slug)).size).toBe(18);
  for(const w of TWO_WORLD_WORLD_ART)expect(TWO_WORLD_RELEASE_CATALOG.boards.filter(b=>b.worldSlug===w.slug)).toHaveLength(9);
  for(const b of TWO_WORLD_RELEASE_BOARDS){expect(b.hides).toHaveLength(3);assertPlaceable(b,{width:3840,height:2160});}
  for(const p of TWO_WORLD_RELEASE_CATALOG.boards){expect(p.status).toBe('ready');if(p.status==='ready'){expect(p.discoveries).toHaveLength(6);expect(p.discoveries.map(d=>d.rarity).sort()).toEqual(['common','common','common','epic','rare','rare']);}}
 });
 it('never places a new discovery card beneath a personal returned crop',()=>{
  for(const b of TWO_WORLD_PATCH_BOARDS){const p=TWO_WORLD_RELEASE_CATALOG.boards.find(p=>p.boardSlug===b.board);if(p?.status!=='ready')throw Error('Missing plan');
   for(const h of b.hides){const c=cropOf(h);for(const d of p.discoveries)expect(overlaps({x:c.left/3840,y:c.top/2160,w:c.width/3840,h:c.height/2160},d.cardCrop),`${b.board}/${d.id}`).toBe(false);}
  }
 });
 it('does not quietly include a human-vetoed board',()=>{
  if(Object.keys(TWO_WORLD_VISUAL_HOLDS).length)expect(()=>selectReviewedInventory()).toThrow('Full release blocked');
  const selected=selectReviewedInventory(true);for(const hold of selected.holds)expect(selected.boards.some(b=>b.board===hold)).toBe(false);
 });
 const input=()=>({gameId:'two-worlds-fixture',childName:'TEST',avatarUrl:'/api/assets/test-avatar',patchUrls:Object.fromEntries(TWO_WORLD_RELEASE_BOARDS.flatMap(b=>b.hides.map(h=>[h.id,`/api/assets/${h.id}`]))),composedAt:'2026-09-19T12:00:00.000Z',fixture:true,boards:TWO_WORLD_RELEASE_BOARDS,catalog:TWO_WORLD_RELEASE_CATALOG});
 it('retains real map coordinates and assembles two independent nine-page passports',()=>{
  const c=attachAdventureBook(twoWorldsConfig(input()),TWO_WORLD_RELEASE_CATALOG,TWO_WORLD_RELEASE_BOARDS.map(b=>b.board));
  expect(c.packageTier).toBe('TWO_WORLDS');expect(c.scenes).toHaveLength(18);
  for(const w of c.worlds!){expect(w.nodes).toHaveLength(9);expect(w.map.artPortrait).toContain('map-sm.webp');expect(w.nodes[0]!.x).toBe(TWO_WORLD_WORLD_ART.find(a=>a.slug===w.slug)!.nodes[0]!.x);}
  const book=c.adventure!;let p=emptyAdventureProgress(c.gameId,book);
  // Start in the second world before finding anything in the first.
  const order=[...book.boards.filter(b=>b.worldSlug==='kingdom'),...book.boards.filter(b=>b.worldSlug==='journey')];
  for(const b of order){for(const targetId of b.targetIds)p=recordAdventureEvent(p,c.gameId,book,{kind:'target-found',boardSlug:b.boardSlug,targetId,variant:'A'}).progress;for(const d of b.discoveries)p=recordAdventureEvent(p,c.gameId,book,{kind:'discovery-found',boardSlug:b.boardSlug,discoveryId:d.id}).progress;}
  expect(adventureAlbum(p)).toMatchObject({stars:{found:54,total:54},discoveries:{collected:108,total:108},postcards:{collected:18}});
  const passport=projectPassport(c,p,{},(slug,_kind,id)=>`/${slug}/${id}`);expect(passport).toHaveLength(2);for(const w of passport){expect(w.pages).toHaveLength(9);expect(w.pages.every(p=>p.state==='complete')).toBe(true);}
 });
 it('requires measured visible-child geometry for real play, not mask estimates',()=>{
  expect(()=>twoWorldsConfig({...input(),fixture:false})).toThrow('Actual child geometry');
 });
});
