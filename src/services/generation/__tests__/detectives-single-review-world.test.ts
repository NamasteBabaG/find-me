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
import { guidedFrameGeometry, guidedFrameCandidate, GUIDED_FRAME_RECOVERY_VERSION } from "../../../domain/generation/guided-frame-recovery";
import { cropOf } from "../../../domain/scene/local-patch-hides";
import { runLocalPatchHide } from "../local-patch-hide";
import { reviewLocalPatchBoard } from "../local-patch-board-review";
import { advanceContinuityInBackground } from "../continuity-background";
import { SINGLE_VISUAL_REVIEW_VERSION } from "../../../domain/generation/single-visual-review";
import { enrollLeanWorld } from "../lean-enrollment";
import { planDetectivesCompletionBudget, authorizeDetectivesCompletionBudget, resumeDetectivesCompletionBudget, planDetectivesCompletionExtension, authorizeDetectivesCompletionExtension, resumeDetectivesCompletionExtension, resumeDetectivesLowEngineRecovery } from "../detectives-completion-budget";
import { detectivesExtensionId } from "../../../domain/generation/detectives-completion-budget";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
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
import { subjectPlanOfHide, subjectUpgradeOf, SYSTEM_ENROLLMENT_OPERATOR } from "../subject-enrollment";
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
afterAll(async () => {
  sourceBytes.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(directory) === realpathSync(tmpdir()) && path.basename(directory).startsWith("findme-detective-world-")) rmSync(directory, { recursive: true });
});

