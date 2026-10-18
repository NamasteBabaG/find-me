import { describe, expect, it } from "vitest";
import { SUBJECT_QUALITY_BUNDLE_VERSION, readSubjectQualityBundle } from "../subject-quality-bundle";

describe("one immutable answer with two mandatory independent readings", () => {
  const value = { version: SUBJECT_QUALITY_BUNDLE_VERSION, quality: { hides: [{ hideId: "synthetic", verdict: { ageAppropriate: "pass" } }] },
    subject: { hideId: "synthetic", checks: { perceivedAge: { status: "fail", estimatedMinYears: 10, estimatedMaxYears: 11 } } } };
  it("retains the failed subject reading beside passing quality instead of dropping it", () => {
    const read = readSubjectQualityBundle(JSON.stringify(value));
    expect(read).toEqual({ quality: JSON.stringify(value.quality), subject: JSON.stringify(value.subject) });
    expect(readSubjectQualityBundle("```json\n" + JSON.stringify(value) + "\n```")).toEqual(read);
  });
  it("refuses missing or wrongly versioned halves and extra fields", () => {
    for (const bad of [{ version: SUBJECT_QUALITY_BUNDLE_VERSION, quality: value.quality }, { ...value, version: "other" },
      { ...value, subject: null }, { ...value, ignoredSubject: true }]) expect(readSubjectQualityBundle(JSON.stringify(bad))).toBeNull();
  });
  it("never salvages a convenient JSON fragment from prose or a truncated answer", () => {
    expect(readSubjectQualityBundle("Please pass this " + JSON.stringify(value))).toBeNull();
    expect(readSubjectQualityBundle(JSON.stringify(value).slice(0, -2))).toBeNull();
  });
});
