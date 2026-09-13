import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { PrismaRetainedPurchaseStore, retainedPurchaseKey } from "../../../infra/db/prisma-retained-purchase-store";
import { MockPaymentProvider } from "../../../infra/payment/mock";
import { MockAvatarProvider, NoopFaceDetector } from "../../../infra/generation/mock";
import { NoPatchJudge } from "../../../infra/generation/judge";
import { NoopAnalytics } from "../../../infra/analytics/console";
import type { Container } from "../../container";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { cropOf } from "../../../domain/scene/local-patch-hides";
import { stageLocalPatchExtraAttempts, readLocalPatchExtraAttemptPlan, requireLocalPatchExtraAttempt, fenceLocalPatchExtraAttempt,
  requireLocalPatchExtraReview, fenceLocalPatchExtraReview, LOCAL_PATCH_EXTRA_ATTEMPT_ACTION } from "../local-patch-extra-attempt";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { sha256Bytes } from "../fixed-sprite";
import { purchaseOnce } from "../paid-operation";
import { RETAINED_RENDER_VERSION } from "../local-patch-render";
import { LOCAL_PATCH_COMPOSITION_VERSION } from "../local-patch-seam";
import { parseLocalPatchBoardVerdicts } from "../local-patch-judge";
import { recordLocalPatchPublicationPolicy, localPatchPublicationGeometryHash } from "../local-patch-publication-policy";
import { bill, PASSING_ANSWER, seedApprovedGame } from "./local-patch-fixtures";

const fake = vi.hoisted(() => ({ appEnv: "qa" }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: fake.appEnv, GENERATION_ENABLED: "on" }), flag: () => false,
  spendGuard: () => ({ appEnv: "qa", realGeneration: false, testers: [] }), adminEmails: () => ["extra-admin@example.invalid"] }));
