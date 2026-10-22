import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { PrismaWorldBudgetStore } from "../../../infra/db/prisma-world-budget-store";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { AUTHORED_PATCH_COMPOSITION_VERSION } from "../../../domain/scene/local-patch-return-region";
import { AUTHORED_RECOVERY_COMPOSITION_VERSION, authoredRecoveryParentSha256 } from "../../../domain/scene/local-patch-authored-recovery";
import { selfRepairDecisionSchema, type SelfRepairDecision } from "../../../domain/scene/local-patch-self-repair";
import { boardsOfWorlds } from "../../world-catalog.service";
import { sceneBySlug } from "../../scene-catalog.service";
import type { Container } from "../../container";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { readShippedBoardArt, runLocalPatchHide, type LocalPatchHideDeps } from "../local-patch-hide";
import { prepareLocalPatchBoardReview, reviewLocalPatchBoard } from "../local-patch-board-review";
import { runLocalPatchSelfRepair, type SelfRepairWire } from "../local-patch-self-repair";
import { pinVisualReviewRelease, DUAL_VISUAL_REVIEW_V3 } from "../visual-review-release";
import { LOCAL_PATCH_LEAN_RELEASE, pinLeanRelease } from "../lean-release";
import { enrollLeanWorld } from "../lean-enrollment";
import { pinSourcePlacementRelease, resolveLocalPatchBoardsForGame, sourcePlacementForHide } from "../source-placement-release";
import { authoredLocalPatchReturnMatches, authoredLocalPatchRecoveryEvidenceMatches, authoredLocalPatchSourceNeighborContract } from "../local-patch-authored-return";
import { PLAYER_REVIEW_MODE } from "../local-patch-player-review";
import { localPatchNeedsRecomposition, recomposeLocalPatchHide } from "../local-patch-recompose";
import { sha256Bytes } from "../fixed-sprite";
import { bill, paintedCrop, paintedOk, seedApprovedGame } from "./local-patch-fixtures";
import { GOOD_V12_VERDICT, boundHide, longAnswer, publicationBinding } from "./local-patch-dual-fixtures";
import { SOURCE_NEIGHBOR_ANSWER_VERSION, SOURCE_NEIGHBOR_BUNDLE_VERSION, type SourceNeighborContract } from "../../../domain/scene/local-patch-source-neighbors";
import type { SourceNeighborQualityBundleBinding } from "../../../domain/generation/source-neighbor-quality-bundle";
import { SUBJECT_QUALITY_BUNDLE_VERSION } from "../../../domain/generation/subject-quality-bundle";
import { SUBJECT_POLICY_V2 } from "../../../domain/generation/subject-policy";
import type { BackgroundReviewState, BackgroundReviewTransport } from "../../../infra/generation/types";
import { localPatchHideEvidenceIds } from "../local-patch-judge";
import { allowedDualPublication } from "../local-patch-dual-publication";
import { hasLocalPatchPublicationPolicy } from "../local-patch-publication-policy";

const settings = vi.hoisted(() => ({ testers: [] as string[] }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", LOCAL_PATCH_PROMPT_RELEASE: "v19", LOCAL_PATCH_PLAYER_REVIEW: "on",
  GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0, GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: settings.testers }), flag: () => false, adminEmails: () => [] }));

let directory: string, db: PrismaClient, c: Container, source: Buffer;
const journey = new Set(boardsOfWorlds(["journey"]));
const boards = localPatchBoardsForVersion(12).filter(b => journey.has(b.board));
const baseBoard = boards.find(b => b.board === "greatwall")!;

beforeAll(async () => {
  directory = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-authored-recovery-")));
  db = new PrismaClient({ datasources: { db: { url: "file:" + path.join(directory, "test.sqlite").replaceAll("\\", "/") } } });
  await applyTestSchema(db); c = { db, storage: new DbStorage(db), backgroundReview: { namespace: "openai:find-me-existing",
    create: vi.fn(async () => { throw Error("Independent review purchase forbidden in recovery qualification"); }),
    retrieve: vi.fn(async () => { throw Error("Independent review polling forbidden in recovery qualification"); }),
    cancel: vi.fn(async () => {}) } } as unknown as Container;
  source = await readShippedBoardArt(baseBoard.art, sceneBySlug(baseBoard.board, 12).art.sha256!);
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("Live calls forbidden in authored recovery regression"); }));
}, 180_000);
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(directory) === realpathSync(tmpdir()) && path.basename(directory).startsWith("findme-authored-recovery-")) rmSync(directory, { recursive: true });
});

