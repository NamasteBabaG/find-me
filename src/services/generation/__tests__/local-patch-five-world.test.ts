import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { retainedPurchaseKeysFor } from "../../../infra/db/prisma-retained-purchase-store";
import { avatarDisplayFromSheet } from "../../../infra/generation/avatar-cut";
import type { EmailMessage } from "../../../infra/email/types";
import type { Container } from "../../container";
import { GameConfigSchema } from "../../../domain/game/config";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { runLocalPatchWorldSlice, LOCAL_PATCH_STYLE, localPatchPrivateInventory } from "../local-patch-world";
import { composeLocalPatchGame } from "../local-patch-player";
import { identityApprovedForDisplay, reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { localPatchBoardReviewKey } from "../local-patch-board-review";
import { LOCAL_PATCH_PUBLICATION_ACTION } from "../local-patch-publication-policy";
import type { LocalPatchHideDeps } from "../local-patch-hide";
import type { LocalPatchBoardJudgeRequest, LocalPatchBoardJudgeResult } from "../local-patch-judge";
import { sha256Bytes } from "../fixed-sprite";
import { bill, boardPng, paintedCrop, paintedOk, PASSING_ANSWER, seedApprovedGame } from "./local-patch-fixtures";

const GAME = "five-world-synthetic", BOARDS = localPatchBoardsForVersion(7);
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0,
  GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: ["five-world-synthetic@example.com"] }),
  flag: () => false, adminEmails: () => ["synthetic-admin@example.invalid"],
}));
let dir: string, url: string, db: PrismaClient, c: Container;
const mails: EmailMessage[] = [];
beforeAll(async () => {
  dir = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-five-world-")));
  url = `file:${path.join(dir, "five.sqlite").split(path.sep).join("/")}`;
  db = new PrismaClient({ datasources: { db: { url } } }); await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), secret: "synthetic-five-world", appUrl: "http://localhost:3000",
    email: { id: "console", send: async (mail: EmailMessage) => { mails.push(mail); return { id: `synthetic-mail-${mails.length}` }; } },
    adminEmails: ["synthetic-admin@example.invalid"], analytics: { track() {} }, emailFallbackTo: null } as unknown as Container;
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("No live network in the 45-hide integration"); }));
}, 180000);
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(dir) === realpathSync(tmpdir()) && path.basename(dir).startsWith("findme-five-world-")) rmSync(dir, { recursive: true, force: true });
});

