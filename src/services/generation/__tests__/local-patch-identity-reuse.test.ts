import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { MockPaymentProvider } from "../../../infra/payment/mock";
import { NoPatchJudge } from "../../../infra/generation/judge";
import { NoopFaceDetector } from "../../../infra/generation/mock";
import { PrismaWorldBudgetStore } from "../../../infra/db/prisma-world-budget-store";
import type { Container } from "../../container";
import { handlePaymentWebhook } from "../../order.service";
import { deleteGame } from "../../game.service";
import { WORLD_LOCAL_PATCH_HIDES } from "../../../domain/scene/local-patch-hides";
import { seedApprovedGame, boardPng, paintedCrop, paintedOk, bill, reply } from "./local-patch-fixtures";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { boardConditioningHash } from "../board-conditioned-source";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { IDENTITY_GATE_ACTION, identityApprovedForDisplay, requireBoardWizardIdentityApproval } from "../board-wizard-identity-gate";
import { runGenerationPipeline } from "../pipeline";
import { LOCAL_PATCH_QUALITY_FAILED, runLocalPatchWorldSlice } from "../local-patch-world";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { sceneBySlug } from "../../scene-catalog.service";
import { composeGame, composeScene } from "../../../domain/game/compose";
import { GameConfigSchema } from "../../../domain/game/config";
import { enqueueLocalPatchNotifications } from "../../local-patch-notifications";
import { sha256Bytes } from "../fixed-sprite";
import { createCanonicalIdentityReuse, requireCanonicalIdentityReuse, finishCanonicalIdentityReuse,
  CANONICAL_IDENTITY_REUSE_ACTION, CANONICAL_IDENTITY_REUSE_CONFIRMATION } from "../local-patch-identity-reuse";

const state = vi.hoisted(() => ({ appEnv: "qa", testers: [] as string[] }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: state.appEnv, GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0,
  GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium", OPENAI_API_KEY: "synthetic-never-live" }),
  spendGuard: () => ({ appEnv: state.appEnv, realGeneration: true, testers: state.testers }), flag: () => false, adminEmails: () => [] }));

