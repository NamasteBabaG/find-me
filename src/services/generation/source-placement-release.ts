import { createHash } from "node:crypto";
import { detectivesOperationalPolicyOf } from "./detectives-operational-policy";
import type { DetectivesOperationalReceipt } from "../../domain/generation/detectives-operational-policy";
import { readSourceBodyRepairPin } from './source-body-repair-pin';
import { SOURCE_BODY_REPAIR_MANIFEST, SOURCE_BODY_REPAIR_MANIFEST_SHA256 } from '../../../content/detectives/source-body-repair';
import { validateSourceBodyGeometry, type SourceBodyGeometry } from '../../domain/scene/source-body-repair';
import { authoredLocalPatchReturnContract } from '../../domain/scene/local-patch-return-region';
import { prepareSourceNeighborContract } from '../../domain/scene/local-patch-source-neighbors';
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { SOURCE_PLACEMENT_BASE, SOURCE_PLACEMENT_RELEASE, SOURCE_PLACEMENT_RELEASE_ID,
  SOURCE_PLACEMENT_RELEASE_SHA256, assertSourcePlacementReleaseHash } from "../../../content/adventures/source-placement-release";
import { localPatchBoardsForVersion } from "../../domain/scene/local-patch-catalog";
import { LocalPatchBoardSchema, type LocalPatchBoard } from "../../domain/scene/local-patch-hides";
import { SOURCE_PLACEMENT_POLICY_ACTION, SOURCE_PLACEMENT_POLICY_VERSION, sourcePlacementCanonical,
  sourcePlacementSha256, validateSourcePlacementRelease, type SourcePlacementHideContract } from "../../domain/scene/source-placement-release";
import { env } from "../../lib/env";
import { storedSearchLevel, type SearchLevel } from "../../domain/search-level";
import { IDENTITY_SOURCE_RELEASE, identitySourceAuditId, identitySourceReleaseOf } from "./identity-source-release";
import { DETECTIVE_SOURCE_PLACEMENT_BASE, DETECTIVE_SOURCE_PLACEMENT_RELEASE,
  DETECTIVE_SOURCE_PLACEMENT_RELEASE_ID, DETECTIVE_SOURCE_PLACEMENT_RELEASE_SHA256,
  DETECTIVE_RUNTIME_CATALOG_SHA256, DETECTIVE_SOURCE_INPUT_SHA256, DETECTIVE_IDENTITY_STYLE_SHA256,
  assertDetectiveSourcePlacementReleaseHash } from "../../../content/detectives/source-placement-release";
import { DETECTIVE_SOURCE_FAMILY, validateDetectiveSourcePlacementRelease } from "../../domain/scene/source-placement-release";
import { leanReleaseAuditId, leanReleaseOf, leanReleaseReceipt, LOCAL_PATCH_LEAN_RELEASE } from "./lean-release";
import { dualVisualReviewVersion, DUAL_VISUAL_REVIEW_V3 } from "./visual-review-release";

export type { SourcePlacementHideContract } from "../../domain/scene/source-placement-release";
type Reader = Pick<Prisma.TransactionClient, "auditLog"> & Partial<Pick<Prisma.TransactionClient, "game">>;
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const pinSchema = z.object({ version: z.literal(SOURCE_PLACEMENT_POLICY_VERSION),
  gameId: z.string().min(1).max(200).regex(/^[A-Za-z0-9_:-]+$/),
  releaseId: z.literal(SOURCE_PLACEMENT_RELEASE_ID), manifestSha256: hex, baseSceneVersion: z.literal(12),
  leanPinSha256: hex, compositeQualificationSha256: hex,
  coverage: z.array(z.object({ boardId: z.string(), hideId: z.string(), contractSha256: hex }).strict()).max(54),
}).strict();
export const DETECTIVE_SOURCE_FAMILY_VERSION = "local-patch-source-family/v1" as const;
export const DETECTIVE_SOURCE_FAMILY_ACTION = "generation:source-family-policy" as const;
export const sourceFamilyAuditId = (gameId: string) => `aud_source_family_${gameId}`;
const detectivePinSchema = z.object({ version: z.literal(DETECTIVE_SOURCE_FAMILY_VERSION),
  gameId: pinSchema.shape.gameId, familyId: z.literal(DETECTIVE_SOURCE_FAMILY),
  searchLevel: z.literal("detectives"), worldSlug: z.literal("journey"),
  releaseId: z.literal(DETECTIVE_SOURCE_PLACEMENT_RELEASE_ID), manifestSha256: hex, baseSceneVersion: z.literal(13),
  sourceInputSha256: hex, runtimeCatalogSha256: hex, identityStyleSha256: hex,
  leanPinSha256: hex, dualPinSha256: hex, identityPinSha256: hex, compositeQualificationSha256: hex,
  coverage: z.array(pinSchema.shape.coverage.element).length(27),
}).strict();
export type SourcePlacementReleasePin = z.infer<typeof pinSchema> | z.infer<typeof detectivePinSchema>;
export const sourcePlacementReleaseAuditId = (gameId: string) => `aud_source_placement_${gameId}`;
const hashBytes = (value: string) => createHash("sha256").update(value).digest("hex");
const demand = (ok: unknown, reason: string): void => { if (!ok) throw Error(`SOURCE_PLACEMENT: ${reason}`); };

