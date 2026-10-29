import { KINGDOM_DETECTIVE_PATCH_BOARDS } from "../../../../content/detectives/kingdom/runtime-release";
import { pinDetectiveSourceScope, sealDetectiveSourceFamily } from "../source-family-scope";
import { planWholeSourceContextRepair, stageWholeSourceContextRepair, nextWholeSourceContextWake, resumeWholeSourceContextRepair } from "../whole-source-context-repair";
import { readWholeSourceContextPin, wholeSourceContextPinId, wholeSourceContextWakeId, wholeSourceContextRowHash, wholeSourceContextMarkerFor, fenceWholeSourceContextPurchase } from "../whole-source-context-pin";
import { wholeSourceContextMarker } from "../../../domain/generation/whole-source-context-purchase";
import { WHOLE_SOURCE_CONTEXT_VERSION } from "../../../domain/scene/whole-source-context";
import { readSettledTargetRaw } from "../single-review-head-evidence";
import { localPatchRestDecision } from "../../../domain/scene/local-patch-progress";
import { nextBoundEnvelopeReconciliation, resumeBoundEnvelopeReconciliation } from "../bound-envelope-reconciliation";
import { BOUND_SUBJECT_QUALITY_ENVELOPE_READER, BOUND_SUBJECT_QUALITY_ENVELOPE_READER_V2 } from "../../../domain/generation/bound-subject-quality-envelope";
import { PLACEMENT_GUIDE_VERSION } from "../../../domain/generation/placement-guide";
import { PENDING_IMAGE_LEASE_MS } from "../../../domain/generation/pending-image-lease";
import { ensureSingleMediumReviewPolicy } from "../single-medium-policy";
import { planQaCompletionCapacity,authorizeQaCompletionCapacity,readQaCompletionCapacity } from "../qa-completion-capacity";
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
import { reviewLocalPatchBoard } from "../local-patch-board-review";
import { advanceContinuityInBackground } from "../continuity-background";
import { SINGLE_VISUAL_REVIEW_VERSION, SINGLE_MEDIUM_VISUAL_REVIEW_VERSION } from "../../../domain/generation/single-visual-review";
import { targetHeadReturnDecision } from "../../../domain/generation/target-head-return";
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
import { DbStorage } from "../../../infra/storage/db";
import type { BackgroundReviewState, BackgroundReviewTransport } from "../../../infra/generation/types";
import { localPatchRenderPolicySha256, LOCAL_PATCH_IMAGE_POLICY } from "../../../infra/generation/openai-local-patch";
import { maskForHide } from "../../../domain/scene/local-patch-hides";
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
import { readQualityStage, readContinuityStage, subjectStageRaw, type DualReviewProof } from "../local-patch-dual-evidence";
import { pinLocalPatchSourceFamily, resolveLocalPatchBoardsForGame, sourcePlacementForHide, sourcePlacementReleaseOf } from "../source-placement-release";
import { pinIdentitySourceRelease } from "../identity-source-release";
import { allowedDualPublication } from "../local-patch-dual-publication";
import { hasLocalPatchPublicationPolicy } from "../local-patch-publication-policy";
import { LEAN_RECOVERY_BACKOFF_MS, runLocalPatchWorldSlice } from "../local-patch-world";
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
afterEach(()=>vi.restoreAllMocks());
afterAll(async () => {
  sourceBytes.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(directory) === realpathSync(tmpdir()) && path.basename(directory).startsWith("findme-detective-world-")) rmSync(directory, { recursive: true });
});

