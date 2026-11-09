import { beforeEach, describe, expect, it, vi } from "vitest";
import { CasWorldBudgetRepository, type AtomicWorldBudgetStore } from "../../../infra/db/world-budget-repository";
import type { WorldBudgetSnapshot } from "../world-budget";

/** Focused mocks: the live source binding, placement and stores are replaced by an
 * in-memory world; the plan, receipt, budget and exclusivity logic run for real. */
const m = vi.hoisted(() => ({ appEnv: "qa", waiting: new Set<string>(), retained: new Set<string>(), fence: vi.fn(),
  state: null as null | (() => Promise<unknown>), boards: [] as unknown[] }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: m.appEnv }) }));
vi.mock("../qa-completion-capacity", () => ({ qaCompletionSourceState: () => m.state!() }));
vi.mock("../continuity-background", () => ({ backgroundReviewWaiting: async () => m.waiting }));
vi.mock("../local-patch-lifecycle", () => ({ fenceLocalPatchImages: m.fence }));
vi.mock("../source-placement-release", () => ({ resolveLocalPatchBoardsForGame: async () => ({ boards: m.boards }) }));
vi.mock("../../../infra/storage/db", () => ({ DbStorage: class { readonly id = "db"; } }));
vi.mock("../../../infra/db/prisma-retained-purchase-store", () => ({ PrismaRetainedPurchaseStore: class {
  async get(_world: string, key: string) { return m.retained.has(key) ? { key } : null; } } }));
vi.mock("../../../infra/db/prisma-world-budget-store", () => ({ WORLD_BUDGET_LEDGER_MAX_REVISION: 2_147_483_647,
  PrismaWorldBudgetStore: { forReadOnlyTransaction: (db: { __ledger: () => unknown }) => ({ read: async () => structuredClone(db.__ledger()) }) } }));

import { authorizeQaSunburstTailCompletion, planQaSunburstTailCompletion, previewQaSunburstTailCompletion, qaSunburstTailCompletionActive,
  qaSunburstTailCompletionStatus, readQaSunburstTailCompletionBudget } from "../qa-sunburst-tail-completion";
import { originalOrFiveDollarCap, qaFiveCompletionActive, qaFiveCompletionStatus, readQaFiveCompletionBudget } from "../qa-five-dollar-completion";
import { qaSunburstTailCompletionId } from "../../../domain/generation/qa-sunburst-tail-completion";
import { qaFiveCompletionId } from "../../../domain/generation/qa-five-dollar-completion";
import { journeySunburstTailPinId } from "../../../domain/generation/journey-sunburst-tail";
import { boardWizardBudget } from "../board-wizard-budget";

const GAME = "synthetic-tail-game", WORLD = GAME + ":board-wizard", OWNER = "owner-admin";
const sha = (c: string) => c.repeat(64);
const NAMED = [["amazon", "amazon-detectives-hide-3", "crouching"], ["greatwall", "greatwall-detectives-hide-1", "standing"],
  ["paris", "paris-detectives-hide-1", "walking"]] as const;
const evidence = (id: string, amountMicroUsd: number) => ({ providerNamespace: "fixture", providerRequestId: id, usageId: id, rawUsage: { tokens: 1 },
  model: "gpt-image-2", amountMicroUsd, costBasis: "conservative-upper-estimate" as const });

type Row = { id: string; provider: string; status: string; attempts: number; assetId: string | null; judgeJson: string | null;
  targetInstance: { targetId: string; gameScene: { sceneSlug: string } } };
const acceptable = (hide: string) => JSON.stringify({ hide, reviewState: "board-review-complete", qualityDisposition: { state: "acceptable" },
  judgedSha256: sha("1"), boardReview: { dual: { subject: { ok: true }, imageSha256: sha("1") } } });
const concludedFailure = (hide: string) => JSON.stringify({ hide, reviewState: "board-review-complete", qualityDisposition: { state: "refused" } });

