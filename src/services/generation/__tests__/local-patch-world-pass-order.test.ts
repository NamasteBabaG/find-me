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
import { PrismaRetainedPurchaseStore } from "../../../infra/db/prisma-retained-purchase-store";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { maskForHide } from "../../../domain/scene/local-patch-hides";
import type { Container } from "../../container";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { sha256Bytes } from "../fixed-sprite";
import { LOCAL_PATCH_QUALITY_FAILED, LOCAL_PATCH_STYLE, runLocalPatchWorldSlice } from "../local-patch-world";
import { runLocalPatchHide, type LocalPatchHideDeps } from "../local-patch-hide";
import type { LocalPatchBoardJudgeRequest, LocalPatchBoardJudgeResult } from "../local-patch-judge";
import { bill, boardPng, paintedCrop, paintedOk, PASSING_ANSWER, seedApprovedGame } from "./local-patch-fixtures";

const fakes = vi.hoisted(() => ({ testers: [] as string[] }));
vi.mock("../../../lib/env", () => ({
  env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0,
    GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: fakes.testers }),
  flag: () => false, adminEmails: () => [],
}));

const BOARDS = localPatchBoardsForVersion(9), HIDES = BOARDS.flatMap(board => board.hides);
const EARLY = HIDES[0]!, LATE = HIDES.at(-1)!;
const GOOD = { ...PASSING_ANSWER, faceLikeness: "pass", faceReadable: "pass", severeSeam: "pass", ageAppropriate: "pass" };
let dir: string, url: string, db: PrismaClient, c: Container, original: Buffer;
beforeAll(async () => {
  dir = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-pass-order-")));
  url = `file:${path.join(dir, "world.sqlite").split(path.sep).join("/")}`;
  db = new PrismaClient({ datasources: { db: { url } } }); await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), appUrl: "http://localhost:3000", secret: "synthetic-pass-order",
    payment: new MockPaymentProvider("http://localhost:3000", "synthetic"), avatars: new MockAvatarProvider(),
    judge: new NoPatchJudge(), faces: new NoopFaceDetector(), analytics: new NoopAnalytics(), jobs: new InlineJobRunner(),
    email: { id: "console", send: async () => ({ id: "synthetic-mail" }) }, adminEmails: [] };
  original = await boardPng();
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Live network is forbidden in pass-order tests"); }));
}, 180_000);
afterAll(async () => {
  vi.restoreAllMocks(); vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(dir) === realpathSync(tmpdir()) && path.basename(dir).startsWith("findme-pass-order-")) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function seed(gameId: string, wholeWorld = true) {
  const seeded = await seedApprovedGame(c, db, { gameId, approved: false, styleVersion: LOCAL_PATCH_STYLE,
    status: "TARGETS_GENERATING", withJob: true,
    scenes: (wholeWorld ? BOARDS : BOARDS.slice(0, 1)).map(board => ({ slug: board.board, version: 9 })) });
  fakes.testers.push(seeded.email);
  await c.storage.put(`private/photo-${gameId}.jpg`, seeded.sheet, "image/png");
  await db.childProfile.update({ where: { id: `chl-${gameId}` }, data: { ageYears: 5 } });
  const { sha256: catalogSha256 } = await readBoardConditionedCatalog();
  await reviewBoardWizardIdentity({ db, apiKey: "synthetic", budget: boardWizardBudgetOf(c), beforeDispatch: async () => {},
    write: work => db.$transaction(work), reviewer: { review: async () => ({ httpOk: true, requestId: `req-${gameId}-identity`,
      body: { model: "gpt-5.6-luna", usage: { prompt_tokens: 1500, completion_tokens: 150 }, choices: [{ finish_reason: "stop", message: {
        content: JSON.stringify({ checks: { identity: "pass", age: "pass", paintedStyle: "pass", sheetLayout: "pass" }, reason: "Synthetic approved age-five identity" }) } }] } }) } },
  { gameId, identityAssetId: `ast-sheet-${gameId}`, sheet: seeded.sheet, photo: seeded.sheet, atlas: seeded.sheet, contentVersion: 9,
    provenance: { promptVersion: "character-v4-board-drawn-face-reference", quality: "medium", photoAssetId: `ast-photo-${gameId}`,
      photoSha256: sha256Bytes(seeded.sheet), ageYears: 5, crop: null,
      style: { version: "board-matched-identity/v2", catalogSha256, atlasSha256: sha256Bytes(seeded.sheet) } } });
}

function painter(gameId: string, calls: string[], afterPaint?: (hideId: string, attempt: number) => void): LocalPatchHideDeps {
  return { renderPolicySha256: "f".repeat(64), readBoardArt: async () => original,
    judge: async () => { throw new Error("Version nine must use a grouped review, not a per-hide purchase"); },
    render: async ({ requestKey, stylePng }) => {
      const hide = HIDES.find(item => requestKey.startsWith(`${item.id}:`));
      if (!hide) throw new Error(`Unexpected synthetic request ${requestKey}`);
      const attempt = Number(requestKey.split(":").at(-1)), mask = maskForHide(hide);
      calls.push(requestKey);
      // Different paid attempts have different bytes; a changed question cannot
      // pass by accidentally replaying an identical synthetic image.
      const png = await sharp(await paintedCrop(stylePng, hide)).composite([{
        input: { create: { width: 4, height: 4, channels: 4, background: { r: 30 * attempt, g: 20, b: 190, alpha: 1 } } },
        left: mask.left + Math.floor(mask.width / 2), top: mask.top + Math.floor(mask.height / 2),
      }]).png().toBuffer();
      afterPaint?.(hide.id, attempt);
      return paintedOk(png, bill(`req-${gameId}-${requestKey}`));
    } };
}

function answer(request: LocalPatchBoardJudgeRequest, requestId: string, verdict: (hideId: string) => unknown): LocalPatchBoardJudgeResult {
  return { verdict: null, verdicts: {}, raw: JSON.stringify({ hides: request.hides.map(hide => ({ hideId: hide.hideId,
    evidenceIds: [`${hide.hideId}:before`, `${hide.hideId}:after`], verdict: verdict(hide.hideId) })) }),
    model: "gpt-5.6-luna", requestId, usage: { prompt_tokens: 9000, completion_tokens: 1400 }, finishReason: "stop", wireFault: null, costUnknown: false };
}

describe("world-wide first renders before bounded repair passes", () => {
  it("finishes all 45 first purchases, then every second candidate and delayed review, before the last repair; never buys a fourth", async () => {
    const gameId = "pass-order-whole-world"; await seed(gameId);
    const paints: string[] = [], events: string[] = [], latest = new Map<string, number>();
    let now = Date.now(), reviewCalls = 0;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    const deps = painter(gameId, paints, (hideId, attempt) => {
      latest.set(hideId, attempt); events.push(`paint:${hideId}:${attempt}`);
      // Leave enough room to retain the paid render, but not to dispatch its
      // review. Attempt three must wait for a fresh tick to finish that review.
      if (hideId === LATE.id && attempt === 2) now += 245_000;
    });
    const judge = vi.fn(async (request: LocalPatchBoardJudgeRequest) => {
      events.push(`review:${request.boardId}:${request.hides.map(h => latest.get(h.hideId)).join(",")}`);
      return answer(request, `req-${gameId}-review-${++reviewCalls}`, hideId => {
        const failed = hideId === EARLY.id || (hideId === LATE.id && latest.get(hideId) === 1);
        return failed ? { ...GOOD, faceLikeness: "fail", verdict: "fail", reason: "Different canonical face",
          faults: [{ check: "faceLikeness", where: "The target's face at the center of its labeled after crop has different hair and eyes." }] } : GOOD;
      });
    });
    const tick = async (maxHides = 5, container = c) => {
      now += 300_000;
      return runLocalPatchWorldSlice(container, deps, gameId, { maxHides, boardJudge: judge, hardDeadlineAt: now + 270_000 });
    };
    try {
      for (let i = 0; i < 9; i++) expect((await tick()).pending).toBe(true);
      expect(paints).toHaveLength(45);
      expect(paints.every(key => key.endsWith(":1")), events.join("\n")).toBe(true);
      expect(new Set(paints).size).toBe(45);
      expect(judge).toHaveBeenCalledTimes(9);
      expect((await tick(1)).outcomes[0]).toMatchObject({ hideId: EARLY.id, attempt: 2 });
      expect(judge).toHaveBeenCalledTimes(10);
      expect((await tick(1)).outcomes[0]).toMatchObject({ hideId: LATE.id, attempt: 2 });
      expect(paints).toHaveLength(47); expect(judge).toHaveBeenCalledTimes(10);
      // No image is bought in the deferred-review tick, despite early failure2.
      expect((await tick(1)).outcomes).toEqual([]);
      expect(paints).toHaveLength(47); expect(judge).toHaveBeenCalledTimes(11);
      const last = await tick(1);
      expect(last.outcomes[0]).toMatchObject({ hideId: EARLY.id, attempt: 3 });
      expect(last.pending).toBe(false);
      expect(paints).toHaveLength(48); expect(new Set(paints).size).toBe(48);
      expect(paints.filter(key => key.endsWith(":2"))).toHaveLength(2);
      expect(paints.filter(key => key.endsWith(":3"))).toHaveLength(1);
      expect(judge).toHaveBeenCalledTimes(12);
      expect(await db.game.findUniqueOrThrow({ where: { id: gameId } })).toMatchObject({ status: "GENERATION_FAILED", configJson: null });
      expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } })).toMatchObject({ status: "DONE", currentStep: LOCAL_PATCH_QUALITY_FAILED });
      const before = await boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId));
      expect(before).toMatchObject({ held: false, reservedMicroUsd: 0 });
      const fresh = new PrismaClient({ datasources: { db: { url } } });
      try {
        const next = { ...c, db: fresh, storage: new DbStorage(fresh) };
        for (let i = 0; i < 3; i++) expect(await tick(5, next)).toMatchObject({ pending: false, claimed: false });
        expect(await boardWizardBudgetOf(next).audit(boardWizardWorldId(gameId))).toEqual(before);
      } finally { await fresh.$disconnect(); }
      expect(paints).toHaveLength(48); expect(judge).toHaveBeenCalledTimes(12);
      expect(fetch).not.toHaveBeenCalled();
    } finally { clock.mockRestore(); }
  }, 240_000);

  it("resumes a paid PENDING first attempt through a fresh queue worker, with the same key and no second image purchase", async () => {
    const gameId = "pass-order-paid-pending"; await seed(gameId, false);
    const paints: string[] = [], deps = painter(gameId, paints);
    // A real database abort AFTER retained bytes and settlement, BEFORE the
    // target becomes GENERATED. No permissive in-memory ledger is involved.
    await db.$executeRawUnsafe(`CREATE TRIGGER synthetic_pending_publish BEFORE UPDATE OF status ON TargetVariantAsset
      WHEN NEW.status = 'GENERATED' AND NEW.targetInstanceId IN (
        SELECT t.id FROM TargetInstance t JOIN GameScene s ON s.id = t.gameSceneId WHERE s.gameId = 'pass-order-paid-pending')
      BEGIN SELECT RAISE(ABORT, 'synthetic pending publication interruption'); END`);
    try {
      await expect(runLocalPatchWorldSlice(c, deps, gameId, { maxHides: 1, hardDeadlineAt: Date.now() + 270_000 }))
        .rejects.toMatchObject({ code: "P2003" }); // Prisma maps SQLite RAISE(ABORT) to this constraint error.
    } finally { await db.$executeRawUnsafe("DROP TRIGGER synthetic_pending_publish"); }
    const row = await db.targetVariantAsset.findFirstOrThrow({ where: { targetInstance: { gameScene: { gameId } } } });
    expect(row).toMatchObject({ status: "PENDING", attempts: 1 });
    const worldId = boardWizardWorldId(gameId), key = `${EARLY.id}:${EARLY.pose}:render:1`;
    const before = await boardWizardBudgetOf(c).audit(worldId);
    expect(await boardWizardBudgetOf(c).readRequest(worldId, key)).toMatchObject({ state: "settled" });
    const retained = await new PrismaRetainedPurchaseStore(db).get(worldId, key);
    expect(retained).not.toBeNull(); expect(paints).toEqual([key]);
    const fresh = new PrismaClient({ datasources: { db: { url } } });
    try {
      const next = { ...c, db: fresh, storage: new DbStorage(fresh) };
      const resumed = await runLocalPatchWorldSlice(next, deps, gameId, { maxHides: 1, hardDeadlineAt: Date.now() + 270_000 });
      expect(resumed.outcomes[0]).toMatchObject({ hideId: EARLY.id, state: "generated", attempt: 1, replayed: true });
      expect(paints).toEqual([key]);
      expect(await new PrismaRetainedPurchaseStore(fresh).get(worldId, key)).toEqual(retained);
      expect(await boardWizardBudgetOf(next).audit(worldId)).toEqual(before);
      expect((await runLocalPatchWorldSlice(next, deps, gameId, { maxHides: 1, hardDeadlineAt: Date.now() + 270_000 })).outcomes[0])
        .toMatchObject({ hideId: HIDES[1]!.id, attempt: 1 });
      expect(paints).toEqual([key, `${HIDES[1]!.id}:${HIDES[1]!.pose}:render:1`]);
    } finally { await fresh.$disconnect(); }
    expect(fetch).not.toHaveBeenCalled();
  }, 120_000);

  it("replays a paid PENDING third attempt before untouched/failed-first hides and an unreviewed board, without buying a fourth", async () => {
    const gameId = "pass-order-paid-third"; await seed(gameId);
    const paints: string[] = [], normal = painter(gameId, paints);
    const refusedRaw = await sharp({ create: { width: 512, height: 768, channels: 4, background: "#ff0000" } }).png().toBuffer();
    const deps: LocalPatchHideDeps = { ...normal, render: async input => {
      const shouldRefuse = input.requestKey.startsWith(`${EARLY.id}:`) && !input.requestKey.endsWith(":3")
        || input.requestKey.startsWith(`${HIDES[1]!.id}:`);
      if (!shouldRefuse) return normal.render(input);
      paints.push(input.requestKey);
      return paintedOk(refusedRaw, bill(`req-${gameId}-${input.requestKey}`));
    } };
    // Reproduce durable historical state with the real paid operation, not
    // fabricated attempts: two refusals, then a third paid image not published.
    for (let attempt = 1; attempt <= 2; attempt++) {
      expect(await runLocalPatchHide(c, deps, { gameId, board: BOARDS[0]!, hide: EARLY }))
        .toMatchObject({ attempt, state: attempt === 1 ? "refused" : "gave-up" });
    }
    let fences = 0;
    await expect(runLocalPatchHide(c, { ...deps, fence: async () => {
      if (++fences === 2) throw new Error("synthetic third publication interruption");
    } }, { gameId, board: BOARDS[0]!, hide: EARLY, finalRepair: true })).rejects.toThrow("synthetic third publication interruption");
    expect(await runLocalPatchHide(c, deps, { gameId, board: BOARDS[0]!, hide: HIDES[1]! })).toMatchObject({ state: "refused", attempt: 1 });
    for (const hide of BOARDS[1]!.hides) {
      expect(await runLocalPatchHide(c, deps, { gameId, board: BOARDS[1]!, hide })).toMatchObject({ state: "generated", attempt: 1 });
    }
    const worldId = boardWizardWorldId(gameId), key = `${EARLY.id}:${EARLY.pose}:render:3`;
    const retained = await new PrismaRetainedPurchaseStore(db).get(worldId, key);
    const originalBill = await boardWizardBudgetOf(c).readRequest(worldId, key);
    expect(originalBill).toMatchObject({ state: "settled" }); expect(retained).not.toBeNull();
    const before = [...paints];
    const judge = vi.fn(async (request: LocalPatchBoardJudgeRequest) => answer(request, `req-${gameId}-${request.boardId}`, () => GOOD));
    const fresh = new PrismaClient({ datasources: { db: { url } } });
    try {
      const next = { ...c, db: fresh, storage: new DbStorage(fresh) };
      const resumed = await runLocalPatchWorldSlice(next, deps, gameId, { maxHides: 1, boardJudge: judge, hardDeadlineAt: Date.now() + 270_000 });
      expect(resumed.outcomes).toHaveLength(1);
      expect(resumed.outcomes[0]).toMatchObject({ hideId: EARLY.id, state: "generated", attempt: 3, replayed: true });
      expect(paints).toEqual(before);
      expect(await new PrismaRetainedPurchaseStore(fresh).get(worldId, key)).toEqual(retained);
      expect(await boardWizardBudgetOf(next).readRequest(worldId, key)).toEqual(originalBill);
      expect(judge).toHaveBeenCalledTimes(1); // The other board still receives its real grouped review.
      const pendingFirst = await fresh.targetVariantAsset.findFirstOrThrow({ where: {
        targetInstance: { gameScene: { gameId, sceneSlug: BOARDS[0]!.board }, targetId: HIDES[1]!.targetId },
      } });
      expect(pendingFirst).toMatchObject({ status: "FAILED", attempts: 1 });
      expect(await fresh.targetVariantAsset.count({ where: { targetInstance: { gameScene: { gameId } } } })).toBe(7);
    } finally { await fresh.$disconnect(); }
    expect(fetch).not.toHaveBeenCalled();
  }, 120_000);

  it("does not turn an unreadable paid review into permission for another image on later ticks", async () => {
    const gameId = "pass-order-bad-wire"; await seed(gameId);
    const paints: string[] = [], deps = painter(gameId, paints);
    const judge = vi.fn(async (request: LocalPatchBoardJudgeRequest) => ({
      ...answer(request, "req-pass-order-bad-wire", () => GOOD), raw: "not a judge JSON reply",
    }));
    const result = await runLocalPatchWorldSlice(c, deps, gameId, { maxHides: 5, boardJudge: judge, hardDeadlineAt: Date.now() + 270_000 });
    expect(result).toMatchObject({ pending: false, claimed: true });
    expect(result.attention).toContain("unresolved");
    expect(paints).toHaveLength(5); expect(judge).toHaveBeenCalledTimes(1);
    const rows = await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } } });
    expect(rows).toHaveLength(5);
    expect(rows.every(row => row.status === "FAILED" && row.attempts === 1 && row.lastError?.startsWith("quality-unresolved:"))).toBe(true);
    const before = await boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId));
    const fresh = new PrismaClient({ datasources: { db: { url } } });
    try {
      const next = { ...c, db: fresh, storage: new DbStorage(fresh) };
      for (let i = 0; i < 3; i++) expect(await runLocalPatchWorldSlice(next, deps, gameId, { boardJudge: judge }))
        .toMatchObject({ pending: false, claimed: false });
      expect(await boardWizardBudgetOf(next).audit(boardWizardWorldId(gameId))).toEqual(before);
    } finally { await fresh.$disconnect(); }
    expect(paints).toHaveLength(5); expect(judge).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  }, 120_000);
});
