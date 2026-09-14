import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { MockPaymentProvider } from "../../../infra/payment/mock";
import { MockAvatarProvider, NoopFaceDetector } from "../../../infra/generation/mock";
import { NoPatchJudge } from "../../../infra/generation/judge";
import { NoopAnalytics } from "../../../infra/analytics/console";
import type { Container } from "../../container";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { LOCAL_PATCH_STYLE, LOCAL_PATCH_QUALITY_FAILED } from "../local-patch-world";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { runLocalPatchHide, readShippedBoardArt, type LocalPatchHideDeps } from "../local-patch-hide";
import { sha256Bytes } from "../fixed-sprite";
import { retryGeneration } from "../../admin.service";
import { sceneBySlug } from "../../scene-catalog.service";
import { resumeLocalPatchUncertainty, LOCAL_PATCH_UNCERTAINTY_RESUME_ACTION } from "../local-patch-uncertainty-resume";
import { prepareLocalPatchBoardReview, reviewLocalPatchBoard } from "../local-patch-board-review";
import { retainedPurchaseKey } from "../../../infra/db/prisma-retained-purchase-store";
import { bill, paintedCrop, paintedOk, seedApprovedGame, PASSING_ANSWER } from "./local-patch-fixtures";

const fakes = vi.hoisted(() => ({ testers: [] as string[] }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0,
  GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: fakes.testers }), flag: () => false,
  adminEmails: () => ["synthetic-admin@example.invalid"] }));
