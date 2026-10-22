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
import { PrismaRetainedPurchaseStore } from "../../../infra/db/prisma-retained-purchase-store";
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
import { runLocalPatchWorldSlice } from "../local-patch-world";
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
  c = { db, storage: new DbStorage(db), appUrl: "http://localhost:3000", secret: "synthetic-detective-world", analytics: { track: vi.fn() }, adminEmails: [],
    email: { id: "console", send: async () => ({ id: "synthetic-mail" }) }, emailFallbackTo: null } as unknown as Container;
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("Real provider calls forbidden in Detective integration"); }));
}, 180_000);
afterAll(async () => {
  sourceBytes.clear(); vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(directory) === realpathSync(tmpdir()) && path.basename(directory).startsWith("findme-detective-world-")) rmSync(directory, { recursive: true });
});

async function newDetectiveWorld(gameId: string) {
  const seeded = await seedApprovedGame(c, db, { gameId, approved: false, styleVersion: "local-patch-world-v1", status: "DRAFT", withJob: false,
    scenes: DETECTIVE_PATCH_BOARDS.map(board => ({ slug: board.board, version: 13 })) });
  await db.game.update({ where: { id: gameId }, data: { searchLevel: "detectives" } });
  fixture.testers.push(seeded.email);
  await db.$transaction(async tx => {
    await pinVisualReviewRelease(tx, gameId, DUAL_VISUAL_REVIEW_V3);
    await pinLeanRelease(tx, gameId, LOCAL_PATCH_LEAN_RELEASE);
    await pinIdentitySourceRelease(tx, gameId);
    await pinLocalPatchSourceFamily(tx, gameId, { sceneVersion: 13, searchLevel: "detectives" });
  });
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
      provenance: { promptVersion: "character-v8-full-source-volume-identity", quality: "medium", photoAssetId: "ast-photo-" + gameId, photoSha256: sha256Bytes(seeded.sheet), ageYears: 8, crop: null,
        style: { version: "board-matched-identity/v6", catalogSha256: atlas.catalogSha256, atlasSha256: atlas.atlasSha256 } } });
  expect(identity.approved).toBe(true);
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
function controlledSol() {
  const creates: { hideId: string; quality: boolean; prompt: string; tier: unknown }[] = [], responses = new Map<string, { prompt: string; quality: boolean; tier: unknown; reads: number }>();
  const fake: BackgroundReviewTransport = { namespace: "openai:find-me-existing", create: async body => {
    expect(body.model).toBe("gpt-6.1-sol"); expect(body.service_tier).toBe("flex");
    const prompt = (body.input as { content: { text?: string }[] }[])[0]!.content[0]!.text!, quality = prompt.includes(SUBJECT_QUALITY_BUNDLE_VERSION);
    const hideId = boundHide(prompt).hideId; expect(subjectPlanOfHide(hideId, 13)).not.toBeNull();
    creates.push({ hideId, quality, prompt, tier: body.service_tier });
    const responseId = "resp_detective_" + creates.length; responses.set(responseId, { prompt, quality, tier: body.service_tier, reads: 0 }); return { responseId };
  }, retrieve: async (responseId): Promise<BackgroundReviewState> => {
    const state = responses.get(responseId); if (!state) return { status: "missing" };
    if (++state.reads === 1) return { status: "in_progress" };
    return { status: "completed", reading: { responseId, raw: state.quality ? cleanQuality(state.prompt) : longAnswer(boundHide(state.prompt).hideId, 400, 400, 160),
      usage: { input_tokens: 2000, output_tokens: 500 }, model: "gpt-6.1-sol", finishReason: "stop", serviceTier: String(state.tier) } };
  }, cancel: async () => {} };
  return { fake, creates };
}

