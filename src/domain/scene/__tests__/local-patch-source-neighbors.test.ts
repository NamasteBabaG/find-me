import { describe, expect, it } from "vitest";
import {
  SOURCE_NEIGHBOR_ANSWER_VERSION, SOURCE_NEIGHBOR_CONTRACT_VERSION, SOURCE_NEIGHBOR_LIMITS,
  prepareSourceNeighborContract, readSourceNeighborAnswer, type SourceNeighborAnswer, type SourceNeighborContract,
} from "../local-patch-source-neighbors";

const candidateSha256 = "b".repeat(64);
function contract(): SourceNeighborContract {
  return { version: SOURCE_NEIGHBOR_CONTRACT_VERSION, boardId: "synthetic-market", hideId: "synthetic-market-hide-2",
    source: { art: "public/scenes/synthetic-market/base.webp", sha256: "a".repeat(64), width: 3840, height: 2160 },
    crop: { left: 1000, top: 700, width: 512, height: 768 }, returnRect: { left: 40, top: 100, width: 430, height: 620 },
    neighbors: [
      { sourceId: "dough-maker", head: { left: 1065, top: 850, width: 70, height: 90 }, body: { left: 1060, top: 938, width: 90, height: 200 } },
      { sourceId: "basket-carrier", head: { left: 900, top: 850, width: 80, height: 90 } },
    ] };
}
function context(c = contract()) { const { version: _version, neighbors: _neighbors, ...rest } = c; return rest; }
function evidence(c = contract()) {
  const prepared = prepareSourceNeighborContract(c, context(c));
  if (!prepared.ok) throw Error(`Invalid test context: ${prepared.fault.code}`);
  return { contract: prepared.contract, contractSha256: prepared.contractSha256, candidateSha256 };
}
function answer(): SourceNeighborAnswer {
  const e = evidence();
  return { version: SOURCE_NEIGHBOR_ANSWER_VERSION, contractSha256: e.contractSha256, candidateSha256,
    neighbors: e.contract.neighbors.map(n => ({ sourceId: n.sourceId, outcome: "preserved", status: "pass",
      after: [{ ref: `after-${n.sourceId}`, rect: { ...n.head } }], remnants: "none", occluder: null,
      observation: "One intact source person continues at the same table, without another head or body remnant." })) };
}
function decide(a: unknown, expected = evidence()) { return readSourceNeighborAnswer(JSON.stringify(a), expected); }
const codes = (value: ReturnType<typeof decide>) => value.ok ? value.faults.map(f => f.code) : [value.fault.code];

