import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import type { Container } from "../../container";
import type { CharacterOutput } from "../../../infra/generation/types";
import { findScene } from "../../../../content/scenes";

const fake = vi.hoisted(() => ({ appEnv: "qa", testers: [] as string[], png: null as Buffer | null }));
vi.mock("../../../lib/env", () => ({
  env: () => ({ APP_ENV: fake.appEnv, GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0, GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium", OPENAI_API_KEY: "synthetic-never-live" }),
  spendGuard: () => ({ appEnv: fake.appEnv, realGeneration: true, testers: fake.testers }), flag: () => false,
}));
// Only static-art preflight/style are stubbed. Actual pipeline, reservation,
// enrollment, database fences, queue and deletion execute below; no HTTP.
vi.mock("../board-conditioned-wizard", async original => ({
  ...await original<typeof import("../board-conditioned-wizard")>(), preflightBoardConditionedWizard: async () => undefined,
}));
vi.mock("../scene-art", () => ({ loadSceneArt: async () => fake.png }));
vi.mock("../patch", async original => ({ ...await original<typeof import("../patch")>(), styleReference: async () => fake.png }));

import { generateBoardWizardIdentity, type BoardWizardIdentityClaim } from "../board-wizard-identity-lifecycle";
import { enrollBoardConditionedWizard, reserveBoardWizardIdentity } from "../board-conditioned-wizard";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { runGenerationPipeline } from "../pipeline";
import { nextPendingGame } from "../queue";
import { deleteGame } from "../../game.service";

let db: PrismaClient, scratch: string, png: Buffer, seq = 0;
beforeAll(async () => {
  scratch = mkdtempSync(path.join(realpathSync(tmpdir()), "findme-identity-fence-"));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}` } } });
  await applyTestSchema(db);
  png = await sharp({ create: { width: 32, height: 32, channels: 4, background: "#4c697c" } }).png().toBuffer();
  fake.png = png;
});
beforeEach(() => { process.env.QA_BOARD_CONDITIONED_WIZARD = "true"; fake.appEnv = "qa"; });
afterAll(async () => {
  delete process.env.QA_BOARD_CONDITIONED_WIZARD; await db.$disconnect();
  const target = path.resolve(scratch);
  if (path.dirname(target) === realpathSync(tmpdir()) && path.basename(target).startsWith("findme-identity-fence-")) rmSync(target, { recursive: true, force: true });
});
async function fixture() {
  const id = `identity-fence-${++seq}`, ownerId = `${id}-owner`, childId = `${id}-child`, photoId = `${id}-photo`, email = `${id}@example.invalid`;
  await db.user.create({ data: { id: ownerId, email } }); fake.testers.push(email);
  await db.asset.create({ data: { id: photoId, ownerId, type: "ORIGINAL_PHOTO", visibility: "PRIVATE", storagePath: `private/${photoId}.png`, mimeType: "image/png", bytes: png.length, width: 32, height: 32 } });
  await db.fileBlob.create({ data: { key: `private/${photoId}.png`, contentType: "image/png", data: new Uint8Array(png) } });
  await db.childProfile.create({ data: { id: childId, ownerId, displayName: "Synthetic", ageYears: 6, originalPhotoAssetId: photoId } });
  await db.game.create({ data: { id, ownerId, childProfileId: childId, status: "AVATAR_GENERATING", packageTier: "ONE_WORLD", paidAt: new Date() } });
  const definition = findScene("newyork")!;
  await db.gameScene.create({ data: { id: `${id}-scene`, gameId: id, sceneSlug: definition.slug, sceneVersion: definition.version, orderIndex: 0 } });
  await db.generationJob.create({ data: { id: `job_${id}`, gameId: id, status: "RUNNING", currentStep: "avatar", attempts: 1, stepsJson: JSON.stringify({ avatar: { status: "running" } }) } });
  const c = { db, storage: new DbStorage(db), analytics: { track() {} }, avatars: { id: "openai" }, adminEmails: [] } as unknown as Container;
  const claim: BoardWizardIdentityClaim = { gameId: id, jobId: `job_${id}`, jobAttempt: 1, styleVersion: "collage-v1", ownerId, childId,
    photoAssetId: photoId, avatarAssetId: null, identityAssetId: null, childName: "Synthetic", ageYears: 6 };
  const reserve = () => reserveBoardWizardIdentity(c, id, { childId, photoId, policy: "synthetic-medium-one-attempt" });
  const result = (): CharacterOutput => ({ sheetPng: png, sheetWidth: 32, sheetHeight: 32, avatarPng: png, avatarWidth: 32, avatarHeight: 32,
    costCents: 5.2, model: "gpt-image-2", usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 }, providerRequestId: `req_${id}`, attempts: 1, durationMs: 1 });
  const game = () => db.game.findUniqueOrThrow({ where: { id } });
  const job = () => db.generationJob.findUniqueOrThrow({ where: { id: claim.jobId } });
  const ledger = async () => JSON.parse((await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: `${id}:board-wizard` } })).snapshotJson);
  return { c, id, ownerId, childId, photoId, claim, reserve, result, game, job, ledger };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
async function fullWorld(f: Awaited<ReturnType<typeof fixture>>) {
  const { catalog } = await readBoardConditionedCatalog();
  await db.gameScene.deleteMany({ where: { gameId: f.id } });
  for (const [i, board] of catalog.boards.entries()) await db.gameScene.create({ data: { id: `${f.id}-board-${i}`, gameId: f.id,
    sceneSlug: board.boardId, sceneVersion: board.sceneVersion, orderIndex: i } });
  await db.game.update({ where: { id: f.id }, data: { sceneCount: 9 } });
}

describe("QA identity lifecycle: real DB and synthetic provider only", () => {
  it("deletion during the paid call wins, but exact known billing is retained", async () => {
    const f = await fixture(), started = deferred<void>(), answer = deferred<CharacterOutput>();
    const running = generateBoardWizardIdentity(f.c, f.claim, { reserve: f.reserve, generate: () => { started.resolve(); return answer.promise; } });
    await started.promise;
    expect(await deleteGame(f.c, f.id, { type: "USER", id: f.ownerId }, f.ownerId)).toBe(true);
    answer.resolve(f.result()); expect(await running).toBe(false);
    expect(await f.game()).toMatchObject({ status: "DELETED", configJson: null });
    expect(await db.childProfile.findUniqueOrThrow({ where: { id: f.childId } })).toMatchObject({ identityAssetId: null, avatarAssetId: null, originalPhotoAssetId: null });
    expect(await db.asset.count({ where: { ownerId: f.ownerId, status: "READY" } })).toBe(0);
    expect((await f.ledger()).requests[0]).toMatchObject({ state: "settled", evidence: { providerRequestId: `req_${f.id}`, amountMicroUsd: 52_000 } });
    expect(await db.auditLog.count({ where: { action: "board-wizard:identity-response", entityId: f.id } })).toBe(1);
    expect((await f.job()).stepsJson).toBe("{}");
  });

  it("deletion after publication reads the current identity IDs and removes both images", async () => {
    const f = await fixture();
    expect(await generateBoardWizardIdentity(f.c, f.claim, { reserve: f.reserve, generate: async () => f.result() })).toBe(true);
    const child = await db.childProfile.findUniqueOrThrow({ where: { id: f.childId } });
    expect(child.identityAssetId).toBeTruthy(); expect(child.avatarAssetId).toBeTruthy();
    const assets = await db.asset.findMany({ where: { ownerId: f.ownerId }, select: { storagePath: true } });
    await deleteGame(f.c, f.id, { type: "USER", id: f.ownerId }, f.ownerId);
    expect(await db.asset.count({ where: { ownerId: f.ownerId, status: "READY" } })).toBe(0);
    expect(await db.fileBlob.count({ where: { key: { in: assets.map(a => a.storagePath) } } })).toBe(0);
    expect((await f.ledger()).requests[0].state).toBe("settled");
  });

  it("reroutes deletion when enrollment commits between the initial style read and transactional identity read", async () => {
    const f = await fixture(); await fullWorld(f);
    await generateBoardWizardIdentity(f.c, f.claim, { reserve: f.reserve, generate: async () => f.result() });
    const read = db.game.findUnique.bind(db.game);
    let enrolledBetweenReads = false, firstRead = true;
    const controlledRead = (async args => {
      if (!firstRead) return read(args);
      firstRead = false;
      expect(args).toEqual({ where: { id: f.id }, select: { styleVersion: true } });
      const old = await read(args);
      await enrollBoardConditionedWizard(f.c, f.id, f.claim.jobId, f.claim.jobAttempt);
      enrolledBetweenReads = true;
      return old;
    }) as typeof db.game.findUnique;
    // Do not spy/restore Prisma's lazy delegate properties: isolate the one
    // interleaving on a wrapper while transactions keep the real DB connection.
    const delegate = new Proxy(db.game, { get: (target, property) => property === "findUnique" ? controlledRead : Reflect.get(target, property) });
    const database = new Proxy(db, { get: (target, property) => {
      if (property === "game") return delegate;
      const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
    } });
    expect(await deleteGame({ ...f.c, db: database }, f.id, { type: "USER", id: f.ownerId }, f.ownerId)).toBe(true);
    expect(enrolledBetweenReads).toBe(true);
    expect(await f.game()).toMatchObject({ status: "DELETED", styleVersion: "fixed-sprite-board-wizard-v1", configJson: null });
    expect((await f.job()).stepsJson).toBe("{}");
    expect(await db.asset.count({ where: { ownerId: f.ownerId, status: "READY" } })).toBe(0);
    expect((await f.ledger()).requests).toHaveLength(1);
  });

  it("the reservation keeps deletion fenced even if the feature flag is switched off mid-call", async () => {
    const f = await fixture(), started = deferred<void>(), answer = deferred<CharacterOutput>();
    const running = generateBoardWizardIdentity(f.c, f.claim, { reserve: f.reserve, generate: () => { started.resolve(); return answer.promise; } });
    await started.promise; process.env.QA_BOARD_CONDITIONED_WIZARD = "false";
    await deleteGame(f.c, f.id, { type: "USER", id: f.ownerId }, f.ownerId);
    answer.resolve(f.result()); expect(await running).toBe(false);
    expect((await f.game()).status).toBe("DELETED");
    expect(await db.asset.count({ where: { ownerId: f.ownerId, status: "READY" } })).toBe(0);
  });

  it("an obsolete lease cannot publish images or hold its replacement runner", async () => {
    const f = await fixture(), started = deferred<void>(), answer = deferred<CharacterOutput>();
    const running = generateBoardWizardIdentity(f.c, f.claim, { reserve: f.reserve, generate: () => { started.resolve(); return answer.promise; } });
    await started.promise;
    await db.generationJob.update({ where: { id: f.claim.jobId }, data: { attempts: 2 } });
    answer.resolve(f.result()); expect(await running).toBe(false);
    expect(await f.job()).toMatchObject({ status: "RUNNING", attempts: 2 });
    expect((await f.game()).status).toBe("AVATAR_GENERATING");
    expect(await db.asset.count({ where: { ownerId: f.ownerId, type: { in: ["IDENTITY_SHEET", "AVATAR"] } } })).toBe(0);
    expect((await f.ledger()).requests[0].state).toBe("settled");
    await db.game.update({ where: { id: f.id }, data: { status: "MANUAL_REVIEW" } });
  });

  it("a missing-usage response is retained privately but held, never reported free or repurchased", async () => {
    const f = await fixture(); let calls = 0;
    const generate = async () => { calls++; return { ...f.result(), costUnknown: true, usage: undefined }; };
    expect(await generateBoardWizardIdentity(f.c, f.claim, { reserve: f.reserve, generate })).toBe(false);
    expect(await f.game()).toMatchObject({ status: "MANUAL_REVIEW", configJson: null });
    expect((await f.ledger()).requests[0]).toMatchObject({ state: "unknown", reserveMicroUsd: 500_000 });
    expect(await db.asset.count({ where: { ownerId: f.ownerId, type: "IDENTITY_SHEET", visibility: "PRIVATE" } })).toBe(1);
    await runGenerationPipeline(f.c, f.id); expect(calls).toBe(1);
  });

  it("the actual pipeline holds transport failure and the queue moves on to another game", async () => {
    const f = await fixture(); let calls = 0;
    await db.generationJob.update({ where: { id: f.claim.jobId }, data: { status: "DONE", attempts: 0, currentStep: null } });
    f.c.avatars.createCharacter = async () => { calls++; throw new Error("synthetic sensitive failure must not be persisted"); };
    await runGenerationPipeline(f.c, f.id);
    expect(await f.game()).toMatchObject({ status: "MANUAL_REVIEW" });
    expect((await f.job()).lastError).not.toContain("synthetic sensitive");
    expect((await f.ledger()).requests[0]).toMatchObject({ state: "unknown", reserveMicroUsd: 500_000 });
    const next = await fixture();
    expect(await nextPendingGame(f.c)).toBe(next.id);
    await runGenerationPipeline(f.c, f.id); expect(calls).toBe(1);
    await db.game.update({ where: { id: next.id }, data: { status: "MANUAL_REVIEW" } });
  });

  it("the actual pipeline holds an existing reservation without sending the identity again", async () => {
    const f = await fixture(); await f.reserve(); let calls = 0;
    await db.generationJob.update({ where: { id: f.claim.jobId }, data: { status: "DONE", attempts: 0, currentStep: null } });
    f.c.avatars.createCharacter = async () => { calls++; return f.result(); };
    await runGenerationPipeline(f.c, f.id);
    expect(calls).toBe(0); expect((await f.game()).status).toBe("MANUAL_REVIEW");
    expect((await f.ledger()).requests).toHaveLength(1);
  });

  it("the actual pipeline enrolls a known identity with its original charge exactly once", async () => {
    const f = await fixture(); await fullWorld(f); let calls = 0;
    await db.generationJob.update({ where: { id: f.claim.jobId }, data: { status: "DONE", attempts: 0, currentStep: null } });
    f.c.avatars.createCharacter = async () => { calls++; return f.result(); };
    await runGenerationPipeline(f.c, f.id);
    expect(await f.game()).toMatchObject({ status: "TARGETS_GENERATING", styleVersion: "fixed-sprite-board-wizard-v1" });
    const envelope = JSON.parse((await f.job()).stepsJson);
    expect(envelope.avatar.status).toBe("done"); expect(envelope.boardWizard.boards).toHaveLength(9);
    expect((await f.ledger()).requests).toHaveLength(1); expect(calls).toBe(1);
    await deleteGame(f.c, f.id, { type: "USER", id: f.ownerId }, f.ownerId);
  });

  it("a historical existing avatar without trustworthy billing is held at enrollment, not retried", async () => {
    const f = await fixture(); await fullWorld(f);
    await generateBoardWizardIdentity(f.c, f.claim, { reserve: f.reserve, generate: async () => f.result() });
    const child = await db.childProfile.findUniqueOrThrow({ where: { id: f.childId } });
    await db.auditLog.updateMany({ where: { action: "sheet:painted", entityId: child.identityAssetId! }, data: { metaJson: JSON.stringify({ costUnknown: true }) } });
    await db.game.update({ where: { id: f.id }, data: { status: "GENERATION_FAILED" } });
    await db.generationJob.update({ where: { id: f.claim.jobId }, data: { status: "DONE", currentStep: null } });
    const generate = vi.fn(async () => f.result()); f.c.avatars.createCharacter = generate;
    await runGenerationPipeline(f.c, f.id); await runGenerationPipeline(f.c, f.id);
    expect(generate).not.toHaveBeenCalled(); expect((await f.game()).status).toBe("MANUAL_REVIEW");
    expect((await f.job()).lastError).toContain("identity-enrollment-failed");
    expect((await f.ledger()).requests).toHaveLength(1);
  });
});
