import { planLeanCompletionBudget, authorizeLeanCompletionBudget, readLeanCompletionBudget, leanCompletionBudgetAuditId } from "../lean-completion-budget";
import { boardConditioningHash } from "../board-conditioned-source";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import type { CharacterInput } from "../../../infra/generation/types";
import type { Container } from "../../container";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { boardsOfWorlds } from "../../world-catalog.service";
import { seedApprovedGame, bill } from "./local-patch-fixtures";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { reviewBoardWizardIdentity, identityApprovedForDisplay } from "../board-wizard-identity-gate";
import { sha256Bytes } from "../fixed-sprite";
import { pinVisualReviewRelease, DUAL_VISUAL_REVIEW_V3 } from "../visual-review-release";
import { LOCAL_PATCH_LEAN_ACTION, leanReleaseAuditId, leanReleaseReceipt } from "../lean-release";
import { enrollLeanWorld } from "../lean-enrollment";
import { subjectUpgradeOf } from "../subject-enrollment";
import { planIdentitySourceRevision, beginIdentitySourceRevision, advanceIdentitySourceRevision, retryIdentitySourceRevision } from "../identity-source-revision";
import { identityRevisionPending } from "../identity-source-revision-state";
import { runLocalPatchHide } from "../local-patch-hide";
import { reviewLocalPatchBoard } from "../local-patch-board-review";
import { runLocalPatchSelfRepair } from "../local-patch-self-repair";
import { composeLocalPatchGame } from "../local-patch-player";
import { deleteLocalPatchGame } from "../local-patch-deletion";

