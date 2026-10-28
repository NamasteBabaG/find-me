import { createHash } from "node:crypto";
import { z } from "zod";
import { assertPlaceable, cropOf, LocalPatchBoardSchema, maskForHide, type LocalPatchBoard } from "./local-patch-hides";
import { LOCAL_PATCH_RETURN_FEATHER, localPatchReturnRegion, type PatchRectangle } from "./local-patch-return-region";
import { prepareSourceNeighborContract, SOURCE_NEIGHBOR_BUNDLE_VERSION, SOURCE_NEIGHBOR_CONTRACT_VERSION,
  SOURCE_NEIGHBOR_POLICY, SOURCE_NEIGHBOR_READER, sourceNeighborContractSchema, type SourceNeighborContract } from "./local-patch-source-neighbors";

export const SOURCE_PLACEMENT_RELEASE_VERSION = "source-placement-release/v1" as const;
export const SOURCE_PLACEMENT_POLICY_VERSION = "source-placement-policy/v1" as const;
export const SOURCE_PLACEMENT_POLICY_ACTION = "generation:source-placement-policy" as const;
export const SOURCE_PLACEMENT_RECOVERY_VERSION = "source-placement-recovery/v1" as const;
/** This is qualification of a new composite, not a rewrite of the base lean pin.
 * The actual per-game lean pin SHA belongs in the immutable service receipt. */
export const SOURCE_PLACEMENT_QUALIFICATION = Object.freeze({
  version: "source-placement-qualification/v1" as const, baseLeanRelease: "local-patch-lean/v1" as const,
  baseDualReviewRelease: "local-patch-dual-high/v3" as const, promptRelease: "v19" as const,
  neighborPolicy: SOURCE_NEIGHBOR_POLICY, qualityEnvelope: SOURCE_NEIGHBOR_BUNDLE_VERSION,
  neighborReader: SOURCE_NEIGHBOR_READER, composition: "bounded-return/v4-authored-source-boundaries" as const,
  annotationCoverage: "listed-hides-only" as const,
});

const hex = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9._:-]*$/);
const rectangle = z.object({ left: z.number().int().nonnegative(), top: z.number().int().nonnegative(),
  width: z.number().int().positive(), height: z.number().int().positive() }).strict();
