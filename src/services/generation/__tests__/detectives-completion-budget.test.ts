import { singleLowContinuationPublishable } from "../detectives-completion-budget";
import type { WorldAutomaticReviewRecoveryV5 } from "../world-budget";
import { resumeDetectivesLowEngineRecovery } from "../detectives-completion-budget";
import { GUIDED_FRAME_MIN_CAPACITY_MICRO_USD } from "../../../domain/generation/guided-frame-recovery";
import { SINGLE_VISUAL_REVIEW_VERSION } from "../../../domain/generation/single-visual-review";
import { PrismaRetainedPurchaseStore } from "../../../infra/db/prisma-retained-purchase-store";
import { RETAINED_PURCHASE_VERSION, retainedPayloadDigest } from "../paid-operation";
import { LOCAL_PATCH_PROVIDER, LOCAL_PATCH_VARIANT } from "../local-patch-hide";
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
  planDetectivesCompletionExtension, authorizeDetectivesCompletionExtension, resumeDetectivesCompletionExtension,
  resumeDetectivesCompletionBudget, nextDetectivesCompletionWake, resumeDetectivesApplyingRepair } from "../detectives-completion-budget";
import { detectivesExtensionId, detectivesExtensionResumeId, detectivesCompletionId, detectivesCompletionResumeId } from "../../../domain/generation/detectives-completion-budget";

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

