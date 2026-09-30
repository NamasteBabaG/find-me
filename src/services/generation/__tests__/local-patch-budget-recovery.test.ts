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
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { boardWizardBudget } from "../board-wizard-budget";
import { WorldBudgetError } from "../world-budget";
import { activateLocalPatchEmergencyBudget, readLocalPatchEmergencyBudget, localPatchEmergencyBudgetAuditId,
  LOCAL_PATCH_EMERGENCY_BUDGET_POLICY } from "../local-patch-budget-recovery";
import { bill } from "./local-patch-fixtures";

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
async function seed(amountMicroUsd = 3_900_000) {
  const gameId = `emergency-${++serial}`, ownerId = `owner-${gameId}`, childId = `child-${gameId}`;
  await db.user.create({ data: { id: ownerId, email: `${ownerId}@example.invalid` } });
  await db.childProfile.create({ data: { id: childId, ownerId, displayName: "Synthetic", ageYears: 8 } });
  await db.game.create({ data: { id: gameId, ownerId, childProfileId: childId, styleVersion: "local-patch-world-v1", status: "TARGETS_GENERATING", sceneCount: 9, packageTier: "ONE_WORLD" } });
  await db.order.create({ data: { id: `order-${gameId}`, gameId, userId: ownerId, paymentStatus: "PAID", paidAt: new Date(), provider: "mock", packageTier: "ONE_WORLD", amountAgorot: 3900 } });
  await db.generationJob.create({ data: { id: `job_${gameId}`, gameId, status: "RUNNING", currentStep: "local-patch" } });
  for (const [orderIndex, board] of localPatchBoardsForVersion(12).entries())
    await db.gameScene.create({ data: { id: `scene-${gameId}-${board.board}`, gameId, sceneSlug: board.board, sceneVersion: 12, orderIndex } });
  const worldId = boardWizardWorldId(gameId), budget = boardWizardBudgetOf(c);
  await budget.reserve(worldId, { requestKey: "previous-work", scope: "image", operationFingerprint: "previous-work", reserveMicroUsd: amountMicroUsd });
  await budget.settle(worldId, "previous-work", bill(`receipt-${gameId}`, amountMicroUsd));
  const request = { requestKey: `self-repair:board:giza:${"a".repeat(64)}`, scope: "judge" as const, operationFingerprint: "a".repeat(64), reserveMicroUsd: 300_000 };
  let refused: unknown;
  try { await budget.reserve(worldId, request); } catch (error) { refused = error; }
  expect(refused).toBeInstanceOf(WorldBudgetError);
  return { gameId, worldId, ownerId, budget, request, refused };
}
describe("standing automatic five-dollar v12 recovery policy", () => {
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