const BOARDS = localPatchBoardsForVersion(9), IDS = ["amazon-v7-5", "sydney-v7-5", "greatwall-v7-5"];
const GOOD = { ...PASSING_ANSWER, faceLikeness: "pass", faceReadable: "pass", severeSeam: "pass", ageAppropriate: "pass" };
let dir: string, db: PrismaClient, c: Container, png: Buffer;
const send = vi.fn(async () => { throw new Error("No mail while granting authority"); });
const enqueue = vi.fn(async () => { throw new Error("Authority only queues the durable row"); });
beforeAll(async () => {
  dir = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-extra-authority-")));
  const url = `file:${path.join(dir, "authority.sqlite").split(path.sep).join("/")}`;
  db = new PrismaClient({ datasources: { db: { url } } }); await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), appUrl: "http://localhost:3000", secret: "synthetic-extra-attempt",
    payment: new MockPaymentProvider("http://localhost:3000", "synthetic"), avatars: new MockAvatarProvider(), judge: new NoPatchJudge(),
    faces: new NoopFaceDetector(), analytics: new NoopAnalytics(), email: { id: "console", send },
    jobs: { id: "in-process", enqueue, register() {} }, adminEmails: ["extra-admin@example.invalid"] };
  await db.user.create({ data: { id: "extra-admin", email: "extra-admin@example.invalid" } });
  png = await sharp({ create: { width: 512, height: 768, channels: 4, background: "#9ca482" } }).png().toBuffer();
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("No live network in authority tests"); }));
});
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(dir) === realpathSync(tmpdir()) && path.basename(dir).startsWith("findme-extra-authority-")) rmSync(dir, { recursive: true, force: true });
});
const rowsOf = (gameId: string) => db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } }, orderBy: { id: "asc" } });
const inputOf = (gameId: string, hideIds: readonly string[] = IDS) => ({ gameId, operatorId: "extra-admin", reason: "Explicit user authorization: one extra image per selected failed hide within the same four-dollar budget", hideIds });
async function seed(gameId: string, selected: readonly string[] = IDS) {
  const s = await seedApprovedGame(c, db, { gameId, approved: false, styleVersion: "local-patch-world-v1", status: "GENERATION_FAILED",
    withJob: true, scenes: BOARDS.map(b => ({ slug: b.board, version: 9 })) });
  await c.storage.put(`private/photo-${gameId}.jpg`, s.sheet, "image/png");
  await db.childProfile.update({ where: { id: `chl-${gameId}` }, data: { ageYears: 5 } });
  const catalog = await readBoardConditionedCatalog(), budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(gameId);
  await reviewBoardWizardIdentity({ db, apiKey: "synthetic", budget, beforeDispatch: async () => {}, write: work => db.$transaction(work),
    reviewer: { review: async () => ({ httpOk: true, requestId: `req-${gameId}-identity`, body: { model: "gpt-5.6-luna",
      usage: { prompt_tokens: 1500, completion_tokens: 150 }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
        checks: { identity: "pass", age: "pass", paintedStyle: "pass", sheetLayout: "pass" }, reason: "Synthetic canonical age-five identity" }) } }] } }) } },
  { gameId, identityAssetId: `ast-sheet-${gameId}`, sheet: s.sheet, photo: s.sheet, atlas: s.sheet, contentVersion: 9,
    provenance: { promptVersion: "character-v4-board-drawn-face-reference", quality: "medium", photoAssetId: `ast-photo-${gameId}`,
      photoSha256: sha256Bytes(s.sheet), ageYears: 5, crop: null,
      style: { version: "board-matched-identity/v2", catalogSha256: catalog.sha256, atlasSha256: sha256Bytes(s.sheet) } } });
  await db.game.update({ where: { id: gameId }, data: { paidAt: new Date() } });
  await db.order.create({ data: { id: `ord-${gameId}`, gameId, userId: s.userId, packageTier: "ONE_WORLD", provider: "mock",
    amountAgorot: 100, paymentStatus: "PAID", paidAt: new Date() } });
  await db.generationJob.update({ where: { id: `job_${gameId}` }, data: { status: "DONE", currentStep: "local-patch:quality-failed", attempts: 83 } });
  for (const board of BOARDS) {
    const raw = JSON.stringify({ hides: board.hides.map(h => ({ hideId: h.id, evidenceIds: [`${h.id}:before`, `${h.id}:after`], verdict: GOOD })) });
    const verdicts = parseLocalPatchBoardVerdicts(raw, board.hides.map(h => h.id), 9);
    for (const hide of board.hides) {
      const targetId = `${gameId}-${hide.id}`, variantId = `var-${targetId}`, sceneId = `gsc-${gameId}-${board.board}`;
      const selectedHere = selected.includes(hide.id), pending = board.board === "greatwall" && !selectedHere;
      await db.targetInstance.create({ data: { id: targetId, gameSceneId: sceneId, targetId: hide.targetId, targetType: "child",
        spriteKind: "image", slotAId: "a", slotBId: "b", status: selectedHere ? "FAILED" : "GENERATED" } });
      if (selectedHere) {
        for (let attempt = 1; attempt <= 3; attempt++) {
          const requestKey = `${hide.id}:${hide.pose}:render:${attempt}`;
          await purchaseOnce({ ledger: budget, store: new PrismaRetainedPurchaseStore(db) }, { worldId, requestKey, scope: "image",
            operationFingerprint: sha256Bytes(Buffer.from(`${gameId}-${requestKey}`)), reserveMicroUsd: 120000,
            buy: async () => ({ bytes: Buffer.from(JSON.stringify({ version: RETAINED_RENDER_VERSION, bytesBase64: png.toString("base64"), rejected: null })),
              evidence: bill(`req-${gameId}-${requestKey}`) }) });
        }
        await db.targetVariantAsset.create({ data: { id: variantId, targetInstanceId: targetId, variant: "A", slotId: "a", provider: "local-patch",
          status: "FAILED", attempts: 3, costCents: 15, lastError: "quality-seam: background displaced by -2,-3",
          judgeJson: JSON.stringify({ hide: hide.id, pose: hide.pose, renderFault: "quality-seam: background displaced by -2,-3",
            compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION, compositionPermission: "refused", verdict: null, wireFault: null }) } });
        continue;
      }
      const assetId = `ast-${targetId}`, storagePath = `game/${assetId}.png`, crop = cropOf(hide);
      await c.storage.put(storagePath, png, "image/png");
      await db.asset.create({ data: { id: assetId, ownerId: s.userId, type: "TARGET_SPRITE", visibility: "GAME", status: "READY", storagePath,
        mimeType: "image/png", width: 512, height: 768, bytes: png.length, provider: "local-patch", providerRequestId: gameId } });
      const geometry = { rectJson: JSON.stringify({ x: crop.left / 3072, y: crop.top / 2048, w: crop.width / 3072, h: crop.height / 2048 }),
        hitRectJson: JSON.stringify({ x: .4, y: .4, w: .2, h: .3 }), headAnchorJson: JSON.stringify({ x: .5, y: .4 }) };
      const judgeJson = JSON.stringify({ hide: hide.id, pose: hide.pose, judgedSha256: sha256Bytes(png), geometrySha256: localPatchPublicationGeometryHash(geometry),
        reviewState: pending ? "pending-board-review" : "board-review-complete", compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION,
        renderFault: null, wireFault: null, verdict: pending ? null : verdicts[hide.id],
        ...(pending ? {} : { boardReview: { version: "local-patch-board-five-quality/v5-evidence-labeled", compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION, raw } }) });
      const row = await db.targetVariantAsset.create({ data: { id: variantId, targetInstanceId: targetId, variant: "A", slotId: "a", provider: "local-patch",
        status: "GENERATED", attempts: 1, assetId, ...geometry, judgeJson } });
      if (!pending) await db.$transaction(tx => recordLocalPatchPublicationPolicy(tx, { gameId, sceneVersion: 9, hideId: hide.id,
        variantId, attempts: 1, identityAssetId: `ast-sheet-${gameId}`, identitySha256: sha256Bytes(s.sheet), assetId,
        imageSha256: sha256Bytes(png), geometrySha256: localPatchPublicationGeometryHash(row), judgeJson }));
    }
  }
  return { ...s, budget, worldId };
}

