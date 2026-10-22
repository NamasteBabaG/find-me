import { describe,expect,it } from "vitest";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import raw from "./runtime-v1.json";
import staged from "./source-v1.json";
import {DETECTIVE_SOURCE_BOARDS} from "./source-release";
import {DETECTIVE_ADVENTURE_CATALOG,DETECTIVE_PATCH_BOARDS,DETECTIVE_SOURCE_NEIGHBORS} from "./runtime-release";
import {DETECTIVE_IDENTITY_STYLE_CATALOG_SHA256,DETECTIVE_IDENTITY_STYLE_SOURCES} from "./identity-style-release";
import {DETECTIVE_RELEASES,JOURNEY_DETECTIVE_RUNTIME_RELEASE} from "../worlds/detective-releases";
import {INTEGRATED_COLLECTION_BOARDS,INTEGRATED_WIZARD_CATALOG} from "../adventures/wizard-integrated-release";
import {findScene,DETECTIVE_SCENES} from "../scenes";
import {detectiveSceneRelease} from "./scene-release";
import {assertPlaceable,cropOf,maskForHide,maskOf} from "../../src/domain/scene/local-patch-hides";
import {localPatchReturnRegion,sourceHeadIntersectsReturnBoundary,rectanglesIntersect} from "../../src/domain/scene/local-patch-return-region";
import {AdventureCatalogSchema,contains,overlaps} from "../../src/domain/adventure/content";
import {BODY_TEMPLATES} from "../body-templates";
import {composeGame,composeScene} from "../../src/domain/game/compose";
import {attachAdventureBook} from "../../src/domain/adventure/compose";
import {localPatchGeometry} from "../../src/services/generation/local-patch-geometry";
import {targetGeometry} from "../../src/game/engine/target-geometry";
import {SceneConfigSchema} from "../../src/domain/game/config";

