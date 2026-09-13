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
import { InlineJobRunner } from "../../../infra/jobs/inline";
import type { Container } from "../../container";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { runLocalPatchWorldSlice, LOCAL_PATCH_STYLE, LOCAL_PATCH_QUALITY_FAILED, LOCAL_PATCH_NEEDS_RELEASE } from "../local-patch-world";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { runLocalPatchHide, type LocalPatchHideDeps } from "../local-patch-hide";
import { sha256Bytes } from "../fixed-sprite";
import { readLocalPatchQualityPilot, runLocalPatchQualityPilot, resumeLocalPatchAfterQualityPilot, stageLocalPatchQualityPilot, LOCAL_PATCH_QUALITY_PILOT_ACTION } from "../local-patch-quality-pilot";
import { bill, boardPng, paintedCrop, paintedOk, seedApprovedGame } from "./local-patch-fixtures";

const fakes = vi.hoisted(() => ({ testers: [] as string[] }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0,
  GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: fakes.testers }), flag: () => false,
  adminEmails: () => ["synthetic-admin@example.invalid"] }));
const BOARDS = localPatchBoardsForVersion(9), BOARD = BOARDS.find(b => b.board === "sydney")!, HIDE = BOARD.hides[0]!;
let dir: string, url: string, db: PrismaClient, c: Container, original: Buffer;
const mail = vi.fn(async () => { throw new Error("The pilot must not send mail"); });
beforeAll(async () => {
  dir = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-quality-pilot-")));
  url = `file:${path.join(dir, "pilot.sqlite").split(path.sep).join("/")}`;
  db = new PrismaClient({ datasources: { db: { url } } }); await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), appUrl: "http://localhost:3000", secret: "synthetic-pilot",
    payment: new MockPaymentProvider("http://localhost:3000", "synthetic"), avatars: new MockAvatarProvider(),
    judge: new NoPatchJudge(), faces: new NoopFaceDetector(), analytics: new NoopAnalytics(), jobs: new InlineJobRunner(),
    email: { id: "console", send: mail }, adminEmails: ["synthetic-admin@example.invalid"] };
  await db.user.create({ data: { id: "usr-pilot-admin", email: "synthetic-admin@example.invalid" } });
  original = await boardPng();
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("No live network in pilot tests"); }));
}, 180000);
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(dir) === realpathSync(tmpdir()) && path.basename(dir).startsWith("findme-quality-pilot-")) rmSync(dir, { recursive: true, force: true });
});
const rows = (gameId: string) => db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } }, orderBy: { id: "asc" } });
const ledger = (gameId: string) => boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId));
const job = (gameId: string) => db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } });
const stageReason = "SYSTEM visual inspection: the current face differs from the canonical portrait.";
const resumeReason = "Inspected retained pilot candidate; request fresh labeled review, not approval.";

async function seed(gameId: string, count = 2) {
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
    const hide = BOARD.hides.find(h => requestKey.startsWith(`${h.id}:`));
    if (!hide) throw new Error(`Pilot dispatched an unselected board: ${requestKey}`);
    return paintedOk(await paintedCrop(stylePng, hide), bill(`req-${gameId}-${requestKey}`));
  });
  const judge = vi.fn(async () => { throw new Error("Pilot must not judge"); });
  const deps: LocalPatchHideDeps = { renderPolicySha256: "a".repeat(64), readBoardArt: async () => original, render, judge };
  for (const hide of BOARD.hides.slice(0, count)) expect(await runLocalPatchHide(c, deps, { gameId, board: BOARD, hide })).toMatchObject({ state: "generated", attempt: 1 });
  const all = await rows(gameId), row = all.find(r => JSON.parse(r.judgeJson!).hide === HIDE.id)!;
  const asset = await db.asset.findUniqueOrThrow({ where: { id: row.assetId! } });
  const input = { gameId, hideId: HIDE.id, expectedAssetId: asset.id, expectedSha256: sha256Bytes(await c.storage.get(asset.storagePath)),
    operatorId: "usr-pilot-admin", reason: stageReason };
  await db.game.update({ where: { id: gameId }, data: { status: "GENERATION_FAILED", lastError: "Required quality evidence unresolved" } });
  await db.generationJob.update({ where: { id: `job_${gameId}` }, data: { status: "DONE", currentStep: LOCAL_PATCH_QUALITY_FAILED } });
  render.mockClear();
  return { ...seeded, row, input, deps, render, judge };
}