describe("catalog7 real queue: 45 image purchases, 9 grouped reviews, automatic publication", () => {
  it("persists every hide despite visual fail/unsure, publishes all45 with separate mails, and fresh ticks buy nothing", async () => {
    const seeded = await seedApprovedGame(c, db, { gameId: GAME, approved: false, styleVersion: LOCAL_PATCH_STYLE,
      status: "TARGETS_GENERATING", withJob: true, scenes: BOARDS.map(board => ({ slug: board.board, version: 7 })) });
    // The private original remains a real, readable raster, not a permissive mock.
    await c.storage.put(`private/photo-${GAME}.jpg`, seeded.sheet, "image/png");
    const avatar = await avatarDisplayFromSheet(seeded.sheet, 1024), avatarId = `ast-avatar-${GAME}`;
    await c.storage.put(`game/${avatarId}.png`, avatar, "image/png");
    await db.asset.create({ data: { id: avatarId, ownerId: seeded.userId, type: "AVATAR", visibility: "GAME", status: "READY",
      storagePath: `game/${avatarId}.png`, mimeType: "image/png", width: 512, height: 512, bytes: avatar.length } });
    await db.childProfile.update({ where: { id: `chl-${GAME}` }, data: { avatarAssetId: avatarId } });
    const { sha256: catalogSha256 } = await readBoardConditionedCatalog();
    const identityGate = await reviewBoardWizardIdentity({ db, apiKey: "synthetic", budget: boardWizardBudgetOf(c),
      beforeDispatch: async () => {}, write: work => db.$transaction(work), reviewer: {
        review: async request => {
          expect(request.settings).toMatchObject({ model: "gpt-5.6-luna", effort: "low" });
          return { httpOk: true, requestId: "req-five-identity", body: { model: "gpt-5.6-luna", service_tier: "default",
            usage: { prompt_tokens: 1500, completion_tokens: 150 }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
              checks: { identity: "pass", age: "pass", paintedStyle: "uncertain", sheetLayout: "pass" }, reason: "Synthetic style uncertainty for advisory publication" }) } }] } };
        },
      } }, { gameId: GAME, identityAssetId: `ast-sheet-${GAME}`, sheet: seeded.sheet, photo: seeded.sheet, atlas: seeded.sheet, contentVersion: 7,
      provenance: { promptVersion: "character-v4-board-drawn-face-reference", quality: "medium", photoAssetId: `ast-photo-${GAME}`,
        photoSha256: sha256Bytes(seeded.sheet), ageYears: 8, crop: null,
        style: { version: "board-matched-identity/v2", catalogSha256, atlasSha256: sha256Bytes(seeded.sheet) } } });
    expect(identityGate.approved).toBe(false); // Honest uncertainty, not an invented pass.
    const paintKeys: string[] = [], hideJudge = vi.fn(async () => { throw new Error("Catalog7 must not buy a per-hide review"); });
    const allHides = BOARDS.flatMap(board => board.hides);
    const deps: LocalPatchHideDeps = { renderPolicySha256: "f".repeat(64), readBoardArt: async () => boardPng(), judge: hideJudge,
      render: async ({ requestKey, stylePng }) => {
        paintKeys.push(requestKey);
        const hide = allHides.find(item => requestKey.startsWith(`${item.id}:`));
        if (!hide) throw new Error(`Unexpected hide ${requestKey}`);
        return paintedOk(await paintedCrop(stylePng, hide), bill(`req-five-${requestKey}`));
      },
    };
    const boardJudge = vi.fn(async (request: LocalPatchBoardJudgeRequest): Promise<LocalPatchBoardJudgeResult> => ({
      verdict: null, verdicts: {}, raw: JSON.stringify({ hides: request.hides.map((hide, index) => ({ hideId: hide.hideId,
        verdict: index === 0 ? { ...PASSING_ANSWER, styleMatch: "fail", verdict: "fail", reason: "Synthetic excessive realism", faults: [{ check: "styleMatch", where: "face" }] }
          : index === 1 ? { ...PASSING_ANSWER, childComplete: "unsure", verdict: "unsure", reason: "Synthetic natural occlusion uncertainty", faults: [] } : PASSING_ANSWER })) }),
      model: "gpt-5.6-luna", requestId: `req-five-review-${request.boardId}`, usage: { prompt_tokens: 9000, completion_tokens: 1400 },
      finishReason: "stop", wireFault: null, costUnknown: false,
    }));
    for (let tick = 0; tick < 15; tick++) {
      const result = await runLocalPatchWorldSlice(c, deps, GAME, { maxHides: 5, boardJudge, hardDeadlineAt: Date.now() + 270000 });
      expect(result.attention).toBeNull(); expect(result.blocked).toEqual([]);
      if (!result.pending) break;
    }
    const game = await db.game.findUniqueOrThrow({ where: { id: GAME } });
    expect(game.status, game.lastError ?? "no error").toBe("DELIVERED");
    expect(game.readyAt).not.toBeNull();
    const config = GameConfigSchema.parse(JSON.parse(game.configJson!));
    expect(config.scenes).toHaveLength(9); expect(config.scenes.every(scene => scene.version === 7 && scene.targets.length === 5)).toBe(true);
    expect(config.scenes.flatMap(scene => scene.targets)).toHaveLength(45);
    expect(config.child.avatarUrl).toContain(avatarId);
    expect(paintKeys).toHaveLength(45); expect(new Set(paintKeys).size).toBe(45);
    expect(boardJudge).toHaveBeenCalledTimes(9); expect(hideJudge).not.toHaveBeenCalled();
    expect(boardJudge.mock.calls.every(([request]) => request.hides.length === 5)).toBe(true);
    expect(await db.auditLog.count({ where: { action: LOCAL_PATCH_PUBLICATION_ACTION, entityId: GAME } })).toBe(45);
    const variants = await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId: GAME } } } });
    expect(variants).toHaveLength(45); expect(variants.every(row => row.status === "GENERATED" && row.attempts === 1)).toBe(true);
    expect(variants.filter(row => JSON.parse(row.judgeJson!).verdict.verdict === "fail")).toHaveLength(9);
    expect(variants.filter(row => JSON.parse(row.judgeJson!).verdict.verdict === "unsure")).toHaveLength(9);
    expect(mails).toHaveLength(2);
    expect(mails.find(mail => mail.tag === "game-ready")?.to).toBe(seeded.email);
    const concerns = mails.find(mail => mail.tag === "admin-alert")!;
    expect(concerns.to).toBe("synthetic-admin@example.invalid"); expect(concerns.subject).toContain("18");
    expect(concerns.text).toContain(`/admin/orders/${GAME}`);
    expect(await db.auditLog.count({ where: { action: "local-patch:notification-sent", entityId: GAME } })).toBe(2);
    const ledger = boardWizardBudgetOf(c), worldId = boardWizardWorldId(GAME), audit = await ledger.audit(worldId);
    expect(audit).toMatchObject({ held: false, reservedMicroUsd: 0 });
    expect(audit.settledMicroUsd).toBeGreaterThan(45 * 48800);
    for (const board of BOARDS) expect((await ledger.readRequest(worldId, localPatchBoardReviewKey(board.board)))?.state).toBe("settled");
    const inventory = await localPatchPrivateInventory(c, GAME);
    expect(inventory.storagePaths).toHaveLength(45);
    for (const key of retainedPurchaseKeysFor(worldId, BOARDS.map(board => localPatchBoardReviewKey(board.board)))) {
      expect(inventory.retainedPurchaseKeys).toContain(key);
    }
    const child = await db.childProfile.findUniqueOrThrow({ where: { id: `chl-${GAME}` } });
    expect(child.originalPhotoAssetId).toBeNull(); expect(await identityApprovedForDisplay(c, child, 7)).toBe(true);
    expect(await identityApprovedForDisplay(c, { ...child, ageYears: 4 }, 7)).toBe(false);
    const composed = await composeLocalPatchGame(c, GAME);
    expect(composed.scenes.flatMap(scene => scene.targets)).toHaveLength(45);
    const fresh = new PrismaClient({ datasources: { db: { url } } });
    try {
      const next = { ...c, db: fresh, storage: new DbStorage(fresh) };
      for (let i = 0; i < 3; i++) expect(await runLocalPatchWorldSlice(next, deps, GAME, { boardJudge })).toMatchObject({ claimed: false, pending: false });
      expect((await boardWizardBudgetOf(next).audit(worldId)).settledMicroUsd).toBe(audit.settledMicroUsd);
    } finally { await fresh.$disconnect(); }
    expect(paintKeys).toHaveLength(45); expect(boardJudge).toHaveBeenCalledTimes(9); expect(mails).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
  }, 240000);
});
