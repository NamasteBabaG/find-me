import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assertPreservedV10Outcomes, inspectTerminalV10RepairSnapshot } from "../../../scripts/lib/terminal-v10-repair-preflight";

const boards = ["newyork", "amazon", "paris", "marrakech", "giza", "tokyo", "greatwall", "sydney", "antarctica"];
function fixture() {
  return boards.flatMap(board => [1, 2, 3].map(n => {
    const failed = board === "giza" && n === 2 || board === "antarctica" && n === 3;
    return { board, sceneVersion: 10, targetId: `hide-${n}`, variant: "A", status: failed ? "FAILED" : "GENERATED",
      assetId: `${board}-${n}`, mimeType: "image/png", width: 512, height: 768,
      rectJson: JSON.stringify({ x: 0.1, y: 0.1, w: 512 / 3840, h: 768 / 2160 }),
      judgeJson: JSON.stringify({ compositionVersion: "bounded-return/v3-head-safe-axis", hide: `${board}-v10-${n}` }),
      rejectedAssetIdsJson: failed ? JSON.stringify([`${board}-${n}-1`, `${board}-${n}-2`, `${board}-${n}`]) : null as string | null,
      opaqueEvidence: "keep every exported field" };
  }));
}
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const inspect = (rows: ReturnType<typeof fixture>) => { const raw = JSON.stringify(rows); return inspectTerminalV10RepairSnapshot(raw, digest(raw)); };

describe("offline terminal v10 repair inventory, not execution authority", () => {
  it("pins 25 unchanged outputs and only the two failures without mutating input", () => {
    const rows = fixture(), before = JSON.stringify(rows), plan = inspect(rows);
    expect(plan.preserved).toHaveLength(25);
    expect(plan.selected).toEqual(["antarctica/hide-3/A", "giza/hide-2/A"]);
    expect(plan).toMatchObject({ canExecute: false, liveStateVerified: false, visualAcceptance: "not-assessed" });
    expect(plan.requiredBeforePurchase).toContain("explicit-bounded-authorization");
    expect(JSON.stringify(rows)).toBe(before);
    expect(() => assertPreservedV10Outcomes(plan, before)).not.toThrow();
  });
  it("rejects changed bytes, malformed hashes and malformed JSON", () => {
    const raw = JSON.stringify(fixture());
    expect(() => inspectTerminalV10RepairSnapshot(raw + " ", digest(raw))).toThrow();
    expect(() => inspectTerminalV10RepairSnapshot(raw, "")).toThrow();
    expect(() => inspectTerminalV10RepairSnapshot("{", digest("{"))).toThrow();
  });
  it.each(["scene", "scope", "duplicate", "count", "variant", "composition", "judge-hide", "attempts", "geometry"])("rejects invalid %s", fault => {
    const rows = fixture(), first = rows[0]!;
    if (fault === "scene") first.sceneVersion = 9;
    if (fault === "scope") first.status = "FAILED";
    if (fault === "duplicate") rows[1] = { ...first };
    if (fault === "count") rows.pop();
    if (fault === "variant") first.variant = "B";
    if (fault === "composition") first.judgeJson = JSON.stringify({ compositionVersion: "legacy", hide: "newyork-v10-1" });
    if (fault === "judge-hide") first.judgeJson = JSON.stringify({ compositionVersion: "bounded-return/v3-head-safe-axis", hide: "newyork-v10-2" });
    if (fault === "attempts") rows.find(r => r.status === "FAILED")!.rejectedAssetIdsJson = '["x","x","x"]';
    if (fault === "geometry") first.rectJson = JSON.stringify({ x: 0.9, y: 0, w: 512 / 3840, h: 768 / 2160 });
    expect(() => inspect(rows)).toThrow();
  });
  it("pins opaque metadata as well as assets and rejects any sibling modification", () => {
    const rows = fixture(), plan = inspect(rows);
    rows[0]!.opaqueEvidence = "changed review";
    expect(() => assertPreservedV10Outcomes(plan, JSON.stringify(rows))).toThrow(/unselected outcome/);
  });
  it("allows selected rows to differ without declaring replacements acceptable", () => {
    const rows = fixture(), plan = inspect(rows);
    rows.find(r => r.status === "FAILED")!.assetId = "synthetic-candidate";
    expect(() => assertPreservedV10Outcomes(plan, JSON.stringify(rows))).not.toThrow();
    expect(plan.canExecute).toBe(false);
  });
  it("retains the same preservation pins if the snapshot row ordering differs", () => {
    const rows = fixture();
    expect(inspect(rows).preservedSha256).toBe(inspect([...rows].reverse()).preservedSha256);
  });
  it("accepts a failed seam with retained attempts but no shipping asset; not a GENERATED row", () => {
    const rows = fixture(), failedIndex = rows.findIndex(r => r.status === "FAILED");
    const withNulls = (index: number) => JSON.stringify(rows.map((row, i) => i !== index ? row : {
      ...row, assetId: null, rectJson: null, mimeType: null, width: null, height: null,
    }));
    const raw = withNulls(failedIndex);
    expect(inspectTerminalV10RepairSnapshot(raw, digest(raw)).canExecute).toBe(false);
    const invalid = withNulls(0);
    expect(() => inspectTerminalV10RepairSnapshot(invalid, digest(invalid))).toThrow(/metadata/);
  });
});
