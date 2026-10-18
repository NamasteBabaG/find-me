import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import type { BackgroundReviewState, BackgroundReviewTransport } from "../../../infra/generation/types";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { maskForHide } from "../../../domain/scene/local-patch-hides";
import { SUBJECT_V2_REPAIR_CYCLES } from "../../../domain/scene/local-patch-progress";
import {
  SUBJECT_POLICY_V2, SUBJECT_POLICY_VERSION, SUBJECT_READER, SUBJECT_READER_V2, readSubjectAnswerV2, subjectPlanFor,
} from "../../../domain/generation/subject-policy";
import { SUBJECT_QUALITY_BUNDLE_VERSION } from "../../../domain/generation/subject-quality-bundle";
import type { Container } from "../../container";
import { boardsOfWorlds } from "../../world-catalog.service";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import type { LocalPatchHideDeps } from "../local-patch-hide";
import { subjectStageRaw, type DualReviewProof, type SubjectStage } from "../local-patch-dual-evidence";
import { hasLocalPatchPublicationPolicy } from "../local-patch-publication-policy";
import { LOCAL_PATCH_RECOVERY_EXHAUSTED, LOCAL_PATCH_STYLE, runLocalPatchWorldSlice } from "../local-patch-world";
import { DUAL_VISUAL_REVIEW_V3, pinVisualReviewRelease } from "../visual-review-release";
import { sha256Bytes } from "../fixed-sprite";
import { applySubjectUpgrade, planSubjectUpgrade } from "../subject-upgrade";
import { subjectPlanSha256 } from "../subject-enrollment";
import { SUBJECT_REJUDGE_VERSION } from "../subject-rejudge";
import type { SelfRepairWire } from "../local-patch-self-repair";
import { localPatchHideEvidenceIds } from "../local-patch-judge";
import { bill, paintedOk, seedApprovedGame } from "./local-patch-fixtures";
import { GOOD_V12_VERDICT, boundHide, longAnswer, publicationBinding } from "./local-patch-dual-fixtures";

/**
 * local-patch-subject/v2 on a whole paid world (synthetic child, age 8; no real photograph, no provider).
 * Four of the pilot's failures, each against its negative control:
 *  - a natural pose refused under v1 is asked the v2 question about the SAME pixels, never repainted,
 *    and keeps its v1 refusal in the record; a refusal that also named the face is repainted;
 *  - the pasted portrait itself is accepted once on a board; its siblings are repainted for variety;
 *  - a diagnosis is told who the child is (the photograph, the refusal, its located defect), and a plan
 *    to recompose the very painting whose child was refused is refused before anything is bought;
 *  - an appearance that keeps failing stops after its bounded cycles; the world reports it by name and
 *    is never READY without it, while everything else is finished first.
 */
