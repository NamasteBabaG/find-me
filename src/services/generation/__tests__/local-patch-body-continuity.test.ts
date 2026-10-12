import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  parseLocalPatchBodyContinuity, localPatchBodyContinuityDisposition, readLocalPatchBodyContinuity, localPatchRuntimeContinuityVerdict,
  CONTINUITY_READER_STRICT, CONTINUITY_READER_BOUNDED, CONTINUITY_READER_CROWD, CONTINUITY_RAW_MAX, CROWD_CONTINUITY_LIMITS,
} from "../../../domain/scene/local-patch-body-continuity";
import { localPatchBodyContinuityPrompt, prepareBodyContinuityPanels, prepareHeadContinuityEvidence, localPatchHeadContinuityPrompt, localPatchCrowdContinuityPrompt } from "../local-patch-body-continuity";

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

// Synthetic prose of an exact length; no real judge text is used anywhere.
const prose = (length: number, seed: string) => (seed + " ").repeat(Math.ceil(length / (seed.length + 1))).slice(0, length);
const CROWD_ID = "giza-v12-1:people";
const crowdCase = (head: number, body: number, occlusion: number, over: Record<string, unknown> = {}) => ({ ...good, id: CROWD_ID,
  headTrace: prose(head, "Each visible head joins its own neck above its own collar at the left and right joins."),
  bodyTrace: prose(body, "Every torso continues into its own arms, legs and supported feet without a straight cut."),
  occlusion: prose(occlusion, "The stall counter hides the lower legs of the vendor at a coherent depth."), ...over });
const v1Answer = (...args: Parameters<typeof crowdCase>) => JSON.stringify({ cases: [crowdCase(...args)] });

