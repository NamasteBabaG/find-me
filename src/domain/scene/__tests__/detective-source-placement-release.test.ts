import { describe, expect, it } from "vitest";
import { SOURCE_PLACEMENT_RELEASE, SOURCE_PLACEMENT_RELEASE_SHA256 } from "../../../../content/adventures/source-placement-release";
import type { LocalPatchBoard } from "../local-patch-hides";
import { detectiveSourcePlacementHideContractSchema, materializeDetectiveSourcePlacementRelease,
  sourcePlacementCanonical, sourcePlacementHideContractSchema, sourcePlacementRecoveryGeometryAllowed,
  sourcePlacementSha256, validateDetectiveSourcePlacementRelease, type DetectiveSourcePlacementBaseBoard,
  type DetectiveSourcePlacementManifest, type DetectiveSourceNeighborhood } from "../source-placement-release";

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function fixture() {
  const base: DetectiveSourcePlacementBaseBoard[] = Array.from({ length: 9 }, (_, n) => {
    const slug = `synthetic-detective-${n + 1}`;
    const board: LocalPatchBoard = { board: slug, art: `public/scenes/${slug}/base.webp`, ground: "the same pavement",
      sittable: true, hides: [100, 1100, 2200].map((left, i) => ({
        id: `${slug}-hide-${i + 1}`, targetId: `hide-${i + 1}`, pose: "standing" as const, left, top: 500,
        mask: { left: 108, top: 208, width: 296, height: 350 },
      })) };
    return { board, sceneVersion: 13, source: { art: board.art, sha256: "a".repeat(64), width: 3840, height: 2160 } };
  });
  const neighborhoods: DetectiveSourceNeighborhood[] = base.flatMap(({ board }) => board.hides.map(hide => ({
    boardId: board.board, hideId: hide.id, neighbors: [{ sourceId: `${board.board}-neighbor`,
      head: { left: 50, top: 50, width: 60, height: 70 } }],
  })));
  const make = () => materializeDetectiveSourcePlacementRelease({ releaseId: "synthetic-detective-source-v1", base, neighborhoods });
  return { base, neighborhoods, make };
}

describe("separate prospective Detective source family", () => {
  it("retains all27 actual13 IDs, with original geometry fixed before enrollment", () => {
    const f = fixture(), before = sourcePlacementCanonical(f.base), manifest = f.make();
    expect(manifest.familyId).toBe("journey-detectives/v1");
    expect(manifest.baseSceneVersion).toBe(13); expect(manifest.inventory).toHaveLength(27);
    expect(new Set(manifest.inventory.map(e => e.hideId)).size).toBe(27);
    expect(manifest.inventory.every(e => e.sceneVersion === 13 && e.sourceNeighbors && e.recovery.sourceHeads === "intact-at-boundary")).toBe(true);
    expect(sourcePlacementCanonical(f.base)).toBe(before);
    for (const entry of manifest.inventory) expect(entry.effective).toEqual(entry.base);
    const reversed = { ...manifest, inventory: [...manifest.inventory].reverse() };
    expect(sourcePlacementSha256(validateDetectiveSourcePlacementRelease(reversed, f.base))).toBe(sourcePlacementSha256(manifest));
  });
  it("keeps the original v12 decoder and complete54 digest exact", () => {
    const entry = fixture().make().inventory[0]!;
    expect(detectiveSourcePlacementHideContractSchema.safeParse(entry).success).toBe(true);
    expect(sourcePlacementHideContractSchema.safeParse(entry).success).toBe(false);
    expect(sourcePlacementSha256(SOURCE_PLACEMENT_RELEASE)).toBe(SOURCE_PLACEMENT_RELEASE_SHA256);
    expect(SOURCE_PLACEMENT_RELEASE.inventory).toHaveLength(54);
  });
  it.each(["missing-board", "duplicate-board", "missing-neighborhood", "duplicate-neighborhood", "foreign-neighborhood"])("refuses %s before producing authority", fault => {
    const f = fixture();
    if (fault === "missing-board") f.base.pop();
    if (fault === "duplicate-board") f.base[8] = copy(f.base[0]!);
    if (fault === "missing-neighborhood") f.neighborhoods.pop();
    if (fault === "duplicate-neighborhood") f.neighborhoods[26] = copy(f.neighborhoods[0]!);
    if (fault === "foreign-neighborhood") f.neighborhoods[0]!.hideId = "foreign-hide";
    expect(f.make).toThrow();
  });
  it.each([
    ["crop", (m: DetectiveSourcePlacementManifest) => { m.inventory[0]!.effective.crop.left++; }],
    ["mask", (m: DetectiveSourcePlacementManifest) => { m.inventory[0]!.effective.child.width--; }],
    ["source", (m: DetectiveSourcePlacementManifest) => { m.inventory[0]!.source.sha256 = "b".repeat(64); }],
    ["missing coverage", (m: DetectiveSourcePlacementManifest) => { m.inventory[0]!.sourceNeighbors = null; }],
    ["annotation digest", (m: DetectiveSourcePlacementManifest) => { m.inventory[0]!.sourceNeighbors!.contractSha256 = "b".repeat(64); }],
    ["recovery feather", (m: DetectiveSourcePlacementManifest) => { (m.inventory[0]!.recovery as {minimumFeather:number}).minimumFeather = 6; }],
    ["version disguise", (m: DetectiveSourcePlacementManifest) => { (m.inventory[0] as {sceneVersion:number}).sceneVersion = 12; }],
  ] as const)("refuses a changed %s rather than replaying another family", (_name, change) => {
    const f = fixture(), m = copy(f.make()); change(m);
    expect(() => validateDetectiveSourcePlacementRelease(m, f.base)).toThrow();
  });
  it("validates new authored recovery using actual13 source authority and the same crop", () => {
    const entry = fixture().make().inventory[0]!;
    expect(sourcePlacementRecoveryGeometryAllowed(entry, entry.effective)).toBe(true);
    const moved = copy(entry.effective); moved.crop.left++;
    expect(sourcePlacementRecoveryGeometryAllowed(entry, moved)).toBe(false);
  });
});