// Only the old transport-continuation qualification and static atlas are stubbed in these boundary tests.
// The all-27 regression in local-patch-lean-world.test.ts uses the real 2+4 stop, pin and continuations.
const h = vi.hoisted(() => ({ pins: new Map<string, unknown>(), atlasChanged: false, testers: [] as string[], sheet: null as Buffer | null, catalog: "" }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0,
  GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium", OPENAI_API_KEY: "synthetic-never-live", LOCAL_PATCH_PROMPT_RELEASE: "v19" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: h.testers }), flag: () => false, adminEmails: () => [] }));
vi.mock("../lean-review-recovery", () => ({ planLeanReviewRecovery: vi.fn(async () => ({ eligible: true, binding: {}, planSha256: "a".repeat(64) })), applyLeanReviewRecovery: vi.fn(async (c, input) => { const job = await c.db.generationJob.findUniqueOrThrow({ where: { id: `job_${input.gameId}` } });
  const { parkedHoldSha256 } = await import("../lean-review-recovery-pin"); h.pins.set(input.gameId, { mode: "existing-world", planSha256: input.expectedPlanSha256,
    binding: { jobId: job.id, holdSha256: parkedHoldSha256(job) }, operatorId: input.operatorId }); }) }));
vi.mock("../lean-review-recovery-pin", async original => ({ ...await original<typeof import("../lean-review-recovery-pin")>(), leanReviewRecoveryOf: async (_db: unknown, gameId: string) => h.pins.get(gameId) ?? null }));
vi.mock("../subject-upgrade", async original => ({ ...await original<typeof import("../subject-upgrade")>(), continueAdmittedReviewInterruptions: vi.fn(async () => "none") }));
vi.mock("../board-wizard-identity-style", () => ({ buildBoardWizardIdentityStyle: async () => ({ version: "board-matched-identity/v6", png: h.sheet!,
  catalogSha256: h.atlasChanged ? "f".repeat(64) : h.catalog, atlasSha256: sha256Bytes(h.sheet!), examples: [] }) }));
const journey = new Set(boardsOfWorlds(["journey"])), boards = localPatchBoardsForVersion(12).filter(board => journey.has(board.board));
let directory: string, db: PrismaClient, seq = 0;
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-source-revision-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(directory, "test.db").replaceAll("\\", "/")}` } } });
  await applyTestSchema(db); h.catalog = (await readBoardConditionedCatalog()).sha256;
}, 180_000);
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(directory) === realpathSync(tmpdir()) && path.basename(directory).startsWith("findme-source-revision-")) rmSync(directory, { recursive: true });
});
beforeEach(() => { h.atlasChanged = false; vi.stubGlobal("fetch", vi.fn(async () => { throw Error("Live HTTP forbidden"); })); });

async function fixture() {
  const gameId = `source-boundary-${++seq}`, operatorId = `operator-${seq}`, email = `operator-${seq}@example.invalid`;
  await db.user.create({ data: { id: operatorId, email } });
  const c = { db, storage: new DbStorage(db), adminEmails: [email], analytics: { track: vi.fn() }, backgroundReview: {} } as unknown as Container;
  const seeded = await seedApprovedGame(c, db, { gameId, approved: false, withJob: true, status: "TARGETS_GENERATING", styleVersion: "local-patch-world-v1",
    scenes: boards.map(board => ({ slug: board.board, version: 12 })) });
  h.sheet = seeded.sheet; h.testers.push(seeded.email);
  await c.storage.put(`private/photo-${gameId}.jpg`, seeded.sheet, "image/png");
  const avatarId = `avatar-${gameId}`;
  await c.storage.put(`game/${avatarId}.png`, seeded.sheet, "image/png");
  await db.asset.create({ data: { id: avatarId, ownerId: seeded.userId, type: "AVATAR", visibility: "GAME", storagePath: `game/${avatarId}.png`, mimeType: "image/png", bytes: seeded.sheet.length } });
  await db.childProfile.update({ where: { id: `chl-${gameId}` }, data: { avatarAssetId: avatarId } });
  await db.order.create({ data: { id: `order-${gameId}`, gameId, userId: seeded.userId, provider: "mock", packageTier: "ONE_WORLD", amountAgorot: 3900, paymentStatus: "PAID", paidAt: new Date() } });
  const provenance = { promptVersion: "character-v6-painted-identity-geometry" as const, quality: "medium" as const, photoAssetId: `ast-photo-${gameId}`, photoSha256: sha256Bytes(seeded.sheet),
    ageYears: 8, crop: null, style: { version: "board-matched-identity/v4" as const, catalogSha256: h.catalog, atlasSha256: sha256Bytes(seeded.sheet) } };
  await db.auditLog.create({ data: { id: `paint-${gameId}`, actorType: "SYSTEM", action: "sheet:painted", entityType: "Asset", entityId: `ast-sheet-${gameId}`,
    metaJson: JSON.stringify({ gameId, identityProvenance: provenance }) } });
  await reviewBoardWizardIdentity({ db, budget: boardWizardBudgetOf(c), apiKey: "synthetic", beforeDispatch: async () => {}, write: fn => db.$transaction(fn),
    reviewer: { review: async () => ({ httpOk: true, requestId: `req_original_${gameId}`, body: { model: "gpt-5.6-luna", usage: { prompt_tokens: 1500, completion_tokens: 100 },
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ checks: { identity: "pass", age: "pass", paintedStyle: "pass", sheetLayout: "pass" }, reason: "Synthetic original" }) } }] } }) } },
    { gameId, identityAssetId: `ast-sheet-${gameId}`, photo: seeded.sheet, sheet: seeded.sheet, atlas: seeded.sheet, provenance, contentVersion: 12 });
  await db.$transaction(tx => pinVisualReviewRelease(tx, gameId, DUAL_VISUAL_REVIEW_V3));
  await db.auditLog.create({ data: { id: leanReleaseAuditId(gameId), actorType: "SYSTEM", action: LOCAL_PATCH_LEAN_ACTION, entityType: "Game", entityId: gameId, metaJson: JSON.stringify(leanReleaseReceipt(gameId)) } });
  expect((await enrollLeanWorld(c, gameId, async () => {})).state).toBe("enrolled");
  await db.generationJob.update({ where: { id: `job_${gameId}` }, data: { status: "FAILED", currentStep: "local-patch:needs-release", attempts: 24, lastError: "Synthetic previously qualified quota stop" } });
  let n = 0;
  const create = vi.fn(async (_input: CharacterInput) => {
    const marker = await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: ++n * 30, g: 10, b: 190, alpha: 255 } } }).png().toBuffer();
    const png = await sharp(seeded.sheet).composite([{ input: marker, left: 5, top: 5 }]).png().toBuffer();
    return { sheetPng: png, sheetWidth: 1024, sheetHeight: 1024, avatarPng: png, avatarWidth: 1024, avatarHeight: 1024,
      model: "gpt-image-2", usage: { input_tokens: 1000, output_tokens: 1000 }, costCents: 5, providerRequestId: `req_${gameId}_${n}`, durationMs: 1, attempts: 1 };
  });
  c.avatars = { id: "openai", createCharacter: create } as unknown as Container["avatars"];
  const plan = await planIdentitySourceRevision(c, gameId);
  const begin = () => beginIdentitySourceRevision(c, { gameId, operatorId, expectedPlanSha256: plan.planSha256 });
  return { c, gameId, operatorId, seeded, create, begin, plan, budget: boardWizardBudgetOf(c), worldId: boardWizardWorldId(gameId) };
}
const review = (status = "pass") => vi.stubGlobal("fetch", vi.fn(async () => Response.json({ model: "gpt-6.1-sol", service_tier: "default", usage: { prompt_tokens: 2000, completion_tokens: 400 },
  choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ checks: { identity: status, age: "pass", paintedStyle: "pass", sheetLayout: "pass",
    sourceFaceVisible: "pass", facialVolume: "pass", viewConsistency: "pass" }, reason: "Synthetic source geometry evidence" }) } }] }, { headers: { "x-request-id": `req_review_${Math.random().toString(36).slice(2)}` } })));

describe("paid identity source revision boundaries; all images/providers synthetic", () => {
  it("blocks old painting, self-repair, new review, display and assembly while pending, without a paid call", async () => {
    const f = await fixture(); await f.begin(); const board = boards[0]!, hide = board.hides[0]!;
    await expect(runLocalPatchHide(f.c, {} as never, { gameId: f.gameId, board, hide })).rejects.toThrow("reference revision");
    await expect(runLocalPatchSelfRepair(f.c, { gameId: f.gameId, sceneId: "synthetic", board, hide }, {} as never)).rejects.toThrow("reference revision");
    await expect(reviewLocalPatchBoard(f.c, { gameId: f.gameId, sceneId: "synthetic" }, {} as never)).rejects.toThrow("reference revision");
    await expect(composeLocalPatchGame(f.c, f.gameId)).rejects.toThrow("reference revision");
    expect(await identityApprovedForDisplay(f.c, { identityAssetId: `ast-sheet-${f.gameId}`, originalPhotoAssetId: `ast-photo-${f.gameId}`, ageYears: 8 }, 12)).toBe(false);
    expect(f.create).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["age", "refund", "photo"])("refuses a changed %s after planning/beginning, with no new supplier request", async kind => {
    const f = await fixture(); await f.begin();
    if (kind === "age") await db.childProfile.update({ where: { id: `chl-${f.gameId}` }, data: { ageYears: 9 } });
    if (kind === "refund") await db.order.update({ where: { id: `order-${f.gameId}` }, data: { paymentStatus: "REFUNDED", refundedAt: new Date() } });
    if (kind === "photo") await f.c.storage.put(`private/photo-${f.gameId}.jpg`, Buffer.from("changed synthetic photo"), "image/jpeg");
    await expect(advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId })).rejects.toThrow();
    expect(f.create).not.toHaveBeenCalled(); expect(await f.budget.readRequest(f.worldId, "wizard:identity:2")).toBeNull();
  });
  it("keeps a lost image dispatch unknown in full and never buys it again", async () => {
    const f = await fixture(); await f.begin(); f.create.mockRejectedValueOnce(Error("synthetic lost wire"));
    expect((await advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId })).state).toBe("retry");
    const lost = await f.budget.readRequest(f.worldId, "wizard:identity:2");
    expect(lost).toMatchObject({ state: "unknown", reserveMicroUsd: 500_000 });
    review(); expect((await advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId })).state).toBe("committed");
    expect(f.create).toHaveBeenCalledTimes(2); expect(await f.budget.readRequest(f.worldId, "wizard:identity:2")).toEqual(lost);
    expect(await f.budget.readContinuationApproval(f.worldId, "wizard:identity:2")).toMatchObject({ version: "world-unknown-continuation/v1", operatorId: f.operatorId,
      operationFingerprint: lost!.operationFingerprint, reserveMicroUsd: 500_000 });
    expect((await db.childProfile.findUniqueOrThrow({ where: { id: `chl-${f.gameId}` } })).identityAssetId).not.toBe(`ast-sheet-${f.gameId}`);
  });
  it("never buys an image whose review cannot fit the unchanged cap", async () => {
    const f = await fixture(); await f.begin();
    await f.budget.reserve(f.worldId, { requestKey: "synthetic-retained-history", scope: "identity", operationFingerprint: "synthetic-retained", reserveMicroUsd: 3_200_000 });
    await f.budget.settle(f.worldId, "synthetic-retained-history", bill(`req_history_${f.gameId}`, 3_200_000));
    await expect(advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId })).rejects.toThrow("unchanged world cap");
    expect(f.create).not.toHaveBeenCalled(); expect((await f.budget.audit(f.worldId)).capMicroUsd).toBe(4_000_000);
  });
  it("changes strategy after two typed failures, stops at three, and never fabricates a reference pass", async () => {
    const f = await fixture(); await f.begin(); review("fail");
    for (let n = 0; n < 3; n++) expect((await advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId })).state).toBe("retry");
    await expect(advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId })).rejects.toThrow("three new reference candidates failed");
    expect(f.create).toHaveBeenCalledTimes(3); expect(f.create.mock.calls[2]![0].identityRepair?.reason).toContain("Two candidates failed: change face construction");
    expect(await identityRevisionPending(db, f.gameId)).toBe(true); expect((await db.generationJob.findUniqueOrThrow({ where: { id: `job_${f.gameId}` } })).attempts).toBe(24);
  });
  it("keeps a known bill after deletion wins the render race, and retains no late child image", async () => {
    const f = await fixture(); await f.begin(); const output = f.create.getMockImplementation()!;
    f.create.mockImplementation(async input => { await deleteLocalPatchGame(f.c, f.gameId, { type: "ADMIN", id: f.operatorId }); return output(input); });
    expect((await advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId })).state).toBe("retry");
    expect(await f.budget.readRequest(f.worldId, "wizard:identity:2")).toMatchObject({ state: "settled" });
    expect(await db.asset.count({ where: { ownerId: f.seeded.userId, status: "READY" } })).toBe(0); expect(fetch).not.toHaveBeenCalled();
  });
  it("adopts only a paid reviewed candidate, preserves original enrollment and counters, replays once and deletes every candidate", async () => {
    const f = await fixture(); const original = await subjectUpgradeOf(db, f.gameId); await f.begin(); review();
    expect((await advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId })).state).toBe("committed");
    const effective = await subjectUpgradeOf(db, f.gameId);
    expect(effective?.identityAssetId).not.toBe(original?.identityAssetId); expect(effective?.identityRevision).toBeTruthy();
    expect((await db.generationJob.findUniqueOrThrow({ where: { id: `job_${f.gameId}` } })).attempts).toBe(24);
    expect((await advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId })).state).toBe("committed"); expect(f.create).toHaveBeenCalledOnce();
    const ledger = (await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } })).snapshotJson;
    await deleteLocalPatchGame(f.c, f.gameId, { type: "ADMIN", id: f.operatorId });
    expect(await db.asset.count({ where: { ownerId: f.seeded.userId, status: "READY" } })).toBe(0);
    expect((await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } })).snapshotJson).toBe(ledger);
  });
});


it("defers before reserving an image when its creation slice is too short", async () => {
  const f = await fixture(); await f.begin();
  expect((await advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId, deadlineAt: Date.now() + 100_000 })).state).toBe("deferred");
  expect(f.create).not.toHaveBeenCalled(); expect(await f.budget.readRequest(f.worldId, "wizard:identity:2")).toBeNull(); expect(fetch).not.toHaveBeenCalled();
});
it("retains a paid image when HIGH review needs a fresh slice, then reviews it without repainting", async () => {
  const f = await fixture(); await f.begin(); review();
  const render = f.create.getMockImplementation()!, now = Date.now(); let clock: ReturnType<typeof vi.spyOn> | undefined;
  f.create.mockImplementation(async input => { const output = await render(input); clock = vi.spyOn(Date, "now").mockReturnValue(now + 100_000); return output; });
  try { expect((await advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId, deadlineAt: now + 270_000 })).state).toBe("deferred"); }
  finally { clock?.mockRestore(); }
  expect(f.create).toHaveBeenCalledOnce(); expect(fetch).not.toHaveBeenCalled();
  expect(await f.budget.readRequest(f.worldId, "wizard:identity:2")).toMatchObject({ state: "settled" });
  expect((await advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId, deadlineAt: Date.now() + 270_000 })).state).toBe("committed");
  expect(f.create).toHaveBeenCalledOnce(); expect(fetch).toHaveBeenCalledOnce();
});


it("refuses a one-world rejection of canonical assets shared by a different profile", async () => {
  const f = await fixture();
  await db.childProfile.create({ data: { id: `other-profile-${f.gameId}`, ownerId: f.seeded.userId, displayName: "Synthetic other profile", ageYears: 8,
    identityAssetId: `ast-sheet-${f.gameId}` } });
  await expect(f.begin()).rejects.toThrow("shared canonical assets");
  expect(f.create).not.toHaveBeenCalled(); expect(await identityRevisionPending(db, f.gameId)).toBe(false);
});


it("refuses unconfigured providers or changed atlas before an irreversible start", async () => {
  const f = await fixture(); f.c.avatars = { id: "mock" } as never;
  await expect(f.begin()).rejects.toThrow("configured existing QA");
  expect(await identityRevisionPending(db, f.gameId)).toBe(false);
  const other = await fixture(); h.atlasChanged = true;
  await expect(other.begin()).rejects.toThrow("retained board style changed");
  expect(await identityRevisionPending(db, other.gameId)).toBe(false); expect(other.create).not.toHaveBeenCalled();
});
it("accepts the already-authorized historical continuation only while it still binds the exact parked hold", async () => {
  const f = await fixture(), job = await db.generationJob.findUniqueOrThrow({ where: { id: `job_${f.gameId}` } });
  const { parkedHoldSha256 } = await import("../lean-review-recovery-pin");
  h.pins.set(f.gameId, { mode: "existing-world", planSha256: "a".repeat(64), binding: { jobId: job.id, holdSha256: parkedHoldSha256(job) } });
  await f.begin(); expect(await identityRevisionPending(db, f.gameId)).toBe(true);
  const other = await fixture(); h.pins.set(other.gameId, { mode: "existing-world", planSha256: "a".repeat(64), binding: { jobId: `job_${other.gameId}`, holdSha256: "0".repeat(64) } });
  await expect(other.begin()).rejects.toThrow("not safely continuable"); expect(other.create).not.toHaveBeenCalled();
});
it("resumes a retained service diagnosis without erasing it, changing the original hold or adding a paid attempt", async () => {
  const f = await fixture(); await f.begin(); const before = await db.generationJob.findUniqueOrThrow({ where: { id: `job_${f.gameId}` } });
  const heldId = `synthetic-held-${f.gameId}`;
  await db.auditLog.create({ data: { id: heldId, actorType: "SYSTEM", action: "generation:identity-source-revision-held", entityType: "Game", entityId: f.gameId,
    metaJson: JSON.stringify({ version: "identity-source-revision-queue/v1", code: "synthetic-service-fault" }) } });
  const { identityRevisionHeldOf } = await import("../identity-source-revision-state");
  await expect(retryIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId, expectedHeldId: "stale-held-id" })).rejects.toThrow("diagnosis changed");
  await retryIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId, expectedHeldId: heldId });
  expect(await identityRevisionHeldOf(db, f.gameId)).toBeNull(); expect(await db.auditLog.findUnique({ where: { id: heldId } })).toBeTruthy();
  expect(await db.generationJob.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before); expect(f.create).not.toHaveBeenCalled();
  review(); expect((await advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId })).state).toBe("committed");
  expect(f.create).toHaveBeenCalledOnce();
});
it("keeps a never-dispatched reservation pending after a DB failure, then completes the SAME key once", async () => {
  const f = await fixture(); await f.begin(); review();
  const transaction = db.$transaction.bind(db);
  const spy = vi.spyOn(db, "$transaction").mockImplementation((async (callback: unknown, options: unknown) => transaction(async tx => {
    const create = tx.auditLog.create.bind(tx.auditLog);
    tx.auditLog.create = ((args: { data: { action?: string } }) => args.data.action === "generation:identity-source-dispatch-intent"
      ? Promise.reject(new Prisma.PrismaClientKnownRequestError("synthetic DB contention before dispatch", { code: "P2034", clientVersion: "synthetic" })) : create(args as never)) as never;
    return (callback as (client: typeof tx) => Promise<unknown>)(tx);
  }, options as never)) as never);
  try { await expect(advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId })).rejects.toMatchObject({ code: "P2034" }); }
  finally { spy.mockRestore(); }
  expect(f.create).not.toHaveBeenCalled(); expect(await f.budget.readRequest(f.worldId, "wizard:identity:2")).toMatchObject({ state: "pending", reserveMicroUsd: 500_000 });
  expect((await advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId })).state).toBe("committed");
  expect(f.create).toHaveBeenCalledOnce(); expect(await f.budget.readRequest(f.worldId, "wizard:identity:2")).toMatchObject({ state: "settled" });
});
it("retries retaining paid image bytes after DB contention without another render", async () => {
  const f = await fixture(); await f.begin(); review();
  const transaction = db.$transaction.bind(db); let failures = 0;
  const spy = vi.spyOn(db, "$transaction").mockImplementation((async (callback: unknown, options: unknown) => transaction(async tx => {
    const create = tx.asset.create.bind(tx.asset);
    tx.asset.create = ((args: unknown) => failures++ === 0 ? Promise.reject(new Prisma.PrismaClientKnownRequestError("synthetic paid image write contention", { code: "P2034", clientVersion: "synthetic" })) : create(args as never)) as never;
    return (callback as (client: typeof tx) => Promise<unknown>)(tx);
  }, options as never)) as never);
  try { expect((await advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId })).state).toBe("committed"); }
  finally { spy.mockRestore(); }
  expect(failures).toBeGreaterThan(1); expect(f.create).toHaveBeenCalledOnce();
});


it("uses a sufficient image-only window and defers HIGH review to its own next slice", async () => {
  const f = await fixture(); await f.begin(); review();
  expect((await advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId, deadlineAt: Date.now() + 190_000 })).state).toBe("deferred");
  expect(f.create).toHaveBeenCalledOnce(); expect(fetch).not.toHaveBeenCalled();
  expect((await advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId, deadlineAt: Date.now() + 270_000 })).state).toBe("committed");
  expect(f.create).toHaveBeenCalledOnce(); expect(fetch).toHaveBeenCalledOnce();
});


it("continues after a lost HIGH review without clearing its full reserve or asking its exact key again", async () => {
  const f = await fixture(); await f.begin();
  const lostFetch = vi.fn(async () => { throw Error("synthetic lost review"); }); vi.stubGlobal("fetch", lostFetch);
  expect((await advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId })).state).toBe("retry");
  const before = await f.budget.audit(f.worldId), key = before.unknownRequestKeys[0]!;
  expect(key).toMatch(/^wizard:identity-style:1:/); const lost = await f.budget.readRequest(f.worldId, key);
  expect(lost).toMatchObject({ state: "unknown", reserveMicroUsd: 400_000 });
  review(); expect((await advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId })).state).toBe("committed");
  expect(f.create).toHaveBeenCalledTimes(2); expect(lostFetch).toHaveBeenCalledOnce(); expect(fetch).toHaveBeenCalledOnce();
  expect(await f.budget.readRequest(f.worldId, key)).toEqual(lost); expect(await f.budget.readContinuationApproval(f.worldId, key)).toMatchObject({ version: "world-unknown-continuation/v1", reserveMicroUsd: 400_000 });
  const { identityRevisionContinuationPublishable } = await import("../identity-source-revision-state");
  expect(await identityRevisionContinuationPublishable(db, f.budget, f.gameId, (await f.budget.readContinuationApproval(f.worldId, key))! as never)).toBe(true);
});
it("rejudges a settled unreadable HIGH answer once on the SAME pixels before another painting", async () => {
  const f = await fixture(); await f.begin(); review();
  let now = Date.now(); const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
  const deadlineAt = now + 210_000;
  vi.mocked(fetch).mockImplementationOnce(async () => { now += 10_000; return Response.json({ model: "gpt-6.1-sol", service_tier: "default", usage: { prompt_tokens: 2000, completion_tokens: 400 },
    choices: [{ finish_reason: "stop", message: { content: "{malformed" } }] }, { headers: { "x-request-id": "req_synthetic_malformed" } }); });
  try { expect((await advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId, deadlineAt })).state).toBe("deferred"); }
  finally { clock.mockRestore(); }
  const broken = await db.auditLog.findFirstOrThrow({ where: { action: "board-wizard:identity-style-reviewed", entityType: "Asset", metaJson: { contains: "req_synthetic_malformed" } } });
  const original = JSON.parse(broken.metaJson!);
  expect(original.checks).toBeNull(); expect(original.approved).toBe(false);
  expect(original.outcome).toMatchObject({ state: "json-invalid", dispatchAttempted: true, rawContent: "{malformed" });
  // Reproduce the deployed old paid v5 receipt: diagnostics did not exist yet. Its fingerprint is unchanged.
  delete original.outcome;
  const oldRow = await db.auditLog.findFirstOrThrow({ where: { action: "board-wizard:identity-style-reviewed", entityType: "Asset", entityId: original.identityAssetId } });
  await db.auditLog.update({ where: { id: oldRow.id }, data: { metaJson: JSON.stringify(original) } });
  const retainedOriginal = await db.auditLog.findUniqueOrThrow({ where: { id: oldRow.id } });
  expect((await advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId })).state).toBe("committed");
  const { identityGateReceiptOf, identityReceiptReadyForPublication, identityReviewRequestKey } = await import("../board-wizard-identity-gate");
  const resolved = (await identityGateReceiptOf(db, broken.entityId))!;
  expect(resolved.version).toBe("board-wizard-identity-source-sol-high-rejudge/v1");
  expect(resolved.rejudge).toMatchObject({ gameId: f.gameId, attempt: 2, originalFingerprint: original.fingerprint, originalCostMicroUsd: original.costMicroUsd });
  expect(resolved.imageHashes).toEqual(original.imageHashes); expect(resolved.prompt).toBe(original.prompt);
  expect(identityReceiptReadyForPublication(resolved, 12)).toBe(true);
  expect(identityReviewRequestKey(resolved)).not.toBe(identityReviewRequestKey(original));
  expect(await f.budget.readRequest(f.worldId, identityReviewRequestKey(original))).toMatchObject({ state: "settled", operationFingerprint: original.fingerprint });
  expect(await f.budget.readRequest(f.worldId, identityReviewRequestKey(resolved))).toMatchObject({ state: "settled", operationFingerprint: resolved.fingerprint });
  const sent = vi.mocked(fetch).mock.calls.map(call => JSON.parse(String(call[1]?.body)));
  expect(sent.map(body => body.response_format.type)).toEqual(["json_object", "json_schema"]);
  expect(sent[1].response_format.json_schema).toMatchObject({ strict: true });
  expect(sent[1].messages).toEqual(sent[0].messages); expect(sent[1].model).toBe("gpt-6.1-sol"); expect(sent[1].reasoning_effort).toBe("high");
  expect(f.create).toHaveBeenCalledOnce(); expect(fetch).toHaveBeenCalledTimes(2);
  expect((await f.budget.audit(f.worldId)).unknownRequestKeys).toHaveLength(0);
  expect(await db.auditLog.findUniqueOrThrow({ where: { id: broken.id } })).toEqual(retainedOriginal);
  const before = await f.budget.audit(f.worldId);
  expect((await advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId })).state).toBe("committed");
  expect(await f.budget.audit(f.worldId)).toEqual(before); expect(fetch).toHaveBeenCalledTimes(2);
  expect(await identityApprovedForDisplay(f.c, { identityAssetId: resolved.identityAssetId, originalPhotoAssetId: resolved.provenance.photoAssetId, ageYears: 8 }, 12)).toBe(true);
  expect((await subjectUpgradeOf(db, f.gameId))?.identityRevision).toBeTruthy();
  const row = await db.auditLog.findUniqueOrThrow({ where: { id: "aud_identity_rejudge_" + resolved.identityAssetId } });
  for (const mutation of [{ originalFingerprint: "f".repeat(64) }, { originalReceiptSha256: "f".repeat(64) }, { originalUsageSha256: "f".repeat(64) },
    { originalProviderRequestId: "req_foreign" }, { originalCostMicroUsd: 1 }, { startSha256: "f".repeat(64) }, { attempt: 19 }, { gameId: "foreign-world" }]) {
    await db.auditLog.update({ where: { id: row.id }, data: { metaJson: JSON.stringify({ ...resolved, rejudge: { ...resolved.rejudge, ...mutation } }) } });
    await expect(identityGateReceiptOf(db, resolved.identityAssetId)).rejects.toThrow();
  }
  await db.auditLog.update({ where: { id: row.id }, data: { metaJson: row.metaJson } });
  expect(await identityGateReceiptOf(db, resolved.identityAssetId)).toEqual(resolved);
  for (const check of Object.keys(resolved.checks!)) {
    expect(identityReceiptReadyForPublication({ ...resolved, checks: { ...resolved.checks, [check]: "uncertain" } }, 12)).toBe(false);
    const incomplete = { ...resolved.checks } as Record<string, string>; delete incomplete[check];
    expect(identityReceiptReadyForPublication({ ...resolved, checks: incomplete }, 12)).toBe(false);
  }
  const savedBill = (await f.budget.readRequest(f.worldId, identityReviewRequestKey(original)))!;
  const readBill = f.budget.readRequest.bind(f.budget);
  const asset = await db.asset.findUniqueOrThrow({ where: { id: resolved.identityAssetId } });
  const sheet = await f.c.storage.get(asset.storagePath), beforeDispatch = vi.fn(async () => {});
  for (const state of ["pending", "unknown"] as const) {
    const fakeBudget = Object.create(f.budget) as typeof f.budget;
    fakeBudget.readRequest = async (world, key) => key === identityReviewRequestKey(original)
      ? { ...savedBill, state } as never : readBill(world, key);
    await expect(reviewBoardWizardIdentity({ db, budget: fakeBudget, apiKey: "synthetic", beforeDispatch, write: work => db.$transaction(work),
      reviewer: { review: async () => { throw Error("Must never dispatch"); } } },
    { gameId: f.gameId, identityAssetId: resolved.identityAssetId, provenance: original.provenance, sheet, photo: f.seeded.sheet, atlas: h.sheet!, contentVersion: 12,
      rejudge: resolved.rejudge })).rejects.toThrow();
  }
  expect(beforeDispatch).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledTimes(2);
});

it("does not approve a second unreadable question or ask a third question about those pixels", async () => {
  const f = await fixture(); await f.begin(); review();
  const malformed = (suffix: string) => Response.json({ model: "gpt-6.1-sol", service_tier: "default", usage: { prompt_tokens: 2000, completion_tokens: 400 },
    choices: [{ finish_reason: "stop", message: { content: "{broken" } }] }, { headers: { "x-request-id": "req_unreadable_" + suffix } });
  vi.mocked(fetch).mockResolvedValueOnce(malformed("original")).mockResolvedValueOnce(malformed("rejudge"));
  expect((await advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId })).state).toBe("retry");
  const { identityGateReceiptOf, identityReceiptReadyForPublication } = await import("../board-wizard-identity-gate");
  const candidate = await db.auditLog.findFirstOrThrow({ where: { entityId: f.gameId, action: "generation:identity-source-revision-candidate" } });
  const assetId = JSON.parse(candidate.metaJson!).identityAssetId, resolved = (await identityGateReceiptOf(db, assetId))!;
  expect(resolved.checks).toBeNull(); expect(identityReceiptReadyForPublication(resolved, 12)).toBe(false);
  expect(f.create).toHaveBeenCalledOnce(); expect(fetch).toHaveBeenCalledTimes(2); expect(await identityRevisionPending(db, f.gameId)).toBe(true);
  expect((await advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId })).state).toBe("committed");
  expect(f.create).toHaveBeenCalledTimes(2); expect(fetch).toHaveBeenCalledTimes(3);
  const requests = vi.mocked(fetch).mock.calls.map(call => JSON.parse(String(call[1]?.body)));
  expect(requests.filter(body => body.response_format.type === "json_schema")).toHaveLength(1);
});

it("retains a lost strict rejudge in full and only publishes its exact unselected-source continuation", async () => {
  const f = await fixture(); await f.begin(); review();
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ model: "gpt-6.1-sol", service_tier: "default", usage: { prompt_tokens: 2000, completion_tokens: 400 },
    choices: [{ finish_reason: "stop", message: { content: "{broken" } }] }, { headers: { "x-request-id": "req_before_lost_rejudge" } }))
    .mockRejectedValueOnce(Error("synthetic lost strict rejudge"));
  expect((await advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId })).state).toBe("retry");
  const before = await f.budget.audit(f.worldId), key = before.unknownRequestKeys.find(key => key.startsWith("wizard:identity-style-rejudge:"))!;
  const lost = await f.budget.readRequest(f.worldId, key); expect(lost).toMatchObject({ state: "unknown", reserveMicroUsd: 400_000 });
  expect((await advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId })).state).toBe("committed");
  expect(f.create).toHaveBeenCalledTimes(2); expect(fetch).toHaveBeenCalledTimes(3); expect(await f.budget.readRequest(f.worldId, key)).toEqual(lost);
  const { identityRevisionContinuationPublishable } = await import("../identity-source-revision-state");
  const grant = (await f.budget.readContinuationApproval(f.worldId, key))!;
  expect(await identityRevisionContinuationPublishable(db, f.budget, f.gameId, grant as never)).toBe(true);
  expect(await identityRevisionContinuationPublishable(db, f.budget, f.gameId, { ...grant, requestKey: "foreign-question" } as never)).toBe(false);
});

it("never extends a reference grant to a foreign unknown or changes that reservation", async () => {
  const f = await fixture(); await f.begin();
  await f.budget.reserve(f.worldId, { requestKey: "wizard:identity:99", scope: "identity", operationFingerprint: "foreign-operation", reserveMicroUsd: 500_000 });
  await f.budget.markUnknown(f.worldId, "wizard:identity:99", "synthetic unrelated unknown");
  const before = await f.budget.readRequest(f.worldId, "wizard:identity:99");
  await expect(advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId })).rejects.toThrow("accounting");
  expect(f.create).not.toHaveBeenCalled(); expect(await f.budget.readContinuationApproval(f.worldId, "wizard:identity:99")).toBeNull(); expect(await f.budget.readRequest(f.worldId, "wizard:identity:99")).toEqual(before);
});
it("retains a live dispatch rather than abandoning it, then continues its exact stale intent without a resend", async () => {
  const f = await fixture(); await f.begin(); review();
  const { identityRevisionStartOf, identityRevisionCandidateId, IDENTITY_SOURCE_REVISION } = await import("../identity-source-revision-state"), start = (await identityRevisionStartOf(db, f.gameId))!;
  const { boardConditioningHash: hash } = await import("../board-conditioned-source"), n = start.firstAttempt, requestKey = `wizard:identity:${n}`;
  const operationFingerprint = hash({ version: IDENTITY_SOURCE_REVISION, startSha256: hash(start), attempt: n, provenance: start.provenance });
  await f.budget.reserve(f.worldId, { requestKey, scope: "identity", operationFingerprint, reserveMicroUsd: 500_000 });
  await db.auditLog.create({ data: { id: `${identityRevisionCandidateId(f.gameId, n)}_dispatch`, actorType: "SYSTEM", action: "generation:identity-source-dispatch-intent", entityType: "Game", entityId: f.gameId,
    metaJson: JSON.stringify({ version: IDENTITY_SOURCE_REVISION, startSha256: hash(start), attempt: n, requestKey, operationFingerprint }) } });
  expect((await advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId })).state).toBe("deferred"); expect(f.create).not.toHaveBeenCalled();
  const now = Date.now(), clock = vi.spyOn(Date, "now").mockReturnValue(now + 361_000);
  try { expect((await advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId })).state).toBe("committed"); } finally { clock.mockRestore(); }
  expect(f.create).toHaveBeenCalledOnce(); expect(await f.budget.readRequest(f.worldId, requestKey)).toMatchObject({ state: "unknown", reserveMicroUsd: 500_000 });
});
it("refuses to start while an original provider answer is live, and polls an answer that becomes live during a revision", async () => {
  const f = await fixture(), bg = await import("../continuity-background");
  const waiting = vi.spyOn(bg, "backgroundReviewWaiting").mockResolvedValue(new Set(["synthetic-live-answer"]));
  try { await expect(f.begin()).rejects.toThrow("still in flight"); expect(await identityRevisionPending(db, f.gameId)).toBe(false); } finally { waiting.mockRestore(); }
  await f.begin(); review();
  const pending = vi.spyOn(bg, "backgroundReviewWaiting").mockResolvedValueOnce(new Set(["synthetic-live-answer"])).mockResolvedValue(new Set());
  const poll = vi.spyOn(bg, "advanceContinuityInBackground").mockResolvedValue(1);
  try { expect((await advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId })).state).toBe("committed"); expect(poll).toHaveBeenCalledOnce(); }
  finally { pending.mockRestore(); poll.mockRestore(); }
});


it("counts lazily absent appearance rows as unpainted work, not as a smaller game", async () => {
  const f = await fixture();
  await db.targetVariantAsset.deleteMany({ where: { targetInstance: { gameScene: { gameId: f.gameId } } } }); // Disposable synthetic DB only.
  const plan = await planIdentitySourceRevision(f.c, f.gameId);
  expect(plan.completion).toMatchObject({ requiredAppearances: 27, existingPictures: 0, newPicturesStillNeeded: 27,
    currentCanonicalReviewsStillNeeded: 27, completionWithinCapGuaranteed: false });
  expect(f.create).not.toHaveBeenCalled();
});
it("refuses a picture-inventory change after planning before writing any authorization", async () => {
  const f = await fixture();
  const scene = await db.gameScene.findFirstOrThrow({ where: { gameId: f.gameId } });
  const target = await db.targetInstance.create({ data: { id: `inventory-target-${f.gameId}`, gameSceneId: scene.id, targetId: "synthetic-inventory-target", targetType: "child", slotAId: "synthetic-a", slotBId: "synthetic-b" } });
  await db.targetVariantAsset.create({ data: { id: `inventory-variant-${f.gameId}`, targetInstanceId: target.id, variant: "A", slotId: "synthetic-a", attempts: 2 } });
  await expect(f.begin()).rejects.toThrow("read a new plan");
  expect(await identityRevisionPending(db, f.gameId)).toBe(false); expect(f.create).not.toHaveBeenCalled();
});


it("permits publication only for the exact consumed-reference continuation of a verified committed replacement", async () => {
  const f = await fixture(); await f.begin(); f.create.mockRejectedValueOnce(Error("synthetic lost reference"));
  expect((await advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId })).state).toBe("retry");
  const { identityRevisionContinuationPublishable } = await import("../identity-source-revision-state");
  const { localPatchBudgetReadyForPublication } = await import("../local-patch-interruption-recovery");
  review(); expect((await advanceIdentitySourceRevision(f.c, { gameId: f.gameId, operatorId: f.operatorId })).state).toBe("committed");
  const grant = (await f.budget.readContinuationApproval(f.worldId, "wizard:identity:2"))!;
  expect(await localPatchBudgetReadyForPublication(f.budget, f.worldId, 12)).toBe(false);
  expect(await identityRevisionContinuationPublishable(db, f.budget, f.gameId, grant as never)).toBe(true);
  expect(await localPatchBudgetReadyForPublication(f.budget, f.worldId, 12,
    { sourceReferenceContinuation: approval => identityRevisionContinuationPublishable(db, f.budget, f.gameId, approval) })).toBe(true);
  for (const changed of [{ approvalId: "foreign-grant" }, { requestKey: "wizard:identity:99" }, { operatorId: "foreign-operator" }, { reserveMicroUsd: 1 }, { operationFingerprint: "foreign-operation" }, { unknownReasons: ["foreign changed reason"] }, { authorizationSha256: "0".repeat(64) }, { authorizedAt: "2026-10-01T00:00:00.000Z" }, { worldId: "foreign:board-wizard" }])
    expect(await identityRevisionContinuationPublishable(db, f.budget, f.gameId, { ...grant, ...changed } as never)).toBe(false);
  const other = await fixture(); await other.begin();
  expect(await identityRevisionContinuationPublishable(db, f.budget, other.gameId, { ...grant, worldId: other.worldId } as never)).toBe(false);
  const { identityRevisionStartOf, identityRevisionCommitOf } = await import("../identity-source-revision-state");
  const start = (await identityRevisionStartOf(db, f.gameId))!, commit = (await identityRevisionCommitOf(db, f.gameId))!;
  const { boardConditioningHash: hash } = await import("../board-conditioned-source");
  expect(await identityRevisionContinuationPublishable(db, f.budget, f.gameId, { ...grant, approvalId: `source-reference:${hash(start)}:${start.firstAttempt + 3}:image` } as never)).toBe(false);
  expect(await identityRevisionContinuationPublishable(db, f.budget, f.gameId, { ...grant, approvalId: `source-reference:${hash(start)}:${start.firstAttempt + 1}:review`,
    requestKey: `wizard:identity-style:1:${commit.newIdentityAssetId}`, scope: "judge", reserveMicroUsd: 400_000 } as never)).toBe(false);
});


it("atomically rejects an inventory change inside the source-start transaction before retaining authorization", async () => {
  const f = await fixture(), lifecycle = await import("../local-patch-lifecycle"), original = lifecycle.fenceLocalPatchImages;
  let injected = false;
  const spy = vi.spyOn(lifecycle, "fenceLocalPatchImages").mockImplementation(async (tx, gameId) => {
    await original(tx, gameId);
    if (!injected && gameId === f.gameId) {
      injected = true; const scene = await tx.gameScene.findFirstOrThrow({ where: { gameId } });
      const target = await tx.targetInstance.create({ data: { id: `txn-inventory-target-${gameId}`, gameSceneId: scene.id, targetId: "synthetic-transaction-target", targetType: "child", slotAId: "synthetic-a", slotBId: "synthetic-b" } });
      await tx.targetVariantAsset.create({ data: { id: `txn-inventory-variant-${gameId}`, targetInstanceId: target.id, variant: "A", slotId: "synthetic-a", attempts: 1 } });
    }
  });
  try { await expect(f.begin()).rejects.toThrow("retained picture inventory changed before source authorization"); }
  finally { spy.mockRestore(); }
  expect(injected).toBe(true); expect(await identityRevisionPending(db, f.gameId)).toBe(false); expect(f.create).not.toHaveBeenCalled();
  expect(await db.targetVariantAsset.findUnique({ where: { id: `txn-inventory-variant-${f.gameId}` } })).toBeNull(); // Same transaction rolled back.
});


describe("explicit six-dollar completion authority for one existing source revision", () => {
  it("retains every historical byte, unknown reserve and original hold, and does not authorize another world", async () => {
    const f = await fixture(); await f.begin();
    const requestKey = "synthetic-authorized-unknown", operationFingerprint = "7".repeat(64);
    await f.budget.reserve(f.worldId, { requestKey, scope: "judge", operationFingerprint, reserveMicroUsd: 40_000 });
    await f.budget.markUnknown(f.worldId, requestKey, "Synthetic response lost");
    const unknown = (await f.budget.readRequest(f.worldId, requestKey))!;
    await boardWizardBudgetOf(f.c, 1, { authorizeUnknownContinuation: async value => value.requestKey === requestKey && value.operatorId === f.operatorId }).authorizeUnknownContinuation(f.worldId, { approvalId: "synthetic-owner-continuation", requestKey, scope: "judge", operationFingerprint,
      reserveMicroUsd: unknown.reserveMicroUsd, unknownReasons: unknown.unknownReasons, operatorId: f.operatorId, authorizationSha256: "8".repeat(64), authorizedAt: new Date().toISOString() });
    const snapshot = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } });
    const job = await db.generationJob.findUniqueOrThrow({ where: { id: `job_${f.gameId}` } });
    const pin = await db.auditLog.findUniqueOrThrow({ where: { id: leanReleaseAuditId(f.gameId) } });
    const plan = await planLeanCompletionBudget(f.c, f.gameId);
    expect(plan.binding.retainedUnknowns).toEqual([{ requestKey, operationFingerprint, reserveMicroUsd: 40_000 }]);
    const input = { gameId: f.gameId, operatorId: f.operatorId, expectedPlanSha256: plan.planSha256 };
    const grant = await authorizeLeanCompletionBudget(f.c, input);
    expect(grant.capMicroUsd).toBe(6_000_000); expect(await authorizeLeanCompletionBudget(f.c, input)).toEqual(grant);
    expect(await readLeanCompletionBudget(f.c, f.worldId)).toEqual(grant);
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } })).toMatchObject({ snapshotJson: snapshot.snapshotJson, revision: snapshot.revision + 1 });
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: job.id } })).toEqual(job);
    expect(await db.auditLog.findUniqueOrThrow({ where: { id: pin.id } })).toEqual(pin);
    expect(await f.budget.readRequest(f.worldId, requestKey)).toEqual(unknown);
    expect((await f.budget.audit(f.worldId)).capMicroUsd).toBe(6_000_000);
    expect((await f.budget.audit(f.worldId)).reservedMicroUsd).toBe(40_000);
    expect(await db.auditLog.count({ where: { id: leanCompletionBudgetAuditId(f.gameId) } })).toBe(1);
    await expect(f.budget.reserve(f.worldId, { requestKey: "too-large", scope: "image", operationFingerprint: "9".repeat(64), reserveMicroUsd: 6_000_001 })).rejects.toMatchObject({ code: "cap_exceeded" });
    const other = await fixture(); expect((await other.budget.audit(other.worldId)).capMicroUsd).toBe(4_000_000);
    expect(await readLeanCompletionBudget(other.c, other.worldId)).toBeNull(); expect(f.create).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["no-source", "non-admin", "forged-plan", "pending", "unapproved-unknown", "refund", "changed-hold", "changed-age", "changed-crop", "changed-photo", "changed-scenes", "concurrent-ledger"])("refuses %s without creating a grant or erasing evidence", async mode => {
    const f = await fixture();
    if (mode === "no-source") { await expect(planLeanCompletionBudget(f.c, f.gameId)).rejects.toThrow(); return; }
    await f.begin(); const plan = await planLeanCompletionBudget(f.c, f.gameId);
    if (mode === "non-admin") f.c.adminEmails = [];
    if (mode === "pending" || mode === "unapproved-unknown" || mode === "concurrent-ledger") {
      await f.budget.reserve(f.worldId, { requestKey: "synthetic-changed", scope: "judge", operationFingerprint: "b".repeat(64), reserveMicroUsd: 40_000 });
      if (mode === "unapproved-unknown") await f.budget.markUnknown(f.worldId, "synthetic-changed", "Synthetic lost answer");
      if (mode === "concurrent-ledger") await f.budget.settle(f.worldId, "synthetic-changed", { providerNamespace: "synthetic", providerRequestId: "req_changed_ledger",
        usageId: "c".repeat(64), rawUsage: { synthetic: true }, model: "synthetic", amountMicroUsd: 10_000, costBasis: "conservative-upper-estimate" });
    }
    if (mode === "refund") await db.order.update({ where: { id: `order-${f.gameId}` }, data: { refundedAt: new Date() } });
    if (mode === "changed-hold") await db.generationJob.update({ where: { id: `job_${f.gameId}` }, data: { attempts: 25 } });
    if (mode === "changed-age") await db.childProfile.update({ where: { id: `chl-${f.gameId}` }, data: { ageYears: 9 } });
    if (mode === "changed-crop") await db.childProfile.update({ where: { id: `chl-${f.gameId}` }, data: { photoCropJson: JSON.stringify({ x: 0, y: 0, w: 0.5, h: 0.5 }) } });
    if (mode === "changed-photo") await db.childProfile.update({ where: { id: `chl-${f.gameId}` }, data: { originalPhotoAssetId: null } });
    if (mode === "changed-scenes") await db.gameScene.updateMany({ where: { gameId: f.gameId }, data: { sceneVersion: 11 } });
    const snapshot = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } });
    await expect(authorizeLeanCompletionBudget(f.c, { gameId: f.gameId, operatorId: f.operatorId, expectedPlanSha256: mode === "forged-plan" ? "f".repeat(64) : plan.planSha256 })).rejects.toThrow();
    expect(await db.auditLog.findUnique({ where: { id: leanCompletionBudgetAuditId(f.gameId) } })).toBeNull();
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } })).toEqual(snapshot);
    expect(f.create).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["refund", "deleted-child"])("retains a genuine late bill after %s under the former completion grant", async lifecycle => {
    const f = await fixture(); await f.begin(); const plan = await planLeanCompletionBudget(f.c, f.gameId);
    await authorizeLeanCompletionBudget(f.c, { gameId: f.gameId, operatorId: f.operatorId, expectedPlanSha256: plan.planSha256 });
    await f.budget.reserve(f.worldId, { requestKey: "synthetic-late-paid", scope: "image", operationFingerprint: "d".repeat(64), reserveMicroUsd: 4_100_000 });
    if (lifecycle === "refund") await db.order.update({ where: { id: `order-${f.gameId}` }, data: { refundedAt: new Date() } });
    else await db.childProfile.update({ where: { id: `chl-${f.gameId}` }, data: { deletedAt: new Date() } });
    expect(await readLeanCompletionBudget(f.c, f.worldId)).toBeNull();
    await f.budget.settle(f.worldId, "synthetic-late-paid", { providerNamespace: "synthetic", providerRequestId: "req_late_paid_response",
      usageId: "e".repeat(64), rawUsage: { synthetic: true }, model: "synthetic", amountMicroUsd: 4_050_000, costBasis: "conservative-upper-estimate" });
    expect(await f.budget.readRequest(f.worldId, "synthetic-late-paid")).toMatchObject({ state: "settled", evidence: { amountMicroUsd: 4_050_000 } });
    expect(await f.budget.audit(f.worldId)).toMatchObject({ capMicroUsd: 4_000_000, held: true });
    await expect(f.budget.reserve(f.worldId, { requestKey: "no-new-spend", scope: "judge", operationFingerprint: "f".repeat(64), reserveMicroUsd: 40_000 })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["actor", "source", "cap", "world"])("refuses a forged %s completion receipt, even with a recomputed body digest", async mode => {
    const f = await fixture(); await f.begin(); const plan = await planLeanCompletionBudget(f.c, f.gameId);
    await authorizeLeanCompletionBudget(f.c, { gameId: f.gameId, operatorId: f.operatorId, expectedPlanSha256: plan.planSha256 });
    const row = await db.auditLog.findUniqueOrThrow({ where: { id: leanCompletionBudgetAuditId(f.gameId) } });
    const { authorizationSha256: _old, ...body } = JSON.parse(row.metaJson!);
    if (mode === "source") body.sourceStartSha256 = "e".repeat(64);
    if (mode === "cap") body.capMicroUsd = 12_000_000;
    if (mode === "world") body.worldId = "foreign-synthetic:board-wizard";
    await db.auditLog.update({ where: { id: row.id }, data: { ...(mode === "actor" ? { actorType: "USER" } : {}), metaJson: JSON.stringify({ ...body, authorizationSha256: boardConditioningHash(body) }) } });
    await expect(f.budget.audit(f.worldId)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