describe("the corrected reader of the v1 crowd answer", () => {
  it.each([[1013, 954, 466], [1817, 1602, 779], [2169, 2232, 655]])("reads a complete coherent answer at the observed lengths (%i, %i, %i)", (head, body, occlusion) => {
    const raw = v1Answer(head, body, occlusion);
    // The deployed reader refused exactly these answers, for their length alone.
    expect(readLocalPatchBodyContinuity(raw, [CROWD_ID], CONTINUITY_READER_STRICT)).toMatchObject({ ok: false, fault: { code: "length", path: "cases.0.headTrace" } });
    const read = readLocalPatchBodyContinuity(raw, [CROWD_ID], CONTINUITY_READER_BOUNDED);
    expect(read.ok).toBe(true);
    expect(localPatchRuntimeContinuityVerdict(read)).toEqual({ disposition: "pass", reason: "pass" });
    // Markdown-fenced, the same answer still reads, and nothing was truncated.
    const fenced = readLocalPatchBodyContinuity("```json\n" + raw + "\n```", [CROWD_ID], CONTINUITY_READER_BOUNDED);
    expect(fenced.ok && fenced.people[0]!.bodyTrace.length).toBe(body);
  });
  it.each([
    ["coherent with a fault", { faults: [{ kind: "hard-cut", where: prose(900, "A straight vertical join cuts the right bystander's forehead") }] }],
    ["a missing head", { headConnection: "missing" }],
    ["a merged face", { headConnection: "merged", faults: [{ kind: "merged-face", where: "Shelf paint runs through the left neighbour's face" }] }],
    ["a body without a head", { state: "broken", faults: [{ kind: "missing-head", where: "The torso at the top join continues above an empty collar" }] }],
    ["an impossible connection", { state: "broken", faults: [{ kind: "impossible-occlusion", where: "The child's feet stand on the vendor's neck" }] }],
    ["a disconnected limb", { faults: [{ kind: "disconnected-limb", where: "A hand floats beside the bottom join with no arm" }] }],
  ])("keeps %s written after a long explanation as a defect", (_label, over) => {
    const read = readLocalPatchBodyContinuity(v1Answer(2169, 2232, 655, over), [CROWD_ID], CONTINUITY_READER_BOUNDED);
    expect(read.ok).toBe(true);
    expect(localPatchRuntimeContinuityVerdict(read)).toEqual({ disposition: "repair", reason: "defect" });
  });
  it("passes natural occlusion with a named occluder and a clean deletion, and never a guessed pass", () => {
    const occluded = readLocalPatchBodyContinuity(v1Answer(1500, 1500, 300, { headConnection: "naturally-occluded" }), [CROWD_ID], CONTINUITY_READER_BOUNDED);
    expect(localPatchRuntimeContinuityVerdict(occluded).disposition).toBe("pass");
    // A clean removal is a coherent case; the crowd case itself cannot be absent beside a visible target.
    expect(localPatchBodyContinuityDisposition([{ ...crowdCase(20, 20, 0), state: "absent", visibleBody: false, headConnection: "none" }])).toBe("pass");
    expect(localPatchRuntimeContinuityVerdict(readLocalPatchBodyContinuity(v1Answer(20, 20, 0, { state: "absent", visibleBody: false, headConnection: "none" }),
      [CROWD_ID], CONTINUITY_READER_BOUNDED))).toEqual({ disposition: "unresolved", reason: "conflict" });
    expect(localPatchRuntimeContinuityVerdict(readLocalPatchBodyContinuity(v1Answer(1500, 1500, 0, { state: "unsure", headConnection: "unsure" }),
      [CROWD_ID], CONTINUITY_READER_BOUNDED))).toEqual({ disposition: "unresolved", reason: "unsure" });
    expect(localPatchRuntimeContinuityVerdict(readLocalPatchBodyContinuity(v1Answer(1500, 1500, 5, { headConnection: "naturally-occluded" }),
      [CROWD_ID], CONTINUITY_READER_BOUNDED))).toEqual({ disposition: "unresolved", reason: "unsure" });
  });
  it("refuses an abnormally large answer with its own code", () => {
    const raw = v1Answer(CONTINUITY_RAW_MAX, 20, 0);
    expect(raw.length).toBeGreaterThan(CONTINUITY_RAW_MAX);
    expect(readLocalPatchBodyContinuity(raw, [CROWD_ID], CONTINUITY_READER_BOUNDED)).toMatchObject({ ok: false, fault: { code: "oversize", path: "" } });
  });
  it("classifies every unreadable answer by a code and a JSON path, never by its text", () => {
    const read = (raw: string | null, ids = [CROWD_ID]) => readLocalPatchBodyContinuity(raw, ids, CONTINUITY_READER_BOUNDED);
    expect(read(null)).toMatchObject({ ok: false, fault: { code: "empty" } });
    expect(read("The anatomy looks coherent.")).toMatchObject({ ok: false, fault: { code: "syntax" } });
    expect(read(v1Answer(20, 20, 0) + "\n" + v1Answer(20, 20, 0))).toMatchObject({ ok: false, fault: { code: "syntax" } });
    expect(read(JSON.stringify({ cases: [] }))).toMatchObject({ ok: false, fault: { code: "ids", path: "cases" } });
    expect(read(v1Answer(20, 20, 0), ["another-person"])).toMatchObject({ ok: false, fault: { code: "ids", path: "cases" } });
    expect(read(JSON.stringify({ cases: [crowdCase(20, 20, 0), crowdCase(20, 20, 0)] }))).toMatchObject({ ok: false, fault: { code: "ids" } });
    expect(read(v1Answer(20, 20, 0, { headConnection: "probably" }))).toMatchObject({ ok: false, fault: { code: "shape", path: "cases.0.headConnection" } });
    expect(read(v1Answer(20, 5, 0))).toMatchObject({ ok: false, fault: { code: "length", path: "cases.0.bodyTrace" } });
    const tooMany = Array.from({ length: 33 }, () => ({ kind: "hard-cut", where: "A straight join through a forehead" }));
    expect(read(v1Answer(20, 20, 0, { faults: tooMany }))).toMatchObject({ ok: false, fault: { code: "count", path: "cases.0.faults" } });
  });
  it("keeps the deployed v1 question text byte for byte", () => {
    const focus = "Every visible person in this final context, especially people crossing the four compositing joins, not only the personalized child.";
    // Verified identical to ee74b6c3 before this hash was recorded: pinned v1 fingerprints must not move.
    expect(createHash("sha256").update(localPatchHeadContinuityPrompt([{ id: CROWD_ID, focus }])).digest("hex"))
      .toBe("69f20a2462f08402dca8435dcdfd0efa2cf8c5092d1e5df285645fab1332e363");
  });
});

