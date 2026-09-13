import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { MockPaymentProvider } from "../../../infra/payment/mock";
import { MockAvatarProvider, NoopFaceDetector } from "../../../infra/generation/mock";
import { NoPatchJudge } from "../../../infra/generation/judge";
import { NoopAnalytics } from "../../../infra/analytics/console";
import { InlineJobRunner } from "../../../infra/jobs/inline";
import { retainedPurchaseKey } from "../../../infra/db/prisma-retained-purchase-store";
import { avatarDisplayFromSheet } from "../../../infra/generation/avatar-cut";
import type { EmailMessage } from "../../../infra/email/types";
import type { Container } from "../../container";
import { GameConfigSchema } from "../../../domain/game/config";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { cropOf, maskForHide } from "../../../domain/scene/local-patch-hides";
import { sceneBySlug } from "../../scene-catalog.service";
import { runLocalPatchWorldSlice, LOCAL_PATCH_STYLE, LOCAL_PATCH_QUALITY_FAILED, localPatchPrivateInventory } from "../local-patch-world";
import { stageLocalPatchPaidRepair, readLocalPatchPaidRepair, runLocalPatchPaidRepair } from "../local-patch-paid-repair";
import { recomputePaidPatchJoin } from "../local-patch-repair-compose";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { LOCAL_PATCH_PROVIDER, LOCAL_PATCH_VARIANT, type LocalPatchHideDeps } from "../local-patch-hide";
import { LOCAL_PATCH_COMPOSITION_VERSION, LOCAL_PATCH_RETURN_GUARD } from "../local-patch-seam";
import { LOCAL_PATCH_RESERVE, RETAINED_RENDER_VERSION } from "../local-patch-render";
import { recordLocalPatchPublicationPolicy, hasLocalPatchPublicationPolicy, localPatchPublicationGeometryHash } from "../local-patch-publication-policy";
import { LocalPatchRetainedPurchaseStore } from "../local-patch-lifecycle";
import { purchaseOnce } from "../paid-operation";
import { sha256Bytes } from "../fixed-sprite";
import { bill, boardPng, PASSING_ANSWER, seedApprovedGame } from "./local-patch-fixtures";

const state = vi.hoisted(() => ({ testers: [] as string[], original: Buffer.alloc(0) }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0,
  GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: state.testers }), flag: () => false,
  adminEmails: () => ["synthetic-admin@example.invalid"] }));
vi.mock("../local-patch-hide", async original => ({ ...await original<typeof import("../local-patch-hide")>(),
  readShippedBoardArt: async () => Buffer.from(state.original) }));
const BOARDS = localPatchBoardsForVersion(8);
const SELECTED = [BOARDS.find(b => b.board === "tokyo")!.hides[2]!, BOARDS.find(b => b.board === "greatwall")!.hides[4]!];
const UNREVIEWED = BOARDS.find(b => b.board === "greatwall")!.hides.slice(0, 4).map(h => h.id);
const GOOD = { ...PASSING_ANSWER, faceLikeness: "pass", faceReadable: "pass", severeSeam: "pass" };
let dir: string, url: string, db: PrismaClient, c: Container, sequence = 0;
const mails: EmailMessage[] = [];
const noNetwork = vi.fn(async () => { throw new Error("No real network in paid repair integration"); });
beforeAll(async () => {
  dir = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-paid-repair-")));
  url = `file:${path.join(dir, "repair.sqlite").split(path.sep).join("/")}`;
  db = new PrismaClient({ datasources: { db: { url } } }); await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), appUrl: "http://localhost:3000", secret: "synthetic-paid-repair",
    payment: new MockPaymentProvider("http://localhost:3000", "synthetic"), avatars: new MockAvatarProvider(),
    judge: new NoPatchJudge(), faces: new NoopFaceDetector(), analytics: new NoopAnalytics(), jobs: new InlineJobRunner(),
    email: { id: "console", send: async mail => { mails.push(mail); return { id: `mail-${mails.length}` }; } }, adminEmails: ["synthetic-admin@example.invalid"] };
  state.original = await boardPng(); vi.stubGlobal("fetch", noNetwork);
}, 180_000);
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(dir) === realpathSync(tmpdir()) && path.basename(dir).startsWith("findme-paid-repair-")) rmSync(dir, { recursive: true, force: true });
});

