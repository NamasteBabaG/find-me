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
  SUBJECT_POLICY_V2, SUBJECT_POLICY_VERSION, SUBJECT_READER, SUBJECT_READER_V2, readSubjectAnswerV2, subjectCollectionSummary, subjectPlanFor,
} from "../../../domain/generation/subject-policy";
import { SUBJECT_QUALITY_BUNDLE_VERSION } from "../../../domain/generation/subject-quality-bundle";
import type { Container } from "../../container";
import { boardsOfWorlds } from "../../world-catalog.service";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { readShippedBoardArt, runLocalPatchHide, type LocalPatchHideDeps } from "../local-patch-hide";
import { localPatchRetainedAnswerUndecided, subjectStageRaw, type DualReviewProof, type SubjectStage } from "../local-patch-dual-evidence";
import { hasLocalPatchPublicationPolicy } from "../local-patch-publication-policy";
import { LOCAL_PATCH_RECOVERY_EXHAUSTED, LOCAL_PATCH_STYLE, runLocalPatchWorldSlice } from "../local-patch-world";
import { DUAL_VISUAL_REVIEW_V3, pinVisualReviewRelease } from "../visual-review-release";
import { sha256Bytes } from "../fixed-sprite";
import { applySubjectUpgrade, planSubjectUpgrade } from "../subject-upgrade";
import { subjectPlanSha256 } from "../subject-enrollment";
import { SUBJECT_REJUDGE_VERSION } from "../subject-rejudge";
import type { SelfRepairWire } from "../local-patch-self-repair";
import { localPatchHideEvidenceIds } from "../local-patch-judge";
import { prepareLocalPatchBoardReview, reviewLocalPatchBoard } from "../local-patch-board-review";
import { dualReviewQuestionCandidates } from "../local-patch-dual-review";
import { visualReviewPolicy } from "../../../domain/generation/visual-review-policy";
import { visualReviewCharge } from "../../../infra/generation/visual-review-pricing";
import { DUAL_REVIEW_V3_RESERVE_MICRO_USD } from "../../../domain/generation/dual-review-reserve";
import { purchaseOnce } from "../paid-operation";
import { LocalPatchRetainedPurchaseStore } from "../local-patch-lifecycle";
import { bill, paintedOk, seedApprovedGame } from "./local-patch-fixtures";
import { GOOD_V12_VERDICT, asDeployedReaderRefusal, boundHide, longAnswer, publicationBinding } from "./local-patch-dual-fixtures";

/**
 * local-patch-subject/v2 on a whole paid world (synthetic child, age 8; no real photograph, no provider).
 * Four of the pilot's failures, each against its negative control:
 *  - a natural pose refused under v1 is asked the v2 question about the SAME pixels, never repainted,
 *    and keeps its v1 refusal in the record; a refusal that also named the face is repainted;
 *  - similar natural children are accepted; the pasted portrait is accepted up to a third of the world, three
 *    times on one board too, and only the appearances past that are repainted for variety;
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
const EARLY = BOARDS.find(b => b.board !== "antarctica")!;
const REJUDGE = EARLY.hides[0]!, NEGATIVE = EARLY.hides[1]!;
/** Three v1 questions bought before the switch to v2 whose answers were never recorded on their rows. */
const EARLY2 = BOARDS.find(b => !["antarctica", EARLY.board].includes(b.board))!;
const V1_BUNDLE = EARLY2.hides[0]!, V1_FACE = EARLY2.hides[1]!, V1_POSE = EARLY2.hides[2]!;
/** Four boards whose every first painting pastes the canonical portrait: twelve copies of one look in a 27-hide world. */
const REPEAT_BOARDS = BOARDS.filter(b => !["antarctica", EARLY.board, EARLY2.board].includes(b.board)).slice(0, 4);
const REPEAT_HIDES = REPEAT_BOARDS.flatMap(b => b.hides);
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
 * the first painting of every hide of four boards is the canonical portrait itself, pasted. Every other answer
 * describes a natural child sharing some of its head turn, expression or engagement with others. */
