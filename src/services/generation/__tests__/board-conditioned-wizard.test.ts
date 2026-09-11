import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import type { Container } from "../../container";
import { findScene } from "../../../../content/scenes";
import journey from "../../../../content/worlds/journey/world.json";
import { sha256Bytes } from "../fixed-sprite";
import { boardConditioningHash } from "../board-conditioned-source";
import type { BoardConditionedCatalog } from "../board-conditioned-catalog";
import { PrismaBoardConditionedCheckpointStore, boardConditionedCheckpointKeys } from "../../../infra/db/board-conditioned-checkpoints";
import { FIXED_SOURCE_SETTINGS, type FixedSourceResult } from "../../../infra/generation/openai-fixed-source";
import { auditWorldBudget } from "../world-budget";
import { boardWizardContextKey } from "../board-wizard-review-input";
import type { BoardPoseObservationRequest } from "../../../infra/generation/board-pose-observer";
import type { BoardUpperBodyRecoveryRequest } from "../board-upper-body-recovery";

const fakes = vi.hoisted(() => ({ catalog: null as unknown, input: null as unknown, png: null as unknown,
  succeed: false, calls: [] as string[], measurementCalls: [] as (1 | 2)[], remeasureBoard: "", remeasureSuccess: false, failFirstSource: false, illegalRepaint: false,
  sourceReadyBoard: "", engineRequests: [] as { boardId: string; measurementAttempt?: 1 | 2; yieldAfterNewSource?: boolean; transportRecoveryApprovalId?: string }[],
  reviews: [] as string[], events: [] as string[], testers: [] as string[], appEnv: "qa", dailyCeiling: 0, generationEnabled: "on" as "on" | "off",
  onGenerate: null as null | (() => Promise<void>), onIdentityApproval: null as null | (() => Promise<void>), requireDispatch: false,
  upperBody: false, upperBodyOutcome: "ok" as "ok" | "diagnostic" | "throw", upperBodyRequests: [] as unknown[], upperBodyPrepared: 0, upperBodyBound: 0,
  upperBodyOriginal: { state: "source-review-required", measurement: { status: "uncertain", sources: [] }, source: { fingerprint: "original-paid-source-2" } },
  measureInput: null as null | { sheetPng: Buffer; slots: { slotId: string; pose: string }[] } }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: fakes.appEnv, GENERATION_ENABLED: fakes.generationEnabled, GENERATION_DAILY_CENTS: fakes.dailyCeiling, GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium", OPENAI_API_KEY: "synthetic-never-live" }), spendGuard: () => ({ appEnv: fakes.appEnv, realGeneration: true, testers: fakes.testers }) }));
// This suite tests orchestration; the real identity/style gate has its own
// provider/receipt tests. Synthetic images are never visually approved here.
vi.mock("../board-wizard-identity-gate", async original => ({
  ...await original<typeof import("../board-wizard-identity-gate")>(), requireBoardWizardIdentityApproval: async () => { await fakes.onIdentityApproval?.(); },
}));
vi.mock("../board-conditioned-catalog", async original => {
  const actual = await original<typeof import("../board-conditioned-catalog")>();
  return { ...actual, readBoardConditionedCatalog: async () => ({ catalog: fakes.catalog, sha256: boardConditioningHash(fakes.catalog) }),
    loadBoardConditionedCatalogBoard: async (_catalog: unknown, boardId: string, child: unknown) => ({ ...(fakes.input as object), boardId, child,
      ...(fakes.upperBody && boardId === "greatwall" ? { board: { png: fakes.png, sha256: "6519446d0eab2b10699d1035781296eebea27fa5b9473db8a523c269ed7b1c84" } } : {}) }) };
});
vi.mock("../board-conditioned-source", async original => {
  const actual = await original<typeof import("../board-conditioned-source")>();
  return { ...actual, prepareBoardConditionedSource: async (input: unknown) => ({ input, contractSha256: "a".repeat(64) }) };
});
vi.mock("../board-wizard-remeasurement", () => ({ needsBoardStandingRemeasurement: async (input: { boardId: string }, result: { state: string }) => result.state === "review-required" && input.boardId === fakes.remeasureBoard }));
vi.mock("../board-wizard-source-remeasurement", () => ({ needsBoardSourceRemeasurement: async () => false }));
vi.mock("../board-conditioned-generation", () => ({ generateBoardConditionedAppearances: async (deps: { sources: { generate: (request: unknown) => Promise<unknown> }; measure: (request: Omit<BoardPoseObservationRequest, "expectedFingerprint">) => Promise<unknown>; checkpoints: { getSource: (w: string, b: string) => Promise<unknown>; getMeasurement: (w: string, b: string, a?: 1 | 2) => Promise<unknown> } }, request: { worldId: string; input: { boardId: string }; measurementAttempt?: 1 | 2; yieldAfterNewSource?: boolean; transportRecoveryApprovalId?: string }) => {
  fakes.calls.push(request.input.boardId);
  fakes.engineRequests.push({ boardId: request.input.boardId, measurementAttempt: request.measurementAttempt, yieldAfterNewSource: request.yieldAfterNewSource, transportRecoveryApprovalId: request.transportRecoveryApprovalId });
  fakes.events.push(`source:${request.input.boardId}`);
  await fakes.onGenerate?.();
  if (request.input.boardId === fakes.sourceReadyBoard) {
    await deps.checkpoints.getSource(request.worldId, request.input.boardId);
    if (fakes.calls.filter(b => b === fakes.sourceReadyBoard).length === 1) {
      expect(request.yieldAfterNewSource).toBe(true);
      return { state: "source-ready" };
    }
  }
  fakes.measurementCalls.push(request.measurementAttempt ?? 1);
  if (fakes.measureInput) await deps.measure({ ...fakes.measureInput, worldId: request.worldId, requestKey: `board:${request.input.boardId}:measure:${request.measurementAttempt ?? 1}` });
  if (fakes.requireDispatch) await deps.sources.generate({});
  if (request.measurementAttempt === 2) {
    await deps.checkpoints.getMeasurement(request.worldId, request.input.boardId, 2);
    if (fakes.illegalRepaint) await deps.sources.generate({});
  }
  if (fakes.upperBody && request.input.boardId === "greatwall") return fakes.upperBodyOriginal;
  if (request.input.boardId === fakes.remeasureBoard && fakes.failFirstSource && fakes.calls.filter(b => b === fakes.remeasureBoard).length === 1) return { state: "source-review-required" };
  if (request.input.boardId === fakes.remeasureBoard) return request.measurementAttempt === 2 && fakes.remeasureSuccess
    ? { state: "review-required", previewIsDiagnostic: false }
    : { state: "review-required", previewIsDiagnostic: true, appearances: [] };
  return fakes.succeed ? { state: "review-required", previewIsDiagnostic: false } : { state: "source-review-required" };
} }));
// These synthetic mocks verify orchestration only. Real extraction/player parity
// and visual approval are covered elsewhere; no child or live provider is used.
vi.mock("../board-conditioned-player", () => {
  const normal = {
  prepareBoardConditionedPlayerBoard: async (r: { input: { boardId: string } }) => ({ playerBindingSha256: "c".repeat(64), assetWrites: [0, 1, 2, 3].map(i => ({ key: `${r.input.boardId}/${i}`, boardId: r.input.boardId, slotId: i ? `slot-${i}` : null, kind: i ? "premasked-sprite" : "static-board", png: fakes.png, sha256: "d".repeat(64), rgbaSha256: "e".repeat(64), width: 10, height: 10, contentType: "image/png", visibility: "PRIVATE" })) }),
  bindBoardConditionedPlayerGame: async (r: { template: { scenes: { art: object; targets: object[] }[] }; receipts: { url: string }[] }) => ({ privateReviewConfig: { ...r.template, scenes: r.template.scenes.map(s => ({ ...s, art: { ...s.art, base: r.receipts[0]!.url }, targets: s.targets.map((t, i) => ({ ...t, sprite: { kind: "image", url: r.receipts[i + 1]!.url, width: 10, height: 10 } })) })) } }),
  };
  return { ...normal,
    prepareBoardUpperBodyRecoveryPlayerBoard: async (r: BoardUpperBodyRecoveryRequest) => {
      fakes.upperBodyPrepared++;
      return { ...await normal.prepareBoardConditionedPlayerBoard({ input: r.originalInput }),
        manifest: { recovery: { version: "explicit-upper-body-private-player/v1", generatedForDestination: false, originalMeasurementStatus: "uncertain" } } };
    },
    bindBoardUpperBodyRecoveryPlayerGame: async (r: Parameters<typeof normal.bindBoardConditionedPlayerGame>[0] & { mode: string }) => {
      fakes.upperBodyBound++; expect(r.mode).toBe("private-review");
      return { ...await normal.bindBoardConditionedPlayerGame(r), playableGameConfig: null, automaticRelease: false };
    },
  };
});
vi.mock("../board-upper-body-recovery", () => ({ recoverBoardOccludedUpperBody: async (r: BoardUpperBodyRecoveryRequest) => {
  fakes.upperBodyRequests.push(r);
  if (fakes.upperBodyOutcome === "throw") throw new Error("Synthetic recovery foreground does not cover body");
  return { state: "upper-body-recovery-review-required", originalResult: r.originalResult, derivedInput: r.originalInput,
    previewIsDiagnostic: fakes.upperBodyOutcome === "diagnostic", automaticRelease: false,
    provenance: { originalStandingDecision: "uncertain", generatedForDestination: false, originalSourceFingerprint: r.originalResult.source.fingerprint, plan: r.plan } };
} }));
vi.mock("../board-wizard-review-input", async original => {
  const actual = await original<typeof import("../board-wizard-review-input")>();
  return { ...actual, prepareBoardWizardReviews: async (worldId: string, attempt: number, input: { boardId: string }) => [1, 2, 3].map(i => ({ slotId: `slot-${i}`, assetKey: `${input.boardId}/${i}`, patchSha256: sha256Bytes(fakes.png as Buffer), contextKey: actual.boardWizardContextKey(worldId, input.boardId, `slot-${i}`, attempt), contextSha256: sha256Bytes(fakes.png as Buffer), context: fakes.png,
    recipe: { pose: "synthetic", support: "synthetic", occlusion: "synthetic", occlusionMode: "layer", comparators: "synthetic" } })) };
});
vi.mock("../board-wizard-visual-judge", async original => {
  const actual = await original<typeof import("../board-wizard-visual-judge")>();
  return { ...actual, judgeBoardWizardAppearance: async (_deps: unknown, request: { boardId: string; slotId: string }) => {
    fakes.reviews.push(`${request.boardId}/${request.slotId}`);
    fakes.events.push(`review:${request.boardId}/${request.slotId}`);
    return { judgement: { verdict: fakes.reviews.length === 1 ? "unknown" : "ok", reason: "Synthetic review, no visual claim" }, receiptKey: "synthetic-receipt", fingerprint: "f".repeat(64), reused: false };
  } };
});
import { BOARD_WIZARD_STYLE, BOARD_WIZARD_GEOMETRY_REVISION, boardWizardEnabled, enrollBoardConditionedWizard, runBoardConditionedWizardSlice, readBoardWizard, deleteBoardConditionedWizard } from "../board-conditioned-wizard";

let db: PrismaClient, scratch: string, png: Buffer, counter = 0;
beforeAll(async () => {
  scratch = mkdtempSync(path.join(realpathSync(tmpdir()), "findme-wizard-"));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}` } } });
  await applyTestSchema(db);
  png = await sharp({ create: { width: 10, height: 10, channels: 4, background: "#384970" } }).png().toBuffer(); fakes.png = png;
});
beforeEach(() => { process.env.QA_BOARD_CONDITIONED_WIZARD = "true"; fakes.succeed = false; fakes.calls = []; fakes.measurementCalls = [];
  fakes.sourceReadyBoard = ""; fakes.engineRequests = [];
  fakes.upperBody = false; fakes.upperBodyOutcome = "ok"; fakes.upperBodyRequests = []; fakes.upperBodyPrepared = 0; fakes.upperBodyBound = 0;
  fakes.remeasureBoard = ""; fakes.remeasureSuccess = false; fakes.failFirstSource = false; fakes.illegalRepaint = false; fakes.reviews = []; fakes.events = []; fakes.appEnv = "qa";
  fakes.dailyCeiling = 0; fakes.generationEnabled = "on"; fakes.onGenerate = null; fakes.onIdentityApproval = null; fakes.requireDispatch = false; fakes.measureInput = null; });
afterEach(() => { vi.unstubAllGlobals(); });
afterAll(async () => {
  delete process.env.QA_BOARD_CONDITIONED_WIZARD; await db.$disconnect();
  const target = path.resolve(scratch); if (path.dirname(target) === realpathSync(tmpdir()) && path.basename(target).startsWith("findme-wizard-")) rmSync(target, { recursive: true, force: true });
});
async function fixture() {
  const gameId = `wizard-${++counter}`, ownerId = `${gameId}-owner`, childId = `${gameId}-child`, identityId = `${gameId}-identity`, avatarId = `${gameId}-avatar`, email = `${gameId}@example.invalid`;
  await db.user.create({ data: { id: ownerId, email } }); fakes.testers.push(email);
  for (const [id, type, visibility] of [[identityId, "IDENTITY_SHEET", "PRIVATE"], [avatarId, "AVATAR", "GAME"]]) {
    await db.asset.create({ data: { id: id!, ownerId, type: type!, visibility: visibility!, mimeType: "image/png", storagePath: `fixture/${id}`, bytes: png.length, width: 10, height: 10 } });
    await db.fileBlob.create({ data: { key: `fixture/${id}`, contentType: "image/png", data: new Uint8Array(png) } });
  }
  await db.childProfile.create({ data: { id: childId, ownerId, displayName: "Synthetic", ageYears: 6, identityAssetId: identityId, avatarAssetId: avatarId } });
  await db.game.create({ data: { id: gameId, ownerId, childProfileId: childId, status: "AVATAR_GENERATING", packageTier: "ONE_WORLD", sceneCount: 9, paidAt: new Date(), draftToken: `${gameId}-draft` } });
  const ref = { path: "public/board-conditioned/fixture/board.png", sha256: sha256Bytes(png) };
  const slots = (["front-peek", "side-lean", "seated"] as const).map((pose, i) => ({ slot: { id: `slot-${i + 1}`, pose, eye: { x: 2, y: 2 }, faceHeightPx: 2, window: { left: 0, top: 0, width: 10, height: 10 } }, context: { left: 0, top: 0, width: 10, height: 10 }, originalPeople: { left: 0, top: 0, width: 10, height: 10 }, poseDescription: `Synthetic ${pose}`, wardrobe: "Winter clothing", lighting: { key: "Sky light", fill: "Snow fill", shadows: "Blue shade", exposure: "Local value" }, foreground: ref, hintText: { he: "מחבוא", en: "Hiding spot" } }));
  const boards = journey.nodes.map(n => ({ boardId: n.boardSlug, sceneVersion: findScene(n.boardSlug)!.version, board: ref, slots }));
  fakes.catalog = { version: "board-conditioned-qa-catalog/v1", revision: "fixture", worldSlug: "journey", sourcePresentation: "local-composite/v5", boards } satisfies BoardConditionedCatalog;
  fakes.input = { board: { png, sha256: sha256Bytes(png) }, slots };
  for (const [i, b] of boards.entries()) await db.gameScene.create({ data: { id: `${gameId}-${i}`, gameId, sceneSlug: b.boardId, sceneVersion: b.sceneVersion, orderIndex: i } });
  await db.generationJob.create({ data: { id: `job_${gameId}`, gameId, status: "RUNNING", stepsJson: JSON.stringify({ avatar: { status: "done" } }) } });
  await db.auditLog.create({ data: { id: `${gameId}-bill`, actorType: "SYSTEM", action: "sheet:painted", entityType: "Asset", entityId: identityId, metaJson: JSON.stringify({ costCents: 7.25, requestId: `${gameId}-identity-request`, usage: { input_tokens: 10, output_tokens: 100 }, model: "gpt-image-2", costUnknown: false }) } });
  const c = { db, storage: new DbStorage(db) } as unknown as Container;
  return { c, gameId, ownerId, childId, identityId, boards, job: () => db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } }) };
}
async function advanceUntil(f: Awaited<ReturnType<typeof fixture>>, ready: () => boolean) {
  for (let i = 0; i < 80 && !ready(); i++) await runBoardConditionedWizardSlice(f.c, f.gameId);
  expect(ready(), "bounded synthetic wizard ticks reached the expected event").toBe(true);
}
async function upperBodyFixture() {
  const f = await fixture(); fakes.upperBody = true;
  await enrollBoardConditionedWizard(f.c, f.gameId, `job_${f.gameId}`);
  const envelope = JSON.parse((await f.job()).stepsJson);
  for (const b of envelope.boardWizard.boards) Object.assign(b, { attempts: 2, state: "needs-repair", geometryRevision: BOARD_WIZARD_GEOMETRY_REVISION, previousSourceReplayed: true });
  // Replay exactly paid source2 under the new free geometry revision. All other
  // boards are exhausted so this tests the branch without 8 unrelated renders.
  envelope.boardWizard.boards.find((b: { boardId: string }) => b.boardId === "greatwall").geometryRevision = "previous-free-geometry";
  await db.generationJob.update({ where: { id: `job_${f.gameId}` }, data: { stepsJson: JSON.stringify(envelope) } });
  const keys = boardConditionedCheckpointKeys(`${f.gameId}:board-wizard`, "greatwall--attempt-2");
  const originals = [keys.source, keys.measurement].map((key, i) => ({ key, bytes: Buffer.from(JSON.stringify({ synthetic: true, originalPaidAttempt: 2, kind: i ? "uncertain-measurement" : "source" })) }));
  for (const a of originals) await db.fileBlob.create({ data: { key: a.key, contentType: "application/json", data: new Uint8Array(a.bytes) } });
  return { ...f, originals };
}
describe("actual wizard to durable QA world orchestration (synthetic engine, no paid calls)", () => {
  it("persists an explicit source2 upper-body derivation with 3 private sprites, preserves rejected originals, then purges its inventory", async () => {
    const f = await upperBodyFixture(), originalResult = structuredClone(fakes.upperBodyOriginal);
    const ledger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: `${f.gameId}:board-wizard` } });
    const transport = vi.fn(); vi.stubGlobal("fetch", transport);
    await runBoardConditionedWizardSlice(f.c, f.gameId);
    const capsule = readBoardWizard((await f.job()).stepsJson), board = capsule.boards.find(b => b.boardId === "greatwall")!;
    expect(board).toMatchObject({ attempts: 2, selectedSourceAttempt: 2, state: "geometry-ok" });
    expect(board.derivationKey).toMatch(/^private:board-wizard-derivation:/);
    expect(board.visual).toHaveLength(3); expect(board.visual.every(v => v.state === "pending")).toBe(true);
    expect(board.visual[0]!.contextKey).toBe(boardWizardContextKey(`${f.gameId}:board-wizard`, "greatwall", "slot-1", 2));
    expect(fakes.upperBodyRequests).toHaveLength(1);
    expect(fakes.upperBodyRequests[0]).toMatchObject({ originalResult, expectedOriginalContractSha256: "a".repeat(64), plan: { sourceSlotId: "greatwall-upper-tower-solid-parapet-v1", eye: { x: 306, y: 290 }, faceHeightPx: 17 } });
    expect(fakes.upperBodyPrepared).toBe(1); expect(fakes.upperBodyBound).toBe(1); expect(fakes.upperBodyOriginal).toEqual(originalResult);
    const derivation = await db.fileBlob.findUniqueOrThrow({ where: { key: board.derivationKey! } });
    expect(derivation.contentType).toBe("application/json");
    expect(JSON.parse(Buffer.from(derivation.data).toString())).toMatchObject({ version: "wizard-upper-body-derivation/v1", sourceAttempt: 2,
      provenance: { originalStandingDecision: "uncertain", generatedForDestination: false, originalSourceFingerprint: "original-paid-source-2" },
      player: { recovery: { version: "explicit-upper-body-private-player/v1", originalMeasurementStatus: "uncertain" } } });
    const assets = await db.asset.findMany({ where: { id: { in: board.assetIds } } });
    expect(assets).toHaveLength(4); expect(assets.filter(a => a.type === "TARGET_SPRITE")).toHaveLength(3);
    expect(assets.every(a => a.visibility === "PRIVATE" && a.providerRequestId === f.gameId)).toBe(true);
    for (const a of f.originals) expect(Buffer.from((await db.fileBlob.findUniqueOrThrow({ where: { key: a.key } })).data)).toEqual(a.bytes);
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: `${f.gameId}:board-wizard` } })).toEqual(ledger);
    expect(transport).not.toHaveBeenCalled(); expect(fakes.calls).toEqual(["greatwall"]);
    expect(capsule.automaticRelease).toBe(false);
    expect(await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).toMatchObject({ configJson: null, readyAt: null, deliveredAt: null });
    expect(await db.shareLink.count({ where: { gameId: f.gameId } })).toBe(0);
    await deleteBoardConditionedWizard(f.c, f.gameId, { type: "USER", id: f.ownerId }, f.ownerId);
    expect(await db.fileBlob.findUnique({ where: { key: board.derivationKey! } })).toBeNull();
    for (const key of [...f.originals.map(a => a.key), ...assets.map(a => a.storagePath)]) expect(await db.fileBlob.findUnique({ where: { key } })).toBeNull();
    expect(await db.asset.count({ where: { id: { in: board.assetIds }, status: "READY" } })).toBe(0);
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: `${f.gameId}:board-wizard` } })).toEqual(ledger);
  });
  it.each(["throw", "diagnostic"] as const)("does not promote an upper-body recovery that is %s into geometry-ok or persist a derivation", async outcome => {
    const f = await upperBodyFixture(); fakes.upperBodyOutcome = outcome;
    await runBoardConditionedWizardSlice(f.c, f.gameId);
    const board = readBoardWizard((await f.job()).stepsJson).boards.find(b => b.boardId === "greatwall")!;
    expect(board).toMatchObject({ attempts: 2, state: "needs-repair", assetIds: [], visual: [] });
    expect(board.derivationKey).toBeUndefined(); expect(board.selectedSourceAttempt).toBeUndefined();
    expect(fakes.upperBodyRequests).toHaveLength(1); expect(fakes.upperBodyPrepared).toBe(0); expect(fakes.upperBodyBound).toBe(0);
    expect(await db.asset.count({ where: { ownerId: f.ownerId, provider: "board-conditioned-wizard" } })).toBe(0);
    if (outcome === "throw") expect(board.reason).toContain("foreground does not cover body");
    for (const a of f.originals) expect(Buffer.from((await db.fileBlob.findUniqueOrThrow({ where: { key: a.key } })).data)).toEqual(a.bytes);
    expect(await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).toMatchObject({ configJson: null, readyAt: null, deliveredAt: null });
  });
  it("can select the first paid source after the second fails without erasing purchases or buying again", async () => {
    const f = await fixture(); await enrollBoardConditionedWizard(f.c, f.gameId, `job_${f.gameId}`);
    const envelope = JSON.parse((await f.job()).stepsJson);
    Object.assign(envelope.boardWizard.boards[0], { attempts: 2, state: "needs-repair", geometryRevision: BOARD_WIZARD_GEOMETRY_REVISION });
    await db.generationJob.update({ where: { id: `job_${f.gameId}` }, data: { stepsJson: JSON.stringify(envelope) } });
    fakes.succeed = true; fakes.remeasureBoard = "";
    const before = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: `${f.gameId}:board-wizard` } });
    await runBoardConditionedWizardSlice(f.c, f.gameId);
    const selected = readBoardWizard((await f.job()).stepsJson).boards[0]!;
    expect(selected).toMatchObject({ attempts: 2, selectedSourceAttempt: 1, previousSourceReplayed: true, state: "geometry-ok" });
    expect(selected.visual[0]!.contextKey).toBe(boardWizardContextKey(`${f.gameId}:board-wizard`, f.boards[0]!.boardId, "slot-1", 1));
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: `${f.gameId}:board-wizard` } })).toEqual(before);
  });
  it("an unsuccessful earlier source replay happens once and never creates a third source", async () => {
    const f = await fixture(); await enrollBoardConditionedWizard(f.c, f.gameId, `job_${f.gameId}`);
    const envelope = JSON.parse((await f.job()).stepsJson);
    for (const b of envelope.boardWizard.boards) Object.assign(b, { attempts: 2, state: "needs-repair", geometryRevision: BOARD_WIZARD_GEOMETRY_REVISION, previousSourceReplayed: true });
    envelope.boardWizard.boards[0].previousSourceReplayed = false;
    await db.generationJob.update({ where: { id: `job_${f.gameId}` }, data: { stepsJson: JSON.stringify(envelope) } });
    const before = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: `${f.gameId}:board-wizard` } });
    await runBoardConditionedWizardSlice(f.c, f.gameId);
    await runBoardConditionedWizardSlice(f.c, f.gameId);
    expect(readBoardWizard((await f.job()).stepsJson).boards[0]).toMatchObject({ attempts: 2, state: "needs-repair", previousSourceReplayed: true });
    expect(fakes.calls).toEqual([f.boards[0]!.boardId]);
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: `${f.gameId}:board-wizard` } })).toEqual(before);
  });
  it("replays an older failed paid attempt once without consuming a source attempt", async () => {
    const f = await fixture(); await enrollBoardConditionedWizard(f.c, f.gameId, `job_${f.gameId}`);
    const envelope = JSON.parse((await f.job()).stepsJson);
    for (const b of envelope.boardWizard.boards) b.attempts = 1;
    await db.generationJob.update({ where: { id: `job_${f.gameId}` }, data: { stepsJson: JSON.stringify(envelope) } });
    const before = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: `${f.gameId}:board-wizard` } });
    await runBoardConditionedWizardSlice(f.c, f.gameId);
    expect(readBoardWizard((await f.job()).stepsJson).boards[0]).toMatchObject({ attempts: 1, state: "pending", geometryRevision: BOARD_WIZARD_GEOMETRY_REVISION });
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: `${f.gameId}:board-wizard` } })).toEqual(before);
    for (let i = 1; i < 9; i++) await runBoardConditionedWizardSlice(f.c, f.gameId);
    expect(fakes.calls).toEqual(f.boards.map(b => b.boardId));
    expect(readBoardWizard((await f.job()).stepsJson).boards.every(b => b.attempts === 1 && b.geometryRevision === BOARD_WIZARD_GEOMETRY_REVISION)).toBe(true);
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: `${f.gameId}:board-wizard` } })).toEqual(before);
    await runBoardConditionedWizardSlice(f.c, f.gameId);
    expect(readBoardWizard((await f.job()).stepsJson).boards[0]).toMatchObject({ attempts: 2, state: "needs-repair" });
  });
  it.each(["image", "observation"])("a cached geometry replay cannot accidentally buy a missing %s", async kind => {
    const f = await fixture(); await enrollBoardConditionedWizard(f.c, f.gameId, `job_${f.gameId}`);
    const envelope = JSON.parse((await f.job()).stepsJson);
    for (const b of envelope.boardWizard.boards) b.attempts = 1;
    await db.generationJob.update({ where: { id: `job_${f.gameId}` }, data: { stepsJson: JSON.stringify(envelope) } });
    const before = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: `${f.gameId}:board-wizard` } });
    const fetchOnce = vi.fn(); vi.stubGlobal("fetch", fetchOnce);
    if (kind === "image") fakes.requireDispatch = true;
    else fakes.measureInput = { sheetPng: png, slots: [{ slotId: "synthetic", pose: "standing" }] };
    expect(await runBoardConditionedWizardSlice(f.c, f.gameId)).toEqual({ pending: false });
    expect(readBoardWizard((await f.job()).stepsJson).state).toBe("held");
    expect(fetchOnce).not.toHaveBeenCalled();
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: `${f.gameId}:board-wizard` } })).toEqual(before);
  });
  it("schedules one later same-source observation when free replay newly exposes a bad standing landmark", async () => {
    const f = await fixture(); await enrollBoardConditionedWizard(f.c, f.gameId, `job_${f.gameId}`);
    const envelope = JSON.parse((await f.job()).stepsJson);
    for (const b of envelope.boardWizard.boards) b.attempts = 1;
    await db.generationJob.update({ where: { id: `job_${f.gameId}` }, data: { stepsJson: JSON.stringify(envelope) } });
    fakes.remeasureBoard = f.boards[0]!.boardId; fakes.remeasureSuccess = true;
    await runBoardConditionedWizardSlice(f.c, f.gameId);
    expect(readBoardWizard((await f.job()).stepsJson).boards[0]).toMatchObject({ attempts: 1, remeasurements: [{ sourceAttempt: 1, state: "pending" }] });
    expect(fakes.measurementCalls).toEqual([1]);
    await runBoardConditionedWizardSlice(f.c, f.gameId);
    expect(readBoardWizard((await f.job()).stepsJson).boards[0]).toMatchObject({ attempts: 1, state: "geometry-ok", remeasurements: [{ sourceAttempt: 1, state: "done" }] });
    expect(fakes.measurementCalls).toEqual([1, 2]);
  });
  it("can replay an earlier exhausted geometry failure during an active world without creating source3", async () => {
    const f = await fixture(); await enrollBoardConditionedWizard(f.c, f.gameId, `job_${f.gameId}`);
    const envelope = JSON.parse((await f.job()).stepsJson);
    envelope.boardWizard.boards[0].attempts = 2;
    envelope.boardWizard.boards[0].state = "needs-repair";
    await db.generationJob.update({ where: { id: `job_${f.gameId}` }, data: { stepsJson: JSON.stringify(envelope) } });
    fakes.succeed = true;
    const before = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: `${f.gameId}:board-wizard` } });
    await runBoardConditionedWizardSlice(f.c, f.gameId);
    expect(readBoardWizard((await f.job()).stepsJson).boards[0]).toMatchObject({ attempts: 2, state: "geometry-ok", geometryRevision: BOARD_WIZARD_GEOMETRY_REVISION });
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: `${f.gameId}:board-wizard` } })).toEqual(before);
    expect(fakes.calls).toEqual([f.boards[0]!.boardId]);
  });
  it("persists source-ready then measures the same attempt on the next tick before any new board", async () => {
    const f = await fixture(); await enrollBoardConditionedWizard(f.c, f.gameId, `job_${f.gameId}`);
    fakes.succeed = true; fakes.sourceReadyBoard = f.boards[0]!.boardId;
    const lookup = vi.spyOn(PrismaBoardConditionedCheckpointStore.prototype, "getSource");
    try {
      expect(await runBoardConditionedWizardSlice(f.c, f.gameId)).toEqual({ pending: true });
      expect(readBoardWizard((await f.job()).stepsJson).boards[0]).toMatchObject({ attempts: 1, state: "pending", awaitingMeasurement: true, assetIds: [] });
      expect(fakes.measurementCalls).toEqual([]); expect(fakes.reviews).toEqual([]);
      expect(await db.asset.count({ where: { ownerId: f.ownerId, provider: "board-conditioned-wizard" } })).toBe(0);
      expect(await runBoardConditionedWizardSlice(f.c, f.gameId)).toEqual({ pending: true });
      expect(fakes.calls).toEqual([fakes.sourceReadyBoard, fakes.sourceReadyBoard]);
      expect(fakes.measurementCalls).toEqual([1]);
      expect(readBoardWizard((await f.job()).stepsJson).boards[0]).toMatchObject({ attempts: 1, state: "geometry-ok", awaitingMeasurement: false });
      expect(lookup.mock.calls).toEqual([[`${f.gameId}:board-wizard`, fakes.sourceReadyBoard], [`${f.gameId}:board-wizard`, fakes.sourceReadyBoard]]);
      expect(fakes.engineRequests.every(r => r.yieldAfterNewSource === true && r.measurementAttempt === undefined)).toBe(true);
    } finally { lookup.mockRestore(); }
  });
  it("passes approved transport recovery to the same-source second observer and retains the approval", async () => {
    const f = await fixture(); await enrollBoardConditionedWizard(f.c, f.gameId, `job_${f.gameId}`);
    fakes.succeed = true; fakes.remeasureSuccess = true; fakes.remeasureBoard = f.boards[0]!.boardId;
    const job = await f.job(), envelope = JSON.parse(job.stepsJson);
    envelope.boardWizard.boards[0].attempts = 1;
    envelope.boardWizard.boards[0].remeasurements = [{ sourceAttempt: 1, state: "pending", kind: "transport-recovery", approvalId: "operator-approved-once" }];
    await db.generationJob.update({ where: { id: job.id }, data: { stepsJson: JSON.stringify(envelope) } });
    expect(await runBoardConditionedWizardSlice(f.c, f.gameId)).toEqual({ pending: true });
    expect(fakes.engineRequests).toEqual([{ boardId: fakes.remeasureBoard, measurementAttempt: 2, yieldAfterNewSource: true, transportRecoveryApprovalId: "operator-approved-once" }]);
    expect(readBoardWizard((await f.job()).stepsJson).boards[0]).toMatchObject({ attempts: 1, awaitingMeasurement: false, state: "geometry-ok",
      remeasurements: [{ sourceAttempt: 1, state: "done", kind: "transport-recovery", approvalId: "operator-approved-once" }] });
    expect(fakes.calls).toHaveLength(1);
  });
  it.each([{ kind: "transport-recovery" }, { approvalId: "unpaired" }])("rejects unpaired transport recovery metadata %j", async fields => {
    const f = await fixture(); await enrollBoardConditionedWizard(f.c, f.gameId, `job_${f.gameId}`);
    const envelope = JSON.parse((await f.job()).stepsJson);
    envelope.boardWizard.boards[0].attempts = 1;
    envelope.boardWizard.boards[0].remeasurements = [{ sourceAttempt: 1, state: "pending", ...fields }];
    expect(() => readBoardWizard(JSON.stringify(envelope))).toThrow("approval identifier");
    expect(fakes.calls).toEqual([]);
  });
  it.each([0, 239_999])("defers a short %sms deadline before claims, billing or engine work", async remaining => {
    const f = await fixture(); await enrollBoardConditionedWizard(f.c, f.gameId, `job_${f.gameId}`);
    const before = await f.job(), ledger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: `${f.gameId}:board-wizard` } });
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    try { expect(await runBoardConditionedWizardSlice(f.c, f.gameId, { hardDeadlineAt: 1_000_000 + remaining })).toEqual({ pending: true }); }
    finally { clock.mockRestore(); }
    expect(await f.job()).toEqual(before); expect(fakes.calls).toEqual([]); expect(fakes.reviews).toEqual([]);
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: `${f.gameId}:board-wizard` } })).toEqual(ledger);
    expect((await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).status).toBe("TARGETS_GENERATING");
    expect(await runBoardConditionedWizardSlice(f.c, f.gameId, { hardDeadlineAt: Date.now() + 270_000 })).toEqual({ pending: true });
    expect(fakes.calls).toHaveLength(1);
  });
  it("persists a failed observer's private diagnostics, retains exact source, stops redispatch, and deletes its inventory", async () => {
    const f = await fixture(); await enrollBoardConditionedWizard(f.c, f.gameId, `job_${f.gameId}`);
    const worldId = `${f.gameId}:board-wizard`, boardId = f.boards[0]!.boardId, store = new PrismaBoardConditionedCheckpointStore(db);
    const sheet = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: "transparent" } })
      .composite([{ input: Buffer.from('<svg width="1024" height="1024"><rect x="20" y="20" width="60" height="80" fill="red"/></svg>') }]).png().toBuffer();
    const h = (text: string) => sha256Bytes(Buffer.from(text));
    const capture = { settings: { ...FIXED_SOURCE_SETTINGS }, sourceGroupKey: "synthetic-retained-source",
      policy: { timeoutMs: 1000, reserveMicroUsd: 200_000, providerNamespace: "synthetic:test", rateCard: { id: "fixture", textInput: 5, imageInput: 8, imageOutput: 32 } },
      promptSha256: h("prompt"), inputOrder: ["style", "identity"] as ["style", "identity"], styleSha256: h("style"), identitySha256: h("identity") };
    const source: Extract<FixedSourceResult, { kind: "generated" }> = { kind: "generated", png: sheet, pngSha256: sha256Bytes(sheet), fingerprint: h(JSON.stringify(capture)), capture,
      evidence: { providerNamespace: "synthetic:test", providerRequestId: "req_paid_source", usageId: "req_paid_source", model: "gpt-image-2", amountMicroUsd: 50_000,
        rawUsage: { input_tokens: 10, output_tokens: 100 }, costBasis: "conservative-upper-estimate" },
      modelProvenance: "response-confirmed", audit: auditWorldBudget({ worldId, requests: [] }), semanticApproval: "pending" };
    await store.putSource(worldId, boardId, source);
    const sourceKey = boardConditionedCheckpointKeys(worldId, boardId).source;
    const before = Buffer.from((await db.fileBlob.findUniqueOrThrow({ where: { key: sourceKey } })).data);
    fakes.measureInput = { sheetPng: sheet, slots: ["front-peek", "side-lean", "seated"].map((pose, i) => ({ slotId: `slot-${i + 1}`, pose })) };
    const fetchOnce = vi.fn(async () => new Response("do not retain this private gateway HTML", { status: 503, headers: { "x-request-id": "req_wizard_failure" } }));
    vi.stubGlobal("fetch", fetchOnce);
    expect(await runBoardConditionedWizardSlice(f.c, f.gameId)).toEqual({ pending: false });
    expect(await store.getObservationFailure(worldId, boardId)).toMatchObject({ stage: "response-json", failure: "invalid-json", httpStatus: 503, requestId: "req_wizard_failure", billing: "unknown", transportTimeoutMs: 180_000 });
    expect(await store.getMeasurement(worldId, boardId)).toBeNull();
    expect(Buffer.from((await db.fileBlob.findUniqueOrThrow({ where: { key: sourceKey } })).data)).toEqual(before);
    const failureKey = boardConditionedCheckpointKeys(worldId, boardId).observationFailure;
    expect(Buffer.from((await db.fileBlob.findUniqueOrThrow({ where: { key: failureKey } })).data).toString()).not.toContain("private gateway");
    const ledger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } });
    expect(JSON.parse(ledger.snapshotJson).requests).toEqual(expect.arrayContaining([expect.objectContaining({ requestKey: `board:${boardId}:measure:1`, state: "unknown", reserveMicroUsd: 400_000 })]));
    expect(await runBoardConditionedWizardSlice(f.c, f.gameId)).toEqual({ pending: false }); expect(fetchOnce).toHaveBeenCalledTimes(1);
    await deleteBoardConditionedWizard(f.c, f.gameId, { type: "USER", id: f.ownerId }, f.ownerId);
    expect(await db.fileBlob.findUnique({ where: { key: failureKey } })).toBeNull();
    expect(await db.fileBlob.findUnique({ where: { key: sourceKey } })).toBeNull();
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } })).toEqual(ledger);
  });
  it("is opt-in and cannot enable itself in production", () => { expect(boardWizardEnabled()).toBe(true); fakes.appEnv = "production"; expect(boardWizardEnabled()).toBe(false); });
  it("adopts only its own newly generated identity while preserving checkout state and identity cost", async () => {
    const f = await fixture(); await enrollBoardConditionedWizard(f.c, f.gameId, `job_${f.gameId}`);
    const g = await db.game.findUniqueOrThrow({ where: { id: f.gameId } });
    expect(g).toMatchObject({ styleVersion: BOARD_WIZARD_STYLE, status: "TARGETS_GENERATING", configJson: null, draftToken: `${f.gameId}-draft` }); expect(g.paidAt).not.toBeNull();
    expect(readBoardWizard((await f.job()).stepsJson)).toMatchObject({ childProfileId: f.childId, identityAssetId: f.identityId, capMicroUsd: 4_000_000, automaticRelease: false });
    const l = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: `${f.gameId}:board-wizard` } });
    expect(JSON.parse(l.snapshotJson).requests[0].evidence.amountMicroUsd).toBe(72_500);
  });
  it("visits all nine boards then retries once and never substitutes a fallback or publishes", async () => {
    const f = await fixture(); await enrollBoardConditionedWizard(f.c, f.gameId, `job_${f.gameId}`);
    for (let i = 0; i < 18; i++) await runBoardConditionedWizardSlice(f.c, f.gameId);
    expect(fakes.calls.slice(0, 9)).toEqual(f.boards.map(b => b.boardId)); expect(fakes.calls.slice(9)).toEqual(fakes.calls.slice(0, 9));
    await expect(runBoardConditionedWizardSlice(f.c, f.gameId)).resolves.toEqual({ pending: false }); expect(fakes.calls).toHaveLength(18);
    expect(readBoardWizard((await f.job()).stepsJson).boards.every(b => b.attempts === 2 && b.state === "needs-repair")).toBe(true);
    expect(await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).toMatchObject({ status: "MANUAL_REVIEW", configJson: null, readyAt: null, deliveredAt: null });
    expect(await db.shareLink.count({ where: { gameId: f.gameId } })).toBe(0);
  });
  it.each(["REFUNDED", "MANUAL_REVIEW", "NEEDS_NEW_PHOTO"])("does not enroll if %s wins after identity approval while the job lease remains running", async status => {
    const f = await fixture(), before = await f.job();
    fakes.onIdentityApproval = async () => { await db.game.update({ where: { id: f.gameId }, data: { status, lastError: "External stop" } }); };
    await expect(enrollBoardConditionedWizard(f.c, f.gameId, `job_${f.gameId}`)).rejects.toThrow("Lost wizard enrollment claim");
    expect(await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).toMatchObject({ status, styleVersion: "collage-v1", lastError: "External stop", configJson: null });
    expect(await f.job()).toEqual(before); // refund does not have to invalidate the job lease
    expect(fakes.calls).toHaveLength(0);
    const ledger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: `${f.gameId}:board-wizard` } });
    expect(JSON.parse(ledger.snapshotJson).requests[0].evidence.amountMicroUsd).toBe(72_500); // retained historical identity bill
  });
  it("persists all27 exact private image refs and exposes only a review world, then purges their exact inventory", async () => {
    const f = await fixture(); fakes.succeed = true; await enrollBoardConditionedWizard(f.c, f.gameId, `job_${f.gameId}`);
    await runBoardConditionedWizardSlice(f.c, f.gameId);
    expect(fakes.calls).toEqual([f.boards[0]!.boardId]); expect(fakes.reviews).toHaveLength(0);
    expect((await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).status).toBe("TARGETS_GENERATING");
    for (let i = 0; i < 35; i++) await runBoardConditionedWizardSlice(f.c, f.gameId);
    expect(fakes.reviews).toHaveLength(27); expect(fakes.calls).toHaveLength(9);
    expect(fakes.events).toEqual(f.boards.flatMap(b => [`source:${b.boardId}`, ...[1, 2, 3].map(i => `review:${b.boardId}/slot-${i}`)]));
    expect(readBoardWizard((await f.job()).stepsJson).boards[0]!.visual[0]!.state).toBe("review-required");
    const g = await db.game.findUniqueOrThrow({ where: { id: f.gameId } }); expect(g.status).toBe("MANUAL_REVIEW"); expect(g.readyAt).toBeNull();
    const config = JSON.parse(g.configJson!); expect(config.scenes).toHaveLength(9); expect(config.scenes.flatMap((s: { targets: { sprite: { kind: string } }[] }) => s.targets).every((t: { sprite: { kind: string } }) => t.sprite.kind === "image")).toBe(true);
    expect(await db.asset.count({ where: { ownerId: f.ownerId, provider: "board-conditioned-wizard", visibility: "PRIVATE" } })).toBe(36);
    const recoveryKeys = [f.boards[0]!.boardId, `${f.boards[0]!.boardId}--attempt-2`].map(id => boardConditionedCheckpointKeys(`${f.gameId}:board-wizard`, id, 2).measurement);
    for (const key of recoveryKeys) await db.fileBlob.create({ data: { key, contentType: "application/json", data: new Uint8Array(Buffer.from("synthetic private landmarks")) } });
    await expect(deleteBoardConditionedWizard(f.c, f.gameId, { type: "USER", id: f.ownerId }, f.ownerId)).resolves.toBe(true);
    expect(await db.fileBlob.count({ where: { key: { in: recoveryKeys } } })).toBe(0);
    expect(await db.asset.count({ where: { ownerId: f.ownerId, provider: "board-conditioned-wizard", status: "READY" } })).toBe(0);
    expect(await db.worldBudgetLedger.count({ where: { worldId: `${f.gameId}:board-wizard` } })).toBe(1);
  });
  it.each([true, false])("remeasures one retained source on a later tick, never increments source count or rerenders (success=%s)", async success => {
    const f = await fixture(); fakes.succeed = true; fakes.remeasureSuccess = success; fakes.remeasureBoard = f.boards[0]!.boardId;
    await enrollBoardConditionedWizard(f.c, f.gameId, `job_${f.gameId}`);
    await runBoardConditionedWizardSlice(f.c, f.gameId);
    expect(fakes.calls).toHaveLength(1); expect(fakes.measurementCalls).toEqual([1]);
    expect(readBoardWizard((await f.job()).stepsJson).boards[0]).toMatchObject({ attempts: 1, state: "pending", remeasurements: [{ sourceAttempt: 1, state: "pending" }] });
    const lookup = vi.spyOn(PrismaBoardConditionedCheckpointStore.prototype, "getMeasurement");
    await runBoardConditionedWizardSlice(f.c, f.gameId);
    expect(lookup).toHaveBeenCalledWith(`${f.gameId}:board-wizard`, fakes.remeasureBoard, 2); lookup.mockRestore();
    expect(fakes.measurementCalls).toEqual([1, 2]); // retained work gets the immediate next fresh tick
    expect(readBoardWizard((await f.job()).stepsJson).boards[0]).toMatchObject({ attempts: 1, state: success ? "geometry-ok" : "needs-repair", remeasurements: [{ sourceAttempt: 1, state: "done" }] });
    await advanceUntil(f, () => fakes.reviews.length === (success ? 27 : 24));
    expect(fakes.calls).toHaveLength(10); // no third measurement and no source attempt2
    expect((await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).status).toBe("MANUAL_REVIEW");
  });
  it("holds recovery if a faulty core tries to purchase a replacement image", async () => {
    const f = await fixture(); fakes.succeed = true; fakes.illegalRepaint = true; fakes.remeasureBoard = f.boards[0]!.boardId;
    await enrollBoardConditionedWizard(f.c, f.gameId, `job_${f.gameId}`);
    await advanceUntil(f, () => fakes.calls.length === 2);
    expect(readBoardWizard((await f.job()).stepsJson).state).toBe("held");
    expect((await f.job()).lastError).toContain("must never purchase");
    await expect(runBoardConditionedWizardSlice(f.c, f.gameId)).resolves.toEqual({ pending: false }); expect(fakes.calls).toHaveLength(2);
  });
  it("keeps recovery on source attempt2 in its original checkpoint namespace and never starts source3", async () => {
    const f = await fixture(); fakes.succeed = true; fakes.failFirstSource = true; fakes.remeasureBoard = f.boards[0]!.boardId;
    await enrollBoardConditionedWizard(f.c, f.gameId, `job_${f.gameId}`);
    await advanceUntil(f, () => fakes.calls.length === 10);
    expect(readBoardWizard((await f.job()).stepsJson).boards[0]).toMatchObject({ attempts: 2, remeasurements: [{ sourceAttempt: 2, state: "pending" }] });
    const lookup = vi.spyOn(PrismaBoardConditionedCheckpointStore.prototype, "getMeasurement");
    await runBoardConditionedWizardSlice(f.c, f.gameId);
    expect(lookup).toHaveBeenCalledWith(`${f.gameId}:board-wizard`, `${fakes.remeasureBoard}--attempt-2`, 2); lookup.mockRestore();
    expect(readBoardWizard((await f.job()).stepsJson).boards[0]).toMatchObject({ attempts: 2, state: "needs-repair", remeasurements: [{ sourceAttempt: 2, state: "done" }] });
    for (let i = 0; i < 25; i++) await runBoardConditionedWizardSlice(f.c, f.gameId);
    expect(fakes.calls).toHaveLength(11); expect(fakes.measurementCalls.filter(a => a === 2)).toHaveLength(1);
  });
  it("refuses a changed child before any board dispatch", async () => {
    const f = await fixture(); await enrollBoardConditionedWizard(f.c, f.gameId, `job_${f.gameId}`); await db.childProfile.update({ where: { id: f.childId }, data: { ageYears: 8 } });
    await expect(runBoardConditionedWizardSlice(f.c, f.gameId)).rejects.toThrow("identity changed"); expect(fakes.calls).toHaveLength(0);
  });
  it("treats the daily ceiling and the kill switch as a pause, not a hold, and resumes without a person", async () => {
    // These used to land in the same catch as a corrupt capsule: the game went
    // to MANUAL_REVIEW, the capsule was marked held, and turning generation back
    // on did nothing, because a held capsule is not resumed by a tick. Somebody
    // had to reconcile a job that had never gone wrong.
    //
    // A pause must still be VISIBLE - the reason is on the job - but the work
    // keeps its place and the next tick after the pause lifts carries on.
    for (const pause of ["daily-ceiling", "kill-switch"] as const) {
      const f = await fixture(); await enrollBoardConditionedWizard(f.c, f.gameId, `job_${f.gameId}`);
      if (pause === "daily-ceiling") fakes.dailyCeiling = 1; else fakes.generationEnabled = "off";

      await expect(runBoardConditionedWizardSlice(f.c, f.gameId)).resolves.toEqual({ pending: true });
      const paused = await f.job();
      expect(paused.status).toBe("QUEUED");
      expect(paused.lastError).toContain("paused");
      expect(paused.lastError).toContain(pause);
      // Nothing was bought, and nothing was given up.
      expect(fakes.events).toEqual([]);
      expect(readBoardWizard(paused.stepsJson).state).toBe("running");
      expect(await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).toMatchObject({ status: "TARGETS_GENERATING" });

      // Lift the pause: the next tick carries on by itself.
      if (pause === "daily-ceiling") fakes.dailyCeiling = 0; else fakes.generationEnabled = "on";
      await runBoardConditionedWizardSlice(f.c, f.gameId);
      expect(fakes.calls.length).toBeGreaterThan(0);
      fakes.calls.length = 0; fakes.events.length = 0;
    }
  });
  it("holds a changed paid policy under the exact job claim without buying a source", async () => {
    const f = await fixture(); await enrollBoardConditionedWizard(f.c, f.gameId, `job_${f.gameId}`);
    const job = await f.job(), envelope = JSON.parse(job.stepsJson); envelope.boardWizard.sourcePolicySha256 = "9".repeat(64);
    await db.generationJob.update({ where: { id: job.id }, data: { stepsJson: JSON.stringify(envelope) } });
    await expect(runBoardConditionedWizardSlice(f.c, f.gameId)).resolves.toEqual({ pending: false });
    expect((await f.job()).lastError).toContain("policy changed"); expect(readBoardWizard((await f.job()).stepsJson).state).toBe("held");
    expect(fakes.events).toEqual([]);
  });
  it.each(["REFUNDED", "MANUAL_REVIEW", "NEEDS_NEW_PHOTO"])("does not resume a %s game from a stale running capsule or direct tick", async status => {
    const f = await fixture(); await enrollBoardConditionedWizard(f.c, f.gameId, `job_${f.gameId}`);
    await db.game.update({ where: { id: f.gameId }, data: { status } });
    const before = await f.job();
    await expect(runBoardConditionedWizardSlice(f.c, f.gameId)).resolves.toEqual({ pending: false });
    expect(await f.job()).toEqual(before); expect(fakes.events).toEqual([]);
    expect((await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).status).toBe(status);
  });
  it("rechecks the active-status fence immediately before paid dispatch and cannot overwrite a refund", async () => {
    const f = await fixture(); await enrollBoardConditionedWizard(f.c, f.gameId, `job_${f.gameId}`);
    fakes.requireDispatch = true;
    fakes.onGenerate = async () => { await db.game.update({ where: { id: f.gameId }, data: { status: "REFUNDED" } }); };
    const transport = vi.spyOn(globalThis, "fetch");
    try {
      await expect(runBoardConditionedWizardSlice(f.c, f.gameId)).rejects.toThrow("Stale/deleted QA job");
      expect(transport).not.toHaveBeenCalled();
      expect((await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).status).toBe("REFUNDED");
      expect(readBoardWizard((await f.job()).stepsJson).state).toBe("running");
      expect(await db.asset.count({ where: { ownerId: f.ownerId, provider: "board-conditioned-wizard" } })).toBe(0);
    } finally { transport.mockRestore(); }
  });
  it("does not replace a concurrent operator stop with its own catch/hold capsule", async () => {
    const f = await fixture(); await enrollBoardConditionedWizard(f.c, f.gameId, `job_${f.gameId}`);
    fakes.succeed = true;
    let stopped = "";
    fakes.onGenerate = async () => {
      const job = await f.job(), envelope = JSON.parse(job.stepsJson); envelope.boardWizard.state = "held";
      envelope.boardWizard.boards[0].reason = "Explicit user stop"; stopped = JSON.stringify(envelope);
      await db.$transaction([
        db.game.update({ where: { id: f.gameId }, data: { status: "MANUAL_REVIEW", lastError: "User stopped" } }),
        db.generationJob.update({ where: { id: job.id }, data: { status: "DONE", currentStep: null, stepsJson: stopped, lastError: "User stopped" } }),
      ]);
    };
    await expect(runBoardConditionedWizardSlice(f.c, f.gameId)).rejects.toThrow("Stale/deleted QA job");
    expect(await f.job()).toMatchObject({ status: "DONE", currentStep: null, stepsJson: stopped, lastError: "User stopped" });
    expect((await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).lastError).toBe("User stopped");
    expect(await db.asset.count({ where: { ownerId: f.ownerId, provider: "board-conditioned-wizard" } })).toBe(0);
  });
  it("cannot hold or recreate imagery after deletion wins during a source operation", async () => {
    const f = await fixture(); await enrollBoardConditionedWizard(f.c, f.gameId, `job_${f.gameId}`);
    fakes.succeed = true;
    fakes.onGenerate = async () => {
      await deleteBoardConditionedWizard(f.c, f.gameId, { type: "USER", id: f.ownerId }, f.ownerId);
    };
    await expect(runBoardConditionedWizardSlice(f.c, f.gameId)).rejects.toThrow("Stale/deleted QA job");
    expect(await f.job()).toMatchObject({ status: "DONE", currentStep: null, stepsJson: "{}", lastError: null });
    expect(await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).toMatchObject({ status: "DELETED", configJson: null });
    expect(await db.asset.count({ where: { ownerId: f.ownerId, status: "READY" } })).toBe(0);
    expect(await db.worldBudgetLedger.count({ where: { worldId: `${f.gameId}:board-wizard` } })).toBe(1);
  });
  it("does not let a stale identity runner enroll using a replacement job lease", async () => {
    const f = await fixture();
    await expect(enrollBoardConditionedWizard(f.c, f.gameId, `job_${f.gameId}`, 99)).rejects.toThrow("Lost wizard enrollment claim");
    expect(await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).toMatchObject({ styleVersion: "collage-v1", status: "AVATAR_GENERATING", configJson: null });
    expect((await f.job()).status).toBe("RUNNING");
  });
});