async function retainAmazonReview(s: Awaited<ReturnType<typeof seed>>, key: string, scaleRight: "pass" | "unsure") {
  const board = BOARDS.find(b => b.board === "amazon")!, hide = board.hides[4]!;
  const raw = JSON.stringify({ hides: board.hides.map(h => ({ hideId: h.id, evidenceIds: [`${h.id}:before`, `${h.id}:after`],
    verdict: h.id === hide.id ? { ...GOOD, ageAppropriate: "unsure", scaleRight, verdict: "unsure", reason: "Natural foliage hides the torso; canonical face is readable" } : GOOD })) });
  const usage = { prompt_tokens: 4000, completion_tokens: 500 }, requestId = `req-${s.gameId}-${key}`, model = "gpt-5.6-luna";
  const wire = { raw, model, requestId, usage, wireFault: null, costUnknown: false, finishReason: "stop" };
  const fingerprint = sha256Bytes(Buffer.from(`${s.gameId}-${key}`));
  await purchaseOnce({ ledger: s.budget, store: new PrismaRetainedPurchaseStore(db) }, { worldId: s.worldId, requestKey: key,
    scope: "judge", operationFingerprint: fingerprint, reserveMicroUsd: 30000, buy: async () => ({ bytes: Buffer.from(JSON.stringify(wire)),
      evidence: { ...bill(requestId, 1000), rawUsage: usage, model, usageId: sha256Bytes(Buffer.from(JSON.stringify(usage))) } }) });
  return { wire, fingerprint, verdict: parseLocalPatchBoardVerdicts(raw, board.hides.map(h => h.id), 9)[hide.id] };
}

