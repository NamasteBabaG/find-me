import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { PrismaWorldBudgetStore } from "../../../infra/db/prisma-world-budget-store";
import { CasWorldBudgetRepository } from "../../../infra/db/world-budget-repository";
import type { Container } from "../../container";
import type { CharacterOutput } from "../../../infra/generation/types";
import { findScene } from "../../../../content/scenes";

const fake = vi.hoisted(() => ({ appEnv: "qa", testers: [] as string[], png: null as Buffer | null, catalogSha256: "", atlasSha256: "", styleMissing: false }));
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
vi.mock("../board-wizard-identity-style", () => ({ buildBoardWizardIdentityStyle: async () => {
  if (fake.styleMissing) throw new Error("Synthetic mandatory original-people atlas missing");
  return { png: fake.png!, version: "board-matched-identity/v1", catalogSha256: fake.catalogSha256, atlasSha256: fake.atlasSha256, examples: [] };
} }));
vi.mock("../local-patch-identity", async original => ({
  ...await original<typeof import("../local-patch-identity")>(), preflightLocalPatchIdentity: async () => undefined,
}));

import { generateBoardWizardIdentity, withBoardWizardIdentityClaim, type BoardWizardIdentityClaim } from "../board-wizard-identity-lifecycle";
import { enrollBoardConditionedWizard, reserveBoardWizardIdentity } from "../board-conditioned-wizard";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { runGenerationPipeline } from "../pipeline";
import { nextPendingGame } from "../queue";
import { deleteGame } from "../../game.service";
import { reviewBoardWizardIdentity, IDENTITY_GATE_ACTION, IDENTITY_GATE_KEY, type IdentityProvenance } from "../board-wizard-identity-gate";
import { boardWizardBudget } from "../board-wizard-budget";
import { sha256Bytes } from "../fixed-sprite";
import { LOCAL_PATCH_STYLE } from "../local-patch-world";
import { createDraft } from "../../create-flow.service";
import { identityApprovedForDisplay } from "../board-wizard-identity-gate";

