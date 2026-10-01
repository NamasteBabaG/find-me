import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PLAYER_REVIEW_MODE, PLAYER_REVIEW_VERSION } from "../local-patch-player-review";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import type { Container } from "../../container";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { prepareLocalPatchBoardReview, reviewLocalPatchBoard } from "../local-patch-board-review";
import { localPatchBoardJudgeImages, localPatchHideEvidenceIds, type LocalPatchBoardJudgeRequest, type LocalPatchBoardJudgeResult } from "../local-patch-judge";
import { runLocalPatchHide, type LocalPatchHideDeps } from "../local-patch-hide";
import { LOCAL_PATCH_PUBLICATION_ACTION } from "../local-patch-publication-policy";
import { localPatchPrivateInventory } from "../local-patch-world";
import { runLocalPatchWorldSlice, LOCAL_PATCH_EVIDENCE_RETRY_WAIT } from "../local-patch-world";
import { nextPendingGame, tickGeneration } from "../queue";
import { LOCAL_PATCH_EVIDENCE_RETRY_BACKOFF_MS } from "../local-patch-review-recovery";
import { LOCAL_PATCH_COMPOSITION_VERSION } from "../local-patch-seam";
import { retainedPurchaseKey } from "../../../infra/db/prisma-retained-purchase-store";
import { LocalPatchRetainedPurchaseStore } from "../local-patch-lifecycle";
import { purchaseOnce } from "../paid-operation";
import { recoverPreparedLocalPatchReview, REVIEW_INTERRUPTION_POLICY } from "../local-patch-review-interruption-recovery";
import { localPatchBudgetReadyForPublication } from "../local-patch-interruption-recovery";
import { sha256Bytes } from "../fixed-sprite";
import { bill, paintedCrop, paintedOk, seedApprovedGame, PASSING_ANSWER } from "./local-patch-fixtures";

const BOARDS = localPatchBoardsForVersion(12), BOARD = BOARDS.find(b => b.board === "giza")!;
const testers: string[] = [];
let playerMode = false;
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0,
  LOCAL_PATCH_PLAYER_REVIEW: playerMode ? "on" : "off",
  GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers }), flag: () => false }));