describe("durable per-game extra-image authority", () => {
  it("grants two images plus one same-pixels Amazon review, never an Amazon fourth image or invented age pass", async () => {
    const s = await seed("extra-review-only"), board = BOARDS.find(b => b.board === "amazon")!, hide = board.hides[4]!;
    const targetId = `${s.gameId}-${hide.id}`, rowId = `var-${targetId}`, assetId = `ast-${targetId}`, storagePath = `game/${assetId}.png`;
    const crop = cropOf(hide), geometry = { rectJson: JSON.stringify({ x: crop.left / 3072, y: crop.top / 2048, w: crop.width / 3072, h: crop.height / 2048 }),
      hitRectJson: JSON.stringify({ x: .4, y: .4, w: .2, h: .3 }), headAnchorJson: JSON.stringify({ x: .5, y: .4 }) };
    await c.storage.put(storagePath, png, "image/png");
    await db.asset.create({ data: { id: assetId, ownerId: s.userId, type: "TARGET_SPRITE", visibility: "GAME", status: "READY", storagePath,
      mimeType: "image/png", width: 512, height: 768, bytes: png.length, provider: "local-patch", providerRequestId: s.gameId } });
    const oldKey = `board:amazon:five-review:v9:1-1-1-1-3:${LOCAL_PATCH_COMPOSITION_VERSION.replaceAll("/", ".")}:evidence-v5`;
    const original = await retainAmazonReview(s, oldKey, "unsure");
    const receipt = { hide: hide.id, pose: hide.pose, judgedSha256: sha256Bytes(png), geometrySha256: localPatchPublicationGeometryHash(geometry),
      compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION, reviewState: "board-review-complete", wireFault: null, renderFault: null, verdict: original.verdict,
      boardReview: { version: "local-patch-board-five-quality/v5-evidence-labeled", compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION,
        requestKey: oldKey, fingerprint: original.fingerprint, raw: original.wire.raw, model: original.wire.model, effort: "low", costMicroUsd: 1000 } };
    await db.targetVariantAsset.update({ where: { id: rowId }, data: { assetId, ...geometry, judgeJson: JSON.stringify(receipt),
      lastError: "quality-retry: ageAppropriate; scaleRight", rejectedAssetIdsJson: JSON.stringify([assetId]) } });
    const before = await rowsOf(s.gameId), cost = await s.budget.audit(s.worldId);
    const stageStarted = performance.now();
    const plan = await stageLocalPatchExtraAttempts(c, { ...inputOf(s.gameId, ["sydney-v7-5", "greatwall-v7-5"]), reviewOnlyHideIds: [hide.id] });
    console.info(`Isolated extra-attempt authority staging: ${Math.round(performance.now() - stageStarted)}ms (local SQLite, not remote latency)`);
    expect(plan.selected).toHaveLength(2); expect(plan.reviewOnly).toHaveLength(1); expect(plan.others).toHaveLength(42);
    expect(plan.reviewRequestKeys).toHaveLength(3); expect(plan.reviewRequestKeys.every(k => k.endsWith(":visible-body-v1"))).toBe(true);
    expect(await rowsOf(s.gameId)).toEqual(before); expect(await s.budget.audit(s.worldId)).toEqual(cost);
    await expect(requireLocalPatchExtraAttempt(c, { gameId: s.gameId, hideId: hide.id, rowId, authorizationId: plan.authorizationId })).rejects.toThrow("no extra-attempt");
    const args = { gameId: s.gameId, sceneId: `gsc-${s.gameId}-amazon`, authorizationId: plan.authorizationId };
    expect(await requireLocalPatchExtraReview(c, args)).toMatchObject({ assessmentMode: "visible-body-v1" });
    expect(await db.$transaction(tx => fenceLocalPatchExtraReview(tx, args))).toMatchObject({ assessmentMode: "visible-body-v1" });
    await db.targetVariantAsset.update({ where: { id: rowId }, data: { status: "GENERATED" } });
    await expect(requireLocalPatchExtraReview(c, args)).rejects.toThrow("exact new contextual question");
    await db.targetVariantAsset.update({ where: { id: rowId }, data: { status: "FAILED" } });
    // A fresh paid answer now establishes visible HEAD scale, while body age
    // honestly stays unsure. The source image and all old paid evidence stay.
    const key = plan.reviewRequestKeys.find(k => k.startsWith("board:amazon:"))!, fresh = await retainAmazonReview(s, key, "pass");
    const judgeJson = JSON.stringify({ ...receipt, verdict: fresh.verdict, boardReview: { ...receipt.boardReview,
      requestKey: key, fingerprint: fresh.fingerprint, raw: fresh.wire.raw, assessmentMode: "visible-body-v1", extraAttemptAuthorizationId: plan.authorizationId } });
    await db.targetVariantAsset.update({ where: { id: rowId }, data: { status: "GENERATED", lastError: null, judgeJson } });
    await expect(requireLocalPatchExtraReview(c, args)).rejects.toThrow("publication binding");
    await db.$transaction(tx => recordLocalPatchPublicationPolicy(tx, { gameId: s.gameId, sceneVersion: 9, hideId: hide.id, variantId: rowId,
      attempts: 3, identityAssetId: plan.identityAssetId, identitySha256: plan.identitySha256, assetId, imageSha256: sha256Bytes(png),
      geometrySha256: localPatchPublicationGeometryHash(geometry), judgeJson }));
    expect(await requireLocalPatchExtraReview(c, args)).toMatchObject({ assessmentMode: "visible-body-v1" });
    expect(await db.$transaction(tx => fenceLocalPatchExtraReview(tx, args))).toMatchObject({ assessmentMode: "visible-body-v1" });
    expect(JSON.parse(judgeJson).verdict.ageAppropriate).toBe("unsure");
    expect((await db.targetVariantAsset.findUniqueOrThrow({ where: { id: rowId } })).attempts).toBe(3);
    expect(await s.budget.readRequest(s.worldId, `${hide.id}:${hide.pose}:render:4`)).toBeNull();
    expect((await rowsOf(s.gameId)).filter(r => r.id !== rowId)).toEqual(before.filter(r => r.id !== rowId));
    expect((await s.budget.audit(s.worldId)).committedMicroUsd).toBe(cost.committedMicroUsd + 1000);
  }, 120000);

  it("queues exactly three fourth attempts for free, freezes38 judgments and four unreviewed siblings, and is idempotent", async () => {
    const s = await seed("extra-stage"), before = await rowsOf(s.gameId), cost = await s.budget.audit(s.worldId);
    const plan = await stageLocalPatchExtraAttempts(c, inputOf(s.gameId));
    expect(plan.selected).toHaveLength(3); expect(plan.others).toHaveLength(42);
    expect(plan.others.filter(o => o.reviewState === "board-review-complete")).toHaveLength(38);
    expect(plan.others.filter(o => o.reviewState === "pending-board-review")).toHaveLength(4);
    expect(plan.selected.every(x => x.originalAttempt === 3 && x.authorizedAttempt === 4 && x.requestKey.endsWith(":render:4") && x.paid.length === 3)).toBe(true);
    expect(plan.reviewRequestKeys).toHaveLength(3); expect(plan.reviewRequestKeys.every(k => k.includes("1-1-1-1-4"))).toBe(true);
    expect(await rowsOf(s.gameId)).toEqual(before);
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${s.gameId}` } })).toMatchObject({ status: "QUEUED", currentStep: "local-patch", attempts: 83 });
    expect(await db.game.findUniqueOrThrow({ where: { id: s.gameId } })).toMatchObject({ status: "TARGETS_GENERATING", configJson: null });
    expect(await readLocalPatchExtraAttemptPlan(c, s.gameId)).toEqual(plan);
    expect(await stageLocalPatchExtraAttempts(c, inputOf(s.gameId, [...IDS].reverse()))).toEqual(plan);
    expect(await s.budget.audit(s.worldId)).toEqual(cost);
    for (const selected of plan.selected) expect(await requireLocalPatchExtraAttempt(c, { gameId: s.gameId,
      hideId: selected.hideId, rowId: selected.rowId, authorizationId: plan.authorizationId })).toEqual({ authorizedAttempt: 4, directive: selected.directive });
    const chosen = plan.selected[0]!;
    // The actual worker's default5s transaction must not re-decode42 images.
    expect(await db.$transaction(tx => fenceLocalPatchExtraAttempt(tx, { gameId: s.gameId, hideId: chosen.hideId,
      rowId: chosen.rowId, authorizationId: plan.authorizationId }))).toEqual({ authorizedAttempt: 4, directive: chosen.directive });
    expect(fetch).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled(); expect(enqueue).not.toHaveBeenCalled();
  }, 120000);

  it("supports two selected failures and rejects another selection, another game, a fifth attempt and changed immutable authority", async () => {
    const ids = ["sydney-v7-5", "greatwall-v7-5"], s = await seed("extra-two", ids), plan = await stageLocalPatchExtraAttempts(c, inputOf(s.gameId, ids));
    expect(plan.selected).toHaveLength(2); expect(plan.others).toHaveLength(43);
    await expect(stageLocalPatchExtraAttempts(c, inputOf(s.gameId, [ids[0]!]))).rejects.toThrow("another immutable");
    const selection = plan.selected[0]!, args = { gameId: s.gameId, hideId: selection.hideId, rowId: selection.rowId, authorizationId: plan.authorizationId };
    await expect(requireLocalPatchExtraAttempt(c, { ...args, gameId: "different-game" })).rejects.toThrow("persisted");
    await expect(requireLocalPatchExtraAttempt(c, { ...args, hideId: "amazon-v7-5" })).rejects.toThrow("no extra-attempt");
    await db.targetVariantAsset.update({ where: { id: selection.rowId }, data: { attempts: 5 } });
    await expect(requireLocalPatchExtraAttempt(c, args)).rejects.toThrow("fourth attempt");
    await expect(db.$transaction(tx => fenceLocalPatchExtraAttempt(tx, args))).rejects.toThrow("selected attempt");
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: LOCAL_PATCH_EXTRA_ATTEMPT_ACTION, entityId: s.gameId } });
    await db.auditLog.update({ where: { id: audit.id }, data: { metaJson: JSON.stringify({ ...plan, reason: "Tampered authorization reason" }) } });
    await expect(readLocalPatchExtraAttemptPlan(c, s.gameId)).rejects.toThrow("digest");
  }, 120000);

  it("allows same-key pending4 recovery, but refuses unrelated pending or unknown charges and altered prior paid evidence", async () => {
    const s = await seed("extra-replay"), plan = await stageLocalPatchExtraAttempts(c, inputOf(s.gameId)), selection = plan.selected[0]!;
    const args = { gameId: s.gameId, hideId: selection.hideId, rowId: selection.rowId, authorizationId: plan.authorizationId };
    await db.targetVariantAsset.update({ where: { id: selection.rowId }, data: { status: "PENDING", attempts: 4, lastError: null } });
    await s.budget.reserve(s.worldId, { requestKey: selection.requestKey, scope: "image", operationFingerprint: "e".repeat(64), reserveMicroUsd: 120000 });
    expect(await requireLocalPatchExtraAttempt(c, args)).toMatchObject({ authorizedAttempt: 4 });
    expect(await db.$transaction(tx => fenceLocalPatchExtraAttempt(tx, args))).toMatchObject({ authorizedAttempt: 4 });
    const priorKey = retainedPurchaseKey(s.worldId, selection.paid[0]!.requestKey), blob = await db.fileBlob.findUniqueOrThrow({ where: { key: priorKey } });
    await db.fileBlob.delete({ where: { key: priorKey } });
    await expect(requireLocalPatchExtraAttempt(c, args)).rejects.toThrow("paid evidence");
    await db.fileBlob.create({ data: blob });
    await s.budget.markUnknown(s.worldId, selection.requestKey, "Provider transport was lost");
    await expect(requireLocalPatchExtraAttempt(c, args)).rejects.toThrow("ledger");
  }, 120000);

  it("permits only a publication-bound first review of the original pending siblings and preserves every previously judged result", async () => {
    const s = await seed("extra-first-review"), plan = await stageLocalPatchExtraAttempts(c, inputOf(s.gameId)), selected = plan.selected[0]!;
    const args = { gameId: s.gameId, hideId: selected.hideId, rowId: selected.rowId, authorizationId: plan.authorizationId };
    const waiting = plan.others.find(o => o.reviewState === "pending-board-review")!, old = JSON.parse(waiting.judgeJson);
    const board = BOARDS.find(b => b.board === "greatwall")!, raw = JSON.stringify({ hides: board.hides.map(h => ({ hideId: h.id,
      evidenceIds: [`${h.id}:before`, `${h.id}:after`], verdict: GOOD })) });
    const verdict = parseLocalPatchBoardVerdicts(raw, board.hides.map(h => h.id), 9)[waiting.hideId];
    const judgeJson = JSON.stringify({ ...old, reviewState: "board-review-complete", verdict,
      boardReview: { version: "local-patch-board-five-quality/v5-evidence-labeled", compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION, raw } });
    await db.targetVariantAsset.update({ where: { id: waiting.rowId }, data: { judgeJson } });
    await expect(requireLocalPatchExtraAttempt(c, args)).rejects.toThrow("publication binding");
    await expect(db.$transaction(tx => fenceLocalPatchExtraAttempt(tx, args))).rejects.toThrow("publication binding");
    const row = await db.targetVariantAsset.findUniqueOrThrow({ where: { id: waiting.rowId } });
    await db.$transaction(tx => recordLocalPatchPublicationPolicy(tx, { gameId: s.gameId, sceneVersion: 9, hideId: waiting.hideId,
      variantId: waiting.rowId, attempts: row.attempts, identityAssetId: plan.identityAssetId, identitySha256: plan.identitySha256,
      assetId: row.assetId!, imageSha256: waiting.imageSha256, geometrySha256: waiting.geometrySha256, judgeJson }));
    expect(await requireLocalPatchExtraAttempt(c, args)).toMatchObject({ authorizedAttempt: 4 });
    expect(await db.$transaction(tx => fenceLocalPatchExtraAttempt(tx, args))).toMatchObject({ authorizedAttempt: 4 });
    const reviewed = plan.others.find(o => o.reviewState === "board-review-complete")!;
    await db.targetVariantAsset.update({ where: { id: reviewed.rowId }, data: { judgeJson: `${reviewed.judgeJson} ` } });
    await expect(requireLocalPatchExtraAttempt(c, args)).rejects.toThrow("reviewed judgment changed");
    await expect(db.$transaction(tx => fenceLocalPatchExtraAttempt(tx, args))).rejects.toThrow("unselected appearance");
  }, 120000);

  it("fails closed before staging for nonadmin, nonQA, active worker, wrong selection, exhausted extra key, or pending charges", async () => {
    const s = await seed("extra-stage-guards"), originalRows = await rowsOf(s.gameId), input = inputOf(s.gameId);
    await expect(stageLocalPatchExtraAttempts(c, { ...input, operatorId: s.userId })).rejects.toThrow("administrator");
    fake.appEnv = "production"; await expect(stageLocalPatchExtraAttempts(c, input)).rejects.toThrow("QA"); fake.appEnv = "qa";
    await expect(stageLocalPatchExtraAttempts(c, { ...input, hideIds: ["sydney-v7-1"] })).rejects.toThrow("bounded");
    await db.generationJob.update({ where: { id: `job_${s.gameId}` }, data: { status: "RUNNING" } });
    await expect(stageLocalPatchExtraAttempts(c, input)).rejects.toThrow("terminal and inactive");
    await db.generationJob.update({ where: { id: `job_${s.gameId}` }, data: { status: "DONE" } });
    await s.budget.reserve(s.worldId, { requestKey: "unrelated-pending", scope: "image", operationFingerprint: "d".repeat(64), reserveMicroUsd: 10 });
    await expect(stageLocalPatchExtraAttempts(c, input)).rejects.toThrow("ledger must be settled");
    await s.budget.settle(s.worldId, "unrelated-pending", bill("req-unrelated", 10));
    const hide = BOARDS.find(b => b.board === "sydney")!.hides[4]!, key = `${hide.id}:${hide.pose}:render:4`;
    await s.budget.reserve(s.worldId, { requestKey: key, scope: "image", operationFingerprint: "c".repeat(64), reserveMicroUsd: 120000 });
    await s.budget.settle(s.worldId, key, bill("already-fourth"));
    await expect(stageLocalPatchExtraAttempts(c, input)).rejects.toThrow("fourth image key already exists");
    expect(await rowsOf(s.gameId)).toEqual(originalRows);
    expect(await db.auditLog.count({ where: { action: LOCAL_PATCH_EXTRA_ATTEMPT_ACTION, entityId: s.gameId } })).toBe(0);
  }, 120000);

  it("rejects changed identity, refund, unselected pixels/geometry and reordered ownership while preserving the original cap", async () => {
    const s = await seed("extra-live-guards"), plan = await stageLocalPatchExtraAttempts(c, inputOf(s.gameId)), selected = plan.selected[0]!;
    const args = { gameId: s.gameId, hideId: selected.hideId, rowId: selected.rowId, authorizationId: plan.authorizationId };
    const child = await db.childProfile.findUniqueOrThrow({ where: { id: `chl-${s.gameId}` } });
    await db.childProfile.update({ where: { id: child.id }, data: { ageYears: 8 } });
    await expect(requireLocalPatchExtraAttempt(c, args)).rejects.toThrow();
    await expect(db.$transaction(tx => fenceLocalPatchExtraAttempt(tx, args))).rejects.toThrow("Identity");
    await db.childProfile.update({ where: { id: child.id }, data: { ...child } });
    const other = plan.others[0]!, asset = await db.asset.findUniqueOrThrow({ where: { id: other.assetId } });
    await c.storage.put(asset.storagePath, Buffer.from("not the original image"), "image/png");
    await expect(requireLocalPatchExtraAttempt(c, args)).rejects.toThrow();
    await c.storage.put(asset.storagePath, png, "image/png");
    await db.targetVariantAsset.update({ where: { id: other.rowId }, data: { headAnchorJson: '{"x":0,"y":0}' } });
    await expect(requireLocalPatchExtraAttempt(c, args)).rejects.toThrow("unselected");
    await db.order.update({ where: { id: `ord-${s.gameId}` }, data: { paymentStatus: "REFUNDED", refundedAt: new Date() } });
    await expect(requireLocalPatchExtraAttempt(c, args)).rejects.toThrow("nonrefunded");
    await expect(db.$transaction(tx => fenceLocalPatchExtraAttempt(tx, args))).rejects.toThrow("paid order");
    expect((await s.budget.audit(s.worldId)).capMicroUsd).toBe(4000000);
  }, 120000);
});