it("completes the prospective Detective family through all27 actual runtime, paid-role publication and player contracts", async () => {
  const gameId = "detective-complete-world-synthetic"; await newDetectiveWorld(gameId);
  const context = await resolveLocalPatchBoardsForGame(db, gameId, 13), hides = context.boards.flatMap(board => board.hides);
  expect(context.boards).toHaveLength(9); expect(hides).toHaveLength(27);
  expect(hides.every(hide => sourcePlacementForHide(context, hide.id)!.sourceNeighbors)).toBe(true);
  const prompts = new Map<string, string>(), provider = controlledSol();
  const synchronous = vi.fn<NonNullable<Container["visualReview"]>["request"]>(async () => { throw Error("Historical single review forbidden"); });
  const container = { ...c, visualReview: { request: synchronous }, backgroundReview: provider.fake } as Container;
  const deps: LocalPatchHideDeps = { readBoardArt: readArt, renderPolicySha256: localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY),
    judge: async () => { throw Error("Historical per-hide judge forbidden"); },
    render: async ({ requestKey, stylePng, prompt, subjectQuality }) => {
      expect(subjectQuality).toBe("medium");
      const hide = hides.find(hide => requestKey.startsWith(hide.id + ":")); if (!hide) throw Error("Unregistered Detective painter request");
      expect(requestKey.endsWith(":render:1")).toBe(true);
      expect(prompt).toContain("local-patch-authored-paint/v1"); prompts.set(requestKey, prompt);
      const mask = maskForHide(hide), figure = await sharp({ create: { width: Math.round(mask.width * 0.6), height: Math.round(mask.height * 0.8), channels: 4, background: "#1e3ca0" } }).png().toBuffer();
      const png = await sharp(stylePng).composite([{ input: figure, left: mask.left + Math.round(mask.width * 0.2), top: mask.top + Math.round(mask.height * 0.2) }]).png().toBuffer();
      return paintedOk(png, bill("paint-" + gameId + "-" + requestKey));
    } };
  const diagnose = vi.fn(async () => { throw Error("Clean controlled answers cannot authorize a diagnosis"); });
  let result = { pending: true, attention: null as string | null }, ticks = 0;
  for (; ticks < 900 && result.pending; ticks++) {
    result = await runLocalPatchWorldSlice(container, deps, gameId, { hardDeadlineAt: Date.now() + 270_000, diagnose });
    expect(result.attention).toBeNull();
  }
  expect(result.pending).toBe(false); expect(ticks).toBeLessThan(900);
  const game = await db.game.findUniqueOrThrow({ where: { id: gameId } });
  expect(["READY", "DELIVERED"]).toContain(game.status);
  const config = parseGameConfig(game.configJson!);
  expect(config.scenes).toHaveLength(9); expect(config.scenes.every(scene => scene.version === 13 && scene.playMode === "find-any" && scene.targets.length === 3)).toBe(true);
  expect(config.scenes.flatMap(scene => scene.targets)).toHaveLength(27);
  expect(config.adventure!.boards).toHaveLength(9); expect(config.adventure!.boards.flatMap(board => board.discoveries)).toHaveLength(54);
  expect(config.scenes.every(scene => scene.art.base.includes("-detectives-"))).toBe(true);
  expect(await subjectUpgradeOf(db, gameId)).toMatchObject({ actorType: "SYSTEM", operatorId: SYSTEM_ENROLLMENT_OPERATOR, ageYears: 8 });
  const rows = await db.targetVariantAsset.findMany({ where: { variant: "A", targetInstance: { gameScene: { gameId } } } });
  expect(rows).toHaveLength(27); expect(rows.every(row => row.status === "GENERATED" && row.attempts === 1)).toBe(true);
  expect(prompts.size).toBe(27); expect(provider.creates).toHaveLength(54); expect(provider.creates.filter(create => create.quality)).toHaveLength(27);
  const store = new PrismaRetainedPurchaseStore(db), worldId = boardWizardWorldId(gameId);
  for (const row of rows) {
    const receipt = JSON.parse(row.judgeJson!), proof = receipt.boardReview.dual as DualReviewProof;
    expect(receipt.authoredReturn.contentVersion).toBe(13); expect(proof.sceneVersion).toBe(13);
    expect(proof.quality.sourceNeighbors).toBeDefined(); expect(proof.subject!.sourceNeighbors).toEqual(proof.quality.sourceNeighbors);
    expect(readQualityStage(proof.quality, receipt.hide, 13)?.verdict).toBe("pass");
    expect(readContinuityStage(proof.continuity!, receipt.hide, DUAL_VISUAL_REVIEW_V3)).toMatchObject({ ok: true });
    expect(proof.subject).toMatchObject({ subjectPolicy: SUBJECT_POLICY_V2, reader: SUBJECT_READER_V2, combined: SUBJECT_QUALITY_BUNDLE_VERSION, requestKey: proof.quality.requestKey });
    expect(readSubjectAnswerV2(subjectStageRaw(proof.subject!), { hideId: receipt.hide, ageYears: 8, plan: subjectPlanOfHide(receipt.hide, 13)! })).toMatchObject({ ok: true, disposition: "pass" });
    for (const stage of [proof.quality, proof.continuity!]) {
      const retained = await store.get(worldId, stage.requestKey); expect(retained).not.toBeNull();
      expect(retained!.operationFingerprint).toBe(stage.fingerprint); expect(JSON.parse(retained!.bytes.toString()).raw).toBe(stage.raw);
    }
    const binding = { ...publicationBinding(gameId, row), sceneVersion: 13 };
    expect(await allowedDualPublication(db, binding)).toBe(true); expect(await hasLocalPatchPublicationPolicy(c, binding)).toBe(true);
  }
  const oversized = config.scenes.find(scene => scene.slug === "paris")!.targets.find(target => target.id === "hide-2")!.sprite;
  expect(oversized.kind).toBe("image");
  if (oversized.kind === "image") { expect(oversized.rect!.h * 2160).toBe(768); expect(oversized.hitRect!.h * 2160).toBeGreaterThan(540 * 0.8); }
  const audit = await boardWizardBudgetOf(c).audit(worldId);
  expect(audit).toMatchObject({ capMicroUsd: 4_000_000, held: false, reservedMicroUsd: 0, pendingRequestKeys: [], unknownRequestKeys: [] });
  expect(audit.committedMicroUsd).toBeLessThanOrEqual(audit.capMicroUsd);
  const child = await db.childProfile.findUniqueOrThrow({ where: { id: "chl-" + gameId } });
  const photo = await db.asset.findUniqueOrThrow({ where: { id: "ast-photo-" + gameId } });
  expect(child.originalPhotoAssetId).toBeNull(); expect(photo.status).toBe("DELETED"); expect(await db.fileBlob.findUnique({ where: { key: photo.storagePath } })).toBeNull();
  expect((await sourcePlacementReleaseOf(db, gameId))!.baseSceneVersion).toBe(13);
  expect(diagnose).not.toHaveBeenCalled(); expect(synchronous).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  console.info("synthetic-detective-all27", { ticks, hides: rows.length, reviewQuestions: provider.creates.length, committedMicroUsd: audit.committedMicroUsd });
}, 1_500_000);
