import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { PrismaBoardConditionedCheckpointStore } from "../../../infra/db/board-conditioned-checkpoints";
import { PrismaWorldBudgetStore } from "../../../infra/db/prisma-world-budget-store";
import { CasWorldBudgetRepository } from "../../../infra/db/world-budget-repository";
import { prepareBoardPoseObservation } from "../../../infra/generation/board-pose-observer";
import { FIXED_SOURCE_SETTINGS, type FixedSourceResult } from "../../../infra/generation/openai-fixed-source";
import { boardConditioningHash } from "../board-conditioned-source";
import { sha256Bytes } from "../fixed-sprite";
import { auditWorldBudget } from "../world-budget";
import type { Container } from "../../container";
const fakes = vi.hoisted(() => ({ appEnv: "qa", gate: vi.fn(async () => undefined) }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: fakes.appEnv }), spendGuard: () => ({}) }));
vi.mock("../board-wizard-identity-gate", () => ({ requireBoardWizardIdentityApproval: fakes.gate }));
import { BOARD_WIZARD_STYLE, BOARD_WIZARD_SOURCE_POLICY, BOARD_WIZARD_OBSERVER_POLICY, readBoardWizard } from "../board-conditioned-wizard";
import { boardWizardBudget } from "../board-wizard-budget";
import { authorizeBoardWizardTransportRecovery, boardWizardRecoveryForm, BOARD_WIZARD_RECOVERY_AUTHORITY } from "../board-wizard-recovery";
let scratch: string, db: PrismaClient, png: Buffer, serial = 0;
const hash = (text: string) => sha256Bytes(Buffer.from(text));
const catalog = JSON.parse(readFileSync(path.resolve("content/board-conditioned-qa/catalog.json"), "utf8"));
beforeAll(async () => {
  scratch = mkdtempSync(path.join(realpathSync(tmpdir()), "findme-recovery-"));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}` } } });
  await applyTestSchema(db);
  png = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: "transparent" } })
    .composite([{ input: Buffer.from('<svg width="1024" height="1024"><rect x="20" y="20" width="80" height="180" fill="red"/></svg>') }]).png().toBuffer();
});
beforeEach(() => { process.env.QA_BOARD_CONDITIONED_WIZARD = "true"; fakes.appEnv = "qa"; fakes.gate.mockReset().mockResolvedValue(undefined); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No network permitted"); })); });
afterAll(async () => { vi.unstubAllGlobals(); delete process.env.QA_BOARD_CONDITIONED_WIZARD; await db.$disconnect();
  const resolved = realpathSync(scratch); if (path.dirname(resolved) === realpathSync(tmpdir()) && path.basename(resolved).startsWith("findme-recovery-")) rmSync(resolved, { recursive: true, force: true }); });
async function fixture(sourceAttempt: 1 | 2 = 1, awaitingMeasurement = false) {
  const gameId = `recovery-${++serial}`, ownerId = `${gameId}-owner`, childId = `${gameId}-child`, identityId = `${gameId}-identity`, adminId = `${gameId}-admin`;
  await db.user.createMany({ data: [{ id: ownerId, email: `${ownerId}@example.invalid` }, { id: adminId, email: `${adminId}@example.invalid` }] });
  await db.childProfile.create({ data: { id: childId, ownerId, displayName: "Synthetic", ageYears: 6, identityAssetId: identityId, avatarAssetId: `${gameId}-avatar` } });
  await db.game.create({ data: { id: gameId, ownerId, childProfileId: childId, status: "MANUAL_REVIEW", styleVersion: BOARD_WIZARD_STYLE, paidAt: new Date(), packageTier: "ONE_WORLD", sceneCount: 9 } });
  await db.order.create({ data: { id: `${gameId}-order`, userId: ownerId, gameId, paymentStatus: "PAID", paidAt: new Date(), amountAgorot: 5900, provider: "synthetic", packageTier: "ONE_WORLD" } });
  const record = { version: "board-conditioned-wizard/v1", gameId, ownerId, childProfileId: childId, childName: "Synthetic", ageYears: 6,
    identityAssetId: identityId, avatarAssetId: `${gameId}-avatar`, identitySha256: hash("identity"), identitySourceSha256: hash("sheet"), identityNormalization: "illustrated-sheet-portrait-gray512/v1",
    catalog, catalogSha256: boardConditioningHash(catalog), capMicroUsd: 4_000_000, sourcePolicySha256: boardConditioningHash(BOARD_WIZARD_SOURCE_POLICY), observerPolicySha256: boardConditioningHash(BOARD_WIZARD_OBSERVER_POLICY),
    boards: catalog.boards.map((b: { boardId: string }, index: number) => ({ boardId: b.boardId, state: "pending", attempts: awaitingMeasurement && index === 0 ? sourceAttempt : sourceAttempt - 1,
      ...(awaitingMeasurement && index === 0 ? { awaitingMeasurement: true } : {}), reason: null, assetIds: [], visual: [] })), state: "held", automaticRelease: false };
  const stepsJson = JSON.stringify({ boardWizard: record });
  await db.generationJob.create({ data: { id: `job_${gameId}`, gameId, status: "DONE", stepsJson } });
  const c = { db, storage: new DbStorage(db), adminEmails: [`${adminId}@example.invalid`] } as unknown as Container;
  const worldId = `${gameId}:board-wizard`, boardId = catalog.boards[0].boardId;
  const captured = { settings: { ...FIXED_SOURCE_SETTINGS }, sourceGroupKey: "synthetic-retained-source",
    policy: { timeoutMs: 1000, reserveMicroUsd: 200_000, providerNamespace: "synthetic:test", rateCard: { id: "fixture", textInput: 5, imageInput: 8, imageOutput: 32 } },
    promptSha256: hash("prompt"), inputOrder: ["style", "identity"] as ["style", "identity"], styleSha256: hash("style"), identitySha256: hash("identity") };
  const source: Extract<FixedSourceResult, { kind: "generated" }> = { kind: "generated", png, pngSha256: sha256Bytes(png), fingerprint: hash(JSON.stringify(captured)), capture: captured,
    evidence: { providerNamespace: "synthetic:test", providerRequestId: `${gameId}-source`, usageId: `${gameId}-source`, model: "gpt-image-2", amountMicroUsd: 50_000, rawUsage: { input_tokens: 10, output_tokens: 100 }, costBasis: "conservative-upper-estimate" },
    modelProvenance: "response-confirmed", audit: auditWorldBudget({ worldId, requests: [] }), semanticApproval: "pending" };
  await new PrismaBoardConditionedCheckpointStore(db).putSource(worldId, sourceAttempt === 1 ? boardId : `${boardId}--attempt-2`, source);
  const observation = await prepareBoardPoseObservation({ sheetPng: png, slots: catalog.boards[0].slots.map((s: { slot: { id: string; pose: string } }) => ({ slotId: s.slot.id, pose: s.slot.pose })) }, BOARD_WIZARD_OBSERVER_POLICY);
  const budget = boardWizardBudget(new CasWorldBudgetRepository(new PrismaWorldBudgetStore(db)), sourceAttempt);
  await budget.reserve(worldId, { requestKey: `board:${boardId}:source:1`, scope: "image", operationFingerprint: source.fingerprint, reserveMicroUsd: 200_000 });
  await budget.settle(worldId, `board:${boardId}:source:1`, source.evidence);
  await budget.reserve(worldId, { requestKey: `board:${boardId}:measure:1`, scope: "judge", operationFingerprint: observation.fingerprint, reserveMicroUsd: 400_000 });
  await budget.markUnknown(worldId, `board:${boardId}:measure:1`, "board-observation-transport-or-response-unresolved");
  const form = await boardWizardRecoveryForm(c, gameId); expect(form).not.toBeNull();
  const input = { gameId, expectedStepsSha256: form!.expectedStepsSha256, expectedLedgerSha256: form!.expectedLedgerSha256, confirm: BOARD_WIZARD_RECOVERY_AUTHORITY };
  return { c, gameId, boardId, worldId, budget, input, actor: { type: "ADMIN" as const, id: adminId }, ownerId };
}
describe("one explicit held-world transport recovery in disposable SQLite", () => {
  it.each([1, 2] as const)("atomically continues source attempt %s, preserving all unknown request bytes", async attempt => {
    const f = await fixture(attempt), store = new PrismaWorldBudgetStore(db), before = (await store.read(f.worldId))!;
    const result = await authorizeBoardWizardTransportRecovery(f.c, f.actor, f.input);
    const after = (await store.read(f.worldId))!;
    expect(after.snapshot.requests).toEqual(before.snapshot.requests);
    expect(after.snapshot.unknownContinuationApprovals).toHaveLength(1);
    expect(auditWorldBudget(after.snapshot)).toMatchObject({ held: false, committedMicroUsd: 450_000, reservedMicroUsd: 400_000 });
    const job = await db.generationJob.findUniqueOrThrow({ where: { id: `job_${f.gameId}` } });
    expect(readBoardWizard(job.stepsJson)).toMatchObject({ state: "running", automaticRelease: false, boards: expect.arrayContaining([expect.objectContaining({ boardId: f.boardId, attempts: attempt,
      remeasurements: [{ sourceAttempt: attempt, state: "pending", kind: "transport-recovery", approvalId: result.approvalId }] })]) });
    expect(await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).toMatchObject({ status: "TARGETS_GENERATING", configJson: null });
    expect(await db.auditLog.count({ where: { entityId: f.gameId, action: "board-wizard:transport-recovery-authorized" } })).toBe(1);
    await expect(authorizeBoardWizardTransportRecovery(f.c, f.actor, f.input)).rejects.toMatchObject({ code: "ineligible" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it.each(["owner", "stale", "refunded", "pre-gate", "production"])("refuses %s without changing ledger or resuming", async scenario => {
    const f = await fixture(), before = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } });
    if (scenario === "stale") f.input.expectedStepsSha256 = "f".repeat(64);
    if (scenario === "refunded") await db.order.update({ where: { id: `${f.gameId}-order` }, data: { paymentStatus: "REFUNDED", refundedAt: new Date() } });
    if (scenario === "pre-gate") fakes.gate.mockRejectedValue(new Error("Missing immutable identity approval"));
    if (scenario === "production") fakes.appEnv = "production";
    await expect(authorizeBoardWizardTransportRecovery(f.c, scenario === "owner" ? { type: "USER", id: f.ownerId } : f.actor, f.input)).rejects.toThrow();
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } })).toEqual(before);
    expect(await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).toMatchObject({ status: "MANUAL_REVIEW" });
    expect(await db.auditLog.count({ where: { entityId: f.gameId, action: "board-wizard:transport-recovery-authorized" } })).toBe(0);
  });
  it("clears the original awaiting-measurement phase before scheduling the authorized second observation", async () => {
    const f = await fixture(1, true);
    await authorizeBoardWizardTransportRecovery(f.c, f.actor, f.input);
    const board = readBoardWizard((await db.generationJob.findUniqueOrThrow({ where: { id: `job_${f.gameId}` } })).stepsJson).boards.find(b => b.boardId === f.boardId)!;
    expect(board).toMatchObject({ attempts: 1, awaitingMeasurement: false, remeasurements: [expect.objectContaining({ sourceAttempt: 1, state: "pending", kind: "transport-recovery" })] });
  });
  it("rolls back ledger approval when durable authority publication fails", async () => {
    const f = await fixture(), before = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } });
    await db.$executeRawUnsafe("CREATE TRIGGER fail_recovery_authority BEFORE INSERT ON AuditLog WHEN NEW.action='board-wizard:transport-recovery-authorized' BEGIN SELECT RAISE(ABORT, 'synthetic authority failure'); END");
    try { await expect(authorizeBoardWizardTransportRecovery(f.c, f.actor, f.input)).rejects.toThrow(); }
    finally { await db.$executeRawUnsafe("DROP TRIGGER fail_recovery_authority"); }
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } })).toEqual(before);
    expect(readBoardWizard((await db.generationJob.findUniqueOrThrow({ where: { id: `job_${f.gameId}` } })).stepsJson).state).toBe("held");
    expect(await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).toMatchObject({ status: "MANUAL_REVIEW" });
  });
});
