import { describe, expect, it } from "vitest";
import { AdventureBookSchema } from "../book-schema";
import { contains } from "../content";
import { discoveryHintRect, nextDiscoveryHint } from "../discovery-guidance";
import { adventureAlbum, emptyAdventureProgress, recordAdventureEvent, readAdventureProgress } from "../progress";
import { guidedFixture } from "./guided-fixture";
import { ADVENTURE_THREE_BOARDS, THREE_PATCH_BOARDS } from "../../../../content/adventures/three-boards";
import { assertPlaceable } from "../../scene/local-patch-hides";

describe("three hides plus six optional discoveries", () => {
  it("compiles explicit three-hide books and preserves independent rarity and difficulty", () => {
    const {config} = guidedFixture(), b=config.adventure!.boards[0]!;
    expect(b.targetIds).toHaveLength(3); expect(b.discoveries).toHaveLength(6);
    expect(b.collectionUi).toBe("guided-v1");
    expect(b.discoveries.map(d=>d.rarity)).toEqual(["common","common","common","rare","rare","epic"]);
    expect(AdventureBookSchema.safeParse({...config.adventure,boards:[{...b,discoveries:[...b.discoveries,{...b.discoveries[0],id:"seventh"}]}]}).success).toBe(false);
  });
  it("collects any item once, unlocks and earns the postcard after three child finds, then continues collecting", () => {
    const {config} = guidedFixture(), book=config.adventure!, b=book.boards[0]!;
    let p=emptyAdventureProgress(config.gameId,book);
    const collect=(id:string)=>recordAdventureEvent(p,config.gameId,book,{kind:"discovery-found",boardSlug:b.boardSlug,discoveryId:id});
    p=collect("item-5").progress;
    expect(collect("item-5").changed).toBe(false);
    expect(adventureAlbum(p).stars.found).toBe(0);
    for(const targetId of b.targetIds) p=recordAdventureEvent(p,config.gameId,book,{kind:"target-found",boardSlug:b.boardSlug,targetId,variant:"A"}).progress;
    expect(adventureAlbum(p).boards[0]!.canAdvance).toBe(true);
    expect(adventureAlbum(p).postcards.collected).toBe(1);
    expect(adventureAlbum(p).allDiscoveries).toBe(false);
    for(const id of ["item-3","item-0","item-4","item-2","item-1"]) p=collect(id).progress;
    p=readAdventureProgress(JSON.parse(JSON.stringify(p)),config.gameId,book);
    expect(adventureAlbum(p).discoveries).toEqual({collected:6,total:6});
    expect(adventureAlbum(p).stars.found).toBe(3);
    expect(adventureAlbum(p).allDiscoveries).toBe(true);
  });
  it("has three image-pinned 4K boards with 18 unique board-scoped items and nine safe render crops", () => {
    expect(ADVENTURE_THREE_BOARDS.boards).toHaveLength(3);
    for(const b of ADVENTURE_THREE_BOARDS.boards) {
      if(b.status!=="ready") throw new Error("not ready");
      expect(b.art.width).toBe(3840); expect(b.art.height).toBe(2160);
      expect(b.discoveries).toHaveLength(6); expect(b.personalZones).toHaveLength(3);
      expect(b.discoveries.filter(d=>d.rarity==="common")).toHaveLength(3);
    }
    for(const b of THREE_PATCH_BOARDS) expect(()=>assertPlaceable(b,{width:3840,height:2160})).not.toThrow();
  });
  it("reveals words, then a broad bounded area, then the target without advancing past level three", () => {
    for(const hit of [{x:.97,y:.97,w:.03,h:.03},{x:0,y:0,w:.05,h:.06},{x:.32,y:.65,w:.08,h:.05}]) {
      expect(discoveryHintRect(hit,0)).toBeNull(); expect(discoveryHintRect(hit,1)).toBeNull();
      for(const level of [2,3] as const) {
        const r=discoveryHintRect(hit,level)!;
        expect(contains({x:0,y:0,w:1,h:1},r)).toBe(true); expect(contains(r,hit)).toBe(true);
      }
      expect(discoveryHintRect(hit,2)!.w).toBeGreaterThan(.3);
    }
    expect(nextDiscoveryHint(3)).toBe(3);
  });
});
