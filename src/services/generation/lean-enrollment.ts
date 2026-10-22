import { hasLocalPatchCapability } from "../../domain/scene/local-patch-family";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { BACKGROUND_REVIEW_TRANSPORT } from "../../domain/generation/background-review-round";
import { SUBJECT_POLICY_VERSION, subjectPlanCanonical, subjectPlansForBoard } from "../../domain/generation/subject-policy";
import { resolveLocalPatchBoardsForGame } from "./source-placement-release";
import { localPatchBoardForVersion } from "../../domain/scene/local-patch-catalog";
import { validChildAge } from "../../domain/child-appearance";
import { worldsOwned } from "../world-catalog.service";
import { sha256Bytes } from "./fixed-sprite";
import { fenceLocalPatchImages } from "./local-patch-lifecycle";
import { LOCAL_PATCH_LEAN_RELEASE, leanReleaseOf } from "./lean-release";
import { DUAL_VISUAL_REVIEW_V3, dualVisualReviewVersion } from "./visual-review-release";
import { SUBJECT_REVIEW_RECOVERY, SUBJECT_UPGRADE_ACTION, SUBJECT_UPGRADE_VERSION, SYSTEM_ENROLLMENT_OPERATOR, subjectUpgradeAuditId,
  subjectUpgradeOf, subjectUpgradeReceiptSchema } from "./subject-enrollment";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
export const LEAN_ENROLLMENT_VERSION = "lean-subject-enrollment/v1" as const;

export type LeanEnrollment = { readonly state: "not-lean" | "enrolled" } | { readonly state: "refused"; readonly reason: string };

/**
 * A lean world (local-patch-lean/v1) enrolls itself in the subject policy before its first painting: the
 * same immutable receipt an owner's enrollment writes (subject-upgrade.ts), bound to the same live private
 * photograph, identity, age and plan, with the release as its SYSTEM operator. Called inside the world's
 * claimed slice, under its fence; idempotent. Refused, with its reason and nothing written, when any binding
 * is missing or any painting was already bought (a lean world never paints outside its subject policy).
 */