let db: PrismaClient, scratch: string, png: Buffer, seq = 0;
beforeAll(async () => {
  scratch = mkdtempSync(path.join(realpathSync(tmpdir()), "findme-identity-fence-"));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}` } } });
  await applyTestSchema(db);
  png = await sharp({ create: { width: 32, height: 32, channels: 4, background: "#4c697c" } }).png().toBuffer();
  fake.png = png;
  fake.atlasSha256 = sha256Bytes(png); fake.catalogSha256 = (await readBoardConditionedCatalog()).sha256;
});
beforeEach(() => {
  process.env.QA_BOARD_CONDITIONED_WIZARD = "true"; fake.appEnv = "qa"; fake.styleMissing = false;
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Unexpected HTTP is forbidden in identity lifecycle tests"); }));
});
afterEach(() => { vi.unstubAllGlobals(); });
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
  const provenance: IdentityProvenance = { promptVersion: "character-v3-board-matched-matte", quality: "medium",
    photoAssetId: photoId, photoSha256: sha256Bytes(png), crop: null, ageYears: 6,
    style: { version: "board-matched-identity/v1", catalogSha256: fake.catalogSha256, atlasSha256: fake.atlasSha256 } };
  const result = (): CharacterOutput => ({ sheetPng: png, sheetWidth: 32, sheetHeight: 32, avatarPng: png, avatarWidth: 32, avatarHeight: 32,
    costCents: 5.2, model: "gpt-image-2", usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 }, providerRequestId: `req_${id}`, attempts: 1, durationMs: 1 });
  const game = () => db.game.findUniqueOrThrow({ where: { id } });
  const job = () => db.generationJob.findUniqueOrThrow({ where: { id: claim.jobId } });
  const ledger = async () => JSON.parse((await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: `${id}:board-wizard` } })).snapshotJson);
  return { c, id, ownerId, childId, photoId, claim, reserve, result, game, job, ledger, provenance };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
async function fullWorld(f: Awaited<ReturnType<typeof fixture>>) {
  const { catalog } = await readBoardConditionedCatalog();
  await db.gameScene.deleteMany({ where: { gameId: f.id } });
  for (const [i, board] of catalog.boards.entries()) await db.gameScene.create({ data: { id: `${f.id}-board-${i}`, gameId: f.id,
    sceneSlug: board.boardId, sceneVersion: board.sceneVersion, orderIndex: i } });
  await db.game.update({ where: { id: f.id }, data: { sceneCount: 9 } });
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function styleAnswer(paintedStyle: "pass" | "fail" | "uncertain" = "pass") {
  return { model: "gpt-5.6-sol", service_tier: "default", usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ checks: { identity: "pass", age: "pass", paintedStyle, sheetLayout: "pass" },
      reason: paintedStyle === "pass" ? "Synthetic board-matched matte illustration." : "Synthetic painted-style mismatch or uncertainty." }) } }] };
}
function stubStyleFetch(f: Fixture, style: "pass" | "fail" | "uncertain" = "pass") {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const request = JSON.parse(String(init?.body));
    expect(request).toMatchObject({ model: "gpt-5.6-sol", reasoning_effort: "high", store: false });
    expect(request.messages[0].content.filter((x: { type: string }) => x.type === "image_url")).toHaveLength(3);
    return new Response(JSON.stringify(styleAnswer(style)), { headers: { "x-request-id": `req_style_${f.id}` } });
  });
  vi.stubGlobal("fetch", fetch); return fetch;
}
async function reviewPublished(f: Fixture, reviewer = { review: async () => ({ httpOk: true, requestId: `req_style_${f.id}`, body: styleAnswer() }) }) {
  const child = await db.childProfile.findUniqueOrThrow({ where: { id: f.childId } });
  const claim = { ...f.claim, identityAssetId: child.identityAssetId, avatarAssetId: child.avatarAssetId };
  return reviewBoardWizardIdentity({ db, apiKey: "synthetic-never-live", budget: boardWizardBudget(new CasWorldBudgetRepository(new PrismaWorldBudgetStore(db))), reviewer,
    beforeDispatch: () => withBoardWizardIdentityClaim(f.c, claim, async () => undefined), write: work => withBoardWizardIdentityClaim(f.c, claim, work) },
  { gameId: f.id, identityAssetId: child.identityAssetId!, sheet: png, photo: png, atlas: png, provenance: f.provenance });
}

describe("QA identity lifecycle: real DB and synthetic provider only", () => {
  it("pins new QA drafts to local patches without changing production drafts", async () => {
    const c = { db, analytics: { track() {} } } as unknown as Container;
    delete process.env.QA_BOARD_CONDITIONED_WIZARD;
    const qa = await createDraft(c, null, "he");
    expect(await db.game.findUniqueOrThrow({ where: { id: qa.gameId } })).toMatchObject({ status: "DRAFT", styleVersion: LOCAL_PATCH_STYLE });
    fake.appEnv = "production";
    const production = await createDraft(c, null, "en");
    expect(await db.game.findUniqueOrThrow({ where: { id: production.gameId } })).toMatchObject({ status: "DRAFT", styleVersion: "collage-v1" });
  });

  it("new local-patch identity uses the matte atlas and approval without the old wizard flag", async () => {
    const f = await fixture(); await fullWorld(f);
    delete process.env.QA_BOARD_CONDITIONED_WIZARD;
    await db.game.update({ where: { id: f.id }, data: { styleVersion: LOCAL_PATCH_STYLE, status: "PAID" } });
    await db.generationJob.update({ where: { id: f.claim.jobId }, data: { status: "QUEUED", attempts: 0, currentStep: null } });
    const fetch = stubStyleFetch(f);
    const fallback = vi.fn(); f.c.avatars.createAvatar = fallback;
    const generate = vi.fn(async (request: Parameters<NonNullable<Container["avatars"]["createCharacter"]>>[0]) => {
      expect(request.styleRef).toEqual(png);
      expect(request.qaStyleContract).toEqual(f.provenance.style);
      expect(request.ageYears).toBe(6);
      return f.result();
    });
    f.c.avatars.createCharacter = generate;
    await runGenerationPipeline(f.c, f.id);
    expect(await f.game()).toMatchObject({ status: "TARGETS_GENERATING", styleVersion: LOCAL_PATCH_STYLE, configJson: null });
    expect(await f.job()).toMatchObject({ status: "QUEUED", currentStep: "local-patch" });
    const steps = JSON.parse((await f.job()).stepsJson);
    expect(steps.avatar.status).toBe("done"); expect(steps).not.toHaveProperty("boardWizard");
    expect(await db.targetInstance.count({ where: { gameScene: { gameId: f.id } } })).toBe(0);
    const child = await db.childProfile.findUniqueOrThrow({ where: { id: f.childId } });
    expect(await identityApprovedForDisplay(f.c, child)).toBe(true);
    expect((await f.ledger()).requests.every((r: { state: string }) => r.state === "settled")).toBe(true);
    expect(generate).toHaveBeenCalledOnce(); expect(fetch).toHaveBeenCalledOnce(); expect(fallback).not.toHaveBeenCalled();
    await db.game.update({ where: { id: f.id }, data: { status: "MANUAL_REVIEW" } });
  });

  it("local-patch identity defers its review to a fresh tick without repainting or showing an unapproved avatar", async () => {
    const f = await fixture(); await fullWorld(f);
    delete process.env.QA_BOARD_CONDITIONED_WIZARD;
    await db.game.update({ where: { id: f.id }, data: { styleVersion: LOCAL_PATCH_STYLE, status: "PAID" } });
    await db.generationJob.update({ where: { id: f.claim.jobId }, data: { status: "QUEUED", attempts: 0, currentStep: null } });
    const fetch = stubStyleFetch(f), start = Date.now(); let now = start;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    const generate = vi.fn(async () => { now += 170_000; return f.result(); }); f.c.avatars.createCharacter = generate;
    try {
      await runGenerationPipeline(f.c, f.id, { hardDeadlineAt: start + 270_000 });
      expect(await f.game()).toMatchObject({ status: "AVATAR_GENERATING", styleVersion: LOCAL_PATCH_STYLE });
      expect(await f.job()).toMatchObject({ status: "QUEUED", currentStep: null });
      expect(fetch).not.toHaveBeenCalled();
      const child = await db.childProfile.findUniqueOrThrow({ where: { id: f.childId } });
      expect(child.avatarAssetId).not.toBeNull(); expect(await identityApprovedForDisplay(f.c, child)).toBe(false);
      await runGenerationPipeline(f.c, f.id, { hardDeadlineAt: now + 270_000 });
      expect(await f.game()).toMatchObject({ status: "TARGETS_GENERATING", styleVersion: LOCAL_PATCH_STYLE });
      expect(generate).toHaveBeenCalledOnce(); expect(fetch).toHaveBeenCalledOnce();
      expect(await identityApprovedForDisplay(f.c, child)).toBe(true);
      await db.game.update({ where: { id: f.id }, data: { status: "MANUAL_REVIEW" } });
    } finally { clock.mockRestore(); }
  });

  it("a refused local-patch identity stays private and never enters either board engine", async () => {
    const f = await fixture(); await fullWorld(f);
    delete process.env.QA_BOARD_CONDITIONED_WIZARD;
    await db.game.update({ where: { id: f.id }, data: { styleVersion: LOCAL_PATCH_STYLE } });
    await db.generationJob.update({ where: { id: f.claim.jobId }, data: { status: "QUEUED", attempts: 0, currentStep: null } });
    const fetch = stubStyleFetch(f, "fail"), generate = vi.fn(async () => f.result()); f.c.avatars.createCharacter = generate;
    await runGenerationPipeline(f.c, f.id);
    await runGenerationPipeline(f.c, f.id);
    const child = await db.childProfile.findUniqueOrThrow({ where: { id: f.childId } });
    expect(await f.game()).toMatchObject({ status: "MANUAL_REVIEW", styleVersion: LOCAL_PATCH_STYLE, configJson: null });
    expect(await identityApprovedForDisplay(f.c, child)).toBe(false);
    expect(JSON.parse((await f.job()).stepsJson)).not.toHaveProperty("boardWizard");
    expect(generate).toHaveBeenCalledOnce(); expect(fetch).toHaveBeenCalledOnce();
  });

  it("a missing local-patch style atlas stops before any identity or review purchase", async () => {
    const f = await fixture(); await fullWorld(f);
    delete process.env.QA_BOARD_CONDITIONED_WIZARD;
    await db.game.update({ where: { id: f.id }, data: { styleVersion: LOCAL_PATCH_STYLE } });
    await db.generationJob.update({ where: { id: f.claim.jobId }, data: { status: "QUEUED", attempts: 0, currentStep: null } });
    fake.styleMissing = true;
    const generate = vi.fn(async () => f.result()), fallback = vi.fn();
    f.c.avatars.createCharacter = generate; f.c.avatars.createAvatar = fallback;
    await runGenerationPipeline(f.c, f.id);
    expect(await f.game()).toMatchObject({ status: "MANUAL_REVIEW", styleVersion: LOCAL_PATCH_STYLE });
    expect(await db.worldBudgetLedger.findUnique({ where: { worldId: `${f.id}:board-wizard` } })).toBeNull();
    expect(generate).not.toHaveBeenCalled(); expect(fallback).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

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
    await generateBoardWizardIdentity(f.c, f.claim, { reserve: f.reserve, generate: async () => f.result(), provenance: f.provenance });
    expect((await reviewPublished(f)).approved).toBe(true);
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
    expect((await f.ledger()).requests).toHaveLength(2);
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
    const fetch = stubStyleFetch(f);
    await db.generationJob.update({ where: { id: f.claim.jobId }, data: { status: "DONE", attempts: 0, currentStep: null } });
    f.c.avatars.createCharacter = async request => {
      calls++; expect(request.styleRef).toEqual(png); expect(request.qaStyleContract).toEqual(f.provenance.style); return f.result();
    };
    await runGenerationPipeline(f.c, f.id);
    expect(await f.game()).toMatchObject({ status: "TARGETS_GENERATING", styleVersion: "fixed-sprite-board-wizard-v1" });
    const envelope = JSON.parse((await f.job()).stepsJson);
    expect(envelope.avatar.status).toBe("done"); expect(envelope.boardWizard.boards).toHaveLength(9);
    const ledger = await f.ledger(); expect(ledger.requests).toHaveLength(2); expect(calls).toBe(1); expect(fetch).toHaveBeenCalledOnce();
    expect(ledger.requests.map((r: { requestKey: string }) => r.requestKey)).toEqual(expect.arrayContaining(["wizard:identity:1", IDENTITY_GATE_KEY]));
    expect(ledger.requests.every((r: { state: string }) => r.state === "settled")).toBe(true);
    const approval = await db.auditLog.findFirstOrThrow({ where: { action: IDENTITY_GATE_ACTION, entityId: envelope.boardWizard.identityAssetId } });
    expect(JSON.parse(approval.metaJson!)).toMatchObject({ approved: true, provenance: f.provenance });
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

  it.each(["fail", "uncertain"] as const)("the fresh actual pipeline holds paintedStyle=%s before any board call or enrollment", async style => {
    const f = await fixture(); await fullWorld(f); const fetch = stubStyleFetch(f, style);
    await db.generationJob.update({ where: { id: f.claim.jobId }, data: { status: "DONE", attempts: 0, currentStep: null } });
    const generate = vi.fn(async () => f.result()); f.c.avatars.createCharacter = generate;
    await runGenerationPipeline(f.c, f.id);
    expect(await f.game()).toMatchObject({ status: "MANUAL_REVIEW", styleVersion: "collage-v1", configJson: null });
    const envelope = JSON.parse((await f.job()).stepsJson);
    expect(envelope).not.toHaveProperty("boardWizard");
    expect(envelope.boardWizardIdentity).toMatchObject({ state: "held", reason: "identity-style-review-required" });
    expect((await f.job()).status).toBe("DONE");
    const child = await db.childProfile.findUniqueOrThrow({ where: { id: f.childId } });
    const reviewed = await db.auditLog.findFirstOrThrow({ where: { action: IDENTITY_GATE_ACTION, entityId: child.identityAssetId! } });
    expect(JSON.parse(reviewed.metaJson!)).toMatchObject({ approved: false, checks: { paintedStyle: style } });
    const ledger = await f.ledger(); expect(ledger.requests).toHaveLength(2);
    expect(ledger.requests.every((r: { state: string }) => r.state === "settled")).toBe(true);
    expect(await db.asset.count({ where: { ownerId: f.ownerId, providerRequestId: f.id } })).toBe(0);
    await runGenerationPipeline(f.c, f.id);
    expect(generate).toHaveBeenCalledOnce(); expect(fetch).toHaveBeenCalledOnce();
  });

  it("direct enrollment cannot bypass the actual mandatory identity approval gate", async () => {
    const f = await fixture(); await fullWorld(f);
    expect(await generateBoardWizardIdentity(f.c, f.claim, { reserve: f.reserve, generate: async () => f.result(), provenance: f.provenance })).toBe(true);
    await expect(enrollBoardConditionedWizard(f.c, f.id, f.claim.jobId, f.claim.jobAttempt)).rejects.toThrow("Identity style approval is required");
    expect(await f.game()).toMatchObject({ status: "AVATAR_GENERATING", styleVersion: "collage-v1", configJson: null });
    expect(JSON.parse((await f.job()).stepsJson)).not.toHaveProperty("boardWizard");
    expect((await f.ledger()).requests).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
    await db.game.update({ where: { id: f.id }, data: { status: "MANUAL_REVIEW" } });
  });

  it("the actual pipeline retains an unknown review charge and does not retry or enroll", async () => {
    const f = await fixture(); await fullWorld(f);
    await db.generationJob.update({ where: { id: f.claim.jobId }, data: { status: "DONE", attempts: 0, currentStep: null } });
    const generate = vi.fn(async () => f.result()); f.c.avatars.createCharacter = generate;
    const response = styleAnswer(), { usage: _missingUsage, ...unverifiable } = response;
    const fetch = vi.fn(async () => new Response(JSON.stringify(unverifiable), { headers: { "x-request-id": `req_style_${f.id}` } }));
    vi.stubGlobal("fetch", fetch);
    await runGenerationPipeline(f.c, f.id);
    expect(await f.game()).toMatchObject({ status: "MANUAL_REVIEW", styleVersion: "collage-v1", configJson: null });
    expect(JSON.parse((await f.job()).stepsJson)).not.toHaveProperty("boardWizard");
    const child = await db.childProfile.findUniqueOrThrow({ where: { id: f.childId } });
    const review = await db.auditLog.findFirstOrThrow({ where: { action: IDENTITY_GATE_ACTION, entityId: child.identityAssetId! } });
    expect(JSON.parse(review.metaJson!)).toMatchObject({ approved: false, checks: null, usage: null });
    const ledger = await f.ledger(); expect(ledger.requests).toHaveLength(2);
    expect(ledger.requests.find((r: { requestKey: string }) => r.requestKey === IDENTITY_GATE_KEY)).toMatchObject({ state: "unknown", reserveMicroUsd: 400_000 });
    await runGenerationPipeline(f.c, f.id);
    expect(generate).toHaveBeenCalledOnce(); expect(fetch).toHaveBeenCalledOnce();
  });

  it.each(["deleted", "replaced-lease"] as const)("a %s review writer cannot publish approval after the model answers", async change => {
    const f = await fixture(); await fullWorld(f);
    await generateBoardWizardIdentity(f.c, f.claim, { reserve: f.reserve, generate: async () => f.result(), provenance: f.provenance });
    const child = await db.childProfile.findUniqueOrThrow({ where: { id: f.childId } });
    const started = deferred<void>(), answer = deferred<{ httpOk: boolean; requestId: string; body: ReturnType<typeof styleAnswer> }>();
    const reviewer = { review: vi.fn(() => { started.resolve(); return answer.promise; }) };
    const running = reviewPublished(f, reviewer);
    const outcome = running.then(() => "unexpected publication", (e: Error) => e.message);
    await started.promise;
    if (change === "deleted") await deleteGame(f.c, f.id, { type: "USER", id: f.ownerId }, f.ownerId);
    else await db.generationJob.update({ where: { id: f.claim.jobId }, data: { attempts: 2 } });
    answer.resolve({ httpOk: true, requestId: `req_style_${f.id}`, body: styleAnswer() });
    expect(await outcome).toContain("stale or deleted identity claim");
    expect(await db.auditLog.count({ where: { action: IDENTITY_GATE_ACTION, entityId: child.identityAssetId! } })).toBe(0);
    expect((await f.ledger()).requests).toHaveLength(2);
    expect((await f.ledger()).requests.every((r: { state: string }) => r.state === "settled")).toBe(true);
    expect(reviewer.review).toHaveBeenCalledOnce();
    expect(JSON.parse((await f.job()).stepsJson)).not.toHaveProperty("boardWizard");
    if (change === "deleted") {
      expect((await f.game()).status).toBe("DELETED");
      expect(await db.asset.count({ where: { ownerId: f.ownerId, status: "READY" } })).toBe(0);
    } else {
      expect(await f.job()).toMatchObject({ status: "RUNNING", attempts: 2 });
      await db.game.update({ where: { id: f.id }, data: { status: "MANUAL_REVIEW" } });
    }
  });
});