let db: PrismaClient, scratch: string, counter = 0;
const createCharacter = vi.fn(async () => { throw new Error("No identity purchase is permitted"); });
beforeAll(async () => {
  scratch = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-identity-reuse-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "reuse.sqlite").split(path.sep).join("/")}` } } });
  await applyTestSchema(db);
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Network forbidden in canonical reuse tests"); }));
});
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  const target = path.resolve(scratch);
  if (path.dirname(target) === realpathSync(tmpdir()) && path.basename(target).startsWith("findme-identity-reuse-")) rmSync(target, { recursive: true, force: true });
});

async function fixture() {
  const gameId = `reuse-source-${++counter}`, payment = new MockPaymentProvider("http://localhost:3000", "synthetic-reuse-secret");
  const c: Container = { db, storage: new DbStorage(db), payment,
    avatars: { id: "openai", createCharacter, createAvatar: async () => { throw new Error("No avatar provider"); }, createTargetSprite: async () => { throw new Error("No legacy provider"); } },
    judge: new NoPatchJudge(), faces: new NoopFaceDetector(), email: { id: "console", send: async () => ({ id: "synthetic-email" }) },
    analytics: { id: "none", track: () => {} }, jobs: { id: "in-process", register: () => {}, enqueue: async () => {} },
    appUrl: "http://localhost:3000", secret: "synthetic-reuse-secret", adminEmails: [] };
  const source = await seedApprovedGame(c, db, { gameId, styleVersion: "local-patch-world-v1", status: "DELIVERED",
    scenes: WORLD_LOCAL_PATCH_HIDES.map(board => ({ slug: board.board, version: 6 })) });
  c.adminEmails = [source.email]; state.testers.push(source.email);
  await db.game.update({ where: { id: gameId }, data: { paidAt: new Date(), readyAt: new Date(), deliveredAt: new Date() } });
  await db.order.create({ data: { id: `ord-${gameId}`, userId: source.userId, gameId, amountAgorot: 5900, currency: "ILS",
    provider: "mock", paymentStatus: "PAID", paidAt: new Date(), packageTier: "ONE_WORLD" } });
  const gate = await db.auditLog.findFirstOrThrow({ where: { action: IDENTITY_GATE_ACTION, entityId: `ast-sheet-${gameId}` } });
  const receipt = JSON.parse(gate.metaJson!);
  const usage = { input_tokens: 100, output_tokens: 300 }, requestId = `req-paint-${gameId}`;
  const budget = boardWizardBudgetOf(c);
  await budget.reserve(boardWizardWorldId(gameId), { requestKey: "wizard:identity:1", operationFingerprint: sha256Bytes(Buffer.from(gameId)), scope: "identity", reserveMicroUsd: 150_000 });
  await budget.settle(boardWizardWorldId(gameId), "wizard:identity:1", { providerNamespace: "openai:find-me-existing", providerRequestId: requestId,
    usageId: boardConditioningHash(usage), rawUsage: usage, model: "gpt-image-2", amountMicroUsd: 100_000, costBasis: "conservative-upper-estimate" });
  await db.auditLog.create({ data: { id: `paint-${gameId}`, actorType: "SYSTEM", action: "sheet:painted", entityType: "Asset", entityId: `ast-sheet-${gameId}`,
    metaJson: JSON.stringify({ gameId, requestId, usage, model: "gpt-image-2", costCents: 10, costUnknown: false, identityProvenance: receipt.provenance }) } });
  await db.auditLog.create({ data: { id: `purge-${gameId}`, actorType: "SYSTEM", action: "local-patch:photo-purged-after-approval", entityType: "Asset", entityId: `ast-sheet-${gameId}`,
    metaJson: JSON.stringify({ photoAssetId: `ast-photo-${gameId}`, approvalFingerprint: receipt.fingerprint, ageYears: 8 }) } });
  await db.childProfile.update({ where: { id: `chl-${gameId}` }, data: { originalPhotoAssetId: null } });
  await db.asset.update({ where: { id: `ast-photo-${gameId}` }, data: { status: "DELETED", deletedAt: new Date() } });
  await db.fileBlob.delete({ where: { key: `private/photo-${gameId}.jpg` } });
  const actor = { type: "ADMIN" as const, id: source.userId };
  const input = { sourceGameId: gameId, sourceIdentityAssetId: `ast-sheet-${gameId}`, requestId: `request-${gameId}`, displayName: "עומר", confirmation: CANONICAL_IDENTITY_REUSE_CONFIRMATION };
  return { c, source, input, actor, payment, receipt };
}

async function pay(f: Awaited<ReturnType<typeof fixture>>, game: { orderId: string }) {
  const order = await db.order.findUniqueOrThrow({ where: { id: game.orderId } });
  const raw = JSON.stringify({ eventId: `event-${order.id}`, orderId: order.id, kind: "PAID", amountAgorot: order.amountAgorot, currency: order.currency });
  expect((await handlePaymentWebhook(f.c, raw, { "x-mock-signature": f.payment.sign(raw) })).status).toBe(200);
}

describe("explicit QA adoption of a paid canonical identity whose photo was privacy-purged", () => {
  it("copies exact sheet bytes into a separate unpaid v8 checkout and leaves the source and its entire ledger unchanged", async () => {
    const f = await fixture(), sourceBefore = await db.game.findUniqueOrThrow({ where: { id: f.source.gameId } });
    const ledgerBefore = await new PrismaWorldBudgetStore(db).read(boardWizardWorldId(f.source.gameId));
    const result = await createCanonicalIdentityReuse(f.c, f.input, f.actor);
    const game = await db.game.findUniqueOrThrow({ where: { id: result.gameId }, include: { childProfile: true, scenes: true, orders: true } });
    expect(game).toMatchObject({ status: "CHECKOUT_PENDING", paidAt: null, ownerId: f.source.userId });
    expect(game.childProfile).toMatchObject({ displayName: "עומר", ageYears: 8, originalPhotoAssetId: null });
    expect(game.scenes).toHaveLength(9); expect(game.scenes.every(scene => scene.sceneVersion === 8)).toBe(true);
    expect(game.orders).toHaveLength(1); expect(game.orders[0]).toMatchObject({ paymentStatus: "PENDING", provider: "mock" });
    const sheet = await db.asset.findUniqueOrThrow({ where: { id: game.childProfile!.identityAssetId! } });
    expect((await f.c.storage.get(sheet.storagePath)).equals(f.source.sheet)).toBe(true);
    expect(sheet).toMatchObject({ provider: "canonical-identity-reuse", providerRequestId: result.gameId, costCents: 0, visibility: "PRIVATE" });
    expect(await db.auditLog.count({ where: { entityId: sheet.id, action: { in: ["sheet:painted", IDENTITY_GATE_ACTION] } } })).toBe(0);
    expect(await db.generationJob.count({ where: { gameId: result.gameId } })).toBe(0);
    expect(await new PrismaWorldBudgetStore(db).read(boardWizardWorldId(result.gameId))).toBeNull();
    expect(await db.game.findUniqueOrThrow({ where: { id: f.source.gameId } })).toEqual(sourceBefore);
    expect(await new PrismaWorldBudgetStore(db).read(boardWizardWorldId(f.source.gameId))).toEqual(ledgerBefore);
    expect(await createCanonicalIdentityReuse(f.c, f.input, f.actor)).toEqual({ ...result, replayed: true });
    await expect(createCanonicalIdentityReuse(f.c, { ...f.input, displayName: "שם אחר" }, f.actor)).rejects.toThrow("already used");
    expect(createCharacter).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it("passes actual signed sandbox payment → pipeline → hide identity gate without rendering or billing identity again", async () => {
    const f = await fixture(), result = await createCanonicalIdentityReuse(f.c, f.input, f.actor);
    await runGenerationPipeline(f.c, result.gameId);
    expect(await db.generationJob.count({ where: { gameId: result.gameId } })).toBe(0);
    await pay(f, result); await runGenerationPipeline(f.c, result.gameId);
    const game = await db.game.findUniqueOrThrow({ where: { id: result.gameId }, include: { childProfile: true } });
    expect(game.status).toBe("TARGETS_GENERATING");
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${result.gameId}` } })).toMatchObject({ status: "QUEUED", currentStep: "local-patch", attempts: 1 });
    const approved = await requireBoardWizardIdentityApproval(f.c, boardWizardBudgetOf(f.c), { gameId: result.gameId,
      identityAssetId: game.childProfile!.identityAssetId!, sheetSha256: sha256Bytes(f.source.sheet), photoAssetId: null,
      ageYears: 8, crop: null, catalogSha256: (await readBoardConditionedCatalog()).sha256, contentVersion: 8 });
    expect(approved).toEqual(f.receipt);
    expect(await identityApprovedForDisplay(f.c, game.childProfile!, 8)).toBe(true);
    const ledger = await new PrismaWorldBudgetStore(db).read(boardWizardWorldId(result.gameId));
    expect(ledger?.snapshot.requests ?? []).toEqual([]);
    expect(await db.auditLog.count({ where: { entityId: result.gameId, action: "status:AVATAR_GENERATING->TARGETS_GENERATING" } })).toBe(1);
    expect(createCharacter).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    // Continue through the real first hide queue boundary. Only the synthetic
    // patch is billed to the new world; no source charge is copied or replayed.
    const hides = localPatchBoardsForVersion(8).flatMap(board => board.hides);
    const render = vi.fn(async ({ requestKey, stylePng, canonicalIdentityPng, boardPeoplePng }: { requestKey: string; stylePng: Buffer; canonicalIdentityPng?: Buffer; boardPeoplePng?: Buffer }) => {
      expect(canonicalIdentityPng?.equals(f.source.sheet)).toBe(true);
      expect(boardPeoplePng?.length).toBeGreaterThan(0);
      const hide = hides.find(candidate => requestKey.startsWith(`${candidate.id}:`));
      if (!hide) throw new Error("Synthetic hide not found");
      return paintedOk(await paintedCrop(stylePng, hide), bill(`req-${result.gameId}-${requestKey}`));
    });
    const first = await runLocalPatchWorldSlice(f.c, { renderPolicySha256: "a".repeat(64), render, judge: async () => reply(), readBoardArt: boardPng }, result.gameId,
      { maxHides: 1, boardJudge: async () => { throw new Error("No grouped review until five renders exist"); } });
    expect(first.outcomes[0]?.state).toBe("generated"); expect(render).toHaveBeenCalledTimes(1);
    const after = await new PrismaWorldBudgetStore(db).read(boardWizardWorldId(result.gameId));
    expect(after!.snapshot.requests).toHaveLength(1); expect(after!.snapshot.requests[0]!.scope).toBe("image");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses ordinary users, unlisted admins, production and non-sandbox payment before creating a new game", async () => {
    const f = await fixture(), count = await db.game.count();
    await expect(createCanonicalIdentityReuse(f.c, f.input, { type: "USER", id: f.actor.id })).rejects.toThrow("administrator");
    await expect(createCanonicalIdentityReuse({ ...f.c, adminEmails: [] }, f.input, f.actor)).rejects.toThrow("authorized");
    state.appEnv = "production";
    try { await expect(createCanonicalIdentityReuse(f.c, f.input, f.actor)).rejects.toThrow("QA"); } finally { state.appEnv = "qa"; }
    await expect(createCanonicalIdentityReuse({ ...f.c, payment: { ...f.c.payment, id: "payme", createCheckout: f.payment.createCheckout.bind(f.payment), parseWebhook: f.payment.parseWebhook.bind(f.payment), refund: f.payment.refund.bind(f.payment) } }, f.input, f.actor)).rejects.toThrow("sandbox");
    expect(await db.game.count()).toBe(count);
  });

  it.each(["bytes", "purge", "refunded", "unsettled", "wrong-identity"])("refuses invalid source %s rather than minting a fresh approval", async kind => {
    const f = await fixture(), count = await db.game.count();
    if (kind === "bytes") await db.fileBlob.update({ where: { key: `private/sheet-${f.source.gameId}.png` }, data: { data: new Uint8Array(Buffer.from("changed")) } });
    if (kind === "purge") await db.auditLog.delete({ where: { id: `purge-${f.source.gameId}` } });
    if (kind === "refunded") await db.order.update({ where: { id: `ord-${f.source.gameId}` }, data: { refundedAt: new Date() } });
    if (kind === "unsettled") await boardWizardBudgetOf(f.c).reserve(boardWizardWorldId(f.source.gameId), { requestKey: "pending", scope: "judge", operationFingerprint: "a".repeat(64), reserveMicroUsd: 10 });
    await expect(createCanonicalIdentityReuse(f.c, { ...f.input, ...(kind === "wrong-identity" ? { sourceIdentityAssetId: "other-child" } : {}) }, f.actor)).rejects.toThrow();
    expect(await db.game.count()).toBe(count);
  });

  it.each(["bytes", "age", "owner", "version"])("binds new game proof to %s after copying", async kind => {
    const f = await fixture(), result = await createCanonicalIdentityReuse(f.c, f.input, f.actor);
    const game = await db.game.findUniqueOrThrow({ where: { id: result.gameId }, include: { childProfile: true } });
    if (kind === "bytes") { const asset = await db.asset.findUniqueOrThrow({ where: { id: game.childProfile!.identityAssetId! } }); await db.fileBlob.update({ where: { key: asset.storagePath }, data: { data: new Uint8Array(Buffer.from("changed")) } }); }
    if (kind === "age") await db.childProfile.update({ where: { id: game.childProfileId! }, data: { ageYears: 9 } });
    if (kind === "owner") await db.asset.update({ where: { id: game.childProfile!.identityAssetId! }, data: { ownerId: null } });
    if (kind === "version") await db.gameScene.updateMany({ where: { gameId: game.id }, data: { sceneVersion: 7 } });
    await expect(requireCanonicalIdentityReuse(f.c, { gameId: game.id })).rejects.toThrow("IDENTITY_REUSE");
    expect(await identityApprovedForDisplay(f.c, game.childProfile!, 8)).toBe(false);
  });

  it("requires the new order paid and the exact current avatar claim; a stale worker cannot publish its handoff", async () => {
    const f = await fixture(), result = await createCanonicalIdentityReuse(f.c, f.input, f.actor);
    await db.game.update({ where: { id: result.gameId }, data: { status: "PAID" } });
    await db.generationJob.create({ data: { id: `job_${result.gameId}`, gameId: result.gameId, status: "RUNNING", attempts: 2, currentStep: "avatar" } });
    const claim = { gameId: result.gameId, jobId: `job_${result.gameId}`, jobAttempt: 2 };
    await expect(finishCanonicalIdentityReuse(f.c, claim)).rejects.toThrow("own sandbox payment");
    await pay(f, result);
    await expect(finishCanonicalIdentityReuse(f.c, { ...claim, jobAttempt: 1 })).rejects.toThrow("lost its claim");
    expect((await db.game.findUniqueOrThrow({ where: { id: result.gameId } })).status).toBe("PAID");
    await finishCanonicalIdentityReuse(f.c, claim);
    expect((await db.game.findUniqueOrThrow({ where: { id: result.gameId } })).status).toBe("TARGETS_GENERATING");
  });

  it("survives old source deletion, and deleting the new game removes its copied private bytes", async () => {
    const f = await fixture(), result = await createCanonicalIdentityReuse(f.c, f.input, f.actor);
    await deleteGame(f.c, f.source.gameId, f.actor, f.source.userId);
    expect(await requireCanonicalIdentityReuse(f.c, { gameId: result.gameId })).not.toBeNull();
    const copied = await db.asset.findMany({ where: { providerRequestId: result.gameId } });
    expect(await deleteGame(f.c, result.gameId, f.actor, f.source.userId)).toBe(true);
    for (const asset of copied) expect(await db.fileBlob.findUnique({ where: { key: asset.storagePath } })).toBeNull();
    expect((await db.auditLog.findFirstOrThrow({ where: { entityId: result.gameId, action: CANONICAL_IDENTITY_REUSE_ACTION } })).metaJson).toBeTruthy();
  });

  it("does not restart a terminal strict-quality job through the outer identity pipeline", async () => {
    const f = await fixture(), result = await createCanonicalIdentityReuse(f.c, f.input, f.actor);
    await pay(f, result);
    await db.game.update({ where: { id: result.gameId }, data: { status: "GENERATION_FAILED" } });
    await db.generationJob.create({ data: { id: `job_${result.gameId}`, gameId: result.gameId, status: "DONE", attempts: 3, currentStep: LOCAL_PATCH_QUALITY_FAILED } });
    const before = await db.generationJob.findUniqueOrThrow({ where: { id: `job_${result.gameId}` } });
    await runGenerationPipeline(f.c, result.gameId);
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);
    expect(createCharacter).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the approved frozen source review in ready notifications without inventing a missing-review warning", async () => {
    const f = await fixture(), result = await createCanonicalIdentityReuse(f.c, f.input, f.actor);
    const game = await db.game.findUniqueOrThrow({ where: { id: result.gameId }, include: { childProfile: true } });
    const child = { name: "עומר", avatarUrl: `/api/assets/${game.childProfile!.avatarAssetId}` };
    const scenes = localPatchBoardsForVersion(8).map(board => {
      const def = sceneBySlug(board.board, 8);
      return { ...composeScene(def, child, def.targets.map(target => ({ targetId: target.id, sprite: { kind: "image" as const,
        url: `/api/assets/synthetic-${target.id}`, width: 512, height: 768 } })), "he"),
        playMode: "find-any" as const, appearancesPerBoard: 5 as const, findsRequiredToAdvance: 3 as const };
    });
    const config = GameConfigSchema.parse(composeGame({ gameId: result.gameId, child, scenes, locale: "he", styleVersion: "local-patch-world-v1", packageTier: "ONE_WORLD" }));
    // This isolated notification fixture does not claim to prove publication;
    // it tests the notification consumer's source-review lookup after READY.
    await db.game.update({ where: { id: result.gameId }, data: { status: "READY", configJson: JSON.stringify(config) } });
    await db.$transaction(tx => enqueueLocalPatchNotifications(f.c, tx, result.gameId, config));
    const notices = await db.auditLog.findMany({ where: { entityId: result.gameId, action: "local-patch:notification-pending" } });
    expect(notices.map(row => JSON.parse(row.metaJson!).kind)).toEqual(["ready"]);
    expect(await db.auditLog.count({ where: { action: IDENTITY_GATE_ACTION, entityId: game.childProfile!.identityAssetId! } })).toBe(0);
  });
});