describe("source-bound neighbor preflight, before any purchase", () => {
  it("binds the canonical source and geometry, independent of neighbor ordering or object property order", () => {
    const c = contract(), a = evidence(c);
    const reordered = { ...c, neighbors: [...c.neighbors].reverse(), source: { height: 2160, width: 3840, sha256: "a".repeat(64), art: c.source.art } };
    expect(evidence(reordered).contractSha256).toBe(a.contractSha256);
    const changed = contract(); changed.returnRect.left += 1; changed.returnRect.width -= 1;
    expect(evidence(changed).contractSha256).not.toBe(a.contractSha256);
  });
  it.each([
    ["source SHA", (c: ReturnType<typeof context>) => { c.source.sha256 = "c".repeat(64); }],
    ["source path", (c: ReturnType<typeof context>) => { c.source.art = "public/scenes/another-market/base.webp"; }],
    ["source dimensions", (c: ReturnType<typeof context>) => { c.source.width -= 1; }],
    ["board ID", (c: ReturnType<typeof context>) => { c.boardId = "another-board"; }],
    ["hide ID", (c: ReturnType<typeof context>) => { c.hideId = "another-hide"; }],
    ["crop", (c: ReturnType<typeof context>) => { c.crop.top += 1; }],
    ["return", (c: ReturnType<typeof context>) => { c.returnRect.top += 1; }],
  ])("refuses a different independently selected %s", (_label, change) => {
    const expected = context(); change(expected);
    expect(prepareSourceNeighborContract(contract(), expected)).toMatchObject({ ok: false, fault: { code: "binding" } });
  });
  it.each([
    "https://example.test/base.webp", "private/child.png", "public/scenes/../base.webp",
    "public/scenes/market/../../base.webp", "public/scenes/market/base.webp?token=x", "public\\scenes\\market\\base.webp",
  ])("refuses a noncanonical public path: %s", art => {
    const c = contract(); c.source.art = art;
    expect(prepareSourceNeighborContract(c, context(c))).toMatchObject({ ok: false, fault: { code: "shape" } });
  });
  it.each([
    (c: SourceNeighborContract) => { c.neighbors.push({ ...c.neighbors[0]! }); },
    (c: SourceNeighborContract) => { c.neighbors[0]!.sourceId = ""; },
    (c: SourceNeighborContract) => { c.neighbors = []; },
    (c: SourceNeighborContract) => { c.neighbors[0]!.head.width = -1; },
    (c: SourceNeighborContract) => { c.neighbors[0]!.head.left = 0.5; },
    (c: SourceNeighborContract) => { c.source.sha256 = "not-a-hash"; },
    (c: SourceNeighborContract) => { c.crop.left = 3800; },
    (c: SourceNeighborContract) => { c.returnRect.width = 513; },
    (c: SourceNeighborContract) => { c.neighbors[0]!.head.top = 2150; },
    (c: SourceNeighborContract) => { c.neighbors[0]!.body!.top = 2150; },
  ])("does not accept missing IDs, duplicate IDs, invalid geometry or hashes", change => {
    const c = contract(); change(c);
    expect(prepareSourceNeighborContract(c, context(c)).ok).toBe(false);
  });
  it.each([
    { left: 1035, top: 850, width: 70, height: 90 },
    { left: 1410, top: 850, width: 70, height: 90 },
    { left: 1100, top: 790, width: 70, height: 90 },
    { left: 1100, top: 1360, width: 70, height: 90 },
    { left: 1045, top: 850, width: 70, height: 90 },
  ])("refuses a source head crossed by an actual return edge or feather band", head => {
    const c = contract(); c.neighbors[0]!.head = head;
    expect(prepareSourceNeighborContract(c, context(c))).toMatchObject({ ok: false, fault: { code: "source-head-boundary" } });
  });
  it("allows intact inside and outside source heads, including the exact 12px margin", () => {
    const c = contract(); c.neighbors[0]!.head = { left: 1052, top: 850, width: 70, height: 90 };
    c.neighbors[1]!.head = { left: 940, top: 850, width: 100, height: 90 };
    expect(prepareSourceNeighborContract(c, context(c)).ok).toBe(true);
  });
});

