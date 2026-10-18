import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Container } from "../../container";
import { loadSubjectPhoto, subjectDirectionFor } from "../local-patch-subject-review";
import { SUBJECT_UPGRADE_ACTION, SUBJECT_UPGRADE_VERSION, subjectUpgradeAuditId, subjectUpgradeReceiptSchema } from "../subject-enrollment";
import { SUBJECT_POLICY_VERSION } from "../../../domain/generation/subject-policy";
import { LOCAL_PATCH_LOW_IMAGE_POLICY, localPatchRenderPolicySha256 } from "../../../infra/generation/openai-local-patch";
import { sha256Bytes } from "../fixed-sprite";
import { DUAL_VISUAL_REVIEW_V3 } from "../visual-review-release";

let png: Buffer;
beforeAll(async () => { png = await sharp({ create: { width: 500, height: 600, channels: 4, background: "#b6a179" } }).png().toBuffer(); });
function fixture() {
  const gameId = "game-synthetic-photo", ownerId = "owner-synthetic";
  const receipt = subjectUpgradeReceiptSchema.parse({ version: SUBJECT_UPGRADE_VERSION, gameId, ownerId,
    subjectPolicy: SUBJECT_POLICY_VERSION, continuityTransport: "openai-responses-background/v1", reviewRecovery: "world-automatic-review-recovery/v2",
    dualReviewRelease: DUAL_VISUAL_REVIEW_V3, photoAssetId: "photo-synthetic", photoSha256: sha256Bytes(png),
    identityAssetId: "identity-synthetic", identitySha256: "a".repeat(64), ageYears: 7, operatorId: ownerId, actorType: "USER",
    authorizationSha256: "b".repeat(64), planSha256: "c".repeat(64), enrolledAt: "2026-10-18T01:00:00.000Z" });
  const asset = { id: receipt.photoAssetId, ownerId, type: "ORIGINAL_PHOTO", visibility: "PRIVATE", status: "READY", deletedAt: null as Date | null,
    storagePath: "private/synthetic-photo.png" };
  const game = { ownerId, deletedAt: null, childProfile: { originalPhotoAssetId: asset.id, identityAssetId: receipt.identityAssetId, ageYears: 7, deletedAt: null } };
  const get = vi.fn(async () => png);
  const c = { db: { asset: { findUnique: async () => asset }, game: { findUnique: async () => game }, auditLog: { findUnique: async () => ({
    id: subjectUpgradeAuditId(gameId), actorType: "USER", actorId: ownerId, action: SUBJECT_UPGRADE_ACTION, entityType: "Game", entityId: gameId,
    metaJson: JSON.stringify(receipt) }) } }, storage: { get } } as unknown as Pick<Container, "db" | "storage">;
  return { c, receipt, asset, game, get, gameId, prepared: { game, child: game.childProfile } };
}
describe("owned photo evidence and explicit affordable redraw quality", () => {
  it("never reads a different owner's private photograph", async () => {
    const f = fixture(); f.asset.ownerId = "another-owner";
    await expect(loadSubjectPhoto(f.c, f.prepared, f.receipt)).rejects.toThrow(/live private asset/); expect(f.get).not.toHaveBeenCalled();
  });
  it("never reads a deleted source or silently substitutes a new photograph", async () => {
    const f = fixture(); f.asset.deletedAt = new Date();
    await expect(loadSubjectPhoto(f.c, f.prepared, f.receipt)).rejects.toThrow(); expect(f.get).not.toHaveBeenCalled();
    f.asset.deletedAt = null; f.game.childProfile.originalPhotoAssetId = "another-photo";
    await expect(loadSubjectPhoto(f.c, f.prepared, f.receipt)).rejects.toThrow(/differs/); expect(f.get).not.toHaveBeenCalled();
  });
  it("refuses changed source bytes even when the asset id and owner still agree", async () => {
    const f = fixture(); f.receipt.photoSha256 = "d".repeat(64);
    await expect(loadSubjectPhoto(f.c, f.prepared, f.receipt)).rejects.toThrow(/bytes differ/);
  });
  it("keeps LOW for a pose-only correction but uses MEDIUM for age/face faults and the final attempt", async () => {
    const f = fixture(), basePolicySha256 = localPatchRenderPolicySha256(LOCAL_PATCH_LOW_IMAGE_POLICY);
    const poseReceipt = JSON.stringify({ boardReview: { dual: { subject: { failedChecks: ["plannedHead"] } } } });
    const low = await subjectDirectionFor(f.c, f.gameId, "newyork-v12-1", 12, poseReceipt, { basePolicySha256, attemptNumber: 2 });
    expect(low?.quality).toBe("low"); expect((await sharp(low!.photoPng).metadata()).height).toBeLessThanOrEqual(384);
    const faceReceipt = JSON.stringify({ boardReview: { dual: { subject: { failedChecks: ["perceivedAge"] } } } });
    const medium = await subjectDirectionFor(f.c, f.gameId, "newyork-v12-1", 12, faceReceipt, { basePolicySha256, attemptNumber: 2 });
    expect(medium?.quality).toBe("medium"); expect(medium?.sha256).not.toBe(low?.sha256);
    expect((await subjectDirectionFor(f.c, f.gameId, "newyork-v12-1", 12, poseReceipt, { basePolicySha256, attemptNumber: 3 }))?.quality).toBe("medium");
    expect(LOCAL_PATCH_LOW_IMAGE_POLICY.quality).toBe("low");
  });
  it("resumes a given attempt with identical question bytes and no timestamp-dependent fingerprint", async () => {
    const f = fixture(), options = { basePolicySha256: localPatchRenderPolicySha256(LOCAL_PATCH_LOW_IMAGE_POLICY), attemptNumber: 2 };
    const a = await subjectDirectionFor(f.c, f.gameId, "newyork-v12-1", 12, null, options);
    const b = await subjectDirectionFor(f.c, f.gameId, "newyork-v12-1", 12, null, options);
    expect(a?.sha256).toBe(b?.sha256); expect(a?.photoSha256).toBe(sha256Bytes(a!.photoPng));
  });
});