async function seed() {
  const gameId = `paid-repair-${++sequence}`;
  const seeded = await seedApprovedGame(c, db, { gameId, approved: false, styleVersion: LOCAL_PATCH_STYLE,
    status: "GENERATION_FAILED", withJob: true, scenes: BOARDS.map(b => ({ slug: b.board, version: 8 })) });
  state.testers.push(seeded.email);
  await c.storage.put(`private/photo-${gameId}.jpg`, seeded.sheet, "image/png");
  await db.game.update({ where: { id: gameId }, data: { paidAt: new Date() } });
  await db.order.create({ data: { id: `order-${gameId}`, gameId, userId: seeded.userId, amountAgorot: 5900,
    packageTier: "ONE_WORLD", paymentStatus: "PAID", paidAt: new Date(), provider: "mock" } });
  await db.generationJob.update({ where: { id: `job_${gameId}` }, data: { status: "DONE", currentStep: LOCAL_PATCH_QUALITY_FAILED, attempts: 38 } });
  const avatarId = `ast-avatar-${gameId}`, avatar = await avatarDisplayFromSheet(seeded.sheet, 1024);
  await c.storage.put(`game/${avatarId}.png`, avatar, "image/png");
  await db.asset.create({ data: { id: avatarId, ownerId: seeded.userId, type: "AVATAR", visibility: "GAME", status: "READY",
    storagePath: `game/${avatarId}.png`, mimeType: "image/png", width: 512, height: 512, bytes: avatar.length } });
  await db.childProfile.update({ where: { id: `chl-${gameId}` }, data: { avatarAssetId: avatarId } });
  const { sha256: catalogSha256 } = await readBoardConditionedCatalog();
  await reviewBoardWizardIdentity({ db, apiKey: "synthetic", budget: boardWizardBudgetOf(c), beforeDispatch: async () => {},
    write: work => db.$transaction(work), reviewer: { review: async () => ({ httpOk: true, requestId: `req-${gameId}-identity`,
      body: { model: "gpt-5.6-luna", usage: { prompt_tokens: 1500, completion_tokens: 150 }, choices: [{ finish_reason: "stop", message: {
        content: JSON.stringify({ checks: { identity: "pass", age: "pass", paintedStyle: "pass", sheetLayout: "pass" }, reason: "Synthetic approved illustrated identity" }) } }] } }) } },
  { gameId, identityAssetId: `ast-sheet-${gameId}`, sheet: seeded.sheet, photo: seeded.sheet, atlas: seeded.sheet, contentVersion: 8,
    provenance: { promptVersion: "character-v4-board-drawn-face-reference", quality: "medium", photoAssetId: `ast-photo-${gameId}`,
      photoSha256: sha256Bytes(seeded.sheet), ageYears: 8, crop: null,
      style: { version: "board-matched-identity/v2", catalogSha256, atlasSha256: sha256Bytes(seeded.sheet) } } });
  const png = await sharp(state.original).extract({ left: 0, top: 0, width: 512, height: 768 }).png().toBuffer();
  for (const board of BOARDS) {
    const def = sceneBySlug(board.board, 8), sceneId = `gsc-${gameId}-${board.board}`;
    await db.gameScene.update({ where: { id: sceneId }, data: { generationStatus: "GENERATED" } });
    for (const hide of board.hides) {
      const authored = def.targets.find(t => t.id === hide.targetId)!;
      const targetId = `tgt-${gameId}-${hide.id}`, rowId = `tva-${gameId}-${hide.id}`, assetId = `ast-${gameId}-${hide.id}`;
      const crop = cropOf(hide), mask = maskForHide(hide);
      const geometry = { rectJson: JSON.stringify({ x: crop.left / 3072, y: crop.top / 2048, w: 512 / 3072, h: 768 / 2048 }),
        hitRectJson: JSON.stringify({ x: (crop.left + mask.left) / 3072, y: (crop.top + mask.top) / 2048, w: mask.width / 3072, h: mask.height / 2048 }),
        headAnchorJson: JSON.stringify({ x: (crop.left + mask.left + mask.width / 2) / 3072, y: (crop.top + mask.top) / 2048 }) };
      const selected = SELECTED.some(h => h.id === hide.id), failed = hide.id === SELECTED[1]!.id;
      const attempts = selected ? 3 : 1, pendingReview = UNREVIEWED.includes(hide.id);
      const judgeJson = JSON.stringify({ hide: hide.id, pose: hide.pose, judgedSha256: sha256Bytes(png), geometrySha256: localPatchPublicationGeometryHash(geometry),
        reviewState: pendingReview ? "pending-board-review" : "board-review-complete", wireFault: null, renderFault: null, verdict: pendingReview ? null : GOOD,
        compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION,
        ...(pendingReview ? {} : { boardReview: { compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION, version: "local-patch-board-five-quality/v3-head-safe" } }) });
      await c.storage.put(`game/${assetId}.png`, png, "image/png");
      await db.asset.create({ data: { id: assetId, ownerId: seeded.userId, type: "TARGET_SPRITE", visibility: "GAME", status: "READY",
        storagePath: `game/${assetId}.png`, mimeType: "image/png", width: 512, height: 768, bytes: png.length, provider: LOCAL_PATCH_PROVIDER, providerRequestId: gameId } });
      await db.targetInstance.create({ data: { id: targetId, gameSceneId: sceneId, targetId: hide.targetId, targetType: authored.targetType,
        slotAId: authored.slots[0].id, slotBId: authored.slots[1].id, spriteKind: "image", spriteAssetId: assetId, status: failed ? "FAILED" : "GENERATED", attempts } });
      await db.targetVariantAsset.create({ data: { id: rowId, targetInstanceId: targetId, variant: LOCAL_PATCH_VARIANT, slotId: authored.slots[0].id,
        provider: LOCAL_PATCH_PROVIDER, assetId, attempts, ...geometry, judgeJson, status: failed ? "FAILED" : "GENERATED", rejectedAssetIdsJson: "[]" } });
      if (!failed && !pendingReview) await db.$transaction(tx => recordLocalPatchPublicationPolicy(tx, { gameId, sceneVersion: 8, hideId: hide.id,
        variantId: rowId, attempts, identityAssetId: `ast-sheet-${gameId}`, identitySha256: sha256Bytes(seeded.sheet), assetId,
        imageSha256: sha256Bytes(png), geometrySha256: localPatchPublicationGeometryHash(geometry), judgeJson }));
    }
  }
  const repairs = [];
  for (const hide of SELECTED) {
    const mask = maskForHide(hide), crop = cropOf(hide);
    const core = { left: mask.left + 12, top: mask.top + 12, width: 40, height: 60 };
    const faceRect = { left: core.left + 4, top: core.top + 4, width: 30, height: 30 };
    const raw = await sharp(png).composite([{ input: { create: { width: core.width, height: core.height, channels: 4, background: "#244fc1" } }, left: core.left, top: core.top }]).png().toBuffer();
    const weights = Buffer.alloc(512 * 768);
    for (let y = 0; y < 768; y++) for (let x = 0; x < 512; x++) {
      const outside = Math.max(core.left - 16 - x, x - (core.left + core.width + 15), core.top - 16 - y, y - (core.top + core.height + 15), 0);
      weights[y * 512 + x] = outside === 0 ? 255 : outside === 1 ? 191 : outside === 2 ? 127 : outside === 3 ? 63 : 0;
    }
    const alpha = await sharp(weights, { raw: { width: 512, height: 768, channels: 1 } }).toColourspace("b-w").png().toBuffer();
    const left = Math.max(0, mask.left - LOCAL_PATCH_RETURN_GUARD), top = Math.max(0, mask.top - LOCAL_PATCH_RETURN_GUARD);
    const returnWindow = { left, top, width: Math.min(512, mask.left + mask.width + LOCAL_PATCH_RETURN_GUARD) - left,
      height: Math.min(768, mask.top + mask.height + LOCAL_PATCH_RETURN_GUARD) - top };
    const joined = await recomputePaidPatchJoin({ beforePng: state.original, rawPng: raw, alphaPng: alpha, crop, returnWindow, protectedCore: core, faceRect });
    const requestKey = `${hide.id}:${hide.pose}:render:1`, budget = boardWizardBudgetOf(c);
    expect(await purchaseOnce({ ledger: budget, store: new LocalPatchRetainedPurchaseStore(c, gameId, budget) }, {
      worldId: boardWizardWorldId(gameId), requestKey, scope: "image", operationFingerprint: `synthetic-paid-${gameId}-${hide.id}`,
      reserveMicroUsd: LOCAL_PATCH_RESERVE.renderMicroUsd, buy: async () => ({
        bytes: Buffer.from(JSON.stringify({ version: RETAINED_RENDER_VERSION, bytesBase64: raw.toString("base64"), rejected: null })), evidence: bill(`req-${gameId}-${hide.id}`) }),
    })).toMatchObject({ kind: "bought" });
    repairs.push({ hideId: hide.id, attempt: 1, rawSha256: sha256Bytes(raw), originalBoardSha256: sha256Bytes(state.original),
      candidateSha256: joined.candidateSha256, alphaSha256: sha256Bytes(alpha), alphaBase64: alpha.toString("base64"), protectedCore: core, faceRect });
  }
  const beforeRows = await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } }, orderBy: { id: "asc" } });
  const beforeCost = (await boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId))).settledMicroUsd;
  return { ...seeded, repairs, beforeRows, beforeCost, input: { gameId, operatorId: "synthetic-admin", authorizationReason: "Review exactly two existing paid synthetic pictures without new renders", repairs } };
}
const noPaint: LocalPatchHideDeps = { renderPolicySha256: "f".repeat(64), readBoardArt: async () => state.original,
  render: async () => { throw new Error("Repair flow must not buy an image"); }, judge: async () => { throw new Error("Repair flow must not buy per-hide review"); } };