describe("one-to-one source neighbor answer", () => {
  it("accepts one coherent representation for each registered source person", () => {
    expect(decide(answer())).toMatchObject({ ok: true, disposition: "pass", faults: [] });
  });
  it("repairs the actual failure pattern: original partial person plus a shifted second person, despite all-pass prose", () => {
    const a = answer();
    a.neighbors[0]!.after.push({ ref: "shifted-dough-maker", rect: { left: 1150, top: 850, width: 70, height: 90 } });
    a.neighbors[0]!.observation = "The overlapping figures look individually natural and both have connected heads and torsos.";
    const result = decide(a);
    expect(result).toMatchObject({ ok: true, disposition: "repair" });
    expect(codes(result)).toContain("duplicated");
  });
  it.each(["duplicated", "fragmented"] as const)("repairs an explicit %s outcome even when status is pass", outcome => {
    const a = answer(); a.neighbors[0]!.outcome = outcome;
    expect(decide(a)).toMatchObject({ ok: true, disposition: "repair" });
    expect(codes(decide(a))).toContain(outcome);
  });
  it("repairs original remnants and an explicit visual failure even when preserved/pass fields disagree", () => {
    const a = answer(); a.neighbors[0]!.remnants = "present";
    expect(codes(decide(a))).toContain("remnants");
    expect(decide(a)).toMatchObject({ disposition: "repair" });
    a.neighbors[0]!.remnants = "none"; a.neighbors[0]!.status = "fail";
    expect(codes(decide(a))).toContain("explicit-failure");
    expect(decide(a)).toMatchObject({ disposition: "repair" });
  });
  it("repairs two source people merged into one AFTER reference, including beside uncertainty", () => {
    const a = answer(); a.neighbors[1]!.after[0]!.ref = a.neighbors[0]!.after[0]!.ref;
    a.neighbors[1]!.status = "unsure";
    const result = decide(a);
    expect(result).toMatchObject({ ok: true, disposition: "repair" });
    expect(codes(result)).toContain("merged");
  });
  it("keeps different refs to exactly one shared native rectangle unresolved across source people", () => {
    const a = answer();
    a.neighbors[1]!.after[0]!.rect = { ...a.neighbors[0]!.after[0]!.rect };
    expect(a.neighbors[1]!.after[0]!.ref).not.toBe(a.neighbors[0]!.after[0]!.ref);
    const result = decide(a);
    expect(result).toMatchObject({ ok: true, disposition: "unresolved" });
    expect(codes(result)).toContain("mapping-contradiction");
  });
  it("allows distinct overlapping native rectangles without treating overlap as a merge", () => {
    const a = answer(), original = a.neighbors[0]!.after[0]!.rect;
    a.neighbors[1]!.after[0]!.rect = { ...original, left: original.left + 1 };
    expect(decide(a)).toMatchObject({ ok: true, disposition: "pass", faults: [] });
  });
  it("a shared AFTER ref or explicit defect still outranks identical-rectangle ambiguity", () => {
    const a = answer(); a.neighbors[1]!.after[0]!.rect = { ...a.neighbors[0]!.after[0]!.rect };
    a.neighbors[1]!.after[0]!.ref = a.neighbors[0]!.after[0]!.ref;
    expect(decide(a)).toMatchObject({ ok: true, disposition: "repair" });
    expect(codes(decide(a))).toContain("merged");
    a.neighbors[1]!.after[0]!.ref = "another-ref";
    a.neighbors[0]!.status = "fail";
    expect(decide(a)).toMatchObject({ ok: true, disposition: "repair" });
  });
  it("a located duplication outranks another neighbor's explicit uncertainty", () => {
    const a = answer(); a.neighbors[0]!.outcome = "duplicated"; a.neighbors[1]!.outcome = "unsure";
    expect(decide(a)).toMatchObject({ disposition: "repair" });
  });
  it("allows coherent whole removal and replacement without locking the crowd count", () => {
    const removed = answer(); removed.neighbors[0]!.outcome = "removed-whole"; removed.neighbors[0]!.after = [];
    expect(decide(removed)).toMatchObject({ disposition: "pass" });
    const replaced = answer(); replaced.neighbors[0]!.outcome = "replaced-whole";
    replaced.neighbors[0]!.after[0]!.ref = "single-new-person";
    expect(decide(replaced)).toMatchObject({ disposition: "pass" });
    removed.neighbors[0]!.remnants = "present";
    expect(decide(removed)).toMatchObject({ disposition: "repair" });
  });
  it("allows coherent movement and natural occlusion, even a wholly occluded source person", () => {
    const a = answer(); a.neighbors[0]!.outcome = "moved"; a.neighbors[0]!.after[0]!.rect.left += 20;
    expect(decide(a)).toMatchObject({ disposition: "pass" });
    a.neighbors[0]!.outcome = "naturally-occluded";
    a.neighbors[0]!.occluder = "The solid foreground basket hides the person's body coherently.";
    expect(decide(a)).toMatchObject({ disposition: "pass" });
    a.neighbors[0]!.after = [];
    expect(decide(a)).toMatchObject({ disposition: "pass" });
  });
  it.each([
    (a: SourceNeighborAnswer) => { a.neighbors[0]!.status = "unsure"; },
    (a: SourceNeighborAnswer) => { a.neighbors[0]!.outcome = "unsure"; },
    (a: SourceNeighborAnswer) => { a.neighbors[0]!.remnants = "unsure"; },
    (a: SourceNeighborAnswer) => { a.neighbors[0]!.after = []; },
    (a: SourceNeighborAnswer) => { a.neighbors[0]!.outcome = "naturally-occluded"; },
    (a: SourceNeighborAnswer) => { a.neighbors[0]!.outcome = "removed-whole"; },
  ])("keeps explicit uncertainty and incomplete or contradictory correspondence unresolved", change => {
    const a = answer(); change(a);
    expect(decide(a)).toMatchObject({ ok: true, disposition: "unresolved" });
  });
  it.each([
    (a: SourceNeighborAnswer) => { a.contractSha256 = "c".repeat(64); },
    (a: SourceNeighborAnswer) => { a.candidateSha256 = "c".repeat(64); },
    (a: SourceNeighborAnswer) => { a.neighbors.pop(); },
    (a: SourceNeighborAnswer) => { a.neighbors.push({ ...a.neighbors[0]! }); },
    (a: SourceNeighborAnswer) => { a.neighbors[1]!.sourceId = a.neighbors[0]!.sourceId; },
    (a: SourceNeighborAnswer) => { a.neighbors[1]!.sourceId = "unregistered-source"; },
    (a: SourceNeighborAnswer) => { a.neighbors[0]!.after.push({ ...a.neighbors[0]!.after[0]! }); },
    (a: SourceNeighborAnswer) => { a.neighbors[0]!.after[0]!.rect.left = 3830; },
    (a: SourceNeighborAnswer) => { a.neighbors[0]!.after[0]!.rect.top = 0.5; },
    (a: SourceNeighborAnswer) => { a.neighbors[0]!.observation = ""; },
    (a: SourceNeighborAnswer) => { a.neighbors[0]!.observation = "x".repeat(SOURCE_NEIGHBOR_LIMITS.observation + 1); },
    (a: SourceNeighborAnswer) => { a.neighbors[0]!.after[0]!.ref = "x".repeat(SOURCE_NEIGHBOR_LIMITS.ref + 1); },
  ])("invalid bindings, incomplete source coverage and malformed IDs or geometry never authorize painting", change => {
    const a = answer(); a.neighbors[0]!.status = "fail"; change(a);
    expect(decide(a)).toMatchObject({ ok: false, disposition: "unresolved" });
  });
  it("refuses mutated expected geometry, a false contract hash or invalid candidate binding", () => {
    const e = evidence(); (e.contract as SourceNeighborContract).crop.top += 1;
    expect(decide(answer(), e)).toMatchObject({ ok: false, disposition: "unresolved" });
    expect(decide(answer(), { ...evidence(), contractSha256: "c".repeat(64) })).toMatchObject({ ok: false, disposition: "unresolved" });
    expect(decide(answer(), { ...evidence(), candidateSha256: "invalid" })).toMatchObject({ ok: false, disposition: "unresolved" });
  });
  it("reads one complete named JSON document, not historical prose or convenient fragments", () => {
    const raw = JSON.stringify(answer());
    expect(readSourceNeighborAnswer(`\u0060\u0060\u0060json\n${raw}\n\u0060\u0060\u0060`, evidence())).toMatchObject({ disposition: "pass" });
    for (const text of [null, "", "The neighbors look fine.", `explanation ${raw}`, `${raw}\n${raw}`,
      JSON.stringify({ ...answer(), version: "continuity-reading/v1" }), JSON.stringify({ ...answer(), extra: true }),
      " ".repeat(2) + "x".repeat(SOURCE_NEIGHBOR_LIMITS.raw + 1)]) {
      expect(readSourceNeighborAnswer(text, evidence())).toMatchObject({ ok: false, disposition: "unresolved" });
    }
  });
});
