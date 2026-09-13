import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { retainedPurchaseKey } from "../../../infra/db/prisma-retained-purchase-store";
import { MockPaymentProvider } from "../../../infra/payment/mock";
import { MockAvatarProvider, NoopFaceDetector } from "../../../infra/generation/mock";
import { NoPatchJudge } from "../../../infra/generation/judge";
import { NoopAnalytics } from "../../../infra/analytics/console";
import { InlineJobRunner } from "../../../infra/jobs/inline";
import { avatarDisplayFromSheet } from "../../../infra/generation/avatar-cut";
import type { Container } from "../../container";
import type { EmailMessage } from "../../../infra/email/types";
import { GameConfigSchema } from "../../../domain/game/config";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { runLocalPatchWorldSlice, localPatchPrivateInventory, LOCAL_PATCH_STYLE, LOCAL_PATCH_QUALITY_FAILED } from "../local-patch-world";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { runLocalPatchHide, readShippedBoardArt, type LocalPatchHideDeps } from "../local-patch-hide";
import { reviewLocalPatchBoard } from "../local-patch-board-review";
import { stageLocalPatchExtraAttempts, readLocalPatchExtraAttemptPlan } from "../local-patch-extra-attempt";
import type { LocalPatchBoardJudgeRequest, LocalPatchBoardJudgeResult } from "../local-patch-judge";
import { sha256Bytes } from "../fixed-sprite";
import { bill, paintedOk, PASSING_ANSWER, seedApprovedGame } from "./local-patch-fixtures";

const fakes = vi.hoisted(() => ({ testers: [] as string[] }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0,
  GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: fakes.testers }), flag: () => false,
  adminEmails: () => ["synthetic-extra-admin@example.invalid"] }));
// The real reader still validates each exact source/digest once. Reusing those
// immutable bytes avoids repeatedly decoding nine large boards in every grant
// fence; no identity, ledger, geometry, publication or recovery guard is mocked.
vi.mock("../local-patch-hide", async importOriginal => {
  const actual = await importOriginal<typeof import("../local-patch-hide")>();
  const cached = new Map<string, Promise<Buffer>>();
  return { ...actual, readShippedBoardArt: (...args: Parameters<typeof actual.readShippedBoardArt>) => {
    const key = JSON.stringify(args);
    if (!cached.has(key)) cached.set(key, actual.readShippedBoardArt(...args));
    return cached.get(key)!;
  } };
});
const BOARDS = localPatchBoardsForVersion(9);
const SELECTED = ["sydney-v7-5", "amazon-v7-5", "greatwall-v7-5"];
const GOOD = { ...PASSING_ANSWER, faceLikeness: "pass", faceReadable: "pass", severeSeam: "pass", ageAppropriate: "pass" };
const ADMIN = "usr-extra-world-admin";
let dir: string, url: string, db: PrismaClient, c: Container;
const mails: EmailMessage[] = [], art = new Map<string, Buffer>();
beforeAll(async () => {
  dir = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-extra-world-")));
  url = `file:${path.join(dir, "extra.sqlite").split(path.sep).join("/")}`;
  db = new PrismaClient({ datasources: { db: { url } } }); await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), appUrl: "http://localhost:3000", secret: "synthetic-extra-world",
    payment: new MockPaymentProvider("http://localhost:3000", "synthetic"), avatars: new MockAvatarProvider(),
    judge: new NoPatchJudge(), faces: new NoopFaceDetector(), analytics: new NoopAnalytics(), jobs: new InlineJobRunner(),
    email: { id: "console", send: async message => { mails.push(message); return { id: `synthetic-mail-${mails.length}` }; } },
    adminEmails: ["synthetic-extra-admin@example.invalid"] };
  await db.user.create({ data: { id: ADMIN, email: "synthetic-extra-admin@example.invalid" } });
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("No real provider in explicit extra-attempt tests"); }));
}, 180000);
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(dir) === realpathSync(tmpdir()) && path.basename(dir).startsWith("findme-extra-world-")) rmSync(dir, { recursive: true, force: true });
});
const rowsOf = (client: PrismaClient, gameId: string) => client.targetVariantAsset.findMany({
  where: { targetInstance: { gameScene: { gameId } } }, orderBy: { id: "asc" } });