const decisionFor = (sourceKey: string): SelfRepairDecision => ({ cause: "neighbor-damage",
  explanation: "The smaller child and closed return preserve every original neighbouring head and remove the doubled remnant.",
  action: "redraw-with-new-placement", sourceKey, returnWindow: { left: 74, top: 136, width: 304, height: 631 },
  protectedCore: { left: 128, top: 228, width: 220, height: 312 }, faceRect: { left: 180, top: 250, width: 65, height: 70 } });

/** Actual source pixels, SQLite, identity gate, purchase retention and engine services.
 * Only the painter and diagnosis are synthetic; the visual refusal is injected
 * explicitly and no test treats the resulting candidate as visual approval. */
async function seed(gameId: string, mutate?: (plan: SelfRepairDecision) => SelfRepairDecision) {
  const seeded = await seedApprovedGame(c, db, { gameId, approved: false, status: "DRAFT", styleVersion: "local-patch-world-v1",
    scenes: boards.map(b => ({ slug: b.board, version: 12 })) });
  settings.testers.push(seeded.email);
  await db.$transaction(async tx => { await pinVisualReviewRelease(tx, gameId, DUAL_VISUAL_REVIEW_V3);
    await pinLeanRelease(tx, gameId, LOCAL_PATCH_LEAN_RELEASE); await pinSourcePlacementRelease(tx, gameId); });
  await db.game.update({ where: { id: gameId }, data: { status: "TARGETS_GENERATING" } });
  await db.generationJob.create({ data: { id: "job_" + gameId, gameId, status: "QUEUED" } });
  await db.order.create({ data: { id: "ord-" + gameId, gameId, userId: seeded.userId, provider: "mock", packageTier: "ONE_WORLD",
    amountAgorot: 3900, paymentStatus: "PAID", paidAt: new Date() } });
  await c.storage.put("private/photo-" + gameId + ".jpg", seeded.sheet, "image/png");
  const catalog = await readBoardConditionedCatalog();
  await reviewBoardWizardIdentity({ db, apiKey: "synthetic", budget: boardWizardBudgetOf(c), beforeDispatch: async () => {},
    write: work => db.$transaction(work), reviewer: { review: async () => ({ httpOk: true, requestId: "req-identity-" + gameId,
      body: { model: "gpt-5.6-luna", usage: { prompt_tokens: 1500, completion_tokens: 150 }, choices: [{ finish_reason: "stop",
        message: { content: JSON.stringify({ checks: { identity: "pass", age: "pass", paintedStyle: "pass", sheetLayout: "pass" }, reason: "Controlled identity" }) } }] } }) } },
    { gameId, identityAssetId: "ast-sheet-" + gameId, sheet: seeded.sheet, photo: seeded.sheet, atlas: seeded.sheet, contentVersion: 12,
      provenance: { promptVersion: "character-v6-painted-identity-geometry", quality: "medium", photoAssetId: "ast-photo-" + gameId,
        photoSha256: sha256Bytes(seeded.sheet), ageYears: 8, crop: null,
        style: { version: "board-matched-identity/v4", catalogSha256: catalog.sha256, atlasSha256: sha256Bytes(seeded.sheet) } } });
  expect(await enrollLeanWorld(c, gameId, async () => {})).toEqual({ state: "enrolled" });
  const context = await resolveLocalPatchBoardsForGame(db, gameId, 12);
  const board = context.boards.find(b => b.board === "greatwall")!, hide = board.hides.find(h => h.id === "greatwall-v12-2")!;
  const plan = mutate?.(decisionFor(`${hide.id}:${hide.pose}:render:1`)) ?? decisionFor(`${hide.id}:${hide.pose}:render:1`);
  const render = vi.fn<LocalPatchHideDeps["render"]>(async ({ stylePng, requestKey }) => paintedOk(
    await paintedCrop(stylePng, requestKey.includes(":self-repair:") ? { ...hide, mask: plan.protectedCore } : hide), bill("paint-" + gameId + "-" + requestKey)));
  const diagnose = vi.fn(async (_wire: SelfRepairWire) => ({ verdict: null, raw: JSON.stringify(plan), model: "gpt-5.6-sol",
    requestId: "req-plan-" + gameId, usage: { prompt_tokens: 2000, completion_tokens: 500 }, finishReason: "stop", wireFault: null, costUnknown: false }));
  const deps = { renderPolicySha256: "f".repeat(64), render, readBoardArt: async () => source, fence: async () => {}, diagnose,
    judge: async () => { throw Error("Per-hide judge forbidden"); } };
  const input = { gameId, sceneId: "gsc-" + gameId + "-greatwall", board, hide };
  const row = () => db.targetVariantAsset.findFirstOrThrow({ where: { targetInstance: { gameScene: { gameId }, targetId: hide.targetId } } });
  const refuse = async () => {
    const current = await row(), receipt = JSON.parse(current.judgeJson!);
    await db.targetVariantAsset.update({ where: { id: current.id }, data: { status: "FAILED", lastError: "quality-retry: synthetic neighbour drawing failure",
      judgeJson: JSON.stringify({ ...receipt, reviewState: "board-review-complete", boardReview: { assessmentMode: PLAYER_REVIEW_MODE },
        verdict: { ...GOOD_V12_VERDICT, pictureWhole: "fail", verdict: "fail", faults: [{ check: "pictureWhole", where: "The drawn elderly neighbour has a second head beside the child." }] },
        qualityDisposition: { state: "retry", faults: ["pictureWhole"] } }) } });
  };
  for (let n = 0; n < 2; n++) { expect((await runLocalPatchHide(c, deps, input)).state).toBe("generated"); await refuse(); }
  return { gameId, context, board, hide, plan, render, diagnose, deps, input, row,
    step: () => runLocalPatchSelfRepair(c, input, deps),
    prepare: () => prepareLocalPatchBoardReview(c, input, { readBoardArt: deps.readBoardArt }, { playerReview: true }),
    imageLedger: async () => (await PrismaWorldBudgetStore.forContinuationApprovalTransaction(db).read(boardWizardWorldId(gameId)))!.snapshot.requests.filter(r => r.scope === "image") };
}

