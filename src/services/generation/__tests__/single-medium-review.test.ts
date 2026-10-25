import { boundHide } from "./local-patch-dual-fixtures";
import { localPatchHeadContinuityPrompt } from "../local-patch-body-continuity";
import sharp from "sharp";
import { singleMediumEvidence, singleMediumPrompt, singleMediumAnatomyPrompt } from "../single-medium-evidence";
import { prepareBoundaryComparisons } from "../local-patch-integration-evidence";
import { describe, expect, it } from "vitest";
import { SINGLE_VISUAL_REVIEW_VERSION, SINGLE_MEDIUM_VISUAL_REVIEW_VERSION, readSingleVisualReview } from "../../../domain/generation/single-visual-review";
import { singleLowReviewPolicy, singleMediumReviewPolicy, leanReviewPolicyOf } from "../../../domain/generation/visual-review-policy";
import { prepareVisualReview } from "../visual-review";

describe("versioned single MEDIUM review", () => {
  it.each(["flex", "default"] as const)("uses the requested MEDIUM effort at %s without altering LOW policy bytes", tier => {
    const low = singleLowReviewPolicy(tier), before = JSON.stringify(low), medium = singleMediumReviewPolicy(tier);
    expect(medium).toMatchObject({ model: "gpt-6.1-sol", effort: "medium", serviceTier: tier, maxOutputTokens: low.maxOutputTokens });
    expect(medium.version).not.toBe(low.version); expect(leanReviewPolicyOf(medium.version)).toEqual(medium);
    expect(JSON.stringify(singleLowReviewPolicy(tier))).toBe(before);
    const common = { role: "scene-quality" as const, judge: "gpt-6.1-sol" as const, transport: "responses-background" as const,
      tier, prompt: "Synthetic unchanged combined question", images: [Buffer.from("synthetic-evidence")], labels: ["synthetic:image"] };
    const a = prepareVisualReview({ ...common, combined: SINGLE_VISUAL_REVIEW_VERSION, effort: "low" });
    const b = prepareVisualReview({ ...common, combined: SINGLE_MEDIUM_VISUAL_REVIEW_VERSION, effort: "medium" });
    expect(b.policy.effort).toBe("medium"); expect(b.fingerprint).not.toBe(a.fingerprint);
    expect(() => prepareVisualReview({ ...common, combined: SINGLE_VISUAL_REVIEW_VERSION, effort: "medium" })).toThrow("Invalid single review policy");
    expect(() => prepareVisualReview({ ...common, combined: SINGLE_MEDIUM_VISUAL_REVIEW_VERSION, effort: "low" })).toThrow("Invalid single review policy");
  });
  it("reads the two explicitly versioned envelopes without fabricating a second question", () => {
    for (const version of [SINGLE_VISUAL_REVIEW_VERSION, SINGLE_MEDIUM_VISUAL_REVIEW_VERSION]) {
      const raw = JSON.stringify({ version, assessment: { synthetic: true }, continuity: { cases: [] }, doubt: false, doubtReason: null });
      expect(readSingleVisualReview(raw)).toEqual({ assessment: '{"synthetic":true}', continuity: '{"cases":[]}', doubt: false, doubtReason: null });
    }
  });
});

