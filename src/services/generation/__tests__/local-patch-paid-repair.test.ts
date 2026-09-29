import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { MockPaymentProvider } from "../../../infra/payment/mock";
import { MockAvatarProvider, NoopFaceDetector } from "../../../infra/generation/mock";
import { NoPatchJudge } from "../../../infra/generation/judge";
import { NoopAnalytics } from "../../../infra/analytics/console";
import { InlineJobRunner } from "../../../infra/jobs/inline";
import { retainedPurchaseKey } from "../../../infra/db/prisma-retained-purchase-store";
import { avatarDisplayFromSheet } from "../../../infra/generation/avatar-cut";
import type { EmailMessage } from "../../../infra/email/types";
import type { Container } from "../../container";
import { GameConfigSchema } from "../../../domain/game/config";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { cropOf, maskForHide } from "../../../domain/scene/local-patch-hides";
import { sceneBySlug } from "../../scene-catalog.service";
import { runLocalPatchWorldSlice, LOCAL_PATCH_STYLE, LOCAL_PATCH_QUALITY_FAILED, LOCAL_PATCH_RECOVERY_BUDGET_WAIT, localPatchPrivateInventory } from "../local-patch-world";
import { stageLocalPatchPaidRepair, readLocalPatchPaidRepair, runLocalPatchPaidRepair } from "../local-patch-paid-repair";
import { recomputePaidPatchJoin } from "../local-patch-repair-compose";
import * as repairComposer from "../local-patch-repair-compose";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { LOCAL_PATCH_PROVIDER, LOCAL_PATCH_VARIANT, runLocalPatchHide, type LocalPatchHideDeps } from "../local-patch-hide";
import { LOCAL_PATCH_COMPOSITION_VERSION, LOCAL_PATCH_RETURN_GUARD } from "../local-patch-seam";
import { LOCAL_PATCH_RESERVE, RETAINED_RENDER_VERSION } from "../local-patch-render";
import { LOCAL_PATCH_BOARD_PAINT_PROMPT_VERSION } from "../local-patch-prompt";
import { recordLocalPatchPublicationPolicy, hasLocalPatchPublicationPolicy, localPatchPublicationGeometryHash } from "../local-patch-publication-policy";
import { LocalPatchRetainedPurchaseStore } from "../local-patch-lifecycle";
import { purchaseOnce } from "../paid-operation";
import { sha256Bytes } from "../fixed-sprite";
import { localPatchHideEvidenceIds, parseLocalPatchVerdict } from "../local-patch-judge";
import { resumeAutomaticLocalPatchRecovery, nextPendingGame } from "../queue";
import type { SelfRepairWire } from "../local-patch-self-repair";
import { SELF_REPAIR_COMPOSITION_VERSION } from "../../../domain/scene/local-patch-self-repair";
import { prepareLocalPatchBoardReview, reviewLocalPatchBoard } from "../local-patch-board-review";
import { bill, boardPng, PASSING_ANSWER, seedApprovedGame } from "./local-patch-fixtures";

const state = vi.hoisted(() => ({ testers: [] as string[], original: Buffer.alloc(0) }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0,
  GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: state.testers }), flag: () => false,
  adminEmails: () => ["synthetic-admin@example.invalid"] }));
vi.mock("../local-patch-hide", async original => ({ ...await original<typeof import("../local-patch-hide")>(),
  readShippedBoardArt: async () => Buffer.from(state.original) }));
let VERSION: 8 | 10 | 11 | 12 = 8;
let BOARDS = localPatchBoardsForVersion(VERSION);
let SELECTED = [BOARDS[0]!.hides[0]!], UNREVIEWED: string[] = [];
let dimensions = { width: 3072, height: 2048 };
const GOOD = { ...PASSING_ANSWER, faceLikeness: "pass", faceReadable: "pass", severeSeam: "pass" };
const goodVerdict = () => VERSION >= 10 ? { ...GOOD, ageAppropriate: "pass", ...(VERSION === 12 ? {
  lightingMatch: "pass", neighborsIntact: "pass", integrationEvidence: { style: "Same broad painted planes as surrounding faces.",
    lighting: "Shared subdued local illumination without portrait fill.", neighbors: "Every original head remains connected to its unchanged body." },
} : {}) } : GOOD;
let dir: string, url: string, db: PrismaClient, c: Container, sequence = 0;
const mails: EmailMessage[] = [];
const noNetwork = vi.fn(async () => { throw new Error("No real network in paid repair integration"); });
beforeAll(async () => {
  dir = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-paid-repair-")));
  url = `file:${path.join(dir, "repair.sqlite").split(path.sep).join("/")}`;
  db = new PrismaClient({ datasources: { db: { url } } }); await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), appUrl: "http://localhost:3000", secret: "synthetic-paid-repair",
    payment: new MockPaymentProvider("http://localhost:3000", "synthetic"), avatars: new MockAvatarProvider(),
    judge: new NoPatchJudge(), faces: new NoopFaceDetector(), analytics: new NoopAnalytics(), jobs: new InlineJobRunner(),
    email: { id: "console", send: async mail => { mails.push(mail); return { id: `mail-${mails.length}` }; } }, adminEmails: ["synthetic-admin@example.invalid"] };
  state.original = await boardPng(); vi.stubGlobal("fetch", noNetwork);
}, 180_000);
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(dir) === realpathSync(tmpdir()) && path.basename(dir).startsWith("findme-paid-repair-")) rmSync(dir, { recursive: true, force: true });
});

