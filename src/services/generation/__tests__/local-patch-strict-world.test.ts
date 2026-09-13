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
import { avatarDisplayFromSheet } from "../../../infra/generation/avatar-cut";
import type { Container } from "../../container";
import type { EmailMessage } from "../../../infra/email/types";
import { GameConfigSchema } from "../../../domain/game/config";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { maskForHide } from "../../../domain/scene/local-patch-hides";
import { runLocalPatchWorldSlice, LOCAL_PATCH_STYLE, LOCAL_PATCH_QUALITY_FAILED } from "../local-patch-world";
import { tickGeneration } from "../queue";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { runLocalPatchHide, type LocalPatchHideDeps } from "../local-patch-hide";
import type { LocalPatchBoardJudgeRequest, LocalPatchBoardJudgeResult } from "../local-patch-judge";
import { sha256Bytes } from "../fixed-sprite";
import { bill, boardPng, paintedCrop, paintedOk, PASSING_ANSWER, seedApprovedGame } from "./local-patch-fixtures";

const fakes = vi.hoisted(() => ({ testers: [] as string[] }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0,
  GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: fakes.testers }),
  flag: () => false, adminEmails: () => ["synthetic-admin@example.invalid"],
}));
const BOARDS = localPatchBoardsForVersion(8), HIDES = BOARDS.flatMap(b => b.hides), BAD = HIDES[0]!;
const GOOD = { ...PASSING_ANSWER, faceLikeness: "pass", faceReadable: "pass", severeSeam: "pass" };
let dir: string, url: string, db: PrismaClient, c: Container, original: Buffer;
const mails: EmailMessage[] = [];
beforeAll(async () => {
  dir = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-strict-world-")));
  url = `file:${path.join(dir, "strict.sqlite").split(path.sep).join("/")}`;
  db = new PrismaClient({ datasources: { db: { url } } }); await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), appUrl: "http://localhost:3000", secret: "synthetic-strict-world",
    payment: new MockPaymentProvider("http://localhost:3000", "synthetic"), avatars: new MockAvatarProvider(),
    judge: new NoPatchJudge(), faces: new NoopFaceDetector(), analytics: new NoopAnalytics(), jobs: new InlineJobRunner(),
    email: { id: "console", send: async mail => { mails.push(mail); return { id: `synthetic-mail-${mails.length}` }; } },
    adminEmails: ["synthetic-admin@example.invalid"] };
  original = await boardPng();
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("No live network in the v8 world integration"); }));
}, 180000);
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  const temp = realpathSync(tmpdir());
  if (path.dirname(dir) === temp && path.basename(dir).startsWith("findme-strict-world-")) rmSync(dir, { recursive: true, force: true });
});

async function seed(gameId: string, contentVersion = 8) {
  const ageYears = contentVersion === 9 ? 5 : 8;
  const seeded = await seedApprovedGame(c, db, { gameId, approved: false, styleVersion: LOCAL_PATCH_STYLE,
    status: "TARGETS_GENERATING", withJob: true, scenes: BOARDS.map(b => ({ slug: b.board, version: contentVersion })) });
  fakes.testers.push(seeded.email);
  await c.storage.put(`private/photo-${gameId}.jpg`, seeded.sheet, "image/png");
  const avatarId = `ast-avatar-${gameId}`, avatar = await avatarDisplayFromSheet(seeded.sheet, 1024);
  await c.storage.put(`game/${avatarId}.png`, avatar, "image/png");
  await db.asset.create({ data: { id: avatarId, ownerId: seeded.userId, type: "AVATAR", visibility: "GAME", status: "READY",
    storagePath: `game/${avatarId}.png`, mimeType: "image/png", width: 512, height: 512, bytes: avatar.length } });
  await db.childProfile.update({ where: { id: `chl-${gameId}` }, data: { avatarAssetId: avatarId, ageYears } });
  const { sha256: catalogSha256 } = await readBoardConditionedCatalog();
  await reviewBoardWizardIdentity({ db, apiKey: "synthetic", budget: boardWizardBudgetOf(c), beforeDispatch: async () => {},
    write: work => db.$transaction(work), reviewer: { review: async () => ({ httpOk: true, requestId: `req-${gameId}-identity`,
      body: { model: "gpt-5.6-luna", usage: { prompt_tokens: 1500, completion_tokens: 150 }, choices: [{ finish_reason: "stop", message: {
        content: JSON.stringify({ checks: { identity: "pass", age: "pass", paintedStyle: "pass", sheetLayout: "pass" }, reason: "Synthetic canonical identity" }) } }] } }) } },
  { gameId, identityAssetId: `ast-sheet-${gameId}`, sheet: seeded.sheet, photo: seeded.sheet, atlas: seeded.sheet, contentVersion,
    provenance: { promptVersion: "character-v4-board-drawn-face-reference", quality: "medium", photoAssetId: `ast-photo-${gameId}`,
      photoSha256: sha256Bytes(seeded.sheet), ageYears, crop: null,
      style: { version: "board-matched-identity/v2", catalogSha256, atlasSha256: sha256Bytes(seeded.sheet) } } });
  return seeded;
}