const hideOf = (id: string) => {
  const board = BOARDS.find(b => b.hides.some(h => h.id === id));
  if (!board) throw new Error(`Unknown fixture hide ${id}`);
  return { board, hide: board.hides.find(h => h.id === id)! };
};
async function original(relative: string, digest: string) {
  if (!art.has(relative)) art.set(relative, await readShippedBoardArt(relative, digest));
  return art.get(relative)!;
}
/** Draw inside the ACTUAL outgoing mask, including the scoped recovery mask. */
async function paint(style: Buffer, mask: Buffer, attempt: number) {
  const { data, info } = await sharp(mask).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * info.channels + info.channels - 1] === 0) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  if (x1 < x0 || y1 < y0) throw new Error("Synthetic painter received no editable pixels");
  const width = Math.max(4, Math.floor((x1 - x0 + 1) * .6)), height = Math.max(4, Math.floor((y1 - y0 + 1) * .7));
  return sharp(style).composite([{ input: { create: { width, height, channels: 4,
    background: { r: 20 * attempt, g: 40, b: 180, alpha: 1 } } },
    left: x0 + Math.floor((x1 - x0 + 1 - width) / 2), top: y0 + Math.floor((y1 - y0 + 1 - height) / 2) }]).png().toBuffer();
}

async function seed(gameId: string, reviewOnlyAmazon = false) {
  const seeded = await seedApprovedGame(c, db, { gameId, approved: false, styleVersion: LOCAL_PATCH_STYLE,
    status: "TARGETS_GENERATING", withJob: true, scenes: BOARDS.map(b => ({ slug: b.board, version: 9 })) });
  fakes.testers.push(seeded.email);
  await c.storage.put(`private/photo-${gameId}.jpg`, seeded.sheet, "image/png");
  const avatarId = `ast-avatar-${gameId}`, avatar = await avatarDisplayFromSheet(seeded.sheet, 1024);
  await c.storage.put(`game/${avatarId}.png`, avatar, "image/png");
  await db.asset.create({ data: { id: avatarId, ownerId: seeded.userId, type: "AVATAR", visibility: "GAME", status: "READY",
    storagePath: `game/${avatarId}.png`, mimeType: "image/png", width: 512, height: 512, bytes: avatar.length } });
  await db.childProfile.update({ where: { id: `chl-${gameId}` }, data: { avatarAssetId: avatarId, ageYears: 5 } });
  await db.game.update({ where: { id: gameId }, data: { paidAt: new Date() } });
  await db.order.create({ data: { id: `ord-${gameId}`, gameId, userId: seeded.userId, amountAgorot: 100,
    packageTier: "ONE_WORLD", provider: "mock", paymentStatus: "PAID", paidAt: new Date() } });
  const { sha256: catalogSha256 } = await readBoardConditionedCatalog();
  await reviewBoardWizardIdentity({ db, apiKey: "synthetic", budget: boardWizardBudgetOf(c), beforeDispatch: async () => {},
    write: work => db.$transaction(work), reviewer: { review: async () => ({ httpOk: true, requestId: `req-${gameId}-identity`,
      body: { model: "gpt-5.6-luna", usage: { prompt_tokens: 1500, completion_tokens: 150 }, choices: [{ finish_reason: "stop", message: {
        content: JSON.stringify({ checks: { identity: "pass", age: "pass", paintedStyle: "pass", sheetLayout: "pass" }, reason: "Synthetic age-five canonical identity" }) } }] } }) } },
  { gameId, identityAssetId: `ast-sheet-${gameId}`, sheet: seeded.sheet, photo: seeded.sheet, atlas: seeded.sheet, contentVersion: 9,
    provenance: { promptVersion: "character-v4-board-drawn-face-reference", quality: "medium", photoAssetId: `ast-photo-${gameId}`,
      photoSha256: sha256Bytes(seeded.sheet), ageYears: 5, crop: null,
      style: { version: "board-matched-identity/v2", catalogSha256, atlasSha256: sha256Bytes(seeded.sheet) } } });
  const seedPaints: string[] = [], seedReviews: string[] = [];
  const deps: LocalPatchHideDeps = { renderPolicySha256: "e".repeat(64), readBoardArt: original,
    judge: async () => { throw new Error("No per-hide judge"); },
    render: async ({ requestKey, stylePng, maskPng }) => {
      seedPaints.push(requestKey);
      const png = requestKey.startsWith("greatwall-v7-5:")
        ? await sharp({ create: { width: 512, height: 768, channels: 4, background: "#ff0000" } }).png().toBuffer()
        : await paint(stylePng, maskPng, Number(requestKey.split(":").at(-1)));
      return paintedOk(png, bill(`req-${gameId}-${requestKey}`));
    } };
  const review = async (boardId: string) => {
    const answer = await reviewLocalPatchBoard(c, { gameId, sceneId: `gsc-${gameId}-${boardId}` }, { fence: async () => {},
      judge: async (request): Promise<LocalPatchBoardJudgeResult> => {
        seedReviews.push(request.boardId);
        return { verdict: null, verdicts: {}, raw: JSON.stringify({ hides: request.hides.map(h => ({ hideId: h.hideId,
          evidenceIds: [`${h.hideId}:before`, `${h.hideId}:after`], verdict: reviewOnlyAmazon && h.hideId === "amazon-v7-5"
            ? { ...GOOD, ageAppropriate: "unsure", scaleRight: "unsure", verdict: "unsure", faults: [],
              reason: "The body is naturally hidden behind the authored foreground; neither whole-body age nor visible scale can be established in this question." }
            : SELECTED.includes(h.hideId)
            ? { ...GOOD, faceReadable: "fail", verdict: "fail", faults: [{ check: "faceReadable", where: "The target's upper face is clipped by the foreground object." }] }
            : GOOD })) }), model: "gpt-5.6-luna", requestId: `req-${gameId}-review-${seedReviews.length}`,
          usage: { prompt_tokens: 9000, completion_tokens: 1300 }, finishReason: "stop", wireFault: null, costUnknown: false };
      } });
    await db.gameScene.update({ where: { id: `gsc-${gameId}-${boardId}` }, data: { generationStatus: answer.state === "done" ? "GENERATED" : "NEEDS_REGENERATION" } });
  };
  for (const board of BOARDS) for (const hide of board.hides) await runLocalPatchHide(c, deps, { gameId, board, hide });
  for (const board of BOARDS.filter(b => b.board !== "greatwall")) await review(board.board);
  for (const id of SELECTED) {
    const { board, hide } = hideOf(id);
    await runLocalPatchHide(c, deps, { gameId, board, hide });
    if (board.board !== "greatwall") await review(board.board);
    await runLocalPatchHide(c, deps, { gameId, board, hide, finalRepair: true });
    if (board.board !== "greatwall") await review(board.board);
  }
  const all = await rowsOf(db, gameId);
  expect(all).toHaveLength(45);
  expect(all.filter(row => row.status === "FAILED")).toHaveLength(3);
  expect(all.filter(row => row.status === "FAILED").every(row => row.attempts === 3)).toBe(true);
  expect(all.filter(row => row.status === "GENERATED" && JSON.parse(row.judgeJson!).reviewState === "pending-board-review")).toHaveLength(4);
  expect(all.filter(row => row.status === "GENERATED" && JSON.parse(row.judgeJson!).reviewState === "board-review-complete")).toHaveLength(38);
  expect(seedPaints).toHaveLength(51);
  await db.game.update({ where: { id: gameId }, data: { status: "GENERATION_FAILED", lastError: "Three appearances exhausted their original allowance" } });
  await db.generationJob.update({ where: { id: `job_${gameId}` }, data: { status: "DONE", currentStep: LOCAL_PATCH_QUALITY_FAILED } });
  return { ...seeded, all, deps, seedPaints };
}

