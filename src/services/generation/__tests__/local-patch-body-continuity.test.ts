import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { parseLocalPatchBodyContinuity, localPatchBodyContinuityDisposition } from "../../../domain/scene/local-patch-body-continuity";
import { localPatchBodyContinuityPrompt, prepareBodyContinuityPanels, prepareHeadContinuityEvidence, localPatchHeadContinuityPrompt } from "../local-patch-body-continuity";

const good = { id: "synthetic-person", state: "coherent", visibleBody: true, headConnection: "connected",
  headTrace: "A visible head joins the neck above the blue coat.", bodyTrace: "The coat joins two arms and supported lower legs.", occlusion: "", faults: [] };
const parse = (over: Record<string, unknown> = {}) => parseLocalPatchBodyContinuity({ cases: [{ ...good, ...over }] }, [good.id]);

describe("independent AFTER-only body continuity", () => {
  it("refuses a missing or merged head despite a claimed coherent result", () => {
    expect(localPatchBodyContinuityDisposition(parse())).toBe("pass");
    for (const headConnection of ["missing", "merged", "none"]) expect(localPatchBodyContinuityDisposition(parse({ headConnection }))).toBe("repair");
    expect(localPatchBodyContinuityDisposition(parse({ faults: [{ kind: "hard-cut", where: "Forehead is sliced by the newly painted shelf." }] }))).toBe("repair");
  });
  it("allows coherent whole deletion while retaining unresolved evidence and contradictions", () => {
    expect(localPatchBodyContinuityDisposition(parse({ state: "absent", visibleBody: false, headConnection: "none" }))).toBe("pass");
    expect(localPatchBodyContinuityDisposition(parse({ state: "absent" }))).toBe("repair");
    expect(localPatchBodyContinuityDisposition(parse({ headConnection: "naturally-occluded" }))).toBe("unresolved");
    expect(localPatchBodyContinuityDisposition(parse({ headConnection: "naturally-occluded", occlusion: "The whole solid counter hides the lower neck at a coherent depth." }))).toBe("pass");
    expect(localPatchBodyContinuityDisposition(parse({ state: "unsure", headConnection: "unsure" }))).toBe("unresolved");
  });
  it("never approves missing, duplicate or foreign evidence ids", () => {
    expect(parseLocalPatchBodyContinuity({ cases: [] }, [good.id])).toBeNull();
    expect(parseLocalPatchBodyContinuity({ cases: [good, good] }, [good.id])).toBeNull();
    expect(parseLocalPatchBodyContinuity({ cases: [good] }, ["another-person"])).toBeNull();
    expect(localPatchBodyContinuityDisposition(null)).toBe("unresolved");
  });
  it("extracts native AFTER pixels with no original-board/portrait contamination", async () => {
    const after = await sharp({ create: { width: 640, height: 800, channels: 3, background: "#4466aa" } }).png().toBuffer();
    const regions = [{ id: good.id, focus: "The person wearing a blue coat", rect: { left: 100, top: 150, width: 240, height: 500 } }];
    const panels = await prepareBodyContinuityPanels(after, regions);
    const meta = await sharp(panels[0]!.png).metadata();
    expect([meta.width, meta.height]).toEqual([240, 500]);
    expect(localPatchBodyContinuityPrompt(regions)).toContain("There are no BEFORE images or identity portraits");
    expect(localPatchBodyContinuityPrompt(regions)).toContain("shoes/legs replacing its head");
    await expect(prepareBodyContinuityPanels(after, [{ ...regions[0]!, rect: { left: 600, top: 150, width: 240, height: 500 } }])).rejects.toThrow("focus region");
  });
  it("binds each head detail to its own final context without inventing or smoothing pixels", async () => {
    const after = await sharp({ create: { width: 640, height: 800, channels: 3, background: "#4466aa" } })
      .composite([{ input: await sharp({ create: { width: 60, height: 60, channels: 3, background: "#c03b55" } }).png().toBuffer(), left: 160, top: 180 }]).png().toBuffer();
    const region = { id: "sample", focus: "The figure in the registered region", rect: { left: 100, top: 100, width: 300, height: 600 },
      headRect: { left: 140, top: 160, width: 100, height: 100 } };
    const evidence = await prepareHeadContinuityEvidence(after, [region]);
    expect(evidence.images).toHaveLength(2);
    const exactDetail = await sharp(after).extract(region.headRect).resize({ width: 512, kernel: "nearest" }).png().toBuffer();
    expect(evidence.images[1]!.equals(exactDetail)).toBe(true);
    expect(evidence.labels[1]).toContain("SAME final pixels");
    expect(localPatchHeadContinuityPrompt([region])).toContain("A connected neck alone does not establish a whole head");
    await expect(prepareHeadContinuityEvidence(after, [{ ...region, headRect: { ...region.headRect, left: 80 } }]))
      .rejects.toThrow("registered AFTER context");
  });
});
