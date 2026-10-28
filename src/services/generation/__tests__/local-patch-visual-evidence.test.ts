import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {it,expect} from 'vitest';
import {boundedVisualEvidencePng} from '../local-patch-visual-evidence';
it('retains accepted evidence bytes exactly',async()=>{
  const png=await sharp({create:{width:128,height:128,channels:4,background:'#123456'}}).png().toBuffer();
  expect(await boundedVisualEvidencePng(png)).toBe(png);
});
it('admits the rich native Kingdom context without changing any pixel, alpha or dimension',async()=>{
  const source=await readFile('public/scenes/kingdom-underwater-detectives-v1/base.webp');
  const original=await sharp(source).extract({left:1124,top:416,width:1280,height:1466}).png().toBuffer();
  expect(original.length).toBeGreaterThan(5*1024*1024);
  const packed=await boundedVisualEvidencePng(original);expect(packed.length).toBeLessThanOrEqual(5*1024*1024);
  expect(await sharp(packed).metadata()).toMatchObject({width:1280,height:1466,format:'png'});
  expect((await sharp(packed).ensureAlpha().raw().toBuffer()).equals(await sharp(original).ensureAlpha().raw().toBuffer())).toBe(true);
},20000);
