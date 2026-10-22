import { describe, expect, it } from "vitest";
import { readSubjectQualityBundle, SUBJECT_QUALITY_BUNDLE_VERSION } from "../subject-quality-bundle";
import { readSourceNeighborQualityBundle, sourceNeighborQualityBundleDirection,
  SOURCE_NEIGHBOR_QUALITY_BUNDLE_LIMITS, type SourceNeighborQualityBundleBinding } from "../source-neighbor-quality-bundle";
import { prepareSourceNeighborContract, SOURCE_NEIGHBOR_ANSWER_VERSION, SOURCE_NEIGHBOR_BUNDLE_VERSION,
  SOURCE_NEIGHBOR_CONTRACT_VERSION, SOURCE_NEIGHBOR_LIMITS, SOURCE_NEIGHBOR_POLICY, SOURCE_NEIGHBOR_READER,
  type SourceNeighborContract, type SourceNeighborAnswer } from "../../scene/local-patch-source-neighbors";

const contract: SourceNeighborContract = {
  version: SOURCE_NEIGHBOR_CONTRACT_VERSION, boardId: "synthetic-market", hideId: "synthetic-market-2",
  source: { art: "public/scenes/synthetic-market/base.webp", sha256: "a".repeat(64), width: 3840, height: 2160 },
  crop: { left: 1000, top: 700, width: 512, height: 768 }, returnRect: { left: 40, top: 100, width: 430, height: 620 },
  neighbors: [{ sourceId: "dough-maker", head: { left: 1065, top: 850, width: 70, height: 90 } }],
};
const { version: _contractVersion, neighbors: _sourceNeighbors, ...context } = contract;
const prepared = prepareSourceNeighborContract(contract, context);
if (!prepared.ok) throw Error("Synthetic source contract must be valid");
const binding: SourceNeighborQualityBundleBinding = { version: SOURCE_NEIGHBOR_BUNDLE_VERSION,
  policy: SOURCE_NEIGHBOR_POLICY, reader: SOURCE_NEIGHBOR_READER, contractSha256: prepared.contractSha256,
  candidateSha256: "b".repeat(64) };
const quality = () => ({ hides: [{ hideId: contract.hideId, evidenceIds: [`${contract.hideId}:before`, `${contract.hideId}:after`],
  verdict: { childPresent: "pass", childOnlyOnce: "pass", neighborsIntact: "pass", verdict: "pass",
    reason: "The same child is coherently painted at the table.", faults: [] as { check: string; where: string }[] } }] });
const subjectQuality = () => ({ version: SUBJECT_QUALITY_BUNDLE_VERSION, quality: quality(),
  subject: { hideId: contract.hideId, subjectPolicy: "local-patch-subject/v2", checks: { photoLikeness: { status: "fail", observation: "The visible face does not match the supplied source." } },
    faults: [{ check: "photoLikeness", where: "The face at the table has different facial proportions." }] } });
function neighbors(): SourceNeighborAnswer { return { version: SOURCE_NEIGHBOR_ANSWER_VERSION,
  contractSha256: binding.contractSha256, candidateSha256: binding.candidateSha256,
  neighbors: [{ sourceId: "dough-maker", outcome: "preserved", status: "pass", after: [{ ref: "single-maker", rect: { left: 1065, top: 850, width: 70, height: 90 } }],
    remnants: "none", occluder: null, observation: "The source person has one coherent head and body, without another representation." }] }; }
const bundle = (assessment: Record<string, unknown> = quality()) => ({ version: SOURCE_NEIGHBOR_BUNDLE_VERSION, assessment, sourceNeighbors: neighbors() });
const expected = () => ({ contract: structuredClone(contract), binding: { ...binding } });
const read = (value: unknown, e = expected()) => readSourceNeighborQualityBundle(JSON.stringify(value), e);

