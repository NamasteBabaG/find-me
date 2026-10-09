import { describe, expect, it } from "vitest";
import plan from "../../../../docs/art/journey-detectives-placements-20261008.json";
import annotations from "../../../../docs/art/journey-detectives-boundary-head-zones-20261008.json";
import { LocalPatchBoardSchema, cropOf, maskForHide } from "../local-patch-hides";
import { localPatchReturnRegion, sourceHeadIntersectsReturnBoundary } from "../local-patch-return-region";

describe("authored return boundaries", () => {
  it("preserves the historical 120px guard, including clipping at the crop edge", () => {
    expect(localPatchReturnRegion({left:100,top:200,width:512,height:768},{left:55,top:215,width:180,height:365})).toEqual({
      local:{left:0,top:95,width:355,height:605},region:{left:100,top:295,width:355,height:605},compositionVersion:"bounded-return/v3-head-safe-axis",
    });
  });
  it("rejects fractional, out-of-crop and face-feathering windows", () => {
    const crop={left:0,top:0,width:512,height:768},child={left:130,top:270,width:260,height:380};
    for (const r of [{left:.5,top:0,width:510,height:760},{left:0,top:0,width:513,height:768},{left:130,top:260,width:270,height:400}])
      expect(()=>localPatchReturnRegion(crop,child,r)).toThrow();
  });
  it("detects half-head joins on all four sides, including the feather band, while allowing intact inside/outside heads", () => {
    const region={left:100,top:100,width:400,height:400};
    for (const h of [{left:90,top:200,width:80,height:80},{left:460,top:200,width:80,height:80},
      {left:200,top:90,width:80,height:80},{left:200,top:460,width:80,height:80},{left:105,top:200,width:80,height:80}])
      expect(sourceHeadIntersectsReturnBoundary(region,h)).toBe(true);
    expect(sourceHeadIntersectsReturnBoundary(region,{left:200,top:200,width:80,height:80})).toBe(false);
    expect(sourceHeadIntersectsReturnBoundary(region,{left:20,top:200,width:80,height:80})).toBe(false);
  });
  it("catches all three rejected Antarctica boundaries and clears the newly authored source windows", () => {
    const board=LocalPatchBoardSchema.parse(plan.boards.find(b=>b.board==="antarctica"));
    const source=annotations.boards.find(b=>b.board==="antarctica")!;
    expect(board.art).toBe(source.sourceArt);
    for (const h of board.hides) {
      const known=source.hides.find(a=>a.hideId===h.id)!;
      expect(known.heads.some(head=>sourceHeadIntersectsReturnBoundary(known.previousReturnRegion,head))).toBe(true);
      const current=localPatchReturnRegion(cropOf(h),maskForHide(h),h.returnRect);
      expect(current.compositionVersion).toBe("bounded-return/v4-authored-source-boundaries");
      expect(known.heads.filter(head=>sourceHeadIntersectsReturnBoundary(current.region,head))).toEqual([]);
      expect(h.wardrobe).toContain("WINTER HAT IS REQUIRED");
    }
  });
});