const BOARDS = localPatchBoardsForVersion(9), BOARD = BOARDS.find(b => b.board === "sydney")!, HIDE = BOARD.hides[1]!;
const ADMIN = { type: "ADMIN" as const, id: "usr-uncertainty-admin" };
const GOOD = { ...PASSING_ANSWER, faceLikeness: "pass", faceReadable: "pass", severeSeam: "pass", ageAppropriate: "pass" };
let dir: string, url: string, db: PrismaClient, c: Container, original: Buffer;
const mail = vi.fn(async () => { throw new Error("Resume must not mail"); });
const enqueue = vi.fn(async () => { throw new Error("Resume queues the durable row, not an inline provider"); });
beforeAll(async () => {
  dir = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-uncertainty-resume-")));
  url = `file:${path.join(dir, "resume.sqlite").split(path.sep).join("/")}`;
  db = new PrismaClient({ datasources: { db: { url } } }); await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), appUrl: "http://localhost:3000", secret: "synthetic-resume",
    payment: new MockPaymentProvider("http://localhost:3000", "synthetic"), avatars: new MockAvatarProvider(),
    judge: new NoPatchJudge(), faces: new NoopFaceDetector(), analytics: new NoopAnalytics(), jobs: { id: "in-process", enqueue, register() {} },
    email: { id: "console", send: mail }, adminEmails: ["synthetic-admin@example.invalid"] };
  await db.user.create({ data: { id: ADMIN.id, email: "synthetic-admin@example.invalid" } });
  const definition = sceneBySlug("sydney", 9);
  original = await readShippedBoardArt(BOARD.art, definition.art.sha256!);
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("No live network in recovery tests"); }));
}, 180000);
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(dir) === realpathSync(tmpdir()) && path.basename(dir).startsWith("findme-uncertainty-resume-")) rmSync(dir, { recursive: true, force: true });
});
const rows = (gameId: string) => db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } }, orderBy: { id: "asc" } });
const ledger = (gameId: string) => boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId));
const job = (gameId: string) => db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } });
async function seed(gameId: string, fault: "unsure" | "missing" | "wrong-id" | "model" = "unsure", withAntarctica = false) {
  const seeded = await seedApprovedGame(c, db, { gameId, approved: false, styleVersion: LOCAL_PATCH_STYLE,
    status: "TARGETS_GENERATING", withJob: true, scenes: BOARDS.map(b => ({ slug: b.board, version: 9 })) });
  fakes.testers.push(seeded.email);
  await c.storage.put(`private/photo-${gameId}.jpg`, seeded.sheet, "image/png");
  await db.childProfile.update({ where: { id: `chl-${gameId}` }, data: { ageYears: 5 } });
  const { sha256: catalogSha256 } = await readBoardConditionedCatalog();
  await reviewBoardWizardIdentity({ db, apiKey: "synthetic", budget: boardWizardBudgetOf(c), beforeDispatch: async () => {},
    write: work => db.$transaction(work), reviewer: { review: async () => ({ httpOk: true, requestId: `req-${gameId}-identity`,
      body: { model: "gpt-5.6-luna", usage: { prompt_tokens: 1500, completion_tokens: 150 }, choices: [{ finish_reason: "stop", message: {
        content: JSON.stringify({ checks: { identity: "pass", age: "pass", paintedStyle: "pass", sheetLayout: "pass" }, reason: "Synthetic age-five canonical identity" }) } }] } }) } },
  { gameId, identityAssetId: `ast-sheet-${gameId}`, sheet: seeded.sheet, photo: seeded.sheet, atlas: seeded.sheet, contentVersion: 9,
    provenance: { promptVersion: "character-v4-board-drawn-face-reference", quality: "medium", photoAssetId: `ast-photo-${gameId}`,
      photoSha256: sha256Bytes(seeded.sheet), ageYears: 5, crop: null,
      style: { version: "board-matched-identity/v2", catalogSha256, atlasSha256: sha256Bytes(seeded.sheet) } } });
  await db.game.update({ where: { id: gameId }, data: { paidAt: new Date() } });
  await db.order.create({ data: { id: `ord-${gameId}`, gameId, userId: seeded.userId, amountAgorot: 100,
    packageTier: "ONE_WORLD", provider: "mock", paymentStatus: "PAID", paidAt: new Date() } });
  const render = vi.fn<LocalPatchHideDeps["render"]>(async ({ requestKey, stylePng }) => {
    const hide = BOARDS.flatMap(b => b.hides).find(h => requestKey.startsWith(`${h.id}:`)); if (!hide) throw new Error(`Unexpected board ${requestKey}`);
    return paintedOk(await paintedCrop(stylePng, hide), bill(`req-${gameId}-${requestKey}`));
  });
  const deps: LocalPatchHideDeps = { renderPolicySha256: "a".repeat(64), readBoardArt: async () => original, render,
    judge: async () => { throw new Error("No per-hide review"); } };
  for (const hide of BOARD.hides) expect(await runLocalPatchHide(c, deps, { gameId, board: BOARD, hide })).toMatchObject({ state: "generated", attempt: 1 });
  if (withAntarctica) {
    const antarctica = BOARDS.find(b => b.board === "antarctica")!;
    for (const hide of antarctica.hides.slice(0, 4)) expect(await runLocalPatchHide(c, { ...deps, readBoardArt: readShippedBoardArt },
      { gameId, board: antarctica, hide })).toMatchObject({ state: "generated", attempt: 1 });
  }
  const sceneId = `gsc-${gameId}-sydney`;
  const prepared = await prepareLocalPatchBoardReview(c, { gameId, sceneId }, {}); if (!prepared.ready) throw new Error("fixture not ready");
  const judge = vi.fn(async () => ({ verdict: null, verdicts: {}, raw: JSON.stringify({ hides: BOARD.hides.map(h => ({ hideId: h.id,
    evidenceIds: [h.id + ":before", (fault === "wrong-id" && h.id === HIDE.id ? BOARD.hides[0]!.id : h.id) + ":after"],
    verdict: h.id === HIDE.id ? { ...GOOD, faceLikeness: "unsure", faceReadable: "unsure", ageAppropriate: "unsure", verdict: "unsure",
      ...(fault === "missing" ? { faceLikeness: undefined } : {}), reason: "The face and apparent age cannot be judged confidently" } : GOOD })) }),
    model: fault === "model" ? "gpt-5.6-sol" : "gpt-5.6-luna", requestId: `req-${gameId}-review`,
    usage: { prompt_tokens: 9000, completion_tokens: 1300 }, finishReason: "stop", wireFault: null, costUnknown: false }));
  await reviewLocalPatchBoard(c, { gameId, sceneId }, { fence: async () => {}, judge });
  const row = (await rows(gameId)).find(r => JSON.parse(r.judgeJson!).hide === HIDE.id)!;
  // V5 originally classified this exact paid uncertainty as terminal. Only the
  // historical policy metadata differs; raw, normalized grade and key do not.
  await db.targetVariantAsset.update({ where: { id: row.id }, data: { status: "FAILED", lastError: "quality-unresolved: faceLikeness; faceReadable; ageAppropriate",
    judgeJson: JSON.stringify({ ...JSON.parse(row.judgeJson!), qualityDisposition: { state: "unresolved", faults: ["faceLikeness", "faceReadable", "ageAppropriate"] } }) } });
  await db.game.update({ where: { id: gameId }, data: { status: "GENERATION_FAILED", lastError: "Required quality evidence unresolved" } });
  await db.generationJob.update({ where: { id: `job_${gameId}` }, data: { status: "DONE", currentStep: LOCAL_PATCH_QUALITY_FAILED } });
  render.mockClear(); judge.mockClear();
  return { ...seeded, row: await db.targetVariantAsset.findUniqueOrThrow({ where: { id: row.id } }), sceneId, prepared, render, judge, deps };
}