const fakes = vi.hoisted(() => ({ testers: [] as string[] }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0, LOCAL_PATCH_PLAYER_REVIEW: "on",
  GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium", LOCAL_PATCH_PROMPT_RELEASE: "v15" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: fakes.testers }), flag: () => false, adminEmails: () => [] }));

const journey = new Set(boardsOfWorlds(["journey"]));
const BOARDS = localPatchBoardsForVersion(12).filter(board => journey.has(board.board)), HIDES = BOARDS.flatMap(board => board.hides);
const boardOf = (hideId: string) => BOARDS.find(b => b.hides.some(h => h.id === hideId))!;
/** The paid-repair fixture's hide: its plan geometry is known to clear every sibling. */
const EXHAUST = BOARDS.find(b => b.board === "antarctica")!.hides[2]!;
const VARIETY = BOARDS.find(b => b.board === "paris")!;
const EARLY = BOARDS.find(b => b.board !== "antarctica" && b.board !== "paris")!;
const REJUDGE = EARLY.hides[0]!, NEGATIVE = EARLY.hides[1]!;
const IDENTITY_DEFECT = "Kneeling child by the penguins: a different child's face, short dark hair instead of the photograph's long fringe";
const HEADS = ["three-quarter", "profile", "down", "up", "away"] as const;
const observed = (status: string) => ({ status, observation: "A specific synthetic observation of the drawn child." });

let directory: string, db: PrismaClient, c: Container;
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-subject-v2-world-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(directory, "test.db").replaceAll("\\", "/")}` } } });
  await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), appUrl: "http://localhost:3000", secret: "synthetic-subject-v2-world", analytics: { track: vi.fn() }, adminEmails: [],
    email: { id: "console", send: async () => ({ id: "synthetic-mail" }) }, emailFallbackTo: null } as unknown as Container;
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("Live requests forbidden in the subject v2 world"); }));
}, 180_000);
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(directory) === realpathSync(tmpdir()) && path.basename(directory).startsWith("findme-subject-v2-world-")) rmSync(directory, { recursive: true });
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
      const attempt = Number(requestKey.split(":").at(-1)) + (requestKey.includes(":self-repair:") ? 3 : 0), mask = maskForHide(hide);
      const figure = await sharp({ create: { width: Math.round(mask.width * 0.6), height: Math.round(mask.height * 0.8),
        channels: 4, background: { r: Math.min(255, 30 * attempt), g: 60, b: 160, alpha: 255 } } }).png().toBuffer();
      const png = await sharp(stylePng).composite([{ input: figure,
        left: mask.left + Math.round(mask.width * 0.2), top: mask.top + Math.round(mask.height * 0.2) }]).png().toBuffer();
      return paintedOk(png, bill(`paint-${gameId}-${requestKey}`));
    } };
}

/** What the drawn child looks like, answered to the v2 question: the exhausting hide is another child's face;
 * the first painting of every Paris hide is the canonical portrait itself, pasted. */
function subjectAnswer(hideId: string, n: number) {
  const plan = subjectPlanFor(boardOf(hideId), hideId), index = HIDES.findIndex(h => h.id === hideId);
  const stranger = hideId === EXHAUST.id, copy = VARIETY.hides.some(h => h.id === hideId) && n === 1;
  return { hideId, subjectPolicy: SUBJECT_POLICY_V2, checks: { photoLikeness: observed(stranger ? "fail" : "pass"), canonicalAgreement: observed("pass"),
      faceVisible: observed("pass"), perceivedAge: { ...observed("pass"), estimatedMinYears: 7, estimatedMaxYears: 9 },
      requiredWardrobe: observed(plan.warmHat ? "pass" : "not-required") },
    appearance: copy ? { head: "three-quarter", expression: "open-smile", engagement: "posing", portraitCopy: true }
      : { head: HEADS[index % HEADS.length], expression: "focused", engagement: index % 2 ? "acting" : "watching", portraitCopy: false },
    faults: stranger ? [{ check: "photoLikeness", where: IDENTITY_DEFECT }] : [] };
}
/** The historical v1 answer that refused a hide, as the pilot's records hold it. */
function v1Refusal(hideId: string, faceToo: boolean) {
  return JSON.stringify({ hideId, subjectPolicy: SUBJECT_POLICY_VERSION, checks: { photoLikeness: observed(faceToo ? "fail" : "pass"),
    canonicalAgreement: observed("pass"), faceVisible: observed("pass"), perceivedAge: { ...observed("pass"), estimatedMinYears: 7, estimatedMaxYears: 9 },
    plannedAction: observed("fail"), plannedHead: observed("pass"), plannedExpression: observed("pass"), requiredWardrobe: observed("not-required") },
    faults: [{ check: "plannedAction", where: "Both arms hang at the sides; no forearm reaches into the scene" },
      ...(faceToo ? [{ check: "photoLikeness", where: "Short cropped hair above the ears instead of the long shaggy fringe" }] : [])] });
}

describe("local-patch-subject/v2 on a whole paid world", () => {
  it("re-asks a natural pose, repaints for variety, tells the diagnosis who the child is, and stops a repeatedly failing appearance by name", async () => {
    const gameId = "subject-v2-world"; const seeded = await world(gameId);
    const budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(gameId), prompts = new Map<string, string>();
    const subjectCalls = new Map<string, number>(), policiesAsked = new Set<string>();
    let enrolled = false, syncContinuityAfterEnrollment = 0, calls = 0;
    const request = vi.fn<NonNullable<Container["visualReview"]>["request"]>(async question => {
      const bound = boundHide(question.prompt), id = `req-${gameId}-${++calls}`;
      const asked = (raw: string, model = "claude-opus-5-5") => ({ verdict: null, model, requestId: id, finishReason: model === "claude-opus-5-5" ? "end_turn" : "stop",
        wireFault: null, costUnknown: false, usage: model === "claude-opus-5-5" ? { input_tokens: 2000, output_tokens: 500 } : { prompt_tokens: 2000, completion_tokens: 500 }, raw });
      const subject = () => { const n = (subjectCalls.get(bound.hideId) ?? 0) + 1; subjectCalls.set(bound.hideId, n); return subjectAnswer(bound.hideId, n); };
      if (question.prompt.includes(SUBJECT_QUALITY_BUNDLE_VERSION)) {
        policiesAsked.add(question.prompt.includes(`subjectPolicy:"${SUBJECT_POLICY_V2}"`) ? SUBJECT_POLICY_V2 : "other");
        return asked(JSON.stringify({ version: SUBJECT_QUALITY_BUNDLE_VERSION, quality: { hides: [{ hideId: bound.hideId,
          evidenceIds: localPatchHideEvidenceIds(bound.hideId), verdict: GOOD_V12_VERDICT }] }, subject: subject() }));
      }
      if (question.prompt.includes(SUBJECT_POLICY_V2)) { policiesAsked.add(SUBJECT_POLICY_V2); return asked(JSON.stringify(subject())); }
      if (question.prompt.includes(SUBJECT_POLICY_VERSION)) { policiesAsked.add(SUBJECT_POLICY_VERSION); throw Error("No v1 subject question may be bought"); }
      if (question.role === "scene-quality") return asked("```json\n" + JSON.stringify({ hides: [{ hideId: bound.hideId,
        evidenceIds: localPatchHideEvidenceIds(bound.hideId), verdict: GOOD_V12_VERDICT }] }) + "\n```");
      if (enrolled) syncContinuityAfterEnrollment++;
      return asked(longAnswer(bound.hideId, 400, 400, 160), "gpt-6.1-sol");
    });
    const before = { ...c, visualReview: { request } } as Container;
    const rowOf = async (hideId: string) => (await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } } }))
      .find(row => JSON.parse(row.judgeJson ?? "{}").hide === hideId)!;
    const accepted = (row: { status: string; judgeJson: string | null } | undefined) => {
      if (!row || row.status !== "GENERATED") return false;
      const receipt = JSON.parse(row.judgeJson ?? "{}");
      return receipt.reviewState === "board-review-complete" && !!receipt.boardReview?.dual?.continuity;
    };

    // 1. Before enrollment: the first board's appearances are accepted on quality and continuity alone.
    for (let ticks = 0; ticks < 200 && !(accepted(await rowOf(REJUDGE.id).catch(() => undefined)) && accepted(await rowOf(NEGATIVE.id).catch(() => undefined))); ticks++) {
      const result = await runLocalPatchWorldSlice(before, painter(gameId, prompts), gameId, { hardDeadlineAt: Date.now() + 270_000 });
      expect(result.attention).toBeNull();
    }
    expect(accepted(await rowOf(REJUDGE.id)) && accepted(await rowOf(NEGATIVE.id))).toBe(true);

    // 2. Enrollment, then the two appearances exactly as v1 left them: refused for the planned forearm alone,
    // and for the forearm and the face. Their quality and continuity answers are the ones already paid for.
    const background = fakeBackground(), after = { ...before, backgroundReview: background.fake } as Container;
    const plan = await planSubjectUpgrade(after, { gameId, ownerId: seeded.userId });
    expect(plan).toMatchObject({ eligible: true, refusals: [] });
    await applySubjectUpgrade(after, { gameId, ownerId: seeded.userId, operatorId: "operator-synthetic", expectedPlanSha256: plan.planSha256 });
    enrolled = true;
    const historical = new Map<string, { receipt: Record<string, unknown>; quality: string; continuity: string; asset: string; image: string; renders: number }>();
    for (const [hide, faceToo] of [[REJUDGE, false], [NEGATIVE, true]] as const) {
      const row = await rowOf(hide.id), receipt = JSON.parse(row.judgeJson!), proof = receipt.boardReview.dual as DualReviewProof;
      const subject: SubjectStage = { requestKey: `self-repair:board:${EARLY.board}:v1-subject-${hide.id}`, fingerprint: `v1-subject-${hide.id}`,
        attempt: proof.quality.attempt, policy: proof.quality.policy, raw: v1Refusal(hide.id, faceToo), model: proof.quality.model, finishReason: "end_turn",
        wireFault: null, costMicroUsd: 60_000, subjectPolicy: SUBJECT_POLICY_VERSION, reader: SUBJECT_READER, photoSha256: plan.receipt!.photoSha256,
        planSha256: subjectPlanSha256(subjectPlanFor(EARLY, hide.id)), failedChecks: faceToo ? ["photoLikeness", "plannedAction"] : ["plannedAction"] };
      const refused = { ...receipt, verdict: { ...receipt.verdict, childPresent: "fail", verdict: "fail" }, qualityDisposition: { state: "retry", faults: ["childPresent"] },
        boardReview: { ...receipt.boardReview, dual: { ...proof, subject } } };
      await db.targetVariantAsset.update({ where: { id: row.id }, data: { status: "FAILED", lastError: "quality-retry: childPresent",
        judgeJson: JSON.stringify(refused), rejectedAssetIdsJson: JSON.stringify([row.assetId]) } });
      await db.targetInstance.update({ where: { id: row.targetInstanceId }, data: { status: "FAILED" } });
      historical.set(hide.id, { receipt: refused, quality: proof.quality.requestKey, continuity: proof.continuity!.requestKey, asset: row.assetId!,
        image: receipt.judgedSha256, renders: [...prompts.keys()].filter(key => key.startsWith(`${hide.id}:`)).length });
    }
    await db.gameScene.updateMany({ where: { gameId, sceneSlug: EARLY.board }, data: { generationStatus: "NEEDS_REGENERATION" } });
    const subjectBefore = new Map(subjectCalls);

    // 3. The ordinary queue until it stops.
    const diagnoses: SelfRepairWire[] = [];
    const mask = maskForHide(EXHAUST), core = { left: mask.left + 12, top: 40, width: 40, height: 60 };
    const geometry = { returnWindow: { left: 16, top: 16, width: 480, height: 736 }, protectedCore: core, faceRect: { left: core.left + 4, top: core.top + 4, width: 30, height: 30 } };
    const plans = [
      { cause: "composition-clipping", action: "recompose-retained", sourceKey: `${EXHAUST.id}:${EXHAUST.pose}:render:2` },
      { cause: "composition-clipping", action: "recompose-retained", sourceKey: `${EXHAUST.id}:${EXHAUST.pose}:render:1` },
      { cause: "wrong-identity", action: "redraw-with-new-placement", sourceKey: `${EXHAUST.id}:${EXHAUST.pose}:render:1` },
    ];
    const diagnose = vi.fn(async (wire: SelfRepairWire) => {
      diagnoses.push(wire);
      return { verdict: null, raw: JSON.stringify({ ...plans[Math.min(diagnoses.length, plans.length) - 1], ...geometry,
        explanation: "Synthetic diagnosis of the refused painting and its join." }), usage: { prompt_tokens: 9000, completion_tokens: 500 },
        requestId: `req-${gameId}-diagnosis-${diagnoses.length}`, model: "gpt-5.6-sol", finishReason: "stop", wireFault: null, costUnknown: false };
    });
    let result = { pending: true, attention: null as string | null }, ticks = 0;
    for (; ticks < 900 && result.pending; ticks++)
      result = await runLocalPatchWorldSlice(after, painter(gameId, prompts), gameId, { hardDeadlineAt: Date.now() + 270_000, diagnose });

    // It stopped for exactly one appearance, by name, with nothing more bought for it; never READY without it.
    expect(result.attention).toContain(`spent their ${SUBJECT_V2_REPAIR_CYCLES} automatic repair cycles under local-patch-subject/v2 (${EXHAUST.id})`);
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } })).toMatchObject({ status: "FAILED", currentStep: LOCAL_PATCH_RECOVERY_EXHAUSTED });
    expect((await db.game.findUniqueOrThrow({ where: { id: gameId } })).status).toBe("TARGETS_GENERATING");
    const rows = await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } } });
    expect(rows).toHaveLength(27);
    const exhausted = rows.find(row => JSON.parse(row.judgeJson!).hide === EXHAUST.id)!;
    expect(exhausted.status).toBe("FAILED");
    expect(JSON.parse(exhausted.judgeJson!).selfRepair).toMatchObject({ subjectV2Cycles: SUBJECT_V2_REPAIR_CYCLES, cycle: SUBJECT_V2_REPAIR_CYCLES });
    expect(diagnoses).toHaveLength(SUBJECT_V2_REPAIR_CYCLES);
    // Every other appearance was finished first, each with a v2 pass bound to its own pixels.
    for (const row of rows.filter(r => r.id !== exhausted.id)) {
      const receipt = JSON.parse(row.judgeJson!), proof = receipt.boardReview.dual as DualReviewProof, hideId = receipt.hide as string;
      expect(row.status, hideId).toBe("GENERATED");
      expect(proof.imageSha256).toBe(receipt.judgedSha256);
      expect(proof.subject).toMatchObject({ subjectPolicy: SUBJECT_POLICY_V2, reader: SUBJECT_READER_V2 });
      expect(readSubjectAnswerV2(subjectStageRaw(proof.subject!), { hideId, ageYears: 8, plan: subjectPlanFor(boardOf(hideId), hideId) }))
        .toMatchObject({ ok: true, disposition: "pass" });
      expect(await hasLocalPatchPublicationPolicy(c, publicationBinding(gameId, row))).toBe(true);
    }
    expect([...policiesAsked]).toEqual([SUBJECT_POLICY_V2]);
    expect(syncContinuityAfterEnrollment).toBe(0);

    // A natural pose: the same pixels, one v2 question, no painting; the quality and continuity it already had.
    const rejudged = rows.find(row => JSON.parse(row.judgeJson!).hide === REJUDGE.id)!, was = historical.get(REJUDGE.id)!;
    const rejudgedReceipt = JSON.parse(rejudged.judgeJson!), rejudgedProof = rejudgedReceipt.boardReview.dual as DualReviewProof;
    expect(rejudged.assetId).toBe(was.asset);
    expect(rejudgedReceipt.judgedSha256).toBe(was.image);
    expect([...prompts.keys()].filter(key => key.startsWith(`${REJUDGE.id}:`))).toHaveLength(was.renders);
    expect((subjectCalls.get(REJUDGE.id) ?? 0) - (subjectBefore.get(REJUDGE.id) ?? 0)).toBe(1);
    expect(rejudgedProof.quality.requestKey).toBe(was.quality);
    expect(rejudgedProof.continuity!.requestKey).toBe(was.continuity);
    // Nothing old is relabelled: the v1 refusal stays in the record, marked superseded by this re-judgment.
    expect(rejudgedReceipt.reviewHistory.at(-1)).toMatchObject({ supersededBy: SUBJECT_REJUDGE_VERSION, lastError: "quality-retry: childPresent",
      boardReview: { dual: { subject: { subjectPolicy: SUBJECT_POLICY_VERSION, failedChecks: ["plannedAction"], fingerprint: `v1-subject-${REJUDGE.id}` } } } });
    // A refusal that also named the face is painted again, told what was located on it.
    const repainted = rows.find(row => JSON.parse(row.judgeJson!).hide === NEGATIVE.id)!;
    expect(repainted.assetId).not.toBe(historical.get(NEGATIVE.id)!.asset);
    const negativePrompt = [...prompts.entries()].filter(([key]) => key.startsWith(`${NEGATIVE.id}:`)).at(-1)![1];
    expect(negativePrompt).toContain("REPAIR: the previous painting of this appearance was refused for photoLikeness");
    expect(negativePrompt).toContain('The reviewer located on the refused painting: "photoLikeness: Short cropped hair above the ears instead of the long shaggy fringe"');
    expect(negativePrompt).not.toContain("ACTION REPAIR");

    // Variety: the pasted portrait once on the board; each sibling repainted with the variety repair, then accepted.
    const copies = VARIETY.hides.filter(hide => {
      const proof = JSON.parse(rows.find(row => JSON.parse(row.judgeJson!).hide === hide.id)!.judgeJson!).boardReview.dual as DualReviewProof;
      const reading = readSubjectAnswerV2(subjectStageRaw(proof.subject!), { hideId: hide.id, ageYears: 8, plan: subjectPlanFor(VARIETY, hide.id) });
      return reading.ok && reading.appearance.portraitCopy;
    });
    expect(copies).toHaveLength(1);
    const varietyRepaints = VARIETY.hides.filter(hide => [...prompts.entries()].some(([key, prompt]) => key.startsWith(`${hide.id}:`)
      && prompt.includes("VARIETY REPAIR") && prompt.includes("refused for collectionVariety")));
    expect(varietyRepaints.map(hide => hide.id)).toEqual(VARIETY.hides.filter(hide => hide.id !== copies[0]!.id).map(hide => hide.id));

    // The diagnosis saw the photograph and was told the refusal; recomposing the refused painting was refused unbought.
    for (const wire of diagnoses) {
      expect(wire.imageLabels.at(-1)).toMatch(/^ORIGINAL PHOTOGRAPH of the child/);
      expect(wire.prompt).toContain('"codes":["photoLikeness"]');
      expect(wire.prompt).toContain(`photoLikeness: ${IDENTITY_DEFECT}`);
      expect(wire.prompt).toContain("defect INSIDE the painted child");
    }
    expect(diagnoses[0]!.prompt).toContain(`sourceKey "${EXHAUST.id}:${EXHAUST.pose}:render:2") cannot fix it`);
    // The first plan recomposed that very painting: refused before any purchase, and the next diagnosis is told why.
    expect(diagnoses[1]!.prompt).toContain("A defect inside the painted child cannot be fixed by recomposing the painting it came from");
    // A different retained painting may still be recomposed: the second plan was not refused for it.
    expect(diagnoses[2]!.prompt).not.toContain("A defect inside the painted child cannot be fixed by recomposing the painting it came from");
    expect([...prompts.keys()].filter(key => /:self-repair:[12]$/.test(key) && key.startsWith(`${EXHAUST.id}:`))).toHaveLength(0);
    const redraw = prompts.get(`${EXHAUST.id}:${EXHAUST.pose}:self-repair:3`)!;
    expect(redraw).toContain("REPAIR: the previous painting of this appearance was refused for photoLikeness");
    expect(redraw).toContain(`The reviewer located on the refused painting: "photoLikeness: ${IDENTITY_DEFECT}"`);
    expect(redraw).toContain("WARM HAT REQUIRED");

    // Bounded: nothing pending, everything inside the world's ceiling, no live request.
    const final = await budget.audit(worldId);
    expect(final).toMatchObject({ held: false, pendingRequestKeys: [] });
    expect(final.committedMicroUsd).toBeLessThanOrEqual(final.capMicroUsd);
    expect(background.creates.length).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();
  }, 1_500_000);
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
