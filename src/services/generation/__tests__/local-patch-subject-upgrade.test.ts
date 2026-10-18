import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import type { BackgroundReviewState, BackgroundReviewTransport } from "../../../infra/generation/types";
import { GameConfigSchema } from "../../../domain/game/config";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { cropOf, maskForHide } from "../../../domain/scene/local-patch-hides";
import { SUBJECT_POLICY_VERSION, readSubjectAnswer, subjectPlanFor } from "../../../domain/generation/subject-policy";
import type { Container } from "../../container";
import { boardsOfWorlds } from "../../world-catalog.service";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import type { LocalPatchHideDeps } from "../local-patch-hide";
import { subjectStageRaw, type DualReviewProof } from "../local-patch-dual-evidence";
import { SUBJECT_QUALITY_BUNDLE_VERSION } from "../../../domain/generation/subject-quality-bundle";
import { hasLocalPatchPublicationPolicy, LOCAL_PATCH_PUBLICATION_ACTION } from "../local-patch-publication-policy";
import { LOCAL_PATCH_NEEDS_RELEASE, LOCAL_PATCH_STYLE, runLocalPatchWorldSlice } from "../local-patch-world";
import { DUAL_VISUAL_REVIEW_V3, pinVisualReviewRelease } from "../visual-review-release";
import { sha256Bytes } from "../fixed-sprite";
import { applySubjectUpgrade, planSubjectUpgrade, SubjectUpgradeRefused } from "../subject-upgrade";
import { subjectUpgradeOf } from "../subject-enrollment";
import { bill, paintedCrop, paintedOk, seedApprovedGame } from "./local-patch-fixtures";
import { GOOD_V12_VERDICT, boundHide, longAnswer, publicationBinding } from "./local-patch-dual-fixtures";
import { localPatchHideEvidenceIds } from "../local-patch-judge";