let directory: string, db: PrismaClient, c: Container;
beforeEach(() => { playerMode = false; });
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-incremental-review-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(directory, "test.db").replaceAll("\\", "/")}` } } });
  await applyTestSchema(db); c = { db, storage: new DbStorage(db) } as unknown as Container;
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("Live requests forbidden in incremental review regression"); }));
}, 180000);
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(directory) === realpathSync(tmpdir()) && path.basename(directory).startsWith("findme-incremental-review-")) rmSync(directory, { recursive: true });
});
const good = { ...PASSING_ANSWER, faceLikeness: "pass", faceReadable: "pass", severeSeam: "pass", ageAppropriate: "pass",
  lightingMatch: "pass", neighborsIntact: "pass", integrationEvidence: { style: "Painted contours match original faces",
    lighting: "Local scene shadows match", neighbors: "All four original neighbor quadrants preserved" } };
async function seed(gameId: string, count = 1) {
  const seeded = await seedApprovedGame(c, db, { gameId, approved: false, styleVersion: "local-patch-world-v1", status: "TARGETS_GENERATING",
    withJob: true, scenes: BOARDS.map(b => ({ slug: b.board, version: 12 })) });
  testers.push(seeded.email);
  await db.order.create({ data: { id: `ord-${gameId}`, gameId, userId: seeded.userId, provider: "mock", packageTier: "ONE_WORLD",
    amountAgorot: 3900, paymentStatus: "PAID", paidAt: new Date() } });
  await c.storage.put(`private/photo-${gameId}.jpg`, seeded.sheet, "image/png");
  const catalog = await readBoardConditionedCatalog();
  await reviewBoardWizardIdentity({ db, apiKey: "synthetic", budget: boardWizardBudgetOf(c), beforeDispatch: async () => {},
    write: work => db.$transaction(work), reviewer: { review: async () => ({ httpOk: true, requestId: `req-identity-${gameId}`,
      body: { model: "gpt-5.6-luna", usage: { prompt_tokens: 1500, completion_tokens: 150 }, choices: [{ finish_reason: "stop", message: {
        content: JSON.stringify({ checks: { identity: "pass", age: "pass", paintedStyle: "pass", sheetLayout: "pass" }, reason: "Controlled identity" }) } }] } }) } },
  { gameId, identityAssetId: `ast-sheet-${gameId}`, sheet: seeded.sheet, photo: seeded.sheet, atlas: seeded.sheet, contentVersion: 12,
    provenance: { promptVersion: "character-v6-painted-identity-geometry", quality: "medium", photoAssetId: `ast-photo-${gameId}`,
      photoSha256: sha256Bytes(seeded.sheet), ageYears: 8, crop: null,
      style: { version: "board-matched-identity/v4", catalogSha256: catalog.sha256, atlasSha256: sha256Bytes(seeded.sheet) } } });
  const render = vi.fn<LocalPatchHideDeps["render"]>(async ({ requestKey, stylePng }) => {
    const hide = BOARD.hides.find(h => requestKey.startsWith(`${h.id}:`))!;
    return paintedOk(await paintedCrop(stylePng, hide), bill(`paint-${gameId}-${requestKey}`));
  });
  const deps = { renderPolicySha256: "f".repeat(64), render, judge: async () => { throw Error("Per-hide judge forbidden"); } };
  for (const hide of BOARD.hides.slice(0, count)) await runLocalPatchHide(c, deps, { gameId, board: BOARD, hide });
  let number = 0;
  const judge = vi.fn<(request: LocalPatchBoardJudgeRequest) => Promise<LocalPatchBoardJudgeResult>>(async request => ({ verdict: null, verdicts: {},
    raw: JSON.stringify({ hides: request.hides.map(h => ({ hideId: h.hideId, evidenceIds: localPatchHideEvidenceIds(h.hideId), verdict: good })) }),
    model: "gpt-5.6-sol", requestId: `judge-${gameId}-${++number}`, usage: { prompt_tokens: 1000, completion_tokens: 400 },
    finishReason: "stop", wireFault: null, costUnknown: false }));
  return { gameId, sceneId: `gsc-${gameId}-${BOARD.board}`, judge, render, deps };
}
const review = (s: Awaited<ReturnType<typeof seed>>) => reviewLocalPatchBoard(c, s, { fence: async () => {}, judge: s.judge });
const rows = (gameId: string) => db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } }, orderBy: { id: "asc" } });
const interruptedReply = { verdict: null, verdicts: {}, raw: null, model: null, usage: null, requestId: null,
  finishReason: null, wireFault: "timeout" as const, costUnknown: true };

describe("v12 ready appearances have independent paid review and publication bindings", () => {
  it("reassesses an old refusal once without repainting or changing an approved sibling", async () => {
    const s = await seed("player-visible-calibration", 2);
    await review(s);
    const accepted = (await rows(s.gameId)).find(row => JSON.parse(row.judgeJson!).verdict)!;
    s.judge.mockImplementationOnce(async request => ({ verdict: null, verdicts: {},
      raw: JSON.stringify({ hides: request.hides.map(h => ({ hideId: h.hideId, evidenceIds: localPatchHideEvidenceIds(h.hideId),
        verdict: { ...good, neighborsIntact: "fail", pictureWhole: "fail", verdict: "fail", faults: [
          { check: "neighborsIntact", where: "A background bystander was cleanly removed, with no cut anatomy" },
          { check: "pictureWhole", where: "The original crowd count changed" },
        ] } })) }), model: "gpt-5.6-sol", requestId: "judge-original-refusal", usage: { prompt_tokens: 1000, completion_tokens: 400 },
      finishReason: "stop", wireFault: null, costUnknown: false }));
    await review(s);
    const failed = (await rows(s.gameId)).find(row => row.status === "FAILED")!;
    const originalReview = JSON.parse(failed.judgeJson!).boardReview;
    const oldCharge = await boardWizardBudgetOf(c).readRequest(boardWizardWorldId(s.gameId), originalReview.requestKey);
    playerMode = true;
    expect((await review(s)).state).toBe("pending"); // third hide still absent
    const after = await rows(s.gameId), recovered = after.find(row => row.id === failed.id)!;
    expect(after.find(row => row.id === accepted.id)).toEqual(accepted);
    expect(recovered).toMatchObject({ status: "GENERATED", attempts: failed.attempts, assetId: failed.assetId });
    const receipt = JSON.parse(recovered.judgeJson!);
    expect(receipt.boardReview).toMatchObject({ version: PLAYER_REVIEW_VERSION, assessmentMode: PLAYER_REVIEW_MODE });
    expect(receipt.boardReview.requestKey).not.toBe(originalReview.requestKey);
    expect(receipt.reviewHistory[0].boardReview).toEqual(originalReview);
    expect(await boardWizardBudgetOf(c).readRequest(boardWizardWorldId(s.gameId), originalReview.requestKey)).toEqual(oldCharge);
    expect(s.render).toHaveBeenCalledTimes(2);
    expect(s.judge).toHaveBeenCalledTimes(3);
    expect((await review(s))).toMatchObject({ state: "pending", costCents: 0, replayed: true });
    expect(s.judge).toHaveBeenCalledTimes(3);
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(2);
  }, 120000);
  it("still refuses a clear cut scalp under player calibration and never repeats that assessment", async () => {
    const s = await seed("player-visible-real-cut");
    playerMode = true;
    s.judge.mockImplementation(async request => ({ verdict: null, verdicts: {},
      raw: JSON.stringify({ hides: request.hides.map(h => ({ hideId: h.hideId, evidenceIds: localPatchHideEvidenceIds(h.hideId),
        verdict: { ...good, faceReadable: "fail", verdict: "fail", faults: [
          { check: "faceReadable", where: "A straight return edge visibly cuts the child's scalp in the AFTER player context" },
        ] } })) }), model: "gpt-5.6-sol", requestId: "judge-player-real-cut", usage: { prompt_tokens: 1000, completion_tokens: 400 },
      finishReason: "stop", wireFault: null, costUnknown: false }));
    expect((await review(s)).state).toBe("retry");
    const failed = (await rows(s.gameId))[0]!;
    expect(failed.status).toBe("FAILED");
    expect(JSON.parse(failed.judgeJson!).boardReview.assessmentMode).toBe(PLAYER_REVIEW_MODE);
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(0);
    await review(s);
    expect(s.judge).toHaveBeenCalledOnce(); expect(s.render).toHaveBeenCalledOnce();
  }, 120000);
  it("revalidates retained bytes before giving a rejected image its new assessment", async () => {
    const s = await seed("player-visible-mutated-image");
    s.judge.mockImplementationOnce(async request => ({ verdict: null, verdicts: {},
      raw: JSON.stringify({ hides: request.hides.map(h => ({ hideId: h.hideId, evidenceIds: localPatchHideEvidenceIds(h.hideId),
        verdict: { ...good, styleMatch: "fail", verdict: "fail", faults: [{ check: "styleMatch", where: "Slightly smoother portrait shading" }] } })) }),
      model: "gpt-5.6-sol", requestId: "judge-old-style", usage: { prompt_tokens: 1000, completion_tokens: 400 },
      finishReason: "stop", wireFault: null, costUnknown: false }));
    await review(s); playerMode = true;
    const failed = (await rows(s.gameId))[0]!, asset = await db.asset.findUniqueOrThrow({ where: { id: failed.assetId! } });
    await db.fileBlob.update({ where: { key: asset.storagePath }, data: { data: new Uint8Array(Buffer.from("changed pixels")) } });
    await expect(review(s)).rejects.toThrow("render-completion binding");
    expect(s.judge).toHaveBeenCalledOnce(); expect(s.render).toHaveBeenCalledOnce();
  }, 120000);
  it("automatically replaces a no-response review, preserving unknown billing, identical pixels and approved siblings", async () => {
    const s = await seed("incremental-transport", 3);
    await review(s);
    const before = await rows(s.gameId), protectedRow = before.find(row => JSON.parse(row.judgeJson!).verdict)!;
    const prepared = await prepareLocalPatchBoardReview(c, s, {}); if (!prepared.ready) throw Error("Fixture must be ready");
    const budget = prepared.budget, worldId = prepared.worldId, originalKey = prepared.requestKey;
    s.judge.mockImplementationOnce(async () => interruptedReply);
    expect((await review(s)).state).toBe("pending");
    const interrupted = (await rows(s.gameId)).find(row => JSON.parse(row.judgeJson!).reviewInterruption)!;
    expect(interrupted).toMatchObject({ status: "FAILED", assetId: before.find(row => row.id === interrupted.id)!.assetId, attempts: 1 });
    expect(await budget.audit(worldId)).toMatchObject({ held: false, reservedMicroUsd: 300_000, capMicroUsd: 4_000_000 });
    expect(await budget.readRequest(worldId, originalKey)).toMatchObject({ state: "unknown", reserveMicroUsd: 300_000 });
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(1);
    await review(s); // the never-reviewed sibling gets its first turn before evidence recovery
    expect((await review(s)).state).toBe("done");
    const after = await rows(s.gameId), recovered = after.find(row => row.id === interrupted.id)!;
    expect(after.find(row => row.id === protectedRow.id)).toEqual(protectedRow);
    expect(recovered).toMatchObject({ status: "GENERATED", assetId: interrupted.assetId, attempts: interrupted.attempts });
    const receipt = JSON.parse(recovered.judgeJson!);
    expect(receipt.boardReview).toMatchObject({ evidenceReviewAttempt: 2, effort: "medium" });
    expect(receipt.boardReview.requestKey).not.toBe(originalKey);
    expect(localPatchBoardJudgeImages(prepared.request)).toEqual(localPatchBoardJudgeImages(s.judge.mock.calls[3]![0]));
    expect(await budget.audit(worldId)).toMatchObject({ held: false, reservedMicroUsd: 300_000 });
    expect(await localPatchBudgetReadyForPublication(budget, worldId, 12)).toBe(true);
    expect(await localPatchBudgetReadyForPublication(budget, worldId, 11)).toBe(false);
    expect((await localPatchPrivateInventory(c, s.gameId)).retainedPurchaseKeys).toEqual(expect.arrayContaining([
      retainedPurchaseKey(worldId, originalKey), retainedPurchaseKey(worldId, receipt.boardReview.requestKey) ]));
    expect(s.render).toHaveBeenCalledTimes(3);
  }, 120000);
  it("replays recovery after a crash between its durable accounting and row transition without charging again", async () => {
    const s = await seed("incremental-transport-crash");
    const prepared = await prepareLocalPatchBoardReview(c, s, {}); if (!prepared.ready) throw Error("Fixture must be ready");
    const buy = vi.fn(async () => ({ bytes: Buffer.from(JSON.stringify(interruptedReply)), unknownReason: "Grouped review charge could not be verified" }));
    const operation = { worldId: prepared.worldId, requestKey: prepared.requestKey, scope: "judge" as const,
      operationFingerprint: prepared.fingerprint, reserveMicroUsd: 300_000, buy };
    const store = new LocalPatchRetainedPurchaseStore(c, s.gameId, prepared.budget);
    expect((await purchaseOnce({ ledger: prepared.budget, store }, operation)).kind).toBe("unresolved");
    const original = await prepared.budget.readRequest(prepared.worldId, prepared.requestKey);
    await expect(recoverPreparedLocalPatchReview(c, prepared, async () => { throw Error("Worker died after accounting"); })).rejects.toThrow("Worker died");
    expect(await recoverPreparedLocalPatchReview(c, prepared)).toBe(true);
    expect(await recoverPreparedLocalPatchReview(c, prepared)).toBe(false);
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: REVIEW_INTERRUPTION_POLICY } })).toBe(1);
    expect(await prepared.budget.readRequest(prepared.worldId, prepared.requestKey)).toEqual(original);
    expect((await purchaseOnce({ ledger: prepared.budget, store }, operation)).kind).toBe("unresolved");
    expect(buy).toHaveBeenCalledOnce();
    await review(s); expect(s.render).toHaveBeenCalledOnce();
  }, 120000);
  it.each([
    { wireFault: "http" as const }, { wireFault: "no-receipt" as const }, { raw: "unpriced usable answer" },
    { requestId: "req-with-missing-usage" }, { model: "gpt-5.6-sol" },
  ])("keeps an unpriced nontransport answer held without another purchase: %j", async override => {
    const s = await seed(`incremental-nontransport-${Object.values(override)[0]!.replaceAll(/[^a-z]/g, "")}`);
    s.judge.mockImplementationOnce(async () => ({ ...interruptedReply, ...override }));
    const before = await rows(s.gameId);
    expect((await review(s)).state).toBe("held");
    expect(await rows(s.gameId)).toEqual(before);
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: REVIEW_INTERRUPTION_POLICY } })).toBe(0);
    expect(await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).toMatchObject({ held: true, reservedMicroUsd: 300_000 });
    expect(s.render).toHaveBeenCalledOnce();
  }, 120000);
  it("does not resume a refunded game's unknown review", async () => {
    const s = await seed("incremental-transport-refunded");
    s.judge.mockImplementationOnce(async () => {
      await db.order.update({ where: { id: `ord-${s.gameId}` }, data: { paymentStatus: "REFUNDED", refundedAt: new Date() } });
      return interruptedReply;
    });
    expect((await review(s)).state).toBe("held");
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: REVIEW_INTERRUPTION_POLICY } })).toBe(0);
  }, 120000);
  it.each([false, true])("recovers a parked world without changing its frozen question (player calibration: %s)", async calibrated => {
    playerMode = calibrated;
    const s = await seed(`incremental-parked-budget-${calibrated}`), prepared = await prepareLocalPatchBoardReview(c, s, {}, { playerReview: calibrated });
    if (!prepared.ready) throw Error("Fixture must be ready");
    const priorSpend = 3_586_026 - (await prepared.budget.audit(prepared.worldId)).committedMicroUsd;
    await prepared.budget.reserve(prepared.worldId, { requestKey: "prior-work", scope: "image", operationFingerprint: "prior-work", reserveMicroUsd: priorSpend });
    await prepared.budget.settle(prepared.worldId, "prior-work", bill("prior-parked-budget", priorSpend));
    await purchaseOnce({ ledger: prepared.budget, store: new LocalPatchRetainedPurchaseStore(c, s.gameId, prepared.budget) }, {
      worldId: prepared.worldId, requestKey: prepared.requestKey, operationFingerprint: prepared.fingerprint, scope: "judge", reserveMicroUsd: 300_000,
      buy: async () => ({ bytes: Buffer.from(JSON.stringify(interruptedReply)), unknownReason: "Grouped review charge could not be verified" }) });
    await db.generationJob.update({ where: { id: `job_${s.gameId}` }, data: { status: "FAILED", currentStep: "local-patch:needs-release" } });
    const before = await prepared.budget.audit(prepared.worldId), result = await runLocalPatchWorldSlice(c, s.deps, s.gameId, { maxHides: 1, boardJudge: s.judge });
    expect(result).toMatchObject({ claimed: true, pending: true, attention: null });
    expect(await prepared.budget.audit(prepared.worldId)).toMatchObject({ held: false, committedMicroUsd: before.committedMicroUsd,
      settledMicroUsd: before.settledMicroUsd, reservedMicroUsd: 300_000, capMicroUsd: 5_000_000, remainingMicroUsd: 1_113_974 });
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${s.gameId}` } })).toMatchObject({ currentStep: "local-patch" });
    expect(s.judge).not.toHaveBeenCalled(); expect(s.render).toHaveBeenCalledOnce();
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(0);
    expect((await review(s)).state).toBe("pending"); expect(s.judge).toHaveBeenCalledOnce();
  }, 120000);
  it("never resumes an owner-stopped world, even with an interrupted paid review", async () => {
    const s = await seed("incremental-owner-stopped");
    const prepared = await prepareLocalPatchBoardReview(c, s, {});
    if (!prepared.ready) throw Error("Fixture must be ready");
    await purchaseOnce({ ledger: prepared.budget, store: new LocalPatchRetainedPurchaseStore(c, s.gameId, prepared.budget) }, {
      worldId: prepared.worldId, requestKey: prepared.requestKey, operationFingerprint: prepared.fingerprint, scope: "judge", reserveMicroUsd: 300_000,
      buy: async () => ({ bytes: Buffer.from(JSON.stringify(interruptedReply)), unknownReason: "Grouped review charge could not be verified" }) });
    await db.$transaction(async tx => {
      await tx.game.update({ where: { id: s.gameId }, data: { status: "CANCELLED", lastError: "generation-stopped-by-owner" } });
      await tx.generationJob.update({ where: { id: `job_${s.gameId}` }, data: { status: "DONE", currentStep: "owner-stopped", attempts: { increment: 1 } } });
    });
    const beforeRows = await rows(s.gameId), beforeBudget = await prepared.budget.audit(prepared.worldId);
    const beforeJob = await db.generationJob.findUniqueOrThrow({ where: { id: `job_${s.gameId}` } });
    playerMode = true;
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(await tickGeneration(c, s.gameId, 60_000)).toMatchObject({ status: "CANCELLED", pending: false });
      expect(await runLocalPatchWorldSlice(c, s.deps, s.gameId, { boardJudge: s.judge })).toMatchObject({ claimed: false, pending: false });
    }
    expect(await nextPendingGame(c)).not.toBe(s.gameId);
    expect(await rows(s.gameId)).toEqual(beforeRows);
    expect(await prepared.budget.audit(prepared.worldId)).toEqual(beforeBudget);
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: beforeJob.id } })).toEqual(beforeJob);
    expect(s.judge).not.toHaveBeenCalled(); expect(s.render).toHaveBeenCalledOnce();
  }, 120000);
  it("bounds no-response review continuations at two without recycling old keys or dropping unknown charges", async () => {
    const s = await seed("incremental-transport-limit");
    s.judge.mockImplementation(async () => interruptedReply);
    expect((await review(s)).state).toBe("pending");
    expect((await review(s)).state).toBe("pending");
    expect((await review(s)).state).toBe("held");
    const audit = await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId));
    expect(audit).toMatchObject({ held: true, reservedMicroUsd: 900_000, capMicroUsd: 4_000_000 });
    expect(audit.unknownRequestKeys).toHaveLength(3);
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: REVIEW_INTERRUPTION_POLICY } })).toBe(2);
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(0);
    expect(s.render).toHaveBeenCalledOnce();
  }, 120000);
  it("reviews one hide before either sibling exists and fits the retained run's 0.413974 dollar headroom", async () => {
    const s = await seed("incremental-headroom"), budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(s.gameId);
    const amount = 3_586_026 - (await budget.audit(worldId)).committedMicroUsd;
    await budget.reserve(worldId, { requestKey: "prior-real-work", scope: "judge", operationFingerprint: "retained-work", reserveMicroUsd: amount });
    await budget.settle(worldId, "prior-real-work", bill("prior-headroom", amount));
    const before = await rows(s.gameId);
    expect(await review(s)).toMatchObject({ state: "pending" });
    expect(s.judge).toHaveBeenCalledOnce();
    const request = s.judge.mock.calls[0]![0];
    expect(request.reviewScope).toBe("ready-only/v1"); expect(request.hides).toHaveLength(1);
    expect(localPatchBoardJudgeImages(request)).toHaveLength(8);
    const after = await rows(s.gameId);
    expect(after).toHaveLength(before.length); expect(after[0]!.assetId).toBe(before[0]!.assetId);
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(1);
    const key = JSON.parse(after[0]!.judgeJson!).boardReview.requestKey;
    expect(await budget.readRequest(worldId, key)).toMatchObject({ reserveMicroUsd: 300_000, state: "settled" });
    expect((await localPatchPrivateInventory(c, s.gameId)).retainedPurchaseKeys).toContain(retainedPurchaseKey(worldId, key));
    await review(s); expect(s.judge).toHaveBeenCalledOnce();
    expect((await db.game.findUniqueOrThrow({ where: { id: s.gameId } })).configJson).toBeNull();
  }, 120000);
  it("leaves unsupplied unapproved siblings byte-for-byte intact and completes only after all three pass", async () => {
    const s = await seed("incremental-siblings", 3), before = await rows(s.gameId);
    const first = await prepareLocalPatchBoardReview(c, s, {}); if (!first.ready) throw Error("Fixture must be ready");
    const selectedId = first.entries.find(e => e.hide.id === first.request.hides[0]!.hideId)!.row.id;
    expect((await review(s)).state).toBe("pending");
    const after = await rows(s.gameId);
    for (const row of before.filter(r => r.id !== selectedId)) expect(after.find(r => r.id === row.id)).toEqual(row);
    const approved = after.find(r => r.id === selectedId)!;
    expect((await review(s)).state).toBe("pending"); expect((await review(s)).state).toBe("done");
    expect((await rows(s.gameId)).find(r => r.id === selectedId)).toEqual(approved);
    await review(s); expect(s.judge).toHaveBeenCalledTimes(3);
  }, 120000);
  it("recovers malformed evidence with a new question about identical pixels and no new image", async () => {
    const s = await seed("incremental-schema");
    const pass = s.judge.getMockImplementation()!;
    s.judge.mockImplementationOnce(async request => ({ ...await pass(request), raw: "{bad json" }));
    expect((await review(s)).state).toBe("blocked");
    const failed = (await rows(s.gameId))[0]!, oldKey = JSON.parse(failed.judgeJson!).boardReview.requestKey;
    expect((await review(s)).state).toBe("pending");
    const recovered = (await rows(s.gameId))[0]!;
    expect(recovered).toMatchObject({ assetId: failed.assetId, attempts: failed.attempts, status: "GENERATED", lastError: null });
    expect(recovered.rectJson).toBe(failed.rectJson); expect(s.render).toHaveBeenCalledOnce();
    expect(JSON.parse(recovered.judgeJson!).boardReview).toMatchObject({ evidenceReviewAttempt: 2, effort: "medium" });
    expect(JSON.parse(recovered.judgeJson!).boardReview.requestKey).not.toBe(oldKey);
    expect(localPatchBoardJudgeImages(s.judge.mock.calls[0]![0])).toEqual(localPatchBoardJudgeImages(s.judge.mock.calls[1]![0]));
  }, 120000);
  it("replays an already-paid historical full question without another purchase or changed question", async () => {
    const s = await seed("incremental-old-question", 3);
    const old = await prepareLocalPatchBoardReview(c, s, {}, { recovery: true });
    if (!old.ready) throw Error("Historical full question must be ready");
    expect(old.request.hides).toHaveLength(3); expect(old.request.reviewScope).toBeUndefined();
    const reply = await s.judge(old.request), budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(s.gameId);
    if (!reply.model || !reply.requestId) throw Error("Historical fixture requires an authentic synthetic receipt");
    const evidence = { ...bill(reply.requestId), model: reply.model };
    await purchaseOnce({ ledger: budget, store: new LocalPatchRetainedPurchaseStore(c, s.gameId, budget) }, {
      worldId, requestKey: old.requestKey, operationFingerprint: old.fingerprint, scope: "judge", reserveMicroUsd: 500_000,
      buy: async () => ({ bytes: Buffer.from(JSON.stringify(reply)), evidence }),
    });
    s.judge.mockClear(); const before = await budget.audit(worldId);
    expect(await review(s)).toMatchObject({ state: "done", replayed: true });
    expect(s.judge).not.toHaveBeenCalled(); expect((await budget.audit(worldId)).settledMicroUsd).toBe(before.settledMicroUsd);
    for (const row of await rows(s.gameId)) expect(JSON.parse(row.judgeJson!).boardReview.requestKey).toBe(old.requestKey);
  }, 120000);
  it("replays the selected paid question even when an omitted unapproved sibling advances", async () => {
    const s = await seed("incremental-independent-key", 3), prepared = await prepareLocalPatchBoardReview(c, s, {});
    if (!prepared.ready) throw Error("Ready appearance required");
    const reply = await s.judge(prepared.request), budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(s.gameId);
    if (!reply.model || !reply.requestId) throw Error("Independent fixture requires an authentic synthetic receipt");
    const evidence = { ...bill(reply.requestId), model: reply.model };
    await purchaseOnce({ ledger: budget, store: new LocalPatchRetainedPurchaseStore(c, s.gameId, budget) }, {
      worldId, requestKey: prepared.requestKey, operationFingerprint: prepared.fingerprint, scope: "judge", reserveMicroUsd: 300_000,
      buy: async () => ({ bytes: Buffer.from(JSON.stringify(reply)), evidence }),
    });
    const sibling = prepared.entries.find(e => e.hide.id !== prepared.request.hides[0]!.hideId)!;
    await db.targetVariantAsset.update({ where: { id: sibling.row.id }, data: { attempts: 2 } });
    const next = await prepareLocalPatchBoardReview(c, s, {}); if (!next.ready) throw Error("Selected question must remain ready");
    expect(next.requestKey).toBe(prepared.requestKey); expect(next.fingerprint).toBe(prepared.fingerprint);
    s.judge.mockClear(); expect(await review(s)).toMatchObject({ state: "pending", replayed: true });
    expect(s.judge).not.toHaveBeenCalled();
    expect((await rows(s.gameId)).find(r => r.id === sibling.row.id)?.judgeJson).toBe(sibling.row.judgeJson);
  }, 120000);
  it("backs off unreadable evidence without starving other games, then automatically buys a fresh review", async () => {
    const s = await seed("incremental-review-outage", 3);
    // Give all remaining appearances a completed status so only the malformed
    // judge response is runnable; they are never published by this fixture.
    for (const board of BOARDS.filter(b => b.board !== BOARD.board)) for (const hide of board.hides) {
      const target = await db.targetInstance.create({ data: { id: `ti-${s.gameId}-${hide.id}`, gameSceneId: `gsc-${s.gameId}-${board.board}`,
        targetId: hide.targetId, targetType: "child", slotAId: hide.id, slotBId: hide.id, status: "GENERATED" } });
      await db.targetVariantAsset.create({ data: { id: `tva-${s.gameId}-${hide.id}`, targetInstanceId: target.id,
        variant: "A", slotId: hide.id, status: "GENERATED", attempts: 1, provider: "local-patch",
        judgeJson: JSON.stringify({ compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION }) } });
      await db.gameScene.update({ where: { id: `gsc-${s.gameId}-${board.board}` }, data: { generationStatus: "GENERATED" } });
    }
    await review(s); await review(s);
    const passing = s.judge.getMockImplementation()!;
    s.judge.mockImplementation(async request => ({ ...await passing(request), raw: "{bad json" }));
    await review(s); await review(s); await review(s);
    const failed = (await rows(s.gameId)).find(r => r.status === "FAILED")!;
    const costs = (await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).settledMicroUsd;
    const noDraw = vi.fn(async () => { throw Error("A wire outage cannot authorize an image"); });
    const result = await runLocalPatchWorldSlice(c, { ...s.deps, render: noDraw }, s.gameId, { boardJudge: s.judge });
    expect(result).toMatchObject({ claimed: true, pending: true, attention: null });
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${s.gameId}` } })).toMatchObject({
      status: "QUEUED", currentStep: LOCAL_PATCH_EVIDENCE_RETRY_WAIT });
    expect(await nextPendingGame(c)).not.toBe(s.gameId);
    expect(await runLocalPatchWorldSlice(c, { ...s.deps, render: noDraw }, s.gameId, { boardJudge: s.judge }))
      .toMatchObject({ claimed: false, pending: true, attention: null });
    expect((await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).settledMicroUsd).toBe(costs);
    const old = new Date(Date.now() - LOCAL_PATCH_EVIDENCE_RETRY_BACKOFF_MS - 1000);
    const receipt = JSON.parse(failed.judgeJson!); receipt.boardReview.evidenceReviewedAt = old.toISOString();
    await db.targetVariantAsset.update({ where: { id: failed.id }, data: { judgeJson: JSON.stringify(receipt) } });
    await db.generationJob.update({ where: { id: `job_${s.gameId}` }, data: { updatedAt: old } });
    s.judge.mockImplementation(passing); s.judge.mockClear();
    // The slice's direct preparation and paid review use the newly due evidence;
    // never route the malformed row back to rendering/self-repair.
    expect(await review(s)).toMatchObject({ state: "done" });
    expect(s.judge).toHaveBeenCalledOnce(); expect(noDraw).not.toHaveBeenCalled();
    const recovered = await db.targetVariantAsset.findUniqueOrThrow({ where: { id: failed.id } });
    expect(recovered.assetId).toBe(failed.assetId); expect(recovered.attempts).toBe(failed.attempts);
    expect(JSON.parse(recovered.judgeJson!).boardReview.evidenceReviewAttempt).toBe(4);
  }, 120000);
});
