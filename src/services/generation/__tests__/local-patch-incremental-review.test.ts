import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PLAYER_REVIEW_MODE, PLAYER_REVIEW_VERSION } from "../local-patch-player-review";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import type { Container } from "../../container";
import { boardsOfWorlds } from "../../world-catalog.service";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { prepareLocalPatchBoardReview, reviewLocalPatchBoard } from "../local-patch-board-review";
import { localPatchBoardJudgeImages, localPatchHideEvidenceIds, type LocalPatchBoardJudgeRequest, type LocalPatchBoardJudgeResult } from "../local-patch-judge";
import { runLocalPatchHide, type LocalPatchHideDeps } from "../local-patch-hide";
import { LOCAL_PATCH_PUBLICATION_ACTION } from "../local-patch-publication-policy";
import { localPatchPrivateInventory } from "../local-patch-world";
import { runLocalPatchWorldSlice, LOCAL_PATCH_RECOVERY_EXHAUSTED } from "../local-patch-world";
import { preparationState } from "../../../domain/generation-health";
import { nextPendingGame, tickGeneration } from "../queue";
import { LOCAL_PATCH_EVIDENCE_RETRY_BACKOFF_MS, localPatchEvidenceRecovery } from "../local-patch-review-recovery";
import { LOCAL_PATCH_COMPOSITION_VERSION } from "../local-patch-seam";
import { retainedPurchaseKey } from "../../../infra/db/prisma-retained-purchase-store";
import { LocalPatchRetainedPurchaseStore } from "../local-patch-lifecycle";
import { purchaseOnce } from "../paid-operation";
import { recoverPreparedLocalPatchReview, REVIEW_INTERRUPTION_POLICY } from "../local-patch-review-interruption-recovery";
import { localPatchBudgetReadyForPublication } from "../local-patch-interruption-recovery";
import { sha256Bytes } from "../fixed-sprite";
import { bill, paintedCrop, paintedOk, seedApprovedGame, PASSING_ANSWER } from "./local-patch-fixtures";
import { pinVisualReviewRelease, hasDualVisualReview, dualVisualReviewVersion, DUAL_VISUAL_REVIEW_VERSION, DUAL_VISUAL_REVIEW_V2, DUAL_VISUAL_REVIEW_V3,
  type DualVisualReviewVersion } from "../visual-review-release";
import sharp from "sharp";
import { cropOf, maskForHide } from "../../../domain/scene/local-patch-hides";
import { prepareJoinDetails } from "../local-patch-integration-evidence";
import { objectJoinInstructions } from "../local-patch-player-review";
import { localPatchRepairChecks } from "../local-patch-prompt";
import { CONTINUITY_READER_BOUNDED, CONTINUITY_READER_CROWD, CONTINUITY_READER_STRICT } from "../../../domain/scene/local-patch-body-continuity";
import type { TargetVariantAsset } from "@prisma/client";
import { asDeployedQualityRefusal, asDeployedReaderRefusal, atEvidenceRound, LOCATED_390, LOCATED_390_DEFECT, located390Answer, located390Verdict,
  longAnswer, prose, publicationBinding, spendTo } from "./local-patch-dual-fixtures";
import { allowedDualPublication } from "../local-patch-dual-publication";
import { CURRENT_QUALITY_READER, localPatchRetainedAnswerUndecided, readQualityStage } from "../local-patch-dual-evidence";
import { localPatchQualityDisposition, QUALITY_READER_LOCATED, QUALITY_READER_LOCATED_V2, QUALITY_READER_STRICT } from "../local-patch-judge";
import { needsSelfRepair } from "../../../domain/scene/local-patch-self-repair";
import { visualReviewPolicy } from "../../../domain/generation/visual-review-policy";
import { localPatchPublicationGeometryHash } from "../local-patch-publication-policy";
import { createDraft } from "../../create-flow.service";

const journeySlugs = new Set(boardsOfWorlds(["journey"]));
const BOARDS = localPatchBoardsForVersion(12).filter(board => journeySlugs.has(board.board)), BOARD = BOARDS.find(b => b.board === "giza")!;
const testers: string[] = [];
let playerMode = false;
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0,
  LOCAL_PATCH_PLAYER_REVIEW: playerMode ? "on" : "off",
  GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers }), flag: () => false }));
