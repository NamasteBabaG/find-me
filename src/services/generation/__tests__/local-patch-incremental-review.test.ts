import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import type { Container } from "../../container";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { prepareLocalPatchBoardReview, reviewLocalPatchBoard } from "../local-patch-board-review";
import { localPatchBoardJudgeImages, localPatchHideEvidenceIds, type LocalPatchBoardJudgeRequest } from "../local-patch-judge";
import { runLocalPatchHide, type LocalPatchHideDeps } from "../local-patch-hide";
import { LOCAL_PATCH_PUBLICATION_ACTION } from "../local-patch-publication-policy";
import { localPatchPrivateInventory } from "../local-patch-world";
import { runLocalPatchWorldSlice, LOCAL_PATCH_EVIDENCE_RETRY_WAIT } from "../local-patch-world";
import { nextPendingGame } from "../queue";
import { LOCAL_PATCH_EVIDENCE_RETRY_BACKOFF_MS } from "../local-patch-review-recovery";
import { LOCAL_PATCH_COMPOSITION_VERSION } from "../local-patch-seam";
import { retainedPurchaseKey } from "../../../infra/db/prisma-retained-purchase-store";
import { LocalPatchRetainedPurchaseStore } from "../local-patch-lifecycle";
import { purchaseOnce } from "../paid-operation";
import { sha256Bytes } from "../fixed-sprite";
import { bill, paintedCrop, paintedOk, seedApprovedGame, PASSING_ANSWER } from "./local-patch-fixtures";

const BOARDS = localPatchBoardsForVersion(12), BOARD = BOARDS.find(b => b.board === "giza")!;
const testers: string[] = [];
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0,
  GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers }), flag: () => false }));
let directory: string, db: PrismaClient, c: Container;
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
  const judge = vi.fn(async (request: LocalPatchBoardJudgeRequest) => ({ verdict: null, verdicts: {},
    raw: JSON.stringify({ hides: request.hides.map(h => ({ hideId: h.hideId, evidenceIds: localPatchHideEvidenceIds(h.hideId), verdict: good })) }),
    model: "gpt-5.6-sol", requestId: `judge-${gameId}-${++number}`, usage: { prompt_tokens: 1000, completion_tokens: 400 },
    finishReason: "stop", wireFault: null, costUnknown: false }));
  return { gameId, sceneId: `gsc-${gameId}-${BOARD.board}`, judge, render, deps };
}
const review = (s: Awaited<ReturnType<typeof seed>>) => reviewLocalPatchBoard(c, s, { fence: async () => {}, judge: s.judge });
const rows = (gameId: string) => db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } }, orderBy: { id: "asc" } });

describe("v12 ready appearances have independent paid review and publication bindings", () => {
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
    await purchaseOnce({ ledger: budget, store: new LocalPatchRetainedPurchaseStore(c, s.gameId, budget) }, {
      worldId, requestKey: old.requestKey, operationFingerprint: old.fingerprint, scope: "judge", reserveMicroUsd: 500_000,
      buy: async () => ({ bytes: Buffer.from(JSON.stringify(reply)), evidence: { ...bill(reply.requestId), model: reply.model } }),
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
    await purchaseOnce({ ledger: budget, store: new LocalPatchRetainedPurchaseStore(c, s.gameId, budget) }, {
      worldId, requestKey: prepared.requestKey, operationFingerprint: prepared.fingerprint, scope: "judge", reserveMicroUsd: 300_000,
      buy: async () => ({ bytes: Buffer.from(JSON.stringify(reply)), evidence: { ...bill(reply.requestId), model: reply.model } }),
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