function judge(gameId: string, siblingFails = false) {
  let calls = 0;
  return vi.fn(async (request: { prompt: string }) => {
    calls++;
    const board = BOARDS.find(b => request.prompt.includes(`The selected corrected hide is ${b.hides.find(h => SELECTED.some(s => s.id === h.id))?.id}.`))!;
    if (!board) throw new Error("The actual frozen repair prompt did not name a selected hide");
    return { verdict: null, raw: JSON.stringify({ hides: board.hides.map((h, index) => ({ hideId: h.id,
      verdict: siblingFails && index === 0 ? { ...GOOD, faceLikeness: "unsure" } : GOOD })) }),
      usage: { prompt_tokens: 12000, completion_tokens: 1200 }, requestId: `req-${gameId}-repair-${calls}`,
      model: "gpt-5.6-sol", finishReason: "stop", wireFault: null, costUnknown: false };
  });
}
async function tick(gameId: string, repairJudge: ReturnType<typeof judge>, container = c) {
  return runLocalPatchWorldSlice(container, noPaint, gameId, { repairJudge, hardDeadlineAt: Date.now() + 270_000 });
}

describe("two paid repairs through actual stage, real ledger, durable queue and publication", () => {
  it("stages without spend, delivers45 after two reviews, preserves43 images and binds four pending siblings without repainting", async () => {
    const s = await seed(), mailStart = mails.length;
    const stage = await stageLocalPatchPaidRepair(c, s.input);
    expect(stage.requestKeys).toHaveLength(2);
    expect((await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).settledMicroUsd).toBe(s.beforeCost);
    const staged = await readLocalPatchPaidRepair(c, s.gameId); expect(staged?.state).toBe("staged");
    expect(staged!.reviewedSiblings?.map(row => row.hideId).sort()).toEqual([...UNREVIEWED].sort());
    expect(s.beforeRows.filter(row => JSON.parse(row.judgeJson!).reviewState === "pending-board-review")).toHaveLength(4);
    for (const sibling of staged!.reviewedSiblings!) {
      const row = s.beforeRows.find(r => r.id === sibling.rowId)!;
      expect(await hasLocalPatchPublicationPolicy(c, { gameId: s.gameId, sceneVersion: 8, hideId: sibling.hideId,
        variantId: row.id, attempts: row.attempts, identityAssetId: staged!.identityAssetId, identitySha256: staged!.identitySha256,
        assetId: row.assetId!, imageSha256: sibling.imageSha256, geometrySha256: sibling.geometrySha256, judgeJson: row.judgeJson })).toBe(false);
    }
    for (const key of stage.requestKeys) expect(await boardWizardBudgetOf(c).readRequest(boardWizardWorldId(s.gameId), key)).toBeNull();
    const inventory = await localPatchPrivateInventory(c, s.gameId);
    for (const key of stage.requestKeys) expect(inventory.retainedPurchaseKeys).toContain(retainedPurchaseKey(boardWizardWorldId(s.gameId), key));
    for (const a of staged!.candidates) { expect(inventory.assetIds).toContain(a.assetId); expect(inventory.assetIds).toContain(a.alphaAssetId); }
    const j = judge(s.gameId);
    expect(await tick(s.gameId, j)).toMatchObject({ pending: true });
    expect((await readLocalPatchPaidRepair(c, s.gameId))?.state).toBe("staged");
    expect(await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId: s.gameId } } }, orderBy: { id: "asc" } })).toEqual(s.beforeRows);
    expect(await tick(s.gameId, j)).toMatchObject({ pending: false, attention: null });
    const game = await db.game.findUniqueOrThrow({ where: { id: s.gameId } });
    expect(game.status, game.lastError ?? "no error").toBe("DELIVERED");
    expect(GameConfigSchema.parse(JSON.parse(game.configJson!)).scenes.flatMap(board => board.targets)).toHaveLength(45);
    const afterRows = await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId: s.gameId } } }, orderBy: { id: "asc" } });
    const repairedIds = new Set(staged!.candidates.map(a => a.rowId));
    const siblingIds = new Set(staged!.reviewedSiblings!.map(a => a.rowId));
    const unchanged = afterRows.filter(r => !repairedIds.has(r.id) && !siblingIds.has(r.id));
    expect(unchanged).toHaveLength(39);
    expect(unchanged).toEqual(s.beforeRows.filter(r => !repairedIds.has(r.id) && !siblingIds.has(r.id)));
    const preserved = (row: typeof afterRows[number]) => { const { judgeJson: _judge, updatedAt: _updated, ...invariants } = row; return invariants; };
    expect(afterRows.filter(r => !repairedIds.has(r.id)).map(preserved)).toEqual(s.beforeRows.filter(r => !repairedIds.has(r.id)).map(preserved));
    for (const row of afterRows.filter(r => !repairedIds.has(r.id))) {
      const asset = await db.asset.findUniqueOrThrow({ where: { id: row.assetId! } });
      expect(sha256Bytes(await c.storage.get(asset.storagePath))).toBe(JSON.parse(s.beforeRows.find(r => r.id === row.id)!.judgeJson!).judgedSha256);
    }
    for (const row of afterRows.filter(r => siblingIds.has(r.id))) {
      const original = s.beforeRows.find(r => r.id === row.id)!;
      const review = JSON.parse(row.judgeJson!);
      expect(row.judgeJson).not.toBe(original.judgeJson);
      expect(review).toMatchObject({ judgedSha256: JSON.parse(original.judgeJson!).judgedSha256,
        geometrySha256: localPatchPublicationGeometryHash(row), compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION,
        paidRepair: { kind: "reviewed-unchanged-sibling" } });
      expect(review.verdict).toMatchObject({ faceLikeness: "pass", faceReadable: "pass", severeSeam: "pass" });
      expect(await hasLocalPatchPublicationPolicy(c, { gameId: s.gameId, sceneVersion: 8, hideId: review.hide,
        variantId: row.id, attempts: row.attempts, identityAssetId: staged!.identityAssetId, identitySha256: staged!.identitySha256,
        assetId: row.assetId!, imageSha256: review.judgedSha256, geometrySha256: review.geometrySha256, judgeJson: row.judgeJson })).toBe(true);
    }
    expect(afterRows.filter(r => repairedIds.has(r.id)).every(r => r.status === "GENERATED" && r.attempts === 3)).toBe(true);
    expect(j).toHaveBeenCalledTimes(2); expect(mails.slice(mailStart).filter(m => m.tag === "game-ready")).toHaveLength(1);
    const cost = (await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).settledMicroUsd;
    const fresh = new PrismaClient({ datasources: { db: { url } } });
    try { for (let i = 0; i < 3; i++) expect(await tick(s.gameId, j, { ...c, db: fresh, storage: new DbStorage(fresh) })).toMatchObject({ pending: false, claimed: false }); }
    finally { await fresh.$disconnect(); }
    expect(j).toHaveBeenCalledTimes(2); expect((await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).settledMicroUsd).toBe(cost);
    expect(noNetwork).not.toHaveBeenCalled();
  }, 240_000);
  it("a sibling unsure blocks BOTH candidates and never falls into another image attempt", async () => {
    const s = await seed(); await stageLocalPatchPaidRepair(c, s.input); const j = judge(s.gameId, true);
    expect(await tick(s.gameId, j)).toMatchObject({ pending: false });
    expect((await readLocalPatchPaidRepair(c, s.gameId))?.state).toBe("blocked");
    expect(await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId: s.gameId } } }, orderBy: { id: "asc" } })).toEqual(s.beforeRows);
    expect(await db.game.findUniqueOrThrow({ where: { id: s.gameId } })).toMatchObject({ status: "GENERATION_FAILED", configJson: null, readyAt: null });
    for (let i = 0; i < 3; i++) expect(await tick(s.gameId, j)).toMatchObject({ claimed: false, pending: false });
    expect(j).toHaveBeenCalledTimes(1); expect(await db.shareLink.count({ where: { gameId: s.gameId } })).toBe(0);
  }, 240_000);
  it("refuses same-size substituted staged bytes before any judge purchase", async () => {
    const s = await seed(); await stageLocalPatchPaidRepair(c, s.input); const batch = (await readLocalPatchPaidRepair(c, s.gameId))!;
    const asset = await db.asset.findUniqueOrThrow({ where: { id: batch.candidates[0]!.assetId } });
    const changed = await sharp({ create: { width: 512, height: 768, channels: 4, background: "red" } }).png().toBuffer();
    await c.storage.put(asset.storagePath, changed, "image/png");
    const j = judge(s.gameId); expect((await tick(s.gameId, j)).attention).toContain("pixels");
    expect(j).not.toHaveBeenCalled(); expect((await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).settledMicroUsd).toBe(s.beforeCost);
  }, 240_000);
  it.each(["pixels", "geometry"])("refuses changed pending-sibling %s before staging or buying a review", async kind => {
    const s = await seed(), row = s.beforeRows.find(r => JSON.parse(r.judgeJson!).hide === UNREVIEWED[0])!;
    if (kind === "pixels") {
      const asset = await db.asset.findUniqueOrThrow({ where: { id: row.assetId! } });
      await c.storage.put(asset.storagePath, await sharp({ create: { width: 512, height: 768, channels: 4, background: "red" } }).png().toBuffer(), "image/png");
    } else {
      const rect = JSON.parse(row.hitRectJson!);
      await db.targetVariantAsset.update({ where: { id: row.id }, data: { hitRectJson: JSON.stringify({ ...rect, x: rect.x + 0.01 }) } });
    }
    await expect(stageLocalPatchPaidRepair(c, s.input)).rejects.toThrow("An unapproved sibling is not awaiting its first current review");
    expect(await readLocalPatchPaidRepair(c, s.gameId)).toBeNull();
    expect(await db.asset.count({ where: { providerRequestId: s.gameId, id: { startsWith: "ast_lpmr" } } })).toBe(0);
    expect((await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).settledMicroUsd).toBe(s.beforeCost);
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${s.gameId}` } })).toMatchObject({ status: "DONE", attempts: 38 });
  }, 240_000);
  it("retained paid review survives a worker failure before the batch write and a fresh adapter replays it", async () => {
    const s = await seed(); await stageLocalPatchPaidRepair(c, s.input); const j = judge(s.gameId); let fences = 0;
    await expect(runLocalPatchPaidRepair(c, s.gameId, { judge: j, fence: async () => { if (++fences === 2) throw new Error("synthetic worker vanished after paid reply"); } })).rejects.toThrow("worker vanished");
    expect(j).toHaveBeenCalledTimes(1); const batch = (await readLocalPatchPaidRepair(c, s.gameId))!;
    expect(batch.reviews[0]!.result).toBeNull();
    expect((await boardWizardBudgetOf(c).readRequest(boardWizardWorldId(s.gameId), batch.reviews[0]!.requestKey))?.state).toBe("settled");
    const fresh = new PrismaClient({ datasources: { db: { url } } });
    try { expect(await runLocalPatchPaidRepair({ ...c, db: fresh, storage: new DbStorage(fresh) }, s.gameId, { judge: j, fence: async () => {} })).toMatchObject({ state: "pending" }); }
    finally { await fresh.$disconnect(); }
    expect(j).toHaveBeenCalledTimes(1);
  }, 240_000);
  it("a changed identity pointer before staging refuses without storing any candidate", async () => {
    const s = await seed(); await db.childProfile.update({ where: { id: `chl-${s.gameId}` }, data: { identityAssetId: `ast-photo-${s.gameId}` } });
    await expect(stageLocalPatchPaidRepair(c, s.input)).rejects.toThrow("identity");
    expect(await readLocalPatchPaidRepair(c, s.gameId)).toBeNull();
    expect(await db.asset.count({ where: { providerRequestId: s.gameId, id: { startsWith: "ast_lpmr" } } })).toBe(0);
    expect((await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).settledMicroUsd).toBe(s.beforeCost);
  }, 240_000);
  it("a committed review whose acknowledgement is lost resumes from a fresh client without buying the same review again", async () => {
    const s = await seed(); await stageLocalPatchPaidRepair(c, s.input); const j = judge(s.gameId);
    let lost = false;
    // This is the REAL transaction and REAL database. Only its acknowledgement
    // is faulted after the durable review record demonstrably exists.
    const realTransaction = db.$transaction.bind(db);
    const interruptedDb = new Proxy(db, { get(target, property, receiver) {
      if (property !== "$transaction") return Reflect.get(target, property, receiver);
      return async (...args: unknown[]) => {
        const result: unknown = await Reflect.apply(realTransaction, db, args);
        if (!lost && (await readLocalPatchPaidRepair(c, s.gameId))?.reviews[0]?.result) {
          lost = true; throw new Error("synthetic commit acknowledgement lost");
        }
        return result;
      };
    } });
    expect(await tick(s.gameId, j, { ...c, db: interruptedDb })).toMatchObject({ pending: true, attention: null });
    expect(lost).toBe(true); expect(j).toHaveBeenCalledTimes(1);
    const persisted = (await readLocalPatchPaidRepair(c, s.gameId))!;
    expect(persisted.reviews[0]!.result?.state).toBe("pass"); expect(persisted.reviews[1]!.result).toBeNull();
    const fresh = new PrismaClient({ datasources: { db: { url } } });
    try { expect(await tick(s.gameId, j, { ...c, db: fresh, storage: new DbStorage(fresh) })).toMatchObject({ pending: false, attention: null }); }
    finally { await fresh.$disconnect(); }
    expect(j).toHaveBeenCalledTimes(2);
    expect(await db.game.findUniqueOrThrow({ where: { id: s.gameId } })).toMatchObject({ status: "DELIVERED" });
    expect((await readLocalPatchPaidRepair(c, s.gameId))?.state).toBe("committed");
  }, 240_000);
  it.each(["identity", "refund"])("%s changes between preparation and the staging transaction roll back both candidate writes", async kind => {
    const s = await seed(); let changed = false;
    const realTransaction = db.$transaction.bind(db);
    const racedDb = new Proxy(db, { get(target, property, receiver) {
      if (property !== "$transaction") return Reflect.get(target, property, receiver);
      return async (...args: unknown[]) => {
        if (!changed) {
          changed = true;
          if (kind === "identity") await db.childProfile.update({ where: { id: `chl-${s.gameId}` }, data: { identityAssetId: `ast-photo-${s.gameId}` } });
          else await db.order.update({ where: { id: `order-${s.gameId}` }, data: { paymentStatus: "REFUNDED", refundedAt: new Date() } });
        }
        return Reflect.apply(realTransaction, db, args);
      };
    } });
    await expect(stageLocalPatchPaidRepair({ ...c, db: racedDb }, s.input)).rejects.toThrow(/identity|child|order|paid/i);
    expect(changed).toBe(true); expect(await readLocalPatchPaidRepair(c, s.gameId)).toBeNull();
    expect(await db.asset.count({ where: { providerRequestId: s.gameId, id: { startsWith: "ast_lpmr" } } })).toBe(0);
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${s.gameId}` } })).toMatchObject({ status: "DONE", attempts: 38 });
  }, 240_000);
});