function qualifiedReceipt(gameId: string): z.infer<typeof pinSchema> {
  assertSourcePlacementReleaseHash();
  const leanPinSha256 = hashBytes(JSON.stringify(leanReleaseReceipt(gameId)));
  return pinSchema.parse({ version: SOURCE_PLACEMENT_POLICY_VERSION, gameId,
    releaseId: SOURCE_PLACEMENT_RELEASE_ID, manifestSha256: SOURCE_PLACEMENT_RELEASE_SHA256, baseSceneVersion: 12,
    leanPinSha256, compositeQualificationSha256: sourcePlacementSha256({
      manifestSha256: SOURCE_PLACEMENT_RELEASE_SHA256, qualification: SOURCE_PLACEMENT_RELEASE.qualification, leanPinSha256,
    }), coverage: SOURCE_PLACEMENT_RELEASE.inventory.filter(e => e.sourceNeighbors).map(e => ({
      boardId: e.boardId, hideId: e.hideId, contractSha256: e.sourceNeighbors!.contractSha256,
    })) });
}

async function requireBasePins(db: Reader, gameId: string): Promise<void> {
  demand(await leanReleaseOf(db, gameId) === LOCAL_PATCH_LEAN_RELEASE, "the original exact lean pin is required");
  demand(await dualVisualReviewVersion(db, gameId) === DUAL_VISUAL_REVIEW_V3, "the original exact dual-v3 pin is required");
}

/** Null means the historical path exactly. A malformed or mismatched companion
 * throws; it is never treated as absent or as the nearest known release. */
export async function sourcePlacementReleaseOf(db: Reader, gameId: string): Promise<SourcePlacementReleasePin | null> {
  const [row, family] = await Promise.all([
    db.auditLog.findUnique({ where: { id: sourcePlacementReleaseAuditId(gameId) } }),
    db.auditLog.findUnique({ where: { id: sourceFamilyAuditId(gameId) } }),
  ]);
  demand(!(row && family), "a game cannot hold two source families");
  if (family) {
    let value: unknown;
    try { value = JSON.parse(family.metaJson ?? "null"); } catch { throw Error("SOURCE_PLACEMENT: invalid family pin encoding"); }
    const parsed = detectivePinSchema.safeParse(value);
    demand(parsed.success && family.actorType === "SYSTEM" && family.actorId === null && family.action === DETECTIVE_SOURCE_FAMILY_ACTION
      && family.entityType === "Game" && family.entityId === gameId, "invalid Detective family pin");
    const expected = await qualifiedDetectiveReceipt(db, gameId);
    demand(parsed.success && parsed.data.gameId === gameId && family.metaJson === sourcePlacementCanonical(expected),
      "pinned Detective family differs from its original qualified release");
    return Object.freeze(expected);
  }
  if (!row) return null;
  let value: unknown;
  try { value = JSON.parse(row.metaJson ?? "null"); } catch { throw Error("SOURCE_PLACEMENT: invalid pin encoding"); }
  const parsed = pinSchema.safeParse(value);
  demand(parsed.success && row.actorType === "SYSTEM" && row.actorId === null && row.action === SOURCE_PLACEMENT_POLICY_ACTION
    && row.entityType === "Game" && row.entityId === gameId, "invalid companion pin");
  await requireBasePins(db, gameId);
  const expected = qualifiedReceipt(gameId);
  demand(parsed.success && parsed.data.gameId === gameId
    && row.metaJson === sourcePlacementCanonical(expected), "pinned companion differs from its original qualified release");
  return Object.freeze(expected);
}

