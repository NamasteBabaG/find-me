import { describe, it, expect } from "vitest";
import { schemaForScene, validatePlan } from "../../../scripts/plan-fixed-slots";

const sample = () => ({scene:"paris", slots:["1","2","3"].map(id=>({
  id, fullBodyBoxAge8:{x:.2,y:.3,w:.1,h:.2}, visibleFaceBox:{x:.22,y:.31,w:.03,h:.03},
  nearbyChildBox:{x:.4,y:.3,w:.1,h:.2}, nearbyAdultBox:{x:.6,y:.25,w:.1,h:.25},
  supportPoint:{x:.25,y:.5}, foregroundPolygon:[], confidence:.6,
}))});
describe("offline fixed-slot planner geometry contract", () => {
  it("pins the exact scene slug in the provider schema", () => {
    expect(schemaForScene("greatwall").properties.scene.enum).toEqual(["greatwall"]);
    expect(()=>schemaForScene("unknown")).toThrow();
    const p=sample(); p.scene="paris — descriptive text";
    expect(()=>validatePlan(p,"paris")).toThrow("exact requested slug");
  });
  it("accepts bounded geometry without implying visual certification", () => {
    expect(()=>validatePlan(sample(),"paris")).not.toThrow();
  });
  it("rejects repeated ids, missing proposals and invalid numbering", () => {
    const repeated=sample(); repeated.slots[1]!.id="1";
    expect(()=>validatePlan(repeated,"paris")).toThrow();
    const missing=sample(); missing.slots.pop(); expect(()=>validatePlan(missing,"paris")).toThrow();
    const wrong=sample(); wrong.slots[0]!.id="0"; expect(()=>validatePlan(wrong,"paris")).toThrow();
  });
  it("rejects out-of-board or nonfinite geometry", () => {
    for (const value of [NaN,Infinity,-.1,1.1]) {
      const p=sample(); p.slots[0]!.fullBodyBoxAge8.x=value;
      expect(()=>validatePlan(p,"paris")).toThrow();
    }
    const p=sample(); p.slots[0]!.fullBodyBoxAge8.w=.9;
    expect(()=>validatePlan(p,"paris")).toThrow();
  });
  it("rejects an external face or a support point without a body", () => {
    const p=sample(); p.slots[0]!.visibleFaceBox.x=.9;
    expect(()=>validatePlan(p,"paris")).toThrow("Face");
    const q=sample(); q.slots[0]!.supportPoint.y=.7;
    expect(()=>validatePlan(q,"paris")).toThrow("Support");
  });
});
