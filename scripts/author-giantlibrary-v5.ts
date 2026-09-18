import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import { DiscoverySchema, overlaps } from '../src/domain/adventure/content';
import { chooseFitMode, fitScale, centerOnNormalized, clampTransform, stageToScreen, screenToStage } from '../src/game/engine/viewport-math';

// Measured from approved v5 pixels, not requested generation coordinates.
// Mechanical crops/data only. Does not repaint the approved board.
const source = 'output/imagegen/magic-giantlibrary-v5-face-volume.png';
const out = 'output/imagegen/magic-giantlibrary-v5-authoring';
const W = 3840, H = 2160;
type Px = readonly [number, number, number, number];
const rect = ([x,y,w,h]: Px) => ({ x:x/W, y:y/H, w:w/W, h:h/H });
const targets = [
  { id:'reading-globe', he:'גלובוס', en:'Globe', rarity:'common', difficulty:1,
    hintHe:'חפשו ליד פינת הקריאה הסגולה.', hintEn:'Look beside the purple reading nook.',
    storyHe:'אפשר לצאת למסע מסביב לעולם בלי לצאת מהספרייה.', storyEn:'You can travel around the world without leaving the library.',
    visible:[1170,864,117,111], hit:[1190,883,74,73], crop:[1140,839,171,171] },
  { id:'winged-book', he:'ספר מכונף', en:'Winged book', rarity:'common', difficulty:1,
    hintHe:'הספרנית מבקשת שקט גם ממי שמעופף.', hintEn:'The librarian asks the flying visitor to be quiet too.',
    storyHe:'לסיפור הזה צמחו כנפיים!', storyEn:'This story has grown wings!',
    visible:[2542,750,138,130], hit:[2570,786,70,70], crop:[2520,731,180,180] },
  { id:'owl-cover-book', he:'ספר עם ינשוף', en:'Owl-covered book', rarity:'common', difficulty:1,
    hintHe:'שני קוראים מציצים מעל הכריכה הגדולה.', hintEn:'Two readers are peeking over the big cover.',
    storyHe:'הינשוף שעל הכריכה שומר על הסיפור שבפנים.', storyEn:'The owl on the cover watches over the story inside.',
    visible:[994,1066,201,256], hit:[1020,1100,146,174], crop:[957,1050,284,284] },
  { id:'atlas-magnifier', he:'זכוכית מגדלת', en:'Magnifying glass', rarity:'rare', difficulty:2,
    hintHe:'מישהו רצה לראות את המפה מקרוב.', hintEn:'Someone wanted a closer look at the map.',
    storyHe:'גם פרט קטן במפה יכול להתחיל הרפתקה גדולה.', storyEn:'A tiny detail on a map can begin a big adventure.',
    visible:[1567,1473,196,79], hit:[1594,1487,90,40], crop:[1550,1398,226,226] },
  { id:'golden-shelf-vase', he:'כד זהוב', en:'Golden vase', rarity:'rare', difficulty:2,
    hintHe:'לא רק ספרים מסתתרים בין המדפים.', hintEn:'Books are not the only things tucked between the shelves.',
    storyHe:'לכד הקטן יש מקום של כבוד בספרייה.', storyEn:'The little vase has a special place in the library.',
    visible:[2080,665,73,70], hit:[2095,681,40,40], crop:[2056,641,120,120] },
  { id:'purple-hair-ribbon', he:'סרט סגול לשיער', en:'Purple hair ribbon', rarity:'epic', difficulty:3,
    hintHe:'קוראת בסרבל כחול אספה את השיער כדי שלא יסתיר את הסיפור.', hintEn:'A reader in blue overalls tied back her hair to keep it off the pages.',
    storyHe:'גם סרט קטן יכול להיות מציאה גדולה.', storyEn:'Even a little ribbon can be a great discovery.',
    visible:[2394,1505,50,108], hit:[2405,1528,22,60], crop:[2345,1479,160,160] },
] as const;

async function main(){
  const bytes=await fs.readFile(source);
  const m=await sharp(bytes).metadata(); assert.equal(m.width,W); assert.equal(m.height,H);
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha256,'5e63c03c9272e611e6a0a09ea16fae1d4a30f6c0326bbd3e44cbdfdc9285ee61');
  const discoveries=targets.map(t=>DiscoverySchema.parse({
    id:t.id,name:{he:t.he,en:t.en},hint:{he:t.hintHe,en:t.hintEn},category:'object',
    rarity:t.rarity,difficulty:t.difficulty,
    description:{kind:'story',text:{he:t.storyHe,en:t.storyEn}},
    visibleRect:rect(t.visible),hitRect:rect(t.hit),cardCrop:rect(t.crop),
  }));
  assert.equal(new Set(discoveries.map(d=>d.id)).size,6);
  for(const [i,d] of discoveries.entries()){
    assert(!discoveries.slice(0,i).some(o=>overlaps(d.hitRect,o.hitRect)));
    assert(d.visibleRect.x>=.24 && d.visibleRect.x+d.visibleRect.w<=.76);
    assert(d.visibleRect.y>=.28 && d.visibleRect.y+d.visibleRect.h<=.75);
  }
  assert.deepEqual(['common','rare','epic'].map(r=>discoveries.filter(d=>d.rarity===r).length),[3,2,1]);
  // Analytical camera reachability only: not a rendered HUD/browser test.
  let cameraChecks=0;
  const stage={width:W,height:H};
  for(const [width,height] of [[360,800],[390,844],[844,390],[1024,768],[1440,900],[1920,1080]] as const){
    const viewport={width,height};
    const fit=fitScale(viewport,stage,chooseFitMode(viewport,stage));
    for(const d of discoveries){
      const nx=d.hitRect.x+d.hitRect.w/2, ny=d.hitRect.y+d.hitRect.h/2;
      const transform=clampTransform(centerOnNormalized(nx,ny,fit*2,viewport,stage),viewport,stage,fit,fit*2);
      const screen=stageToScreen(transform,nx*W,ny*H);
      assert(screen.x>0 && screen.x<width && screen.y>0 && screen.y<height);
      const back=screenToStage(transform,screen.x,screen.y);
      assert(Math.abs(back.x/W-nx)<1e-9 && Math.abs(back.y/H-ny)<1e-9);
      cameraChecks++;
    }
  }
  await fs.mkdir(out,{recursive:true});
  for(const t of targets){
    const [left,top,width,height]=t.crop;
    await sharp(bytes).extract({left,top,width,height}).png().toFile(`${out}/${t.id}.png`);
  }
  await fs.writeFile(`${out}/discoveries.draft.json`,JSON.stringify({
    status:'authored-not-playtested',boardSlug:'magic-giantlibrary',source,
    art:{width:W,height:H,sha256},discoveries,
    checks:{schema:true,nonOverlappingHits:true,sourceHash:true,rarity321:true,measuredInteriorBounds:true,analyticalCameraChecks:cameraChecks,renderedHudVerified:false},
    remaining:['runtime mobile/desktop HUD, pan, zoom and touch verification','child difficulty playtest; rarity is provisional','personal hide placement and discovery protection','release integration'],
  },null,2)+'\n');
  console.log(JSON.stringify({source,sha256,targets:discoveries.map(d=>({id:d.id,rarity:d.rarity,visibleRect:d.visibleRect})),draft:`${out}/discoveries.draft.json`},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