/** Enroll only inside the new lean-draft transaction, before any order/job.
 * It buys nothing and changes no budget or historical base pin. */
export async function pinSourcePlacementRelease(tx: Prisma.TransactionClient, gameId: string): Promise<void> {
  demand(env().APP_ENV === "qa" && env().LOCAL_PATCH_PROMPT_RELEASE === "v19", "only the qualified QA configuration may enroll a new draft");
  const game = await tx.game.findUniqueOrThrow({ where: { id: gameId } });
  demand(game.status === "DRAFT" && game.styleVersion === "local-patch-world-v1" && !game.deletedAt
    && !game.readyAt && !game.configJson && !game.paidAt, "only a new unstarted draft may enroll");
  demand(!await tx.order.findFirst({ where: { gameId } }) && !await tx.generationJob.findFirst({ where: { gameId } })
    && !await tx.targetVariantAsset.findFirst({ where: { targetInstance: { gameScene: { gameId } }, attempts: { gt: 0 } } }),
  "orders, jobs or prior image attempts cannot gain a prospective companion");
  await requireBasePins(tx, gameId);
  demand(storedSearchLevel(game.searchLevel) === "explorers"
    && !await tx.auditLog.findUnique({ where: { id: sourceFamilyAuditId(gameId) } }), "a Detective family cannot gain the Explorer companion");
  const receipt = qualifiedReceipt(gameId), metaJson = sourcePlacementCanonical(receipt);
  const row = await tx.auditLog.upsert({ where: { id: sourcePlacementReleaseAuditId(gameId) }, update: {},
    create: { id: sourcePlacementReleaseAuditId(gameId), actorType: "SYSTEM", action: SOURCE_PLACEMENT_POLICY_ACTION,
      entityType: "Game", entityId: gameId, metaJson } });
  demand(row.actorType === "SYSTEM" && row.actorId === null && row.action === SOURCE_PLACEMENT_POLICY_ACTION
    && row.entityType === "Game" && row.entityId === gameId && row.metaJson === metaJson, "companion enrollment conflicts with its original pin");
}

async function qualifiedDetectiveReceipt(db: Reader, gameId: string): Promise<z.infer<typeof detectivePinSchema>> {
  assertDetectiveSourcePlacementReleaseHash();
  await requireBasePins(db, gameId);
  demand(await identitySourceReleaseOf(db, gameId) === IDENTITY_SOURCE_RELEASE, "Detectives requires the exact full-source identity pin");
  const [lean, dual, identity] = await Promise.all([
    db.auditLog.findUnique({ where: { id: leanReleaseAuditId(gameId) } }),
    db.auditLog.findUnique({ where: { id: `aud_visual_policy_${gameId}` } }),
    db.auditLog.findUnique({ where: { id: identitySourceAuditId(gameId) } }),
  ]);
  // The base readers above authenticate each exact SYSTEM receipt before these
  // bytes are included in the composite. A flag is never substitute authority.
  demand(lean?.metaJson && dual?.metaJson && identity?.metaJson, "complete original base receipts are required");
  const pins = { leanPinSha256: hashBytes(lean!.metaJson!), dualPinSha256: hashBytes(dual!.metaJson!), identityPinSha256: hashBytes(identity!.metaJson!) };
  const data = { version: DETECTIVE_SOURCE_FAMILY_VERSION, gameId, familyId: DETECTIVE_SOURCE_FAMILY,
    searchLevel: "detectives" as const, worldSlug: "journey" as const,
    releaseId: DETECTIVE_SOURCE_PLACEMENT_RELEASE_ID, manifestSha256: DETECTIVE_SOURCE_PLACEMENT_RELEASE_SHA256, baseSceneVersion: 13 as const,
    sourceInputSha256: DETECTIVE_SOURCE_INPUT_SHA256, runtimeCatalogSha256: DETECTIVE_RUNTIME_CATALOG_SHA256,
    identityStyleSha256: DETECTIVE_IDENTITY_STYLE_SHA256, ...pins,
    coverage: DETECTIVE_SOURCE_PLACEMENT_RELEASE.inventory.map(e => ({ boardId: e.boardId, hideId: e.hideId,
      contractSha256: e.sourceNeighbors!.contractSha256 })) };
  return detectivePinSchema.parse({ ...data, compositeQualificationSha256: sourcePlacementSha256({ ...data,
    qualification: DETECTIVE_SOURCE_PLACEMENT_RELEASE.qualification }) });
}