export async function enrollLeanWorld(c: Container, gameId: string, fence: (tx: Prisma.TransactionClient) => Promise<void>): Promise<LeanEnrollment> {
  const release = await leanReleaseOf(c.db, gameId);
  if (!release) return { state: "not-lean" };
  if (await subjectUpgradeOf(c.db, gameId)) return { state: "enrolled" };
  const refused = (reason: string): LeanEnrollment => ({ state: "refused", reason: `local-patch-lean: the world cannot enroll in its subject policy: ${reason}. Nothing was painted or bought; a service decision is required.` });
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { scenes: true, orders: true, childProfile: true } });
  if (!game || game.status !== "TARGETS_GENERATING" || game.deletedAt || game.configJson || game.readyAt || !game.ownerId
    || game.styleVersion !== "local-patch-world-v1") return refused("the world is not a live local-patch world in generation");
  const sceneVersion = game.scenes[0]?.sceneVersion;
  if (game.scenes.length !== 9 || !hasLocalPatchCapability(sceneVersion, "subjectEnrollment") || game.scenes.some(s => s.sceneVersion !== sceneVersion) || worldsOwned(game.scenes.map(s => s.sceneSlug)).length !== 1)
    return refused("the world is not one complete supported nine-board world");
  if (!game.orders.some(o => o.userId === game.ownerId && o.paymentStatus === "PAID" && o.paidAt && !o.refundedAt)
    || game.orders.some(o => o.paymentStatus === "REFUNDED" || o.refundedAt)) return refused("there is no confirmed, unrefunded payment by the owner");
  if (await dualVisualReviewVersion(c.db, gameId) !== DUAL_VISUAL_REVIEW_V3) return refused("the world is not pinned to dual review v3");
  if (!c.backgroundReview) return refused("the background review transport is not configured");
  const child = game.childProfile;
  if (!child || child.deletedAt || child.ownerId !== game.ownerId || !validChildAge(child.ageYears) || !child.identityAssetId || !child.originalPhotoAssetId)
    return refused("the child profile, its age, identity or photograph is not live");
  const [identity, photo] = await Promise.all([c.db.asset.findUnique({ where: { id: child.identityAssetId } }), c.db.asset.findUnique({ where: { id: child.originalPhotoAssetId } })]);
  if (!identity || identity.ownerId !== game.ownerId || identity.type !== "IDENTITY_SHEET" || identity.visibility !== "PRIVATE" || identity.status !== "READY" || identity.deletedAt)
    return refused("the original identity is not a live private asset of this owner");
  if (!photo || photo.ownerId !== game.ownerId || photo.type !== "ORIGINAL_PHOTO" || photo.visibility !== "PRIVATE" || photo.status !== "READY" || photo.deletedAt)
    return refused("the privately owned original photograph is not available");
  if (await c.db.targetVariantAsset.findFirst({ where: { targetInstance: { gameScene: { gameId } }, attempts: { gt: 0 } } }))
    return refused("a painting was started before the enrollment");
  const placements = sceneVersion === 13 ? await resolveLocalPatchBoardsForGame(c.db, gameId, sceneVersion) : null;
  const boards = game.scenes.map(scene => placements ? placements.boards.find(board => board.board === scene.sceneSlug) : localPatchBoardForVersion(scene.sceneSlug, 12));
  if (boards.some(board => !board) || boards.some(board => board!.hides.length !== 3)) return refused("a board has no complete authored placements");
  const receipt = subjectUpgradeReceiptSchema.parse({ version: SUBJECT_UPGRADE_VERSION, gameId, ownerId: game.ownerId,
    subjectPolicy: SUBJECT_POLICY_VERSION, continuityTransport: BACKGROUND_REVIEW_TRANSPORT, reviewRecovery: SUBJECT_REVIEW_RECOVERY,
    dualReviewRelease: DUAL_VISUAL_REVIEW_V3, photoAssetId: photo.id, photoSha256: sha256Bytes(await c.storage.get(photo.storagePath)),
    identityAssetId: identity.id, identitySha256: sha256Bytes(await c.storage.get(identity.storagePath)), ageYears: child.ageYears,
    operatorId: SYSTEM_ENROLLMENT_OPERATOR, actorType: "SYSTEM",
    authorizationSha256: sha(JSON.stringify({ version: LEAN_ENROLLMENT_VERSION, release: LOCAL_PATCH_LEAN_RELEASE, gameId })),
    planSha256: sha(JSON.stringify(boards.map(board => subjectPlansForBoard(board!).map(subjectPlanCanonical)))),
    enrolledAt: new Date().toISOString() });
  try {
    await c.db.$transaction(async tx => {
      await fenceLocalPatchImages(tx, gameId); await fence(tx);
      if (sceneVersion === 13) {
        const pinned = await resolveLocalPatchBoardsForGame(tx, gameId, sceneVersion);
        const actual = game.scenes.map(scene => pinned.boards.find(board => board.board === scene.sceneSlug));
        if (actual.some(board => !board) || sha(JSON.stringify(actual.map(board => subjectPlansForBoard(board!).map(subjectPlanCanonical)))) !== receipt.planSha256)
          throw Error("LEAN_ENROLLMENT: Detective source family or subject plans changed before enrollment");
      }
      const current = await tx.game.findUniqueOrThrow({ where: { id: gameId }, include: { childProfile: true } });
      const live = await tx.asset.findMany({ where: { id: { in: [receipt.photoAssetId, receipt.identityAssetId] }, ownerId: receipt.ownerId,
        visibility: "PRIVATE", status: "READY", deletedAt: null } });
      if (current.status !== "TARGETS_GENERATING" || current.childProfile?.ageYears !== receipt.ageYears
        || current.childProfile.originalPhotoAssetId !== receipt.photoAssetId || current.childProfile.identityAssetId !== receipt.identityAssetId || live.length !== 2
        || await tx.targetVariantAsset.findFirst({ where: { targetInstance: { gameScene: { gameId } }, attempts: { gt: 0 } } }))
        throw Error("LEAN_ENROLLMENT: the world, child or private evidence changed while enrolling; nothing was written");
      await tx.auditLog.create({ data: { id: subjectUpgradeAuditId(gameId), actorType: "SYSTEM", actorId: SYSTEM_ENROLLMENT_OPERATOR,
        action: SUBJECT_UPGRADE_ACTION, entityType: "Game", entityId: gameId, metaJson: JSON.stringify(receipt) } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
  } catch (error) {
    // Another worker's enrollment of the same world is this one.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
  }
  return await subjectUpgradeOf(c.db, gameId) ? { state: "enrolled" } : refused("the enrollment could not be read back");
}