async function applyingFixture(remaining = 210_000) {
  const f=await fixture(); await f.authorize(); expect(await resumeDetectivesCompletionBudget(c,f.gameId)).toBe(true);
  const budget=boardWizardBudgetOf(c), current=await budget.audit(f.worldId);
  await budget.importSettled(f.worldId,{scope:"image",operationFingerprint:"synthetic-later-"+f.gameId,
    evidence:bill("later-"+f.gameId,6_000_000-current.committedMicroUsd-Math.max(210_000,remaining)-50_000)});
  const hide=DETECTIVE_PATCH_BOARDS[0]!.hides[0]!, key=`self-repair:${hide.id}:diagnosis:1`;
  await budget.reserve(f.worldId,{requestKey:key,scope:"judge",operationFingerprint:fingerprint(31),reserveMicroUsd:250_000});
  const evidence={...bill("diagnosis-"+f.gameId,50_000),model:"gpt-5.6-sol"};
  await budget.settle(f.worldId,key,evidence);
  // The diagnosis was bought while it fit. Later unrelated paid work leaves
  // this saved plan unaffordable; the refusal test starts AFTER that history.
  if(remaining<210_000) await budget.importSettled(f.worldId,{scope:"image",operationFingerprint:"later-debit-"+f.gameId,
    evidence:bill("later-debit-"+f.gameId,210_000-remaining)});

  const decision={cause:"composition-clipping",explanation:"Synthetic lower placement keeps the complete head inside the corrected closed return.",
    action:"redraw-with-new-placement",sourceKey:`${hide.id}:${hide.pose}:render:1`,
    returnWindow:{left:50,top:80,width:400,height:620},protectedCore:{left:100,top:160,width:250,height:420},
    faceRect:{left:130,top:190,width:80,height:90}};
  const raw=JSON.stringify(decision), authoredContext={version:"authored-recovery-context/v1",parentSha256:fingerprint(41),sourcePngSha256:fingerprint(42)};
  const bytes=Buffer.from(JSON.stringify({raw,authoredRecoveryContext:authoredContext}));
  await new PrismaRetainedPurchaseStore(db).put(f.worldId,key,{version:RETAINED_PURCHASE_VERSION,worldId:f.worldId,requestKey:key,scope:"judge",
    operationFingerprint:fingerprint(31),payloadSha256:retainedPayloadDigest(bytes),bytes,evidence,unknownReason:null});
  const targetId="applying-target-"+f.gameId,rowId="applying-row-"+f.gameId;
  await db.targetInstance.create({data:{id:targetId,gameSceneId:`gsc-${f.gameId}-${DETECTIVE_PATCH_BOARDS[0]!.board}`,
    targetId:hide.targetId,targetType:"child",slotAId:hide.id,slotBId:hide.id}});
  const selfRepair={version:"local-patch-self-repair/v1",cycle:1,phase:"applying",contextSha256:fingerprint(43),decision,history:[],
    feedback:"Synthetic failed crown clipping",sourceKeys:[decision.sourceKey],imageCostCents:0,diagnosisCostCents:5,
    authoredContext,authoredDiagnosis:{requestKey:key,operationFingerprint:fingerprint(31),rawSha256:sha256Bytes(Buffer.from(raw))},
    subjectV2Cycles:1,boundaryContext:true};
  await db.targetVariantAsset.create({data:{id:rowId,targetInstanceId:targetId,variant:LOCAL_PATCH_VARIANT,slotId:hide.id,
    provider:LOCAL_PATCH_PROVIDER,status:"FAILED",attempts:2,lastError:"quality-retry: childComplete",judgeJson:JSON.stringify({selfRepair})}});
  await db.generationJob.update({where:{id:"job_"+f.gameId},data:{status:"FAILED",currentStep:"local-patch:recovery-exhausted",attempts:32,
    lastError:"local-patch: no automatic action remains within the authorized world budget; synthetic stale sibling refusal"}});
  return {...f,rowId,hide,budget,selfRepair,renderKey:`${hide.id}:${hide.pose}:self-repair:1`};
}
describe("existing six-dollar grant: paid applying checkpoint wake",()=>{
  it("queues once from the exact saved paid plan without changing the cap, unknowns, source or attempt count",async()=>{
    const f=await applyingFixture(), before=await immutable(f), audit=await f.budget.audit(f.worldId);
    expect(audit.remainingMicroUsd).toBe(210_000); expect(audit.unknownRequestKeys).toHaveLength(3);
    expect(await nextDetectivesCompletionWake(c,f.gameId)).toBe(f.gameId);
    expect(await db.generationJob.findUniqueOrThrow({where:{id:"job_"+f.gameId}})).toMatchObject({status:"QUEUED",currentStep:"local-patch",attempts:32});
    expect(await immutable(f)).toEqual(before);
    expect(await f.budget.audit(f.worldId)).toEqual(audit);
    const rows=await db.auditLog.findMany({where:{entityId:f.gameId,action:"generation:detectives-applying-repair-resumed"}});
    expect(rows).toHaveLength(1); expect(JSON.parse(rows[0]!.metaJson!)).toMatchObject({providerCallsAdded:0,attemptsReset:false,budgetChanged:false,
      capMicroUsd:6_000_000,nextRenderReserveMicroUsd:120_000,previousJobAttempts:32});
    await db.generationJob.update({where:{id:"job_"+f.gameId},data:{status:"FAILED",currentStep:"local-patch:recovery-exhausted",attempts:33,
      lastError:"local-patch: no automatic action remains within the authorized world budget; same paid plan stopped"}});
    expect(await nextDetectivesCompletionWake(c,f.gameId)).toBeNull();
    expect(await immutable(f)).toEqual(before); expect(fetch).not.toHaveBeenCalled();
  },60_000);
  it.each(["unaffordable","wrong-hold","no-initial-resume","source-changed","refunded","deleted","raw-mismatch","foreign-diagnosis",
    "invalid-plan","diagnosing","spent-cycles","already-painted","pending","unapproved-unknown","missing-grant",
    "wrong-resume-actor","wrong-resume-grant","avatar-pixels-changed"] as const)(
    "does not wake an unauthorized, stale or unaffordable checkpoint: %s",async kind=>{
      const f=await applyingFixture(kind==="unaffordable"?119_999:210_000);
      if(kind==="wrong-hold") await db.generationJob.update({where:{id:"job_"+f.gameId},data:{lastError:"Unrelated financial hold"}});
      if(kind==="no-initial-resume") await db.auditLog.delete({where:{id:detectivesCompletionResumeId(f.gameId)}});
      if(kind==="source-changed") await db.childProfile.update({where:{id:f.childId},data:{ageYears:9}});
      if(kind==="refunded") await db.order.update({where:{id:"order-"+f.gameId},data:{paymentStatus:"REFUNDED",refundedAt:new Date()}});
      if(kind==="deleted") await db.game.update({where:{id:f.gameId},data:{deletedAt:new Date(),status:"DELETED"}});
      if(kind==="missing-grant") await db.auditLog.delete({where:{id:detectivesCompletionId(f.gameId)}});
      if(kind==="wrong-resume-actor") await db.auditLog.update({where:{id:detectivesCompletionResumeId(f.gameId)},data:{actorType:"USER"}});
      if(kind==="wrong-resume-grant") {
        const row=await db.auditLog.findUniqueOrThrow({where:{id:detectivesCompletionResumeId(f.gameId)}});
        await db.auditLog.update({where:{id:row.id},data:{metaJson:JSON.stringify({...JSON.parse(row.metaJson!),authorizationSha256:fingerprint(91)})}});
      }
      if(kind==="avatar-pixels-changed") await c.storage.put("game/avatar-"+f.gameId,Buffer.from("changed synthetic avatar pixels"),"image/png");

      if(["raw-mismatch","foreign-diagnosis","invalid-plan","diagnosing","spent-cycles"].includes(kind)) {
        const value=structuredClone(f.selfRepair);
        if(kind==="raw-mismatch") value.authoredDiagnosis.rawSha256=fingerprint(99);
        if(kind==="foreign-diagnosis") value.authoredDiagnosis.requestKey="self-repair:foreign:diagnosis:1";
        if(kind==="invalid-plan") value.decision.faceRect.width=1;
        if(kind==="diagnosing") value.phase="diagnosing";
        if(kind==="spent-cycles") value.subjectV2Cycles=4;
        await db.targetVariantAsset.update({where:{id:f.rowId},data:{judgeJson:JSON.stringify({selfRepair:value})}});
      }
      if(["already-painted","pending","unapproved-unknown"].includes(kind)) {
        const key=kind==="already-painted"?f.renderKey:"synthetic-new-"+kind;
        await f.budget.reserve(f.worldId,{requestKey:key,scope:"image",operationFingerprint:fingerprint(76),reserveMicroUsd:10_000});
        if(kind==="unapproved-unknown") await f.budget.markUnknown(f.worldId,key,"Unapproved synthetic outcome");
        if(kind==="already-painted") await f.budget.settle(f.worldId,key,bill("already-"+f.gameId,5_000));
      }
      const before=await immutable(f), job=await db.generationJob.findUniqueOrThrow({where:{id:"job_"+f.gameId}});
      expect(await nextDetectivesCompletionWake(c,f.gameId)).toBeNull();
      expect(await db.generationJob.findUniqueOrThrow({where:{id:job.id}})).toEqual(job);
      expect(await immutable(f)).toEqual(before);
      expect(await db.auditLog.count({where:{entityId:f.gameId,action:"generation:detectives-applying-repair-resumed"}})).toBe(0);
      expect(fetch).not.toHaveBeenCalled();
    },60_000);
  it("serializes competing wake attempts without resetting attempts or recording a second wake",async()=>{
    const f=await applyingFixture(), before=await immutable(f);
    const attempts=await Promise.allSettled([resumeDetectivesApplyingRepair(c,f.gameId),resumeDetectivesApplyingRepair(c,f.gameId)]);
    expect(attempts.filter(r=>r.status==="fulfilled"&&r.value===true)).toHaveLength(1);
    expect(await db.auditLog.count({where:{entityId:f.gameId,action:"generation:detectives-applying-repair-resumed"}})).toBe(1);
    expect(await db.generationJob.findUniqueOrThrow({where:{id:"job_"+f.gameId}})).toMatchObject({status:"QUEUED",attempts:32});
    expect(await immutable(f)).toEqual(before); expect(fetch).not.toHaveBeenCalled();
  },60_000);
});


