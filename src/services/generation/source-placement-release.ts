import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { SOURCE_PLACEMENT_BASE, SOURCE_PLACEMENT_RELEASE, SOURCE_PLACEMENT_RELEASE_ID,
  SOURCE_PLACEMENT_RELEASE_SHA256, assertSourcePlacementReleaseHash } from "../../../content/adventures/source-placement-release";
import { localPatchBoardsForVersion } from "../../domain/scene/local-patch-catalog";
import { LocalPatchBoardSchema, type LocalPatchBoard } from "../../domain/scene/local-patch-hides";
import { SOURCE_PLACEMENT_POLICY_ACTION, SOURCE_PLACEMENT_POLICY_VERSION, sourcePlacementCanonical,
  sourcePlacementSha256, validateSourcePlacementRelease, type SourcePlacementHideContract } from "../../domain/scene/source-placement-release";
import { env } from "../../lib/env";
import { leanReleaseOf, leanReleaseReceipt, LOCAL_PATCH_LEAN_RELEASE } from "./lean-release";
import { dualVisualReviewVersion, DUAL_VISUAL_REVIEW_V3 } from "./visual-review-release";

export type { SourcePlacementHideContract } from "../../domain/scene/source-placement-release";
type Reader = Pick<Prisma.TransactionClient, "auditLog">;
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const pinSchema = z.object({ version: z.literal(SOURCE_PLACEMENT_POLICY_VERSION),
  gameId: z.string().min(1).max(200).regex(/^[A-Za-z0-9_:-]+$/),
  releaseId: z.literal(SOURCE_PLACEMENT_RELEASE_ID), manifestSha256: hex, baseSceneVersion: z.literal(12),
  leanPinSha256: hex, compositeQualificationSha256: hex,
  coverage: z.array(z.object({ boardId: z.string(), hideId: z.string(), contractSha256: hex }).strict()).max(54),
}).strict();
export type SourcePlacementReleasePin = z.infer<typeof pinSchema>;
export const sourcePlacementReleaseAuditId = (gameId: string) => `aud_source_placement_${gameId}`;
const hashBytes = (value: string) => createHash("sha256").update(value).digest("hex");
const demand = (ok: unknown, reason: string): void => { if (!ok) throw Error(`SOURCE_PLACEMENT: ${reason}`); };

function qualifiedReceipt(gameId: string): SourcePlacementReleasePin {
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
  const row = await db.auditLog.findUnique({ where: { id: sourcePlacementReleaseAuditId(gameId) } });
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
  const receipt = qualifiedReceipt(gameId), metaJson = sourcePlacementCanonical(receipt);
  const row = await tx.auditLog.upsert({ where: { id: sourcePlacementReleaseAuditId(gameId) }, update: {},
    create: { id: sourcePlacementReleaseAuditId(gameId), actorType: "SYSTEM", action: SOURCE_PLACEMENT_POLICY_ACTION,
      entityType: "Game", entityId: gameId, metaJson } });
  demand(row.actorType === "SYSTEM" && row.actorId === null && row.action === SOURCE_PLACEMENT_POLICY_ACTION
    && row.entityType === "Game" && row.entityId === gameId && row.metaJson === metaJson, "companion enrollment conflicts with its original pin");
}

const contextBrand: unique symbol = Symbol("trusted-source-placement-context");
export type TrustedSourcePlacementContext = {
  readonly [contextBrand]: true;
  readonly gameId: string; readonly sceneVersion: number;
  readonly boards: readonly LocalPatchBoard[];
  readonly release: SourcePlacementReleasePin | null;
  readonly manifestSha256: string | null;
};
type ContextProof = { digest: string; contracts: Map<string, SourcePlacementHideContract> };
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
  let boards = localPatchBoardsForVersion(sceneVersion), contracts = new Map<string, SourcePlacementHideContract>();
  if (release) {
    demand(sceneVersion === 12, "companion cannot reinterpret another scene version");
    assertSourcePlacementReleaseHash();
    const manifest = validateSourcePlacementRelease(SOURCE_PLACEMENT_RELEASE, SOURCE_PLACEMENT_BASE);
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
  const context: TrustedSourcePlacementContext = Object.freeze({ [contextBrand]: true as const, gameId, sceneVersion,
    boards, release: release ? freeze(release) : null, manifestSha256: release?.manifestSha256 ?? null });
  trustedContexts.set(context, { digest: contextDigest(context), contracts });
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