let world: ReturnType<typeof makeWorld>;
function makeWorld() {
  let ledger: { revision: number; snapshot: WorldBudgetSnapshot } | null = null;
  const store: AtomicWorldBudgetStore = {
    read: async () => structuredClone(ledger),
    insertIfAbsent: async (_id, snapshot) => { if (ledger) return false; ledger = { revision: 0, snapshot: structuredClone(snapshot) }; return true; },
    compareAndSwap: async (_id, revision, snapshot) => { if (!ledger || ledger.revision !== revision) return false; ledger = { revision: revision + 1, snapshot: structuredClone(snapshot) }; return true; },
  };
  const budget = boardWizardBudget(new CasWorldBudgetRepository(store), 1, { authorizeUnknownContinuation: async () => true });
  const rows: Row[] = [];
  for (let i = 0; i < 24; i++) rows.push({ id: `row-${String(i).padStart(2, "0")}`, provider: "local-patch", status: "GENERATED", attempts: 1,
    assetId: "asset-" + i, judgeJson: acceptable("other-hide-" + i), targetInstance: { targetId: "t-other-" + i, gameScene: { sceneSlug: "board-" + (i % 6) } } });
  for (const [board, hide] of NAMED) rows.push({ id: "row-" + hide, provider: "local-patch", status: "FAILED", attempts: 1, assetId: "asset-" + hide,
    judgeJson: concludedFailure(hide), targetInstance: { targetId: "t-" + hide, gameScene: { sceneSlug: board } } });
  m.boards = NAMED.map(([board, hide, pose]) => ({ board, hides: [{ id: hide, targetId: "t-" + hide, pose }] }));
  const audits = new Map<string, { id: string; actorType: string; actorId: string; action: string; entityType: string; entityId: string; metaJson: string }>();
  const job = { id: "job_" + GAME, gameId: GAME, status: "FAILED", attempts: 3, updatedAt: new Date("2026-11-09T18:00:00Z"), currentStep: "local-patch", lastError: "stopped" };
  const state = { gameId: GAME, worldId: WORLD, ownerId: OWNER, childId: "child", sceneVersion: 13, scenesSha256: sha("1"), familySha256: sha("2"),
    paymentSha256: sha("3"), reviewAuthoritySha256: sha("4"), enrollmentSha256: sha("5"), identityReviewSha256: sha("6"), identityAssetId: "identity",
    identitySha256: sha("7"), avatarAssetId: "avatar", photoAssetId: "photo", photoSha256: sha("8"), ageYears: 7, cropSha256: sha("9") };
  const game = { status: "TARGETS_GENERATING", paidAt: new Date("2026-11-08T00:00:00Z"), readyAt: null as Date | null, configJson: null as string | null };
  m.state = async () => ({ game: structuredClone(game), child: { originalPhotoAssetId: "photo" }, state: structuredClone(state) });
  const transactions: unknown[] = [];
  const db = {
    __ledger: () => ledger,
    auditLog: {
      findUnique: async ({ where: { id } }: { where: { id: string } }) => structuredClone(audits.get(id) ?? null),
      count: async ({ where: { id: { in: ids } } }: { where: { id: { in: string[] } } }) => ids.filter(id => audits.has(id)).length,
      create: async ({ data }: { data: { id: string; actorType: string; actorId: string; action: string; entityType: string; entityId: string; metaJson: string } }) => {
        if (audits.has(data.id)) throw Error("Unique constraint"); audits.set(data.id, structuredClone(data)); return data; },
    },
    generationJob: {
      findUniqueOrThrow: async () => structuredClone(job),
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<typeof job> }) => {
        const same = where.id === job.id && where.status === job.status && where.attempts === job.attempts && (where.updatedAt as Date).getTime() === job.updatedAt.getTime()
          && where.currentStep === job.currentStep && where.lastError === job.lastError;
        if (same) Object.assign(job, data, { updatedAt: new Date(job.updatedAt.getTime() + 1) });
        return { count: same ? 1 : 0 };
      },
    },
    targetVariantAsset: { findMany: async () => structuredClone(rows) },
    worldBudgetLedger: { updateMany: async ({ where: { revision } }: { where: { revision: number } }) => {
      if (!ledger || ledger.revision !== revision) return { count: 0 }; ledger.revision++; return { count: 1 }; } },
    user: { findUnique: async ({ where: { id } }: { where: { id: string } }) => ({ id, email: id === OWNER ? "owner@example.invalid" : "other@example.invalid" }) },
    $transaction: async (work: (tx: unknown) => Promise<unknown>, options: unknown) => { transactions.push(options); return work(db); },
  };
  const c = { db, storage: { id: "db" }, adminEmails: ["Owner@Example.invalid"] } as never;
  return { c, db, budget, rows, audits, job, state, game, transactions, ledger: () => ledger! };
}