/** Select the new draft's content family before it can receive a photo/order.
 * Existing pins remain immutable; changing a level never rewrites a pin. */
export async function pinLocalPatchSourceFamily(tx: Prisma.TransactionClient, gameId: string,
  input: { sceneVersion: number; searchLevel: SearchLevel }): Promise<void> {
  demand(input.sceneVersion === 12 && input.searchLevel === "explorers"
    || input.sceneVersion === 13 && input.searchLevel === "detectives", "source family and selected level differ");
  const game = await tx.game.findUniqueOrThrow({ where: { id: gameId } });
  demand(storedSearchLevel(game.searchLevel) === input.searchLevel, "the stored draft level differs from its source family");
  if (input.sceneVersion === 12) {
    demand(!await tx.auditLog.findUnique({ where: { id: sourceFamilyAuditId(gameId) } }), "a Detective family cannot gain the Explorer companion");
    return pinSourcePlacementRelease(tx, gameId);
  }
  demand(env().APP_ENV === "qa" && env().LOCAL_PATCH_PROMPT_RELEASE === "v19", "only the qualified QA configuration may enroll Detectives");
  demand(game.status === "DRAFT" && game.styleVersion === "local-patch-world-v1" && !game.deletedAt
    && !game.readyAt && !game.configJson && !game.paidAt, "only a new unstarted Detective draft may enroll");
  demand(!await tx.order.findFirst({ where: { gameId } }) && !await tx.generationJob.findFirst({ where: { gameId } })
    && !await tx.targetVariantAsset.findFirst({ where: { targetInstance: { gameScene: { gameId } }, attempts: { gt: 0 } } }),
    "orders, jobs or prior image attempts cannot gain a prospective Detective family");
  demand(!await tx.auditLog.findUnique({ where: { id: sourcePlacementReleaseAuditId(gameId) } }), "an Explorer companion cannot gain a Detective family");
  const receipt = await qualifiedDetectiveReceipt(tx, gameId), metaJson = sourcePlacementCanonical(receipt);
  const row = await tx.auditLog.upsert({ where: { id: sourceFamilyAuditId(gameId) }, update: {},
    create: { id: sourceFamilyAuditId(gameId), actorType: "SYSTEM", action: DETECTIVE_SOURCE_FAMILY_ACTION,
      entityType: "Game", entityId: gameId, metaJson } });
  demand(row.actorType === "SYSTEM" && row.actorId === null && row.action === DETECTIVE_SOURCE_FAMILY_ACTION
    && row.entityType === "Game" && row.entityId === gameId && row.metaJson === metaJson,
    "Detective family enrollment conflicts with its original pin");
}

/** Selection fence used before draft edits and inside the payment claim.
 * Old local-patch drafts may continue Explorers. Only a fresh matching13 pin
 * can select Detectives, and a sealed pin cannot switch to the other level. */
export async function localPatchSourceSelectionAllowed(db: Reader,
  game: { id: string; styleVersion: string }, level: SearchLevel,
  scenes?: readonly { sceneSlug: string; sceneVersion: number }[]): Promise<boolean> {
  if (game.styleVersion !== "local-patch-world-v1") return true;
  const release = await sourcePlacementReleaseOf(db, game.id);
  if (!release) return level === "explorers" && (!scenes || scenes.every(s => s.sceneVersion !== 13));
  const version = release.baseSceneVersion;
  if (level !== (version === 13 ? "detectives" : "explorers")) return false;
  if (!scenes) return true;
  const inventory = version === 13 ? DETECTIVE_SOURCE_PLACEMENT_RELEASE.inventory : SOURCE_PLACEMENT_RELEASE.inventory;
  return scenes.every(s => s.sceneVersion === version && inventory.some(e => e.boardId === s.sceneSlug));
}

