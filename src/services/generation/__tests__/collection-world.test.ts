import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { avatarDisplayFromSheet } from "../../../infra/generation/avatar-cut";
import type { Container } from "../../container";
import { GameConfigSchema } from "../../../domain/game/config";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { selectWorlds } from "../../create-flow.service";
import { gameShape } from "../../world-catalog.service";
import { ownerAdventureAlbum } from "../../adventure-album.service";
import { runLocalPatchWorldSlice, LOCAL_PATCH_STYLE } from "../local-patch-world";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { localPatchBoardReviewKeys } from "../local-patch-board-review";
import type { LocalPatchHideDeps } from "../local-patch-hide";
import { localPatchHideEvidenceIds, type LocalPatchBoardJudgeRequest, type LocalPatchBoardJudgeResult } from "../local-patch-judge";
import { sha256Bytes } from "../fixed-sprite";
import { bill, paintedCrop, paintedOk, PASSING_ANSWER, seedApprovedGame } from "./local-patch-fixtures";

const GAME = "collection-world-synthetic", BOARDS = localPatchBoardsForVersion(10);
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0,
  GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: ["collection-world-synthetic@example.com"] }),
  flag: () => false, adminEmails: () => [],
}));
let dir: string, db: PrismaClient, c: Container;
beforeAll(async () => {
  dir = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-collection-test-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(dir, "test.sqlite").split(path.sep).join("/")}` } } });
  await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), secret: "synthetic-collection-world", appUrl: "http://localhost:3000",
    email: { id: "console", send: async () => ({ id: "synthetic-mail" }) },
    adminEmails: [], analytics: { track() {} }, emailFallbackTo: null } as unknown as Container;
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("No live calls in controlled-provider integration"); }));
}, 180000);
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(dir) === realpathSync(tmpdir()) && path.basename(dir).startsWith("findme-collection-test-")) rmSync(dir, { recursive: true, force: true });
});

it("wizard selection → 27 actual purchases → 9 reviews → publication → 54 collected items, idempotent saved album", async () => {
  const seeded = await seedApprovedGame(c, db, { gameId: GAME, approved: false, styleVersion: LOCAL_PATCH_STYLE,
    status: "DRAFT", withJob: true, scenes: [] });
  expect(await selectWorlds(c, GAME, ["journey"])).toEqual({ ok: true });
  const selected = await db.gameScene.findMany({ where: { gameId: GAME } });
  expect(selected.every(s => s.sceneVersion === 10)).toBe(true);
  expect(gameShape(selected)).toEqual({ worlds: 1, places: 9, spots: 27 });
  await db.game.update({ where: { id: GAME }, data: { status: "TARGETS_GENERATING" } });
  await c.storage.put(`private/photo-${GAME}.jpg`, seeded.sheet, "image/png");
  const avatar = await avatarDisplayFromSheet(seeded.sheet, 1024), avatarId = `ast-avatar-${GAME}`;
  await c.storage.put(`game/${avatarId}.png`, avatar, "image/png");
  await db.asset.create({ data: { id: avatarId, ownerId: seeded.userId, type: "AVATAR", visibility: "GAME", status: "READY",
    storagePath: `game/${avatarId}.png`, mimeType: "image/png", width: 512, height: 512, bytes: avatar.length } });
  await db.childProfile.update({ where: { id: `chl-${GAME}` }, data: { avatarAssetId: avatarId, retainOriginalPhoto: true } });
  const { sha256: catalogSha256 } = await readBoardConditionedCatalog();
  await reviewBoardWizardIdentity({ db, apiKey: "synthetic", budget: boardWizardBudgetOf(c), beforeDispatch: async () => {},
    write: work => db.$transaction(work), reviewer: { review: async () => ({ httpOk: true, requestId: "req-collection-identity",
      body: { model: "gpt-5.6-luna", service_tier: "default", usage: { prompt_tokens: 1500, completion_tokens: 150 },
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ checks: { identity: "pass", age: "pass", paintedStyle: "pass", sheetLayout: "pass" }, reason: "Controlled provider" }) } }] } }) },
  }, { gameId: GAME, identityAssetId: `ast-sheet-${GAME}`, sheet: seeded.sheet, photo: seeded.sheet, atlas: seeded.sheet, contentVersion: 10,
    provenance: { promptVersion: "character-v4-board-drawn-face-reference", quality: "medium", photoAssetId: `ast-photo-${GAME}`,
      photoSha256: sha256Bytes(seeded.sheet), ageYears: 8, crop: null,
      style: { version: "board-matched-identity/v2", catalogSha256, atlasSha256: sha256Bytes(seeded.sheet) } } });
  const paintKeys: string[] = [], allHides = BOARDS.flatMap(b => b.hides);
  const deps: LocalPatchHideDeps = { renderPolicySha256: "f".repeat(64),
    judge: async () => { throw Error("No per-hide review in grouped route"); },
    render: async ({ requestKey, stylePng }) => {
      paintKeys.push(requestKey);
      const hide = allHides.find(h => requestKey.startsWith(`${h.id}:`))!;
      return paintedOk(await paintedCrop(stylePng, hide), bill(`req-${requestKey}`));
    },
  };
  const boardJudge = vi.fn(async (request: LocalPatchBoardJudgeRequest): Promise<LocalPatchBoardJudgeResult> => ({
    verdict: null, verdicts: {}, raw: JSON.stringify({ hides: request.hides.map(h => ({ hideId: h.hideId,
      evidenceIds: localPatchHideEvidenceIds(h.hideId), verdict: { ...PASSING_ANSWER, faceLikeness: "pass", faceReadable: "pass", severeSeam: "pass", ageAppropriate: "pass" } })) }),
    model: "gpt-5.6-luna", requestId: `req-review-${request.boardId}`, usage: { prompt_tokens: 9000, completion_tokens: 1400 },
    finishReason: "stop", wireFault: null, costUnknown: false,
  }));
  for (let tick = 0; tick < 12; tick++) {
    const result = await runLocalPatchWorldSlice(c, deps, GAME, { maxHides: 3, boardJudge, hardDeadlineAt: Date.now() + 270000 });
    expect(result.attention).toBeNull(); expect(result.blocked).toEqual([]);
    if (!result.pending) break;
  }
  const game = await db.game.findUniqueOrThrow({ where: { id: GAME } });
  expect(game.status, game.lastError ?? "no error").toBe("DELIVERED");
  const config = GameConfigSchema.parse(JSON.parse(game.configJson!));
  expect(config.scenes.flatMap(s => s.targets)).toHaveLength(27);
  expect(config.adventure?.boards.flatMap(b => b.discoveries)).toHaveLength(54);
  expect(paintKeys).toHaveLength(27); expect(new Set(paintKeys).size).toBe(27);
  expect(boardJudge).toHaveBeenCalledTimes(9);
  expect(boardJudge.mock.calls.every(([r]) => r.hides.length === 3 && r.contentVersion === 10)).toBe(true);
  expect((await boardWizardBudgetOf(c).audit(boardWizardWorldId(GAME))).held).toBe(false);
  for (const board of config.adventure!.boards) {
    for (const discovery of board.discoveries) {
      const event = { kind: "discovery-found" as const, boardSlug: board.boardSlug, discoveryId: discovery.id };
      expect((await ownerAdventureAlbum(db, seeded.userId, GAME, event)).changed).toBe(true);
      expect((await ownerAdventureAlbum(db, seeded.userId, GAME, event)).changed).toBe(false);
    }
    for (const targetId of board.targetIds) await ownerAdventureAlbum(db, seeded.userId, GAME,
      { kind: "target-found", boardSlug: board.boardSlug, targetId, variant: "A" });
  }
  const saved = await ownerAdventureAlbum(db, seeded.userId, GAME);
  expect(saved.progress.discoveries).toHaveLength(54); expect(saved.progress.finds).toHaveLength(27);
  await expect(ownerAdventureAlbum(db, "stranger", GAME)).rejects.toThrow("not-owned");
  await runLocalPatchWorldSlice(c, deps, GAME, { boardJudge });
  expect(paintKeys).toHaveLength(27);
  expect(localPatchBoardReviewKeys("giza", 10).some(k => k.includes("three-review:v10:1-1-1:"))).toBe(true);
}, 240000);