/** The measured new game: 3327349 settled and an UNKNOWN 411231 held whole under an existing continuation. */
async function measuredLedger(settled = 3_327_349) {
  await world.budget.importSettled(WORLD, { scope: "image", operationFingerprint: "old", evidence: evidence("old-paid", settled) });
  await world.budget.reserve(WORLD, { requestKey: "lost-review", scope: "judge", operationFingerprint: sha("f"), reserveMicroUsd: 411_231 });
  await world.budget.markUnknown(WORLD, "lost-review", "synthetic lost answer");
  const unknown = (await world.budget.readRequest(WORLD, "lost-review"))!;
  await world.budget.authorizeUnknownContinuation(WORLD, { approvalId: "synthetic-existing-continuation", requestKey: "lost-review", scope: unknown.scope,
    operationFingerprint: unknown.operationFingerprint, reserveMicroUsd: unknown.reserveMicroUsd, unknownReasons: unknown.unknownReasons,
    operatorId: OWNER, authorizationSha256: sha("d"), authorizedAt: "2026-11-09T00:00:00.000Z" });
}
const authorize = async (over: Partial<{ operatorId: string; ownerAuthorizationSha256: string; expectedPlanSha256: string }> = {}) => {
  const { planSha256 } = await planQaSunburstTailCompletion(world.c, GAME);
  return authorizeQaSunburstTailCompletion(world.c, { gameId: GAME, operatorId: OWNER, expectedPlanSha256: planSha256, ownerAuthorizationSha256: sha("e"), ...over });
};

beforeEach(async () => {
  m.appEnv = "qa"; m.waiting = new Set(); m.retained = new Set(); m.fence.mockReset();
  world = makeWorld(); await measuredLedger();
});