describe("new quality/source-neighbor answer envelope", () => {
  it("keeps an entire plain quality assessment, including its evidence IDs and fields", () => {
    const original = quality(), result = read(bundle(original));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.assessment.kind).toBe("quality");
    expect(JSON.parse(result.assessment.raw)).toEqual(original);
    expect(result.sourceNeighbors.disposition).toBe("pass");
    expect(result.binding).toEqual(binding);
  });
  it("keeps BOTH documents of the original subject bundle and its original reader semantics", () => {
    const original = subjectQuality(), result = read(bundle(original));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.assessment.kind).toBe("quality-subject");
    expect(JSON.parse(result.assessment.raw)).toEqual(original);
    expect(readSubjectQualityBundle(result.assessment.raw)).toEqual(readSubjectQualityBundle(JSON.stringify(original)));
    expect(JSON.parse(readSubjectQualityBundle(result.assessment.raw)!.subject)).toEqual(original.subject);
  });
  it("keeps a reported duplicate as repair even when the quality assessment claims pass", () => {
    const value = bundle(); value.sourceNeighbors.neighbors[0]!.after.push({ ref: "shifted-copy", rect: { left: 1150, top: 850, width: 70, height: 90 } });
    const result = read(value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.parse(result.assessment.raw).hides[0].verdict.verdict).toBe("pass");
    expect(result.sourceNeighbors.disposition).toBe("repair");
    expect(result.sourceNeighbors.faults.map(f => f.code)).toContain("duplicated");
  });
  it("does not upgrade a failed quality assessment when source neighbors pass", () => {
    const assessment = quality(); assessment.hides[0]!.verdict.neighborsIntact = "fail";
    assessment.hides[0]!.verdict.verdict = "fail";
    assessment.hides[0]!.verdict.faults = [{ check: "neighborsIntact", where: "A neighboring arm is disconnected beside the target." }];
    const result = read(bundle(assessment));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.parse(result.assessment.raw)).toEqual(assessment);
    expect(result.sourceNeighbors.disposition).toBe("pass");
  });
  it("retains uncertainty independently of the original subject refusal", () => {
    const original = subjectQuality(), value = bundle(original); value.sourceNeighbors.neighbors[0]!.status = "unsure";
    const result = read(value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sourceNeighbors.disposition).toBe("unresolved");
    expect(JSON.parse(result.assessment.raw).subject.faults).toEqual(original.subject.faults);
  });
  it("permits complete removal without forcing the source crowd count to stay fixed", () => {
    const value = bundle(); value.sourceNeighbors.neighbors[0]!.outcome = "removed-whole";
    value.sourceNeighbors.neighbors[0]!.after = [];
    const result = read(value);
    expect(result.ok && result.sourceNeighbors.disposition).toBe("pass");
  });
  it.each([
    {}, { version: SOURCE_NEIGHBOR_BUNDLE_VERSION, assessment: quality() },
    { version: SOURCE_NEIGHBOR_BUNDLE_VERSION, sourceNeighbors: neighbors() },
    { ...bundle(), assessment: "quality text" }, { ...bundle(), assessment: [] },
    { ...bundle(), sourceNeighbors: null }, { ...bundle(), sourceNeighbors: [] },
    { ...bundle(), extra: true }, { ...bundle(), version: "quality-subject-answer/v1" },
    { ...bundle(), assessment: { hides: [] } },
    { ...bundle(), assessment: { version: "unknown-assessment", hides: quality().hides } },
    { ...bundle(), assessment: { version: SUBJECT_QUALITY_BUNDLE_VERSION, quality: quality() } },
    { ...bundle(), assessment: { version: SUBJECT_QUALITY_BUNDLE_VERSION, quality: {}, subject: {} } },
  ])("requires both complete named object documents and no extra outer keys", value => {
    expect(read(value)).toMatchObject({ ok: false, sourceNeighborDisposition: "unresolved" });
  });
  it.each([
    () => bundle(bundle()),
    () => bundle({ version: SUBJECT_QUALITY_BUNDLE_VERSION, quality: bundle(), subject: {} }),
    () => bundle({ version: SUBJECT_QUALITY_BUNDLE_VERSION, quality: quality(), subject: bundle() }),
    () => ({ ...bundle(), sourceNeighbors: bundle() }),
    () => bundle({ hides: [{ hidden: bundle() }] }),
  ])("rejects nested envelopes instead of extracting a convenient inner fragment", value => {
    expect(read(value())).toMatchObject({ ok: false, sourceNeighborDisposition: "unresolved", fault: { code: "nested-envelope" } });
  });
  it("rejects excessive nesting without recursing or losing the malformed-evidence classification", () => {
    let nested: Record<string, unknown> = { final: "value" };
    for (let i = 0; i < SOURCE_NEIGHBOR_QUALITY_BUNDLE_LIMITS.depth + 2; i++) nested = { child: nested };
    expect(read(bundle({ hides: [{ nested }] }))).toMatchObject({ ok: false, sourceNeighborDisposition: "unresolved", fault: { code: "depth" } });
  });
  it.each([
    (value: ReturnType<typeof bundle>) => { value.sourceNeighbors.candidateSha256 = "c".repeat(64); },
    (value: ReturnType<typeof bundle>) => { value.sourceNeighbors.contractSha256 = "c".repeat(64); },
    (value: ReturnType<typeof bundle>) => { value.sourceNeighbors.neighbors[0]!.sourceId = "unregistered"; },
    (value: ReturnType<typeof bundle>) => { value.sourceNeighbors.neighbors = []; },
    (value: ReturnType<typeof bundle>) => { value.sourceNeighbors.neighbors[0]!.observation = "x".repeat(SOURCE_NEIGHBOR_LIMITS.observation + 1); },
    (value: ReturnType<typeof bundle>) => { value.sourceNeighbors.neighbors[0]!.after[0]!.rect.left = 3830; },
  ])("delegates binding, source IDs, geometry and size rejection, never turning malformed evidence into repaint", change => {
    const value = bundle(); value.sourceNeighbors.neighbors[0]!.outcome = "duplicated"; change(value);
    expect(read(value)).toMatchObject({ ok: false, sourceNeighborDisposition: "unresolved", fault: { code: "neighbors" } });
  });
  it.each(["version", "policy", "reader", "contractSha256", "candidateSha256"] as const)("requires a valid prospective binding %s", key => {
    const e = expected(); e.binding[key] = "wrong" as never;
    expect(read(bundle(), e)).toMatchObject({ ok: false, sourceNeighborDisposition: "unresolved", fault: { code: "binding" } });
  });
  it("delegates verification of the contract's actual geometry/hash to the source-neighbor reader", () => {
    const e = expected(); e.contract.crop.left += 1;
    expect(read(bundle(), e)).toMatchObject({ ok: false, sourceNeighborDisposition: "unresolved", fault: { code: "neighbors", neighborFault: { code: "binding" } } });
  });
  it("reads a single complete fence; rejects prose, trailing documents and oversize input", () => {
    const raw = JSON.stringify(bundle());
    expect(readSourceNeighborQualityBundle(`\u0060\u0060\u0060json\n${raw}\n\u0060\u0060\u0060`, expected()).ok).toBe(true);
    for (const value of [null, "", "```json\n", `preface ${raw}`, `${raw} explanation`, `${raw}\n${raw}`,
      "x".repeat(SOURCE_NEIGHBOR_QUALITY_BUNDLE_LIMITS.raw + 1)]) {
      expect(readSourceNeighborQualityBundle(value, expected())).toMatchObject({ ok: false, sourceNeighborDisposition: "unresolved" });
    }
  });
  it("provides a closed versioned direction for the new question without omitting subject or relaxing neighbor evidence", () => {
    const direction = sourceNeighborQualityBundleDirection(binding);
    expect(direction).toContain(binding.contractSha256);
    expect(direction).toContain(binding.candidateSha256);
    expect(direction).toContain("BOTH quality and subject");
    expect(direction).toContain("original fragments plus a shifted copy");
    expect(() => sourceNeighborQualityBundleDirection({ ...binding, reader: "old-reader" } as unknown as SourceNeighborQualityBundleBinding)).toThrow();
  });
});
