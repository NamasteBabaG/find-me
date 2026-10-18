import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { PrismaWorldBudgetStore } from "../../../infra/db/prisma-world-budget-store";
import { CasWorldBudgetRepository } from "../../../infra/db/world-budget-repository";
import { WorldBudget } from "../../../domain/generation/world-budget";
import { createDraft } from "../../create-flow.service";
import { localPatchCostForDisplay } from "../../admin.service";
import { boardsOfWorlds } from "../../world-catalog.service";
import type { Container } from "../../container";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { activateLocalPatchEmergencyBudget, localPatchEmergencyBudgetAuditId, deferLocalPatchIdentityAtAuthorizedCap } from "../local-patch-budget-recovery";
import { readNewQaWorldBudget, newQaWorldBudgetAuditId, pinNewQaWorldBudget } from "../local-patch-qa-budget";
import { DUAL_VISUAL_REVIEW_VERSION, DUAL_VISUAL_REVIEW_V3 } from "../visual-review-release";
import { QA_PILOT_COMPLETION_WORLDS, newQaWorldBudgetEnabled } from "../../../domain/generation/qa-world-budget-policy";

const fakes = vi.hoisted(() => ({ appEnv: "qa", release: "v19" }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: fakes.appEnv, LOCAL_PATCH_PROMPT_RELEASE: fakes.release }),
  spendGuard: () => ({}), flag: () => false, adminEmails: () => [] }));
let directory: string, db: PrismaClient, c: Container;
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-qa-six-budget-")));
  db = new PrismaClient({ datasources: { db: { url: "file:" + path.join(directory,"test.db").replaceAll("\\", "/") } } });
  await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), analytics: { track: vi.fn() }, pinDualVisualReview: true,
    dualVisualReviewRelease: DUAL_VISUAL_REVIEW_V3, visualReview: { request: vi.fn() } } as unknown as Container;
});
beforeEach(() => { fakes.appEnv = "qa"; fakes.release = "v19";
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("No provider request permitted"); })); });
afterAll(async () => { vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(directory) === realpathSync(tmpdir()) && path.basename(directory).startsWith("findme-qa-six-budget-")) rmSync(directory, { recursive: true }); });

async function paidDraft(review = DUAL_VISUAL_REVIEW_V3 as typeof DUAL_VISUAL_REVIEW_V3 | typeof DUAL_VISUAL_REVIEW_VERSION) {
  const draft = await createDraft({ ...c, dualVisualReviewRelease: review }, null, "he");
  const ownerId = "usr-" + draft.gameId, childId = "chl-" + draft.gameId;
  await db.user.create({ data: { id: ownerId, email: draft.gameId + "@example.invalid" } });
  await db.childProfile.create({ data: { id: childId, ownerId, displayName: "Synthetic", ageYears: 6 } });
  await db.game.update({ where: { id: draft.gameId }, data: { ownerId, childProfileId: childId, status: "TARGETS_GENERATING", paidAt: new Date(), sceneCount: 9 } });
  await db.gameScene.createMany({ data: boardsOfWorlds(["journey"]).map((slug, orderIndex) => ({ id: draft.gameId + "-s-" + orderIndex,
    gameId: draft.gameId, sceneSlug: slug, sceneVersion: 12, orderIndex })) });
  await db.order.create({ data: { id: "ord-" + draft.gameId, gameId: draft.gameId, userId: ownerId, provider: "synthetic",
    packageTier: "ONE_WORLD", amountAgorot: 3900, paymentStatus: "PAID", paidAt: new Date() } });
  await db.generationJob.create({ data: { id: "job_" + draft.gameId, gameId: draft.gameId, status: "QUEUED", stepsJson: "{}" } });
  return { ...draft, ownerId, childId, worldId: boardWizardWorldId(draft.gameId), budget: boardWizardBudgetOf(c) };
}
const reserve = (key: string, amount = 300_000) => ({ requestKey: key, scope: "judge" as const, operationFingerprint: key, reserveMicroUsd: amount });
const evidence = (key: string, amountMicroUsd: number) => ({ providerNamespace: "synthetic", providerRequestId: key, usageId: key,
  rawUsage: { tokens: 1 }, model: "synthetic", amountMicroUsd, costBasis: "provider-billed" as const });