async function extensionFixture() {
  const f = await fixture();
  await f.authorize();
  expect(await resumeDetectivesCompletionBudget(c, f.gameId)).toBe(true);
  const budget = boardWizardBudgetOf(c);
  await budget.reserve(f.worldId, { requestKey: 'synthetic-six-dollar-work', scope: 'image', operationFingerprint: fingerprint(81), reserveMicroUsd: 2_000_000 });
  await budget.settle(f.worldId, 'synthetic-six-dollar-work', bill('req-extension-' + f.gameId, 2_000_000));
  await db.generationJob.update({ where: { id: 'job_' + f.gameId }, data: { status: 'FAILED', currentStep: 'local-patch:recovery-exhausted', attempts: 21,
    lastError: 'local-patch: no automatic action remains within the authorized world budget; synthetic second capacity stop' } });
  const plan = await planDetectivesCompletionExtension(c, f.gameId);
  const authorize = (container = c, observed = plan) => authorizeDetectivesCompletionExtension(container, {
    gameId: f.gameId, operatorId: f.ownerId, expectedPlanSha256: observed.planSha256, ownerAuthorizationSha256: authorization });
  return { ...f, plan, extend: authorize };
}
describe('a separate explicit Detective eight-dollar continuation', () => {
  it('preserves the six-dollar receipt and ledger, grants once, and wakes the exact second hold without resetting attempts', async () => {
    const f = await extensionFixture(), before = await immutable(f);
    const previous = await db.auditLog.findUniqueOrThrow({ where: { id: detectivesCompletionId(f.gameId) } });
    expect(f.plan.binding).toMatchObject({ baseCapMicroUsd: 6_000_000, capMicroUsd: 8_000_000, committedMicroUsd: 5_900_000, reservedMicroUsd: 520_000 });
    expect(f.plan.binding.retainedUnknowns).toHaveLength(3);
    expect(await readBoardWizardBudgetAuthority(c, f.worldId)).toMatchObject({ capMicroUsd: 6_000_000 });
    const grant = await f.extend(); expect(await f.extend()).toEqual(grant);
    expect(await immutable(f)).toEqual(before);
    expect(await db.auditLog.findUniqueOrThrow({ where: { id: detectivesCompletionId(f.gameId) } })).toEqual(previous);
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: 'job_' + f.gameId } })).toMatchObject({ status: 'FAILED', attempts: 21 });
    expect(await readBoardWizardBudgetAuthority(c, f.worldId)).toMatchObject({ capMicroUsd: 8_000_000, authorizationSha256: grant.authorizationSha256 });
    expect(await nextDetectivesCompletionWake(c, f.gameId)).toBe(f.gameId);
    expect(await resumeDetectivesCompletionExtension(c, f.gameId)).toBe(false);
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: 'job_' + f.gameId } })).toMatchObject({ status: 'QUEUED', attempts: 21 });
    expect(await immutable(f)).toEqual(before);
    expect(await db.auditLog.count({ where: { id: detectivesExtensionResumeId(f.gameId) } })).toBe(1);
    const budget = boardWizardBudgetOf(c);
    await expect(budget.reserve(f.worldId, { requestKey: 'synthetic-over-eight', scope: 'judge', operationFingerprint: fingerprint(83), reserveMicroUsd: 2_100_001 })).rejects.toThrow();
    await expect(budget.reserve(f.worldId, { requestKey: 'synthetic-inside-eight', scope: 'judge', operationFingerprint: fingerprint(84), reserveMicroUsd: 200_000 })).resolves.toBeTruthy();
  }, 60_000);
  it.each(['no-admin', 'age', 'avatar', 'hold', 'ledger', 'pending', 'refund', 'production', 'foreign-plan'])('refuses stale or unauthorized extension: %s', async fault => {
    const f = await extensionFixture();
    if (fault === 'age') await db.childProfile.update({ where: { id: f.childId }, data: { ageYears: 7 } });
    if (fault === 'avatar') await c.storage.put('game/avatar-' + f.gameId, Buffer.from('changed synthetic avatar'), 'image/png');
    if (fault === 'hold') await db.generationJob.update({ where: { id: 'job_' + f.gameId }, data: { lastError: 'Different service hold' } });
    if (fault === 'ledger') await db.worldBudgetLedger.update({ where: { worldId: f.worldId }, data: { revision: { increment: 1 } } });
    if (fault === 'pending') await boardWizardBudgetOf(c).reserve(f.worldId, { requestKey: 'synthetic-pending-extension', scope: 'judge', operationFingerprint: fingerprint(86), reserveMicroUsd: 1 });
    if (fault === 'refund') await db.order.update({ where: { id: 'order-' + f.gameId }, data: { paymentStatus: 'REFUNDED', refundedAt: new Date() } });
    if (fault === 'production') settings.APP_ENV = 'production';
    const other = fault === 'foreign-plan' ? await extensionFixture() : null;
    await expect(f.extend(fault === 'no-admin' ? { ...c, adminEmails: [] } : c, other?.plan ?? f.plan)).rejects.toThrow();
    expect(await db.auditLog.findUnique({ where: { id: detectivesExtensionId(f.gameId) } })).toBeNull();
  }, 60_000);
  it('does not turn any six-dollar or new-world stop into an automatic extension', async () => {
    const f = await fixture();
    await expect(planDetectivesCompletionExtension(c, f.gameId)).rejects.toThrow('consumed six-dollar');
    expect(await resumeDetectivesCompletionExtension(c, f.gameId)).toBe(false);
    await f.authorize();
    await expect(planDetectivesCompletionExtension(c, f.gameId)).rejects.toThrow('consumed six-dollar');
    expect(await readBoardWizardBudgetAuthority(c, f.worldId)).toMatchObject({ capMicroUsd: 6_000_000 });
  }, 60_000);
  it('refuses a changed ledger at grant time and at wake time', async () => {
    const f = await extensionFixture();
    const raced = { ...c, db: new Proxy(db, { get(target, key) {
      if (key !== '$transaction') return Reflect.get(target, key);
      return async (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) => {
        await db.worldBudgetLedger.update({ where: { worldId: f.worldId }, data: { revision: { increment: 1 } } });
        return db.$transaction(work, options);
      };
    } }) } as Container;
    await expect(f.extend(raced)).rejects.toThrow('changed');
    expect(await db.auditLog.findUnique({ where: { id: detectivesExtensionId(f.gameId) } })).toBeNull();
    const fresh = await planDetectivesCompletionExtension(c, f.gameId); await f.extend(c, fresh);
    await db.worldBudgetLedger.update({ where: { worldId: f.worldId }, data: { revision: { increment: 1 } } });
    await expect(resumeDetectivesCompletionExtension(c, f.gameId)).rejects.toThrow('ledger changed');
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: 'job_' + f.gameId } })).toMatchObject({ status: 'FAILED', attempts: 21 });
  }, 60_000);
});