const contextBrand: unique symbol = Symbol("trusted-source-placement-context");
export type TrustedSourcePlacementContext = {
  readonly [contextBrand]: true;
  readonly gameId: string; readonly sceneVersion: number;
  readonly boards: readonly LocalPatchBoard[];
  readonly release: SourcePlacementReleasePin | null;
  readonly manifestSha256: string | null;
};
type ContextProof = { digest: string; contracts: Map<string, SourcePlacementHideContract>; bodies: Map<string, SourceBodyGeometry>; birthPin: DetectivesOperationalReceipt|null };
const trustedContexts = new WeakMap<object, ContextProof>();
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function contextDigest(c: TrustedSourcePlacementContext) {
  return sourcePlacementSha256({ gameId: c.gameId, sceneVersion: c.sceneVersion,
    boards: c.boards, release: c.release, manifestSha256: c.manifestSha256 });
}

/** Resolves catalog authority, not proof that source image bytes were loaded.
 * Existing art preflight must still verify the source hash before any purchase.
 * Load once per world/slice; placementForHide below performs no DB reads. */
export async function resolveLocalPatchBoardsForGame(db: Reader, gameId: string, sceneVersion: number): Promise<TrustedSourcePlacementContext> {
  const release = await sourcePlacementReleaseOf(db, gameId);
  demand(sceneVersion !== 13 || release?.baseSceneVersion === 13, "Detective source context cannot fall back without its exact family pin");
  let boards = localPatchBoardsForVersion(sceneVersion), contracts = new Map<string, SourcePlacementHideContract>();
  if (release) {
    demand(sceneVersion === release.baseSceneVersion, "companion cannot reinterpret another scene version");
    let manifest;
    if (release.baseSceneVersion === 13) {
      assertDetectiveSourcePlacementReleaseHash();
      demand(db.game, "Detective context requires authoritative game selection");
      const game = await db.game!.findUnique({ where: { id: gameId }, include: { scenes: true } });
      const expectedBoards = new Set(DETECTIVE_SOURCE_PLACEMENT_BASE.map(e => e.board.board));
      demand(game && !game.deletedAt && game.styleVersion === "local-patch-world-v1" && game.searchLevel === "detectives"
        && game.scenes.length === 9 && new Set(game.scenes.map(s => s.sceneSlug)).size === 9
        && game.scenes.every(s => s.sceneVersion === 13 && expectedBoards.has(s.sceneSlug)),
        "Detective game requires its exact whole Journey family selection");
      manifest = validateDetectiveSourcePlacementRelease(DETECTIVE_SOURCE_PLACEMENT_RELEASE, DETECTIVE_SOURCE_PLACEMENT_BASE);
    } else {
      assertSourcePlacementReleaseHash();
      manifest = validateSourcePlacementRelease(SOURCE_PLACEMENT_RELEASE, SOURCE_PLACEMENT_BASE);
    }
    const inventory = freeze(manifest.inventory);
    contracts = new Map(inventory.map(entry => [entry.hideId, entry]));
    // Clone only for the prospective context. No legacy source object is frozen,
    // mutated or decorated with new undefined/optional fingerprint fields.
    boards = freeze(boards.map(board => LocalPatchBoardSchema.parse({ ...board, hides: board.hides.map(hide => {
      const entry = contracts.get(hide.id);
      demand(entry && entry.boardId === board.board, "complete resolved inventory is required");
      return sourcePlacementCanonical(entry!.effective) === sourcePlacementCanonical(entry!.base) ? hide
        : { ...hide, mask: entry!.effective.child, returnRect: entry!.effective.returnRect };
    }) })));
  }
  const bodies=new Map<string,SourceBodyGeometry>();
  const bodyPin=sceneVersion===13 ? await readSourceBodyRepairPin(db,gameId) : null;
  const birthPin=sceneVersion===13?await detectivesOperationalPolicyOf(db,gameId):null;
  demand(!(bodyPin&&birthPin),"Historical repair and from-birth source policy cannot overlap");
  const bodySelections:readonly {hideId:string}[]=bodyPin?.selected??(birthPin?SOURCE_BODY_REPAIR_MANIFEST.entries:[]);
  if(bodySelections.length){
    demand(release?.manifestSha256===SOURCE_BODY_REPAIR_MANIFEST.parentManifestSha256,'Body repair parent family changed');
    for(const selected of bodySelections){const geometry=SOURCE_BODY_REPAIR_MANIFEST.entries.find(e=>e.hideId===selected.hideId),entry=contracts.get(selected.hideId);
      demand(geometry&&entry?.sourceNeighbors,'Body repair requires original annotated public geometry');
      const parent=authoredLocalPatchReturnContract({contentVersion:13,boardId:entry!.boardId,hideId:entry!.hideId,source:entry!.source,crop:entry!.effective.crop,child:entry!.effective.child,authored:entry!.effective.returnRect,sourcePlacement:{manifestSha256:release!.manifestSha256,basePlacementSha256:entry!.basePlacementSha256}});
      const g=freeze(validateSourceBodyGeometry(geometry,parent,entry!.sourceNeighbors!.contract.neighbors));bodies.set(g.hideId,g);
      const effective={...entry!.effective,returnRect:g.returnRect},neighborContext={boardId:entry!.boardId,hideId:entry!.hideId,source:entry!.source,crop:g.crop,returnRect:g.returnRect};
      const prepared=prepareSourceNeighborContract({...entry!.sourceNeighbors!.contract,...neighborContext},neighborContext);demand(prepared.ok,'Body repair boundary crosses an original head');
      contracts.set(g.hideId,freeze({...entry!,effective,sourceNeighbors:prepared.ok?{contract:prepared.contract,contractSha256:prepared.contractSha256}:null}));
    }
    boards=freeze(boards.map(b=>LocalPatchBoardSchema.parse({...b,hides:b.hides.map(h=>bodies.has(h.id)?{...h,returnRect:bodies.get(h.id)!.returnRect}:h)})));
  }
  const context: TrustedSourcePlacementContext = Object.freeze({ [contextBrand]: true as const, gameId, sceneVersion,
    boards, release: release ? freeze(release) : null, manifestSha256: release?.manifestSha256 ?? null });
  trustedContexts.set(context, { digest: contextDigest(context), contracts, bodies, birthPin:birthPin?freeze(birthPin):null });
  return context;
}