describe("explicitly bounded fourth images and unchanged-image review", () => {
  it.each([
    { complete: true, reviewOnlyAmazon: false },
    { complete: false, reviewOnlyAmazon: false },
    { complete: true, reviewOnlyAmazon: true },
  ])("completes=$complete reviewOnly=$reviewOnlyAmazon: keeps existing images and never invents a fifth", async ({ complete, reviewOnlyAmazon }) => {
    const gameId = `extra-world-${complete ? "completes" : "fails"}${reviewOnlyAmazon ? "-review-only" : ""}`, s = await seed(gameId, reviewOnlyAmazon);
    const selectedIds = reviewOnlyAmazon ? SELECTED.filter(id => id !== "amazon-v7-5") : SELECTED;
    const imageCount = selectedIds.length;
    const worldId = boardWizardWorldId(gameId), beforeCost = await boardWizardBudgetOf(c).audit(worldId), beforeMails = mails.length;
    const priorBills = await Promise.all(s.seedPaints.map(key => boardWizardBudgetOf(c).readRequest(worldId, key)));
    const retainedKeys = s.seedPaints.map(key => retainedPurchaseKey(worldId, key));
    const priorRaw = new Map((await db.fileBlob.findMany({ where: { key: { in: retainedKeys } } }))
      .map(blob => [blob.key, sha256Bytes(Buffer.from(blob.data))]));
    expect(priorRaw.size).toBe(51);
    const failed = s.all.filter(row => row.status === "FAILED"), others = s.all.filter(row => row.status === "GENERATED");
    const oldAmazon = failed.find(row => JSON.parse(row.judgeJson!).hide === "amazon-v7-5")!;
    const oldAmazonReceipt = JSON.parse(oldAmazon.judgeJson!);
    const oldAmazonReviewKey: string = oldAmazonReceipt.boardReview.requestKey;
    const oldAmazonBill = await boardWizardBudgetOf(c).readRequest(worldId, oldAmazonReviewKey);
    const oldAmazonReviewBlob = await db.fileBlob.findUniqueOrThrow({ where: { key: retainedPurchaseKey(worldId, oldAmazonReviewKey) } });
    const oldAmazonReviewSha = sha256Bytes(Buffer.from(oldAmazonReviewBlob.data));
    const oldAmazonAsset = await db.asset.findUniqueOrThrow({ where: { id: oldAmazon.assetId! } });
    const oldAmazonImageSha = sha256Bytes(await c.storage.get(oldAmazonAsset.storagePath));
    if (reviewOnlyAmazon) expect(oldAmazonReceipt.verdict).toMatchObject({ ageAppropriate: "unsure", scaleRight: "unsure", verdict: "unsure", faults: [] });
    const oldPixels = new Map<string, string>();
    for (const row of others) {
      const asset = await db.asset.findUniqueOrThrow({ where: { id: row.assetId! } });
      oldPixels.set(row.id, sha256Bytes(await c.storage.get(asset.storagePath)));
    }
    const first = hideOf(SELECTED[0]!);
    expect(await runLocalPatchHide(c, s.deps, { gameId, ...first, finalRepair: true })).toMatchObject({ state: "gave-up", attempt: 3 });
    expect(s.seedPaints).toHaveLength(51);
    const plan = await stageLocalPatchExtraAttempts(c, { gameId, operatorId: ADMIN,
      reason: reviewOnlyAmazon
        ? "The parent authorized one additional image for Sydney and Greatwall, and only a fresh visible-body review of Amazon's existing third image, within the same cap."
        : "The parent explicitly authorized one additional image for each of these three exhausted hiding places, within the same four-dollar cap.",
      hideIds: selectedIds, ...(reviewOnlyAmazon ? { reviewOnlyHideIds: ["amazon-v7-5"] } : {}) });
    expect(plan.selected).toHaveLength(imageCount);
    expect(plan.reviewOnly).toHaveLength(reviewOnlyAmazon ? 1 : 0);
    expect(plan.reviewRequestKeys.every(key => key.endsWith(":visible-body-v1"))).toBe(true);
    expect(plan.reviewRequestKeys).not.toContain(oldAmazonReviewKey);
    expect(plan.selected.every(item => item.originalAttempt === 3 && item.authorizedAttempt === 4)).toBe(true);
    expect(await rowsOf(db, gameId)).toEqual(s.all);
    expect((await boardWizardBudgetOf(c).audit(worldId)).committedMicroUsd).toBe(beforeCost.committedMicroUsd);
    const inventory = await localPatchPrivateInventory(c, gameId);
    for (const item of plan.selected) expect(inventory.retainedPurchaseKeys).toContain(retainedPurchaseKey(worldId, item.requestKey));
    const paints: string[] = [], questions: LocalPatchBoardJudgeRequest[] = [];
    const deps: LocalPatchHideDeps = { ...s.deps, render: async ({ requestKey, stylePng, maskPng }) => {
      expect(requestKey).toMatch(/:render:4$/);
      expect(plan.selected.map(item => item.requestKey)).toContain(requestKey);
      paints.push(requestKey); return paintedOk(await paint(stylePng, maskPng, 4), bill(`req-${gameId}-${requestKey}`));
    } };
    const boardJudge = vi.fn(async (request: LocalPatchBoardJudgeRequest): Promise<LocalPatchBoardJudgeResult> => {
      questions.push(request);
      expect(request.assessmentMode).toBe("visible-body-v1");
      return { verdict: null, verdicts: {}, raw: JSON.stringify({ hides: request.hides.map(h => ({ hideId: h.hideId,
        evidenceIds: [`${h.hideId}:before`, `${h.hideId}:after`], verdict: reviewOnlyAmazon && h.hideId === "amazon-v7-5"
          ? { ...GOOD, ageAppropriate: "unsure", scaleRight: "pass", verdict: "unsure", faults: [],
            reason: "Only whole-body age is hidden by authored natural occlusion; the canonical face and visible head scale are clear." }
          : !complete && SELECTED.includes(h.hideId)
          ? { ...GOOD, faceReadable: "fail", verdict: "fail", faults: [{ check: "faceReadable", where: "The new target face is still visibly cut." }] }
          : GOOD })) }), model: "gpt-5.6-luna", requestId: `req-${gameId}-extra-review-${questions.length}`,
        usage: { prompt_tokens: 9000, completion_tokens: 1300 }, finishReason: "stop", wireFault: null, costUnknown: false };
    });
    // A paid response survives a loss of the publication fence. A new client
    // must finish this SAME pending4, not create another request key.
    let fences = 0;
    await expect(runLocalPatchHide(c, { ...deps, fence: async () => { if (++fences === 2) throw new Error("synthetic lost publication claim"); } },
      { gameId, ...first, extraAttemptAuthorizationId: plan.authorizationId })).rejects.toThrow("synthetic lost publication claim");
    const pending = await db.targetVariantAsset.findUniqueOrThrow({ where: { id: failed.find(row => JSON.parse(row.judgeJson!).hide === first.hide.id)!.id } });
    expect(pending).toMatchObject({ status: "PENDING", attempts: 4 });
    expect(paints).toHaveLength(1);
    const fresh = new PrismaClient({ datasources: { db: { url } } });
    try {
      const next: Container = { ...c, db: fresh, storage: new DbStorage(fresh) };
      for (let tick = 0; tick < 10; tick++) {
        const outcome = await runLocalPatchWorldSlice(next, deps, gameId, { maxHides: 1, boardJudge, hardDeadlineAt: Date.now() + 270000 });
        expect(outcome.blocked).toEqual([]);
        if (!outcome.pending) break;
      }
      const game = await fresh.game.findUniqueOrThrow({ where: { id: gameId } });
      const after = await rowsOf(fresh, gameId);
      expect(paints).toHaveLength(imageCount); expect(new Set(paints).size).toBe(imageCount);
      expect(await Promise.all(s.seedPaints.map(key => boardWizardBudgetOf(next).readRequest(worldId, key)))).toEqual(priorBills);
      const afterRaw = await fresh.fileBlob.findMany({ where: { key: { in: retainedKeys } } });
      expect(afterRaw).toHaveLength(51);
      for (const blob of afterRaw)
        expect(sha256Bytes(Buffer.from(blob.data))).toBe(priorRaw.get(blob.key));
      expect(questions).toHaveLength(3); expect(new Set(questions.map(q => q.boardId))).toEqual(new Set(["sydney", "amazon", "greatwall"]));
      expect(await boardWizardBudgetOf(next).readRequest(worldId, oldAmazonReviewKey)).toEqual(oldAmazonBill);
      expect(sha256Bytes(Buffer.from((await fresh.fileBlob.findUniqueOrThrow({ where: {
        key: retainedPurchaseKey(worldId, oldAmazonReviewKey) } })).data))).toBe(oldAmazonReviewSha);
      if (reviewOnlyAmazon) {
        const amazon = after.find(row => row.id === oldAmazon.id)!;
        expect(amazon).toMatchObject({ status: "GENERATED", attempts: 3, assetId: oldAmazon.assetId,
          rectJson: oldAmazon.rectJson, hitRectJson: oldAmazon.hitRectJson, headAnchorJson: oldAmazon.headAnchorJson, costCents: oldAmazon.costCents });
        expect(sha256Bytes(await next.storage.get(oldAmazonAsset.storagePath))).toBe(oldAmazonImageSha);
        expect(JSON.parse(amazon.judgeJson!)).toMatchObject({
          verdict: { ageAppropriate: "unsure", scaleRight: "pass", verdict: "unsure", faults: [] },
          qualityDisposition: { state: "acceptable", contextualWarning: { policy: "authored-peeking-occluded-body-age/v1", hideId: "amazon-v7-5", check: "ageAppropriate" } },
          boardReview: { assessmentMode: "visible-body-v1", extraAttemptAuthorizationId: plan.authorizationId },
        });
        const newReviewKey: string = JSON.parse(amazon.judgeJson!).boardReview.requestKey;
        expect(newReviewKey).not.toBe(oldAmazonReviewKey);
        expect(plan.reviewRequestKeys).toContain(newReviewKey);
        const forbiddenImageKey = `amazon-v7-5:${hideOf("amazon-v7-5").hide.pose}:render:4`;
        expect(paints).not.toContain(forbiddenImageKey);
        expect(await boardWizardBudgetOf(next).readRequest(worldId, forbiddenImageKey)).toBeNull();
        expect(await fresh.fileBlob.findUnique({ where: { key: retainedPurchaseKey(worldId, forbiddenImageKey) } })).toBeNull();
      }
      for (const old of others) {
        const current = after.find(row => row.id === old.id)!;
        expect(current).toMatchObject({ assetId: old.assetId, attempts: old.attempts, rectJson: old.rectJson,
          hitRectJson: old.hitRectJson, headAnchorJson: old.headAnchorJson, costCents: old.costCents });
        const asset = await fresh.asset.findUniqueOrThrow({ where: { id: current.assetId! } });
        expect(sha256Bytes(await next.storage.get(asset.storagePath))).toBe(oldPixels.get(old.id));
        if (JSON.parse(old.judgeJson!).reviewState === "board-review-complete") expect(current).toEqual(old);
        else expect(JSON.parse(current.judgeJson!)).toMatchObject({ reviewState: "board-review-complete", verdict: { faceReadable: "pass" },
          boardReview: { version: "local-patch-board-five-quality/v5-evidence-labeled" } });
      }
      expect(after.filter(row => row.attempts === 4)).toHaveLength(imageCount);
      expect(await readLocalPatchExtraAttemptPlan(next, gameId)).toEqual(plan);
      if (complete) {
        expect(game.status, game.lastError ?? "").toBe("DELIVERED");
        expect(GameConfigSchema.parse(JSON.parse(game.configJson!)).scenes.flatMap(scene => scene.targets)).toHaveLength(45);
        expect(mails.slice(beforeMails).filter(message => message.tag === "game-ready")).toHaveLength(1);
      } else {
        expect(game).toMatchObject({ status: "GENERATION_FAILED", configJson: null, readyAt: null });
        expect(after.filter(row => row.status === "FAILED")).toHaveLength(3);
        expect(await fresh.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } })).toMatchObject({ status: "DONE", currentStep: LOCAL_PATCH_QUALITY_FAILED });
        expect(mails.slice(beforeMails).filter(message => message.tag === "game-ready")).toHaveLength(0);
      }
      const cost = await boardWizardBudgetOf(next).audit(worldId);
      expect(cost).toMatchObject({ capMicroUsd: 4_000_000, held: false, reservedMicroUsd: 0 });
      expect(cost.committedMicroUsd).toBeGreaterThan(beforeCost.committedMicroUsd + imageCount * 48800);
      expect(cost.committedMicroUsd).toBeLessThan(4_000_000);
      for (let tick = 0; tick < 3; tick++) expect(await runLocalPatchWorldSlice(next, deps, gameId, { boardJudge })).toMatchObject({ pending: false, claimed: false });
      expect((await boardWizardBudgetOf(next).audit(worldId)).committedMicroUsd).toBe(cost.committedMicroUsd);
      expect(paints).toHaveLength(imageCount); expect(questions).toHaveLength(3);
      expect(fetch).not.toHaveBeenCalled();
    } finally { await fresh.$disconnect(); }
  }, 240000);
});
