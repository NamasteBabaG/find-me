import { describe,it,expect } from 'vitest';
import sharp from 'sharp';
import { semanticAlpha } from '../generation/semantic-mask';
import {diffToPatch} from '../generation/patch';
const outline={found:true,reason:'one child',face:{x:.4,y:.2,w:.2,h:.2},polygons:[[{x:.3,y:.1},{x:.7,y:.1},{x:.7,y:.9},{x:.3,y:.9}]]};
describe('semantic mask safety',()=>{
 it('keeps the entire facial interior opaque without inspecting skin/background colours',async()=>{
  const mask=await semanticAlpha(outline,100,100);
  const alpha=await sharp(mask).extractChannel(0).raw().toBuffer();
  expect(alpha[30*100+50]).toBe(255);expect(alpha[30*100+10]).toBe(0);
 });
 it('rejects a face outside the outlined child',async()=>{
  await expect(semanticAlpha({...outline,face:{x:.05,y:.2,w:.1,h:.1}},100,100)).rejects.toThrow(/protected face/);
 });
 it('does not invent a child on uncertainty',async()=>{
  await expect(semanticAlpha({...outline,found:false},100,100)).rejects.toThrow(/confidently/);
 });
 it('rejects out-of-range model coordinates',async()=>{
  await expect(semanticAlpha({...outline,polygons:[[{x:-1,y:0},{x:1,y:0},{x:1,y:1}]]},100,100)).rejects.toThrow();
 });
 it('does not erase skin that is exactly the same colour as the original background',async()=>{
  const crop=await sharp({create:{width:100,height:100,channels:3,background:'#d9af72'}}).png().toBuffer();
  const mask=await semanticAlpha(outline,100,100);
  const patch=await diffToPatch({originalCrop:crop,editedCrop:crop,alphaMask:mask,ctx:{rect:{x:0,y:0,w:100,h:100},childPx:80,windowFactor:4},art:{width:100,height:100},slot:{x:.5,y:.5,scale:.8}});
  const alpha=await sharp(patch.webp).ensureAlpha().extractChannel(3).raw().toBuffer({resolveWithObject:true});
  const x=50-Math.round(patch.geometry.rect.x*100),y=30-Math.round(patch.geometry.rect.y*100);
  expect(alpha.data[y*alpha.info.width+x]).toBe(255);
 });
 it('rejects crossed polygon edges rather than rasterizing ambiguous cutouts',async()=>{
  await expect(semanticAlpha({...outline,polygons:[[{x:.1,y:.1},{x:.8,y:.8},{x:.1,y:.9},{x:.9,y:.1},{x:.9,y:.9}]]},100,100)).rejects.toThrow(/intersecting/);
 });
});