describe("the v2 crowd contract", () => {
  const person = (over: Record<string, unknown> = {}) => ({ ref: "target", role: "target", state: "coherent", visibleBody: true, headConnection: "connected",
    headTrace: "Round head joins the neck above the red collar.", bodyTrace: "Torso continues into both arms and standing legs.", occlusion: "", faults: [], ...over });
  const crowd = (people: unknown[], unlisted = 0) => JSON.stringify({ cases: [{ id: CROWD_ID, people, unlisted }] });
  const read = (raw: string) => readLocalPatchBodyContinuity(raw, [CROWD_ID], CONTINUITY_READER_CROWD);
  it("judges each person alone: an intact target never excuses a broken neighbour", () => {
    expect(localPatchRuntimeContinuityVerdict(read(crowd([person(), person({ ref: "vendor", role: "bystander" })])))).toEqual({ disposition: "pass", reason: "pass" });
    expect(localPatchRuntimeContinuityVerdict(read(crowd([person(), person({ ref: "vendor", role: "bystander", state: "broken",
      faults: [{ kind: "hard-cut", where: "Vendor's scalp ends on the straight top join" }] })])))).toEqual({ disposition: "repair", reason: "defect" });
  });
  it("passes a peeking target whose own body is hidden by a named occluder", () => {
    const peeking = person({ visibleBody: false, headConnection: "naturally-occluded", occlusion: "The wooden crate hides the target's shoulders and body." });
    expect(localPatchRuntimeContinuityVerdict(read(crowd([peeking])))).toEqual({ disposition: "pass", reason: "pass" });
    expect(localPatchRuntimeContinuityVerdict(read(crowd([{ ...peeking, occlusion: "crate" }])))).toEqual({ disposition: "repair", reason: "defect" });
  });
  it("treats a missing or doubled target as a conflict, never a pass", () => {
    expect(localPatchRuntimeContinuityVerdict(read(crowd([person({ ref: "vendor", role: "bystander" })])))).toEqual({ disposition: "unresolved", reason: "conflict" });
    expect(localPatchRuntimeContinuityVerdict(read(crowd([person(), person({ ref: "copy" })])))).toEqual({ disposition: "unresolved", reason: "conflict" });
  });
  it("enforces exactly the limits its question states", () => {
    const l = CROWD_CONTINUITY_LIMITS, prompt = localPatchCrowdContinuityPrompt(CROWD_ID, "Every visible person");
    for (const stated of [`At most ${l.people} entries`, `${l.traceMin} to ${l.traceMax} characters`, `at most ${l.occlusionMax} characters`,
      `at most ${l.faultsPerPerson} faults per person`, `${l.whereMin} to ${l.whereMax} characters`, `ref 1 to ${l.refMax} characters`]) expect(prompt).toContain(stated);
    expect(prompt).not.toContain("Summarize the observed connections in headTrace/bodyTrace");
    expect(read(crowd([person({ headTrace: prose(l.traceMax, "Head") })])).ok).toBe(true);
    expect(read(crowd([person({ headTrace: prose(l.traceMax + 1, "Head") })]))).toMatchObject({ ok: false, fault: { code: "length", path: "cases.0.people.0.headTrace" } });
    expect(read(crowd(Array.from({ length: l.people + 1 }, (_, n) => person({ ref: `p${n}`, role: n ? "bystander" : "target" }))))).toMatchObject({ ok: false, fault: { code: "count" } });
    expect(read(crowd([person(), person({ role: "bystander" })]))).toMatchObject({ ok: false, fault: { code: "ids", path: "cases.0.people" } });
  });
  it("never lets one question's reader decide another question's answer", () => {
    expect(readLocalPatchBodyContinuity(crowd([person()]), [CROWD_ID], CONTINUITY_READER_BOUNDED)).toMatchObject({ ok: false, fault: { code: "shape" } });
    expect(read(v1Answer(20, 20, 0))).toMatchObject({ ok: false, fault: { code: "shape" } });
  });
});
