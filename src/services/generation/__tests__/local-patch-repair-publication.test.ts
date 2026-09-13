import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { MockPaymentProvider } from "../../../infra/payment/mock";
import { MockAvatarProvider, NoopFaceDetector } from "../../../infra/generation/mock";
import { NoPatchJudge } from "../../../infra/generation/judge";
import { NoopAnalytics } from "../../../infra/analytics/console";
import { InlineJobRunner } from "../../../infra/jobs/inline";
import type { Container } from "../../container";
import { localPatchBoardForVersion } from "../../../domain/scene/local-patch-catalog";
import { prepareLocalPatchRepairReview, reviewLocalPatchRepair } from "../local-patch-repair-review";
import { hasLocalPatchPublicationPolicy, recordLocalPatchPublicationPolicy, localPatchPublicationGeometryHash,
  localPatchRepairSiblingInvariantHash,
  LOCAL_PATCH_PUBLICATION_ACTION, LOCAL_PATCH_PAID_REPAIR_PUBLICATION_POLICY, type LocalPatchPublicationBinding } from "../local-patch-publication-policy";
import { LOCAL_PATCH_COMPOSITION_VERSION } from "../local-patch-seam";
import { retainedPurchaseKey } from "../../../infra/db/prisma-retained-purchase-store";
import { seedApprovedGame, clearWorld, PASSING_ANSWER } from "./local-patch-fixtures";
import type { PaidRepairBatch } from "../local-patch-paid-repair";
const state = vi.hoisted(() => ({ testers: [] as string[] }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0,
  GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: state.testers }), flag: () => false }));