describe("new QA six-dollar world authorization, no provider calls", () => {
  it("enrolls only the qualified QA/db/v19/v3 contract", () => {
    const good = { appEnv: "qa", storageId: "db", promptRelease: "v19", reviewRelease: DUAL_VISUAL_REVIEW_V3 };
    expect(newQaWorldBudgetEnabled(good)).toBe(true);
    for (const changed of [{ appEnv: "production" }, { appEnv: "development" }, { storageId: "local" }, { promptRelease: "v15" },
      { reviewRelease: DUAL_VISUAL_REVIEW_VERSION }]) expect(newQaWorldBudgetEnabled({ ...good, ...changed })).toBe(false);
  });
  it("pins atomically on a new wizard draft and resolves six only after its owned paid world exists", async () => {
    const draft = await createDraft(c, null, "he");
    expect(await db.auditLog.findUnique({ where: { id: newQaWorldBudgetAuditId(boardWizardWorldId(draft.gameId)) } })).not.toBeNull();
    expect(await readNewQaWorldBudget(c, boardWizardWorldId(draft.gameId))).toBeNull();
    const f = await paidDraft();
    expect(await readNewQaWorldBudget(c,f.worldId)).toMatchObject({ worldId: f.worldId, capMicroUsd: 6_000_000 });
    expect(await f.budget.audit(f.worldId)).toMatchObject({ capMicroUsd: 6_000_000, committedMicroUsd: 0, remainingMicroUsd: 6_000_000 });
    expect(await db.auditLog.findUnique({ where: { id: localPatchEmergencyBudgetAuditId(f.worldId) } })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not enroll an older v3 draft when the painter deployment changes", async () => {
    fakes.release = "v15";
    const f = await paidDraft();
    fakes.release = "v19";
    expect(await readNewQaWorldBudget(c,f.worldId)).toBeNull();
    expect((await f.budget.audit(f.worldId)).capMicroUsd).toBe(4_000_000);
    await expect(db.$transaction(tx => pinNewQaWorldBudget(tx, f.gameId, "db", DUAL_VISUAL_REVIEW_V3))).rejects.toThrow("unstarted new QA draft");
  });
  it("preserves the exact old four-to-five-dollar grant and never enrolls a v1 game", async () => {
    const f = await paidDraft(DUAL_VISUAL_REVIEW_VERSION);
    await f.budget.importSettled(f.worldId, { scope: "image", operationFingerprint: "past", evidence: evidence(f.gameId, 3_800_000) });
    let refusal: unknown;
    try { await f.budget.reserve(f.worldId, reserve("first-extension")); } catch (error) { refusal = error; }
    expect(await activateLocalPatchEmergencyBudget(c, f.gameId, refusal, async () => {})).toBe(true);
    const grant = await db.auditLog.findUniqueOrThrow({ where: { id: localPatchEmergencyBudgetAuditId(f.worldId) } });
    expect((await f.budget.audit(f.worldId)).capMicroUsd).toBe(5_000_000);
    await f.budget.reserve(f.worldId, reserve("close-old-world", 1_200_000));
    await f.budget.settle(f.worldId,"close-old-world",evidence("close-" + f.gameId,1_200_000));
    await expect(f.budget.reserve(f.worldId,reserve("not-a-six-dollar-world",1))).rejects.toMatchObject({ code: "cap_exceeded" });
    expect(await db.auditLog.findUniqueOrThrow({ where: { id: grant.id } })).toEqual(grant);
    expect(await readNewQaWorldBudget(c,f.worldId)).toBeNull();
  });
  it("the generic/production ledger still defaults to five, even for a QA-pinned world", async () => {
    const f = await paidDraft(), generic = new WorldBudget(new CasWorldBudgetRepository(new PrismaWorldBudgetStore(db)));
    expect((await generic.audit(f.worldId)).capMicroUsd).toBe(5_000_000);
    fakes.appEnv = "production";
    expect(await readNewQaWorldBudget(c,f.worldId)).toBeNull();
  });
  it("serializes the last capacity across independent budget instances and retains UNKNOWN on restart", async () => {
    const f = await paidDraft();
    await f.budget.importSettled(f.worldId,{ scope: "image", operationFingerprint: "past", evidence: evidence(f.gameId,5_600_000) });
    const results = await Promise.allSettled([f.budget.reserve(f.worldId,reserve("racer-a")),boardWizardBudgetOf(c).reserve(f.worldId,reserve("racer-b"))]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    const audit = await f.budget.audit(f.worldId);
    expect(audit).toMatchObject({ capMicroUsd: 6_000_000, settledMicroUsd: 5_600_000, reservedMicroUsd: 300_000, committedMicroUsd: 5_900_000 });
    const requestKey = audit.pendingRequestKeys[0]!;
    await f.budget.markUnknown(f.worldId,requestKey,"synthetic lost acknowledgement");
    const before = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } });
    await expect(boardWizardBudgetOf(c).reserve(f.worldId,reserve("unknown-is-not-free",1))).rejects.toMatchObject({ code: "world_held" });
    expect((await boardWizardBudgetOf(c).audit(f.worldId)).unknownRequestKeys).toEqual([requestKey]);
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } })).toEqual(before);
  });
  it("records full overruns and stops further purchases even below the six-dollar ceiling", async () => {
    const f = await paidDraft();
    await f.budget.reserve(f.worldId,reserve("overrun",50_000));
    await f.budget.settle(f.worldId,"overrun",evidence(f.gameId,60_000));
    expect(await f.budget.audit(f.worldId)).toMatchObject({ held: true, settledMicroUsd: 60_000, overrunRequestKeys: ["overrun"] });
    await expect(f.budget.reserve(f.worldId,reserve("again",1))).rejects.toMatchObject({ code: "world_held" });
  });
  it("parks identity exhaustion at six without resetting charges or re-queueing on restart", async () => {
    const f = await paidDraft();
    await db.game.update({ where: { id: f.gameId }, data: { status: "AVATAR_GENERATING" } });
    await f.budget.importSettled(f.worldId,{ scope: "identity", operationFingerprint: "past", evidence: evidence(f.gameId,5_980_000) });
    const input = reserve("wizard:identity-style:1:synthetic-sheet",40_000);
    let refusal: unknown;
    try { await f.budget.reserve(f.worldId,input); } catch (error) { refusal = error; }
    const before = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } });
    for (let tick=0;tick<2;tick++) {
      expect(await deferLocalPatchIdentityAtAuthorizedCap(c,f.gameId,refusal,input,async () => {})).toBe(true);
      expect(await db.generationJob.findUniqueOrThrow({ where: { id: "job_"+f.gameId } })).toMatchObject({ status: "FAILED", currentStep: "local-patch:recovery-exhausted" });
      expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } })).toEqual(before);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps settled cost above five visible under the valid six-dollar authority", async()=>{
    const f=await paidDraft();
    await f.budget.importSettled(f.worldId,{scope:"image",operationFingerprint:"cost",evidence:evidence(f.gameId,5_300_000)});
    expect(await localPatchCostForDisplay(c,f.gameId)).toMatchObject({settledMicroUsd:5_300_000,reservedMicroUsd:0,unresolved:false,unknownCharges:0});
  });
  it("retains a review's UNKNOWN reserve when bounded recovery uses the same six-dollar factory",async()=>{
    const f=await paidDraft(), fingerprint="e".repeat(64), requestKey="self-repair:board:sydney:"+fingerprint;
    await f.budget.importSettled(f.worldId,{scope:"image",operationFingerprint:"past",evidence:evidence(f.gameId,5_100_000)});
    await f.budget.reserve(f.worldId,{requestKey,scope:"judge",operationFingerprint:fingerprint,reserveMicroUsd:300_000});
    await f.budget.markUnknown(f.worldId,requestKey,"lost reply");
    const input={approvalId:"auto-review-synthetic",requestKey,scope:"judge" as const,operationFingerprint:fingerprint,reserveMicroUsd:300_000,
      unknownReasons:["lost reply"],policyId:"local-patch-review-interruption/v1" as const,authorizationSha256:"f".repeat(64),authorizedAt:new Date().toISOString()};
    const recovery=boardWizardBudgetOf(c,1,{authorizeAutomaticReviewRecovery:async()=>true});
    await recovery.authorizeAutomaticReviewRecovery(f.worldId,input);
    expect(await recovery.audit(f.worldId)).toMatchObject({capMicroUsd:6_000_000,committedMicroUsd:5_400_000,reservedMicroUsd:300_000,unknownRequestKeys:[requestKey]});
    await recovery.reserve(f.worldId,reserve("new-reviewed-question"));
    expect((await recovery.audit(f.worldId)).committedMicroUsd).toBe(5_700_000);
  });
  it.each(["capMicroUsd","authorizationEvidenceSha256","visualReviewRelease","worldId"])("refuses tampered %s before any new reservation", async key => {
    const f = await paidDraft(), id = newQaWorldBudgetAuditId(f.worldId);
    const pin = await db.auditLog.findUniqueOrThrow({ where: { id } }), receipt = JSON.parse(pin.metaJson!);
    receipt[key] = key === "capMicroUsd" ? 7_000_000 : "changed";
    await db.auditLog.update({ where: { id }, data: { metaJson: JSON.stringify(receipt) } });
    await expect(f.budget.reserve(f.worldId,reserve("forged"))).rejects.toThrow("policy");
    expect(await db.worldBudgetLedger.findUnique({ where: { worldId: f.worldId } })).toBeNull();
  });
  it("raises only the named pilot world to its inclusive completion frame, and only on its verified six-dollar pin", async () => {
    // local-patch:qa-pilot-completion/v1 names exactly one world; this test borrows the name for a synthetic one.
    expect([...QA_PILOT_COMPLETION_WORLDS]).toEqual(["game_j9mpft6aemfij36zegjk:board-wizard"]);
    const named = await paidDraft(), other = await paidDraft(), worlds = QA_PILOT_COMPLETION_WORLDS as Set<string>;
    worlds.add(named.worldId);
    try {
      expect(await readNewQaWorldBudget(c, named.worldId)).toMatchObject({ worldId: named.worldId, capMicroUsd: 12_000_000 });
      expect(await readNewQaWorldBudget(c, other.worldId)).toMatchObject({ capMicroUsd: 6_000_000 });
      for (const f of [named, other]) await f.budget.importSettled(f.worldId, { scope: "image", operationFingerprint: "history", evidence: evidence(f.gameId, 5_900_000) });
      await named.budget.reserve(named.worldId, reserve("past-six"));
      await expect(other.budget.reserve(other.worldId, reserve("past-six"))).rejects.toMatchObject({ code: "cap_exceeded" });
      // History and open reservations count inside the frame, which is inclusive: twelve, and not a micro-dollar more.
      await named.budget.importSettled(named.worldId, { scope: "image", operationFingerprint: "more-history", evidence: evidence(named.gameId + "-more", 5_600_000) });
      expect(await named.budget.audit(named.worldId)).toMatchObject({ capMicroUsd: 12_000_000, committedMicroUsd: 11_800_000, reservedMicroUsd: 300_000 });
      await expect(named.budget.reserve(named.worldId, reserve("past-twelve"))).rejects.toMatchObject({ code: "cap_exceeded" });
      await named.budget.reserve(named.worldId, reserve("to-twelve", 200_000));
      expect(await named.budget.audit(named.worldId)).toMatchObject({ committedMicroUsd: 12_000_000, remainingMicroUsd: 0, state: "exhausted" });
      // The frame stands only on the verified pin: refunded, the named world has no budget extension at all.
      await db.order.update({ where: { id: "ord-" + named.gameId }, data: { refundedAt: new Date(), paymentStatus: "REFUNDED" } });
      expect(await readNewQaWorldBudget(c, named.worldId)).toBeNull();
    } finally { worlds.delete(named.worldId); }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("refuses another world's receipt and revokes capacity after refund, deletion or ownership change", async () => {
    const a = await paidDraft(), b = await paidDraft();
    const pin = await db.auditLog.findUniqueOrThrow({ where: { id: newQaWorldBudgetAuditId(a.worldId) } });
    await db.auditLog.update({ where: { id: newQaWorldBudgetAuditId(b.worldId) }, data: { metaJson: pin.metaJson } });
    await expect(b.budget.reserve(b.worldId,reserve("wrong-world"))).rejects.toThrow("policy");
    await db.order.update({ where: { id: "ord-" + a.gameId }, data: { refundedAt: new Date(), paymentStatus: "REFUNDED" } });
    expect(await readNewQaWorldBudget(c,a.worldId)).toBeNull();
    const d = await paidDraft();
    await db.game.update({ where: { id: d.gameId }, data: { deletedAt: new Date() } });
    expect(await readNewQaWorldBudget(c,d.worldId)).toBeNull();
    const o = await paidDraft();
    await db.childProfile.update({ where: { id: o.childId }, data: { ownerId: a.ownerId } });
    expect(await readNewQaWorldBudget(c,o.worldId)).toBeNull();
  });
});