const sourceSchema = z.object({ art: z.string().regex(/^public\/scenes\/(?:[a-z0-9][a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*\.(?:webp|png)$/),
  sha256: hex, width: z.number().int().positive(), height: z.number().int().positive() }).strict();
const geometrySchema = z.object({ crop: rectangle, child: rectangle, returnRect: rectangle }).strict();
const recoverySchema = z.object({ version: z.literal(SOURCE_PLACEMENT_RECOVERY_VERSION), crop: z.literal("fixed"),
  childEnvelope: z.literal("within-authored"), returnWindow: z.literal("within-authored"),
  minimumFeather: z.literal(12), sourceHeads: z.enum(["intact-at-boundary", "not-annotated"]) }).strict();
export const sourcePlacementHideContractSchema = z.object({
  boardId: id, hideId: id, sceneVersion: z.literal(12), source: sourceSchema, basePlacementSha256: hex,
  base: geometrySchema, effective: geometrySchema,
  sourceNeighbors: z.object({ contract: sourceNeighborContractSchema, contractSha256: hex }).strict().nullable(),
  recovery: recoverySchema,
}).strict();
/** The original v12 decoder stays exact. Detectives has a separate schema;
 * only shared algorithms accept the explicit discriminated union. */
export const detectiveSourcePlacementHideContractSchema = sourcePlacementHideContractSchema.extend({ sceneVersion: z.literal(13) });
export const sourcePlacementContractSchema = z.discriminatedUnion("sceneVersion", [sourcePlacementHideContractSchema, detectiveSourcePlacementHideContractSchema]);
export type SourcePlacementHideContract = z.infer<typeof sourcePlacementContractSchema>;
export const DETECTIVE_SOURCE_PLACEMENT_RELEASE_VERSION = "source-placement-release/v2" as const;
export const DETECTIVE_SOURCE_FAMILY = "journey-detectives/v1" as const;
/** Additive content families; the original Journey default remains unchanged. */
export const DETECTIVE_SOURCE_FAMILIES = [DETECTIVE_SOURCE_FAMILY, "kingdom-detectives/v1"] as const;
export type DetectiveSourceFamilyId = typeof DETECTIVE_SOURCE_FAMILIES[number];
export const sourcePlacementManifestSchema = z.object({
  version: z.literal(SOURCE_PLACEMENT_RELEASE_VERSION), releaseId: id, baseSceneVersion: z.literal(12),
  qualification: z.object({
    version: z.literal(SOURCE_PLACEMENT_QUALIFICATION.version), baseLeanRelease: z.literal(SOURCE_PLACEMENT_QUALIFICATION.baseLeanRelease),
    baseDualReviewRelease: z.literal(SOURCE_PLACEMENT_QUALIFICATION.baseDualReviewRelease),
    promptRelease: z.literal(SOURCE_PLACEMENT_QUALIFICATION.promptRelease),
    neighborPolicy: z.literal(SOURCE_PLACEMENT_QUALIFICATION.neighborPolicy),
    qualityEnvelope: z.literal(SOURCE_PLACEMENT_QUALIFICATION.qualityEnvelope),
    neighborReader: z.literal(SOURCE_PLACEMENT_QUALIFICATION.neighborReader),
    composition: z.literal(SOURCE_PLACEMENT_QUALIFICATION.composition),
    annotationCoverage: z.literal(SOURCE_PLACEMENT_QUALIFICATION.annotationCoverage),
  }).strict(),
  inventory: z.array(sourcePlacementHideContractSchema).min(3).max(54),
}).strict();
export type SourcePlacementManifest = z.infer<typeof sourcePlacementManifestSchema>;
export type SourcePlacementBaseBoard = { board: LocalPatchBoard; sceneVersion: 12;
  source: z.infer<typeof sourceSchema> };
export type SourcePlacementOverride = { boardId: string; hideId: string; child: PatchRectangle;
  returnRect: PatchRectangle; neighbors: SourceNeighborContract["neighbors"] };

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([k, v]) => [k, canonical(v)]));
  return value;
}
export const sourcePlacementCanonical = (value: unknown): string => JSON.stringify(canonical(value));
export const sourcePlacementSha256 = (value: unknown): string => createHash("sha256").update(sourcePlacementCanonical(value)).digest("hex");
const same = (a: unknown, b: unknown) => sourcePlacementCanonical(a) === sourcePlacementCanonical(b);
const key = (boardId: string, hideId: string) => `${boardId}/${hideId}`;
const demand = (ok: unknown, message: string): void => { if (!ok) throw Error(`SOURCE_PLACEMENT: ${message}`); };

function baseEntries(base: readonly SourcePlacementBaseBoard[]) {
  const entries = new Map<string, { entry: SourcePlacementHideContract; board: LocalPatchBoard }>(), hideIds = new Set<string>();
  demand(base.length > 0 && new Set(base.map(b => b.board.board)).size === base.length, "unique base boards are required");
  for (const input of base) {
    const board = LocalPatchBoardSchema.parse(input.board), source = sourceSchema.parse(input.source);
    demand(input.sceneVersion === 12 && board.art === source.art, "base scene and source differ");
    assertPlaceable(board, source);
    for (const hide of board.hides) {
      const crop = cropOf(hide), child = maskForHide(hide), returned = localPatchReturnRegion(crop, child, hide.returnRect);
      const geometry = { crop, child, returnRect: returned.local };
      const entry: SourcePlacementHideContract = {
        boardId: board.board, hideId: hide.id, sceneVersion: 12, source,
        basePlacementSha256: sourcePlacementSha256({ sceneVersion: 12, source, board: { ...board, hides: undefined }, hide }),
        base: geometry, effective: geometry, sourceNeighbors: null,
        recovery: { version: SOURCE_PLACEMENT_RECOVERY_VERSION, crop: "fixed", childEnvelope: "within-authored",
          returnWindow: "within-authored", minimumFeather: 12, sourceHeads: "not-annotated" },
      };
      demand(!entries.has(key(board.board, hide.id)) && !hideIds.has(hide.id), "duplicate base hide");
      hideIds.add(hide.id);
      entries.set(key(board.board, hide.id), { entry, board });
    }
  }
  return entries;
}

/** Materialize every base hide. No release may silently omit a board/hide or
 * inherit whatever a future catalog happens to contain without changing its hash. */
