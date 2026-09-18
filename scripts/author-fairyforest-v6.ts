import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import { DiscoverySchema, overlaps } from '../src/domain/adventure/content';
import { chooseFitMode, fitScale, centerOnNormalized, clampTransform, stageToScreen } from '../src/game/engine/viewport-math';

// Measured returned pixels. Mechanical authoring only; never repaint source art.
const source='output/imagegen/magic-fairyforest-v6-fresh-environment.png';
const out='output/imagegen/magic-fairyforest-v6-authoring';
const W=3840,H=2160;
const rect=([x,y,w,h]:readonly number[])=>({x:x!/W,y:y!/H,w:w!/W,h:h!/H});
const targets=[
  {id:'blue-paintbrush',he:'מכחול כחול',en:'Blue paintbrush',rarity:'common',difficulty:1,
    hintHe:'חפשו על השולחן של הילדים שמציירים פרחים.',hintEn:'Look on the table where the children paint flowers.',
    storyHe:'עם המכחול הזה אפשר לצייר גינה שלמה.',storyEn:'This brush could paint a whole garden.',
    visible:[1194,774,158,127],hit:[1251,811,54,36],crop:[1175,741,205,205]},
  {id:'berry-bowl',he:'קערת פירות יער',en:'Berry bowl',rarity:'common',difficulty:1,
    hintHe:'הטרולים מציעים משהו טעים לילדה.',hintEn:'The trolls are offering the girl something tasty.',
    storyHe:'הטרולים הכינו כיבוד לחברים שבאו לבקר.',storyEn:'The trolls prepared a treat for their visitors.',
    visible:[2280,1117,165,129],hit:[2310,1140,94,61],crop:[2258,1093,216,216]},
  {id:'purple-sail',he:'מפרש סגול',en:'Purple sail',rarity:'common',difficulty:1,
    hintHe:'חפשו בסירה של אחת הצפרדעים.',hintEn:'Look at one of the frogs boats.',
    storyHe:'רוח קטנה מספיקה להרפתקה גדולה בבריכה.',storyEn:'A little breeze starts a big pond adventure.',
    visible:[2046,1364,122,161],hit:[2062,1436,55,64],crop:[2005,1340,220,220]},
  {id:'squirrel-panflute',he:'חליל הפאן של הסנאי',en:'Squirrel pan flute',rarity:'rare',difficulty:2,
    hintHe:'מי מנגן ליד הילד עם הגיטרה?',hintEn:'Who is playing beside the child with the guitar?',
    storyHe:'לכל צינור בחליל יש צליל משלו.',storyEn:'Each tube of the flute has its own note.',
    visible:[1408,1062,104,135],hit:[1450,1095,36,55],crop:[1361,1024,204,204]},
  {id:'basket-dragonfly',he:'שפירית זהובה',en:'Golden dragonfly',rarity:'rare',difficulty:2,
    hintHe:'הצב סוחב סל עם קישוט קטן.',hintEn:'The turtle carries a basket with a little decoration.',
    storyHe:'השפירית הזאת נוסעת דווקא על גב של צב.',storyEn:'This dragonfly travels on a turtles back.',
    visible:[1637,1298,132,104],hit:[1670,1322,56,58],crop:[1610,1270,185,185]},
  {id:'fairy-silver-buckle',he:'אבזם כסוף',en:'Silver buckle',rarity:'epic',difficulty:3,
    hintHe:'חפשו על התיק החום של הפייה בשמלה הסגולה.',hintEn:'Look on the brown bag of the fairy in the purple dress.',
    storyHe:'האבזם שומר שההפתעות לא יברחו מהתיק.',storyEn:'The buckle keeps surprises from escaping the bag.',
    visible:[2151,734,38,45],hit:[2160,746,20,23],crop:[2130,719,80,80]},
] as const;

async function main(){
  const bytes=await fs.readFile(source),m=await sharp(bytes).metadata();
  assert.equal(m.width,W);assert.equal(m.height,H);
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha256,'2608aa3bef3d6b1da646fd79064f714f3488210d81573a314636442373ebba02');
  const discoveries=targets.map(t=>DiscoverySchema.parse({id:t.id,name:{he:t.he,en:t.en},hint:{he:t.hintHe,en:t.hintEn},category:'object',rarity:t.rarity,difficulty:t.difficulty,description:{kind:'story',text:{he:t.storyHe,en:t.storyEn}},visibleRect:rect(t.visible),hitRect:rect(t.hit),cardCrop:rect(t.crop)}));
  assert.equal(new Set(discoveries.map(d=>d.id)).size,6);
  assert.deepEqual(['common','rare','epic'].map(r=>discoveries.filter(d=>d.rarity===r).length),[3,2,1]);
  for(const [i,d] of discoveries.entries()){
    assert(!discoveries.slice(0,i).some(o=>overlaps(d.hitRect,o.hitRect)));
    assert(d.visibleRect.x>=.24 && d.visibleRect.x+d.visibleRect.w<=.76);
    assert(d.visibleRect.y>=.28 && d.visibleRect.y+d.visibleRect.h<=.75);
  }
  let cameraChecks=0;
  for(const [width,height] of [[360,800],[390,844],[844,390],[1024,768],[1440,900],[1920,1080]] as const){
    const viewport={width,height},stage={width:W,height:H},fit=fitScale(viewport,stage,chooseFitMode(viewport,stage));
    for(const d of discoveries){
      const nx=d.hitRect.x+d.hitRect.w/2,ny=d.hitRect.y+d.hitRect.h/2;
      const t=clampTransform(centerOnNormalized(nx,ny,fit*2.5,viewport,stage),viewport,stage,fit,fit*4);
      const p=stageToScreen(t,nx*W,ny*H);
      assert(p.x>0 && p.x<width && p.y>0 && p.y<height);cameraChecks++;
    }
  }
  await fs.mkdir(out,{recursive:true});
  for(const t of targets){const [left,top,width,height]=t.crop;await sharp(bytes).extract({left,top,width,height}).png().toFile(`${out}/${t.id}.png`);}
  await fs.writeFile(`${out}/discoveries.draft.json`,JSON.stringify({status:'authored-not-playtested',boardSlug:'fairyforest',source,art:{width:W,height:H,sha256},discoveries,checks:{schema:true,rarity321:true,sourceHash:true,nonOverlappingHits:true,measuredInteriorBounds:true,analyticalCameraChecks:cameraChecks,renderedHudVerified:false},remaining:['rendered HUD and touch verification','child difficulty playtest','personal hide protection and integration','release']},null,2)+'\n');
  console.log(JSON.stringify({sha256,targets:discoveries.length,cameraChecks,draft:`${out}/discoveries.draft.json`}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