async function seed() {
  const gameId = `paid-repair-${++sequence}`;
  const seeded = await seedApprovedGame(c, db, { gameId, approved: false, styleVersion: LOCAL_PATCH_STYLE,
    status: "GENERATION_FAILED", withJob: true, scenes: BOARDS.map(b => ({ slug: b.board, version: VERSION })) });
  state.testers.push(seeded.email);
  await c.storage.put(`private/photo-${gameId}.jpg`, seeded.sheet, "image/png");
  await db.game.update({ where: { id: gameId }, data: { paidAt: new Date() } });
  await db.order.create({ data: { id: `order-${gameId}`, gameId, userId: seeded.userId, amountAgorot: 5900,
    packageTier: "ONE_WORLD", paymentStatus: "PAID", paidAt: new Date(), provider: "mock" } });
  await db.generationJob.update({ where: { id: `job_${gameId}` }, data: { status: "DONE", currentStep: LOCAL_PATCH_QUALITY_FAILED, attempts: 38 } });
  const avatarId = `ast-avatar-${gameId}`, avatar = await avatarDisplayFromSheet(seeded.sheet, 1024);
  await c.storage.put(`game/${avatarId}.png`, avatar, "image/png");
  await db.asset.create({ data: { id: avatarId, ownerId: seeded.userId, type: "AVATAR", visibility: "GAME", status: "READY",
    storagePath: `game/${avatarId}.png`, mimeType: "image/png", width: 512, height: 512, bytes: avatar.length } });
  await db.childProfile.update({ where: { id: `chl-${gameId}` }, data: { avatarAssetId: avatarId } });
  const { sha256: catalogSha256 } = await readBoardConditionedCatalog();
  await reviewBoardWizardIdentity({ db, apiKey: "synthetic", budget: boardWizardBudgetOf(c), beforeDispatch: async () => {},
    write: work => db.$transaction(work), reviewer: { review: async () => ({ httpOk: true, requestId: `req-${gameId}-identity`,
      body: { model: "gpt-5.6-luna", usage: { prompt_tokens: 1500, completion_tokens: 150 }, choices: [{ finish_reason: "stop", message: {
        content: JSON.stringify({ checks: { identity: "pass", age: "pass", paintedStyle: "pass", sheetLayout: "pass" }, reason: "Synthetic approved illustrated identity" }) } }] } }) } },
  { gameId, identityAssetId: `ast-sheet-${gameId}`, sheet: seeded.sheet, photo: seeded.sheet, atlas: seeded.sheet, contentVersion: VERSION,
    provenance: { promptVersion: VERSION === 12 ? "character-v6-painted-identity-geometry" : VERSION === 11 ? "character-v5-refreshed-identity-body" : "character-v4-board-drawn-face-reference", quality: "medium", photoAssetId: `ast-photo-${gameId}`,
      photoSha256: sha256Bytes(seeded.sheet), ageYears: 8, crop: null,
      style: { version: VERSION === 12 ? "board-matched-identity/v4" : VERSION === 11 ? "board-matched-identity/v3" : "board-matched-identity/v2", catalogSha256, atlasSha256: sha256Bytes(seeded.sheet) } } });
  const png = await sharp(state.original).extract({ left: 0, top: 0, width: 512, height: 768 }).png().toBuffer();
  for (const board of BOARDS) {
    const def = sceneBySlug(board.board, VERSION), sceneId = `gsc-${gameId}-${board.board}`;
    await db.gameScene.update({ where: { id: sceneId }, data: { generationStatus: "GENERATED" } });
    for (const hide of board.hides) {
      const authored = def.targets.find(t => t.id === hide.targetId)!;
      const targetId = `tgt-${gameId}-${hide.id}`, rowId = `tva-${gameId}-${hide.id}`, assetId = `ast-${gameId}-${hide.id}`;
      const crop = cropOf(hide), mask = maskForHide(hide);
      const geometry = { rectJson: JSON.stringify({ x: crop.left / dimensions.width, y: crop.top / dimensions.height, w: 512 / dimensions.width, h: 768 / dimensions.height }),
        hitRectJson: JSON.stringify({ x: (crop.left + mask.left) / dimensions.width, y: (crop.top + mask.top) / dimensions.height, w: mask.width / dimensions.width, h: mask.height / dimensions.height }),
        headAnchorJson: JSON.stringify({ x: (crop.left + mask.left + mask.width / 2) / dimensions.width, y: (crop.top + mask.top) / dimensions.height }) };
      const selected = SELECTED.some(h => h.id === hide.id), failed = VERSION >= 10 ? selected : hide.id === SELECTED[1]!.id;
      const attempts = selected ? 3 : 1, pendingReview = UNREVIEWED.includes(hide.id);
      const judgeJson = JSON.stringify({ hide: hide.id, pose: hide.pose, judgedSha256: sha256Bytes(png), geometrySha256: localPatchPublicationGeometryHash(geometry),
        reviewState: pendingReview ? "pending-board-review" : "board-review-complete", wireFault: null, renderFault: null,
        verdict: pendingReview ? null : VERSION === 12 ? parseLocalPatchVerdict(goodVerdict(), 12) : goodVerdict(),
        compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION,
        ...(pendingReview ? {} : { boardReview: { compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION, version: VERSION >= 10 ? "local-patch-board-five-quality/v5-evidence-labeled" : "local-patch-board-five-quality/v3-head-safe" } }) });
      await c.storage.put(`game/${assetId}.png`, png, "image/png");
      await db.asset.create({ data: { id: assetId, ownerId: seeded.userId, type: "TARGET_SPRITE", visibility: "GAME", status: "READY",
        storagePath: `game/${assetId}.png`, mimeType: "image/png", width: 512, height: 768, bytes: png.length, provider: LOCAL_PATCH_PROVIDER, providerRequestId: gameId } });
      await db.targetInstance.create({ data: { id: targetId, gameSceneId: sceneId, targetId: hide.targetId, targetType: authored.targetType,
        slotAId: authored.slots[0].id, slotBId: authored.slots[1].id, spriteKind: "image", spriteAssetId: assetId, status: failed ? "FAILED" : "GENERATED", attempts } });
      await db.targetVariantAsset.create({ data: { id: rowId, targetInstanceId: targetId, variant: LOCAL_PATCH_VARIANT, slotId: authored.slots[0].id,
        provider: LOCAL_PATCH_PROVIDER, assetId, attempts, ...geometry, judgeJson, status: failed ? "FAILED" : "GENERATED", rejectedAssetIdsJson: "[]" } });
      if (!failed && !pendingReview) await db.$transaction(tx => recordLocalPatchPublicationPolicy(tx, { gameId, sceneVersion: VERSION, hideId: hide.id,
        variantId: rowId, attempts, identityAssetId: `ast-sheet-${gameId}`, identitySha256: sha256Bytes(seeded.sheet), assetId,
        imageSha256: sha256Bytes(png), geometrySha256: localPatchPublicationGeometryHash(geometry), judgeJson }));
    }
  }
  const repairs = [];
  for (const hide of SELECTED) {
    const mask = maskForHide(hide), crop = cropOf(hide);
    // The collection repair restores a head above the old return window.
    const core = { left: mask.left + 12, top: VERSION >= 10 ? 40 : mask.top + 12, width: 40, height: 60 };
    const faceRect = { left: core.left + 4, top: core.top + 4, width: 30, height: 30 };
    const raw = await sharp(png).composite([{ input: { create: { width: core.width, height: core.height, channels: 4, background: "#244fc1" } }, left: core.left, top: core.top }]).png().toBuffer();
    const weights = Buffer.alloc(512 * 768);
    for (let y = 0; y < 768; y++) for (let x = 0; x < 512; x++) {
      const outside = Math.max(core.left - 16 - x, x - (core.left + core.width + 15), core.top - 16 - y, y - (core.top + core.height + 15), 0);
      weights[y * 512 + x] = outside === 0 ? 255 : outside === 1 ? 191 : outside === 2 ? 127 : outside === 3 ? 63 : 0;
    }
    const alpha = await sharp(weights, { raw: { width: 512, height: 768, channels: 1 } }).toColourspace("b-w").png().toBuffer();
    const left = Math.max(0, mask.left - LOCAL_PATCH_RETURN_GUARD), top = Math.max(0, mask.top - LOCAL_PATCH_RETURN_GUARD);
    const returnWindow = VERSION >= 10 ? { left: 16, top: 16, width: 480, height: 736 }
      : { left, top, width: Math.min(512, mask.left + mask.width + LOCAL_PATCH_RETURN_GUARD) - left,
        height: Math.min(768, mask.top + mask.height + LOCAL_PATCH_RETURN_GUARD) - top };
    const joined = await recomputePaidPatchJoin({ beforePng: state.original, rawPng: raw, alphaPng: alpha, crop, returnWindow, protectedCore: core, faceRect,
      ...(VERSION >= 10 ? { boardSize: { width: 3840 as const, height: 2160 as const } } : {}) });
    const requestKey = `${hide.id}:${hide.pose}:render:1`, budget = boardWizardBudgetOf(c);
    expect(await purchaseOnce({ ledger: budget, store: new LocalPatchRetainedPurchaseStore(c, gameId, budget) }, {
      worldId: boardWizardWorldId(gameId), requestKey, scope: "image", operationFingerprint: `synthetic-paid-${gameId}-${hide.id}`,
      reserveMicroUsd: LOCAL_PATCH_RESERVE.renderMicroUsd, buy: async () => ({
        bytes: Buffer.from(JSON.stringify({ version: RETAINED_RENDER_VERSION, bytesBase64: raw.toString("base64"), rejected: null })), evidence: bill(`req-${gameId}-${hide.id}`) }),
    })).toMatchObject({ kind: "bought" });
    repairs.push({ hideId: hide.id, attempt: 1, rawSha256: sha256Bytes(raw), originalBoardSha256: sha256Bytes(state.original),
      candidateSha256: joined.candidateSha256, alphaSha256: sha256Bytes(alpha), alphaBase64: alpha.toString("base64"), protectedCore: core, faceRect,
      ...(VERSION >= 10 ? { returnWindow } : {}) });
  }
  const beforeRows = await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } }, orderBy: { id: "asc" } });
  const beforeCost = (await boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId))).settledMicroUsd;
  return { ...seeded, repairs, beforeRows, beforeCost, input: { gameId, operatorId: "synthetic-admin", authorizationReason: "Review exactly two existing paid synthetic pictures without new renders", repairs } };
}
const noPaint: LocalPatchHideDeps = { renderPolicySha256: "f".repeat(64), readBoardArt: async () => state.original,
  render: async () => { throw new Error("Repair flow must not buy an image"); }, judge: async () => { throw new Error("Repair flow must not buy per-hide review"); } };