/** Controlled positive answers exercise the real independent review, retention,
 * source-neighbor wrapper and both publication guards. They certify only the
 * contracts in this regression; no synthetic picture earns product approval. */
async function reviewRecovered(s: Awaited<ReturnType<typeof seed>>) {
  const requests: { id: string; prompt: string }[] = [];
  const answer = (prompt: string) => {
    const hideId = boundHide(prompt).hideId;
    if (!prompt.includes(SOURCE_NEIGHBOR_BUNDLE_VERSION)) return longAnswer(hideId, 150, 150, 0);
    const line = prompt.split("\n").find(l => l.startsWith("AUTHORITATIVE SOURCE NEIGHBORS: "))!;
    const { contract } = JSON.parse(line.slice("AUTHORITATIVE SOURCE NEIGHBORS: ".length)) as { contract: SourceNeighborContract };
    const binding = JSON.parse(/Wrapper binding metadata \(do not add policy\/reader fields to the answer\): (\{[^\n]+\})\./.exec(prompt)![1]!) as SourceNeighborQualityBundleBinding;
    const pass = { status: "pass", observation: "Controlled complete child, scene and identity evidence in this synthetic service regression." };
    return JSON.stringify({ version: SOURCE_NEIGHBOR_BUNDLE_VERSION, assessment: { version: SUBJECT_QUALITY_BUNDLE_VERSION,
      quality: { hides: [{ hideId, evidenceIds: localPatchHideEvidenceIds(hideId), verdict: GOOD_V12_VERDICT }] },
      subject: { hideId, subjectPolicy: SUBJECT_POLICY_V2, checks: { photoLikeness: pass, canonicalAgreement: pass, faceVisible: pass,
        perceivedAge: { ...pass, estimatedMinYears: 7, estimatedMaxYears: 9 }, requiredWardrobe: { ...pass, status: "not-required" } },
        appearance: { head: "three-quarter", expression: "focused", engagement: "watching", portraitCopy: false }, faults: [] } },
      sourceNeighbors: { version: SOURCE_NEIGHBOR_ANSWER_VERSION, contractSha256: binding.contractSha256, candidateSha256: binding.candidateSha256,
        neighbors: contract.neighbors.map((n, i) => ({ sourceId: n.sourceId, outcome: i === 2 ? "replaced-whole" : "preserved", status: "pass",
          after: [{ ref: "person-" + i, rect: n.head }], remnants: "none", occluder: null,
          observation: "One coherent source-corresponding person with no duplicate or remnant in the controlled answer." })) } });
  };
  const transport: BackgroundReviewTransport = { namespace: "openai:find-me-existing", create: async body => {
    const prompt = (body.input as { content: { text?: string }[] }[])[0]!.content[0]!.text!, id = "resp_" + s.gameId + "_" + requests.length;
    requests.push({ id, prompt }); return { responseId: id };
  }, retrieve: async (id): Promise<BackgroundReviewState> => ({ status: "completed", reading: { responseId: id,
    raw: answer(requests.find(r => r.id === id)!.prompt), usage: { input_tokens: 2000, output_tokens: 800 },
    model: "gpt-6.1-sol", finishReason: "stop", serviceTier: "flex" } }), cancel: async () => {} };
  const synchronous = vi.fn(async () => { throw Error("A lean recovery buys no synchronous visual review"); });
  const container = { ...c, backgroundReview: transport, visualReview: { request: synchronous } };
  for (let n = 0; n < 8; n++) {
    await reviewLocalPatchBoard(container, s.input, { readBoardArt: s.deps.readBoardArt, fence: async () => {},
      judge: async () => { throw Error("Lean recovery never uses a grouped/synchronous judge"); } });
    if (JSON.parse((await s.row()).judgeJson!).boardReview?.dual) {
      expect(synchronous).not.toHaveBeenCalled(); return { row: await s.row(), requests };
    }
  }
  throw Error("Controlled independent review did not conclude within its bounded phase slices");
}

