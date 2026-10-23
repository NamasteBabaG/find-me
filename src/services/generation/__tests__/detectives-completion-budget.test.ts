import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { afterAll, beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { DETECTIVE_PATCH_BOARDS } from "../../../../content/detectives/runtime-release";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import type { Container } from "../../container";
import { boardWizardBudgetOf, boardWizardWorldId, readBoardWizardBudgetAuthority } from "../board-conditioned-wizard";
import { pinVisualReviewRelease, DUAL_VISUAL_REVIEW_V3 } from "../visual-review-release";
import { pinLeanRelease, leanReleaseAuditId, LOCAL_PATCH_LEAN_RELEASE } from "../lean-release";
import { pinIdentitySourceRelease } from "../identity-source-release";
import { pinLocalPatchSourceFamily, sourceFamilyAuditId } from "../source-placement-release";
import { enrollLeanWorld } from "../lean-enrollment";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { buildBoardWizardIdentityStyle } from "../board-wizard-identity-style";
import { sha256Bytes } from "../fixed-sprite";
import { seedApprovedGame, bill } from "./local-patch-fixtures";
import { planDetectivesCompletionBudget, authorizeDetectivesCompletionBudget, readDetectivesCompletionBudget,
  resumeDetectivesCompletionBudget, nextDetectivesCompletionWake } from "../detectives-completion-budget";
import { detectivesCompletionId, detectivesCompletionResumeId } from "../../../domain/generation/detectives-completion-budget";

const settings = vi.hoisted(() => ({ APP_ENV: "qa", LOCAL_PATCH_PROMPT_RELEASE: "v19", LOCAL_PATCH_IDENTITY_SOURCE: "full-source-v1" }));
vi.mock("../../../lib/env", () => ({ env: () => settings, flag: () => false }));
let db: PrismaClient, c: Container, directory: string, serial = 0;
const authorization = "e".repeat(64), fingerprint = (n: number) => n.toString(16).padStart(64, "0");
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-detective-budget-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(directory, "test.db").replaceAll("\\", "/")}?connection_limit=1` } } });
  await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), adminEmails: [], backgroundReview: {} } as unknown as Container;
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("Real provider requests forbidden"); }));
}, 60_000);
afterEach(() => { settings.APP_ENV = "qa"; vi.restoreAllMocks(); });
afterAll(async () => {
  expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db.$disconnect();
  const absolute = path.resolve(directory);
  if (path.dirname(absolute) === realpathSync(tmpdir()) && path.basename(absolute).startsWith("findme-detective-budget-")) rmSync(absolute, { recursive: true });
});
async function fixture() {
  const gameId = `detective-budget-synthetic-${++serial}`;
  const seeded = await seedApprovedGame(c, db, { gameId, approved: false, status: "DRAFT", styleVersion: "local-patch-world-v1",
    scenes: DETECTIVE_PATCH_BOARDS.map(b => ({ slug: b.board, version: 13 })) });
  await db.game.update({ where: { id: gameId }, data: { searchLevel: "detectives" } });
  await db.$transaction(async tx => { await pinVisualReviewRelease(tx, gameId, DUAL_VISUAL_REVIEW_V3);
    await pinLeanRelease(tx, gameId, LOCAL_PATCH_LEAN_RELEASE); await pinIdentitySourceRelease(tx, gameId);
    await pinLocalPatchSourceFamily(tx, gameId, { sceneVersion: 13, searchLevel: "detectives" }); });
  await db.game.update({ where: { id: gameId }, data: { status: "TARGETS_GENERATING" } });
  await db.order.create({ data: { id: `order-${gameId}`, userId: seeded.userId, gameId, provider: "mock", packageTier: "ONE_WORLD", amountAgorot: 3900, paymentStatus: "PAID", paidAt: new Date() } });
  await db.generationJob.create({ data: { id: `job_${gameId}`, gameId, status: "QUEUED", attempts: 20 } });
  await c.storage.put(`private/photo-${gameId}.jpg`, seeded.sheet, "image/png");
  const avatarId = `avatar-${gameId}`;
  await c.storage.put(`game/${avatarId}`, seeded.sheet, "image/png");
  await db.asset.create({ data: { id: avatarId, ownerId: seeded.userId, type: "AVATAR", visibility: "GAME", status: "READY", storagePath: `game/${avatarId}`, mimeType: "image/png", bytes: seeded.sheet.length } });
  await db.childProfile.update({ where: { id: `chl-${gameId}` }, data: { avatarAssetId: avatarId } });
  c.adminEmails!.push(seeded.email);
  const atlas = await buildBoardWizardIdentityStyle(undefined, "board-matched-identity/v6", "journey", undefined, { sceneVersion: 13 });
  const checks = Object.fromEntries(["identity", "age", "paintedStyle", "sheetLayout", "sourceFaceVisible", "facialVolume", "viewConsistency"].map(k => [k, "pass"]));
  await reviewBoardWizardIdentity({ db, apiKey: "synthetic-never-live", budget: boardWizardBudgetOf(c), beforeDispatch: async () => {}, write: work => db.$transaction(work),
    reviewer: { review: async () => ({ httpOk: true, requestId: `req-identity-${gameId}`, body: { model: "gpt-6.1-sol", usage: { prompt_tokens: 1500, completion_tokens: 150 },
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ checks, reason: "Synthetic budget boundary fixture" }) } }] } }) } },
  { gameId, identityAssetId: `ast-sheet-${gameId}`, sheet: seeded.sheet, photo: seeded.sheet, atlas: atlas.png, contentVersion: 13,
    provenance: { promptVersion: "character-v8-full-source-volume-identity", quality: "medium", photoAssetId: `ast-photo-${gameId}`, photoSha256: sha256Bytes(seeded.sheet), ageYears: 8, crop: null,
      style: { version: "board-matched-identity/v6", catalogSha256: atlas.catalogSha256, atlasSha256: atlas.atlasSha256 } } });
  expect(await enrollLeanWorld(c, gameId, async () => {})).toMatchObject({ state: "enrolled" });
  const worldId = boardWizardWorldId(gameId), budget = boardWizardBudgetOf(c, 1, { authorizeAutomaticReviewRecoveryV2: async () => true });
    const initial = await budget.audit(worldId), fill = 3_380_000 - initial.settledMicroUsd;
  await budget.reserve(worldId, { requestKey: "synthetic-historical-paints", scope: "image", operationFingerprint: fingerprint(9), reserveMicroUsd: fill });
  await budget.settle(worldId, "synthetic-historical-paints", bill(`req-fill-${gameId}`, fill));
  for (const [i, reserve] of [200_000, 120_000, 200_000].entries()) {
    const request = { requestKey: `self-repair:board:sydney:${fingerprint(i + 1)}`, scope: "judge" as const, operationFingerprint: fingerprint(i + 1), reserveMicroUsd: reserve };
    await budget.reserve(worldId, request); await budget.markUnknown(worldId, request.requestKey, "Synthetic retained unpriced failure");
    await budget.authorizeAutomaticReviewRecoveryV2(worldId, { ...request, approvalId: `synthetic-${i}`, unknownReasons: ["Synthetic retained unpriced failure"],
      policyId: "local-patch-review-interruption/v2", authorizationSha256: fingerprint(5), authorizedAt: "2026-10-23T00:00:00.000Z" });
  }
  await db.generationJob.update({ where: { id: `job_${gameId}` }, data: { status: "FAILED", currentStep: "local-patch:recovery-exhausted",
    lastError: "local-patch: no automatic action remains within the authorized world budget; synthetic inclusive capacity stop" } });
  const input = () => planDetectivesCompletionBudget(c, gameId);
  return { gameId, worldId, ownerId: seeded.userId, childId: `chl-${gameId}`, input,
    authorize: async (container = c, plan?: Awaited<ReturnType<typeof input>>) => {
      const observed = plan ?? await input();
      return authorizeDetectivesCompletionBudget(container, { gameId, operatorId: seeded.userId,
        expectedPlanSha256: observed.planSha256, ownerAuthorizationSha256: authorization }); } };
}
async function immutable(f: Awaited<ReturnType<typeof fixture>>) {
  return { ledger: (await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } })).snapshotJson,
    pin: await db.auditLog.findUniqueOrThrow({ where: { id: leanReleaseAuditId(f.gameId) } }),
    child: await db.childProfile.findUniqueOrThrow({ where: { id: f.childId } }),
    bills: await db.auditLog.findMany({ where: { entityType: "Asset", entityId: `ast-sheet-${f.gameId}` } }) };
}

describe("explicit Detective cumulative six-dollar authorization", () => {
  it("plans without writes, grants once on a single connection, preserves all history, then resumes only through a normal fenced wake", async () => {
    const f = await fixture(), before = await immutable(f), job = await db.generationJob.findUniqueOrThrow({ where: { id: `job_${f.gameId}` } });
    const plan = await f.input();
    expect(plan.binding).toMatchObject({ capMicroUsd: 6_000_000, committedMicroUsd: 3_900_000, reservedMicroUsd: 520_000 });
    expect(plan.binding.retainedUnknowns).toHaveLength(3);
    expect(await immutable(f)).toEqual(before);
    expect(await readBoardWizardBudgetAuthority(c, f.worldId)).toMatchObject({ capMicroUsd: 4_000_000 });
    const grant = await f.authorize(c, plan);
    expect(await f.authorize(c, plan)).toEqual(grant);
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: job.id } })).toEqual(job);
    expect(await immutable(f)).toEqual(before);
    expect(await readBoardWizardBudgetAuthority(c, f.worldId)).toMatchObject({ capMicroUsd: 6_000_000 });
    expect(await nextDetectivesCompletionWake(c, f.gameId)).toBe(f.gameId);
    expect(await resumeDetectivesCompletionBudget(c, f.gameId)).toBe(false);
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "QUEUED", currentStep: "local-patch", attempts: 20 });
    expect(await immutable(f)).toEqual(before);
    expect(await db.auditLog.count({ where: { id: detectivesCompletionResumeId(f.gameId) } })).toBe(1);
    const budget = boardWizardBudgetOf(c);
    await budget.reserve(f.worldId, { requestKey: "synthetic-next-paint", scope: "image", operationFingerprint: fingerprint(10), reserveMicroUsd: 200_000 });
    expect(await budget.audit(f.worldId)).toMatchObject({ capMicroUsd: 6_000_000, committedMicroUsd: 4_100_000 });
    await expect(budget.reserve(f.worldId, { requestKey: "synthetic-over-six", scope: "image", operationFingerprint: fingerprint(11), reserveMicroUsd: 2_000_000 })).rejects.toMatchObject({ code: "cap_exceeded" });
    expect(JSON.parse((await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } })).snapshotJson).requests.slice(0, -1)).toEqual(JSON.parse(before.ledger).requests);
    expect(await readDetectivesCompletionBudget(c, f.gameId)).toBeNull();
  }, 60_000);
  it.each(["age", "crop", "source", "identity", "avatar", "owner", "refund", "deleted", "board", "family", "unpaid", "pending", "hold", "revision", "evidence"])("refuses stale %s before adding authority", async fault => {
    const f = await fixture(), plan = await f.input();
    if (fault === "age") await db.childProfile.update({ where: { id: f.childId }, data: { ageYears: 9 } });
    if (fault === "crop") await db.childProfile.update({ where: { id: f.childId }, data: { photoCropJson: JSON.stringify({ x: 0, y: 0, w: 0.5, h: 0.5 }) } });
    if (["source", "identity", "avatar"].includes(fault)) await c.storage.put(fault === "source" ? `private/photo-${f.gameId}.jpg` : fault === "identity" ? `private/sheet-${f.gameId}.png` : `game/avatar-${f.gameId}`, Buffer.from("changed synthetic pixels"), "image/png");
    if (fault === "owner") await db.game.update({ where: { id: f.gameId }, data: { ownerId: null } });
    if (fault === "refund" || fault === "unpaid") await db.order.update({ where: { id: `order-${f.gameId}` }, data: { paymentStatus: fault === "refund" ? "REFUNDED" : "PENDING" } });
    if (fault === "deleted") await db.game.update({ where: { id: f.gameId }, data: { deletedAt: new Date() } });
    if (fault === "board") await db.gameScene.update({ where: { id: `gsc-${f.gameId}-newyork` }, data: { sceneVersion: 12 } });
    if (fault === "family") await db.auditLog.delete({ where: { id: sourceFamilyAuditId(f.gameId) } });
    if (fault === "hold") await db.generationJob.update({ where: { id: `job_${f.gameId}` }, data: { lastError: "Concurrent different hold" } });
    if (fault === "revision") await db.worldBudgetLedger.update({ where: { worldId: f.worldId }, data: { revision: { increment: 1 } } });
    if (fault === "pending") await boardWizardBudgetOf(c).reserve(f.worldId, { requestKey: "synthetic-late-pending", scope: "judge", operationFingerprint: fingerprint(20), reserveMicroUsd: 1 });
    const operation = fault === "evidence" ? authorizeDetectivesCompletionBudget(c, { gameId: f.gameId, operatorId: f.ownerId, expectedPlanSha256: plan.planSha256, ownerAuthorizationSha256: "not-a-digest" }) : f.authorize(c, plan);
    await expect(operation).rejects.toThrow();
    expect(await db.auditLog.findUnique({ where: { id: detectivesCompletionId(f.gameId) } })).toBeNull();
  }, 60_000);
  it("refuses a nonadministrator, another administrator, production and a foreign plan without changing the stopped job", async () => {
    const f = await fixture(), plan = await f.input(), other = await fixture();
    await expect(f.authorize({ ...c, adminEmails: [] }, plan)).rejects.toThrow("administrator");
    await expect(authorizeDetectivesCompletionBudget(c, { gameId: f.gameId, operatorId: other.ownerId, expectedPlanSha256: plan.planSha256, ownerAuthorizationSha256: authorization })).rejects.toThrow("Owner administrator");
    await expect(f.authorize(c, await other.input())).rejects.toThrow("plan changed");
    settings.APP_ENV = "production"; await expect(f.authorize(c, plan)).rejects.toThrow("QA");
    expect(await db.auditLog.findUnique({ where: { id: detectivesCompletionId(f.gameId) } })).toBeNull();
  }, 60_000);
  it("the scheduler ignores ungranted/stale work, does not reset attempts, and cannot revive a second stop after six dollars", async () => {
    const ungranted = await fixture(); expect(await resumeDetectivesCompletionBudget(c, ungranted.gameId)).toBe(false);
    const f = await fixture(), plan = await f.input(); await f.authorize(c, plan);
    expect(await nextDetectivesCompletionWake(c, null)).toBe(f.gameId);
    await db.generationJob.update({ where: { id: `job_${f.gameId}` }, data: { status: "FAILED", currentStep: "local-patch:recovery-exhausted", attempts: 21, lastError: "six dollars exhausted" } });
    expect(await nextDetectivesCompletionWake(c, f.gameId)).toBeNull();
    expect(await f.authorize(c, plan)).toMatchObject({ capMicroUsd: 6_000_000 });
    expect(await db.auditLog.count({ where: { id: detectivesCompletionResumeId(f.gameId) } })).toBe(1);
  }, 60_000);
  it("rechecks the exact ledger inside the transaction, so a race never creates a grant", async () => {
    const f = await fixture(), plan = await f.input();
    const raced = { ...c, db: new Proxy(db, { get(target, key) {
      if (key !== "$transaction") return Reflect.get(target, key);
      return async (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) => {
        await db.worldBudgetLedger.update({ where: { worldId: f.worldId }, data: { revision: { increment: 1 } } });
        return db.$transaction(work, options);
      };
    } }) } as Container;
    await expect(f.authorize(raced, plan)).rejects.toThrow("changed");
    expect(await db.auditLog.findUnique({ where: { id: detectivesCompletionId(f.gameId) } })).toBeNull();
  }, 60_000);
  it("withdraws new capacity after a refund and preserves the ceiling only for the ordinary successful source purge", async () => {
    const f = await fixture(); await f.authorize();
    await db.childProfile.update({ where: { id: f.childId }, data: { originalPhotoAssetId: null } });
    expect(await readDetectivesCompletionBudget(c, f.worldId)).toBeNull();
    await db.game.update({ where: { id: f.gameId }, data: { status: "READY", configJson: "{}", readyAt: new Date() } });
    expect(await readDetectivesCompletionBudget(c, f.worldId)).toBeNull();
    await db.auditLog.create({ data: { id: `synthetic-purge-${f.gameId}`, actorType: "SYSTEM", action: "local-patch:photo-purged-after-approval", entityType: "Asset",
      entityId: `ast-sheet-${f.gameId}`, metaJson: JSON.stringify({ photoAssetId: `ast-photo-${f.gameId}` }) } });
    expect(await readDetectivesCompletionBudget(c, f.worldId)).toMatchObject({ capMicroUsd: 6_000_000 });
    await db.order.update({ where: { id: `order-${f.gameId}` }, data: { paymentStatus: "REFUNDED", refundedAt: new Date() } });
    expect(await readDetectivesCompletionBudget(c, f.worldId)).toBeNull();
  }, 60_000);

  it.each(["actor", "entity", "cap", "digest"])("refuses a forged %s receipt without falling back to grant capacity", async field => {
    const f = await fixture(); await f.authorize();
    const row = await db.auditLog.findUniqueOrThrow({ where: { id: detectivesCompletionId(f.gameId) } });
    const value = JSON.parse(row.metaJson!);
    if (field === "cap") value.capMicroUsd = 6_000_001;
    if (field === "digest") value.ownerAuthorizationSha256 = "f".repeat(64);
    await db.auditLog.update({ where: { id: row.id }, data: { ...(field === "actor" ? { actorType: "SYSTEM", actorId: null } : {}),
      ...(field === "entity" ? { entityId: "foreign-world" } : {}), metaJson: JSON.stringify(value) } });
    await expect(readDetectivesCompletionBudget(c, f.worldId)).rejects.toThrow();
    expect(await nextDetectivesCompletionWake(c, f.gameId)).toBeNull();
    expect((await db.generationJob.findUniqueOrThrow({ where: { id: `job_${f.gameId}` } })).status).toBe("FAILED");
  }, 60_000);
  it("serializes competing grants and keeps a changed post-grant hold parked", async () => {
    const f = await fixture(), plan = await f.input();
    const attempts = await Promise.allSettled([f.authorize(c, plan), f.authorize(c, plan)]);
    expect(attempts.some(a => a.status === "fulfilled")).toBe(true);
    expect(await db.auditLog.count({ where: { id: detectivesCompletionId(f.gameId) } })).toBe(1);
    await db.generationJob.update({ where: { id: `job_${f.gameId}` }, data: { lastError: "A new unrelated hold" } });
    expect(await nextDetectivesCompletionWake(c, f.gameId)).toBeNull();
    expect(await db.auditLog.count({ where: { id: detectivesCompletionResumeId(f.gameId) } })).toBe(0);
  }, 60_000);
});
