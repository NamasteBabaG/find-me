import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { SOURCE_PLACEMENT_BASE, SOURCE_PLACEMENT_RELEASE, SOURCE_PLACEMENT_RELEASE_SHA256,
  assertSourcePlacementReleaseHash } from "../../../../content/adventures/source-placement-release";
import { cropOf, maskForHide, type LocalPatchBoard } from "../local-patch-hides";
import { localPatchReturnRegion, sourceHeadIntersectsReturnBoundary } from "../local-patch-return-region";
import { materializeSourcePlacementRelease, sourcePlacementCanonical, sourcePlacementRecoveryGeometryAllowed,
  sourcePlacementSha256, validateSourcePlacementRelease, type SourcePlacementBaseBoard,
  type SourcePlacementManifest, type SourcePlacementOverride } from "../source-placement-release";

function fixture() {
  const board: LocalPatchBoard = { board: "synthetic-market", art: "public/scenes/synthetic-market/base.webp",
    ground: "the same stone pavement", sittable: true, hides: [100, 1100, 2200].map((left, i) => ({
      id: `synthetic-market-v12-${i + 1}`, targetId: `target-${i + 1}`, pose: "standing" as const, left, top: 500,
      mask: { left: 108, top: 208, width: 296, height: 350 },
    })) };
  const base: SourcePlacementBaseBoard[] = [{ board, sceneVersion: 12,
    source: { art: board.art, sha256: "a".repeat(64), width: 3840, height: 2160 } }];
  const override: SourcePlacementOverride = { boardId: board.board, hideId: board.hides[1]!.id,
    child: { left: 108, top: 208, width: 256, height: 350 },
    returnRect: { left: 66, top: 136, width: 312, height: 632 },
    neighbors: [
      { sourceId: "source-child", head: { left: 1270, top: 800, width: 70, height: 90 } },
      { sourceId: "left-elder", head: { left: 1000, top: 800, width: 100, height: 110 } },
    ] };
  return { board, base, override };
}
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function manifest() { const f = fixture(); return { ...f, manifest: materializeSourcePlacementRelease({
  releaseId: "synthetic-release-v1", base: f.base, overrides: [f.override],
}) }; }