const GAME = "game-repair-publication", hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const BATCH_ID = `aud_lpmr_${hash(GAME).slice(0, 32)}`;
let dir: string, db: PrismaClient, c: Container, batch: PaidRepairBatch, input: LocalPatchPublicationBinding;
beforeAll(async () => {
  dir = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-repair-publication-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(dir, "test.sqlite").split(path.sep).join("/")}` } } }); await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), appUrl: "http://localhost:3000", secret: "synthetic",
    payment: new MockPaymentProvider("http://localhost:3000", "synthetic"), avatars: new MockAvatarProvider(), judge: new NoPatchJudge(),
    faces: new NoopFaceDetector(), analytics: new NoopAnalytics(), jobs: new InlineJobRunner(),
    email: { id: "console", send: async () => { throw new Error("No mail in publication binding test"); } }, adminEmails: [] };
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("No network"); }));
}, 180000);
afterAll(async () => { vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(dir) === realpathSync(tmpdir()) && path.basename(dir).startsWith("findme-repair-publication-")) rmSync(dir, { recursive: true, force: true }); });
beforeEach(async () => {
  await clearWorld(db);
  const seeded = await seedApprovedGame(c, db, { gameId: GAME, approved: false, status: "TARGETS_GENERATING", styleVersion: "local-patch-world-v1",
    scenes: [{ slug: "tokyo", version: 8 }, { slug: "greatwall", version: 8 }] }); state.testers = [seeded.email];
  await db.asset.update({ where: { id: `ast-sheet-${GAME}` }, data: { status: "READY" } });
  const png = await sharp({ create: { width: 512, height: 768, channels: 4, background: "tan" } }).png().toBuffer();
  batch = { version: 1, gameId: GAME, ownerId: seeded.userId, childId: `chl-${GAME}`, identityAssetId: `ast-sheet-${GAME}`, identitySha256: sha(seeded.sheet),
    identityPath: `private/sheet-${GAME}.png`, ageYears: 8, photoAssetId: `ast-photo-${GAME}`, photoCropJson: null,
    inputSha256: "c".repeat(64), state: "committed", reason: null, operatorId: "authorized-admin", authorizationReason: "Recompose paid pixels, not approve visuals",
    baseline: Array.from({ length: 45 }, (_, i) => ({ id: `variant-${i}`, sha256: hash(i) })), candidates: [], reviews: [] };
  for (const [index, boardId] of ["tokyo", "greatwall"].entries()) {
    const board = localPatchBoardForVersion(boardId, 8)!, hide = board.hides[index === 0 ? 2 : 4]!;
    const sceneId = `gsc-${GAME}-${boardId}`, assetId = `asset-repair-${index}`, targetInstanceId = `target-${index}`, rowId = `variant-${index}`;
    const geometry = { rectJson: JSON.stringify({ x: 0.1, y: 0.1, w: 0.2, h: 0.3 }), hitRectJson: JSON.stringify({ x: 0.15, y: 0.15, w: 0.05, h: 0.1 }), headAnchorJson: JSON.stringify({ x: 0.17, y: 0.15 }) };
    await c.storage.put(`game/${assetId}.png`, png, "image/png");
    await db.asset.create({ data: { id: assetId, ownerId: seeded.userId, type: "TARGET_SPRITE", visibility: "GAME", status: "READY", provider: "local-patch",
      providerRequestId: GAME, storagePath: `game/${assetId}.png`, mimeType: "image/png", bytes: png.length, width: 512, height: 768 } });
    await db.targetInstance.create({ data: { id: targetInstanceId, gameSceneId: sceneId, targetId: hide.targetId, targetType: "child", spriteKind: "image", slotAId: "a", slotBId: "b" } });
    await db.targetVariantAsset.create({ data: { id: rowId, targetInstanceId, variant: "A", slotId: "a", status: "GENERATED", provider: "local-patch", attempts: 3, assetId, ...geometry } });
    const candidate: PaidRepairBatch["candidates"][number] = { hideId: hide.id, boardId, sceneId, rowId, targetInstanceId, assetId, imageSha256: sha(png), alphaAssetId: `alpha-${index}`,
      geometry, geometrySha256: localPatchPublicationGeometryHash(geometry), faceRect: { left: 30, top: 40, width: 34, height: 37 },
      rawRequestKey: `${hide.id}:${hide.pose}:render:2`, rawPayloadSha256: "d".repeat(64), rawFingerprint: "e".repeat(64), originalBoardSha256: "f".repeat(64),
      audit: { state: "UNREVIEWED", originalRawSeamReport: { verdict: "misaligned" } } };
    batch.candidates.push(candidate);
    const prepared = await prepareLocalPatchRepairReview({ gameId: GAME, batchId: BATCH_ID, batchSha256: batch.inputSha256,
      faceRois: [{ hideId: hide.id, rect: candidate.faceRect }], request: { boardId, contentVersion: 8, boardPng: png, identityPng: png,
        hides: board.hides.map(h => ({ hideId: h.id, beforePng: png, afterPng: png, closeupPng: png, afterEvidencePng: png })) } });
    const raw = JSON.stringify({ hides: board.hides.map(h => ({ hideId: h.id, verdict: { ...PASSING_ANSWER, faceLikeness: "pass", faceReadable: "pass", severeSeam: "pass" } })) });
    const result = await reviewLocalPatchRepair(c, prepared, { fence: async () => {}, judge: async () => ({ verdict: null, raw, usage: { prompt_tokens: 1000, completion_tokens: 300 },
      requestId: `req-${boardId}-repair`, model: "gpt-5.6-sol", finishReason: "stop", wireFault: null, costUnknown: false }) });
    expect(result.state).toBe("pass");
    batch.reviews.push({ boardId, requestKey: result.requestKey, fingerprint: result.operationFingerprint, result });
    const judgeJson = JSON.stringify({ hide: hide.id, reviewState: "board-review-complete", wireFault: null, renderFault: null,
      verdict: result.verdicts![hide.id], judgedSha256: candidate.imageSha256, geometrySha256: candidate.geometrySha256, compositionVersion: "paid-mask-join/v1",
      paidRepair: { batchId: BATCH_ID, batchSha256: batch.inputSha256, selectedRawRequestKey: candidate.rawRequestKey, originalDiagnostic: candidate.audit },
      boardReview: { version: result.version, requestKey: result.requestKey, fingerprint: result.operationFingerprint, wireHashes: result.wireHashes, raw: result.raw,
        model: result.evidence!.model, effort: "low", costMicroUsd: result.evidence!.amountMicroUsd, compositionVersion: "paid-mask-join/v1" } });
    await db.targetVariantAsset.update({ where: { id: rowId }, data: { judgeJson } });
    if (index === 0) input = { gameId: GAME, sceneVersion: 8, hideId: hide.id, variantId: rowId, attempts: 3,
      identityAssetId: batch.identityAssetId, identitySha256: batch.identitySha256, assetId, imageSha256: candidate.imageSha256, geometrySha256: candidate.geometrySha256, judgeJson };
  }
  await db.auditLog.create({ data: { id: BATCH_ID, action: "local-patch:paid-mask-repair", actorType: "ADMIN", actorId: batch.operatorId, entityType: "Game", entityId: GAME, metaJson: JSON.stringify(batch) } });
});
const saveBatch = () => db.auditLog.update({ where: { id: BATCH_ID }, data: { metaJson: JSON.stringify(batch) } });
const record = () => db.$transaction(tx => recordLocalPatchPublicationPolicy(tx, input));

async function prepareUnchangedSiblings() {
  const candidate = batch.candidates[1]!, board = localPatchBoardForVersion("greatwall", 8)!;
  const result = batch.reviews[1]!.result!, bindings: LocalPatchPublicationBinding[] = [];
  const originals = [];
  batch.reviewedSiblings = [];
  for (const [i, hide] of board.hides.slice(0, 4).entries()) {
    const id = `variant-${i + 2}`, targetInstanceId = `unchanged-target-${i}`, assetId = `unchanged-asset-${i}`;
    const bytes = await c.storage.get(`game/${candidate.assetId}.png`);
    await c.storage.put(`game/${assetId}.png`, bytes, "image/png");
    await db.asset.create({ data: { id: assetId, ownerId: batch.ownerId, type: "TARGET_SPRITE", visibility: "GAME", status: "READY", provider: "local-patch",
      providerRequestId: GAME, storagePath: `game/${assetId}.png`, mimeType: "image/png", bytes: bytes.length, width: 512, height: 768 } });
    await db.targetInstance.create({ data: { id: targetInstanceId, gameSceneId: candidate.sceneId, targetId: hide.targetId, targetType: "child",
      spriteKind: "image", slotAId: "a", slotBId: "b" } });
    const oldJudge = { hide: hide.id, pose: hide.pose, reviewState: "pending-board-review", verdict: null, wireFault: null, renderFault: null,
      judgedSha256: sha(bytes), geometrySha256: candidate.geometrySha256, compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION };
    const original = await db.targetVariantAsset.create({ data: { id, targetInstanceId, variant: "A", slotId: "a", status: "GENERATED", provider: "local-patch",
      attempts: (i % 3) + 1, assetId, ...candidate.geometry, costCents: 3, judgeJson: JSON.stringify(oldJudge) } });
    originals.push(original);
    const baselineSha256 = hash(original);
    batch.baseline.find(row => row.id === id)!.sha256 = baselineSha256;
    batch.reviewedSiblings.push({ hideId: hide.id, boardId: board.board, sceneId: candidate.sceneId, rowId: id, targetInstanceId, assetId,
      imageSha256: sha(bytes), geometry: candidate.geometry, geometrySha256: candidate.geometrySha256, attempts: original.attempts,
      baselineSha256, preservedSha256: localPatchRepairSiblingInvariantHash(original), compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION });
    const pendingBinding = { ...input, hideId: hide.id, variantId: id, attempts: original.attempts, assetId, imageSha256: sha(bytes), judgeJson: original.judgeJson };
    expect(await hasLocalPatchPublicationPolicy(c, pendingBinding)).toBe(false);
    const judgeJson = JSON.stringify({ ...oldJudge, reviewState: "board-review-complete", verdict: result.verdicts![hide.id],
      paidRepair: { kind: "reviewed-unchanged-sibling", batchId: BATCH_ID, batchSha256: batch.inputSha256, baselineSha256 },
      boardReview: { version: result.version, requestKey: result.requestKey, fingerprint: result.operationFingerprint, wireHashes: result.wireHashes,
        raw: result.raw, model: result.evidence!.model, effort: "low", costMicroUsd: result.evidence!.amountMicroUsd, compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION } });
    await db.targetVariantAsset.update({ where: { id }, data: { judgeJson } });
    bindings.push({ ...pendingBinding, judgeJson });
  }
  await saveBatch();
  return { bindings, originals };
}
describe("paid repair publication is a separate, fully retained machine decision", () => {
  it("records/replays a committed machine-bound candidate without rewriting judge or original diagnostics", async () => {
    await record(); expect(await hasLocalPatchPublicationPolicy(c, input)).toBe(true);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: LOCAL_PATCH_PUBLICATION_ACTION } });
    expect(JSON.parse(audit.metaJson!).policy).toBe(LOCAL_PATCH_PAID_REPAIR_PUBLICATION_POLICY);
    expect((await db.targetVariantAsset.findUniqueOrThrow({ where: { id: input.variantId } })).judgeJson).toBe(input.judgeJson);
    await record(); expect(await db.auditLog.count({ where: { action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(1);
  });
  it.each(["missing", "staged", "blocked"])("refuses a %s batch before minting a binding", async status => {
    if (status === "missing") await db.auditLog.delete({ where: { id: BATCH_ID } });
    else { batch.state = status as "staged" | "blocked"; await saveBatch(); }
    await expect(record()).rejects.toThrow("quality policy"); expect(await hasLocalPatchPublicationPolicy(c, input)).toBe(false);
  });
  it.each(["image", "identity", "geometry", "attempt", "age"])("an existing binding cannot outlive changed %s", async field => {
    await record();
    if (field === "image" || field === "identity") {
      const asset = await db.asset.findUniqueOrThrow({ where: { id: field === "image" ? input.assetId : input.identityAssetId } });
      await db.fileBlob.update({ where: { key: asset.storagePath }, data: { data: Buffer.from("changed paid image") } });
    } else if (field === "age") await db.childProfile.update({ where: { id: batch.childId }, data: { ageYears: 9 } });
    else await db.targetVariantAsset.update({ where: { id: input.variantId }, data: field === "geometry" ? { hitRectJson: "{}" } : { attempts: 2 } });
    expect(await hasLocalPatchPublicationPolicy(c, input)).toBe(false);
  });
  it("requires the second board's genuine bill too", async () => {
    await record(); batch.reviews[1]!.result!.evidence!.amountMicroUsd++;
    await saveBatch(); expect(await hasLocalPatchPublicationPolicy(c, input)).toBe(false);
  });
  it("refuses a forged retained verdict even when the batch says pass", async () => {
    await record(); batch.reviews[1]!.result!.raw = '{"hides":[]}'; await saveBatch();
    expect(await hasLocalPatchPublicationPolicy(c, input)).toBe(false);
  });
  it("requires retained bytes, not just matching bill fields in an audit", async () => {
    await record(); await db.fileBlob.delete({ where: { key: retainedPurchaseKey(`${GAME}:board-wizard`, batch.reviews[1]!.requestKey) } });
    expect(await hasLocalPatchPublicationPolicy(c, input)).toBe(false);
  });
  it("keeps the normal v8 policy version and path unchanged", async () => {
    const normal = { ...input, judgeJson: JSON.stringify({ reviewState: "board-review-complete", wireFault: null, compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION,
      boardReview: { version: "local-patch-board-five-quality/v3-head-safe", compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION },
      verdict: { ...PASSING_ANSWER, faceLikeness: "pass", faceReadable: "pass", severeSeam: "pass" } }) };
    await db.$transaction(tx => recordLocalPatchPublicationPolicy(tx, normal));
    expect(await hasLocalPatchPublicationPolicy(c, normal)).toBe(true);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: LOCAL_PATCH_PUBLICATION_ACTION } });
    expect(JSON.parse(audit.metaJson!).policy).toBe("publish-with-severe-quality-guard/v2");
  });
  it("binds all four first-reviewed siblings while preserving their pixels, attempts, geometry and costs", async () => {
    const { bindings, originals } = await prepareUnchangedSiblings();
    const retained = await db.fileBlob.findMany({ orderBy: { key: "asc" } });
    for (const binding of bindings) {
      await db.$transaction(tx => recordLocalPatchPublicationPolicy(tx, binding));
      expect(await hasLocalPatchPublicationPolicy(c, binding)).toBe(true);
      const current = await db.targetVariantAsset.findUniqueOrThrow({ where: { id: binding.variantId } });
      const before = originals.find(row => row.id === current.id)!;
      expect(localPatchRepairSiblingInvariantHash(current)).toBe(localPatchRepairSiblingInvariantHash(before));
      expect(JSON.parse(current.judgeJson!).compositionVersion).toBe(LOCAL_PATCH_COMPOSITION_VERSION);
      expect(JSON.parse(current.judgeJson!).paidRepair.selectedRawRequestKey).toBeUndefined();
    }
    expect(await db.fileBlob.findMany({ orderBy: { key: "asc" } })).toEqual(retained);
    expect((await db.auditLog.findMany({ where: { action: LOCAL_PATCH_PUBLICATION_ACTION } })).map(row => JSON.parse(row.metaJson!).policy))
      .toEqual(Array(4).fill(LOCAL_PATCH_PAID_REPAIR_PUBLICATION_POLICY));
    // Selected candidates do not depend on whether sibling bindings were written first.
    await record(); expect(await hasLocalPatchPublicationPolicy(c, input)).toBe(true);
  });
  it.each(["cost", "attempt", "geometry", "image", "baseline", "composition", "missing-snapshot", "borrowed-board-review"])(
    "an unchanged sibling cannot be published after changed %s", async change => {
      const { bindings } = await prepareUnchangedSiblings(), binding = bindings[0]!;
      await db.$transaction(tx => recordLocalPatchPublicationPolicy(tx, binding));
      if (change === "cost") await db.targetVariantAsset.update({ where: { id: binding.variantId }, data: { costCents: 99 } });
      if (change === "attempt") await db.targetVariantAsset.update({ where: { id: binding.variantId }, data: { attempts: 3 } });
      if (change === "geometry") await db.targetVariantAsset.update({ where: { id: binding.variantId }, data: { hitRectJson: "{}" } });
      if (change === "image") await db.fileBlob.update({ where: { key: `game/${binding.assetId}.png` }, data: { data: Buffer.from("changed") } });
      if (change === "baseline") { batch.baseline.find(row => row.id === binding.variantId)!.sha256 = "e".repeat(64); await saveBatch(); }
      if (change === "composition") { batch.reviewedSiblings![0]!.compositionVersion = "bounded-return/v2-head-safe"; await saveBatch(); }
      if (change === "missing-snapshot") { batch.reviewedSiblings = []; await saveBatch(); }
      if (change === "borrowed-board-review") {
        const other = batch.reviews[0]!.result!, receipt = JSON.parse(binding.judgeJson!);
        receipt.boardReview.requestKey = other.requestKey;
        binding.judgeJson = JSON.stringify(receipt);
        await db.targetVariantAsset.update({ where: { id: binding.variantId }, data: { judgeJson: binding.judgeJson } });
      }
      expect(await hasLocalPatchPublicationPolicy(c, binding)).toBe(false);
      await expect(db.$transaction(tx => recordLocalPatchPublicationPolicy(tx, binding))).rejects.toThrow("quality policy");
    });
});
