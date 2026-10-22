import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import type { Container } from "../../container";
import { DETECTIVE_IDENTITY_STYLE_CATALOG_SHA256 } from "../../../../content/detectives/identity-style-release";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { sha256Bytes } from "../fixed-sprite";
import { IDENTITY_GATE_ACTION, IDENTITY_REASON_RECONCILIATION_ACTION, identityGateReceiptOf,
  reconciledIdentityReason, reviewBoardWizardIdentity, identityReceiptReadyForPublication,
  type IdentityGateReceipt, type IdentityProvenance } from "../board-wizard-identity-gate";
import { resumeIdentityReasonHold } from "../identity-reason-recovery";
import { tickGeneration } from "../queue";
import { runGenerationPipeline } from "../pipeline";

const fake = vi.hoisted(() => ({ appEnv: "qa", enabled: "on", pin: true,
  beforePin: undefined as undefined | (() => Promise<void>) }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: fake.appEnv, GENERATION_ENABLED: fake.enabled }) }));
// Existing source-family suites qualify the full immutable pin. These tests
// isolate the new receipt/transaction boundary, using real SQLite and blobs.
vi.mock("../source-placement-release", () => ({ sourcePlacementReleaseOf: async () => {
  const before = fake.beforePin; fake.beforePin = undefined; await before?.();
  return fake.pin ? { baseSceneVersion: 13, familyId: "journey-detectives/v1" } : null;
} }));

vi.mock("../pipeline", async original => ({ ...await original<typeof import("../pipeline")>(),
  runGenerationPipeline: vi.fn(async () => undefined) }));
vi.mock("../identity-source-revision-queue", () => ({ nextIdentitySourceRevision: async () => null }));
vi.mock("../local-patch-parked-wake", () => ({ nextParkedWake: async () => null, claimParkedWake: async () => false }));
vi.mock("../local-patch-spend-pause", async original => ({ ...await original<typeof import("../local-patch-spend-pause")>(),
  pauseLocalPatchForSpendGuard: async () => null }));

let db: PrismaClient, scratch: string, png: Buffer, sequence = 0;
const checks = { identity: "pass", age: "pass", paintedStyle: "pass", sheetLayout: "pass",
  sourceFaceVisible: "pass", facialVolume: "pass", viewConsistency: "pass" };
