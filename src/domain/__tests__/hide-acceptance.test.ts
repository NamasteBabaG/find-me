import { describe, expect, it } from "vitest";
import { HideDecisionSchema, effectiveAcceptance } from "../scene/hide-acceptance";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const decision = (over: Partial<Record<string, unknown>> = {}) => HideDecisionSchema.parse({
  hide: "giza-1", imageSha256: SHA_A, decidedBy: "human", decision: "accept",
  reason: "The cat moved a little and it still reads right.", decidedAt: "2026-09-10T18:00:00.000Z", ...over,
});

describe("who accepted a hide", () => {
  it("lets the judge decide when nobody has looked", () => {
    expect(effectiveAcceptance("pass", SHA_A)).toMatchObject({ accepted: true, by: "model" });
    for (const verdict of ["fail", "unsure", "none"] as const) {
      expect(effectiveAcceptance(verdict, SHA_A)).toMatchObject({ accepted: false, by: "nobody" });
    }
  });

  it("lets a person keep a picture the judge refused, and says it was a person", () => {
    // Two boards were kept this way. Written as `verdict: "pass"` they became
    // indistinguishable from a model approval, and the judge's real hit rate
    // became impossible to measure.
    const kept = effectiveAcceptance("fail", SHA_A, [decision()]);
    expect(kept.accepted).toBe(true);
    expect(kept.by).toBe("human");
    expect(kept.reason).toMatch(/kept by a person/);
  });

  it("lets a person refuse a picture the judge passed", () => {
    const refused = effectiveAcceptance("pass", SHA_A, [decision({ decision: "reject", reason: "Her face is smeared at this size." })]);
    expect(refused).toMatchObject({ accepted: false, by: "human" });
    expect(refused.reason).toMatch(/refused by a person/);
  });

  it("does not let an approval travel to a different picture", () => {
    // The point of binding a decision to a hash: re-render the spot and the old
    // approval stops applying, rather than quietly blessing a render nobody saw.
    expect(effectiveAcceptance("fail", SHA_B, [decision()])).toMatchObject({ accepted: false, by: "nobody" });
    expect(effectiveAcceptance("pass", SHA_B, [decision({ decision: "reject", reason: "no" })])).toMatchObject({ accepted: true, by: "model" });
  });

  it("takes the latest decision about that picture, keeping the earlier one on the record", () => {
    const decisions = [
      decision({ decision: "accept", reason: "Looked fine on the phone.", decidedAt: "2026-09-10T18:00:00.000Z" }),
      decision({ decision: "reject", reason: "On the big screen her hand is wrong.", decidedAt: "2026-09-10T21:00:00.000Z" }),
    ];
    expect(effectiveAcceptance("pass", SHA_A, decisions)).toMatchObject({ accepted: false, by: "human" });
    // Order of arrival must not decide it; the timestamps do.
    expect(effectiveAcceptance("pass", SHA_A, [...decisions].reverse())).toMatchObject({ accepted: false, by: "human" });
  });

  it("insists a decision says which picture, who, why and when", () => {
    expect(() => HideDecisionSchema.parse({ ...decision(), imageSha256: "short" })).toThrow();
    expect(() => HideDecisionSchema.parse({ ...decision(), reason: "" })).toThrow();
    expect(() => HideDecisionSchema.parse({ ...decision(), decidedAt: "yesterday" })).toThrow();
    // A model may not sign a human decision: that is the laundering this prevents.
    expect(() => HideDecisionSchema.parse({ ...decision(), decidedBy: "model" })).toThrow();
  });
});