/** Runtime provenance is nontransferable: JSON copies, object spreads and
 * caller-crafted overrides cannot become trusted by carrying the right hash. */
export function assertTrustedSourcePlacementContext(value: unknown): asserts value is TrustedSourcePlacementContext {
  const proof = value !== null && typeof value === "object" ? trustedContexts.get(value) : undefined;
  demand(proof && contextDigest(value as TrustedSourcePlacementContext) === proof.digest, "untrusted or changed placement context");
}
export function sourcePlacementForHide(context: TrustedSourcePlacementContext, hideId: string): SourcePlacementHideContract | null {
  assertTrustedSourcePlacementContext(context);
  return trustedContexts.get(context)!.contracts.get(hideId) ?? null;
}
export async function resolveLocalPatchBoardForGame(db: Reader, gameId: string, boardId: string, sceneVersion: number) {
  const context = await resolveLocalPatchBoardsForGame(db, gameId, sceneVersion);
  return { context, board: context.boards.find(board => board.board === boardId) ?? null };
}

export function sourceBodyForHide(context:TrustedSourcePlacementContext,hideId:string){assertTrustedSourcePlacementContext(context);return trustedContexts.get(context)!.bodies.get(hideId)??null;}
export function sourcePlacementManifestForHide(context:TrustedSourcePlacementContext,hideId:string){return sourceBodyForHide(context,hideId)?SOURCE_BODY_REPAIR_MANIFEST_SHA256:context.manifestSha256;}

export function sourceBodyBirthForHide(context:TrustedSourcePlacementContext,hideId:string){assertTrustedSourcePlacementContext(context);const proof=trustedContexts.get(context)!;return proof.bodies.has(hideId)?proof.birthPin:null;}
