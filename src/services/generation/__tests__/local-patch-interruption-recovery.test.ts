import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { fixedSourceFailureReceipt } from "../../../infra/generation/fixed-source-diagnostics";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import type { Container } from "../../container";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { recoverLocalPatchImageInterruptions, localPatchBudgetReadyForPublication } from "../local-patch-interruption-recovery";
import { LocalPatchRetainedPurchaseStore } from "../local-patch-lifecycle";
import { purchaseOnce, retainedPayloadDigest, RETAINED_PURCHASE_VERSION } from "../paid-operation";
import { localPatchNeedsRecomposition } from "../local-patch-recompose";

let db: PrismaClient, c: Container, directory: string;
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", STORAGE_PROVIDER: "db" }) }));
const boards = localPatchBoardsForVersion(12);
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-image-interruption-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(directory, "test.db").replaceAll("\\", "/")}` } } });
  await applyTestSchema(db); c = { db, storage: new DbStorage(db) } as unknown as Container;
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("Live requests forbidden in interruption regression"); }));
});
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(directory) === realpathSync(tmpdir()) && path.basename(directory).startsWith("findme-image-interruption-")) rmSync(directory, { recursive: true });
});
async function seed(id: string, count = 1, options: { paid?: boolean; diagnosticStatus?: number } = {}) {
  await db.user.create({ data: { id: `usr-${id}`, email: `${id}@example.invalid` } });
  await db.game.create({ data: { id, ownerId: `usr-${id}`, packageTier: "ONE_WORLD", status: "TARGETS_GENERATING", styleVersion: "local-patch-world-v1", sceneCount: 9 } });
  await db.order.create({ data: { id: `ord-${id}`, gameId: id, userId: `usr-${id}`, provider: "mock", packageTier: "ONE_WORLD", amountAgorot: 3900,
    paymentStatus: options.paid === false ? "PENDING" : "PAID", paidAt: options.paid === false ? null : new Date() } });
  await db.generationJob.create({ data: { id: `job_${id}`, gameId: id, status: "FAILED", currentStep: "local-patch:needs-release" } });
  for (const [index, board] of boards.entries()) await db.gameScene.create({ data: { id: `sc-${id}-${board.board}`, gameId: id, sceneSlug: board.board, sceneVersion: 12, orderIndex: index } });
  const budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(id);
  const requests = boards.slice(0, count).map(board => ({ requestKey: `${board.hides[0]!.id}:${board.hides[0]!.pose}:render:1`, scope: "image" as const, operationFingerprint: "a".repeat(64), reserveMicroUsd: 120_000 }));
  for (const [index, request] of requests.entries()) {
    const board = boards[index]!, hide = board.hides[0]!;
    await db.targetInstance.create({ data: { id: `tgt-${id}-${index}`, gameSceneId: `sc-${id}-${board.board}`, targetId: hide.targetId, targetType: "child", slotAId: "hide-1-A", slotBId: "hide-1-B", status: "PENDING" } });
    await db.targetVariantAsset.create({ data: { id: `row-${id}-${index}`, targetInstanceId: `tgt-${id}-${index}`, variant: "A", slotId: "hide-1-A", status: "PENDING", attempts: 1, provider: "local-patch" } });
    await budget.reserve(worldId, request);
  }
  for (const request of requests) {
    const legacy = `${request.requestKey} failed after dispatch: LOCAL_PATCH_PAINTER: ${request.requestKey} was dispatched and no usable image came back (cost_unknown: Request billing is unknown; reservation retained and no retry dispatched)`;
    await budget.markUnknown(worldId, request.requestKey, legacy);
    if (options.diagnosticStatus !== undefined) {
      const failureReceipt = fixedSourceFailureReceipt({ worldId, requestKey: request.requestKey, fingerprint: request.operationFingerprint,
        quality: "medium", reason: "charge-evidence", billing: "unknown", response: { status: options.diagnosticStatus, headers: new Headers() }, jsonStatus: "parsed" });
      const bytes = Buffer.from(JSON.stringify({ version: "local-patch-render/v1", bytesBase64: null, rejected: "provider unavailable", failureReceipt }));
      await new LocalPatchRetainedPurchaseStore(c, id, budget).put(worldId, request.requestKey, { version: RETAINED_PURCHASE_VERSION, worldId, requestKey: request.requestKey,
        scope: request.scope, operationFingerprint: request.operationFingerprint, bytes, payloadSha256: retainedPayloadDigest(bytes), evidence: null, unknownReason: legacy });
    }
  }
  return { budget, worldId, requests };
}
describe("bounded automatic image interruption recovery", () => {
  it("recovers the real missing-result failure, preserving its full unknown reserve and never redispatching that key", async () => {
    const f = await seed("legacy-interruption"), original = await f.budget.readRequest(f.worldId, f.requests[0]!.requestKey);
    expect(await recoverLocalPatchImageInterruptions(c, "legacy-interruption")).toBe(1);
    expect(await f.budget.readRequest(f.worldId, f.requests[0]!.requestKey)).toEqual(original);
    expect(await f.budget.audit(f.worldId)).toMatchObject({ held: false, settledMicroUsd: 0, reservedMicroUsd: 120_000, capMicroUsd: 4_000_000 });
    expect(await localPatchBudgetReadyForPublication(f.budget, f.worldId, 12)).toBe(true);
    expect(await localPatchBudgetReadyForPublication(f.budget, f.worldId, 11)).toBe(false);
    expect(await db.targetVariantAsset.findUnique({ where: { id: "row-legacy-interruption-0" } })).toMatchObject({ status: "FAILED", attempts: 1, assetId: null });
    expect(localPatchNeedsRecomposition((await db.targetVariantAsset.findUniqueOrThrow({ where: { id: "row-legacy-interruption-0" } })), 12)).toBe(false);
    expect(await db.generationJob.findUnique({ where: { id: "job_legacy-interruption" } })).toMatchObject({ status: "QUEUED", currentStep: "local-patch" });
    const buy = vi.fn();
    expect(await purchaseOnce({ ledger: f.budget, store: new LocalPatchRetainedPurchaseStore(c, "legacy-interruption", f.budget) }, { worldId: f.worldId, ...f.requests[0]!, buy })).toMatchObject({ kind: "unresolved" });
    expect(buy).not.toHaveBeenCalled();
    expect(await f.budget.reserve(f.worldId, { ...f.requests[0]!, requestKey: f.requests[0]!.requestKey.replace(/:1$/, ":2") })).toMatchObject({ acquired: true });
    expect(await localPatchBudgetReadyForPublication(f.budget, f.worldId, 12)).toBe(false);
    expect(await recoverLocalPatchImageInterruptions(c, "legacy-interruption")).toBe(0);
  });
  it("resumes after a crash between durable accounting and the variant transition", async () => {
    const f = await seed("interrupted-commit");
    await expect(recoverLocalPatchImageInterruptions(c, "interrupted-commit", async () => { throw Error("worker died"); })).rejects.toThrow("worker died");
    expect((await f.budget.audit(f.worldId)).reservedMicroUsd).toBe(120_000);
    expect(await recoverLocalPatchImageInterruptions(c, "interrupted-commit")).toBe(1);
    expect(await db.auditLog.count({ where: { entityId: "interrupted-commit" } })).toBe(1);
  });
  it("concurrent workers record one recovery and preserve the four-dollar ceiling", async () => {
    const f = await seed("concurrent-interruption");
    const results = await Promise.all([recoverLocalPatchImageInterruptions(c, "concurrent-interruption"), recoverLocalPatchImageInterruptions(c, "concurrent-interruption")]);
    expect(results.reduce((sum, count) => sum + count, 0)).toBe(1);
    expect(await db.auditLog.count({ where: { entityId: "concurrent-interruption" } })).toBe(1);
    await expect(f.budget.reserve(f.worldId, { ...f.requests[0]!, requestKey: "another-image", reserveMicroUsd: 3_880_001 })).rejects.toMatchObject({ code: "cap_exceeded" });
  });
  it("allows only two distinct first-image interruptions without increasing the cap", async () => {
    const f = await seed("bounded-interruptions", 3);
    expect(await recoverLocalPatchImageInterruptions(c, "bounded-interruptions")).toBe(2);
    expect(await f.budget.audit(f.worldId)).toMatchObject({ held: true, reservedMicroUsd: 360_000, capMicroUsd: 4_000_000 });
    expect(await localPatchBudgetReadyForPublication(f.budget, f.worldId, 12)).toBe(false);
    expect(await recoverLocalPatchImageInterruptions(c, "bounded-interruptions")).toBe(0);
  });
  it.each([401, 403, 400])("does not buy again for a nontransient HTTP %i", async diagnosticStatus => {
    const id = `http-${diagnosticStatus}`; await seed(id, 1, { diagnosticStatus });
    expect(await recoverLocalPatchImageInterruptions(c, id)).toBe(0);
  });
  it("retains a retryable provider failure and recovers without a human approval", async () => {
    const f = await seed("http-503", 1, { diagnosticStatus: 503 });
    expect(await recoverLocalPatchImageInterruptions(c, "http-503")).toBe(1);
    expect(await f.budget.readContinuationApproval(f.worldId, f.requests[0]!.requestKey)).toMatchObject({ version: "world-automatic-image-recovery/v1", policyId: "local-patch-image-interruption/v1" });
  });
  it("does not revive an unpaid or refunded game", async () => {
    await seed("unpaid-interruption", 1, { paid: false });
    expect(await recoverLocalPatchImageInterruptions(c, "unpaid-interruption")).toBe(0);
    await seed("refunded-interruption");
    await db.order.update({ where: { id: "ord-refunded-interruption" }, data: { paymentStatus: "REFUNDED", refundedAt: new Date() } });
    expect(await recoverLocalPatchImageInterruptions(c, "refunded-interruption")).toBe(0);
  });
});