const longReason = "Synthetic visible evidence. ".repeat(80);
const hold = "board-wizard: unresolved-identity; retained evidence requires reconciliation; no automatic repurchase";
beforeAll(async () => {
  scratch = mkdtempSync(path.join(realpathSync(tmpdir()), "findme-reason-recovery-"));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}` } } });
  await applyTestSchema(db);
  png = await sharp({ create: { width: 32, height: 32, channels: 4, background: "#587e94" } }).png().toBuffer();
});
beforeEach(() => {
  fake.appEnv = "qa"; fake.enabled = "on"; fake.pin = true; fake.beforePin = undefined;
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("Unexpected provider HTTP in synthetic regression"); }));
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  await db.$disconnect();
  const target = path.resolve(scratch);
  if (path.dirname(target) === realpathSync(tmpdir()) && path.basename(target).startsWith("findme-reason-recovery-"))
    rmSync(target, { recursive: true, force: true });
});
async function fixture(reason = longReason, patch: Record<string, string> = {}) {
  const id = `synthetic-reason-${++sequence}`, ownerId = id + "-owner", childId = id + "-child";
  const photoId = id + "-photo", sheetId = id + "-sheet", avatarId = id + "-avatar";
  await db.user.create({ data: { id: ownerId, email: id + "@example.invalid" } });
  for (const [assetId, type] of [[photoId, "ORIGINAL_PHOTO"], [sheetId, "IDENTITY_SHEET"], [avatarId, "AVATAR"]]) {
    const key = "private/" + assetId;
    await db.asset.create({ data: { id: assetId!, ownerId, type: type!, visibility: type === "AVATAR" ? "GAME" : "PRIVATE", status: "READY",
      storagePath: key, mimeType: "image/png", width: 32, height: 32, bytes: png.length } });
    await db.fileBlob.create({ data: { key, contentType: "image/png", data: new Uint8Array(png) } });
  }
  await db.childProfile.create({ data: { id: childId, ownerId, displayName: "Synthetic", ageYears: 7,
    originalPhotoAssetId: photoId, identityAssetId: sheetId, avatarAssetId: avatarId } });
  await db.game.create({ data: { id, ownerId, childProfileId: childId, status: "MANUAL_REVIEW", lastError: hold,
    styleVersion: "local-patch-world-v1", searchLevel: "detectives", sceneCount: 9, packageTier: "ONE_WORLD", paidAt: new Date() } });
  for (const [orderIndex, sceneSlug] of ["newyork", "amazon", "paris", "marrakech", "giza", "tokyo", "greatwall", "sydney", "antarctica"].entries())
    await db.gameScene.create({ data: { id: id + "-scene-" + orderIndex, gameId: id, sceneSlug, sceneVersion: 13, orderIndex } });
  await db.generationJob.create({ data: { id: "job_" + id, gameId: id, status: "DONE", attempts: 1,
    lastError: "board-wizard: unresolved-identity", stepsJson: JSON.stringify({
      avatar: { status: "running" }, identityBestOfTwo: { policy: "identity-best-of-two/v1", first: { identityAssetId: sheetId, avatarAssetId: avatarId } },
      boardWizardIdentity: { version: "board-wizard-identity-lifecycle/v1", state: "held", reason: "unresolved-identity" } }) } });
  const c = { db, storage: new DbStorage(db) } as unknown as Container;
  const budget = boardWizardBudgetOf(c);
  const provenance: IdentityProvenance = { promptVersion: "character-v8-full-source-volume-identity", quality: "medium",
    photoAssetId: photoId, photoSha256: sha256Bytes(png), crop: null, ageYears: 7,
    style: { version: "board-matched-identity/v6", catalogSha256: DETECTIVE_IDENTITY_STYLE_CATALOG_SHA256, atlasSha256: sha256Bytes(png) } };
  const call = vi.fn(async () => ({ httpOk: true, httpStatus: 200, bodyFormat: "json" as const,
    requestId: "req_" + id, body: { model: "gpt-6.1-sol", service_tier: "default",
      usage: { prompt_tokens: 2000, completion_tokens: 400, total_tokens: 2400 },
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ checks: { ...checks, ...patch }, reason }) } }] } }));
  const input = { gameId: id, identityAssetId: sheetId, photo: png, sheet: png, atlas: png, provenance, contentVersion: 13 };
  const deps = { db, budget, apiKey: "synthetic-never-live", beforeDispatch: async () => undefined,
    reviewer: { review: call }, write: async <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => work(db) };
  const accepted = await reviewBoardWizardIdentity(deps, input);
  const original: IdentityGateReceipt = { ...accepted, approved: false, checks: null,
    reason: "Identity review produced no usable decision: schema-invalid",
    outcome: { ...accepted.outcome!, state: "schema-invalid", schemaIssues: [{ path: "reason", code: "too_big" }] } };
  const row = await db.auditLog.findFirstOrThrow({ where: { action: IDENTITY_GATE_ACTION, entityId: sheetId } });
  // Local synthetic historical fixture only: emulate the former 1200-char parser.
  await db.auditLog.update({ where: { id: row.id }, data: { metaJson: JSON.stringify(original) } });
  return { id, c, budget, input, deps, call, accepted, original, originalId: row.id,
    sheetId, avatarId, photoId, childId, jobId: "job_" + id };
}
describe("identity explanation length and retained-response recovery", () => {
  it("lets the normal cron resume with its normal GAME avatar and call the pipeline without repainting", async () => {
    const f = await fixture();
    expect((await db.asset.findUniqueOrThrow({ where: { id: f.avatarId } })).visibility).toBe("GAME");
    const dispatch = vi.mocked(runGenerationPipeline); dispatch.mockClear();
    const result = await tickGeneration(f.c, null, 30_000);
    expect(result).toMatchObject({ gameId: f.id, status: "AVATAR_GENERATING", pending: true });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]?.[0]).toBe(f.c);
    expect(dispatch.mock.calls[0]?.[1]).toBe(f.id);
    expect(dispatch.mock.calls[0]?.[2]).toMatchObject({ hardDeadlineAt: expect.any(Number) });
    expect(f.call).toHaveBeenCalledTimes(1);
  });
  it("also retains compatibility with an owned PRIVATE avatar", async () => {
    const f = await fixture();
    await db.asset.update({ where: { id: f.avatarId }, data: { visibility: "PRIVATE" } });
    expect(await resumeIdentityReasonHold(f.c, f.id)).toBe(f.id);
    expect(f.call).toHaveBeenCalledTimes(1);
  });
  it.each(["photoId", "sheetId"] as const)("still refuses a GAME-visible %s and rolls back the job", async key => {
    const f = await fixture();
    await db.asset.update({ where: { id: f[key] }, data: { visibility: "GAME" } });
    const before = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: boardWizardWorldId(f.id) } });
    expect(await resumeIdentityReasonHold(f.c, f.id)).toBeNull();
    expect((await db.game.findUniqueOrThrow({ where: { id: f.id } })).status).toBe("MANUAL_REVIEW");
    expect((await db.generationJob.findUniqueOrThrow({ where: { id: f.jobId } })).status).toBe("DONE");
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: boardWizardWorldId(f.id) } })).toEqual(before);
    expect(f.call).toHaveBeenCalledTimes(1);
  });
  it.each([1322, 20_000])("does not turn a %i-character explanation into a visual failure", async length => {
    const f = await fixture("x".repeat(length));
    expect(f.accepted.approved).toBe(true);
    expect(f.accepted.reason).toHaveLength(length);
    expect(identityReceiptReadyForPublication(f.accepted, 13)).toBe(true);
    expect(f.call).toHaveBeenCalledTimes(1);
  });
  it("wakes the same held Detective job once using the settled answer; preserves receipt, cost and attempts", async () => {
    const f = await fixture();
    const before = await db.auditLog.findUniqueOrThrow({ where: { id: f.originalId } });
    const ledgerBefore = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: boardWizardWorldId(f.id) } });
    expect((await identityGateReceiptOf(db, f.sheetId))?.approved).toBe(false);
    expect(await resumeIdentityReasonHold(f.c, f.id)).toBe(f.id);
    expect(await resumeIdentityReasonHold(f.c, f.id)).toBeNull();
    expect((await db.game.findUniqueOrThrow({ where: { id: f.id } })).status).toBe("AVATAR_GENERATING");
    const job = await db.generationJob.findUniqueOrThrow({ where: { id: f.jobId } });
    expect(job).toMatchObject({ status: "QUEUED", attempts: 1, currentStep: "avatar" });
    expect(await db.auditLog.findUniqueOrThrow({ where: { id: f.originalId } })).toEqual(before);
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: boardWizardWorldId(f.id) } })).toEqual(ledgerBefore);
    const decoded = await identityGateReceiptOf(db, f.sheetId);
    expect(decoded?.checks).toEqual(checks); expect(decoded?.reason).toBe(longReason.trim());
    expect(await reviewBoardWizardIdentity(f.deps, f.input)).toEqual(decoded);
    expect(f.call).toHaveBeenCalledTimes(1);
    expect(await db.auditLog.count({ where: { entityId: f.sheetId, action: IDENTITY_REASON_RECONCILIATION_ACTION } })).toBe(1);
  });
  it("admits one winner when cron and the creating page race the same held job", async () => {
    const f = await fixture();
    const ledger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: boardWizardWorldId(f.id) } });
    const results = await Promise.all([resumeIdentityReasonHold(f.c, f.id), resumeIdentityReasonHold(f.c, f.id)]);
    expect(results.filter(Boolean)).toEqual([f.id]);
    expect((await db.generationJob.findUniqueOrThrow({ where: { id: f.jobId } })).attempts).toBe(1);
    expect(await db.auditLog.count({ where: { entityId: f.sheetId, action: IDENTITY_REASON_RECONCILIATION_ACTION } })).toBe(1);
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: boardWizardWorldId(f.id) } })).toEqual(ledger);
    expect(f.call).toHaveBeenCalledTimes(1);
  }, 30_000);
  it.each(Object.keys(checks))("keeps failed and uncertain %s closed, regardless of explanation length", async check => {
    for (const verdict of ["fail", "uncertain"]) {
      const f = await fixture(longReason, { [check]: verdict });
      expect(f.accepted.approved).toBe(false);
      expect(await resumeIdentityReasonHold(f.c, f.id)).toBeNull();
      expect((await db.game.findUniqueOrThrow({ where: { id: f.id } })).status).toBe("MANUAL_REVIEW");
    }
  });
  it("does not reconstruct missing checks, extra fields, empty reasons or altered retained bytes", async () => {
    const f = await fixture();
    const change = (patch: object) => ({ ...f.original, ...patch });
    expect(reconciledIdentityReason(change({ outcome: { ...f.original.outcome!, schemaIssues: [
      { path: "reason", code: "too_big" }, { path: "checks.age", code: "invalid_type" }] } }))).toBeNull();
    expect(reconciledIdentityReason(change({ outcome: { ...f.original.outcome!, rawContent: "changed" } }))).toBeNull();
    for (const body of [{ checks, reason: " " }, { checks, reason: longReason, unexpected: true },
      { checks: { identity: "pass" }, reason: longReason }]) {
      const raw = JSON.stringify(body);
      expect(reconciledIdentityReason(change({ outcome: { ...f.original.outcome!, rawContent: raw,
        contentLength: raw.length, contentBytes: Buffer.byteLength(raw), contentSha256: sha256Bytes(Buffer.from(raw)) } }))).toBeNull();
    }
  });
  it("rolls back the wake when current private pixels changed", async () => {
    const f = await fixture();
    await db.fileBlob.update({ where: { key: "private/" + f.photoId }, data: { data: new Uint8Array(Buffer.from("changed")) } });
    expect(await resumeIdentityReasonHold(f.c, f.id)).toBeNull();
    expect((await db.game.findUniqueOrThrow({ where: { id: f.id } })).status).toBe("MANUAL_REVIEW");
    expect((await db.generationJob.findUniqueOrThrow({ where: { id: f.jobId } })).status).toBe("DONE");
    expect(await db.auditLog.count({ where: { entityId: f.sheetId, action: IDENTITY_REASON_RECONCILIATION_ACTION } })).toBe(0);
  });
  it("keeps deletion, source-family changes and historical v12 holds outside the recovery", async () => {
    const deleted = await fixture();
    fake.beforePin = async () => { await db.game.update({ where: { id: deleted.id }, data: { status: "DELETED", deletedAt: new Date() } }); };
    expect(await resumeIdentityReasonHold(deleted.c, deleted.id)).toBeNull();
    expect((await db.game.findUniqueOrThrow({ where: { id: deleted.id } })).status).toBe("DELETED");
    const old = await fixture();
    await db.gameScene.updateMany({ where: { gameId: old.id }, data: { sceneVersion: 12 } });
    expect(await resumeIdentityReasonHold(old.c, old.id)).toBeNull();
    const unpinned = await fixture(); fake.pin = false;
    expect(await resumeIdentityReasonHold(unpinned.c, unpinned.id)).toBeNull();
  });
  it("refuses an unsettled review, a changed bill and a forged reconciliation", async () => {
    for (const mode of ["unknown", "different-bill", "forged"]) {
      const f = await fixture();
      if (mode === "forged") {
        await db.auditLog.create({ data: { id: "aud_identity_reason_" + f.sheetId, actorType: "SYSTEM",
          action: IDENTITY_REASON_RECONCILIATION_ACTION, entityType: "Asset", entityId: f.sheetId, metaJson: "{}" } });
      } else {
        const ledger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: boardWizardWorldId(f.id) } });
        const snapshot = JSON.parse(ledger.snapshotJson);
        if (mode === "unknown") { snapshot.requests[0].state = "unknown"; delete snapshot.requests[0].evidence; }
        else snapshot.requests[0].evidence.providerRequestId = "req_different_synthetic";
        await db.worldBudgetLedger.update({ where: { worldId: ledger.worldId }, data: { snapshotJson: JSON.stringify(snapshot) } });
      }
      expect(await resumeIdentityReasonHold(f.c, f.id)).toBeNull();
      expect((await db.game.findUniqueOrThrow({ where: { id: f.id } })).status).toBe("MANUAL_REVIEW");
    }
  });
  it("refuses missing ownership, unpaid games, a stopped generator and production", async () => {
    const unpaid = await fixture();
    await db.game.update({ where: { id: unpaid.id }, data: { paidAt: null } });
    expect(await resumeIdentityReasonHold(unpaid.c, unpaid.id)).toBeNull();
    const f = await fixture();
    fake.enabled = "off"; expect(await resumeIdentityReasonHold(f.c, f.id)).toBeNull();
    fake.enabled = "on"; fake.appEnv = "production"; expect(await resumeIdentityReasonHold(f.c, f.id)).toBeNull();
    fake.appEnv = "qa";
    await db.childProfile.update({ where: { id: f.childId }, data: { ownerId: unpaid.input.gameId + "-owner" } });
    expect(await resumeIdentityReasonHold(f.c, f.id)).toBeNull();
  });
});
