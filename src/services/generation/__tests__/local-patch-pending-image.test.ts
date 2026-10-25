import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { PENDING_IMAGE_LEASE_MS } from "../../../domain/generation/pending-image-lease";
import type { Container } from "../../container";
import { boardsOfWorlds } from "../../world-catalog.service";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { reconcilePendingLocalPatchImages } from "../local-patch-pending-image";
import { recoverLocalPatchImageInterruptions, localPatchBudgetReadyForPublication } from "../local-patch-interruption-recovery";
import { LocalPatchRetainedPurchaseStore, LocalPatchDeleted } from "../local-patch-lifecycle";
import { purchaseOnce, RETAINED_PURCHASE_VERSION, retainedPayloadDigest } from "../paid-operation";

const policy = vi.hoisted(() => ({ kind: "from-birth" as string, version: 12 }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", STORAGE_PROVIDER: "db" }) }));
// Authority/source hash verification has whole-world regressions of its own.
// These tests keep a qualified authority while exercising real DB/CAS/receipts.
vi.mock("../single-low-policy", () => ({ singleLowReviewAuthorization: async () => policy.kind === "none" ? null : ({
  kind: policy.kind, sceneVersion: policy.version, authorizationSha256: "b".repeat(64), identitySha256: "c".repeat(64),
}) }));
vi.mock("../detective-automatic-recovery", () => ({ detectiveAutomaticRecoveryQualified: async () => true }));
let db: PrismaClient, c: Container, directory: string;
const journey = new Set(boardsOfWorlds(["journey"]));
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-pending-image-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(directory, "test.db").replaceAll("\\", "/")}` } } });
  await applyTestSchema(db); c = { db, storage: new DbStorage(db) } as unknown as Container;
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("No live provider in lease regressions"); }));
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); policy.kind = "from-birth"; policy.version = 12; });
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(directory) === realpathSync(tmpdir()) && path.basename(directory).startsWith("findme-pending-image-")) rmSync(directory, { recursive: true });
});
async function seed(id: string, count = 1, version = 12) {
  policy.version = version;
  const boards = localPatchBoardsForVersion(version).filter(b => journey.has(b.board));
  await db.user.create({ data: { id: "usr-" + id, email: id + "@example.invalid" } });
  await db.game.create({ data: { id, ownerId: "usr-" + id, packageTier: "ONE_WORLD", status: "TARGETS_GENERATING", styleVersion: "local-patch-world-v1", sceneCount: 9 } });
  await db.order.create({ data: { id: "ord-" + id, gameId: id, userId: "usr-" + id, provider: "mock", packageTier: "ONE_WORLD", amountAgorot: 3900, paymentStatus: "PAID", paidAt: new Date() } });
  await db.generationJob.create({ data: { id: "job_" + id, gameId: id, status: "RUNNING", currentStep: "local-patch", attempts: 2 } });
  for (const [i, b] of boards.entries()) await db.gameScene.create({ data: { id: `sc-${id}-${b.board}`, gameId: id, sceneSlug: b.board, sceneVersion: version, orderIndex: i } });
  const budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(id);
  const requests = boards.slice(0, count).map(b => ({ requestKey: `${b.hides[0]!.id}:${b.hides[0]!.pose}:render:1`, scope: "image" as const, operationFingerprint: "a".repeat(64), reserveMicroUsd: 120000 }));
  for (const [i, request] of requests.entries()) {
    const b = boards[i]!, h = b.hides[0]!;
    await db.targetInstance.create({ data: { id: `tgt-${id}-${i}`, gameSceneId: `sc-${id}-${b.board}`, targetId: h.targetId, targetType: "child", slotAId: "hide-1-A", slotBId: "hide-1-B", status: "PENDING" } });
    await db.targetVariantAsset.create({ data: { id: `row-${id}-${i}`, targetInstanceId: `tgt-${id}-${i}`, variant: "A", slotId: "hide-1-A", status: "PENDING", attempts: 1, provider: "local-patch" } });
    await budget.reserve(worldId, request);
  }
  const claim = async (n: number) => {
    await db.generationJob.update({ where: { id: "job_" + id }, data: { status: "RUNNING", currentStep: "local-patch", attempts: n } });
    return async (tx: Prisma.TransactionClient) => {
      const result = await tx.generationJob.updateMany({ where: { id: "job_" + id, attempts: n, status: "RUNNING", currentStep: "local-patch" }, data: { currentStep: "local-patch" } });
      if (result.count !== 1) throw Error("claim lost");
    };
  };
  return { id, budget, worldId, requests, claim, store: new LocalPatchRetainedPurchaseStore(c, id, budget) };
}
const knownBill = (id: string) => ({ providerNamespace: "synthetic", providerRequestId: "req-" + id, usageId: "usage-" + id,
  rawUsage: { image_tokens: 1 }, model: "gpt-image-2", amountMicroUsd: 1000, costBasis: "conservative-upper-estimate" as const });
const dbError = (code = "P2028") => new Prisma.PrismaClientKnownRequestError("Synthetic transaction admission failure", { code, clientVersion: "test" });

describe("pending image ownership and conservative automatic continuation", () => {
  it.each([12,13])("recovers an unanswered first image in version %i only after a later full lease; keeps its bill and key closed", async version => {
    const f = await seed("missing-image-" + version, 1, version);
    vi.useFakeTimers({ toFake: ["Date"] }); const start = Date.now();
    expect(await reconcilePendingLocalPatchImages(c, f.id, 2, await f.claim(2))).toBe(0);
    vi.setSystemTime(start + PENDING_IMAGE_LEASE_MS + 1);
    expect(await reconcilePendingLocalPatchImages(c, f.id, 2, await f.claim(2))).toBe(0);
    expect(await reconcilePendingLocalPatchImages(c, f.id, 3, await f.claim(3))).toBe(1);
    expect(await recoverLocalPatchImageInterruptions(c, f.id)).toBe(1);
    expect(await f.budget.audit(f.worldId)).toMatchObject({ reservedMicroUsd: 120000, settledMicroUsd: 0, capMicroUsd: 4000000, held: false });
    expect(await f.budget.readRequest(f.worldId, f.requests[0]!.requestKey)).toMatchObject({ state: "unknown", reserveMicroUsd: 120000 });
    const buy = vi.fn();
    expect(await purchaseOnce({ ledger: f.budget, store: f.store }, { worldId: f.worldId, ...f.requests[0]!, buy })).toMatchObject({ kind: "unresolved" });
    expect(buy).not.toHaveBeenCalled();
    expect(await localPatchBudgetReadyForPublication(f.budget, f.worldId, version, { reviewRecoveryV3: true })).toBe(true);
    await expect(f.budget.reserve(f.worldId, { ...f.requests[0]!, requestKey: "too-much", reserveMicroUsd: 3880001 })).rejects.toMatchObject({ code: "cap_exceeded" });
    expect(await f.budget.reserve(f.worldId, { ...f.requests[0]!, requestKey: f.requests[0]!.requestKey.replace(/:1$/, ":2") })).toMatchObject({ acquired: true });
    expect(await reconcilePendingLocalPatchImages(c, f.id, 4, await f.claim(4))).toBe(0);
  });
  it("does not infer abandonment from a rapid new claim or refreshed variant timestamps", async () => {
    const f = await seed("fresh-pending");
    expect(await reconcilePendingLocalPatchImages(c, f.id, 2, await f.claim(2))).toBe(0);
    for (const n of [3,4,5]) {
      await db.targetVariantAsset.update({ where: { id: "row-" + f.id + "-0" }, data: { lastError: null } });
      expect(await reconcilePendingLocalPatchImages(c, f.id, n, await f.claim(n))).toBe(0);
    }
    expect((await f.budget.readRequest(f.worldId, f.requests[0]!.requestKey))?.state).toBe("pending");
    expect(await db.auditLog.count({ where: { entityId: f.id } })).toBe(1);
  });
  it("replays a late retained paid answer instead of authorizing a replacement", async () => {
    const f = await seed("late-kept");
    vi.useFakeTimers({ toFake: ["Date"] }); const start = Date.now();
    await reconcilePendingLocalPatchImages(c, f.id, 2, await f.claim(2));
    const bytes = Buffer.from("synthetic-paid-answer");
    await f.store.put(f.worldId, f.requests[0]!.requestKey, { version: RETAINED_PURCHASE_VERSION, worldId: f.worldId,
      ...f.requests[0]!, bytes, payloadSha256: retainedPayloadDigest(bytes), evidence: knownBill(f.id), unknownReason: null });
    vi.setSystemTime(start + PENDING_IMAGE_LEASE_MS + 1);
    expect(await reconcilePendingLocalPatchImages(c, f.id, 3, await f.claim(3))).toBe(0);
    const buy = vi.fn();
    expect(await purchaseOnce({ ledger: f.budget, store: f.store }, { worldId: f.worldId, ...f.requests[0]!, buy })).toMatchObject({ kind: "bought", replayed: true });
    expect(buy).not.toHaveBeenCalled();
    expect(await f.budget.audit(f.worldId)).toMatchObject({ settledMicroUsd: 1000, reservedMicroUsd: 0 });
  });
  it("settles an authentic answer retained after closure and resumes only its exact accounting hold", async () => {
    const f = await seed("late-after-closure");
    vi.useFakeTimers({ toFake: ["Date"] }); const start = Date.now();
    await reconcilePendingLocalPatchImages(c, f.id, 2, await f.claim(2));
    vi.setSystemTime(start + PENDING_IMAGE_LEASE_MS + 1);
    await reconcilePendingLocalPatchImages(c, f.id, 3, await f.claim(3));
    const bytes = Buffer.from("real-retained-answer");
    await f.store.put(f.worldId, f.requests[0]!.requestKey, { version: RETAINED_PURCHASE_VERSION, worldId: f.worldId,
      ...f.requests[0]!, bytes, payloadSha256: retainedPayloadDigest(bytes), evidence: knownBill(f.id), unknownReason: null });
    await db.generationJob.update({ where: { id: "job_" + f.id }, data: { status: "FAILED", currentStep: "local-patch:needs-release",
      lastError: "local-patch: the world ledger is held; reconcile its unresolved charge before continuing" } });
    expect(await recoverLocalPatchImageInterruptions(c, f.id)).toBe(0);
    expect(await f.budget.audit(f.worldId)).toMatchObject({ settledMicroUsd: 1000, reservedMicroUsd: 0, held: false });
    expect(await db.generationJob.findUnique({ where: { id: "job_" + f.id } })).toMatchObject({ status: "QUEUED", currentStep: "local-patch" });
    expect(await db.targetVariantAsset.findUnique({ where: { id: "row-" + f.id + "-0" } })).toMatchObject({ attempts: 1, status: "PENDING" });
  });
  it("does not trust an operator-edited observation", async () => {
    const f = await seed("edited-observation");
    await reconcilePendingLocalPatchImages(c, f.id, 2, await f.claim(2));
    await db.auditLog.updateMany({ where: { entityId: f.id }, data: { actorType: "ADMIN" } });
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(Date.now() + PENDING_IMAGE_LEASE_MS + 1);
    expect(await reconcilePendingLocalPatchImages(c, f.id, 3, await f.claim(3))).toBe(0);
    expect((await f.budget.readRequest(f.worldId, f.requests[0]!.requestKey))?.state).toBe("pending");
  });
  it("keeps the existing bound of two replacements and all three unknown holds", async () => {
    const f = await seed("bounded-pending", 3);
    vi.useFakeTimers({ toFake: ["Date"] }); const start = Date.now();
    await reconcilePendingLocalPatchImages(c, f.id, 2, await f.claim(2));
    vi.setSystemTime(start + PENDING_IMAGE_LEASE_MS + 1);
    expect(await reconcilePendingLocalPatchImages(c, f.id, 3, await f.claim(3))).toBe(3);
    expect(await recoverLocalPatchImageInterruptions(c, f.id)).toBe(2);
    expect(await f.budget.audit(f.worldId)).toMatchObject({ reservedMicroUsd: 360000, capMicroUsd: 4000000, held: true });
  });
  it.each(["historical", "none"])("leaves %s authority unchanged", async kind => {
    const f = await seed("policy-" + kind); policy.kind = kind;
    expect(await reconcilePendingLocalPatchImages(c, f.id, 2, await f.claim(2))).toBe(0);
    expect(await db.auditLog.count({ where: { entityId: f.id } })).toBe(0);
  });
  it("cannot create an observation after losing the claim", async () => {
    const f = await seed("lost-claim"), oldFence = await f.claim(2); await f.claim(3);
    await expect(reconcilePendingLocalPatchImages(c, f.id, 2, oldFence)).rejects.toThrow("claim lost");
    expect(await db.auditLog.count({ where: { entityId: f.id } })).toBe(0);
  });
  it("cannot continue a refunded order", async () => {
    const f = await seed("refunded-pending");
    await reconcilePendingLocalPatchImages(c, f.id, 2, await f.claim(2));
    await db.order.update({ where: { id: "ord-" + f.id }, data: { paymentStatus: "REFUNDED", refundedAt: new Date() } });
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(Date.now() + PENDING_IMAGE_LEASE_MS + 1);
    expect(await reconcilePendingLocalPatchImages(c, f.id, 3, await f.claim(3))).toBe(0);
    expect((await f.budget.readRequest(f.worldId, f.requests[0]!.requestKey))?.state).toBe("pending");
  });
});

describe("parallel database admission keeps the paid answer in memory until retained", () => {
  it.each(["P2028", "P2024", "P2034"])("retries only the same immutable put after %s, with one provider purchase", async code => {
    const f = await seed("retention-" + code), original = db.$transaction.bind(db);
    const tx = vi.spyOn(db, "$transaction"); tx.mockRejectedValueOnce(dbError(code));
    tx.mockImplementation(original as typeof db.$transaction);
    const buy = vi.fn(async () => ({ bytes: Buffer.from("paid-once"), evidence: knownBill(f.id) }));
    const key = { ...f.requests[0]!, requestKey: "fresh-paid-answer" };
    expect(await purchaseOnce({ ledger: f.budget, store: f.store }, { worldId: f.worldId, ...key, buy })).toMatchObject({ kind: "bought" });
    expect(buy).toHaveBeenCalledTimes(1); expect(tx).toHaveBeenCalledTimes(2);
    expect((await f.store.get(f.worldId, key.requestKey))?.bytes.toString()).toBe("paid-once");
  });
  it("a lost commit acknowledgement replays the identical retained bytes", async () => {
    const f = await seed("retention-ack"), original = db.$transaction.bind(db);
    const tx = vi.spyOn(db, "$transaction");
    tx.mockImplementationOnce((async (...args: Parameters<typeof db.$transaction>) => { await original(...args); throw dbError(); }) as unknown as typeof db.$transaction);
    tx.mockImplementation(original as typeof db.$transaction);
    const buy = vi.fn(async () => ({ bytes: Buffer.from("kept-before-ack"), evidence: knownBill(f.id) }));
    expect(await purchaseOnce({ ledger: f.budget, store: f.store }, { worldId: f.worldId, ...f.requests[0]!, requestKey: "ack-image", buy })).toMatchObject({ kind: "bought" });
    expect(buy).toHaveBeenCalledTimes(1); expect(tx).toHaveBeenCalledTimes(2);
  });
  it("is bounded after three storage failures and never rebuys the reserved key", async () => {
    const f = await seed("retention-limit"), tx = vi.spyOn(db, "$transaction").mockRejectedValue(dbError());
    const buy = vi.fn(async () => ({ bytes: Buffer.from("paid-but-not-kept"), evidence: knownBill(f.id) }));
    const key = { ...f.requests[0]!, requestKey: "limited-image" };
    await expect(purchaseOnce({ ledger: f.budget, store: f.store }, { worldId: f.worldId, ...key, buy })).rejects.toMatchObject({ code: "P2028" });
    expect(tx).toHaveBeenCalledTimes(3); tx.mockRestore();
    expect(await purchaseOnce({ ledger: f.budget, store: f.store }, { worldId: f.worldId, ...key, buy })).toMatchObject({ kind: "in-progress" });
    expect(buy).toHaveBeenCalledTimes(1);
  });
  it("does not retry past the request's retention deadline", async () => {
    const f = await seed("retention-deadline"), original = db.$transaction.bind(db);
    vi.useFakeTimers({ toFake: ["Date"] }); const start = Date.now();
    const tx = vi.spyOn(db, "$transaction");
    tx.mockImplementationOnce((async () => { vi.setSystemTime(start + 10001); throw dbError(); }) as unknown as typeof db.$transaction);
    tx.mockImplementation(original as typeof db.$transaction);
    const store = new LocalPatchRetainedPurchaseStore(c, f.id, f.budget, start + 10000);
    const buy = vi.fn(async () => ({ bytes: Buffer.from("paid-once-before-deadline"), evidence: knownBill(f.id) }));
    await expect(purchaseOnce({ ledger: f.budget, store }, { worldId: f.worldId, ...f.requests[0]!, requestKey: "deadline-image", buy })).rejects.toMatchObject({ code: "P2028" });
    expect(tx).toHaveBeenCalledTimes(1); expect(buy).toHaveBeenCalledTimes(1);
  });
  it("rechecks deletion on the retry and records the bill without retaining child bytes", async () => {
    const f = await seed("retention-delete"), original = db.$transaction.bind(db);
    const tx = vi.spyOn(db, "$transaction");
    tx.mockImplementationOnce((async () => { await db.game.update({ where: { id: f.id }, data: { status: "DELETED", deletedAt: new Date() } }); throw dbError(); }) as unknown as typeof db.$transaction);
    tx.mockImplementation(original as typeof db.$transaction);
    const buy = vi.fn(async () => ({ bytes: Buffer.from("must-not-be-kept"), evidence: knownBill(f.id) }));
    const key = { ...f.requests[0]!, requestKey: "deleted-image" };
    await expect(purchaseOnce({ ledger: f.budget, store: f.store }, { worldId: f.worldId, ...key, buy })).rejects.toBeInstanceOf(LocalPatchDeleted);
    expect(buy).toHaveBeenCalledTimes(1); expect(await f.store.get(f.worldId, key.requestKey)).toBeNull();
    expect((await f.budget.readRequest(f.worldId, key.requestKey))?.state).toBe("settled");
  });
});
