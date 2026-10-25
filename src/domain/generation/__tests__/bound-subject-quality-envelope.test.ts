import { describe, expect, it } from "vitest";
import { readSubjectQualityBundle, SUBJECT_QUALITY_BUNDLE_VERSION } from "../subject-quality-bundle";
import { readBoundSubjectQualityEnvelope } from "../bound-subject-quality-envelope";

const binding = { version: SUBJECT_QUALITY_BUNDLE_VERSION, photoSha256: "a".repeat(64), planSha256: "b".repeat(64), subjectPolicy: "local-patch-subject/v2" as const };
const quality = { hides: [{ hideId: "paris-v12-3", verdict: { childPresent: "pass", childComplete: "pass", severeSeam: "fail",
  faults: [{ check: "severeSeam", where: "The table edge has a located doubled contour at the left join." }] } }] };
const subject = { hideId: "paris-v12-3", subjectPolicy: binding.subjectPolicy,
  checks: { perceivedAge: { status: "unsure", estimatedMinYears: 6, estimatedMaxYears: 11, observation: "The visible body cannot narrow the age sufficiently." } }, faults: [] };
const canonical = { version: binding.version, quality, subject };
const echoed = () => ({ ...canonical, photoSha256: binding.photoSha256, planSha256: binding.planSha256, subjectPolicy: binding.subjectPolicy });
describe("exact bound MEDIUM metadata echo", () => {
  it("reads the complete paid response without discarding a failed or uncertain inner check", () => {
    const raw = JSON.stringify(echoed()); expect(readSubjectQualityBundle(raw)).toBeNull();
    const read = readBoundSubjectQualityEnvelope(raw, binding); expect(read).not.toBeNull();
    expect(JSON.parse(read!.quality)).toEqual(quality); expect(JSON.parse(read!.subject)).toEqual(subject);
  });
  it("preserves the historical canonical interpretation and optional JSON fence", () => {
    const raw = JSON.stringify(canonical); expect(readBoundSubjectQualityEnvelope(raw, binding)).toEqual(readSubjectQualityBundle(raw));
    expect(readBoundSubjectQualityEnvelope("```json\n"+JSON.stringify(echoed())+"\n```", binding)).not.toBeNull();
  });
  it.each(["photoSha256", "planSha256", "subjectPolicy"])("refuses a conflicting %s rather than relabeling it", key => {
    const doc = { ...echoed(), [key]: key === "subjectPolicy" ? "local-patch-subject/v1" : "c".repeat(64) };
    expect(readBoundSubjectQualityEnvelope(JSON.stringify(doc), binding)).toBeNull();
  });
  it.each(["photoSha256", "planSha256", "subjectPolicy"])("refuses partial echoes missing %s", key => {
    const doc: Record<string, unknown> = echoed(); delete doc[key]; expect(readBoundSubjectQualityEnvelope(JSON.stringify(doc), binding)).toBeNull();
  });
  it("refuses foreign extra fields, inner policy conflict, prose, and the wrong binding version", () => {
    expect(readBoundSubjectQualityEnvelope(JSON.stringify({ ...echoed(), approved: true }), binding)).toBeNull();
    expect(readBoundSubjectQualityEnvelope(JSON.stringify({ ...echoed(), subject: { ...subject, subjectPolicy: "local-patch-subject/v1" } }), binding)).toBeNull();
    expect(readBoundSubjectQualityEnvelope("The answer is "+JSON.stringify(echoed()), binding)).toBeNull();
    expect(readBoundSubjectQualityEnvelope(JSON.stringify(echoed()), { ...binding, subjectPolicy: undefined })).toBeNull();
  });
});
