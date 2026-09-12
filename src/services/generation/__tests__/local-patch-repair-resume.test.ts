import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import type { Container } from "../../container";
import { sceneBySlug } from "../../scene-catalog.service";
import { WORLD_LOCAL_PATCH_HIDES } from "../../../domain/scene/local-patch-hides";
import { LOCAL_PATCH_SCENE_VERSION } from "../../../../content/scenes/local-patch-release";
import { LOCAL_PATCH_STYLE } from "../local-patch-world";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { LOCAL_PATCH_REPAIR_RESUME_ACTION, localPatchRepairResumeForm, resumeLocalPatchRepairs } from "../local-patch-repair-resume";
import { seedApprovedGame, bill } from "./local-patch-fixtures";

const config = vi.hoisted(() => ({ appEnv: "qa" }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: config.appEnv }), spendGuard: () => ({}), flag: () => false, adminEmails: () => [] }));
let scratch: string, db: PrismaClient, c: Container, sequence = 0;
beforeAll(async () => {
  scratch = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-repair-resume-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "isolated.sqlite").replace(/\\/g, "/")}` } } });
  await applyTestSchema(db);
  c = { db, storage: new DbStorage(db) } as unknown as Container;
});
beforeEach(() => {
  config.appEnv = "qa";
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("No network in repair-resume tests"); }));
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await db.$disconnect();
  const resolved = realpathSync(scratch);
  if (path.dirname(resolved) === realpathSync(tmpdir()) && path.basename(resolved).startsWith("findme-repair-resume-")) rmSync(resolved, { recursive: true, force: true });
});

async function fixture() {
  const seeded = await seedApprovedGame(c, db, { gameId: `repair-resume-${++sequence}`, styleVersion: LOCAL_PATCH_STYLE, status: "MANUAL_REVIEW", withJob: true,
    scenes: WORLD_LOCAL_PATCH_HIDES.map(board => ({ slug: board.board, version: LOCAL_PATCH_SCENE_VERSION })) });
  const { gameId, userId } = seeded;
  await db.game.update({ where: { id: gameId }, data: { paidAt: new Date(), lastError: "local-patch: 1 appearances require review; 0 boards unavailable" } });
  await db.order.create({ data: { id: `order-${gameId}`, gameId, userId, paymentStatus: "PAID", paidAt: new Date(), amountAgorot: 5900, packageTier: "ONE_WORLD", provider: "synthetic" } });
  const avatarId = `avatar-${gameId}`, storagePath = `game/${avatarId}.png`;
  await c.storage.put(storagePath, seeded.sheet, "image/png");
  await db.asset.create({ data: { id: avatarId, ownerId: userId, type: "AVATAR", visibility: "GAME", status: "READY", storagePath, mimeType: "image/png", bytes: seeded.sheet.length } });
  await db.childProfile.update({ where: { id: `chl-${gameId}` }, data: { avatarAssetId: avatarId } });
  await db.generationJob.update({ where: { id: `job_${gameId}` }, data: { status: "DONE", currentStep: null, attempts: 41, stepsJson: '{"identity":{"status":"done"}}', lastError: "one hide needs review" } });
  let failedId = "";
  for (const board of WORLD_LOCAL_PATCH_HIDES) for (const [index, hide] of board.hides.entries()) {
    const target = sceneBySlug(board.board, LOCAL_PATCH_SCENE_VERSION).targets.find(item => item.id === hide.targetId)!;
    const id = `target-${gameId}-${hide.id}`, failed = !failedId;
    await db.targetInstance.create({ data: { id, gameSceneId: `gsc-${gameId}-${board.board}`, targetId: hide.targetId, targetType: target.targetType,
      spriteKind: "image", slotAId: target.slots[0].id, slotBId: target.slots[1].id, status: failed ? "PENDING" : "GENERATED", costCents: failed ? 0 : 5 } });
    const rowId = `variant-${id}`;
    await db.targetVariantAsset.create({ data: { id: rowId, targetInstanceId: id, variant: "A", slotId: target.slots[0].id, provider: "local-patch",
      status: failed ? "FAILED" : "GENERATED", attempts: failed ? 2 : 1, costCents: failed ? 10 : 5, lastError: failed ? "synthetic style mismatch" : null,
      judgeJson: JSON.stringify({ verdict: { verdict: failed ? "fail" : "pass" }, index }), rejectedAssetIdsJson: failed ? '["retained-reject-1","retained-reject-2"]' : null } });
    if (failed) failedId = rowId;
  }
  const worldId = boardWizardWorldId(gameId), budget = boardWizardBudgetOf(c);
  for (const attempt of [1, 2]) {
    const requestKey = `synthetic-hide:standing:render:${attempt}`;
    await budget.reserve(worldId, { requestKey, scope: "image", operationFingerprint: "a".repeat(64), reserveMicroUsd: 100_000 });
    await budget.settle(worldId, requestKey, bill(`req-${gameId}-${attempt}`));
  }
  return { ...seeded, failedId, worldId, budget, input: { gameId, operatorId: "synthetic-operator", authorizationReason: "Parent explicitly authorized one repair after normal creation" } };
}
async function paidState(gameId: string) {
  return { variants: await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } }, orderBy: { id: "asc" } }),
    targets: await db.targetInstance.findMany({ where: { gameScene: { gameId } }, orderBy: { id: "asc" } }),
    ledger: await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: boardWizardWorldId(gameId) } }),
    assets: await db.asset.findMany({ where: { ownerId: `usr-${gameId}` }, orderBy: { id: "asc" } }) };
}

describe("explicit single-game QA repair resume", () => {
  it("qualifies the admin form using metadata only, and hides it once attempt three exists", async () => {
    const f = await fixture(), before = await paidState(f.gameId), get = vi.spyOn(c.storage, "get");
    try {
      expect(await localPatchRepairResumeForm(c, f.gameId)).toEqual({ failedHides: 1 });
      expect(get).not.toHaveBeenCalled(); expect(await paidState(f.gameId)).toEqual(before);
      await db.targetVariantAsset.update({ where: { id: f.failedId }, data: { attempts: 3 } });
      expect(await localPatchRepairResumeForm(c, f.gameId)).toBeNull();
    } finally { get.mockRestore(); }
  });
  it("queues only the named completed normal pass, audits valid transitions, and preserves every attempt and paid record", async () => {
    const f = await fixture(), other = await fixture(), before = await paidState(f.gameId);
    const oldJob = await db.generationJob.findUniqueOrThrow({ where: { id: `job_${f.gameId}` } });
    const result = await resumeLocalPatchRepairs(c, f.input);
    expect(result).toMatchObject({ gameId: f.gameId, status: "TARGETS_GENERATING", repairHideIds: [WORLD_LOCAL_PATCH_HIDES[0]!.hides[0]!.id] });
    expect(await paidState(f.gameId)).toEqual(before);
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: oldJob.id } })).toMatchObject({ status: "QUEUED", currentStep: "local-patch", attempts: oldJob.attempts, stepsJson: oldJob.stepsJson });
    expect(await db.game.findUniqueOrThrow({ where: { id: other.gameId } })).toMatchObject({ status: "MANUAL_REVIEW" });
    for (const action of ["status:MANUAL_REVIEW->NEEDS_REGENERATION", "status:NEEDS_REGENERATION->TARGETS_GENERATING", LOCAL_PATCH_REPAIR_RESUME_ACTION]) {
      expect(await db.auditLog.count({ where: { entityId: f.gameId, action } })).toBe(1);
    }
    const receipt = await db.auditLog.findUniqueOrThrow({ where: { id: result.auditId } });
    expect(JSON.parse(receipt.metaJson!)).toMatchObject({ operatorId: f.input.operatorId, maximumAttempt: 3, budgetChanged: false, previousJobAttempts: 41 });
    await expect(resumeLocalPatchRepairs(c, f.input)).rejects.toThrow("MANUAL_REVIEW");
    await db.game.update({ where: { id: f.gameId }, data: { status: "MANUAL_REVIEW" } });
    await expect(resumeLocalPatchRepairs(c, f.input)).rejects.toThrow("already authorized");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["production", "legacy-style", "refunded", "unpaid", "deleted", "ready", "active-job", "parked-job", "unfinished", "already-repaired", "no-failures", "changed-sheet", "missing-photo", "pending-charge", "unknown-charge"])("refuses %s without changing the game, job, audit or paid records", async kind => {
    const f = await fixture();
    if (kind === "production") config.appEnv = "production";
    if (kind === "legacy-style") await db.game.update({ where: { id: f.gameId }, data: { styleVersion: "legacy" } });
    if (kind === "refunded") await db.order.update({ where: { id: `order-${f.gameId}` }, data: { paymentStatus: "REFUNDED", refundedAt: new Date() } });
    if (kind === "unpaid") await db.order.update({ where: { id: `order-${f.gameId}` }, data: { paymentStatus: "PENDING", paidAt: null } });
    if (kind === "deleted") await db.game.update({ where: { id: f.gameId }, data: { deletedAt: new Date() } });
    if (kind === "ready") await db.game.update({ where: { id: f.gameId }, data: { status: "READY" } });
    if (kind === "active-job") await db.generationJob.update({ where: { id: `job_${f.gameId}` }, data: { status: "RUNNING" } });
    if (kind === "parked-job") await db.generationJob.update({ where: { id: `job_${f.gameId}` }, data: { currentStep: "local-patch:needs-release" } });
    if (kind === "unfinished") await db.targetVariantAsset.update({ where: { id: f.failedId }, data: { status: "PENDING", attempts: 2 } });
    if (kind === "already-repaired") await db.targetVariantAsset.update({ where: { id: f.failedId }, data: { attempts: 3 } });
    if (kind === "no-failures") await db.targetVariantAsset.update({ where: { id: f.failedId }, data: { status: "GENERATED" } });
    if (kind === "changed-sheet") await c.storage.put(`private/sheet-${f.gameId}.png`, Buffer.from("changed identity"), "image/png");
    if (kind === "missing-photo") await c.storage.delete(`private/photo-${f.gameId}.jpg`);
    if (kind === "pending-charge" || kind === "unknown-charge") {
      await f.budget.reserve(f.worldId, { requestKey: "unfinished-charge", scope: "image", operationFingerprint: "b".repeat(64), reserveMicroUsd: 100_000 });
      if (kind === "unknown-charge") await f.budget.markUnknown(f.worldId, "unfinished-charge", "synthetic unknown");
    }
    const before = await paidState(f.gameId), game = await db.game.findUniqueOrThrow({ where: { id: f.gameId } }), job = await db.generationJob.findUniqueOrThrow({ where: { id: `job_${f.gameId}` } });
    await expect(resumeLocalPatchRepairs(c, f.input)).rejects.toThrow();
    expect(await paidState(f.gameId)).toEqual(before);
    expect(await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).toEqual(game);
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: job.id } })).toEqual(job);
    expect(await db.auditLog.count({ where: { entityId: f.gameId, action: { startsWith: "status:" } } })).toBe(0);
    expect(await db.auditLog.count({ where: { entityId: f.gameId, action: LOCAL_PATCH_REPAIR_RESUME_ACTION } })).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rolls back both transitions and the queue if audit persistence fails", async () => {
    const f = await fixture(), before = await paidState(f.gameId);
    await db.$executeRawUnsafe(`CREATE TRIGGER fail_repair_resume BEFORE INSERT ON AuditLog WHEN NEW.action='${LOCAL_PATCH_REPAIR_RESUME_ACTION}' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END`);
    try { await expect(resumeLocalPatchRepairs(c, f.input)).rejects.toThrow(); }
    finally { await db.$executeRawUnsafe("DROP TRIGGER fail_repair_resume"); }
    expect(await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).toMatchObject({ status: "MANUAL_REVIEW" });
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${f.gameId}` } })).toMatchObject({ status: "DONE", currentStep: null, attempts: 41 });
    expect(await paidState(f.gameId)).toEqual(before);
    expect(await db.auditLog.count({ where: { entityId: f.gameId, action: { startsWith: "status:" } } })).toBe(0);
  });
});