describe("explicit-existing-qa-sunburst-tail-completion/v1 service", () => {
  it("freezes the three named failures at the measured cost, keeping UNKNOWN reserves whole", async () => {
    const { plan } = await planQaSunburstTailCompletion(world.c, GAME);
    expect(plan.operations.map(op => op.requestKey)).toEqual(["amazon-detectives-hide-3:crouching:render:2",
      "greatwall-detectives-hide-1:standing:render:2", "paris-detectives-hide-1:walking:render:2"]);
    expect(plan).toMatchObject({ committedMicroUsd: 3_738_580, reservedMicroUsd: 411_231, remainingUnderBaseMicroUsd: 261_420, requiredMicroUsd: 1_200_000,
      unknowns: [{ requestKey: "lost-review", reserveMicroUsd: 411_231 }] });
    const preview = await previewQaSunburstTailCompletion(world.c, GAME);
    expect(preview.operations).toHaveLength(3); expect(JSON.stringify(preview)).not.toMatch(/photo|identity|child/);
  });
  it("lists only failed named appearances; an acceptable one is simply not listed", async () => {
    const amazon = world.rows.find(r => r.id === "row-amazon-detectives-hide-3")!;
    Object.assign(amazon, { status: "GENERATED", judgeJson: acceptable("amazon-detectives-hide-3") });
    const { plan } = await planQaSunburstTailCompletion(world.c, GAME);
    expect(plan.operations.map(op => op.hideId)).toEqual(["greatwall-detectives-hide-1", "paris-detectives-hide-1"]);
    expect(plan.requiredMicroUsd).toBe(800_000);
  });
  it("records one fenced, serializable receipt that changes no bill, row or attempt and wakes the job", async () => {
    const rowsBefore = structuredClone(world.rows), snapshotBefore = structuredClone(world.ledger().snapshot), revision = world.ledger().revision;
    const receipt = await authorize();
    expect(world.ledger().snapshot).toEqual(snapshotBefore); expect(world.ledger().revision).toBe(revision + 1);
    expect(world.rows).toEqual(rowsBefore); expect(world.job).toMatchObject({ status: "QUEUED", attempts: 3, currentStep: "local-patch", lastError: null });
    expect(m.fence).toHaveBeenCalledOnce(); expect(world.transactions).toEqual([expect.objectContaining({ isolationLevel: "Serializable" })]);
    expect(receipt).toMatchObject({ automaticExtension: false, exclusiveOfOtherGrants: true, requestsPreserved: true, attemptsPreserved: true });
    expect(world.audits.get(qaSunburstTailCompletionId(GAME))).toMatchObject({ actorType: "ADMIN", actorId: OWNER, entityId: GAME });
  });
  it("grants five dollars only to the named images, through the resolver's five-dollar entry too", async () => {
    const receipt = await authorize();
    const grant = await readQaSunburstTailCompletionBudget(world.c, WORLD);
    expect(grant).toEqual({ worldId: WORLD, capMicroUsd: 5_000_000, authorizationSha256: receipt.authorizationSha256,
      imageAboveBaseSet: { baseCapMicroUsd: 4_000_000, requests: receipt.plan.operations.map(op => ({ requestKey: op.requestKey, reserveMicroUsd: 150_000 })) } });
    expect(await readQaFiveCompletionBudget(world.c, WORLD)).toEqual(grant);
    expect(await originalOrFiveDollarCap(world.c, GAME, 5_000_000)).toBe(true);
    expect(await originalOrFiveDollarCap(world.c, GAME, 6_000_000)).toBe(false);
    expect(await qaSunburstTailCompletionActive(world.c, GAME)).toEqual(receipt);
    // v1's own API keeps its v1 meaning.
    expect(await qaFiveCompletionActive(world.c, GAME)).toBeNull(); expect(await qaFiveCompletionStatus(world.c, GAME)).toBeNull();
    expect(await qaSunburstTailCompletionStatus(world.c, GAME)).toMatchObject({ status: "active", requiredMicroUsd: 1_200_000 });
  });
  it("is idempotent for the same decision and refuses a different one", async () => {
    const first = await authorize();
    expect(await authorizeQaSunburstTailCompletion(world.c, { gameId: GAME, operatorId: OWNER, expectedPlanSha256: first.planSha256, ownerAuthorizationSha256: sha("e") })).toEqual(first);
    await expect(authorizeQaSunburstTailCompletion(world.c, { gameId: GAME, operatorId: OWNER, expectedPlanSha256: first.planSha256, ownerAuthorizationSha256: sha("a") }))
      .rejects.toThrow(/cannot replace/);
    expect(world.audits.size).toBe(1); expect(world.job.status).toBe("QUEUED");
  });
  it.each([
    ["a stale plan", { expectedPlanSha256: sha("0") }, /Stale plan/],
    ["another administrator", { operatorId: "other-admin" }, /Owner administrator/],
  ])("refuses %s without writing", async (_label, over, error) => {
    await expect(authorize(over)).rejects.toThrow(error);
    expect(world.audits.size).toBe(0); expect(world.job.status).toBe("FAILED");
  });
  it("refuses when the plan changes inside the fence", async () => {
    const { planSha256 } = await planQaSunburstTailCompletion(world.c, GAME);
    m.fence.mockImplementationOnce(async () => { world.rows[0]!.attempts = 2; });
    await expect(authorizeQaSunburstTailCompletion(world.c, { gameId: GAME, operatorId: OWNER, expectedPlanSha256: planSha256, ownerAuthorizationSha256: sha("e") }))
      .rejects.toThrow(/plan changed/);
    expect(world.audits.size).toBe(0);
  });
  it.each<[string, () => Promise<void> | void, RegExp]>([
    ["production", () => { m.appEnv = "production"; }, /Qualified/],
    ["a running job", () => { world.job.status = "RUNNING"; }, /running or completed job/],
    ["provider work in flight", () => { m.waiting = new Set(["row-00"]); }, /settle first/],
    ["a pending purchase", async () => { await world.budget.reserve(WORLD, { requestKey: "pending-x", scope: "judge", operationFingerprint: "p", reserveMicroUsd: 1 }); }, /pending or conflicting/],
    ["a finished game", () => { world.game.readyAt = new Date(); }, /Unfinished paid/],
    ["a non-Detective source", () => { world.state.sceneVersion = 12; }, /Unfinished paid/],
    ["26 rows", () => { world.rows.pop(); }, /All27/],
    ["another failed appearance", () => { world.rows[3]!.status = "FAILED"; }, /already be acceptable/],
    ["an owed ordinary review", () => { world.rows[5]!.judgeJson = JSON.stringify({ hide: "other-hide-5", reviewState: "awaiting-board-review" }); }, /already be acceptable/],
    ["a named appearance on its second attempt", () => { world.rows.find(r => r.id === "row-paris-detectives-hide-1")!.attempts = 2; }, /concluded first failure/],
    ["a named appearance still under review", () => { world.rows.find(r => r.id === "row-paris-detectives-hide-1")!.judgeJson = JSON.stringify({ hide: "paris-detectives-hide-1", reviewState: "awaiting-board-review" }); }, /concluded first failure/],
    ["a named appearance with a head purchase", () => { world.rows.find(r => r.id === "row-paris-detectives-hide-1")!.judgeJson = JSON.stringify({ hide: "paris-detectives-hide-1", reviewState: "board-review-complete", journeyHeadRecovery: {} }); }, /concluded first failure/],
    ["an existing second purchase", async () => { const key = "greatwall-detectives-hide-1:standing:render:2";
      await world.budget.reserve(WORLD, { requestKey: key, scope: "image", operationFingerprint: key, reserveMicroUsd: 150_000 });
      await world.budget.settle(WORLD, key, evidence("second-paid", 100_000)); }, /second purchase/],
    ["a retained second purchase", () => { m.retained.add("paris-detectives-hide-1:walking:render:2"); }, /second purchase/],
    ["a tail head pin", () => { world.audits.set(journeySunburstTailPinId(GAME, "amazon-detectives-hide-3"), { id: "pin" } as never); }, /head pin/],
    ["the v1 five-dollar receipt", () => { world.audits.set(qaFiveCompletionId(GAME), { id: "v1" } as never); }, /Another completion grant/],
    ["nothing to repaint", () => { for (const r of world.rows) if (r.status === "FAILED") Object.assign(r, { status: "GENERATED", judgeJson: acceptable("x") }); }, /No named appearance/],
  ])("does not plan with %s", async (_label, mutate, error) => {
    await mutate();
    await expect(planQaSunburstTailCompletion(world.c, GAME)).rejects.toThrow(error);
  });
  it("forces no extension when the list fits four dollars and never exceeds five", async () => {
    world = makeWorld(); await measuredLedger(3_000_000);
    for (const r of world.rows) if (r.id !== "row-paris-detectives-hide-1" && r.status === "FAILED") Object.assign(r, { status: "GENERATED", judgeJson: acceptable("x") });
    await expect(planQaSunburstTailCompletion(world.c, GAME)).rejects.toThrow(/still fits the original four dollars/);
    world = makeWorld(); await measuredLedger(3_400_000);
    await expect(planQaSunburstTailCompletion(world.c, GAME)).rejects.toThrow(/does not fit five dollars/);
  });
  it("withdraws on a source change and fails closed on a later reconciliation of an original request", async () => {
    await authorize();
    world.state.photoSha256 = sha("0");
    expect(await readQaSunburstTailCompletionBudget(world.c, WORLD)).toBeNull();
    expect(await qaSunburstTailCompletionStatus(world.c, GAME)).toMatchObject({ status: "withdrawn" });
    world.state.photoSha256 = sha("8");
    await world.budget.settle(WORLD, "lost-review", evidence("late-answer", 38_617));
    expect(await readQaSunburstTailCompletionBudget(world.c, WORLD)).not.toBeNull();
    expect(await qaSunburstTailCompletionActive(world.c, GAME)).toBeNull();
    expect(await originalOrFiveDollarCap(world.c, GAME, 5_000_000)).toBe(false);
  });
  it("refuses both receipts at once and a tampered receipt", async () => {
    await authorize();
    world.audits.set(qaFiveCompletionId(GAME), { id: qaFiveCompletionId(GAME) } as never);
    await expect(readQaSunburstTailCompletionBudget(world.c, WORLD)).rejects.toThrow(/cannot coexist/);
    world.audits.delete(qaFiveCompletionId(GAME));
    const row = world.audits.get(qaSunburstTailCompletionId(GAME))!, meta = JSON.parse(row.metaJson);
    meta.plan.operations[0].imageReserveMicroUsd = 150_000; meta.plan.committedMicroUsd -= 1; meta.plan.remainingUnderBaseMicroUsd += 1;
    row.metaJson = JSON.stringify(meta);
    await expect(readQaSunburstTailCompletionBudget(world.c, WORLD)).rejects.toThrow(/Invalid immutable/);
  });
});
