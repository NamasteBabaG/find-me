import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { PrismaWorldBudgetStore } from "../../../infra/db/prisma-world-budget-store";
import { CasWorldBudgetRepository } from "../../../infra/db/world-budget-repository";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import type { Container } from "../../container";
import { boardsOfWorlds } from "../../world-catalog.service";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { boardWizardBudget } from "../board-wizard-budget";
import { WorldBudgetError } from "../world-budget";
import { activateLocalPatchEmergencyBudget, readLocalPatchEmergencyBudget, localPatchEmergencyBudgetAuditId,
  LOCAL_PATCH_EMERGENCY_BUDGET_POLICY, deferLocalPatchIdentityAtAuthorizedCap } from "../local-patch-budget-recovery";
import { bill } from "./local-patch-fixtures";
import { fenceBoardWizardIdentityClaim, type BoardWizardIdentityClaim } from "../board-wizard-identity-lifecycle";

const fakes = vi.hoisted(() => ({ appEnv: "qa" }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: fakes.appEnv }), spendGuard: () => ({}) }));
let db: PrismaClient, c: Container, directory: string, serial = 0;
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-emergency-budget-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(directory, "test.db").replaceAll("\\", "/")}` } } });
  await applyTestSchema(db); c = { db, storage: new DbStorage(db) } as unknown as Container;
});
beforeEach(() => { fakes.appEnv = "qa"; vi.stubGlobal("fetch", vi.fn(async () => { throw Error("Network forbidden"); })); });
afterAll(async () => { vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(directory) === realpathSync(tmpdir()) && path.basename(directory).startsWith("findme-emergency-budget-")) rmSync(directory, { recursive: true }); });
async function seed(amountMicroUsd = 3_900_000, worldSlug = "journey") {
  const gameId = `emergency-${++serial}`, ownerId = `owner-${gameId}`, childId = `child-${gameId}`;
  await db.user.create({ data: { id: ownerId, email: `${ownerId}@example.invalid` } });
  await db.childProfile.create({ data: { id: childId, ownerId, displayName: "Synthetic", ageYears: 8 } });
  await db.game.create({ data: { id: gameId, ownerId, childProfileId: childId, styleVersion: "local-patch-world-v1", status: "TARGETS_GENERATING", sceneCount: 9, packageTier: "ONE_WORLD" } });
  await db.order.create({ data: { id: `order-${gameId}`, gameId, userId: ownerId, paymentStatus: "PAID", paidAt: new Date(), provider: "mock", packageTier: "ONE_WORLD", amountAgorot: 3900 } });
  await db.generationJob.create({ data: { id: `job_${gameId}`, gameId, status: "RUNNING", currentStep: "local-patch" } });
  const worldSlugs = new Set(boardsOfWorlds([worldSlug]));
  const boards = localPatchBoardsForVersion(12).filter(board => worldSlugs.has(board.board));
  expect(boards).toHaveLength(9);
  for (const [orderIndex, board] of boards.entries())
    await db.gameScene.create({ data: { id: `scene-${gameId}-${board.board}`, gameId, sceneSlug: board.board, sceneVersion: 12, orderIndex } });
  const worldId = boardWizardWorldId(gameId), budget = boardWizardBudgetOf(c);
  await budget.reserve(worldId, { requestKey: "previous-work", scope: "image", operationFingerprint: "previous-work", reserveMicroUsd: amountMicroUsd });
  await budget.settle(worldId, "previous-work", bill(`receipt-${gameId}`, amountMicroUsd));
  const request = { requestKey: `self-repair:board:giza:${"a".repeat(64)}`, scope: "judge" as const, operationFingerprint: "a".repeat(64), reserveMicroUsd: 300_000 };
  let refused: unknown;
  try { await budget.reserve(worldId, request); } catch (error) { refused = error; }
  expect(refused).toBeInstanceOf(WorldBudgetError);
  return { gameId, worldId, ownerId, childId, budget, request, refused };
}
async function identityFixture() {
  const f = await seed(), photoId = `photo-${f.gameId}`;
  await db.asset.create({ data: { id: photoId, ownerId: f.ownerId, type: "ORIGINAL_PHOTO", visibility: "PRIVATE",
    mimeType: "image/png", storagePath: `private/${photoId}.png` } });
  await db.childProfile.update({ where: { id: f.childId }, data: { originalPhotoAssetId: photoId } });
  await db.game.update({ where: { id: f.gameId }, data: { status: "AVATAR_GENERATING" } });
  await db.generationJob.update({ where: { id: `job_${f.gameId}` }, data: { currentStep: "avatar", attempts: 1 } });
  const claim: BoardWizardIdentityClaim = { gameId: f.gameId, jobId: `job_${f.gameId}`, jobAttempt: 1, styleVersion: "local-patch-world-v1",
    ownerId: f.ownerId, childId: f.childId, photoAssetId: photoId, identityAssetId: null, avatarAssetId: null, childName: "Synthetic", ageYears: 8 };
  const request = { requestKey: "wizard:identity:2", scope: "identity" as const, operationFingerprint: "b".repeat(64), reserveMicroUsd: 500_000 };
  let refused: unknown;
  try { await f.budget.reserve(f.worldId, request); } catch (error) { refused = error; }
  expect(refused).toBeInstanceOf(WorldBudgetError);
  return { ...f, claim, request, refused, fence: (tx: Parameters<typeof fenceBoardWizardIdentityClaim>[0]) => fenceBoardWizardIdentityClaim(tx, claim) };
}
describe("standing automatic five-dollar v12 recovery policy", () => {
  it.each(["pending", "unknown", "overrun", "refunded", "deleted", "stale-job", "changed-child", "wrong-stage"])("native-cap deferral does not bypass %s", async kind => {
    const f = await identityFixture();
    expect(await activateLocalPatchEmergencyBudget(c, f.gameId, f.refused, f.fence, "identity")).toBe(true);
    await f.budget.reserve(f.worldId, { requestKey: "retained-authorized-work", scope: "identity", operationFingerprint: "retained-authorized-work", reserveMicroUsd: 1_000_000 });
    await f.budget.settle(f.worldId, "retained-authorized-work", bill(`authorized-${f.gameId}`, 1_000_000));
    await db.generationJob.update({ where: { id: f.claim.jobId }, data: { status: "RUNNING" } });
    let error: unknown;
    try { await f.budget.reserve(f.worldId, f.request); } catch (refusal) { error = refusal; }
    expect(error).toBeInstanceOf(WorldBudgetError); expect((error as WorldBudgetError).refusedReservation).toBeUndefined();
    if (["pending", "unknown", "overrun"].includes(kind)) {
      await f.budget.reserve(f.worldId, { requestKey: "unresolved", scope: "identity", operationFingerprint: "unresolved", reserveMicroUsd: 10_000 });
      if (kind === "unknown") await f.budget.markUnknown(f.worldId, "unresolved", "Unresolved synthetic bill");
      if (kind === "overrun") await f.budget.settle(f.worldId, "unresolved", bill(`overrun-native-${f.gameId}`, 20_000));
    }
    if (kind === "refunded") await db.order.update({ where: { id: `order-${f.gameId}` }, data: { paymentStatus: "REFUNDED", refundedAt: new Date() } });
    if (kind === "deleted") await db.game.update({ where: { id: f.gameId }, data: { status: "DELETED", deletedAt: new Date() } });
    if (kind === "stale-job") await db.generationJob.update({ where: { id: f.claim.jobId }, data: { attempts: 2 } });
    if (kind === "changed-child") await db.childProfile.update({ where: { id: f.childId }, data: { ageYears: 9 } });
    if (kind === "wrong-stage") await db.game.update({ where: { id: f.gameId }, data: { status: "GENERATION_FAILED" } });
    const before = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } });
    const deferral = deferLocalPatchIdentityAtAuthorizedCap(c, f.gameId, error, f.request, f.fence);
    if (["deleted", "stale-job", "changed-child"].includes(kind)) await expect(deferral).rejects.toThrow();
    else expect(await deferral).toBe(false);
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } })).toEqual(before);
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: f.claim.jobId } })).toMatchObject({ status: "RUNNING" });
    expect(await db.auditLog.count({ where: { entityId: f.gameId, action: LOCAL_PATCH_EMERGENCY_BUDGET_POLICY } })).toBe(1);
  });
  it("uses the same immutable receipt for the fenced identity stage and revokes it on refund", async () => {
    const f = await identityFixture(), before = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } });
    expect(await activateLocalPatchEmergencyBudget(c, f.gameId, f.refused, f.fence, "identity")).toBe(true);
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: f.claim.jobId } })).toMatchObject({ status: "QUEUED", currentStep: "avatar", attempts: 1 });
    expect(await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).toMatchObject({ status: "AVATAR_GENERATING", configJson: null });
    expect((await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } })).snapshotJson).toBe(before.snapshotJson);
    expect(await f.budget.audit(f.worldId)).toMatchObject({ capMicroUsd: 5_000_000, settledMicroUsd: 3_900_000 });
    await db.order.update({ where: { id: `order-${f.gameId}` }, data: { paymentStatus: "REFUNDED", refundedAt: new Date() } });
    expect(await readLocalPatchEmergencyBudget(c, f.worldId)).toBeNull();
    await expect(f.budget.reserve(f.worldId, f.request)).rejects.toMatchObject({ code: "cap_exceeded" });
    expect(await db.auditLog.count({ where: { entityId: f.gameId, action: LOCAL_PATCH_EMERGENCY_BUDGET_POLICY } })).toBe(1);
  });
  it.each(["unpaid", "refunded", "deleted", "wrong-owner", "deleted-child", "old-version", "pending", "unknown", "overrun", "stale-job", "changed-child", "wrong-stage", "wrong-scope", "production"])("identity-stage activation does not bypass %s", async kind => {
    const f = await identityFixture();
    if (kind === "unpaid" || kind === "refunded") await db.order.update({ where: { id: `order-${f.gameId}` }, data: { paymentStatus: kind === "unpaid" ? "PENDING" : "REFUNDED", ...(kind === "refunded" ? { refundedAt: new Date() } : {}) } });
    if (kind === "deleted") await db.game.update({ where: { id: f.gameId }, data: { status: "DELETED", deletedAt: new Date() } });
    if (kind === "wrong-owner") {
      const otherOwnerId = `other-${f.ownerId}`;
      await db.user.create({ data: { id: otherOwnerId, email: `${otherOwnerId}@example.invalid` } });
      await db.order.update({ where: { id: `order-${f.gameId}` }, data: { userId: otherOwnerId } });
    }
    if (kind === "deleted-child") await db.childProfile.update({ where: { id: f.childId }, data: { deletedAt: new Date() } });
    if (kind === "old-version") await db.gameScene.updateMany({ where: { gameId: f.gameId }, data: { sceneVersion: 11 } });
    if (kind === "stale-job") await db.generationJob.update({ where: { id: f.claim.jobId }, data: { attempts: 2 } });
    if (kind === "changed-child") await db.childProfile.update({ where: { id: f.childId }, data: { ageYears: 9 } });
    if (kind === "wrong-stage") await db.game.update({ where: { id: f.gameId }, data: { status: "PAID" } });
    if (["pending", "unknown", "overrun"].includes(kind)) {
      const request = { requestKey: "retained-unresolved", scope: "identity" as const, operationFingerprint: "retained-unresolved", reserveMicroUsd: 10_000 };
      await f.budget.reserve(f.worldId, request);
      if (kind === "unknown") await f.budget.markUnknown(f.worldId, request.requestKey, "No reliable provider charge");
      if (kind === "overrun") await f.budget.settle(f.worldId, request.requestKey, bill(`overrun-${f.gameId}`, 20_000));
    }
    if (kind === "production") fakes.appEnv = "production";
    let error = f.refused;
    if (kind === "wrong-scope") {
      try { await f.budget.reserve(f.worldId, { ...f.request, requestKey: "board-review" }); } catch (refusal) { error = refusal; }
    }
    const before = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } });
    const jobBefore = await db.generationJob.findUniqueOrThrow({ where: { id: f.claim.jobId } });
    const activation = activateLocalPatchEmergencyBudget(c, f.gameId, error, f.fence, "identity");
    if (["deleted", "deleted-child", "stale-job", "changed-child"].includes(kind)) await expect(activation).rejects.toThrow();
    else expect(await activation).toBe(false);
    expect((await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } })).snapshotJson).toBe(before.snapshotJson);
    expect((await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } })).revision).toBe(before.revision);
    expect((await db.generationJob.findUniqueOrThrow({ where: { id: f.claim.jobId } })).status).toBe(jobBefore.status);
    expect((await db.generationJob.findUniqueOrThrow({ where: { id: f.claim.jobId } })).attempts).toBe(jobBefore.attempts);
    expect(await db.auditLog.count({ where: { entityId: f.gameId, action: LOCAL_PATCH_EMERGENCY_BUDGET_POLICY } })).toBe(0);
  });
  it("activates only after a real base-cap refusal, preserves every request and never stacks or publishes", async () => {
    const f = await seed(), before = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } });
    expect(await readLocalPatchEmergencyBudget(c, f.worldId)).toBeNull();
    expect(await activateLocalPatchEmergencyBudget(c, f.gameId, f.refused, async () => {})).toBe(true);
    const after = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } });
    expect(after.snapshotJson).toBe(before.snapshotJson); expect(after.revision).toBe(before.revision + 1);
    expect(await f.budget.audit(f.worldId)).toMatchObject({ capMicroUsd: 5_000_000, settledMicroUsd: 3_900_000, remainingMicroUsd: 1_100_000 });
    expect(await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).toMatchObject({ status: "TARGETS_GENERATING", configJson: null, readyAt: null });
    expect(await activateLocalPatchEmergencyBudget(c, f.gameId, f.refused, async () => {})).toBe(false);
    await f.budget.reserve(f.worldId, f.request); await f.budget.settle(f.worldId, f.request.requestKey, bill(`review-${f.gameId}`, 50_000));
    await f.budget.reserve(f.worldId, { ...f.request, requestKey: "fills-five", reserveMicroUsd: 1_050_000 });
    await expect(f.budget.reserve(f.worldId, { ...f.request, requestKey: "over-five", reserveMicroUsd: 1 })).rejects.toMatchObject({ code: "cap_exceeded" });
    expect(await db.auditLog.count({ where: { entityId: f.gameId, action: LOCAL_PATCH_EMERGENCY_BUDGET_POLICY } })).toBe(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("retains a policy-approved UNKNOWN reservation in full", async () => {
    const f = await seed(3_800_000), raw = boardWizardBudget(new CasWorldBudgetRepository(new PrismaWorldBudgetStore(db)), 1, { authorizeAutomaticImageRecovery: async () => true });
    const hide = localPatchBoardsForVersion(12)[0]!.hides[0]!;
    const image = { requestKey: `${hide.id}:${hide.pose}:render:1`, scope: "image" as const, operationFingerprint: "b".repeat(64), reserveMicroUsd: 120_000 };
    await f.budget.reserve(f.worldId, image); await f.budget.markUnknown(f.worldId, image.requestKey, "retained transport");
    await raw.authorizeAutomaticImageRecovery(f.worldId, { ...image, approvalId: "approved-interruption", policyId: "local-patch-image-interruption/v1",
      unknownReasons: ["retained transport"], authorizationSha256: "c".repeat(64), authorizedAt: "2026-09-30T00:00:00.000Z" });
    const original = await f.budget.readRequest(f.worldId, image.requestKey);
    expect(await activateLocalPatchEmergencyBudget(c, f.gameId, f.refused, async () => {})).toBe(true);
    expect(await f.budget.readRequest(f.worldId, image.requestKey)).toEqual(original);
    expect(await f.budget.audit(f.worldId)).toMatchObject({ capMicroUsd: 5_000_000, held: false, reservedMicroUsd: 120_000, committedMicroUsd: 3_920_000 });
  });
  it("gives a separate complete kingdom purchase its own five-dollar ceiling without extending the journey ledger", async () => {
    const journey = await seed(), kingdom = await seed(3_900_000, "kingdom");
    expect(kingdom.worldId).not.toBe(journey.worldId);
    expect(await activateLocalPatchEmergencyBudget(c, kingdom.gameId, kingdom.refused, async () => {})).toBe(true);
    expect(await kingdom.budget.audit(kingdom.worldId)).toMatchObject({ capMicroUsd: 5_000_000, settledMicroUsd: 3_900_000 });
    expect(await journey.budget.audit(journey.worldId)).toMatchObject({ capMicroUsd: 4_000_000, settledMicroUsd: 3_900_000 });
    await kingdom.budget.reserve(kingdom.worldId, { ...kingdom.request, requestKey: "kingdom-five", reserveMicroUsd: 1_100_000 });
    await expect(kingdom.budget.reserve(kingdom.worldId, { ...kingdom.request, requestKey: "kingdom-over-five", reserveMicroUsd: 1 }))
      .rejects.toMatchObject({ code: "cap_exceeded" });
    expect(await activateLocalPatchEmergencyBudget(c, journey.gameId, journey.refused, async () => {})).toBe(true);
    expect(await journey.budget.audit(journey.worldId)).toMatchObject({ capMicroUsd: 5_000_000, settledMicroUsd: 3_900_000 });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it.each(["unpaid", "refunded", "deleted", "old-version", "wrong-world", "unapproved-unknown", "pending", "over-five", "production"])("does not bypass %s", async kind => {
    const f = await seed();
    if (kind === "unpaid" || kind === "refunded") await db.order.update({ where: { id: `order-${f.gameId}` }, data: { paymentStatus: kind === "unpaid" ? "PENDING" : "REFUNDED", ...(kind === "refunded" ? { refundedAt: new Date() } : {}) } });
    if (kind === "deleted") await db.game.update({ where: { id: f.gameId }, data: { deletedAt: new Date(), status: "DELETED" } });
    if (kind === "old-version") await db.gameScene.updateMany({ where: { gameId: f.gameId }, data: { sceneVersion: 11 } });
    if (kind === "unapproved-unknown" || kind === "pending") { const r = { ...f.request, requestKey: "live-old", reserveMicroUsd: 10_000 }; await f.budget.reserve(f.worldId, r);
      if (kind === "unapproved-unknown") await f.budget.markUnknown(f.worldId, r.requestKey, "missing receipt"); }
    if (kind === "production") fakes.appEnv = "production";
    const error = kind === "wrong-world" ? new WorldBudgetError("cap_exceeded", "wrong", { ...f.request, worldId: "other:board-wizard" })
      : kind === "over-five" ? new WorldBudgetError("cap_exceeded", "over", { ...f.request, worldId: f.worldId, reserveMicroUsd: 1_100_001 }) : f.refused;
    const before = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } });
    if (kind === "deleted") await expect(activateLocalPatchEmergencyBudget(c, f.gameId, error, async () => {})).rejects.toThrow("deleted");
    else expect(await activateLocalPatchEmergencyBudget(c, f.gameId, error, async () => {})).toBe(false);
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } })).toEqual(before);
    expect(await db.auditLog.count({ where: { entityId: f.gameId, action: LOCAL_PATCH_EMERGENCY_BUDGET_POLICY } })).toBe(0);
  });
  it("rolls back a lost job fence and rejects tampered receipts", async () => {
    const f = await seed(), before = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } });
    await expect(activateLocalPatchEmergencyBudget(c, f.gameId, f.refused, async () => { throw Error("lost claim"); })).rejects.toThrow("lost claim");
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } })).toEqual(before);
    await activateLocalPatchEmergencyBudget(c, f.gameId, f.refused, async () => {});
    const row = await db.auditLog.findUniqueOrThrow({ where: { id: localPatchEmergencyBudgetAuditId(f.worldId) } });
    const receipt = JSON.parse(row.metaJson!); receipt.capMicroUsd = 6_000_000;
    await db.auditLog.update({ where: { id: row.id }, data: { metaJson: JSON.stringify(receipt) } });
    await expect(readLocalPatchEmergencyBudget(c, f.worldId)).rejects.toThrow();
  });
});