function subjectAnswer(hideId: string, n: number) {
  const plan = subjectPlanFor(boardOf(hideId), hideId), index = HIDES.findIndex(h => h.id === hideId);
  const stranger = hideId === EXHAUST.id, copy = REPEAT_HIDES.some(h => h.id === hideId) && n === 1;
  return { hideId, subjectPolicy: SUBJECT_POLICY_V2, checks: { photoLikeness: observed(stranger ? "fail" : "pass"), canonicalAgreement: observed("pass"),
      faceVisible: observed("pass"), perceivedAge: { ...observed("pass"), estimatedMinYears: 7, estimatedMaxYears: 9 },
      requiredWardrobe: observed(plan.warmHat ? "pass" : "not-required") },
    appearance: copy ? { head: "three-quarter", expression: "open-smile", engagement: "posing", portraitCopy: true }
      : { head: HEADS[index % HEADS.length], expression: "focused", engagement: index % 2 ? "acting" : "watching", portraitCopy: false },
    faults: stranger ? [{ check: "photoLikeness", where: IDENTITY_DEFECT }] : [] };
}
/** A v1 answer with every check passing unless named. */
function v1Answer(hideId: string, failed: Record<string, string> = {}, faults: { check: string; where: string }[] = []) {
  const plan = subjectPlanFor(boardOf(hideId), hideId);
  return { hideId, subjectPolicy: SUBJECT_POLICY_VERSION, checks: { photoLikeness: observed(failed.photoLikeness ?? "pass"), canonicalAgreement: observed("pass"),
    faceVisible: observed("pass"), perceivedAge: { ...observed("pass"), estimatedMinYears: 7, estimatedMaxYears: 9 }, plannedAction: observed(failed.plannedAction ?? "pass"),
    plannedHead: observed("pass"), plannedExpression: observed("pass"), requiredWardrobe: observed(plan.warmHat ? "pass" : "not-required") }, faults };
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

    // 1. Before enrollment: two boards' appearances are accepted on quality and continuity alone.
    const early = [...EARLY.hides, ...EARLY2.hides];
    const allAccepted = async () => (await Promise.all(early.map(async hide => accepted(await rowOf(hide.id).catch(() => undefined))))).every(Boolean);
    for (let ticks = 0; ticks < 300 && !await allAccepted(); ticks++) {
      const result = await runLocalPatchWorldSlice(before, painter(gameId, prompts), gameId, { hardDeadlineAt: Date.now() + 270_000 });
      expect(result.attention).toBeNull();
    }
    expect(await allAccepted()).toBe(true);

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

    // The switchover (Codex P1): three v1 questions bought before v2 whose answers were never recorded on the row.
    // A bundle about pixels whose review had not begun (it passes); a separate subject question about accepted pixels
    // refusing the face; and one refusing only the planned forearm. None may be bought again in its v2 form.
    const opus = visualReviewPolicy("scene-quality", "high");
    const boughtBeforeV2 = async (hide: typeof V1_BUNDLE, form: "bundle" | "subject", raw: string) => {
      const scene = await db.gameScene.findFirstOrThrow({ where: { gameId, sceneSlug: EARLY2.board } });
      const prepared = await prepareLocalPatchBoardReview(after, { gameId, sceneId: scene.id }, {}, { includePlayerCandidates: true, playerReview: true, onlyHideId: hide.id });
      if (!prepared.ready) throw Error(prepared.reason);
      const candidates = await dualReviewQuestionCandidates(after, prepared, DUAL_VISUAL_REVIEW_V3);
      const v1 = candidates.find(q => q.form === form && q.subjectPolicy === SUBJECT_POLICY_VERSION)!;
      const v2 = candidates.find(q => q.form === form && q.subjectPolicy === SUBJECT_POLICY_V2)!;
      const reply = { verdict: null, raw, usage: { input_tokens: 2000, output_tokens: 500 }, requestId: `req-${gameId}-v1-${form}-${hide.id}`,
        model: "claude-opus-5-5", finishReason: "end_turn", wireFault: null, costUnknown: false };
      const charge = visualReviewCharge(opus, reply.model, reply.usage);
      expect(await purchaseOnce({ ledger: budget, store: new LocalPatchRetainedPurchaseStore(after, gameId, budget) }, { worldId, requestKey: v1.requestKey,
        operationFingerprint: v1.fingerprint, scope: "judge", reserveMicroUsd: DUAL_REVIEW_V3_RESERVE_MICRO_USD.quality,
        buy: async () => ({ bytes: Buffer.from(JSON.stringify({ ...reply, policy: opus, fingerprint: v1.fingerprint })), evidence: {
          providerNamespace: "anthropic:find-me-existing", providerRequestId: reply.requestId, usageId: sha256Bytes(Buffer.from(JSON.stringify(reply.usage))),
          rawUsage: reply.usage, model: reply.model, amountMicroUsd: Math.ceil(charge.costCents * 10_000), costBasis: "conservative-upper-estimate" as const } }) }))
        .toMatchObject({ kind: "bought" });
      const row = await rowOf(hide.id);
      return { v1, v2, asset: row.assetId!, image: JSON.parse(row.judgeJson!).judgedSha256 as string, renders: [...prompts.keys()].filter(key => key.startsWith(`${hide.id}:`)).length };
    };
    {
      // Its review never began: the row is a painted candidate awaiting its first review, as the old engine left it,
      // with no answer of any kind recorded (a recorded plain quality answer would rightly be reused instead).
      const row = await rowOf(V1_BUNDLE.id), receipt = JSON.parse(row.judgeJson!);
      await db.targetVariantAsset.update({ where: { id: row.id }, data: { judgeJson: JSON.stringify({ ...receipt, reviewState: "pending-board-review",
        verdict: null, boardReview: undefined, qualityDisposition: undefined, evidenceAttempts: undefined,
        dualQualityCheckpoint: undefined, dualContinuityCheckpoint: undefined, reviewHistory: undefined }) } });
    }
    const switchover = {
      bundle: await boughtBeforeV2(V1_BUNDLE, "bundle", JSON.stringify({ version: SUBJECT_QUALITY_BUNDLE_VERSION, quality: { hides: [{ hideId: V1_BUNDLE.id,
        evidenceIds: localPatchHideEvidenceIds(V1_BUNDLE.id), verdict: GOOD_V12_VERDICT }] }, subject: v1Answer(V1_BUNDLE.id) })),
      face: await boughtBeforeV2(V1_FACE, "subject", JSON.stringify(v1Answer(V1_FACE.id, { photoLikeness: "fail" },
        [{ check: "photoLikeness", where: "Child by the stall: a rounder face and straight short hair, not the photograph's" }]))),
      pose: await boughtBeforeV2(V1_POSE, "subject", JSON.stringify(v1Answer(V1_POSE.id, { plannedAction: "fail" },
        [{ check: "plannedAction", where: "Both arms at the sides; the planned reaching hand is absent" }]))),
    };
    await db.gameScene.updateMany({ where: { gameId, sceneSlug: EARLY2.board }, data: { generationStatus: "NEEDS_REGENERATION" } });
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
    // Every other appearance was finished first, each with a pass bound to its own pixels: v2, except the v1
    // bundle bought before the switch, whose v1 pass stands (v1 asked more).
    for (const row of rows.filter(r => r.id !== exhausted.id)) {
      const receipt = JSON.parse(row.judgeJson!), proof = receipt.boardReview.dual as DualReviewProof, hideId = receipt.hide as string;
      expect(row.status, hideId).toBe("GENERATED");
      expect(proof.imageSha256).toBe(receipt.judgedSha256);
      if (hideId !== V1_BUNDLE.id) {
        expect(proof.subject).toMatchObject({ subjectPolicy: SUBJECT_POLICY_V2, reader: SUBJECT_READER_V2 });
        expect(readSubjectAnswerV2(subjectStageRaw(proof.subject!), { hideId, ageYears: 8, plan: subjectPlanFor(boardOf(hideId), hideId) }))
          .toMatchObject({ ok: true, disposition: "pass" });
      }
      expect(await hasLocalPatchPublicationPolicy(c, publicationBinding(gameId, row))).toBe(true);
    }
    // The switchover: each v1 question bought before v2 was read under v1, and nothing was bought a second time.
    const finalOf = (hide: typeof V1_BUNDLE) => { const row = rows.find(r => JSON.parse(r.judgeJson!).hide === hide.id)!;
      return { row, receipt: JSON.parse(row.judgeJson!), proof: JSON.parse(row.judgeJson!).boardReview.dual as DualReviewProof }; };
    expect(await budget.readRequest(worldId, switchover.bundle.v2.requestKey), "the v1 bundle bought again as v2").toBeNull();
    expect(await budget.readRequest(worldId, switchover.face.v2.requestKey), "the v1 face refusal re-asked under v2").toBeNull();
    const bundled = finalOf(V1_BUNDLE);
    expect(bundled.proof.subject).toMatchObject({ subjectPolicy: SUBJECT_POLICY_VERSION, reader: SUBJECT_READER, combined: SUBJECT_QUALITY_BUNDLE_VERSION,
      requestKey: switchover.bundle.v1.requestKey, fingerprint: switchover.bundle.v1.fingerprint });
    expect(bundled.row.assetId).toBe(switchover.bundle.asset);
    expect(subjectCalls.get(V1_BUNDLE.id) ?? 0).toBe(subjectBefore.get(V1_BUNDLE.id) ?? 0);
    // The face refusal stood: repainted with its located defect, never asked v2 about the refused pixels.
    const face = finalOf(V1_FACE);
    expect(face.row.assetId).not.toBe(switchover.face.asset);
    expect(face.receipt.judgedSha256).not.toBe(switchover.face.image);
    expect((subjectCalls.get(V1_FACE.id) ?? 0) - (subjectBefore.get(V1_FACE.id) ?? 0)).toBe(1);
    expect([...prompts.entries()].filter(([key]) => key.startsWith(`${V1_FACE.id}:`)).at(-1)![1])
      .toContain('The reviewer located on the refused painting: "photoLikeness: Child by the stall: a rounder face and straight short hair, not the photograph\'s"');
    // The forearm refusal alone: the same pixels asked v2 once, the v1 answer kept beside the proof.
    const pose = finalOf(V1_POSE);
    expect(pose.row.assetId).toBe(switchover.pose.asset);
    expect([...prompts.keys()].filter(key => key.startsWith(`${V1_POSE.id}:`))).toHaveLength(switchover.pose.renders);
    expect((subjectCalls.get(V1_POSE.id) ?? 0) - (subjectBefore.get(V1_POSE.id) ?? 0)).toBe(1);
    expect(pose.proof.supersededSubject).toMatchObject({ subjectPolicy: SUBJECT_POLICY_VERSION, requestKey: switchover.pose.v1.requestKey,
      failedChecks: ["plannedAction"] });
    expect(pose.proof.subject).toMatchObject({ subjectPolicy: SUBJECT_POLICY_V2, requestKey: switchover.pose.v2.requestKey });
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

    // Variety belongs to the whole world. Similar natural children (shared head turns, one expression for all) were
    // never refused for variety; the pasted portrait itself was accepted up to a third of the world (9 of 27), three
    // times on one board too; only the three appearances past that were repainted with the variety repair.
    const lookOf = (row: (typeof rows)[number]) => {
      const receipt = JSON.parse(row.judgeJson!), proof = receipt.boardReview.dual as DualReviewProof, hideId = receipt.hide as string;
      const reading = proof.subject?.reader === SUBJECT_READER_V2
        ? readSubjectAnswerV2(subjectStageRaw(proof.subject), { hideId, ageYears: 8, plan: subjectPlanFor(boardOf(hideId), hideId) }) : null;
      return reading?.ok ? reading.appearance : null;
    };
    const acceptedRows = rows.filter(row => row.status === "GENERATED"), copies = acceptedRows.filter(row => lookOf(row)?.portraitCopy);
    expect(copies).toHaveLength(9);
    const copied = new Set(copies.map(row => JSON.parse(row.judgeJson!).hide as string));
    expect(REPEAT_BOARDS.some(board => board.hides.every(hide => copied.has(hide.id)))).toBe(true);
    const varietyRepaints = HIDES.filter(hide => [...prompts.entries()].some(([key, prompt]) => key.startsWith(`${hide.id}:`)
      && prompt.includes("VARIETY REPAIR") && prompt.includes("refused for collectionVariety")));
    expect(varietyRepaints).toHaveLength(REPEAT_HIDES.length - 9);
    expect(varietyRepaints.every(hide => REPEAT_HIDES.includes(hide) && !copied.has(hide.id))).toBe(true);
    expect(subjectCollectionSummary(acceptedRows.map(lookOf))).toMatchObject({ portraitCopies: 9, largestLook: 9 });

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

  it("never rebuilds an enrolled world's evidence for a free reading it would refuse: the slice goes on to its review (Codex, 19 October)", async () => {
    const gameId = "subject-v2-free-reading"; const seeded = await world(gameId);
    const board = EARLY, deps = painter(gameId, new Map());
    let calls = 0;
    const request = vi.fn<NonNullable<Container["visualReview"]>["request"]>(async question => {
      const bound = boundHide(question.prompt), id = `req-${gameId}-${++calls}`;
      const opus = (raw: string) => ({ verdict: null, model: "claude-opus-5-5", requestId: id, finishReason: "end_turn", wireFault: null, costUnknown: false,
        usage: { input_tokens: 2000, output_tokens: 500 }, raw });
      if (question.prompt.includes(SUBJECT_POLICY_V2)) return opus(JSON.stringify(subjectAnswer(bound.hideId, 2)));
      if (question.role === "scene-quality") return opus("```json\n" + JSON.stringify({ hides: [{ hideId: bound.hideId,
        evidenceIds: localPatchHideEvidenceIds(bound.hideId), verdict: GOOD_V12_VERDICT }] }) + "\n```");
      return { verdict: null, model: "gpt-6.1-sol", requestId: id, finishReason: "stop", wireFault: null, costUnknown: false,
        usage: { prompt_tokens: 2000, completion_tokens: 500 }, raw: longAnswer(bound.hideId, 400, 400, 160) };
    });
    const container = { ...c, visualReview: { request } } as Container;
    // One board answered by both reviewers before enrollment.
    for (const hide of board.hides) await runLocalPatchHide(c, deps, { gameId, board, hide });
    for (let question = 0; question < 2 * board.hides.length; question++)
      await reviewLocalPatchBoard(container, { gameId, sceneId: `gsc-${gameId}-${board.board}` }, { fence: async () => {} });
    const answered = (await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } } }))
      .filter(row => row.status === "GENERATED" && JSON.parse(row.judgeJson!).boardReview?.dual);
    expect(answered.length).toBeGreaterThan(0);
    // Enrolled; then one answer refused by a deployed reader: what a free reading decides in a world that is not enrolled.
    const after = { ...container, backgroundReview: fakeBackground().fake } as Container;
    const plan = await planSubjectUpgrade(after, { gameId, ownerId: seeded.userId });
    await applySubjectUpgrade(after, { gameId, ownerId: seeded.userId, operatorId: "operator-synthetic", expectedPlanSha256: plan.planSha256 });
    expect(localPatchRetainedAnswerUndecided(await asDeployedReaderRefusal(db, gameId, answered[0]!))).toBe(true);
    let now = Date.now();
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    const reviews: { kind: string }[] = [];
    const log = vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
      if (args[0] === "[local-patch] board review") reviews.push(args[1] as { kind: string });
    });
    try {
      // Rebuilding a board's evidence takes 100 s of the clock.
      const slow: LocalPatchHideDeps = { ...deps, readBoardArt: async (art, sha) => { now += 100_000; return readShippedBoardArt(art, sha); } };
      const deadline = now + 270_000;
      await runLocalPatchWorldSlice(after, slow, gameId, { hardDeadlineAt: deadline });
      expect(reviews.filter(r => r.kind === "retained")).toHaveLength(0);
      expect(reviews.filter(r => r.kind === "first").length).toBeGreaterThan(0);
      expect(now).toBeLessThanOrEqual(deadline);
    } finally { clock.mockRestore(); log.mockRestore(); }
  }, 600_000);
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
