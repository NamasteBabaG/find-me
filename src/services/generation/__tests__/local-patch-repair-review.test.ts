import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Container } from "../../container";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { MockPaymentProvider } from "../../../infra/payment/mock";
import { MockAvatarProvider, NoopFaceDetector } from "../../../infra/generation/mock";
import { NoPatchJudge } from "../../../infra/generation/judge";
import { NoopAnalytics } from "../../../infra/analytics/console";
import { InlineJobRunner } from "../../../infra/jobs/inline";
import { retainedPurchaseKey } from "../../../infra/db/prisma-retained-purchase-store";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { prepareLocalPatchRepairReview, reviewLocalPatchRepair, LOCAL_PATCH_REPAIR_REVIEW_RESERVE_MICRO_USD,
  type LocalPatchRepairReviewInput, type LocalPatchRepairReviewDeps } from "../local-patch-repair-review";
import { clearWorld, seedApprovedGame, PASSING_ANSWER, bill } from "./local-patch-fixtures";
import type { LocalPatchJudgeResult } from "../local-patch-judge";

const envState = vi.hoisted(() => ({ testers: [] as string[] }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0,
  GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: envState.testers }), flag: () => false }));
const GAME = "game-repair-review";
let dir: string, url: string, db: PrismaClient, c: Container, input: LocalPatchRepairReviewInput;
const noNetwork = vi.fn(async () => { throw new Error("No live network"); });
beforeAll(async () => {
  dir = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-repair-review-")));
  url = `file:${path.join(dir, "test.sqlite").split(path.sep).join("/")}`;
  db = new PrismaClient({ datasources: { db: { url } } }); await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), appUrl: "http://localhost:3000", secret: "synthetic-repair",
    payment: new MockPaymentProvider("http://localhost:3000", "synthetic"), avatars: new MockAvatarProvider(),
    judge: new NoPatchJudge(), faces: new NoopFaceDetector(), analytics: new NoopAnalytics(), jobs: new InlineJobRunner(),
    email: { id: "console", send: async () => { throw new Error("Review must not send mail"); } }, adminEmails: [] };
  const png = await sharp({ create: { width: 96, height: 112, channels: 4, background: "tan" } }).png().toBuffer();
  input = { gameId: GAME, batchId: "frozen-two-repairs", batchSha256: "a".repeat(64),
    faceRois: [{ hideId: "tokyo-3", rect: { left: 10, top: 20, width: 34, height: 37 } }],
    request: { boardId: "tokyo", contentVersion: 8, boardPng: png, identityPng: png,
      hides: [1, 2, 3, 4, 5].map(n => ({ hideId: `tokyo-${n}`, beforePng: png, afterPng: png, closeupPng: png, afterEvidencePng: png })) } };
}, 180000);
beforeEach(async () => {
  await clearWorld(db); noNetwork.mockClear(); vi.stubGlobal("fetch", noNetwork);
  const seeded = await seedApprovedGame(c, db, { gameId: GAME, approved: false, styleVersion: "local-patch-world-v1",
    status: "GENERATION_FAILED", withJob: true, scenes: [{ slug: "tokyo", version: 8 }] });
  envState.testers = [seeded.email];
});
afterAll(async () => { vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(dir) === realpathSync(tmpdir()) && path.basename(dir).startsWith("findme-repair-review-")) rmSync(dir, { recursive: true, force: true }); });
function reply(over: Partial<LocalPatchJudgeResult> = {}): LocalPatchJudgeResult {
  return { verdict: null, raw: JSON.stringify({ hides: input.request.hides.map(hide => ({ hideId: hide.hideId,
    verdict: { ...PASSING_ANSWER, faceLikeness: "pass", faceReadable: "pass", severeSeam: "pass" } })) }),
    usage: { prompt_tokens: 12000, completion_tokens: 1200 }, requestId: "req-repair-sol", model: "gpt-5.6-sol",
    finishReason: "stop", wireFault: null, costUnknown: false, ...over };
}
function deps(over: Partial<LocalPatchJudgeResult> = {}): LocalPatchRepairReviewDeps & { judge: ReturnType<typeof vi.fn> } {
  return { fence: async tx => { const game = await tx.game.findUniqueOrThrow({ where: { id: GAME } }); if (game.deletedAt) throw new Error("deleted"); },
    judge: vi.fn(async () => reply(over)) };
}
describe("isolated repair review: real ledger and retained store, no target writes", () => {
  it("prepares exactly twelve images with an exact native34x37 face, and buys SOL LOW once across a fresh DB client", async () => {
    const prepared = await prepareLocalPatchRepairReview(input), d = deps();
    expect(prepared.images).toHaveLength(12); expect(prepared.prompt).toContain("coherent generic child is NOT sufficient");
    const panel = prepared.images[7]!, originalMeta = await sharp(input.request.hides[2]!.afterEvidencePng!).metadata();
    const face = await sharp(panel).extract({ left: originalMeta.width! + 24, top: 0, width: 34, height: 37 }).raw().toBuffer();
    const expected = await sharp(input.request.hides[2]!.afterPng).extract(input.faceRois[0]!.rect).raw().toBuffer();
    expect(face.equals(expected)).toBe(true);
    const before = await db.game.findUniqueOrThrow({ where: { id: GAME } });
    const first = await reviewLocalPatchRepair(c, prepared, d);
    expect(first).toMatchObject({ state: "pass", replayed: false, evidence: { model: "gpt-5.6-sol", costBasis: "conservative-upper-estimate" } });
    expect(d.judge.mock.calls[0]![0].settings).toMatchObject({ model: "gpt-5.6-sol", effort: "low" });
    expect(await db.targetVariantAsset.count()).toBe(0);
    // The existing deletion fence touches updatedAt to lock the game, but no
    // status, config, child or publication field may change during review.
    expect({ ...await db.game.findUniqueOrThrow({ where: { id: GAME } }), updatedAt: before.updatedAt }).toEqual(before);
    const fresh = new PrismaClient({ datasources: { db: { url } } });
    try { const second = deps(); expect(await reviewLocalPatchRepair({ ...c, db: fresh, storage: new DbStorage(fresh) }, prepared, second)).toMatchObject({ state: "pass", replayed: true }); expect(second.judge).not.toHaveBeenCalled(); }
    finally { await fresh.$disconnect(); }
    expect(noNetwork).not.toHaveBeenCalled();
    const bill = await boardWizardBudgetOf(c).readRequest(boardWizardWorldId(GAME), prepared.requestKey);
    expect(bill).toMatchObject({ state: "settled", scope: "judge", reserveMicroUsd: LOCAL_PATCH_REPAIR_REVIEW_RESERVE_MICRO_USD });
  });
  it.each(["fail", "unsure"])("generic coherent face marked %s cannot pass despite claimed overall pass", async severe => {
    const parsed = JSON.parse(reply().raw!); parsed.hides[2].verdict.faceLikeness = severe;
    if (severe === "fail") parsed.hides[2].verdict.faults = [{ check: "faceLikeness", where: "Face is a different generic child in the native face panel" }];
    const prepared = await prepareLocalPatchRepairReview(input), d = deps({ raw: JSON.stringify(parsed) });
    expect(await reviewLocalPatchRepair(c, prepared, d)).toMatchObject({ state: "blocked" });
    expect(await db.targetVariantAsset.count()).toBe(0);
  });
  it("a sibling uncertainty blocks while leaving all targets untouched", async () => {
    const raw = JSON.parse(reply().raw!); raw.hides[0].verdict.severeSeam = "unsure";
    expect(await reviewLocalPatchRepair(c, await prepareLocalPatchRepairReview(input), deps({ raw: JSON.stringify(raw) }))).toMatchObject({ state: "blocked" });
  });
  it("wrong model is a retained, correctly priced refusal, never a pass", async () => {
    const d = deps({ model: "gpt-5.6-luna" }), p = await prepareLocalPatchRepairReview(input);
    expect(await reviewLocalPatchRepair(c, p, d)).toMatchObject({ state: "blocked", wireFault: "wrong-model", evidence: { model: "gpt-5.6-luna" } });
    expect(await reviewLocalPatchRepair(c, p, d)).toMatchObject({ replayed: true }); expect(d.judge).toHaveBeenCalledTimes(1);
  });
  it.each([{ usage: null, costUnknown: true }, { model: "unpriced-provider-model", costUnknown: false }])("retains unpriceable reply and holds on restart: %j", async over => {
    const d = deps(over), p = await prepareLocalPatchRepairReview(input);
    expect(await reviewLocalPatchRepair(c, p, d)).toMatchObject({ state: "held" });
    expect(await db.fileBlob.findUnique({ where: { key: retainedPurchaseKey(boardWizardWorldId(GAME), p.requestKey) } })).not.toBeNull();
    expect(await reviewLocalPatchRepair(c, p, d)).toMatchObject({ state: "held" }); expect(d.judge).toHaveBeenCalledTimes(1);
    expect((await boardWizardBudgetOf(c).audit(boardWizardWorldId(GAME))).held).toBe(true);
  });
  it("rejects a below-native30 face before spending and binds face position/new question to a distinct key", async () => {
    await expect(prepareLocalPatchRepairReview({ ...input, faceRois: [{ hideId: "tokyo-3", rect: { left: 10, top: 20, width: 29, height: 37 } }] })).rejects.toThrow("30 by 30");
    const a = await prepareLocalPatchRepairReview(input), b = await prepareLocalPatchRepairReview({ ...input,
      faceRois: [{ hideId: "tokyo-3", rect: { left: 11, top: 20, width: 34, height: 37 } }] });
    expect(a.requestKey).not.toBe(b.requestKey);
    await expect(reviewLocalPatchRepair(c, { ...a, prompt: `${a.prompt} altered` }, deps())).rejects.toThrow("question changed");
    expect((await boardWizardBudgetOf(c).audit(boardWizardWorldId(GAME))).settledMicroUsd).toBe(0);
  });
  it("deferred deadline makes no reservation or provider call", async () => {
    const d = deps(), p = await prepareLocalPatchRepairReview(input);
    expect(await reviewLocalPatchRepair(c, p, { ...d, deadlineAt: Date.now() + 1 })).toMatchObject({ state: "pending" });
    expect(d.judge).not.toHaveBeenCalled(); expect(await boardWizardBudgetOf(c).readRequest(boardWizardWorldId(GAME), p.requestKey)).toBeNull();
  });
  it("a missing credential stops before any reservation", async () => {
    const p = await prepareLocalPatchRepairReview(input);
    await expect(reviewLocalPatchRepair(c, p, { fence: deps().fence })).rejects.toThrow("credential required");
    expect(await boardWizardBudgetOf(c).readRequest(boardWizardWorldId(GAME), p.requestKey)).toBeNull();
  });
  it("uses the existing inclusive4-dollar cap, not a second repair wallet", async () => {
    const budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(GAME);
    await budget.reserve(worldId, { requestKey: "existing-paid-work", scope: "image", operationFingerprint: "existing", reserveMicroUsd: 3_600_000 });
    await budget.settle(worldId, "existing-paid-work", bill("req-existing-work", 3_600_000));
    const p = await prepareLocalPatchRepairReview(input), d = deps();
    await expect(reviewLocalPatchRepair(c, p, d)).rejects.toThrow("inclusive authorized QA world ceiling");
    expect(d.judge).not.toHaveBeenCalled(); expect(await budget.readRequest(worldId, p.requestKey)).toBeNull();
    expect(await budget.audit(worldId)).toMatchObject({ settledMicroUsd: 3_600_000, reservedMicroUsd: 0 });
  });
  it("a stale caller cannot use a paid answer, but a replacement replays it without buying again", async () => {
    const p = await prepareLocalPatchRepairReview(input); let stale = false;
    const d = deps(); d.fence = async () => { if (stale) throw new Error("stale-repair-fence"); };
    d.judge.mockImplementation(async () => { stale = true; return reply(); });
    await expect(reviewLocalPatchRepair(c, p, d)).rejects.toThrow("stale-repair-fence");
    expect((await boardWizardBudgetOf(c).readRequest(boardWizardWorldId(GAME), p.requestKey))?.state).toBe("settled");
    const replacement = deps();
    expect(await reviewLocalPatchRepair(c, p, replacement)).toMatchObject({ state: "pass", replayed: true });
    expect(replacement.judge).not.toHaveBeenCalled(); expect(d.judge).toHaveBeenCalledTimes(1);
  });
  it("uses the existing real transport with fixed SOL LOW and twelve wire images", async () => {
    const answer = reply(); const wire = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ model: answer.model, usage: answer.usage,
      choices: [{ finish_reason: "stop", message: { content: answer.raw } }] }), { headers: { "x-request-id": "req-real-wire-fake-network" } }));
    vi.stubGlobal("fetch", wire);
    const p = await prepareLocalPatchRepairReview(input), d = deps();
    expect(await reviewLocalPatchRepair(c, p, { fence: d.fence, apiKey: "synthetic-not-a-key" })).toMatchObject({ state: "pass" });
    const call = wire.mock.calls[0]!; const body = JSON.parse(String(call[1]!.body));
    expect(body).toMatchObject({ model: "gpt-5.6-sol", reasoning_effort: "low", max_completion_tokens: 3000, store: false });
    expect(body.messages[0].content.filter((item: { type: string }) => item.type === "image_url")).toHaveLength(12);
  });
});