describe("durable one-hide v9 quality pilot, real SQLite + retained purchases + queue", () => {
  it("stages for free, buys only the selected next image with the named concern, then parks across fresh clients", async () => {
    const s = await seed("pilot-one"); const before = await ledger(s.gameId), oldRows = await rows(s.gameId);
    const staged = await stageLocalPatchQualityPilot(c, s.input);
    expect(staged.authorizedAttempt).toBe(2);
    expect(await stageLocalPatchQualityPilot(c, s.input)).toEqual(staged);
    expect((await ledger(s.gameId)).committedMicroUsd).toBe(before.committedMicroUsd);
    expect(await db.targetVariantAsset.findUniqueOrThrow({ where: { id: s.row.id } })).toMatchObject({ attempts: 1, judgeJson: s.row.judgeJson, status: "FAILED" });
    const boardJudge = vi.fn(async () => { throw new Error("No review before explicit resume"); });
    expect(await runLocalPatchWorldSlice(c, s.deps, s.gameId, { maxHides: 45, boardJudge })).toMatchObject({ pending: false, claimed: true });
    expect(s.render).toHaveBeenCalledTimes(1);
    expect(s.render.mock.calls[0]![0]).toMatchObject({ requestKey: `${HIDE.id}:${HIDE.pose}:render:2`, referenceMode: "canonical-portrait-only/v1" });
    expect(s.render.mock.calls[0]![0].prompt).toContain("FACE LIKENESS REPAIR");
    const plan = await readLocalPatchQualityPilot(c, s.gameId);
    expect(plan).toMatchObject({ pilotId: staged.pilotId, state: "candidate", authorizedAttempt: 2, previousJudgeJson: s.row.judgeJson,
      reviewer: "codex-visual-inspection", concern: "faceLikeness" });
    expect(await job(s.gameId)).toMatchObject({ status: "FAILED", currentStep: LOCAL_PATCH_NEEDS_RELEASE });
    expect((await rows(s.gameId)).filter(r => r.id !== s.row.id)).toEqual(oldRows.filter(r => r.id !== s.row.id));
    const fresh = new PrismaClient({ datasources: { db: { url } } });
    try { for (let n = 0; n < 3; n++) expect(await runLocalPatchWorldSlice({ ...c, db: fresh, storage: new DbStorage(fresh) }, s.deps, s.gameId, { boardJudge })).toMatchObject({ pending: false, claimed: false }); }
    finally { await fresh.$disconnect(); }
    expect(s.render).toHaveBeenCalledTimes(1); expect(boardJudge).not.toHaveBeenCalled(); expect(s.judge).not.toHaveBeenCalled(); expect(mail).not.toHaveBeenCalled();
    expect((await ledger(s.gameId)).committedMicroUsd).toBe(before.committedMicroUsd + 48800);
    expect(await db.game.findUniqueOrThrow({ where: { id: s.gameId } })).toMatchObject({ status: "TARGETS_GENERATING", configJson: null, readyAt: null });
    expect(fetch).not.toHaveBeenCalled();
  }, 120000);

  it("lost parking acknowledgement reuses the concluded attempt and never buys attempt3", async () => {
    const s = await seed("pilot-lost-park", 1); await stageLocalPatchQualityPilot(c, s.input);
    await expect(runLocalPatchQualityPilot(c, s.gameId, { ...s.deps, fence: async tx => {
      const current = await tx.targetVariantAsset.findUniqueOrThrow({ where: { id: s.row.id } });
      if (current.status === "GENERATED" && current.attempts === 2) throw new Error("synthetic worker interruption before parking");
    } })).rejects.toThrow("interruption before parking");
    expect((await rows(s.gameId))[0]).toMatchObject({ status: "GENERATED", attempts: 2 });
    expect((await readLocalPatchQualityPilot(c, s.gameId))?.state).toBe("queued");
    const cost = await ledger(s.gameId);
    expect(await runLocalPatchWorldSlice(c, s.deps, s.gameId)).toMatchObject({ pending: false });
    expect((await readLocalPatchQualityPilot(c, s.gameId))?.state).toBe("candidate");
    expect(s.render).toHaveBeenCalledTimes(1); expect((await ledger(s.gameId)).committedMicroUsd).toBe(cost.committedMicroUsd);
  }, 120000);

  it("deadline deferral keeps the same authorized attempt and buys it once on the next tick", async () => {
    const s = await seed("pilot-deferred", 1); await stageLocalPatchQualityPilot(c, s.input);
    const before = await ledger(s.gameId), start = Date.now(); let now = start;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    try {
      expect(await runLocalPatchWorldSlice(c, { ...s.deps, readBoardArt: async () => { now += 100000; return original; } },
        s.gameId, { hardDeadlineAt: start + 270000 })).toMatchObject({ pending: true });
      expect((await rows(s.gameId))[0]).toMatchObject({ status: "PENDING", attempts: 2 });
      expect(s.render).not.toHaveBeenCalled();
      expect((await ledger(s.gameId)).committedMicroUsd).toBe(before.committedMicroUsd);
      now += 600000;
      expect(await runLocalPatchWorldSlice(c, s.deps, s.gameId, { hardDeadlineAt: now + 270000 })).toMatchObject({ pending: false });
      expect((await rows(s.gameId))[0]).toMatchObject({ status: "GENERATED", attempts: 2 });
      expect((await readLocalPatchQualityPilot(c, s.gameId))?.state).toBe("candidate");
      expect(s.render).toHaveBeenCalledTimes(1);
      expect((await ledger(s.gameId)).committedMicroUsd).toBe(before.committedMicroUsd + 48800);
    } finally { clock.mockRestore(); }
  }, 120000);

  it("rejects tampered pixels and geometry before staging and preserves a changed sibling by parking without dispatch", async () => {
    const s = await seed("pilot-bindings"), asset = await db.asset.findUniqueOrThrow({ where: { id: s.row.assetId! } });
    const bytes = await c.storage.get(asset.storagePath);
    await c.storage.put(asset.storagePath, Buffer.from("corrupt synthetic bytes"), "image/png");
    await expect(stageLocalPatchQualityPilot(c, s.input)).rejects.toThrow("pixels/geometry");
    await c.storage.put(asset.storagePath, bytes, "image/png");
    await db.targetVariantAsset.update({ where: { id: s.row.id }, data: { headAnchorJson: "[0,0]" } });
    await expect(stageLocalPatchQualityPilot(c, s.input)).rejects.toThrow("pixels/geometry");
    await db.targetVariantAsset.update({ where: { id: s.row.id }, data: { headAnchorJson: s.row.headAnchorJson } });
    await stageLocalPatchQualityPilot(c, s.input);
    const other = (await rows(s.gameId)).find(r => r.id !== s.row.id)!;
    await db.targetVariantAsset.update({ where: { id: other.id }, data: { lastError: "An independent changed row" } });
    const changed = await rows(s.gameId);
    expect(await runLocalPatchWorldSlice(c, s.deps, s.gameId)).toMatchObject({ pending: false, attention: expect.stringContaining("unselected appearance changed") });
    expect(s.render).not.toHaveBeenCalled(); expect(await rows(s.gameId)).toEqual(changed);
  }, 120000);

  it("explicit resume preserves old grades and costs while requeuing only pixel-bound historical grouped failures", async () => {
    const s = await seed("pilot-resume", 5);
    const all = await rows(s.gameId), sibling = all.find(r => JSON.parse(r.judgeJson!).hide === BOARD.hides[4]!.id)!;
    const retry = all.find(r => JSON.parse(r.judgeJson!).hide === BOARD.hides[3]!.id)!;
    const bad = all.find(r => JSON.parse(r.judgeJson!).hide === BOARD.hides[2]!.id)!;
    // Historical paid-review fixture: current immutable shipping pixels, old unlabeled v4 result.
    for (const [r, error] of [[sibling, "quality-unresolved: missing image evidence"], [retry, "quality-retry: faceReadable"]] as const) {
      await db.targetVariantAsset.update({ where: { id: r.id }, data: { status: "FAILED", lastError: error,
        judgeJson: JSON.stringify({ ...JSON.parse(r.judgeJson!), reviewState: "board-review-complete", verdict: { faceReadable: "unsure" },
          boardReview: { version: "local-patch-board-five-quality/v4-parent-confirmed-age", requestKey: "board:sydney:historical-unlabeled-v4" } }) } });
    }
    await db.targetVariantAsset.update({ where: { id: bad.id }, data: { status: "FAILED", lastError: "the painter returned nothing usable (schema)",
      judgeJson: JSON.stringify({ renderFault: "schema" }) } });
    const prior = await rows(s.gameId), staged = await stageLocalPatchQualityPilot(c, s.input);
    await runLocalPatchWorldSlice(c, s.deps, s.gameId);
    const plan = (await readLocalPatchQualityPilot(c, s.gameId))!, cost = await ledger(s.gameId);
    const resume = { gameId: s.gameId, pilotId: staged.pilotId, expectedCandidateSha256: plan.candidateSha256!, operatorId: s.input.operatorId, reason: resumeReason };
    await expect(resumeLocalPatchAfterQualityPilot(c, { ...resume, expectedCandidateSha256: "f".repeat(64) })).rejects.toThrow("Exact inspected");
    const result = await resumeLocalPatchAfterQualityPilot(c, resume);
    expect(result.requeuedHideIds.sort()).toEqual([BOARD.hides[3]!.id, BOARD.hides[4]!.id].sort());
    const after = await rows(s.gameId);
    for (const r of [sibling, retry]) {
      const current = after.find(x => x.id === r.id)!;
      expect(current).toMatchObject({ assetId: r.assetId, attempts: 1, status: "GENERATED" });
      expect(JSON.parse(current.judgeJson!).reviewState).toBe("pending-board-review");
      const old = prior.find(x => x.id === r.id)!;
      const audit = await db.auditLog.findFirstOrThrow({ where: { action: `${LOCAL_PATCH_QUALITY_PILOT_ACTION}:review-requeued`, metaJson: { contains: r.id } } });
      expect(JSON.parse(audit.metaJson!)).toMatchObject({ previousJudgeJson: old.judgeJson, approvalGranted: false });
    }
    expect(after.find(x => x.id === bad.id)).toEqual(prior.find(x => x.id === bad.id));
    expect(await job(s.gameId)).toMatchObject({ status: "QUEUED", currentStep: "local-patch" });
    const firstJob = await job(s.gameId);
    expect(await resumeLocalPatchAfterQualityPilot(c, resume)).toMatchObject({ requeuedHideIds: [] });
    expect(await job(s.gameId)).toEqual(firstJob);
    expect((await ledger(s.gameId)).committedMicroUsd).toBe(cost.committedMicroUsd);
    expect(s.render).toHaveBeenCalledTimes(1); expect(s.judge).not.toHaveBeenCalled();
  }, 120000);

  it("rejects unauthorized, stale, exhausted, changed-age, refunded and unsettled staging without edits or purchases", async () => {
    const s = await seed("pilot-guards", 1), baseline = await rows(s.gameId), baseCost = await ledger(s.gameId);
    for (const altered of [{ operatorId: s.userId }, { expectedSha256: "e".repeat(64) }, { expectedAssetId: "ast-unrelated" }]) {
      await expect(stageLocalPatchQualityPilot(c, { ...s.input, ...altered })).rejects.toThrow();
      expect(await rows(s.gameId)).toEqual(baseline); expect(await readLocalPatchQualityPilot(c, s.gameId)).toBeNull();
    }
    await db.targetVariantAsset.update({ where: { id: s.row.id }, data: { attempts: 3 } });
    await expect(stageLocalPatchQualityPilot(c, s.input)).rejects.toThrow("remaining concluded");
    await db.targetVariantAsset.update({ where: { id: s.row.id }, data: { attempts: 1 } });
    await db.childProfile.update({ where: { id: `chl-${s.gameId}` }, data: { ageYears: 8 } });
    await expect(stageLocalPatchQualityPilot(c, s.input)).rejects.toThrow();
    await db.childProfile.update({ where: { id: `chl-${s.gameId}` }, data: { ageYears: 5 } });
    await db.order.update({ where: { id: `ord-${s.gameId}` }, data: { paymentStatus: "REFUNDED", refundedAt: new Date() } });
    await expect(stageLocalPatchQualityPilot(c, s.input)).rejects.toThrow("nonrefunded");
    await db.order.update({ where: { id: `ord-${s.gameId}` }, data: { paymentStatus: "PAID", refundedAt: null } });
    const budget = boardWizardBudgetOf(c), world = boardWizardWorldId(s.gameId);
    await budget.reserve(world, { requestKey: "synthetic-pending", scope: "image", operationFingerprint: "c".repeat(64), reserveMicroUsd: 100 });
    await expect(stageLocalPatchQualityPilot(c, s.input)).rejects.toThrow("ledger must be settled");
    expect(await readLocalPatchQualityPilot(c, s.gameId)).toBeNull(); expect(s.render).not.toHaveBeenCalled();
    expect((await ledger(s.gameId)).settledMicroUsd).toBe(baseCost.settledMicroUsd);
  }, 120000);

  it("a refused authorized image parks without ever consuming another attempt", async () => {
    const s = await seed("pilot-refused", 1); await stageLocalPatchQualityPilot(c, s.input);
    s.render.mockImplementation(async ({ requestKey }) => ({ png: null, rejected: "synthetic unusable provider image", quarantined: null,
      evidence: bill(`req-${s.gameId}-${requestKey}`), unknownReason: null }));
    expect(await runLocalPatchWorldSlice(c, s.deps, s.gameId)).toMatchObject({ pending: false });
    expect((await readLocalPatchQualityPilot(c, s.gameId))?.state).toBe("rejected");
    expect((await rows(s.gameId))[0]).toMatchObject({ status: "FAILED", attempts: 2 });
    for (let n = 0; n < 2; n++) await runLocalPatchWorldSlice(c, s.deps, s.gameId);
    expect(s.render).toHaveBeenCalledTimes(1);
  }, 120000);
});