function judge(gameId: string, siblingFails = false, failedCheck?: "ageAppropriate" | "scaleRight") {
  let calls = 0;
  return vi.fn(async (request: { prompt: string; images: readonly Buffer[]; imageLabels?: readonly string[] }) => {
    calls++;
    const board = BOARDS.find(b => request.prompt.includes(`The selected corrected hide is ${b.hides.find(h => SELECTED.some(s => s.id === h.id))?.id}.`))!;
    if (!board) throw new Error("The actual frozen repair prompt did not name a selected hide");
    if (VERSION >= 10) { expect(request.images).toHaveLength(8); expect(request.imageLabels).toHaveLength(8); }
    return { verdict: null, raw: JSON.stringify({ hides: board.hides.map((h, index) => ({ hideId: h.id,
      ...(VERSION >= 10 ? { evidenceIds: localPatchHideEvidenceIds(h.id) } : {}),
      verdict: failedCheck && index === 0 ? { ...goodVerdict(), [failedCheck]: "fail", verdict: "fail",
        faults: [{ check: failedCheck, where: "The visible body has adult proportions at this ground depth" }] }
        : siblingFails && index === 0 ? { ...goodVerdict(), faceLikeness: "unsure" } : goodVerdict() })) }),
      usage: { prompt_tokens: 12000, completion_tokens: 1200 }, requestId: `req-${gameId}-repair-${calls}`,
      model: "gpt-5.6-sol", finishReason: "stop", wireFault: null, costUnknown: false };
  });
}
async function tick(gameId: string, repairJudge: ReturnType<typeof judge>, container = c) {
  return runLocalPatchWorldSlice(container, noPaint, gameId, { repairJudge, hardDeadlineAt: Date.now() + 270_000 });
}

describe("v12 scoped automatic repair review", () => {
  beforeAll(async () => {
    VERSION = 12; BOARDS = localPatchBoardsForVersion(12);
    SELECTED = [BOARDS.find(b => b.board === "antarctica")!.hides[2]!];
    dimensions = { width: 3840, height: 2160 };
    state.original = await sharp({ create: { ...dimensions, channels: 4, background: "#d2be96" } }).png().toBuffer();
  });
  it.each([false, true])("reviews every unapproved appearance and preserves byte-bound siblings (pending sibling: %s)", async pendingSibling => {
    const board = BOARDS.find(b => b.board === "antarctica")!;
    UNREVIEWED = pendingSibling ? [board.hides[0]!.id] : [];
    const s = await seed(), candidate = s.beforeRows.find(r => r.id.endsWith(SELECTED[0]!.id))!;
    await db.game.update({ where: { id: s.gameId }, data: { status: "TARGETS_GENERATING" } });
    const decision = { cause: "composition-clipping", explanation: "Synthetic complete child now fits the return window.",
      action: "recompose-retained", sourceKey: `${SELECTED[0]!.id}:${SELECTED[0]!.pose}:render:1`,
      returnWindow: s.repairs[0]!.returnWindow, protectedCore: s.repairs[0]!.protectedCore, faceRect: s.repairs[0]!.faceRect };
    await db.targetVariantAsset.update({ where: { id: candidate.id }, data: { status: "GENERATED", judgeJson: JSON.stringify({
      ...JSON.parse(candidate.judgeJson!), compositionVersion: SELF_REPAIR_COMPOSITION_VERSION, reviewState: "pending-board-review",
      selfRepair: { version: "local-patch-self-repair/v1", phase: "awaiting-review", decision },
      recoveryComposition: { outsideChangedPixels: 0, protectedChangedPixels: 0 },
    }) } });
    const input = { gameId: s.gameId, sceneId: `gsc-${s.gameId}-antarctica` }, deps = { fence: async () => {}, readBoardArt: async () => state.original };
    const prepared = await prepareLocalPatchBoardReview(c, input, deps);
    expect(prepared.ready).toBe(true); if (!prepared.ready) throw Error(prepared.reason);
    expect(prepared.request.reviewScope).toBe("unapproved-only/v1");
    expect(prepared.request.hides.map(h => h.hideId).sort()).toEqual([...UNREVIEWED, SELECTED[0]!.id].sort());
    const reviewer = vi.fn(async (request: import("../local-patch-judge").LocalPatchBoardJudgeRequest) => ({
      verdict: null, verdicts: {}, raw: JSON.stringify({ hides: request.hides.map(h => ({ hideId: h.hideId,
        evidenceIds: localPatchHideEvidenceIds(h.hideId), verdict: goodVerdict() })) }),
      usage: { prompt_tokens: 12000, completion_tokens: 1000 }, requestId: `req-scoped-${s.gameId}`,
      model: "gpt-5.6-sol", finishReason: "stop", wireFault: null, costUnknown: false,
    }));
    expect(await reviewLocalPatchBoard(c, input, { ...deps, judge: reviewer })).toMatchObject({ state: "done", replayed: false });
    const budget = boardWizardBudgetOf(c), paid = await budget.readRequest(boardWizardWorldId(s.gameId), prepared.requestKey);
    expect(paid?.reserveMicroUsd).toBe(pendingSibling ? 400000 : 300000);
    expect(await reviewLocalPatchBoard(c, input, { ...deps, judge: reviewer })).toMatchObject({ state: "done", replayed: true });
    expect(reviewer).toHaveBeenCalledOnce();
    for (const original of s.beforeRows.filter(r => prepared.protectedRows.has(r.id))) {
      const after = await db.targetVariantAsset.findUniqueOrThrow({ where: { id: original.id } });
      expect(after.judgeJson).toBe(original.judgeJson); expect(after.assetId).toBe(original.assetId);
    }
    const after = await db.targetVariantAsset.findUniqueOrThrow({ where: { id: candidate.id } });
    const binding = { gameId: s.gameId, sceneVersion: 12, hideId: SELECTED[0]!.id, variantId: after.id, attempts: after.attempts,
      identityAssetId: `ast-sheet-${s.gameId}`, identitySha256: sha256Bytes(s.sheet), assetId: after.assetId!,
      imageSha256: JSON.parse(after.judgeJson!).judgedSha256, geometrySha256: localPatchPublicationGeometryHash(after), judgeJson: after.judgeJson };
    expect(await hasLocalPatchPublicationPolicy(c, binding)).toBe(true);
    const tampered = JSON.parse(after.judgeJson!); tampered.boardReview.reviewedHideIds = [board.hides[1]!.id];
    await expect(db.$transaction(tx => recordLocalPatchPublicationPolicy(tx, { ...binding, judgeJson: JSON.stringify(tampered) }))).rejects.toThrow("quality policy");
    expect(noNetwork).not.toHaveBeenCalled();
  }, 180000);
});

