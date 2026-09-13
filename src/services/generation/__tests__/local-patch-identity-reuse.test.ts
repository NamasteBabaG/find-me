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
import { prepareLocalPatchIdentityReferences } from "../local-patch-identity-reference";
import type { LocalPatchRenderDeps } from "../local-patch-render";
import { createCanonicalIdentityReuse, requireCanonicalIdentityReuse, finishCanonicalIdentityReuse,
  CANONICAL_IDENTITY_REUSE_ACTION, CANONICAL_IDENTITY_REUSE_CONFIRMATION, CANONICAL_IDENTITY_AGE_CONFIRMATION } from "../local-patch-identity-reuse";

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
  const input = { sourceGameId: gameId, sourceIdentityAssetId: `ast-sheet-${gameId}`, requestId: `request-${gameId}`, displayName: "עומר", confirmedAgeYears: 8, confirmation: CANONICAL_IDENTITY_REUSE_CONFIRMATION };
  return { c, source, input, actor, payment, receipt };
}

async function pay(f: Awaited<ReturnType<typeof fixture>>, game: { orderId: string }) {
  const order = await db.order.findUniqueOrThrow({ where: { id: game.orderId } });
  const raw = JSON.stringify({ eventId: `event-${order.id}`, orderId: order.id, kind: "PAID", amountAgorot: order.amountAgorot, currency: order.currency });
  expect((await handlePaymentWebhook(f.c, raw, { "x-mock-signature": f.payment.sign(raw) })).status).toBe(200);
}