export function materializeSourcePlacementRelease(input: { releaseId: string; base: readonly SourcePlacementBaseBoard[];
  overrides: readonly SourcePlacementOverride[] }): SourcePlacementManifest {
  const entries = baseEntries(input.base), changed = new Set<string>();
  for (const override of input.overrides) {
    const address = key(override.boardId, override.hideId), selected = entries.get(address);
    demand(selected && !changed.has(address), "unknown or repeated override"); changed.add(address);
    const entry = selected!.entry, effective = { crop: entry.base.crop, child: override.child, returnRect: override.returnRect };
    const context = { boardId: entry.boardId, hideId: entry.hideId, source: entry.source,
      crop: effective.crop, returnRect: effective.returnRect };
    const prepared = prepareSourceNeighborContract({ version: SOURCE_NEIGHBOR_CONTRACT_VERSION, ...context, neighbors: override.neighbors }, context);
    demand(prepared.ok, prepared.ok ? "" : `invalid source annotations: ${prepared.fault.code}/${prepared.fault.path}`);
    entry.effective = effective;
    if (prepared.ok) entry.sourceNeighbors = { contract: prepared.contract, contractSha256: prepared.contractSha256 };
    entry.recovery = { ...entry.recovery, sourceHeads: "intact-at-boundary" };
  }
  return validateSourcePlacementRelease({ version: SOURCE_PLACEMENT_RELEASE_VERSION, releaseId: input.releaseId,
    baseSceneVersion: 12, qualification: SOURCE_PLACEMENT_QUALIFICATION,
    inventory: [...entries.values()].map(x => x.entry).sort((a, b) => key(a.boardId, a.hideId).localeCompare(key(b.boardId, b.hideId))) }, input.base);
}

/** Pure release validation against independently supplied original catalog data.
 * It verifies declared geometry, not source pixels, annotation completeness or art. */
export function validateSourcePlacementRelease(value: unknown, base: readonly SourcePlacementBaseBoard[]): SourcePlacementManifest {
  const manifest = sourcePlacementManifestSchema.parse(value), expected = baseEntries(base), seen = new Set<string>();
  demand(manifest.inventory.length === expected.size, "complete base inventory is required");
  for (const entry of manifest.inventory) {
    const address = key(entry.boardId, entry.hideId), original = expected.get(address);
    demand(original && !seen.has(address), "unknown or duplicate inventory hide"); seen.add(address);
    demand(entry.sceneVersion === original!.entry.sceneVersion && same(entry.source, original!.entry.source)
      && entry.basePlacementSha256 === original!.entry.basePlacementSha256 && same(entry.base, original!.entry.base), "base placement/source changed");
    demand(same(entry.effective.crop, entry.base.crop), "this release cannot move a context crop");
    localPatchReturnRegion(entry.effective.crop, entry.effective.child, entry.effective.returnRect);
    if (entry.sourceNeighbors) {
      const context = { boardId: entry.boardId, hideId: entry.hideId, source: entry.source,
        crop: entry.effective.crop, returnRect: entry.effective.returnRect };
      const prepared = prepareSourceNeighborContract(entry.sourceNeighbors.contract, context);
      demand(prepared.ok && prepared.contractSha256 === entry.sourceNeighbors.contractSha256, "source-neighbor contract/hash differs");
      demand(entry.recovery.sourceHeads === "intact-at-boundary", "annotated recovery must retain source-head constraints");
    } else {
      demand(same(entry.effective, entry.base), "changed geometry requires explicit source-neighbor coverage");
      demand(entry.recovery.sourceHeads === "not-annotated", "unlisted hides cannot claim annotation coverage");
    }
  }
  for (const input of base) {
    const effective = { ...input.board, hides: input.board.hides.map(hide => {
      const entry = manifest.inventory.find(e => e.boardId === input.board.board && e.hideId === hide.id)!;
      return same(entry.base, entry.effective) ? hide : { ...hide, mask: entry.effective.child, returnRect: entry.effective.returnRect };
    }) };
    assertPlaceable(effective, input.source);
  }
  const sorted = [...manifest.inventory].sort((a, b) => {
    const x = key(a.boardId, a.hideId), y = key(b.boardId, b.hideId); return x < y ? -1 : x > y ? 1 : 0;
  });
  return { ...manifest, inventory: sorted };
}

