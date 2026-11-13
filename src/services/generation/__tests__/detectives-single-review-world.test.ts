import { LOCAL_PATCH_SUNBURST_IMAGE_POLICY } from "../../../infra/generation/openai-local-patch";
import { LOCAL_PATCH_SUNBURST_PAINTER, pinLocalPatchPainter, localPatchPainterRelease } from "../painter-release";
import * as nativeDetailEvidenceModule from "../native-detail-evidence";
import { resumeSourceHeadRecovery, sourceHeadRecoveryPinOf, sourceHeadRecoveryId, sourceHeadCompositionEvidenceMatches } from '../source-head-recovery';
import { SOURCE_HEAD_RECOVERY_AUTHORITIES } from '../../../../content/adventures/source-head-recovery-v1';
import { sourceHeadAlpha, sourceHeadHash } from '../../../domain/generation/source-head-recovery';
import { resumeSourceHeadJoinRecovery, sourceHeadJoinId } from '../source-head-join-recovery';
import { SOURCE_HEAD_JOIN_VERSION } from '../../../domain/generation/source-head-join';
import { PrismaWorldBudgetStore } from '../../../infra/db/prisma-world-budget-store';
import { JOURNEY_WINDOW_RELEASE } from '../../../../content/detectives/journey-window-release-v1';
import { pinJourneyWindowRelease } from '../journey-window-release';
import { windowStoppedRows } from '../repeat-window-stop';
import * as nativeDetailPainterModule from "../native-detail-painter";
import { KINGDOM_DETECTIVE_PATCH_BOARDS } from "../../../../content/detectives/kingdom/runtime-release";
import { pinDetectiveSourceScope, sealDetectiveSourceFamily } from "../source-family-scope";
import { planWholeSourceContextRepair, stageWholeSourceContextRepair, nextWholeSourceContextWake, resumeWholeSourceContextRepair } from "../whole-source-context-repair";
import { readWholeSourceContextPin, wholeSourceContextPinId, wholeSourceContextWakeId, wholeSourceContextRowHash, wholeSourceContextMarkerFor, fenceWholeSourceContextPurchase } from "../whole-source-context-pin";
import { wholeSourceContextMarker } from "../../../domain/generation/whole-source-context-purchase";
import { WHOLE_SOURCE_CONTEXT_VERSION } from "../../../domain/scene/whole-source-context";
import { readSettledTargetRaw, singleReviewHeadEvidence, singleReviewHeadEvidenceMatches } from "../single-review-head-evidence";
import * as headEvidenceModule from "../single-review-head-evidence";
import * as dualPublicationModule from "../local-patch-dual-publication";
import { correctHeadPixels } from "../head-pixel-correction";
import { deleteLocalPatchGame } from "../local-patch-deletion";
import { localPatchPublicationGeometryHash } from "../local-patch-publication-policy";
import { headPixelCorrectionCandidate, HEAD_PIXEL_CORRECTION_ACTION } from "../../../domain/generation/head-pixel-correction";
import { retainedNormalHeadRecoveryCandidate } from "../../../domain/generation/retained-normal-head";
import { reconcileLegacyPaidJoinHead, LEGACY_HEAD_RECOVERY_ACTION } from "../legacy-paid-join-head-recovery";
import { reconcileVisibleHeadPolicy,VISIBLE_HEAD_RECOVERY_ACTION } from "../visible-head-policy-recovery";
import { visibleHeadPolicyRecoveryCandidate } from "../../../domain/generation/visible-head-policy-recovery";
import { restoreRetainedNormalHead } from "../retained-normal-head-recovery";
import { restoreRetainedNormalHeadOnce, RETAINED_NORMAL_HEAD_SCAN_ACTION } from "../retained-normal-head-scan";
import { RETAINED_NORMAL_HEAD_ACTION,RETAINED_NORMAL_HEAD_VERSION } from "../../../domain/generation/retained-normal-head";
import { AUTHORED_RECOVERY_COMPOSITION_VERSION } from "../../../domain/scene/local-patch-authored-recovery";
import { localPatchRestDecision } from "../../../domain/scene/local-patch-progress";
import { nextBoundEnvelopeReconciliation, resumeBoundEnvelopeReconciliation } from "../bound-envelope-reconciliation";
import { BOUND_SUBJECT_QUALITY_ENVELOPE_READER, BOUND_SUBJECT_QUALITY_ENVELOPE_READER_V2 } from "../../../domain/generation/bound-subject-quality-envelope";
import { BOUND_SOURCE_NEIGHBOR_READER } from '../../../domain/generation/bound-source-neighbor-envelope';
import { BOUND_SOURCE_CONTRACT_READER } from '../../../domain/generation/bound-source-contract-envelope';
import { REVIEW_EXISTING_WORK_MODE } from '../../../domain/generation/work-mode';
import { authenticateBoundSourceNeighborReading } from '../bound-source-neighbor-reading';
import { correctSourceFigureReturn, sourceFigurePublicationMatches } from '../source-figure-return';
import { restoreRetainedWindow, restoreRetainedWindowNeighborAlternate, retainedWindowEvidenceMatches } from '../retained-window-recovery';
import { RETAINED_WINDOW_ACTION, RETAINED_WINDOW_VERSION } from '../../../domain/generation/retained-window';
import { SOURCE_FIGURE_ACTION, SOURCE_FIGURE_RETURN_VERSION, sourceFigureAuditId, sourceFigureHash } from '../../../domain/generation/source-figure-return';
import { KINGDOM_FIGURE_RETURNS } from '../../../../content/detectives/kingdom/figure-return-v1';
import { PLACEMENT_GUIDE_VERSION, PLACEMENT_GUIDE_V2_VERSION, placementGuideEditableRect } from "../../../domain/generation/placement-guide";
import { PENDING_IMAGE_LEASE_MS } from "../../../domain/generation/pending-image-lease";
import { ensureSingleMediumReviewPolicy } from "../single-medium-policy";
import { planQaCompletionCapacity,authorizeQaCompletionCapacity,readQaCompletionCapacity,qaCompletionCapacityStatus,
  planQaCompletionRecovery,resumeQaCompletionRecovery,nextQaCompletionRecovery } from "../qa-completion-capacity";
import { qaCompletionCapacityId,QA_COMPLETION_CAP } from "../../../domain/generation/qa-completion-capacity";
import * as singlePolicyModule from "../single-low-policy";
import * as dualReviewModule from "../local-patch-dual-review";
import { planPublishedCrownRepair,stagePublishedCrownRepair,publishedCrownRepairOf,publishedCrownReviewOrder } from "../published-crown-repair";
import { sourceCrownRowHash } from "../source-crown-pixels";
import { tickGeneration } from "../queue";
import { SOURCE_CROWN_RETURN_CONTRACTS } from "../../../domain/scene/source-crown-return";
import { emptyAdventureProgress,recordAdventureEvent } from "../../../domain/adventure/progress";
import { ownerAdventureAlbum } from "../../adventure-album.service";
import { localPatchReturnRegion, LOCAL_PATCH_COMPOSITION_VERSION, AUTHORED_PATCH_COMPOSITION_VERSION } from "../../../domain/scene/local-patch-return-region";
import { EXPLORERS_OPERATIONAL_RELEASE } from "../../../domain/generation/explorers-operational-policy";
import { pinExplorersOperationalPolicy, explorersOperationalPolicyOf } from "../explorers-operational-policy";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { boardsOfWorlds } from "../../world-catalog.service";
import { sceneBySlug } from "../../scene-catalog.service";
import { DETECTIVES_OPERATIONAL_RELEASE, sourceBodyBirthMarker } from "../../../domain/generation/detectives-operational-policy";
import { pinDetectivesOperationalPolicy, detectivesOperationalId, detectivesOperationalPolicyOf, sourceBodyBirthMarkerFor } from "../detectives-operational-policy";
import { resumeSourceBodyGeometryRepair } from '../source-body-repair';
import { boardConditioningHash } from '../board-conditioned-source';
import { readSourceBodyRepairPin,sourceBodyRepairId } from '../source-body-repair-pin';
import { sourceBodyMarker } from '../../../domain/scene/source-body-repair';
import { planDetectivesCompletionTail, authorizeDetectivesCompletionTail, resumeDetectivesCompletionTail } from "../detectives-completion-budget";
import { detectivesTailId, detectivesTailResumeId } from "../../../domain/generation/detectives-completion-budget";
import { nativeMaskTailMarker } from "../../../domain/generation/native-mask-tail";
import { guidedFrameGeometry, guidedFrameCandidate, newGuidedFrameMarker, GUIDED_FRAME_RECOVERY_VERSION } from "../../../domain/generation/guided-frame-recovery";
import { cropOf } from "../../../domain/scene/local-patch-hides";
import { runLocalPatchHide } from "../local-patch-hide";
import { runLocalPatchSelfRepair, type SelfRepairDeps } from "../local-patch-self-repair";
import * as repairComposer from "../local-patch-repair-compose";
import { expectedAuthoredLocalPatchReturn, authoredLocalPatchRecoveryEvidenceMatches } from "../local-patch-authored-return";
import { NATIVE_SIZE_REPLAY_FAILURE, nativeSizeSelfRepairWork, needsSelfRepair, type SelfRepairDecision } from "../../../domain/scene/local-patch-self-repair";
import { reviewLocalPatchBoard } from "../local-patch-board-review";
import { advanceContinuityInBackground } from "../continuity-background";
import { SINGLE_VISUAL_REVIEW_VERSION, SINGLE_MEDIUM_VISUAL_REVIEW_VERSION } from "../../../domain/generation/single-visual-review";
import { targetHeadReturnDecision,TARGET_HEAD_VISIBLE_VERSION } from "../../../domain/generation/target-head-return";
import { targetGeometry } from "../../../game/engine/target-geometry";
import { expandRect, hitPadding, rectContains } from "../../../game/engine/viewport-math";
import { enrollLeanWorld } from "../lean-enrollment";
import { planDetectivesCompletionBudget, authorizeDetectivesCompletionBudget, resumeDetectivesCompletionBudget, planDetectivesCompletionExtension, authorizeDetectivesCompletionExtension, resumeDetectivesCompletionExtension, resumeDetectivesLowEngineRecovery } from "../detectives-completion-budget";
import { detectivesExtensionId } from "../../../domain/generation/detectives-completion-budget";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { DETECTIVE_PATCH_BOARDS } from "../../../../content/detectives/runtime-release";
import { applyTestSchema } from "../../../lib/test-schema";
import { performance } from "node:perf_hooks";
import { testProgressGuard } from "../../../lib/test-progress";
import { DbStorage } from "../../../infra/storage/db";
import type { BackgroundReviewState, BackgroundReviewTransport } from "../../../infra/generation/types";
import { localPatchRenderPolicySha256, LOCAL_PATCH_IMAGE_POLICY } from "../../../infra/generation/openai-local-patch";
import { maskForHide } from "../../../domain/scene/local-patch-hides";
import { LOCAL_PATCH_FIXED_SCENERY_PROMPT_VERSION } from "../local-patch-prompt";
import { parseGameConfig } from "../../../domain/game/config";
import { PrismaRetainedPurchaseStore, retainedPurchaseKey } from "../../../infra/db/prisma-retained-purchase-store";
import { SOURCE_NEIGHBOR_ANSWER_VERSION, SOURCE_NEIGHBOR_BUNDLE_VERSION, type SourceNeighborContract } from "../../../domain/scene/local-patch-source-neighbors";
import type { SourceNeighborQualityBundleBinding } from "../../../domain/generation/source-neighbor-quality-bundle";
import { SUBJECT_POLICY_V2, SUBJECT_READER_V2, readSubjectAnswerV2 } from "../../../domain/generation/subject-policy";
import { SUBJECT_QUALITY_BUNDLE_VERSION } from "../../../domain/generation/subject-quality-bundle";
import type { Container } from "../../container";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { buildBoardWizardIdentityStyle } from "../board-wizard-identity-style";
import { readShippedBoardArt, type LocalPatchHideDeps } from "../local-patch-hide";
import { readQualityStage, readContinuityStage, subjectStageRaw, localPatchHeadRetentionUnread, localPatchVarietyExhaustedUndecided, type DualReviewProof } from "../local-patch-dual-evidence";
import { COLLECTION_VARIETY_EXHAUSTED_VERSION } from "../../../domain/generation/collection-variety-exhausted";
import { pinLocalPatchSourceFamily, resolveLocalPatchBoardsForGame, sourceBodyForHide, sourcePlacementForHide, sourcePlacementReleaseOf } from "../source-placement-release";
import { pinIdentitySourceRelease } from "../identity-source-release";
import { allowedDualPublication } from "../local-patch-dual-publication";
import { hasLocalPatchPublicationPolicy } from "../local-patch-publication-policy";
import { LEAN_RECOVERY_BACKOFF_MS, LOCAL_PATCH_LEASE_MS, runLocalPatchWorldSlice } from "../local-patch-world";
import { DUAL_VISUAL_REVIEW_V3, pinVisualReviewRelease } from "../visual-review-release";
import { localPatchHideEvidenceIds } from "../local-patch-judge";
import { sha256Bytes } from "../fixed-sprite";
import { subjectPlanOfHide, subjectPlanSha256, subjectUpgradeOf, SYSTEM_ENROLLMENT_OPERATOR } from "../subject-enrollment";
import { LOCAL_PATCH_LEAN_RELEASE, pinLeanRelease } from "../lean-release";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { bill, paintedOk, seedApprovedGame } from "./local-patch-fixtures";
import { GOOD_V12_VERDICT, boundHide, longAnswer, publicationBinding } from "./local-patch-dual-fixtures";

/** Actual public Detective sources plus synthetic identity/paint/review transport.
 * This exercises the complete ledger/publication/player path; it proves no
 * likeness, crowd anatomy, provider latency or two-hour live-delivery target. */
const fixture = vi.hoisted(() => ({ testers: [] as string[] }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0, LOCAL_PATCH_PLAYER_REVIEW: "on",
  GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium", LOCAL_PATCH_PROMPT_RELEASE: "v19", LOCAL_PATCH_IDENTITY_SOURCE: "full-source-v1" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: fixture.testers }), flag: () => false, adminEmails: () => [] }));
let directory: string, db: PrismaClient, c: Container;
const sourceBytes = new Map<string, Promise<Buffer>>();
const readArt: NonNullable<LocalPatchHideDeps["readBoardArt"]> = (art, sha) => {
  const key = JSON.stringify([art, sha]); let bytes = sourceBytes.get(key);
  if (!bytes) { bytes = readShippedBoardArt(art, sha); sourceBytes.set(key, bytes); } return bytes;
};
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-detective-world-")));
  db = new PrismaClient({ datasources: { db: { url: "file:" + path.join(directory, "test.db").replaceAll("\\", "/") } } });
  await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), appUrl: "http://localhost:3000", secret: "synthetic-detective-world", analytics: { track: vi.fn() }, adminEmails: [], backgroundReview: {},
    email: { id: "console", send: async () => ({ id: "synthetic-mail" }) }, emailFallbackTo: null } as unknown as Container;
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("Real provider calls forbidden in Detective integration"); }));
}, 180_000);
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
afterAll(async () => {
  sourceBytes.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(directory) === realpathSync(tmpdir()) && path.basename(directory).startsWith("findme-detective-world-")) rmSync(directory, { recursive: true });
});

async function newDetectiveWorld(gameId: string, ageYears=8, born=false, explorer=false, kingdom=false, windows=false, sunburst=false) {
  const version = explorer ? 12 : 13, level = explorer ? "explorers" : "detectives";
  const journey = new Set(boardsOfWorlds(["journey"]));
  const kingdomBoards=new Set(boardsOfWorlds(["kingdom"]));
  const boards = kingdom ? explorer ? localPatchBoardsForVersion(12).filter(board=>kingdomBoards.has(board.board)) : KINGDOM_DETECTIVE_PATCH_BOARDS
    : explorer ? localPatchBoardsForVersion(12).filter(board => journey.has(board.board)) : DETECTIVE_PATCH_BOARDS;
  const seeded = await seedApprovedGame(c, db, { gameId, approved: false, styleVersion: "local-patch-world-v1", status: "DRAFT", withJob: false,
    scenes: boards.map(board => ({ slug: board.board, version })) });
  await db.game.update({ where: { id: gameId }, data: { searchLevel: level } });
  await db.childProfile.update({where:{id:"chl-"+gameId},data:{ageYears}});
  fixture.testers.push(seeded.email); c.adminEmails!.push(seeded.email);
  if(born)await db.childProfile.update({where:{id:"chl-"+gameId},data:{originalPhotoAssetId:null}});
  const profile = await db.childProfile.findUniqueOrThrow({where:{id:"chl-"+gameId}});
  if(kingdom||windows) await db.childProfile.update({where:{id:profile.id},data:{identityAssetId:null,avatarAssetId:null}});
  await db.$transaction(async tx => {
    await pinVisualReviewRelease(tx, gameId, DUAL_VISUAL_REVIEW_V3);
    await pinLeanRelease(tx, gameId, LOCAL_PATCH_LEAN_RELEASE);
    if (sunburst) await pinLocalPatchPainter(tx, gameId, LOCAL_PATCH_SUNBURST_PAINTER);
    await pinIdentitySourceRelease(tx, gameId);
    if((kingdom||windows)&&!explorer){
      await pinDetectiveSourceScope(tx,gameId,DETECTIVES_OPERATIONAL_RELEASE,c.storage.id);
      if(windows)await pinJourneyWindowRelease(tx,gameId,JOURNEY_WINDOW_RELEASE);
      await tx.game.update({where:{id:gameId},data:{status:"PACKAGE_SELECTED"}});
      await tx.childProfile.update({where:{id:profile.id},data:{originalPhotoAssetId:"ast-photo-"+gameId}});
      await sealDetectiveSourceFamily(tx,gameId);
    } else await pinLocalPatchSourceFamily(tx, gameId, { sceneVersion: version, searchLevel: level });
    if(born && explorer) await pinExplorersOperationalPolicy(tx,gameId,EXPLORERS_OPERATIONAL_RELEASE,c.storage.id);
    else if(born && !kingdom && !windows)await pinDetectivesOperationalPolicy(tx,gameId,DETECTIVES_OPERATIONAL_RELEASE,c.storage.id);
  });
  if(kingdom||windows) await db.childProfile.update({where:{id:profile.id},data:{identityAssetId:profile.identityAssetId,avatarAssetId:profile.avatarAssetId}});
  if(born)await db.childProfile.update({where:{id:"chl-"+gameId},data:{originalPhotoAssetId:"ast-photo-"+gameId}});
  await db.game.update({ where: { id: gameId }, data: { status: "TARGETS_GENERATING" } });
  await db.generationJob.create({ data: { id: "job_" + gameId, gameId, status: "QUEUED" } });
  await db.order.create({ data: { id: "order-" + gameId, gameId, userId: seeded.userId, provider: "mock", packageTier: "ONE_WORLD", amountAgorot: 3900, paymentStatus: "PAID", paidAt: new Date() } });
  const avatar = await sharp(seeded.sheet).resize(256, 256).png().toBuffer(), avatarId = "avatar-" + gameId;
  await c.storage.put("game/" + avatarId + ".png", avatar, "image/png");
  await db.asset.create({ data: { id: avatarId, ownerId: seeded.userId, type: "AVATAR", visibility: "GAME", status: "READY", storagePath: "game/" + avatarId + ".png", mimeType: "image/png", bytes: avatar.length, width: 256, height: 256, provider: "openai" } });
  await db.childProfile.update({ where: { id: "chl-" + gameId }, data: { avatarAssetId: avatarId } });
  await c.storage.put("private/photo-" + gameId + ".jpg", seeded.sheet, "image/png");
  const atlas = await buildBoardWizardIdentityStyle(undefined, "board-matched-identity/v6", kingdom ? "kingdom" : "journey", undefined, explorer ? undefined : { sceneVersion: 13 });
  const checks = { identity: "pass", age: "pass", paintedStyle: "pass", sheetLayout: "pass", sourceFaceVisible: "pass", facialVolume: "pass", viewConsistency: "pass" };
  const identity = await reviewBoardWizardIdentity({ db, apiKey: "synthetic-never-live", budget: boardWizardBudgetOf(c), beforeDispatch: async () => {}, write: work => db.$transaction(work),
    reviewer: { review: async () => ({ httpOk: true, requestId: "req_identity_" + gameId, body: { model: "gpt-6.1-sol", usage: { prompt_tokens: 1500, completion_tokens: 150 },
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ checks, reason: "Controlled contract response only" }) } }] } }) } },
    { gameId, identityAssetId: "ast-sheet-" + gameId, sheet: seeded.sheet, photo: seeded.sheet, atlas: atlas.png, contentVersion: version,
      provenance: { promptVersion: "character-v8-full-source-volume-identity", quality: "medium", photoAssetId: "ast-photo-" + gameId, photoSha256: sha256Bytes(seeded.sheet), ageYears, crop: null,
        style: { version: "board-matched-identity/v6", catalogSha256: atlas.catalogSha256, atlasSha256: atlas.atlasSha256 } } });
  expect(identity.approved).toBe(true);
  if(!born)await prepareSingleAuthorization(gameId, seeded.userId);
  else {
    expect(await enrollLeanWorld(c,gameId,async()=>{})).toMatchObject({state:"enrolled"});
    const budget=boardWizardBudgetOf(c),worldId=boardWizardWorldId(gameId);
    // Synthetic representative initial-work allowance, never a live price measurement.
    const fill=115238-(await budget.audit(worldId)).committedMicroUsd;
    expect(fill).toBeGreaterThan(0);
    await budget.reserve(worldId,{requestKey:"synthetic-initial-work-allowance",scope:"image",operationFingerprint:"9".repeat(64),reserveMicroUsd:fill});
    await budget.settle(worldId,"synthetic-initial-work-allowance",bill("synthetic-initial-work-allowance-"+gameId,fill));
  }
}

const observed = (status: string) => ({ status, observation: "Controlled explicit synthetic observation of this candidate." });
const heads = ["three-quarter", "profile", "down", "up", "away"] as const, expressions = ["closed-smile", "focused", "surprised", "neutral"] as const;
function cleanQuality(prompt: string, version = 13): string {
  const hideId = boundHide(prompt).hideId, plan = subjectPlanOfHide(hideId, version);
  if (!plan) throw Error("No real Detective plan for " + hideId);
  const index = localPatchBoardsForVersion(version).flatMap(board => board.hides).findIndex(hide => hide.id === hideId);
  const assessment = { version: SUBJECT_QUALITY_BUNDLE_VERSION, quality: { hides: [{ hideId, evidenceIds: localPatchHideEvidenceIds(hideId), verdict: GOOD_V12_VERDICT }] },
    subject: { hideId, subjectPolicy: SUBJECT_POLICY_V2, checks: { photoLikeness: observed("pass"), canonicalAgreement: observed("pass"), faceVisible: observed("pass"),
      perceivedAge: { ...observed("pass"), estimatedMinYears: 7, estimatedMaxYears: 9 }, requiredWardrobe: observed(plan.warmHat ? "pass" : "not-required") },
    appearance: { head: heads[index % heads.length], expression: expressions[index % expressions.length], engagement: index % 2 ? "acting" : "watching", portraitCopy: false }, faults: [] } };
  if (!prompt.includes(SOURCE_NEIGHBOR_BUNDLE_VERSION)) {
    if (version === 13) throw Error("Every Detective quality role must include its actual source contract");
    return JSON.stringify(assessment);
  }
  const line = prompt.split("\n").find(text => text.startsWith("AUTHORITATIVE SOURCE NEIGHBORS: "))!;
  const { contract } = JSON.parse(line.slice("AUTHORITATIVE SOURCE NEIGHBORS: ".length)) as { contract: SourceNeighborContract };
  const binding = JSON.parse(/Wrapper binding metadata \(do not add policy\/reader fields to the answer\): (\{[^\n]+\})\./.exec(prompt)![1]!) as SourceNeighborQualityBundleBinding;
  return JSON.stringify({ version: SOURCE_NEIGHBOR_BUNDLE_VERSION, assessment, sourceNeighbors: { version: SOURCE_NEIGHBOR_ANSWER_VERSION, contractSha256: binding.contractSha256, candidateSha256: binding.candidateSha256,
    neighbors: contract.neighbors.map((neighbor, i) => ({ sourceId: neighbor.sourceId, outcome: "preserved", status: "pass", after: [{ ref: "controlled-neighbor-" + i, rect: neighbor.head }],
      remnants: "none", occluder: null, observation: "One coherent synthetic source correspondence without shifted or remaining representation." })) } });
}
function controlledSol(interrupted = false, guided = false, guidedHideId?: string | string[], bodyMode=false, representativeUsage=false, version=13, guidedFailures=2) {
  let failedResponse: string | null = null;
  const creates: { hideId: string; quality: boolean; prompt: string; tier: unknown; reasoning: unknown; labels: string[] }[] = [], responses = new Map<string, { prompt: string; quality: boolean; tier: unknown; reads: number }>();
  const fake: BackgroundReviewTransport = { namespace: "openai:find-me-existing", create: async body => {
    expect(body.model).toBe("gpt-6.1-sol"); expect(["flex", "default"]).toContain(body.service_tier);
    const prompt = (body.input as { content: { text?: string }[] }[])[0]!.content[0]!.text!, quality = prompt.includes(SUBJECT_QUALITY_BUNDLE_VERSION);
    const hideId = boundHide(prompt).hideId; expect(subjectPlanOfHide(hideId, version)).not.toBeNull();
    expect(body.reasoning).toMatchObject({ effort: prompt.includes('"version":"'+SINGLE_MEDIUM_VISUAL_REVIEW_VERSION+'"') ? "medium" : "low" });
    if (prompt.includes(SOURCE_NEIGHBOR_BUNDLE_VERSION)) expect(prompt).toContain('"assessment":<complete final assessment envelope above including quality, subject and sourceNeighbors>');
    else expect(prompt).toContain('"assessment":<complete final quality and subject assessment envelope above>');
    if(prompt.includes("original photograph was normally deleted")){const blocks=(body.input as {content:{type:string}[]}[])[0]!.content;console.info("synthetic-crown-request",{hideId,promptBytes:Buffer.byteLength(prompt),images:blocks.filter(b=>b.type==="input_image").length,fullOutputTokens:body.max_output_tokens});}
    const labels = (body.input as { content: { type: string; text?: string }[] }[])[0]!.content.slice(1).filter(block => block.type === "input_text").map(block => block.text!);
    creates.push({ hideId, quality, prompt, tier: body.service_tier, reasoning: body.reasoning, labels });
    const responseId = "resp_detective_" + creates.length; if (interrupted && creates.length === 1) failedResponse = responseId; responses.set(responseId, { prompt, quality, tier: body.service_tier, reads: 0 }); return { responseId };
  }, retrieve: async (responseId): Promise<BackgroundReviewState> => {
    const state = responses.get(responseId); if (!state) return { status: "missing" };
    if (++state.reads === 1) return { status: "in_progress" };
    if (responseId === failedResponse) return { status: "failed", reading: { responseId, raw: null, usage: null, model: "gpt-6.1-sol", finishReason: "failed", serviceTier: "flex", providerError: { code: "server_error", message: "Synthetic failed response without text or usage" } } };
    const assessment = JSON.parse(cleanQuality(state.prompt, version));
    const qualityAssessment = assessment.version === SOURCE_NEIGHBOR_BUNDLE_VERSION ? assessment.assessment : assessment;
    if(bodyMode){qualityAssessment.subject.checks.perceivedAge.estimatedMinYears=6;qualityAssessment.subject.checks.perceivedAge.estimatedMaxYears=8;}
    const hide = boundHide(state.prompt).hideId;
    if (guided && (Array.isArray(guidedHideId)?guidedHideId.includes(hide):hide === (guidedHideId ?? DETECTIVE_PATCH_BOARDS[0]!.hides[0]!.id)) && (creates.filter(one => one.hideId === hide).length <= guidedFailures || bodyMode&&hide==="paris-detectives-hide-1"&&creates.filter(one=>one.hideId===hide).length===3)) {
      const verdict = qualityAssessment.quality.hides[0].verdict;
      Object.assign(verdict, { verdict: "fail", childComplete: "fail", pictureWhole: "fail", neighborsIntact:"fail", severeSeam: "fail", reason: "Synthetic crown crosses the immutable top return", faults: [{ check: "childComplete", where: "Synthetic complete crown terminates at the top return boundary" }] });
      verdict.boundaryIntegrity = Object.fromEntries(["left","top","right","bottom"].map(edge => [edge, { status: edge === "top" ? "fail" : "pass", observation: edge === "top" ? "Synthetic crown is cut at the top boundary" : "Synthetic continuous edge" }]));
    }
    if(bodyMode&&hide==='paris-detectives-hide-1'&&creates.filter(one=>one.hideId===hide).length===3
      &&!state.prompt.includes('The original green chair rail was restored')){const verdict=assessment.assessment.quality.hides[0].verdict;verdict.childComplete='pass';verdict.pictureWhole='fail';verdict.severeSeam='fail';const orphan=assessment.sourceNeighbors.neighbors.find((n:{sourceId:string})=>n.sourceId==='source-petanque-child');Object.assign(orphan,{outcome:'fragmented',status:'fail',remnants:'present',after:[{ref:'synthetic-old-blue-jacket',rect:{left:810,top:995,width:25,height:105}}],observation:'Synthetic original blue-jacket remnant persists outside the original return window.'});}
    return { status: "completed", reading: { responseId, raw: JSON.stringify({ version: state.prompt.includes('"version":"'+SINGLE_MEDIUM_VISUAL_REVIEW_VERSION+'"') ? SINGLE_MEDIUM_VISUAL_REVIEW_VERSION : SINGLE_VISUAL_REVIEW_VERSION, assessment,
        ...(state.prompt.includes('HEAD_RETURN_EVIDENCE: ') ? (()=>{const line=state.prompt.split('\n').find(s=>s.startsWith('HEAD_RETURN_EVIDENCE: '))!;const p=JSON.parse(line.slice('HEAD_RETURN_EVIDENCE: '.length)),r=p.returned;
          const head={left:r.left+14,top:r.top+14,width:Math.min(40,r.width-28),height:Math.min(50,r.height-28)};
          // journey-face-scale/v1: a controlled face the SOURCE face size, measured inside the registered SOURCE head.
          const scaleLine=state.prompt.split('\n').find(s=>s.startsWith('FACE SCALE journey-face-scale/v1: ')),registered=scaleLine?JSON.parse(scaleLine.slice(scaleLine.indexOf('registered head ')+'registered head '.length,scaleLine.indexOf('}. ')+1)):null;
          const face=registered?{newFace:{left:registered.left+12,top:registered.top+16,width:registered.width-24,height:registered.height-30},sourceFace:{left:registered.left+12,top:registered.top+16,width:registered.width-24,height:registered.height-30},observation:'Controlled new face keeps the replaced SOURCE face size.'}:null;
          return{head:{version:p.version,rawHead:head,shippingHead:head,rawCrown:'pass',shippingCrown:'pass',observation:'Controlled native raw and shipping crown entirely inside the opaque returned frame.',...(face?{face}:{})}};})():{}),
        continuity: JSON.parse(longAnswer(boundHide(state.prompt).hideId, 400, 400, 160)), doubt: false, doubtReason: null }),
      usage: representativeUsage ? { input_tokens: 21000, output_tokens: 2500 } : { input_tokens: 2000, output_tokens: 500 }, model: "gpt-6.1-sol", finishReason: "stop", serviceTier: String(state.tier) } };
  }, cancel: async () => {} };
  return { fake, creates };
}

it.each([{joinReplay:false,label:'original v1'},{joinReplay:true,label:'already-paid v2 replay'}])('source-head recovery $label preserves26 paid Explorer appearances and the legacy contract, buys one finite MEDIUM head, and requires a fresh ordinary verdict',async({joinReplay})=>{
 vi.useFakeTimers({toFake:['Date']});
 try{
  const gameId='source-head-original-explorer-synthetic-'+(joinReplay?'join':'v1');await newDetectiveWorld(gameId,7,true,true,true);
  // The older fixture creates a settled mock order but leaves the game's
  // webhook timestamp empty. This stricter strategy requires both records.
  const payment=await db.order.findUniqueOrThrow({where:{id:'order-'+gameId}});
  await db.game.update({where:{id:gameId},data:{paidAt:payment.paidAt}});
  await ensureSingleMediumReviewPolicy(c,gameId,async()=>{});
  const a=SOURCE_HEAD_RECOVERY_AUTHORITIES[0],context=await resolveLocalPatchBoardsForGame(db,gameId,12);
  const boards=context.boards.filter(b=>new Set(boardsOfWorlds(['kingdom'])).has(b.board)),hides=boards.flatMap(b=>b.hides);
  const board=boards.find(b=>b.board===a.boardId)!,hide=board.hides.find(h=>h.id===a.hideId)!;
  expect(expectedAuthoredLocalPatchReturn(board,hide,12,context)).toBeNull();
  let headBought=false,diagnoses=0,ordinaryHeadQuestions=0;
  const provider=controlledSol(true,true,hide.id,true,false,12,100),retrieve=provider.fake.retrieve.bind(provider.fake);
  provider.fake.retrieve=async id=>{
   const answer=await retrieve(id);if(answer.status!=='completed')return answer;
   const value=JSON.parse(answer.reading.raw!);
   if(value.assessment.quality.hides[0].hideId===hide.id&&headBought){
    value.assessment.quality.hides[0].verdict=structuredClone(GOOD_V12_VERDICT);
    value.head={...value.head,rawHead:{left:220,top:280,width:60,height:65},shippingHead:{left:220,top:280,width:60,height:65},rawCrown:'pass',shippingCrown:'pass'};
   }
   return {...answer,reading:{...answer.reading,raw:JSON.stringify(value)}};
  };
  const create=provider.fake.create.bind(provider.fake);
  provider.fake.create=async body=>{
   const prompt=(body.input as {content:{text?:string}[]}[])[0]!.content[0]!.text!;
   if(prompt.includes('SOURCE HEAD RECOVERY')){ordinaryHeadQuestions++;expect(body.reasoning).toMatchObject({effort:'medium'});}
   return create(body);
  };
  const forbidden=vi.fn(async()=>{throw Error('No duplicate synchronous review');});
  const container={...c,backgroundReview:provider.fake,visualReview:{request:forbidden}} as Container;
  const render=vi.fn<LocalPatchHideDeps['render']>(async input=>{
   const h=hides.find(h=>input.requestKey.startsWith(h.id+':'))!;
   expect(input.subjectQuality).toBe('medium');
   if(input.requestKey===a.hideId+':'+a.pose+':render:4'){
    expect(headBought).toBe(false);headBought=true;
    expect(input.prompt).toContain('SOURCE HEAD RECOVERY');expect(input.placementGuidePng).toBeUndefined();
    expect(input.prompt).toContain('Keep the original target head angle and neck join');
    expect(input.prompt).not.toContain('SUBJECT DIRECTION local-patch-subject-paint/');
    expect(input.prompt).not.toContain('LOOK: this appearance');expect(input.prompt).not.toContain('REPAIR: the previous painting');
    const alpha=sourceHeadAlpha(a),mask=await sharp(input.maskPng).ensureAlpha().raw().toBuffer();let badMask=0;
    for(let i=0;i<alpha.length;i++)if(mask[i*4+3]!==255-alpha[i]!)badMask++;
    expect(badMask).toBe(0);
    const newHead=await sharp({create:{width:60,height:65,channels:4,background:'#416783'}}).png().toBuffer();
    const badCounter=await sharp({create:{width:180,height:90,channels:4,background:'#ff00ff'}}).png().toBuffer();
    if(joinReplay){
      // A complete replacement hairstyle reaches the permitted edit edge.
      // v1 must refuse this colour change before any ordinary assessment.
      const pixels=await sharp(input.stylePng).ensureAlpha().raw().toBuffer();
      for(let i=0;i<alpha.length;i++)if(alpha[i]){pixels[i*4]=210;pixels[i*4+1]=20;pixels[i*4+2]=30;}
      const wholeHead=await sharp(pixels,{raw:{width:512,height:768,channels:4}}).png().toBuffer();
      return paintedOk(await sharp(wholeHead).composite([{input:badCounter,left:150,top:510}]).png().toBuffer(),bill('synthetic-new-source-head',50000));
    }
    return paintedOk(await sharp(input.stylePng).composite([{input:newHead,left:220,top:280},{input:badCounter,left:150,top:510}]).png().toBuffer(),bill('synthetic-new-source-head',50000));
   }
   const returned=localPatchReturnRegion(cropOf(h),maskForHide(h),h.returnRect).local;
   const frame=guidedFrameGeometry(maskForHide(h),returned).target;
   const figure=await sharp({create:{width:Math.round(frame.width*.5),height:Math.round(frame.height*.65),channels:4,
    background:input.requestKey.endsWith(':render:2')?'#314f78':input.requestKey.endsWith(':render:3')?'#685477':'#284d99'}}).png().toBuffer();
   return paintedOk(await sharp(input.stylePng).composite([{input:figure,left:frame.left+Math.round(frame.width*.25),top:frame.top+Math.round(frame.height*.2)}]).png().toBuffer(),bill('synthetic-source-head-old-'+input.requestKey,50000));
  });
  const diagnose:NonNullable<SelfRepairDeps['diagnose']>=async wire=>{
   const source=wire.imageLabels.filter(l=>l.startsWith('RAW ')).at(-1)!.slice(4).split(',')[0]!;
   return {verdict:null,wireFault:null,costUnknown:false,model:'gpt-5.6-sol',finishReason:'stop',requestId:'synthetic-head-diagnosis-'+(++diagnoses),usage:{prompt_tokens:2000,completion_tokens:200},
    raw:JSON.stringify({cause:'composition-clipping',action:'recompose-retained',sourceKey:source,
     explanation:'Synthetic finite legacy recipe keeps the entire child at native axes; an ordinary review still fails these old pixels.',
     returnWindow:a.returned,protectedCore:a.child,faceRect:{left:210+diagnoses,top:260,width:60,height:60}})};
  };
  const deps:LocalPatchHideDeps={readBoardArt:readArt,renderPolicySha256:localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY),render,judge:forbidden};
  for(const firstHide of boards[0]!.hides)await runLocalPatchHide(container,deps,{gameId,board:boards[0]!,hide:firstHide});
  const budget=boardWizardBudgetOf(container),worldId=boardWizardWorldId(gameId);
  // Run a real native failed-response -> authenticated MEDIUM continuation
  // before the historical completion grant, rather than inventing an approval.
  const firstScene=await db.gameScene.findUniqueOrThrow({where:{gameId_sceneSlug:{gameId,sceneSlug:boards[0]!.board}}});
  for(let turn=0;turn<40;turn++){
   await reviewLocalPatchBoard(container,{gameId,sceneId:firstScene.id,deadlineAt:Date.now()+270000},{fence:async()=>{},readBoardArt:readArt});
   await advanceContinuityInBackground(container,gameId,{deadlineAt:Date.now()+270000});
   const why:{reason?:string}={};
   expect(await (await import('../subject-upgrade')).continueAdmittedReviewInterruptions(container,gameId,{readBoardArt:readArt},Date.now()+270000,async()=>{},why),why.reason).not.toBe('blocked');
   await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS+1);
   const firstRows=await db.targetVariantAsset.findMany({where:{variant:'A',targetInstance:{gameSceneId:firstScene.id}}});
   if(firstRows.length===3&&firstRows.every(r=>{const j=JSON.parse(r.judgeJson!);return j.reviewState==='board-review-complete'&&j.qualityDisposition?.state==='acceptable';}))break;
  }
  const baselineUnknown=(await budget.audit(worldId)).unknownRequestKeys;expect(baselineUnknown).toHaveLength(1);
  const unknownBefore=await budget.readRequest(worldId,baselineUnknown[0]!);
  expect(await budget.readContinuationApproval(worldId,baselineUnknown[0]!)).toMatchObject({version:'world-automatic-review-recovery/v5',policyId:'single-sol-medium-transport-recovery/v1'});
  await db.generationJob.update({where:{id:'job_'+gameId},data:{status:'FAILED',currentStep:'local-patch:recovery-exhausted',lastError:'Synthetic historical completion enrollment'}});
  const game=await db.game.findUniqueOrThrow({where:{id:gameId}}),grantPlan=await planQaCompletionCapacity(container,gameId);
  await authorizeQaCompletionCapacity(container,{gameId,operatorId:game.ownerId!,expectedPlanSha256:grantPlan.planSha256,ownerAuthorizationSha256:'a'.repeat(64)});
  const row=()=>db.targetVariantAsset.findFirstOrThrow({where:{variant:'A',targetInstance:{gameScene:{gameId,sceneSlug:a.boardId},targetId:hide.targetId}}});
  let result={pending:true,attention:null as string|null},turns=0;
  while(result.pending&&turns++<400){result=await runLocalPatchWorldSlice(container,deps,gameId,{hardDeadlineAt:Date.now()+270000,diagnose});if(result.pending)await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS+1);}
  const before=await row(),previous=JSON.parse(before.judgeJson!);
  expect(before,JSON.stringify({turns,result,diagnoses,headBought,previous})).toMatchObject({status:'FAILED',attempts:3});
  expect(previous.authoredReturn).toBeUndefined();expect(previous.selfRepair.subjectV2Cycles).toBe(3);
  expect(previous.reviewState).toBe('board-review-complete');expect(previous.verdict.verdict).toBe('fail');expect(headBought).toBe(false);
  const protectedRows=await db.targetVariantAsset.findMany({where:{variant:'A',status:'GENERATED',targetInstance:{gameScene:{gameId}}},orderBy:{id:'asc'}});
  expect(protectedRows).toHaveLength(26);
  const oldLedger=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId:boardWizardWorldId(gameId)}}),oldRequests=JSON.parse(oldLedger.snapshotJson).requests;
  const oldRenderCount=render.mock.calls.length;
  await db.generationJob.update({where:{id:'job_'+gameId},data:{status:'FAILED',currentStep:'local-patch:recovery-exhausted',lastError:'Synthetic terminal legacy recovery'}});
  await db.order.update({where:{id:'order-'+gameId},data:{paymentStatus:'REFUNDED'}});expect(await resumeSourceHeadRecovery(container,gameId)).toBe(false);
  await db.order.update({where:{id:'order-'+gameId},data:{paymentStatus:'PAID'}});
  const refusal:string[]=[];expect(await resumeSourceHeadRecovery(container,gameId,r=>refusal.push(r)),refusal.join(',')).toBe(true);expect(await resumeSourceHeadRecovery(container,gameId)).toBe(false);
  expect((await row()).judgeJson).toBe(before.judgeJson);expect((await row()).attempts).toBe(3);
  const pin=(await sourceHeadRecoveryPinOf(db,gameId))!;expect(pin.previousJudgeJson).toBe(before.judgeJson);expect(pin.originalAttempts).toBe(3);
  expect((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId:pin.worldId}})).snapshotJson).toBe(oldLedger.snapshotJson);
  const audit=await db.auditLog.findUniqueOrThrow({where:{id:sourceHeadRecoveryId(gameId)}});
  const forged=JSON.parse(audit.metaJson!),{authorizationSha256:_old,...unsigned}=forged;unsigned.authoritySha256='f'.repeat(64);forged.authoritySha256=unsigned.authoritySha256;forged.authorizationSha256=sourceHeadHash(unsigned);
  await db.auditLog.update({where:{id:audit.id},data:{metaJson:JSON.stringify(forged)}});await expect(sourceHeadRecoveryPinOf(db,gameId)).rejects.toThrow('public source');
  await db.auditLog.update({where:{id:audit.id},data:{metaJson:audit.metaJson}});
  result={pending:true,attention:null};let seenUnreviewed=false;
  for(let turn=0;result.pending&&turn<80;turn++){
   result=await runLocalPatchWorldSlice(container,deps,gameId,{hardDeadlineAt:Date.now()+270000,diagnose});
   const current=await row(),j=JSON.parse(current.judgeJson!);
   if(j.sourceHeadRecovery&&j.reviewState==='pending-board-review'){
    seenUnreviewed=true;expect(await allowedDualPublication(db,{gameId,sceneVersion:12,hideId:hide.id,variantId:current.id,
     attempts:current.attempts,identityAssetId:'ast-sheet-'+gameId,identitySha256:pin.identitySha256,assetId:current.assetId!,
     imageSha256:j.judgedSha256,geometrySha256:j.geometrySha256,judgeJson:current.judgeJson})).toBe(false);
   }
   if(result.pending)await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS+1);
  }
  if(joinReplay){
    const refused=await row();expect(refused).toMatchObject({status:'FAILED',attempts:4,assetId:before.assetId});
    expect(JSON.parse(refused.judgeJson!).renderFault).toBe('quality-seam: SOURCE_HEAD: new head boundary exceeds unchanged seam/alignment limits');
    expect(ordinaryHeadQuestions).toBe(0);expect(seenUnreviewed).toBe(false);
    const paidLedger=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}}),paidRequests=JSON.parse(paidLedger.snapshotJson).requests;
    const kept=await db.fileBlob.findUniqueOrThrow({where:{key:retainedPurchaseKey(worldId,pin.requestKey)}});
    await db.fileBlob.delete({where:{key:kept.key}});expect(await resumeSourceHeadJoinRecovery(container,gameId)).toBe(false);
    expect(render.mock.calls.length-oldRenderCount).toBe(1);await db.fileBlob.create({data:kept});
    await db.order.update({where:{id:payment.id},data:{paymentStatus:'REFUNDED'}});expect(await resumeSourceHeadJoinRecovery(container,gameId)).toBe(false);
    await db.order.update({where:{id:payment.id},data:{paymentStatus:'PAID'}});
    const refusal:string[]=[];expect(await resumeSourceHeadJoinRecovery(container,gameId,r=>refusal.push(r)),refusal.join(',')).toBe(true);
    expect(await resumeSourceHeadJoinRecovery(container,gameId)).toBe(false);
    expect((await row()).attempts).toBe(4);expect((await row()).status).toBe('PENDING');
    expect((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson).toBe(paidLedger.snapshotJson);
    const joinAudit=await db.auditLog.findUniqueOrThrow({where:{id:sourceHeadJoinId(gameId)}}),joinPin=JSON.parse(joinAudit.metaJson!);
    expect(joinPin.previousJudgeJson).toBe(refused.judgeJson);expect(joinPin.originalRequests).toHaveLength(paidRequests.length);
    expect((await db.auditLog.findUniqueOrThrow({where:{id:audit.id}})).metaJson).toBe(audit.metaJson);
    result={pending:true,attention:null};
    for(let turn=0;result.pending&&turn<80;turn++){
      result=await runLocalPatchWorldSlice(container,deps,gameId,{hardDeadlineAt:Date.now()+270000,diagnose});
      const current=await row(),j=JSON.parse(current.judgeJson!);
      if(j.sourceHeadJoin&&j.reviewState==='pending-board-review'){
        expect(current.costCents).toBe(refused.costCents);
        seenUnreviewed=true;expect(await allowedDualPublication(db,{gameId,sceneVersion:12,hideId:hide.id,variantId:current.id,
          attempts:current.attempts,identityAssetId:'ast-sheet-'+gameId,identitySha256:pin.identitySha256,assetId:current.assetId!,
          imageSha256:j.judgedSha256,geometrySha256:j.geometrySha256,judgeJson:current.judgeJson})).toBe(false);
      }
      if(result.pending)await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS+1);
    }
    const finalJoinLedger=JSON.parse((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson);
    for(const paidRequest of paidRequests)expect(finalJoinLedger.requests.find((r:{requestKey:string})=>r.requestKey===paidRequest.requestKey)).toEqual(paidRequest);
  }
  const after=await row(),receipt=JSON.parse(after.judgeJson!);expect(headBought).toBe(true);expect(seenUnreviewed).toBe(true);
  expect(after).toMatchObject({attempts:4,status:'GENERATED'});expect(receipt.selfRepair).toEqual(previous.selfRepair);
  expect(receipt.authoredReturn).toBeUndefined();expect(receipt.guidedFrameRecovery).toEqual(previous.guidedFrameRecovery);
  expect(render.mock.calls.length-oldRenderCount).toBe(1);expect(ordinaryHeadQuestions).toBe(1);
  expect(receipt.sourceHeadComposition).toMatchObject({outsideMaskChangedPixels:0,sourceBodyChangedPixels:0,protectedHeadChangedPixels:0});
  expect(await sourceHeadCompositionEvidenceMatches(db,{gameId,hideId:hide.id,receipt},readArt)).toBe(true);
  expect(await allowedDualPublication(db,{...publicationBinding(gameId,after),sceneVersion:12})).toBe(true);
  if(joinReplay){
    expect(receipt.sourceHeadComposition).toMatchObject({version:SOURCE_HEAD_JOIN_VERSION,paidHeadChangedPixels:0,shift:{dx:0,dy:0}});
    const joinAudit=await db.auditLog.findUniqueOrThrow({where:{id:sourceHeadJoinId(gameId)}});
    await db.auditLog.delete({where:{id:joinAudit.id}});expect(await allowedDualPublication(db,{...publicationBinding(gameId,after),sceneVersion:12})).toBe(false);
    await db.auditLog.create({data:joinAudit});
    const missingJoin={...receipt};delete missingJoin.sourceHeadJoin;
    expect(await sourceHeadCompositionEvidenceMatches(db,{gameId,hideId:hide.id,receipt:missingJoin},readArt)).toBe(false);
  }
  const beforePng=await readArt(a.source.art,a.source.sha256),source=await sharp(beforePng).extract(a.crop).ensureAlpha().raw().toBuffer();
  const asset=await db.asset.findUniqueOrThrow({where:{id:after.assetId!}}),pixels=await sharp(await c.storage.get(asset.storagePath)).ensureAlpha().raw().toBuffer();
  const alpha=sourceHeadAlpha(a);let changedProtected=0,changedEditable=0;
  for(let i=0;i<alpha.length;i++)for(let channel=0;channel<4;channel++)if(pixels[i*4+channel]!==source[i*4+channel]){if(alpha[i])changedEditable++;else changedProtected++;}
  expect(changedEditable).toBeGreaterThan(0);expect(changedProtected).toBe(0);
  expect(await db.targetVariantAsset.findMany({where:{id:{in:protectedRows.map(r=>r.id)}},orderBy:{id:'asc'}})).toEqual(protectedRows);
  const finalLedger=JSON.parse((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId:pin.worldId}})).snapshotJson);
  for(const request of oldRequests)expect(finalLedger.requests.find((r:{requestKey:string})=>r.requestKey===request.requestKey)).toEqual(request);
  expect(finalLedger.requests.find((r:{requestKey:string})=>r.requestKey===baselineUnknown[0])).toEqual(unknownBefore);
  expect(finalLedger.requests.filter((r:{requestKey:string})=>r.requestKey===pin.requestKey)).toHaveLength(1);
  expect(finalLedger.unknownContinuationApprovals).toEqual(JSON.parse(oldLedger.snapshotJson).unknownContinuationApprovals);
  expect(await budget.readRequest(worldId,a.hideId+':'+a.pose+':render:5')).toBeNull();
  const finalGame=await db.game.findUniqueOrThrow({where:{id:gameId}});expect(['READY','DELIVERED']).toContain(finalGame.status);
  expect(parseGameConfig(finalGame.configJson!).scenes.flatMap(s=>s.targets)).toHaveLength(27);
  expect((await db.childProfile.findUniqueOrThrow({where:{id:game.childProfileId!}})).originalPhotoAssetId).toBeNull();
  expect(await sourceHeadRecoveryPinOf(db,gameId)).not.toBeNull();expect(await resumeSourceHeadRecovery(container,gameId)).toBe(false);
  const bound={...publicationBinding(gameId,after),sceneVersion:12};
  await db.auditLog.delete({where:{id:audit.id}});expect(await allowedDualPublication(db,bound)).toBe(false);
  await db.auditLog.create({data:audit});
  const missing={...receipt};delete missing.sourceHeadRecovery;
  expect(await allowedDualPublication(db,{...bound,judgeJson:JSON.stringify(missing)})).toBe(false);
  expect(await sourceHeadCompositionEvidenceMatches(db,{gameId,hideId:hide.id,receipt},async()=>Buffer.from('wrong public source'))).toBe(false);
  await db.order.update({where:{id:payment.id},data:{paymentStatus:'REFUNDED'}});
  expect(await allowedDualPublication(db,bound)).toBe(false);
  await db.order.update({where:{id:payment.id},data:{paymentStatus:'PAID'}});
  const blob=await db.fileBlob.findUniqueOrThrow({where:{key:asset.storagePath}});
  await db.fileBlob.update({where:{key:blob.key},data:{data:Buffer.from('corrupted shipping bytes')}});
  expect(await allowedDualPublication(db,bound)).toBe(false);
  await db.fileBlob.update({where:{key:blob.key},data:{data:blob.data}});
  expect(await allowedDualPublication(db,bound)).toBe(true);
  expect(forbidden).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
 }finally{vi.useRealTimers();}
},1500000);

it('prospective window stop serves the other26, permits a different-edge repair, and parks honestly without a third identical buy',async()=>{
  vi.useFakeTimers({toFake:['Date']});const gameId='synthetic-prospective-window-stop';
  await newDetectiveWorld(gameId,7,true,false,false,true);
  const context=await resolveLocalPatchBoardsForGame(db,gameId,13),hides=context.boards.flatMap(b=>b.hides);
  const stop='paris-detectives-hide-2',retry='amazon-detectives-hide-2',provider=controlledSol(false,true,[stop,retry],true,true);
  const transport:BackgroundReviewTransport={...provider.fake,retrieve:async responseId=>{
    const state=await provider.fake.retrieve(responseId);if(state.status!=='completed'||!state.reading.raw)return state;
    const created=provider.creates[Number(responseId.split('_').at(-1))-1]!,doc=JSON.parse(state.reading.raw);
    if(created.hideId===stop){const line=created.prompt.split('\n').find(s=>s.startsWith('HEAD_RETURN_EVIDENCE: '))!,r=JSON.parse(line.slice('HEAD_RETURN_EVIDENCE: '.length)).returned;
      doc.head.rawHead.top=r.top-8;doc.head.shippingHead.top=r.top+2;doc.head.shippingHead.height-=10;
      doc.head.rawCrown='pass';doc.head.shippingCrown='fail';
    }
    if(created.hideId===retry&&provider.creates.filter(c=>c.hideId===retry).length===2){
      const a=doc.assessment.version===SOURCE_NEIGHBOR_BUNDLE_VERSION?doc.assessment.assessment:doc.assessment;
      a.quality.hides[0].verdict.boundaryIntegrity.top.status='pass';a.quality.hides[0].verdict.boundaryIntegrity.right.status='fail';
    }
    return {...state,reading:{...state.reading,raw:JSON.stringify(doc)}};
  }};
  const container={...c,backgroundReview:transport,visualReview:{request:async()=>{throw Error('No synchronous or real provider');}}} as Container;
  const paintings:string[]=[],deps:LocalPatchHideDeps={apiKey:'synthetic-never-live',renderPolicySha256:localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY),readBoardArt:readArt,render:async({requestKey,stylePng,placementGuidePng})=>{
    paintings.push(requestKey);const hide=hides.find(h=>requestKey.startsWith(h.id+':'))!;
    const mask=placementGuidePng?guidedFrameGeometry(maskForHide(hide),localPatchReturnRegion(cropOf(hide),maskForHide(hide),hide.returnRect).local).target:maskForHide(hide);
    const rect={left:mask.left+Math.round(mask.width*.2),top:mask.top+Math.round(mask.height*.2),width:Math.round(mask.width*.6),height:Math.round(mask.height*.8)};
    const block=await sharp({create:{width:rect.width,height:rect.height,channels:4,background:requestKey.endsWith(':2')?'#304f91':'#1e3ca0'}}).png().toBuffer();
    const png=await sharp(stylePng).composite([{input:block,left:rect.left,top:rect.top}]).png().toBuffer();return paintedOk(png,bill('paint-'+gameId+'-'+requestKey,66500));
  }};
  let result={pending:true,attention:null as string|null};
  for(let tick=0;tick<300&&result.pending;tick++){
    result=await runLocalPatchWorldSlice(container,deps,gameId,{hardDeadlineAt:Date.now()+270000,diagnose:async()=>{throw Error('No new paid diagnosis for repeated window');}});
    await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS+1);
  }
  expect(result.pending).toBe(false);expect(result.attention).toContain(stop);expect(result.attention).toContain('no third painting');
  const rows=await db.targetVariantAsset.findMany({where:{variant:'A',targetInstance:{gameScene:{gameId}}}});
  expect(rows).toHaveLength(27);const stopped=rows.find(r=>JSON.parse(r.judgeJson??'null')?.hide===stop)!;
  expect(stopped).toMatchObject({status:'FAILED',attempts:2});expect(await windowStoppedRows(db,gameId,rows)).toEqual(new Set([stopped.id]));
  expect(rows.filter(r=>r.status==='GENERATED')).toHaveLength(26);
  expect(rows.find(r=>JSON.parse(r.judgeJson??'null')?.hide===retry)).toMatchObject({status:'GENERATED',attempts:3});
  expect(paintings.filter(k=>k.startsWith(stop+':'))).toHaveLength(2);expect(paintings.some(k=>k===stop+':standing:render:3')).toBe(false);
  expect((await db.game.findUniqueOrThrow({where:{id:gameId}})).status).not.toBe('READY');
  // Ledger truth overrides old positive facts; an unknown bill is never zero.
  const ledger=await boardWizardBudgetOf(container).audit(boardWizardWorldId(gameId));expect(ledger.unknownRequestKeys).toHaveLength(0);
  const stored=await PrismaWorldBudgetStore.forReadOnlyTransaction(db).read(boardWizardWorldId(gameId));expect(stored).not.toBeNull();
  const refusedKey=JSON.parse(stopped.judgeJson!).boardReview.dual.quality.requestKey;
  for(const state of ['pending','unknown','fingerprint','conflict'] as const){const snapshot=structuredClone(stored!);
    const bill=snapshot.snapshot.requests.find(r=>r.requestKey===refusedKey)!;
    if(state==='fingerprint')Object.assign(bill,{operationFingerprint:'f'.repeat(64)});else if(state==='conflict')Object.assign(bill,{conflicts:[{kind:'synthetic'}]});
    else Object.assign(bill,{state,evidence:undefined});
    // Corrupt/unknown evidence is injected below the store solely to challenge
    // the stop's positive settlement fence, not to alter a real ledger.
    const spy=vi.spyOn(PrismaWorldBudgetStore,'forReadOnlyTransaction').mockReturnValue({read:async()=>snapshot} as unknown as ReturnType<typeof PrismaWorldBudgetStore.forReadOnlyTransaction>);
    expect(await windowStoppedRows(db,gameId,rows),state).toEqual(new Set());spy.mockRestore();
  }
  expect(await boardWizardBudgetOf(container).audit(boardWizardWorldId(gameId))).toEqual(ledger);
},1500000);

it.each(["newyork-detectives-hide-1", "giza-detectives-hide-2"])("Sunburst refuses a new %s painting before spending its ordinary assessment coverage", async hideId => {
  const gameId = "synthetic-sunburst-capacity-" + hideId;
  await newDetectiveWorld(gameId, 7, true, false, false, false, true);
  const context = await resolveLocalPatchBoardsForGame(db, gameId, 13), board = context.boards.find(b => b.hides.some(h => h.id === hideId))!;
  const budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(gameId), fill = 4_000_000 - 399_999 - (await budget.audit(worldId)).committedMicroUsd;
  await budget.reserve(worldId, { requestKey: "synthetic-prior-usage", scope: "image", operationFingerprint: "e".repeat(64), reserveMicroUsd: fill });
  await budget.settle(worldId, "synthetic-prior-usage", bill("req_synthetic_prior_sunburst", fill));
  const before = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } });
  const render = vi.fn(async () => { throw Error("No provider dispatch permitted"); });
  await expect(runLocalPatchHide(c, { readBoardArt: readArt, render,
    renderPolicySha256: localPatchRenderPolicySha256(LOCAL_PATCH_SUNBURST_IMAGE_POLICY) },
    { gameId, board, hide: board.hides.find(h => h.id === hideId)! })).rejects.toThrow("Sunburst painting requires its full image and ordinary assessment capacity");
  expect(render).not.toHaveBeenCalled();
  expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } })).toEqual(before);
  const rows = await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } } });
  expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ attempts: 0, status: "PENDING" });
});

it.each([{mode:"clean",interrupted:false,guided:false},{mode:"transport",interrupted:true,guided:false},{mode:"guided",interrupted:false,guided:true},{mode:"tail",interrupted:false,guided:true},{mode:"body",interrupted:false,guided:true}].map(v=>({...v,born:false})).concat([{mode:"born-clean",interrupted:false,guided:false,born:true},{mode:"born-guided",interrupted:false,guided:true,born:true},{mode:"born-transport",interrupted:true,guided:false,born:true},{mode:"born-crown",interrupted:false,guided:false,born:true},{mode:"kingdom-clean",interrupted:false,guided:false,born:true},{mode:"kingdom-transport",interrupted:true,guided:false,born:true},{mode:"kingdom-guided",interrupted:false,guided:true,born:true},{mode:"window-clean",interrupted:false,guided:false,born:true},{mode:"sunburst-clean",interrupted:false,guided:false,born:true}]).map(testCase => ({ ...testCase, reviewEffort: testCase.born && testCase.mode !== "born-crown" ? "MEDIUM" : "LOW" })))("completes 27 hides with bounded $reviewEffort review and no extra planner; mode=$mode", async ({mode,interrupted,guided,born}) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const kingdom=mode.startsWith("kingdom-"),crown=mode==="born-crown",body=mode==="body";const gameId = "detective-single-world-synthetic-" + mode; await newDetectiveWorld(gameId,body||born?7:8,born,false,kingdom,mode==='window-clean',mode==='sunburst-clean');
  if(mode==="sunburst-clean")expect(await localPatchPainterRelease(db,gameId)).toBe(LOCAL_PATCH_SUNBURST_PAINTER);
  const context = await resolveLocalPatchBoardsForGame(db, gameId, 13), hides = context.boards.flatMap(board => board.hides);
  expect(context.boards).toHaveLength(9); expect(hides).toHaveLength(27);
  // Simulate the actual older deployment: genuine LOW purchases under the
  // same immutable four-dollar birth grant. The restored policy then decides
  // fresh correction pixels in MEDIUM; no runtime downgrade switch exists.
  const originalAuthorization=singlePolicyModule.singleLowReviewAuthorization;
  const legacy=crown?vi.spyOn(singlePolicyModule,"singleLowReviewAuthorization").mockImplementation(async(...args)=>{const a=await originalAuthorization(...args);return a?.kind==="from-birth"&&a.sceneVersion===13?{...a,kind:"historical" as const,sceneVersion:13 as const}:a;}):null;

  expect(hides.every(hide => sourcePlacementForHide(context, hide.id)!.sourceNeighbors)).toBe(true);
  const tail = mode === "tail"||body, guidedHideId = tail ? context.boards.find(b=>b.board==="paris")!.hides[0]!.id : hides[0]!.id;
  const prompts = new Map<string, string>(), provider = controlledSol(interrupted, guided, body?[guidedHideId,"giza-detectives-hide-2"]:guidedHideId,body||born,born);
  // Record the pixels actually drawn by this synthetic painter, independently
  // of the production tap-geometry measurement and its normalization.
  const paintedFigures = new Map<string, { left: number; top: number; width: number; height: number }>();
  let tailExtended = false, protectedRows: unknown[] = [], nativeDeferred = false, nativePendingChecked = false, bodyBudgetFilled=false, bodyAdopted=false, bodyDeferred=false, bodyPendingChecked=false, bornDeferred=false, bornPendingChecked=false;
  const synchronous = vi.fn<NonNullable<Container["visualReview"]>["request"]>(async () => { throw Error("Historical single review forbidden"); });
  const container = { ...c, visualReview: { request: synchronous }, backgroundReview: provider.fake } as Container;
  const deps: LocalPatchHideDeps = { readBoardArt: async (art, sha) => {
    const bytes = await readArt(art, sha);
    if(mode==="born-clean"&&!bornDeferred&&art===context.boards.find(b=>b.board==="giza")!.art&&await db.targetVariantAsset.findFirst({where:{variant:"A",status:"PENDING",attempts:0,targetInstance:{gameScene:{gameId,sceneSlug:"giza"},targetId:"hide-2"}}})){bornDeferred=true;await vi.advanceTimersByTimeAsync(120001);}
    if(body&&bodyAdopted&&!bodyDeferred&&art===context.boards.find(b=>b.board==="giza")!.art){bodyDeferred=true;await vi.advanceTimersByTimeAsync(120001);}
    if (tail && !body && tailExtended && !nativeDeferred && art === context.boards.find(b=>b.board==="paris")!.art) {
      nativeDeferred = true; await vi.advanceTimersByTimeAsync(120_001);
    }
    return bytes;
  }, renderPolicySha256: localPatchRenderPolicySha256(mode==="sunburst-clean" ? LOCAL_PATCH_SUNBURST_IMAGE_POLICY : LOCAL_PATCH_IMAGE_POLICY),
    judge: async () => { throw Error("Historical per-hide judge forbidden"); },
    render: async ({ requestKey, stylePng, prompt, subjectQuality, placementGuidePng, maskPng }) => {
      expect(subjectQuality).toBe(mode==="sunburst-clean" ? "high" : "medium");
      const hide = hides.find(hide => requestKey.startsWith(hide.id + ":")); if (!hide) throw Error("Unregistered Detective painter request");
      if (guided && (hide.id === guidedHideId || body&&hide.id==="giza-detectives-hide-2")) {
        expect(body?[1,2,3,4,5]:tail ? [1,2,3,4] : [1,2,3]).toContain(Number(requestKey.split(":").at(-1)));
        if (requestKey.endsWith(":render:3")) expect(placementGuidePng).toBeDefined();
      } else expect(requestKey.endsWith(":render:1")).toBe(true);
      expect(prompt).toContain("local-patch-authored-paint/v1"); prompts.set(requestKey, prompt);
      const mask = placementGuidePng ? guidedFrameGeometry(maskForHide(hide), localPatchReturnRegion(cropOf(hide), maskForHide(hide), hide.returnRect).local).target : maskForHide(hide);
      const figureRect = { left: mask.left + Math.round(mask.width * 0.2), top: mask.top + Math.round(mask.height * 0.2), width: Math.round(mask.width * 0.6), height: Math.round(mask.height * 0.8) };
      const crop = cropOf(hide);
      paintedFigures.set(hide.id, { ...figureRect, left: crop.left + figureRect.left, top: crop.top + figureRect.top });
      const figure = await sharp({ create: { width: figureRect.width, height: figureRect.height, channels: 4, background: requestKey.endsWith(":render:2") ? "#304f91" : "#1e3ca0" } }).png().toBuffer();
      let png = await sharp(stylePng).composite([{ input: figure, left: figureRect.left, top: figureRect.top }]).png().toBuffer();
      if(crown){const contract=SOURCE_CROWN_RETURN_CONTRACTS.find(c=>c.hideId===hide.id);if(contract){const cap=await sharp({create:{width:42,height:64,channels:4,background:"#663322"}}).png().toBuffer();png=await sharp(png).composite([{input:cap,left:contract.child.left+30,top:contract.parentReturned.top-22}]).png().toBuffer();}}
      if (tail && (hide.id === guidedHideId || body&&hide.id==="giza-detectives-hide-2") && requestKey.endsWith(":render:3")) {
        // A genuinely different prospective mask is required after this stationary background rewrite.
        png=await sharp({create:{width:512,height:768,channels:4,background:"#808080"}}).png().toBuffer();
      }
      if (tail && hide.id === guidedHideId && requestKey.endsWith(":render:4")) {
        expect(prompt).toContain("NATIVE EDIT MASK");expect(prompt).toContain("original TARGET person WHOLE");
        const edit=maskForHide(hide),sourceHead=sourcePlacementForHide(context,hide.id)!.sourceNeighbors!.contract.neighbors.find(n=>n.sourceId==="source-petanque-child")!.head;
        expect(sourceHead.top-cropOf(hide).top).toBeLessThan(mask.top);expect(sourceHead.top-cropOf(hide).top).toBeGreaterThanOrEqual(edit.top);
        expect(prompt).toContain('"nativeEditEnvelope":'+JSON.stringify(edit));
        const alpha=await sharp(maskPng).ensureAlpha().raw().toBuffer();let clear=0;
        let mismatches=0;for(let y=0;y<768;y++)for(let x=0;x<512;x++){const editable=alpha[(y*512+x)*4+3]===0;if(editable)clear++;if(editable!==(x>=edit.left&&x<edit.left+edit.width&&y>=edit.top&&y<edit.top+edit.height))mismatches++;}
        expect(mismatches).toBe(0);expect(clear).toBe(edit.width*edit.height);
      }
      return paintedOk(png, { ...bill("paint-" + gameId + "-" + requestKey, born ? 66500 : undefined), ...(mode==="sunburst-clean" ? {model:"gpt-image-2.6-sunburst"} : {}) });
    } };
  const diagnose = vi.fn(async () => { throw Error("Clean controlled answers cannot authorize a diagnosis"); });
  let result = { pending: true, attention: null as string | null }, ticks = 0;
  for (; ticks < 900 && result.pending; ticks++) {
    result = await runLocalPatchWorldSlice(container, deps, gameId, { hardDeadlineAt: Date.now() + 270_000, diagnose, ...(body||mode==="born-clean"?{maxHides:1}:{}) });
    if(body&&!tailExtended&&!bodyBudgetFilled){const current=await db.targetVariantAsset.findMany({where:{variant:'A',targetInstance:{gameScene:{gameId}}}});if(current.some(r=>r.attempts===3&&r.status==='FAILED'&&JSON.parse(r.judgeJson!).hide===guidedHideId)&&current.some(r=>r.attempts===2&&r.status==='FAILED'&&JSON.parse(r.judgeJson!).hide==='giza-detectives-hide-2')){const budget=boardWizardBudgetOf(container),worldId=boardWizardWorldId(gameId),fill=7650000-(await budget.audit(worldId)).committedMicroUsd;await budget.reserve(worldId,{requestKey:'synthetic-finishing-eight-cap',scope:'image',operationFingerprint:'c'.repeat(64),reserveMicroUsd:fill});await budget.settle(worldId,'synthetic-finishing-eight-cap',bill('req-eight-filled-'+gameId,fill));bodyBudgetFilled=true;}}
    if(body&&tailExtended&&result.attention&&!bodyAdopted){const protectedBefore=await db.targetVariantAsset.findMany({where:{variant:'A',status:'GENERATED',targetInstance:{gameScene:{gameId}}},orderBy:{id:'asc'}});expect(protectedBefore).toHaveLength(25);const exhaustedPair=await db.targetVariantAsset.findMany({where:{variant:'A',status:'FAILED',targetInstance:{gameScene:{gameId}}}});expect(exhaustedPair.map(r=>r.attempts).sort(),'An authorized unbought native painting must queue, not falsely stop').toEqual([3,4]);protectedRows=protectedBefore;const before=await boardWizardBudgetOf(container).audit(boardWizardWorldId(gameId));console.info('source-body-parent-contracts', (await db.targetVariantAsset.findMany({where:{variant:'A',status:'FAILED',targetInstance:{gameScene:{gameId}}}})).map(r=>{const j=JSON.parse(r.judgeJson!);return {attempts:r.attempts,hide:j.hide,source:j.authoredReturn?.source,local:j.authoredReturn?.local,reviewState:j.reviewState,wireFault:j.wireFault,renderFault:j.renderFault,permission:j.compositionPermission,seam:j.seam,verdict:j.verdict};}));expect(await resumeSourceBodyGeometryRepair(container,gameId)).toBe(true);expect(await resumeSourceBodyGeometryRepair(container,gameId)).toBe(false);const pin=(await readSourceBodyRepairPin(db,gameId))!;expect(pin.selected.map(s=>s.authorizedAttempt).sort()).toEqual([4,5]);const savedBody=await db.auditLog.findUniqueOrThrow({where:{id:sourceBodyRepairId(gameId)}});for(const fault of ['key','counter','protected','family','manifest','cap']){const changed=JSON.parse(savedBody.metaJson!);if(fault==='key')changed.selected[0].requestKey+='foreign';if(fault==='counter')changed.selected[0].authorizedAttempt++;if(fault==='protected')changed.protectedRows[1]=changed.protectedRows[0];if(fault==='family')changed.familySha256='f'.repeat(64);if(fault==='manifest')changed.manifestSha256='f'.repeat(64);if(fault==='cap')changed.capMicroUsd=11000000;const {authorizationSha256:_sha,...unsigned}=changed;changed.authorizationSha256=boardConditioningHash(unsigned);await db.auditLog.update({where:{id:savedBody.id},data:{metaJson:JSON.stringify(changed)}});await expect(readSourceBodyRepairPin(db,gameId)).rejects.toThrow();await db.auditLog.update({where:{id:savedBody.id},data:{metaJson:savedBody.metaJson}});}expect(await boardWizardBudgetOf(container).audit(boardWizardWorldId(gameId))).toEqual(before);bodyAdopted=true;result={pending:true,attention:null};continue;}
    if (tail && result.attention && !tailExtended) {
      const rows=await db.targetVariantAsset.findMany({where:{variant:"A",targetInstance:{gameScene:{gameId}}},orderBy:{id:"asc"}});
      expect(rows).toHaveLength(27);const remaining=rows.filter(r=>r.status!=="GENERATED");if(body&&remaining.length!==2)console.info('body-fixture-unexpected-remaining',remaining.map(r=>({attempts:r.attempts,status:r.status,error:r.lastError,hide:JSON.parse(r.judgeJson??'null')?.hide})));expect(remaining).toHaveLength(body?2:1);
      const third=remaining.find(r=>r.attempts===3)!;const rejected=JSON.parse(third.judgeJson!);expect(third.attempts).toBe(3);expect(rejected.seam).toMatchObject({verdict:"background-rewritten",shift:{dx:0,dy:0}});
      protectedRows=rows.filter(r=>r.status==="GENERATED");
      const budget=boardWizardBudgetOf(container),worldId=boardWizardWorldId(gameId),fill=7_750_000-(await budget.audit(worldId)).committedMicroUsd;if(!bodyBudgetFilled)expect(fill).toBeGreaterThan(0);
      if(!bodyBudgetFilled){await budget.reserve(worldId,{requestKey:"synthetic-finishing-eight-cap",scope:"image",operationFingerprint:"c".repeat(64),reserveMicroUsd:fill});await budget.settle(worldId,"synthetic-finishing-eight-cap",bill("req-eight-filled-"+gameId,fill));}
      // Synthetic resource-stop fixture only. Real jobs use the normal exhaustion path.
      await db.generationJob.update({where:{id:"job_"+gameId},data:{lastError:"local-patch: no automatic action remains within the authorized world budget; synthetic eight-dollar stop"}});
      const plan=await planDetectivesCompletionTail(container,gameId);expect(plan.binding.tailRows.some(r=>r.mode==="native-mask-fourth"&&r.originalAttempts===3&&r.maxAttempt===4)).toBe(true);
      if(body)expect(plan.binding.tailRows.map(r=>({hide:r.hideId,old:r.originalAttempts,max:r.maxAttempt})).sort((a,b)=>a.hide.localeCompare(b.hide))).toEqual([{hide:'giza-detectives-hide-2',old:2,max:3},{hide:'paris-detectives-hide-1',old:3,max:4}]);
      const owner=(await db.game.findUniqueOrThrow({where:{id:gameId}})).ownerId;
      await authorizeDetectivesCompletionTail(container,{gameId,operatorId:owner!,expectedPlanSha256:plan.planSha256,ownerAuthorizationSha256:"d".repeat(64)});
      expect(await resumeDetectivesCompletionTail(container,gameId)).toBe(true);tailExtended=true;result={pending:true,attention:null};continue;
    }
    expect(result.attention).toBeNull();
    const checkpoint = await db.generationJob.findUniqueOrThrow({ where: { id: "job_" + gameId } });
    if(mode==="born-clean"&&bornDeferred&&!bornPendingChecked){const pending=await db.targetVariantAsset.findFirstOrThrow({where:{variant:"A",targetInstance:{gameScene:{gameId,sceneSlug:"giza"},targetId:"hide-2"}}});expect(pending).toMatchObject({status:"PENDING",attempts:1});expect(sourceBodyBirthMarker(pending)).not.toBeNull();expect(prompts.has("giza-detectives-hide-2:standing:render:1")).toBe(false);expect(await boardWizardBudgetOf(container).readRequest(boardWizardWorldId(gameId),"giza-detectives-hide-2:standing:render:1")).toBeNull();expect(checkpoint.status).toBe("QUEUED");expect(result.pending).toBe(true);bornPendingChecked=true;}
    if(body&&bodyDeferred&&!bodyPendingChecked){const pending=await db.targetVariantAsset.findFirstOrThrow({where:{variant:'A',targetInstance:{gameScene:{gameId,sceneSlug:'giza'},targetId:'hide-2'}}});expect(pending).toMatchObject({status:'PENDING',attempts:4});expect(sourceBodyMarker(pending)).not.toBeNull();expect(prompts.has('giza-detectives-hide-2:standing:render:4')).toBe(false);expect(await boardWizardBudgetOf(container).readRequest(boardWizardWorldId(gameId),'giza-detectives-hide-2:standing:render:4')).toBeNull();expect(checkpoint.status).toBe('QUEUED');expect(result.pending).toBe(true);bodyPendingChecked=true;}
    if (tail && nativeDeferred && !nativePendingChecked) {
      const pendingNative = await db.targetVariantAsset.findFirstOrThrow({where:{targetInstance:{gameScene:{gameId,sceneSlug:"paris"},targetId:"hide-1"},variant:"A"}});
      expect(pendingNative).toMatchObject({status:"PENDING",attempts:4});
      expect(prompts.has(guidedHideId+":crouching:render:4")).toBe(false);
      expect(await boardWizardBudgetOf(container).readRequest(boardWizardWorldId(gameId),guidedHideId+":crouching:render:4")).toBeNull();
      expect(checkpoint.status).toBe("QUEUED"); expect(result.pending).toBe(true); nativePendingChecked=true;
    }
    if (checkpoint.currentStep === "local-patch:recovery-budget-wait") {
      expect((await boardWizardBudgetOf(container).audit(boardWizardWorldId(gameId))).capMicroUsd).toBe(8_000_000);
      // Model the same three-minute normal queue wait; no live pause or direct job mutation.
      await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS + 1);
    }
  }
  expect(result.pending).toBe(false); expect(ticks).toBeLessThan(900);
  const game = await db.game.findUniqueOrThrow({ where: { id: gameId } });
  expect(["READY", "DELIVERED"]).toContain(game.status);
  const config = parseGameConfig(game.configJson!);
  expect(config.scenes).toHaveLength(9); expect(config.scenes.every(scene => scene.version === 13 && scene.playMode === "find-any" && scene.targets.length === 3)).toBe(true);
  expect(config.scenes.flatMap(scene => scene.targets)).toHaveLength(27);
  expect(config.adventure!.boards).toHaveLength(9); expect(config.adventure!.boards.flatMap(board => board.discoveries)).toHaveLength(54);
  expect(config.scenes.every(scene => scene.art.base.includes("-detectives-"))).toBe(true);
  expect(await subjectUpgradeOf(db, gameId)).toMatchObject({ actorType: "SYSTEM", operatorId: SYSTEM_ENROLLMENT_OPERATOR, ageYears: body||born?7:8 });
  const rows = await db.targetVariantAsset.findMany({ where: { variant: "A", targetInstance: { gameScene: { gameId } } } });
  expect(rows).toHaveLength(27); expect(rows.every(row => row.status === "GENERATED" && row.attempts === (body ? JSON.parse(row.judgeJson!).hide===guidedHideId?5:JSON.parse(row.judgeJson!).hide==="giza-detectives-hide-2"?4:1 : guided && JSON.parse(row.judgeJson!).hide === guidedHideId ? tail ? 4 : 3 : 1))).toBe(true);
  expect(prompts.size).toBe(body?34:tail ? 30 : guided ? 29 : 27); expect(provider.creates).toHaveLength(body?32:guided ? 29 : interrupted ? 28 : 27); expect(provider.creates.filter(create => create.quality)).toHaveLength(body?32:guided ? 29 : interrupted ? 28 : 27);
  expect(provider.creates.filter(create => create.tier === "default")).toHaveLength(interrupted ? 1 : 0);
  if (kingdom) for (const request of provider.creates) {
    expect(request.reasoning).toEqual({ effort: "medium" });
    expect(request.prompt).toContain('"version":"' + SINGLE_MEDIUM_VISUAL_REVIEW_VERSION + '"');
    expect(request.prompt).toContain("HEAD_RETURN_EVIDENCE: ");
    expect(request.prompt).toContain('"version":"' + TARGET_HEAD_VISIBLE_VERSION + '"');
    expect(request.labels.at(-2)).toContain(request.hideId + ":native-provider-raw 512x768");
    expect(request.labels.at(-1)).toContain(request.hideId + ":native-shipping-crown 512x768");
  }
  if(body){expect(bodyAdopted).toBe(true);expect(bodyPendingChecked).toBe(true);expect(await db.targetVariantAsset.findMany({where:{id:{in:(protectedRows as {id:string}[]).map(r=>r.id)}},orderBy:{id:'asc'}})).toEqual(protectedRows);for(const row of rows.filter(r=>sourceBodyMarker(r))){const bound={...publicationBinding(gameId,row),sceneVersion:13},p=await db.auditLog.findUniqueOrThrow({where:{id:sourceBodyRepairId(gameId)}});await db.auditLog.delete({where:{id:p.id}});expect(await allowedDualPublication(db,bound)).toBe(false);await db.auditLog.create({data:p});const bad=JSON.parse(row.judgeJson!);bad.sourceBodyRepair.sourceRowSha256='f'.repeat(64);expect(await allowedDualPublication(db,{...bound,judgeJson:JSON.stringify(bad)})).toBe(false);}}
  if (tail&&!body) {
    expect(tailExtended).toBe(true);expect(nativeDeferred).toBe(true);expect(nativePendingChecked).toBe(true);expect(await db.targetVariantAsset.findMany({where:{id:{in:(protectedRows as {id:string}[]).map(r=>r.id)}},orderBy:{id:"asc"}})).toEqual(protectedRows);
    const native=rows.find(r=>r.attempts===4)!;expect(nativeMaskTailMarker(native)).not.toBeNull();
    const nativeBinding={...publicationBinding(gameId,native),sceneVersion:13};
    for(const id of [detectivesTailId(gameId),detectivesTailResumeId(gameId)]) {const proof=await db.auditLog.findUniqueOrThrow({where:{id}});await db.auditLog.delete({where:{id}});expect(await allowedDualPublication(db,nativeBinding)).toBe(false);await db.auditLog.create({data:proof});}
    const changed=JSON.parse(native.judgeJson!);changed.nativeMaskTail.sourceRowSha256="e".repeat(64);expect(await allowedDualPublication(db,{...nativeBinding,judgeJson:JSON.stringify(changed)})).toBe(false);
  }
  const store = new PrismaRetainedPurchaseStore(db), worldId = boardWizardWorldId(gameId);
  for (const row of rows) {
    const receipt = JSON.parse(row.judgeJson!), proof = receipt.boardReview.dual as DualReviewProof;
    expect(proof.single).toBe(born&&!crown ? SINGLE_MEDIUM_VISUAL_REVIEW_VERSION : SINGLE_VISUAL_REVIEW_VERSION);
    expect(proof.continuity!.requestKey).toBe(proof.quality.requestKey);
    expect(receipt.boardReview.effort).toBe(born&&!crown ? "medium" : "low");
    if (kingdom) {
      expect(receipt.headPolicyVersion).toBe(TARGET_HEAD_VISIBLE_VERSION);
      expect(proof.quality.headEvidence).toMatchObject({
        version: TARGET_HEAD_VISIBLE_VERSION, gameId, hideId: receipt.hide,
        sourceRequestKey: `${receipt.hide}:${receipt.pose}:render:${row.attempts}`,
        shippingSha256: proof.imageSha256, geometrySha256: proof.geometrySha256,
        identitySha256: proof.identitySha256, returned: receipt.authoredReturn.local, feather: 12,
      });
      expect(targetHeadReturnDecision(proof.quality.raw, proof.quality.headEvidence).disposition).toBe("pass");
    }
    expect(receipt.boardReview.costMicroUsd).toBe(proof.quality.costMicroUsd);
    expect(receipt.authoredReturn.contentVersion).toBe(13); expect(proof.sceneVersion).toBe(13);
    expect(proof.quality.sourceNeighbors).toBeDefined(); expect(proof.subject!.sourceNeighbors).toEqual(proof.quality.sourceNeighbors);
    expect(readQualityStage(proof.quality, receipt.hide, 13)?.verdict).toBe("pass");
    expect(readContinuityStage(proof.continuity!, receipt.hide, DUAL_VISUAL_REVIEW_V3)).toMatchObject({ ok: true });
    expect(proof.subject).toMatchObject({ subjectPolicy: SUBJECT_POLICY_V2, reader: SUBJECT_READER_V2, combined: SUBJECT_QUALITY_BUNDLE_VERSION, requestKey: proof.quality.requestKey });
    expect(readSubjectAnswerV2(subjectStageRaw(proof.subject!), { hideId: receipt.hide, ageYears: body||born?7:8, plan: subjectPlanOfHide(receipt.hide, 13)! })).toMatchObject({ ok: true, disposition: "pass" });
    for (const stage of [proof.quality, proof.continuity!]) {
      const retained = await store.get(worldId, stage.requestKey); expect(retained).not.toBeNull();
      expect(retained!.operationFingerprint).toBe(stage.fingerprint); expect(JSON.parse(retained!.bytes.toString()).raw).toBe(stage.raw);
    }
    const binding = { ...publicationBinding(gameId, row), sceneVersion: 13 };
    expect(await allowedDualPublication(db, binding)).toBe(true); expect(await hasLocalPatchPublicationPolicy(c, binding)).toBe(true);
  }

  // A copied pass flag, missing policy authority or independent second receipt cannot publish.
  const checked = rows[0]!, binding = { ...publicationBinding(gameId, checked), sceneVersion: 13 };
  const original = JSON.parse(checked.judgeJson!);
  for (const corrupt of ['no-single-marker', 'wrong-effort', 'split-receipt', 'changed-raw', 'false-doubt', 'raw-envelope-version', 'policy-effort']) {
    const changed = structuredClone(original);
    if (corrupt === 'no-single-marker') delete changed.boardReview.dual.single;
    if (corrupt === 'wrong-effort') changed.boardReview.effort = 'high';
    if (corrupt === 'split-receipt') changed.boardReview.dual.continuity.requestKey += 'foreign';
    if (corrupt === 'changed-raw') changed.boardReview.dual.quality.raw += 'changed';
    if (corrupt === 'raw-envelope-version') {const raw=JSON.parse(changed.boardReview.dual.quality.raw);raw.version=born&&!crown?SINGLE_VISUAL_REVIEW_VERSION:SINGLE_MEDIUM_VISUAL_REVIEW_VERSION;for(const role of ['quality','continuity','subject'])changed.boardReview.dual[role].raw=JSON.stringify(raw);}
    if (corrupt === 'policy-effort') for(const role of ['quality','continuity','subject'])changed.boardReview.dual[role].policy.effort=born&&!crown?'low':'medium';
    if (corrupt === 'false-doubt') { const raw = JSON.parse(changed.boardReview.dual.quality.raw); raw.doubt = true; raw.doubtReason = 'Synthetic located uncertainty at the left join'; changed.boardReview.dual.quality.raw = JSON.stringify(raw); }
    expect(await allowedDualPublication(db, { ...binding, judgeJson: JSON.stringify(changed) })).toBe(false);
  }
  if(born&&!crown){const policy=await db.auditLog.findUniqueOrThrow({where:{id:"aud_single_medium_"+gameId}});const pin=JSON.parse(policy.metaJson!);expect(pin).toMatchObject({effort:"medium",worldCapMicroUsd:4000000,oneUsableAssessmentPerImage:true,automaticBudgetExtension:false});await db.auditLog.delete({where:{id:policy.id}});expect(await allowedDualPublication(db,binding)).toBe(false);await db.auditLog.create({data:policy});expect(await allowedDualPublication(db,binding)).toBe(true);}
  if (kingdom) {
    for (const corrupt of ["missing-head", "foreign-raw", "foreign-shipping", "wrong-return"]) {
      const changed = structuredClone(original);
      const stage = changed.boardReview.dual.quality;
      if (corrupt === "missing-head") delete stage.headEvidence;
      if (corrupt === "foreign-raw") stage.headEvidence.normalizedRawSha256 = "e".repeat(64);
      if (corrupt === "foreign-shipping") stage.headEvidence.shippingSha256 = "e".repeat(64);
      if (corrupt === "wrong-return") stage.headEvidence.returned.top++;
      expect(await allowedDualPublication(db, { ...binding, judgeJson: JSON.stringify(changed) }), corrupt).toBe(false);
    }
    const stage = structuredClone(original.boardReview.dual.quality) as DualReviewProof["quality"];
    const answer = JSON.parse(stage.raw!);
    // Both verbal crown verdicts stay PASS: the located head crossing the
    // opaque return must independently force repair in the same MEDIUM answer.
    answer.head.shippingHead.top = stage.headEvidence!.returned.top;
    stage.raw = JSON.stringify(answer);
    expect(targetHeadReturnDecision(stage.raw, stage.headEvidence)).toMatchObject({ disposition: "repair", reason: expect.stringContaining("opaque return") });
    expect(readQualityStage(stage, original.hide, 13)?.verdict).toBe("fail");
  }
  const authority = await db.auditLog.findUniqueOrThrow({ where: { id: born?detectivesOperationalId(gameId):detectivesExtensionId(gameId) } });
  await db.auditLog.delete({ where: { id: authority.id } });
  expect(await allowedDualPublication(db, binding)).toBe(false);
  await db.auditLog.create({ data: authority });
  expect(await allowedDualPublication(db, binding)).toBe(true);
  const oversized = config.scenes.find(scene => scene.slug === (kingdom?"castlegate":"paris"))!.targets.find(target => target.id === "hide-2")!.sprite;
  expect(oversized.kind).toBe("image");
  if (oversized.kind === "image") expect(oversized.rect!.h * (kingdom?1882:2160)).toBe(768);
  if (kingdom) for (const scene of config.scenes) {
    expect(scene.art).toMatchObject({ width: 3344, height: 1882 });
    for (const target of scene.targets) {
      const hide = context.boards.find(board => board.board === scene.slug)!.hides.find(hide => hide.targetId === target.id)!;
      const figure = paintedFigures.get(hide.id)!;
      const geometry = targetGeometry(scene, target, "A"), hit = geometry.hitRect;
      expect(geometry.isPatch).toBe(true);
      // At most the 12px feather on either side can shrink the known painted
      // figure. A slot-sized area or a 2160px normalization cannot satisfy this.
      expect((hit.x1 - hit.x0) * 3344).toBeGreaterThanOrEqual(figure.width - 24);
      expect((hit.y1 - hit.y0) * 1882).toBeGreaterThanOrEqual(figure.height - 24);
      expect((hit.x1 - hit.x0) * 3344).toBeLessThanOrEqual(figure.width + 48);
      expect((hit.y1 - hit.y0) * 1882).toBeLessThanOrEqual(figure.height + 48);
      for (const [x, y] of [[figure.left + 13, figure.top + 13], [figure.left + figure.width - 13, figure.top + figure.height - 13]]) {
        expect(rectContains(hit, x! / 3344, y! / 1882), hide.id).toBe(true);
      }
      const crop = cropOf(hide);
      expect(rectContains(hit, (crop.left + 1) / 3344, (crop.top + 1) / 1882), hide.id).toBe(false);
      for (const scale of [320 / 3344, 390 / 3344, 844 / 1882, 1]) {
        const pad = hitPadding(hit, scene.art, scale, 64), tappable = expandRect(hit, pad.padX, pad.padY);
        expect((tappable.x1 - tappable.x0) * 3344 * scale).toBeGreaterThanOrEqual(64 - 1e-8);
        expect((tappable.y1 - tappable.y0) * 1882 * scale).toBeGreaterThanOrEqual(64 - 1e-8);
      }
    }
  }
  else if (oversized.kind === "image") {
    if(born&&!crown){
      const scene=config.scenes.find(s=>s.slug==="paris")!,target=scene.targets.find(t=>t.id==="hide-2")!;
      const hide=context.boards.find(b=>b.board==="paris")!.hides.find(h=>h.targetId==="hide-2")!,figure=paintedFigures.get(hide.id)!;
      // The prospective guide deliberately shrinks this figure. Measure the
      // real synthetic pixels rather than keeping the old unguided 432px floor.
      const hit=targetGeometry(scene,target,"A").hitRect;
      expect((hit.x1-hit.x0)*scene.art.width).toBeGreaterThanOrEqual(figure.width-24);
      expect((hit.x1-hit.x0)*scene.art.width).toBeLessThanOrEqual(figure.width+48);
      expect((hit.y1-hit.y0)*scene.art.height).toBeGreaterThanOrEqual(figure.height-24);
      expect((hit.y1-hit.y0)*scene.art.height).toBeLessThanOrEqual(figure.height+48);
      expect(rectContains(hit,(figure.left+figure.width/2)/scene.art.width,(figure.top+figure.height/2)/scene.art.height)).toBe(true);
    }else expect(oversized.hitRect!.h * 2160).toBeGreaterThan(540 * 0.8);
  }
  if(mode==="born-clean")expect(bornPendingChecked).toBe(true);
  const audit = await boardWizardBudgetOf(c).audit(worldId);
  expect(audit).toMatchObject({ capMicroUsd: born?4_000_000:tail ? 10_000_000 : 8_000_000, held: false, pendingRequestKeys: [] });
  expect(audit.unknownRequestKeys).toHaveLength(interrupted ? 1 : 0);
  if (interrupted) {
    const unknown = await boardWizardBudgetOf(c).readRequest(worldId, audit.unknownRequestKeys[0]!);
    expect(unknown).toMatchObject({ state: "unknown", scope: "judge" });
    expect(audit.reservedMicroUsd).toBe(unknown!.reserveMicroUsd);
    expect(await boardWizardBudgetOf(c).readContinuationApproval(worldId, audit.unknownRequestKeys[0]!)).toMatchObject({ version: "world-automatic-review-recovery/v5", imageSha256: expect.any(String) });
  } else expect(audit.reservedMicroUsd).toBe(0);
  expect(audit.committedMicroUsd).toBeLessThanOrEqual(audit.capMicroUsd);
  if(born){expect(await db.auditLog.count({where:{entityType:"Game",entityId:gameId,actorType:"ADMIN"}})).toBe(0);expect(await detectivesOperationalPolicyOf(db,gameId)).toMatchObject({worldCapMicroUsd:4000000,model:"gpt-6.1-sol",effort:"low",automaticBudgetExtension:false});const bodyRows=rows.filter(r=>sourceBodyBirthMarker(r));expect(bodyRows).toHaveLength(kingdom?0:2);for(const r of bodyRows){expect(r.attempts).toBe(1);expect(JSON.parse(r.judgeJson!).sourceBodyComposition.outsideChangedPixels).toBe(0);}}
  const child = await db.childProfile.findUniqueOrThrow({ where: { id: "chl-" + gameId } });
  const photo = await db.asset.findUniqueOrThrow({ where: { id: "ast-photo-" + gameId } });
  expect(child.originalPhotoAssetId).toBeNull(); expect(photo.status).toBe("DELETED"); expect(await db.fileBlob.findUnique({ where: { key: photo.storagePath } })).toBeNull();
  expect((await sourcePlacementReleaseOf(db, gameId))!.baseSceneVersion).toBe(13);
  expect(diagnose).not.toHaveBeenCalled(); expect(synchronous).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  if(crown){
    legacy!.mockRestore();
    await db.game.update({where:{id:gameId},data:{status:"DELIVERED"}});
    const completed=await db.game.findUniqueOrThrow({where:{id:gameId}}),ownerId=completed.ownerId!,book=config.adventure!;
    let progress=emptyAdventureProgress(gameId,book);for(const board of book.boards){for(const targetId of board.targetIds)progress=recordAdventureEvent(progress,gameId,book,{kind:"target-found",boardSlug:board.boardSlug,targetId,variant:"A"}).progress;for(const discovery of board.discoveries)progress=recordAdventureEvent(progress,gameId,book,{kind:"discovery-found",boardSlug:board.boardSlug,discoveryId:discovery.id}).progress;}
    expect(progress.finds).toHaveLength(27);expect(progress.discoveries).toHaveLength(54);
    await db.adventureAlbumProgress.create({data:{gameId,revision:81,snapshotJson:JSON.stringify(progress)}});
    await db.passportPagePreference.create({data:{gameId,boardSlug:"newyork",photoTargetId:config.scenes[0]!.targets[0]!.id,revision:2}});
    await db.playSession.create({data:{id:"played-"+gameId,gameId,anonymousSessionId:"synthetic-browser",completedAt:new Date(),events:{create:[...config.scenes.flatMap(scene=>scene.targets.map(target=>({id:"found-"+gameId+"-"+scene.slug+"-"+target.id,sceneSlug:scene.slug,targetId:target.id,eventType:"target_found"}))),{id:"complete-"+gameId,eventType:"game_completed"}]}}});
    const targetRowsBefore=await db.targetInstance.findMany({where:{gameScene:{gameId}},orderBy:{id:"asc"}});
    const albumBefore=await db.adventureAlbumProgress.findUniqueOrThrow({where:{gameId}}),prefBefore=await db.passportPagePreference.findMany({where:{gameId}}),sessionBefore=await db.playSession.findMany({where:{gameId},include:{events:true}}),jobBefore=await db.generationJob.findUniqueOrThrow({where:{id:"job_"+gameId}});
    // This synthetic old charge leaves a tight tail including native source evidence.
    // After the first fixed-usage answer only the smaller full reserve fits;
    // the original four-dollar cap and every protected real request stay unchanged.
    const syntheticCrownRemainingMicroUsd=246000;
    const budget=boardWizardBudgetOf(c),before=await budget.audit(worldId),fill=before.remainingMicroUsd-syntheticCrownRemainingMicroUsd;
    expect(fill).toBeGreaterThan(0);await budget.reserve(worldId,{requestKey:"synthetic-crown-current-budget",scope:"image",operationFingerprint:"c".repeat(64),reserveMicroUsd:fill});await budget.settle(worldId,"synthetic-crown-current-budget",bill("synthetic-crown-budget-"+gameId,fill));
    const plan=await planPublishedCrownRepair(container,gameId);expect(plan.remainingMicroUsd).toBe(syntheticCrownRemainingMicroUsd);const paintCount=prompts.size,reviewCount=provider.creates.length;
    await expect(stagePublishedCrownRepair(container,{gameId,operatorId:"wrong-owner",expectedPlanSha256:plan.planSha256})).rejects.toThrow();expect(await publishedCrownRepairOf(db,gameId)).toBeNull();
    await expect(stagePublishedCrownRepair(container,{gameId,operatorId:ownerId,expectedPlanSha256:"f".repeat(64)})).rejects.toThrow();
    const staged=await stagePublishedCrownRepair(container,{gameId,operatorId:ownerId,expectedPlanSha256:plan.planSha256});expect(await stagePublishedCrownRepair(container,{gameId,operatorId:ownerId,expectedPlanSha256:plan.planSha256})).toBe(staged);
    await expect(stagePublishedCrownRepair(container,{gameId,operatorId:"wrong-owner",expectedPlanSha256:plan.planSha256})).rejects.toThrow();await expect(stagePublishedCrownRepair(container,{gameId,operatorId:ownerId,expectedPlanSha256:"f".repeat(64)})).rejects.toThrow();
    expect((await db.game.findUniqueOrThrow({where:{id:gameId}})).configJson).toBe(completed.configJson);expect(provider.creates).toHaveLength(reviewCount);
    const firstCrown=await (await import("../local-patch-board-review")).prepareLocalPatchBoardReview(container,{gameId,sceneId:plan.pin.selected[0]!.sceneId},{},{playerReview:true,includePlayerCandidates:true,skipApprovedEvidence:true});expect(firstCrown.ready,firstCrown.ready?"ready":firstCrown.reason).toBe(true);
    // An unrelated old receipt may no longer have its exact publication audit.
    // A scoped crown plan must never select it or ask for its deleted photo.
    const unrelated=rows.find(row=>!plan.pin.selected.some(s=>s.rowId===row.id)&&JSON.parse(row.judgeJson!).hide.startsWith("amazon"))!;
    await db.targetVariantAsset.update({where:{id:unrelated.id},data:{judgeJson:JSON.stringify({...JSON.parse(unrelated.judgeJson!),syntheticUnrelatedReceiptGap:true})}});
    try{const exact=await publishedCrownReviewOrder(container,plan.pin);expect(exact).toHaveLength(2);expect(exact.every(v=>plan.pin.selected.some(s=>s.hideId===v.selection.hideId))).toBe(true);expect(provider.creates).toHaveLength(reviewCount);}
    finally{await db.targetVariantAsset.update({where:{id:unrelated.id},data:{judgeJson:unrelated.judgeJson,updatedAt:unrelated.updatedAt}});}
    const admitted=await publishedCrownReviewOrder(container,plan.pin);expect(admitted).toHaveLength(2);const firstReserve=admitted[0]!.reserveMicroUsd,secondReserve=admitted[1]!.reserveMicroUsd;if(typeof firstReserve!=="number"||typeof secondReserve!=="number")throw Error("Two pending corrections require both exact full bounds");expect(firstReserve).toBeGreaterThanOrEqual(secondReserve);expect(provider.creates).toHaveLength(reviewCount);console.info("synthetic-crown-exact-reservations",admitted.map(a=>({hideId:a.selection.hideId,reserveMicroUsd:a.reserveMicroUsd})));
    const oldProtected=rows.filter(row=>!plan.pin.selected.some(s=>s.rowId===row.id)).map(row=>({id:row.id,sha:sourceCrownRowHash(row)}));
    let singleTailObserved=false;
    for(let turn=0;turn<18;turn++){const result=await tickGeneration(container,gameId,270000,270000);const state=await publishedCrownRepairOf(db,gameId);console.info("synthetic-crown-tick",{turn,...result,phase:state?.state.phase,newProviderQuestions:provider.creates.length-reviewCount});expect(state).not.toBeNull();expect(state!.state.phase).not.toBe("blocked");if(state!.state.phase==="committed")break;
      const approved=[];for(const s of plan.pin.selected){const current=await db.targetVariantAsset.findUniqueOrThrow({where:{id:s.rowId}});if(JSON.parse(current.judgeJson??"null")?.boardReview?.dual&&await hasLocalPatchPublicationPolicy(container,{...publicationBinding(gameId,current),sceneVersion:13}))approved.push(s.hideId);}
      if(approved.length===1&&!singleTailObserved){const tailBudget=await budget.audit(worldId);expect(tailBudget.remainingMicroUsd).toBeGreaterThanOrEqual(secondReserve);expect(tailBudget.remainingMicroUsd).toBeLessThan(firstReserve);const rebuild=vi.spyOn(dualReviewModule,"prospectiveSingleVisualReviewQuestion").mockRejectedValue(Error("A lone remaining candidate must not be prepared twice before dispatch"));
        try{const tail=await publishedCrownReviewOrder(container,plan.pin);expect(tail).toHaveLength(1);expect(tail[0]!.selection.hideId).not.toBe(approved[0]);expect(tail[0]!.reserveMicroUsd).toBeNull();}
        finally{rebuild.mockRestore();}singleTailObserved=true;}
      await vi.advanceTimersByTimeAsync(60001);}
    expect(singleTailObserved).toBe(true);
    const final=await publishedCrownRepairOf(db,gameId);expect(final!.state.phase).toBe("committed");expect(provider.creates).toHaveLength(reviewCount+2);expect(prompts.size).toBe(paintCount);expect(provider.creates[reviewCount]!.hideId).toBe(admitted[0]!.selection.hideId);
    for(const q of provider.creates.slice(reviewCount)){expect(q.prompt).toContain(SINGLE_MEDIUM_VISUAL_REVIEW_VERSION);expect(q.prompt).toContain("original photograph was normally deleted");expect(q.prompt).toContain("HEAD_RETURN_EVIDENCE");}
    const currentRows=await db.targetVariantAsset.findMany({where:{variant:"A",targetInstance:{gameScene:{gameId}}}});expect(currentRows).toHaveLength(27);expect(oldProtected.every(old=>currentRows.some(row=>row.id===old.id&&sourceCrownRowHash(row)===old.sha))).toBe(true);
    const targetRowsAfter=await db.targetInstance.findMany({where:{gameScene:{gameId}},orderBy:{id:"asc"}});expect(targetRowsAfter).toHaveLength(27);for(const old of targetRowsBefore){const selected=plan.pin.selected.find(s=>s.targetInstanceId===old.id);expect(targetRowsAfter.find(t=>t.id===old.id)).toEqual(selected?{...old,spriteKind:"image",spriteAssetId:selected.candidateAssetId}:old);}
    for(const s of plan.pin.selected){const row=currentRows.find(row=>row.id===s.rowId)!;expect(row).toMatchObject({status:"GENERATED",attempts:s.attempt,assetId:s.candidateAssetId});const receipt=JSON.parse(row.judgeJson!);expect(receipt.boardReview.dual.single).toBe(SINGLE_MEDIUM_VISUAL_REVIEW_VERSION);expect(receipt.boardReview.dual.subject.recompositionAnchor).toMatchObject({version:"crown-unchanged-face-anchor/v1",sourceAssetId:s.originalInput.assetId});expect(await allowedDualPublication(db,{...publicationBinding(gameId,row),sceneVersion:13})).toBe(true);const unlabelled=JSON.parse(row.judgeJson!);delete unlabelled.boardReview.dual.subject.recompositionAnchor;expect(await allowedDualPublication(db,{...publicationBinding(gameId,row),sceneVersion:13,judgeJson:JSON.stringify(unlabelled)})).toBe(false);}
    expect(await db.adventureAlbumProgress.findUniqueOrThrow({where:{gameId}})).toEqual(albumBefore);expect(await db.passportPagePreference.findMany({where:{gameId}})).toEqual(prefBefore);expect(await db.playSession.findMany({where:{gameId},include:{events:true}})).toEqual(sessionBefore);expect(await db.generationJob.findUniqueOrThrow({where:{id:"job_"+gameId}})).toEqual(jobBefore);
    const afterGame=await db.game.findUniqueOrThrow({where:{id:gameId}});expect(afterGame.status).toBe("DELIVERED");expect(afterGame.readyAt).toEqual(completed.readyAt);expect(afterGame.paidAt).toEqual(completed.paidAt);
    const afterConfig=parseGameConfig(afterGame.configJson!);expect(afterConfig.scenes.flatMap(s=>s.targets)).toHaveLength(27);
    for(const s of plan.pin.selected){const bound=afterConfig.adventure!.boards.find(b=>b.boardSlug===s.boardId)!.targetImages.find(t=>t.targetId===s.targetId)!;expect(JSON.stringify(bound)).toContain(s.candidateAssetId);}
    const account=await ownerAdventureAlbum(db,ownerId,gameId,undefined,"file:"+path.join(directory,"test.db"));expect(account).toMatchObject({revision:81,album:{stars:{found:27,total:27},postcards:{collected:9,total:9},discoveries:{collected:54,total:54},complete:true}});
    const finalBudget=await budget.audit(worldId);expect(finalBudget).toMatchObject({capMicroUsd:4000000,pendingRequestKeys:[],unknownRequestKeys:[]});expect(finalBudget.committedMicroUsd).toBeLessThanOrEqual(4000000);
    expect((await db.childProfile.findUniqueOrThrow({where:{id:child.id}})).originalPhotoAssetId).toBeNull();expect(await db.fileBlob.findUnique({where:{key:photo.storagePath}})).toBeNull();
  }
  console.info("synthetic-detective-all27", { ticks, hides: rows.length, reviewQuestions: provider.creates.length, committedMicroUsd: audit.committedMicroUsd });
}, 1_500_000);


async function prepareSingleAuthorization(gameId: string, ownerId: string) {
  expect(await enrollLeanWorld(c, gameId, async () => {})).toMatchObject({ state: 'enrolled' });
  const worldId = boardWizardWorldId(gameId), budget = boardWizardBudgetOf(c);
  const fill = 3_900_000 - (await budget.audit(worldId)).committedMicroUsd;
  await budget.reserve(worldId, { requestKey: 'synthetic-prior-four-dollar-work', scope: 'image', operationFingerprint: 'a'.repeat(64), reserveMicroUsd: fill });
  await budget.settle(worldId, 'synthetic-prior-four-dollar-work', bill('req-initial-' + gameId, fill));
  const hold = 'local-patch: no automatic action remains within the authorized world budget; synthetic bound stop';
  await db.generationJob.update({ where: { id: 'job_' + gameId }, data: { status: 'FAILED', currentStep: 'local-patch:recovery-exhausted', attempts: 20, lastError: hold } });
  const first = await planDetectivesCompletionBudget(c, gameId);
  await authorizeDetectivesCompletionBudget(c, { gameId, operatorId: ownerId, expectedPlanSha256: first.planSha256, ownerAuthorizationSha256: 'e'.repeat(64) });
  expect(await resumeDetectivesCompletionBudget(c, gameId)).toBe(true);
  await budget.reserve(worldId, { requestKey: 'synthetic-prior-six-dollar-work', scope: 'image', operationFingerprint: 'b'.repeat(64), reserveMicroUsd: 2_000_000 });
  await budget.settle(worldId, 'synthetic-prior-six-dollar-work', bill('req-six-' + gameId, 2_000_000));
  await db.generationJob.update({ where: { id: 'job_' + gameId }, data: { status: 'FAILED', currentStep: 'local-patch:recovery-exhausted', attempts: 21, lastError: hold } });
  const second = await planDetectivesCompletionExtension(c, gameId);
  expect(second.binding.reviewMode).toBe(SINGLE_VISUAL_REVIEW_VERSION);
  await authorizeDetectivesCompletionExtension(c, { gameId, operatorId: ownerId, expectedPlanSha256: second.planSha256, ownerAuthorizationSha256: 'f'.repeat(64) });
  expect(await resumeDetectivesCompletionExtension(c, gameId)).toBe(true);
}


it.each(["recompose-retained", "redraw-with-new-placement", "restyle-retained"] as const)("replays a paid native Kingdom repair without another purchase or cycle; action=%s", async action => {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    const gameId = "kingdom-native-paid-repair-synthetic-" + action;
    await newDetectiveWorld(gameId, 7, true, false, true);
    await ensureSingleMediumReviewPolicy(c, gameId, async () => {});
    const context = await resolveLocalPatchBoardsForGame(db, gameId, 13), board = context.boards.find(b => b.board === "castlegate")!, hide = board.hides[0]!;
    const parent = expectedAuthoredLocalPatchReturn(board, hide, 13, context)!;
    expect(parent.source).toMatchObject({ width: 3344, height: 1882 });
    const core = { left: parent.child.left + 20, top: parent.child.top + 20, width: parent.child.width - 40, height: parent.child.height - 40 };
    const decision: SelfRepairDecision = { cause: action === "restyle-retained" ? "paint-style" : "background-registration",
      explanation: "Synthetic correction preserves the complete target inside its source-bound return.", action,
      sourceKey: `${hide.id}:${hide.pose}:render:1`, returnWindow: parent.local, protectedCore: core,
      faceRect: { left: core.left + 10, top: core.top + 10, width: 40, height: 40 } };
    const provider = controlledSol(false, false, undefined, true);
    const container = { ...c, backgroundReview: provider.fake, visualReview: { request: async () => { throw Error("No synchronous duplicate judge"); } } } as Container;
    const render = vi.fn<LocalPatchHideDeps["render"]>(async input => {
      const figure = await sharp({ create: { width: core.width - 20, height: core.height - 20, channels: 4,
        background: input.requestKey.endsWith(":render:2") ? "#913857" : "#294c93" } }).png().toBuffer();
      return paintedOk(await sharp(input.stylePng).composite([{ input: figure, left: core.left + 10, top: core.top + 10 }]).png().toBuffer(), bill("native-" + action + "-" + input.requestKey, 50000));
    });
    const diagnose = vi.fn<NonNullable<SelfRepairDeps["diagnose"]>>(async wire => {
      expect(wire.settings.effort).toBe("medium");
      return { model: "gpt-5.6-sol", finishReason: "stop", raw: JSON.stringify(decision), requestId: "native-diagnosis-" + action,
        usage: { prompt_tokens: 2000, completion_tokens: 200 }, verdict: null, wireFault: null, costUnknown: false };
    });
    const deps: SelfRepairDeps = { readBoardArt: readArt, renderPolicySha256: localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY), render, diagnose,
      judge: async () => { throw Error("No per-hide duplicate judge"); }, fence: async () => {} };
    const getRow = () => db.targetVariantAsset.findFirstOrThrow({ where: { targetInstance: { gameScene: { gameId }, targetId: hide.targetId }, variant: "A" } });
    for (let attempt = 1; attempt <= 2; attempt++) {
      expect((await runLocalPatchHide(container, deps, { gameId, board, hide })).state).toBe("generated");
      const row = await getRow();
      await db.targetVariantAsset.update({ where: { id: row.id }, data: { status: "FAILED", lastError: "quality-retry: synthetic background defect" } });
    }
    const scene = await db.gameScene.findFirstOrThrow({ where: { gameId, sceneSlug: board.board } });
    const step = () => runLocalPatchSelfRepair(container, { gameId, sceneId: scene.id, board, hide }, deps);
    await step(); await step();
    expect(JSON.parse((await getRow()).judgeJson!).selfRepair.phase).toBe("applying");
    // Reproduce the old deployed compositor after the real paid plan (and,
    // where needed, real retained synthetic repaint) was saved.
    const compose = repairComposer.recomputePaidPatchJoin;
    const oldGuard = vi.spyOn(repairComposer, "recomputePaidPatchJoin").mockImplementationOnce(input => compose({ ...input, boardSize: { width: 3840, height: 2160 } }));
    await step(); oldGuard.mockRestore();
    const failed = await getRow(), failedReceipt = JSON.parse(failed.judgeJson!);
    expect(failedReceipt.selfRepair).toMatchObject({ phase: "rejected", cycle: 1, subjectV2Cycles: 1, feedback: NATIVE_SIZE_REPLAY_FAILURE });
    expect(nativeSizeSelfRepairWork(failed.judgeJson)).toBe(true);
    const ledger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: boardWizardWorldId(gameId) } });
    const imageCalls = render.mock.calls.length;
    expect(imageCalls).toBe(action === "recompose-retained" ? 2 : 3); expect(diagnose).toHaveBeenCalledTimes(1);
    await step();
    const frozen = await getRow(), frozenReceipt = JSON.parse(frozen.judgeJson!);
    expect(frozenReceipt.selfRepair).toMatchObject({ phase: "applying", cycle: 1, subjectV2Cycles: 1 });
    expect(nativeSizeSelfRepairWork(frozen.judgeJson)).toBe(true);
    expect(frozenReceipt.selfRepair.history).toEqual(failedReceipt.selfRepair.history);
    // Saved replay state is checked again after its asynchronous boundary.
    const altered = JSON.parse(frozen.judgeJson!); altered.selfRepair.history[0].result += " altered";
    await db.targetVariantAsset.update({ where: { id: frozen.id }, data: { judgeJson: JSON.stringify(altered) } });
    await expect(step()).rejects.toThrow("Native replay state changed");
    await db.targetVariantAsset.update({ where: { id: frozen.id }, data: { judgeJson: frozen.judgeJson } });
    await step();
    const candidate = await getRow(), receipt = JSON.parse(candidate.judgeJson!);
    expect(candidate).toMatchObject({ status: "GENERATED", attempts: 2, costCents: failed.costCents });
    expect(receipt).toMatchObject({ reviewState: "pending-board-review", selfRepair: { phase: "awaiting-review", cycle: 1, subjectV2Cycles: 1 } });
    expect(receipt.selfRepair.history).toEqual(failedReceipt.selfRepair.history);
    expect(receipt.selfRepair.sourceKeys).toEqual(failedReceipt.selfRepair.sourceKeys);
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: ledger.worldId } })).toEqual(ledger);
    expect(render).toHaveBeenCalledTimes(imageCalls); expect(diagnose).toHaveBeenCalledTimes(1);
    const evidence = { gameId, board, hide, sceneVersion: 13, receipt, placementContext: context, promptVersion: candidate.promptVersion };
    expect(await authoredLocalPatchRecoveryEvidenceMatches(db, evidence)).toBe(true);
    const bad = JSON.parse(candidate.judgeJson!); bad.authoredRecovery.sourcePngSha256 = "f".repeat(64);
    expect(await authoredLocalPatchRecoveryEvidenceMatches(db, { ...evidence, receipt: bad })).toBe(false);
    const identity = await db.asset.findUniqueOrThrow({ where: { id: "ast-sheet-" + gameId } });
    const binding = { gameId, sceneVersion: 13, hideId: hide.id, variantId: candidate.id, attempts: candidate.attempts,
      identityAssetId: identity.id, identitySha256: sha256Bytes(await c.storage.get(identity.storagePath)), assetId: candidate.assetId!,
      imageSha256: receipt.judgedSha256, geometrySha256: receipt.geometrySha256, judgeJson: candidate.judgeJson };
    expect(await allowedDualPublication(db, binding)).toBe(false);
    for (let tick = 0; tick < 8; tick++) {
      await reviewLocalPatchBoard(container, { gameId, sceneId: scene.id, deadlineAt: Date.now() + 270000 }, { fence: async () => {}, readBoardArt: readArt });
      await advanceContinuityInBackground(container, gameId, { deadlineAt: Date.now() + 270000 });
      await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS + 1);
      if (JSON.parse((await getRow()).judgeJson!).reviewState === "board-review-complete") break;
    }
    const reviewed = await getRow(), reviewedReceipt = JSON.parse(reviewed.judgeJson!);
    expect(reviewedReceipt.boardReview.dual.single).toBe(SINGLE_MEDIUM_VISUAL_REVIEW_VERSION);
    expect(await allowedDualPublication(db, { ...publicationBinding(gameId, reviewed), sceneVersion: 13 })).toBe(true);
    expect(provider.creates).toHaveLength(1);
    expect(provider.creates[0]!.reasoning).toMatchObject({ effort: "medium" });
    expect(provider.creates[0]!.prompt).toContain("HEAD_RETURN_EVIDENCE: ");
    expect(provider.creates[0]!.labels.at(-2)).toContain(hide.id + ":native-provider-raw 512x768");
    expect(provider.creates[0]!.labels.at(-1)).toContain(hide.id + ":native-shipping-crown 512x768");
    expect(render).toHaveBeenCalledTimes(imageCalls); expect(diagnose).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
}, 300000);

async function legacyKingdomHeadFixture(gameId: string, action: "redraw-with-new-placement" | "recompose-retained", explorer = true, normalOnly = false, wholeFigure = false, windowShift = 0, windowHideIndex = 0) {
  await newDetectiveWorld(gameId, 7, true, explorer, true);
  await ensureSingleMediumReviewPolicy(c, gameId, async () => {});
  const version = explorer ? 12 : 13, context = await resolveLocalPatchBoardsForGame(db, gameId, version), board = context.boards.find(b => b.board === (wholeFigure ? 'cloudcity' : "dragoncave"))!, hide = board.hides[wholeFigure ? windowHideIndex : 2]!;
  const parent = expectedAuthoredLocalPatchReturn(board, hide, version, context);
  if (explorer) expect(parent).toBeNull(); else expect(parent?.source).toMatchObject({ width: 3344, height: 1882 });
  const decision: SelfRepairDecision = { cause: "composition-clipping", action,
    explanation: "Synthetic complete child in a changed legacy return; the head check must see this exact paid painting.",
    sourceKey: `${hide.id}:${hide.pose}:render:1`, returnWindow: { left: 206, top: 155, width: 210, height: 481 },
    protectedCore: { left: 224, top: 173, width: 174, height: 445 }, faceRect: { left: 250, top: 183, width: 76, height: 88 } };
  if (parent) {
    decision.returnWindow = parent.local;
    decision.protectedCore = { left: parent.child.left + 20, top: parent.child.top + 20, width: parent.child.width - 40, height: parent.child.height - 40 };
    decision.faceRect = { left: decision.protectedCore.left + 10, top: decision.protectedCore.top + 10, width: 40, height: 40 };
  }
  if (wholeFigure && windowHideIndex === 0) {
    decision.returnWindow = KINGDOM_FIGURE_RETURNS[0]!.baselineReturned;
    decision.protectedCore = { left: 92, top: 230, width: 232, height: 304 };
    decision.faceRect = { left: 160, top: 236, width: 80, height: 76 };
  }
  const render = vi.fn<LocalPatchHideDeps["render"]>(async input => {
    if (wholeFigure) {
      const head = await sharp({ create: { width: 140, height: 170, channels: 4, background: '#88663d' } }).png().toBuffer();
      const body = await sharp({ create: { width: 148, height: 362, channels: 4, background: windowHideIndex===1&&input.requestKey.endsWith(':render:3')?'#914c93':'#294c93' } }).png().toBuffer();
      let png=await sharp(input.stylePng).composite([{ input: head, left: 154, top: 184 }, { input: body, left: 154, top: 222 }]).png().toBuffer();
      if(windowShift&&input.requestKey.includes(':self-repair:')){const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true}),moved=Buffer.from(data);
        for(let y=windowShift;y<768;y++)data.copy(moved,y*512*4,(y-windowShift)*512*4,(y-windowShift+1)*512*4);
        png=await sharp(moved,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();}
      return paintedOk(png,
        bill('synthetic-whole-figure-' + gameId + '-' + input.requestKey, 50000));
    }
    const figure = await sharp({ create: { width: parent ? Math.min(120, decision.protectedCore.width - 20) : 120, height: parent ? Math.min(250, decision.protectedCore.height - 20) : 250, channels: 4,
      background: input.requestKey.includes(":self-repair:") ? input.requestKey.endsWith(":2") ? "#88663d" : "#916944"
        : input.requestKey.endsWith(":render:2") ? "#913857" : "#294c93" } }).png().toBuffer();
    return paintedOk(await sharp(input.stylePng).composite([{ input: figure, left: parent ? decision.protectedCore.left + 10 : 246, top: parent ? decision.protectedCore.top + 10 : 195 }]).png().toBuffer(), bill("legacy-head-" + gameId + "-" + input.requestKey, 50000));
  });
  let diagnosisReplies = 0;
  const diagnose = vi.fn<NonNullable<SelfRepairDeps["diagnose"]>>(async () => ({ verdict: null, wireFault: null, costUnknown: false,
    model: "gpt-5.6-sol", finishReason: "stop", raw: JSON.stringify(decision), requestId: "legacy-head-diagnosis-" + gameId + "-" + ++diagnosisReplies,
    usage: { prompt_tokens: 2000, completion_tokens: 200 } }));
  const deps: SelfRepairDeps = { readBoardArt: readArt, renderPolicySha256: localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY), render, diagnose,
    judge: async () => { throw Error("No duplicate synchronous judge"); }, fence: async () => {} };
  const row = () => db.targetVariantAsset.findFirstOrThrow({ where: { variant: "A", targetInstance: { gameScene: { gameId }, targetId: hide.targetId } } });
  for (let i = 0; i < 2; i++) {
    expect((await runLocalPatchHide(c, deps, { gameId, board, hide })).state).toBe("generated");
    const current = await row();
    await db.targetVariantAsset.update({ where: { id: current.id }, data: { status: "FAILED", lastError: "quality-retry: synthetic child placement" } });
  }
  const scene = await db.gameScene.findFirstOrThrow({ where: { gameId, sceneSlug: board.board } });
  if(normalOnly)await db.targetVariantAsset.update({where:{id:(await row()).id},data:{status:'GENERATED',lastError:null}});
  for (let i = 0; !normalOnly && i < 6; i++) {
    await runLocalPatchSelfRepair(c, { gameId, sceneId: scene.id, board, hide }, deps);
    const current = await row(), state = JSON.parse(current.judgeJson!).selfRepair;
    if (current.status === "GENERATED" || state?.phase === "rejected") break;
  }
  const candidate = await row(), receipt = JSON.parse(candidate.judgeJson!);
  expect(candidate.status, JSON.stringify(receipt.selfRepair)).toBe("GENERATED");
  expect(receipt.compositionVersion).toBe(normalOnly ? parent ? AUTHORED_PATCH_COMPOSITION_VERSION : LOCAL_PATCH_COMPOSITION_VERSION : parent ? AUTHORED_RECOVERY_COMPOSITION_VERSION : "autonomous-paid-join/v1");
  const asset = await db.asset.findUniqueOrThrow({ where: { id: candidate.assetId! } });
  const identity = await db.asset.findUniqueOrThrow({ where: { id: "ast-sheet-" + gameId } });
  const shipping = await c.storage.get(asset.storagePath), identitySha256 = sha256Bytes(await c.storage.get(identity.storagePath));
  return { gameId, version, board, hide, scene, deps, render, diagnose, row, candidate, receipt, shipping, identitySha256, decision };
}

it.each([{shift:0,label:'unshifted',refuseHead:false},{shift:2,label:'registered',refuseHead:false},{shift:0,label:'reported-head-loss',refuseHead:true}])('retained-source-window/v1: $label preserves all27 rows and every full bill, requires a new ordinary MEDIUM and reproduces publication',async({shift,label,refuseHead})=>{
  vi.useFakeTimers({toFake:['Date']});
  try{
    const f=await legacyKingdomHeadFixture('retained-window-native-'+label,'redraw-with-new-placement',false,false,true,shift),imageCalls=f.render.mock.calls.length;
    const exactRow=()=>db.targetVariantAsset.findUniqueOrThrow({where:{id:f.candidate.id}});
    const payment=await db.order.findUniqueOrThrow({where:{id:'order-'+f.gameId}});
    await db.game.update({where:{id:f.gameId},data:{paidAt:payment.paidAt}});
    const placement=await resolveLocalPatchBoardsForGame(db,f.gameId,13);
    for(const board of placement.boards)for(const hide of board.hides){
      if(hide.id===f.hide.id)continue;
      const scene=await db.gameScene.findFirstOrThrow({where:{gameId:f.gameId,sceneSlug:board.board}}),target=sceneBySlug(board.board,13).targets.find(t=>t.id===hide.targetId)!;
      const instance=await db.targetInstance.create({data:{id:'rsw-tgt-'+f.gameId+'-'+hide.id,gameSceneId:scene.id,targetId:target.id,targetType:target.targetType,
        spriteKind:'image',slotAId:target.slots[0].id,slotBId:target.slots[1].id}});
      await db.targetVariantAsset.create({data:{id:'rsw-tva-'+f.gameId+'-'+hide.id,targetInstanceId:instance.id,variant:'A',slotId:target.slots[0].id,
        status:'PENDING',provider:'local-patch',attempts:0}});
    }
    await db.targetVariantAsset.update({where:{id:f.candidate.id},data:{status:'FAILED',lastError:'quality-retry: synthetic whole head lost at old return'}});
    const budget=boardWizardBudgetOf(c),worldId=boardWizardWorldId(f.gameId);
    if(!shift){
      await budget.reserve(worldId,{requestKey:'synthetic-rsw-old-unknown',scope:'judge',operationFingerprint:'e'.repeat(64),reserveMicroUsd:202060});
      await budget.markUnknown(worldId,'synthetic-rsw-old-unknown','Synthetic full unresolved original bill');
      await db.generationJob.update({where:{id:'job_'+f.gameId},data:{status:'FAILED',currentStep:'local-patch:recovery-exhausted'}});
      const game=await db.game.findUniqueOrThrow({where:{id:f.gameId}}),plan=await planQaCompletionCapacity(c,f.gameId);
      await authorizeQaCompletionCapacity(c,{gameId:f.gameId,operatorId:game.ownerId!,expectedPlanSha256:plan.planSha256,ownerAuthorizationSha256:'b'.repeat(64)});
    }
    const before=await exactRow(),oldLedger=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}});
    if(label==='unshifted'){
      await db.order.update({where:{id:payment.id},data:{paymentStatus:'REFUNDED'}});
      expect(await restoreRetainedWindow(c,f.gameId,f.hide.id,readArt)).toBe(false);
      await db.order.update({where:{id:payment.id},data:{paymentStatus:payment.paymentStatus}});
      const keys=JSON.parse(oldLedger.snapshotJson).requests.filter((r:{scope:string;requestKey:string})=>r.scope==='image'&&r.requestKey.startsWith(f.hide.id+':'))
        .map((r:{requestKey:string})=>retainedPurchaseKey(worldId,r.requestKey));
      const originals=await db.fileBlob.findMany({where:{key:{in:keys}}});expect(originals.length).toBeGreaterThan(1);
      await db.fileBlob.deleteMany({where:{key:{in:keys}}});
      expect(await restoreRetainedWindow(c,f.gameId,f.hide.id,readArt)).toBe(false);
      expect(await exactRow()).toEqual(before);expect(await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).toEqual(oldLedger);
      await db.fileBlob.createMany({data:originals});
    }
    const siblings=await db.targetVariantAsset.findMany({where:{id:{not:before.id},targetInstance:{gameScene:{gameId:f.gameId}}},orderBy:{id:'asc'}});
    const provider=controlledSol(false,false,undefined,true),retrieve=provider.fake.retrieve.bind(provider.fake);
    provider.fake.retrieve=async id=>{const response=await retrieve(id);if(response.status!=='completed')return response;
      const answer=JSON.parse(response.reading.raw!);answer.head.rawHead={left:154,top:184+shift,width:140,height:170};answer.head.shippingHead={left:154,top:184,width:140,height:170};
      if(refuseHead)answer.head.shippingCrown='fail';
      return{...response,reading:{...response.reading,raw:JSON.stringify(answer)}};};
    const container={...c,backgroundReview:provider.fake,visualReview:{request:async()=>{throw Error('No synchronous review in the retained window test');}}} as Container;
    const refusal:string[]=[];
    const explicitSource=label==='unshifted'?`${f.hide.id}:${f.hide.pose}:render:1`:undefined;
    if(explicitSource)expect(await restoreRetainedWindow(container,f.gameId,f.hide.id,readArt,undefined,'another-hide:standing:render:1')).toBe(false);
    expect(await restoreRetainedWindow(container,f.gameId,f.hide.id,readArt,r=>refusal.push(r),explicitSource),refusal.join(',')).toBe(true);
    const candidate=await exactRow(),j=JSON.parse(candidate.judgeJson!),marker=j.retainedWindow;
    expect(marker).toMatchObject({version:RETAINED_WINDOW_VERSION,sampleX:0,sampleY:shift,attempts:before.attempts});
    if(explicitSource)expect(marker.sourceRequestKey).toBe(explicitSource);
    expect(candidate).toMatchObject({status:'GENERATED',costCents:before.costCents,attempts:before.attempts});
    expect(j.reviewState).toBe('pending-board-review');expect(j.boardReview).toBeUndefined();expect(j.selfRepair).toEqual(JSON.parse(before.judgeJson!).selfRepair);
    expect(provider.creates).toHaveLength(0);
    const ledger=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}});expect(ledger.snapshotJson).toBe(oldLedger.snapshotJson);expect(ledger.revision).toBe(oldLedger.revision+1);
    expect(await db.targetVariantAsset.findMany({where:{id:{not:before.id},targetInstance:{gameScene:{gameId:f.gameId}}},orderBy:{id:'asc'}})).toEqual(siblings);
    expect(await restoreRetainedWindow(container,f.gameId,f.hide.id,readArt)).toBe(false);
    const binding={gameId:f.gameId,sceneVersion:13,hideId:f.hide.id,variantId:candidate.id,attempts:candidate.attempts,
      identityAssetId:'ast-sheet-'+f.gameId,identitySha256:f.identitySha256,assetId:candidate.assetId!,imageSha256:j.judgedSha256,
      geometrySha256:j.geometrySha256,judgeJson:candidate.judgeJson};
    const refusalStages:string[]=[];
    expect(await retainedWindowEvidenceMatches(db,binding,readArt,r=>refusalStages.push(r)),refusalStages.join(',')).toBe(true);expect(await allowedDualPublication(db,binding)).toBe(false);
    const evidence=await singleReviewHeadEvidence(db,{gameId:f.gameId,hide:f.hide,attempt:candidate.attempts,receipt:j,shipping:await c.storage.get((await db.asset.findUniqueOrThrow({where:{id:candidate.assetId!}})).storagePath),geometrySha256:j.geometrySha256,identitySha256:f.identitySha256});
    expect(evidence.evidence.sourceBindingVersion).toBe(RETAINED_WINDOW_VERSION);expect(evidence.evidence.compoundHeadMask).toMatchObject({sampleX:0,sampleY:shift});
    if(!shift){
      const held=await reviewLocalPatchBoard(container,{gameId:f.gameId,sceneId:f.scene.id,deadlineAt:Date.now()+270000},
        {fence:async()=>{},readBoardArt:readArt},{onlyHideId:f.hide.id});
      expect(held.reason).toContain('world ledger is held');expect(provider.creates).toHaveLength(0);
      // Synthetic pre-existing human continuation, not a released reserve or a
      // zero-charge inference. The live service cannot mint this approval.
      const game=await db.game.findUniqueOrThrow({where:{id:f.gameId}}),unknown=await budget.readRequest(worldId,'synthetic-rsw-old-unknown');
      await boardWizardBudgetOf(c,1,{authorizeUnknownContinuation:async a=>a.requestKey==='synthetic-rsw-old-unknown'&&a.operatorId===game.ownerId})
        .authorizeUnknownContinuation(worldId,{approvalId:'synthetic-existing-rsw-human-continuation',requestKey:unknown!.requestKey,scope:unknown!.scope,
          operationFingerprint:unknown!.operationFingerprint,reserveMicroUsd:unknown!.reserveMicroUsd,unknownReasons:unknown!.unknownReasons,
          operatorId:game.ownerId!,authorizationSha256:'d'.repeat(64),authorizedAt:new Date().toISOString()});
      expect(await budget.readRequest(worldId,'synthetic-rsw-old-unknown')).toEqual(unknown);
    }
    const reviewReasons:string[]=[];
    for(let turn=0;turn<7;turn++){
      const outcome=await reviewLocalPatchBoard(container,{gameId:f.gameId,sceneId:f.scene.id,deadlineAt:Date.now()+270000},{fence:async()=>{},readBoardArt:readArt},{onlyHideId:f.hide.id});
      reviewReasons.push(outcome.state+':'+outcome.reason);
      await advanceContinuityInBackground(container,f.gameId,{deadlineAt:Date.now()+270000});await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS+1);
      if(JSON.parse((await exactRow()).judgeJson!).reviewState==='board-review-complete')break;
    }
    const accepted=await exactRow(),final=JSON.parse(accepted.judgeJson!);
    if(refuseHead){
      expect(accepted.status).toBe('FAILED');expect(final.verdict?.verdict).toBe('fail');expect(provider.creates).toHaveLength(1);
      expect(await allowedDualPublication(db,{...publicationBinding(f.gameId,accepted),sceneVersion:13})).toBe(false);
      expect(await restoreRetainedWindow(container,f.gameId,f.hide.id,readArt)).toBe(false);
      expect(f.render).toHaveBeenCalledTimes(imageCalls);expect(fetch).not.toHaveBeenCalled();return;
    }
    expect(accepted.status,accepted.lastError??'').toBe('GENERATED');expect(final.verdict?.verdict,JSON.stringify({reviewReasons,creates:provider.creates.length,reviewState:final.reviewState})).toBe('pass');expect(provider.creates).toHaveLength(1);
    expect(provider.creates[0]!.prompt).toContain('Native integer mapping');expect(provider.creates[0]!.prompt).toContain('blur or a depth/style mismatch');
    expect(final.boardReview.dual.quality.policy.maxOutputTokens).toBe(6000);
    if(!shift)expect(await budget.readRequest(worldId,'synthetic-rsw-old-unknown')).toMatchObject({state:'unknown',reserveMicroUsd:202060});
    expect(await allowedDualPublication(db,{...publicationBinding(f.gameId,accepted),sceneVersion:13})).toBe(true);
    const audit=await db.auditLog.findFirstOrThrow({where:{entityId:f.gameId,action:RETAINED_WINDOW_ACTION}}),saved=JSON.parse(audit.metaJson!);
    expect(saved.previousRow.judgeJson).toBe(before.judgeJson);expect(saved.providerCalls).toBe(0);expect(saved.approvalTransferred).toBe(false);
    const altered=JSON.parse(accepted.judgeJson!);altered.retainedWindow.sampleY=shift?0:1;
    expect(await retainedWindowEvidenceMatches(db,{...publicationBinding(f.gameId,accepted),sceneVersion:13,judgeJson:JSON.stringify(altered)},readArt)).toBe(false);
    const noMarker={...final};delete noMarker.retainedWindow;
    expect(await allowedDualPublication(db,{...publicationBinding(f.gameId,accepted),sceneVersion:13,judgeJson:JSON.stringify(noMarker)})).toBe(false);
    const game=await db.game.findUniqueOrThrow({where:{id:f.gameId}}),closedLedger=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}});
    expect(await deleteLocalPatchGame(container,f.gameId,{type:'USER',id:game.ownerId!},game.ownerId!)).toBe(true);
    expect((await db.auditLog.findUniqueOrThrow({where:{id:audit.id}})).metaJson).toBeNull();
    expect((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson).toBe(closedLedger.snapshotJson);
    expect(f.render).toHaveBeenCalledTimes(imageCalls);expect(fetch).not.toHaveBeenCalled();
  }finally{vi.useRealTimers();}
},300000);

it.each(['free-candidate', 'free-candidate-no-unknown', 'orphan-reservation', 'deadline-cancelled', 'provider-failed'] as const)('source-figure-return/v1: %s preserves the old paid recipe, whole body, neighbors, questions and full reserves', async mode => {
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    const f = await legacyKingdomHeadFixture('source-figure-synthetic-' + mode, 'redraw-with-new-placement', false, false, true);
    const game = await db.game.findUniqueOrThrow({ where: { id: f.gameId } });
    const worldId = boardWizardWorldId(f.gameId), budget = boardWizardBudgetOf(c);
    if (mode === 'free-candidate') {
      // This pre-existing UNKNOWN is explicitly retained by the subsequent
      // original completion grant; a newly grown UNKNOWN would stop dispatch.
      await budget.reserve(worldId, { requestKey: 'synthetic-figure-unknown', scope: 'judge', operationFingerprint: 'a'.repeat(64), reserveMicroUsd: 250000 });
      await budget.markUnknown(worldId, 'synthetic-figure-unknown', 'Synthetic full historical unknown');
    }
    await db.generationJob.update({ where: { id: 'job_' + f.gameId }, data: { status: 'FAILED', currentStep: 'local-patch:recovery-exhausted', lastError: 'Synthetic unasked original figure' } });
    const plan = await planQaCompletionCapacity(c, f.gameId);
    await authorizeQaCompletionCapacity(c, { gameId: f.gameId, operatorId: game.ownerId!, expectedPlanSha256: plan.planSha256, ownerAuthorizationSha256: 'b'.repeat(64) });
    const provider = controlledSol(false, false, undefined, true), originalRetrieve = provider.fake.retrieve.bind(provider.fake);
    const transportRecovery = mode === 'deadline-cancelled' || mode === 'provider-failed';
    let cancelled = false, failedCompositionChecked = false;
    provider.fake.cancel = async () => { cancelled = true; };
    provider.fake.retrieve = async id => {
      if (transportRecovery && id === 'resp_detective_1') {
        if (mode === 'deadline-cancelled' && !cancelled) return { status: 'in_progress' };
        const status = mode === 'deadline-cancelled' ? 'cancelled' : 'failed';
        return { status, reading: { responseId: id, raw: null, usage: { input_tokens: 2000, output_tokens: 150 }, model: 'gpt-6.1-sol',
          finishReason: status, serviceTier: 'flex', ...(status === 'failed' ? { providerError: { code: 'server_is_overloaded', message: 'Synthetic settled provider failure without answer' } } : {}) } };
      }
      const answer = await originalRetrieve(id);
      if (answer.status !== 'completed') return answer;
      const raw = JSON.parse(answer.reading.raw!);
      raw.head.rawHead = raw.head.shippingHead = { left: 154, top: 184, width: 140, height: 170 };
      return { ...answer, reading: { ...answer.reading, raw: JSON.stringify(raw) } };
    };
    const container = { ...c, backgroundReview: provider.fake, visualReview: { request: async () => { throw Error('No synchronous figure opinion'); } } } as Container;
    const before = await f.row(), beforeJ = JSON.parse(before.judgeJson!);
    const oldBytes = await c.storage.get((await db.asset.findUniqueOrThrow({ where: { id: before.assetId! } })).storagePath);
    const rawBefore = await readSettledTargetRaw(db, f.gameId, beforeJ.authoredRecovery.source.requestKey);
    if (mode === 'orphan-reservation') {
      const prepared = await (await import('../local-patch-board-review')).prepareLocalPatchBoardReview(container, { gameId: f.gameId, sceneId: f.scene.id }, { readBoardArt: readArt }, { onlyHideId: f.hide.id, playerReview: true });
      expect(prepared.ready).toBe(true); if (!prepared.ready) throw Error('Synthetic figure preparation failed');
      const question = await dualReviewModule.prospectiveSingleVisualReviewQuestion(container, prepared);
      await budget.reserve(worldId, { requestKey: question.requestKey, scope: 'judge', operationFingerprint: question.fingerprint, reserveMicroUsd: question.reserveMicroUsd });
      await budget.settle(worldId, question.requestKey, bill('synthetic-orphan-figure-question-' + f.gameId, 1000));
      const ledger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } });
      expect(await correctSourceFigureReturn(container, f.gameId, [before], async () => {}, readArt)).toBe(false);
      expect(await f.row()).toEqual(before);
      expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } })).toEqual(ledger);
      expect(provider.creates).toHaveLength(0); expect(fetch).not.toHaveBeenCalled(); return;
    }
    // A historical UNKNOWN is not free budget: retain its full reserve.
    const ledger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } });
    const deniedRender = vi.fn(async () => { throw Error('No new painting in free figure turn'); });
    await runLocalPatchWorldSlice(container, { ...f.deps, render: deniedRender }, f.gameId,
      { hardDeadlineAt: Date.now() + 270000, workMode: REVIEW_EXISTING_WORK_MODE });
    const candidate = await f.row(), j = JSON.parse(candidate.judgeJson!), marker = j.sourceFigureReturn;
    expect(marker).toMatchObject({ version: SOURCE_FIGURE_RETURN_VERSION, attempts: before.attempts,
      sourceRequestKey: beforeJ.authoredRecovery.source.requestKey, baselineAssetId: before.assetId });
    expect(candidate).toMatchObject({ status: 'GENERATED', attempts: before.attempts, costCents: before.costCents });
    expect(j.authoredRecovery).toEqual(beforeJ.authoredRecovery); expect(j.selfRepair).toEqual(beforeJ.selfRepair);
    expect(j.recoveryComposition).toEqual(beforeJ.recoveryComposition); expect(j.boardReview).toBeUndefined();
    expect(j.reviewState).toBe('pending-board-review'); expect(provider.creates, 'one free figure correction must yield before a question').toHaveLength(0); expect(deniedRender).not.toHaveBeenCalled();
    expect(JSON.parse(candidate.rejectedAssetIdsJson!)).toContain(before.assetId);
    const afterLedger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } });
    expect(afterLedger.snapshotJson, 'one free figure correction must yield before a question').toBe(ledger.snapshotJson); expect(afterLedger.revision).toBe(ledger.revision + 1);
    const savedAudit = await db.auditLog.findFirstOrThrow({ where: { entityId: f.gameId, action: SOURCE_FIGURE_ACTION } });
    expect(JSON.parse(savedAudit.metaJson!)).toMatchObject({ previousJudgeJson: before.judgeJson, providerCalls: 0, attemptsPreserved: true, cyclesPreserved: true, approvalTransferred: false });
    const sameRaw = await readSettledTargetRaw(db, f.gameId, marker.sourceRequestKey);
    expect(sameRaw.kept.bytes.equals(rawBefore.kept.bytes)).toBe(true);
    expect(sameRaw.normalized.equals(rawBefore.normalized)).toBe(true);
    const shipped = await c.storage.get((await db.asset.findUniqueOrThrow({ where: { id: candidate.assetId! } })).storagePath);
    const pixels = async (png: Buffer, rect: { left: number; top: number; width: number; height: number }) => sharp(png).extract(rect).ensureAlpha().raw().toBuffer();
    for (const rect of [{ left: 154, top: 184, width: 140, height: 170 }, KINGDOM_FIGURE_RETURNS[0]!.replacedSourceLowerBody])
      expect((await pixels(shipped, rect)).equals(await pixels(rawBefore.normalized, rect))).toBe(true);
    expect(oldBytes.equals(await c.storage.get((await db.asset.findUniqueOrThrow({ where: { id: before.assetId! } })).storagePath))).toBe(true);
    const hit = JSON.parse(candidate.hitRectJson!), a = KINGDOM_FIGURE_RETURNS[0]!;
    expect(hit.y * a.source.height - a.crop.top).toBeLessThanOrEqual(184);
    expect((hit.y + hit.h) * a.source.height - a.crop.top).toBeGreaterThanOrEqual(584);
    const binding = { gameId: f.gameId, hideId: f.hide.id, variantId: candidate.id, assetId: candidate.assetId!, sceneVersion: 13,
      identityAssetId: 'ast-sheet-' + f.gameId, identitySha256: f.identitySha256, attempts: candidate.attempts,
      imageSha256: j.judgedSha256, geometrySha256: j.geometrySha256, judgeJson: candidate.judgeJson };
    expect(await sourceFigurePublicationMatches(db, binding)).toBe(true);
    expect(await allowedDualPublication(db, binding)).toBe(false); // Fresh ordinary review still owed.
    expect(await correctSourceFigureReturn(container, f.gameId, [candidate], async () => {}, readArt)).toBe(false);
    if (mode === 'free-candidate') {
      const held = await reviewLocalPatchBoard(container, { gameId: f.gameId, sceneId: f.scene.id, deadlineAt: Date.now() + 270000 }, { fence: async () => {}, readBoardArt: readArt });
      expect(held.reason).toContain('world ledger is held'); expect(provider.creates).toHaveLength(0);
      // Only this synthetic provider now resolves its UNKNOWN with an explicit
      // nonzero bill. No live reserve is cleared or inferred from missing text.
      await budget.settle(worldId, 'synthetic-figure-unknown', bill('synthetic-confirmed-figure-unknown-' + f.gameId, 25000));
    }
    for (let tick = 0; tick < (transportRecovery ? 20 : 10); tick++) {
      if (transportRecovery) {
        const failed = await f.row();
        if (failed.status === 'FAILED') {
          // Composition provenance is independent of an unanswered assessment's
          // FAILED status. This does NOT publish it or waive its fresh review.
          expect(await sourceFigurePublicationMatches(db, { ...publicationBinding(f.gameId, failed), sceneVersion: 13 })).toBe(true);
          expect(await allowedDualPublication(db, { ...publicationBinding(f.gameId, failed), sceneVersion: 13 })).toBe(false);
          expect(failed.assetId).toBe(candidate.assetId);expect(failed.attempts).toBe(candidate.attempts);expect(failed.costCents).toBe(candidate.costCents);
          failedCompositionChecked = true;
          await (await import('../single-transport-continuation')).recordSingleTransportFaults(container, f.gameId, [failed], async () => {});
        }
      }
      const ordinary = await reviewLocalPatchBoard(container, { gameId: f.gameId, sceneId: f.scene.id, deadlineAt: Date.now() + 270000 }, { fence: async () => {}, readBoardArt: readArt });
      await advanceContinuityInBackground(container, f.gameId, { deadlineAt: Date.now() + 270000 });
      if (!provider.creates.length) throw Error('Synthetic ordinary figure review did not dispatch: ' + ordinary.reason);
      await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS + 1);
      const checkpoint = await f.row();
      if (JSON.parse(checkpoint.judgeJson!).reviewState === 'board-review-complete' && (!transportRecovery || checkpoint.status === 'GENERATED')) break;
    }
    const accepted = await f.row(), final = JSON.parse(accepted.judgeJson!);
    expect(final.verdict, JSON.stringify({ status: accepted.status, lastError: accepted.lastError, reviewState: final.reviewState,
      wireFault: final.wireFault, raw: final.boardReview?.dual?.quality.raw, creates: provider.creates.length })).not.toBeNull();
    expect(accepted.status).toBe('GENERATED'); expect(final.verdict.verdict).toBe('pass');
    expect(final.boardReview.dual.quality.headEvidence.sourceBindingVersion).toBe(SOURCE_FIGURE_RETURN_VERSION);
    expect(provider.creates).toHaveLength(transportRecovery ? 2 : 1); expect(provider.creates[0]!.reasoning).toMatchObject({ effort: 'medium' });
    if (transportRecovery) {
      expect(failedCompositionChecked).toBe(true);expect(provider.creates.map(q=>q.tier)).toEqual(['flex','default']);
      expect((await import('../../../domain/generation/single-transport-continuation')).singleTransportContinuation(final)).toBeNull();
      expect(final.sourceFigureReturn).toEqual(marker);
      const requests = JSON.parse((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson).requests;
      expect(requests.filter((r:{scope:string;requestKey:string})=>r.scope==='image'&&r.requestKey.startsWith(f.hide.id+':'))).toHaveLength(3);
    }
    expect(provider.creates[0]!.prompt).toContain('The bounding head-inspection rectangle is NOT an editable rectangle');
    expect(provider.creates[0]!.prompt).toContain('Neither extra sharpness nor blur is an automatic pass');
    expect(await allowedDualPublication(db, { ...publicationBinding(f.gameId, accepted), sceneVersion: 13 })).toBe(true);
    // A fully self-consistent forged asset, marker, row and SYSTEM audit still
    // cannot substitute pixels that the authenticated paid recipe never made.
    const replacement = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#ff00ff' } }).png().toBuffer();
    const forgedPng = await sharp(shipped).composite([{ input: replacement, left: 200, top: 240 }]).png().toBuffer();
    const forgedMarker = { ...marker, candidateSha256: sha256Bytes(forgedPng) };
    forgedMarker.auditId = sourceFigureAuditId(forgedMarker);
    const forgedId = 'ast_fgr_' + sourceFigureHash([f.gameId, f.hide.id, forgedMarker.candidateSha256]).slice(0, 24), forgedKey = `game/${forgedId}.png`;
    await db.asset.create({ data: { id: forgedId, ownerId: game.ownerId, type: 'TARGET_SPRITE', visibility: 'GAME', status: 'READY', provider: 'local-patch',
      providerRequestId: f.gameId, storagePath: forgedKey, mimeType: 'image/png', width: 512, height: 768, bytes: forgedPng.length } });
    await c.storage.put(forgedKey, forgedPng, 'image/png');
    await db.auditLog.create({ data: { id: forgedMarker.auditId, actorType: 'SYSTEM', action: SOURCE_FIGURE_ACTION, entityType: 'Game', entityId: f.gameId,
      metaJson: JSON.stringify({ ...JSON.parse(savedAudit.metaJson!), marker: forgedMarker, assetId: forgedId }) } });
    const forgedReceipt = { ...final, sourceFigureReturn: forgedMarker, judgedSha256: forgedMarker.candidateSha256 };
    await db.targetVariantAsset.update({ where: { id: accepted.id }, data: { assetId: forgedId, judgeJson: JSON.stringify(forgedReceipt) } });
    expect(await sourceFigurePublicationMatches(db, { ...binding, assetId: forgedId, judgeJson: JSON.stringify(forgedReceipt) })).toBe(false);
    await db.targetVariantAsset.update({ where: { id: accepted.id }, data: { assetId: accepted.assetId, judgeJson: accepted.judgeJson } });
    const corrupt = JSON.parse(accepted.judgeJson!); corrupt.sourceFigureReturn.geometrySha256 = beforeJ.geometrySha256;
    expect(await allowedDualPublication(db, { ...publicationBinding(f.gameId, accepted), sceneVersion: 13, judgeJson: JSON.stringify(corrupt) })).toBe(false);
    await db.order.update({ where: { id: 'order-' + f.gameId }, data: { paymentStatus: 'REFUNDED', refundedAt: new Date() } });
    expect(await sourceFigurePublicationMatches(db, { ...publicationBinding(f.gameId, accepted), sceneVersion: 13 })).toBe(false);
    expect(f.diagnose).toHaveBeenCalledTimes(1); expect(f.render).toHaveBeenCalledTimes(3); expect(deniedRender).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    const financial = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } });
    expect(await deleteLocalPatchGame(container, f.gameId, { type: 'USER', id: game.ownerId! }, game.ownerId!)).toBe(true);
    for (const id of [before.assetId!, accepted.assetId!]) {
      const a = await db.asset.findUniqueOrThrow({ where: { id } }); expect(a.status).toBe('DELETED');
      expect(await db.fileBlob.findUnique({ where: { key: a.storagePath } })).toBeNull();
    }
    expect((await db.auditLog.findUniqueOrThrow({ where: { id: marker.auditId } })).metaJson).toBeNull();
    expect((await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } })).snapshotJson).toBe(financial.snapshotJson);
  } finally { vi.useRealTimers(); }
}, 600000);

it.each(["redraw-with-new-placement", "recompose-retained"] as const)("binds the MEDIUM head check to the actual paid legacy Kingdom repair; action=%s", async action => {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
  const f = await legacyKingdomHeadFixture("legacy-kingdom-head-synthetic-" + action, action);
  const expectedKey = action === "recompose-retained" ? f.decision.sourceKey : `${f.hide.id}:${f.hide.pose}:self-repair:1`;
  const paid = await readSettledTargetRaw(db, f.gameId, expectedKey);
  const head = await singleReviewHeadEvidence(db, { gameId: f.gameId, hide: f.hide, attempt: f.candidate.attempts, receipt: f.receipt,
    shipping: f.shipping, geometrySha256: f.receipt.geometrySha256, identitySha256: f.identitySha256 });
  expect(head.evidence.sourceRequestKey).toBe(expectedKey);
  expect(head.evidence.returned).toEqual(f.decision.returnWindow);
  expect(head.raw.equals(paid.normalized)).toBe(true);
  expect(head.evidence).toMatchObject({ sourceBindingVersion: "legacy-paid-join-head/v1", normalizedRawSha256: sha256Bytes(paid.normalized) });
  expect(await singleReviewHeadEvidenceMatches(db, { gameId: f.gameId, hideId: f.hide.id, imageSha256: f.receipt.judgedSha256,
    attempts: f.candidate.attempts, sceneVersion: 12, geometrySha256: f.receipt.geometrySha256, identitySha256: f.identitySha256,
    judgeJson: f.candidate.judgeJson }, head.evidence)).toBe(true);
  const provider = controlledSol(false, false, undefined, true, false, 12), container = { ...c, backgroundReview: provider.fake,
    visualReview: { request: async () => { throw Error("No duplicate synchronous judge"); } } } as Container;
  for (let tick = 0; tick < 8; tick++) {
    await reviewLocalPatchBoard(container, { gameId: f.gameId, sceneId: f.scene.id, deadlineAt: Date.now() + 270000 }, { fence: async () => {}, readBoardArt: readArt });
    await advanceContinuityInBackground(container, f.gameId, { deadlineAt: Date.now() + 270000 });
    await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS + 1);
    if (JSON.parse((await f.row()).judgeJson!).reviewState === "board-review-complete") break;
  }
  const reviewed = await f.row(), binding = { ...publicationBinding(f.gameId, reviewed), sceneVersion: 12 };
  expect(await allowedDualPublication(db, binding)).toBe(true);
  const altered = JSON.parse(reviewed.judgeJson!); altered.recoveryComposition.returnWindow.top++;
  expect(await allowedDualPublication(db, { ...binding, judgeJson: JSON.stringify(altered) })).toBe(false);
  expect(provider.creates).toHaveLength(1); expect(provider.creates[0]!.reasoning).toMatchObject({ effort: "medium" });
  expect(f.render).toHaveBeenCalledTimes(action === "recompose-retained" ? 2 : 3);
  expect(f.diagnose).toHaveBeenCalledTimes(1); expect(fetch).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
}, 300000);

it("corrects only a proven legacy head-input mismatch on the same paid candidate, archives its old question and requires a new MEDIUM pass", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    const f = await legacyKingdomHeadFixture("legacy-head-free-recovery-synthetic", "redraw-with-new-placement");
    // Simulate the historical writer without altering paid RAWs, plans or costs.
    const historical = { ...f.receipt }; delete historical.headSourceVersion; delete historical.headPolicyVersion;
    await db.targetVariantAsset.update({ where: { id: f.candidate.id }, data: { judgeJson: JSON.stringify(historical) } });
    const oldHead = await singleReviewHeadEvidence(db, { gameId: f.gameId, hide: f.hide, attempt: f.candidate.attempts, receipt: historical,
      shipping: f.shipping, geometrySha256: historical.geometrySha256, identitySha256: f.identitySha256 });
    expect(oldHead.evidence.sourceRequestKey).toBe(`${f.hide.id}:${f.hide.pose}:render:2`);
    expect(oldHead.evidence.sourceBindingVersion).toBeUndefined();
    expect(await singleReviewHeadEvidenceMatches(db, { gameId: f.gameId, hideId: f.hide.id, imageSha256: historical.judgedSha256,
      attempts: 2, sceneVersion: 12, geometrySha256: historical.geometrySha256, identitySha256: f.identitySha256,
      judgeJson: JSON.stringify(historical) }, oldHead.evidence)).toBe(true);
    const provider = controlledSol(false, false, undefined, true, false, 12), retrieve = provider.fake.retrieve.bind(provider.fake);
    provider.fake.retrieve = async id => {
      const response = await retrieve(id);
      if (response.status === "completed" && provider.creates.length === 1) {
        const answer = JSON.parse(response.reading.raw!); answer.head.shippingHead.width += 20;
        return { ...response, reading: { ...response.reading, raw: JSON.stringify(answer) } };
      }
      return response;
    };
    const container = { ...c, backgroundReview: provider.fake,
      visualReview: { request: async () => { throw Error("No duplicate synchronous judge"); } } } as Container;
    const review = async () => { for (let tick = 0; tick < 8; tick++) {
      await reviewLocalPatchBoard(container, { gameId: f.gameId, sceneId: f.scene.id, deadlineAt: Date.now() + 270000 }, { fence: async () => {}, readBoardArt: readArt });
      await advanceContinuityInBackground(container, f.gameId, { deadlineAt: Date.now() + 270000 });
      await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS + 1);
      if (JSON.parse((await f.row()).judgeJson!).reviewState === "board-review-complete") break;
    } };
    await review();
    const failed = await f.row(), refused = JSON.parse(failed.judgeJson!);
    expect(failed.status).toBe("FAILED"); expect(refused.verdict.faults).not.toHaveLength(0);
    expect(refused.verdict.faults.every((fault: { where: string }) => fault.where.startsWith("HEAD_RETURN:"))).toBe(true);
    expect(await reconcileLegacyPaidJoinHead(container, f.gameId, [failed], async () => {})).toMatchObject({ changed: false });
    await db.generationJob.update({ where: { id: "job_" + f.gameId }, data: { status: "FAILED", currentStep: "local-patch:recovery-exhausted", lastError: "local-patch: synthetic original recovery hold" } });
    const game = await db.game.findUniqueOrThrow({ where: { id: f.gameId } }), plan = await planQaCompletionCapacity(container, f.gameId);
    await authorizeQaCompletionCapacity(container, { gameId: f.gameId, operatorId: game.ownerId!, expectedPlanSha256: plan.planSha256, ownerAuthorizationSha256: "a".repeat(64) });
    const worldId = boardWizardWorldId(f.gameId), budget = boardWizardBudgetOf(container);
    await db.order.update({ where: { id: "order-" + f.gameId }, data: { paymentStatus: "REFUNDED" } });
    expect(await reconcileLegacyPaidJoinHead(container, f.gameId, [failed], async () => {})).toMatchObject({ changed: false });
    await db.order.update({ where: { id: "order-" + f.gameId }, data: { paymentStatus: "PAID" } });
    await budget.reserve(worldId, { requestKey: "synthetic-new-unknown-after-grant", scope: "judge", operationFingerprint: "d".repeat(64), reserveMicroUsd: 100000 });
    await budget.markUnknown(worldId, "synthetic-new-unknown-after-grant", "Synthetic provider charge is unverified");
    expect(await reconcileLegacyPaidJoinHead(container, f.gameId, [failed], async () => {})).toMatchObject({ changed: false });
    expect((await budget.audit(worldId)).reservedMicroUsd).toBe(100000);
    // A separate verified synthetic settlement permits the existing authority again.
    await budget.settle(worldId, "synthetic-new-unknown-after-grant", bill("synthetic-later-confirmed-charge", 10000));
    const ledger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } });
    expect(await reconcileLegacyPaidJoinHead(container, f.gameId, [failed], async () => {})).toMatchObject({ changed: true });
    const corrected = await f.row(), receipt = JSON.parse(corrected.judgeJson!);
    expect(corrected).toMatchObject({ status: "GENERATED", assetId: failed.assetId, attempts: failed.attempts, costCents: failed.costCents });
    expect(receipt.selfRepair).toEqual(refused.selfRepair);
    expect(receipt.compositionSource).toBe(refused.compositionSource); expect(receipt.recoveryComposition).toEqual(refused.recoveryComposition);
    expect((await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } })).snapshotJson).toBe(ledger.snapshotJson);
    const archive = await db.auditLog.findFirstOrThrow({ where: { entityId: f.gameId, action: LEGACY_HEAD_RECOVERY_ACTION } });
    expect(JSON.parse(archive.metaJson!)).toMatchObject({ previousJudgeJson: failed.judgeJson, providerCalls: 0, requestsPreserved: true });
    expect(await allowedDualPublication(db, { ...publicationBinding(f.gameId, failed), judgeJson: corrected.judgeJson, sceneVersion: 12 })).toBe(false);
    expect(await reconcileLegacyPaidJoinHead(container, f.gameId, [corrected], async () => {})).toMatchObject({ changed: false });
    await review(); const reviewed = await f.row(), accepted = JSON.parse(reviewed.judgeJson!);
    expect(await allowedDualPublication(db, { ...publicationBinding(f.gameId, reviewed), sceneVersion: 12 })).toBe(true);
    expect(accepted.boardReview.dual.quality.headEvidence.sourceRequestKey).toBe(f.receipt.compositionSource);
    expect(accepted.boardReview.dual.quality.headEvidence.returned).toEqual(f.decision.returnWindow);
    expect(provider.creates).toHaveLength(2); expect(provider.creates.every(one => (one.reasoning as { effort: string }).effort === "medium")).toBe(true);
    expect(provider.creates[0]!.prompt).not.toBe(provider.creates[1]!.prompt);
    const after = JSON.parse((await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } })).snapshotJson), before = JSON.parse(ledger.snapshotJson);
    for (const request of before.requests) expect(after.requests.find((r: { requestKey: string }) => r.requestKey === request.requestKey)).toEqual(request);
    expect(after.requests).toHaveLength(before.requests.length + 1);
    expect(f.render).toHaveBeenCalledTimes(3); expect(f.diagnose).toHaveBeenCalledTimes(1); expect(fetch).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
}, 300000);

it.each([{level:'detectives',normalOnly:true},{level:'explorers',normalOnly:true},{level:'detectives',normalOnly:false},{level:'explorers',normalOnly:false}] as const)(
 're-reviews a paid head-only candidate under explicit visible-completeness semantics without image or diagnosis repurchase; level=$level normal=$normalOnly',async({level,normalOnly})=>{
 vi.useFakeTimers({toFake:['Date']});
 try{
  const f=await legacyKingdomHeadFixture('visible-head-policy-synthetic-'+level+'-'+normalOnly,'redraw-with-new-placement',level==='explorers',normalOnly);
  const historical={...f.receipt};delete historical.headPolicyVersion;
  await db.targetVariantAsset.update({where:{id:f.candidate.id},data:{judgeJson:JSON.stringify(historical)}});
  const provider=controlledSol(false,false,undefined,true,false,f.version),retrieve=provider.fake.retrieve.bind(provider.fake);
  provider.fake.retrieve=async id=>{
   const response=await retrieve(id);if(response.status!=='completed')return response;
   const question=provider.creates[provider.creates.length-1]!,p=JSON.parse(question.prompt.split('\n').find(s=>s.startsWith('HEAD_RETURN_EVIDENCE: '))!.slice('HEAD_RETURN_EVIDENCE: '.length));
   const answer=JSON.parse(response.reading.raw!),head={...answer.head.rawHead,top:p.returned.top+6};
   Object.assign(answer.head,{rawHead:head,shippingHead:head,rawCrown:p.version==='target-head-return/v1'?'fail':'pass',shippingCrown:p.version==='target-head-return/v1'?'fail':'pass',
    observation:'Synthetic complete crown in RAW and SHIPPING; six-pixel planning clearance alone caused the historical refusal.'});
   return{...response,reading:{...response.reading,raw:JSON.stringify(answer)}};
  };
  const container={...c,backgroundReview:provider.fake,visualReview:{request:async()=>{throw Error('No synchronous duplicate');}}} as Container;
  const review=async()=>{for(let tick=0;tick<8;tick++){
   await reviewLocalPatchBoard(container,{gameId:f.gameId,sceneId:f.scene.id,deadlineAt:Date.now()+270000},{fence:async()=>{},readBoardArt:readArt});
   await advanceContinuityInBackground(container,f.gameId,{deadlineAt:Date.now()+270000});await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS+1);
   if(JSON.parse((await f.row()).judgeJson!).reviewState==='board-review-complete')break;
  }};
  await review();const refused=await f.row();expect(visibleHeadPolicyRecoveryCandidate(refused)).toBe(true);
  expect(await reconcileVisibleHeadPolicy(container,f.gameId,[refused],async()=>{})).toBe(false);
  await db.generationJob.update({where:{id:'job_'+f.gameId},data:{status:'FAILED',currentStep:'local-patch:recovery-exhausted',lastError:'local-patch: synthetic head-only rest'}});
  const game=await db.game.findUniqueOrThrow({where:{id:f.gameId}}),plan=await planQaCompletionCapacity(container,f.gameId);
  await authorizeQaCompletionCapacity(container,{gameId:f.gameId,operatorId:game.ownerId!,expectedPlanSha256:plan.planSha256,ownerAuthorizationSha256:'a'.repeat(64)});
  await db.order.update({where:{id:'order-'+f.gameId},data:{paymentStatus:'REFUNDED'}});
  expect(await reconcileVisibleHeadPolicy(container,f.gameId,[refused],async()=>{})).toBe(false);
  await db.order.update({where:{id:'order-'+f.gameId},data:{paymentStatus:'PAID'}});
  const budget=boardWizardBudgetOf(container),worldId=boardWizardWorldId(f.gameId);
  await budget.reserve(worldId,{requestKey:'synthetic-new-unknown',scope:'judge',operationFingerprint:'e'.repeat(64),reserveMicroUsd:100000});
  await budget.markUnknown(worldId,'synthetic-new-unknown','Synthetic unverified supplier billing');
  expect(await reconcileVisibleHeadPolicy(container,f.gameId,[refused],async()=>{})).toBe(false);
  expect((await budget.audit(worldId)).reservedMicroUsd).toBe(100000);
  await budget.settle(worldId,'synthetic-new-unknown',bill('synthetic-confirmed-charge-'+f.gameId,10000));
  const ledger=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}}),renderCount=f.render.mock.calls.length,diagnosisCount=f.diagnose.mock.calls.length;
  expect(await reconcileVisibleHeadPolicy(container,f.gameId,[refused],async()=>{})).toBe(true);
  const corrected=await f.row(),receipt=JSON.parse(corrected.judgeJson!);
  expect(corrected).toMatchObject({status:'GENERATED',assetId:refused.assetId,attempts:refused.attempts,costCents:refused.costCents});
  expect(receipt.selfRepair).toEqual(JSON.parse(refused.judgeJson!).selfRepair);expect(receipt.headPolicyVersion).toBe(TARGET_HEAD_VISIBLE_VERSION);
  expect((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson).toBe(ledger.snapshotJson);
  const archive=await db.auditLog.findFirstOrThrow({where:{entityId:f.gameId,action:VISIBLE_HEAD_RECOVERY_ACTION}});
  expect(JSON.parse(archive.metaJson!)).toMatchObject({previousJudgeJson:refused.judgeJson,providerCalls:0,cyclesPreserved:true,requestsPreserved:true});
  expect(await allowedDualPublication(db,{...publicationBinding(f.gameId,refused),judgeJson:corrected.judgeJson,sceneVersion:f.version})).toBe(false);
  expect(await reconcileVisibleHeadPolicy(container,f.gameId,[corrected],async()=>{})).toBe(false);
  await review();const accepted=await f.row(),j=JSON.parse(accepted.judgeJson!);
  expect(accepted.status).toBe('GENERATED');expect(j.verdict.verdict).toBe('pass');
  expect(j.boardReview.dual.quality.headEvidence.version).toBe(TARGET_HEAD_VISIBLE_VERSION);
  expect(await allowedDualPublication(db,{...publicationBinding(f.gameId,accepted),sceneVersion:f.version})).toBe(true);
  const forged={...j,headPolicyVersion:undefined};
  expect(await allowedDualPublication(db,{...publicationBinding(f.gameId,accepted),judgeJson:JSON.stringify(forged),sceneVersion:f.version})).toBe(false);
  expect(provider.creates).toHaveLength(2);expect(provider.creates[0]!.prompt).not.toBe(provider.creates[1]!.prompt);
  const before=JSON.parse(ledger.snapshotJson),after=JSON.parse((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson);
  for(const request of before.requests)expect(after.requests.find((r:{requestKey:string})=>r.requestKey===request.requestKey)).toEqual(request);
  expect(after.requests).toHaveLength(before.requests.length+1);
  expect(f.render).toHaveBeenCalledTimes(renderCount);expect(f.diagnose).toHaveBeenCalledTimes(diagnosisCount);expect(fetch).not.toHaveBeenCalled();
 }finally{vi.useRealTimers();}
},300000);

it.each(['detectives','explorers'] as const)('re-reads an unmeasured visible-head PASS once for free with derived retention, archives it and publishes only measured; level=%s',async level=>{
 vi.useFakeTimers({toFake:['Date']});
 try{
  const f=await legacyKingdomHeadFixture('head-retention-reread-synthetic-'+level,'redraw-with-new-placement',level==='explorers',true);
  const provider=controlledSol(false,false,undefined,true,false,f.version),retrieve=provider.fake.retrieve.bind(provider.fake);
  provider.fake.retrieve=async id=>{
   const response=await retrieve(id);if(response.status!=='completed')return response;
   const question=provider.creates[provider.creates.length-1]!,p=JSON.parse(question.prompt.split('\n').find(s=>s.startsWith('HEAD_RETURN_EVIDENCE: '))!.slice('HEAD_RETURN_EVIDENCE: '.length));
   const answer=JSON.parse(response.reading.raw!),head={...answer.head.rawHead,top:p.returned.top+20};
   Object.assign(answer.head,{rawHead:head,shippingHead:head,rawCrown:'pass',shippingCrown:'pass',observation:'Synthetic complete crown in RAW and SHIPPING well inside the opaque return.'});
   return{...response,reading:{...response.reading,raw:JSON.stringify(answer)}};
  };
  const container={...c,backgroundReview:provider.fake,visualReview:{request:async()=>{throw Error('No synchronous duplicate');}}} as Container;
  const scope={gameId:f.gameId,sceneId:f.scene.id},deps={fence:async()=>{},readBoardArt:readArt};
  for(let tick=0;tick<8;tick++){
   await reviewLocalPatchBoard(container,{...scope,deadlineAt:Date.now()+270000},deps);
   await advanceContinuityInBackground(container,f.gameId,{deadlineAt:Date.now()+270000});await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS+1);
   if(JSON.parse((await f.row()).judgeJson!).reviewState==='board-review-complete')break;
  }
  const accepted=await f.row(),j=JSON.parse(accepted.judgeJson!);
  expect(accepted.status).toBe('GENERATED');expect(j.verdict.verdict).toBe('pass');
  expect(j.boardReview.dual.quality.headEvidence).toMatchObject({version:TARGET_HEAD_VISIBLE_VERSION,retention:{version:'head-retention/v1'}});
  expect(await allowedDualPublication(db,{...publicationBinding(f.gameId,accepted),sceneVersion:f.version})).toBe(true);
  // A visible-head decision committed before the measurement existed.
  const historical=structuredClone(j);delete historical.boardReview.dual.quality.headEvidence.retention;
  await db.targetVariantAsset.update({where:{id:accepted.id},data:{judgeJson:JSON.stringify(historical)}});
  const before=await f.row();expect(localPatchHeadRetentionUnread(before)).toBe(true);
  expect(await allowedDualPublication(db,{...publicationBinding(f.gameId,before),sceneVersion:f.version})).toBe(false);
  const worldId=boardWizardWorldId(f.gameId),ledger=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}}),asked=provider.creates.length;
  const reread=await reviewLocalPatchBoard(container,{...scope,deadlineAt:Date.now()+270000},deps,{decideRetained:true});
  expect(reread.decidedRetained).toBe(true);
  const after=await f.row(),k=JSON.parse(after.judgeJson!);
  expect(after).toMatchObject({status:'GENERATED',assetId:before.assetId,attempts:before.attempts,costCents:before.costCents});
  expect(k.boardReview.dual.quality.headEvidence.retention).toEqual(j.boardReview.dual.quality.headEvidence.retention);
  expect(k.boardReview.dual.quality).toMatchObject({raw:historical.boardReview.dual.quality.raw,requestKey:historical.boardReview.dual.quality.requestKey,
   fingerprint:historical.boardReview.dual.quality.fingerprint,costMicroUsd:historical.boardReview.dual.quality.costMicroUsd});
  expect(k.reviewHistory.at(-1)).toMatchObject({boardReview:historical.boardReview,supersededBy:'head-retention/v1'});
  expect(provider.creates).toHaveLength(asked);
  expect((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson).toBe(ledger.snapshotJson);
  expect(localPatchHeadRetentionUnread(after)).toBe(false);
  expect(await allowedDualPublication(db,{...publicationBinding(f.gameId,after),sceneVersion:f.version})).toBe(true);
  // An edited measurement cannot admit the same pixels.
  const edited=structuredClone(k);edited.boardReview.dual.quality.headEvidence.retention.lost=Buffer.alloc(Buffer.from(k.boardReview.dual.quality.headEvidence.retention.lost,'base64').length,255).toString('base64');
  expect(await allowedDualPublication(db,{...publicationBinding(f.gameId,after),judgeJson:JSON.stringify(edited),sceneVersion:f.version})).toBe(false);
  expect((await reviewLocalPatchBoard(container,{...scope,deadlineAt:Date.now()+270000},deps,{decideRetained:true})).decidedRetained).toBeFalsy();
  expect(provider.creates).toHaveLength(asked);expect(fetch).not.toHaveBeenCalled();
 }finally{vi.useRealTimers();}
},300000);

it('re-reads an unmeasured visible-head PASS whose crown really fades into the scene: FAILED, then the existing repair decision, same bill and counters',async()=>{
 vi.useFakeTimers({toFake:['Date']});
 try{
  const gameId='head-retention-real-fade-synthetic';await newDetectiveWorld(gameId,7,true,true,true);
  const context=await resolveLocalPatchBoardsForGame(db,gameId,12),board=context.boards.find(b=>b.board==='dragoncave')!,hide=board.hides[2]!;
  const returned=localPatchReturnRegion(cropOf(hide),maskForHide(hide),hide.returnRect).local;
  // The painting's figure starts 3px inside the return: the composition's feather really fades its top rows.
  const figure={left:returned.left+60,top:returned.top+3,width:120,height:250};
  const render=vi.fn<LocalPatchHideDeps['render']>(async input=>paintedOk(await sharp(input.stylePng).composite([{input:await sharp({create:{width:figure.width,height:figure.height,
   channels:4,background:'#ff00ff'}}).png().toBuffer(),left:figure.left,top:figure.top}]).png().toBuffer(),bill('real-fade-'+input.requestKey,50000)));
  const diagnose=vi.fn<NonNullable<SelfRepairDeps['diagnose']>>(async()=>({verdict:null,wireFault:null,costUnknown:false,model:'gpt-5.6-sol',finishReason:'stop',requestId:'real-fade-diagnosis',
   usage:{prompt_tokens:2000,completion_tokens:200},raw:JSON.stringify({cause:'composition-clipping',explanation:'Synthetic: keep the whole head inside the opaque return.',action:'redraw-with-new-placement',
    sourceKey:`${hide.id}:${hide.pose}:render:1`,returnWindow:returned,protectedCore:{left:returned.left+30,top:returned.top+30,width:returned.width-60,height:returned.height-60},
    faceRect:{left:returned.left+60,top:returned.top+60,width:60,height:60}})}));
  const deps:SelfRepairDeps={readBoardArt:readArt,renderPolicySha256:localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY),render,diagnose,
   judge:async()=>{throw Error('No duplicate synchronous judge');},fence:async()=>{}};
  expect((await runLocalPatchHide(c,deps,{gameId,board,hide})).state).toBe('generated');
  const row=()=>db.targetVariantAsset.findFirstOrThrow({where:{variant:'A',targetInstance:{gameScene:{gameId},targetId:hide.targetId}}});
  const scene=await db.gameScene.findFirstOrThrow({where:{gameId,sceneSlug:board.board}});
  const provider=controlledSol(false,false,undefined,true,false,12),retrieve=provider.fake.retrieve.bind(provider.fake);
  provider.fake.retrieve=async id=>{
   const response=await retrieve(id);if(response.status!=='completed')return response;
   const answer=JSON.parse(response.reading.raw!),head={left:figure.left,top:figure.top,width:figure.width,height:110};
   Object.assign(answer.head,{rawHead:head,shippingHead:head,rawCrown:'pass',shippingCrown:'pass',observation:'Synthetic: the judge reports a complete crown in RAW and SHIPPING.'});
   return{...response,reading:{...response.reading,raw:JSON.stringify(answer)}};
  };
  const container={...c,backgroundReview:provider.fake,visualReview:{request:async()=>{throw Error('No synchronous duplicate');}}} as Container;
  const scope={gameId,sceneId:scene.id},reviewDeps={fence:async()=>{},readBoardArt:readArt};
  // The historical writer: visible-head evidence without a measurement, published by the code of its day.
  const build=headEvidenceModule.singleReviewHeadEvidence,publish=dualPublicationModule.allowedDualPublication;
  const historical=vi.spyOn(headEvidenceModule,'singleReviewHeadEvidence').mockImplementation(async(...args)=>{
   const built=await build(...args),{retention:_measured,...evidence}=built.evidence;return{...built,evidence};});
  const historicalPublication=vi.spyOn(dualPublicationModule,'allowedDualPublication').mockImplementation(async(...args)=>{
   const receipt=JSON.parse(args[1].judgeJson??'null');return receipt?.boardReview?.dual?.quality?.headEvidence?.retention===undefined?true:publish(...args);});
  try{
   for(let tick=0;tick<8;tick++){
    await reviewLocalPatchBoard(container,{...scope,deadlineAt:Date.now()+270000},reviewDeps);
    await advanceContinuityInBackground(container,gameId,{deadlineAt:Date.now()+270000});await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS+1);
    if(JSON.parse((await row()).judgeJson!).reviewState==='board-review-complete')break;
   }
  }finally{historical.mockRestore();historicalPublication.mockRestore();}
  const accepted=await row(),j=JSON.parse(accepted.judgeJson!);
  expect(accepted.status).toBe('GENERATED');expect(j.verdict.verdict).toBe('pass');
  expect(j.boardReview.dual.quality.headEvidence.version).toBe(TARGET_HEAD_VISIBLE_VERSION);expect(j.boardReview.dual.quality.headEvidence.retention).toBeUndefined();
  expect(localPatchHeadRetentionUnread(accepted)).toBe(true);
  expect(await allowedDualPublication(db,{...publicationBinding(gameId,accepted),sceneVersion:12})).toBe(false);
  const worldId=boardWizardWorldId(gameId),ledger=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}}),asked=provider.creates.length,painted=render.mock.calls.length;
  // One free re-reading of the exact settled document, now with the derived measurement.
  expect((await reviewLocalPatchBoard(container,{...scope,deadlineAt:Date.now()+270000},reviewDeps,{decideRetained:true})).decidedRetained).toBe(true);
  const refused=await row(),k=JSON.parse(refused.judgeJson!);
  expect(refused).toMatchObject({status:'FAILED',assetId:accepted.assetId,attempts:accepted.attempts,costCents:accepted.costCents});
  expect(refused.lastError).toMatch(/^quality-/);
  expect(k.verdict.verdict).toBe('fail');
  expect(k.verdict.faults[0]).toMatchObject({check:'childComplete',where:'HEAD_RETURN: measured target crown pixels fade into the original scene at the return edge'});
  expect(k.boardReview.dual.quality).toMatchObject({raw:j.boardReview.dual.quality.raw,requestKey:j.boardReview.dual.quality.requestKey,
   fingerprint:j.boardReview.dual.quality.fingerprint,costMicroUsd:j.boardReview.dual.quality.costMicroUsd,headEvidence:{retention:{version:'head-retention/v1'}}});
  expect(k.reviewHistory.at(-1)).toMatchObject({boardReview:j.boardReview,supersededBy:'head-retention/v1'});
  expect(provider.creates).toHaveLength(asked);expect(render).toHaveBeenCalledTimes(painted);
  expect((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson).toBe(ledger.snapshotJson);
  expect((await reviewLocalPatchBoard(container,{...scope,deadlineAt:Date.now()+270000},reviewDeps,{decideRetained:true})).decidedRetained).toBeFalsy();
  // The ordinary repair route takes it, with the measured head as its frozen context.
  for(let step=0;step<3&&!diagnose.mock.calls.length;step++)await runLocalPatchSelfRepair(c,{gameId,sceneId:scene.id,board,hide},deps);
  const repairing=await row(),state=JSON.parse(repairing.judgeJson!).selfRepair;
  expect(state).toMatchObject({cycle:1,headContext:{evidence:{retention:{version:'head-retention/v1'}},answer:{shippingCrown:'pass'}}});
  expect(diagnose).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(diagnose.mock.calls[0]![0])).toContain('FROZEN TARGET HEAD DATA');
  // From here the existing repair route spends as it always does; the measured re-reading itself bought nothing
  // and the original paid painting's bill is untouched.
  const paintKey=`${hide.id}:${hide.pose}:render:1`,bills=(snapshot:string)=>JSON.parse(snapshot).requests.find((r:{requestKey:string})=>r.requestKey===paintKey);
  expect(bills((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson)).toEqual(bills(ledger.snapshotJson));
  expect(repairing.attempts).toBeGreaterThanOrEqual(accepted.attempts);
  expect(fetch).not.toHaveBeenCalled();
 }finally{vi.useRealTimers();}
},300000);

it.each(['detectives','explorers'] as const)('keeps a free measured head re-reading ahead of a slow optional scan; level=%s',async level=>{
 vi.useFakeTimers({toFake:['Date']});
 try{
  const f=await legacyKingdomHeadFixture('retention-free-priority-synthetic-'+level,'redraw-with-new-placement',level==='explorers',true);
  const provider=controlledSol(false,false,undefined,true,false,f.version),retrieve=provider.fake.retrieve.bind(provider.fake);
  provider.fake.retrieve=async id=>{
   const response=await retrieve(id);if(response.status!=='completed')return response;
   const question=provider.creates[provider.creates.length-1]!,evidence=JSON.parse(question.prompt.split('\n').find(s=>s.startsWith('HEAD_RETURN_EVIDENCE: '))!.slice('HEAD_RETURN_EVIDENCE: '.length));
   const answer=JSON.parse(response.reading.raw!),head={...answer.head.rawHead,top:evidence.returned.top+20};
   Object.assign(answer.head,{rawHead:head,shippingHead:head,rawCrown:'pass',shippingCrown:'pass',observation:'Synthetic complete crown inside the opaque return, without a visible fade.'});
   return{...response,reading:{...response.reading,raw:JSON.stringify(answer)}};
  };
  const container={...c,backgroundReview:provider.fake,visualReview:{request:async()=>{throw Error('No duplicate synchronous judge');}}} as Container;
  const scope={gameId:f.gameId,sceneId:f.scene.id},reviewDeps={fence:async()=>{},readBoardArt:readArt};
  for(let tick=0;tick<8;tick++){
   await reviewLocalPatchBoard(container,{...scope,deadlineAt:Date.now()+270000},reviewDeps);
   await advanceContinuityInBackground(container,f.gameId,{deadlineAt:Date.now()+270000});await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS+1);
   if(JSON.parse((await f.row()).judgeJson!).reviewState==='board-review-complete')break;
  }
  const accepted=await f.row(),historical=JSON.parse(accepted.judgeJson!);
  expect(historical.verdict.verdict).toBe('pass');
  delete historical.boardReview.dual.quality.headEvidence.retention;
  await db.targetVariantAsset.update({where:{id:accepted.id},data:{judgeJson:JSON.stringify(historical)}});
  const before=await f.row();expect(localPatchHeadRetentionUnread(before)).toBe(true);
  const progress=await import('../../../domain/scene/local-patch-progress');
  expect(progress.localPatchReadyReviewOwed(before,{required:true})).toBe(false);
  const worldId=boardWizardWorldId(f.gameId),ledger=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}}),asked=provider.creates.length,painted=f.render.mock.calls.length;
  const start=Date.now();let clock=start;
  const now=vi.spyOn(Date,'now').mockImplementation(()=>clock);
  const capacity=await import('../qa-completion-capacity');
  const grant=vi.spyOn(capacity,'readQaCompletionCapacity').mockResolvedValue({worldId,capMicroUsd:12000000,authorizationSha256:'a'.repeat(64)});
  const recovery=await import('../retained-normal-head-recovery');
  const scan=vi.spyOn(recovery,'restoreRetainedNormalHead').mockImplementation(async()=>{clock+=95000;return false;});
  const reviewModule=await import('../local-patch-board-review'),realReview=reviewModule.reviewLocalPatchBoard;
  const committed=vi.spyOn(reviewModule,'reviewLocalPatchBoard').mockImplementation(async(...args)=>{
   const result=await realReview(...args);if(args[3]?.decideRetained&&result.decidedRetained)clock=start+250000;return result;
  });
  try{
   const result=await runLocalPatchWorldSlice(container,f.deps,f.gameId,{maxHides:1,hardDeadlineAt:start+270000});
   expect(result).toMatchObject({claimed:true,pending:true,attention:null});
   expect(scan).not.toHaveBeenCalled();
   const after=await f.row(),receipt=JSON.parse(after.judgeJson!);
   expect(after).toMatchObject({status:'GENERATED',assetId:before.assetId,attempts:before.attempts,costCents:before.costCents});
   expect(receipt.boardReview.dual.quality.headEvidence.retention.version).toBe('head-retention/v1');
   expect(receipt.reviewHistory.at(-1)).toMatchObject({boardReview:historical.boardReview,supersededBy:'head-retention/v1'});
   expect(localPatchHeadRetentionUnread(after)).toBe(false);
   expect((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson).toBe(ledger.snapshotJson);
   expect(provider.creates).toHaveLength(asked);expect(f.render).toHaveBeenCalledTimes(painted);
   expect(await db.generationJob.findUniqueOrThrow({where:{id:'job_'+f.gameId}})).toMatchObject({status:'QUEUED',currentStep:'local-patch'});
   expect(fetch).not.toHaveBeenCalled();
  }finally{committed.mockRestore();scan.mockRestore();grant.mockRestore();now.mockRestore();}
 }finally{vi.useRealTimers();}
},300000);

async function nativeDetailWorldFixture(gameId:string){
 await newDetectiveWorld(gameId,7,true,true,true);
 const context=await resolveLocalPatchBoardsForGame(db,gameId,12),board=context.boards.find(b=>b.board==='dragoncave')!,hide=board.hides[2]!;
 const returned=localPatchReturnRegion(cropOf(hide),maskForHide(hide),hide.returnRect).local;
 let paintCount=0;
 const render=vi.fn<LocalPatchHideDeps['render']>(async input=>{
  paintCount++;
  const figure=await sharp({create:{width:Math.min(100,returned.width-60),height:Math.min(160,returned.height-70),channels:4,
   background:paintCount===1?'#315d87':'#346189'}}).png().toBuffer();
  return paintedOk(await sharp(input.stylePng).composite([{input:figure,left:returned.left+30,top:returned.top+30}]).png().toBuffer(),bill('synthetic-native-detail-'+gameId+'-'+input.requestKey,50000));
 });
 const deps:LocalPatchHideDeps={readBoardArt:readArt,renderPolicySha256:localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY),render,
  judge:async()=>{throw Error('No synchronous duplicate');}};
 const provider=controlledSol(false,false,undefined,true,false,12),container={...c,backgroundReview:provider.fake,
  visualReview:{request:async()=>{throw Error('No separate paid style opinion');}}} as Container;
 const scene=await db.gameScene.findFirstOrThrow({where:{gameId,sceneSlug:board.board}});
 const row=()=>db.targetVariantAsset.findFirstOrThrow({where:{variant:'A',targetInstance:{gameScene:{gameId},targetId:hide.targetId}}});
 const review=async()=>{for(let turn=0;turn<12;turn++){
  await reviewLocalPatchBoard(container,{gameId,sceneId:scene.id,deadlineAt:Date.now()+270000},{fence:async()=>{},readBoardArt:readArt});
  await advanceContinuityInBackground(container,gameId,{deadlineAt:Date.now()+270000});await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS+1);
  if(JSON.parse((await row()).judgeJson!).reviewState==='board-review-complete')break;
 }};
 return{gameId,board,hide,render,deps,provider,container,scene,row,review};
}

it('routes a located native-detail style refusal into one versioned next painting and one fresh ordinary assessment',async()=>{
 vi.useFakeTimers({toFake:['Date']});try{
  const f=await nativeDetailWorldFixture('native-detail-style-synthetic'),retrieve=f.provider.fake.retrieve;
  let refuse=true;
  f.provider.fake.retrieve=async id=>{const response=await retrieve(id);if(response.status!=='completed'||!refuse)return response;
   const answer=JSON.parse(response.reading.raw!),assessment=answer.assessment.version===SOURCE_NEIGHBOR_BUNDLE_VERSION?answer.assessment.assessment:answer.assessment;
   const verdict=assessment.quality.hides[0].verdict;
   Object.assign(verdict,{styleMatch:'fail',verdict:'fail',reason:'Synthetic target detail visibly differs from the original source.',
    faults:[{check:'styleMatch',where:'NATIVE_DETAIL: target eyes are smeared beside the original clear face at the same depth.'}]});
   return{...response,reading:{...response.reading,raw:JSON.stringify(answer)}};
  };
  await runLocalPatchHide(f.container,f.deps,{gameId:f.gameId,board:f.board,hide:f.hide});await f.review();
  const refused=await f.row(),receipt=JSON.parse(refused.judgeJson!);
  expect(refused.status).toBe('FAILED');expect(receipt.boardReview.dual.quality.nativeDetailEvidence.version).toBe('native-detail/v1');
  const budget=boardWizardBudgetOf(f.container),worldId=boardWizardWorldId(f.gameId),key=receipt.boardReview.dual.quality.requestKey;
  const billBefore=await budget.readRequest(worldId,key);
  expect(f.provider.creates).toHaveLength(1);expect(f.provider.creates[0]!.labels.some(s=>s.includes('native-original-source'))).toBe(true);
  expect(f.render.mock.calls[0]![0].prompt).toContain('NATIVE DETAIL MATCH native-detail/v1');
  refuse=false;
  expect((await runLocalPatchHide(f.container,f.deps,{gameId:f.gameId,board:f.board,hide:f.hide})).state).toBe('generated');
  expect(f.render).toHaveBeenCalledTimes(2);expect(f.render.mock.calls[1]![0].prompt).toContain('NATIVE DETAIL REPAIR native-detail/v1');
  await f.review();const decided=await f.row();expect(decided.status,JSON.stringify({error:decided.lastError,verdict:JSON.parse(decided.judgeJson!).verdict})).toBe('GENERATED');expect(JSON.parse(decided.judgeJson!).verdict.verdict).toBe('pass');
  expect(f.provider.creates).toHaveLength(2);expect(await budget.readRequest(worldId,key)).toEqual(billBefore);
  expect(await allowedDualPublication(db,publicationBinding(f.gameId,decided))).toBe(true);
  expect((await runLocalPatchHide(f.container,f.deps,{gameId:f.gameId,board:f.board,hide:f.hide})).state).toBe('already-generated');
  expect(f.render).toHaveBeenCalledTimes(2);expect(f.provider.creates).toHaveLength(2);expect(fetch).not.toHaveBeenCalled();
 }finally{vi.useRealTimers();}
},300000);

it.each(['pending','settled'] as const)('keeps a historical %s MEDIUM question exact after native-detail evidence is introduced',async state=>{
 vi.useFakeTimers({toFake:['Date']});try{
  const f=await nativeDetailWorldFixture('native-detail-legacy-synthetic-'+state);
  // Emulate the historical builder before this prospective evidence existed.
  // The actual provider intent, reserved key and paid reply remain authentic.
  const old=vi.spyOn(nativeDetailEvidenceModule,'nativeDetailQuestion').mockImplementation(async question=>({question,evidence:undefined} as never));
  const oldPainter=vi.spyOn(nativeDetailPainterModule,'nativeDetailSubjectDirection').mockImplementation(direction=>direction);
  await runLocalPatchHide(f.container,f.deps,{gameId:f.gameId,board:f.board,hide:f.hide});oldPainter.mockRestore();
  if(state==='settled')await f.review();
  else await reviewLocalPatchBoard(f.container,{gameId:f.gameId,sceneId:f.scene.id,deadlineAt:Date.now()+270000},{fence:async()=>{},readBoardArt:readArt});
  expect(f.provider.creates).toHaveLength(1);expect(f.provider.creates[0]!.prompt).not.toContain('NATIVE_DETAIL_EVIDENCE:');
  old.mockRestore();
  const worldId=boardWizardWorldId(f.gameId),budget=boardWizardBudgetOf(f.container);
  if(state==='settled'){
   const row=await f.row(),j=JSON.parse(row.judgeJson!),raw=j.boardReview.dual.quality.raw,key=j.boardReview.dual.quality.requestKey;
   const ledger=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}});
   delete j.boardReview.dual.quality.headEvidence.retention;
   await db.targetVariantAsset.update({where:{id:row.id},data:{judgeJson:JSON.stringify(j)}});
   await reviewLocalPatchBoard(f.container,{gameId:f.gameId,sceneId:f.scene.id,deadlineAt:Date.now()+270000},{fence:async()=>{},readBoardArt:readArt},{decideRetained:true});
   const after=JSON.parse((await f.row()).judgeJson!);
   expect(after.boardReview.dual.quality).toMatchObject({raw,requestKey:key});expect(after.boardReview.dual.quality.nativeDetailEvidence).toBeUndefined();
   expect((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson).toBe(ledger.snapshotJson);
  }else{
   const pending=(await budget.audit(worldId)).pendingRequestKeys;expect(pending).toHaveLength(1);
   const prior=await budget.readRequest(worldId,pending[0]!);await f.review();
   const after=await budget.readRequest(worldId,pending[0]!);expect(after?.operationFingerprint).toBe(prior?.operationFingerprint);expect(after?.state).toBe('settled');
  }
  const final=await f.row();expect(final.status,JSON.stringify({error:final.lastError,verdict:JSON.parse(final.judgeJson!).verdict})).toBe('GENERATED');expect(f.provider.creates).toHaveLength(1);expect(f.render).toHaveBeenCalledTimes(1);expect(fetch).not.toHaveBeenCalled();
 }finally{vi.useRealTimers();}
},300000);

it.each([
 {fresh:'pass',alias:false,original:'pass',version:12,runtime:true},
 {fresh:'fail',alias:false,original:'pass',version:12,runtime:false},
 {fresh:'pass',alias:true,original:'pass',version:12,runtime:false},
 {fresh:'pass',alias:true,original:'pass',version:13,runtime:true},
 {fresh:'held',alias:true,original:'pass',version:13,runtime:true},
 {fresh:'pass',alias:false,original:'continuity',version:12,runtime:false},
 {fresh:'pass',alias:false,original:'subject',version:12,runtime:false},
 {fresh:'pass',alias:false,original:'doubt',version:12,runtime:false},
] as const)('corrects a measured crown fade for free inside the SAME return, then only a fresh MEDIUM decides it; fresh review=$fresh alias=$alias original=$original version=$version runtime=$runtime',async({fresh,alias,original,version,runtime})=>{
 vi.useFakeTimers({toFake:['Date']});
 try{
  const gameId='head-pixel-correction-synthetic-'+fresh+(alias?'-alias':'')+'-'+original+'-'+version;await newDetectiveWorld(gameId,7,true,version===12,true);
  const context=await resolveLocalPatchBoardsForGame(db,gameId,version),board=context.boards.find(b=>b.board==='dragoncave')!,hide=board.hides[version===13?1:2]!;
  const returned=localPatchReturnRegion(cropOf(hide),maskForHide(hide),hide.returnRect).local;
  const figure={left:returned.left+60,top:returned.top+4,width:120,height:250},located={left:figure.left,top:figure.top,width:figure.width,height:110};
  const render=vi.fn<LocalPatchHideDeps['render']>(async input=>paintedOk(await sharp(input.stylePng).composite([{input:await sharp({create:{width:figure.width,height:figure.height,
   channels:4,background:'#ff00ff'}}).png().toBuffer(),left:figure.left,top:figure.top}]).png().toBuffer(),bill('pixel-correction-'+fresh+'-'+input.requestKey,50000)));
  const deps:SelfRepairDeps={readBoardArt:readArt,renderPolicySha256:localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY),render,
   diagnose:async()=>{throw Error('No diagnosis is bought by the free correction');},judge:async()=>{throw Error('No duplicate synchronous judge');},fence:async()=>{}};
  expect((await runLocalPatchHide(c,deps,{gameId,board,hide})).state).toBe('generated');
  const row=()=>db.targetVariantAsset.findFirstOrThrow({where:{variant:'A',targetInstance:{gameScene:{gameId},targetId:hide.targetId}}});
  const scene=await db.gameScene.findFirstOrThrow({where:{gameId,sceneSlug:board.board}});
  let crowns:'pass'|'fail'='pass';
  const provider=controlledSol(false,false,undefined,true,false,version),retrieve=provider.fake.retrieve.bind(provider.fake);
  provider.fake.retrieve=async id=>{
   const response=await retrieve(id);if(response.status!=='completed')return response;
   const answer=JSON.parse(response.reading.raw!);
   Object.assign(answer.head,{rawHead:located,shippingHead:located,rawCrown:crowns,shippingCrown:crowns,observation:'Synthetic located crown in RAW and SHIPPING.'});
   if(original==='continuity')Object.assign(answer.continuity.cases[0],{state:'broken',headConnection:'missing',
    faults:[{kind:'missing-head',where:'Synthetic separate source neighbor has a missing head beside its visible collar.'}]});
   if(original==='subject'){
    const assessment=answer.assessment.version===SOURCE_NEIGHBOR_BUNDLE_VERSION?answer.assessment.assessment:answer.assessment;
    assessment.subject.checks.photoLikeness=observed('fail');
    assessment.subject.faults=[{check:'photoLikeness',where:'Synthetic target eye shape and nose differ from the pinned photograph.'}];
   }
   if(original==='doubt'){answer.doubt=true;answer.doubtReason='Synthetic unresolved non-head anatomy beside the return.';}
   return{...response,reading:{...response.reading,raw:JSON.stringify(answer)}};
  };
  const container={...c,backgroundReview:provider.fake,visualReview:{request:async()=>{throw Error('No synchronous duplicate');}}} as Container;
  const scope={gameId,sceneId:scene.id},reviewDeps={fence:async()=>{},readBoardArt:readArt};
  const review=async()=>{for(let tick=0;tick<8;tick++){
   await reviewLocalPatchBoard(container,{...scope,deadlineAt:Date.now()+270000},reviewDeps);
   await advanceContinuityInBackground(container,gameId,{deadlineAt:Date.now()+270000});await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS+1);
   if(JSON.parse((await row()).judgeJson!).reviewState==='board-review-complete')break;
  }};
  let aliasAudit:{id:string;metaJson:string|null}|null=null;
  if(alias){
   // A restored older normal painting, written exactly as restoreRetainedNormalHead writes it.
   const pending=await row(),receipt=JSON.parse(pending.judgeJson!),paidRaw=await readSettledTargetRaw(db,gameId,`${hide.id}:${hide.pose}:render:1`);
   const identity=await db.asset.findUniqueOrThrow({where:{id:'ast-sheet-'+gameId}}),auditId='aud_normal_head_'+sha256Bytes(Buffer.from(gameId)).slice(0,40);
   const restored={version:RETAINED_NORMAL_HEAD_VERSION,auditId,authorizationSha256:'a'.repeat(64),sourceRequestKey:`${hide.id}:${hide.pose}:render:1`,
    sourceFingerprint:paidRaw.kept.operationFingerprint,sourcePayloadSha256:paidRaw.kept.payloadSha256,normalizedRawSha256:sha256Bytes(paidRaw.normalized),
    shippingSha256:receipt.judgedSha256,geometrySha256:receipt.geometrySha256,identitySha256:sha256Bytes(await c.storage.get(identity.storagePath)),
    originalAttempt:1,sourceReviewRequestKey:'synthetic-older-review',sourceReviewFingerprint:'b'.repeat(64)};
   aliasAudit=await db.auditLog.create({data:{id:auditId,actorType:'SYSTEM',action:RETAINED_NORMAL_HEAD_ACTION,entityType:'Game',entityId:gameId,
    metaJson:JSON.stringify({version:RETAINED_NORMAL_HEAD_VERSION,retainedNormalHead:restored,candidateSha256:receipt.judgedSha256})}});
   await db.targetVariantAsset.update({where:{id:pending.id},data:{judgeJson:JSON.stringify({...receipt,retainedNormalHead:restored})}});
  }
  // The ordinary measured review refuses the faded crown, with no painting bought for it.
  await review();
  let refused=await row(),r=JSON.parse(refused.judgeJson!);
  if(original==='continuity'||original==='subject'){
   // The ordinary writer already combines role failures into its verdict. This
   // mutable projection is deliberately changed to the exact quality-only
   // reading: C must still reject the ORIGINAL paid non-head role failure.
   // No retained answer, bill, fingerprint or provider bytes are changed.
   r.verdict=readQualityStage(r.boardReview.dual.quality,hide.id,version);
   await db.targetVariantAsset.update({where:{id:refused.id},data:{judgeJson:JSON.stringify(r)}});
   refused=await row();r=JSON.parse(refused.judgeJson!);
  }
  if(alias)expect(r.boardReview.dual.quality.headEvidence.sourceBindingVersion).toBe(RETAINED_NORMAL_HEAD_VERSION);
  expect(refused.status).toBe('FAILED');expect(headPixelCorrectionCandidate(refused)).toBe(true);
  if(fresh==='held'){
   // Unknown charges retain their FULL reservation through free correction,
   // but a NEW unapproved unknown must block a fresh paid review. The free
   // correction and deletion must still work; neither waives the hold.
   const budget=boardWizardBudgetOf(container),worldId=boardWizardWorldId(gameId);
   await budget.reserve(worldId,{requestKey:'synthetic-head-unverified-charge',scope:'image',operationFingerprint:'d'.repeat(64),reserveMicroUsd:200000});
   await budget.markUnknown(worldId,'synthetic-head-unverified-charge','Synthetic provider charge is unverified');
  }
  const worldId=boardWizardWorldId(gameId),ledger=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}}),asked=provider.creates.length,painted=render.mock.calls.length;
  if(original!=='pass'){
   // A quality-only mutable verdict cannot supersede the paid continuity or
   // subject refusal, or paid uncertainty. No new candidate/review is owed.
   const assets=await db.asset.findMany({where:{providerRequestId:gameId},orderBy:{id:'asc'}});
   expect(r.verdict.faults.every((f:{where:string})=>f.where.includes('measured target crown pixels'))).toBe(true);
   expect(await correctHeadPixels(container,gameId,[refused],async()=>{},readArt)).toBe(false);
   expect(await row()).toEqual(refused);
   expect(await db.asset.findMany({where:{providerRequestId:gameId},orderBy:{id:'asc'}})).toEqual(assets);
   expect((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson).toBe(ledger.snapshotJson);
   expect(provider.creates).toHaveLength(asked);expect(render).toHaveBeenCalledTimes(painted);
   expect(fetch).not.toHaveBeenCalled();return;
  }
  // Ownership, refund, deletion and fences refuse before any write.
  await db.order.update({where:{id:'order-'+gameId},data:{paymentStatus:'REFUNDED'}});
  expect(await correctHeadPixels(container,gameId,[refused],async()=>{},readArt)).toBe(false);
  await db.order.update({where:{id:'order-'+gameId},data:{paymentStatus:'PAID'}});
  await expect(correctHeadPixels(container,gameId,[refused],async()=>{throw Error('synthetic fence');},readArt)).rejects.toThrow('synthetic fence');
  if(version===13){
   const owner=(await db.game.findUniqueOrThrow({where:{id:gameId}})).ownerId!,childId='chl-'+gameId,identityId='ast-sheet-'+gameId;
   const other='usr-other-'+gameId;
   await db.user.create({data:{id:other,email:other+'@example.invalid'}});
   for(const [blocked,restore] of [
    [()=>db.game.update({where:{id:gameId},data:{ownerId:other}}),()=>db.game.update({where:{id:gameId},data:{ownerId:owner}})],
    [()=>db.childProfile.update({where:{id:childId},data:{ownerId:other}}),()=>db.childProfile.update({where:{id:childId},data:{ownerId:owner}})],
    [()=>db.childProfile.update({where:{id:childId},data:{deletedAt:new Date()}}),()=>db.childProfile.update({where:{id:childId},data:{deletedAt:null}})],
    [()=>db.game.update({where:{id:gameId},data:{deletedAt:new Date()}}),()=>db.game.update({where:{id:gameId},data:{deletedAt:null}})],
    [()=>db.asset.update({where:{id:identityId},data:{deletedAt:new Date()}}),()=>db.asset.update({where:{id:identityId},data:{deletedAt:null}})],
    [()=>db.asset.update({where:{id:identityId},data:{visibility:'GAME'}}),()=>db.asset.update({where:{id:identityId},data:{visibility:'PRIVATE'}})],
   ] as const){await blocked();expect(await correctHeadPixels(container,gameId,[refused],async()=>{},readArt)).toBe(false);await restore();}
   // Also recheck inside the write fence, after the initial owned reads.
   expect(await correctHeadPixels(container,gameId,[refused],async tx=>{
    await tx.childProfile.update({where:{id:childId},data:{deletedAt:new Date()}});
   },readArt)).toBe(false);
   await db.childProfile.update({where:{id:childId},data:{deletedAt:null}});
   for(const phase of ['diagnosing','applying']){
    await db.targetVariantAsset.update({where:{id:refused.id},data:{judgeJson:JSON.stringify({...r,selfRepair:{phase,cycle:1}})}});
    expect(await correctHeadPixels(container,gameId,[await row()],async()=>{},readArt)).toBe(false);
   }
   await db.targetVariantAsset.update({where:{id:refused.id},data:{judgeJson:refused.judgeJson}});
  }
  const forged=structuredClone(r);forged.boardReview.dual.quality.raw=forged.boardReview.dual.quality.raw.replace(`"top":${located.top}`,`"top":${located.top+1}`);
  await db.targetVariantAsset.update({where:{id:refused.id},data:{judgeJson:JSON.stringify(forged)}});
  expect(await correctHeadPixels(container,gameId,[await row()],async()=>{},readArt)).toBe(false);
  await db.targetVariantAsset.update({where:{id:refused.id},data:{judgeJson:refused.judgeJson}});
  expect((await row()).judgeJson).toBe(refused.judgeJson);
  // The correction: same RAW, same scene, same return; nothing bought. A stale
  // candidate listed first is refused without starving the real one.
  if(runtime){
   // A C-eligible row skips the optional95s scan and is corrected before any
   // painting or review purchase. Yield after this one free write so ordinary
   // review starts with its unchanged180s window on the next tick.
   const start=Date.now();let clock=start;
   const now=vi.spyOn(Date,'now').mockImplementation(()=>clock);
   const capacity=await import('../qa-completion-capacity');
   const grant=vi.spyOn(capacity,'readQaCompletionCapacity').mockResolvedValue({worldId,capMicroUsd:12000000,authorizationSha256:'a'.repeat(64)});
   const recovery=await import('../retained-normal-head-recovery');
   const scan=vi.spyOn(recovery,'restoreRetainedNormalHead').mockImplementation(async()=>{clock+=95000;return false;});
   try{
    const result=await runLocalPatchWorldSlice(container,deps,gameId,{maxHides:1,hardDeadlineAt:start+270000});
    expect(result).toMatchObject({claimed:true,pending:true,attention:null});
    expect(scan).not.toHaveBeenCalled();
    expect(await db.generationJob.findUniqueOrThrow({where:{id:'job_'+gameId}})).toMatchObject({status:'QUEUED',currentStep:'local-patch'});
   }finally{scan.mockRestore();grant.mockRestore();now.mockRestore();}
  }else expect(await correctHeadPixels(container,gameId,[{...refused,id:'tva-stale-synthetic'},refused],async()=>{},readArt)).toBe(true);
  const corrected=await row(),k=JSON.parse(corrected.judgeJson!),marker=k.headPixelCorrection;
  expect(corrected).toMatchObject({status:'GENERATED',attempts:refused.attempts,costCents:refused.costCents});expect(corrected.assetId).toMatch(/^ast_hpc_/);
  expect(k).toMatchObject({reviewState:'pending-board-review',verdict:null});expect(k.boardReview).toBeUndefined();expect(k.retainedNormalHead).toBeUndefined();
  expect(marker).toMatchObject({version:'head-pixel-correction/v1',baselineShippingSha256:r.judgedSha256,baselineAssetId:refused.assetId,returned,heads:[located,located],
   headAnswer:{requestKey:r.boardReview.dual.quality.requestKey,fingerprint:r.boardReview.dual.quality.fingerprint}});
  expect(JSON.parse(corrected.rejectedAssetIdsJson!)).toContain(refused.assetId);
  if(alias){
   // The alias moves into the correction; its own audit still binds the ORIGINAL image.
   expect(marker.alias.retainedNormalHead).toEqual(r.retainedNormalHead);
   expect(await db.auditLog.findUniqueOrThrow({where:{id:aliasAudit!.id}})).toMatchObject({metaJson:aliasAudit!.metaJson});
  }else expect(marker.alias).toBeUndefined();
  expect((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson).toBe(ledger.snapshotJson);
  if(fresh==='held')expect(await boardWizardBudgetOf(container).audit(worldId)).toMatchObject({held:true,unknownRequestKeys:['synthetic-head-unverified-charge'],reservedMicroUsd:200000});
  expect(provider.creates).toHaveLength(asked);expect(render).toHaveBeenCalledTimes(painted);
  const audit=JSON.parse((await db.auditLog.findFirstOrThrow({where:{entityId:gameId,action:HEAD_PIXEL_CORRECTION_ACTION}})).metaJson!);
  expect(audit).toMatchObject({previousJudgeJson:refused.judgeJson,previousAssetId:refused.assetId,providerCalls:0,attemptsPreserved:true,requestsPreserved:true});
  // Pixels: the paid head is exactly the RAW; outside the return exactly the baseline; only band pixels near the head moved.
  const decode=async(bytes:Buffer)=>(await sharp(bytes).ensureAlpha().raw().toBuffer());
  const asset=async(id:string)=>c.storage.get((await db.asset.findUniqueOrThrow({where:{id}})).storagePath);
  const [shipped,baseline,raw]=await Promise.all([decode(await asset(corrected.assetId!)),decode(await asset(refused.assetId!)),
   readSettledTargetRaw(db,gameId,marker.sourceRequestKey).then(p=>decode(p.normalized))]);
  const at=(b:Buffer,x:number,y:number)=>[...b.subarray((y*512+x)*4,(y*512+x)*4+4)];
  for(let y=located.top;y<located.top+located.height;y+=3)for(let x=located.left;x<located.left+located.width;x+=3)expect(at(shipped,x,y)).toEqual(at(raw,x,y));
  let moved=0;
  for(let y=0;y<768;y++)for(let x=0;x<512;x++){
   const inReturn=x>=returned.left&&x<returned.left+returned.width&&y>=returned.top&&y<returned.top+returned.height;
   const same=at(shipped,x,y).every((v,i)=>v===at(baseline,x,y)[i]);
   if(!inReturn)expect(same).toBe(true);else if(!same){moved++;expect(Math.min(x-returned.left,y-returned.top,returned.left+returned.width-1-x,returned.top+returned.height-1-y)).toBeLessThan(12);}
  }
  expect(moved).toBeGreaterThan(0);
  // Finite: the same correction cannot schedule itself, and nothing publishes before a fresh MEDIUM.
  expect(headPixelCorrectionCandidate(corrected)).toBe(false);
  expect(await correctHeadPixels(container,gameId,[corrected],async()=>{},readArt)).toBe(false);
  expect(await allowedDualPublication(db,{...publicationBinding(gameId,refused),variantId:corrected.id,assetId:corrected.assetId!,imageSha256:k.judgedSha256,
   geometrySha256:localPatchPublicationGeometryHash(corrected),judgeJson:corrected.judgeJson})).toBe(false);
  if(fresh==='held'){
   await review();
   expect(provider.creates).toHaveLength(asked);expect(render).toHaveBeenCalledTimes(painted);
   const pending=await row();expect(pending.assetId).toBe(corrected.assetId);
   expect(await allowedDualPublication(db,{...publicationBinding(gameId,refused),sceneVersion:version,variantId:pending.id,
    assetId:pending.assetId!,imageSha256:k.judgedSha256,geometrySha256:localPatchPublicationGeometryHash(pending),judgeJson:pending.judgeJson})).toBe(false);
   expect(await boardWizardBudgetOf(container).audit(worldId)).toMatchObject({held:true,unknownRequestKeys:['synthetic-head-unverified-charge'],reservedMicroUsd:200000});
   const owner=(await db.game.findUniqueOrThrow({where:{id:gameId}})).ownerId!;
   expect(await deleteLocalPatchGame(container,gameId,{type:'USER',id:owner},owner)).toBe(true);
   expect((await db.auditLog.findUniqueOrThrow({where:{id:marker.auditId}})).metaJson).toBeNull();
   expect((await db.auditLog.findUniqueOrThrow({where:{id:aliasAudit!.id}})).metaJson).toBeNull();
   expect(await boardWizardBudgetOf(container).audit(worldId)).toMatchObject({held:true,unknownRequestKeys:['synthetic-head-unverified-charge'],reservedMicroUsd:200000});
   expect(fetch).not.toHaveBeenCalled();return;
  }
  crowns=fresh;await review();
  const decided=await row(),d=JSON.parse(decided.judgeJson!);
  expect(provider.creates).toHaveLength(asked+1);expect(render).toHaveBeenCalledTimes(painted);
  expect(d.boardReview.dual.quality.headEvidence).toMatchObject({sourceBindingVersion:'head-pixel-correction/v1',sourceRequestKey:marker.sourceRequestKey});
  if(fresh==='pass'){
   expect(decided.status).toBe('GENERATED');expect(d.verdict.verdict).toBe('pass');
   const binding={...publicationBinding(gameId,decided),sceneVersion:version};
   expect(await allowedDualPublication(db,binding)).toBe(true);
   const tampered=structuredClone(d);tampered.headPixelCorrection.heads[0].top+=1;
   expect(await allowedDualPublication(db,{...binding,judgeJson:JSON.stringify(tampered)})).toBe(false);
   const key=(await db.asset.findUniqueOrThrow({where:{id:decided.assetId!}})).storagePath,bytes=await c.storage.get(key);
   const altered=Buffer.from(bytes);altered[altered.length-20]=altered[altered.length-20]!^1;await db.fileBlob.update({where:{key},data:{data:new Uint8Array(altered)}});
   expect(await allowedDualPublication(db,binding)).toBe(false);
   await db.fileBlob.update({where:{key},data:{data:new Uint8Array(bytes)}});
   expect(await allowedDualPublication(db,binding)).toBe(true);
   if(version===13){
    expect(d.authoredReturn.source).toMatchObject({width:3344,height:1882});
    expect(d.boardReview.dual.quality.sourceNeighbors).toBeDefined();
    // The original alias remains separately authenticated after C and after
    // its fresh ordinary all-role approval.
    const aliasMeta=JSON.parse(aliasAudit!.metaJson!);aliasMeta.retainedNormalHead.shippingSha256='0'.repeat(64);
    await db.auditLog.update({where:{id:aliasAudit!.id},data:{metaJson:JSON.stringify(aliasMeta)}});
    expect(await allowedDualPublication(db,binding)).toBe(false);
    await db.auditLog.update({where:{id:aliasAudit!.id},data:{metaJson:aliasAudit!.metaJson}});
    expect(await allowedDualPublication(db,binding)).toBe(true);
    // A later NEW unknown blocks further purchases, but cannot be erased by
    // deletion after this already-settled fresh MEDIUM and its C candidate.
    const budget=boardWizardBudgetOf(container);
    await budget.reserve(worldId,{requestKey:'synthetic-head-unverified-charge',scope:'image',operationFingerprint:'d'.repeat(64),reserveMicroUsd:200000});
    await budget.markUnknown(worldId,'synthetic-head-unverified-charge','Synthetic provider charge is unverified');
    const owner=(await db.game.findUniqueOrThrow({where:{id:gameId}})).ownerId!;
    expect(await deleteLocalPatchGame(container,gameId,{type:'USER',id:owner},owner)).toBe(true);
    expect((await db.auditLog.findUniqueOrThrow({where:{id:marker.auditId}})).metaJson).toBeNull();
    expect((await db.auditLog.findUniqueOrThrow({where:{id:aliasAudit!.id}})).metaJson).toBeNull();
    expect(await allowedDualPublication(db,binding)).toBe(false);
    expect((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson).not.toBe('');
    expect(await boardWizardBudgetOf(container).audit(worldId)).toMatchObject({unknownRequestKeys:['synthetic-head-unverified-charge'],reservedMicroUsd:200000});
   }
  }else{
   // A failed fresh review stays failed: no second correction, no swap back to older pixels.
   expect(decided.status).toBe('FAILED');expect(d.verdict.verdict).toBe('fail');
   expect(headPixelCorrectionCandidate(decided)).toBe(false);expect(retainedNormalHeadRecoveryCandidate(decided)).toBe(false);
   expect(await correctHeadPixels(container,gameId,[decided],async()=>{},readArt)).toBe(false);
  }
  expect((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson).not.toBe('');
  expect(fetch).not.toHaveBeenCalled();
 }finally{vi.useRealTimers();}
},300000);

it.each(['detectives','explorers'] as const)('restores an older paid normal crown after a failed third, keeping exhausted counters and requiring fresh MEDIUM; level=%s',async level=>{
 vi.useFakeTimers({toFake:['Date']});
 try{
  const f=await legacyKingdomHeadFixture('archived-normal-head-synthetic-'+level,'redraw-with-new-placement',level==='explorers',true),historical={...f.receipt};delete historical.headPolicyVersion;
  await db.targetVariantAsset.update({where:{id:f.candidate.id},data:{judgeJson:JSON.stringify(historical)}});
  const provider=controlledSol(false,false,undefined,true,false,f.version),retrieve=provider.fake.retrieve.bind(provider.fake);
  provider.fake.retrieve=async id=>{const response=await retrieve(id);if(response.status!=='completed')return response;
   const p=JSON.parse(provider.creates[provider.creates.length-1]!.prompt.split('\n').find(s=>s.startsWith('HEAD_RETURN_EVIDENCE: '))!.slice('HEAD_RETURN_EVIDENCE: '.length));
   const answer=JSON.parse(response.reading.raw!),head={...answer.head.rawHead,top:p.returned.top+6};
   Object.assign(answer.head,{rawHead:head,shippingHead:head,rawCrown:p.version==='target-head-return/v1'?'fail':'pass',shippingCrown:p.version==='target-head-return/v1'?'fail':'pass',observation:'Synthetic intact retained normal crown; the original six-pixel clearance refusal requires the new policy.'});
   return{...response,reading:{...response.reading,raw:JSON.stringify(answer)}};
  };
  const container={...c,backgroundReview:provider.fake,visualReview:{request:async()=>{throw Error('No duplicate synchronous judge');}}} as Container;
  const review=async()=>{for(let tick=0;tick<8;tick++){
   await reviewLocalPatchBoard(container,{gameId:f.gameId,sceneId:f.scene.id,deadlineAt:Date.now()+270000},{fence:async()=>{},readBoardArt:readArt});
   await advanceContinuityInBackground(container,f.gameId,{deadlineAt:Date.now()+270000});await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS+1);
   if(JSON.parse((await f.row()).judgeJson!).reviewState==='board-review-complete')break;
  }};
  await review();const old=await f.row(),oldReceipt=JSON.parse(old.judgeJson!);
  expect(old.status).toBe('FAILED');
  f.render.mockImplementationOnce(async()=>paintedOk(await sharp({create:{width:512,height:768,channels:4,background:'#ff00ff'}}).png().toBuffer(),bill('synthetic-failed-third-'+f.gameId,50000)));
  expect((await runLocalPatchHide(container,f.deps,{gameId:f.gameId,board:f.board,hide:f.hide,finalRepair:true})).state).toBe('gave-up');
  const third=await f.row(),birth=await singlePolicyModule.singleLowReviewAuthorization(db,f.gameId);
  // Synthetic historical exhausted counters test preservation, not real billing.
  const preserved={version:'local-patch-self-repair/v1',phase:'rejected',cycle:3,subjectV2Cycles:3,history:[{result:'synthetic-prior-exhausted-state'}]};
  const thirdReceipt={...JSON.parse(third.judgeJson!),selfRepair:preserved,guidedFrameRecovery:{version:GUIDED_FRAME_RECOVERY_VERSION,authorizationSha256:birth!.authorizationSha256,
   sourceImageSha256:oldReceipt.judgedSha256,sourceAssetId:old.assetId,sourceReviewRequestKey:oldReceipt.boardReview.dual.quality.requestKey,originalAttempts:2,repairCyclesPreserved:3,...(f.version===12?{sceneVersion:12}:{})}};
  await db.targetVariantAsset.update({where:{id:third.id},data:{judgeJson:JSON.stringify(thirdReceipt)}});
  await db.generationJob.update({where:{id:'job_'+f.gameId},data:{status:'FAILED',currentStep:'local-patch:recovery-exhausted',lastError:'local-patch: synthetic exhausted original third'}});
  // retained-normal-head-scan/v1: a scan that exits early (no completion grant yet) is never remembered.
  const remembered=()=>db.auditLog.count({where:{entityId:f.gameId,action:RETAINED_NORMAL_HEAD_SCAN_ACTION}});
  expect(await restoreRetainedNormalHeadOnce(container,f.gameId,'c'.repeat(64),[await f.row()],async()=>{},readArt)).toBe(false);
  expect(await remembered()).toBe(0);
  const game=await db.game.findUniqueOrThrow({where:{id:f.gameId}}),plan=await planQaCompletionCapacity(container,f.gameId);
  await authorizeQaCompletionCapacity(container,{gameId:f.gameId,operatorId:game.ownerId!,expectedPlanSha256:plan.planSha256,ownerAuthorizationSha256:'b'.repeat(64)});
  const before=await f.row(),worldId=boardWizardWorldId(f.gameId),ledger=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}}),renders=f.render.mock.calls.length;
  const originalAsset=await db.asset.findUniqueOrThrow({where:{id:old.assetId!}}),originalBytes=await c.storage.get(originalAsset.storagePath);
  await db.user.upsert({where:{id:'synthetic-foreign-owner'},update:{},create:{id:'synthetic-foreign-owner',email:'synthetic-foreign-owner@example.invalid'}});
  await db.asset.update({where:{id:originalAsset.id},data:{ownerId:'synthetic-foreign-owner'}});
  expect(await restoreRetainedNormalHead(container,f.gameId,[before],async()=>{},readArt)).toBe(false);
  await db.asset.update({where:{id:originalAsset.id},data:{ownerId:originalAsset.ownerId}});
  await c.storage.put(originalAsset.storagePath,Buffer.from('synthetic-corrupted-candidate'),'image/png');
  expect(await restoreRetainedNormalHead(container,f.gameId,[before],async()=>{},readArt)).toBe(false);
  await c.storage.put(originalAsset.storagePath,originalBytes,'image/png');
  await expect(restoreRetainedNormalHead(container,f.gameId,[before],async()=>{throw Error('Synthetic lost source fence');},readArt)).rejects.toThrow('Synthetic lost source fence');
  expect((await f.row()).judgeJson).toBe(before.judgeJson);
  expect((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson).toBe(ledger.snapshotJson);
  // A paid answer that has not landed yet: the scan restores nothing and remembers nothing,
  // so the same answer arriving later still restores for free.
  const grantSha=(await readQaCompletionCapacity(container,worldId))!.authorizationSha256;
  const intent=await db.auditLog.findFirstOrThrow({where:{entityId:f.gameId,action:'generation:sol-background-review',id:{endsWith:'_intent'},
   metaJson:{contains:JSON.stringify(oldReceipt.boardReview.dual.quality.requestKey)}}});
  const outcome=await db.auditLog.findUniqueOrThrow({where:{id:intent.id.replace(/_intent$/,'_outcome')}});
  await db.auditLog.delete({where:{id:outcome.id}});
  expect(await restoreRetainedNormalHeadOnce(container,f.gameId,grantSha,[before],async()=>{},readArt)).toBe(false);
  expect(await remembered()).toBe(0);expect((await f.row()).judgeJson).toBe(before.judgeJson);
  await db.auditLog.create({data:outcome});
  expect(await restoreRetainedNormalHead(container,f.gameId,[before],async()=>{},readArt)).toBe(true);
  expect(await remembered()).toBe(0);
  const restored=await f.row(),receipt=JSON.parse(restored.judgeJson!);
  expect(restored).toMatchObject({assetId:old.assetId,attempts:3,costCents:before.costCents,status:'GENERATED'});
  expect(receipt.selfRepair).toEqual(preserved);expect(receipt.retainedNormalHead).toMatchObject({version:RETAINED_NORMAL_HEAD_VERSION,originalAttempt:2,sourceRequestKey:`${f.hide.id}:${f.hide.pose}:render:2`});
  expect((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson).toBe(ledger.snapshotJson);
  const archive=await db.auditLog.findFirstOrThrow({where:{entityId:f.gameId,action:RETAINED_NORMAL_HEAD_ACTION}});
  expect(JSON.parse(archive.metaJson!)).toMatchObject({previousJudgeJson:before.judgeJson,providerCalls:0,cyclesPreserved:true});
  expect(await allowedDualPublication(db,{...publicationBinding(f.gameId,old),judgeJson:restored.judgeJson,sceneVersion:f.version})).toBe(false);
  await review();const accepted=await f.row(),final=JSON.parse(accepted.judgeJson!);
  expect(final.verdict.verdict).toBe('pass');expect(final.boardReview.dual.quality.headEvidence).toMatchObject({version:TARGET_HEAD_VISIBLE_VERSION,sourceBindingVersion:RETAINED_NORMAL_HEAD_VERSION,sourceRequestKey:`${f.hide.id}:${f.hide.pose}:render:2`});
  expect(await allowedDualPublication(db,{...publicationBinding(f.gameId,accepted),sceneVersion:f.version})).toBe(true);
  expect(await restoreRetainedNormalHead(container,f.gameId,[accepted],async()=>{},readArt)).toBe(false);
  const forged=JSON.parse(accepted.judgeJson!);forged.retainedNormalHead.sourceRequestKey=`${f.hide.id}:${f.hide.pose}:render:1`;
  expect(await allowedDualPublication(db,{...publicationBinding(f.gameId,accepted),judgeJson:JSON.stringify(forged),sceneVersion:f.version})).toBe(false);
  expect(f.render).toHaveBeenCalledTimes(renders);expect(f.diagnose).not.toHaveBeenCalled();expect(provider.creates).toHaveLength(2);expect(fetch).not.toHaveBeenCalled();
  const after=JSON.parse((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson),prior=JSON.parse(ledger.snapshotJson);
  for(const request of prior.requests)expect(after.requests.find((r:{requestKey:string})=>r.requestKey===request.requestKey)).toEqual(request);
  expect(after.requests).toHaveLength(prior.requests.length+1);
 }finally{vi.useRealTimers();}
},300000);

it('runs an unproductive optional retained scan once per candidate state, so a 100 s scan cannot starve the 175 s paid window',async()=>{
 vi.useFakeTimers({toFake:['Date']});
 try{
  // A real paid repair cycle, so the row carries an actual awaiting-review repair state.
  const f=await legacyKingdomHeadFixture('retained-scan-livelock-synthetic','redraw-with-new-placement',false);
  const provider=controlledSol(false,false,undefined,true,false,f.version),retrieve=provider.fake.retrieve.bind(provider.fake);
  provider.fake.retrieve=async id=>{const response=await retrieve(id);if(response.status!=='completed')return response;
   const p=JSON.parse(provider.creates[provider.creates.length-1]!.prompt.split('\n').find(s=>s.startsWith('HEAD_RETURN_EVIDENCE: '))!.slice('HEAD_RETURN_EVIDENCE: '.length));
   const answer=JSON.parse(response.reading.raw!),head={...answer.head.rawHead,top:p.returned.top+6};
   Object.assign(answer.head,{rawHead:head,shippingHead:head,rawCrown:'fail',shippingCrown:'fail',observation:'Synthetic refused normal crown.'});
   return{...response,reading:{...response.reading,raw:JSON.stringify(answer)}};
  };
  const container={...c,backgroundReview:provider.fake,visualReview:{request:async()=>{throw Error('No duplicate synchronous judge');}}} as Container;
  for(let tick=0;tick<8;tick++){
   await reviewLocalPatchBoard(container,{gameId:f.gameId,sceneId:f.scene.id,deadlineAt:Date.now()+270000},{fence:async()=>{},readBoardArt:readArt});
   await advanceContinuityInBackground(container,f.gameId,{deadlineAt:Date.now()+270000});await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS+1);
   if(JSON.parse((await f.row()).judgeJson!).reviewState==='board-review-complete')break;
  }
  const refused=await f.row();expect(refused.status).toBe('FAILED');
  expect(['awaiting-review','rejected']).toContain(JSON.parse(refused.judgeJson!).selfRepair?.phase);
  await db.generationJob.update({where:{id:'job_'+f.gameId},data:{status:'FAILED',currentStep:'local-patch:recovery-exhausted',lastError:'local-patch: synthetic exhausted original third'}});
  const game=await db.game.findUniqueOrThrow({where:{id:f.gameId}}),plan=await planQaCompletionCapacity(container,f.gameId);
  await authorizeQaCompletionCapacity(container,{gameId:f.gameId,operatorId:game.ownerId!,expectedPlanSha256:plan.planSha256,ownerAuthorizationSha256:'b'.repeat(64)});
  const before=await f.row(),grant=(await readQaCompletionCapacity(container,boardWizardWorldId(f.gameId)))!;
  // Both a retained-scan candidate and owed a paid repair under the completion grant.
  expect(retainedNormalHeadRecoveryCandidate(before)).toBe(true);expect(needsSelfRepair(before)).toBe(true);
  const start=Date.now();let clock=start;
  const now=vi.spyOn(Date,'now').mockImplementation(()=>clock);
  const recovery=await import('../retained-normal-head-recovery');
  // Reproduces QA's unproductive slice (~103 s before paid work): 170 s remain,
  // below the 175 s paid window (150 s provider minimum + 25 s phase margin).
  const scan=vi.spyOn(recovery,'restoreRetainedNormalHead').mockImplementation(async(...args)=>{
   clock+=100000;const report=args[5];if(report)report.complete=true;return false;});
  const paid=()=>f.render.mock.calls.length+f.diagnose.mock.calls.length,bought=paid();
  try{
   expect(await runLocalPatchWorldSlice(container,f.deps,f.gameId,{maxHides:1,hardDeadlineAt:clock+270000,diagnose:f.diagnose})).toMatchObject({claimed:true,pending:true,attention:null});
   expect(scan).toHaveBeenCalledOnce();expect(paid()).toBe(bought);
   // A later tick, same candidate state: no second scan; paid work gets its full window.
   clock+=60000;
   await runLocalPatchWorldSlice(container,f.deps,f.gameId,{maxHides:1,hardDeadlineAt:clock+270000,diagnose:f.diagnose});
   expect(scan).toHaveBeenCalledOnce();expect(paid()).toBeGreaterThan(bought);
   expect(await db.auditLog.count({where:{entityId:f.gameId,action:RETAINED_NORMAL_HEAD_SCAN_ACTION}})).toBe(1);
   // Any change to a candidate re-arms the scan.
   expect(await restoreRetainedNormalHeadOnce(container,f.gameId,grant.authorizationSha256,[{...before,judgeJson:before.judgeJson+' '}],async()=>{},readArt)).toBe(false);
   expect(scan).toHaveBeenCalledTimes(2);
   expect(fetch).not.toHaveBeenCalled();
  }finally{scan.mockRestore();now.mockRestore();}
 }finally{vi.useRealTimers();}
},300000);

it('accepts for free an exhausted appearance refused only by the collection variety rule (collection-variety-exhausted/v1)',async()=>{
 vi.useFakeTimers({toFake:['Date']});
 try{
  // A real paid repair cycle whose fresh all-role MEDIUM answer passes every check.
  const f=await legacyKingdomHeadFixture('variety-exhausted-synthetic','redraw-with-new-placement',true);
  const provider=controlledSol(false,false,undefined,true,false,f.version);
  const container={...c,backgroundReview:provider.fake,visualReview:{request:async()=>{throw Error('No duplicate synchronous judge');}}} as Container;
  for(let tick=0;tick<8;tick++){
   await reviewLocalPatchBoard(container,{gameId:f.gameId,sceneId:f.scene.id,deadlineAt:Date.now()+270000},{fence:async()=>{},readBoardArt:readArt});
   await advanceContinuityInBackground(container,f.gameId,{deadlineAt:Date.now()+270000});await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS+1);
   if(JSON.parse((await f.row()).judgeJson!).reviewState==='board-review-complete')break;
  }
  const passed=await f.row(),r=JSON.parse(passed.judgeJson!);
  expect(passed.status).toBe('GENERATED');expect(r.verdict.verdict).toBe('pass');expect(r.selfRepair?.version).toBe('local-patch-self-repair/v1');
  // The same paid answer as the collection refused it: the look already covered a third of the world.
  const refusal=r.hide+' repeats a look (three-quarter, closed-smile, acting) that 9 accepted appearances of this 27-hide world already show; at most 9 may share one look';
  const refusedAs=(cycles:number)=>JSON.stringify({...r,selfRepair:{...r.selfRepair,subjectV2Cycles:cycles},
   verdict:{...r.verdict,verdict:'fail',faults:[{check:'childPresent',where:'SUBJECT collectionVariety: '+refusal}]},qualityDisposition:{...r.qualityDisposition,state:'retry'},
   boardReview:{...r.boardReview,dual:{...r.boardReview.dual,subject:{...r.boardReview.dual.subject,collectionRefusal:refusal,failedChecks:['collectionVariety']}}}});
  await db.targetVariantAsset.update({where:{id:passed.id},data:{status:'FAILED',lastError:'quality-retry: childPresent',judgeJson:refusedAs(2)}});
  // While a repair cycle remains, variety still repaints: nothing is re-read.
  expect(localPatchVarietyExhaustedUndecided(await f.row())).toBe(false);
  await db.targetVariantAsset.update({where:{id:passed.id},data:{judgeJson:refusedAs(3)}});
  await db.gameScene.update({where:{id:f.scene.id},data:{generationStatus:'NEEDS_REGENERATION'}});
  const refused=await f.row();expect(localPatchVarietyExhaustedUndecided(refused)).toBe(true);
  // The world parked for a service decision; the completion grant wakes it for free.
  await db.generationJob.update({where:{id:'job_'+f.gameId},data:{status:'FAILED',currentStep:'local-patch:recovery-exhausted',lastError:'local-patch: synthetic exhausted variety'}});
  const game=await db.game.findUniqueOrThrow({where:{id:f.gameId}}),plan=await planQaCompletionCapacity(container,f.gameId);
  await authorizeQaCompletionCapacity(container,{gameId:f.gameId,operatorId:game.ownerId!,expectedPlanSha256:plan.planSha256,ownerAuthorizationSha256:'b'.repeat(64)});
  await db.generationJob.update({where:{id:'job_'+f.gameId},data:{status:'FAILED',currentStep:'local-patch:recovery-exhausted',
   lastError:'local-patch: 1 appearances spent their 3 automatic repair cycles under local-patch-subject/v2 ('+r.hide+'); nothing more is bought for them.'}});
  expect((await planQaCompletionRecovery(container,f.gameId))?.diagnosisRows).toContain(refused.id);
  expect(await resumeQaCompletionRecovery(container,f.gameId)).toBe(true);
  const worldId=boardWizardWorldId(f.gameId),ledger=JSON.parse((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson);
  const asked=provider.creates.length,painted=f.render.mock.calls.length,diagnosed=f.diagnose.mock.calls.length;
  // The world still holds the refused look on a third of its appearances; a last chance is not asked about it.
  const policy=await import('../../../domain/generation/subject-policy'),collection=vi.spyOn(policy,'subjectCollectionRefusal').mockReturnValue(refusal);
  let consulted=-1;
  try{await runLocalPatchWorldSlice(container,f.deps,f.gameId,{maxHides:1,hardDeadlineAt:Date.now()+270000,diagnose:f.diagnose});}
  finally{consulted=collection.mock.calls.length;collection.mockRestore();}
  expect(consulted).toBe(0);
  const decided=await f.row(),d=JSON.parse(decided.judgeJson!);
  expect(decided).toMatchObject({status:'GENERATED',assetId:refused.assetId,attempts:refused.attempts});expect(d.verdict.verdict).toBe('pass');
  expect(d.boardReview.dual.subject.collectionRefusal).toBeUndefined();expect(d.selfRepair.subjectV2Cycles).toBe(3);
  expect(d.reviewHistory.at(-1)).toMatchObject({supersededBy:COLLECTION_VARIETY_EXHAUSTED_VERSION,lastError:'quality-retry: childPresent'});
  // Free for this appearance: the same paid answer, no new question, painting or diagnosis for it.
  // (The slice may go on to paint an untouched sibling of this synthetic world.)
  expect(provider.creates).toHaveLength(asked);expect(f.diagnose).toHaveBeenCalledTimes(diagnosed);
  expect(f.render.mock.calls.slice(painted).every(([input])=>!input.requestKey.startsWith(r.hide+':'))).toBe(true);
  const after=JSON.parse((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson);
  for(const request of ledger.requests)expect(after.requests.find((x:{requestKey:string})=>x.requestKey===request.requestKey)).toEqual(request);
  expect(after.requests.filter((x:{requestKey:string})=>!ledger.requests.some((p:{requestKey:string})=>p.requestKey===x.requestKey))
   .every((x:{requestKey:string;scope:string})=>x.scope!=='judge'&&!x.requestKey.startsWith(r.hide+':'))).toBe(true);
  expect(localPatchVarietyExhaustedUndecided(decided)).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
 }finally{vi.useRealTimers();}
},300000);

it("freezes the last authenticated crown coordinates before a new diagnostic purchase without changing an earlier paid question", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    const f = await legacyKingdomHeadFixture("legacy-head-next-diagnosis-synthetic", "redraw-with-new-placement");
    const firstPrompt = f.diagnose.mock.calls[0]![0].prompt;
    expect(firstPrompt).not.toContain("FROZEN TARGET HEAD DATA");
    const provider = controlledSol(false, false, undefined, true, false, 12), retrieve = provider.fake.retrieve.bind(provider.fake);
    provider.fake.retrieve = async id => {
      const response = await retrieve(id);
      if (response.status !== "completed") return response;
      const answer = JSON.parse(response.reading.raw!), proof = JSON.parse(provider.creates[0]!.prompt.split("\n").find(line => line.startsWith("HEAD_RETURN_EVIDENCE: "))!.slice("HEAD_RETURN_EVIDENCE: ".length));
      answer.head.shippingHead.top = proof.returned.top + 3; answer.head.shippingCrown = "fail";
      return { ...response, reading: { ...response.reading, raw: JSON.stringify(answer) } };
    };
    const container = { ...c, backgroundReview: provider.fake, visualReview: { request: async () => { throw Error("No duplicate synchronous judge"); } } } as Container;
    for (let tick = 0; tick < 8; tick++) {
      await reviewLocalPatchBoard(container, { gameId: f.gameId, sceneId: f.scene.id, deadlineAt: Date.now() + 270000 }, { fence: async () => {}, readBoardArt: readArt });
      await advanceContinuityInBackground(container, f.gameId, { deadlineAt: Date.now() + 270000 });
      await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS + 1);
      if (JSON.parse((await f.row()).judgeJson!).reviewState === "board-review-complete") break;
    }
    const refused = await f.row(), prior = JSON.parse(refused.judgeJson!); expect(refused.status).toBe("FAILED");
    await runLocalPatchSelfRepair(container, { gameId: f.gameId, sceneId: f.scene.id, board: f.board, hide: f.hide }, f.deps);
    const frozen = JSON.parse((await f.row()).judgeJson!).selfRepair;
    expect(frozen).toMatchObject({ phase: "diagnosing", cycle: 2, subjectV2Cycles: 2, headContext: { version: "target-head-repair/v1",
      evidence: { sourceRequestKey: f.receipt.compositionSource, returned: f.decision.returnWindow }, answer: { shippingCrown: "fail" } } });
    expect(frozen.headContext.evidence).toEqual(prior.boardReview.dual.quality.headEvidence);
    expect(f.diagnose).toHaveBeenCalledTimes(1);
    // A legacy state can first need its ordinary schema-order freeze; that
    // free phase must preserve the exact context rather than dispatch twice.
    for (let tick = 0; tick < 3 && f.diagnose.mock.calls.length < 2; tick++) {
      await runLocalPatchSelfRepair(container, { gameId: f.gameId, sceneId: f.scene.id, board: f.board, hide: f.hide }, f.deps);
      expect(JSON.parse((await f.row()).judgeJson!).selfRepair.headContext).toEqual(frozen.headContext);
    }
    expect(f.diagnose).toHaveBeenCalledTimes(2);
    expect(f.diagnose.mock.calls[0]![0].prompt).toBe(firstPrompt);
    expect(f.diagnose.mock.calls[1]![0].prompt).toContain("FROZEN TARGET HEAD DATA (target-head-repair/v1)");
    expect(f.diagnose.mock.calls[1]![0].prompt).toContain(JSON.stringify(f.receipt.compositionSource));
    expect(f.render).toHaveBeenCalledTimes(3); expect(fetch).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
}, 300000);

it.each([["explorers", "awaiting-review", 1], ["detectives", "awaiting-review", 1], ["explorers", "rejected", 1], ["detectives", "rejected", 1],
  ["explorers", "awaiting-review", 2], ["detectives", "awaiting-review", 2]] as const)("continues a %s guided third after %s with %s paid repair cycles without rebuying or resetting its old context", async (level, priorPhase, priorCycles) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    const f = await legacyKingdomHeadFixture("mixed-paid-cycle-guided-third-synthetic-" + level + "-" + priorPhase + "-" + priorCycles, "redraw-with-new-placement", level === "explorers");
    const provider = controlledSol(false, true, f.hide.id, true, false, f.version, priorCycles + 1), container = { ...c, backgroundReview: provider.fake,
      visualReview: { request: async () => { throw Error("No duplicate synchronous judge"); } } } as Container;
    const review = async () => { for (let tick = 0; tick < 8; tick++) {
      await reviewLocalPatchBoard(container, { gameId: f.gameId, sceneId: f.scene.id, deadlineAt: Date.now() + 270000 }, { fence: async () => {}, readBoardArt: readArt });
      await advanceContinuityInBackground(container, f.gameId, { deadlineAt: Date.now() + 270000 });
      await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS + 1);
      if (JSON.parse((await f.row()).judgeJson!).reviewState === "board-review-complete") break;
    } };
    await review();
    if (priorCycles === 2) {
      // A genuinely different bounded recipe and synthetic painting: the
      // ordinary duplicate-recipe/pixel guards remain active in this fixture.
      f.decision.faceRect = { ...f.decision.faceRect, left: f.decision.faceRect.left + 1 };
      for (let phase = 0; phase < 6; phase++) {
        await runLocalPatchSelfRepair(container, { gameId: f.gameId, sceneId: f.scene.id, board: f.board, hide: f.hide }, f.deps);
        if ((await f.row()).status === "GENERATED") break;
      }
      expect((await f.row()).status).toBe("GENERATED"); await review();
    }
    const before = await f.row(), beforeReceipt = JSON.parse(before.judgeJson!);
    if (priorPhase === "rejected") {
      beforeReceipt.selfRepair.phase = "rejected"; beforeReceipt.selfRepair.feedback = "Earlier synthetic plan was refused before the third painting";
      await db.targetVariantAsset.update({ where: { id: before.id }, data: { judgeJson: JSON.stringify(beforeReceipt) } });
    }
    const oldRepair = beforeReceipt.selfRepair;
    expect(before.status).toBe("FAILED"); expect(oldRepair.subjectV2Cycles).toBe(priorCycles);
    expect((await runLocalPatchHide(container, f.deps, { gameId: f.gameId, board: f.board, hide: f.hide, finalRepair: true, guidedFrame: true })).state).toBe("generated");
    await review(); const third = await f.row(), receipt = JSON.parse(third.judgeJson!);
    expect(third).toMatchObject({ status: "FAILED", attempts: 3 });
    expect(receipt.guidedFrameRecovery).toMatchObject({ originalAttempts: 2, repairCyclesPreserved: priorCycles });
    expect(receipt.selfRepair).toEqual(oldRepair);
    const step = () => runLocalPatchSelfRepair(container, { gameId: f.gameId, sceneId: f.scene.id, board: f.board, hide: f.hide }, f.deps);
    await expect(step()).rejects.toThrow("Pinned recovery context changed");
    await db.generationJob.update({ where: { id: "job_" + f.gameId }, data: { status: "FAILED", currentStep: "local-patch:recovery-exhausted", lastError: "local-patch: synthetic exhausted hold" } });
    const game = await db.game.findUniqueOrThrow({ where: { id: f.gameId } }), plan = await planQaCompletionCapacity(container, f.gameId);
    await authorizeQaCompletionCapacity(container, { gameId: f.gameId, operatorId: game.ownerId!, expectedPlanSha256: plan.planSha256, ownerAuthorizationSha256: "a".repeat(64) });
    const ledger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: boardWizardWorldId(f.gameId) } });
    const forged = JSON.parse(third.judgeJson!); forged.selfRepair.contextSha256 = "f".repeat(64);
    await db.targetVariantAsset.update({ where: { id: third.id }, data: { judgeJson: JSON.stringify(forged) } });
    await expect(step()).rejects.toThrow("Pinned recovery context changed");
    forged.selfRepair = { ...oldRepair, phase: "applying" };
    await db.targetVariantAsset.update({ where: { id: third.id }, data: { judgeJson: JSON.stringify(forged) } });
    await expect(step()).rejects.toThrow("Pinned recovery context changed");
    await db.targetVariantAsset.update({ where: { id: third.id }, data: { judgeJson: third.judgeJson } });
    await db.order.update({ where: { id: "order-" + f.gameId }, data: { paymentStatus: "REFUNDED" } });
    await expect(step()).rejects.toThrow("live paid complete collection");
    await db.order.update({ where: { id: "order-" + f.gameId }, data: { paymentStatus: "PAID" } });
    expect((await f.row()).judgeJson).toBe(third.judgeJson);
    await step();
    const resumed = await f.row(), resumedReceipt = JSON.parse(resumed.judgeJson!);
    expect(resumed).toMatchObject({ attempts: 3, costCents: third.costCents, assetId: third.assetId });
    expect(resumedReceipt.selfRepair).toMatchObject({ phase: "diagnosing", cycle: priorCycles + 1, subjectV2Cycles: priorCycles + 1 });
    expect(resumedReceipt.selfRepair.contextSha256).not.toBe(oldRepair.contextSha256);
    expect(resumedReceipt.selfRepair.history.length).toBeGreaterThanOrEqual(oldRepair.history.length);
    expect(resumedReceipt.selfRepair.feedback).toBe(third.lastError);
    expect(resumedReceipt.selfRepair.sourceKeys).toEqual([...new Set([...oldRepair.sourceKeys, `${f.hide.id}:${f.hide.pose}:render:3`])]);
    expect(resumedReceipt.selfRepair.subjectContext.failedSource).toBe(`${f.hide.id}:${f.hide.pose}:render:3`);
    if (priorPhase === "awaiting-review") expect(resumedReceipt.selfRepair.history.at(-1)).toMatchObject({
      result: "visual-review-refused-before-guided-third", imageSha256: receipt.guidedFrameRecovery.sourceImageSha256 });
    expect((await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: ledger.worldId } })).snapshotJson).toBe(ledger.snapshotJson);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "local-patch:qa-guided-repair-context", entityId: f.gameId } });
    expect(JSON.parse(audit.metaJson!)).toMatchObject({ previousJudgeJson: third.judgeJson, priorCyclesPreserved: priorCycles, requestsPreserved: true, providerCalls: 0 });
    expect(f.render).toHaveBeenCalledTimes(3 + priorCycles); expect(f.diagnose).toHaveBeenCalledTimes(priorCycles); expect(fetch).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
}, 300000);

it("pins whole-target and outside-source guides before new purchases, replays them after interruption and preserves pre-upgrade pending requests", async()=>{
  const gameId="kingdom-prospective-frame-synthetic";await newDetectiveWorld(gameId,7,true,false,true);
  const context=await resolveLocalPatchBoardsForGame(db,gameId,13),board=context.boards.find(b=>b.board==="icepalace")!;
  const [fresh,old,stale]=board.hides,claims=new Map<string,string>(),calls:string[]=[],v1Keys=new Set<string>();
  const masks=new Map<string,{bandOpen:number;open:number;expected:number}>();
  const deps:LocalPatchHideDeps={readBoardArt:readArt,renderPolicySha256:localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY),
    judge:async()=>{throw Error("Synthetic framing test must never buy a synchronous review");},render:async input=>{
      calls.push(input.requestKey);const hide=board.hides.find(h=>input.requestKey.startsWith(h.id+":"))!;
      const pending=await db.targetVariantAsset.findFirstOrThrow({where:{targetInstance:{gameScene:{gameId},targetId:hide.targetId}}});
      expect(pending).toMatchObject({status:"PENDING",attempts:Number(input.requestKey.split(":").at(-1))});
      claims.set(input.requestKey,pending.judgeJson!);
      const guided=hide!==old||input.requestKey.endsWith(":render:2");
      expect(!!input.placementGuidePng).toBe(guided);
      const child=maskForHide(hide),returned=localPatchReturnRegion(cropOf(hide),child,hide.returnRect).local;
      if(guided){
        // New pins buy v2; a v1 pin persisted before the upgrade buys exactly v1.
        const version=v1Keys.has(input.requestKey)?PLACEMENT_GUIDE_VERSION:PLACEMENT_GUIDE_V2_VERSION,v2=version===PLACEMENT_GUIDE_V2_VERSION;
        expect(input.placementGuideVersion).toBe(version);
        expect(JSON.parse(pending.judgeJson!).placementGuide).toMatchObject({version,hideId:hide.id,attempt:pending.attempts});
        const meta=await sharp(input.placementGuidePng!).metadata();expect([meta.width,meta.height]).toEqual(v2?[512,768]:[1024,768]);
        if(v2){
          expect(input.prompt).toContain("SAME scale and framing");expect(input.prompt).not.toContain("RIGHT is scaled ORIGINAL SOURCE CONTEXT");
          const {data}=await sharp(input.maskPng).ensureAlpha().raw().toBuffer({resolveWithObject:true});let bandOpen=0,open=0;
          for(let y=returned.top;y<returned.top+returned.height;y++)for(let x=returned.left;x<returned.left+returned.width;x++){
            const isOpen=data[(y*512+x)*4+3]===0;if(isOpen)open++;
            if(isOpen&&Math.min(x-returned.left,y-returned.top,returned.left+returned.width-1-x,returned.top+returned.height-1-y)<12)bandOpen++;
          }
          // Recorded, not thrown: a throw inside the purchase surfaces only as "stopped".
          masks.set(input.requestKey,{bandOpen,open,expected:(returned.width-24)*(returned.height-24)});
        }else{
          expect(input.prompt).toContain("RIGHT is scaled ORIGINAL SOURCE CONTEXT");
          expect(input.prompt).toContain("never erase its torso while its original head survives outside the crop");
        }
      }
      const frame=guided?guidedFrameGeometry(child,returned).target:child;
      const figure=await sharp({create:{width:Math.round(frame.width*0.6),height:Math.round(frame.height*0.7),channels:4,background:"#385ca0"}}).png().toBuffer();
      return paintedOk(await sharp(input.stylePng).composite([{input:figure,left:frame.left+Math.round(frame.width*0.2),top:frame.top+Math.round(frame.height*0.2)}]).png().toBuffer(),bill("frame-"+input.requestKey));
    }};
  const first=await runLocalPatchHide(c,deps,{gameId,board,hide:fresh!});
  const firstMask=masks.get(fresh!.id+":"+fresh!.pose+":render:1")!;
  expect(firstMask.bandOpen).toBe(0);expect(firstMask.open).toBe(firstMask.expected);
  expect(first.state).toBe("generated");
  const row=await db.targetVariantAsset.findFirstOrThrow({where:{targetInstance:{gameScene:{gameId},targetId:fresh!.targetId}}});
  expect(JSON.parse(row.judgeJson!).reviewState).toBe("pending-board-review");
  const ledger=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId:boardWizardWorldId(gameId)}});
  await db.targetVariantAsset.update({where:{id:row.id},data:{status:"PENDING",judgeJson:claims.get(fresh!.id+":"+fresh!.pose+":render:1")}});
  expect((await runLocalPatchHide(c,deps,{gameId,board,hide:fresh!}))).toMatchObject({state:"generated",replayed:true,attempt:1});
  expect(calls).toHaveLength(1);expect(await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId:ledger.worldId}})).toEqual(ledger);
  const restored=await db.targetVariantAsset.findUniqueOrThrow({where:{id:row.id}}),foreign=JSON.parse(claims.get(fresh!.id+":"+fresh!.pose+":render:1")!);
  foreign.placementGuide.sourceSha256="f".repeat(64);
  await db.targetVariantAsset.update({where:{id:row.id},data:{status:"PENDING",judgeJson:JSON.stringify(foreign)}});
  await expect(runLocalPatchHide(c,deps,{gameId,board,hide:fresh!})).rejects.toThrow("Persisted placement guide differs");
  expect(calls).toHaveLength(1);expect(await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId:ledger.worldId}})).toEqual(ledger);
  await db.targetVariantAsset.update({where:{id:row.id},data:{status:restored.status,judgeJson:restored.judgeJson}});
  const scene=await db.gameScene.findFirstOrThrow({where:{gameId,sceneSlug:board.board}}),definition=sceneBySlug(board.board,13),target=definition.targets.find(t=>t.id===old!.targetId)!;
  const instance=await db.targetInstance.create({data:{id:"tgt-old-frame-synthetic",gameSceneId:scene.id,targetId:target.id,targetType:target.targetType,
    spriteKind:"image",slotAId:target.slots[0].id,slotBId:target.slots[1].id}});
  await db.targetVariantAsset.create({data:{id:"tva-old-frame-synthetic",targetInstanceId:instance.id,variant:"A",slotId:target.slots[0].id,
    provider:"local-patch",promptVersion:row.promptVersion,attempts:1,status:"PENDING"}});
  expect((await runLocalPatchHide(c,deps,{gameId,board,hide:old!}))).toMatchObject({state:"generated",attempt:1});
  expect(calls).toHaveLength(2);
  const oldRow=await db.targetVariantAsset.update({where:{id:"tva-old-frame-synthetic"},data:{status:"FAILED",lastError:"quality-retry: synthetic framing defect"}});
  expect(JSON.parse(oldRow.judgeJson!).placementGuide).toBeUndefined();
  expect((await runLocalPatchHide(c,deps,{gameId,board,hide:old!}))).toMatchObject({state:"generated",attempt:2});
  expect(calls).toHaveLength(3);
  const staleTarget=definition.targets.find(t=>t.id===stale!.targetId)!;
  const staleInstance=await db.targetInstance.create({data:{id:"tgt-stale-frame-synthetic",gameSceneId:scene.id,targetId:staleTarget.id,targetType:staleTarget.targetType,
    spriteKind:"image",slotAId:staleTarget.slots[0].id,slotBId:staleTarget.slots[1].id}});
  await db.targetVariantAsset.create({data:{id:"tva-stale-frame-synthetic",targetInstanceId:staleInstance.id,variant:"A",slotId:staleTarget.slots[0].id,
    provider:"local-patch",promptVersion:row.promptVersion,attempts:1,status:"PENDING",updatedAt:new Date(Date.now()-PENDING_IMAGE_LEASE_MS-1)}});
  expect(await boardWizardBudgetOf(c).readRequest(boardWizardWorldId(gameId),stale!.id+":"+stale!.pose+":render:1")).toBeNull();
  expect((await runLocalPatchHide(c,deps,{gameId,board,hide:stale!}))).toMatchObject({state:"generated",attempt:1});
  expect(calls).toHaveLength(4);
  // A pre-upgrade claim of a second painting that wrote a v1 pin and never dispatched keeps v1 byte for byte.
  const freshClaim=JSON.parse(claims.get(fresh!.id+":"+fresh!.pose+":render:1")!),v1Pin={...freshClaim.placementGuide,version:PLACEMENT_GUIDE_VERSION,attempt:2};
  const freshDone=await db.targetVariantAsset.findUniqueOrThrow({where:{id:row.id}});
  await db.targetVariantAsset.update({where:{id:freshDone.id},data:{status:"PENDING",attempts:2,lastError:"quality-retry: synthetic framing defect",
    judgeJson:JSON.stringify({...JSON.parse(freshDone.judgeJson!),placementGuide:v1Pin}),updatedAt:new Date(Date.now()-PENDING_IMAGE_LEASE_MS-1)}});
  expect(await boardWizardBudgetOf(c).readRequest(boardWizardWorldId(gameId),fresh!.id+":"+fresh!.pose+":render:2")).toBeNull();
  v1Keys.add(fresh!.id+":"+fresh!.pose+":render:2");
  expect((await runLocalPatchHide(c,deps,{gameId,board,hide:fresh!}))).toMatchObject({state:"generated",attempt:2});
  expect(calls).toHaveLength(5);expect(calls.at(-1)).toBe(fresh!.id+":"+fresh!.pose+":render:2");
  expect([...masks.keys()].sort()).toEqual([fresh!.id+":"+fresh!.pose+":render:1",old!.id+":"+old!.pose+":render:2",stale!.id+":"+stale!.pose+":render:1"].sort());
  for(const mask of masks.values()){expect(mask.bandOpen).toBe(0);expect(mask.open).toBe(mask.expected);}expect((await boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId))).capMicroUsd).toBe(4000000);
  expect(fetch).not.toHaveBeenCalled();
},300000);

it("v2 asks for the registered Tokyo target to be replaced whole, never kept, and still protects people beyond the return",async()=>{
  const gameId="journey-tokyo-target-role-synthetic";await newDetectiveWorld(gameId,7,true);
  const context=await resolveLocalPatchBoardsForGame(db,gameId,13),board=context.boards.find(b=>b.board==="tokyo")!;
  const hide=board.hides.find(h=>h.id==="tokyo-detectives-hide-3")!,crop=cropOf(hide),child=maskForHide(hide);
  const returned=localPatchReturnRegion(crop,child,hide.returnRect).local,open=placementGuideEditableRect(child,returned);
  type Box={left:number;top:number;width:number;height:number};
  const local=(r:Box)=>({left:r.left-crop.left,top:r.top-crop.top,width:r.width,height:r.height});
  const within=(a:Box,b:Box)=>a.left>=b.left&&a.top>=b.top&&a.left+a.width<=b.left+b.width&&a.top+a.height<=b.top+b.height;
  // The actual public registration lists the authored target itself among its heads.
  const neighbors=sourcePlacementForHide(context,hide.id)!.sourceNeighbors!.contract.neighbors;
  const target=neighbors.find(n=>n.sourceId==="source-gray-capsule-child")!;
  expect(local(target.head)).toEqual({left:82,top:112,width:142,height:160});expect(within(local(target.head),child)).toBe(true);
  let seen:{prompt:string;mask:Buffer;guide:Buffer}|undefined;
  const deps:LocalPatchHideDeps={readBoardArt:readArt,renderPolicySha256:localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY),
    judge:async()=>{throw Error("Synthetic role test must never buy a synchronous review");},render:async input=>{
      seen={prompt:input.prompt,mask:input.maskPng,guide:input.placementGuidePng!};
      const frame=guidedFrameGeometry(child,returned).target;
      const figure=await sharp({create:{width:Math.round(frame.width*0.6),height:Math.round(frame.height*0.7),channels:4,background:"#385ca0"}}).png().toBuffer();
      return paintedOk(await sharp(input.stylePng).composite([{input:figure,left:frame.left+Math.round(frame.width*0.2),top:frame.top+Math.round(frame.height*0.2)}]).png().toBuffer(),bill("tokyo-role-"+input.requestKey));
    }};
  await runLocalPatchHide(c,deps,{gameId,board,hide});
  expect(seen).toBeDefined();const {prompt}=seen!;
  // The assembled request: source-bound data registers the target, and the guide never tells the painter to keep it.
  expect(prompt).toContain("local-patch-authored-paint/v1");expect(prompt).toContain('"sourceId":"source-gray-capsule-child"');
  expect(prompt).toContain(PLACEMENT_GUIDE_V2_VERSION);
  expect(prompt).toContain("including the original authored TARGET when registered; these boxes are not a required final person count");
  expect(prompt).toContain("Replace the authored TARGET WHOLE with the canonical child, leaving no original face, body or limb remnant");
  expect(prompt).not.toMatch(/each of those people stays whole/i);expect(prompt).not.toMatch(/never a neighbour/i);
  expect(prompt).toContain("a person continuing outside the return window or input crop keeps the exact original coordinates and intact visible fragments");
  // The mask agrees: the target's whole original head is open to replacement, everything beyond the opening is shut.
  const {data}=await sharp(seen!.mask).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const isOpen=(x:number,y:number)=>data[(y*512+x)*4+3]===0,head=local(target.head);
  let headShut=0,beyondOpen=0,beyond=0;
  for(let y=head.top;y<head.top+head.height;y++)for(let x=head.left;x<head.left+head.width;x++)if(!isOpen(x,y))headShut++;
  // Every pixel beyond the opening, so every fragment of a person continuing outside the return, stays shut.
  for(let y=0;y<768;y++)for(let x=0;x<512;x++)if(!within({left:x,top:y,width:1,height:1},open)){beyond++;if(isOpen(x,y))beyondOpen++;}
  expect(headShut).toBe(0);expect(beyond).toBe(512*768-open.width*open.height);expect(beyondOpen).toBe(0);
  expect(neighbors.some(n=>!within(local(n.head),returned))).toBe(true);
  // The guide marks the target's registered head where the cyan frame asks for the replacement.
  const guide=await sharp(seen!.guide).removeAlpha().raw().toBuffer();let magenta=0;
  for(let y=head.top;y<head.top+head.height;y++)for(let x=head.left;x<head.left+head.width;x++){const i=(y*512+x)*3;if(guide[i]!>200&&guide[i+1]!<100&&guide[i+2]!>140)magenta++;}
  expect(magenta).toBeGreaterThan(100);expect(fetch).not.toHaveBeenCalled();
},300000);

it.each(["detectives","explorers"] as const)("authorizes one source-bound %s Kingdom completion frame without resetting attempts, UNKNOWN reserves or quality",async level=>{
  const explorer=level==="explorers",gameId="kingdom-completion-capacity-synthetic-"+level;
  await newDetectiveWorld(gameId,7,true,explorer,true);await ensureSingleMediumReviewPolicy(c,gameId,async()=>{});
  const version=explorer?12:13,context=await resolveLocalPatchBoardsForGame(db,gameId,version),board=context.boards.find(b=>b.board==="castlegate")!,hide=board.hides[0]!;
  const render=vi.fn<LocalPatchHideDeps["render"]>(async input=>paintedOk(input.stylePng,bill("synthetic-completion-paint",50000)));
  const deps:LocalPatchHideDeps={readBoardArt:readArt,renderPolicySha256:localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY),render,
    judge:async()=>{throw Error("No synchronous review in a capacity grant");}};
  await runLocalPatchHide(c,deps,{gameId,board,hide});
  const game=await db.game.findUniqueOrThrow({where:{id:gameId}}),budget=boardWizardBudgetOf(c),worldId=boardWizardWorldId(gameId);
  const fill=3_700_000-(await budget.audit(worldId)).committedMicroUsd;
  await budget.reserve(worldId,{requestKey:"synthetic-precompletion-work",scope:"image",operationFingerprint:"d".repeat(64),reserveMicroUsd:fill});
  await budget.settle(worldId,"synthetic-precompletion-work",bill("synthetic-precompletion-work",fill));
  await budget.reserve(worldId,{requestKey:"synthetic-retained-unknown",scope:"judge",operationFingerprint:"e".repeat(64),reserveMicroUsd:210000});
  await budget.markUnknown(worldId,"synthetic-retained-unknown","Synthetic terminal provider response has no verifiable usage");
  await db.generationJob.update({where:{id:"job_"+gameId},data:{status:"FAILED",currentStep:"local-patch:recovery-exhausted",lastError:"local-patch: synthetic exhausted capacity"}});
  const rows=await db.targetVariantAsset.findMany({where:{targetInstance:{gameScene:{gameId}}},orderBy:{id:"asc"}}),job=await db.generationJob.findUniqueOrThrow({where:{id:"job_"+gameId}});
  let ledger=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}});
  const child=await db.childProfile.findUniqueOrThrow({where:{id:game.childProfileId!}});
  let plan=await planQaCompletionCapacity(c,gameId);const input={gameId,operatorId:game.ownerId!,expectedPlanSha256:plan.planSha256,ownerAuthorizationSha256:"a".repeat(64)};
  expect(plan.binding).toMatchObject({capMicroUsd:QA_COMPLETION_CAP,committedMicroUsd:3910000,reservedMicroUsd:210000,unknowns:[{requestKey:"synthetic-retained-unknown",reserveMicroUsd:210000}]});
  expect(await db.generationJob.findUniqueOrThrow({where:{id:job.id}})).toEqual(job);
  await expect(authorizeQaCompletionCapacity(c,{...input,operatorId:"forged-operator"})).rejects.toThrow("Owner administrator");
  await expect(authorizeQaCompletionCapacity(c,{...input,expectedPlanSha256:"f".repeat(64)})).rejects.toThrow("plan changed");
  const photo=await db.asset.findUniqueOrThrow({where:{id:child.originalPhotoAssetId!}}),source=await c.storage.get(photo.storagePath);
  await c.storage.put(photo.storagePath,Buffer.from("synthetic changed source pixels"),photo.mimeType);
  await expect(authorizeQaCompletionCapacity(c,input)).rejects.toThrow("Exact live source pixels");await c.storage.put(photo.storagePath,source,photo.mimeType);
  await db.worldBudgetLedger.update({where:{worldId},data:{revision:{increment:1}}});
  await expect(authorizeQaCompletionCapacity(c,input)).rejects.toThrow("plan changed");
  expect(await db.auditLog.findUnique({where:{id:qaCompletionCapacityId(gameId)}})).toBeNull();
  ledger=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}});plan=await planQaCompletionCapacity(c,gameId);input.expectedPlanSha256=plan.planSha256;
  const originalGet=c.storage.get.bind(c.storage),originalTransaction=db.$transaction.bind(db);
  let inGrantTransaction=false,externalSourceReads=0;
  const sourceRead=vi.spyOn(c.storage,"get").mockImplementation(async key=>{
    externalSourceReads++;
    if(inGrantTransaction)throw Error("Synthetic single-connection guard: completion source escaped transaction");
    return originalGet(key);
  });
  const transaction=vi.spyOn(db,"$transaction").mockImplementation(((work:(tx:import("@prisma/client").Prisma.TransactionClient)=>Promise<unknown>,options?:unknown)=>
    originalTransaction(async tx=>{inGrantTransaction=true;try{return await work(tx);}finally{inGrantTransaction=false;}},options as never)) as typeof db.$transaction);
  let pin;
  try{pin=await authorizeQaCompletionCapacity(c,input);expect(externalSourceReads).toBeGreaterThan(0);}
  finally{transaction.mockRestore();sourceRead.mockRestore();}
  expect(pin.capMicroUsd).toBe(QA_COMPLETION_CAP);
  expect(await qaCompletionCapacityStatus(c,gameId)).toMatchObject({ownerId:game.ownerId,capMicroUsd:QA_COMPLETION_CAP,status:"active"});
  expect(await authorizeQaCompletionCapacity(c,input)).toEqual(pin);
  expect(await db.auditLog.count({where:{id:qaCompletionCapacityId(gameId)}})).toBe(1);
  expect(await db.generationJob.findUniqueOrThrow({where:{id:job.id}})).toMatchObject({status:"QUEUED",currentStep:"local-patch",attempts:job.attempts});
  expect(await db.targetVariantAsset.findMany({where:{targetInstance:{gameScene:{gameId}}},orderBy:{id:"asc"}})).toEqual(rows);
  const afterLedger=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}});expect(afterLedger.snapshotJson).toBe(ledger.snapshotJson);expect(afterLedger.revision).toBe(ledger.revision+1);
  expect(await budget.audit(worldId)).toMatchObject({capMicroUsd:QA_COMPLETION_CAP,committedMicroUsd:3910000,reservedMicroUsd:210000,unknownRequestKeys:["synthetic-retained-unknown"]});
  expect(await readQaCompletionCapacity(c,worldId)).toMatchObject({worldId,capMicroUsd:QA_COMPLETION_CAP});
  await db.childProfile.update({where:{id:child.id},data:{ageYears:8}});expect(await readQaCompletionCapacity(c,worldId)).toBeNull();
  expect(await qaCompletionCapacityStatus(c,gameId)).toMatchObject({ownerId:game.ownerId,status:"withdrawn"});
  await db.childProfile.update({where:{id:child.id},data:{ageYears:child.ageYears}});
  const order=await db.order.findUniqueOrThrow({where:{id:"order-"+gameId}});await db.order.update({where:{id:order.id},data:{paymentStatus:"REFUNDED"}});
  expect(await readQaCompletionCapacity(c,worldId)).toBeNull();await db.order.update({where:{id:order.id},data:{paymentStatus:order.paymentStatus}});
  const other=await db.user.create({data:{id:"synthetic-other-owner-"+level,email:"other-"+level+"@example.invalid"}});
  await db.game.update({where:{id:gameId},data:{ownerId:other.id}});expect(await readQaCompletionCapacity(c,worldId)).toBeNull();await db.game.update({where:{id:gameId},data:{ownerId:game.ownerId}});
  expect(await readQaCompletionCapacity(c,worldId)).not.toBeNull();
  const row=rows[0]!,receipt=JSON.parse(row.judgeJson!);
  expect(await allowedDualPublication(db,{gameId,sceneVersion:version,hideId:receipt.hide,variantId:row.id,attempts:row.attempts,
    identityAssetId:child.identityAssetId!,identitySha256:plan.binding.state.identitySha256,assetId:row.assetId!,imageSha256:receipt.judgedSha256,
    geometrySha256:receipt.geometrySha256,judgeJson:row.judgeJson})).toBe(false);
  expect(render).toHaveBeenCalledTimes(1);expect(fetch).not.toHaveBeenCalled();
},300000);

it.each(["detectives","explorers"] as const)("publishes all 27 %s Kingdom hides after explicit completion and retains its cap after the real source purge",async level=>{
  vi.useFakeTimers({toFake:["Date"]});
  try{
  const explorer=level==="explorers",version=explorer?12:13,gameId="kingdom-completion-publication-synthetic-"+level;
  await newDetectiveWorld(gameId,7,true,explorer,true);await ensureSingleMediumReviewPolicy(c,gameId,async()=>{});
  const mediumBefore=await db.auditLog.findUniqueOrThrow({where:{id:"aud_single_medium_"+gameId}});
  const context=await resolveLocalPatchBoardsForGame(db,gameId,version),worldBoards=new Set(boardsOfWorlds(["kingdom"]));
  const boards=context.boards.filter(b=>worldBoards.has(b.board)),hides=boards.flatMap(b=>b.hides);
  const provider=controlledSol(false,false,undefined,true,false,version),forbidden=vi.fn(async()=>{throw Error("No extra synchronous review or diagnosis");});
  const container={...c,backgroundReview:provider.fake,visualReview:{request:forbidden}} as Container;
  const render=vi.fn<LocalPatchHideDeps["render"]>(async input=>{
    const hide=hides.find(h=>input.requestKey.startsWith(h.id+":"))!;expect(input.requestKey.endsWith(":render:1")).toBe(true);
    expect(input.placementGuideVersion).toBe(PLACEMENT_GUIDE_V2_VERSION);
    const frame=guidedFrameGeometry(maskForHide(hide),localPatchReturnRegion(cropOf(hide),maskForHide(hide),hide.returnRect).local).target;
    const figure=await sharp({create:{width:Math.round(frame.width*0.6),height:Math.round(frame.height*0.7),channels:4,background:"#284d99"}}).png().toBuffer();
    return paintedOk(await sharp(input.stylePng).composite([{input:figure,left:frame.left+Math.round(frame.width*0.2),top:frame.top+Math.round(frame.height*0.2)}]).png().toBuffer(),bill("synthetic-completion-"+input.requestKey,50000));
  });
  const deps:LocalPatchHideDeps={readBoardArt:readArt,renderPolicySha256:localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY),render,judge:forbidden};
  await runLocalPatchHide(container,deps,{gameId,board:boards[0]!,hide:boards[0]!.hides[0]!});
  const worldId=boardWizardWorldId(gameId),budget=boardWizardBudgetOf(container),fill=3_900_000-(await budget.audit(worldId)).committedMicroUsd;
  await budget.reserve(worldId,{requestKey:"synthetic-original-cap-stop",scope:"image",operationFingerprint:"c".repeat(64),reserveMicroUsd:fill});
  await budget.settle(worldId,"synthetic-original-cap-stop",bill("synthetic-original-cap-stop",fill));
  await db.generationJob.update({where:{id:"job_"+gameId},data:{status:"FAILED",currentStep:"local-patch:recovery-exhausted",lastError:"local-patch: synthetic original cap stop"}});
  const plan=await planQaCompletionCapacity(container,gameId),gameBefore=await db.game.findUniqueOrThrow({where:{id:gameId}});
  await authorizeQaCompletionCapacity(container,{gameId,operatorId:gameBefore.ownerId!,expectedPlanSha256:plan.planSha256,ownerAuthorizationSha256:"b".repeat(64)});
  await budget.reserve(worldId,{requestKey:"synthetic-existing-completion-work",scope:"image",operationFingerprint:"d".repeat(64),reserveMicroUsd:1_200_000});
  await budget.settle(worldId,"synthetic-existing-completion-work",bill("synthetic-existing-completion-work",1_200_000));
  expect((await budget.audit(worldId)).committedMicroUsd).toBe(5_100_000);
  // A source-bound completion may resume a premature engine rest for a new
  // image still owing its first review. The same unchanged snapshot wakes once.
  const frozenRows=await db.targetVariantAsset.findMany({where:{targetInstance:{gameScene:{gameId}}},orderBy:{id:"asc"}});
  const frozenLedger=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}});
  const rest=localPatchRestDecision([{hideId:hides[0]!.id,rest:"spent"}]);if(rest?.action!=="park")throw Error("Synthetic rest required");
  const jobBeforeWake=await db.generationJob.update({where:{id:"job_"+gameId},data:{status:"FAILED",currentStep:"local-patch:recovery-exhausted",lastError:rest.reason}});
  const wake=await planQaCompletionRecovery(container,gameId);expect(wake?.readyRows).toHaveLength(1);
  expect(await nextQaCompletionRecovery(container)).toBe(gameId);
  expect(await resumeQaCompletionRecovery(container,gameId)).toBe(true);
  expect(await db.generationJob.findUniqueOrThrow({where:{id:jobBeforeWake.id}})).toMatchObject({status:"QUEUED",currentStep:"local-patch",attempts:jobBeforeWake.attempts});
  expect(await db.targetVariantAsset.findMany({where:{targetInstance:{gameScene:{gameId}}},orderBy:{id:"asc"}})).toEqual(frozenRows);
  expect((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson).toBe(frozenLedger.snapshotJson);
  expect(await db.auditLog.count({where:{entityId:gameId,action:"generation:qa-medium-completion-resumed"}})).toBe(1);
  await db.generationJob.update({where:{id:jobBeforeWake.id},data:{status:"FAILED",currentStep:"local-patch:recovery-exhausted",lastError:rest.reason}});
  expect(await planQaCompletionRecovery(container,gameId)).toBeNull();expect(await resumeQaCompletionRecovery(container,gameId)).toBe(false);
  // Restore this synthetic job to the already-authorized queued state.
  await db.generationJob.update({where:{id:jobBeforeWake.id},data:{status:"QUEUED",currentStep:"local-patch",lastError:null}});
  let result={pending:true,attention:null as string|null},turns=0;
  while(result.pending&&turns++<900){result=await runLocalPatchWorldSlice(container,deps,gameId,{hardDeadlineAt:Date.now()+270000,diagnose:forbidden});expect(result.attention).toBeNull();if(result.pending)await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS+1);}
  expect(result.pending).toBe(false);expect(render).toHaveBeenCalledTimes(27);expect(provider.creates).toHaveLength(27);
  const game=await db.game.findUniqueOrThrow({where:{id:gameId}});expect(["READY","DELIVERED"]).toContain(game.status);
  const config=parseGameConfig(game.configJson!);expect(config.scenes).toHaveLength(9);expect(config.scenes.flatMap(s=>s.targets)).toHaveLength(27);
  const child=await db.childProfile.findUniqueOrThrow({where:{id:game.childProfileId!}});expect(child.originalPhotoAssetId).toBeNull();
  const audit=await budget.audit(worldId);expect(audit).toMatchObject({capMicroUsd:QA_COMPLETION_CAP,held:false,pendingRequestKeys:[],unknownRequestKeys:[]});expect(audit.committedMicroUsd).toBeGreaterThan(4000000);
  expect(await db.auditLog.findUniqueOrThrow({where:{id:mediumBefore.id}})).toEqual(mediumBefore);
  const rows=await db.targetVariantAsset.findMany({where:{variant:"A",targetInstance:{gameScene:{gameId}}}});expect(rows).toHaveLength(27);
  for(const row of rows){const receipt=JSON.parse(row.judgeJson!);expect(receipt.boardReview.dual.single).toBe(SINGLE_MEDIUM_VISUAL_REVIEW_VERSION);
    expect(await allowedDualPublication(db,{...publicationBinding(gameId,row),sceneVersion:version})).toBe(true);}
  expect(forbidden).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
  }finally{vi.useRealTimers();}
},1500000);

it("uses the unchanged authored return as the editor mask and one smaller visual target for a finite third painting", async()=>{
 const gameId="detective-guided-frame-synthetic";await newDetectiveWorld(gameId);
 const context=await resolveLocalPatchBoardsForGame(db,gameId,13),board=context.boards.find(b=>b.board==="amazon")!,hide=board.hides[2]!;
 let calls=0, guideSeen=false;
 const deps:LocalPatchHideDeps={readBoardArt:readArt,renderPolicySha256:localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY),judge:async()=>{throw Error("No synchronous judgement");},render:async input=>{
  calls++;const child=maskForHide(hide);let target=child;
  if(input.placementGuidePng){guideSeen=true;expect(input.placementGuideVersion).toBe(GUIDED_FRAME_RECOVERY_VERSION);expect(input.requestKey).toBe(hide.id+":"+hide.pose+":render:3");expect(input.prompt).toContain("WHOLE");expect(input.prompt).toContain("No guide colour");
   const local={left:hide.returnRect!.left,top:hide.returnRect!.top,width:hide.returnRect!.width,height:hide.returnRect!.height};
   const g=guidedFrameGeometry(child,local);target=g.target;expect(g.returned).toEqual(local);
   const meta=await sharp(input.placementGuidePng).metadata();expect([meta.width,meta.height]).toEqual([512,768]);expect(input.placementGuidePng.equals(input.stylePng)).toBe(false);
   const mask=await sharp(input.maskPng).ensureAlpha().raw().toBuffer();let clear=0;for(let i=3;i<mask.length;i+=4)if(mask[i]===0)clear++;
   expect(clear).toBe(local.width*local.height);
  }else expect(input.requestKey.endsWith(":render:1")).toBe(true);
  const figure=await sharp({create:{width:Math.round(target.width*0.6),height:Math.round(target.height*0.7),channels:4,background:"#385ca0"}}).png().toBuffer();
  const png=await sharp(input.stylePng).composite([{input:figure,left:target.left+Math.round(target.width*0.2),top:target.top+Math.round(target.height*0.2)}]).png().toBuffer();
  return paintedOk(png,bill("guided-synthetic-"+calls));
 }};
 expect((await runLocalPatchHide(c,deps,{gameId,board,hide})).state).toBe("generated");
 const row=await db.targetVariantAsset.findFirstOrThrow({where:{targetInstance:{gameScene:{gameId},targetId:hide.targetId}}}),j=JSON.parse(row.judgeJson!);
 // Seed an explicitly exhausted synthetic history; these are not real provider decisions.
 j.selfRepair={version:"local-patch-self-repair/v1",subjectV2Cycles:3,cycle:3,phase:"awaiting-review"};j.reviewState="board-review-complete";j.wireFault=null;
 j.verdict={...GOOD_V12_VERDICT,verdict:"fail",childComplete:"fail",boundaryIntegrity:{top:{status:"fail",observation:"Synthetic clipped crown"}}};
 j.boardReview={dual:{single:SINGLE_VISUAL_REVIEW_VERSION,quality:{requestKey:"synthetic-previous-low",policy:{effort:"low",model:"gpt-6.1-sol"},raw:JSON.stringify({version:SINGLE_VISUAL_REVIEW_VERSION,assessment:{},continuity:{},doubt:false,doubtReason:null})}}};
 const failed=await db.targetVariantAsset.update({where:{id:row.id},data:{status:"FAILED",attempts:2,judgeJson:JSON.stringify(j),lastError:"quality-retry: childComplete"}});
 expect(guidedFrameCandidate(failed)).toBe(true);
 const grant=await db.auditLog.findUniqueOrThrow({where:{id:detectivesExtensionId(gameId)}});await db.auditLog.delete({where:{id:grant.id}});
 await expect(runLocalPatchHide(c,deps,{gameId,board,hide,finalRepair:true,guidedFrame:true})).rejects.toThrow("exact LOW grant");expect(calls).toBe(1);
 await db.auditLog.create({data:grant});
 const result=await runLocalPatchHide(c,deps,{gameId,board,hide,finalRepair:true,guidedFrame:true});expect(result.state).toBe("generated");expect(guideSeen).toBe(true);expect(calls).toBe(2);
 const after=await db.targetVariantAsset.findUniqueOrThrow({where:{id:row.id}}),receipt=JSON.parse(after.judgeJson!);expect(after.attempts).toBe(3);expect(receipt.selfRepair).toEqual(j.selfRepair);expect(receipt.guidedFrameRecovery.version).toBe(GUIDED_FRAME_RECOVERY_VERSION);expect(receipt.reviewState).toBe("pending-board-review");expect(receipt.verdict?.verdict).not.toBe("pass");
 expect((await runLocalPatchHide(c,deps,{gameId,board,hide})).state).toBe("already-generated");expect(calls).toBe(2);
 const source=await readArt(board.art,receipt.authoredReturn.source.sha256),old=await sharp(source).extract(cropOf(hide)).removeAlpha().raw().toBuffer(),shipping=await c.storage.get((await db.asset.findUniqueOrThrow({where:{id:after.assetId!}})).storagePath),actual=await sharp(shipping).removeAlpha().raw().toBuffer();
 const r=receipt.authoredReturn.local;let outsideChanged=0;for(let y=0;y<768;y++)for(let x=0;x<512;x++){if(x>=r.left&&x<r.left+r.width&&y>=r.top&&y<r.top+r.height)continue;const i=(y*512+x)*3;if(actual[i]!==old[i]||actual[i+1]!==old[i+1]||actual[i+2]!==old[i+2])outsideChanged++;}expect(outsideChanged).toBe(0);
 await db.targetVariantAsset.update({where:{id:row.id},data:{status:"FAILED",judgeJson:JSON.stringify({...receipt,reviewState:"board-review-complete",verdict:j.verdict})}});
 expect((await runLocalPatchHide(c,deps,{gameId,board,hide,finalRepair:true})).state).toBe("gave-up");expect(calls).toBe(2);
},300_000);


it("consumes retained LOW answers before an unaffordable guided purchase after another first review completes",async()=>{
 vi.useFakeTimers({toFake:["Date"]});
 const gameId="detective-retained-low-budget-synthetic";await newDetectiveWorld(gameId);
 const context=await resolveLocalPatchBoardsForGame(db,gameId,13);
 const aBoard=context.boards[0]!,aHide=aBoard.hides[0]!;
 const bBoard=context.boards.find(b=>b.board==="paris")!,bHide=bBoard.hides[1]!;
 const cBoard=context.boards.at(-1)!,cHide=cBoard.hides[2]!;
 const rowOf=(board:string,targetId:string)=>db.targetVariantAsset.findFirst({where:{targetInstance:{gameScene:{gameId,sceneSlug:board},targetId}}});
 const provider=controlledSol(true,true,cHide.id),responseHides=new Map<string,string>();
 const originalCreate=provider.fake.create,originalRetrieve=provider.fake.retrieve;let cutoff=false;
 provider.fake.create=async body=>{const reply=await originalCreate(body);const prompt=(body.input as {content:{text?:string}[]}[])[0]!.content[0]!.text!;responseHides.set(reply.responseId,boundHide(prompt).hideId);return reply;};
 provider.fake.retrieve=async id=>{const reply=await originalRetrieve(id);
  if(!cutoff&&reply.status==="completed"&&responseHides.get(id)===cHide.id&&provider.creates.filter(x=>x.hideId===cHide.id).length===2){
   // A process loses its remaining dispatch window after retaining a reply.
   // Leave enough time to save evidence, but no window for a third painting.
   cutoff=true;await vi.advanceTimersByTimeAsync(250_000);
  }return reply;};
 const container={...c,backgroundReview:provider.fake,visualReview:{request:async()=>{throw Error("No synchronous provider call");}}} as Container;
 const render=vi.fn<NonNullable<LocalPatchHideDeps["render"]>>(async input=>{
  if(input.requestKey.startsWith(cHide.id+":")&&input.requestKey.endsWith(":render:3"))throw Error("Synthetic checkpoint must precede the third purchase");
  return paintedOk(input.stylePng,bill("retained-budget-"+input.requestKey,1000));});
 const deps:LocalPatchHideDeps={readBoardArt:readArt,renderPolicySha256:localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY),render,judge:async()=>{throw Error("No synchronous review");}};
 const diagnose=vi.fn(async()=>{throw Error("Conclusive framing needs no new planner");});
 type Row=NonNullable<Awaited<ReturnType<typeof rowOf>>>;let aBefore:Row|null=null,bBefore:Row|null=null;
 for(let turn=0;turn<650&&!cutoff;turn++){
  await runLocalPatchWorldSlice(container,deps,gameId,{hardDeadlineAt:Date.now()+270_000,diagnose});
  const a=await rowOf(aBoard.board,aHide.targetId),b=await rowOf(bBoard.board,bHide.targetId);
  if(a&&a.status==="FAILED"&&JSON.parse(a.judgeJson!).reviewInterruption?.single===SINGLE_VISUAL_REVIEW_VERSION)aBefore??=a;
  if(b&&b.status==="GENERATED"&&JSON.parse(b.judgeJson!).reviewState==="pending-board-review")bBefore??=b;
  const job=await db.generationJob.findUniqueOrThrow({where:{id:"job_"+gameId}});
  if(job.currentStep==="local-patch:recovery-budget-wait")await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS+1);
 }
 expect(cutoff).toBe(true);expect(aBefore).not.toBeNull();expect(bBefore).not.toBeNull();
 const review=(board:string)=>reviewLocalPatchBoard(container,{gameId,sceneId:"gsc-"+gameId+"-"+board},{fence:async()=>{},readBoardArt:readArt});
 const settle=async()=>{for(let i=0;i<3;i++){await vi.advanceTimersByTimeAsync(31_000);await advanceContinuityInBackground(container,gameId);}};
 const cRow=(await rowOf(cBoard.board,cHide.targetId))!;
 if(JSON.parse(cRow.judgeJson!).reviewState!=="board-review-complete")await review(cBoard.board);
 expect(guidedFrameCandidate((await rowOf(cBoard.board,cHide.targetId))!)).toBe(true);
 // Restore the business rows to their pre-adoption checkpoints while preserving
 // every normal provider request, immutable paid reply and full UNKNOWN hold.
 // This models a restart after retention and before these result writes.
 const restore=async(row:Row)=>{await db.targetVariantAsset.update({where:{id:row.id},data:{status:row.status,attempts:row.attempts,
  assetId:row.assetId,judgeJson:row.judgeJson,lastError:row.lastError}});await db.targetInstance.update({where:{id:row.targetInstanceId},data:{status:row.status}});};
 expect((await rowOf(aBoard.board,aHide.targetId))!.assetId).toBe(aBefore!.assetId);
 expect((await rowOf(bBoard.board,bHide.targetId))!.assetId).toBe(bBefore!.assetId);
 await restore(aBefore!);await restore(bBefore!);
 if(provider.creates.filter(x=>x.hideId===aHide.id).length<2){await vi.advanceTimersByTimeAsync(31_000);await review(aBoard.board);}
 await settle();
 const budget=boardWizardBudgetOf(container),worldId=boardWizardWorldId(gameId);
 const intents=await db.auditLog.findMany({where:{entityType:"Game",entityId:gameId,action:"generation:sol-background-review",id:{endsWith:"_intent"}}});
 const continuation=intents.map(x=>JSON.parse(x.metaJson!).intent).find(x=>x.binding.variantId===aBefore!.id&&x.policyVersion?.includes("-default/single-v1"));
 expect(continuation).toBeDefined();expect((await budget.readRequest(worldId,continuation.requestKey))?.state).toBe("settled");
 expect((await rowOf(aBoard.board,aHide.targetId))!.status).toBe("FAILED");
 expect(JSON.parse((await rowOf(bBoard.board,bHide.targetId))!.judgeJson!).reviewState).toBe("pending-board-review");
 const beforeFill=await budget.audit(worldId);expect(beforeFill.pendingRequestKeys).toHaveLength(0);
 const fill=beforeFill.remainingMicroUsd-280_000;expect(fill).toBeGreaterThan(0);
 await budget.reserve(worldId,{requestKey:"synthetic-earlier-completed-work",operationFingerprint:"c".repeat(64),scope:"image",reserveMicroUsd:fill});
 await budget.settle(worldId,"synthetic-earlier-completed-work",bill("synthetic-earlier-completed-work",fill));
 const hold="local-patch: no automatic action remains within the authorized world budget; synthetic paid-answer restart";
 await db.generationJob.update({where:{id:"job_"+gameId},data:{status:"FAILED",currentStep:"local-patch:recovery-exhausted",lastError:hold}});
 const beforeWake=(await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson;
 const beforeJob=await db.generationJob.findUniqueOrThrow({where:{id:"job_"+gameId}}),aStopped=(await rowOf(aBoard.board,aHide.targetId))!;
 // Foreign source, geometry, counters and missing/corrupt evidence never wake.
 await db.childProfile.update({where:{id:"chl-"+gameId},data:{ageYears:7}});
 await expect(resumeDetectivesLowEngineRecovery(container,gameId)).rejects.toThrow("Strict original full-source identity binding required");
 await db.childProfile.update({where:{id:"chl-"+gameId},data:{ageYears:8}});
 const originalReceipt=JSON.parse(aStopped.judgeJson!);
 for(const changed of [
  {...originalReceipt,judgedSha256:"9".repeat(64)},
  {...originalReceipt,reviewInterruption:{...originalReceipt.reviewInterruption,recoveryId:"synthetic-foreign-proof"}},
  {...originalReceipt,evidenceAttempts:[...originalReceipt.evidenceAttempts,...originalReceipt.evidenceAttempts]},
 ]){
  await db.targetVariantAsset.update({where:{id:aStopped.id},data:{judgeJson:JSON.stringify(changed)}});
  expect(await resumeDetectivesLowEngineRecovery(container,gameId)).toBe(false);
 }
 await db.targetVariantAsset.update({where:{id:aStopped.id},data:{judgeJson:aStopped.judgeJson,rectJson:"{}"}});
 expect(await resumeDetectivesLowEngineRecovery(container,gameId)).toBe(false);
 await db.targetVariantAsset.update({where:{id:aStopped.id},data:{rectJson:aStopped.rectJson}});
 const keptKey=retainedPurchaseKey(worldId,continuation.requestKey),keptBlob=await db.fileBlob.findUniqueOrThrow({where:{key:keptKey}});
 await db.fileBlob.delete({where:{key:keptKey}});
 expect(await resumeDetectivesLowEngineRecovery(container,gameId)).toBe(false);
 await db.fileBlob.create({data:keptBlob});
 const targetAsset=await db.asset.findUniqueOrThrow({where:{id:aStopped.assetId!}}),targetBlob=await db.fileBlob.findUniqueOrThrow({where:{key:targetAsset.storagePath}});
 const changedBytes=Buffer.from(targetBlob.data);changedBytes[changedBytes.length-1]=changedBytes[changedBytes.length-1]!^1;
 await db.fileBlob.update({where:{key:targetBlob.key},data:{data:changedBytes}});
 expect(await resumeDetectivesLowEngineRecovery(container,gameId)).toBe(false);
 await db.fileBlob.update({where:{key:targetBlob.key},data:{data:targetBlob.data}});
 expect(await resumeDetectivesLowEngineRecovery(container,gameId)).toBe(true);
 expect((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson).toBe(beforeWake);
 expect(await db.generationJob.findUniqueOrThrow({where:{id:"job_"+gameId}})).toMatchObject({status:"QUEUED",attempts:beforeJob.attempts});
 const wakes=await db.auditLog.findMany({where:{entityId:gameId,action:"generation:detectives-low-engine-resumed"}});
 const freeWakes=wakes.filter(w=>JSON.parse(w.metaJson!).mode==="retained-low-answer/v1");
 expect(freeWakes).toHaveLength(1);expect(freeWakes[0]).toMatchObject({actorType:"SYSTEM",actorId:null});
 expect(JSON.parse(freeWakes[0]!.metaJson!)).toMatchObject({version:"detectives-low-engine-wake/v2",attemptsReset:false,providerCallsAdded:0,budgetChanged:false});
 expect(await resumeDetectivesLowEngineRecovery(container,gameId)).toBe(false);

 const before=await budget.audit(worldId),purchases=provider.creates.length,paintings=render.mock.calls.length;
 expect(before.remainingMicroUsd).toBe(280_000);
 await runLocalPatchWorldSlice(container,deps,gameId,{hardDeadlineAt:Date.now()+270_000,diagnose});
 const a=(await rowOf(aBoard.board,aHide.targetId))!,b=(await rowOf(bBoard.board,bHide.targetId))!,aReceipt=JSON.parse(a.judgeJson!),bReceipt=JSON.parse(b.judgeJson!);
 expect(bReceipt.reviewState).toBe("board-review-complete");
 expect(aReceipt.boardReview.dual?.single).toBe(SINGLE_VISUAL_REVIEW_VERSION);
 expect(aReceipt.boardReview.dual?.quality.policy.serviceTier).toBe("default");
 expect(aReceipt.wireFault).toBeNull();expect(aReceipt.verdict?.verdict).toBe("pass");
 expect(a.status).toBe("GENERATED");expect(b.status).toBe("GENERATED");
 expect(provider.creates).toHaveLength(purchases);expect(render).toHaveBeenCalledTimes(paintings);expect(diagnose).not.toHaveBeenCalled();
 const after=await budget.audit(worldId);expect(after.remainingMicroUsd).toBe(before.remainingMicroUsd);
 expect(after.unknownRequestKeys).toEqual(before.unknownRequestKeys);expect(after.reservedMicroUsd).toBe(before.reservedMicroUsd);
 expect((await db.generationJob.findUniqueOrThrow({where:{id:"job_"+gameId}})).currentStep).toBe("local-patch:recovery-exhausted");
 expect((await db.game.findUniqueOrThrow({where:{id:gameId}})).configJson).toBeNull();
 expect((await db.childProfile.findUniqueOrThrow({where:{id:"chl-"+gameId}})).originalPhotoAssetId).not.toBeNull();expect(fetch).not.toHaveBeenCalled();
},1_500_000);

// The 2026-11-02 QA shape (local-patch-settled-answer-first/v1): paid answers about one board settle while the lean
// world waits for capacity, and another board's finished paintings were never asked about.
async function settledAnswerFixture(gameId:string){
 vi.useFakeTimers({toFake:["Date"]});
 await newDetectiveWorld(gameId,7,true);
 const context=await resolveLocalPatchBoardsForGame(db,gameId,13),hides=context.boards.flatMap(b=>b.hides);
 const boardOf=(hideId:string)=>context.boards.find(b=>b.hides.some(h=>h.id===hideId))!.board;
 const provider=controlledSol(false,false,undefined,true,true),retrieve=provider.fake.retrieve.bind(provider.fake),create=provider.fake.create.bind(provider.fake);
 const state={released:false,stopped:false,asked:null as string|null,unasked:null as string|null,askedQuestions:0};
 provider.fake.retrieve=async id=>state.released?retrieve(id):{status:"in_progress"};
 provider.fake.create=async body=>{if(state.stopped)throw Error("No new question after the capacity stop");return create(body);};
 const container={...c,backgroundReview:provider.fake,visualReview:{request:async()=>{throw Error("No synchronous review");}}} as Container;
 const budget=boardWizardBudgetOf(container),worldId=boardWizardWorldId(gameId),painted=new Map<string,number>();
 const render=vi.fn<NonNullable<LocalPatchHideDeps["render"]>>(async({requestKey,stylePng})=>{
  if(state.stopped)throw Error("No painting after the capacity stop");
  const hide=hides.find(h=>requestKey.startsWith(h.id+":"))!,board=boardOf(hide.id),mask=maskForHide(hide);
  const figure=await sharp({create:{width:Math.round(mask.width*0.6),height:Math.round(mask.height*0.8),channels:4,background:"#1e3ca0"}}).png().toBuffer();
  const png=await sharp(stylePng).composite([{input:figure,left:mask.left+Math.round(mask.width*0.2),top:mask.top+Math.round(mask.height*0.2)}]).png().toBuffer();
  painted.set(board,(painted.get(board)??0)+1);
  let amount=66500;
  // Every painting on one board was asked about, none on another.
  const fullyAsked=context.boards.find(b=>b.hides.every(h=>provider.creates.some(x=>x.hideId===h.id)))?.board;
  if(!state.unasked&&fullyAsked&&!provider.creates.some(x=>boardOf(x.hideId)===board)&&painted.get(board)===3){
   // The last painting of a second board leaves too little for any question or painting.
   state.asked=fullyAsked;state.unasked=board;state.askedQuestions=provider.creates.length;
   amount=(await budget.readRequest(worldId,requestKey))!.reserveMicroUsd;
   const fill=(await budget.audit(worldId)).remainingMicroUsd-10_000;expect(fill).toBeGreaterThan(0);
   await budget.reserve(worldId,{requestKey:"synthetic-capacity-used",scope:"image",operationFingerprint:"b".repeat(64),reserveMicroUsd:fill});
   await budget.settle(worldId,"synthetic-capacity-used",bill("synthetic-capacity-used-"+gameId,fill));
  }
  return paintedOk(png,bill("paint-"+gameId+"-"+requestKey,amount));
 });
 const deps:LocalPatchHideDeps={readBoardArt:readArt,renderPolicySha256:localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY),render,judge:async()=>{throw Error("No synchronous review");}};
 const diagnose=vi.fn(async()=>{throw Error("No planner");});
 const job=()=>db.generationJob.findUniqueOrThrow({where:{id:"job_"+gameId}});
 const rows=(board:string)=>db.targetVariantAsset.findMany({where:{variant:"A",targetInstance:{gameScene:{gameId,sceneSlug:board}}},orderBy:{id:"asc"}});
 const reviewOf=(row:{judgeJson:string|null})=>JSON.parse(row.judgeJson!).reviewState;
 const slice=()=>runLocalPatchWorldSlice(container,deps,gameId,{hardDeadlineAt:Date.now()+270_000,diagnose});
 const ledger=async()=>(await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson;
 // The engine stamps updatedAt with the real clock; place the wait exactly past its backoff, as the lean tests do.
 const pastBackoff=()=>db.generationJob.update({where:{id:"job_"+gameId},data:{updatedAt:new Date(Date.now()-LEAN_RECOVERY_BACKOFF_MS-1000)}});
 const replayOnly=async(hideId:string)=>{const scene=await db.gameScene.findFirstOrThrow({where:{gameId,sceneSlug:boardOf(hideId)}});
  return reviewLocalPatchBoard(container,{gameId,sceneId:scene.id,deadlineAt:Date.now()+270_000},{fence:async()=>{},readBoardArt:readArt},{onlyHideId:hideId,replayOnly:true});};
 const settle=async()=>{for(let i=0;i<3;i++)await advanceContinuityInBackground(container,gameId,{deadlineAt:Date.now()+270_000});};
 for(let turn=0;turn<40&&!(state.unasked&&(await job()).currentStep==="local-patch:recovery-budget-wait");turn++)await slice();
 expect(state.unasked).not.toBeNull();expect((await job()).currentStep).toBe("local-patch:recovery-budget-wait");
 const asked=state.asked!,unasked=state.unasked!;
 const askedHides=context.boards.find(b=>b.board===asked)!.hides.map(h=>h.id),unaskedHides=context.boards.find(b=>b.board===unasked)!.hides.map(h=>h.id);
 const askedRows=await rows(asked),unaskedRows=await rows(unasked);
 expect(askedRows.map(r=>[r.status,reviewOf(r)])).toEqual(askedRows.map(()=>["GENERATED","pending-board-review"]));
 expect(unaskedRows.map(r=>[r.status,reviewOf(r)])).toEqual(unaskedHides.map(()=>["GENERATED","pending-board-review"]));
 expect(provider.creates).toHaveLength(state.askedQuestions);expect(provider.creates.some(x=>unaskedHides.includes(x.hideId))).toBe(false);
 expect((await budget.audit(worldId)).pendingRequestKeys.length).toBeGreaterThan(0);
 state.stopped=true;
 return {gameId,context,provider,state,container,budget,worldId,render,job,rows,reviewOf,slice,ledger,pastBackoff,replayOnly,settle,asked,unasked,askedHides,unaskedHides,unaskedRows};
}
/** Leaves exactly `left` micro-USD: below every question and painting reserve. */
async function leaveCapacity(f:Awaited<ReturnType<typeof settledAnswerFixture>>,left:number){
 const fill=(await f.budget.audit(f.worldId)).remainingMicroUsd-left;expect(fill).toBeGreaterThan(0);
 await f.budget.reserve(f.worldId,{requestKey:"synthetic-capacity-used-after-answer",scope:"image",operationFingerprint:"d".repeat(64),reserveMicroUsd:fill});
 await f.budget.settle(f.worldId,"synthetic-capacity-used-after-answer",bill("synthetic-capacity-used-after-answer-"+f.gameId,fill));
 const audit=await f.budget.audit(f.worldId);
 expect(audit.pendingRequestKeys).toEqual([]);expect(audit.unknownRequestKeys).toEqual([]);expect(audit.remainingMicroUsd).toBe(left);
}

it.each([{mode:"zero",left:0},{mode:"below-reserve",left:10_000},{mode:"antarctica",left:10_000}] as const)(
 "applies settled board answers once after the lean backoff with no purchase capacity and never asks an unasked board; mode=$mode",async({mode,left})=>{
 const f=await settledAnswerFixture("detective-settled-first-"+mode);
 f.state.released=true;await f.settle();await leaveCapacity(f,left);
 // The live shape: two siblings already approved, one appearance alone awaiting its settled answer.
 if(mode==="antarctica"){for(const hideId of f.askedHides.slice(1))expect((await f.replayOnly(hideId)).replayed).toBe(true);
  const reviewed=(await f.rows(f.asked)).map(f.reviewOf);expect(reviewed.filter(s=>s==="board-review-complete")).toHaveLength(2);expect(reviewed.filter(s=>s==="pending-board-review")).toHaveLength(1);}
 const ledger=await f.ledger(),paintings=f.render.mock.calls.length;
 // Still inside the backoff: nothing is decided.
 const before=(await f.rows(f.asked)).map(r=>r.judgeJson);
 await f.slice();
 expect((await f.rows(f.asked)).map(r=>r.judgeJson)).toEqual(before);
 // After the backoff every settled answer is applied, with no question, painting or reservation.
 await f.pastBackoff();await f.slice();
 const applied=await f.rows(f.asked);
 expect(applied.map(r=>[r.status,f.reviewOf(r),JSON.parse(r.judgeJson!).verdict?.verdict])).toEqual(applied.map(()=>["GENERATED","board-review-complete","pass"]));
 expect((await f.rows(f.unasked)).map(r=>[r.status,f.reviewOf(r)])).toEqual(f.unaskedRows.map(()=>["GENERATED","pending-board-review"]));
 expect(f.provider.creates).toHaveLength(f.state.askedQuestions);expect(f.render).toHaveBeenCalledTimes(paintings);
 expect(await f.ledger()).toBe(ledger);
 // Applied once: a later slice changes nothing and still never asks about the unasked board.
 if((await f.job()).currentStep==="local-patch:recovery-budget-wait")await f.pastBackoff();
 await f.slice();
 expect((await f.rows(f.asked)).map(r=>r.judgeJson)).toEqual(applied.map(r=>r.judgeJson));
 expect((await f.rows(f.unasked)).map(r=>[r.status,f.reviewOf(r)])).toEqual(f.unaskedRows.map(()=>["GENERATED","pending-board-review"]));
 expect(f.provider.creates).toHaveLength(f.state.askedQuestions);expect(f.render).toHaveBeenCalledTimes(paintings);
 expect(await f.ledger()).toBe(ledger);expect(fetch).not.toHaveBeenCalled();
},900_000);

it("reads settled answers without reserving or asking even with capacity to buy, and refuses every answer it cannot prove",async()=>{
 const f=await settledAnswerFixture("detective-settled-first-funded");
 f.state.released=true;
 const askedRow=(await f.rows(f.asked))[0]!,hideId=JSON.parse(askedRow.judgeJson!).hide as string;
 // An answer still in flight is no settled answer: nothing is read, reserved or asked.
 const inFlight=await f.ledger();
 expect(await f.replayOnly(hideId)).toMatchObject({state:"pending",reason:"No settled paid answer to this exact question",costCents:0});
 expect(await f.ledger()).toBe(inFlight);
 await f.settle();
 const audit=await f.budget.audit(f.worldId);expect(audit.pendingRequestKeys).toEqual([]);
 expect(audit.remainingMicroUsd).toBeGreaterThan(500_000);
 const ledger=await f.ledger(),questions=f.provider.creates.length;
 // A painting nobody asked about is never claimed as answered, with or without capacity.
 for(const unaskedHide of f.unaskedHides)expect(await f.replayOnly(unaskedHide)).toMatchObject({state:"pending",reason:"No settled paid answer to this exact question"});
 // A refunded world reads nothing; neither do changed pixels, which the ordinary binding refuses outright.
 await db.order.update({where:{id:"order-"+f.gameId},data:{paymentStatus:"REFUNDED",refundedAt:new Date()}});
 expect(await f.replayOnly(hideId)).toMatchObject({state:"pending",reason:"The original paid world is no longer in generation"});
 await db.order.update({where:{id:"order-"+f.gameId},data:{paymentStatus:"PAID",refundedAt:null}});
 const receipt=JSON.parse(askedRow.judgeJson!);
 await db.targetVariantAsset.update({where:{id:askedRow.id},data:{judgeJson:JSON.stringify({...receipt,judgedSha256:"9".repeat(64)})}});
 await expect(f.replayOnly(hideId)).rejects.toThrow("Shipping image or geometry no longer matches its render-completion binding");
 await db.targetVariantAsset.update({where:{id:askedRow.id},data:{judgeJson:askedRow.judgeJson}});
 expect((await f.rows(f.asked)).map(f.reviewOf)).toEqual(f.askedHides.map(()=>"pending-board-review"));
 expect(await f.ledger()).toBe(ledger);expect(f.provider.creates).toHaveLength(questions);
 // With capacity to buy, the exact settled answers are read once each; no question or reservation is added.
 for(const asked of f.askedHides)expect((await f.replayOnly(asked)).replayed).toBe(true);
 const applied=await f.rows(f.asked);
 expect(applied.map(r=>[f.reviewOf(r),JSON.parse(r.judgeJson!).verdict?.verdict])).toEqual(applied.map(()=>["board-review-complete","pass"]));
 for(const asked of f.askedHides)expect(await f.replayOnly(asked)).toMatchObject({costCents:0});
 expect((await f.rows(f.asked)).map(r=>r.judgeJson)).toEqual(applied.map(r=>r.judgeJson));
 expect(await f.ledger()).toBe(ledger);expect(f.provider.creates).toHaveLength(questions);
 expect((await f.rows(f.unasked)).map(r=>[r.status,f.reviewOf(r)])).toEqual(f.unaskedRows.map(()=>["GENERATED","pending-board-review"]));
 expect(fetch).not.toHaveBeenCalled();
},900_000);

it('fills only a born Paris source-body background gap for free, preserves paid evidence, and requires a fresh ordinary review', async () => {
 const { sourceBodyGapAuthority } = await import('../../../domain/generation/source-body-gap');
 const { correctSourceBodyGap, sourceBodyGapBaseline } = await import('../source-body-gap');
 const gameId='synthetic-source-body-gap',hideId='paris-detectives-hide-1';
 vi.useFakeTimers({toFake:['Date']});await newDetectiveWorld(gameId,7,true);
 const context=await resolveLocalPatchBoardsForGame(db,gameId,13),hides=context.boards.flatMap(b=>b.hides);
 const hide=hides.find(h=>h.id===hideId)!,g=sourceBodyForHide(context,hideId)!,gap=sourceBodyGapAuthority(g)!.rect;
 const provider=controlledSol(false,false,undefined,true,true),retrieve=provider.fake.retrieve.bind(provider.fake);
 provider.fake.retrieve=async id=>{
  const reply=await retrieve(id);if(reply.status!=='completed')return reply;
  const asked=provider.creates[Number(id.split('_').at(-1))-1]!;
  if(asked.hideId!==hideId||provider.creates.filter(p=>p.hideId===hideId).indexOf(asked)!==0)return reply;
  const doc=JSON.parse(reply.reading.raw!),a=doc.assessment.assessment??doc.assessment;
  Object.assign(a.quality.hides[0].verdict,{verdict:'fail',severeSeam:'fail',pictureWhole:'fail',reason:'Synthetic rectangular source-mask remnant in paving',
   faults:[{check:'severeSeam',where:'Synthetic lower-right rectangular background gap'}]});
  a.quality.hides[0].verdict.boundaryIntegrity.right={status:'fail',observation:'Synthetic rectangular background block beside the complete child'};
  return {...reply,reading:{...reply.reading,raw:JSON.stringify(doc)}};
 };
 const container={...c,backgroundReview:provider.fake,visualReview:{request:async()=>{throw Error('No synchronous or real review');}}} as Container;
 const render=vi.fn<NonNullable<LocalPatchHideDeps['render']>>(async({requestKey,stylePng})=>{
  const h=hides.find(h=>requestKey.startsWith(h.id+':'))!,m=maskForHide(h);
  const figure=await sharp({create:{width:Math.round(m.width*.6),height:Math.round(m.height*.8),channels:4,background:'#1e3ca0'}}).png().toBuffer();
  const layers=[{input:figure,left:m.left+Math.round(m.width*.2),top:m.top+Math.round(m.height*.2)}];
  if(h.id===hideId)layers.push({input:await sharp({create:{width:gap.width,height:gap.height,channels:4,background:'#e7d9c8'}}).png().toBuffer(),left:gap.left,top:gap.top});
  return paintedOk(await sharp(stylePng).composite(layers).png().toBuffer(),bill('paint-'+gameId+'-'+requestKey,66500));
 });
 const diagnose=vi.fn(async()=>{throw Error('No diagnosis or repaint permitted');});
 const deps:LocalPatchHideDeps={readBoardArt:readArt,renderPolicySha256:localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY),render,judge:async()=>{throw Error('No synchronous review');}};
 const row=()=>db.targetVariantAsset.findFirstOrThrow({where:{variant:'A',targetInstance:{gameScene:{gameId,sceneSlug:'paris'},targetId:hide.targetId}}});
 let pendingSeen=false,last='';
 let previousLedger: string | null=null, previousSiblings: unknown=null, previousPaints=0, previousQuestions=0;
 for(let turn=0;turn<180;turn++){
  const result=await runLocalPatchWorldSlice(container,deps,gameId,{hardDeadlineAt:Date.now()+270000,diagnose});
  const r=await db.targetVariantAsset.findFirst({where:{variant:'A',targetInstance:{gameScene:{gameId,sceneSlug:'paris'},targetId:hide.targetId}}}),j=JSON.parse(r?.judgeJson??'null');
  if(j?.sourceBodyGapFill&&j.reviewState==='pending-board-review'){
   if(!pendingSeen){
    expect(previousLedger).not.toBeNull();
    const before=JSON.parse(previousLedger!),after=JSON.parse((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId:boardWizardWorldId(gameId)}})).snapshotJson);
    expect(after.requests).toHaveLength(before.requests.length);
    for(const paid of before.requests){
     const current=after.requests.find((p:{requestKey:string})=>p.requestKey===paid.requestKey);
     // The native slice polls already-submitted sibling reviews BEFORE free
     // compositions. A real terminal settlement is allowed; no new request,
     // lost reserve, reset or change to any settled/UNKNOWN evidence is.
     if(paid.state==='pending'&&current.state==='settled')expect(current).toMatchObject({requestKey:paid.requestKey,scope:paid.scope,operationFingerprint:paid.operationFingerprint,reserveMicroUsd:paid.reserveMicroUsd});
     else expect(current).toEqual(paid);
    }
    const inventory=(rows: typeof r[])=>rows.map(p=>({id:p!.id,assetId:p!.assetId,attempts:p!.attempts,costCents:p!.costCents,rectJson:p!.rectJson,hitRectJson:p!.hitRectJson,headAnchorJson:p!.headAnchorJson}));
    expect(inventory(await db.targetVariantAsset.findMany({where:{id:{not:r!.id},targetInstance:{gameScene:{gameId}}},orderBy:{id:'asc'}}))).toEqual(inventory(previousSiblings as typeof r[]));
    expect(render.mock.calls.length).toBe(previousPaints);expect(provider.creates.length).toBe(previousQuestions);
   }
   pendingSeen=true;expect(await allowedDualPublication(db,{gameId,sceneVersion:13,hideId,variantId:r!.id,attempts:r!.attempts,
    identityAssetId:'ast-sheet-'+gameId,identitySha256:j.sourceBodyGapFill.identitySha256,assetId:r!.assetId!,imageSha256:j.judgedSha256,
    geometrySha256:j.geometrySha256,judgeJson:r!.judgeJson})).toBe(false);
   expect(await correctSourceBodyGap(container,gameId,[r!],async()=>{},readArt)).toBe(false);
  }
  if(r?.status==='FAILED'&&!j?.sourceBodyGapFill){
   previousLedger=(await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId:boardWizardWorldId(gameId)}})).snapshotJson;
   previousSiblings=await db.targetVariantAsset.findMany({where:{id:{not:r.id},targetInstance:{gameScene:{gameId}}},orderBy:{id:'asc'}});
   previousPaints=render.mock.calls.length;previousQuestions=provider.creates.length;
  }
  if(j?.sourceBodyGapFill&&j.reviewState==='board-review-complete')break;
  last=JSON.stringify({turn,result,row:r&&{status:r.status,attempts:r.attempts,error:r.lastError,review:j?.reviewState}});
  if(!result.pending)break;
 }
 const accepted=await row(),j=JSON.parse(accepted.judgeJson!);expect(j.sourceBodyGapFill,last).toBeDefined();expect(pendingSeen).toBe(true);
 expect(accepted).toMatchObject({status:'GENERATED',attempts:1});expect(j.verdict.verdict).toBe('pass');
 expect(diagnose).not.toHaveBeenCalled();expect(render.mock.calls.filter(([r])=>r.requestKey.startsWith(hideId+':'))).toHaveLength(1);
 expect(provider.creates.filter(p=>p.hideId===hideId)).toHaveLength(2);
 expect(provider.creates.filter(p=>p.hideId===hideId)[1]!.prompt).toContain('SOURCE BODY GAP source-body-gap-fill/v1');
 const audit=await db.auditLog.findUniqueOrThrow({where:{id:j.sourceBodyGapFill.auditId}}),meta=JSON.parse(audit.metaJson!);
 expect(meta).toMatchObject({providerCalls:0,attemptsPreserved:true,cyclesPreserved:true,requestsPreserved:true,approvalTransferred:false});
 const old=JSON.parse(meta.previousJudgeJson);expect(old.verdict.verdict).toBe('fail');expect(j.sourceBodyBirth).toEqual(old.sourceBodyBirth);
 expect(j.sourceBodyComposition).toEqual(old.sourceBodyComposition);expect(j.geometrySha256).toBe(old.geometrySha256);
 const pixels=async(id:string)=>{const a=await db.asset.findUniqueOrThrow({where:{id}});return sharp(await c.storage.get(a.storagePath)).ensureAlpha().raw().toBuffer();};
 const before=await pixels(j.sourceBodyGapFill.baselineAssetId),after=await pixels(accepted.assetId!);let changes=0;
 for(let y=0;y<768;y++)for(let x=0;x<512;x++){
  const i=(y*512+x)*4;if(before.subarray(i,i+4).equals(after.subarray(i,i+4)))continue;
  changes++;if(!(x>=gap.left&&x<gap.left+gap.width&&y>=gap.top&&y<gap.top+gap.height))throw Error('Changed pixel outside fixed gap');
 }
 expect(changes).toBe(2160);expect(meta.proof.changedPixels).toBe(2160);
 const base=await sourceBodyGapBaseline(db,gameId,j.sourceBodyGapFill,readArt);expect(base?.previousJudgeJson).toBe(meta.previousJudgeJson);
 expect(await allowedDualPublication(db,{...publicationBinding(gameId,accepted),sceneVersion:13})).toBe(true);
 const ledger=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId:boardWizardWorldId(gameId)}}),ledgerJson=JSON.parse(ledger.snapshotJson);
 const kept=new PrismaRetainedPurchaseStore(db),paid=await kept.get(boardWizardWorldId(gameId),j.sourceBodyGapFill.sourceRequestKey);
 expect(paid?.payloadSha256).toBe(j.sourceBodyGapFill.sourcePayloadSha256);
 for(const field of ['candidateSha256','sourceFingerprint','sourcePayloadSha256','identitySha256','geometrySha256','authoritySha256']){
  const forged={...j.sourceBodyGapFill,[field]:'f'.repeat(64)};expect(await sourceBodyGapBaseline(db,gameId,forged,readArt)).toBeNull();
 }
 const baseAsset=await db.asset.findUniqueOrThrow({where:{id:j.sourceBodyGapFill.baselineAssetId}}),baseBlob=await db.fileBlob.findUniqueOrThrow({where:{key:baseAsset.storagePath}});
 const corrupt=Buffer.from(baseBlob.data);corrupt[corrupt.length-20]=corrupt[corrupt.length-20]!^1;
 await db.fileBlob.update({where:{key:baseBlob.key},data:{data:corrupt}});
 expect(await allowedDualPublication(db,{...publicationBinding(gameId,accepted),sceneVersion:13})).toBe(false);
 await db.fileBlob.update({where:{key:baseBlob.key},data:{data:baseBlob.data}});
 await db.order.update({where:{id:'order-'+gameId},data:{paymentStatus:'REFUNDED'}});
 expect(await sourceBodyGapBaseline(db,gameId,j.sourceBodyGapFill,readArt)).toBeNull();
 await db.order.update({where:{id:'order-'+gameId},data:{paymentStatus:'PAID'}});
 const missing={...j};delete missing.sourceBodyGapFill;
 expect(await allowedDualPublication(db,{...publicationBinding(gameId,accepted),judgeJson:JSON.stringify(missing),sceneVersion:13})).toBe(false);
 expect(await sourceBodyGapBaseline(db,gameId,j.sourceBodyGapFill,async()=>{throw Error('Wrong source');})).toBeNull();
 expect(JSON.parse((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId:ledger.worldId}})).snapshotJson)).toEqual(ledgerJson);
 expect((await kept.get(boardWizardWorldId(gameId),j.sourceBodyGapFill.sourceRequestKey))?.payloadSha256).toBe(paid!.payloadSha256);
 expect((await db.auditLog.findUniqueOrThrow({where:{id:audit.id}})).metaJson).toBe(audit.metaJson);
},600000);

// crown-tab/v1 on real windows from the context the engine builds (2026-11-02: paid crowns drawn 11/35/45 px above
// the whole window: New York 2 under a bench reader's knee, Paris 1 and Giza 2 on their corrected source-body windows).
// No new painting: the paid crown is tabbed back, a fresh review decides.
it.each([
 {board:"newyork",hideId:"newyork-detectives-hide-2",above:11,head:{left:200,width:120,height:130},body:false},
 {board:"paris",hideId:"paris-detectives-hide-1",above:35,head:{left:170,width:110,height:120},body:true},
 {board:"giza",hideId:"giza-detectives-hide-2",above:45,head:{left:170,width:110,height:110},body:true},
 // Paris 2 also carries the free prop-join correction first; the tab is over it and keeps it byte for byte.
 {board:"paris",hideId:"paris-detectives-hide-2",above:35,head:{left:260,width:120,height:150},body:false,prop:true},
] as const)("tabs a paid crown drawn above its window back for free and publishes it only after a fresh ordinary review; hide=$hideId",async(testCase)=>{
 const {board,hideId,above,head,body}=testCase,prop="prop" in testCase&&testCase.prop;
 vi.useFakeTimers({toFake:["Date"]});
 const gameId="detective-crown-tab-synthetic-"+hideId;await newDetectiveWorld(gameId,7,true);
 const context=await resolveLocalPatchBoardsForGame(db,gameId,13),hides=context.boards.flatMap(b=>b.hides);
 const ny2=hides.find(h=>h.id===hideId)!,returned=ny2.returnRect!;
 // The trusted context carries the window the engine actually composes with: the corrected body window for body hides.
 expect(!!sourceBodyForHide(context,hideId)).toBe(body);
 if(body)expect(returned).toEqual(sourceBodyForHide(context,hideId)!.returnRect);
 const rawHead={...head,top:returned.top-above};
 const provider=controlledSol(false,true,ny2.id,true,true,13,1),retrieve=provider.fake.retrieve.bind(provider.fake);
 // The first NY2 answer locates a complete RAW crown above the window and an incomplete shipped one.
 provider.fake.retrieve=async id=>{const reply=await retrieve(id);if(reply.status!=="completed")return reply;
  const asked=provider.creates[Number(id.split("_").at(-1))-1]!;if(asked.hideId!==ny2.id||provider.creates.filter(x=>x.hideId===ny2.id).indexOf(asked)!==0)return reply;
  const answer=JSON.parse(reply.reading.raw!);Object.assign(answer.head,{rawHead,shippingHead:{...rawHead,top:returned.top+2,height:rawHead.height-13},rawCrown:"pass",shippingCrown:"fail",
   observation:"Synthetic complete RAW crown above the whole window; the shipped crown is cut at the top join."});
  if(prop)Object.assign(answer.continuity.cases[0],{state:"broken",visibleBody:true,headConnection:"connected",
   headTrace:"The synthetic shipping crown has a hard cut while the visible head remains connected.",
   faults:[{kind:"hard-cut",where:"Synthetic target crown at the top return."}]});
  return{...reply,reading:{...reply.reading,raw:JSON.stringify(answer)}};};
 const container={...c,backgroundReview:provider.fake,visualReview:{request:async()=>{throw Error("No synchronous review");}}} as Container;
 const render=vi.fn<NonNullable<LocalPatchHideDeps["render"]>>(async({requestKey,stylePng})=>{
  const hide=hides.find(h=>requestKey.startsWith(h.id+":"))!,mask=maskForHide(hide);
  const figure=await sharp({create:{width:Math.round(mask.width*0.6),height:Math.round(mask.height*0.8),channels:4,background:"#1e3ca0"}}).png().toBuffer();
  const layers=[{input:figure,left:mask.left+Math.round(mask.width*0.2),top:mask.top+Math.round(mask.height*0.2)}];
  if(hide.id===ny2.id)layers.push({input:await sharp({create:{width:rawHead.width,height:rawHead.height,channels:4,background:"#5a3214"}}).png().toBuffer(),left:rawHead.left,top:rawHead.top});
  let canvas=stylePng;
  if(prop&&hide.id===ny2.id){
   // The prop test's PUBLIC-source misplacement: the lower prop compressed toward its rear support.
   const src=await sharp(stylePng).ensureAlpha().raw().toBuffer(),out=Buffer.from(src);
   for(let y=350;y<768;y++)for(let x=200;x<512;x++){
    const w=Math.max(0,Math.min(1,(y-350)/(727-350))),xx=Math.min(511,Math.round(200+(x-200)*(1+.4*w))),yy=Math.min(767,Math.round(y+10*w));
    for(let ch=0;ch<4;ch++)out[(y*512+x)*4+ch]=src[(yy*512+xx)*4+ch]!;
   }
   canvas=await sharp(out,{raw:{width:512,height:768,channels:4}}).png().toBuffer();
   layers.shift();
  }
  return paintedOk(await sharp(canvas).composite(layers).png().toBuffer(),bill("paint-"+gameId+"-"+requestKey,66500));
 });
 const deps:LocalPatchHideDeps={readBoardArt:readArt,renderPolicySha256:localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY),render,judge:async()=>{throw Error("No synchronous review");}};
 const diagnose=vi.fn(async()=>{throw Error("No planner");});
 const row=()=>db.targetVariantAsset.findFirstOrThrow({where:{variant:"A",targetInstance:{gameScene:{gameId,sceneSlug:board},targetId:ny2.targetId}}});
 let last="",unreviewedTabSeen=false;
 for(let turn=0;turn<200;turn++){
  const result=await runLocalPatchWorldSlice(container,deps,gameId,{hardDeadlineAt:Date.now()+270_000,diagnose});
  const current=await db.targetVariantAsset.findFirst({where:{variant:"A",targetInstance:{gameScene:{gameId,sceneSlug:board},targetId:ny2.targetId}}});
  const j=current?.judgeJson?JSON.parse(current.judgeJson):null;
  if(j?.crownTab&&j.reviewState==="pending-board-review"){
   unreviewedTabSeen=true;
   expect(await allowedDualPublication(db,{gameId,sceneVersion:13,hideId:ny2.id,variantId:current!.id,attempts:current!.attempts,
    identityAssetId:'ast-sheet-'+gameId,identitySha256:j.crownTab.identitySha256,assetId:current!.assetId!,
    imageSha256:j.judgedSha256,geometrySha256:j.geometrySha256,judgeJson:current!.judgeJson})).toBe(false);
  }
  if(j?.crownTab&&j.reviewState==="board-review-complete")break;
  const step=(await db.generationJob.findUniqueOrThrow({where:{id:"job_"+gameId}}));
  last=JSON.stringify({turn,pending:result.pending,attention:result.attention,step:step.currentStep,status:step.status,row:current&&[current.status,current.attempts,j?.reviewState,j?.lastError??current.lastError]});
  if(!result.pending)break;
  if(step.currentStep==="local-patch:recovery-budget-wait")
   await db.generationJob.update({where:{id:"job_"+gameId},data:{updatedAt:new Date(Date.now()-LEAN_RECOVERY_BACKOFF_MS-1000)}});
 }
 const accepted=await row(),j=JSON.parse(accepted.judgeJson!);
 expect(j.crownTab,last).toBeDefined();expect(unreviewedTabSeen).toBe(true);
 // The refusal the tab answered, exactly as its audit archived it (the refusal and the tab may share one slice).
 const tabAudit=JSON.parse((await db.auditLog.findUniqueOrThrow({where:{id:j.crownTab.auditId}})).metaJson!);
 const refused={assetId:tabAudit.previousAssetId as string,attempts:accepted.attempts,judgeJson:tabAudit.previousJudgeJson as string};
 const refusedReceipt=JSON.parse(refused.judgeJson);
 if(prop)expect(j.crownTab.continuityRepair).toMatchObject({version:"crown-tab-continuity-repair/v1",sourceRawSha256:j.crownTab.headAnswer.rawSha256});
 else expect(j.crownTab.continuityRepair).toBeUndefined();
 expect(refusedReceipt.reviewState).toBe("board-review-complete");expect(refusedReceipt.verdict.verdict).toBe("fail");
 const refusedChecks=refusedReceipt.verdict.faults.map((f:{check:string})=>f.check);
 expect(refusedChecks).toContain("childComplete");
 expect(refusedChecks.every((check:string)=>["childComplete","pictureWhole","severeSeam"].includes(check)),JSON.stringify(refusedReceipt.verdict.faults)).toBe(true);
 expect(accepted).toMatchObject({status:"GENERATED",attempts:1});
 expect(j.reviewState).toBe("board-review-complete");expect(j.verdict.verdict).toBe("pass");
 expect(j.crownTab).toMatchObject({version:"crown-tab/v1",hideId:ny2.id,rawHead,returned,baselineAssetId:refused!.assetId,baselineShippingSha256:refusedReceipt.judgedSha256});
 // An earlier free correction is the tab's baseline and stays part of the receipt and its proof.
 if(prop){expect(refused!.assetId).toMatch(/^ast_prop_/);expect(refusedReceipt.propJoinCorrection).toBeDefined();expect(j.propJoinCorrection).toEqual(refusedReceipt.propJoinCorrection);}
 if(body)expect(j.sourceBodyBirth).toEqual(refusedReceipt.sourceBodyBirth);
 // The fresh review judged the head against the window and its tab, never the old window.
 expect(j.boardReview.dual.quality.headEvidence.returned).toEqual({...returned,top:j.crownTab.tab.top,height:returned.top+returned.height-j.crownTab.tab.top});
 // One painting and two reviews for NY2: the tab bought nothing.
 expect(render.mock.calls.filter(([input])=>input.requestKey.startsWith(ny2.id+":"))).toHaveLength(1);
 expect(provider.creates.filter(x=>x.hideId===ny2.id)).toHaveLength(2);
 const ledger=JSON.parse((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId:boardWizardWorldId(gameId)}})).snapshotJson);
 expect(ledger.requests.filter((r:{requestKey:string})=>r.requestKey.startsWith(ny2.id+":"))).toHaveLength(1);
 // Pixels: the paid crown is back above the window, and nothing outside the tab changed.
 const blob=async(assetId:string)=>{const a=await db.asset.findUniqueOrThrow({where:{id:assetId}});return sharp(Buffer.from((await db.fileBlob.findUniqueOrThrow({where:{key:a.storagePath}})).data)).ensureAlpha().raw().toBuffer();};
 const before=await blob(refused!.assetId!),after=await blob(accepted.assetId!),tab=j.crownTab.tab;
 const at=(b:Buffer,x:number,y:number)=>[...b.subarray((y*512+x)*4,(y*512+x)*4+3)];
 expect(at(after,rawHead.left+60,rawHead.top+2)).toEqual([0x5a,0x32,0x14]);expect(at(before,rawHead.left+60,rawHead.top+2)).not.toEqual([0x5a,0x32,0x14]);
 let outside=0;for(let y=0;y<768;y++)for(let x=0;x<512;x++)if(!(x>=tab.left&&x<tab.left+tab.width&&y>=tab.top&&y<tab.top+tab.height)&&at(after,x,y).join()!==at(before,x,y).join())outside++;
 expect(outside).toBe(0);
 const audit=await db.auditLog.findUniqueOrThrow({where:{id:j.crownTab.auditId}});
 expect(JSON.parse(audit.metaJson!)).toMatchObject({previousAssetId:refused!.assetId,providerCalls:0,attemptsPreserved:true,requestsPreserved:true});
 // Publication re-derives the tab; changed candidate pixels or a forged marker never publish.
 expect(await allowedDualPublication(db,{...publicationBinding(gameId,accepted),sceneVersion:13})).toBe(true);
 const forged={...j,crownTab:{...j.crownTab,tab:{...j.crownTab.tab,top:j.crownTab.tab.top-1,height:j.crownTab.tab.height+1}}};
 expect(await allowedDualPublication(db,{...publicationBinding(gameId,accepted),judgeJson:JSON.stringify(forged),sceneVersion:13})).toBe(false);
 const asset=await db.asset.findUniqueOrThrow({where:{id:accepted.assetId!}}),kept=await db.fileBlob.findUniqueOrThrow({where:{key:asset.storagePath}});
 const changed=Buffer.from(kept.data);changed[changed.length-20]=changed[changed.length-20]!^1;
 await db.fileBlob.update({where:{key:asset.storagePath},data:{data:changed}});
 expect(await allowedDualPublication(db,{...publicationBinding(gameId,accepted),sceneVersion:13})).toBe(false);
 await db.fileBlob.update({where:{key:asset.storagePath},data:{data:kept.data}});
 // Only the tab's own verifier reads its baseline: a changed baseline never publishes the tab.
 const baseAsset=await db.asset.findUniqueOrThrow({where:{id:refused!.assetId!}}),baseKept=await db.fileBlob.findUniqueOrThrow({where:{key:baseAsset.storagePath}});
 const baseChanged=Buffer.from(baseKept.data);baseChanged[baseChanged.length-20]=baseChanged[baseChanged.length-20]!^1;
 await db.fileBlob.update({where:{key:baseAsset.storagePath},data:{data:baseChanged}});
 expect(await allowedDualPublication(db,{...publicationBinding(gameId,accepted),sceneVersion:13})).toBe(false);
 await db.fileBlob.update({where:{key:baseAsset.storagePath},data:{data:baseKept.data}});
 expect(await allowedDualPublication(db,{...publicationBinding(gameId,accepted),sceneVersion:13})).toBe(true);
 expect(fetch).not.toHaveBeenCalled();
},1_200_000);

it('refuses a source-body third painting before reserving when its assessment cannot fit, without blocking an already generated row',async()=>{
 const gameId='detective-born-capacity-preflight';await newDetectiveWorld(gameId,7,true);
 const context=await resolveLocalPatchBoardsForGame(db,gameId,13),board=context.boards.find(b=>b.board==='giza')!,hide=board.hides[1]!;
 const scene=await db.gameScene.findFirstOrThrow({where:{gameId,sceneSlug:'giza'}}),target=sceneBySlug('giza',13).targets.find(t=>t.id===hide.targetId)!;
 const instance=await db.targetInstance.create({data:{id:'tgt-born-capacity',gameSceneId:scene.id,targetId:target.id,targetType:target.targetType,spriteKind:'image',slotAId:target.slots[0].id,slotBId:target.slots[1].id}});
 const pin=(await detectivesOperationalPolicyOf(db,gameId))!,rowId='tva-born-capacity';
 const receipt=JSON.stringify({sourceBodyBirth:sourceBodyBirthMarkerFor(pin,rowId,hide.id,2)});
 await db.targetVariantAsset.create({data:{id:rowId,targetInstanceId:instance.id,variant:'A',slotId:target.slots[0].id,provider:'openai',promptVersion:'local-patch-fixed-scenery/v19',status:'FAILED',attempts:2,lastError:'Synthetic rejected second image',judgeJson:receipt}});
 const budget=boardWizardBudgetOf(c),worldId=boardWizardWorldId(gameId),room=await budget.audit(worldId);
 const fill=room.remainingMicroUsd-330000;
 await budget.reserve(worldId,{requestKey:'synthetic-body-capacity-used',scope:'image',operationFingerprint:'c'.repeat(64),reserveMicroUsd:fill});
 await budget.settle(worldId,'synthetic-body-capacity-used',bill('synthetic-body-capacity-used',fill));
 const before=await budget.audit(worldId),forbidden=vi.fn(async()=>{throw Error('A painting without assessment capacity must not be bought');});
 const deps={render:forbidden,judge:forbidden,renderPolicySha256:localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY)};
 await expect(runLocalPatchHide(c,deps,{gameId,board,hide,finalRepair:true})).rejects.toThrow('Source-body painting requires capacity');
 expect(forbidden).not.toHaveBeenCalled();expect(await budget.audit(worldId)).toEqual(before);
 expect(await db.targetVariantAsset.findUniqueOrThrow({where:{id:rowId}})).toMatchObject({status:'FAILED',attempts:2,judgeJson:receipt});
 await db.targetVariantAsset.update({where:{id:rowId},data:{status:'GENERATED'}});
 expect(await runLocalPatchHide(c,deps,{gameId,board,hide,finalRepair:true})).toMatchObject({state:'already-generated',attempts:2});
 expect(forbidden).not.toHaveBeenCalled();expect(await budget.audit(worldId)).toEqual(before);
},180000);

it('returns a finite gave-up result before creating a fourth from-birth marker',async()=>{
 const gameId='detective-born-finite-exhaustion';await newDetectiveWorld(gameId,7,true);
 const context=await resolveLocalPatchBoardsForGame(db,gameId,13),board=context.boards.find(b=>b.board==='giza')!,hide=board.hides[1]!;
 const scene=await db.gameScene.findFirstOrThrow({where:{gameId,sceneSlug:'giza'}}),target=sceneBySlug('giza',13).targets.find(t=>t.id===hide.targetId)!;
 const instance=await db.targetInstance.create({data:{id:'tgt-born-exhausted',gameSceneId:scene.id,targetId:target.id,targetType:target.targetType,spriteKind:'image',slotAId:target.slots[0].id,slotBId:target.slots[1].id}});
 const pin=(await detectivesOperationalPolicyOf(db,gameId))!,rowId='tva-born-exhausted';
 await db.targetVariantAsset.create({data:{id:rowId,targetInstanceId:instance.id,variant:'A',slotId:target.slots[0].id,provider:'openai',promptVersion:'local-patch-fixed-scenery/v19',status:'FAILED',attempts:3,lastError:'Synthetic conclusive image failure after the normal limit',judgeJson:JSON.stringify({sourceBodyBirth:sourceBodyBirthMarkerFor(pin,rowId,hide.id,3)})}});
 const audit=await boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId));
 const forbidden=vi.fn(async()=>{throw Error('No fourth purchase is permitted');});
 const result=await runLocalPatchHide(c,{render:forbidden,judge:forbidden,renderPolicySha256:localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY)},{gameId,board,hide,finalRepair:true});
 expect(result).toMatchObject({state:'gave-up',attempt:3,attempts:3});expect(forbidden).not.toHaveBeenCalled();
 expect(await boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId))).toEqual(audit);
 expect(await db.targetVariantAsset.findUniqueOrThrow({where:{id:rowId}})).toMatchObject({status:'FAILED',attempts:3});
},180000);

it("completes a fresh Explorer Journey with 27 images and exactly 27 combined MEDIUM assessments under its own four-dollar ceiling", async () => {
  const gameId = "explorer-born-single-world-synthetic";
  await newDetectiveWorld(gameId, 8, true, true);
  const context = await resolveLocalPatchBoardsForGame(db, gameId, 12);
  const journey = new Set(boardsOfWorlds(["journey"]));
  const hides = context.boards.filter(board => journey.has(board.board)).flatMap(board => board.hides);
  const provider = controlledSol(false, false, undefined, false, false, 12);
  const request = vi.fn(async () => { throw Error("A prospective Explorer cannot buy a historical HIGH review"); });
  const diagnose = vi.fn(async () => { throw Error("Clean synthetic results cannot buy a diagnosis"); });
  const container = { ...c, visualReview: { request }, backgroundReview: provider.fake } as Container;
  const render = vi.fn<LocalPatchHideDeps["render"]>(async ({requestKey, stylePng, subjectQuality}) => {
    expect(subjectQuality).toBe("medium"); expect(requestKey.endsWith(":render:1")).toBe(true);
    const hide = hides.find(hide => requestKey.startsWith(hide.id + ":")); if (!hide) throw Error("Unknown synthetic Explorer hide");
    const mask = maskForHide(hide);
    const figure = await sharp({create:{width:Math.round(mask.width*0.6),height:Math.round(mask.height*0.8),channels:4,background:"#1e3ca0"}}).png().toBuffer();
    const png = await sharp(stylePng).composite([{input:figure,left:mask.left+Math.round(mask.width*0.2),top:mask.top+Math.round(mask.height*0.2)}]).png().toBuffer();
    return paintedOk(png, bill(requestKey, 50000));
  });
  const deps: LocalPatchHideDeps = { readBoardArt: readArt, renderPolicySha256: localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY), render,
    judge: async () => { throw Error("Per-hide historical judge forbidden"); } };
  let result = { pending:true, attention:null as string|null }, ticks=0;
  while (result.pending && ticks++ < 900) {
    result = await runLocalPatchWorldSlice(container, deps, gameId, {hardDeadlineAt:Date.now()+270000,diagnose});
    expect(result.attention).toBeNull();
  }
  expect(result.pending).toBe(false); expect(render).toHaveBeenCalledTimes(27); expect(provider.creates).toHaveLength(27);
  expect(new Set(provider.creates.map(create => create.hideId)).size).toBe(27);
  const game = await db.game.findUniqueOrThrow({where:{id:gameId}});
  expect(["READY","DELIVERED"]).toContain(game.status);
  const config = parseGameConfig(game.configJson!);
  expect(config.scenes).toHaveLength(9); expect(config.scenes.flatMap(scene=>scene.targets)).toHaveLength(27);
  expect(config.scenes.every(scene=>scene.version===12 && scene.playMode==="find-any")).toBe(true);
  const rows = await db.targetVariantAsset.findMany({where:{variant:"A",targetInstance:{gameScene:{gameId}}}});
  for (const row of rows) {
    expect(row.status).toBe("GENERATED"); expect(row.attempts).toBe(1);
    expect(JSON.parse(row.judgeJson!).boardReview.dual.single).toBe(SINGLE_MEDIUM_VISUAL_REVIEW_VERSION);
    expect(await allowedDualPublication(db,publicationBinding(gameId,row))).toBe(true);
  }
  expect(await boardWizardBudgetOf(container).audit(boardWizardWorldId(gameId))).toMatchObject({capMicroUsd:4000000,held:false,pendingRequestKeys:[],unknownRequestKeys:[]});
  expect(await explorersOperationalPolicyOf(db,gameId)).toMatchObject({effort:"low",oneUsableAssessmentPerImage:true});
  const child=await db.childProfile.findUniqueOrThrow({where:{id:"chl-"+gameId}});
  expect(child.originalPhotoAssetId).toBeNull();
  expect(await db.auditLog.count({where:{entityId:gameId,actorType:"ADMIN"}})).toBe(0);
  expect(request).not.toHaveBeenCalled(); expect(diagnose).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
},1500000);


it("resumes v3 and v4 Explorer guided thirds through one fresh MEDIUM each and normal all-27 publication", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    const gameId = "explorer-born-guided-third-synthetic";
    await newDetectiveWorld(gameId, 7, true, true);
    const context = await resolveLocalPatchBoardsForGame(db, gameId, 12);
    const journey = new Set(boardsOfWorlds(["journey"]));
    const hides = context.boards.filter(board => journey.has(board.board)).flatMap(board => board.hides);
    const legacy = context.boards.find(board => board.board === "paris")!.hides[2]!;
    const authored = context.boards.find(board => board.board === "greatwall")!.hides[1]!;
    expect(legacy.returnRect).toBeUndefined(); expect(authored.returnRect).toBeDefined();
    const selected = [legacy, authored];
    const selectedIds = selected.map(hide => hide.id);
    const provider = controlledSol(false, true, selectedIds, true, false, 12);
    const synchronous = vi.fn(async () => { throw Error("An Explorer cannot buy a historical HIGH question"); });
    const diagnose = vi.fn(async () => { throw Error("A conclusive LOW boundary refusal already locates this repair"); });
    const container = { ...c, visualReview: { request: synchronous }, backgroundReview: provider.fake } as Container;
    let guides = 0, resumedCheckpoint = false;
    const render = vi.fn<LocalPatchHideDeps["render"]>(async ({ requestKey, stylePng, placementGuidePng, placementGuideVersion, maskPng, subjectQuality }) => {
      expect(subjectQuality).toBe("medium");
      const hide = hides.find(hide => requestKey.startsWith(hide.id + ":"));
      if (!hide) throw Error("Unknown synthetic Explorer hide");
      const attempt = Number(requestKey.split(":").at(-1));
      expect(selectedIds.includes(hide.id) ? [1, 2, 3] : [1]).toContain(attempt);
      let frame = maskForHide(hide);
      if (selectedIds.includes(hide.id) && attempt === 3) {
        guides++;
        // This exact historical pending checkpoint keeps its original recipe;
        // the other unbought third receives the single-frame v2 guide.
        expect(placementGuideVersion).toBe(hide.id===legacy.id?GUIDED_FRAME_RECOVERY_VERSION:PLACEMENT_GUIDE_V2_VERSION);
        expect(placementGuidePng).toBeDefined();
        const unchangedReturn = localPatchReturnRegion(cropOf(hide), frame, hide.returnRect).local;
        const geometry = guidedFrameGeometry(frame, unchangedReturn);
        expect(geometry.returned).toEqual(unchangedReturn);
        frame = geometry.target;
        const alpha = await sharp(maskPng).ensureAlpha().raw().toBuffer();
        let editable = 0;
        for (let i = 3; i < alpha.length; i += 4) if (alpha[i] === 0) editable++;
        expect(editable).toBe(hide.id === legacy.id ? unchangedReturn.width * unchangedReturn.height
          : (unchangedReturn.width - 24) * (unchangedReturn.height - 24));
      } else {
        expect(placementGuideVersion).toBe(PLACEMENT_GUIDE_V2_VERSION);expect(placementGuidePng).toBeDefined();
        frame=guidedFrameGeometry(frame,localPatchReturnRegion(cropOf(hide),frame,hide.returnRect).local).target;
      }
      const figure = await sharp({ create: { width: Math.round(frame.width * 0.6), height: Math.round(frame.height * 0.8), channels: 4,
        background: attempt === 2 ? "#304f91" : attempt === 3 ? "#704f91" : "#1e3ca0" } }).png().toBuffer();
      const png = await sharp(stylePng).composite([{ input: figure, left: frame.left + Math.round(frame.width * 0.2), top: frame.top + Math.round(frame.height * 0.2) }]).png().toBuffer();
      return paintedOk(png, bill(requestKey, 50000));
    });
    const deps: LocalPatchHideDeps = { readBoardArt: readArt, renderPolicySha256: localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY), render,
      judge: async () => { throw Error("Per-hide historical judge forbidden"); } };
    let result = { pending: true, attention: null as string | null }, ticks = 0;
    while (result.pending && ticks++ < 900) {
      result = await runLocalPatchWorldSlice(container, deps, gameId, { hardDeadlineAt: Date.now() + 270000, diagnose });
      expect(result.attention).toBeNull();
      if (!resumedCheckpoint) {
        const row = await db.targetVariantAsset.findFirst({ where: { variant: "A", status: "FAILED", attempts: 2,
          targetInstance: { gameScene: { gameId, sceneSlug: "paris" }, targetId: legacy.targetId } } });
        if (row && guidedFrameCandidate(row)) {
          const grant = await explorersOperationalPolicyOf(db, gameId);
          expect(grant).not.toBeNull();
          const receipt = JSON.parse(row.judgeJson!);
          // Local synthetic interruption fixture: the real failing case already
          // wrote this checkpoint and made no third provider purchase.
          await db.targetVariantAsset.update({ where: { id: row.id }, data: { status: "PENDING", attempts: 3, updatedAt:new Date(Date.now()),
            judgeJson: JSON.stringify({ ...receipt, guidedFrameRecovery: newGuidedFrameMarker(row, grant!.authorizationSha256, 12) }) } });
          // Resume this fresh historical lease before advancing the fake clock.
          // Prisma's own @updatedAt clock is real, so the fixture pins it above.
          expect(await runLocalPatchHide(container,deps,{gameId,board:context.boards.find(b=>b.board==="paris")!,hide:legacy,
            finalRepair:true,guidedFrame:true})).toMatchObject({state:"generated",attempt:3});
          resumedCheckpoint = true;
        }
      }
      if (result.pending) await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS + 1);
    }
    expect(result.pending).toBe(false);
    expect(render).toHaveBeenCalledTimes(31);
    expect(guides).toBe(2); expect(resumedCheckpoint).toBe(true);
    expect(provider.creates).toHaveLength(31);
    for (const hide of selected) expect(provider.creates.filter(question => question.hideId === hide.id)).toHaveLength(3);
    const game = await db.game.findUniqueOrThrow({ where: { id: gameId } });
    expect(["READY", "DELIVERED"]).toContain(game.status);
    const config = parseGameConfig(game.configJson!);
    expect(config.scenes).toHaveLength(9);
    expect(config.scenes.flatMap(scene => scene.targets)).toHaveLength(27);
    const rows = await db.targetVariantAsset.findMany({ where: { variant: "A", targetInstance: { gameScene: { gameId } } }, include: { targetInstance: { include: { gameScene: true } } } });
    for (const row of rows) {
      const guided = selected.some(hide => row.targetInstance.gameScene.sceneSlug === (hide.id === legacy.id ? "paris" : "greatwall") && row.targetInstance.targetId === hide.targetId);
      expect(row.status).toBe("GENERATED");
      expect(row.attempts).toBe(guided ? 3 : 1);
      const receipt = JSON.parse(row.judgeJson!);
      expect(receipt.boardReview.dual.single).toBe(SINGLE_MEDIUM_VISUAL_REVIEW_VERSION);
      if (guided) {
        expect(receipt.guidedFrameRecovery).toMatchObject({ version: GUIDED_FRAME_RECOVERY_VERSION, sceneVersion: 12, originalAttempts: 2 });
        expect(receipt.qualityDisposition.state).toBe("acceptable");
        if (row.targetInstance.gameScene.sceneSlug === "paris") {
          expect(receipt.compositionVersion).toBe(LOCAL_PATCH_COMPOSITION_VERSION);
          expect(receipt.authoredReturn).toBeUndefined();
        } else expect(receipt.compositionVersion).toBe(AUTHORED_PATCH_COMPOSITION_VERSION);
      }
      expect(await allowedDualPublication(db, publicationBinding(gameId, row))).toBe(true);
      const altered=JSON.parse(row.judgeJson!);altered.boardReview.dual.quality.headEvidence.returned={left:0,top:0,width:512,height:768};expect(await allowedDualPublication(db,{...publicationBinding(gameId,row),judgeJson:JSON.stringify(altered)})).toBe(false);
      expect(await hasLocalPatchPublicationPolicy(container, publicationBinding(gameId, row))).toBe(true);
    }
    const audit = await boardWizardBudgetOf(container).audit(boardWizardWorldId(gameId));
    expect(audit).toMatchObject({ capMicroUsd: 4000000, held: false, pendingRequestKeys: [], unknownRequestKeys: [] });
    expect(audit.committedMicroUsd).toBeLessThanOrEqual(4000000);
    expect(await db.childProfile.findUniqueOrThrow({ where: { id: "chl-" + gameId } })).toMatchObject({ originalPhotoAssetId: null });
    expect(await db.auditLog.count({ where: { entityId: gameId, actorType: "ADMIN" } })).toBe(0);
    expect(await db.auditLog.findUnique({ where: { id: detectivesExtensionId(gameId) } })).toBeNull();
    expect(synchronous).not.toHaveBeenCalled(); expect(diagnose).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
}, 1500000);


it.each((["outer", "nested"] as const).flatMap(location => (["pass","semantic-fail","doubt","crown-fail"] as const)
  .map(decision => ({location, decision}))))("reconciles one settled MEDIUM $location metadata echo through the normal free route; decision=$decision", async ({location,decision})=>{
  const gameId="explorer-bound-envelope-synthetic-"+location+"-"+decision;
  await newDetectiveWorld(gameId,8,true,true);
  const context=await resolveLocalPatchBoardsForGame(db,gameId,12),hides=context.boards.flatMap(b=>b.hides);
  const provider=controlledSol(false,false,undefined,false,false,12),originalRetrieve=provider.fake.retrieve;
  provider.fake.retrieve=async id=>{
    const state=await originalRetrieve(id);if(state.status!=="completed")return state;
    const outer=JSON.parse(state.reading.raw!),assessment=outer.assessment.version===SOURCE_NEIGHBOR_BUNDLE_VERSION?outer.assessment.assessment:outer.assessment;
    const upgrade=(await subjectUpgradeOf(db,gameId))!,hideId=assessment.subject.hideId;
    const hashes={photoSha256:upgrade.photoSha256,planSha256:subjectPlanSha256(subjectPlanOfHide(hideId,12)!)};
    Object.assign(location==="nested"?assessment.subject:assessment, {...hashes,...(location==="outer"?{subjectPolicy:SUBJECT_POLICY_V2}:{})});
    if(decision==="semantic-fail")Object.assign(assessment.quality.hides[0].verdict,{verdict:"fail",pictureWhole:"fail",severeSeam:"fail",
      reason:"Synthetic doubled table edge at the left return",faults:[{check:"severeSeam",where:"Synthetic doubled table edge at the left return"}]});
    if(decision==="doubt"){outer.doubt=true;outer.doubtReason="Synthetic unresolved body continuity observation";}
    if(decision==="crown-fail")outer.head.shippingCrown="fail";
    return {...state,reading:{...state.reading,raw:JSON.stringify(outer)}};
  };
  const forbidden=vi.fn(async()=>{throw Error("No synchronous question or diagnostic is permitted");});
  const container={...c,backgroundReview:provider.fake,visualReview:{request:forbidden}} as Container;
  const render=vi.fn<LocalPatchHideDeps["render"]>(async input=>{
    expect(hides.some(h=>input.requestKey.startsWith(h.id+":"))).toBe(true);
    return paintedOk(input.stylePng,bill("synthetic-echo-"+input.requestKey,50000));
  });
  const deps:LocalPatchHideDeps={readBoardArt:readArt,renderPolicySha256:localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY),render,judge:forbidden};
  let row:Awaited<ReturnType<typeof db.targetVariantAsset.findFirst>>=null;
  for(let turn=0;turn<50&&!row;turn++){
    await runLocalPatchWorldSlice(container,deps,gameId,{maxHides:1,hardDeadlineAt:Date.now()+270000,diagnose:forbidden});
    const rows=await db.targetVariantAsset.findMany({where:{variant:"A",targetInstance:{gameScene:{gameId}}}});
    row=rows.find(r=>JSON.parse(r.judgeJson??"null")?.boardReview?.dual?.single===SINGLE_MEDIUM_VISUAL_REVIEW_VERSION)??null;
  }
  expect(row).not.toBeNull();expect((await db.game.findUniqueOrThrow({where:{id:gameId}})).status).toBe("TARGETS_GENERATING");
  const prior=JSON.parse(row!.judgeJson!);
  // A restart from the previous reader: the paid bytes already contain every
  // role; only its old unreadable decision is restored in this synthetic DB.
  for(const role of ["quality","continuity","subject"]){
    if(location==="nested")prior.boardReview.dual[role].envelopeReader=BOUND_SUBJECT_QUALITY_ENVELOPE_READER;
    else delete prior.boardReview.dual[role].envelopeReader;
  }
  prior.verdict=null;prior.wireFault="schema";prior.qualityDisposition={state:"unresolved",faults:["integration-review-unreadable"]};
  delete prior.reviewHistory;
  const oldJson=JSON.stringify(prior),lastError="quality-unresolved: integration-review-unreadable";
  await db.targetVariantAsset.update({where:{id:row!.id},data:{status:"FAILED",lastError,judgeJson:oldJson}});
  await db.targetInstance.update({where:{id:row!.targetInstanceId},data:{status:"FAILED"}});
  // Use the real mixed-rest engine decision, not a synthetic budget sentence.
  const rest=localPatchRestDecision([{hideId:hides[1]!.id,rest:"spent"},{hideId:prior.hide,rest:"evidence"}]);
  if(rest?.action!=="park")throw Error("Synthetic mixed-rest fixture must park");
  await db.generationJob.update({where:{id:"job_"+gameId},data:{status:"FAILED",currentStep:"local-patch:recovery-exhausted",lastError:rest.reason}});
  const budget=boardWizardBudgetOf(container),worldId=boardWizardWorldId(gameId);
  await budget.reserve(worldId,{requestKey:"synthetic-unknown-held-capacity",scope:"image",operationFingerprint:"a".repeat(64),
    reserveMicroUsd:(await budget.audit(worldId)).remainingMicroUsd});
  await budget.markUnknown(worldId,"synthetic-unknown-held-capacity","Synthetic upstream outcome has no verifiable usage");
  const ledgerBefore=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}});
  const retainedKey=retainedPurchaseKey(worldId,prior.boardReview.dual.quality.requestKey),kept=await db.fileBlob.findUniqueOrThrow({where:{key:retainedKey}});
  const callsBefore=provider.creates.length,rendersBefore=render.mock.calls.length,jobBefore=await db.generationJob.findUniqueOrThrow({where:{id:"job_"+gameId}});
  // A different typed hold or a nonfailed job cannot gain a free wake.
  await db.generationJob.update({where:{id:jobBefore.id},data:{currentStep:"local-patch:needs-release"}});
  expect(await nextBoundEnvelopeReconciliation(container)).toBeNull();
  await db.generationJob.update({where:{id:jobBefore.id},data:{currentStep:jobBefore.currentStep,status:"QUEUED"}});
  expect(await nextBoundEnvelopeReconciliation(container)).toBeNull();
  await db.generationJob.update({where:{id:jobBefore.id},data:{status:jobBefore.status,lastError:"Unrelated operator hold"}});
  expect(await nextBoundEnvelopeReconciliation(container)).toBeNull();
  await db.generationJob.update({where:{id:jobBefore.id},data:{lastError:jobBefore.lastError,updatedAt:jobBefore.updatedAt}});
  expect(await nextBoundEnvelopeReconciliation(container)).toBe(gameId);
  for(const corrupt of ["identity","image","role","cost","low","echo","attempt"]){
    const changed=JSON.parse(oldJson),p=changed.boardReview.dual;
    if(corrupt==="identity")p.identitySha256="f".repeat(64);
    if(corrupt==="image"){p.imageSha256="f".repeat(64);changed.judgedSha256=p.imageSha256;}
    if(corrupt==="role")p.continuity.fingerprint="f".repeat(64);
    if(corrupt==="cost")p.subject.costMicroUsd++;
    if(corrupt==="low")p.quality.policy.effort="low";
    if(corrupt==="echo")for(const role of ["quality","continuity","subject"]){const raw=JSON.parse(p[role].raw),a=raw.assessment.version===SOURCE_NEIGHBOR_BUNDLE_VERSION?raw.assessment.assessment:raw.assessment;(location==="nested"?a.subject:a).photoSha256="f".repeat(64);p[role].raw=JSON.stringify(raw);}
    await db.targetVariantAsset.update({where:{id:row!.id},data:{judgeJson:JSON.stringify(changed),attempts:row!.attempts+(corrupt==="attempt"?1:0)}});
    expect(await nextBoundEnvelopeReconciliation(container),corrupt).toBeNull();
    await db.targetVariantAsset.update({where:{id:row!.id},data:{judgeJson:oldJson,attempts:row!.attempts}});
  }
  await db.fileBlob.delete({where:{key:retainedKey}});expect(await nextBoundEnvelopeReconciliation(container)).toBeNull();await db.fileBlob.create({data:kept});
  const order=await db.order.findUniqueOrThrow({where:{id:"order-"+gameId}});
  await db.order.update({where:{id:order.id},data:{paymentStatus:"REFUNDED"}});expect(await nextBoundEnvelopeReconciliation(container)).toBeNull();
  await db.order.update({where:{id:order.id},data:{paymentStatus:order.paymentStatus}});
  expect(await db.generationJob.findUniqueOrThrow({where:{id:jobBefore.id}})).toEqual(jobBefore);
  expect(await resumeBoundEnvelopeReconciliation(container,gameId)).toBe(true);
  expect(await resumeBoundEnvelopeReconciliation(container,gameId)).toBe(false);
  const queued=await db.generationJob.findUniqueOrThrow({where:{id:jobBefore.id}});
  expect(queued).toMatchObject({status:"QUEUED",currentStep:"local-patch",attempts:jobBefore.attempts});
  const target=await db.targetInstance.findUniqueOrThrow({where:{id:row!.targetInstanceId}});
  const result=await reviewLocalPatchBoard(container,{gameId,sceneId:target.gameSceneId},{fence:async()=>{},readBoardArt:readArt},{decideRetained:true});
  expect(result.decidedRetained).toBe(true);expect(result.costCents).toBe(0);expect(result.replayed).toBe(true);
  const after=await db.targetVariantAsset.findUniqueOrThrow({where:{id:row!.id}}),receipt=JSON.parse(after.judgeJson!);
  expect(after).toMatchObject({attempts:row!.attempts,assetId:row!.assetId,status:decision==="pass"?"GENERATED":"FAILED"});
  expect(receipt.boardReview.dual.quality.envelopeReader).toBe(BOUND_SUBJECT_QUALITY_ENVELOPE_READER_V2);
  expect(receipt.boardReview.dual.quality.raw).toBe(prior.boardReview.dual.quality.raw);
  expect(receipt.boardReview.dual.quality.fingerprint).toBe(prior.boardReview.dual.quality.fingerprint);
  expect(receipt.reviewHistory).toHaveLength(1);expect(receipt.reviewHistory[0]).toMatchObject({boardReview:prior.boardReview,verdict:null,
    wireFault:"schema",lastError,supersededBy:BOUND_SUBJECT_QUALITY_ENVELOPE_READER_V2});
  expect(await allowedDualPublication(db,publicationBinding(gameId,after))).toBe(decision==="pass");
  expect(await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).toEqual(ledgerBefore);
  expect(await db.fileBlob.findUniqueOrThrow({where:{key:retainedKey}})).toEqual(kept);
  expect(await nextBoundEnvelopeReconciliation(container)).toBeNull();
  expect(provider.creates).toHaveLength(callsBefore);expect(render).toHaveBeenCalledTimes(rendersBefore);
  expect(forbidden).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
  expect((await budget.audit(worldId)).capMicroUsd).toBe(4000000);
},300000);


it.each([
  { field: 'candidateSha256', length: 55, reader: BOUND_SOURCE_NEIGHBOR_READER },
  { field: 'candidateSha256', length: 65, reader: BOUND_SOURCE_NEIGHBOR_READER },
  { field: 'contractSha256', length: 66, reader: BOUND_SOURCE_CONTRACT_READER },
])('re-reads a malformed $length-character source-neighbor $field echo from its original settled question without a new purchase', async ({ field, length, reader }) => {
  vi.useFakeTimers({toFake:['Date']});
  const gameId='explorer-source-echo-synthetic-'+field.toLowerCase()+'-'+length;
  await newDetectiveWorld(gameId,8,true,true);
  await ensureSingleMediumReviewPolicy(c,gameId,async()=>{});
  const context=await resolveLocalPatchBoardsForGame(db,gameId,12),board=context.boards.find(b=>b.board==='greatwall')!;
  const hide=board.hides.find(h=>h.id==='greatwall-v12-2')!;
  expect(sourcePlacementForHide(context,hide.id)?.sourceNeighbors).toBeDefined();
  const scene=await db.gameScene.findFirstOrThrow({where:{gameId,sceneSlug:board.board}});
  const provider=controlledSol(false,false,undefined,false,false,12),retrieve=provider.fake.retrieve;
  let corruptedReplies=0;
  provider.fake.retrieve=async responseId=>{
    const state=await retrieve(responseId);if(state.status!=='completed')return state;
    const outer=JSON.parse(state.reading.raw!);
    if(outer.assessment.version!==SOURCE_NEIGHBOR_BUNDLE_VERSION)return state;
    outer.assessment.sourceNeighbors[field]='c'.repeat(length);
    corruptedReplies++;
    return {...state,reading:{...state.reading,raw:JSON.stringify(outer)}};
  };
  const forbidden=vi.fn(async()=>{throw Error('No new synchronous question or diagnosis is permitted');});
  const container={...c,backgroundReview:provider.fake,visualReview:{request:forbidden}} as Container;
  const render=vi.fn<LocalPatchHideDeps['render']>(async input=>{
    expect(board.hides.some(h=>input.requestKey.startsWith(h.id+':'))).toBe(true);
    return paintedOk(input.stylePng,bill('synthetic-neighbor-echo-'+input.requestKey,50000));
  });
  const deps:LocalPatchHideDeps={readBoardArt:readArt,renderPolicySha256:localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY),render,judge:forbidden};
  expect((await runLocalPatchHide(container,deps,{gameId,board,hide})).state).toBe('generated');
  let row=await db.targetVariantAsset.findFirstOrThrow({where:{variant:'A',targetInstance:{gameSceneId:scene.id,targetId:hide.targetId}}});
  for(let turn=0;turn<4&&JSON.parse(row.judgeJson!).boardReview?.dual?.single!==SINGLE_MEDIUM_VISUAL_REVIEW_VERSION;turn++){
    await reviewLocalPatchBoard(container,{gameId,sceneId:scene.id},{fence:async()=>{},readBoardArt:readArt});
    await advanceContinuityInBackground(container,gameId,{deadlineAt:Date.now()+270000});
    row=await db.targetVariantAsset.findUniqueOrThrow({where:{id:row.id}});
    vi.setSystemTime(Date.now()+31000);
  }
  expect(corruptedReplies).toBe(1);expect(row.status).toBe('FAILED');expect(row.lastError).toMatch(/^quality-unresolved:/);
  const previous=JSON.parse(row.judgeJson!),questionKey=previous.boardReview.dual.quality.requestKey;
  const worldId=boardWizardWorldId(gameId),budget=boardWizardBudgetOf(container);
  const siblingHide=board.hides.find(h=>h.id!==hide.id)!;
  expect((await runLocalPatchHide(container,deps,{gameId,board,hide:siblingHide})).state).toBe('generated');
  const sibling=await db.targetVariantAsset.findFirstOrThrow({where:{variant:'A',targetInstance:{gameSceneId:scene.id,targetId:siblingHide.targetId}}});
  expect(JSON.parse(sibling.judgeJson!).reviewState).toBe('pending-board-review');
  if(length!==55){
    await budget.reserve(worldId,{requestKey:'synthetic-unknown-full-reserve',scope:'image',operationFingerprint:'a'.repeat(64),
      reserveMicroUsd:(await budget.audit(worldId)).remainingMicroUsd});
    await budget.markUnknown(worldId,'synthetic-unknown-full-reserve','Synthetic missing provider usage remains fully reserved');
  }else expect((await budget.audit(worldId)).remainingMicroUsd).toBeGreaterThan(370000);
  const ledger=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}}),key=retainedPurchaseKey(worldId,questionKey);
  const kept=await db.fileBlob.findUniqueOrThrow({where:{key}}),beforeCreates=provider.creates.length,beforePaints=render.mock.calls.length;
  expect(await runLocalPatchWorldSlice(container,deps,gameId,{workMode:REVIEW_EXISTING_WORK_MODE,maxHides:0,
    hardDeadlineAt:Date.now()+270000,diagnose:forbidden})).toMatchObject({claimed:true});
  expect(provider.creates,'one free adoption must yield before sibling review').toHaveLength(beforeCreates);
  expect(await db.targetVariantAsset.findUniqueOrThrow({where:{id:sibling.id}})).toEqual(sibling);
  const after=await db.targetVariantAsset.findUniqueOrThrow({where:{id:row!.id}}),receipt=JSON.parse(after.judgeJson!);
  expect(after).toMatchObject({status:'GENERATED',assetId:row!.assetId,attempts:row!.attempts,costCents:row!.costCents});
  const proof=receipt.boardReview.dual,marker=proof.quality.sourceNeighborReading;
  expect(marker).toMatchObject({version:reader,sourceRequestKey:questionKey,
    sourceFingerprint:previous.boardReview.dual.quality.fingerprint});
  for(const role of ['quality','continuity','subject']){
    expect(proof[role].sourceNeighborReading).toEqual(marker);
    expect(proof[role].raw).toBe(previous.boardReview.dual[role].raw);
    expect(proof[role].fingerprint).toBe(previous.boardReview.dual[role].fingerprint);
  }
  expect(receipt.reviewHistory.at(-1)).toMatchObject({boardReview:previous.boardReview,verdict:previous.verdict,
    supersededBy:reader,lastError:row!.lastError});
  expect(await allowedDualPublication(db,publicationBinding(gameId,after))).toBe(true);
  for(const fault of ['image','geometry','identity','variant','body','fingerprint','policy'] as const){
    const id='aud_sb_'+marker.roundId+'_intent',saved=await db.auditLog.findUniqueOrThrow({where:{id}}),changed=JSON.parse(saved.metaJson!);
    if(fault==='image')changed.intent.binding.imageSha256='e'.repeat(64);
    if(fault==='geometry')changed.intent.binding.geometrySha256='e'.repeat(64);
    if(fault==='identity')changed.intent.binding.identitySha256='e'.repeat(64);
    if(fault==='variant')changed.intent.binding.variantId='foreign-row';
    if(fault==='body')changed.intent.bodySha256='e'.repeat(64);
    if(fault==='fingerprint')changed.intent.fingerprint='e'.repeat(64);
    if(fault==='policy')changed.intent.policyVersion='not-the-paid-policy';
    await db.auditLog.update({where:{id},data:{metaJson:JSON.stringify(changed)}});
    expect(await allowedDualPublication(db,publicationBinding(gameId,after)),fault).toBe(false);
    await db.auditLog.update({where:{id},data:{metaJson:saved.metaJson}});
  }
  const outcomeId='aud_sb_'+marker.roundId+'_outcome',outcome=await db.auditLog.findUniqueOrThrow({where:{id:outcomeId}});
  const changedOutcome=JSON.parse(outcome.metaJson!);changedOutcome.state='unpriced';
  await db.auditLog.update({where:{id:outcomeId},data:{metaJson:JSON.stringify(changedOutcome)}});
  expect(await allowedDualPublication(db,publicationBinding(gameId,after))).toBe(false);
  await db.auditLog.update({where:{id:outcomeId},data:{metaJson:outcome.metaJson}});
  await db.fileBlob.update({where:{key},data:{data:Buffer.from('{}')}});
  expect(await allowedDualPublication(db,publicationBinding(gameId,after))).toBe(false);
  await db.fileBlob.update({where:{key},data:{data:kept.data}});
  // A self-consistent retained payload digest is not proof that its claimed
  // provider request belongs to the terminal response and its original bill.
  const intent=JSON.parse((await db.auditLog.findUniqueOrThrow({where:{id:'aud_sb_'+marker.roundId+'_intent'}})).metaJson!).intent;
  const authenticate=()=>authenticateBoundSourceNeighborReading(db,{gameId,worldId,binding:intent.binding,stage:proof.quality,questionBodySha256:marker.questionBodySha256});
  expect(await authenticate()).toEqual(marker);
  const alteredRecord=JSON.parse(Buffer.from(kept.data).toString()),alteredWire=JSON.parse(Buffer.from(alteredRecord.bytesBase64,'base64').toString());
  alteredWire.requestId='resp_foreign_paid_question';
  const alteredBytes=Buffer.from(JSON.stringify(alteredWire));
  alteredRecord.bytesBase64=alteredBytes.toString('base64');alteredRecord.payloadSha256=sha256Bytes(alteredBytes);
  await db.fileBlob.update({where:{key},data:{data:Buffer.from(JSON.stringify(alteredRecord))}});
  expect(await authenticate()).toBeNull();
  await db.fileBlob.update({where:{key},data:{data:kept.data}});
  const forged=JSON.parse(after.judgeJson!);forged.boardReview.dual.subject.sourceNeighborReading.rawSha256='e'.repeat(64);
  expect(await allowedDualPublication(db,{...publicationBinding(gameId,after),judgeJson:JSON.stringify(forged)})).toBe(false);
  expect(await allowedDualPublication(db,publicationBinding(gameId,after))).toBe(true);
  expect(await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).toEqual(ledger);
  expect(await db.fileBlob.findUniqueOrThrow({where:{key}})).toEqual(kept);
  expect(provider.creates).toHaveLength(beforeCreates);expect(render).toHaveBeenCalledTimes(beforePaints);
  expect(forbidden).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
},300000);

it.each(["pass", "crown-fail"] as const)("native whole-source context preserves26 and buys only one finite fourth; decision=%s", async decision => {
  vi.useFakeTimers({toFake:["Date"]});
  try {
    const gameId="explorer-native-context-synthetic-"+decision;
    await newDetectiveWorld(gameId,7,true,true);
    // This fixture starts after the ordinary mock webhook, as the live case does.
    await db.game.update({where:{id:gameId},data:{paidAt:new Date()}});
    const context=await resolveLocalPatchBoardsForGame(db,gameId,12),journey=new Set(boardsOfWorlds(["journey"]));
    const boards=context.boards.filter(b=>journey.has(b.board)),hides=boards.flatMap(b=>b.hides);
    const board=boards.find(b=>b.board==="greatwall")!,selected=board.hides.find(h=>h.id==="greatwall-v12-2")!;
    const provider=controlledSol(false,true,selected.id,true,false,12);
    const originalRetrieve=provider.fake.retrieve;
    const fake:BackgroundReviewTransport={...provider.fake,retrieve:async responseId=>{
      const answer=await originalRetrieve(responseId);
      if(decision==="crown-fail"&&answer.status==="completed"&&provider.creates.filter(q=>q.hideId===selected.id).length===3&&answer.reading.raw){
        const raw=JSON.parse(answer.reading.raw);
        if(raw.assessment?.sourceNeighbors?.hideId===selected.id||raw.assessment?.assessment?.quality?.hides?.[0]?.hideId===selected.id
          ||raw.assessment?.quality?.hides?.[0]?.hideId===selected.id||boundHide(provider.creates.at(-1)!.prompt).hideId===selected.id){
          raw.head.rawCrown="fail";raw.head.shippingCrown="fail";raw.head.observation="Synthetic straight crown cut at the return edge must fail, even beside a verbal quality pass.";
          return {...answer,reading:{...answer.reading,raw:JSON.stringify(raw)}};
        }
      }
      return answer;
    }};
    const synchronous=vi.fn(async()=>{throw Error("A second synchronous opinion is forbidden");});
    const diagnose=vi.fn(async()=>{throw Error("The finite source-context strategy has no paid planner");});
    const container={...c,backgroundReview:fake,visualReview:{request:synchronous}} as Container;
    let nativePaints=0,armInterruption=false,interrupted=false;
    const render=vi.fn<LocalPatchHideDeps["render"]>(async input=>{
      const hide=hides.find(h=>input.requestKey.startsWith(h.id+":"));if(!hide)throw Error("Unknown synthetic hide");
      const attempt=Number(input.requestKey.split(":").at(-1));
      if(hide.id==="sydney-v12-1"&&attempt===1)throw Error(`LOCAL_PATCH_PAINTER: ${input.requestKey} was dispatched and no usable image came back (cost_unknown: Request billing is unknown; reservation retained and no retry dispatched)`);
      if(hide.id===selected.id&&attempt===3){
        const source=await readArt(board.art,sourcePlacementForHide(context,hide.id)!.source.sha256),crop=cropOf(hide);
        return paintedOk(await sharp(source).extract({...crop,left:crop.left+3}).png().toBuffer(),bill(input.requestKey,50000));
      }
      let frame=maskForHide(hide);
      if(hide.id===selected.id&&attempt===4){
        nativePaints++;armInterruption=true;
        expect(input.wholeSourceContext?.plan.hideId).toBe(selected.id);
        expect(input.placementGuideVersion).toBe(WHOLE_SOURCE_CONTEXT_VERSION);
        expect(await sharp(input.stylePng).metadata()).toMatchObject({width:768,height:1024});
        const p=input.wholeSourceContext!.plan,local=guidedFrameGeometry(frame,p.returned).target;
        frame={...local,left:local.left+p.shippingInProvider.left,top:local.top+p.shippingInProvider.top};
        const alpha=await sharp(input.maskPng).ensureAlpha().raw().toBuffer();let transparent=0;
        for(let i=3;i<alpha.length;i+=4)if(alpha[i]===0)transparent++;
        expect(transparent).toBe(p.returned.width*p.returned.height);
        expect(input.prompt).toContain(JSON.stringify(p.providerReturn));expect(input.prompt).not.toContain("original 512x768 crop");
      }else {expect(attempt).toBeLessThanOrEqual(2);expect(input.wholeSourceContext).toBeUndefined();}
      const figure=await sharp({create:{width:Math.round(frame.width*.6),height:Math.round(frame.height*.8),channels:4,background:attempt===4?"#326d86":"#1e3ca0"}}).png().toBuffer();
      const png=await sharp(input.stylePng).composite([{input:figure,left:frame.left+Math.round(frame.width*.2),top:frame.top+Math.round(frame.height*.2)}]).png().toBuffer();
      return paintedOk(png,bill(input.requestKey,50000));
    });
    const deps:LocalPatchHideDeps={readBoardArt:readArt,renderPolicySha256:localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY),render,
      judge:async()=>{throw Error("Per-hide duplicate judge forbidden");}};
    let result={pending:true,attention:null as string|null},turns=0;
    while(result.pending&&turns++<900){
      result=await runLocalPatchWorldSlice(container,deps,gameId,{hardDeadlineAt:Date.now()+270000,diagnose});
      if(result.pending)await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS+1);
    }
    expect(result.pending).toBe(false);expect(nativePaints).toBe(0);
    // The live case already has no pending request. Drain only this fixture's
    // already-created background answer through its normal retained poller.
    const createsBeforeDrain=provider.creates.length;
    for(let poll=0;poll<5&&(await boardWizardBudgetOf(container).audit(gameId+":board-wizard")).pendingRequestKeys.length;poll++){
      await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS+1);
      await advanceContinuityInBackground(container,gameId,{deadlineAt:Date.now()+270000});
    }
    expect(provider.creates).toHaveLength(createsBeforeDrain);
    const getRows=()=>db.targetVariantAsset.findMany({where:{variant:"A",targetInstance:{gameScene:{gameId}}},include:{targetInstance:true},orderBy:{id:"asc"}});
    const before=await getRows(),failed=await db.targetVariantAsset.findFirstOrThrow({where:{variant:"A",attempts:3,targetInstance:{gameScene:{gameId,sceneSlug:"greatwall"},targetId:selected.targetId}}});
    expect(before.filter(r=>r.status==="GENERATED")).toHaveLength(26);expect(failed.status).toBe("FAILED");
    expect(JSON.parse(failed.judgeJson!).seam.verdict).toBe("misaligned");
    const protectedBefore=before.filter(r=>r.id!==failed.id).map(r=>({id:r.id,hash:wholeSourceContextRowHash(r)}));
    const ownerId=(await db.game.findUniqueOrThrow({where:{id:gameId}})).ownerId!;
    const ledgerBefore=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId:gameId+":board-wizard"}});
    const snapshotBefore=JSON.parse(ledgerBefore.snapshotJson),requestsBefore=snapshotBefore.requests.map((r:{requestKey:string})=>({key:r.requestKey,hash:boardConditioningHash(r)}));
    const imagesBefore=render.mock.calls.length,reviewsBefore=provider.creates.length;
    const admission=await boardWizardBudgetOf(container).audit(gameId+":board-wizard");
    console.info("synthetic-context-admission",admission);
    expect(admission).toMatchObject({capMicroUsd:4000000,held:false,pendingRequestKeys:[],conflictRequestKeys:[],overrunRequestKeys:[]});
    expect(admission.remainingMicroUsd).toBeGreaterThanOrEqual(550000);
    expect(admission.unknownRequestKeys).toEqual(["sydney-v12-1:standing:render:1"]);
    expect(admission.reservedMicroUsd).toBe(120000);
    const plan=await planWholeSourceContextRepair(container,gameId,ownerId);
    await expect(planWholeSourceContextRepair(container,gameId,"foreign-owner")).rejects.toThrow();
    await expect(stageWholeSourceContextRepair(container,{gameId,operatorId:ownerId,expectedPlanSha256:"f".repeat(64)})).rejects.toThrow("Preview changed");
    expect(await db.auditLog.findUnique({where:{id:wholeSourceContextPinId(gameId)}})).toBeNull();
    const stages=await Promise.allSettled([1,2].map(()=>stageWholeSourceContextRepair(container,{gameId,operatorId:ownerId,expectedPlanSha256:plan.planSha256})));
    expect(stages.filter(s=>s.status==="fulfilled")).toHaveLength(1);
    expect(await stageWholeSourceContextRepair(container,{gameId,operatorId:ownerId,expectedPlanSha256:plan.planSha256})).toMatchObject({alreadyStaged:true,providerCalls:0});
    expect(render).toHaveBeenCalledTimes(imagesBefore);expect(provider.creates).toHaveLength(reviewsBefore);
    expect((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId:gameId+":board-wizard"}})).snapshotJson).toBe(ledgerBefore.snapshotJson);
    const staged=await readWholeSourceContextPin(db,gameId);expect(staged?.capMicroUsd).toBe(4000000);expect(staged?.approvalGranted).toBe(false);
    // Recheck target-instance fields as well as variant pixels after an
    // asynchronous boundary. Neither a selected nudge nor a protected sibling
    // change may slip through while the original variant row stays identical.
    if(decision==="pass"){
      for(const instance of [failed.targetInstanceId,before.find(r=>r.id!==failed.id)!.targetInstanceId]){
        const original=await db.targetInstance.findUniqueOrThrow({where:{id:instance}});
        await db.targetInstance.update({where:{id:instance},data:{adjustJson:JSON.stringify({dx:1,dy:0,scale:1})}});
        await expect(fenceWholeSourceContextPurchase(db,gameId,failed.id,wholeSourceContextMarkerFor(staged!))).rejects.toThrow("changed");
        await db.targetInstance.update({where:{id:instance},data:{adjustJson:original.adjustJson}});
      }
      await fenceWholeSourceContextPurchase(db,gameId,failed.id,wholeSourceContextMarkerFor(staged!));
      expect(render).toHaveBeenCalledTimes(imagesBefore);expect(provider.creates).toHaveLength(reviewsBefore);
    }
    expect(await nextWholeSourceContextWake(container)).toBe(gameId);
    expect((await db.targetVariantAsset.findUniqueOrThrow({where:{id:failed.id}})).attempts).toBe(3);
    // Staging cannot use an owner call to start the parked job.
    expect((await runLocalPatchWorldSlice(container,deps,gameId,{hardDeadlineAt:Date.now()+270000})).claimed).toBe(false);
    expect(nativePaints).toBe(0);
    expect(await resumeWholeSourceContextRepair(container,gameId)).toBe(true);
    expect(await resumeWholeSourceContextRepair(container,gameId)).toBe(false);
    expect(await db.auditLog.findUnique({where:{id:wholeSourceContextWakeId(gameId)}})).toMatchObject({actorType:"SYSTEM",actorId:null});
    if(decision==="pass"){
      // Simulate a lost claim AFTER RAW and bill retention, before row publication.
      await expect(runLocalPatchHide(container,{...deps,fence:async()=>{
        if(armInterruption&&!interrupted){const bill=await boardWizardBudgetOf(container).readRequest(gameId+":board-wizard",staged!.selected.requestKey);
          if(bill?.state==="settled"){interrupted=true;throw Error("Synthetic lost claim after retained native RAW");}}
      }},{gameId,board,hide:selected,finalRepair:true,wholeSourceContext:true,deadlineAt:Date.now()+270000})).rejects.toThrow("lost claim");
      expect(interrupted).toBe(true);expect(nativePaints).toBe(1);
      expect(await db.targetVariantAsset.findUniqueOrThrow({where:{id:failed.id}})).toMatchObject({status:"PENDING",attempts:4});
      expect((await boardWizardBudgetOf(container).readRequest(gameId+":board-wizard",staged!.selected.requestKey))?.reserveMicroUsd).toBe(150000);
    }
    result={pending:true,attention:null};turns=0;
    while(result.pending&&turns++<900){result=await runLocalPatchWorldSlice(container,deps,gameId,{hardDeadlineAt:Date.now()+270000,diagnose});
      if(result.pending)await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS+1);}
    expect(result.pending).toBe(false);expect(nativePaints).toBe(1);expect(render).toHaveBeenCalledTimes(imagesBefore+1);
    expect(provider.creates).toHaveLength(reviewsBefore+1);expect(provider.creates.filter(q=>q.hideId===selected.id)).toHaveLength(3);
    const after=await getRows(),current=after.find(r=>r.id===failed.id)!;
    for(const frozen of protectedBefore)expect(wholeSourceContextRowHash(after.find(r=>r.id===frozen.id)!)).toBe(frozen.hash);
    expect(current.attempts).toBe(4);expect(wholeSourceContextMarker(current)).toMatchObject({originalAttempts:3,authorizedAttempt:4});
    const snapshotAfter=JSON.parse((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId:gameId+":board-wizard"}})).snapshotJson);
    for(const original of requestsBefore)expect(boardConditioningHash(snapshotAfter.requests.find((r:{requestKey:string})=>r.requestKey===original.key))).toBe(original.hash);
    expect(await boardWizardBudgetOf(container).readRequest(gameId+":board-wizard",selected.id+":"+selected.pose+":render:5")).toBeNull();
    const audit=await boardWizardBudgetOf(container).audit(gameId+":board-wizard");expect(audit.capMicroUsd).toBe(4000000);expect(audit.committedMicroUsd).toBeLessThan(4000000);expect(audit.pendingRequestKeys).toEqual([]);
    expect(audit.unknownRequestKeys).toEqual(admission.unknownRequestKeys);expect(audit.reservedMicroUsd).toBe(120000);
    expect(boardConditioningHash(snapshotAfter.unknownContinuationApprovals)).toBe(boardConditioningHash(snapshotBefore.unknownContinuationApprovals));
    const game=await db.game.findUniqueOrThrow({where:{id:gameId}});
    if(decision==="pass"){
      expect(["READY","DELIVERED"]).toContain(game.status);expect(current.status).toBe("GENERATED");
      expect(parseGameConfig(game.configJson!).scenes.flatMap(s=>s.targets)).toHaveLength(27);
      const paid=await readSettledTargetRaw(db,gameId,staged!.selected.requestKey);
      expect(await sharp(paid.original).metadata()).toMatchObject({width:768,height:1024});
      expect((await sharp(paid.normalized).raw().toBuffer()).equals(await sharp(paid.original).extract(staged!.selected.plan.shippingInProvider).raw().toBuffer())).toBe(true);
      expect(await allowedDualPublication(db,publicationBinding(gameId,current))).toBe(true);
      const changed=JSON.parse(current.judgeJson!);changed.wholeSourceContext.planSha256="f".repeat(64);
      expect(await allowedDualPublication(db,{...publicationBinding(gameId,current),judgeJson:JSON.stringify(changed)})).toBe(false);
      expect((await db.childProfile.findUniqueOrThrow({where:{id:"chl-"+gameId}})).originalPhotoAssetId).toBeNull();
    }else{
      expect(game.status).toBe("TARGETS_GENERATING");expect(game.configJson).toBeNull();expect(current.status).toBe("FAILED");
      expect((await db.childProfile.findUniqueOrThrow({where:{id:"chl-"+gameId}})).originalPhotoAssetId).not.toBeNull();
      for(let i=0;i<3;i++)expect((await runLocalPatchWorldSlice(container,deps,gameId,{hardDeadlineAt:Date.now()+270000})).claimed).toBe(false);
      expect(render).toHaveBeenCalledTimes(imagesBefore+1);expect(provider.creates).toHaveLength(reviewsBefore+1);
    }
    expect(diagnose).not.toHaveBeenCalled();expect(synchronous).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
  }finally{vi.useRealTimers();}
},1500000);

/** Game 3's transport shapes on the real Detective engine: a question cancelled at its Flex deadline (settled at the
 * provider's explicit zero, or billed), and a provider failure that is permanent. `plan` names each hide's FIRST question. */
function transitSol(plan: Record<string, "cancel" | "cancel-billed" | "invalid">, guidedHideId?: string) {
  const base = controlledSol(false, !!guidedHideId, guidedHideId, true, true);
  const special = new Map<string, { mode: "cancel" | "cancel-billed" | "invalid"; cancelled: boolean }>(), first = new Set<string>();
  const fake: BackgroundReviewTransport = { namespace: base.fake.namespace,
    create: async body => { const created = await base.fake.create(body), hideId = base.creates.at(-1)!.hideId;
      if (plan[hideId] && !first.has(hideId)) { first.add(hideId); special.set(created.responseId, { mode: plan[hideId]!, cancelled: false }); }
      return created; },
    retrieve: async responseId => {
      const s = special.get(responseId); if (!s) return base.fake.retrieve(responseId);
      if (s.mode === "invalid") return { status: "failed", reading: { responseId, raw: null, usage: { input_tokens: 0, output_tokens: 0 }, model: "gpt-6.1-sol",
        finishReason: null, serviceTier: "flex", providerError: { code: "invalid_prompt", message: "Synthetic permanent invalid request" } } };
      if (!s.cancelled) return { status: "in_progress" };
      return { status: "cancelled", reading: { responseId, raw: null, usage: s.mode === "cancel-billed" ? { input_tokens: 19113, output_tokens: 3200 } : { input_tokens: 0, output_tokens: 0 },
        model: "gpt-6.1-sol", finishReason: null, serviceTier: "flex" } };
    },
    cancel: async responseId => { const s = special.get(responseId); if (s) s.cancelled = true; } };
  return { fake, creates: base.creates, special };
}
async function runTransitWorld(gameId: string, provider: ReturnType<typeof transitSol>, guidedHideId?: string) {
  const context = await resolveLocalPatchBoardsForGame(db, gameId, 13), hides = context.boards.flatMap(board => board.hides);
  const container = { ...c, backgroundReview: provider.fake, visualReview: { request: async () => { throw Error("No synchronous review"); } } } as Container;
  const renders: string[] = [];
  const deps: LocalPatchHideDeps = { readBoardArt: readArt, renderPolicySha256: localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY),
    judge: async () => { throw Error("Historical per-hide judge forbidden"); },
    render: async ({ requestKey, stylePng, placementGuidePng }) => {
      const hide = hides.find(h => requestKey.startsWith(h.id + ":")); if (!hide) throw Error("Unregistered Detective painter request");
      if (hide.id !== guidedHideId) expect(requestKey.endsWith(":render:1")).toBe(true);
      renders.push(requestKey);
      const mask = placementGuidePng ? guidedFrameGeometry(maskForHide(hide), localPatchReturnRegion(cropOf(hide), maskForHide(hide), hide.returnRect).local).target : maskForHide(hide);
      const rect = { left: mask.left + Math.round(mask.width * 0.2), top: mask.top + Math.round(mask.height * 0.2), width: Math.round(mask.width * 0.6), height: Math.round(mask.height * 0.8) };
      const figure = await sharp({ create: { width: rect.width, height: rect.height, channels: 4, background: "#1e3ca0" } }).png().toBuffer();
      return paintedOk(await sharp(stylePng).composite([{ input: figure, left: rect.left, top: rect.top }]).png().toBuffer(), bill("paint-" + gameId + "-" + requestKey, 66500));
    } };
  const diagnose = vi.fn(async () => { throw Error("No diagnosis in a transport fixture"); });
  let result = { pending: true, attention: null as string | null }, ticks = 0;
  for (; ticks < 400 && result.pending; ticks++) {
    result = await runLocalPatchWorldSlice(container, deps, gameId, { hardDeadlineAt: Date.now() + 270_000, diagnose });
    const job = await db.generationJob.findUniqueOrThrow({ where: { id: "job_" + gameId } });
    if (job.currentStep === "local-patch:recovery-budget-wait") await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS + 1);
    // Model the provider queue: a question still running when its Flex deadline passes.
    if ([...provider.special.values()].some(s => s.mode !== "invalid" && !s.cancelled)) await vi.advanceTimersByTimeAsync(11 * 60_000);
  }
  return { result, ticks, renders, diagnose };
}

it("single-transport-continuation/v1: a question cancelled at its Flex deadline is asked once more on its pixels, and the world completes", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    const gameId = "detective-transit-cancelled"; await newDetectiveWorld(gameId, 7, true);
    const provider = transitSol({ "amazon-detectives-hide-1": "cancel", "newyork-detectives-hide-2": "cancel-billed" });
    const { result, ticks, renders, diagnose } = await runTransitWorld(gameId, provider);
    expect(result).toMatchObject({ pending: false, attention: null }); expect(ticks).toBeLessThan(400);
    expect((await db.game.findUniqueOrThrow({ where: { id: gameId } })).status).toMatch(/READY|DELIVERED/);
    // 27 first questions and exactly two continuations: the same pixels, a new key, the default tier.
    expect(provider.creates).toHaveLength(29); expect(renders).toHaveLength(27);
    const continued = provider.creates.filter(create => create.tier === "default");
    expect(continued.map(create => create.hideId).sort()).toEqual(["amazon-detectives-hide-1", "newyork-detectives-hide-2"]);
    for (const create of continued) expect(create.prompt).toContain("UNANSWERED TRANSPORT CONTINUATION 2");
    const audits = await db.auditLog.findMany({ where: { entityId: gameId, action: "generation:single-transport-continuation/v1" } });
    expect(audits).toHaveLength(2);
    for (const audit of audits) expect(JSON.parse(audit.metaJson!)).toMatchObject({ providerStatus: "cancelled", providerCalls: 0, chargesChanged: false,
      entry: { kind: "transport", code: "cancelled-at-deadline", attempt: 1 } });
    // The cancelled rounds stay as the provider billed them: an explicit zero, and the billed one in full.
    const ledger = (await boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId)));
    expect(ledger.unknownRequestKeys ?? []).toEqual([]);
    const rows = await db.targetVariantAsset.findMany({ where: { variant: "A", targetInstance: { gameScene: { gameId } } } });
    expect(rows.every(row => row.status === "GENERATED" && row.attempts === 1)).toBe(true);
    for (const row of rows.filter(r => ["amazon-detectives-hide-1", "newyork-detectives-hide-2"].includes(JSON.parse(r.judgeJson!).hide)))
      expect(JSON.parse(row.judgeJson!).evidenceAttempts).toEqual([expect.objectContaining({ attempt: 1, code: "cancelled-at-deadline", single: SINGLE_MEDIUM_VISUAL_REVIEW_VERSION })]);
    expect(diagnose).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
}, 1_500_000);

it("local-patch-no-route-rest/v1: permanent failures rest four first pictures, giza 2 still gets its third painting, and the world parks with names", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    const gameId = "detective-transit-permanent"; await newDetectiveWorld(gameId, 7, true);
    const invalid = ["amazon-detectives-hide-1", "amazon-detectives-hide-3", "newyork-detectives-hide-2", "newyork-detectives-hide-3"];
    const provider = transitSol(Object.fromEntries(invalid.map(hideId => [hideId, "invalid" as const])), "giza-detectives-hide-2");
    const { result, ticks, renders } = await runTransitWorld(gameId, provider, "giza-detectives-hide-2");
    // Never an idle loop: the world stops on its own, with every remaining name.
    expect(result.pending).toBe(false); expect(ticks).toBeLessThan(400);
    // The historical single-reason words (local-patch-progress.ts keeps them verbatim); the rows below carry the names.
    expect(result.attention).toBe("local-patch: 4 appearances have no automatic evidence question left (unclassified); no image is redrawn for an unreadable answer."
      + " A service decision is required; no parent approval is requested.");
    // The painting the old plan could never reach: its third picture was bought and decided.
    expect(renders.filter(key => key.startsWith("giza-detectives-hide-2:"))).toEqual(["giza-detectives-hide-2:standing:render:1",
      "giza-detectives-hide-2:standing:render:2", "giza-detectives-hide-2:standing:render:3"]);
    const rows = await db.targetVariantAsset.findMany({ where: { variant: "A", targetInstance: { gameScene: { gameId } } } });
    const byHide = new Map(rows.map(row => [JSON.parse(row.judgeJson!).hide as string, row]));
    expect(byHide.get("giza-detectives-hide-2")).toMatchObject({ status: "GENERATED", attempts: 3 });
    for (const hideId of invalid) expect(byHide.get(hideId)).toMatchObject({ status: "FAILED", attempts: 1 });
    // A permanent failure is never asked again, never logged as transit, never continued.
    expect(provider.creates.filter(create => create.tier === "default")).toHaveLength(0);
    expect(await db.auditLog.count({ where: { entityId: gameId, action: "generation:single-transport-continuation/v1" } })).toBe(0);
    const restAudit=await db.auditLog.findFirstOrThrow({where:{entityId:gameId,action:"local-patch:rest-diagnostics/v1"}});
    const rests=JSON.parse(restAudit.metaJson!).hides;
    expect(rests.map((r:{hideId:string})=>r.hideId).sort()).toEqual([...invalid].sort());
    expect(rests.every((r:{rest:string})=>r.rest==="evidence")).toBe(true);
  } finally { vi.useRealTimers(); }
}, 1_500_000);

it.each([{index:0,refuseAge:false,providerWidth:512,replaySizeFailure:false,label:'New York full native head'},
 {index:1,refuseAge:false,providerWidth:768,replaySizeFailure:false,label:'Paris provider frame, active body route and protected feet'},
 {index:0,refuseAge:true,providerWidth:768,replaySizeFailure:false,label:'unchanged strict age refusal'},
 {index:0,refuseAge:false,providerWidth:768,replaySizeFailure:true,label:'settled provider frame resumes free from old size refusal'}])('journey native head v2: $label binds one second purchase, full MEDIUM coverage and all26 unchanged siblings',async({index,refuseAge,providerWidth,replaySizeFailure})=>{
 vi.useFakeTimers({toFake:['Date']});
 try{
  const jh=await import('../../../domain/generation/journey-source-head'),service=await import('../journey-source-head-recovery');
  const {JOURNEY_SOURCE_HEAD_AUTHORITIES}=await import('../../../../content/detectives/journey-source-head-v2');
  const a=JOURNEY_SOURCE_HEAD_AUTHORITIES[index]!,gameId='journey-native-head-synthetic-'+index+'-'+Number(refuseAge)+'-'+Number(replaySizeFailure);
  await newDetectiveWorld(gameId,7,true,false,false,true);
  const payment=await db.order.findUniqueOrThrow({where:{id:'order-'+gameId}});
  await db.game.update({where:{id:gameId},data:{paidAt:payment.paidAt}});
  await ensureSingleMediumReviewPolicy(c,gameId,async()=>{});
  const placement=await resolveLocalPatchBoardsForGame(db,gameId,13),board=placement.boards.find(b=>b.board===a.boardId)!,hide=board.hides.find(h=>h.id===a.hideId)!;
  expect(jh.journeyHeadAuthorityFor(expectedAuthoredLocalPatchReturn(board,hide,13,placement)!)).toEqual(a);
  let headBought=false,headQuestions=0;
  const provider=controlledSol(false,false),retrieve=provider.fake.retrieve.bind(provider.fake),create=provider.fake.create.bind(provider.fake);
  provider.fake.create=async body=>{
   const prompt=(body.input as {content:{text?:string}[]}[])[0]!.content[0]!.text!;
   if(prompt.includes('NATIVE SOURCE HEAD '+jh.JOURNEY_SOURCE_HEAD_VERSION)){headQuestions++;expect(body.max_output_tokens).toBe(6000);expect(body.reasoning).toMatchObject({effort:'medium'});
    expect(prompt).toContain('ENTIRE new hair silhouette');expect(prompt).toContain('public edit footprint');expect((body.input as {content:{type:string;text?:string}[]}[])[0]!.content.some(block=>block.type==='input_text'&&block.text?.includes(':native-shipping-crown'))).toBe(true);}
   return create(body);
  };
  provider.fake.retrieve=async id=>{const result=await retrieve(id);if(result.status!=='completed'||!headBought)return result;
   const value=JSON.parse(result.reading.raw!),assessment=value.assessment.version===SOURCE_NEIGHBOR_BUNDLE_VERSION?value.assessment.assessment:value.assessment;
   assessment.subject.checks.perceivedAge.estimatedMinYears=refuseAge?7:6;assessment.subject.checks.perceivedAge.estimatedMaxYears=refuseAge?9:8;
   const head=index?{left:170,top:220,width:95,height:100}:{left:210,top:290,width:60,height:80};
   value.head={...value.head,rawHead:head,shippingHead:head,rawCrown:'pass',shippingCrown:'pass'};
   return {...result,reading:{...result.reading,raw:JSON.stringify(value)}};
  };
  const forbidden=vi.fn(async()=>{throw Error('No extra synchronous or paid diagnostic request');});
  const container={...c,backgroundReview:provider.fake,visualReview:{request:forbidden}} as Container;
  const render=vi.fn<LocalPatchHideDeps['render']>(async input=>{
   expect(input.subjectQuality).toBe('medium');const pixels=await sharp(input.stylePng).ensureAlpha().raw().toBuffer();
   if(input.requestKey===a.hideId+':'+a.pose+':render:2'){
    expect(headBought).toBe(false);headBought=true;expect(input.prompt).toContain('NATIVE SOURCE HEAD '+jh.JOURNEY_SOURCE_HEAD_VERSION);
    expect(input.prompt).not.toContain('SUBJECT DIRECTION local-patch-subject-paint/');expect(input.placementGuidePng).toBeUndefined();
    const alpha=jh.journeyHeadAlpha(a),mask=await sharp(input.maskPng).ensureAlpha().raw().toBuffer();
    let maskMismatches=0;for(let i=0;i<alpha.length;i++){if(mask[i*4+3]!==255-alpha[i]!)maskMismatches++;if(alpha[i]){pixels[i*4]=32;pixels[i*4+1]=108;pixels[i*4+2]=139;}}expect(maskMismatches).toBe(0);
   }else{expect(input.requestKey).toBe(a.hideId+':'+a.pose+':render:1');const r=maskForHide(hide);
    for(let y=r.top+30;y<r.top+80;y++)for(let x=r.left+30;x<r.left+80;x++){const i=(y*512+x)*4;pixels[i]=84;pixels[i+1]=54;pixels[i+2]=121;}}
   const png=sharp(pixels,{raw:{width:512,height:768,channels:4}});
   if(headBought&&providerWidth===768)png.resize(768,1152);
   return paintedOk(await png.png().toBuffer(),bill('synthetic-journey-head-'+input.requestKey,50000));
  });
  let interruptedCheckpoint=false;
  const deps:LocalPatchHideDeps={readBoardArt:readArt,renderPolicySha256:localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY),render,judge:forbidden,
   fence:async()=>{if(index===1&&headBought&&!interruptedCheckpoint){interruptedCheckpoint=true;throw Error('Synthetic lost new-head row checkpoint');}}};
  const initial=await runLocalPatchHide(container,deps,{gameId,board,hide});expect(initial.state,initial.reason??'').toBe('generated');
  const scene=await db.gameScene.findUniqueOrThrow({where:{gameId_sceneSlug:{gameId,sceneSlug:board.board}}});
  const row=()=>db.targetVariantAsset.findFirstOrThrow({where:{variant:'A',targetInstance:{gameSceneId:scene.id,targetId:hide.targetId}}});
  for(let turn=0;turn<8;turn++){await reviewLocalPatchBoard(container,{gameId,sceneId:scene.id,deadlineAt:Date.now()+270000},{fence:async()=>{},readBoardArt:readArt},{onlyHideId:hide.id});
   await advanceContinuityInBackground(container,gameId,{deadlineAt:Date.now()+270000});await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS+1);if(JSON.parse((await row()).judgeJson!).reviewState==='board-review-complete')break;}
  const before=await row();expect(before).toMatchObject({status:'FAILED',attempts:1});expect(JSON.parse(before.judgeJson!).reviewState).toBe('board-review-complete');
  for(const b of placement.boards)for(const h of b.hides){if(h.id===hide.id)continue;
   const s=await db.gameScene.findFirstOrThrow({where:{gameId,sceneSlug:b.board}}),target=sceneBySlug(b.board,13).targets.find(t=>t.id===h.targetId)!;
   const ti=await db.targetInstance.create({data:{id:'jnh-tgt-'+gameId+'-'+h.id,gameSceneId:s.id,targetId:target.id,targetType:target.targetType,spriteKind:'image',slotAId:target.slots[0].id,slotBId:target.slots[1].id}});
   await db.targetVariantAsset.create({data:{id:'jnh-tva-'+gameId+'-'+h.id,targetInstanceId:ti.id,variant:'A',slotId:target.slots[0].id,status:'PENDING',provider:'local-patch',attempts:0}});}
  const siblings=()=>db.targetVariantAsset.findMany({where:{id:{not:before.id},targetInstance:{gameScene:{gameId}}},orderBy:{id:'asc'}}),protectedRows=await siblings();expect(protectedRows).toHaveLength(26);
  const worldId=boardWizardWorldId(gameId),budget=boardWizardBudgetOf(container);
  if(index===0&&!refuseAge){
   const key='synthetic-jnh-prior-unknown';await budget.reserve(worldId,{requestKey:key,scope:'judge',operationFingerprint:'c'.repeat(64),reserveMicroUsd:202060});
   await budget.markUnknown(worldId,key,'Synthetic old unanswered provider request');
   expect(await service.resumeJourneySourceHead(container,gameId,hide.id)).toBe(false);const unknown=await budget.readRequest(worldId,key);
   const owner=(await db.game.findUniqueOrThrow({where:{id:gameId}})).ownerId!;
   await boardWizardBudgetOf(container,1,{authorizeUnknownContinuation:async approval=>approval.worldId===worldId&&approval.operatorId===owner})
    .authorizeUnknownContinuation(worldId,{approvalId:'synthetic-existing-jnh-human-authority',requestKey:key,scope:unknown!.scope,operationFingerprint:unknown!.operationFingerprint,
     reserveMicroUsd:unknown!.reserveMicroUsd,unknownReasons:unknown!.unknownReasons,operatorId:owner,authorizationSha256:'d'.repeat(64),authorizedAt:new Date().toISOString()});
   const fill=3615442-(await budget.audit(worldId)).committedMicroUsd;await budget.reserve(worldId,{requestKey:'synthetic-jnh-prior-costs',scope:'image',operationFingerprint:'e'.repeat(64),reserveMicroUsd:fill});
   await budget.settle(worldId,'synthetic-jnh-prior-costs',bill('synthetic-prior-costs-'+gameId,fill));
   expect((await budget.audit(worldId)).remainingMicroUsd).toBe(384558);expect(await budget.readRequest(worldId,key)).toMatchObject({state:'unknown',reserveMicroUsd:202060});
  }
  const oldLedger=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}});
  await db.order.update({where:{id:payment.id},data:{paymentStatus:'REFUNDED'}});expect(await service.resumeJourneySourceHead(container,gameId,hide.id)).toBe(false);await db.order.update({where:{id:payment.id},data:{paymentStatus:'PAID'}});
  const reasons:string[]=[];expect(await service.resumeJourneySourceHead(container,gameId,hide.id,r=>reasons.push(r)),reasons.join(',')).toBe(true);
  expect(await row()).toEqual(before);expect((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson).toBe(oldLedger.snapshotJson);expect(render).toHaveBeenCalledTimes(1);
  expect(await service.resumeJourneySourceHead(container,gameId,hide.id)).toBe(false);
  if(index===1){await expect(runLocalPatchHide(container,deps,{gameId,board,hide,finalRepair:true,journeyHeadRecovery:true})).rejects.toThrow('Synthetic lost new-head row checkpoint');
   expect(await row()).toMatchObject({status:'PENDING',attempts:2});expect(render).toHaveBeenCalledTimes(2);}
  const result=await runLocalPatchHide(container,deps,{gameId,board,hide,finalRepair:true,journeyHeadRecovery:true});expect(result.state,result.reason??'').toBe('generated');
  expect(render).toHaveBeenCalledTimes(2);
  if(replaySizeFailure){
   // Reproduce the previous release's concluded failure AFTER this exact RAW
   // was retained and settled. No new transport, altered bill or reset cost.
   const stopped=await row(),current=JSON.parse(stopped.judgeJson!);
   const originalFailure={journeyHeadRecovery:current.journeyHeadRecovery,authoredReturn:current.authoredReturn,
    compositionVersion:'bounded-return/v4-authored-source-boundaries',renderFault:'JOURNEY_HEAD: paid RAW is not native512x768',
    hide:hide.id,pose:hide.pose,...(current.selfRepair?{selfRepair:current.selfRepair}:{}),...(current.guidedFrameRecovery?{guidedFrameRecovery:current.guidedFrameRecovery}:{})};
   await db.targetVariantAsset.update({where:{id:stopped.id},data:{status:'FAILED',assetId:before.assetId,rectJson:before.rectJson,
    hitRectJson:before.hitRectJson,headAnchorJson:before.headAnchorJson,judgeJson:JSON.stringify(originalFailure),lastError:'Synthetic previous provider-size guard'}});
   const failed=await row(),paidLedger=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}});
   const why:string[]=[];
   expect(await service.restoreJourneyHeadProviderFrame(container,gameId,hide.id,readArt,r=>why.push(r)),why.join(',')).toBe(true);
   expect(await service.restoreJourneyHeadProviderFrame(container,gameId,hide.id,readArt)).toBe(false);
   const replayed=await row();expect(replayed.costCents).toBe(failed.costCents);expect(replayed.attempts).toBe(2);
   expect(replayed.assetId).toMatch(/^ast_jnh_frame_/);expect(render).toHaveBeenCalledTimes(2);
   expect((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson).toBe(paidLedger.snapshotJson);
   expect(await siblings()).toEqual(protectedRows);
   const kept=JSON.parse((await db.auditLog.findFirstOrThrow({where:{entityId:gameId,action:jh.JOURNEY_HEAD_FRAME_REPLAY_ACTION}})).metaJson!);
   expect(kept.previousRow.judgeJson).toBe(failed.judgeJson);expect(kept.frame).toMatchObject({width:768,height:1152,resized:true});
   expect(kept).toMatchObject({providerCalls:0,approvalTransferred:false});
   const replayReceipt=JSON.parse(replayed.judgeJson!),stripped={...replayReceipt};delete stripped.journeyHeadFrame;
   await db.targetVariantAsset.update({where:{id:replayed.id},data:{judgeJson:JSON.stringify(stripped)}});
   try{expect(await service.journeyHeadCompositionMatches(db,{gameId,hideId:hide.id,receipt:stripped},readArt),
    'a normalized replay cannot lose its provider-frame receipt').toBe(false);}
   finally{await db.targetVariantAsset.update({where:{id:replayed.id},data:{judgeJson:replayed.judgeJson}});}
  }
  const generated=await row(),j=JSON.parse(generated.judgeJson!);expect(generated).toMatchObject({attempts:2,status:'GENERATED'});expect(generated.assetId).toMatch(/^ast_jnh_/);
  const hit=JSON.parse(generated.hitRectJson!);const sourceFeet={x:(a.crop.left+a.child.left+a.child.width/2)/a.source.width,y:(a.crop.top+a.child.top+a.child.height-2)/a.source.height};
  expect(rectContains({x0:hit.x,y0:hit.y,x1:hit.x+hit.w,y1:hit.y+hit.h},sourceFeet.x,sourceFeet.y),'unchanged SOURCE feet remain tappable').toBe(true);
  expect(j.reviewState).toBe('pending-board-review');expect(j.boardReview).toBeUndefined();expect(j.journeyHeadComposition).toMatchObject({outsideMaskChangedPixels:0,paidHeadChangedPixels:0,shift:{dx:0,dy:0}});
  expect(await service.journeyHeadCompositionMatches(db,{gameId,hideId:hide.id,receipt:j},readArt)).toBe(true);
  const headPin=(await service.journeyHeadPinsOf(db,gameId))[0]!;
  expect(await allowedDualPublication(db,{gameId,sceneVersion:13,hideId:hide.id,variantId:generated.id,attempts:2,
   identityAssetId:headPin.identityAssetId,identitySha256:headPin.identitySha256,assetId:generated.assetId!,imageSha256:j.judgedSha256,
   geometrySha256:j.geometrySha256,judgeJson:generated.judgeJson})).toBe(false);
  expect(await budget.readRequest(worldId,headPin.requestKey)).toMatchObject({state:'settled',reserveMicroUsd:120000});
  const prepared=await (await import('../local-patch-board-review')).prepareLocalPatchBoardReview(container,{gameId,sceneId:scene.id},{readBoardArt:readArt},{playerReview:true,onlyHideId:hide.id});
  if(!prepared.ready)throw Error('Native question preparation did not produce its own candidate');
  const exact=await dualReviewModule.prospectiveSingleVisualReviewQuestion(container,prepared);expect(exact.outputTokens).toBe(6000);expect(exact.reserveMicroUsd).toBeLessThanOrEqual(jh.JOURNEY_HEAD_REVIEW_COVERAGE_MICRO_USD);
  let defaultBound=0;
  try{
   await db.targetVariantAsset.update({where:{id:generated.id},data:{judgeJson:JSON.stringify({...j,evidenceAttempts:[{single:SINGLE_MEDIUM_VISUAL_REVIEW_VERSION,imageSha256:j.judgedSha256}]})}});
   const retryPrepared=await (await import('../local-patch-board-review')).prepareLocalPatchBoardReview(container,{gameId,sceneId:scene.id},{readBoardArt:readArt},{playerReview:true,onlyHideId:hide.id});
   if(!retryPrepared.ready)throw Error('Native DEFAULT planning has no prepared candidate');
   const retryQuestion=await dualReviewModule.prospectiveSingleVisualReviewQuestion(container,retryPrepared);defaultBound=retryQuestion.reserveMicroUsd;
   expect(retryQuestion.outputTokens).toBe(6000);expect(defaultBound).toBeLessThanOrEqual(jh.JOURNEY_HEAD_REVIEW_COVERAGE_MICRO_USD);
  }finally{await db.targetVariantAsset.update({where:{id:generated.id},data:{judgeJson:generated.judgeJson}});}
  console.info('synthetic-native-full-review-bounds',{hideId:hide.id,flex:exact.reserveMicroUsd,default:defaultBound,outputTokens:exact.outputTokens});
  const headReviewReasons:string[]=[];
  for(let turn=0;turn<8;turn++){const outcome=await reviewLocalPatchBoard(container,{gameId,sceneId:scene.id,deadlineAt:Date.now()+270000},{fence:async()=>{},readBoardArt:readArt},{onlyHideId:hide.id});headReviewReasons.push(outcome.state+':'+outcome.reason);
   await advanceContinuityInBackground(container,gameId,{deadlineAt:Date.now()+270000});await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS+1);if(JSON.parse((await row()).judgeJson!).reviewState==='board-review-complete')break;}
  const final=await row(),receipt=JSON.parse(final.judgeJson!);expect(receipt.reviewState,JSON.stringify({headReviewReasons,headQuestions,lastError:final.lastError,receiptKeys:Object.keys(receipt)})).toBe('board-review-complete');
  expect(final.status,final.lastError??'').toBe(refuseAge?'FAILED':'GENERATED');expect(headQuestions).toBe(1);
  expect(await allowedDualPublication(db,{...publicationBinding(gameId,final),sceneVersion:13})).toBe(!refuseAge);
  if(!refuseAge){expect(receipt.boardReview.dual.quality.policy.maxOutputTokens).toBe(6000);
   const noMarker={...receipt};delete noMarker.journeyHeadRecovery;expect(await allowedDualPublication(db,{...publicationBinding(gameId,final),sceneVersion:13,judgeJson:JSON.stringify(noMarker)})).toBe(false);
   expect(await service.journeyHeadCompositionMatches(db,{gameId,hideId:hide.id,receipt:{...receipt,journeyHeadComposition:{...receipt.journeyHeadComposition,paidHeadChangedPixels:1}}},readArt)).toBe(false);}
  expect(await service.resumeJourneySourceHead(container,gameId,hide.id)).toBe(false);
  // A normal world slice after completion or refusal may not buy another hide
  // or diagnose the same head again. Placeholder siblings stay byte-identical.
  const beforeScope=(await budget.audit(worldId)).committedMicroUsd;
  await runLocalPatchWorldSlice(container,deps,gameId,{hardDeadlineAt:Date.now()+270000,diagnose:forbidden});
  expect(render).toHaveBeenCalledTimes(2);expect(await siblings()).toEqual(protectedRows);expect(forbidden).not.toHaveBeenCalled();
  expect((await budget.audit(worldId)).committedMicroUsd).toBe(beforeScope);
  const bills=JSON.parse((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson).requests;
  for(const old of JSON.parse(oldLedger.snapshotJson).requests)expect(bills.find((b:{requestKey:string})=>b.requestKey===old.requestKey)).toEqual(old);
  // Stop before a second admission when its full image+review allowance is short by one microUSD.
  const remaining=(await budget.audit(worldId)).remainingMicroUsd,fill=remaining-(120000+jh.JOURNEY_HEAD_REVIEW_COVERAGE_MICRO_USD-1);
  if(fill>0){await budget.reserve(worldId,{requestKey:'synthetic-jnh-cap-boundary',scope:'image',operationFingerprint:'f'.repeat(64),reserveMicroUsd:fill});await budget.settle(worldId,'synthetic-jnh-cap-boundary',bill('synthetic-cap-boundary-'+gameId,fill));}
  const nextReasons:string[]=[];expect(await service.resumeJourneySourceHead(container,gameId,JOURNEY_SOURCE_HEAD_AUTHORITIES[index?0:1]!.hideId,r=>nextReasons.push(r))).toBe(false);
  expect(nextReasons).toEqual(['payment-identity-or-full-capacity']);
  const closed=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}}),game=await db.game.findUniqueOrThrow({where:{id:gameId}});
  expect(await deleteLocalPatchGame(container,gameId,{type:'USER',id:game.ownerId!},game.ownerId!)).toBe(true);
  expect((await db.auditLog.findFirstOrThrow({where:{entityId:gameId,action:jh.JOURNEY_SOURCE_HEAD_ACTION}})).metaJson).toBeNull();
  if(replaySizeFailure)expect((await db.auditLog.findFirstOrThrow({where:{entityId:gameId,action:jh.JOURNEY_HEAD_FRAME_REPLAY_ACTION}})).metaJson).toBeNull();
  expect((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson).toBe(closed.snapshotJson);
  expect(fetch).not.toHaveBeenCalled();
 }finally{vi.useRealTimers();}
},180_000);

it('explicit five-dollar completion admits exactly one Paris Sunburst head without changing history, the game painter pin or any other grant',async()=>{
 vi.useFakeTimers({toFake:['Date']});
 try{
  const jh=await import('../../../domain/generation/journey-source-head'),service=await import('../journey-source-head-recovery');
  const five=await import('../qa-five-dollar-completion'),fiveDomain=await import('../../../domain/generation/qa-five-dollar-completion');
  const {readBoardWizardBudgetAuthority}=await import('../board-conditioned-wizard');
  const {leanCompletionBudgetAuditId}=await import('../lean-completion-budget');
  const {JOURNEY_SOURCE_HEAD_AUTHORITIES}=await import('../../../../content/detectives/journey-source-head-v2');
  expect(jh.JOURNEY_SUNBURST_HEAD_PAINTER).toBe(LOCAL_PATCH_SUNBURST_PAINTER);
  const a=JOURNEY_SOURCE_HEAD_AUTHORITIES.find(x=>x.hideId===jh.JOURNEY_SUNBURST_HEAD_HIDE_ID)!,gameId='five-dollar-sunburst-head-synthetic';
  await newDetectiveWorld(gameId,7,true,false,false,true);
  const payment=await db.order.findUniqueOrThrow({where:{id:'order-'+gameId}});
  await db.game.update({where:{id:gameId},data:{paidAt:payment.paidAt}});
  await ensureSingleMediumReviewPolicy(c,gameId,async()=>{});
  const placement=await resolveLocalPatchBoardsForGame(db,gameId,13),board=placement.boards.find(b=>b.board===a.boardId)!,hide=board.hides.find(h=>h.id===a.hideId)!;
  const provider=controlledSol(false,false),retrieve=provider.fake.retrieve.bind(provider.fake);let headBought=false;
  let retainedHead:{left:number;top:number;width:number;height:number}|undefined;
  provider.fake.retrieve=async id=>{const result=await retrieve(id);if(result.status!=='completed')return result;
   const value=JSON.parse(result.reading.raw!);
   const assessment=value.assessment.version===SOURCE_NEIGHBOR_BUNDLE_VERSION?value.assessment.assessment:value.assessment;
   const head=assessment.quality.hides[0].hideId==='amazon-detectives-hide-3'?retainedHead:headBought?{left:170,top:220,width:95,height:100}:undefined;
   if(!head)return result;
   assessment.subject.checks.perceivedAge.estimatedMinYears=6;assessment.subject.checks.perceivedAge.estimatedMaxYears=8;
   value.head={...value.head,rawHead:head,shippingHead:head,rawCrown:'pass',shippingCrown:'pass'};
   return {...result,reading:{...result.reading,raw:JSON.stringify(value)}};};
  const forbidden=vi.fn(async()=>{throw Error('No extra synchronous or paid diagnostic request');});
  const container={...c,backgroundReview:provider.fake,visualReview:{request:forbidden}} as Container;
  const render=vi.fn<LocalPatchHideDeps['render']>(async input=>{
   const pixels=await sharp(input.stylePng).ensureAlpha().raw().toBuffer();
   if(input.requestKey===a.hideId+':'+a.pose+':render:2'){
    // The one Sunburst head: photo-backed HIGH, native SOURCE head recipe, exactly once.
    expect(headBought).toBe(false);headBought=true;expect(input.subjectQuality).toBe('high');expect(input.subjectPhotoPng).toBeDefined();
    expect(input.prompt).toContain('NATIVE SOURCE HEAD '+jh.JOURNEY_SOURCE_HEAD_VERSION);
    const alpha=jh.journeyHeadAlpha(a);for(let i=0;i<alpha.length;i++)if(alpha[i]){pixels[i*4]=32;pixels[i*4+1]=108;pixels[i*4+2]=139;}
   }else{expect(input.requestKey).toBe(a.hideId+':'+a.pose+':render:1');expect(input.subjectQuality).toBe('medium');const r=maskForHide(hide);
    for(let y=r.top+30;y<r.top+80;y++)for(let x=r.left+30;x<r.left+80;x++){const i=(y*512+x)*4;pixels[i]=84;pixels[i+1]=54;pixels[i+2]=121;}}
   return paintedOk(await sharp(pixels,{raw:{width:512,height:768,channels:4}}).png().toBuffer(),bill('synthetic-five-head-'+input.requestKey,50000));
  });
  const mediumDeps:LocalPatchHideDeps={readBoardArt:readArt,renderPolicySha256:localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY),render,judge:forbidden,fence:async()=>{}};
  expect((await runLocalPatchHide(container,mediumDeps,{gameId,board,hide})).state).toBe('generated');
  const scene=await db.gameScene.findUniqueOrThrow({where:{gameId_sceneSlug:{gameId,sceneSlug:board.board}}});
  const row=()=>db.targetVariantAsset.findFirstOrThrow({where:{variant:'A',targetInstance:{gameSceneId:scene.id,targetId:hide.targetId}}});
  for(let turn=0;turn<8;turn++){await reviewLocalPatchBoard(container,{gameId,sceneId:scene.id,deadlineAt:Date.now()+270000},{fence:async()=>{},readBoardArt:readArt},{onlyHideId:hide.id});
   await advanceContinuityInBackground(container,gameId,{deadlineAt:Date.now()+270000});await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS+1);if(JSON.parse((await row()).judgeJson!).reviewState==='board-review-complete')break;}
  const before=await row();expect(before).toMatchObject({status:'FAILED',attempts:1});
  for(const b of placement.boards)for(const h of b.hides){if(h.id===hide.id)continue;
   const s=await db.gameScene.findFirstOrThrow({where:{gameId,sceneSlug:b.board}}),target=sceneBySlug(b.board,13).targets.find(t=>t.id===h.targetId)!;
   const ti=await db.targetInstance.create({data:{id:'five-tgt-'+gameId+'-'+h.id,gameSceneId:s.id,targetId:target.id,targetType:target.targetType,spriteKind:'image',slotAId:target.slots[0].id,slotBId:target.slots[1].id}});
   await db.targetVariantAsset.create({data:{id:'five-tva-'+gameId+'-'+h.id,targetInstanceId:ti.id,variant:'A',slotId:target.slots[0].id,status:'PENDING',provider:'local-patch',promptVersion:LOCAL_PATCH_FIXED_SCENERY_PROMPT_VERSION,attempts:0}});}
  // A real free paid-window composition is approved under the birth cap before
  // the grant. Its publication proof must remain valid after the cap is five.
  const windowBoard=placement.boards.find(b=>b.board==='amazon')!,windowHide=windowBoard.hides.find(h=>h.id==='amazon-detectives-hide-3')!;
  const windowScene=await db.gameScene.findUniqueOrThrow({where:{gameId_sceneSlug:{gameId,sceneSlug:'amazon'}}});
  const windowRow=()=>db.targetVariantAsset.findFirstOrThrow({where:{variant:'A',targetInstance:{gameSceneId:windowScene.id,targetId:windowHide.targetId}}});
  const windowRender:LocalPatchHideDeps['render']=async input=>{
   expect(input.requestKey).toBe(windowHide.id+':'+windowHide.pose+':render:1');
   const mask=maskForHide(windowHide),rect={left:mask.left+20,top:mask.top+20,width:50,height:70};
   const block=await sharp({create:{width:rect.width,height:rect.height,channels:4,background:'#405971'}}).png().toBuffer();
   const paidDetail=await sharp({create:{width:12,height:12,channels:4,background:'#3c6058'}}).png().toBuffer();
   return paintedOk(await sharp(input.stylePng).composite([{input:block,left:rect.left,top:rect.top},{input:paidDetail,left:32,top:680}]).png().toBuffer(),bill('synthetic-five-window',50000));
  };
  const initialWindowOutcome=await runLocalPatchHide(container,{...mediumDeps,render:windowRender},{gameId,board:windowBoard,hide:windowHide});
  expect(initialWindowOutcome.state,initialWindowOutcome.reason??'').toBe('generated');
  const initialWindow=await windowRow();await db.targetVariantAsset.update({where:{id:initialWindow.id},data:{status:'FAILED'}});
  const windowReasons:string[]=[];
  expect(await restoreRetainedWindow(container,gameId,windowHide.id,readArt,r=>windowReasons.push(r)),windowReasons.join(',')).toBe(true);
  const restoredWindow=await windowRow(),windowReceipt=JSON.parse(restoredWindow.judgeJson!);
  const windowAuthority=(await import('../../../../content/detectives/retained-window-v1')).retainedWindowAuthorityFor(windowReceipt.authoredReturn)!;
  const registered=windowAuthority.sourceHeads.find(h=>h.sourceId===windowAuthority.targetSourceId)!.head;
  retainedHead={left:registered.left-windowAuthority.crop.left,top:registered.top-windowAuthority.crop.top,width:registered.width,height:registered.height};
  for(let turn=0;turn<8;turn++){
   await reviewLocalPatchBoard(container,{gameId,sceneId:windowScene.id,deadlineAt:Date.now()+270000},{fence:async()=>{},readBoardArt:readArt},{onlyHideId:windowHide.id});
   await advanceContinuityInBackground(container,gameId,{deadlineAt:Date.now()+270000});await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS+1);
   if(JSON.parse((await windowRow()).judgeJson!).reviewState==='board-review-complete')break;
  }
  const approvedWindow=await windowRow();expect(JSON.parse(approvedWindow.judgeJson!).qualityDisposition.state,approvedWindow.lastError??'').toBe('acceptable');
  const windowBinding={...publicationBinding(gameId,approvedWindow),sceneVersion:13};
  expect(await allowedDualPublication(db,windowBinding)).toBe(true);
  const siblings=()=>db.targetVariantAsset.findMany({where:{id:{not:before.id},targetInstance:{gameScene:{gameId}}},orderBy:{id:'asc'}}),protectedRows=await siblings();expect(protectedRows).toHaveLength(26);
  // The real game's position: $3.699963 committed under the original $4, an old UNKNOWN kept whole.
  const worldId=boardWizardWorldId(gameId),budget=boardWizardBudgetOf(container),unknownKey='synthetic-five-prior-unknown';
  await budget.reserve(worldId,{requestKey:unknownKey,scope:'judge',operationFingerprint:'c'.repeat(64),reserveMicroUsd:205615});
  await budget.markUnknown(worldId,unknownKey,'Synthetic old unanswered provider request');
  const unknown=await budget.readRequest(worldId,unknownKey),gameOwner=(await db.game.findUniqueOrThrow({where:{id:gameId}})).ownerId!;
  await boardWizardBudgetOf(container,1,{authorizeUnknownContinuation:async approval=>approval.worldId===worldId&&approval.operatorId===gameOwner})
   .authorizeUnknownContinuation(worldId,{approvalId:'synthetic-existing-five-human-authority',requestKey:unknownKey,scope:unknown!.scope,operationFingerprint:unknown!.operationFingerprint,
    reserveMicroUsd:unknown!.reserveMicroUsd,unknownReasons:unknown!.unknownReasons,operatorId:gameOwner,authorizationSha256:'d'.repeat(64),authorizedAt:new Date().toISOString()});
  const fill=3_699_963-(await budget.audit(worldId)).committedMicroUsd;
  await budget.reserve(worldId,{requestKey:'synthetic-five-prior-costs',scope:'image',operationFingerprint:'e'.repeat(64),reserveMicroUsd:fill});
  await budget.settle(worldId,'synthetic-five-prior-costs',bill('synthetic-five-prior-costs-'+gameId,fill));
  expect(await budget.audit(worldId)).toMatchObject({capMicroUsd:4_000_000,remainingMicroUsd:300_037});
  const historical=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}});
  // Under four dollars the named Sunburst head (150k + 250k) is refused; nothing is pinned.
  const early:string[]=[];expect(await service.resumeJourneySunburstHead(container,gameId,r=>early.push(r))).toBe(false);
  expect(early).toEqual(['payment-identity-or-full-capacity']);
  const owner=(await db.game.findUniqueOrThrow({where:{id:gameId}})).ownerId!;
  const {plan,planSha256}=await five.planQaFiveCompletion(container,gameId);
  expect(plan.nextOperation).toMatchObject({kind:jh.JOURNEY_SUNBURST_HEAD_VERSION,hideId:a.hideId,rowId:before.id,requestKey:a.hideId+':'+a.pose+':render:2',
   imageReserveMicroUsd:150_000,reviewCoverageMicroUsd:250_000,requiredMicroUsd:400_000,remainingUnderBaseMicroUsd:300_037});
  expect(plan.unknowns).toEqual([{requestKey:unknownKey,operationFingerprint:'c'.repeat(64),reserveMicroUsd:205615}]);
  // Exclusive: another completion grant on the world refuses the plan.
  await db.auditLog.create({data:{id:leanCompletionBudgetAuditId(gameId),actorType:'ADMIN',actorId:owner,action:'synthetic-other-grant',entityType:'Game',entityId:gameId,metaJson:null}});
  await expect(five.planQaFiveCompletion(container,gameId)).rejects.toThrow('Another completion grant');
  await db.auditLog.delete({where:{id:leanCompletionBudgetAuditId(gameId)}});
  const input={gameId,operatorId:owner,expectedPlanSha256:planSha256,ownerAuthorizationSha256:'9'.repeat(64)};
  await expect(five.authorizeQaFiveCompletion(container,{...input,operatorId:'forged-operator'})).rejects.toThrow('Owner administrator');
  await expect(five.authorizeQaFiveCompletion(container,{...input,expectedPlanSha256:'f'.repeat(64)})).rejects.toThrow('Stale plan');
  const receipt=await five.authorizeQaFiveCompletion(container,input);
  expect(await five.authorizeQaFiveCompletion(container,input)).toEqual(receipt);
  await expect(five.authorizeQaFiveCompletion(container,{...input,ownerAuthorizationSha256:'a'.repeat(64)})).rejects.toThrow('Different authority');
  expect(receipt).toMatchObject({automaticExtension:false,requestsPreserved:true,exclusiveOfOtherGrants:true});
  expect((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson).toBe(historical.snapshotJson);
  expect(await budget.audit(worldId)).toMatchObject({capMicroUsd:5_000_000,remainingMicroUsd:1_300_037,held:false});
  expect(await retainedWindowEvidenceMatches(db,{gameId,sceneVersion:13,hideId:windowHide.id,variantId:approvedWindow.id,
   assetId:approvedWindow.assetId!,judgeJson:approvedWindow.judgeJson},readArt),'An explicit five-dollar head grant cannot revoke an already approved free window').toBe(true);
  expect(await allowedDualPublication(db,windowBinding)).toBe(true);
  await expect(budget.reserve(worldId,{requestKey:'amazon-detectives-hide-3:standing:render:2',scope:'image',operationFingerprint:'7'.repeat(64),reserveMicroUsd:300_038}))
   .rejects.toThrow('ceiling');
  expect(await budget.readRequest(worldId,'amazon-detectives-hide-3:standing:render:2')).toBeNull();
  expect(await budget.readRequest(worldId,unknownKey)).toMatchObject({state:'unknown',reserveMicroUsd:205615});
  expect(await five.qaFiveCompletionStatus(container,gameId)).toMatchObject({status:'active',baseCapMicroUsd:4_000_000,capMicroUsd:5_000_000});
  await expect(five.planQaFiveCompletion(container,gameId)).rejects.toThrow('already exists');
  // Never a sum or silent fallback beside another grant.
  await db.auditLog.create({data:{id:leanCompletionBudgetAuditId(gameId),actorType:'ADMIN',actorId:owner,action:'synthetic-other-grant',entityType:'Game',entityId:gameId,metaJson:null}});
  await expect(readBoardWizardBudgetAuthority(container,worldId)).rejects.toThrow('cannot coexist');
  await db.auditLog.delete({where:{id:leanCompletionBudgetAuditId(gameId)}});
  // A refund withdraws the capacity; restoring the payment restores the same receipt.
  await db.order.update({where:{id:payment.id},data:{paymentStatus:'REFUNDED'}});
  expect(await five.readQaFiveCompletionBudget(container,worldId)).toBeNull();
  expect(await five.qaFiveCompletionStatus(container,gameId)).toMatchObject({status:'withdrawn'});
  await db.order.update({where:{id:payment.id},data:{paymentStatus:'PAID'}});
  // While the grant names the Sunburst head, Paris cannot be enrolled as a MEDIUM v2 head.
  const mediumReasons:string[]=[];expect(await service.resumeJourneySourceHead(container,gameId,a.hideId,r=>mediumReasons.push(r))).toBe(false);
  expect(mediumReasons).toEqual(['five-dollar-grant-names-sunburst-head']);
  await db.targetVariantAsset.update({where:{id:approvedWindow.id},data:{judgeJson:JSON.stringify({...JSON.parse(approvedWindow.judgeJson!),reviewState:'pending-board-review'})}});
  const unpaidReviewReasons:string[]=[];
  expect(await service.resumeJourneySunburstHead(container,gameId,r=>unpaidReviewReasons.push(r))).toBe(false);
  expect(unpaidReviewReasons).toEqual(['other-paid-pictures-await-ordinary-review']);
  await db.targetVariantAsset.update({where:{id:approvedWindow.id},data:{judgeJson:approvedWindow.judgeJson,updatedAt:approvedWindow.updatedAt}});
  const reasons:string[]=[];expect(await service.resumeJourneySunburstHead(container,gameId,r=>reasons.push(r)),reasons.join(',')).toBe(true);
  expect(await service.resumeJourneySunburstHead(container,gameId)).toBe(false);
  expect(await service.resumeJourneySourceHead(container,gameId,a.hideId)).toBe(false);
  expect(await row()).toEqual(before);expect(await siblings()).toEqual(protectedRows);
  expect((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson).toBe(historical.snapshotJson);
  const pins=await service.journeyHeadPinsOf(db,gameId);expect(pins).toHaveLength(1);
  const pin=pins[0]!;expect(service.isJourneySunburstHeadPin(pin)).toBe(true);
  expect(pin).toMatchObject({version:jh.JOURNEY_SUNBURST_HEAD_VERSION,hideId:a.hideId,capMicroUsd:5_000_000,completionAuthorizationSha256:receipt.authorizationSha256,
   imagePolicySha256:localPatchRenderPolicySha256(LOCAL_PATCH_SUNBURST_IMAGE_POLICY),imageReserveMicroUsd:150_000,reviewCoverageMicroUsd:250_000});
  const purchase=await service.requireJourneyHeadPurchase(container,gameId,before.id);
  expect(purchase.sunburst).toMatchObject({painterRelease:LOCAL_PATCH_SUNBURST_PAINTER,subjectQuality:'high',imageReserveMicroUsd:150_000,reviewCoverageMicroUsd:250_000,
   requestKey:a.hideId+':'+a.pose+':render:2',completionAuthorizationSha256:receipt.authorizationSha256});
  expect(purchase.marker.painterRelease).toBe(LOCAL_PATCH_SUNBURST_PAINTER);
  // The game's own painter release is never pinned or changed.
  expect(await localPatchPainterRelease(db,gameId)).toBeNull();
  expect(await allowedDualPublication(db,windowBinding)).toBe(true);
  // CONTRACT for Codex hunks H1/H2 (RED until applied): a MEDIUM-policy dispatch
  // can never buy the Sunburst pin, and is refused before any reservation.
  await expect(runLocalPatchHide(container,mediumDeps,{gameId,board,hide,finalRepair:true,journeyHeadRecovery:true})).rejects.toThrow('JOURNEY_HEAD');
  expect(render).toHaveBeenCalledTimes(1);expect(await budget.readRequest(worldId,pin.requestKey)).toBeNull();
  expect((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson).toBe(historical.snapshotJson);
  // The one purchase through per-call Sunburst deps: photo-backed HIGH, 150k reserve, once.
  // Production: localPatchPainterForGame supplies sunburstHeadRender (hunk H3); the game's own deps stay MEDIUM.
  const sunburstDeps={...mediumDeps,sunburstHeadRender:render} as LocalPatchHideDeps;
  const bought=await runLocalPatchHide(container,sunburstDeps,{gameId,board,hide,finalRepair:true,journeyHeadRecovery:true});
  expect(bought.state,bought.reason??'').toBe('generated');expect(render).toHaveBeenCalledTimes(2);
  expect(await budget.readRequest(worldId,pin.requestKey)).toMatchObject({state:'settled',reserveMicroUsd:150_000});
  const bills=JSON.parse((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson).requests;
  for(const old of JSON.parse(historical.snapshotJson).requests)expect(bills.find((b:{requestKey:string})=>b.requestKey===old.requestKey)).toEqual(old);
  expect(await siblings()).toEqual(protectedRows);expect(await localPatchPainterRelease(db,gameId)).toBeNull();
  const generated=await row();
  expect(JSON.parse(generated.judgeJson!).reviewState).toBe('pending-board-review');
  const pendingReceipt=JSON.parse(generated.judgeJson!);
  expect(await allowedDualPublication(db,{gameId,sceneVersion:13,hideId:hide.id,variantId:generated.id,attempts:2,
   identityAssetId:pin.identityAssetId,identitySha256:pin.identitySha256,assetId:generated.assetId!,
   imageSha256:pendingReceipt.judgedSha256,geometrySha256:pendingReceipt.geometrySha256,judgeJson:generated.judgeJson})).toBe(false);
  const reviewStates:string[]=[];
  for(let turn=0;turn<8;turn++){
   const review=await reviewLocalPatchBoard(container,{gameId,sceneId:scene.id,deadlineAt:Date.now()+270000},
    {fence:async()=>{},readBoardArt:readArt},{onlyHideId:hide.id});reviewStates.push(review.state+':'+review.reason);
   await advanceContinuityInBackground(container,gameId,{deadlineAt:Date.now()+270000});
   await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS+1);
   if(JSON.parse((await row()).judgeJson!).reviewState==='board-review-complete')break;
  }
  const reviewed=await row(),reviewedReceipt=JSON.parse(reviewed.judgeJson!);
  expect(reviewedReceipt.reviewState,JSON.stringify(reviewStates)).toBe('board-review-complete');
  expect(reviewedReceipt.qualityDisposition.state,reviewed.lastError??'').toBe('acceptable');
  expect(reviewedReceipt.boardReview.dual.quality.policy.maxOutputTokens).toBe(6000);
  expect(await allowedDualPublication(db,{...publicationBinding(gameId,reviewed),sceneVersion:13})).toBe(true);
  expect(await service.journeyHeadCompositionMatches(db,{gameId,hideId:hide.id,receipt:reviewedReceipt},readArt)).toBe(true);
  expect(render).toHaveBeenCalledTimes(2);expect(await siblings()).toEqual(protectedRows);
  expect(await budget.readRequest(worldId,unknownKey)).toMatchObject({state:'unknown',reserveMicroUsd:205615});
  expect(await localPatchPainterRelease(db,gameId)).toBeNull();
  // A second Sunburst painting is never admitted.
  expect(await service.resumeJourneySunburstHead(container,gameId)).toBe(false);
  expect(fiveDomain.QA_FIVE_COMPLETION_CAP).toBe(5_000_000);
  expect(fetch).not.toHaveBeenCalled();
 }finally{vi.useRealTimers();}
},300_000);

it.each(['pass','age-refusal','wall-replacement','wall-provider-retry'] as const)('finite Sunburst tail completes all27 through native SOURCE heads, preserving a paid window failure, the old NY head and full UNKNOWN; outcome=%s',async outcome=>{
 const startedAt=performance.now();
 const checkpoint=(phase:string,details:object={})=>console.info('finite-tail-native-checkpoint',{
  phase,outcome,elapsedMs:Math.round(performance.now()-startedAt),...details});
 vi.useFakeTimers({toFake:['Date']});
 try{
  const gameId='synthetic-finite-sunburst-tail-native-27-'+outcome;
  await newDetectiveWorld(gameId,7,true,false,false,true);
  const payment=await db.order.findUniqueOrThrow({where:{id:'order-'+gameId}});
  await db.game.update({where:{id:gameId},data:{paidAt:payment.paidAt}});
  await ensureSingleMediumReviewPolicy(c,gameId,async()=>{});
  const jh=await import('../../../domain/generation/journey-source-head');
  const tailDomain=await import('../../../domain/generation/journey-sunburst-tail');
  const heads=await import('../journey-source-head-recovery');
  const finance=await import('../qa-sunburst-tail-completion');
  const { fixedSourceFailureReceipt }=await import('../../../infra/generation/fixed-source-diagnostics');
  const {JOURNEY_SOURCE_HEAD_AUTHORITIES}=await import('../../../../content/detectives/journey-source-head-v2');
  const {JOURNEY_SUNBURST_TAIL_AUTHORITIES}=await import('../../../../content/detectives/journey-sunburst-tail-v1');
  const {retainedWindowCanonicalHash:hash}=await import('../../../domain/generation/retained-window');
  const placement=await resolveLocalPatchBoardsForGame(db,gameId,13),hides=placement.boards.flatMap(b=>b.hides);
  const providerRetry=outcome==='wall-provider-retry',wallReplacement=outcome==='wall-replacement'||providerRetry;
  const expectedRenders=providerRetry?33:wallReplacement?32:31;
  const expectedReviews=providerRetry?36:33;
  const tailIds=tailDomain.JOURNEY_SUNBURST_TAIL_HIDE_IDS,nyId='newyork-detectives-hide-1';
  const originalFailures=new Set<string>([...tailIds,nyId]),boughtHeads=new Map<string,'medium'|'sunburst'>();
  let retainedHead:{left:number;top:number;width:number;height:number}|undefined;
  let wallFlexResponse:string|undefined,wallDefaultRefusal:string|undefined,wallTransportChecked=false;
  let parisChairRefusal:string|undefined;
  const provider=controlledSol(true,false,undefined,true,true),retrieve=provider.fake.retrieve.bind(provider.fake);
  const create=provider.fake.create.bind(provider.fake);
  provider.fake.create=async body=>{
   const result=await create(body),request=provider.creates.at(-1)!;
   if(providerRetry&&request.hideId===jh.JOURNEY_WALL_REPLACEMENT_HIDE&&boughtHeads.has(request.hideId)&&request.tier==='flex'){
    expect(wallFlexResponse).toBeUndefined();wallFlexResponse=result.responseId;
   }
   if(providerRetry&&request.hideId===jh.JOURNEY_WALL_REPLACEMENT_HIDE&&request.tier==='default'&&!wallDefaultRefusal)
    wallDefaultRefusal=result.responseId;
   if(providerRetry&&request.hideId===jh.JOURNEY_SUNBURST_HEAD_HIDE_ID&&boughtHeads.has(request.hideId)&&!parisChairRefusal)
    parisChairRefusal=result.responseId;
   return result;
  };
  provider.fake.retrieve=async id=>{
   const result=await retrieve(id);if(result.status!=='completed'||!result.reading.raw)return result;
   if(id===wallFlexResponse)return {status:'failed',reading:{responseId:id,raw:null,usage:null,model:'gpt-6.1-sol',
    finishReason:'failed',serviceTier:'flex',providerError:{code:'server_is_overloaded',message:'Synthetic Wall review overload'}}};
   const value=JSON.parse(result.reading.raw),assessment=value.assessment.version===SOURCE_NEIGHBOR_BUNDLE_VERSION?value.assessment.assessment:value.assessment;
   const hideId=assessment.quality.hides[0].hideId;
   if(id===wallDefaultRefusal){
    const faults=['childComplete','pictureWhole','severeSeam'];
    Object.assign(assessment.quality.hides[0].verdict,{verdict:'fail',childComplete:'fail',pictureWhole:'fail',severeSeam:'fail',
     reason:'Synthetic horizontal jacket splice through the chest and sleeves',
     faults:faults.map(check=>({check,where:'Synthetic jacket splice at the collar and chest'}))});
   }
   if(id===parisChairRefusal){
    const faults=['pictureWhole','severeSeam'];
    Object.assign(assessment.quality.hides[0].verdict,{verdict:'fail',childComplete:'pass',pictureWhole:'fail',severeSeam:'fail',
     reason:'Synthetic broken green chair rail on the left',
     faults:faults.map(check=>({check,where:'Synthetic left chair rail'}))});
   }
   if(originalFailures.has(hideId)&&!boughtHeads.has(hideId)||outcome==='age-refusal'&&hideId==='amazon-detectives-hide-3'){
    // A deliberately unchanged subject-read/v2 refusal at confirmed age seven.
    assessment.subject.checks.perceivedAge.estimatedMinYears=7;
    assessment.subject.checks.perceivedAge.estimatedMaxYears=9;
   }
   const a=boughtHeads.get(hideId)==='sunburst'?JOURNEY_SUNBURST_TAIL_AUTHORITIES.find(x=>x.hideId===hideId)
    :boughtHeads.has(hideId)?JOURNEY_SOURCE_HEAD_AUTHORITIES.find(x=>x.hideId===hideId):null;
   const head=a?.targetRegisteredHead??(hideId==='amazon-detectives-hide-3'?retainedHead:undefined);
   if(head)value.head={...value.head,rawHead:head,shippingHead:head,rawCrown:'pass',shippingCrown:'pass'};
   return {...result,reading:{...result.reading,raw:JSON.stringify(value)}};
  };
  const forbidden=vi.fn(async()=>{throw Error('No duplicate judge, planner, extra painting or real provider');});
  const container={...c,backgroundReview:provider.fake,visualReview:{request:forbidden}} as Container;
  const render=vi.fn<LocalPatchHideDeps['render']>(async input=>{
   const hide=hides.find(h=>input.requestKey.startsWith(h.id+':'))!;
   expect(hide).toBeDefined();
   const second=input.requestKey.endsWith(':render:2'),replacement=input.requestKey===jh.JOURNEY_WALL_REPLACEMENT_KEY
     ||input.requestKey===jh.JOURNEY_WALL_PROVIDER_RETRY_KEY;
   let png:Buffer;
   if(second||replacement){
    expect(boughtHeads.has(hide.id)).toBe(replacement);expect(input.subjectPhotoPng).toBeDefined();
    const sunburst=(tailIds as readonly string[]).includes(hide.id);
    expect(input.subjectQuality).toBe(sunburst?'high':'medium');
    expect(input.prompt).toContain('NATIVE SOURCE HEAD '+(sunburst?tailDomain.JOURNEY_SUNBURST_TAIL_VERSION:jh.JOURNEY_SOURCE_HEAD_VERSION));
    if(replacement)expect(input.prompt).toContain('GREAT WALL REPLACEMENT v1');
    if(providerRetry&&input.requestKey===jh.JOURNEY_WALL_REPLACEMENT_KEY){
     return {png:null,quarantined:null,rejected:'synthetic provider 500 with no image',evidence:null,
      unknownReason:'image-charge-evidence-incomplete-or-model-unexpected',
      failureReceipt:fixedSourceFailureReceipt({worldId:input.worldId,requestKey:input.requestKey,fingerprint:'8'.repeat(64),
       model:'gpt-image-2.6-sunburst',quality:'high',reason:'charge-evidence',billing:'unknown',jsonStatus:'parsed',
       json:{error:{type:'server_error'}},response:{status:500,headers:new Headers({'x-request-id':'req_synthetic_500'})}})};
    }
    const a=(sunburst?JOURNEY_SUNBURST_TAIL_AUTHORITIES:JOURNEY_SOURCE_HEAD_AUTHORITIES).find(x=>x.hideId===hide.id)!;
    const alpha=jh.journeyHeadAlpha(a),pixels=await sharp(input.stylePng).ensureAlpha().raw().toBuffer();
    for(let i=0;i<alpha.length;i++){
     if(alpha[i]){pixels[i*4]=42;pixels[i*4+1]=91;pixels[i*4+2]=137;}
     else if(wallReplacement&&second&&hide.id===jh.JOURNEY_WALL_REPLACEMENT_HIDE){
      for(let channel=0;channel<3;channel++)pixels[i*4+channel]=pixels[i*4+channel]!<128?255:0;
     }
    }
    png=await sharp(pixels,{raw:{width:512,height:768,channels:4}}).png().toBuffer();
    boughtHeads.set(hide.id,sunburst?'sunburst':'medium');
   }else{
    expect(input.requestKey).toBe(hide.id+':'+hide.pose+':render:1');expect(input.subjectQuality).toBe('medium');
    const m=maskForHide(hide),r={left:m.left+Math.round(m.width*.2),top:m.top+Math.round(m.height*.2),width:Math.round(m.width*.6),height:Math.round(m.height*.8)};
    const figure=await sharp({create:{width:r.width,height:r.height,channels:4,background:'#315782'}}).png().toBuffer();
    png=await sharp(input.stylePng).composite([{input:figure,left:r.left,top:r.top}]).png().toBuffer();
    if(hide.id==='amazon-detectives-hide-3'){
     // A real retained-window recomposition must change paid pixels before a new review.
     const detail=await sharp({create:{width:12,height:12,channels:4,background:'#3c6058'}}).png().toBuffer();
     png=await sharp(png).composite([{input:detail,left:32,top:680}]).png().toBuffer();
    }
   }
   return paintedOk(png,bill('synthetic-tail-'+gameId+'-'+input.requestKey,50_000));
  });
  const deps:LocalPatchHideDeps={readBoardArt:readArt,renderPolicySha256:localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY),render,judge:forbidden,fence:async()=>{}};
  const rowOf=async(hideId:string)=>{const board=placement.boards.find(b=>b.hides.some(h=>h.id===hideId))!,hide=board.hides.find(h=>h.id===hideId)!;
   return db.targetVariantAsset.findFirstOrThrow({where:{variant:'A',targetInstance:{targetId:hide.targetId,gameScene:{gameId,sceneSlug:board.board}}}});};
  const review=async(hideId:string)=>{
   const board=placement.boards.find(b=>b.hides.some(h=>h.id===hideId))!;
   const scene=await db.gameScene.findUniqueOrThrow({where:{gameId_sceneSlug:{gameId,sceneSlug:board.board}}});
   for(let turn=0;turn<20;turn++){
    await reviewLocalPatchBoard(container,{gameId,sceneId:scene.id,deadlineAt:Date.now()+270000},{fence:async()=>{},readBoardArt:readArt},{onlyHideId:hideId});
    await advanceContinuityInBackground(container,gameId,{deadlineAt:Date.now()+270000});
    const continued=await (await import('../subject-upgrade')).continueAdmittedReviewInterruptions(container,gameId,{readBoardArt:readArt},Date.now()+270000,async()=>{});
    expect(continued).not.toBe('blocked');
    await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS+1);
    const current=await rowOf(hideId),receipt=JSON.parse(current.judgeJson!);
    const interruptedWall=providerRetry&&hideId===jh.JOURNEY_WALL_REPLACEMENT_HIDE;
    if(interruptedWall&&current.status==='FAILED'&&receipt.reviewInterruption&&!wallTransportChecked){
     const input={gameId,hideId,receipt},auditId=receipt.reviewInterruption.recoveryId;
     expect(await heads.journeyHeadCompositionMatches(db,input,readArt),'Failed candidate must still be unpublishable').toBe(false);
     expect(await heads.resumeJourneySunburstTailHead(container,gameId,jh.JOURNEY_SUNBURST_HEAD_HIDE_ID)).toBe(false);
     const audit=await db.auditLog.findUniqueOrThrow({where:{id:auditId}});
     await db.auditLog.update({where:{id:auditId},data:{actorType:'ADMIN'}});
     try{expect(await heads.journeyHeadCompositionMatches(db,{...input,allowInterruptedReview:true},readArt)).toBe(false);}
     finally{await db.auditLog.update({where:{id:auditId},data:{actorType:audit.actorType}});}
     expect(await heads.journeyHeadCompositionMatches(db,{...input,allowInterruptedReview:true},readArt)).toBe(true);
     wallTransportChecked=true;
    }
    if(receipt.reviewState==='board-review-complete'
      &&(!(hideId==='antarctica-detectives-hide-1'||interruptedWall&&wallFlexResponse)||current.status==='GENERATED'
        ||interruptedWall&&receipt.boardReview?.dual?.quality))break;
   }
   const row=await rowOf(hideId);expect(JSON.parse(row.judgeJson!).reviewState,row.lastError??'').toBe('board-review-complete');return row;
  };
  // The one unanswered request belongs to a hide that is NOT repainted. Its
  // native MEDIUM continuation and full UNKNOWN hold must survive the tail.
  const paintOrder=[...placement.boards].sort((a,b)=>Number(b.board==='antarctica')-Number(a.board==='antarctica'));
  for(const board of paintOrder){
   for(const hide of board.hides){const generated=await runLocalPatchHide(container,deps,{gameId,board,hide});expect(generated.state,generated.reason??hide.id).toBe('generated');}
   for(const hide of board.hides){const row=await review(hide.id);expect(row.status,hide.id+': '+row.lastError).toBe(originalFailures.has(hide.id)?'FAILED':'GENERATED');}
   if(render.mock.calls.length%9===0)checkpoint('initial-pictures-reviewed',{count:render.mock.calls.length});
  }
  expect(render).toHaveBeenCalledTimes(27);expect(provider.creates).toHaveLength(28);
  // The genuine, already-reviewed legacy NY1 head remains publishable after the new grant.
  expect(await heads.resumeJourneySourceHead(container,gameId,nyId)).toBe(true);
  const nyBoard=placement.boards.find(b=>b.board==='newyork')!,nyHide=nyBoard.hides.find(h=>h.id===nyId)!;
  expect((await runLocalPatchHide(container,deps,{gameId,board:nyBoard,hide:nyHide,finalRepair:true,journeyHeadRecovery:true})).state).toBe('generated');
  const ny=await review(nyId);expect(ny.status,ny.lastError??'').toBe('GENERATED');
  expect(await allowedDualPublication(db,{...publicationBinding(gameId,ny),sceneVersion:13})).toBe(true);
  const windowId='amazon-detectives-hide-3',windowReasons:string[]=[];
  expect(await restoreRetainedWindow(container,gameId,windowId,readArt,r=>windowReasons.push(r)),windowReasons.join(',')).toBe(true);
  const window=await rowOf(windowId),windowReceipt=JSON.parse(window.judgeJson!);
  const windowAuthority=(await import('../../../../content/detectives/retained-window-v1')).retainedWindowAuthorityFor(windowReceipt.authoredReturn)!;
  const registered=windowAuthority.sourceHeads.find(h=>h.sourceId===windowAuthority.targetSourceId)!.head;
  retainedHead={left:registered.left-windowAuthority.crop.left,top:registered.top-windowAuthority.crop.top,width:registered.width,height:registered.height};
  const refusedWindow=await review(windowId);
  expect(refusedWindow.status).toBe('FAILED');expect(JSON.parse(refusedWindow.judgeJson!).retainedWindow).toBeDefined();
  // Nothing relaxes the deliberate seven-to-nine age refusal; the art needs a new finite head.
  const worldId=boardWizardWorldId(gameId),budget=boardWizardBudgetOf(container);
  const unknownKeys=(await budget.audit(worldId)).unknownRequestKeys;expect(unknownKeys).toHaveLength(1);
  const unknownKey=unknownKeys[0]!,unknown=(await budget.readRequest(worldId,unknownKey))!,owner=(await db.game.findUniqueOrThrow({where:{id:gameId}})).ownerId!;
  expect(unknown.state).toBe('unknown');
  expect(await budget.readContinuationApproval(worldId,unknownKey)).toMatchObject({version:'world-automatic-review-recovery/v5',policyId:'single-sol-medium-transport-recovery/v1'});
  const fill=3_738_580-(await budget.audit(worldId)).committedMicroUsd;expect(fill).toBeGreaterThan(0);
  await budget.reserve(worldId,{requestKey:'synthetic-tail-prior-costs',scope:'image',operationFingerprint:'e'.repeat(64),reserveMicroUsd:fill});
  await budget.settle(worldId,'synthetic-tail-prior-costs',bill('synthetic-tail-prior-costs-'+gameId,fill));
  const allRows=()=>db.targetVariantAsset.findMany({where:{variant:'A',targetInstance:{gameScene:{gameId}}},orderBy:{id:'asc'}});
  const beforeGrantRows=await allRows(),beforeGrantLedger=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}});
  expect(beforeGrantRows.filter(r=>r.status==='GENERATED')).toHaveLength(24);
  const {plan,planSha256}=await finance.planQaSunburstTailCompletion(container,gameId);
  expect(plan.operations.map(op=>op.hideId)).toEqual(tailIds);expect(plan.requiredMicroUsd).toBe(1_200_000);
  expect(plan.committedMicroUsd+plan.requiredMicroUsd).toBe(4_938_580);
  const receipt=await finance.authorizeQaSunburstTailCompletion(container,{gameId,operatorId:owner,expectedPlanSha256:planSha256,ownerAuthorizationSha256:'9'.repeat(64)});
  expect(await allRows()).toEqual(beforeGrantRows);
  expect((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson).toBe(beforeGrantLedger.snapshotJson);
  expect(await budget.audit(worldId)).toMatchObject({capMicroUsd:5_000_000,committedMicroUsd:3_738_580,held:false});
  expect(await localPatchPainterRelease(db,gameId)).toBeNull();
  expect(await allowedDualPublication(db,{...publicationBinding(gameId,ny),sceneVersion:13}),'Old NY v2 approval survives the distinct five-dollar receipt').toBe(true);
  for(const op of plan.operations){
   const before=await rowOf(op.hideId),allBefore=await allRows(),siblings=allBefore.filter(r=>r.id!==before.id);
   const ledgerBefore=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}}),reasons:string[]=[];
   const enrollment=vi.spyOn(db,'$transaction');
   try {
    expect(await heads.resumeJourneySunburstTailHead(container,gameId,op.hideId,r=>reasons.push(r)),reasons.join(',')).toBe(true);
    expect(enrollment).toHaveBeenCalledTimes(1);
    expect(enrollment.mock.calls[0]?.[1]).toEqual({isolationLevel:'Serializable',
     timeout:op.hideId===jh.JOURNEY_SUNBURST_HEAD_HIDE_ID?180_000:60_000});
   } finally { enrollment.mockRestore(); }
   expect(await rowOf(op.hideId)).toEqual(before);expect((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson).toBe(ledgerBefore.snapshotJson);
   const pin=(await heads.journeyHeadPinsOf(db,gameId)).find(p=>p.hideId===op.hideId)!;
   expect(heads.isJourneySunburstTailPin(pin)).toBe(true);
   expect(pin).toMatchObject({version:tailDomain.JOURNEY_SUNBURST_TAIL_VERSION,capMicroUsd:5_000_000,completionAuthorizationSha256:receipt.authorizationSha256,
    previousJudgeJson:before.judgeJson,imageReserveMicroUsd:150_000,reviewCoverageMicroUsd:250_000});
   const board=placement.boards.find(b=>b.hides.some(h=>h.id===op.hideId))!,hide=board.hides.find(h=>h.id===op.hideId)!;
   await expect(runLocalPatchHide(container,deps,{gameId,board,hide,finalRepair:true,journeyHeadRecovery:true})).rejects.toThrow('JOURNEY_HEAD');
   expect(await budget.readRequest(worldId,op.requestKey)).toBeNull();
   const replacement=wallReplacement&&op.hideId===jh.JOURNEY_WALL_REPLACEMENT_HIDE;
   const bought=await runLocalPatchHide(container,{...deps,sunburstHeadRender:render},{gameId,board,hide,finalRepair:true,journeyHeadRecovery:true});
   if(replacement){
    expect(bought.state).toBe('gave-up');
    const rejected=await rowOf(op.hideId),unchangedLedger=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}});
    expect(JSON.parse(rejected.judgeJson!).renderFault).toBe('quality-seam: JOURNEY_HEAD: protected SOURCE exterior exceeds unchanged24 limit');
    const paid=await budget.readRequest(worldId,op.requestKey);
    expect(paid?.state).toBe('settled');
    expect(await heads.resumeJourneySunburstTailHead(container,gameId,jh.JOURNEY_SUNBURST_HEAD_HIDE_ID)).toBe(false);
    const preview=await heads.previewJourneyWallReplacement(container,gameId);
    expect(preview).toMatchObject({recorded:false,requiredMicroUsd:800_000,capMicroUsd:5_000_000});
    const authorization={gameId,operatorId:owner,expectedPlanSha256:preview.planSha256,ownerAuthorizationSha256:'a'.repeat(64)};
    await expect(heads.authorizeJourneyWallReplacement(container,{...authorization,expectedPlanSha256:'b'.repeat(64)})).rejects.toThrow('replacement plan changed');
    const grant=await heads.authorizeJourneyWallReplacement(container,authorization);
    expect(await heads.authorizeJourneyWallReplacement(container,authorization)).toEqual(grant);
    expect(await rowOf(op.hideId)).toEqual(rejected);
    expect((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson).toBe(unchangedLedger.snapshotJson);
    expect(await heads.resumeJourneySunburstTailHead(container,gameId,jh.JOURNEY_SUNBURST_HEAD_HIDE_ID)).toBe(false);
    const paintHead=()=>runLocalPatchHide(container,{...deps,sunburstHeadRender:render},{gameId,board,hide,finalRepair:true,journeyHeadRecovery:true});
    const replaced=await paintHead();
    if(providerRetry){
     expect(replaced).toMatchObject({state:'stopped',costUnknown:true});
     const third=await budget.readRequest(worldId,jh.JOURNEY_WALL_REPLACEMENT_KEY);
     expect(third).toMatchObject({state:'unknown',reserveMicroUsd:150_000});
     await expect(heads.previewJourneyWallReplacement(container,gameId,true)).rejects.toThrow('pending row');
     await db.generationJob.update({where:{id:'job_'+gameId},data:{status:'FAILED'}});
     const frozen=JSON.parse((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson);
     const retryPreview=await heads.previewJourneyWallReplacement(container,gameId,true);
     expect(retryPreview).toMatchObject({recorded:false,requestKey:jh.JOURNEY_WALL_PROVIDER_RETRY_KEY,requiredMicroUsd:800_000,capMicroUsd:5_000_000});
     const retryInput={...authorization,expectedPlanSha256:retryPreview.planSha256,ownerAuthorizationSha256:'c'.repeat(64)};
     await expect(heads.authorizeJourneyWallReplacement(container,{...retryInput,expectedPlanSha256:'d'.repeat(64)},true)).rejects.toThrow('replacement plan changed');
     const retry=await heads.authorizeJourneyWallReplacement(container,retryInput,true);
     expect(await heads.authorizeJourneyWallReplacement(container,retryInput,true)).toEqual(retry);
     expect(await rowOf(op.hideId)).toMatchObject({status:'FAILED',attempts:3});
     const afterGrant=JSON.parse((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson);
     expect(afterGrant.requests).toEqual(frozen.requests);
     const approval=await budget.readContinuationApproval(worldId,jh.JOURNEY_WALL_REPLACEMENT_KEY);
     expect(approval?.version).toBe('world-unknown-continuation/v1');
     if(approval?.version!=='world-unknown-continuation/v1')throw Error('Missing scoped retry continuation');
     expect(await heads.journeyWallProviderRetryPublishable(db,gameId,approval)).toBe(false);
     expect(await heads.resumeJourneySunburstTailHead(container,gameId,jh.JOURNEY_SUNBURST_HEAD_HIDE_ID)).toBe(false);
     const fourth=await runLocalPatchWorldSlice(container,{...deps,sunburstHeadRender:render},gameId,
      {hardDeadlineAt:Date.now()+270_000,diagnose:forbidden});
     expect(fourth.attention).toBeNull();
     expect(await rowOf(op.hideId)).toMatchObject({status:'GENERATED',attempts:4});
     expect(await heads.journeyWallProviderRetryPublishable(db,gameId,approval)).toBe(false);
     expect(await budget.readRequest(worldId,jh.JOURNEY_WALL_REPLACEMENT_KEY)).toEqual(third);
     expect(await budget.readRequest(worldId,jh.JOURNEY_WALL_PROVIDER_RETRY_KEY)).toMatchObject({state:'settled',reserveMicroUsd:150_000});
     checkpoint('wall-provider-retry-painted');
    }else{
     expect(replaced.state,replaced.reason??'replacement').toBe('generated');
     expect(await budget.readRequest(worldId,jh.JOURNEY_WALL_REPLACEMENT_KEY)).toMatchObject({state:'settled',reserveMicroUsd:150_000});
    }
    expect(await budget.readRequest(worldId,op.requestKey)).toEqual(paid);
    checkpoint('wall-replacement-painted');
   }else expect(bought.state,bought.reason??op.hideId).toBe('generated');
   expect(await budget.readRequest(worldId,op.requestKey)).toMatchObject({state:'settled',reserveMicroUsd:150_000});
   const pending=await rowOf(op.hideId);expect(pending.attempts).toBe(replacement?(providerRetry?4:3):2);
   expect(JSON.parse(pending.judgeJson!).reviewState).toBe('pending-board-review');
   const pendingReceipt=JSON.parse(pending.judgeJson!);
   expect(await heads.journeyHeadCompositionMatches(db,{gameId,hideId:op.hideId,receipt:pendingReceipt},readArt),'The paid candidate must reproduce exactly before any new question').toBe(true);
   expect(await allowedDualPublication(db,{gameId,sceneVersion:13,hideId:op.hideId,variantId:pending.id,attempts:pending.attempts,
    identityAssetId:pin.identityAssetId,identitySha256:pin.identitySha256,assetId:pending.assetId!,
    imageSha256:pendingReceipt.judgedSha256,geometrySha256:pendingReceipt.geometrySha256,judgeJson:pending.judgeJson})).toBe(false);
   let reviewed=await review(op.hideId);
   if(providerRetry&&op.hideId===jh.JOURNEY_WALL_REPLACEMENT_HIDE){
    const refused=JSON.parse(reviewed.judgeJson!),beforeCoat=await allRows();
    expect(reviewed.status).toBe('FAILED');
    expect(refused.verdict).toMatchObject({verdict:'fail',childComplete:'fail',pictureWhole:'fail',severeSeam:'fail'});
    expect(await heads.resumeJourneySunburstTailHead(container,gameId,jh.JOURNEY_SUNBURST_HEAD_HIDE_ID)).toBe(false);
    const priorLedger=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}});
    const rendersBefore=render.mock.calls.length,reviewsBefore=provider.creates.length;
    expect(await heads.restoreJourneyWallCoat(container,gameId,'other-owner',refused.judgedSha256,readArt)).toBe(false);
    expect(await heads.restoreJourneyWallCoat(container,gameId,owner,'d'.repeat(64),readArt)).toBe(false);
    expect(await heads.restoreJourneyWallCoat(container,gameId,owner,refused.judgedSha256,readArt)).toBe(true);
    const fixed=await rowOf(op.hideId),pendingCoat=JSON.parse(fixed.judgeJson!);
    expect(fixed).toMatchObject({status:'GENERATED',attempts:4,rectJson:reviewed.rectJson,hitRectJson:reviewed.hitRectJson,headAnchorJson:reviewed.headAnchorJson});
    expect(fixed.assetId).not.toBe(reviewed.assetId);
    expect(pendingCoat).toMatchObject({reviewState:'pending-board-review',verdict:null,journeyWallCoat:{previousCandidateSha256:refused.judgedSha256}});
    expect(pendingCoat.boardReview).toBeUndefined();expect(pendingCoat.qualityDisposition).toBeUndefined();
    expect(await heads.journeyHeadCompositionMatches(db,{gameId,hideId:op.hideId,receipt:pendingCoat},readArt)).toBe(true);
    expect(await heads.resumeJourneySunburstTailHead(container,gameId,jh.JOURNEY_SUNBURST_HEAD_HIDE_ID)).toBe(false);
    expect(await heads.restoreJourneyWallCoat(container,gameId,owner,refused.judgedSha256,readArt)).toBe(false);
    expect((await allRows()).filter(r=>r.id!==fixed.id)).toEqual(beforeCoat.filter(r=>r.id!==fixed.id));
    expect((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson).toBe(priorLedger.snapshotJson);
    expect(render).toHaveBeenCalledTimes(rendersBefore);expect(provider.creates).toHaveLength(reviewsBefore);
    const stored=await db.auditLog.findUniqueOrThrow({where:{id:pendingCoat.journeyWallCoat.auditId}});
    expect(JSON.parse(stored.metaJson!).previousRow.judgeJson).toBe(reviewed.judgeJson);
    reviewed=await review(op.hideId);
    expect(render).toHaveBeenCalledTimes(rendersBefore);expect(provider.creates).toHaveLength(reviewsBefore+1);
    checkpoint('retained-wall-coat-reviewed');
   }
   if(providerRetry&&op.hideId===jh.JOURNEY_SUNBURST_HEAD_HIDE_ID){
    const refused=JSON.parse(reviewed.judgeJson!);
    expect(reviewed.status).toBe('FAILED');
    expect(refused.verdict).toMatchObject({verdict:'fail',childComplete:'pass',pictureWhole:'fail',severeSeam:'fail'});
    const beforeChair=await allRows(),priorLedger=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}});
    const rendersBefore=render.mock.calls.length,reviewsBefore=provider.creates.length;
    expect(await heads.restoreJourneyParisChair(container,gameId,'wrong-owner',refused.judgedSha256,readArt)).toBe(false);
    expect(await heads.restoreJourneyParisChair(container,gameId,owner,'f'.repeat(64),readArt)).toBe(false);
    expect(await heads.restoreJourneyParisChair(container,gameId,owner,refused.judgedSha256,readArt)).toBe(true);
    const fixed=await rowOf(op.hideId),pending=JSON.parse(fixed.judgeJson!);
    expect(fixed).toMatchObject({status:'GENERATED',attempts:2,rectJson:reviewed.rectJson,hitRectJson:reviewed.hitRectJson,headAnchorJson:reviewed.headAnchorJson});
    expect(fixed.assetId).not.toBe(reviewed.assetId);
    expect(pending).toMatchObject({reviewState:'pending-board-review',verdict:null,journeyParisChair:{previousCandidateSha256:refused.judgedSha256}});
    expect(pending.boardReview).toBeUndefined();
    expect(await allowedDualPublication(db,{gameId,sceneVersion:13,hideId:op.hideId,variantId:fixed.id,attempts:fixed.attempts,
     identityAssetId:pin.identityAssetId,identitySha256:pin.identitySha256,assetId:fixed.assetId!,
     imageSha256:pending.judgedSha256,geometrySha256:pending.geometrySha256,judgeJson:fixed.judgeJson})).toBe(false);
    expect(await heads.journeyHeadCompositionMatches(db,{gameId,hideId:op.hideId,receipt:pending},readArt)).toBe(true);
    expect(await heads.restoreJourneyParisChair(container,gameId,owner,refused.judgedSha256,readArt)).toBe(false);
    expect((await allRows()).filter(r=>r.id!==fixed.id)).toEqual(beforeChair.filter(r=>r.id!==fixed.id));
    expect((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson).toBe(priorLedger.snapshotJson);
    expect(render).toHaveBeenCalledTimes(rendersBefore);expect(provider.creates).toHaveLength(reviewsBefore);
    const saved=await db.auditLog.findUniqueOrThrow({where:{id:pending.journeyParisChair.auditId}});
    expect(JSON.parse(saved.metaJson!).previousRow.judgeJson).toBe(reviewed.judgeJson);
    reviewed=await review(op.hideId);
    expect(render).toHaveBeenCalledTimes(rendersBefore);expect(provider.creates).toHaveLength(reviewsBefore+1);
    expect(provider.creates.at(-1)).toMatchObject({hideId:op.hideId,tier:'default'});
    checkpoint('retained-paris-chair-reviewed');
   }
   if(outcome==='age-refusal'){
    expect(op.hideId).toBe('amazon-detectives-hide-3');expect(reviewed.status).toBe('FAILED');
    expect(await allowedDualPublication(db,{...publicationBinding(gameId,reviewed),sceneVersion:13})).toBe(false);
    expect((await allRows()).filter(r=>r.id!==before.id)).toEqual(siblings);
    for(const next of plan.operations.slice(1)){
     const refused:string[]=[];expect(await heads.resumeJourneySunburstTailHead(container,gameId,next.hideId,r=>refused.push(r))).toBe(false);
     expect(refused).toEqual(['previous-head-awaits-ordinary-pass']);expect(await budget.readRequest(worldId,next.requestKey)).toBeNull();
     expect((await rowOf(next.hideId)).attempts).toBe(1);
    }
    const stopped=await budget.audit(worldId);expect(stopped.pendingRequestKeys).toEqual([]);expect(stopped.committedMicroUsd).toBeLessThanOrEqual(5_000_000);
    const stoppedLedger=JSON.parse((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson);
    for(const old of JSON.parse(beforeGrantLedger.snapshotJson).requests)expect(stoppedLedger.requests.find((r:{requestKey:string})=>r.requestKey===old.requestKey)).toEqual(old);
    expect(await budget.readRequest(worldId,unknownKey)).toEqual(unknown);
    expect(await db.game.findUniqueOrThrow({where:{id:gameId}})).toMatchObject({status:'TARGETS_GENERATING',configJson:null});
    expect(render).toHaveBeenCalledTimes(29);expect(provider.creates).toHaveLength(31);expect(forbidden).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
    return;
   }
   expect(reviewed.status,reviewed.lastError??'').toBe('GENERATED');
   expect(await allowedDualPublication(db,{...publicationBinding(gameId,reviewed),sceneVersion:13})).toBe(true);
   expect(await heads.journeyHeadCompositionMatches(db,{gameId,hideId:op.hideId,receipt:JSON.parse(reviewed.judgeJson!)},readArt)).toBe(true);
   expect((await allRows()).filter(r=>r.id!==before.id)).toEqual(siblings);
   expect(await heads.resumeJourneySunburstTailHead(container,gameId,op.hideId)).toBe(false);
   checkpoint('named-head-reviewed',{hideId:op.hideId});
  }
  const finalRows=await allRows();expect(finalRows).toHaveLength(27);expect(finalRows.every(r=>r.status==='GENERATED')).toBe(true);
  for(const row of finalRows)expect(await allowedDualPublication(db,{...publicationBinding(gameId,row),sceneVersion:13})).toBe(true);
  checkpoint('all27-publication-rechecked',{count:finalRows.length,renders:render.mock.calls.length,reviews:provider.creates.length});
  const finalLedger=JSON.parse((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson);
  for(const old of JSON.parse(beforeGrantLedger.snapshotJson).requests)expect(finalLedger.requests.find((r:{requestKey:string})=>r.requestKey===old.requestKey)).toEqual(old);
  expect(await budget.readRequest(worldId,unknownKey)).toEqual(unknown);
  expect(render).toHaveBeenCalledTimes(expectedRenders);expect(provider.creates).toHaveLength(expectedReviews);
  if(providerRetry){
   expect(wallTransportChecked).toBe(true);
   expect(provider.creates.filter(r=>r.hideId===jh.JOURNEY_WALL_REPLACEMENT_HIDE).map(r=>r.tier)).toEqual(['flex','flex','default','default']);
  }
  expect(boughtHeads.size).toBe(4);expect(await localPatchPainterRelease(db,gameId)).toBeNull();
  expect((await budget.audit(worldId)).committedMicroUsd).toBeLessThanOrEqual(5_000_000);
  // Reproduce the hosted retry: all boards reviewed, but the first assembly
  // invocation expired before committing READY. A live worker still owns its
  // lease, and an expired worker can be replaced without entering recovery.
  const finalJobId='job_'+gameId;
  if(providerRetry){
   await db.gameScene.updateMany({where:{gameId},data:{generationStatus:'GENERATED'}});
   await db.generationJob.update({where:{id:finalJobId},data:{status:'RUNNING',currentStep:'local-patch',updatedAt:new Date()}});
   const explicit=()=>({hardDeadlineAt:Date.now()+540_000,workMode:REVIEW_EXISTING_WORK_MODE,publicationOwnerId:owner,diagnose:forbidden});
   const busy=await runLocalPatchWorldSlice(container,deps,gameId,explicit());
   expect(busy).toMatchObject({claimed:false,pending:true,attention:null});
   await vi.advanceTimersByTimeAsync(LOCAL_PATCH_LEASE_MS+1);
   const stranger=await runLocalPatchWorldSlice(container,deps,gameId,{...explicit(),publicationOwnerId:'wrong-owner'});
   expect(stranger).toMatchObject({claimed:false,pending:false,attention:expect.stringContaining('owner')});
   // A stored acceptable flag alone cannot publish if its paid receipt changed.
   const changed=finalRows[0]!,original=JSON.parse(changed.judgeJson!);
   await db.targetVariantAsset.update({where:{id:changed.id},data:{judgeJson:JSON.stringify({...original,judgedSha256:'e'.repeat(64)})}});
   try{
    const blocked=await runLocalPatchWorldSlice(container,deps,gameId,explicit());
    expect(blocked).toMatchObject({claimed:true,pending:false,attention:expect.stringContaining('has no publication policy')});
    expect(await db.game.findUniqueOrThrow({where:{id:gameId}})).toMatchObject({status:'TARGETS_GENERATING',configJson:null});
   }finally{
    await db.targetVariantAsset.update({where:{id:changed.id},data:{judgeJson:changed.judgeJson,updatedAt:changed.updatedAt}});
    await db.generationJob.update({where:{id:finalJobId},data:{status:'QUEUED',currentStep:'local-patch',lastError:null}});
   }
  }
  // Finish through the real world assembler; it cannot buy any further picture.
  let result={pending:true,attention:null as string|null};
  const assemblyProgress=async()=>{
   const [game,scenes]=await Promise.all([
    db.game.findUniqueOrThrow({where:{id:gameId},select:{status:true,configJson:true}}),
    db.gameScene.findMany({where:{gameId},orderBy:{orderIndex:'asc'},select:{generationStatus:true,configJson:true}}),
   ]);
   return {status:game.status,configured:game.configJson!==null,
    concludedBoards:scenes.filter(s=>s.generationStatus==='GENERATED'||s.generationStatus==='QA_OK').length,
    configuredBoards:scenes.filter(s=>s.configJson!==null).length,
    boardStates:scenes.map(s=>s.generationStatus),renders:render.mock.calls.length,reviews:provider.creates.length};
  };
  const guardProgress=testProgressGuard(await assemblyProgress());
  checkpoint('assembly-start',await assemblyProgress());
  for(let turn=0;turn<30&&result.pending;turn++){
   const turnStartedAt=performance.now();
   const started=Date.now(), get=container.storage.get.bind(container.storage);
   const advanced=new Set<string>();
   const slowStorage=providerRetry?vi.spyOn(container.storage,'get').mockImplementation(async key=>{
    const result=await get(key);
    if(key.startsWith('game/')&&!advanced.has(key)){
     advanced.add(key);
     vi.setSystemTime(Date.now()+15_000);
    }
    return result;
   }):null;
   try{
    result=await runLocalPatchWorldSlice(container,deps,gameId,{hardDeadlineAt:started+(providerRetry?540_000:270_000),
     workMode:REVIEW_EXISTING_WORK_MODE,diagnose:forbidden,...(providerRetry?{publicationOwnerId:owner}:{})});
    if(providerRetry)expect(Date.now()-started).toBeGreaterThan(LOCAL_PATCH_LEASE_MS);
   }finally{slowStorage?.mockRestore();}
   const progress=await assemblyProgress();
   checkpoint('assembly-turn',{turn:turn+1,turnElapsedMs:Math.round(performance.now()-turnStartedAt),pending:result.pending,attention:result.attention,...progress});
   expect(result.attention).toBeNull();guardProgress(progress,result.pending);
   await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS+1);
  }
  expect(result.pending).toBe(false);
  const game=await db.game.findUniqueOrThrow({where:{id:gameId}});expect(['READY','DELIVERED']).toContain(game.status);
  expect(parseGameConfig(game.configJson!).scenes.flatMap(s=>s.targets)).toHaveLength(27);
  expect(render).toHaveBeenCalledTimes(expectedRenders);expect(provider.creates).toHaveLength(expectedReviews);expect(forbidden).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
  expect(await allRows()).toEqual(finalRows);
  expect(JSON.parse((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}})).snapshotJson)).toEqual(finalLedger);
  // Record the cap in the real publication path, not a synthetic aggregate alone.
  expect(hash(finalLedger.requests.find((r:{requestKey:string})=>r.requestKey===unknownKey))).toBe(hash(JSON.parse(beforeGrantLedger.snapshotJson).requests.find((r:{requestKey:string})=>r.requestKey===unknownKey)));
 }finally{vi.useRealTimers();}
},1_500_000);

it.each([false,true])('P2-D: a Sunburst world with 700k left preserves review coverage and bounded progress; permanent blocked review=%s',async(blockReview)=>{
 vi.useFakeTimers({toFake:['Date']});
 try{
  const gameId='sunburst-capacity-700k-synthetic-'+Number(blockReview);await newDetectiveWorld(gameId,7,true,false,false,false,true);
  expect(await localPatchPainterRelease(db,gameId)).toBe(LOCAL_PATCH_SUNBURST_PAINTER);
  const worldId=boardWizardWorldId(gameId),budget=boardWizardBudgetOf(c);
  const fill=3_300_000-(await budget.audit(worldId)).committedMicroUsd;
  await budget.reserve(worldId,{requestKey:'synthetic-700k-prior-costs',scope:'image',operationFingerprint:'8'.repeat(64),reserveMicroUsd:fill});
  await budget.settle(worldId,'synthetic-700k-prior-costs',bill('synthetic-700k-prior-costs-'+gameId,fill));
  expect(await budget.audit(worldId)).toMatchObject({capMicroUsd:4_000_000,remainingMicroUsd:700_000});
  const provider=controlledSol(false,false),forbidden=vi.fn(async()=>{throw Error('No synchronous or paid diagnostic request');});
  const container={...c,backgroundReview:provider.fake,visualReview:{request:forbidden}} as Container;
  const owedReviews=async()=>(await db.targetVariantAsset.findMany({where:{variant:'A',assetId:{not:null},targetInstance:{gameScene:{gameId}}}}))
   .filter(r=>JSON.parse(r.judgeJson??'{}').reviewState!=='board-review-complete').length;
  const dispatched:{key:string;remaining:number;owed:number}[]=[];
  const render=vi.fn<LocalPatchHideDeps['render']>(async input=>{
   expect(input.subjectQuality).toBe('high');
   // At dispatch this painting's 150k reserve is already counted. Its OWN review and
   // every earlier painting still awaiting its ordinary review must remain covered.
   const audit=await budget.audit(worldId),owed=await owedReviews();dispatched.push({key:input.requestKey,remaining:audit.remainingMicroUsd,owed});
   expect(audit.remainingMicroUsd,JSON.stringify(dispatched)).toBeGreaterThanOrEqual(250_000*(owed+1));
   const pixels=await sharp(input.stylePng).ensureAlpha().raw().toBuffer();
   return paintedOk(await sharp(pixels,{raw:{width:512,height:768,channels:4}}).png().toBuffer(),bill('synthetic-700k-'+input.requestKey,50000));
  });
  const deps:LocalPatchHideDeps={readBoardArt:readArt,renderPolicySha256:localPatchRenderPolicySha256(LOCAL_PATCH_SUNBURST_IMAGE_POLICY),render,judge:forbidden,fence:async()=>{}};
  const blockedReview=blockReview?vi.spyOn(await import('../local-patch-board-review'),'reviewLocalPatchBoard')
   .mockResolvedValue({state:'blocked',reason:'Synthetic permanently unverifiable current review',replayed:false,costCents:0}):null;
  for(let slice=0;slice<6&&dispatched.length<3;slice++){
   await runLocalPatchWorldSlice(container,deps,gameId,{hardDeadlineAt:Date.now()+270000,diagnose:forbidden});
   await advanceContinuityInBackground(container,gameId,{deadlineAt:Date.now()+270000});await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS+1);
  }
  // A parked job after the first two paintings is not success: the partial
  // board's reviews must clear the debt and admit the third within six slices.
  if(blockReview){
   expect(dispatched).toHaveLength(2);expect(blockedReview).toHaveBeenCalledTimes(1);
   expect(await db.generationJob.findUniqueOrThrow({where:{id:'job_'+gameId}})).toMatchObject({status:'FAILED',currentStep:'local-patch:recovery-exhausted'});
  }else expect(dispatched.length,JSON.stringify(dispatched)).toBeGreaterThanOrEqual(3);
  const after=await budget.audit(worldId);expect(after.committedMicroUsd).toBeLessThanOrEqual(4_000_000);expect(after.overCapMicroUsd).toBe(0);
  expect(forbidden).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
 }finally{vi.useRealTimers();}
},600_000);

it('retained neighbor alternate v1 preserves the real rejected answer, changes paid source once, and requires a fresh ordinary pass',async()=>{
 vi.useFakeTimers({toFake:['Date']});
 try{
  const f=await legacyKingdomHeadFixture('retained-neighbor-alternate-synthetic','redraw-with-new-placement',false,true,true,0,1);
  const payment=await db.order.findUniqueOrThrow({where:{id:'order-'+f.gameId}});
  await db.game.update({where:{id:f.gameId},data:{paidAt:payment.paidAt}});
  await db.targetVariantAsset.update({where:{id:f.candidate.id},data:{status:'FAILED'}});
  expect((await runLocalPatchHide(c,f.deps,{gameId:f.gameId,board:f.board,hide:f.hide,finalRepair:true})).state).toBe('generated');
  const row=()=>db.targetVariantAsset.findUniqueOrThrow({where:{id:f.candidate.id}});
  await db.targetVariantAsset.update({where:{id:f.candidate.id},data:{status:'FAILED'}});
  const placement=await resolveLocalPatchBoardsForGame(db,f.gameId,13);
  for(const board of placement.boards)for(const hide of board.hides){if(hide.id===f.hide.id)continue;
   const scene=await db.gameScene.findFirstOrThrow({where:{gameId:f.gameId,sceneSlug:board.board}}),target=sceneBySlug(board.board,13).targets.find(t=>t.id===hide.targetId)!;
   const instance=await db.targetInstance.create({data:{id:'alt-tgt-'+f.gameId+'-'+hide.id,gameSceneId:scene.id,targetId:target.id,targetType:target.targetType,spriteKind:'image',slotAId:target.slots[0].id,slotBId:target.slots[1].id}});
   await db.targetVariantAsset.create({data:{id:'alt-tva-'+f.gameId+'-'+hide.id,targetInstanceId:instance.id,variant:'A',slotId:target.slots[0].id,status:'PENDING',provider:'local-patch',attempts:0}});
  }
  const provider=controlledSol(false,false,undefined,true),retrieve=provider.fake.retrieve.bind(provider.fake);let acceptAlternate=false;
  provider.fake.retrieve=async id=>{const response=await retrieve(id);if(response.status!=='completed')return response;
   const value=JSON.parse(response.reading.raw!);value.head.rawHead=value.head.shippingHead={left:154,top:184,width:140,height:170};
   if(!acceptAlternate){const assessment=value.assessment.version===SOURCE_NEIGHBOR_BUNDLE_VERSION?value.assessment.assessment:value.assessment;
    const verdict=assessment.quality.hides.find((h:{hideId:string})=>h.hideId===f.hide.id).verdict;
    Object.assign(verdict,{verdict:'fail',pictureWhole:'fail',neighborsIntact:'fail',faults:[
     {check:'pictureWhole',where:'Synthetic paid third image retains a separate lower body without its head.'},
     {check:'neighborsIntact',where:'Synthetic third image lost a source neighbor head.'}]});
   }
   return{...response,reading:{...response.reading,raw:JSON.stringify(value)}};
  };
  const container={...c,backgroundReview:provider.fake,visualReview:{request:async()=>{throw Error('No extra synchronous opinion');}}} as Container;
  const source3=f.hide.id+':'+f.hide.pose+':render:3';
  expect(await restoreRetainedWindow(container,f.gameId,f.hide.id,readArt,undefined,source3)).toBe(true);
  expect(await restoreRetainedWindowNeighborAlternate(container,f.gameId,f.hide.id,readArt)).toBe(false);
  async function review(){for(let i=0;i<8;i++){
   await reviewLocalPatchBoard(container,{gameId:f.gameId,sceneId:f.scene.id,deadlineAt:Date.now()+270000},{fence:async()=>{},readBoardArt:readArt},{onlyHideId:f.hide.id});
   await advanceContinuityInBackground(container,f.gameId,{deadlineAt:Date.now()+270000});await vi.advanceTimersByTimeAsync(LEAN_RECOVERY_BACKOFF_MS+1);
   if(JSON.parse((await row()).judgeJson!).reviewState==='board-review-complete')return;
  }}
  await review();const failed=await row(),first=JSON.parse(failed.judgeJson!);
  expect(first.qualityDisposition).toMatchObject({state:'retry',faults:['pictureWhole','neighborsIntact']});expect(failed.status).toBe('FAILED');
  const ledger=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId:boardWizardWorldId(f.gameId)}}),renderCalls=f.render.mock.calls.length;
  const siblings=await db.targetVariantAsset.findMany({where:{id:{not:failed.id},targetInstance:{gameScene:{gameId:f.gameId}}},orderBy:{id:'asc'}});
  const firstAudits=await db.auditLog.findMany({where:{entityId:f.gameId,action:{in:[RETAINED_WINDOW_ACTION,RETAINED_WINDOW_ACTION+':once']}},orderBy:{id:'asc'}});
  expect(await restoreRetainedWindow(container,f.gameId,f.hide.id,readArt)).toBe(false);
  expect(await restoreRetainedWindowNeighborAlternate(container,f.gameId,'another-hide',readArt)).toBe(false);
  const reasons:string[]=[];expect(await restoreRetainedWindowNeighborAlternate(container,f.gameId,f.hide.id,readArt,r=>reasons.push(r)),reasons.join(',')).toBe(true);
  const next=await row(),nextJ=JSON.parse(next.judgeJson!);
  expect(nextJ.retainedWindow.sourceRequestKey).toBe(f.hide.id+':'+f.hide.pose+':render:1');expect(nextJ.judgedSha256).not.toBe(first.judgedSha256);
  expect(next.attempts).toBe(failed.attempts);expect(next.costCents).toBe(failed.costCents);expect(nextJ.reviewState).toBe('pending-board-review');expect(nextJ.boardReview).toBeUndefined();
  expect((await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId:ledger.worldId}})).snapshotJson).toBe(ledger.snapshotJson);
  for(const old of firstAudits)expect(await db.auditLog.findUniqueOrThrow({where:{id:old.id}})).toEqual(old);
  expect(await db.targetVariantAsset.findMany({where:{id:{not:failed.id},targetInstance:{gameScene:{gameId:f.gameId}}},orderBy:{id:'asc'}})).toEqual(siblings);
  expect(await retainedWindowEvidenceMatches(db,{gameId:f.gameId,sceneVersion:13,hideId:f.hide.id,variantId:next.id,assetId:next.assetId!,judgeJson:next.judgeJson},readArt)).toBe(true);
  expect(await allowedDualPublication(db,{gameId:f.gameId,sceneVersion:13,hideId:f.hide.id,variantId:next.id,attempts:next.attempts,
   identityAssetId:'ast-sheet-'+f.gameId,identitySha256:f.identitySha256,assetId:next.assetId!,imageSha256:nextJ.judgedSha256,
   geometrySha256:localPatchPublicationGeometryHash(next),judgeJson:next.judgeJson})).toBe(false);
  acceptAlternate=true;await review();const approved=await row();expect(approved.status,approved.lastError??'').toBe('GENERATED');
  expect(provider.creates).toHaveLength(2);expect(f.render).toHaveBeenCalledTimes(renderCalls);
  expect(await allowedDualPublication(db,{...publicationBinding(f.gameId,approved),sceneVersion:13})).toBe(true);
  expect(await restoreRetainedWindowNeighborAlternate(container,f.gameId,f.hide.id,readArt)).toBe(false);
  const game=await db.game.findUniqueOrThrow({where:{id:f.gameId}});expect(await deleteLocalPatchGame(container,f.gameId,{type:'USER',id:game.ownerId!},game.ownerId!)).toBe(true);
  const privateRecords=await db.auditLog.findMany({where:{entityId:f.gameId,action:{in:[RETAINED_WINDOW_ACTION,RETAINED_WINDOW_ACTION+':once',RETAINED_WINDOW_ACTION+':alternate-once']}}});
  expect(privateRecords.length).toBe(4);expect(privateRecords.every(r=>r.metaJson===null)).toBe(true);expect(fetch).not.toHaveBeenCalled();
 }finally{vi.useRealTimers();}
},300_000);