describe("prospective Detective content is source-bound and complete",()=>{
 it("preserves the immutable staged snapshot alongside the separately qualified runtime entry",async()=>{
  const bytes=await readFile(path.join(process.cwd(),"content/detectives/source-v1.json"));
  expect(createHash("sha256").update(bytes).digest("hex")).toBe("1f93f66b543d71d4b97196ec202c499d7a81f0bed233e188887e1b12b4771d02");
  expect(staged.runtimeReady).toBe(false);expect(DETECTIVE_RELEASES).toEqual([JOURNEY_DETECTIVE_RUNTIME_RELEASE]);
  expect(JOURNEY_DETECTIVE_RUNTIME_RELEASE).toEqual({worldSlug:"journey",styleVersion:"local-patch-world-v1",sceneVersion:13});
 });
 it("verifies all9 actual Detective masters and measured identity contexts",async()=>{
  for(const source of DETECTIVE_SOURCE_BOARDS){
   const bytes=await readFile(path.join(process.cwd(),source.path)),meta=await sharp(bytes).metadata();
   expect(createHash("sha256").update(bytes).digest("hex")).toBe(source.sha256);expect([meta.width,meta.height]).toEqual([3840,2160]);
   const style=DETECTIVE_IDENTITY_STYLE_SOURCES.find(s=>s.boardId===source.board)!;
   expect(style.art).toBe(source.path);expect(style.sha256).toBe(source.sha256);
   const cropped=await sharp(bytes).extract(style.crop).metadata();expect(cropped.format).toBe("webp");
  }
  const envelope={version:"journey-detectives-identity-style/v1",sceneVersion:13,worldSlug:"journey",sourceRelease:"journey-detectives-source/v1",sources:DETECTIVE_IDENTITY_STYLE_SOURCES};
  expect(createHash("sha256").update(JSON.stringify(envelope)).digest("hex")).toBe(DETECTIVE_IDENTITY_STYLE_CATALOG_SHA256);
 });
 it("has27 disjoint placeable authored hides with closed same-crop recovery windows",()=>{
  expect(DETECTIVE_PATCH_BOARDS).toHaveLength(9);const ids=new Set<string>();
  for(const board of DETECTIVE_PATCH_BOARDS){assertPlaceable(board,{width:3840,height:2160});expect(board.hides).toHaveLength(3);
   for(const hide of board.hides){expect(ids.has(hide.id)).toBe(false);ids.add(hide.id);
    expect(hide.hint?.en).toBeTruthy();expect(hide.hint?.he).toBeTruthy();expect(hide.wardrobe).toBeTruthy();
    const ret=localPatchReturnRegion(cropOf(hide),maskForHide(hide),hide.returnRect);expect(ret.compositionVersion).toBe("bounded-return/v4-authored-source-boundaries");
    expect(ret.local.left+ret.local.width).toBeLessThan(512);expect(ret.local.top+ret.local.height).toBeLessThan(768);
   }
  }expect(ids.size).toBe(27);
 });
 it("keeps all registered local heads away from the actual return feather and within review context",()=>{
  expect(DETECTIVE_SOURCE_NEIGHBORS).toHaveLength(27);
  expect(DETECTIVE_SOURCE_NEIGHBORS.every(e=>e.neighbors.some(n=>n.sourceId.startsWith("source-")))).toBe(true);
  for(const entry of DETECTIVE_SOURCE_NEIGHBORS){
   const board=DETECTIVE_PATCH_BOARDS.find(b=>b.board===entry.boardId)!,hide=board.hides.find(h=>h.id===entry.hideId)!;
   const crop=cropOf(hide),ret=localPatchReturnRegion(crop,maskForHide(hide),hide.returnRect).region;
   expect(entry.neighbors.length).toBeLessThanOrEqual(8);
   const padding=Math.max(192,...entry.neighbors.flatMap(n=>[crop.left-n.head.left,crop.top-n.head.top,n.head.left+n.head.width-crop.left-512,n.head.top+n.head.height-crop.top-768]));
   expect(padding).toBeLessThanOrEqual(256);
   const l=Math.max(0,crop.left-padding),t=Math.max(0,crop.top-padding),r=Math.min(3840,crop.left+512+padding),b=Math.min(2160,crop.top+768+padding);
   for(const n of entry.neighbors){expect(sourceHeadIntersectsReturnBoundary(ret,n.head)).toBe(false);expect(n.head.left).toBeGreaterThanOrEqual(l);expect(n.head.top).toBeGreaterThanOrEqual(t);expect(n.head.left+n.head.width).toBeLessThanOrEqual(r);expect(n.head.top+n.head.height).toBeLessThanOrEqual(b);}
  }
  for(const omitted of raw.visualContextOnlyHeads){const board=DETECTIVE_PATCH_BOARDS.find(b=>b.board===omitted.boardId)!,hide=board.hides.find(h=>h.id===omitted.hideId)!;const ret=localPatchReturnRegion(cropOf(hide),maskForHide(hide),hide.returnRect).region;
   for(const n of omitted.visualContextOnly)expect(rectanglesIntersect(ret,n.head)).toBe(false);}
 });
 it("maps exactly54 real source discoveries with safe cards and9 postcards containing their target",()=>{
  expect(AdventureCatalogSchema.parse(DETECTIVE_ADVENTURE_CATALOG)).toEqual(DETECTIVE_ADVENTURE_CATALOG);
  for(const plan of DETECTIVE_ADVENTURE_CATALOG.boards){expect(plan.status).toBe("ready");if(plan.status!=="ready")throw Error("not ready");
   expect(plan.sceneVersion).toBe(13);expect(plan.worldSlug).toBe("journey");expect(plan.discoveries).toHaveLength(6);
   for(const d of plan.discoveries){expect(d.description.kind).toBe("story");
    for(const rect of [d.visibleRect,d.hitRect,d.cardCrop])expect(plan.personalZones.some(zone=>overlaps(zone,rect))).toBe(false);}
   const hide=DETECTIVE_PATCH_BOARDS.find(b=>b.board===plan.boardSlug)!.hides.find(h=>h.targetId===plan.postcard.targetId)!;const box=maskOf(hide);
   expect(contains(plan.postcard.crop,{x:box.left/3840,y:box.top/2160,w:box.width/3840,h:box.height/2160})).toBe(true);
  }
 });
 it("builds version13 scenes using only Detective art and actual target hints/transforms",()=>{
  expect(DETECTIVE_SCENES).toHaveLength(9);
  for(const scene of DETECTIVE_SCENES){expect(scene.version).toBe(13);expect(scene.art.base).toMatch(/-detectives-v\d+\/base\.webp$/);
   const board=DETECTIVE_PATCH_BOARDS.find(b=>b.board===scene.slug)!;expect(scene.targets).toHaveLength(3);
   scene.targets.forEach((target,i)=>{expect(target.id).toBe(board.hides[i]!.targetId);expect(BODY_TEMPLATES[target.bodyTemplate]).toBeDefined();expect(target.action).toBeUndefined();expect(target.expression).toBeUndefined();
    for(const slot of target.slots){expect(slot.placement).toBeUndefined();expect(slot.hintText).toEqual(board.hides[i]!.hint);expect(slot.flip).toBe(false);expect(slot.rotation).toBe(0);expect(slot.scale).toBe(Math.min(0.25,board.hides[i]!.mask!.height/2160));}
   });expect(findScene(scene.slug,13)).toEqual(scene);
  }
 });
 it("keeps native painted raster and tap geometry despite bounded generic slot preview scale",()=>{
  let tall=0;
  for(const def of DETECTIVE_SCENES){
   const board=DETECTIVE_PATCH_BOARDS.find(b=>b.board===def.slug)!;
   const sprites=board.hides.map(h=>{const crop=cropOf(h),box=maskOf(h);return {targetId:h.targetId,sprite:{kind:"image" as const,url:"/api/assets/synthetic-detective-patch",width:512,height:768,
    rect:{x:crop.left/3840,y:crop.top/2160,w:512/3840,h:768/2160},hitRect:{x:box.left/3840,y:box.top/2160,w:box.width/3840,h:box.height/2160},anchor:{x:(box.left+box.width/2)/3840,y:box.top/2160}}};});
   const scene=composeScene(def,{name:"Synthetic",avatarUrl:"/api/assets/synthetic-avatar"},sprites,"en");
   scene.targets.forEach((target,i)=>{const actual=targetGeometry(scene,target,"A"),box=maskOf(board.hides[i]!);
    expect(actual.isPatch).toBe(true);if(actual.sprite.kind!=="image")throw Error("native patch required");
    expect(actual.sprite.rect).toEqual(sprites[i]!.sprite.rect);expect(actual.sprite.rect!.h).toBe(768/2160);
    expect(actual.hitRect.y1-actual.hitRect.y0).toBeCloseTo(box.height/2160,12);
    if(box.height>540){tall++;expect(actual.slot.scale).toBe(0.25);expect(actual.hitRect.y1-actual.hitRect.y0).toBeGreaterThan(0.25);}
   });
  }expect(tall).toBeGreaterThan(0);
 });
 it("assembles all9 actual scene13 boards and all27 shipping patches through the real player/book contract",async()=>{
  // Synthetic unchanged pixels exercise the real conservative geometry path;
  // this is assembly qualification, not a visual verdict or a provider render.
  const boardPng=await sharp({create:{width:3840,height:2160,channels:3,background:{r:80,g:100,b:120}}}).png().toBuffer();
  const child={name:"Synthetic",avatarUrl:"/api/assets/synthetic-detective-avatar"};
  const scenes=[];
  for(const def of DETECTIVE_SCENES){
   const board=DETECTIVE_PATCH_BOARDS.find(b=>b.board===def.slug)!;
   const sprites=[];
   for(const hide of board.hides){
    const patchPng=await sharp(boardPng).extract(cropOf(hide)).png().toBuffer();
    const result=await localPatchGeometry({contentVersion:13,hide,boardPng,patchPng,board:{width:3840,height:2160}});
    expect(result.basis).toBe("declared");
    const sprite={kind:"image" as const,url:`/api/assets/synthetic-${hide.id}`,width:512,height:768,...result.geometry};
    sprites.push({targetId:hide.targetId,sprite,spriteByVariant:{A:sprite,B:sprite}});
   }
   const composed=composeScene(def,child,sprites,"en");
   scenes.push(SceneConfigSchema.parse({...composed,worldSlug:"journey",playMode:"find-any",appearancesPerBoard:3,findsRequiredToAdvance:3,
    targets:composed.targets.map(t=>({...t,slots:t.slots.map(s=>({...s,flip:false,rotation:0,layer:"front"}))}))}));
  }
  const config=composeGame({gameId:"synthetic-detective-assembly",child,packageTier:"ONE_WORLD",styleVersion:"local-patch-world-v1",locale:"en",scenes});
  const slugs=DETECTIVE_PATCH_BOARDS.map(b=>b.board);
  for(const locale of ["en","he"] as const){
   const attached=attachAdventureBook({...config,locale},DETECTIVE_ADVENTURE_CATALOG,slugs);
   expect(attached.adventure?.boards).toHaveLength(9);
   expect(attached.adventure?.boards.flatMap(b=>b.targetImages)).toHaveLength(27);
   expect(attached.adventure?.boards.flatMap(b=>b.discoveries)).toHaveLength(54);
   for(const board of attached.adventure!.boards){
    const plan=DETECTIVE_ADVENTURE_CATALOG.boards.find(b=>b.boardSlug===board.boardSlug)!;
    if(plan.status!=="ready")throw Error("ready plan required");
    const original=config.scenes.find(s=>s.slug===board.boardSlug)!;
    for(const target of original.targets){
     const image=board.targetImages.find(i=>i.targetId===target.id)!;
     expect(image.A.rect).toEqual(target.sprite.kind==="image"?target.sprite.rect:undefined);
     expect(image.B).toEqual(image.A);
     expect(plan.personalZones.some(zone=>contains(zone,image.A.rect))).toBe(true);
    }
    expect(board.discoveries.map(d=>d.name)).toEqual(plan.discoveries.map(d=>d.name[locale]));
   }
  }
  // Reproduce the original assembly blocker without weakening its shared guard:
  // valid-looking authored returns cannot stand in for full shipping rectangles.
  const returnOnly={...DETECTIVE_ADVENTURE_CATALOG,boards:DETECTIVE_ADVENTURE_CATALOG.boards.map(plan=>{
   if(plan.status!=="ready")return plan;
   const board=DETECTIVE_PATCH_BOARDS.find(b=>b.board===plan.boardSlug)!;
   return {...plan,personalZones:board.hides.map(h=>{const r=localPatchReturnRegion(cropOf(h),maskForHide(h),h.returnRect).region;
    return {x:r.left/3840,y:r.top/2160,w:r.width/3840,h:r.height/2160};})};
  })};
  expect(()=>attachAdventureBook(config,returnOnly,slugs)).toThrow("adventure:unsafe-layout:hide-1");
 });
 it("never supplies Detective content for unknown/Kingdom boards or changes old default/v12 selections",()=>{
  const legacy=findScene("newyork")!;expect(legacy.version).toBe(4);expect(findScene("newyork",12)?.art.base).not.toMatch(/detectives/);
  expect(findScene("castlegate",13)).toBeUndefined();expect(findScene("newyork",999)).toBeUndefined();
  expect(()=>detectiveSceneRelease(findScene("castlegate"))).toThrow(/unknown family/);
  expect(INTEGRATED_COLLECTION_BOARDS.every(b=>!b.art.includes("detectives"))).toBe(true);
  expect(INTEGRATED_WIZARD_CATALOG.boards.every(b=>b.status==="ready" && b.sceneVersion===12)).toBe(true);
 });
 it("binds changed source actors to their new pose and activity rather than old hints",()=>{
  const byId=(id:string)=>DETECTIVE_PATCH_BOARDS.flatMap(b=>b.hides).find(h=>h.id===id)!;
  expect(byId("newyork-detectives-hide-3").hint?.en).toContain("students");
  expect(byId("paris-detectives-hide-3").placement?.support).toContain("white-apron");
  expect(byId("giza-detectives-hide-2").placement?.support).toContain("purple-shirt hoop");
  const beach=byId("sydney-detectives-hide-3");expect(beach.pose).toBe("standing");expect(beach.hint?.en).toContain("paper");expect(beach.placement?.support).toContain("violet-top");expect(beach.wardrobe).toContain("violet");
  for(const h of DETECTIVE_PATCH_BOARDS.find(b=>b.board==="antarctica")!.hides)expect(h.wardrobe).toMatch(/hat/i);
 });
});