/** A derived recovery can shrink the authored region, never change source/crop
 * or borrow an unrelated safe window. Its own source-head constraints still
 * apply; a schema-valid model plan is not publication approval. */
export function sourcePlacementRecoveryGeometryAllowed(contract: SourcePlacementHideContract,
  geometry: SourcePlacementHideContract["effective"]): boolean {
  const contains = (outer: PatchRectangle, inner: PatchRectangle) => inner.left >= outer.left && inner.top >= outer.top
    && inner.left + inner.width <= outer.left + outer.width && inner.top + inner.height <= outer.top + outer.height;
  try {
    const g = geometrySchema.parse(geometry), c = sourcePlacementContractSchema.parse(contract);
    if (!same(g.crop, c.effective.crop) || !contains(c.effective.child, g.child) || !contains(c.effective.returnRect, g.returnRect)) return false;
    localPatchReturnRegion(g.crop, g.child, g.returnRect);
    if (!c.sourceNeighbors) return false; // no invented annotation authority for unlisted hides
    const context = { boardId: c.boardId, hideId: c.hideId, source: c.source, crop: g.crop, returnRect: g.returnRect };
    const prepared = prepareSourceNeighborContract({ ...c.sourceNeighbors.contract, ...context }, context);
    return prepared.ok && c.recovery.minimumFeather === LOCAL_PATCH_RETURN_FEATHER;
  } catch { return false; }
}

/** A new content family is a separate release. Its corrected runtime boards
 * are the immutable base before enrollment; a paid recovery still cannot move
 * their crop, pose, source or authored return envelope. */
export const detectiveSourcePlacementManifestSchema = z.object({
  version: z.literal(DETECTIVE_SOURCE_PLACEMENT_RELEASE_VERSION), releaseId: id,
  familyId: z.enum(DETECTIVE_SOURCE_FAMILIES), baseSceneVersion: z.literal(13),
  qualification: sourcePlacementManifestSchema.shape.qualification.extend({
    familyId: z.enum(DETECTIVE_SOURCE_FAMILIES), sceneVersion: z.literal(13),
  }),
  inventory: z.array(detectiveSourcePlacementHideContractSchema).length(27),
}).strict();
export type DetectiveSourcePlacementManifest = z.infer<typeof detectiveSourcePlacementManifestSchema>;
export type DetectiveSourcePlacementBaseBoard = { board: LocalPatchBoard; sceneVersion: 13;
  source: z.infer<typeof sourceSchema> };
export type DetectiveSourceNeighborhood = { boardId: string; hideId: string;
  neighbors: readonly SourceNeighborContract["neighbors"][number][] };

function detectiveBaseEntries(base: readonly DetectiveSourcePlacementBaseBoard[]) {
  const entries = new Map<string, z.infer<typeof detectiveSourcePlacementHideContractSchema>>();
  const hideIds = new Set<string>();
  demand(base.length === 9 && new Set(base.map(b => b.board.board)).size === 9, "nine unique Detective boards are required");
  for (const input of base) {
    const board = LocalPatchBoardSchema.parse(input.board), source = sourceSchema.parse(input.source);
    demand(input.sceneVersion === 13 && board.art === source.art && board.hides.length === 3, "Detective base scene/source/inventory differs");
    assertPlaceable(board, source);
    for (const hide of board.hides) {
      const crop = cropOf(hide), child = maskForHide(hide), returned = localPatchReturnRegion(crop, child, hide.returnRect);
      const geometry = { crop, child, returnRect: returned.local };
      const entry: z.infer<typeof detectiveSourcePlacementHideContractSchema> = {
        boardId: board.board, hideId: hide.id, sceneVersion: 13, source,
        basePlacementSha256: sourcePlacementSha256({ sceneVersion: 13, source, board: { ...board, hides: undefined }, hide }),
        base: geometry, effective: geometry, sourceNeighbors: null,
        recovery: { version: SOURCE_PLACEMENT_RECOVERY_VERSION, crop: "fixed", childEnvelope: "within-authored",
          returnWindow: "within-authored", minimumFeather: 12, sourceHeads: "not-annotated" },
      };
      const address = key(board.board, hide.id);
      demand(!entries.has(address) && !hideIds.has(hide.id), "duplicate Detective hide");
      hideIds.add(hide.id); entries.set(address, entry);
    }
  }
  return entries;
}

