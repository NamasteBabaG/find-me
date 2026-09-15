import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { buildDemoConfig } from '../demo';
import assets from '../../../content/demo/beach-v1-assets.json';
import raw from '../../../content/demo/beach-v1-plan.json';
import { ReadyAdventureBoardSchema, contains, overlaps } from '../../domain/adventure/content';
import { gameAssetId } from '../../domain/adventure/image-binding';
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
describe('the current one-board public beach demo',()=>{
 it.each(['he','en'] as const)('ships a source-bound 4K book with 3 serial hides and 6 discoveries (%s)',async locale=>{
  const config=buildDemoConfig(locale),scene=config.scenes[0]!,plan=ReadyAdventureBoardSchema.parse(raw.plan);
  expect(config.scenes).toHaveLength(1);expect(config.worlds).toBeUndefined();
  expect(config.gameId).toBe('demo');expect(scene.targets).toHaveLength(3);
  expect(scene.playMode).toBe('find-any');expect(scene.findsRequiredToAdvance).toBe(3);
  const bytes=readFileSync(`public${scene.art.base}`),m=await sharp(bytes).metadata();
  expect([m.width,m.height]).toEqual([3840,2160]);expect(sha(bytes)).toBe(plan.art.sha256);
  const book=config.adventure!.boards[0]!;
  expect(book.collectionUi).toBe('guided-v1');expect(book.discoveries).toHaveLength(6);
  expect(book.discoveries.map(d=>d.rarity)).toEqual(['common','common','common','rare','rare','epic']);
  for(const t of scene.targets){
   if(t.sprite.kind!=='image'||!t.sprite.rect||!t.sprite.hitRect)throw new Error('A reviewed real patch is required');
   expect(gameAssetId(t.sprite.url)).toBeTruthy();
   expect(t.sprite.url).toBe(`/demo/beach-v1/${sha(readFileSync(`public${t.sprite.url}`))}.webp`);
   expect(plan.personalZones.some(z=>contains(z,t.sprite.kind==='image'?t.sprite.rect!:z))).toBe(true);
   for(const d of plan.discoveries)expect(overlaps(d.cardCrop,t.sprite.rect)).toBe(false);
  }
  expect(config.adventure!.avatarAssetId).toBe(gameAssetId(config.child.avatarUrl));
 });
 it('preserves the original public example photo and isolates request names',()=>{
  expect(sha(readFileSync(`public${assets.photo}`))).toBe(assets.photoSha256);
  const a=buildDemoConfig('en','beach','Example');a.scenes[0]!.targets.splice(0);
  const b=buildDemoConfig('en');expect(b.child.name).toBe('Anna');expect(b.scenes[0]!.targets).toHaveLength(3);
 });
 it('accepts only content-addressed demo bindings, not arbitrary public or remote assets',()=>{
  const h='a'.repeat(64);
  expect(gameAssetId(`/demo/beach-v1/${h}.webp`)).toBe(`demo-beach-v1-${h}`);
  for(const url of ['/demo/beach-v1/avatar.webp',`https://example.com/demo/beach-v1/${h}.webp`,`/demo/beach-v1/${h}.webp?replace=1`,'/demo/example-photo.jpg'])expect(gameAssetId(url)).toBeNull();
  expect(gameAssetId('/api/assets/safe-id?token=opaque')).toBe('safe-id');
 });
});