async function guidedWakeFixture(){const f=await extensionFixture();await f.extend();expect(await resumeDetectivesCompletionExtension(c,f.gameId)).toBe(true);const board=DETECTIVE_PATCH_BOARDS[0]!,hide=board.hides[0]!,targetId="guided-target-"+f.gameId,rowId="guided-row-"+f.gameId;
 await db.targetInstance.create({data:{id:targetId,gameSceneId:"gsc-"+f.gameId+"-"+board.board,targetId:hide.targetId,targetType:"child",slotAId:hide.id,slotBId:hide.id}});
 const receipt={selfRepair:{version:"local-patch-self-repair/v1",subjectV2Cycles:3},reviewState:"board-review-complete",wireFault:null,judgedSha256:fingerprint(40),verdict:{verdict:"fail",childComplete:"fail",boundaryIntegrity:{top:{status:"fail"}}},boardReview:{dual:{single:SINGLE_VISUAL_REVIEW_VERSION,quality:{requestKey:"synthetic-old-low",policy:{effort:"low",model:"gpt-6.1-sol"},raw:JSON.stringify({version:SINGLE_VISUAL_REVIEW_VERSION,assessment:{},continuity:{},doubt:false,doubtReason:null})}}}};
 await db.targetVariantAsset.create({data:{id:rowId,targetInstanceId:targetId,variant:"A",slotId:hide.id,provider:"local-patch",status:"FAILED",attempts:2,assetId:"synthetic-failed-asset",judgeJson:JSON.stringify(receipt)}});
 await db.generationJob.update({where:{id:"job_"+f.gameId},data:{status:"FAILED",currentStep:"local-patch:recovery-exhausted",attempts:22,lastError:"local-patch: no automatic action remains within the authorized world budget; synthetic exhausted repairs"}});return{...f,rowId,receipt};}