describe("prospective materialized source/placement release", () => {
  it("materializes every hide without changing the original board or recipe fields", () => {
    const f = fixture(), original = sourcePlacementCanonical(f.base);
    const m = materializeSourcePlacementRelease({ releaseId: "synthetic-release-v1", base: f.base, overrides: [f.override] });
    expect(sourcePlacementCanonical(f.base)).toBe(original);
    expect(m.inventory).toHaveLength(3);
    expect(m.inventory.filter(h => h.sourceNeighbors).map(h => h.hideId)).toEqual([f.override.hideId]);
    for (const entry of m.inventory) {
      if (entry.hideId !== f.override.hideId) expect(entry.effective).toEqual(entry.base);
      expect(entry.effective.crop).toEqual(entry.base.crop);
    }
    const changed = m.inventory.find(e => e.hideId === f.override.hideId)!;
    expect(changed.base.child.width).toBe(296);
    expect(changed.effective.child.width).toBe(256);
    expect(changed.sourceNeighbors!.contractSha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it("uses stable canonical bytes, complete inventory and original placement digests", () => {
    const f = manifest(), reordered = copy(f.manifest);
    reordered.inventory.reverse();
    expect(sourcePlacementSha256(validateSourcePlacementRelease(reordered, f.base))).toBe(sourcePlacementSha256(f.manifest));
    expect(sourcePlacementSha256({ b: 2, a: 1 })).toBe(sourcePlacementSha256({ a: 1, b: 2 }));
    const changedBase = copy(f.base); changedBase[0]!.board.hides[0]!.pose = "walking";
    expect(() => validateSourcePlacementRelease(f.manifest, changedBase)).toThrow("base placement/source changed");
  });
  it.each([
    ["omitted hide", (m: SourcePlacementManifest) => { m.inventory.pop(); }],
    ["duplicated hide", (m: SourcePlacementManifest) => { m.inventory[2] = copy(m.inventory[0]!); }],
    ["foreign hide", (m: SourcePlacementManifest) => { m.inventory[0]!.hideId = "foreign-hide"; }],
    ["source hash", (m: SourcePlacementManifest) => { m.inventory[0]!.source.sha256 = "b".repeat(64); }],
    ["source dimensions", (m: SourcePlacementManifest) => { m.inventory[0]!.source.width = 3072; }],
    ["base geometry", (m: SourcePlacementManifest) => { m.inventory[0]!.base.child.width -= 1; }],
    ["base digest", (m: SourcePlacementManifest) => { m.inventory[0]!.basePlacementSha256 = "b".repeat(64); }],
    ["moved crop", (m: SourcePlacementManifest) => { m.inventory[1]!.effective.crop.left += 1; }],
    ["missing coverage", (m: SourcePlacementManifest) => { m.inventory[1]!.sourceNeighbors = null; }],
    ["stale annotation hash", (m: SourcePlacementManifest) => { m.inventory[1]!.sourceNeighbors!.contractSha256 = "c".repeat(64); }],
    ["unlisted coverage claim", (m: SourcePlacementManifest) => { m.inventory[0]!.recovery.sourceHeads = "intact-at-boundary"; }],
    ["softened recovery feather", (m: SourcePlacementManifest) => { (m.inventory[1]!.recovery as {minimumFeather:number}).minimumFeather = 6; }],
  ])("refuses %s rather than falling back to original geometry", (_name, change) => {
    const f = manifest(), changed = copy(f.manifest); change(changed);
    expect(() => validateSourcePlacementRelease(changed, f.base)).toThrow();
  });
  it("refuses the same hide ID under another board before constructing service lookup authority", () => {
    const f = fixture(), another = copy(f.base[0]!);
    another.board.board = "synthetic-other";
    expect(() => materializeSourcePlacementRelease({ releaseId: "synthetic-release-v1",
      base: [...f.base, another], overrides: [] })).toThrow("duplicate base hide");
  });
  it("refuses annotations whose source head crosses a return edge before purchase", () => {
    const f = fixture(); f.override.neighbors[0]!.head.left = 1150;
    expect(() => materializeSourcePlacementRelease({ releaseId: "synthetic-release-v1",
      base: f.base, overrides: [f.override] })).toThrow("source-head-boundary");
  });
  it("refuses an authored child without the full 12px safe margin", () => {
    const f = fixture(); f.override.returnRect.width = 300;
    expect(() => materializeSourcePlacementRelease({ releaseId: "synthetic-release-v1",
      base: f.base, overrides: [f.override] })).toThrow("safe seam margin");
  });
  it("checks all sibling crops after the effective envelope changes", () => {
    const f = fixture();
    f.base[0]!.board.hides[2]!.left = 1510;
    // Original hide2 child ends1504, before sibling crop1510; sibling child
    // starts1710, after hide2 crop1612. The original board is therefore valid.
    f.base[0]!.board.hides[2]!.mask = { left: 200, top: 208, width: 296, height: 350 };
    // Expand the effective child into the third crop; no semantic model can waive this.
    f.override.child = { left: 108, top: 208, width: 384, height: 350 };
    f.override.returnRect = { left: 66, top: 136, width: 446, height: 632 };
    expect(() => materializeSourcePlacementRelease({ releaseId: "synthetic-original", base: f.base, overrides: [] })).not.toThrow();
    expect(() => materializeSourcePlacementRelease({ releaseId: "synthetic-release-v1", base: f.base, overrides: [f.override] })).toThrow();
  });
});

describe("derived recovery keeps the authoritative source boundaries", () => {
  it("accepts the exact authored geometry and a safe shrink under the same annotations", () => {
    const m = manifest(), c = m.manifest.inventory.find(e => e.sourceNeighbors)!;
    expect(sourcePlacementRecoveryGeometryAllowed(c, c.effective)).toBe(true);
    const shrink = copy(c.effective); shrink.child.width -= 10; shrink.returnRect.width -= 5;
    expect(sourcePlacementRecoveryGeometryAllowed(c, shrink)).toBe(true);
  });
  it.each(["crop", "child", "return"] as const)("refuses a larger or moved %s", changed => {
    const m = manifest(), c = m.manifest.inventory.find(e => e.sourceNeighbors)!, g = copy(c.effective);
    if (changed === "crop") g.crop.left += 1;
    if (changed === "child") g.child.width += 1;
    if (changed === "return") g.returnRect.width += 1;
    expect(sourcePlacementRecoveryGeometryAllowed(c, g)).toBe(false);
  });
  it("refuses a recovery edge through an annotated head and does not invent coverage for other hides", () => {
    const m = manifest(), c = m.manifest.inventory.find(e => e.sourceNeighbors)!, g = copy(c.effective);
    g.child = { left: 210, top: 350, width: 80, height: 120 };
    g.returnRect = { left: 200, top: 300, width: 178, height: 468 };
    expect(sourcePlacementRecoveryGeometryAllowed(c, g)).toBe(false);
    const unlisted = m.manifest.inventory.find(e => !e.sourceNeighbors)!;
    expect(sourcePlacementRecoveryGeometryAllowed(unlisted, unlisted.effective)).toBe(false);
  });
});

describe("tracked complete v12 release and measured public source geometry", () => {
  it("freezes all18 boards/all54 hides, preserving53 exact base geometries", () => {
    assertSourcePlacementReleaseHash();
    expect(SOURCE_PLACEMENT_BASE).toHaveLength(18);
    expect(SOURCE_PLACEMENT_RELEASE.inventory).toHaveLength(54);
    expect(sourcePlacementSha256(SOURCE_PLACEMENT_RELEASE)).toBe(SOURCE_PLACEMENT_RELEASE_SHA256);
    expect(SOURCE_PLACEMENT_RELEASE.inventory.filter(e => sourcePlacementCanonical(e.base) !== sourcePlacementCanonical(e.effective))
      .map(e => e.hideId)).toEqual(["greatwall-v12-2"]);
    for (const input of SOURCE_PLACEMENT_BASE) for (const hide of input.board.hides) {
      const entry = SOURCE_PLACEMENT_RELEASE.inventory.find(e => e.hideId === hide.id)!;
      expect(entry.base).toEqual({ crop: cropOf(hide), child: maskForHide(hide),
        returnRect: localPatchReturnRegion(cropOf(hide), maskForHide(hide), hide.returnRect).local });
    }
  });
  it("verifies the actual original4K source bytes and its five local head annotations", async () => {
    const c = SOURCE_PLACEMENT_RELEASE.inventory.find(e => e.hideId === "greatwall-v12-2")!;
    const bytes = readFileSync(path.resolve(process.cwd(), c.source.art));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(c.source.sha256);
    expect(c.source.sha256).toBe("67876316bb8a356f3a6121c68cb679dd82539b3f6ecfdf25fd578d08934fd0bc");
    const meta = await sharp(bytes).metadata();
    expect({ width: meta.width, height: meta.height }).toEqual({ width: 3840, height: 2160 });
    const returned = localPatchReturnRegion(c.effective.crop, c.effective.child, c.effective.returnRect).region;
    expect(returned).toEqual({ left: 1490, top: 930, width: 312, height: 632 });
    expect(c.sourceNeighbors!.contract.neighbors).toHaveLength(5);
    for (const neighbor of c.sourceNeighbors!.contract.neighbors) expect(sourceHeadIntersectsReturnBoundary(returned, neighbor.head)).toBe(false);
    // The original window actually cut the elder/upper/right/foreground neighborhood.
    const old = localPatchReturnRegion(c.base.crop, c.base.child).region;
    expect(c.sourceNeighbors!.contract.neighbors.some(n => sourceHeadIntersectsReturnBoundary(old, n.head))).toBe(true);
    expect(SOURCE_PLACEMENT_RELEASE.inventory.filter(e => e.sourceNeighbors).map(e => e.hideId)).toEqual([c.hideId]);
  });
});