let directory: string, db: PrismaClient, c: Container;
beforeEach(() => { playerMode = false; });
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-incremental-review-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(directory, "test.db").replaceAll("\\", "/")}` } } });
  await applyTestSchema(db); c = { db, storage: new DbStorage(db) } as unknown as Container;
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("Live requests forbidden in incremental review regression"); }));
}, 180000);
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(directory) === realpathSync(tmpdir()) && path.basename(directory).startsWith("findme-incremental-review-")) rmSync(directory, { recursive: true });
});
const good = { ...PASSING_ANSWER, faceLikeness: "pass", faceReadable: "pass", severeSeam: "pass", ageAppropriate: "pass",
  boundaryIntegrity: Object.fromEntries(["left", "top", "right", "bottom"].map(edge => [edge, { status: "pass", observation: "Continuous native heads, bodies and supports across this join" }])),
  lightingMatch: "pass", neighborsIntact: "pass", integrationEvidence: { style: "Painted contours match original faces",
    lighting: "Local scene shadows match", neighbors: "All four original neighbor quadrants preserved" } };
async function seed(gameId: string, count = 1) {
  const seeded = await seedApprovedGame(c, db, { gameId, approved: false, styleVersion: "local-patch-world-v1", status: "TARGETS_GENERATING",
    withJob: true, scenes: BOARDS.map(b => ({ slug: b.board, version: 12 })) });
  testers.push(seeded.email);
  await db.order.create({ data: { id: `ord-${gameId}`, gameId, userId: seeded.userId, provider: "mock", packageTier: "ONE_WORLD",
    amountAgorot: 3900, paymentStatus: "PAID", paidAt: new Date() } });
  await c.storage.put(`private/photo-${gameId}.jpg`, seeded.sheet, "image/png");
  const catalog = await readBoardConditionedCatalog();
  await reviewBoardWizardIdentity({ db, apiKey: "synthetic", budget: boardWizardBudgetOf(c), beforeDispatch: async () => {},
    write: work => db.$transaction(work), reviewer: { review: async () => ({ httpOk: true, requestId: `req-identity-${gameId}`,
      body: { model: "gpt-5.6-luna", usage: { prompt_tokens: 1500, completion_tokens: 150 }, choices: [{ finish_reason: "stop", message: {
        content: JSON.stringify({ checks: { identity: "pass", age: "pass", paintedStyle: "pass", sheetLayout: "pass" }, reason: "Controlled identity" }) } }] } }) } },
  { gameId, identityAssetId: `ast-sheet-${gameId}`, sheet: seeded.sheet, photo: seeded.sheet, atlas: seeded.sheet, contentVersion: 12,
    provenance: { promptVersion: "character-v6-painted-identity-geometry", quality: "medium", photoAssetId: `ast-photo-${gameId}`,
      photoSha256: sha256Bytes(seeded.sheet), ageYears: 8, crop: null,
      style: { version: "board-matched-identity/v4", catalogSha256: catalog.sha256, atlasSha256: sha256Bytes(seeded.sheet) } } });
  const render = vi.fn<LocalPatchHideDeps["render"]>(async ({ requestKey, stylePng }) => {
    const hide = BOARD.hides.find(h => requestKey.startsWith(`${h.id}:`))!;
    return paintedOk(await paintedCrop(stylePng, hide), bill(`paint-${gameId}-${requestKey}`));
  });
  const deps = { renderPolicySha256: "f".repeat(64), render, judge: async () => { throw Error("Per-hide judge forbidden"); } };
  for (const hide of BOARD.hides.slice(0, count)) await runLocalPatchHide(c, deps, { gameId, board: BOARD, hide });
  let number = 0;
  const judge = vi.fn<(request: LocalPatchBoardJudgeRequest) => Promise<LocalPatchBoardJudgeResult>>(async request => ({ verdict: null, verdicts: {},
    raw: JSON.stringify({ hides: request.hides.map(h => ({ hideId: h.hideId, evidenceIds: localPatchHideEvidenceIds(h.hideId), verdict: good })) }),
    model: "gpt-5.6-sol", requestId: `judge-${gameId}-${++number}`, usage: { prompt_tokens: 1000, completion_tokens: 400 },
    finishReason: "stop", wireFault: null, costUnknown: false }));
  return { gameId, sceneId: `gsc-${gameId}-${BOARD.board}`, judge, render, deps };
}
const review = (s: Awaited<ReturnType<typeof seed>>) => reviewLocalPatchBoard(c, s, { fence: async () => {}, judge: s.judge });
const rows = (gameId: string) => db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } }, orderBy: { id: "asc" } });
const interruptedReply = { verdict: null, verdicts: {}, raw: null, model: null, usage: null, requestId: null,
  finishReason: null, wireFault: "timeout" as const, costUnknown: true };

const publishable = (gameId: string, row: TargetVariantAsset, judgeJson = row.judgeJson) =>
  db.$transaction(tx => allowedDualPublication(tx, { ...publicationBinding(gameId, row), judgeJson }));

/** An anatomy reply: its text, or its text with the provider's own finish reason. */
type AnatomyReply = string | { raw: string; finishReason: string };
async function dualSeed(id: string, anatomy: "pass" | "broken" | "schema" | ((hideId: string, call: number) => AnatomyReply) = "pass",
  options: { count?: number; release?: DualVisualReviewVersion; quality?: Record<string, unknown> } = {}) {
  const s = await seed(id, options.count ?? 1);
  await db.$transaction(tx => pinVisualReviewRelease(tx, s.gameId, options.release));
  const hideId = BOARD.hides[0]!.id;
  let calls = 0, anatomyCalls = 0;
  const request = vi.fn<NonNullable<Container["visualReview"]>["request"]>(async question => {
    expect(question.effort).toBe("high");
    const quality = question.role === "scene-quality";
    if (!quality) {
      expect(question.images).toHaveLength(6);
      expect(question.labels.every(label => !label.includes("BEFORE") && !label.includes("canonical-portrait"))).toBe(true);
    }
    // The binding names the hide under review, so each answer is about the right pixels.
    const asked = (JSON.parse(/Immutable candidate binding: (\{.*?\})\. Evidence attempt/.exec(question.prompt)![1]!) as { hideId: string }).hideId;
    const reply = !quality && typeof anatomy === "function" ? anatomy(asked, ++anatomyCalls) : null;
    return { verdict: null, model: quality ? "claude-opus-5-5" : "gpt-6.1-sol", requestId: `dual-${id}-${++calls}`,
      finishReason: quality ? "end_turn" : typeof reply === "object" && reply ? reply.finishReason : "stop", wireFault: null, costUnknown: false,
      usage: quality ? { input_tokens: 2000, output_tokens: 500 } : { prompt_tokens: 2000, completion_tokens: 500 },
      raw: quality ? "```json\n" + JSON.stringify({ hides: [{ hideId: asked, evidenceIds: localPatchHideEvidenceIds(asked), verdict: options.quality ?? good }] }) + "\n```"
        : reply !== null ? typeof reply === "string" ? reply : reply.raw
        : anatomy === "schema" ? "{}" : JSON.stringify({ cases: [{ id: `${hideId}:people`, state: anatomy === "broken" ? "broken" : "coherent",
          visibleBody: true, headConnection: anatomy === "broken" ? "missing" : "connected", headTrace: "Visible head contours and neck connections checked in the final context",
          bodyTrace: "All final bodies connect naturally to their heads and limbs", occlusion: "",
          faults: anatomy === "broken" ? [{ kind: "hard-cut", where: "Lower right neighbour has a straight cut through the head into the background" }] : [] }] }) };
  });
  const container = { ...c, visualReview: { request } };
  const run = () => reviewLocalPatchBoard(container, s, { fence: async () => {}, judge: s.judge });
  return { ...s, request, run, container };
}

describe("prospective Opus/Sol HIGH pipeline", () => {
  it("enrolls the actual new-draft flow atomically and leaves older drafts on their own policy", async () => {
    const container = { ...c, pinDualVisualReview: true, visualReview: { request: vi.fn() }, analytics: { track: vi.fn() } } as unknown as Container;
    const fresh = await createDraft(container, null, "he");
    expect(await hasDualVisualReview(db, fresh.gameId)).toBe(true);
    const legacy = await createDraft({ ...container, pinDualVisualReview: false }, null, "he");
    expect(await hasDualVisualReview(db, legacy.gameId)).toBe(false);
    const count = await db.game.count();
    await expect(createDraft({ ...container, visualReview: undefined }, null, "he")).rejects.toThrow("credentials");
    expect(await db.game.count()).toBe(count);
    expect(container.visualReview!.request).not.toHaveBeenCalled();
  });
  it("pins new games and requires two independently paid answers before publication, replaying neither", async () => {
    const s = await dualSeed("dual-two-stage");
    expect(await hasDualVisualReview(db, s.gameId)).toBe(true);
    expect(await s.run()).toMatchObject({ state: "pending", replayed: false });
    expect(s.request).toHaveBeenCalledTimes(1);
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(0);
    await s.run();
    const row = (await rows(s.gameId))[0]!;
    const receipt = JSON.parse(row.judgeJson!);
    expect(receipt.boardReview).toMatchObject({ version: DUAL_VISUAL_REVIEW_VERSION, effort: "high",
      dual: { quality: { model: "claude-opus-5-5" }, continuity: { model: "gpt-6.1-sol" } } });
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(1);
    await s.run();
    expect(s.request).toHaveBeenCalledTimes(2); expect(s.judge).not.toHaveBeenCalled();
    const proof = { gameId: s.gameId, sceneVersion: 12, hideId: BOARD.hides[0]!.id, variantId: row.id, attempts: row.attempts,
      identityAssetId: `ast-sheet-${s.gameId}`, identitySha256: receipt.boardReview.dual.identitySha256, assetId: row.assetId!,
      imageSha256: receipt.judgedSha256, geometrySha256: localPatchPublicationGeometryHash(row), judgeJson: row.judgeJson };
    expect(await db.$transaction(tx => allowedDualPublication(tx, proof))).toBe(true);
    // A stage the deployed code wrote names no reader: it is still read strictly, and this short answer still passes.
    const { reader: _reader, ...unnamed } = receipt.boardReview.dual.continuity;
    const withStage = (stage: unknown) => JSON.stringify({ ...receipt, boardReview: { ...receipt.boardReview, dual: { ...receipt.boardReview.dual, continuity: stage } } });
    expect(await db.$transaction(tx => allowedDualPublication(tx, { ...proof, judgeJson: withStage(unnamed) }))).toBe(true);
    expect(await db.$transaction(tx => allowedDualPublication(tx, { ...proof, judgeJson: withStage({ ...unnamed, reader: CONTINUITY_READER_CROWD }) }))).toBe(false);
    receipt.boardReview.dual.continuity.raw = "{}";
    expect(await db.$transaction(tx => allowedDualPublication(tx, { ...proof, judgeJson: JSON.stringify(receipt) }))).toBe(false);
  });
  it("routes an independent cut-head refusal to repair even after an Opus pass", async () => {
    const s = await dualSeed("dual-cut-head", "broken");
    await s.run(); expect((await s.run()).state).toBe("retry");
    const row = (await rows(s.gameId))[0]!;
    expect(row.status).toBe("FAILED"); expect(row.lastError).toContain("pictureWhole");
    expect(JSON.parse(row.judgeJson!).verdict.pictureWhole).toBe("fail");
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(0);
    expect(s.render).toHaveBeenCalledTimes(1);
  });
  it("retries malformed anatomy evidence with the same pixels and reuses the good Opus receipt", async () => {
    const s = await dualSeed("dual-malformed-anatomy", "schema");
    await s.run(); expect((await s.run()).state).toBe("blocked");
    expect(localPatchEvidenceRecovery((await rows(s.gameId))[0]!)).toMatchObject({ retry: true, strategy: "strict-json/v1", role: "continuity" });
    await s.run();
    expect(s.request.mock.calls.map(([q]) => q.role)).toEqual(["scene-quality", "head-continuity", "head-continuity"]);
    expect(s.render).toHaveBeenCalledTimes(1);
    // The same malformed answer under the stricter question twice: no fourth question, ever.
    await s.run(); await s.run(); await s.run();
    expect(s.request.mock.calls.map(([q]) => q.role)).toEqual(["scene-quality", "head-continuity", "head-continuity", "head-continuity"]);
    const anatomy = s.request.mock.calls.filter(([q]) => q.role === "head-continuity").map(([q]) => q.prompt);
    expect(anatomy[0]).not.toContain("FORMAT RECOVERY"); expect(anatomy.slice(1).every(prompt => prompt.includes("FORMAT RECOVERY"))).toBe(true);
    const row = (await rows(s.gameId))[0]!, receipt = JSON.parse(row.judgeJson!);
    expect(receipt.evidenceAttempts.map((a: { attempt: number; role: string; kind: string; path: string; strategy: string }) => [a.attempt, a.role, a.kind, a.path, a.strategy]))
      .toEqual([[1, "continuity", "shape", "cases", "standard/v1"], [2, "continuity", "shape", "cases", "strict-json/v1"], [3, "continuity", "shape", "cases", "strict-json/v1"]]);
    expect(receipt.evidenceDiagnosis).toMatchObject({ role: "continuity", family: "format", next: "exhausted" });
    expect(localPatchEvidenceRecovery(row)).toMatchObject({ retry: false, exhausted: true });
    expect(row).toMatchObject({ status: "FAILED", attempts: 1 }); expect(s.render).toHaveBeenCalledTimes(1);
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(0);
  });
  it("asks a cut-off anatomy answer again in compact form, never as the same question and never as a new picture", async () => {
    // The provider stopped at its output ceiling: a size failure, not a format one.
    const s = await dualSeed("dual-truncated-anatomy", hideId => ({ raw: longAnswer(hideId, 2169, 2232, 655).slice(0, 3000), finishReason: "length" }));
    await s.run(); expect((await s.run()).state).toBe("blocked");
    expect(localPatchEvidenceRecovery((await rows(s.gameId))[0]!)).toMatchObject({ retry: true, strategy: "compact/v1", role: "continuity" });
    await s.run(); await s.run(); await s.run(); await s.run();
    expect(s.request.mock.calls.map(([q]) => q.role)).toEqual(["scene-quality", "head-continuity", "head-continuity", "head-continuity"]);
    const anatomy = s.request.mock.calls.filter(([q]) => q.role === "head-continuity").map(([q]) => q.prompt);
    expect(anatomy[0]).not.toContain("SIZE RECOVERY"); expect(anatomy.slice(1).every(prompt => prompt.includes("SIZE RECOVERY"))).toBe(true);
    const row = (await rows(s.gameId))[0]!, receipt = JSON.parse(row.judgeJson!);
    expect(receipt.evidenceAttempts.map((a: { attempt: number; kind: string; code: string; strategy: string }) => [a.attempt, a.kind, a.code, a.strategy]))
      .toEqual([[1, "truncated", "truncated", "standard/v1"], [2, "truncated", "truncated", "compact/v1"], [3, "truncated", "truncated", "compact/v1"]]);
    expect(receipt.evidenceDiagnosis).toMatchObject({ role: "continuity", family: "size", next: "exhausted" });
    expect(row.lastError).toContain("evidence continuity truncated, round 3");
    expect(row).toMatchObject({ status: "FAILED", attempts: 1 }); expect(s.render).toHaveBeenCalledTimes(1);
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(0);
  });
  it.each([[1013, 954, 466], [1817, 1602, 779], [2169, 2232, 655]])("accepts a complete anatomy answer at the observed lengths (%i, %i, %i) with no further question or image", async (head, body, occlusion) => {
    const s = await dualSeed(`dual-long-${head}`, hideId => longAnswer(hideId, head, body, occlusion));
    await s.run(); await s.run(); await s.run();
    expect(s.request.mock.calls.map(([q]) => q.role)).toEqual(["scene-quality", "head-continuity"]);
    const row = (await rows(s.gameId))[0]!, receipt = JSON.parse(row.judgeJson!);
    expect(row.status).toBe("GENERATED");
    expect(receipt.boardReview.dual.continuity).toMatchObject({ reader: CONTINUITY_READER_BOUNDED, wireFault: null });
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(1);
    expect(await publishable(s.gameId, row)).toBe(true);
    expect(s.render).toHaveBeenCalledTimes(1);
  });
  it("keeps a defect written after a long explanation and sends the picture to its repair", async () => {
    const s = await dualSeed("dual-long-defect", hideId => longAnswer(hideId, 2169, 2232, 655,
      { faults: [{ kind: "hard-cut", where: prose(700, "A straight top join slices the vendor's forehead") }] }));
    await s.run(); expect((await s.run()).state).toBe("retry");
    const row = (await rows(s.gameId))[0]!, receipt = JSON.parse(row.judgeJson!);
    expect(row.status).toBe("FAILED"); expect(row.lastError).toMatch(/^quality-retry: .*pictureWhole/);
    expect(receipt.verdict.pictureWhole).toBe("fail");
    expect(receipt.verdict.faults.some((f: { check: string; where: string }) => f.check === "pictureWhole" && f.where.startsWith("A straight top join"))).toBe(true);
    expect(localPatchEvidenceRecovery(row)).toBeNull();
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(0);
    expect(s.request).toHaveBeenCalledTimes(2); expect(s.render).toHaveBeenCalledTimes(1);
  });
  it("decides an answer the deployed reader refused, with no question, reservation, spend or image, even below one reservation", async () => {
    const s = await dualSeed("dual-retained-decision", hideId => longAnswer(hideId, 2169, 2232, 655));
    await s.run(); await s.run();
    const legacy = await asDeployedReaderRefusal(db, s.gameId, (await rows(s.gameId))[0]!);
    expect(await publishable(s.gameId, legacy)).toBe(false);
    // Without a free reading, the policy would buy a stricter question next.
    expect(localPatchEvidenceRecovery(legacy)).toMatchObject({ retry: true, strategy: "strict-json/v1" });
    await spendTo(c, s.gameId, 3_701_771);
    const worldId = boardWizardWorldId(s.gameId), budget = boardWizardBudgetOf(c);
    const before = await budget.audit(worldId), ledger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } });
    expect(before).toMatchObject({ remainingMicroUsd: 298_229, held: false });
    const calls = s.request.mock.calls.length;
    expect(await reviewLocalPatchBoard(s.container, s, { fence: async () => {} }, { decideRetained: true }))
      .toMatchObject({ decidedRetained: true, costCents: 0, replayed: true });
    expect(s.request.mock.calls.length).toBe(calls);
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } })).toEqual(ledger);
    const row = (await rows(s.gameId))[0]!, receipt = JSON.parse(row.judgeJson!);
    expect(row).toMatchObject({ status: "GENERATED", lastError: null, assetId: legacy.assetId, attempts: legacy.attempts });
    const original = JSON.parse(legacy.judgeJson!).boardReview;
    expect(receipt.boardReview.dual.continuity).not.toHaveProperty("reader");
    expect(receipt.boardReview.dual.continuity.reading).toMatchObject({ version: "continuity-reading/v1", reader: CONTINUITY_READER_BOUNDED,
      previousReader: CONTINUITY_READER_STRICT, disposition: "pass", reason: "pass", sourceRequestKey: original.dual.continuity.requestKey,
      sourceFingerprint: original.dual.continuity.fingerprint });
    expect(receipt.reviewHistory.at(-1).boardReview).toEqual(original);
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(1);
    expect(await publishable(s.gameId, row)).toBe(true);
    const reading = receipt.boardReview.dual.continuity.reading;
    for (const forged of [{ ...reading, disposition: "repair" }, { ...reading, rawSha256: "0".repeat(64) }, { ...reading, reader: CONTINUITY_READER_CROWD }])
      expect(await publishable(s.gameId, row, JSON.stringify({ ...receipt, boardReview: { ...receipt.boardReview,
        dual: { ...receipt.boardReview.dual, continuity: { ...receipt.boardReview.dual.continuity, reading: forged } } } }))).toBe(false);
    // Decided once: never read again, never bought again.
    expect(await reviewLocalPatchBoard(s.container, s, { fence: async () => {} }, { decideRetained: true })).toMatchObject({ state: "pending", costCents: 0 });
    expect(await rows(s.gameId)).toEqual([row]); expect(s.render).toHaveBeenCalledTimes(1);
  });
  it.each(["refunded", "stopped", "deleted", "tampered"] as const)("never decides a retained answer for a %s world or evidence", async kind => {
    const s = await dualSeed(`dual-retained-${kind}`, hideId => longAnswer(hideId, 1817, 1602, 779));
    await s.run(); await s.run();
    const legacy = await asDeployedReaderRefusal(db, s.gameId, (await rows(s.gameId))[0]!);
    const worldId = boardWizardWorldId(s.gameId), ledger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } });
    if (kind === "refunded") await db.order.update({ where: { id: `ord-${s.gameId}` }, data: { paymentStatus: "REFUNDED", refundedAt: new Date() } });
    if (kind === "stopped") await db.game.update({ where: { id: s.gameId }, data: { status: "CANCELLED" } });
    if (kind === "deleted") await db.game.update({ where: { id: s.gameId }, data: { status: "DELETED", deletedAt: new Date() } });
    if (kind === "tampered") {
      const receipt = JSON.parse(legacy.judgeJson!); receipt.boardReview.dual.continuity.costMicroUsd += 1;
      await db.targetVariantAsset.update({ where: { id: legacy.id }, data: { judgeJson: JSON.stringify(receipt) } });
    }
    const before = await rows(s.gameId);
    const attempt = reviewLocalPatchBoard(s.container, s, { fence: async () => {} }, { decideRetained: true });
    if (kind === "stopped" || kind === "deleted") await expect(attempt).rejects.toThrow();
    else expect(await attempt).toMatchObject({ state: "pending", costCents: 0 });
    expect(await rows(s.gameId)).toEqual(before);
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } })).toEqual(ledger);
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(0);
    expect(s.request).toHaveBeenCalledTimes(2);
  });
  it("asks an uncertain anatomy reviewer to decide once, then sends the picture to the bounded image route", async () => {
    const s = await dualSeed("dual-unsure", hideId => longAnswer(hideId, 300, 300, 0, { state: "unsure", headConnection: "unsure" }));
    await s.run(); expect((await s.run()).state).toBe("blocked");
    expect(localPatchEvidenceRecovery((await rows(s.gameId))[0]!)).toMatchObject({ retry: true, strategy: "decide/v1", role: "continuity" });
    expect((await s.run()).state).toBe("retry");
    const anatomy = s.request.mock.calls.filter(([q]) => q.role === "head-continuity").map(([q]) => q.prompt);
    expect(anatomy).toHaveLength(2); expect(anatomy[1]).toContain("DECISION RECOVERY");
    const row = (await rows(s.gameId))[0]!, receipt = JSON.parse(row.judgeJson!);
    expect(receipt.verdict.pictureWhole).toBe("unsure"); expect(row.lastError).toMatch(/^quality-retry: pictureWhole/);
    expect(receipt.evidenceDiagnosis).toMatchObject({ family: "visual", next: "repair" });
    expect(localPatchEvidenceRecovery(row)).toBeNull();
    expect(s.request.mock.calls.map(([q]) => q.role)).toEqual(["scene-quality", "head-continuity", "head-continuity"]);
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(0);
    expect(s.render).toHaveBeenCalledTimes(1);
  });
  it("asks a v2 game one bounded entry per person and publishes only on a crowd answer", async () => {
    const person = (ref: string, role: "target" | "bystander") => ({ ref, role, state: "coherent", visibleBody: true, headConnection: "connected",
      headTrace: "Round head joins its own neck above the collar.", bodyTrace: "Torso continues into both arms and standing legs.", occlusion: "", faults: [] });
    const s = await dualSeed("dual-crowd-v2", (hideId, call) => call === 1 ? longAnswer(hideId, 300, 300, 0)
      : JSON.stringify({ cases: [{ id: `${hideId}:people`, people: [person("target", "target"), person("vendor", "bystander")], unlisted: 0 }] }),
    { release: DUAL_VISUAL_REVIEW_V2 });
    expect(await dualVisualReviewVersion(db, s.gameId)).toBe(DUAL_VISUAL_REVIEW_V2);
    await s.run(); expect((await s.run()).state).toBe("blocked");
    const first = (await rows(s.gameId))[0]!;
    // A v1-shaped answer to the v2 question is a format failure, never a pass.
    expect(JSON.parse(first.judgeJson!).evidenceAttempts).toMatchObject([{ role: "continuity", kind: "shape", strategy: "standard/v1" }]);
    await s.run();
    const sol = s.request.mock.calls.filter(([q]) => q.role === "head-continuity").map(([q]) => q.prompt);
    expect(sol[0]).toContain("Give each visible person their own entry"); expect(sol[0]).toContain(`"version":"${DUAL_VISUAL_REVIEW_V2}"`);
    expect(sol[0]).not.toContain("Summarize the observed connections in headTrace/bodyTrace");
    const row = (await rows(s.gameId))[0]!, receipt = JSON.parse(row.judgeJson!);
    expect(row.status).toBe("GENERATED");
    expect(receipt.boardReview).toMatchObject({ version: DUAL_VISUAL_REVIEW_V2, dual: { version: DUAL_VISUAL_REVIEW_V2, continuity: { reader: CONTINUITY_READER_CROWD } } });
    expect(await publishable(s.gameId, row)).toBe(true);
    // One question's reader never decides another question's answer.
    const asV1 = { ...receipt.boardReview.dual.continuity, reader: CONTINUITY_READER_BOUNDED };
    expect(await publishable(s.gameId, row, JSON.stringify({ ...receipt, boardReview: { ...receipt.boardReview,
      dual: { ...receipt.boardReview.dual, continuity: asV1 } } }))).toBe(false);
  });
  it("reads exactly the known pinned pairings and refuses any other pin", async () => {
    const container = { ...c, pinDualVisualReview: true, visualReview: { request: vi.fn() }, analytics: { track: vi.fn() } } as unknown as Container;
    const v1 = await createDraft(container, null, "he");
    const v2 = await createDraft({ ...container, dualVisualReviewRelease: DUAL_VISUAL_REVIEW_V2 } as Container, null, "he");
    const none = await createDraft({ ...container, pinDualVisualReview: false } as Container, null, "he");
    expect(await dualVisualReviewVersion(db, v1.gameId)).toBe(DUAL_VISUAL_REVIEW_VERSION);
    expect(await dualVisualReviewVersion(db, v2.gameId)).toBe(DUAL_VISUAL_REVIEW_V2);
    expect(await dualVisualReviewVersion(db, none.gameId)).toBeNull();
    await db.auditLog.update({ where: { id: `aud_visual_policy_${v2.gameId}` }, data: { metaJson: JSON.stringify({ version: "local-patch-dual-high/v3" }) } });
    await expect(hasDualVisualReview(db, v2.gameId)).rejects.toThrow("refusing a fallback");
  });
  it("makes no purchase with missing credentials or a short worker deadline", async () => {
    const s = await dualSeed("dual-preflight");
    const before = await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId));
    await expect(reviewLocalPatchBoard(c, s, { fence: async () => {} })).rejects.toThrow("Configured visual review providers");
    expect(await reviewLocalPatchBoard(s.container, { ...s, deadlineAt: Date.now() + 500 }, { fence: async () => {} })).toMatchObject({ state: "pending" });
    expect(s.request).not.toHaveBeenCalled();
    expect(await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).toEqual(before);
  });
  it("retains timeout money and automatically schedules a new evidence question", async () => {
    const s = await dualSeed("dual-timeout");
    s.request.mockResolvedValueOnce(interruptedReply);
    expect((await s.run()).state).toBe("pending");
    const audit = await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId));
    expect(audit.unknownRequestKeys).toHaveLength(1); expect(audit.held).toBe(false);
    expect(audit.reservedMicroUsd).toBe(300_000);
    await s.run(); await s.run();
    expect(s.request).toHaveBeenCalledTimes(3);
    expect((await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).unknownRequestKeys).toEqual(audit.unknownRequestKeys);
  });
});

describe("v12 ready appearances have independent paid review and publication bindings", () => {
  it("reassesses an old refusal once without repainting or changing an approved sibling", async () => {
    const s = await seed("player-visible-calibration", 2);
    await review(s);
    const accepted = (await rows(s.gameId)).find(row => JSON.parse(row.judgeJson!).verdict)!;
    s.judge.mockImplementationOnce(async request => ({ verdict: null, verdicts: {},
      raw: JSON.stringify({ hides: request.hides.map(h => ({ hideId: h.hideId, evidenceIds: localPatchHideEvidenceIds(h.hideId),
        verdict: { ...good, neighborsIntact: "fail", pictureWhole: "fail", verdict: "fail", faults: [
          { check: "neighborsIntact", where: "A background bystander was cleanly removed, with no cut anatomy" },
          { check: "pictureWhole", where: "The original crowd count changed" },
        ] } })) }), model: "gpt-5.6-sol", requestId: "judge-original-refusal", usage: { prompt_tokens: 1000, completion_tokens: 400 },
      finishReason: "stop", wireFault: null, costUnknown: false }));
    await review(s);
    const failed = (await rows(s.gameId)).find(row => row.status === "FAILED")!;
    const originalReview = JSON.parse(failed.judgeJson!).boardReview;
    const oldCharge = await boardWizardBudgetOf(c).readRequest(boardWizardWorldId(s.gameId), originalReview.requestKey);
    playerMode = true;
    expect((await review(s)).state).toBe("pending"); // third hide still absent
    const after = await rows(s.gameId), recovered = after.find(row => row.id === failed.id)!;
    expect(after.find(row => row.id === accepted.id)).toEqual(accepted);
    expect(recovered).toMatchObject({ status: "GENERATED", attempts: failed.attempts, assetId: failed.assetId });
    const receipt = JSON.parse(recovered.judgeJson!);
    expect(receipt.boardReview).toMatchObject({ version: PLAYER_REVIEW_VERSION, assessmentMode: PLAYER_REVIEW_MODE });
    expect(receipt.boardReview.requestKey).not.toBe(originalReview.requestKey);
    expect(receipt.reviewHistory[0].boardReview).toEqual(originalReview);
    expect(await boardWizardBudgetOf(c).readRequest(boardWizardWorldId(s.gameId), originalReview.requestKey)).toEqual(oldCharge);
    expect(s.render).toHaveBeenCalledTimes(2);
    expect(s.judge).toHaveBeenCalledTimes(3);
    expect((await review(s))).toMatchObject({ state: "pending", costCents: 0, replayed: true });
    expect(s.judge).toHaveBeenCalledTimes(3);
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(2);
  }, 120000);
  it("still refuses a clear cut scalp under player calibration and never repeats that assessment", async () => {
    const s = await seed("player-visible-real-cut");
    playerMode = true;
    s.judge.mockImplementation(async request => ({ verdict: null, verdicts: {},
      raw: JSON.stringify({ hides: request.hides.map(h => ({ hideId: h.hideId, evidenceIds: localPatchHideEvidenceIds(h.hideId),
        verdict: { ...good, faceReadable: "fail", verdict: "fail", faults: [
          { check: "faceReadable", where: "A straight return edge visibly cuts the child's scalp in the AFTER player context" },
        ] } })) }), model: "gpt-5.6-sol", requestId: "judge-player-real-cut", usage: { prompt_tokens: 1000, completion_tokens: 400 },
      finishReason: "stop", wireFault: null, costUnknown: false }));
    expect((await review(s)).state).toBe("retry");
    const failed = (await rows(s.gameId))[0]!;
    expect(failed.status).toBe("FAILED");
    expect(JSON.parse(failed.judgeJson!).boardReview.assessmentMode).toBe(PLAYER_REVIEW_MODE);
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(0);
    await review(s);
    expect(s.judge).toHaveBeenCalledOnce(); expect(s.render).toHaveBeenCalledOnce();
  }, 120000);
  it("revalidates retained bytes before giving a rejected image its new assessment", async () => {
    const s = await seed("player-visible-mutated-image");
    s.judge.mockImplementationOnce(async request => ({ verdict: null, verdicts: {},
      raw: JSON.stringify({ hides: request.hides.map(h => ({ hideId: h.hideId, evidenceIds: localPatchHideEvidenceIds(h.hideId),
        verdict: { ...good, styleMatch: "fail", verdict: "fail", faults: [{ check: "styleMatch", where: "Slightly smoother portrait shading" }] } })) }),
      model: "gpt-5.6-sol", requestId: "judge-old-style", usage: { prompt_tokens: 1000, completion_tokens: 400 },
      finishReason: "stop", wireFault: null, costUnknown: false }));
    await review(s); playerMode = true;
    const failed = (await rows(s.gameId))[0]!, asset = await db.asset.findUniqueOrThrow({ where: { id: failed.assetId! } });
    await db.fileBlob.update({ where: { key: asset.storagePath }, data: { data: new Uint8Array(Buffer.from("changed pixels")) } });
    await expect(review(s)).rejects.toThrow("render-completion binding");
    expect(s.judge).toHaveBeenCalledOnce(); expect(s.render).toHaveBeenCalledOnce();
  }, 120000);
  it("automatically replaces a no-response review, preserving unknown billing, identical pixels and approved siblings", async () => {
    const s = await seed("incremental-transport", 3);
    await review(s);
    const before = await rows(s.gameId), protectedRow = before.find(row => JSON.parse(row.judgeJson!).verdict)!;
    const prepared = await prepareLocalPatchBoardReview(c, s, {}); if (!prepared.ready) throw Error("Fixture must be ready");
    const budget = prepared.budget, worldId = prepared.worldId, originalKey = prepared.requestKey;
    s.judge.mockImplementationOnce(async () => interruptedReply);
    expect((await review(s)).state).toBe("pending");
    const interrupted = (await rows(s.gameId)).find(row => JSON.parse(row.judgeJson!).reviewInterruption)!;
    expect(interrupted).toMatchObject({ status: "FAILED", assetId: before.find(row => row.id === interrupted.id)!.assetId, attempts: 1 });
    expect(await budget.audit(worldId)).toMatchObject({ held: false, reservedMicroUsd: 300_000, capMicroUsd: 4_000_000 });
    expect(await budget.readRequest(worldId, originalKey)).toMatchObject({ state: "unknown", reserveMicroUsd: 300_000 });
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(1);
    await review(s); // the never-reviewed sibling gets its first turn before evidence recovery
    expect((await review(s)).state).toBe("done");
    const after = await rows(s.gameId), recovered = after.find(row => row.id === interrupted.id)!;
    expect(after.find(row => row.id === protectedRow.id)).toEqual(protectedRow);
    expect(recovered).toMatchObject({ status: "GENERATED", assetId: interrupted.assetId, attempts: interrupted.attempts });
    const receipt = JSON.parse(recovered.judgeJson!);
    expect(receipt.boardReview).toMatchObject({ evidenceReviewAttempt: 2, effort: "medium" });
    expect(receipt.boardReview.requestKey).not.toBe(originalKey);
    expect(localPatchBoardJudgeImages(prepared.request)).toEqual(localPatchBoardJudgeImages(s.judge.mock.calls[3]![0]));
    expect(await budget.audit(worldId)).toMatchObject({ held: false, reservedMicroUsd: 300_000 });
    expect(await localPatchBudgetReadyForPublication(budget, worldId, 12)).toBe(true);
    expect(await localPatchBudgetReadyForPublication(budget, worldId, 11)).toBe(false);
    expect((await localPatchPrivateInventory(c, s.gameId)).retainedPurchaseKeys).toEqual(expect.arrayContaining([
      retainedPurchaseKey(worldId, originalKey), retainedPurchaseKey(worldId, receipt.boardReview.requestKey) ]));
    expect(s.render).toHaveBeenCalledTimes(3);
  }, 120000);
  it("replays recovery after a crash between its durable accounting and row transition without charging again", async () => {
    const s = await seed("incremental-transport-crash");
    const prepared = await prepareLocalPatchBoardReview(c, s, {}); if (!prepared.ready) throw Error("Fixture must be ready");
    const buy = vi.fn(async () => ({ bytes: Buffer.from(JSON.stringify(interruptedReply)), unknownReason: "Grouped review charge could not be verified" }));
    const operation = { worldId: prepared.worldId, requestKey: prepared.requestKey, scope: "judge" as const,
      operationFingerprint: prepared.fingerprint, reserveMicroUsd: 300_000, buy };
    const store = new LocalPatchRetainedPurchaseStore(c, s.gameId, prepared.budget);
    expect((await purchaseOnce({ ledger: prepared.budget, store }, operation)).kind).toBe("unresolved");
    const original = await prepared.budget.readRequest(prepared.worldId, prepared.requestKey);
    await expect(recoverPreparedLocalPatchReview(c, prepared, async () => { throw Error("Worker died after accounting"); })).rejects.toThrow("Worker died");
    expect(await recoverPreparedLocalPatchReview(c, prepared)).toBe(true);
    expect(await recoverPreparedLocalPatchReview(c, prepared)).toBe(false);
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: REVIEW_INTERRUPTION_POLICY } })).toBe(1);
    expect(await prepared.budget.readRequest(prepared.worldId, prepared.requestKey)).toEqual(original);
    expect((await purchaseOnce({ ledger: prepared.budget, store }, operation)).kind).toBe("unresolved");
    expect(buy).toHaveBeenCalledOnce();
    await review(s); expect(s.render).toHaveBeenCalledOnce();
  }, 120000);
  it.each([
    { wireFault: "http" as const }, { wireFault: "no-receipt" as const }, { raw: "unpriced usable answer" },
    { requestId: "req-with-missing-usage" }, { model: "gpt-5.6-sol" },
  ])("keeps an unpriced nontransport answer held without another purchase: %j", async override => {
    const s = await seed(`incremental-nontransport-${Object.values(override)[0]!.replaceAll(/[^a-z]/g, "")}`);
    s.judge.mockImplementationOnce(async () => ({ ...interruptedReply, ...override }));
    const before = await rows(s.gameId);
    expect((await review(s)).state).toBe("held");
    expect(await rows(s.gameId)).toEqual(before);
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: REVIEW_INTERRUPTION_POLICY } })).toBe(0);
    expect(await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).toMatchObject({ held: true, reservedMicroUsd: 300_000 });
    expect(s.render).toHaveBeenCalledOnce();
  }, 120000);
  it("does not resume a refunded game's unknown review", async () => {
    const s = await seed("incremental-transport-refunded");
    s.judge.mockImplementationOnce(async () => {
      await db.order.update({ where: { id: `ord-${s.gameId}` }, data: { paymentStatus: "REFUNDED", refundedAt: new Date() } });
      return interruptedReply;
    });
    expect((await review(s)).state).toBe("held");
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: REVIEW_INTERRUPTION_POLICY } })).toBe(0);
  }, 120000);
  it.each([false, true])("recovers a parked world without changing its frozen question (player calibration: %s)", async calibrated => {
    playerMode = calibrated;
    const s = await seed(`incremental-parked-budget-${calibrated}`), prepared = await prepareLocalPatchBoardReview(c, s, {}, { playerReview: calibrated });
    if (!prepared.ready) throw Error("Fixture must be ready");
    const priorSpend = 3_586_026 - (await prepared.budget.audit(prepared.worldId)).committedMicroUsd;
    await prepared.budget.reserve(prepared.worldId, { requestKey: "prior-work", scope: "image", operationFingerprint: "prior-work", reserveMicroUsd: priorSpend });
    await prepared.budget.settle(prepared.worldId, "prior-work", bill("prior-parked-budget", priorSpend));
    await purchaseOnce({ ledger: prepared.budget, store: new LocalPatchRetainedPurchaseStore(c, s.gameId, prepared.budget) }, {
      worldId: prepared.worldId, requestKey: prepared.requestKey, operationFingerprint: prepared.fingerprint, scope: "judge", reserveMicroUsd: 300_000,
      buy: async () => ({ bytes: Buffer.from(JSON.stringify(interruptedReply)), unknownReason: "Grouped review charge could not be verified" }) });
    await db.generationJob.update({ where: { id: `job_${s.gameId}` }, data: { status: "FAILED", currentStep: "local-patch:needs-release" } });
    const before = await prepared.budget.audit(prepared.worldId), result = await runLocalPatchWorldSlice(c, s.deps, s.gameId, { maxHides: 1, boardJudge: s.judge });
    expect(result).toMatchObject({ claimed: true, pending: true, attention: null });
    expect(await prepared.budget.audit(prepared.worldId)).toMatchObject({ held: false, committedMicroUsd: before.committedMicroUsd,
      settledMicroUsd: before.settledMicroUsd, reservedMicroUsd: 300_000, capMicroUsd: 5_000_000, remainingMicroUsd: 1_113_974 });
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${s.gameId}` } })).toMatchObject({ currentStep: "local-patch" });
    expect(s.judge).not.toHaveBeenCalled(); expect(s.render).toHaveBeenCalledOnce();
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(0);
    expect((await review(s)).state).toBe("pending"); expect(s.judge).toHaveBeenCalledOnce();
  }, 120000);
  it("never resumes an owner-stopped world, even with an interrupted paid review", async () => {
    const s = await seed("incremental-owner-stopped");
    const prepared = await prepareLocalPatchBoardReview(c, s, {});
    if (!prepared.ready) throw Error("Fixture must be ready");
    await purchaseOnce({ ledger: prepared.budget, store: new LocalPatchRetainedPurchaseStore(c, s.gameId, prepared.budget) }, {
      worldId: prepared.worldId, requestKey: prepared.requestKey, operationFingerprint: prepared.fingerprint, scope: "judge", reserveMicroUsd: 300_000,
      buy: async () => ({ bytes: Buffer.from(JSON.stringify(interruptedReply)), unknownReason: "Grouped review charge could not be verified" }) });
    await db.$transaction(async tx => {
      await tx.game.update({ where: { id: s.gameId }, data: { status: "CANCELLED", lastError: "generation-stopped-by-owner" } });
      await tx.generationJob.update({ where: { id: `job_${s.gameId}` }, data: { status: "DONE", currentStep: "owner-stopped", attempts: { increment: 1 } } });
    });
    const beforeRows = await rows(s.gameId), beforeBudget = await prepared.budget.audit(prepared.worldId);
    const beforeJob = await db.generationJob.findUniqueOrThrow({ where: { id: `job_${s.gameId}` } });
    playerMode = true;
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(await tickGeneration(c, s.gameId, 60_000)).toMatchObject({ status: "CANCELLED", pending: false });
      expect(await runLocalPatchWorldSlice(c, s.deps, s.gameId, { boardJudge: s.judge })).toMatchObject({ claimed: false, pending: false });
    }
    expect(await nextPendingGame(c)).not.toBe(s.gameId);
    expect(await rows(s.gameId)).toEqual(beforeRows);
    expect(await prepared.budget.audit(prepared.worldId)).toEqual(beforeBudget);
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: beforeJob.id } })).toEqual(beforeJob);
    expect(s.judge).not.toHaveBeenCalled(); expect(s.render).toHaveBeenCalledOnce();
  }, 120000);
  it("bounds no-response review continuations at two, waits out the outage between them, and never recycles keys or drops unknown charges", async () => {
    const s = await seed("incremental-transport-limit");
    s.judge.mockImplementation(async () => interruptedReply);
    expect((await review(s)).state).toBe("pending");
    expect((await review(s)).state).toBe("pending");
    // Two transport failures in a row: the same question waits out the outage
    // instead of a third purchase now; the wait changes no count or reservation.
    expect(await review(s)).toMatchObject({ state: "pending", costCents: 0 });
    expect(s.judge).toHaveBeenCalledTimes(2);
    const waiting = await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId));
    expect(waiting).toMatchObject({ held: false, reservedMicroUsd: 600_000 }); expect(waiting.unknownRequestKeys).toHaveLength(2);
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + LOCAL_PATCH_EVIDENCE_RETRY_BACKOFF_MS + 60_000);
    try { expect((await review(s)).state).toBe("held"); } finally { clock.mockRestore(); }
    expect(s.judge).toHaveBeenCalledTimes(3);
    const audit = await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId));
    expect(audit).toMatchObject({ held: true, reservedMicroUsd: 900_000, capMicroUsd: 4_000_000 });
    expect(audit.unknownRequestKeys).toHaveLength(3);
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: REVIEW_INTERRUPTION_POLICY } })).toBe(2);
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(0);
    expect(s.render).toHaveBeenCalledOnce();
  }, 120000);
  it("reviews one hide before either sibling exists and fits the retained run's 0.413974 dollar headroom", async () => {
    const s = await seed("incremental-headroom"), budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(s.gameId);
    const amount = 3_586_026 - (await budget.audit(worldId)).committedMicroUsd;
    await budget.reserve(worldId, { requestKey: "prior-real-work", scope: "judge", operationFingerprint: "retained-work", reserveMicroUsd: amount });
    await budget.settle(worldId, "prior-real-work", bill("prior-headroom", amount));
    const before = await rows(s.gameId);
    expect(await review(s)).toMatchObject({ state: "pending" });
    expect(s.judge).toHaveBeenCalledOnce();
    const request = s.judge.mock.calls[0]![0];
    expect(request.reviewScope).toBe("ready-only/v1"); expect(request.hides).toHaveLength(1);
    expect(localPatchBoardJudgeImages(request)).toHaveLength(8);
    const after = await rows(s.gameId);
    expect(after).toHaveLength(before.length); expect(after[0]!.assetId).toBe(before[0]!.assetId);
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(1);
    const key = JSON.parse(after[0]!.judgeJson!).boardReview.requestKey;
    expect(await budget.readRequest(worldId, key)).toMatchObject({ reserveMicroUsd: 300_000, state: "settled" });
    expect((await localPatchPrivateInventory(c, s.gameId)).retainedPurchaseKeys).toContain(retainedPurchaseKey(worldId, key));
    await review(s); expect(s.judge).toHaveBeenCalledOnce();
    expect((await db.game.findUniqueOrThrow({ where: { id: s.gameId } })).configJson).toBeNull();
  }, 120000);
  it("leaves unsupplied unapproved siblings byte-for-byte intact and completes only after all three pass", async () => {
    const s = await seed("incremental-siblings", 3), before = await rows(s.gameId);
    const first = await prepareLocalPatchBoardReview(c, s, {}); if (!first.ready) throw Error("Fixture must be ready");
    const selectedId = first.entries.find(e => e.hide.id === first.request.hides[0]!.hideId)!.row.id;
    expect((await review(s)).state).toBe("pending");
    const after = await rows(s.gameId);
    for (const row of before.filter(r => r.id !== selectedId)) expect(after.find(r => r.id === row.id)).toEqual(row);
    const approved = after.find(r => r.id === selectedId)!;
    expect((await review(s)).state).toBe("pending"); expect((await review(s)).state).toBe("done");
    expect((await rows(s.gameId)).find(r => r.id === selectedId)).toEqual(approved);
    await review(s); expect(s.judge).toHaveBeenCalledTimes(3);
  }, 120000);
  it("recovers malformed evidence with a new question about identical pixels and no new image", async () => {
    const s = await seed("incremental-schema");
    const pass = s.judge.getMockImplementation()!;
    s.judge.mockImplementationOnce(async request => ({ ...await pass(request), raw: "{bad json" }));
    expect((await review(s)).state).toBe("blocked");
    const failed = (await rows(s.gameId))[0]!, oldKey = JSON.parse(failed.judgeJson!).boardReview.requestKey;
    expect((await review(s)).state).toBe("pending");
    const recovered = (await rows(s.gameId))[0]!;
    expect(recovered).toMatchObject({ assetId: failed.assetId, attempts: failed.attempts, status: "GENERATED", lastError: null });
    expect(recovered.rectJson).toBe(failed.rectJson); expect(s.render).toHaveBeenCalledOnce();
    expect(JSON.parse(recovered.judgeJson!).boardReview).toMatchObject({ evidenceReviewAttempt: 2, effort: "medium" });
    expect(JSON.parse(recovered.judgeJson!).boardReview.requestKey).not.toBe(oldKey);
    expect(localPatchBoardJudgeImages(s.judge.mock.calls[0]![0])).toEqual(localPatchBoardJudgeImages(s.judge.mock.calls[1]![0]));
  }, 120000);
  it("replays an already-paid historical full question without another purchase or changed question", async () => {
    const s = await seed("incremental-old-question", 3);
    const old = await prepareLocalPatchBoardReview(c, s, {}, { recovery: true });
    if (!old.ready) throw Error("Historical full question must be ready");
    expect(old.request.hides).toHaveLength(3); expect(old.request.reviewScope).toBeUndefined();
    const reply = await s.judge(old.request), budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(s.gameId);
    if (!reply.model || !reply.requestId) throw Error("Historical fixture requires an authentic synthetic receipt");
    const evidence = { ...bill(reply.requestId), model: reply.model };
    await purchaseOnce({ ledger: budget, store: new LocalPatchRetainedPurchaseStore(c, s.gameId, budget) }, {
      worldId, requestKey: old.requestKey, operationFingerprint: old.fingerprint, scope: "judge", reserveMicroUsd: 500_000,
      buy: async () => ({ bytes: Buffer.from(JSON.stringify(reply)), evidence }),
    });
    s.judge.mockClear(); const before = await budget.audit(worldId);
    expect(await review(s)).toMatchObject({ state: "done", replayed: true });
    expect(s.judge).not.toHaveBeenCalled(); expect((await budget.audit(worldId)).settledMicroUsd).toBe(before.settledMicroUsd);
    for (const row of await rows(s.gameId)) expect(JSON.parse(row.judgeJson!).boardReview.requestKey).toBe(old.requestKey);
  }, 120000);
  it("replays the selected paid question even when an omitted unapproved sibling advances", async () => {
    const s = await seed("incremental-independent-key", 3), prepared = await prepareLocalPatchBoardReview(c, s, {});
    if (!prepared.ready) throw Error("Ready appearance required");
    const reply = await s.judge(prepared.request), budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(s.gameId);
    if (!reply.model || !reply.requestId) throw Error("Independent fixture requires an authentic synthetic receipt");
    const evidence = { ...bill(reply.requestId), model: reply.model };
    await purchaseOnce({ ledger: budget, store: new LocalPatchRetainedPurchaseStore(c, s.gameId, budget) }, {
      worldId, requestKey: prepared.requestKey, operationFingerprint: prepared.fingerprint, scope: "judge", reserveMicroUsd: 300_000,
      buy: async () => ({ bytes: Buffer.from(JSON.stringify(reply)), evidence }),
    });
    const sibling = prepared.entries.find(e => e.hide.id !== prepared.request.hides[0]!.hideId)!;
    await db.targetVariantAsset.update({ where: { id: sibling.row.id }, data: { attempts: 2 } });
    const next = await prepareLocalPatchBoardReview(c, s, {}); if (!next.ready) throw Error("Selected question must remain ready");
    expect(next.requestKey).toBe(prepared.requestKey); expect(next.fingerprint).toBe(prepared.fingerprint);
    s.judge.mockClear(); expect(await review(s)).toMatchObject({ state: "pending", replayed: true });
    expect(s.judge).not.toHaveBeenCalled();
    expect((await rows(s.gameId)).find(r => r.id === sibling.row.id)?.judgeJson).toBe(sibling.row.judgeJson);
  }, 120000);
  it("stops unreadable evidence after its stricter question fails twice and parks for a service decision, without starving other games or redrawing", async () => {
    const s = await seed("incremental-review-outage", 3);
    // Give all remaining appearances a completed status so only the malformed
    // judge response is runnable; they are never published by this fixture.
    for (const board of BOARDS.filter(b => b.board !== BOARD.board)) for (const hide of board.hides) {
      const target = await db.targetInstance.create({ data: { id: `ti-${s.gameId}-${hide.id}`, gameSceneId: `gsc-${s.gameId}-${board.board}`,
        targetId: hide.targetId, targetType: "child", slotAId: hide.id, slotBId: hide.id, status: "GENERATED" } });
      await db.targetVariantAsset.create({ data: { id: `tva-${s.gameId}-${hide.id}`, targetInstanceId: target.id,
        variant: "A", slotId: hide.id, status: "GENERATED", attempts: 1, provider: "local-patch",
        judgeJson: JSON.stringify({ compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION }) } });
      await db.gameScene.update({ where: { id: `gsc-${s.gameId}-${board.board}` }, data: { generationStatus: "GENERATED" } });
    }
    await review(s); await review(s);
    const passing = s.judge.getMockImplementation()!;
    s.judge.mockImplementation(async request => ({ ...await passing(request), raw: "{bad json" }));
    await review(s); await review(s); await review(s);
    const failed = (await rows(s.gameId)).find(r => r.status === "FAILED")!;
    const receipt = JSON.parse(failed.judgeJson!);
    // Round one asked the standard question; rounds two and three the stricter one.
    expect(receipt.evidenceAttempts.map((a: { attempt: number; kind: string; strategy: string }) => [a.attempt, a.kind, a.strategy])).toEqual([
      [1, "syntax", "standard/v1"], [2, "syntax", "strict-json/v1"], [3, "syntax", "strict-json/v1"]]);
    expect(receipt.evidenceDiagnosis).toMatchObject({ role: "quality", family: "format", next: "exhausted", rounds: 3 });
    expect(failed.lastError).toContain("evidence quality syntax, round 3, next exhausted");
    expect(localPatchEvidenceRecovery(failed)).toMatchObject({ retry: false, waiting: false, exhausted: true });
    const costs = (await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).settledMicroUsd;
    const noDraw = vi.fn(async () => { throw Error("A wire outage cannot authorize an image"); });
    const result = await runLocalPatchWorldSlice(c, { ...s.deps, render: noDraw }, s.gameId, { boardJudge: s.judge });
    expect(result).toMatchObject({ claimed: true, pending: false });
    expect(result.attention).toContain("no automatic evidence question left (quality syntax)");
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${s.gameId}` } })).toMatchObject({
      status: "FAILED", currentStep: LOCAL_PATCH_RECOVERY_EXHAUSTED });
    expect(await nextPendingGame(c)).not.toBe(s.gameId);
    // Parked, not polled: no later tick buys, waits or redraws for it.
    for (let tick = 0; tick < 2; tick++) expect(await runLocalPatchWorldSlice(c, { ...s.deps, render: noDraw }, s.gameId, { boardJudge: s.judge }))
      .toMatchObject({ claimed: false, pending: false, attention: result.attention });
    expect((await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).settledMicroUsd).toBe(costs);
    expect(s.judge).toHaveBeenCalledTimes(5); expect(noDraw).not.toHaveBeenCalled();
    const kept = await db.targetVariantAsset.findUniqueOrThrow({ where: { id: failed.id } });
    expect(kept).toMatchObject({ assetId: failed.assetId, attempts: failed.attempts, status: "FAILED" });
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(2);
    expect(preparationState({ status: "TARGETS_GENERATING", updatedAt: new Date(),
      job: await db.generationJob.findUniqueOrThrow({ where: { id: `job_${s.gameId}` } }), automaticRecovery: true })).toBe("attention");
  }, 120000);
});

describe("Codex independent incident recovery", () => {
  it.each([4, 9])("re-reads a paid legacy answer at exhausted round %i without a new purchase", async round => {
    const s = await dualSeed(`codex-legacy-round-${round}`, hideId => longAnswer(hideId, 2169, 2232, 655));
    await s.run(); await s.run();
    const legacy = await asDeployedReaderRefusal(db, s.gameId, (await rows(s.gameId))[0]!);
    const receipt = JSON.parse(legacy.judgeJson!);
    // The deployed loop could reach nine. Both persisted counters belong to
    // that historical round, before the corrected reader was introduced.
    receipt.boardReview.evidenceReviewAttempt = round;
    receipt.boardReview.dual.continuity.attempt = round;
    await db.targetVariantAsset.update({ where: { id: legacy.id }, data: { judgeJson: JSON.stringify(receipt) } });
    const exhausted = (await rows(s.gameId))[0]!;
    expect(localPatchEvidenceRecovery(exhausted)).toMatchObject({ retry: false, exhausted: true });
    const worldId = boardWizardWorldId(s.gameId);
    const ledger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } });
    const calls = s.request.mock.calls.length;
    await expect(reviewLocalPatchBoard(s.container, s, { fence: async () => {} }, { decideRetained: true }))
      .resolves.toMatchObject({ decidedRetained: true, costCents: 0, replayed: true });
    expect((await rows(s.gameId))[0]).toMatchObject({ status: "GENERATED", lastError: null });
    expect(s.request.mock.calls.length).toBe(calls);
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } })).toEqual(ledger);
  });

  const decideRetained = (s: Awaited<ReturnType<typeof dualSeed>>) =>
    reviewLocalPatchBoard(s.container, s, { fence: async () => {} }, { decideRetained: true });
  it.each([1, 3, 4, 9])("publishes a complete answer refused at evidence round %i once, keeping its counters, paid bytes and ledger", async round => {
    const s = await dualSeed(`retained-round-pass-${round}`, hideId => longAnswer(hideId, 2169, 2232, 655));
    await s.run(); await s.run();
    const refused = await atEvidenceRound(db, await asDeployedReaderRefusal(db, s.gameId, (await rows(s.gameId))[0]!), round);
    const original = JSON.parse(refused.judgeJson!).boardReview;
    const worldId = boardWizardWorldId(s.gameId), ledger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } });
    const calls = s.request.mock.calls.length;
    expect(await decideRetained(s)).toMatchObject({ decidedRetained: true, costCents: 0, replayed: true });
    const row = (await rows(s.gameId))[0]!, receipt = JSON.parse(row.judgeJson!);
    // One picture throughout: evidence rounds are not image attempts.
    expect(row).toMatchObject({ status: "GENERATED", lastError: null, attempts: 1, assetId: refused.assetId });
    expect(receipt.boardReview.evidenceReviewAttempt).toBe(round);
    expect(receipt.boardReview.dual.continuity).toMatchObject({ attempt: round, raw: original.dual.continuity.raw });
    expect(receipt.boardReview.dual.quality.raw).toBe(original.dual.quality.raw);
    expect(receipt.reviewHistory.at(-1).boardReview).toEqual(original);
    expect(await publishable(s.gameId, row)).toBe(true);
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(1);
    expect(s.request.mock.calls.length).toBe(calls); expect(s.render).toHaveBeenCalledTimes(1);
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } })).toEqual(ledger);
    // Decided once: a repeat finds nothing to read and writes nothing.
    expect(await decideRetained(s)).toMatchObject({ state: "pending", costCents: 0 });
    expect(await rows(s.gameId)).toEqual([row]);
  });
  it.each([1, 3, 4, 9])("keeps a defect written late in an answer refused at round %i as a repair decision, never an approval", async round => {
    const s = await dualSeed(`retained-round-defect-${round}`, hideId => longAnswer(hideId, 2169, 2232, 655,
      { faults: [{ kind: "hard-cut", where: prose(700, "A straight top join slices the vendor's forehead") }] }));
    await s.run(); await s.run();
    const refused = await atEvidenceRound(db, await asDeployedReaderRefusal(db, s.gameId, (await rows(s.gameId))[0]!), round);
    const worldId = boardWizardWorldId(s.gameId), ledger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } });
    const calls = s.request.mock.calls.length;
    expect(await decideRetained(s)).toMatchObject({ state: "retry", decidedRetained: true, costCents: 0, replayed: true });
    const row = (await rows(s.gameId))[0]!, receipt = JSON.parse(row.judgeJson!);
    expect(row).toMatchObject({ status: "FAILED", attempts: 1, assetId: refused.assetId });
    expect(row.lastError).toMatch(/^quality-retry: .*pictureWhole/);
    expect(receipt.verdict.pictureWhole).toBe("fail");
    expect(receipt.verdict.faults.some((f: { check: string; where: string }) => f.check === "pictureWhole" && f.where.startsWith("A straight top join"))).toBe(true);
    expect(receipt.boardReview.dual.continuity.reading).toMatchObject({ disposition: "repair", reason: "defect" });
    expect(receipt.boardReview.evidenceReviewAttempt).toBe(round);
    // The bounded image route takes it from here; no evidence question is left open.
    expect(localPatchEvidenceRecovery(row)).toBeNull();
    expect(await publishable(s.gameId, row)).toBe(false);
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(0);
    expect(s.request.mock.calls.length).toBe(calls); expect(s.render).toHaveBeenCalledTimes(1);
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } })).toEqual(ledger);
    expect(await decideRetained(s)).toMatchObject({ state: "pending", costCents: 0 });
    expect(await rows(s.gameId)).toEqual([row]);
  });
  it.each(["refunded", "stopped", "deleted", "tampered"] as const)("still refuses a %s world or evidence at round nine", async kind => {
    const s = await dualSeed(`retained-round-nine-${kind}`, hideId => longAnswer(hideId, 1817, 1602, 779));
    await s.run(); await s.run();
    const legacy = await atEvidenceRound(db, await asDeployedReaderRefusal(db, s.gameId, (await rows(s.gameId))[0]!), 9);
    const worldId = boardWizardWorldId(s.gameId), ledger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } });
    if (kind === "refunded") await db.order.update({ where: { id: `ord-${s.gameId}` }, data: { paymentStatus: "REFUNDED", refundedAt: new Date() } });
    if (kind === "stopped") await db.game.update({ where: { id: s.gameId }, data: { status: "CANCELLED" } });
    if (kind === "deleted") await db.game.update({ where: { id: s.gameId }, data: { status: "DELETED", deletedAt: new Date() } });
    if (kind === "tampered") {
      const receipt = JSON.parse(legacy.judgeJson!); receipt.boardReview.dual.continuity.costMicroUsd += 1;
      await db.targetVariantAsset.update({ where: { id: legacy.id }, data: { judgeJson: JSON.stringify(receipt) } });
    }
    const before = await rows(s.gameId);
    const attempt = decideRetained(s);
    if (kind === "stopped" || kind === "deleted") await expect(attempt).rejects.toThrow();
    else expect(await attempt).toMatchObject({ state: "pending", costCents: 0 });
    expect(await rows(s.gameId)).toEqual(before);
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } })).toEqual(ledger);
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(0);
    expect(s.request).toHaveBeenCalledTimes(2);
  });
});

describe("Codex independent recovery deadline", () => {
  it("yields remaining free re-reads after its hard deadline instead of starting another board reconstruction", async () => {
    const s = await dualSeed("codex-free-deadline", hideId => longAnswer(hideId, 1013, 954, 466), { count: 2 });
    for (let question = 0; question < 4; question++) await s.run();
    for (const row of await rows(s.gameId)) await asDeployedReaderRefusal(db, s.gameId, row);
    const start = Date.now(), deadline = start + 270_000;
    let clock = start, artReads = 0;
    const now = vi.spyOn(Date, "now").mockImplementation(() => clock);
    const { readShippedBoardArt } = await import("../local-patch-hide");
    try {
      await runLocalPatchWorldSlice(s.container, { ...s.deps, readBoardArt: async (art, hash) => {
        artReads++;
        const bytes = await readShippedBoardArt(art, hash);
        // The first expensive reconstruction consumes the request's remaining
        // time. Its atomic decision may finish, but another one must not start.
        clock = deadline + 1;
        return bytes;
      } }, s.gameId, { hardDeadlineAt: deadline, maxHides: 1 });
      const decided = (await rows(s.gameId)).filter(row => JSON.parse(row.judgeJson!).boardReview?.dual?.continuity?.reading);
      expect(artReads).toBeGreaterThan(0);
      expect(decided.length).toBeLessThanOrEqual(1);
    } finally { now.mockRestore(); }
  }, 120_000);

  it("finishes the free work on the next tick after yielding at the deadline: no purchase, duplicate decision or parked world", async () => {
    const s = await dualSeed("free-deadline-resume", hideId => longAnswer(hideId, 1013, 954, 466), { count: 2 });
    for (let question = 0; question < 4; question++) await s.run();
    for (const row of await rows(s.gameId)) await asDeployedReaderRefusal(db, s.gameId, row);
    const worldId = boardWizardWorldId(s.gameId), ledger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } });
    const calls = s.request.mock.calls.length, paints = s.render.mock.calls.length;
    const { readShippedBoardArt } = await import("../local-patch-hide");
    /** One tick whose first reconstruction leaves `left` milliseconds before its hard deadline. */
    const tick = async (left: number) => {
      const start = Date.now(), deadline = start + 270_000;
      let clock = start;
      const now = vi.spyOn(Date, "now").mockImplementation(() => clock);
      try {
        return await runLocalPatchWorldSlice(s.container, { ...s.deps, readBoardArt: async (art, hash) => {
          const bytes = await readShippedBoardArt(art, hash); clock = deadline - left; return bytes;
        } }, s.gameId, { hardDeadlineAt: deadline, maxHides: 1 });
      } finally { now.mockRestore(); }
    };
    const decided = async () => (await rows(s.gameId)).filter(row => JSON.parse(row.judgeJson!).boardReview?.dual?.continuity?.reading);
    // Out of time after one decision: the other waits, the claim is handed back.
    expect(await tick(-1)).toMatchObject({ claimed: true, pending: true, attention: null });
    expect(await decided()).toHaveLength(1);
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${s.gameId}` } }))
      .toMatchObject({ status: "QUEUED", currentStep: "local-patch", lastError: null });
    // The next tick decides the other one first. Too little time remains after it
    // for anything paid (a picture needs 240 s), so nothing else is bought.
    expect(await tick(100_000)).toMatchObject({ claimed: true, pending: true, attention: null });
    const all = await rows(s.gameId);
    expect(await decided()).toHaveLength(2);
    expect(all.every(row => row.status === "GENERATED" && JSON.parse(row.judgeJson!).reviewHistory.length === 1)).toBe(true);
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(2);
    expect(s.request.mock.calls.length).toBe(calls); expect(s.render.mock.calls.length).toBe(paints);
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } })).toEqual(ledger);
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${s.gameId}` } }))
      .toMatchObject({ status: "QUEUED", currentStep: "local-patch" });
  }, 120_000);
});

describe("Codex independent quality evidence classification", () => {
  it("classifies an oversized otherwise valid Opus observation as size, so the next question actually shortens it", async () => {
    const s = await dualSeed("codex-opus-length");
    const original = s.request.getMockImplementation()!;
    s.request.mockImplementation(async (question, timeoutMs) => {
      const answer = await original(question, timeoutMs);
      if (question.role !== "scene-quality") return answer;
      const parsed = JSON.parse(answer.raw!.trim().replace(/^```(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n```$/i, "$1"));
      parsed.hides[0].verdict.integrationEvidence.style = prose(850, "Consistent illustration and local contours");
      return { ...answer, raw: JSON.stringify(parsed) };
    });
    await s.run();
    const row = (await rows(s.gameId))[0]!;
    expect(localPatchEvidenceRecovery(row)).toMatchObject({ retry: true, role: "quality", strategy: "compact/v1" });
    expect(s.request).toHaveBeenCalledTimes(1);
    expect(s.render).toHaveBeenCalledTimes(1);
  });

  /** Opus's answer to its `call`-th question: the standard passing verdict, changed by `edit`. */
  type Verdict = { integrationEvidence: Record<string, string>; boundaryIntegrity: Record<string, { status: string; observation: string }> } & Record<string, unknown>;
  const opusSays = (s: Awaited<ReturnType<typeof dualSeed>>, edit: (verdict: Verdict, call: number) => void) => {
    const original = s.request.getMockImplementation()!;
    let calls = 0;
    s.request.mockImplementation(async (question, timeoutMs) => {
      const answer = await original(question, timeoutMs);
      if (question.role !== "scene-quality") return answer;
      const parsed = JSON.parse(answer.raw!.trim().replace(/^```(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n```$/i, "$1"));
      edit(parsed.hides[0].verdict, ++calls);
      return { ...answer, raw: "```json\n" + JSON.stringify(parsed) + "\n```" };
    });
  };
  const qualityPrompts = (s: Awaited<ReturnType<typeof dualSeed>>) => s.request.mock.calls.filter(([q]) => q.role === "scene-quality").map(([q]) => q.prompt);
  it.each([
    ["integrationEvidence.style", (v: Verdict) => { v.integrationEvidence.style = prose(850, "Consistent illustration and local contours"); }],
    ["integrationEvidence.lighting", (v: Verdict) => { v.integrationEvidence.lighting = prose(850, "Warm daylight from the upper left on face and jacket"); }],
    ["integrationEvidence.neighbors", (v: Verdict) => { v.integrationEvidence.neighbors = prose(850, "Every neighbour keeps one head joined to its own body"); }],
    ["boundaryIntegrity.left.observation", (v: Verdict) => { v.boundaryIntegrity.left!.observation = prose(850, "Heads, bodies and supports continue across this join"); }],
  ])("names an over-long %s as a size fault at its path and asks the compact question next", async (path, edit) => {
    const s = await dualSeed(`quality-length-${path.replaceAll(".", "-").toLowerCase()}`);
    opusSays(s, edit);
    expect((await s.run()).state).toBe("blocked");
    const row = (await rows(s.gameId))[0]!, receipt = JSON.parse(row.judgeJson!);
    expect(receipt.evidenceAttempts).toMatchObject([{ attempt: 1, role: "quality", kind: "length", path: `hides.0.verdict.${path}`, strategy: "standard/v1" }]);
    expect(receipt.boardReview.dual.quality.readFault).toEqual({ code: "length", path: `hides.0.verdict.${path}` });
    expect(receipt.evidenceDiagnosis).toMatchObject({ role: "quality", family: "size", kind: "length", next: "compact/v1" });
    expect(localPatchEvidenceRecovery(row)).toMatchObject({ retry: true, role: "quality", strategy: "compact/v1" });
    // Codes and paths only: the row's error carries none of the reviewer's text.
    expect(row.lastError).toContain(`evidence quality length at hides.0.verdict.${path}, round 1, next compact/v1`);
    expect(row.lastError).not.toContain("Consistent illustration");
    expect(s.request).toHaveBeenCalledTimes(1); expect(s.render).toHaveBeenCalledTimes(1);
  });
  it("keeps a defect located after long evidence: over its bound it is a size fault, and the compact answer is read as the repair it reports", async () => {
    const s = await dualSeed("quality-long-location");
    opusSays(s, (v, call) => {
      v.integrationEvidence = { style: prose(590, "Same inked contours and painted fabric as the neighbours"),
        lighting: prose(590, "Warm daylight from the upper left with a soft cast shadow"), neighbors: prose(590, "Every neighbour keeps a coherent head, neck and hands") };
      v.pictureWhole = "fail"; v.verdict = "fail";
      v.faults = [{ check: "pictureWhole", where: prose(call === 1 ? 700 : 241, "Left of the child a disc on a bar hangs in the air with no hand holding it") }];
    });
    expect((await s.run()).state).toBe("blocked");
    expect(JSON.parse((await rows(s.gameId))[0]!.judgeJson!).evidenceAttempts).toMatchObject([{ kind: "length", path: "hides.0.verdict.faults.0.where" }]);
    expect((await s.run()).state).toBe("retry");
    const prompts = qualityPrompts(s);
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).not.toContain("SIZE RECOVERY");
    expect(prompts[1]).toContain("SIZE RECOVERY"); expect(prompts[1]).toContain("one located fault per failed check"); expect(prompts[1]).not.toContain("FORMAT RECOVERY");
    const row = (await rows(s.gameId))[0]!, receipt = JSON.parse(row.judgeJson!);
    expect(row).toMatchObject({ status: "FAILED", attempts: 1 }); expect(row.lastError).toMatch(/^quality-retry: pictureWhole/);
    expect(receipt.verdict.faults).toHaveLength(1);
    expect(receipt.verdict.faults[0].where.startsWith("Left of the child a disc on a bar")).toBe(true);
    // A failed quality answer needs no anatomy question, and no new image was bought here.
    expect(s.request.mock.calls.map(([q]) => q.role)).toEqual(["scene-quality", "scene-quality"]);
    expect(s.render).toHaveBeenCalledTimes(1);
    expect(await db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(0);
  });
  it("retires the compact question after it fails twice: three Opus questions in all, no image, nothing held", async () => {
    const s = await dualSeed("quality-length-exhausted");
    opusSays(s, v => { v.integrationEvidence.style = prose(850, "Consistent illustration and local contours"); });
    for (let tick = 0; tick < 5; tick++) await s.run();
    const prompts = qualityPrompts(s);
    expect(s.request.mock.calls.map(([q]) => q.role)).toEqual(["scene-quality", "scene-quality", "scene-quality"]);
    expect(prompts[0]).not.toContain("SIZE RECOVERY"); expect(prompts.slice(1).every(prompt => prompt.includes("SIZE RECOVERY"))).toBe(true);
    const row = (await rows(s.gameId))[0]!, receipt = JSON.parse(row.judgeJson!);
    expect(receipt.evidenceAttempts.map((a: { attempt: number; role: string; kind: string; strategy: string }) => [a.attempt, a.role, a.kind, a.strategy]))
      .toEqual([[1, "quality", "length", "standard/v1"], [2, "quality", "length", "compact/v1"], [3, "quality", "length", "compact/v1"]]);
    expect(receipt.evidenceDiagnosis).toMatchObject({ role: "quality", family: "size", next: "exhausted" });
    expect(localPatchEvidenceRecovery(row)).toMatchObject({ retry: false, exhausted: true });
    expect(row).toMatchObject({ status: "FAILED", attempts: 1 }); expect(s.render).toHaveBeenCalledTimes(1);
    expect(await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).toMatchObject({ reservedMicroUsd: 0, pendingRequestKeys: [], unknownRequestKeys: [] });
  });
});

describe("a named quality reader decides a refused Opus answer for free, never into an approval", () => {
  type Seeded = Awaited<ReturnType<typeof dualSeed>>;
  const decide = (s: Seeded) => reviewLocalPatchBoard(s.container, s, { fence: async () => {} }, { decideRetained: true });
  /** Opus answers its `call`-th scene-quality question with `raw`; Sol keeps its own answers. */
  const opusRaw = (s: Seeded, raw: (hideId: string, call: number) => string) => {
    const original = s.request.getMockImplementation()!;
    let calls = 0;
    s.request.mockImplementation(async (question, timeoutMs) => {
      const answer = await original(question, timeoutMs);
      if (question.role !== "scene-quality") return answer;
      const asked = (JSON.parse(/Immutable candidate binding: (\{.*?\})\. Evidence attempt/.exec(question.prompt)![1]!) as { hideId: string }).hideId;
      return { ...answer, raw: raw(asked, ++calls) };
    });
  };
  const ledgerOf = (s: Seeded) => db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: boardWizardWorldId(s.gameId) } });
  const published = (s: Seeded) => db.auditLog.count({ where: { entityId: s.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } });

  it("reads a fresh 390-character answer as the repair it reports: one Opus question, no anatomy question", async () => {
    const s = await dualSeed("quality-390-fresh");
    opusRaw(s, hideId => located390Answer(hideId));
    expect((await s.run()).state).toBe("retry");
    const row = (await rows(s.gameId))[0]!, receipt = JSON.parse(row.judgeJson!);
    expect(row).toMatchObject({ status: "FAILED", attempts: 1 }); expect(row.lastError).toMatch(/^quality-retry: pictureWhole/);
    expect(receipt.boardReview.dual.quality.reader).toBe(CURRENT_QUALITY_READER);
    expect(receipt.boardReview.dual.continuity).toBeNull();
    expect(receipt.verdict.faults[0].where).toHaveLength(LOCATED_390.where);
    expect(localPatchEvidenceRecovery(row)).toBeNull();
    expect(s.request.mock.calls.map(([q]) => q.role)).toEqual(["scene-quality"]);
    expect(s.render).toHaveBeenCalledTimes(1); expect(await published(s)).toBe(0);
  });

  it.each([1, 9])("decides the retained 390-character refusal at round %i as a repair for free, keeping the whole paid answer", async round => {
    const s = await dualSeed(`quality-390-retained-${round}`);
    opusRaw(s, hideId => located390Answer(hideId));
    await s.run();
    const deployed = await atEvidenceRound(db, await asDeployedQualityRefusal(db, s.gameId, (await rows(s.gameId))[0]!), round);
    const original = JSON.parse(deployed.judgeJson!).boardReview;
    expect(original.dual.continuity).toBeNull(); expect(original.dual.quality).not.toHaveProperty("reader");
    expect(localPatchRetainedAnswerUndecided(deployed)).toBe(true);
    const ledger = await ledgerOf(s), calls = s.request.mock.calls.length;
    expect(await decide(s)).toMatchObject({ state: "retry", decidedRetained: true, costCents: 0, replayed: true });
    const row = (await rows(s.gameId))[0]!, receipt = JSON.parse(row.judgeJson!);
    expect(row).toMatchObject({ status: "FAILED", attempts: 1, assetId: deployed.assetId }); expect(row.lastError).toMatch(/^quality-retry: pictureWhole/);
    // The paid answer is kept whole; the verdict's location is all 390 characters of it.
    expect(receipt.boardReview.dual.quality.raw).toBe(original.dual.quality.raw);
    expect(receipt.boardReview.dual.quality).not.toHaveProperty("reader");
    expect(receipt.verdict.pictureWhole).toBe("fail"); expect(receipt.verdict.faults).toHaveLength(1);
    expect(receipt.verdict.faults[0].where).toBe(located390Verdict().faults[0]!.where);
    expect(receipt.verdict.faults[0].where.startsWith(LOCATED_390_DEFECT)).toBe(true);
    expect(receipt.boardReview.dual.quality.reading).toMatchObject({ version: "quality-reading/v1", reader: CURRENT_QUALITY_READER,
      previousReader: QUALITY_READER_STRICT, disposition: "retry", sourceRequestKey: original.dual.quality.requestKey,
      sourceFingerprint: original.dual.quality.fingerprint, rawSha256: sha256Bytes(Buffer.from(original.dual.quality.raw)) });
    expect(receipt.boardReview.evidenceReviewAttempt).toBe(round); expect(receipt.reviewHistory.at(-1).boardReview).toEqual(original);
    // An Opus failure needs no anatomy reviewer: nothing is asked, bought or published.
    expect(receipt.boardReview.dual.continuity).toBeNull();
    expect(s.request.mock.calls.length).toBe(calls); expect(s.render).toHaveBeenCalledTimes(1);
    expect(await ledgerOf(s)).toEqual(ledger);
    expect(localPatchEvidenceRecovery(row)).toBeNull();
    expect(await publishable(s.gameId, row)).toBe(false); expect(await published(s)).toBe(0);
    expect(await decide(s)).toMatchObject({ state: "pending", costCents: 0 });
    expect(await rows(s.gameId)).toEqual([row]);
  });

  it("names a historical refusal above the new bound exactly, for free, and leaves the shortening to one paid compact question", async () => {
    const s = await dualSeed("quality-700-retained");
    const failing = (where: string) => ({ ...located390Verdict(), faults: [{ check: "pictureWhole", where }] });
    opusRaw(s, (hideId, call) => located390Answer(hideId, failing(prose(call === 1 ? 700 : 241, `${LOCATED_390_DEFECT}.`))));
    expect((await s.run()).state).toBe("blocked");
    const deployed = await asDeployedQualityRefusal(db, s.gameId, (await rows(s.gameId))[0]!);
    expect(localPatchRetainedAnswerUndecided(deployed)).toBe(true);
    const ledger = await ledgerOf(s), calls = s.request.mock.calls.length;
    expect(await decide(s)).toMatchObject({ state: "blocked", decidedRetained: true, costCents: 0 });
    let row = (await rows(s.gameId))[0]!;
    const receipt = JSON.parse(row.judgeJson!);
    expect(receipt.boardReview.dual.quality.readFault).toEqual({ code: "length", path: "hides.0.verdict.faults.0.where" });
    expect(receipt.boardReview.dual.quality.reading).toMatchObject({ reader: CURRENT_QUALITY_READER, previousReader: QUALITY_READER_STRICT, disposition: "unresolved" });
    expect(receipt.evidenceAttempts).toMatchObject([{ attempt: 1, role: "quality", kind: "length", path: "hides.0.verdict.faults.0.where", strategy: "standard/v1" }]);
    expect(localPatchEvidenceRecovery(row)).toMatchObject({ retry: true, role: "quality", strategy: "compact/v1" });
    expect(localPatchRetainedAnswerUndecided(row)).toBe(false);
    expect(s.request.mock.calls.length).toBe(calls); expect(await ledgerOf(s)).toEqual(ledger);
    // The next PAID question asks for shorter text; its answer is read as the repair it reports.
    expect((await s.run()).state).toBe("retry");
    const prompts = s.request.mock.calls.filter(([q]) => q.role === "scene-quality").map(([q]) => q.prompt);
    expect(prompts).toHaveLength(2); expect(prompts[1]).toContain("SIZE RECOVERY");
    row = (await rows(s.gameId))[0]!;
    expect(row.lastError).toMatch(/^quality-retry: pictureWhole/); expect(s.render).toHaveBeenCalledTimes(1); expect(await published(s)).toBe(0);
  });

  it("leaves a refusal the current reader would pass to the paid route: an approval is never decided for free", () => {
    const policy = visualReviewPolicy("scene-quality", "high"), hideId = BOARD.hides[0]!.id, image = "a".repeat(64);
    const rowFor = (raw: string) => ({ status: "FAILED", lastError: "quality-unresolved: integration-review-unreadable", judgeJson: JSON.stringify({
      reviewState: "board-review-complete", judgedSha256: image, verdict: null, wireFault: "schema",
      boardReview: { version: DUAL_VISUAL_REVIEW_VERSION, dual: { version: DUAL_VISUAL_REVIEW_VERSION, hideId, imageSha256: image,
        geometrySha256: "b".repeat(64), identitySha256: "c".repeat(64), continuity: null,
        quality: { requestKey: `self-repair:board:giza:${"d".repeat(64)}`, fingerprint: "d".repeat(64), attempt: 1, policy, raw,
          model: policy.model, finishReason: "end_turn", wireFault: null, costMicroUsd: 18_000 } } } }) });
    expect(localPatchRetainedAnswerUndecided(rowFor(located390Answer(hideId)))).toBe(true);
    const passing = "```json\n" + JSON.stringify({ hides: [{ hideId, evidenceIds: localPatchHideEvidenceIds(hideId), verdict: good }] }) + "\n```";
    expect(localPatchRetainedAnswerUndecided(rowFor(passing))).toBe(false);
  });

  it("publishes only under the reader each answer names: a forged, stale or conflicting quality reading authorizes nothing", async () => {
    const s = await dualSeed("quality-reader-publication");
    await s.run(); await s.run();
    const row = (await rows(s.gameId))[0]!, receipt = JSON.parse(row.judgeJson!);
    expect(row.status).toBe("GENERATED"); expect(receipt.boardReview.dual.quality.reader).toBe(CURRENT_QUALITY_READER);
    expect(await publishable(s.gameId, row)).toBe(true);
    const q = receipt.boardReview.dual.quality, { reader: _reader, ...strictStage } = q;
    const reading = { version: "quality-reading/v1", reader: QUALITY_READER_LOCATED, previousReader: QUALITY_READER_STRICT, sourceRequestKey: q.requestKey,
      sourceFingerprint: q.fingerprint, rawSha256: sha256Bytes(Buffer.from(q.raw)), disposition: "acceptable", readAt: new Date().toISOString() };
    const withQuality = (stage: unknown) => JSON.stringify({ ...receipt, boardReview: { ...receipt.boardReview, dual: { ...receipt.boardReview.dual, quality: stage } } });
    // Strictly, or through a self-consistent re-reading, this passing answer reads the same; nothing new is authorized.
    expect(await publishable(s.gameId, row, withQuality(strictStage))).toBe(true);
    expect(await publishable(s.gameId, row, withQuality({ ...strictStage, reading }))).toBe(true);
    for (const forged of [
      { ...q, reader: "quality-read/v0-lenient" },
      { ...strictStage, reading: { ...reading, reader: "quality-read/v0-lenient" } },
      { ...strictStage, reading: { ...reading, rawSha256: "0".repeat(64) } },
      { ...strictStage, reading: { ...reading, sourceFingerprint: "f".repeat(64) } },
      { ...strictStage, reading: { ...reading, sourceRequestKey: `self-repair:board:giza:${"f".repeat(64)}` } },
      { ...strictStage, reading: { ...reading, disposition: "retry" } },
      { ...strictStage, reading: { ...reading, reader: QUALITY_READER_STRICT } },
      { ...q, reading },
    ]) expect(await publishable(s.gameId, row, withQuality(forged))).toBe(false);
  });
});

describe("dual release v3: object joins", () => {
  const raw = async (png: Buffer) => sharp(png).removeAlpha().raw().toBuffer();
  it("asks Opus about each join magnified from the same registered pixels, keeps v1's continuity question, and publishes under its own pin", async () => {
    const v3 = await dualSeed("dual-v3-joins", "pass", { release: DUAL_VISUAL_REVIEW_V3 });
    const v1 = await dualSeed("dual-v1-plain", "pass", { release: DUAL_VISUAL_REVIEW_VERSION });
    for (const s of [v3, v1]) { await s.run(); await s.run(); }
    const [q3, a3] = v3.request.mock.calls.map(call => call[0]), [q1, a1] = v1.request.mock.calls.map(call => call[0]);
    expect([q3!.role, a3!.role, q1!.role, a1!.role]).toEqual(["scene-quality", "head-continuity", "scene-quality", "head-continuity"]);
    expect(q1!.images).toHaveLength(8); expect(q3!.images).toHaveLength(12);
    expect(q3!.labels.slice(0, 8).map(l => l.replaceAll(v3.gameId, ""))).toEqual(q1!.labels.map(l => l.replaceAll(v1.gameId, "")));
    expect(q3!.labels.slice(8).every(l => l.includes("ROLE=JOIN_DETAIL"))).toBe(true);
    expect(q3!.prompt).toContain(objectJoinInstructions); expect(q1!.prompt).not.toContain("OBJECT JOINS");
    // The joins are cut from the very pixels and window of the other evidence: the authored mask plus the 120 px guard.
    const hide = BOARD.hides[0]!, crop = cropOf(hide), mask = maskForHide(hide), before = q3!.images[2]!, meta = await sharp(before).metadata();
    const after = await sharp(q3!.images[3]!).extract({ left: 0, top: 0, width: meta.width!, height: meta.height! }).png().toBuffer();
    const ctx = { left: Math.max(0, crop.left - 192), top: Math.max(0, crop.top - 192) }, l = Math.max(0, mask.left - 120), t = Math.max(0, mask.top - 120);
    const window = { left: crop.left - ctx.left + l, top: crop.top - ctx.top + t,
      width: Math.min(crop.width, mask.left + mask.width + 120) - l, height: Math.min(crop.height, mask.top + mask.height + 120) - t };
    const expected = await prepareJoinDetails(before, after, window);
    for (const [i, detail] of expected.entries()) expect((await raw(q3!.images[8 + i]!)).equals(await raw(detail.png))).toBe(true);
    // Sol's question is v1's: same images and labels, same words up to the binding that names the release.
    const unbound = (prompt: string) => prompt.replace(/\nImmutable candidate binding: [\s\S]*$/, "");
    expect(a3!.images).toHaveLength(6); expect(a3!.labels).toEqual(a1!.labels); expect(unbound(a3!.prompt)).toBe(unbound(a1!.prompt));
    const row = (await rows(v3.gameId))[0]!, receipt = JSON.parse(row.judgeJson!), hideId = hide.id;
    expect(row.status).toBe("GENERATED");
    expect(receipt.boardReview).toMatchObject({ version: DUAL_VISUAL_REVIEW_V3, dual: { version: DUAL_VISUAL_REVIEW_V3, continuity: { reader: CONTINUITY_READER_BOUNDED } } });
    expect(receipt.boardReview.wireHashes).toHaveLength(12);
    expect(receipt.boardReview.evidenceIds.slice(-4)).toEqual(["left", "top", "right", "bottom"].map(e => `${hideId}:join:${e}`));
    expect(await publishable(v3.gameId, row)).toBe(true);
    expect(await db.auditLog.count({ where: { entityId: v3.gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(1);
    // A v3 answer is never read as another release's.
    expect(await publishable(v3.gameId, row, JSON.stringify({ ...receipt, boardReview: { ...receipt.boardReview, version: DUAL_VISUAL_REVIEW_VERSION } }))).toBe(false);
    const { reader: _r, ...unnamed } = receipt.boardReview.dual.continuity;
    expect(await publishable(v3.gameId, row, JSON.stringify({ ...receipt, boardReview: { ...receipt.boardReview,
      dual: { ...receipt.boardReview.dual, continuity: unnamed } } }))).toBe(false);
  });

  it("routes a broken object join that Opus names to repair, with the seam and picture checks", async () => {
    const broken = { ...good, pictureWhole: "fail", severeSeam: "fail", verdict: "fail", reason: "A newly painted sign meets the original lower half at the bottom join.",
      faults: [{ check: "pictureWhole", where: "Bottom join: the sign lettering is cut along the line" }, { check: "severeSeam", where: "Bottom join: doubled left edge of the sign" }],
      boundaryIntegrity: { ...good.boundaryIntegrity, bottom: { status: "fail", observation: "The sign is cut along the join; its lettering does not continue" } } };
    const s = await dualSeed("dual-v3-broken-join", "pass", { release: DUAL_VISUAL_REVIEW_V3, quality: broken });
    expect((await s.run()).state).toBe("retry");
    expect(s.request).toHaveBeenCalledTimes(1);
    const row = (await rows(s.gameId))[0]!;
    expect(row.status).toBe("FAILED"); expect(row.lastError).toMatch(/^quality-retry/);
    expect(localPatchRepairChecks(row.judgeJson, 12, { hideId: BOARD.hides[0]!.id })).toEqual(expect.arrayContaining(["pictureWhole", "severeSeam"]));
    expect(await publishable(s.gameId, row)).toBe(false);
  });
});

describe("quality reader v2: a located failure beside an unlocated one", () => {
  // Codex's reproduction (v18 fixes recheck, 13 October): readable, with one located failure and one never located.
  const mixed = { ...good, pictureWhole: "fail", severeSeam: "fail", verdict: "fail", reason: "The sign is cut at the bottom join, and a seam shows somewhere.",
    faults: [{ check: "pictureWhole", where: "Bottom join: the sign lettering is cut along the line" }] };
  it("is a second attempt that repairs the located check, decided by the reader its stage names: never a self-repair diagnosis, a pass or a publication", async () => {
    expect(CURRENT_QUALITY_READER).toBe(QUALITY_READER_LOCATED_V2);
    const s = await dualSeed("quality-v2-mixed", "pass", { release: DUAL_VISUAL_REVIEW_V3, quality: mixed });
    const hide = BOARD.hides[0]!;
    expect((await s.run()).state).toBe("retry");
    // Opus alone: a refused picture needs no anatomy question.
    expect(s.request.mock.calls.map(([q]) => q.role)).toEqual(["scene-quality"]);
    const row = (await rows(s.gameId))[0]!, receipt = JSON.parse(row.judgeJson!);
    expect(row).toMatchObject({ status: "FAILED", attempts: 1, lastError: "quality-retry: pictureWhole" });
    expect(receipt.qualityDisposition).toEqual({ state: "retry", faults: ["pictureWhole"] });
    expect(receipt.boardReview.dual.quality.reader).toBe(QUALITY_READER_LOCATED_V2);
    // The paid answer and the parser's record are kept: the unlocated failure stays unsure and downgraded, never a pass.
    expect(receipt.verdict).toMatchObject({ pictureWhole: "fail", severeSeam: "unsure", downgraded: ["severeSeam"] });
    expect(readQualityStage(receipt.boardReview.dual.quality, hide.id)).toEqual(receipt.verdict);
    // The same verdict decided by a v1 reader reads as before: that is the stages already written.
    expect(localPatchQualityDisposition(receipt.verdict, 12, { hideId: hide.id, reader: QUALITY_READER_LOCATED }))
      .toEqual({ state: "unresolved", faults: ["integration-review-unreadable"] });
    expect(await publishable(s.gameId, row)).toBe(false);
    expect(localPatchEvidenceRecovery(row)).toBeNull();
    expect(localPatchRetainedAnswerUndecided(row)).toBe(false);
    // The world's route: no self-repair diagnosis (the v1 label went straight there), but the next normal attempt.
    expect(needsSelfRepair(row)).toBe(false);
    expect(needsSelfRepair({ ...row, lastError: "quality-unresolved: integration-review-unreadable" })).toBe(true);
    expect(localPatchRepairChecks(row.judgeJson, 12, { hideId: hide.id })).toEqual(["pictureWhole"]);
    // A second review buys nothing; the next action is that attempt, asked to repair the located check only.
    await s.run();
    expect(s.request).toHaveBeenCalledTimes(1);
    const before = s.render.mock.calls.length;
    expect(await runLocalPatchHide(c, s.deps, { gameId: s.gameId, board: BOARD, hide })).toMatchObject({ attempt: 2 });
    expect(s.render.mock.calls.length).toBe(before + 1);
    const next = s.render.mock.calls.at(-1)![0];
    expect(next.requestKey).toBe(`${hide.id}:${hide.pose}:render:2`);
    expect(next.prompt).toContain("Keep the scene coherent at every edge.");
    expect(next.prompt).not.toContain("SEAM REPAIR");
    const budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(s.gameId);
    expect(await budget.readRequest(worldId, `${hide.id}:${hide.pose}:render:2`)).toMatchObject({ state: "settled", scope: "image" });
    expect(await budget.readRequest(worldId, `self-repair:${hide.id}:diagnosis:1`)).toBeNull();
  });
});