describe("single LOW guided software recovery wake",()=>{
 it("requeues the original hold once without changing the cap, ledger snapshot, unknowns, source or attempts",async()=>{const f=await guidedWakeFixture(),before=await immutable(f);expect(await nextDetectivesCompletionWake(c,f.gameId)).toBe(f.gameId);expect(await immutable(f)).toEqual(before);expect(await db.generationJob.findUniqueOrThrow({where:{id:"job_"+f.gameId}})).toMatchObject({status:"QUEUED",attempts:22});expect(await resumeDetectivesLowEngineRecovery(c,f.gameId)).toBe(false);expect(await db.auditLog.count({where:{entityId:f.gameId,action:"generation:detectives-low-engine-resumed"}})).toBe(1);});
 it.each(["capacity","source","age","not-exhausted","not-low","pending","refunded","wrong-hold"])("refuses %s before writing a wake",async kind=>{const f=await guidedWakeFixture();if(kind==="capacity"){const b=boardWizardBudgetOf(c),a=await b.audit(f.worldId);await b.importSettled(f.worldId,{scope:"image",operationFingerprint:"synthetic-later-debit",evidence:bill("synthetic-capacity-"+f.gameId,a.remainingMicroUsd-GUIDED_FRAME_MIN_CAPACITY_MICRO_USD+1)});}if(kind==="source")await db.childProfile.update({where:{id:f.childId},data:{originalPhotoAssetId:null}});if(kind==="age")await db.childProfile.update({where:{id:f.childId},data:{ageYears:7}});if(kind==="not-exhausted"||kind==="not-low"){const r=structuredClone(f.receipt);if(kind==="not-exhausted")r.selfRepair.subjectV2Cycles=2;else r.boardReview.dual.quality.policy.effort="high";await db.targetVariantAsset.update({where:{id:f.rowId},data:{judgeJson:JSON.stringify(r)}});}if(kind==="pending")await boardWizardBudgetOf(c).reserve(f.worldId,{requestKey:"synthetic-pending",scope:"image",operationFingerprint:fingerprint(99),reserveMicroUsd:120_000});if(kind==="refunded")await db.order.update({where:{id:"order-"+f.gameId},data:{paymentStatus:"REFUNDED",refundedAt:new Date()}});if(kind==="wrong-hold")await db.generationJob.update({where:{id:"job_"+f.gameId},data:{lastError:"unrelated operational fault"}});expect(await nextDetectivesCompletionWake(c,f.gameId)).toBeNull();expect(await db.auditLog.count({where:{entityId:f.gameId,action:"generation:detectives-low-engine-resumed"}})).toBe(0);});
});


