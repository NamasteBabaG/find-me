import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { GameConfigSchema } from "../../../domain/game/config";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { cropOf, maskForHide } from "../../../domain/scene/local-patch-hides";
import { preparationState } from "../../../domain/generation-health";
import type { Container } from "../../container";
import { boardsOfWorlds } from "../../world-catalog.service";
import { generationConcern } from "../../generation-health.service";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { reviewLocalPatchBoard } from "../local-patch-board-review";
import { runLocalPatchHide, type LocalPatchHideDeps } from "../local-patch-hide";
import { AGE_BODY_CONTRACT, LOCAL_PATCH_AGE_BODY_PROMPT_VERSION, LOCAL_PATCH_REFERENCE_NEUTRAL_PROMPT_VERSION } from "../local-patch-prompt";
import { LOCAL_PATCH_PUBLICATION_ACTION } from "../local-patch-publication-policy";
import { LOCAL_PATCH_RECOVERY_BUDGET_WAIT, LOCAL_PATCH_RECOVERY_EXHAUSTED, LOCAL_PATCH_STYLE, runLocalPatchWorldSlice } from "../local-patch-world";
import { activateLocalPatchEmergencyBudget } from "../local-patch-budget-recovery";
import { planLocalPatchEvidenceRecovery } from "../local-patch-evidence-plan";
import { nextPendingGame } from "../queue";
import { pinVisualReviewRelease } from "../visual-review-release";
import { sha256Bytes } from "../fixed-sprite";
import { bill, paintedCrop, paintedOk, seedApprovedGame } from "./local-patch-fixtures";
import { asDeployedReaderRefusal, atEvidenceRound, dualReviewer, longAnswer, prose, spendTo } from "./local-patch-dual-fixtures";
import { localPatchEvidenceRecovery } from "../local-patch-review-recovery";