describe("explicit QA adoption of a paid canonical identity whose photo was privacy-purged", () => {
  it("a stale age-review worker cannot fail or change the replacement's live game after retaining its paid answer", async () => {
    const f = await fixture(), result = await createCanonicalIdentityReuse(f.c,
      { ...f.input, confirmedAgeYears: 5, confirmation: CANONICAL_IDENTITY_AGE_CONFIRMATION }, f.actor);
    await pay(f, result);
    let replacementJob: Awaited<ReturnType<typeof db.generationJob.findUniqueOrThrow>> | undefined;
    let replacementGame: Awaited<ReturnType<typeof db.game.findUniqueOrThrow>> | undefined;
    const wire = vi.mocked(fetch);
    wire.mockImplementationOnce(async () => {
      // The provider is already waiting. A fresh worker takes this exact lease.
      replacementJob = await db.generationJob.update({ where: { id: `job_${result.gameId}` },
        data: { attempts: { increment: 1 }, status: "RUNNING", currentStep: "avatar", lastError: "replacement-owned" } });
      replacementGame = await db.game.update({ where: { id: result.gameId }, data: { status: "AVATAR_GENERATING", lastError: "replacement-owned" } });
      return new Response(JSON.stringify({ model: "gpt-5.6-luna", usage: { prompt_tokens: 1500, completion_tokens: 250 },
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ checks: { identity: "pass", faceAge: "pass", usableFace: "pass" }, reason: "Synthetic complete canonical face" }) } }] }),
        { headers: { "x-request-id": `req-stale-age-${result.gameId}` } });
    });
    try {
      await runGenerationPipeline(f.c, result.gameId);
      expect(replacementJob).toBeDefined(); expect(replacementGame).toBeDefined();
      expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${result.gameId}` } })).toEqual(replacementJob);
      // Retaining a paid answer takes the existing deletion lock on Game and
      // may touch updatedAt; no domain field or replacement job may change.
      expect({ ...await db.game.findUniqueOrThrow({ where: { id: result.gameId } }), updatedAt: replacementGame!.updatedAt }).toEqual(replacementGame);
      const bill = await boardWizardBudgetOf(f.c).readRequest(boardWizardWorldId(result.gameId), "canonical-age:identity:1");
      expect(bill?.state).toBe("settled"); expect(wire).toHaveBeenCalledTimes(1);
      await finishCanonicalIdentityReuse(f.c, { gameId: result.gameId, jobId: replacementJob!.id, jobAttempt: replacementJob!.attempts });
      expect(await db.game.findUniqueOrThrow({ where: { id: result.gameId } })).toMatchObject({ status: "TARGETS_GENERATING", lastError: null });
      expect(await db.generationJob.findUniqueOrThrow({ where: { id: replacementJob!.id } })).toMatchObject({ status: "QUEUED", currentStep: "local-patch", attempts: replacementJob!.attempts });
      expect(await boardWizardBudgetOf(f.c).readRequest(boardWizardWorldId(result.gameId), "canonical-age:identity:1")).toEqual(bill);
      expect(wire).toHaveBeenCalledTimes(1);
      expect(createCharacter).not.toHaveBeenCalled();
    } finally { wire.mockClear(); }
  });
  it("an owned canonical-age refusal remains visible without sending any image request", async () => {
    const f = await fixture(), result = await createCanonicalIdentityReuse(f.c,
      { ...f.input, confirmedAgeYears: 5, confirmation: CANONICAL_IDENTITY_AGE_CONFIRMATION }, f.actor);
    await pay(f, result); const wire = vi.mocked(fetch);
    wire.mockImplementationOnce(async () => new Response(JSON.stringify({ model: "gpt-5.6-luna", usage: { prompt_tokens: 1500, completion_tokens: 250 },
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ checks: { identity: "pass", faceAge: "fail", usableFace: "pass" }, reason: "Synthetic face does not read as target age5" }) } }] }),
      { headers: { "x-request-id": `req-refused-age-${result.gameId}` } }));
    try {
      await runGenerationPipeline(f.c, result.gameId);
      expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${result.gameId}` } }))
        .toMatchObject({ status: "FAILED", currentStep: "avatar", lastError: expect.stringContaining("target age5") });
      expect(await db.game.findUniqueOrThrow({ where: { id: result.gameId } }))
        .toMatchObject({ status: "MANUAL_REVIEW", lastError: expect.stringContaining("target age5") });
      expect(wire).toHaveBeenCalledTimes(1); expect(createCharacter).not.toHaveBeenCalled();
    } finally { wire.mockClear(); }
  });
  it("runs paid v9 age correction through the real pipeline, durable review and first age5 hide without another portrait", async () => {
    const f = await fixture(), result = await createCanonicalIdentityReuse(f.c,
      { ...f.input, confirmedAgeYears: 5, confirmation: CANONICAL_IDENTITY_AGE_CONFIRMATION }, f.actor);
    await pay(f, result);
    const wire = vi.mocked(fetch);
    wire.mockImplementationOnce(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("gpt-5.6-luna"); expect(body.reasoning_effort).toBe("low");
      expect(JSON.stringify(body)).toContain("historical record 8 to 5 years");
      expect(JSON.stringify(body)).toContain("NOT original-photograph verification");
      return new Response(JSON.stringify({ model: "gpt-5.6-luna", usage: { prompt_tokens: 1500, completion_tokens: 250, total_tokens: 1750 },
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ checks: { identity: "pass", faceAge: "pass", usableFace: "pass" }, reason: "Synthetic age5 canonical-only review" }) } }] }),
        { headers: { "x-request-id": `req-age-${result.gameId}` } });
    });
    await runGenerationPipeline(f.c, result.gameId);
    const game = await db.game.findUniqueOrThrow({ where: { id: result.gameId }, include: { childProfile: true } });
    expect(game.status).toBe("TARGETS_GENERATING"); expect(wire).toHaveBeenCalledTimes(1);
    const proof = await requireCanonicalIdentityReuse(f.c, { gameId: result.gameId });
    expect(proof?.ageReview).toMatchObject({ state: "pass", sourceKind: "parent-accepted-canonical-drawing-no-source-photo", binding: { targetAgeYears: 5, sourceAgeYears: 8 } });
    expect(proof?.sourceReceipt.provenance.ageYears).toBe(8);
    const board = localPatchBoardsForVersion(9)[0]!, hide = board.hides[0]!;
    const expectedPortrait = (await prepareLocalPatchIdentityReferences(f.source.sheet, 9)).identityPng;
    const render = vi.fn(async ({ stylePng, prompt, identityPng, referenceMode, canonicalIdentityPng, boardPeoplePng }: Parameters<LocalPatchRenderDeps["render"]>[0]) => {
      expect(prompt).toContain("5"); expect(prompt).toContain("FACE");
      expect(referenceMode).toBe("canonical-portrait-only/v1");
      expect(identityPng.equals(expectedPortrait)).toBe(true);
      expect(canonicalIdentityPng).toBeUndefined(); expect(boardPeoplePng).toBeUndefined();
      expect(prompt).not.toMatch(/Image [34]/);
      return paintedOk(await paintedCrop(stylePng, hide), bill(`req-age5-hide-${result.gameId}`));
    });
    const first = await runLocalPatchWorldSlice(f.c, { renderPolicySha256: "a".repeat(64), render, judge: async () => { throw new Error("No per-hide review"); }, readBoardArt: boardPng }, result.gameId,
      { maxHides: 1, boardJudge: async () => { throw new Error("No grouped review until five hides exist"); } });
    expect(first.outcomes[0]?.state).toBe("generated"); expect(render).toHaveBeenCalledTimes(1);
    expect(createCharacter).not.toHaveBeenCalled(); expect(wire).toHaveBeenCalledTimes(1);
    const fresh = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "reuse.sqlite").split(path.sep).join("/")}` } } });
    try {
      const after = await requireCanonicalIdentityReuse({ ...f.c, db: fresh, storage: new DbStorage(fresh) }, { gameId: result.gameId });
      expect(after?.ageReview?.state).toBe("pass");
      const ledger = await new PrismaWorldBudgetStore(fresh).read(boardWizardWorldId(result.gameId));
      expect(ledger?.snapshot.requests.map(row => row.scope).sort()).toEqual(["image", "judge"]);
      expect(ledger?.snapshot.requests.every(row => row.state === "settled")).toBe(true);
    } finally { await fresh.$disconnect(); }
    wire.mockClear();
  });
  it("records corrected age5 separately from the frozen age8 source, without purchasing or inventing an approval", async () => {
    const f = await fixture(), sourceBefore = await db.childProfile.findUniqueOrThrow({ where: { id: `chl-${f.source.gameId}` } });
    const ledgerBefore = await new PrismaWorldBudgetStore(db).read(boardWizardWorldId(f.source.gameId));
    const input = { ...f.input, confirmedAgeYears: 5, confirmation: CANONICAL_IDENTITY_AGE_CONFIRMATION };
    const result = await createCanonicalIdentityReuse(f.c, input, f.actor);
    const proof = await requireCanonicalIdentityReuse(f.c, { gameId: result.gameId, allowPendingAgeReview: true });
    expect(proof?.record).toMatchObject({ version: "canonical-identity-reuse/v2", ageYears: 5, sourceAgeYears: 8, contentVersion: 9,
      ageEvidence: "parent-corrected-age-canonical-face-only" });
    expect(proof?.sourceReceipt.provenance.ageYears).toBe(8);
    const game = await db.game.findUniqueOrThrow({ where: { id: result.gameId }, include: { childProfile: true, scenes: true } });
    expect(game.childProfile?.ageYears).toBe(5); expect(game.scenes.every(scene => scene.sceneVersion === 9)).toBe(true);
    expect(game.status).toBe("CHECKOUT_PENDING");
    await expect(requireCanonicalIdentityReuse(f.c, { gameId: result.gameId })).rejects.toThrow();
    expect(await identityApprovedForDisplay(f.c, game.childProfile!, 9)).toBe(false);
    expect(await db.childProfile.findUniqueOrThrow({ where: { id: sourceBefore.id } })).toEqual(sourceBefore);
    expect(await new PrismaWorldBudgetStore(db).read(boardWizardWorldId(f.source.gameId))).toEqual(ledgerBefore);
    expect(await createCanonicalIdentityReuse(f.c, input, f.actor)).toEqual({ ...result, replayed: true });
    await expect(createCanonicalIdentityReuse(f.c, { ...input, confirmedAgeYears: 8 }, f.actor)).rejects.toThrow("already used");
    expect(createCharacter).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("refuses a corrected age5 against age8 approval before checkout, copying or any purchase", async () => {
    const f = await fixture(), checkout = vi.spyOn(f.payment, "createCheckout");
    const before = { games: await db.game.count(), assets: await db.asset.count(), blobs: await db.fileBlob.count(), orders: await db.order.count() };
    await expect(createCanonicalIdentityReuse(f.c, { ...f.input, confirmedAgeYears: 5 }, f.actor)).rejects.toThrow("fresh age-specific review");
    expect({ games: await db.game.count(), assets: await db.asset.count(), blobs: await db.fileBlob.count(), orders: await db.order.count() }).toEqual(before);
    expect(checkout).not.toHaveBeenCalled(); expect(createCharacter).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
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