describe("versioned full real queue and durable accounting: narrow severe retries", () => {
  it.each([{ contentVersion: 8, recover: false }, { contentVersion: 8, recover: true },
    { contentVersion: 9, recover: false }, { contentVersion: 9, recover: true }])("$contentVersion recovery=$recover: completes the normal world before the last repair, never buys a fourth image", async ({ contentVersion, recover }) => {
    const gameId = `strict-world-v${contentVersion}-${recover ? "recovers" : "exhausts"}`, seeded = await seed(gameId, contentVersion);
    const ageContract = contentVersion === 9;
    const expectedGood = ageContract ? { ...GOOD, ageAppropriate: "pass" } : GOOD;
    const severeCheck = ageContract ? "ageAppropriate" : "severeSeam";
    const paintKeys: string[] = [], sequence: string[] = [], reviews = new Set<string>(), lastAttempt = new Map<string, number>();
    const beforeMails = mails.length;
    const perHideJudge = vi.fn(async () => { throw new Error("v8 uses only grouped reviews"); });
    const deps: LocalPatchHideDeps = { renderPolicySha256: "f".repeat(64), readBoardArt: async () => original, judge: perHideJudge,
      render: async ({ requestKey, stylePng, identityPng, canonicalIdentityPng, boardPeoplePng, referenceMode, prompt }) => {
        const hide = HIDES.find(h => requestKey.startsWith(`${h.id}:`));
        if (!hide) throw new Error(`Unexpected hide ${requestKey}`);
        if (ageContract) {
          expect(referenceMode).toBe("canonical-portrait-only/v1");
          expect(canonicalIdentityPng).toBeUndefined();
          expect(boardPeoplePng).toBeUndefined();
          expect(prompt).toContain("PARENT-CONFIRMED TARGET AGE: 5 years old");
          expect(prompt).toContain("PRESCHOOL body");
          expect(prompt).not.toContain("corroborating identity and age");
        } else expect(canonicalIdentityPng?.equals(seeded.sheet)).toBe(true);
        expect(await sharp(identityPng).metadata()).toMatchObject({ width: 512, height: 512 });
        const attempt = Number(requestKey.split(":").at(-1));
        if (attempt > 1) {
          expect(prompt).toContain(ageContract ? "AGE AND BODY REPAIR" : "SEAM REPAIR");
          expect(prompt).not.toContain("Repaint the face, hair and clothes");
          expect(prompt).not.toContain("a strong straight colour block at the target's right edge");
        }
        if (attempt === 3) {
          expect(paintKeys.filter(key => key.endsWith(":1"))).toHaveLength(45);
          expect(reviews.size).toBe(9);
        }
        paintKeys.push(requestKey); sequence.push(`paint:${hide.id}:${attempt}`); lastAttempt.set(hide.id, attempt);
        const mask = maskForHide(hide);
        const image = await sharp(await paintedCrop(stylePng, hide)).composite([{
          input: { create: { width: 4, height: 4, channels: 4, background: { r: 25 * attempt, g: 20, b: 190, alpha: 1 } } },
          left: mask.left + Math.floor(mask.width / 2), top: mask.top + Math.floor(mask.height / 2),
        }]).png().toBuffer();
        return paintedOk(image, bill(`req-${gameId}-${requestKey}`));
      } };
    let calls = 0;
    const boardJudge = vi.fn(async (request: LocalPatchBoardJudgeRequest): Promise<LocalPatchBoardJudgeResult> => {
      calls++; reviews.add(request.boardId); sequence.push(`review:${request.boardId}:${lastAttempt.get(BAD.id)}`);
      expect(request.contentVersion).toBe(contentVersion);
      expect(request.hides.every(h => h.expectation?.ageYears === (ageContract ? 5 : 8))).toBe(true);
      return { verdict: null, verdicts: {}, raw: JSON.stringify({ hides: request.hides.map(h => ({ hideId: h.hideId,
        ...(ageContract ? { evidenceIds: [`${h.hideId}:before`, `${h.hideId}:after`] } : {}),
        verdict: h.hideId === BAD.id && (!recover || lastAttempt.get(BAD.id)! < 2)
          ? { ...expectedGood, [severeCheck]: "fail", verdict: "fail", faults: [{ check: severeCheck,
            where: ageContract ? "The central target has an older child's long torso and broad shoulders." : "a strong straight colour block at the target's right edge" }] }
          : expectedGood })) }), model: "gpt-5.6-luna", requestId: `req-${gameId}-review-${calls}`,
        usage: { prompt_tokens: 9000, completion_tokens: 1400 }, finishReason: "stop", wireFault: null, costUnknown: false };
    });
    for (let tick = 0; tick < 25; tick++) {
      const outcome = await runLocalPatchWorldSlice(c, deps, gameId, { maxHides: 5, boardJudge, hardDeadlineAt: Date.now() + 270000 });
      expect(outcome.blocked).toEqual([]);
      if (!outcome.pending) break;
    }
    const game = await db.game.findUniqueOrThrow({ where: { id: gameId } });
    const rows = await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } }, include: { targetInstance: true } });
    expect(rows).toHaveLength(45);
    expect(rows.filter(r => r.attempts > 1)).toHaveLength(1);
    const bad = rows.find(r => r.targetInstance.targetId === BOARDS[0]!.hides[0]!.targetId && r.targetInstance.gameSceneId === `gsc-${gameId}-${BOARDS[0]!.board}`)!;
    const expectedCalls = recover ? 46 : 47;
    expect(paintKeys, sequence.join("\n")).toHaveLength(expectedCalls);
    expect(new Set(paintKeys).size).toBe(expectedCalls);
    expect(boardJudge).toHaveBeenCalledTimes(recover ? 10 : 11);
    expect(perHideJudge).not.toHaveBeenCalled();
    if (recover) {
      expect(game.status, game.lastError ?? "no error").toBe("DELIVERED");
      expect(bad).toMatchObject({ status: "GENERATED", attempts: 2 });
      const config = GameConfigSchema.parse(JSON.parse(game.configJson!));
      expect(config.scenes.flatMap(s => s.targets)).toHaveLength(45);
      expect(config.scenes.every(s => s.version === contentVersion)).toBe(true);
      if (ageContract) expect(rows.every(r => JSON.parse(r.judgeJson!).verdict.ageAppropriate === "pass"
        && JSON.parse(r.judgeJson!).boardReview.version === "local-patch-board-five-quality/v5-evidence-labeled")).toBe(true);
      expect(mails.slice(beforeMails).filter(m => m.tag === "game-ready")).toHaveLength(1);
    } else {
      expect(game).toMatchObject({ status: "GENERATION_FAILED", configJson: null, readyAt: null });
      expect(bad).toMatchObject({ status: "FAILED", attempts: 3 });
      expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } })).toMatchObject({ status: "DONE", currentStep: LOCAL_PATCH_QUALITY_FAILED });
      expect(await db.shareLink.count({ where: { gameId } })).toBe(0);
      expect(mails.slice(beforeMails).filter(m => m.tag === "game-ready")).toHaveLength(0);
    }
    const worldId = boardWizardWorldId(gameId), audit = await boardWizardBudgetOf(c).audit(worldId);
    expect(audit).toMatchObject({ held: false, reservedMicroUsd: 0 });
    expect(audit.settledMicroUsd).toBeGreaterThan(expectedCalls * 48800);
    const fresh = new PrismaClient({ datasources: { db: { url } } });
    try {
      const next: Container = { ...c, db: fresh, storage: new DbStorage(fresh) };
      for (let i = 0; i < 3; i++) {
        expect(await runLocalPatchWorldSlice(next, deps, gameId, { boardJudge })).toMatchObject({ pending: false, claimed: false });
        if (!recover) expect(await tickGeneration(next, gameId, 60000)).toMatchObject({ status: "GENERATION_FAILED", pending: false });
      }
      expect((await boardWizardBudgetOf(next).audit(worldId)).settledMicroUsd).toBe(audit.settledMicroUsd);
    } finally { await fresh.$disconnect(); }
    expect(paintKeys).toHaveLength(expectedCalls);
    expect(boardJudge).toHaveBeenCalledTimes(recover ? 10 : 11);
    expect(fetch).not.toHaveBeenCalled();
  }, 240000);

  it("keeps a renderer seam refusal as structured evidence and resumes attempt2 with the same targeted prompt and no second purchase", async () => {
    const gameId = "strict-renderer-targeted-repair"; await seed(gameId);
    const board = BOARDS[0]!, hide = board.hides[0]!, prompts: string[] = [];
    const render: LocalPatchHideDeps["render"] = async ({ requestKey, prompt, stylePng }) => {
      prompts.push(prompt);
      const image = requestKey.endsWith(":1")
        ? await sharp({ create: { width: 512, height: 768, channels: 4, background: "#ff0000" } }).png().toBuffer()
        : await paintedCrop(stylePng, hide);
      return paintedOk(image, bill(`req-${gameId}-${requestKey}`));
    };
    const deps: LocalPatchHideDeps = { renderPolicySha256: "f".repeat(64), readBoardArt: async () => original, render,
      judge: async () => { throw new Error("A per-hide judge must not run"); } };
    const first = await runLocalPatchHide(c, deps, { gameId, board, hide });
    expect(first.state).toBe("refused");
    const row = await db.targetVariantAsset.findFirstOrThrow({ where: { targetInstance: { gameScene: { gameId } } } });
    const rejection = JSON.parse(row.judgeJson!);
    expect(rejection.renderFault).toMatch(/^quality-seam:/);
    expect(rejection.seam.verdict).toBe("background-rewritten");
    let fences = 0;
    await expect(runLocalPatchHide(c, { ...deps, fence: async () => { if (++fences === 2) throw new Error("synthetic publication interruption"); } },
      { gameId, board, hide })).rejects.toThrow("synthetic publication interruption");
    const pending = await db.targetVariantAsset.findUniqueOrThrow({ where: { id: row.id } });
    expect(pending).toMatchObject({ status: "PENDING", attempts: 2, judgeJson: row.judgeJson });
    expect(prompts).toHaveLength(2); expect(prompts[1]).toContain("SEAM REPAIR");
    const fresh = new PrismaClient({ datasources: { db: { url } } });
    try {
      const next: Container = { ...c, db: fresh, storage: new DbStorage(fresh) };
      expect(await runLocalPatchHide(next, deps, { gameId, board, hide })).toMatchObject({ state: "generated", attempt: 2, replayed: true });
    } finally { await fresh.$disconnect(); }
    expect(prompts).toHaveLength(2); // The same request fingerprint replayed the bought second image.
    expect(fetch).not.toHaveBeenCalled();
  }, 120000);
});