async function newDetectiveWorld(gameId: string, ageYears=8, born=false, explorer=false, kingdom=false) {
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
  if(kingdom) await db.childProfile.update({where:{id:profile.id},data:{identityAssetId:null,avatarAssetId:null}});
  await db.$transaction(async tx => {
    await pinVisualReviewRelease(tx, gameId, DUAL_VISUAL_REVIEW_V3);
    await pinLeanRelease(tx, gameId, LOCAL_PATCH_LEAN_RELEASE);
    await pinIdentitySourceRelease(tx, gameId);
    if(kingdom&&!explorer){
      await pinDetectiveSourceScope(tx,gameId,DETECTIVES_OPERATIONAL_RELEASE,c.storage.id);
      await tx.game.update({where:{id:gameId},data:{status:"PACKAGE_SELECTED"}});
      await tx.childProfile.update({where:{id:profile.id},data:{originalPhotoAssetId:"ast-photo-"+gameId}});
      await sealDetectiveSourceFamily(tx,gameId);
    } else await pinLocalPatchSourceFamily(tx, gameId, { sceneVersion: version, searchLevel: level });
    if(born && explorer) await pinExplorersOperationalPolicy(tx,gameId,EXPLORERS_OPERATIONAL_RELEASE,c.storage.id);
    else if(born && !kingdom)await pinDetectivesOperationalPolicy(tx,gameId,DETECTIVES_OPERATIONAL_RELEASE,c.storage.id);
  });
  if(kingdom) await db.childProfile.update({where:{id:profile.id},data:{identityAssetId:profile.identityAssetId,avatarAssetId:profile.avatarAssetId}});
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
function controlledSol(interrupted = false, guided = false, guidedHideId?: string | string[], bodyMode=false, representativeUsage=false, version=13) {
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
    if (guided && (Array.isArray(guidedHideId)?guidedHideId.includes(hide):hide === (guidedHideId ?? DETECTIVE_PATCH_BOARDS[0]!.hides[0]!.id)) && (creates.filter(one => one.hideId === hide).length < 3 || bodyMode&&hide==="paris-detectives-hide-1"&&creates.filter(one=>one.hideId===hide).length===3)) {
      const verdict = qualityAssessment.quality.hides[0].verdict;
      Object.assign(verdict, { verdict: "fail", childComplete: "fail", pictureWhole: "fail", neighborsIntact:"fail", severeSeam: "fail", reason: "Synthetic crown crosses the immutable top return", faults: [{ check: "childComplete", where: "Synthetic complete crown terminates at the top return boundary" }] });
      verdict.boundaryIntegrity = Object.fromEntries(["left","top","right","bottom"].map(edge => [edge, { status: edge === "top" ? "fail" : "pass", observation: edge === "top" ? "Synthetic crown is cut at the top boundary" : "Synthetic continuous edge" }]));
    }
    if(bodyMode&&hide==='paris-detectives-hide-1'&&creates.filter(one=>one.hideId===hide).length===3){const verdict=assessment.assessment.quality.hides[0].verdict;verdict.childComplete='pass';verdict.pictureWhole='fail';verdict.severeSeam='fail';const orphan=assessment.sourceNeighbors.neighbors.find((n:{sourceId:string})=>n.sourceId==='source-petanque-child');Object.assign(orphan,{outcome:'fragmented',status:'fail',remnants:'present',after:[{ref:'synthetic-old-blue-jacket',rect:{left:810,top:995,width:25,height:105}}],observation:'Synthetic original blue-jacket remnant persists outside the original return window.'});}
    return { status: "completed", reading: { responseId, raw: JSON.stringify({ version: state.prompt.includes('"version":"'+SINGLE_MEDIUM_VISUAL_REVIEW_VERSION+'"') ? SINGLE_MEDIUM_VISUAL_REVIEW_VERSION : SINGLE_VISUAL_REVIEW_VERSION, assessment,
        ...(state.prompt.includes('HEAD_RETURN_EVIDENCE: ') ? (()=>{const line=state.prompt.split('\n').find(s=>s.startsWith('HEAD_RETURN_EVIDENCE: '))!;const p=JSON.parse(line.slice('HEAD_RETURN_EVIDENCE: '.length)),r=p.returned;
          const head={left:r.left+14,top:r.top+14,width:Math.min(40,r.width-28),height:Math.min(50,r.height-28)};
          return{head:{version:'target-head-return/v1',rawHead:head,shippingHead:head,rawCrown:'pass',shippingCrown:'pass',observation:'Controlled native raw and shipping crown entirely inside the opaque returned frame.'}};})():{}),
        continuity: JSON.parse(longAnswer(boundHide(state.prompt).hideId, 400, 400, 160)), doubt: false, doubtReason: null }),
      usage: representativeUsage ? { input_tokens: 21000, output_tokens: 2500 } : { input_tokens: 2000, output_tokens: 500 }, model: "gpt-6.1-sol", finishReason: "stop", serviceTier: String(state.tier) } };
  }, cancel: async () => {} };
  return { fake, creates };
}