async function newDetectiveWorld(gameId: string, ageYears=8, born=false) {
  const seeded = await seedApprovedGame(c, db, { gameId, approved: false, styleVersion: "local-patch-world-v1", status: "DRAFT", withJob: false,
    scenes: DETECTIVE_PATCH_BOARDS.map(board => ({ slug: board.board, version: 13 })) });
  await db.game.update({ where: { id: gameId }, data: { searchLevel: "detectives" } });
  await db.childProfile.update({where:{id:"chl-"+gameId},data:{ageYears}});
  fixture.testers.push(seeded.email); c.adminEmails!.push(seeded.email);
  if(born)await db.childProfile.update({where:{id:"chl-"+gameId},data:{originalPhotoAssetId:null}});
  await db.$transaction(async tx => {
    await pinVisualReviewRelease(tx, gameId, DUAL_VISUAL_REVIEW_V3);
    await pinLeanRelease(tx, gameId, LOCAL_PATCH_LEAN_RELEASE);
    await pinIdentitySourceRelease(tx, gameId);
    await pinLocalPatchSourceFamily(tx, gameId, { sceneVersion: 13, searchLevel: "detectives" });
    if(born)await pinDetectivesOperationalPolicy(tx,gameId,DETECTIVES_OPERATIONAL_RELEASE,c.storage.id);
  });
  if(born)await db.childProfile.update({where:{id:"chl-"+gameId},data:{originalPhotoAssetId:"ast-photo-"+gameId}});
  await db.game.update({ where: { id: gameId }, data: { status: "TARGETS_GENERATING" } });
  await db.generationJob.create({ data: { id: "job_" + gameId, gameId, status: "QUEUED" } });
  await db.order.create({ data: { id: "order-" + gameId, gameId, userId: seeded.userId, provider: "mock", packageTier: "ONE_WORLD", amountAgorot: 3900, paymentStatus: "PAID", paidAt: new Date() } });
  const avatar = await sharp(seeded.sheet).resize(256, 256).png().toBuffer(), avatarId = "avatar-" + gameId;
  await c.storage.put("game/" + avatarId + ".png", avatar, "image/png");
  await db.asset.create({ data: { id: avatarId, ownerId: seeded.userId, type: "AVATAR", visibility: "GAME", status: "READY", storagePath: "game/" + avatarId + ".png", mimeType: "image/png", bytes: avatar.length, width: 256, height: 256, provider: "openai" } });
  await db.childProfile.update({ where: { id: "chl-" + gameId }, data: { avatarAssetId: avatarId } });
  await c.storage.put("private/photo-" + gameId + ".jpg", seeded.sheet, "image/png");
  const atlas = await buildBoardWizardIdentityStyle(undefined, "board-matched-identity/v6", "journey", undefined, { sceneVersion: 13 });
  const checks = { identity: "pass", age: "pass", paintedStyle: "pass", sheetLayout: "pass", sourceFaceVisible: "pass", facialVolume: "pass", viewConsistency: "pass" };
  const identity = await reviewBoardWizardIdentity({ db, apiKey: "synthetic-never-live", budget: boardWizardBudgetOf(c), beforeDispatch: async () => {}, write: work => db.$transaction(work),
    reviewer: { review: async () => ({ httpOk: true, requestId: "req_identity_" + gameId, body: { model: "gpt-6.1-sol", usage: { prompt_tokens: 1500, completion_tokens: 150 },
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ checks, reason: "Controlled contract response only" }) } }] } }) } },
    { gameId, identityAssetId: "ast-sheet-" + gameId, sheet: seeded.sheet, photo: seeded.sheet, atlas: atlas.png, contentVersion: 13,
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
function cleanQuality(prompt: string): string {
  const hideId = boundHide(prompt).hideId, plan = subjectPlanOfHide(hideId, 13);
  if (!plan) throw Error("No real Detective plan for " + hideId);
  const index = DETECTIVE_PATCH_BOARDS.flatMap(board => board.hides).findIndex(hide => hide.id === hideId);
  const assessment = { version: SUBJECT_QUALITY_BUNDLE_VERSION, quality: { hides: [{ hideId, evidenceIds: localPatchHideEvidenceIds(hideId), verdict: GOOD_V12_VERDICT }] },
    subject: { hideId, subjectPolicy: SUBJECT_POLICY_V2, checks: { photoLikeness: observed("pass"), canonicalAgreement: observed("pass"), faceVisible: observed("pass"),
      perceivedAge: { ...observed("pass"), estimatedMinYears: 7, estimatedMaxYears: 9 }, requiredWardrobe: observed(plan.warmHat ? "pass" : "not-required") },
    appearance: { head: heads[index % heads.length], expression: expressions[index % expressions.length], engagement: index % 2 ? "acting" : "watching", portraitCopy: false }, faults: [] } };
  if (!prompt.includes(SOURCE_NEIGHBOR_BUNDLE_VERSION)) throw Error("Every Detective quality role must include its actual source contract");
  const line = prompt.split("\n").find(text => text.startsWith("AUTHORITATIVE SOURCE NEIGHBORS: "))!;
  const { contract } = JSON.parse(line.slice("AUTHORITATIVE SOURCE NEIGHBORS: ".length)) as { contract: SourceNeighborContract };
  const binding = JSON.parse(/Wrapper binding metadata \(do not add policy\/reader fields to the answer\): (\{[^\n]+\})\./.exec(prompt)![1]!) as SourceNeighborQualityBundleBinding;
  return JSON.stringify({ version: SOURCE_NEIGHBOR_BUNDLE_VERSION, assessment, sourceNeighbors: { version: SOURCE_NEIGHBOR_ANSWER_VERSION, contractSha256: binding.contractSha256, candidateSha256: binding.candidateSha256,
    neighbors: contract.neighbors.map((neighbor, i) => ({ sourceId: neighbor.sourceId, outcome: "preserved", status: "pass", after: [{ ref: "controlled-neighbor-" + i, rect: neighbor.head }],
      remnants: "none", occluder: null, observation: "One coherent synthetic source correspondence without shifted or remaining representation." })) } });
}
function controlledSol(interrupted = false, guided = false, guidedHideId?: string | string[], bodyMode=false, representativeUsage=false) {
  let failedResponse: string | null = null;
  const creates: { hideId: string; quality: boolean; prompt: string; tier: unknown }[] = [], responses = new Map<string, { prompt: string; quality: boolean; tier: unknown; reads: number }>();
  const fake: BackgroundReviewTransport = { namespace: "openai:find-me-existing", create: async body => {
    expect(body.model).toBe("gpt-6.1-sol"); expect(["flex", "default"]).toContain(body.service_tier);
    expect(body.reasoning).toMatchObject({ effort: "low" });
    const prompt = (body.input as { content: { text?: string }[] }[])[0]!.content[0]!.text!, quality = prompt.includes(SUBJECT_QUALITY_BUNDLE_VERSION);
    const hideId = boundHide(prompt).hideId; expect(subjectPlanOfHide(hideId, 13)).not.toBeNull();
    creates.push({ hideId, quality, prompt, tier: body.service_tier });
    const responseId = "resp_detective_" + creates.length; if (interrupted && creates.length === 1) failedResponse = responseId; responses.set(responseId, { prompt, quality, tier: body.service_tier, reads: 0 }); return { responseId };
  }, retrieve: async (responseId): Promise<BackgroundReviewState> => {
    const state = responses.get(responseId); if (!state) return { status: "missing" };
    if (++state.reads === 1) return { status: "in_progress" };
    if (responseId === failedResponse) return { status: "failed", reading: { responseId, raw: null, usage: null, model: "gpt-6.1-sol", finishReason: "failed", serviceTier: "flex", providerError: { code: "server_error", message: "Synthetic failed response without text or usage" } } };
    const assessment = JSON.parse(cleanQuality(state.prompt));
    if(bodyMode){assessment.assessment.subject.checks.perceivedAge.estimatedMinYears=6;assessment.assessment.subject.checks.perceivedAge.estimatedMaxYears=8;}
    const hide = boundHide(state.prompt).hideId;
    if (guided && (Array.isArray(guidedHideId)?guidedHideId.includes(hide):hide === (guidedHideId ?? DETECTIVE_PATCH_BOARDS[0]!.hides[0]!.id)) && (creates.filter(one => one.hideId === hide).length < 3 || bodyMode&&hide==="paris-detectives-hide-1"&&creates.filter(one=>one.hideId===hide).length===3)) {
      const verdict = assessment.assessment.quality.hides[0].verdict;
      Object.assign(verdict, { verdict: "fail", childComplete: "fail", pictureWhole: "fail", neighborsIntact:"fail", severeSeam: "fail", reason: "Synthetic crown crosses the immutable top return", faults: [{ check: "childComplete", where: "Synthetic complete crown terminates at the top return boundary" }] });
      verdict.boundaryIntegrity = Object.fromEntries(["left","top","right","bottom"].map(edge => [edge, { status: edge === "top" ? "fail" : "pass", observation: edge === "top" ? "Synthetic crown is cut at the top boundary" : "Synthetic continuous edge" }]));
    }
    if(bodyMode&&hide==='paris-detectives-hide-1'&&creates.filter(one=>one.hideId===hide).length===3){const verdict=assessment.assessment.quality.hides[0].verdict;verdict.childComplete='pass';verdict.pictureWhole='fail';verdict.severeSeam='fail';const orphan=assessment.sourceNeighbors.neighbors.find((n:{sourceId:string})=>n.sourceId==='source-petanque-child');Object.assign(orphan,{outcome:'fragmented',status:'fail',remnants:'present',after:[{ref:'synthetic-old-blue-jacket',rect:{left:810,top:995,width:25,height:105}}],observation:'Synthetic original blue-jacket remnant persists outside the original return window.'});}
    return { status: "completed", reading: { responseId, raw: JSON.stringify({ version: SINGLE_VISUAL_REVIEW_VERSION, assessment,
        continuity: JSON.parse(longAnswer(boundHide(state.prompt).hideId, 400, 400, 160)), doubt: false, doubtReason: null }),
      usage: representativeUsage ? { input_tokens: 21000, output_tokens: 2500 } : { input_tokens: 2000, output_tokens: 500 }, model: "gpt-6.1-sol", finishReason: "stop", serviceTier: String(state.tier) } };
  }, cancel: async () => {} };
  return { fake, creates };
}

it.each([{mode:"clean",interrupted:false,guided:false},{mode:"transport",interrupted:true,guided:false},{mode:"guided",interrupted:false,guided:true},{mode:"tail",interrupted:false,guided:true},{mode:"body",interrupted:false,guided:true}].map(v=>({...v,born:false})).concat([{mode:"born-clean",interrupted:false,guided:false,born:true},{mode:"born-guided",interrupted:false,guided:true,born:true},{mode:"born-transport",interrupted:true,guided:false,born:true}]))("completes27 hides with bounded LOW review and no extra planner; mode=$mode", async ({mode,interrupted,guided,born}) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const body=mode==="body";const gameId = "detective-single-world-synthetic-" + mode; await newDetectiveWorld(gameId,body||born?7:8,born);
  const context = await resolveLocalPatchBoardsForGame(db, gameId, 13), hides = context.boards.flatMap(board => board.hides);
  expect(context.boards).toHaveLength(9); expect(hides).toHaveLength(27);
  expect(hides.every(hide => sourcePlacementForHide(context, hide.id)!.sourceNeighbors)).toBe(true);
  const tail = mode === "tail"||body, guidedHideId = tail ? context.boards.find(b=>b.board==="paris")!.hides[0]!.id : hides[0]!.id;
  const prompts = new Map<string, string>(), provider = controlledSol(interrupted, guided, body?[guidedHideId,"giza-detectives-hide-2"]:guidedHideId,body||born,born);
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
      const mask = placementGuidePng ? guidedFrameGeometry(maskForHide(hide), hide.returnRect!).target : maskForHide(hide), figure = await sharp({ create: { width: Math.round(mask.width * 0.6), height: Math.round(mask.height * 0.8), channels: 4, background: requestKey.endsWith(":render:2") ? "#304f91" : "#1e3ca0" } }).png().toBuffer();
      let png = await sharp(stylePng).composite([{ input: figure, left: mask.left + Math.round(mask.width * 0.2), top: mask.top + Math.round(mask.height * 0.2) }]).png().toBuffer();
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
    expect(proof.single).toBe(SINGLE_VISUAL_REVIEW_VERSION);
    expect(proof.continuity!.requestKey).toBe(proof.quality.requestKey);
    expect(receipt.boardReview.effort).toBe("low");
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
  for (const corrupt of ['no-single-marker', 'wrong-effort', 'split-receipt', 'changed-raw', 'false-doubt']) {
    const changed = structuredClone(original);
    if (corrupt === 'no-single-marker') delete changed.boardReview.dual.single;
    if (corrupt === 'wrong-effort') changed.boardReview.effort = 'high';
    if (corrupt === 'split-receipt') changed.boardReview.dual.continuity.requestKey += 'foreign';
    if (corrupt === 'changed-raw') changed.boardReview.dual.quality.raw += 'changed';
    if (corrupt === 'false-doubt') { const raw = JSON.parse(changed.boardReview.dual.quality.raw); raw.doubt = true; raw.doubtReason = 'Synthetic located uncertainty at the left join'; changed.boardReview.dual.quality.raw = JSON.stringify(raw); }
    expect(await allowedDualPublication(db, { ...binding, judgeJson: JSON.stringify(changed) })).toBe(false);
  }
  const authority = await db.auditLog.findUniqueOrThrow({ where: { id: born?detectivesOperationalId(gameId):detectivesExtensionId(gameId) } });
  await db.auditLog.delete({ where: { id: authority.id } });
  expect(await allowedDualPublication(db, binding)).toBe(false);
  await db.auditLog.create({ data: authority });
  expect(await allowedDualPublication(db, binding)).toBe(true);
  const oversized = config.scenes.find(scene => scene.slug === "paris")!.targets.find(target => target.id === "hide-2")!.sprite;
  expect(oversized.kind).toBe("image");
  if (oversized.kind === "image") { expect(oversized.rect!.h * 2160).toBe(768); expect(oversized.hitRect!.h * 2160).toBeGreaterThan(540 * 0.8); }
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
  if(born){expect(await db.auditLog.count({where:{entityType:"Game",entityId:gameId,actorType:"ADMIN"}})).toBe(0);expect(await detectivesOperationalPolicyOf(db,gameId)).toMatchObject({worldCapMicroUsd:4000000,model:"gpt-6.1-sol",effort:"low",automaticBudgetExtension:false});const bodyRows=rows.filter(r=>sourceBodyBirthMarker(r));expect(bodyRows).toHaveLength(2);for(const r of bodyRows){expect(r.attempts).toBe(1);expect(JSON.parse(r.judgeJson!).sourceBodyComposition.outsideChangedPixels).toBe(0);}}
  const child = await db.childProfile.findUniqueOrThrow({ where: { id: "chl-" + gameId } });
  const photo = await db.asset.findUniqueOrThrow({ where: { id: "ast-photo-" + gameId } });
  expect(child.originalPhotoAssetId).toBeNull(); expect(photo.status).toBe("DELETED"); expect(await db.fileBlob.findUnique({ where: { key: photo.storagePath } })).toBeNull();
  expect((await sourcePlacementReleaseOf(db, gameId))!.baseSceneVersion).toBe(13);
  expect(diagnose).not.toHaveBeenCalled(); expect(synchronous).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
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