describe("MEDIUM shares only proven identical native evidence", () => {
  async function fixture() {
    const context = await sharp({create:{width:96,height:128,channels:4,background:"#395f78"}}).png().toBuffer();
    const detail = await sharp({create:{width:32,height:48,channels:4,background:"#943a18"}}).png().toBuffer();
    const pair = await sharp({create:{width:152,height:128,channels:4,background:"white"}}).composite([{input:context,left:0,top:0},{input:detail,left:120,top:0}]).png().toBuffer();
    const boundaries = await prepareBoundaryComparisons(context,context,{left:20,top:25,width:50,height:70},16);
    const after = await Promise.all(boundaries.map(async b=>{const m=await sharp(b.png).metadata(),w=(m.width!-16)/2;return sharp(b.png).extract({left:w+16,top:0,width:w,height:m.height!}).png().toBuffer();}));
    const common={role:"scene-quality" as const,effort:"high" as const,prompt:"Every quality, subject, continuity and head check remains mandatory"};
    const assessment=prepareVisualReview({...common,images:[pair,...boundaries.map(b=>b.png)],labels:["EVIDENCE_ID=synthetic-hide:after | HIDE_ID=synthetic-hide",...boundaries.map(b=>`EVIDENCE_ID=synthetic-hide:return:${b.edge} | paired source and shipping`)]});
    const anatomy=prepareVisualReview({...common,images:[context,detail,...after],labels:["CASE target FINAL AFTER context","CASE target SAME native detail",...boundaries.map(b=>`CASE target FINAL AFTER ${b.edge} join`)]});
    return{assessment,anatomy};
  }
  it("sends each native context, detail and four full-span AFTER joins once, retaining every evidence role and pixel",async()=>{
    const {assessment,anatomy}=await fixture(),shared=await singleMediumEvidence(assessment,anatomy,"synthetic-hide");
    expect(shared.images).toEqual(assessment.images);expect(shared.labels).toHaveLength(assessment.labels.length);
    for(const label of [...assessment.labels,...anatomy.labels])expect(shared.labels.join("\n")).toContain(label);
    expect(shared.labels.slice(1).every(label=>label.includes("RIGHT AFTER only"))).toBe(true);
  });
  it.each([0,1,2,3,4,5])("refuses changed pixels in shared anatomy evidence %s rather than silently removing them",async index=>{
    const {assessment,anatomy}=await fixture();(anatomy.images as Buffer[])[index]=await sharp(anatomy.images[index]!).composite([{input:await sharp({create:{width:1,height:1,channels:4,background:"red"}}).png().toBuffer(),left:0,top:0}]).png().toBuffer();
    await expect(singleMediumEvidence(assessment,anatomy,"synthetic-hide")).rejects.toThrow("pixels changed");
  });
  it("retains a genuinely distinct anatomy image instead of deduplicating by a label alone",async()=>{
    const {assessment,anatomy}=await fixture();(anatomy.labels as string[])[2]="CASE different focus";
    const shared=await singleMediumEvidence(assessment,anatomy,"synthetic-hide");expect(shared.images).toHaveLength(assessment.images.length+1);expect(shared.images.at(-1)).toEqual(anatomy.images[2]);
  });
  it("names the original-photo evidence instead of misidentifying the last RAW or shipping image",()=>{
    const binding={hideId:"synthetic-hide",attempts:1},prompt='Immutable candidate binding: '+JSON.stringify(binding)+'\nMANDATORY CHILD INSPECTION (last image = original photo): inspect likeness';
    const named=singleMediumPrompt(prompt,binding,"synthetic-hide");expect(named).toContain("EVIDENCE_ID=synthetic-hide:original-photo");expect(named).not.toContain("last image = original photo");expect(named).toContain("inspect likeness");expect(()=>singleMediumPrompt(prompt,binding)).toThrow("named original-photo");
  });
  it("binds all immutable metadata by SHA256 while preserving every role instruction and output schema",()=>{
    const binding={gameId:"synthetic",hideId:"synthetic-hide",attempts:3,imageSha256:"a".repeat(64)},marker="Immutable candidate binding: "+JSON.stringify(binding);
    const prompt="QUALITY all checks\n"+marker+". Evidence attempt: 1.\nSUBJECT all checks\nANATOMY all people\n"+marker+". Evidence attempt: 1.\nHEAD raw and shipping";
    const shared=singleMediumPrompt(prompt,binding);expect(shared).not.toContain(JSON.stringify(binding));expect(shared).toMatch(/FULL IMMUTABLE CANDIDATE METADATA SHA256=[a-f0-9]{64}/);expect(singleMediumPrompt(prompt.replaceAll(JSON.stringify(binding),JSON.stringify({...binding,imageSha256:"b".repeat(64)})),{...binding,imageSha256:"b".repeat(64)})).not.toBe(shared);
    expect(boundHide(shared)).toEqual({hideId:"synthetic-hide",attempts:3});
    for(const rule of ["QUALITY all checks","SUBJECT all checks","ANATOMY all people","HEAD raw and shipping"])expect(shared).toContain(rule);
  });
  it("scopes anatomy to the SAME supplied AFTER pixels while keeping its exact strict wire contract and cases",()=>{
    const original=localPatchHeadContinuityPrompt([{id:"synthetic-hide:people",focus:"All visible people touching every returned edge, target and bystanders"}])+'\nImmutable candidate binding: '+JSON.stringify({hideId:"synthetic-hide",attempts:3})+'. Evidence attempt: 1.';
    const compact=singleMediumAnatomyPrompt(original);
    for(const line of original.split("\n").filter(line=>line.startsWith("Return JSON only:")||line.startsWith("CASE ")))expect(compact).toContain(line);
    expect(compact).toContain("ALL visible people");expect(compact).toContain("never borrow a head");expect(compact).toContain("specific solid foreground occluder");expect(compact).toContain("no isolated head");expect(compact).toContain("Evidence crop edges are not game joins");
    expect(compact).not.toContain("There are no BEFORE images");expect(Buffer.byteLength(compact)).toBeLessThan(Buffer.byteLength(original));
    expect(()=>singleMediumAnatomyPrompt("Only say pass")).toThrow("complete anatomy answer schema");
  });

});