describe("authored companion autonomous recovery through the actual services", () => {
  it("after two visual refusals buys one bound redraw, reproduces it and admits the actual new window for independent review", async () => {
    const s = await seed("authored-recovery-valid"), refused = await s.row(), original = JSON.parse(refused.judgeJson!);
    await s.step(); expect(s.diagnose).not.toHaveBeenCalled(); expect(s.render).toHaveBeenCalledTimes(2);
    await s.step(); const applying = JSON.parse((await s.row()).judgeJson!).selfRepair;
    expect(applying.phase, applying.feedback).toBe("applying");
    await s.step();
    const row = await s.row(), receipt = JSON.parse(row.judgeJson!);
    expect(row.status).toBe("GENERATED"); expect(row.attempts).toBe(2); expect(row.assetId).not.toBe(refused.assetId);
    expect(receipt).toMatchObject({ compositionVersion: AUTHORED_RECOVERY_COMPOSITION_VERSION, reviewState: "pending-board-review", verdict: null,
      authoredReturn: original.authoredReturn, authoredRecovery: { crop: original.authoredReturn.crop, cycle: 1, returnWindow: s.plan.returnWindow,
        parentSha256: authoredRecoveryParentSha256(original.authoredReturn), protectedCore: s.plan.protectedCore, faceRect: s.plan.faceRect,
        diagnosis: { requestKey: `self-repair:${s.hide.id}:diagnosis:1` }, source: { requestKey: `${s.hide.id}:${s.hide.pose}:self-repair:1` } },
      recoveryComposition: { state: "UNREVIEWED", outsideChangedPixels: 0, protectedChangedPixels: 0 } });
    expect(localPatchNeedsRecomposition(row, 12, true)).toBe(false);
    expect(await recomposeLocalPatchHide(c, s.input, { fence: async () => {}, readBoardArt: s.deps.readBoardArt })).toBe(false);
    expect((await s.row()).judgeJson).toBe(row.judgeJson);
    expect(authoredLocalPatchReturnMatches(receipt, s.board, s.hide, 12, false, s.context)).toBe(true);
    expect(await authoredLocalPatchRecoveryEvidenceMatches(db, { gameId: s.gameId, board: s.board, hide: s.hide, sceneVersion: 12,
      receipt, placementContext: s.context, promptVersion: row.promptVersion, beforePng: source })).toBe(true);
    const neighbor = authoredLocalPatchSourceNeighborContract(sourcePlacementForHide(s.context, s.hide.id)!, receipt)!;
    expect(neighbor.contract.returnRect).toEqual(s.plan.returnWindow); expect(neighbor.contract.neighbors).toHaveLength(5);
    const prepared = await s.prepare(); if (!prepared.ready) throw Error(prepared.reason);
    expect(prepared.placementContext.manifestSha256).toBe(s.context.manifestSha256);
    expect(prepared.entries[0]!.reviewContextRect).toEqual({ left: 1232, top: 602, width: 896, height: 1152 });
    expect(prepared.request.hides[0]!.returnedWindow).toEqual({ ...s.plan.returnWindow, left: 192 + s.plan.returnWindow.left, top: 192 + s.plan.returnWindow.top });
    expect(sha256Bytes(await c.storage.get((await db.asset.findUniqueOrThrow({ where: { id: row.assetId! } })).storagePath))).toBe(receipt.judgedSha256);
    expect(s.render).toHaveBeenCalledTimes(3); expect(s.diagnose).toHaveBeenCalledOnce(); expect(await s.imageLedger()).toHaveLength(3);
    for (const [wire] of s.render.mock.calls) {
      expect(wire.prompt).toContain("SOURCE-BOUND PAINTER local-patch-authored-paint/v1");
      expect(wire.prompt).toContain("Never complete a crop-clipped person by moving their head or body inward");
      expect(wire.prompt).toContain("not a required final person count");
      expect(wire.prompt).toContain("coherently removed or replaced WHOLE");
      expect(wire.prompt).toContain('"sourceId":"greatwall-dumpling-elder","head":{"left":-154');
    }
    expect(s.render.mock.calls[2]![0].prompt).toContain('"returnWindow":{"left":74,"top":136,"width":304,"height":631}');
    const painterData = JSON.parse(/AUTHORITATIVE PLACEMENT DATA: (\{.+?\})\./s.exec(s.render.mock.calls[2]![0].prompt)![1]!);
    expect(painterData.sourceNeighbors.contractSha256).toBe(neighbor.contractSha256);
    expect(s.diagnose.mock.calls[0]![0].prompt).toContain("AUTHORED RECOVERY DATA");
    expect(s.diagnose.mock.calls[0]![0].imageLabels).toContain("CONTINUOUS ORIGINAL player context beyond ALL crop edges, before this one hide");
    expect(globalThis.fetch).not.toHaveBeenCalled();
    const reviewed = await reviewRecovered(s), accepted = JSON.parse(reviewed.row.judgeJson!), binding = publicationBinding(s.gameId, reviewed.row);
    expect(accepted.qualityDisposition.state).toBe("acceptable");
    expect(accepted.boardReview.dual.authoredRecovery).toEqual(receipt.authoredRecovery);
    expect(accepted.boardReview.dual.quality.sourceNeighbors.contract.returnRect).toEqual(s.plan.returnWindow);
    expect(accepted.boardReview.dual.quality.sourceNeighbors.binding.contractSha256).toBe(neighbor.contractSha256);
    expect(accepted.boardReview.dual.quality.sourceNeighbors.binding.contractSha256).not.toBe(sourcePlacementForHide(s.context, s.hide.id)!.sourceNeighbors!.contractSha256);
    expect(await db.$transaction(tx => allowedDualPublication(tx, binding))).toBe(true);
    expect(await hasLocalPatchPublicationPolicy(c, binding)).toBe(true);
    expect(reviewed.requests).toHaveLength(2); expect(s.render).toHaveBeenCalledTimes(3); expect(s.diagnose).toHaveBeenCalledOnce();
  }, 90_000);

  it.each(["head-cut", "outside-child"] as const)("refuses a schema-valid %s diagnosis before purchasing another image or touching the refused asset", async kind => {
    const s = await seed("authored-recovery-" + kind, p => kind === "head-cut" ? { ...p,
      returnWindow: { left: 180, top: 136, width: 198, height: 631 }, protectedCore: { left: 205, top: 228, width: 140, height: 312 },
      faceRect: { left: 230, top: 250, width: 60, height: 60 } } : { ...p, protectedCore: { left: 100, top: 228, width: 240, height: 312 } });
    expect(selfRepairDecisionSchema.safeParse(s.plan).success).toBe(true);
    const before = await s.row(), images = await s.imageLedger(); await s.step(); await s.step();
    const after = await s.row(), state = JSON.parse(after.judgeJson!).selfRepair;
    expect(state.phase).toBe("rejected"); expect(state.feedback).toContain("AUTHORED_RECOVERY");
    expect(after.assetId).toBe(before.assetId); expect(after.attempts).toBe(before.attempts); expect(after.status).toBe("FAILED");
    expect(s.render).toHaveBeenCalledTimes(2); expect(s.diagnose).toHaveBeenCalledOnce(); expect(await s.imageLedger()).toEqual(images);
  }, 90_000);

  it.each(["plan", "diagnosis"] as const)("on an applying-phase resume refuses a changed %s before a new purchase", async kind => {
    const s = await seed("authored-recovery-resume-" + kind); await s.step(); await s.step();
    const current = await s.row(), receipt = JSON.parse(current.judgeJson!), images = await s.imageLedger();
    if (kind === "plan") receipt.selfRepair.decision.protectedCore.left--;
    else receipt.selfRepair.authoredDiagnosis.rawSha256 = "0".repeat(64);
    await db.targetVariantAsset.update({ where: { id: current.id }, data: { judgeJson: JSON.stringify(receipt) } });
    await s.step(); const next = await s.row(), state = JSON.parse(next.judgeJson!).selfRepair;
    expect(state.phase).toBe("rejected"); expect(state.feedback).toContain("immutable paid diagnosis"); expect(state.history).toHaveLength(1);
    expect(next.assetId).toBe(current.assetId); expect(s.render).toHaveBeenCalledTimes(2); expect(await s.imageLedger()).toEqual(images);
  }, 90_000);

  it("refuses forged paid RAW lineage and candidate audit metadata before any review purchase", async () => {
    const s = await seed("authored-recovery-proof"); await s.step(); await s.step(); await s.step();
    const row = await s.row(), original = JSON.parse(row.judgeJson!), ledger = await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId));
    const forged = JSON.parse(row.judgeJson!); forged.authoredRecovery.source.normalizedRawSha256 = "0".repeat(64);
    forged.recoveryComposition.rawSha256 = "0".repeat(64);
    expect(authoredLocalPatchReturnMatches(forged, s.board, s.hide, 12, false, s.context)).toBe(true);
    await db.targetVariantAsset.update({ where: { id: row.id }, data: { judgeJson: JSON.stringify(forged) } });
    await expect(s.prepare()).rejects.toThrow("paid evidence or deterministic candidate changed");
    original.authoredRecovery.diagnosis.rawSha256 = "1".repeat(64); original.selfRepair.authoredDiagnosis.rawSha256 = "1".repeat(64);
    await db.targetVariantAsset.update({ where: { id: row.id }, data: { judgeJson: JSON.stringify(original) } });
    await expect(s.prepare()).rejects.toThrow("paid evidence or deterministic candidate changed");
    expect(await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).toEqual(ledger);
    expect((await s.row()).assetId).toBe(row.assetId); expect(s.render).toHaveBeenCalledTimes(3); expect(s.diagnose).toHaveBeenCalledOnce();
  }, 90_000);

  it("refuses an alternate crop in normal/adaptive and autonomous entry points before any purchase or mutation", async () => {
    const s = await seed("authored-recovery-fixed-crop"), before = await s.row();
    const ledger = await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId));
    const shifted = { ...s.input, hide: { ...s.hide, left: s.hide.left + 1 } };
    await expect(runLocalPatchHide(c, s.deps, { ...shifted, finalRepair: true })).rejects.toThrow("authoritative effective placement");
    await expect(runLocalPatchSelfRepair(c, shifted, s.deps)).rejects.toThrow("authoritative effective placement");
    expect(await s.row()).toEqual(before); expect(await boardWizardBudgetOf(c).audit(boardWizardWorldId(s.gameId))).toEqual(ledger);
    expect(s.render).toHaveBeenCalledTimes(2); expect(s.diagnose).not.toHaveBeenCalled();
  }, 90_000);

  it("keeps the exact authored parent on an adaptive third attempt in the same crop", async () => {
    const s = await seed("authored-recovery-adaptive"), old = JSON.parse((await s.row()).judgeJson!);
    expect((await runLocalPatchHide(c, s.deps, { ...s.input, finalRepair: true })).state).toBe("generated");
    const row = await s.row(), receipt = JSON.parse(row.judgeJson!);
    expect(row.attempts).toBe(3); expect(receipt.compositionVersion).toBe(AUTHORED_PATCH_COMPOSITION_VERSION);
    expect(receipt.authoredReturn).toEqual(old.authoredReturn); expect(receipt.authoredRecovery).toBeUndefined();
    expect(receipt.adaptiveRecovery.plan.strategies).toContain("placement-lock");
    expect(s.render.mock.calls[2]![0].prompt).toContain("ADAPTIVE RECOVERY"); expect(s.render).toHaveBeenCalledTimes(3);
    expect(s.diagnose).not.toHaveBeenCalled();
    const prepared = await s.prepare(); expect(prepared.ready).toBe(true);
  }, 90_000);
});