it.each([{mode:"clean",interrupted:false,guided:false},{mode:"transport",interrupted:true,guided:false},{mode:"guided",interrupted:false,guided:true},{mode:"tail",interrupted:false,guided:true},{mode:"body",interrupted:false,guided:true}].map(v=>({...v,born:false})).concat([{mode:"born-clean",interrupted:false,guided:false,born:true},{mode:"born-guided",interrupted:false,guided:true,born:true},{mode:"born-transport",interrupted:true,guided:false,born:true},{mode:"born-crown",interrupted:false,guided:false,born:true},{mode:"kingdom-clean",interrupted:false,guided:false,born:true},{mode:"kingdom-transport",interrupted:true,guided:false,born:true},{mode:"kingdom-guided",interrupted:false,guided:true,born:true}]).map(testCase => ({ ...testCase, reviewEffort: testCase.born && testCase.mode !== "born-crown" ? "MEDIUM" : "LOW" })))("completes 27 hides with bounded $reviewEffort review and no extra planner; mode=$mode", async ({mode,interrupted,guided,born}) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const kingdom=mode.startsWith("kingdom-"),crown=mode==="born-crown",body=mode==="body";const gameId = "detective-single-world-synthetic-" + mode; await newDetectiveWorld(gameId,body||born?7:8,born,false,kingdom);
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
  }, renderPolicySha256: localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY),
    judge: async () => { throw Error("Historical per-hide judge forbidden"); },
    render: async ({ requestKey, stylePng, prompt, subjectQuality, placementGuidePng, maskPng }) => {
      expect(subjectQuality).toBe("medium");
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
      return paintedOk(png, bill("paint-" + gameId + "-" + requestKey, born ? 66500 : undefined));
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
      expect(proof.quality.headEvidence).toMatchObject({
        version: "target-head-return/v1", gameId, hideId: receipt.hide,
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
  else if (oversized.kind === "image") expect(oversized.hitRect!.h * 2160).toBeGreaterThan(540 * 0.8);
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
    const budget=boardWizardBudgetOf(c),before=await budget.audit(worldId),fill=before.remainingMicroUsd-239199;
    expect(fill).toBeGreaterThan(0);await budget.reserve(worldId,{requestKey:"synthetic-crown-current-budget",scope:"image",operationFingerprint:"c".repeat(64),reserveMicroUsd:fill});await budget.settle(worldId,"synthetic-crown-current-budget",bill("synthetic-crown-budget-"+gameId,fill));
    const plan=await planPublishedCrownRepair(container,gameId);expect(plan.remainingMicroUsd).toBe(239199);const paintCount=prompts.size,reviewCount=provider.creates.length;
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
      if(approved.length===1&&!singleTailObserved){const rebuild=vi.spyOn(dualReviewModule,"prospectiveSingleVisualReviewQuestion").mockRejectedValue(Error("A lone remaining candidate must not be prepared twice before dispatch"));
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


it("pins whole-target and outside-source guides before new purchases, replays them after interruption and preserves pre-upgrade pending requests", async()=>{
  const gameId="kingdom-prospective-frame-synthetic";await newDetectiveWorld(gameId,7,true,false,true);
  const context=await resolveLocalPatchBoardsForGame(db,gameId,13),board=context.boards.find(b=>b.board==="icepalace")!;
  const [fresh,old,stale]=board.hides,claims=new Map<string,string>(),calls:string[]=[];
  const deps:LocalPatchHideDeps={readBoardArt:readArt,renderPolicySha256:localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY),
    judge:async()=>{throw Error("Synthetic framing test must never buy a synchronous review");},render:async input=>{
      calls.push(input.requestKey);const hide=board.hides.find(h=>input.requestKey.startsWith(h.id+":"))!;
      const pending=await db.targetVariantAsset.findFirstOrThrow({where:{targetInstance:{gameScene:{gameId},targetId:hide.targetId}}});
      expect(pending).toMatchObject({status:"PENDING",attempts:Number(input.requestKey.split(":").at(-1))});
      claims.set(input.requestKey,pending.judgeJson!);
      const guided=hide!==old||input.requestKey.endsWith(":render:2");
      expect(!!input.placementGuidePng).toBe(guided);
      if(guided){
        expect(input.placementGuideVersion).toBe(PLACEMENT_GUIDE_VERSION);
        expect(JSON.parse(pending.judgeJson!).placementGuide).toMatchObject({version:PLACEMENT_GUIDE_VERSION,hideId:hide.id,attempt:pending.attempts});
        const meta=await sharp(input.placementGuidePng!).metadata();expect([meta.width,meta.height]).toEqual([1024,768]);
        expect(input.prompt).toContain("RIGHT is scaled ORIGINAL SOURCE CONTEXT");
        expect(input.prompt).toContain("never erase its torso while its original head survives outside the crop");
      }
      const child=maskForHide(hide),returned=localPatchReturnRegion(cropOf(hide),child,hide.returnRect).local;
      const frame=guided?guidedFrameGeometry(child,returned).target:child;
      const figure=await sharp({create:{width:Math.round(frame.width*0.6),height:Math.round(frame.height*0.7),channels:4,background:"#385ca0"}}).png().toBuffer();
      return paintedOk(await sharp(input.stylePng).composite([{input:figure,left:frame.left+Math.round(frame.width*0.2),top:frame.top+Math.round(frame.height*0.2)}]).png().toBuffer(),bill("frame-"+input.requestKey));
    }};
  const first=await runLocalPatchHide(c,deps,{gameId,board,hide:fresh!});expect(first.state).toBe("generated");
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
  expect(calls).toHaveLength(4);expect((await boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId))).capMicroUsd).toBe(4000000);
  expect(fetch).not.toHaveBeenCalled();
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
  const pin=await authorizeQaCompletionCapacity(c,input);expect(pin.capMicroUsd).toBe(QA_COMPLETION_CAP);
  expect(await authorizeQaCompletionCapacity(c,input)).toEqual(pin);
  expect(await db.auditLog.count({where:{id:qaCompletionCapacityId(gameId)}})).toBe(1);
  expect(await db.generationJob.findUniqueOrThrow({where:{id:job.id}})).toMatchObject({status:"QUEUED",currentStep:"local-patch",attempts:job.attempts});
  expect(await db.targetVariantAsset.findMany({where:{targetInstance:{gameScene:{gameId}}},orderBy:{id:"asc"}})).toEqual(rows);
  const afterLedger=await db.worldBudgetLedger.findUniqueOrThrow({where:{worldId}});expect(afterLedger.snapshotJson).toBe(ledger.snapshotJson);expect(afterLedger.revision).toBe(ledger.revision+1);
  expect(await budget.audit(worldId)).toMatchObject({capMicroUsd:QA_COMPLETION_CAP,committedMicroUsd:3910000,reservedMicroUsd:210000,unknownRequestKeys:["synthetic-retained-unknown"]});
  expect(await readQaCompletionCapacity(c,worldId)).toMatchObject({worldId,capMicroUsd:QA_COMPLETION_CAP});
  await db.childProfile.update({where:{id:child.id},data:{ageYears:8}});expect(await readQaCompletionCapacity(c,worldId)).toBeNull();await db.childProfile.update({where:{id:child.id},data:{ageYears:child.ageYears}});
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
    expect(input.placementGuideVersion).toBe(PLACEMENT_GUIDE_VERSION);
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
        expect(placementGuideVersion).toBe(GUIDED_FRAME_RECOVERY_VERSION);
        expect(placementGuidePng).toBeDefined();
        const unchangedReturn = localPatchReturnRegion(cropOf(hide), frame, hide.returnRect).local;
        const geometry = guidedFrameGeometry(frame, unchangedReturn);
        expect(geometry.returned).toEqual(unchangedReturn);
        frame = geometry.target;
        const alpha = await sharp(maskPng).ensureAlpha().raw().toBuffer();
        let editable = 0;
        for (let i = 3; i < alpha.length; i += 4) if (alpha[i] === 0) editable++;
        expect(editable).toBe(unchangedReturn.width * unchangedReturn.height);
      } else expect(placementGuidePng).toBeUndefined();
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
          await db.targetVariantAsset.update({ where: { id: row.id }, data: { status: "PENDING", attempts: 3,
            judgeJson: JSON.stringify({ ...receipt, guidedFrameRecovery: newGuidedFrameMarker(row, grant!.authorizationSha256, 12) }) } });
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
