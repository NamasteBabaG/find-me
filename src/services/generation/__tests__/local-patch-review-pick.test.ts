import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { cropOf, maskForHide } from "../../../domain/scene/local-patch-hides";
import type { Container } from "../../container";
import { boardsOfWorlds } from "../../world-catalog.service";
import { boardWizardBudgetOf } from "../board-conditioned-wizard";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { reviewLocalPatchBoard } from "../local-patch-board-review";
import { runLocalPatchHide, type LocalPatchHideDeps } from "../local-patch-hide";
import { LOCAL_PATCH_STYLE } from "../local-patch-world";
import { localPatchContinuityPending } from "../local-patch-dual-evidence";
import { DUAL_VISUAL_REVIEW_V3, pinVisualReviewRelease } from "../visual-review-release";
import { sha256Bytes } from "../fixed-sprite";
import { bill, paintedCrop, paintedOk, seedApprovedGame } from "./local-patch-fixtures";
import { boundHide, dualReviewer, longAnswer } from "./local-patch-dual-fixtures";

/**
 * A board builds its request for one appearance and asks the question about one
 * appearance: they must be the same one. Before this, the request put a saved
 * quality answer's continuity question first and the question did not, so an
 * earlier sibling that became ready meanwhile (a repaint, a late first picture)
 * left the request with no appearance, and every later tick failed the same way.
 */
const fakes = vi.hoisted(() => ({ testers: [] as string[] }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0, LOCAL_PATCH_PLAYER_REVIEW: "on",
  GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium", LOCAL_PATCH_PROMPT_RELEASE: "v15" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: fakes.testers }), flag: () => false, adminEmails: () => [] }));
const journeySlugs = new Set(boardsOfWorlds(["journey"]));
const BOARDS = localPatchBoardsForVersion(12).filter(board => journeySlugs.has(board.board)), HIDES = BOARDS.flatMap(board => board.hides);
let directory: string, db: PrismaClient, c: Container;
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-review-pick-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(directory, "test.db").replaceAll("\\", "/")}` } } });
  await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), appUrl: "http://localhost:3000", secret: "synthetic-review-pick", analytics: { track: vi.fn() }, adminEmails: [],
    email: { id: "console", send: async () => ({ id: "synthetic-mail" }) }, emailFallbackTo: null } as unknown as Container;
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("Live requests forbidden"); }));
}, 180_000);
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(directory) === realpathSync(tmpdir()) && path.basename(directory).startsWith("findme-review-pick-")) rmSync(directory, { recursive: true });
});
function painter(gameId: string): LocalPatchHideDeps {
  return { renderPolicySha256: "f".repeat(64), judge: async () => { throw Error("Per-hide judge forbidden"); },
    render: async ({ requestKey, stylePng }) => {
      const hide = HIDES.find(h => requestKey.startsWith(`${h.id}:`))!, mask = maskForHide(hide), crop = cropOf(hide);
      const png = await sharp(await paintedCrop(stylePng, hide)).composite([{ input: { create: { width: 6, height: 6, channels: 4, background: { r: 40, g: 40, b: 180, alpha: 1 } } },
        left: mask.left - crop.left + Math.floor(mask.width / 2), top: mask.top - crop.top + Math.floor(mask.height / 2) }]).png().toBuffer();
      return paintedOk(png, bill(`paint-${gameId}-${requestKey}`));
    } };
}
async function world(gameId: string) {
  const seeded = await seedApprovedGame(c, db, { gameId, approved: false, styleVersion: LOCAL_PATCH_STYLE, status: "TARGETS_GENERATING", withJob: true,
    scenes: BOARDS.map(board => ({ slug: board.board, version: 12 })) });
  fakes.testers.push(seeded.email);
  await db.order.create({ data: { id: `ord-${gameId}`, gameId, userId: seeded.userId, provider: "mock", packageTier: "ONE_WORLD", amountAgorot: 3900, paymentStatus: "PAID", paidAt: new Date() } });
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
  await db.$transaction(tx => pinVisualReviewRelease(tx, gameId, DUAL_VISUAL_REVIEW_V3));
}

describe("one appearance per board review", () => {
  it("asks a later sibling's continuity question before an earlier sibling that became ready meanwhile, then the earlier one", async () => {
    const gameId = "review-pick"; await world(gameId);
    const board = BOARDS[0]!, [earlier, later] = [board.hides[0]!, board.hides[1]!];
    const request = dualReviewer(gameId, hideId => longAnswer(hideId, 300, 300, 0)), container = { ...c, visualReview: { request } } as Container;
    const review = () => reviewLocalPatchBoard(container, { gameId, sceneId: `gsc-${gameId}-${board.board}`, deadlineAt: Date.now() + 270_000 }, { fence: async () => {} });
    const asked = () => request.mock.calls.map(([question]) => `${question.role}:${boundHide(question.prompt).hideId}`);
    await runLocalPatchHide(c, painter(gameId), { gameId, board, hide: later });
    expect(await review()).toMatchObject({ state: "pending", reason: "Quality receipt retained; independent anatomy review is next" });
    const rows = await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } } });
    expect(rows.map(row => localPatchContinuityPending(row))).toEqual([true]);
    // The earlier sibling's first picture arrives while the later one's continuity question is due.
    await runLocalPatchHide(c, painter(gameId), { gameId, board, hide: earlier });
    await review();
    expect(asked()).toEqual([`scene-quality:${later.id}`, `head-continuity:${later.id}`]);
    await review();
    expect(asked()).toEqual([`scene-quality:${later.id}`, `head-continuity:${later.id}`, `scene-quality:${earlier.id}`]);
  }, 300_000);
});