const fakes = vi.hoisted(() => ({ testers: [] as string[] }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0, LOCAL_PATCH_PLAYER_REVIEW: "on",
  GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium", LOCAL_PATCH_PROMPT_RELEASE: "v15" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: fakes.testers }), flag: () => false, adminEmails: () => [] }));

const journey = new Set(boardsOfWorlds(["journey"]));
const BOARDS = localPatchBoardsForVersion(12).filter(board => journey.has(board.board)), HIDES = BOARDS.flatMap(board => board.hides);
const ANTARCTICA = BOARDS.find(board => board.board === "antarctica")!, HATLESS = ANTARCTICA.hides[0]!.id;
let directory: string, db: PrismaClient, c: Container;
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-subject-upgrade-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(directory, "test.db").replaceAll("\\", "/")}` } } });
  await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), appUrl: "http://localhost:3000", secret: "synthetic-subject-upgrade", analytics: { track: vi.fn() }, adminEmails: [],
    email: { id: "console", send: async () => ({ id: "synthetic-mail" }) }, emailFallbackTo: null } as unknown as Container;
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("Live requests forbidden in the subject upgrade regression"); }));
}, 180_000);
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(directory) === realpathSync(tmpdir()) && path.basename(directory).startsWith("findme-subject-upgrade-")) rmSync(directory, { recursive: true });
});

/** A paid nine-board v12 journey (synthetic child, age 8) with an approved identity, a stored synthetic photograph and dual review v3. */
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
  // The "photograph" is a synthetic raster: no real child anywhere in this test.
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
  return seeded;
}
/** Synthetic painter; every paid attempt differs, and every prompt is kept for inspection. */
function painter(gameId: string, prompts: Map<string, string>): LocalPatchHideDeps {
  return { renderPolicySha256: "f".repeat(64), judge: async () => { throw Error("Per-hide judge forbidden"); },
    render: async ({ requestKey, stylePng, prompt }) => {
      const hide = HIDES.find(h => requestKey.startsWith(`${h.id}:`));
      if (!hide) throw Error(`Unexpected synthetic request ${requestKey}`);
      prompts.set(requestKey, prompt);
      const attempt = Number(requestKey.split(":").at(-1)), mask = maskForHide(hide), crop = cropOf(hide);
      const png = await sharp(await paintedCrop(stylePng, hide)).composite([{ input: { create: { width: 6, height: 6, channels: 4,
        background: { r: 40 * attempt, g: 60, b: 160, alpha: 1 } } }, left: mask.left - crop.left + Math.floor(mask.width / 2),
        top: mask.top - crop.top + Math.floor(mask.height / 2) }]).png().toBuffer();
      return paintedOk(png, bill(`paint-${gameId}-${requestKey}`));
    } };
}
const observed = (status: string) => ({ status, observation: "A specific synthetic observation of the drawn child." });
/** Synthetic subject answer for a hide: every check passes unless the hat is missing. */
function subjectAnswer(hideId: string, hatMissing: boolean) {
  const board = BOARDS.find(b => b.hides.some(h => h.id === hideId))!, plan = subjectPlanFor(board, hideId);
  return JSON.stringify({ hideId, subjectPolicy: SUBJECT_POLICY_VERSION, checks: { photoLikeness: observed("pass"), canonicalAgreement: observed("pass"),
    faceVisible: observed("pass"), perceivedAge: { ...observed("pass"), estimatedMinYears: 7, estimatedMaxYears: 9 }, plannedAction: observed("pass"),
    plannedHead: observed("pass"), plannedExpression: observed("pass"),
    requiredWardrobe: observed(plan.warmHat ? hatMissing ? "fail" : "pass" : "not-required") },
    faults: hatMissing ? [{ check: "requiredWardrobe", where: "Bare head with the hair exposed in the snow" }] : [] });
}
const NO_REPLY = { verdict: null, raw: null, usage: null, requestId: null, model: null, finishReason: null, wireFault: "timeout" as const, costUnknown: true };

describe("the same paid world, upgraded: three interrupted reviews, subject requirements, all 27 before READY", () => {
  it("continues the third interruption only after enrollment, re-assesses every appearance, repaints the hatless one and publishes all 27", async () => {
    const gameId = "subject-upgrade-world"; const seeded = await world(gameId);
    const budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(gameId), prompts = new Map<string, string>();
    const timedOut = new Set<string>(), subjectCalls = new Map<string, number>();
    let enrolled = false, syncContinuityAfterEnrollment = 0, calls = 0, lastTimeoutHide: string | null = null;
    const request = vi.fn<NonNullable<Container["visualReview"]>["request"]>(async question => {
      const bound = boundHide(question.prompt), id = `subject-${gameId}-${++calls}`;
      if (question.prompt.includes(SUBJECT_QUALITY_BUNDLE_VERSION)) {
        const n = (subjectCalls.get(bound.hideId) ?? 0) + 1; subjectCalls.set(bound.hideId, n);
        const child = JSON.parse(subjectAnswer(bound.hideId, false));
        if (bound.hideId === lastTimeoutHide && n === 1) {
          child.checks.perceivedAge = { ...observed("fail"), estimatedMinYears: 10, estimatedMaxYears: 11 };
          child.faults.push({ check: "perceivedAge", where: "An older schoolchild's face and body rather than the stated eight-year-old" });
        }
        return { verdict: null, model: "claude-opus-5-5", requestId: id, finishReason: "end_turn", wireFault: null, costUnknown: false,
          usage: { input_tokens: 2000, output_tokens: 500 }, raw: JSON.stringify({ version: SUBJECT_QUALITY_BUNDLE_VERSION,
            quality: { hides: [{ hideId: bound.hideId, evidenceIds: localPatchHideEvidenceIds(bound.hideId), verdict: GOOD_V12_VERDICT }] }, subject: child }) };
      }
      if (question.prompt.includes(SUBJECT_POLICY_VERSION)) {
        const n = (subjectCalls.get(bound.hideId) ?? 0) + 1; subjectCalls.set(bound.hideId, n);
        return { verdict: null, model: "claude-opus-5-5", requestId: id, finishReason: "end_turn", wireFault: null, costUnknown: false,
          usage: { input_tokens: 2000, output_tokens: 500 }, raw: subjectAnswer(bound.hideId, bound.hideId === HATLESS && n === 1) };
      }
      if (question.role === "scene-quality") return { verdict: null, model: "claude-opus-5-5", requestId: id, finishReason: "end_turn", wireFault: null,
        costUnknown: false, usage: { input_tokens: 2000, output_tokens: 500 },
        raw: "```json\n" + JSON.stringify({ hides: [{ hideId: bound.hideId, evidenceIds: localPatchHideEvidenceIds(bound.hideId), verdict: GOOD_V12_VERDICT }] }) + "\n```" };
      if (enrolled) syncContinuityAfterEnrollment++;
      // The pilot's failure: three HIGH continuity calls whose answers never arrived.
      if (["marrakech-v12-2", "tokyo-v12-2", "newyork-v12-3"].includes(bound.hideId) && !timedOut.has(bound.hideId)) {
        timedOut.add(bound.hideId); lastTimeoutHide = bound.hideId; return NO_REPLY;
      }
      return { verdict: null, model: "gpt-6.1-sol", requestId: id, finishReason: "stop", wireFault: null, costUnknown: false,
        usage: { prompt_tokens: 2000, completion_tokens: 500 }, raw: longAnswer(bound.hideId, 400, 400, 160) };
    });
    const before = { ...c, visualReview: { request } } as Container;

    // 1. Before the upgrade: two interruptions continue under v1; the third holds the world.
    let ticks = 0, attention: string | null = null;
    for (; ticks < 200 && !attention; ticks++) attention = (await runLocalPatchWorldSlice(before, painter(gameId, prompts), gameId, { hardDeadlineAt: Date.now() + 270_000 })).attention;
    expect(timedOut.size).toBe(3);
    const job = await db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } });
    expect(job.currentStep).toBe(LOCAL_PATCH_NEEDS_RELEASE);
    const held = await budget.audit(worldId);
    expect(held).toMatchObject({ held: true, reservedMicroUsd: 198_000 });
    const versions = await Promise.all(held.unknownRequestKeys.map(async key => (await budget.readContinuationApproval(worldId, key))?.version ?? null));
    expect(versions.filter(v => v === "world-automatic-review-recovery/v1")).toHaveLength(2);
    expect(versions.filter(v => v === null)).toHaveLength(1);
    const acceptedBefore = (await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } }, status: "GENERATED" } }))
      .filter(row => JSON.parse(row.judgeJson ?? "{}").boardReview?.dual?.continuity);
    for (const row of acceptedBefore) expect(await hasLocalPatchPublicationPolicy(c, publicationBinding(gameId, row))).toBe(true);
    const settledBefore = held.settledMicroUsd;
    // Batch can settle quality before the foreground reads it: no quality checkpoint
    // is written in that case. Reproduce this genuine shape with accepted siblings.
    const interrupted = (await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } } }))
      .find(row => JSON.parse(row.judgeJson ?? "{}").hide === lastTimeoutHide)!;
    const interruptedReceipt = JSON.parse(interrupted.judgeJson!); delete interruptedReceipt.dualQualityCheckpoint;
    await db.targetVariantAsset.update({ where: { id: interrupted.id }, data: { judgeJson: JSON.stringify(interruptedReceipt) } });
    expect(acceptedBefore.some(row => JSON.parse(row.judgeJson!).hide.split("-v12-")[0] === lastTimeoutHide!.split("-v12-")[0])).toBe(true);

    // 2. Read-only preflight, then the fenced apply of exactly that plan.
    const background = fakeBackground();
    const after = { ...before, backgroundReview: background.fake } as Container;
    expect((await planSubjectUpgrade(before, { gameId, ownerId: seeded.userId })).refusals).toContain("the HIGH review transports (synchronous and background) are not both configured");
    expect((await planSubjectUpgrade(after, { gameId, ownerId: "someone-else" })).eligible).toBe(false);
    const plan = await planSubjectUpgrade(after, { gameId, ownerId: seeded.userId });
    expect(plan).toMatchObject({ eligible: true, refusals: [], alreadyEnrolled: false, subjectReviewsNeeded: 27,
      budget: { reservedMicroUsd: 198_000, held: true, reviewRecoveryV1: 2, reviewRecoveryV2: 0, reviewRecoveryV2Needed: 1 } });
    expect(plan.budget!.unknown.filter(u => !u.continuedBy).every(u => u.noResponse && u.boundHideId)).toBe(true);
    expect(plan.hides.filter(h => h.warmHat).map(h => h.hideId)).toEqual(ANTARCTICA.hides.map(h => h.id));
    expect(await db.auditLog.count({ where: { entityId: gameId, action: "generation:subject-upgrade" } })).toBe(0);
    await expect(applySubjectUpgrade(after, { gameId, ownerId: seeded.userId, operatorId: "operator-synthetic", expectedPlanSha256: "0".repeat(64) }))
      .rejects.toBeInstanceOf(SubjectUpgradeRefused);
    const applied = await applySubjectUpgrade(after, { gameId, ownerId: seeded.userId, operatorId: "operator-synthetic", expectedPlanSha256: plan.planSha256 });
    expect(applied).toMatchObject({ applied: true, recovered: 1, receipt: { subjectPolicy: SUBJECT_POLICY_VERSION, ageYears: 8,
      photoSha256: sha256Bytes(seeded.sheet), continuityTransport: "openai-responses-background/v1" } });
    enrolled = true;
    expect(await applySubjectUpgrade(after, { gameId, ownerId: seeded.userId, operatorId: "operator-synthetic", expectedPlanSha256: plan.planSha256 }))
      .toMatchObject({ applied: false, recovered: 0 });
    // Nothing was released or repriced: all three unknown charges stay reserved in full; only the hold lifted.
    const continued = await budget.audit(worldId);
    expect(continued).toMatchObject({ held: false, reservedMicroUsd: 198_000, settledMicroUsd: settledBefore });
    expect((await Promise.all(continued.unknownRequestKeys.map(async key => (await budget.readContinuationApproval(worldId, key))?.version))).sort())
      .toEqual(["world-automatic-review-recovery/v1", "world-automatic-review-recovery/v1", "world-automatic-review-recovery/v2"]);
    expect((await db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } })).currentStep).toBe("local-patch");
    // An old pass no longer publishes: it has no subject approval.
    for (const row of acceptedBefore) expect(await hasLocalPatchPublicationPolicy(c, publicationBinding(gameId, row))).toBe(false);

    // 3. The ordinary queue: subject review for all 27, background continuity, the hatless hide repainted.
    let result = { pending: true, attention: null as string | null };
    for (ticks = 0; ticks < 600 && result.pending; ticks++) {
      result = await runLocalPatchWorldSlice(after, painter(gameId, prompts), gameId, { hardDeadlineAt: Date.now() + 270_000 });
      expect(result.attention).toBeNull();
    }
    const game = await db.game.findUniqueOrThrow({ where: { id: gameId } });
    expect(["READY", "DELIVERED"]).toContain(game.status);
    expect(GameConfigSchema.parse(JSON.parse(game.configJson!)).scenes.flatMap(scene => scene.targets)).toHaveLength(27);
    const rows = await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } } });
    expect(rows).toHaveLength(27);
    for (const row of rows) {
      const receipt = JSON.parse(row.judgeJson!), proof = receipt.boardReview.dual as DualReviewProof, hideId = receipt.hide as string;
      const board = BOARDS.find(b => b.hides.some(h => h.id === hideId))!;
      expect(proof.subject && proof.imageSha256 === receipt.judgedSha256).toBe(true);
      expect(readSubjectAnswer(subjectStageRaw(proof.subject!), { hideId, ageYears: 8, plan: subjectPlanFor(board, hideId) })).toMatchObject({ ok: true, disposition: "pass" });
      expect(await hasLocalPatchPublicationPolicy(c, publicationBinding(gameId, row))).toBe(true);
    }
    expect(await db.auditLog.count({ where: { entityId: gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBeGreaterThanOrEqual(27);
    // The hatless appearance was refused on its subject alone and painted again with the plan and its fixed repair line.
    const hatless = rows.find(row => JSON.parse(row.judgeJson!).hide === HATLESS)!;
    const repaint = [...prompts.entries()].filter(([key]) => key.startsWith(`${HATLESS}:`)).at(-1)!;
    expect(subjectCalls.get(HATLESS)).toBe(2);
    expect(JSON.parse(hatless.rejectedAssetIdsJson ?? "[]").length).toBeGreaterThanOrEqual(1);
    expect(repaint[1]).toContain("WARM HAT REQUIRED");
    expect(repaint[1]).toContain("SUBJECT REPAIR: the previous painting failed requiredWardrobe");
    expect(repaint[1]).toContain("warm knit winter hat");
    // Every new continuity question went to the background, once per question; none synchronously.
    expect(syncContinuityAfterEnrollment).toBe(0);
    expect(background.creates.length).toBeGreaterThan(0);
    expect(new Set(background.creates).size).toBe(background.creates.length);
    expect(background.creates.every(body => !body.includes(interruptedReceipt.judgedSha256))).toBe(true);
    // The three interrupted charges stay counted; nothing else is left reserved; the cap holds.
    const final = await budget.audit(worldId);
    expect(final).toMatchObject({ held: false, reservedMicroUsd: 198_000, pendingRequestKeys: [] });
    expect(final.committedMicroUsd).toBeLessThanOrEqual(final.capMicroUsd);
    expect((await subjectUpgradeOf(db, gameId))?.operatorId).toBe("operator-synthetic");
    expect(fetch).not.toHaveBeenCalled();
  }, 1_200_000);
});

/** A synthetic background provider: each response runs for one poll, then completes with a coherent anatomy answer. */
function fakeBackground() {
  const creates: string[] = [], polls = new Map<string, { hideId: string; reads: number }>();
  const fake: BackgroundReviewTransport = { namespace: "openai:find-me-existing",
    create: async body => {
      const prompt = (body.input as { content: { text?: string }[] }[])[0]!.content[0]!.text!;
      creates.push(JSON.stringify(body));
      const responseId = `resp_synthetic${creates.length}`;
      polls.set(responseId, { hideId: boundHide(prompt).hideId, reads: 0 });
      return { responseId };
    },
    retrieve: async (responseId): Promise<BackgroundReviewState> => {
      const state = polls.get(responseId);
      if (!state) return { status: "missing" };
      if (++state.reads === 1) return { status: "in_progress" };
      return { status: "completed", reading: { responseId, raw: longAnswer(state.hideId, 400, 400, 160), usage: { input_tokens: 2000, output_tokens: 500 },
        model: "gpt-6.1-sol", finishReason: "stop", serviceTier: "default" } };
    },
    cancel: async () => {} };
  return { fake, creates };
}