describe.each([8, 10, 11] as const)("v%s paid repairs through actual stage, real ledger, durable queue and publication", version => {
  beforeAll(async () => {
    VERSION = version; BOARDS = localPatchBoardsForVersion(version);
    SELECTED = version >= 10
      ? [BOARDS.find(b => b.board === "antarctica")!.hides[2]!, BOARDS.find(b => b.board === "giza")!.hides[1]!]
      : [BOARDS.find(b => b.board === "tokyo")!.hides[2]!, BOARDS.find(b => b.board === "greatwall")!.hides[4]!];
    UNREVIEWED = BOARDS.find(b => b.hides.some(h => h.id === SELECTED[1]!.id))!.hides.filter(h => h.id !== SELECTED[1]!.id).map(h => h.id);
    dimensions = version >= 10 ? { width: 3840, height: 2160 } : { width: 3072, height: 2048 };
    state.original = await sharp({ create: { ...dimensions, channels: 4, background: "#d2be96" } }).png().toBuffer();
  });
  it.runIf(version >= 10)("diagnoses two actual seam failures before the third purchase and resumes that plan after a lost image write", async () => {
    const s = await seed(), board = BOARDS.find(b => b.board === "sydney")!, hide = board.hides[0]!;
    const old = s.beforeRows.find(r => JSON.parse(r.judgeJson!).hide === hide.id)!;
    await db.targetVariantAsset.delete({ where: { id: old.id } });
    const prompts: string[] = [], request = { gameId: s.gameId, board, hide };
    const deps: LocalPatchHideDeps = { ...noPaint, render: async ({ requestKey, stylePng, prompt }) => {
      prompts.push(prompt);
      const mask = maskForHide(hide);
      const png = prompts.length < 3
        ? await sharp({ create: { width: 512, height: 768, channels: 4, background: "red" } }).png().toBuffer()
        : await sharp(stylePng).composite([{ input: { create: { width: 40, height: 60, channels: 4, background: "blue" } },
          left: mask.left + 12, top: mask.top + 12 }]).png().toBuffer();
      return { png, rejected: null, quarantined: null, evidence: bill(`req-${s.gameId}-${requestKey}`), unknownReason: null };
    } };
    expect((await runLocalPatchHide(c, deps, request)).state).toBe("refused");
    expect((await runLocalPatchHide(c, deps, request)).state).toBe("gave-up");
    expect(prompts.every(prompt => !prompt.includes("ADAPTIVE RECOVERY"))).toBe(true);
    await db.$executeRawUnsafe(`CREATE TRIGGER fail_adaptive_write BEFORE INSERT ON FileBlob WHEN NEW.key LIKE 'game/%'
      BEGIN SELECT RAISE(ABORT, 'lost third-attempt image write'); END`);
    try { await expect(runLocalPatchHide(c, deps, { ...request, finalRepair: true })).rejects.toThrow(); }
    finally { await db.$executeRawUnsafe("DROP TRIGGER fail_adaptive_write"); }
    expect(prompts).toHaveLength(3);
    if (version === 11) expect(prompts.every(prompt => prompt.includes("BODY AGE CONTRACT: 8 years"))).toBe(true);
    expect(prompts[2]).toContain("Solve registration first");
    const pending = await db.targetVariantAsset.findFirstOrThrow({ where: { targetInstanceId: old.targetInstanceId } });
    if (version === 11) expect(pending.promptVersion).toBe("local-patch-prompt/v13-identity-body-lock");
    expect(pending).toMatchObject({ status: "PENDING", attempts: 3 });
    const plan = JSON.parse(pending.judgeJson!).adaptiveRecovery.plan;
    expect(plan.evidence.map((e: { attempt: number }) => e.attempt)).toEqual([1, 2]);
    const spent = (await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).settledMicroUsd;
    const fresh = new PrismaClient({ datasources: { db: { url } } });
    try { expect(await runLocalPatchHide({ ...c, db: fresh, storage: new DbStorage(fresh) }, { ...deps,
      render: async () => { throw Error("A retained third attempt must never buy again"); } }, { ...request, finalRepair: true }))
      .toMatchObject({ state: "generated", attempt: 3, replayed: true }); }
    finally { await fresh.$disconnect(); }
    const resumed = await db.targetVariantAsset.findUniqueOrThrow({ where: { id: pending.id } });
    expect(JSON.parse(resumed.judgeJson!).adaptiveRecovery.plan).toEqual(plan);
    expect((await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).settledMicroUsd).toBe(spent);
  }, 240_000);
  it.runIf(version >= 10)("automatically reopens a complete failed game, changes strategy after another rejection and delivers all27 without parent approval", async () => {
    const s = await seed();
    for (const h of SELECTED) await db.targetVariantAsset.update({ where: { id: `tva-${s.gameId}-${h.id}` }, data: { attempts: 2 } });
    const originalHide = SELECTED[0]!, budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(s.gameId);
    const retained = await new LocalPatchRetainedPurchaseStore(c, s.gameId, budget).get(worldId, `${originalHide.id}:${originalHide.pose}:render:1`);
    const core = s.repairs[0]!.protectedCore;
    const alternate = await sharp(Buffer.from(JSON.parse(retained!.bytes.toString()).bytesBase64, "base64"))
      .composite([{ input: { create: { width: 4, height: 4, channels: 4, background: "red" } }, left: core.left, top: core.top }]).png().toBuffer();
    await purchaseOnce({ ledger: budget, store: new LocalPatchRetainedPurchaseStore(c, s.gameId, budget) }, {
      worldId, requestKey: `${originalHide.id}:${originalHide.pose}:render:2`, scope: "image", operationFingerprint: `synthetic-second-${s.gameId}`,
      reserveMicroUsd: LOCAL_PATCH_RESERVE.renderMicroUsd, buy: async () => ({ bytes: Buffer.from(JSON.stringify({ version: RETAINED_RENDER_VERSION,
        bytesBase64: alternate.toString("base64"), rejected: null })), evidence: bill(`req-${s.gameId}-second`) }) });
    await resumeAutomaticLocalPatchRecovery(c, s.gameId);
    expect((await db.game.findUniqueOrThrow({ where: { id: s.gameId } })).status).toBe("TARGETS_GENERATING");
    const diagnoses: string[] = [], recipes = new Map<string, number>(), reviews = new Map<string, number>();
    const diagnose = vi.fn(async (wire: SelfRepairWire) => {
      const selected = s.repairs.find(r => wire.imageLabels.some(label => label.includes(`${r.hideId}:`)))!;
      expect(selected).toBeDefined();
      expect(wire.imageLabels[0]).toContain("ORIGINAL"); expect(wire.imageLabels[1]).toContain("CANONICAL");
      expect(wire.imageLabels.at(-1)).toContain("FAILED SHIPPING");
      if (version === 11) {
        expect(wire.prompt).toContain("BODY AGE CONTRACT: 8 years");
        expect(wire.prompt).toContain("Expand it when the stated-age anatomy needs more space");
        expect(wire.prompt).not.toContain("smaller/shifted editable envelope");
      }
      const count = (recipes.get(selected.hideId) ?? 0) + 1; recipes.set(selected.hideId, count); diagnoses.push(selected.hideId);
      const h = SELECTED.find(h => h.id === selected.hideId)!;
      return { verdict: null, raw: JSON.stringify({ cause: "composition-clipping", explanation: "The retained RAW contains the complete head, but the original shipping window clipped it.",
        action: "recompose-retained", sourceKey: `${h.id}:${h.pose}:render:${count === 1 ? 1 : 2}`,
        returnWindow: count === 1 ? selected.returnWindow : { left: 17, top: 17, width: 478, height: 734 },
        protectedCore: selected.protectedCore, faceRect: selected.faceRect }),
        usage: { prompt_tokens: 9000, completion_tokens: 500 }, requestId: `req-${s.gameId}-diagnosis-${diagnoses.length}`,
        model: "gpt-5.6-sol", finishReason: "stop", wireFault: null, costUnknown: false };
    });
    const boardJudge = vi.fn(async (request: import("../local-patch-judge").LocalPatchBoardJudgeRequest) => {
      const count = (reviews.get(request.boardId) ?? 0) + 1; reviews.set(request.boardId, count);
      return { verdict: null, verdicts: {}, raw: JSON.stringify({ hides: request.hides.map(h => ({ hideId: h.hideId,
        evidenceIds: localPatchHideEvidenceIds(h.hideId), verdict: h.hideId === SELECTED[0]!.id && count === 1
          ? { ...goodVerdict(), severeSeam: "fail", verdict: "fail", faults: [{ check: "severeSeam", where: "The repaired boundary still clips the upper background edge." }] }
          : goodVerdict() })) }), usage: { prompt_tokens: 9000, completion_tokens: 1200 }, requestId: `req-${s.gameId}-${request.boardId}-${count}`,
        model: "gpt-5.6-sol", finishReason: "stop", wireFault: null, costUnknown: false };
    });
    for (let i = 0; i < 18; i++) {
      const outcome = await runLocalPatchWorldSlice(c, noPaint, s.gameId, { maxHides: 2, diagnose, boardJudge });
      expect(outcome.attention).toBeNull();
      const current = await db.game.findUniqueOrThrow({ where: { id: s.gameId } });
      expect(["GENERATION_FAILED", "MANUAL_REVIEW"]).not.toContain(current.status);
      if (!outcome.pending) break;
    }
    const game = await db.game.findUniqueOrThrow({ where: { id: s.gameId } });
    expect(game.status).toBe("DELIVERED");
    expect(GameConfigSchema.parse(JSON.parse(game.configJson!)).scenes.flatMap(s => s.targets)).toHaveLength(27);
    expect(diagnoses).toHaveLength(3); expect(recipes.get(SELECTED[0]!.id)).toBe(2);
    const after = await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId: s.gameId } } }, orderBy: { id: "asc" } });
    for (const row of after) {
      const original = s.beforeRows.find(r => r.id === row.id)!;
      if (!SELECTED.some(h => row.id.endsWith(h.id))) {
        expect(row.assetId).toBe(original.assetId); expect(row.rectJson).toBe(original.rectJson);
        expect(row.hitRectJson).toBe(original.hitRectJson); expect(row.costCents).toBe(original.costCents);
        expect(row.attempts).toBe(original.attempts);
        if (!UNREVIEWED.some(h => row.id.endsWith(h))) expect(row.judgeJson).toBe(original.judgeJson);
      } else {
        expect(row.attempts).toBe(2); expect(JSON.parse(row.judgeJson!).compositionVersion).toBe(SELF_REPAIR_COMPOSITION_VERSION);
      }
    }
    const audit = await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId));
    expect(audit.held).toBe(false); expect(audit.reservedMicroUsd).toBe(0); expect(noNetwork).not.toHaveBeenCalled();
    const inventory = await localPatchPrivateInventory(c, s.gameId);
    const requests = await db.auditLog.findMany({ where: { entityId: s.gameId, action: "local-patch:automatic-recovery-request" } });
    expect(requests.length).toBe(6);
    for (const item of requests) expect(inventory.retainedPurchaseKeys).toContain(retainedPurchaseKey(boardWizardWorldId(s.gameId), JSON.parse(item.metaJson!).requestKey));
  }, 240_000);
  it.runIf(version >= 10)("keeps a lost diagnostic answer and resumes from a fresh client without another paid request", async () => {
    const s = await seed(); await resumeAutomaticLocalPatchRecovery(c, s.gameId);
    const h = BOARDS.flatMap(b => b.hides).find(h => SELECTED.some(s => s.id === h.id))!;
    const repair = s.repairs.find(r => r.hideId === h.id)!;
    const diagnose = vi.fn(async () => ({ verdict: null, raw: JSON.stringify({ cause: "composition-clipping", explanation: "The complete child is already present in this paid raw picture.",
      action: "recompose-retained", sourceKey: `${h.id}:${h.pose}:render:1`, returnWindow: repair.returnWindow,
      protectedCore: repair.protectedCore, faceRect: repair.faceRect }), usage: { prompt_tokens: 8000, completion_tokens: 500 },
      requestId: `req-${s.gameId}-diagnosis`, model: "gpt-5.6-sol", finishReason: "stop", wireFault: null, costUnknown: false }));
    await runLocalPatchWorldSlice(c, noPaint, s.gameId, { maxHides: 1, diagnose }); // freezes first phase
    await db.$executeRawUnsafe(`CREATE TRIGGER lose_diagnosis_commit BEFORE UPDATE ON TargetVariantAsset
      WHEN json_extract(NEW.judgeJson, '$.selfRepair.phase') = 'applying' BEGIN SELECT RAISE(ABORT, 'lost diagnosis write'); END`);
    try { await expect(runLocalPatchWorldSlice(c, noPaint, s.gameId, { maxHides: 1, diagnose })).rejects.toThrow(); }
    finally { await db.$executeRawUnsafe("DROP TRIGGER lose_diagnosis_commit"); }
    expect(diagnose).toHaveBeenCalledTimes(1);
    const spent = (await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).settledMicroUsd;
    const fresh = new PrismaClient({ datasources: { db: { url } } });
    try { await runLocalPatchWorldSlice({ ...c, db: fresh, storage: new DbStorage(fresh) }, noPaint, s.gameId,
      { maxHides: 1, diagnose: async () => { throw Error("Must replay the retained diagnosis"); } }); }
    finally { await fresh.$disconnect(); }
    expect((await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).settledMicroUsd).toBe(spent);
    expect(JSON.parse((await db.targetVariantAsset.findUniqueOrThrow({ where: { id: `tva-${s.gameId}-${h.id}` } })).judgeJson!).selfRepair.phase).toBe("applying");
    expect(await nextPendingGame(c)).not.toBeNull();
  }, 240_000);
  it.runIf(version >= 10)("redraws with the diagnosed editable envelope and replays an interrupted recovery image instead of charging twice", async () => {
    const s = await seed(); await resumeAutomaticLocalPatchRecovery(c, s.gameId);
    const h = BOARDS.flatMap(b => b.hides).find(h => SELECTED.some(s => s.id === h.id))!;
    await db.targetVariantAsset.update({ where: { id: `tva-${s.gameId}-${h.id}` }, data: { promptVersion: LOCAL_PATCH_BOARD_PAINT_PROMPT_VERSION } });
    const repair = s.repairs.find(r => r.hideId === h.id)!;
    const diagnose = vi.fn(async () => ({ verdict: null, raw: JSON.stringify({ cause: "wrong-identity", explanation: "The raw candidates contain a generic face; repaint inside a different bounded placement.",
      action: "redraw-with-new-placement", sourceKey: `${h.id}:${h.pose}:render:1`, returnWindow: repair.returnWindow,
      protectedCore: repair.protectedCore, faceRect: repair.faceRect }), usage: { prompt_tokens: 8000, completion_tokens: 500 },
      requestId: `req-${s.gameId}-redraw-plan`, model: "gpt-5.6-sol", finishReason: "stop", wireFault: null, costUnknown: false }));
    const render = vi.fn(async (input: Parameters<LocalPatchHideDeps["render"]>[0]) => {
      expect(input.requestKey).toBe(`${h.id}:${h.pose}:self-repair:1`);
      expect(input.prompt).toContain("AUTONOMOUS RECOVERY");
      expect(input.prompt).toContain("PAINT AUTHORITY");
      expect(input.prompt).not.toContain("The raw candidates contain a generic face;");
      const { data, info } = await sharp(input.maskPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let clear = 0; for (let p = 3; p < data.length; p += info.channels) if (data[p] === 0) clear++;
      expect(clear).toBe(repair.protectedCore.width * repair.protectedCore.height);
      expect(clear).not.toBe(maskForHide(h).width * maskForHide(h).height);
      const png = await sharp(input.stylePng).composite([{ input: { create: { width: repair.protectedCore.width, height: repair.protectedCore.height,
        channels: 4, background: "blue" } }, left: repair.protectedCore.left, top: repair.protectedCore.top }]).png().toBuffer();
      return { png, rejected: null, quarantined: null, evidence: bill(`req-${s.gameId}-recovery-render`), unknownReason: null };
    });
    const deps = { ...noPaint, render };
    await runLocalPatchWorldSlice(c, deps, s.gameId, { maxHides: 1, diagnose });
    await runLocalPatchWorldSlice(c, deps, s.gameId, { maxHides: 1, diagnose });
    await db.$executeRawUnsafe(`CREATE TRIGGER lose_recovery_image BEFORE INSERT ON FileBlob
      WHEN NEW.key LIKE 'game/ast_lpsr_%' BEGIN SELECT RAISE(ABORT, 'lost recovery image write'); END`);
    try { await expect(runLocalPatchWorldSlice(c, deps, s.gameId, { maxHides: 1, diagnose })).rejects.toThrow(); }
    finally { await db.$executeRawUnsafe("DROP TRIGGER lose_recovery_image"); }
    expect(render).toHaveBeenCalledTimes(1); expect(diagnose).toHaveBeenCalledTimes(1);
    const before = (await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).settledMicroUsd;
    // End the slice before the separate review purchase, so this asserts only
    // replay of the retained image and atomic derived-pixel write.
    const boardJudge = vi.fn(async (request: import("../local-patch-judge").LocalPatchBoardJudgeRequest) => ({ verdict: null, verdicts: {},
      raw: JSON.stringify({ hides: request.hides.map(hide => ({ hideId: hide.hideId, evidenceIds: localPatchHideEvidenceIds(hide.hideId), verdict: goodVerdict() })) }),
      usage: { prompt_tokens: 1000, completion_tokens: 100 }, requestId: `req-${s.gameId}-recovery-review`, model: "gpt-5.6-sol", finishReason: "stop", wireFault: null, costUnknown: false }));
    const fresh = new PrismaClient({ datasources: { db: { url } } });
    try { await runLocalPatchWorldSlice({ ...c, db: fresh, storage: new DbStorage(fresh) }, { ...noPaint,
      render: async () => { throw Error("The interrupted image must replay without a second purchase"); } }, s.gameId,
      { maxHides: 1, diagnose, boardJudge }); } finally { await fresh.$disconnect(); }
    const current = await db.targetVariantAsset.findUniqueOrThrow({ where: { id: `tva-${s.gameId}-${h.id}` } });
    expect(current).toMatchObject({ status: "GENERATED", attempts: 3 });
    expect(JSON.parse(current.judgeJson!).selfRepair.sourceKeys).toContain(`${h.id}:${h.pose}:self-repair:1`);
    expect(render).toHaveBeenCalledTimes(1); expect(boardJudge).toHaveBeenCalledTimes(1);
    expect((await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).settledMicroUsd - before).toBeLessThan(30_000);
    const inventory = await localPatchPrivateInventory(c, s.gameId);
    expect(inventory.retainedPurchaseKeys).toContain(retainedPurchaseKey(boardWizardWorldId(s.gameId), `${h.id}:${h.pose}:self-repair:1`));
  }, 240_000);
  it.runIf(version >= 10)("feeds a deterministic compositor refusal into a new diagnosis instead of replaying the same failed composition", async () => {
    const s = await seed(); await resumeAutomaticLocalPatchRecovery(c, s.gameId);
    const h = BOARDS.flatMap(b => b.hides).find(h => SELECTED.some(s => s.id === h.id))!;
    const repair = s.repairs.find(r => r.hideId === h.id)!;
    const diagnose = vi.fn(async () => ({ verdict: null, raw: JSON.stringify({ cause: "composition-clipping", explanation: "The prior join cropped the visible child; move the return around the complete figure.",
      action: "recompose-retained", sourceKey: `${h.id}:${h.pose}:render:1`, returnWindow: repair.returnWindow,
      protectedCore: repair.protectedCore, faceRect: repair.faceRect }), usage: { prompt_tokens: 8000, completion_tokens: 500 },
      requestId: `req-${s.gameId}-compose-plan`, model: "gpt-5.6-sol", finishReason: "stop", wireFault: null, costUnknown: false }));
    await runLocalPatchWorldSlice(c, noPaint, s.gameId, { maxHides: 1, diagnose });
    await runLocalPatchWorldSlice(c, noPaint, s.gameId, { maxHides: 1, diagnose });
    const compositor = vi.spyOn(repairComposer, "recomputePaidPatchJoin").mockRejectedValueOnce(new Error("LOCAL_PATCH_REPAIR_COMPOSE: board and paid crop must be opaque"));
    try { expect(await runLocalPatchWorldSlice(c, noPaint, s.gameId, { maxHides: 1, diagnose })).toMatchObject({ pending: true, attention: null }); }
    finally { compositor.mockRestore(); }
    await runLocalPatchWorldSlice(c, noPaint, s.gameId, { maxHides: 1, diagnose });
    const current = await db.targetVariantAsset.findUniqueOrThrow({ where: { id: `tva-${s.gameId}-${h.id}` } });
    expect(JSON.parse(current.judgeJson!).selfRepair).toMatchObject({ phase: "diagnosing", cycle: 2,
      feedback: "LOCAL_PATCH_REPAIR_COMPOSE: board and paid crop must be opaque", history: [{ result: "LOCAL_PATCH_REPAIR_COMPOSE: board and paid crop must be opaque" }] });
    expect(diagnose).toHaveBeenCalledTimes(1);
    expect((await db.game.findUniqueOrThrow({ where: { id: s.gameId } })).status).toBe("TARGETS_GENERATING");
  }, 240_000);
  it.runIf(version >= 10)("preserves the spending ceiling and backs off an operational budget outage without failing the game or starving the queue", async () => {
    const s = await seed(); await resumeAutomaticLocalPatchRecovery(c, s.gameId);
    const budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(s.gameId), spent = (await budget.audit(worldId)).settledMicroUsd;
    await budget.importSettled(worldId, { scope: "image", operationFingerprint: `synthetic-near-budget-${s.gameId}`,
      evidence: { ...bill(`req-${s.gameId}-budget-fixture`), amountMicroUsd: 3_990_000 - spent } });
    const diagnose = vi.fn(async () => { throw Error("An exhausted world must not dispatch a diagnostic call"); });
    await runLocalPatchWorldSlice(c, noPaint, s.gameId, { maxHides: 1, diagnose });
    expect(await runLocalPatchWorldSlice(c, noPaint, s.gameId, { maxHides: 1, diagnose })).toMatchObject({ pending: true, attention: null });
    expect(await db.game.findUniqueOrThrow({ where: { id: s.gameId } })).toMatchObject({ status: "TARGETS_GENERATING", configJson: null });
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${s.gameId}` } })).toMatchObject({ status: "QUEUED", currentStep: LOCAL_PATCH_RECOVERY_BUDGET_WAIT });
    expect(await runLocalPatchWorldSlice(c, noPaint, s.gameId, { maxHides: 1, diagnose })).toMatchObject({ claimed: false, pending: true, attention: null });
    expect(await nextPendingGame(c)).not.toBe(s.gameId);
    expect(diagnose).not.toHaveBeenCalled(); expect((await budget.audit(worldId)).settledMicroUsd).toBe(3_990_000);
  }, 240_000);
  describe.skipIf(version === 11)("historical manually staged repair protocol", () => {
  it("stages without spend, delivers the complete world after two reviews and preserves all other images", async () => {
    const s = await seed(), mailStart = mails.length;
    const stage = await stageLocalPatchPaidRepair(c, s.input);
    expect(stage.requestKeys).toHaveLength(2);
    expect((await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).settledMicroUsd).toBe(s.beforeCost);
    const staged = await readLocalPatchPaidRepair(c, s.gameId); expect(staged?.state).toBe("staged");
    expect(staged!.reviewedSiblings?.map(row => row.hideId).sort()).toEqual([...UNREVIEWED].sort());
    expect(s.beforeRows.filter(row => JSON.parse(row.judgeJson!).reviewState === "pending-board-review")).toHaveLength(UNREVIEWED.length);
    for (const sibling of staged!.reviewedSiblings!) {
      const row = s.beforeRows.find(r => r.id === sibling.rowId)!;
      expect(await hasLocalPatchPublicationPolicy(c, { gameId: s.gameId, sceneVersion: VERSION, hideId: sibling.hideId,
        variantId: row.id, attempts: row.attempts, identityAssetId: staged!.identityAssetId, identitySha256: staged!.identitySha256,
        assetId: row.assetId!, imageSha256: sibling.imageSha256, geometrySha256: sibling.geometrySha256, judgeJson: row.judgeJson })).toBe(false);
    }
    for (const key of stage.requestKeys) expect(await boardWizardBudgetOf(c).readRequest(boardWizardWorldId(s.gameId), key)).toBeNull();
    const inventory = await localPatchPrivateInventory(c, s.gameId);
    for (const key of stage.requestKeys) expect(inventory.retainedPurchaseKeys).toContain(retainedPurchaseKey(boardWizardWorldId(s.gameId), key));
    for (const a of staged!.candidates) { expect(inventory.assetIds).toContain(a.assetId); expect(inventory.assetIds).toContain(a.alphaAssetId); }
    const j = judge(s.gameId);
    expect(await tick(s.gameId, j)).toMatchObject({ pending: true });
    expect((await readLocalPatchPaidRepair(c, s.gameId))?.state).toBe("staged");
    expect(await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId: s.gameId } } }, orderBy: { id: "asc" } })).toEqual(s.beforeRows);
    expect(await tick(s.gameId, j)).toMatchObject({ pending: false, attention: null });
    const game = await db.game.findUniqueOrThrow({ where: { id: s.gameId } });
    expect(game.status, game.lastError ?? "no error").toBe("DELIVERED");
    const config = GameConfigSchema.parse(JSON.parse(game.configJson!));
    expect(config.scenes.flatMap(board => board.targets)).toHaveLength(VERSION >= 10 ? 27 : 45);
    if (VERSION >= 10) expect(config.adventure?.boards).toHaveLength(9);
    const afterRows = await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId: s.gameId } } }, orderBy: { id: "asc" } });
    const repairedIds = new Set(staged!.candidates.map(a => a.rowId));
    const siblingIds = new Set(staged!.reviewedSiblings!.map(a => a.rowId));
    const unchanged = afterRows.filter(r => !repairedIds.has(r.id) && !siblingIds.has(r.id));
    expect(unchanged).toHaveLength(s.beforeRows.length - 2 - UNREVIEWED.length);
    expect(unchanged).toEqual(s.beforeRows.filter(r => !repairedIds.has(r.id) && !siblingIds.has(r.id)));
    const preserved = (row: typeof afterRows[number]) => { const { judgeJson: _judge, updatedAt: _updated, ...invariants } = row; return invariants; };
    expect(afterRows.filter(r => !repairedIds.has(r.id)).map(preserved)).toEqual(s.beforeRows.filter(r => !repairedIds.has(r.id)).map(preserved));
    for (const row of afterRows.filter(r => !repairedIds.has(r.id))) {
      const asset = await db.asset.findUniqueOrThrow({ where: { id: row.assetId! } });
      expect(sha256Bytes(await c.storage.get(asset.storagePath))).toBe(JSON.parse(s.beforeRows.find(r => r.id === row.id)!.judgeJson!).judgedSha256);
    }
    for (const row of afterRows.filter(r => siblingIds.has(r.id))) {
      const original = s.beforeRows.find(r => r.id === row.id)!;
      const review = JSON.parse(row.judgeJson!);
      expect(row.judgeJson).not.toBe(original.judgeJson);
      expect(review).toMatchObject({ judgedSha256: JSON.parse(original.judgeJson!).judgedSha256,
        geometrySha256: localPatchPublicationGeometryHash(row), compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION,
        paidRepair: { kind: "reviewed-unchanged-sibling" } });
      expect(review.verdict).toMatchObject({ faceLikeness: "pass", faceReadable: "pass", severeSeam: "pass" });
      expect(await hasLocalPatchPublicationPolicy(c, { gameId: s.gameId, sceneVersion: VERSION, hideId: review.hide,
        variantId: row.id, attempts: row.attempts, identityAssetId: staged!.identityAssetId, identitySha256: staged!.identitySha256,
        assetId: row.assetId!, imageSha256: review.judgedSha256, geometrySha256: review.geometrySha256, judgeJson: row.judgeJson })).toBe(true);
    }
    expect(afterRows.filter(r => repairedIds.has(r.id)).every(r => r.status === "GENERATED" && r.attempts === 3)).toBe(true);
    expect(j).toHaveBeenCalledTimes(2); expect(mails.slice(mailStart).filter(m => m.tag === "game-ready")).toHaveLength(1);
    const cost = (await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).settledMicroUsd;
    const fresh = new PrismaClient({ datasources: { db: { url } } });
    try { for (let i = 0; i < 3; i++) expect(await tick(s.gameId, j, { ...c, db: fresh, storage: new DbStorage(fresh) })).toMatchObject({ pending: false, claimed: false }); }
    finally { await fresh.$disconnect(); }
    expect(j).toHaveBeenCalledTimes(2); expect((await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).settledMicroUsd).toBe(cost);
    expect(noNetwork).not.toHaveBeenCalled();
  }, 240_000);
  it("a sibling unsure blocks BOTH candidates and never falls into another image attempt", async () => {
    const s = await seed(); await stageLocalPatchPaidRepair(c, s.input); const j = judge(s.gameId, true);
    expect(await tick(s.gameId, j)).toMatchObject({ pending: version >= 10 });
    expect((await readLocalPatchPaidRepair(c, s.gameId))?.state).toBe("blocked");
    const unchanged = await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId: s.gameId } } }, orderBy: { id: "asc" } });
    expect(unchanged.map(r => [r.assetId, r.attempts, r.rectJson, r.status])).toEqual(s.beforeRows.map(r => [r.assetId, r.attempts, r.rectJson, r.status]));
    expect(await db.game.findUniqueOrThrow({ where: { id: s.gameId } })).toMatchObject({ status: version >= 10 ? "TARGETS_GENERATING" : "GENERATION_FAILED", configJson: null, readyAt: null });
    if (version === 8) for (let i = 0; i < 3; i++) expect(await tick(s.gameId, j)).toMatchObject({ claimed: false, pending: false });
    expect(j).toHaveBeenCalledTimes(1); expect(await db.shareLink.count({ where: { gameId: s.gameId } })).toBe(0);
  }, 240_000);
  it.runIf(version >= 10).each(["ageAppropriate", "scaleRight"] as const)("preserves the collection's mandatory %s gate", async check => {
    const s = await seed(); await stageLocalPatchPaidRepair(c, s.input);
    const j = judge(s.gameId, false, check);
    expect(await tick(s.gameId, j)).toMatchObject({ pending: true, attention: null });
    expect((await readLocalPatchPaidRepair(c, s.gameId))?.state).toBe("blocked");
    const unchanged = await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId: s.gameId } } }, orderBy: { id: "asc" } });
    expect(unchanged.map(r => [r.assetId, r.attempts, r.rectJson, r.status])).toEqual(s.beforeRows.map(r => [r.assetId, r.attempts, r.rectJson, r.status]));
    expect(await db.game.findUniqueOrThrow({ where: { id: s.gameId } })).toMatchObject({ status: "TARGETS_GENERATING", configJson: null });
    expect(j).toHaveBeenCalledTimes(1);
  }, 240_000);
  it("refuses same-size substituted staged bytes before any judge purchase", async () => {
    const s = await seed(); await stageLocalPatchPaidRepair(c, s.input); const batch = (await readLocalPatchPaidRepair(c, s.gameId))!;
    const asset = await db.asset.findUniqueOrThrow({ where: { id: batch.candidates[0]!.assetId } });
    const changed = await sharp({ create: { width: 512, height: 768, channels: 4, background: "red" } }).png().toBuffer();
    await c.storage.put(asset.storagePath, changed, "image/png");
    const j = judge(s.gameId); expect((await tick(s.gameId, j)).attention).toContain("pixels");
    expect(j).not.toHaveBeenCalled(); expect((await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).settledMicroUsd).toBe(s.beforeCost);
  }, 240_000);
  it.each(["pixels", "geometry"])("refuses changed pending-sibling %s before staging or buying a review", async kind => {
    const s = await seed(), row = s.beforeRows.find(r => JSON.parse(r.judgeJson!).hide === UNREVIEWED[0])!;
    if (kind === "pixels") {
      const asset = await db.asset.findUniqueOrThrow({ where: { id: row.assetId! } });
      await c.storage.put(asset.storagePath, await sharp({ create: { width: 512, height: 768, channels: 4, background: "red" } }).png().toBuffer(), "image/png");
    } else {
      const rect = JSON.parse(row.hitRectJson!);
      await db.targetVariantAsset.update({ where: { id: row.id }, data: { hitRectJson: JSON.stringify({ ...rect, x: rect.x + 0.01 }) } });
    }
    await expect(stageLocalPatchPaidRepair(c, s.input)).rejects.toThrow("An unapproved sibling is not awaiting its first current review");
    expect(await readLocalPatchPaidRepair(c, s.gameId)).toBeNull();
    expect(await db.asset.count({ where: { providerRequestId: s.gameId, id: { startsWith: "ast_lpmr" } } })).toBe(0);
    expect((await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).settledMicroUsd).toBe(s.beforeCost);
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${s.gameId}` } })).toMatchObject({ status: "DONE", attempts: 38 });
  }, 240_000);
  it("retained paid review survives a worker failure before the batch write and a fresh adapter replays it", async () => {
    const s = await seed(); await stageLocalPatchPaidRepair(c, s.input); const j = judge(s.gameId); let fences = 0;
    await expect(runLocalPatchPaidRepair(c, s.gameId, { judge: j, fence: async () => { if (++fences === 2) throw new Error("synthetic worker vanished after paid reply"); } })).rejects.toThrow("worker vanished");
    expect(j).toHaveBeenCalledTimes(1); const batch = (await readLocalPatchPaidRepair(c, s.gameId))!;
    expect(batch.reviews[0]!.result).toBeNull();
    expect((await boardWizardBudgetOf(c).readRequest(boardWizardWorldId(s.gameId), batch.reviews[0]!.requestKey))?.state).toBe("settled");
    const fresh = new PrismaClient({ datasources: { db: { url } } });
    try { expect(await runLocalPatchPaidRepair({ ...c, db: fresh, storage: new DbStorage(fresh) }, s.gameId, { judge: j, fence: async () => {} })).toMatchObject({ state: "pending" }); }
    finally { await fresh.$disconnect(); }
    expect(j).toHaveBeenCalledTimes(1);
  }, 240_000);
  it("a changed identity pointer before staging refuses without storing any candidate", async () => {
    const s = await seed(); await db.childProfile.update({ where: { id: `chl-${s.gameId}` }, data: { identityAssetId: `ast-photo-${s.gameId}` } });
    await expect(stageLocalPatchPaidRepair(c, s.input)).rejects.toThrow("identity");
    expect(await readLocalPatchPaidRepair(c, s.gameId)).toBeNull();
    expect(await db.asset.count({ where: { providerRequestId: s.gameId, id: { startsWith: "ast_lpmr" } } })).toBe(0);
    expect((await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).settledMicroUsd).toBe(s.beforeCost);
  }, 240_000);
  it("a committed review whose acknowledgement is lost resumes from a fresh client without buying the same review again", async () => {
    const s = await seed(); await stageLocalPatchPaidRepair(c, s.input); const j = judge(s.gameId);
    let lost = false;
    // This is the REAL transaction and REAL database. Only its acknowledgement
    // is faulted after the durable review record demonstrably exists.
    const realTransaction = db.$transaction.bind(db);
    const interruptedDb = new Proxy(db, { get(target, property, receiver) {
      if (property !== "$transaction") return Reflect.get(target, property, receiver);
      return async (...args: unknown[]) => {
        const result: unknown = await Reflect.apply(realTransaction, db, args);
        if (!lost && (await readLocalPatchPaidRepair(c, s.gameId))?.reviews[0]?.result) {
          lost = true; throw new Error("synthetic commit acknowledgement lost");
        }
        return result;
      };
    } });
    expect(await tick(s.gameId, j, { ...c, db: interruptedDb })).toMatchObject({ pending: true, attention: null });
    expect(lost).toBe(true); expect(j).toHaveBeenCalledTimes(1);
    const persisted = (await readLocalPatchPaidRepair(c, s.gameId))!;
    expect(persisted.reviews[0]!.result?.state).toBe("pass"); expect(persisted.reviews[1]!.result).toBeNull();
    const fresh = new PrismaClient({ datasources: { db: { url } } });
    try { expect(await tick(s.gameId, j, { ...c, db: fresh, storage: new DbStorage(fresh) })).toMatchObject({ pending: false, attention: null }); }
    finally { await fresh.$disconnect(); }
    expect(j).toHaveBeenCalledTimes(2);
    expect(await db.game.findUniqueOrThrow({ where: { id: s.gameId } })).toMatchObject({ status: "DELIVERED" });
    expect((await readLocalPatchPaidRepair(c, s.gameId))?.state).toBe("committed");
  }, 240_000);
  it.each(["identity", "refund"])("%s changes between preparation and the staging transaction roll back both candidate writes", async kind => {
    const s = await seed(); let changed = false;
    const realTransaction = db.$transaction.bind(db);
    const racedDb = new Proxy(db, { get(target, property, receiver) {
      if (property !== "$transaction") return Reflect.get(target, property, receiver);
      return async (...args: unknown[]) => {
        if (!changed) {
          changed = true;
          if (kind === "identity") await db.childProfile.update({ where: { id: `chl-${s.gameId}` }, data: { identityAssetId: `ast-photo-${s.gameId}` } });
          else await db.order.update({ where: { id: `order-${s.gameId}` }, data: { paymentStatus: "REFUNDED", refundedAt: new Date() } });
        }
        return Reflect.apply(realTransaction, db, args);
      };
    } });
    await expect(stageLocalPatchPaidRepair({ ...c, db: racedDb }, s.input)).rejects.toThrow(/identity|child|order|paid/i);
    expect(changed).toBe(true); expect(await readLocalPatchPaidRepair(c, s.gameId)).toBeNull();
    expect(await db.asset.count({ where: { providerRequestId: s.gameId, id: { startsWith: "ast_lpmr" } } })).toBe(0);
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${s.gameId}` } })).toMatchObject({ status: "DONE", attempts: 38 });
  }, 240_000);
});
});