/** Source heads are measured on the new family art, not inherited from another
 * board with the same slug. Listed coverage is required for every new placement
 * in this release, and does not claim recognition of a whole board's crowd. */
export function materializeDetectiveSourcePlacementRelease(input: { releaseId: string; familyId?: DetectiveSourceFamilyId;
  base: readonly DetectiveSourcePlacementBaseBoard[]; neighborhoods: readonly DetectiveSourceNeighborhood[] }): DetectiveSourcePlacementManifest {
  const entries = detectiveBaseEntries(input.base), seen = new Set<string>();
  for (const neighborhood of input.neighborhoods) {
    const address = key(neighborhood.boardId, neighborhood.hideId), entry = entries.get(address);
    demand(entry && !seen.has(address), "unknown or repeated Detective neighborhood"); seen.add(address);
    const context = { boardId: entry!.boardId, hideId: entry!.hideId, source: entry!.source,
      crop: entry!.effective.crop, returnRect: entry!.effective.returnRect };
    const prepared = prepareSourceNeighborContract({ version: SOURCE_NEIGHBOR_CONTRACT_VERSION, ...context,
      neighbors: neighborhood.neighbors }, context);
    demand(prepared.ok, prepared.ok ? "" : `invalid Detective source annotations: ${prepared.fault.code}/${prepared.fault.path}`);
    if (prepared.ok) entry!.sourceNeighbors = { contract: prepared.contract, contractSha256: prepared.contractSha256 };
    entry!.recovery = { ...entry!.recovery, sourceHeads: "intact-at-boundary" };
  }
  demand(seen.size === entries.size, "complete Detective placement neighborhood coverage is required");
  return validateDetectiveSourcePlacementRelease({ version: DETECTIVE_SOURCE_PLACEMENT_RELEASE_VERSION,
    releaseId: input.releaseId, familyId: input.familyId ?? DETECTIVE_SOURCE_FAMILY, baseSceneVersion: 13,
    qualification: { ...SOURCE_PLACEMENT_QUALIFICATION, familyId: input.familyId ?? DETECTIVE_SOURCE_FAMILY, sceneVersion: 13 },
    inventory: [...entries.values()] }, input.base, input.familyId);
}

export function validateDetectiveSourcePlacementRelease(value: unknown,
  base: readonly DetectiveSourcePlacementBaseBoard[], familyId: DetectiveSourceFamilyId = DETECTIVE_SOURCE_FAMILY): DetectiveSourcePlacementManifest {
  const manifest = detectiveSourcePlacementManifestSchema.parse(value), expected = detectiveBaseEntries(base), seen = new Set<string>();
  demand(manifest.familyId === familyId && manifest.qualification.familyId === familyId, "Detective family differs from its explicitly selected release");
  for (const entry of manifest.inventory) {
    const address = key(entry.boardId, entry.hideId), original = expected.get(address);
    demand(original && !seen.has(address), "unknown or duplicate Detective inventory hide"); seen.add(address);
    demand(entry.sceneVersion === 13 && same(entry.source, original!.source)
      && entry.basePlacementSha256 === original!.basePlacementSha256 && same(entry.base, original!.base)
      && same(entry.effective, original!.effective), "Detective base placement/source changed after authoring");
    demand(entry.sourceNeighbors && entry.recovery.sourceHeads === "intact-at-boundary", "Detective neighborhood coverage is required");
    const context = { boardId: entry.boardId, hideId: entry.hideId, source: entry.source,
      crop: entry.effective.crop, returnRect: entry.effective.returnRect };
    const prepared = prepareSourceNeighborContract(entry.sourceNeighbors!.contract, context);
    demand(prepared.ok && prepared.contractSha256 === entry.sourceNeighbors!.contractSha256, "Detective source-neighbor contract/hash differs");
    localPatchReturnRegion(entry.effective.crop, entry.effective.child, entry.effective.returnRect);
  }
  demand(seen.size === expected.size, "complete Detective base inventory is required");
  return { ...manifest, inventory: [...manifest.inventory].sort((a, b) => {
    const x = key(a.boardId, a.hideId), y = key(b.boardId, b.hideId); return x < y ? -1 : x > y ? 1 : 0;
  }) };
}