it("admits a counted LOW unknown for publication only through its exact SYSTEM proof and original grant",async()=>{const f=await extensionFixture(),grant=await f.extend();await resumeDetectivesCompletionExtension(c,f.gameId);const key="self-repair:board:amazon:"+fingerprint(70),proof={policyId:"single-sol-low-transport-recovery/v1",gameId:f.gameId,single:SINGLE_VISUAL_REVIEW_VERSION,grantSha256:grant.authorizationSha256,variantId:"synthetic-low-row",imageSha256:fingerprint(71),requestKey:key,operationFingerprint:fingerprint(70),retainedPayloadSha256:fingerprint(72)};
 const a:WorldAutomaticReviewRecoveryV5={version:"world-automatic-review-recovery/v5",policyId:"single-sol-low-transport-recovery/v1",worldId:f.worldId,approvalId:"synthetic-low-proof-"+f.gameId,requestKey:key,scope:"judge",operationFingerprint:fingerprint(70),reserveMicroUsd:210_553,unknownReasons:["unpriced failure"],grantSha256:grant.authorizationSha256,variantId:proof.variantId,imageSha256:proof.imageSha256,authorizationSha256:sha256Bytes(Buffer.from(JSON.stringify(proof))),authorizedAt:"2026-10-23T00:00:00.000Z"};
 const row=await db.auditLog.create({data:{id:a.approvalId,actorType:"SYSTEM",action:a.policyId,entityType:"Game",entityId:f.gameId,metaJson:JSON.stringify(proof)}});expect(await singleLowContinuationPublishable(db,f.gameId,a)).toBe(true);
 for(const kind of ["actor","foreign-image","changed-proof","grant"]){if(kind==="actor")await db.auditLog.update({where:{id:row.id},data:{actorType:"ADMIN"}});if(kind==="foreign-image")a.imageSha256=fingerprint(75);if(kind==="changed-proof")await db.auditLog.update({where:{id:row.id},data:{metaJson:JSON.stringify({...proof,extra:"changed"})}});if(kind==="grant")a.grantSha256=fingerprint(76);expect(await singleLowContinuationPublishable(db,f.gameId,a)).toBe(false);a.imageSha256=proof.imageSha256;a.grantSha256=grant.authorizationSha256;await db.auditLog.update({where:{id:row.id},data:{actorType:"SYSTEM",metaJson:row.metaJson}});}
});