const fakes = vi.hoisted(() => ({ testers: [] as string[], release: "v15" as "v15" | "v16" }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0, LOCAL_PATCH_PLAYER_REVIEW: "on",
  GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium", LOCAL_PATCH_PROMPT_RELEASE: fakes.release }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: fakes.testers }), flag: () => false, adminEmails: () => [] }));

const journeySlugs = new Set(boardsOfWorlds(["journey"]));
const BOARDS = localPatchBoardsForVersion(12).filter(board => journeySlugs.has(board.board)), HIDES = BOARDS.flatMap(board => board.hides);
/** The three answer lengths observed on 11 October: head, body and occlusion traces. */
const OBSERVED = [[1013, 954, 466], [1817, 1602, 779], [2169, 2232, 655]] as const;
let directory: string, db: PrismaClient, c: Container;
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-dual-world-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(directory, "test.db").replaceAll("\\", "/")}` } } });
  await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), appUrl: "http://localhost:3000", secret: "synthetic-dual-world", analytics: { track: vi.fn() }, adminEmails: [],
    email: { id: "console", send: async () => ({ id: "synthetic-mail" }) }, emailFallbackTo: null } as unknown as Container;
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("Live requests forbidden in the dual world regression"); }));
}, 180_000);
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(directory) === realpathSync(tmpdir()) && path.basename(directory).startsWith("findme-dual-world-")) rmSync(directory, { recursive: true });
});

/** A paid nine-board v12 journey with an approved identity and a pinned dual review. */
async function world(gameId: string) {
  const seeded = await seedApprovedGame(c, db, { gameId, approved: false, styleVersion: LOCAL_PATCH_STYLE, status: "TARGETS_GENERATING",
    withJob: true, scenes: BOARDS.map(board => ({ slug: board.board, version: 12 })) });
  fakes.testers.push(seeded.email);
  await db.order.create({ data: { id: `ord-${gameId}`, gameId, userId: seeded.userId, provider: "mock", packageTier: "ONE_WORLD",
    amountAgorot: 3900, paymentStatus: "PAID", paidAt: new Date() } });
  const avatar = await sharp(seeded.sheet).resize(256, 256).png().toBuffer(), avatarId = `ast-avatar-${gameId}`;
  await c.storage.put(`game/${avatarId}.png`, avatar, "image/png");
  await db.asset.create({ data: { id: avatarId, ownerId: seeded.userId, type: "AVATAR", visibility: "GAME", status: "READY",
    storagePath: `game/${avatarId}.png`, mimeType: "image/png", bytes: avatar.length, width: 256, height: 256, provider: "openai" } });
  await db.childProfile.update({ where: { id: `chl-${gameId}` }, data: { avatarAssetId: avatarId } });
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
  await db.$transaction(tx => pinVisualReviewRelease(tx, gameId));
  return seeded;
}
/** A synthetic painter for every journey appearance; each paid attempt differs. */
function painter(gameId: string, renders: string[]): LocalPatchHideDeps {
  return { renderPolicySha256: "f".repeat(64), judge: async () => { throw Error("Per-hide judge forbidden"); },
    render: async ({ requestKey, stylePng }) => {
      const hide = HIDES.find(h => requestKey.startsWith(`${h.id}:`));
      if (!hide) throw Error(`Unexpected synthetic request ${requestKey}`);
      renders.push(requestKey);
      const attempt = Number(requestKey.split(":").at(-1)), mask = maskForHide(hide), crop = cropOf(hide);
      const png = await sharp(await paintedCrop(stylePng, hide)).composite([{ input: { create: { width: 6, height: 6, channels: 4,
        background: { r: 40 * attempt, g: 40, b: 180, alpha: 1 } } }, left: mask.left - crop.left + Math.floor(mask.width / 2),
        top: mask.top - crop.top + Math.floor(mask.height / 2) }]).png().toBuffer();
      return paintedOk(png, bill(`paint-${gameId}-${requestKey}`));
    } };
}
const rows = (gameId: string) => db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } }, orderBy: { id: "asc" } });
const rowOf = (all: Awaited<ReturnType<typeof rows>>, hideId: string) => all.find(row => row.slotId && JSON.parse(row.judgeJson ?? "{}").hide === hideId);
const published = (gameId: string) => db.auditLog.count({ where: { entityId: gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } });

describe("a whole v12 world under two independent HIGH reviews", () => {
  it("delivers 27 appearances from long complete answers and repaints exactly the two real defects, counting every provider call", async () => {
    const gameId = "dual-world-full"; await world(gameId);
    const budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(gameId), seeded = (await budget.audit(worldId)).settledMicroUsd;
    const defective = new Set([HIDES[4]!.id, HIDES[19]!.id]), renders: string[] = [];
    const request = dualReviewer(gameId, (hideId, call, imageAttempt) => {
      const [head, body, occlusion] = OBSERVED[call % 3]!;
      return defective.has(hideId) && imageAttempt === 1
        ? longAnswer(hideId, head, body, occlusion, { faults: [{ kind: "hard-cut", where: prose(500, "A straight join slices a neighbour's forehead") }] })
        : longAnswer(hideId, head, body, occlusion);
    });
    const container = { ...c, visualReview: { request } } as Container;
    let ticks = 0;
    for (; ticks < 160; ticks++) {
      const result = await runLocalPatchWorldSlice(container, painter(gameId, renders), gameId, { hardDeadlineAt: Date.now() + 270_000 });
      expect(result.attention).toBeNull();
      if (!result.pending) break;
    }
    const game = await db.game.findUniqueOrThrow({ where: { id: gameId } });
    expect(["READY", "DELIVERED"]).toContain(game.status);
    expect(GameConfigSchema.parse(JSON.parse(game.configJson!)).scenes.flatMap(scene => scene.targets)).toHaveLength(27);
    // 27 first pictures and one new picture for each real defect; nothing else was painted.
    expect(renders).toHaveLength(29); expect(new Set(renders).size).toBe(29);
    expect(renders.filter(key => key.endsWith(":2")).map(key => key.split(":")[0]).sort()).toEqual([...defective].sort());
    // Two HIGH questions per picture: no long answer bought a second one.
    const roles = request.mock.calls.map(([question]) => question.role);
    expect(roles.filter(role => role === "scene-quality")).toHaveLength(29);
    expect(roles.filter(role => role === "head-continuity")).toHaveLength(29);
    expect(request.mock.calls.every(([question]) => question.effort === "high")).toBe(true);
    expect(await published(gameId)).toBe(27);
    const audit = await budget.audit(worldId);
    expect(audit).toMatchObject({ held: false, reservedMicroUsd: 0, pendingRequestKeys: [], unknownRequestKeys: [] });
    // Every bill settled at its own amount: renders at 48,800 and the two review roles at their rate-card charge.
    expect(audit.settledMicroUsd - seeded).toBe(29 * 48_800 + 29 * 18_000 + 29 * 10_000);
    expect(fetch).not.toHaveBeenCalled();
  }, 900_000);

  it("replays 11 October: decides the 16 refused answers for free, leaves the 11 unreviewed untouched and parks instead of waiting forever", async () => {
    const gameId = "dual-world-incident"; await world(gameId);
    const renders: string[] = [], deps = painter(gameId, renders);
    const request = dualReviewer(gameId, (hideId, call) => { const [head, body, occlusion] = OBSERVED[call % 3]!; return longAnswer(hideId, head, body, occlusion); });
    const container = { ...c, visualReview: { request } } as Container;
    for (const board of BOARDS) for (const hide of board.hides) await runLocalPatchHide(c, deps, { gameId, board, hide });
    // Sixteen appearances answered by both reviewers, in board order, as on the day.
    let reviewed = 0;
    for (const board of BOARDS) for (const _hide of board.hides) {
      if (reviewed++ >= 16) break;
      for (let question = 0; question < 2; question++) await reviewLocalPatchBoard(container, { gameId, sceneId: `gsc-${gameId}-${board.board}` }, { fence: async () => {} });
    }
    // Refused by the deployed reader at the evidence rounds those answers had
    // reached: the loop asked again and again, one candidate up to round nine.
    // Every one is still its FIRST picture: evidence rounds are not image attempts.
    const ROUNDS = [1, 3, 4, 9], roundOf = new Map<string, number>();
    for (const [index, row] of (await rows(gameId)).filter(row => row.status === "GENERATED" && JSON.parse(row.judgeJson!).boardReview?.dual).entries()) {
      roundOf.set(row.id, ROUNDS[index % ROUNDS.length]!);
      await atEvidenceRound(db, await asDeployedReaderRefusal(db, gameId, row), roundOf.get(row.id)!);
    }
    const refused = HIDES.slice(0, 16).map(h => h.id), waiting = HIDES.slice(16).map(h => h.id);
    let all = await rows(gameId);
    expect(refused.every(id => rowOf(all, id)?.lastError === "quality-unresolved: integration-review-unreadable")).toBe(true);
    expect(roundOf.size).toBe(16); expect(refused.every(id => rowOf(all, id)!.attempts === 1)).toBe(true);
    // Rounds four and nine have no paid question left; only a free reading can decide them.
    expect(all.filter(row => (roundOf.get(row.id) ?? 0) >= 4).every(row => localPatchEvidenceRecovery(row)?.exhausted)).toBe(true);
    expect(waiting.every(id => JSON.parse(rowOf(all, id)!.judgeJson!).reviewState === "pending-board-review")).toBe(true);
    expect(await published(gameId)).toBe(0);
    // The money as it stood: the four-dollar ceiling refused, the automatic five-dollar extension ran, $4.701771 committed.
    const budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(gameId);
    await spendTo(c, gameId, 3_950_000);
    let refusal: unknown;
    try { await budget.reserve(worldId, { requestKey: `self-repair:board:giza:${"a".repeat(64)}`, scope: "judge", operationFingerprint: "a".repeat(64), reserveMicroUsd: 300_000 }); }
    catch (error) { refusal = error; }
    expect(await activateLocalPatchEmergencyBudget(c, gameId, refusal, async () => {})).toBe(true);
    await spendTo(c, gameId, 4_701_771);
    expect(await budget.audit(worldId)).toMatchObject({ capMicroUsd: 5_000_000, committedMicroUsd: 4_701_771, remainingMicroUsd: 298_229, held: false });
    await db.generationJob.update({ where: { id: `job_${gameId}` }, data: { status: "QUEUED", currentStep: LOCAL_PATCH_RECOVERY_BUDGET_WAIT,
      updatedAt: new Date(Date.now() - 2 * 60 * 60_000) } });
    const ledger = () => db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } });
    const state = async () => ({ rows: await rows(gameId), ledger: await ledger(), job: await db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } }),
      audits: await db.auditLog.count({ where: { entityId: gameId } }) });
    const calls = request.mock.calls.length, paints = renders.length;

    // Dry run: the plan, with nothing reserved, bought or written.
    const before = await state();
    const plan = await planLocalPatchEvidenceRecovery(container, gameId);
    expect(plan.summary).toMatchObject({ "free-pass": 16, "first-review": 11, approved: 0, "evidence-question": 0,
      paidQuestionsStillNeeded: 22, questionReserveMicroUsd: 300_000, nextQuestionFits: false });
    expect(plan.budget).toMatchObject({ capMicroUsd: 5_000_000, committedMicroUsd: 4_701_771, remainingMicroUsd: 298_229, pendingRequests: 0 });
    expect(plan.summary.notes.join(" ")).toContain("No automatic path exists within the authorized ceiling");
    expect(JSON.stringify(plan)).not.toContain("Each visible head joins");
    expect(await state()).toEqual(before);

    // One slice: everything already paid for is decided; nothing new is bought; the world parks.
    const result = await runLocalPatchWorldSlice(container, deps, gameId, { hardDeadlineAt: Date.now() + 270_000 });
    expect(result).toMatchObject({ claimed: true, pending: false });
    expect(result.attention).toContain("no automatic action remains within the authorized world budget");
    expect(result.attention).toContain("298229 of 5000000 micro-USD remain with nothing in flight");
    expect(request.mock.calls.length).toBe(calls); expect(renders.length).toBe(paints);
    expect(await ledger()).toEqual(before.ledger);
    all = await rows(gameId);
    for (const id of refused) {
      const row = rowOf(all, id)!, receipt = JSON.parse(row.judgeJson!);
      expect(row.status).toBe("GENERATED"); expect(receipt.boardReview.dual.continuity.reading).toMatchObject({ disposition: "pass", reason: "pass" });
      // Decided at the round it had reached, on its first picture.
      expect(row.attempts).toBe(1); expect(receipt.boardReview.evidenceReviewAttempt).toBe(roundOf.get(row.id));
    }
    expect(await published(gameId)).toBe(16);
    // The 11 are neither approved on the strength of the 16 nor dropped: byte-for-byte unchanged.
    for (const id of waiting) expect(rowOf(all, id)).toEqual(rowOf(before.rows, id));
    const job = await db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } });
    expect(job).toMatchObject({ status: "FAILED", currentStep: LOCAL_PATCH_RECOVERY_EXHAUSTED });
    expect(await nextPendingGame(c)).not.toBe(gameId);
    const game = await db.game.findUniqueOrThrow({ where: { id: gameId } });
    expect(preparationState({ status: game.status, updatedAt: game.updatedAt, job, automaticRecovery: true })).toBe("attention");
    expect(generationConcern({ id: gameId, status: game.status, updatedAt: game.updatedAt, paidAt: new Date(), jobs: [job] }, Date.now()))
      .toContain("no action left within policy");
    // Parked, not polled: later ticks buy, wait, paint and change nothing.
    for (let tick = 0; tick < 2; tick++) expect(await runLocalPatchWorldSlice(container, deps, gameId)).toMatchObject({ claimed: false, pending: false });
    expect(await ledger()).toEqual(before.ledger); expect(request.mock.calls.length).toBe(calls); expect(renders.length).toBe(paints);
    expect(fetch).not.toHaveBeenCalled();
  }, 900_000);

  it("waits for capacity, instead of parking, while a reservation in flight can still return it", async () => {
    const gameId = "dual-world-in-flight"; await world(gameId);
    const renders: string[] = [], deps = painter(gameId, renders);
    const request = dualReviewer(gameId, hideId => longAnswer(hideId, 300, 300, 0));
    for (const board of BOARDS) for (const hide of board.hides) await runLocalPatchHide(c, deps, { gameId, board, hide });
    const budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(gameId);
    await spendTo(c, gameId, 3_600_000);
    // Another worker's review, reserved and not yet answered: 100,000 remain, less than one question.
    await budget.reserve(worldId, { requestKey: "in-flight-review", scope: "judge", operationFingerprint: "in-flight", reserveMicroUsd: 300_000 });
    expect(await budget.audit(worldId)).toMatchObject({ remainingMicroUsd: 100_000, pendingRequestKeys: ["in-flight-review"] });
    const result = await runLocalPatchWorldSlice({ ...c, visualReview: { request } } as Container, deps, gameId, { hardDeadlineAt: Date.now() + 270_000 });
    expect(result).toMatchObject({ claimed: true, pending: true, attention: null });
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } })).toMatchObject({ status: "QUEUED", currentStep: LOCAL_PATCH_RECOVERY_BUDGET_WAIT });
    expect(request).not.toHaveBeenCalled();
    expect(await budget.readRequest(worldId, "in-flight-review")).toMatchObject({ state: "pending", reserveMicroUsd: 300_000 });
  }, 900_000);
});

describe("v16 on a real v12 world", () => {
  it("asks a fresh appearance the chosen v16 question, keeps a stored row on v15, and repairs each in its own words", async () => {
    const gameId = "dual-world-v16"; await world(gameId);
    const prompts = new Map<string, string>(), renders: string[] = [], base = painter(gameId, renders);
    const deps: LocalPatchHideDeps = { ...base, render: async input => { prompts.set(input.requestKey, input.prompt); return base.render(input); } };
    const board = BOARDS.find(b => b.board === "greatwall")!, [stored, fresh] = [board.hides[2]!, board.hides[0]!];
    const versions = async () => Object.fromEntries((await rows(gameId)).filter(r => r.promptVersion)
      .map(r => [JSON.parse(r.judgeJson ?? "{}").hide as string, r.promptVersion]));
    try {
      fakes.release = "v15";
      expect(await runLocalPatchHide(c, deps, { gameId, board, hide: stored })).toMatchObject({ attempt: 1 });
      fakes.release = "v16";
      expect(await runLocalPatchHide(c, deps, { gameId, board, hide: fresh })).toMatchObject({ attempt: 1 });
      expect(await versions()).toEqual({ [stored.id]: LOCAL_PATCH_REFERENCE_NEUTRAL_PROMPT_VERSION, [fresh.id]: LOCAL_PATCH_AGE_BODY_PROMPT_VERSION });
      const first = prompts.get(`${fresh.id}:${fresh.pose}:render:1`)!;
      expect(first).toContain(AGE_BODY_CONTRACT); expect(first).toMatch(/BODY AGE CONTRACT: 8 years/);
      expect(first).toContain("The new child's hands hold the same sticks");
      expect(prompts.get(`${stored.id}:${stored.pose}:render:1`)).not.toContain(AGE_BODY_CONTRACT);
      // A repair keeps each row's own question, whatever release is chosen now.
      for (const hide of [stored, fresh]) {
        const row = (await rows(gameId)).find(r => JSON.parse(r.judgeJson ?? "{}").hide === hide.id)!;
        await db.targetVariantAsset.update({ where: { id: row.id }, data: { status: "FAILED", lastError: "quality-retry: ageAppropriate" } });
        expect(await runLocalPatchHide(c, deps, { gameId, board, hide, repairChecks: ["ageAppropriate"] })).toMatchObject({ attempt: 2 });
      }
      const repaired = prompts.get(`${fresh.id}:${fresh.pose}:render:2`)!;
      expect(repaired).toContain(AGE_BODY_CONTRACT); expect(repaired).toContain("CORRECT THE REPORTED DEFECTS:");
      expect(prompts.get(`${stored.id}:${stored.pose}:render:2`)).not.toContain(AGE_BODY_CONTRACT);
      expect(await versions()).toEqual({ [stored.id]: LOCAL_PATCH_REFERENCE_NEUTRAL_PROMPT_VERSION, [fresh.id]: LOCAL_PATCH_AGE_BODY_PROMPT_VERSION });
      expect(renders).toHaveLength(4);
    } finally { fakes.release = "v15"; }
  }, 300_000);
});