describe("existing admin Retry resumes only authenticated paid v9 uncertainty", () => {
  it("reconstructs the same key/fingerprint for FAILED rows, queues once for free, and preserves every raw grade and image", async () => {
    const s = await seed("uncertain-resume", "unsure", true);
    const antarctica = BOARDS.find(b => b.board === "antarctica")!, waiting = antarctica.hides[4]!;
    const pendingTarget = await db.targetInstance.create({ data: { id: "tar-unpaid-antarctica5", gameSceneId: `gsc-${s.gameId}-antarctica`, targetId: waiting.targetId,
      targetType: "child", spriteKind: "image", slotAId: "a", slotBId: "b", status: "PENDING" } });
    const pending = await db.targetVariantAsset.create({ data: { id: "var-unpaid-antarctica5", targetInstanceId: pendingTarget.id, variant: "A", slotId: "a",
      provider: "local-patch", status: "PENDING", attempts: 1 } });
    const before = await rows(s.gameId), cost = await ledger(s.gameId);
    expect(before).toHaveLength(10); // Five reviewed Sydney, four painted Antarctica, one prepared/unpaid Antarctica.
    const prepared = await prepareLocalPatchBoardReview(c, { gameId: s.gameId, sceneId: s.sceneId }, {}, { recovery: true });
    expect(prepared).toMatchObject({ ready: true, fingerprint: s.prepared.fingerprint, requestKey: s.prepared.requestKey });
    await retryGeneration(c, s.gameId, ADMIN);
    const after = await rows(s.gameId), changed = after.find(r => r.id === s.row.id)!;
    expect(changed).toMatchObject({ status: "FAILED", attempts: 1, assetId: s.row.assetId, judgeJson: s.row.judgeJson,
      lastError: "quality-retry: faceLikeness; faceReadable; ageAppropriate" });
    expect(after.filter(r => r.id !== s.row.id)).toEqual(before.filter(r => r.id !== s.row.id));
    expect(await db.targetVariantAsset.findUniqueOrThrow({ where: { id: pending.id } })).toEqual(pending);
    expect(await boardWizardBudgetOf(c).readRequest(boardWizardWorldId(s.gameId), `${waiting.id}:${waiting.pose}:render:1`)).toBeNull();
    expect(await job(s.gameId)).toMatchObject({ status: "QUEUED", currentStep: "local-patch", attempts: 0 });
    expect(await db.game.findUniqueOrThrow({ where: { id: s.gameId } })).toMatchObject({ status: "TARGETS_GENERATING", configJson: null, readyAt: null });
    const saved = await job(s.gameId); await retryGeneration(c, s.gameId, ADMIN);
    expect(await job(s.gameId)).toEqual(saved); expect((await ledger(s.gameId)).committedMicroUsd).toBe(cost.committedMicroUsd);
    const audit = await db.auditLog.findFirstOrThrow({ where: { entityId: s.gameId, action: LOCAL_PATCH_UNCERTAINTY_RESUME_ACTION } });
    expect(JSON.parse(audit.metaJson!)).toMatchObject({ approvalGranted: false, requestedBy: ADMIN.id,
      changes: [{ rowId: s.row.id, oldJudgeJson: s.row.judgeJson, requestKey: s.prepared.requestKey, fingerprint: s.prepared.fingerprint }] });
    expect(s.render).not.toHaveBeenCalled(); expect(s.judge).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); expect(enqueue).not.toHaveBeenCalled(); expect(mail).not.toHaveBeenCalled();
    expect(await runLocalPatchHide(c, s.deps, { gameId: s.gameId, board: BOARD, hide: HIDE })).toMatchObject({ state: "generated", attempt: 2 });
    expect(s.render).toHaveBeenCalledTimes(1);
    expect(s.render.mock.calls[0]![0].requestKey).toBe(`${HIDE.id}:${HIDE.pose}:render:2`);
    expect(s.render.mock.calls[0]![0].prompt).toContain("FACE LIKENESS REPAIR");
    expect(s.render.mock.calls[0]![0].prompt).toContain("FACE READABILITY REPAIR");
    expect(s.render.mock.calls[0]![0].prompt).toContain("AGE AND BODY REPAIR");
    expect((await ledger(s.gameId)).committedMicroUsd).toBe(cost.committedMicroUsd + 48800);
  }, 120000);

  it.each(["missing", "wrong-id", "model"] as const)("refuses %s evidence with no metadata, queue or budget edits", async fault => {
    const s = await seed(`uncertain-${fault}`, fault), before = await rows(s.gameId), originalJob = await job(s.gameId), cost = await ledger(s.gameId);
    await expect(retryGeneration(c, s.gameId, ADMIN)).rejects.toThrow();
    expect(await rows(s.gameId)).toEqual(before); expect(await job(s.gameId)).toEqual(originalJob);
    expect((await ledger(s.gameId)).committedMicroUsd).toBe(cost.committedMicroUsd);
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_UNCERTAINTY_RESUME_ACTION } })).toBe(0);
  }, 120000);

  it("fails closed for stale pixels/geometry/age, unauthorized admin, active job, max3 and refunded order", async () => {
    const s = await seed("uncertain-guards"), originalJob = await job(s.gameId);
    await expect(retryGeneration(c, s.gameId, { type: "ADMIN", id: s.userId })).rejects.toThrow("administrator");
    await db.generationJob.update({ where: { id: originalJob.id }, data: { status: "RUNNING" } });
    await expect(resumeLocalPatchUncertainty(c, s.gameId, ADMIN)).rejects.toThrow("terminal and inactive");
    await db.generationJob.update({ where: { id: originalJob.id }, data: { status: "DONE" } });
    await db.targetVariantAsset.update({ where: { id: s.row.id }, data: { attempts: 3 } });
    await expect(retryGeneration(c, s.gameId, ADMIN)).rejects.toThrow("exhausted");
    await db.targetVariantAsset.update({ where: { id: s.row.id }, data: { attempts: 1, headAnchorJson: "[0,0]" } });
    await expect(retryGeneration(c, s.gameId, ADMIN)).rejects.toThrow("geometry");
    await db.targetVariantAsset.update({ where: { id: s.row.id }, data: { headAnchorJson: s.row.headAnchorJson } });
    const asset = await db.asset.findUniqueOrThrow({ where: { id: s.row.assetId! } }), pixels = await c.storage.get(asset.storagePath);
    await c.storage.put(asset.storagePath, Buffer.from("synthetic bad pixels"), "image/png");
    await expect(retryGeneration(c, s.gameId, ADMIN)).rejects.toThrow("Shipping image");
    await c.storage.put(asset.storagePath, pixels, "image/png");
    await db.childProfile.update({ where: { id: `chl-${s.gameId}` }, data: { ageYears: 8 } });
    await expect(retryGeneration(c, s.gameId, ADMIN)).rejects.toThrow();
    await db.childProfile.update({ where: { id: `chl-${s.gameId}` }, data: { ageYears: 5 } });
    await db.order.update({ where: { id: `ord-${s.gameId}` }, data: { refundedAt: new Date(), paymentStatus: "REFUNDED" } });
    await expect(retryGeneration(c, s.gameId, ADMIN)).rejects.toThrow("nonrefunded");
    await db.order.update({ where: { id: `ord-${s.gameId}` }, data: { refundedAt: null, paymentStatus: "PAID" } });
    await expect(resumeLocalPatchUncertainty(c, s.gameId, ADMIN, { readBoardArt: async () => {
      await db.order.update({ where: { id: `ord-${s.gameId}` }, data: { refundedAt: new Date(), paymentStatus: "REFUNDED" } });
      return original;
    } })).rejects.toThrow("nonrefunded");
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_UNCERTAINTY_RESUME_ACTION } })).toBe(0);
    expect(s.render).not.toHaveBeenCalled(); expect(s.judge).not.toHaveBeenCalled();
  }, 120000);

  it("refuses altered original art, missing retained paid evidence and pending charges", async () => {
    const s = await seed("uncertain-paid"), originalJob = await job(s.gameId), before = await rows(s.gameId);
    await expect(resumeLocalPatchUncertainty(c, s.gameId, ADMIN, { readBoardArt: async () => paintedCrop(original, HIDE) })).rejects.toThrow("fingerprint");
    const key = retainedPurchaseKey(boardWizardWorldId(s.gameId), s.prepared.requestKey), blob = await db.fileBlob.findUniqueOrThrow({ where: { key } });
    await db.fileBlob.delete({ where: { key } });
    await expect(retryGeneration(c, s.gameId, ADMIN)).rejects.toThrow("fingerprint");
    await db.fileBlob.create({ data: blob });
    await boardWizardBudgetOf(c).reserve(boardWizardWorldId(s.gameId), { requestKey: "synthetic-pending", scope: "judge", operationFingerprint: "f".repeat(64), reserveMicroUsd: 10 });
    await expect(retryGeneration(c, s.gameId, ADMIN)).rejects.toThrow("ledger must be settled");
    expect(await rows(s.gameId)).toEqual(before); expect(await job(s.gameId)).toEqual(originalJob);
  }, 120000);
});
