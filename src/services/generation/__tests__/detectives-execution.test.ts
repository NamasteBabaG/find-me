import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DETECTIVE_SOURCE_BOARDS } from "../../../../content/detectives/source-release";
import { SOURCE_NEIGHBOR_ANSWER_VERSION, SOURCE_NEIGHBOR_CONTRACT_VERSION, SOURCE_NEIGHBOR_BUNDLE_VERSION, SOURCE_NEIGHBOR_POLICY, SOURCE_NEIGHBOR_READER, prepareSourceNeighborContract } from "../../../domain/scene/local-patch-source-neighbors";
import { leanReviewPolicy } from "../../../domain/generation/visual-review-policy";
import { CURRENT_QUALITY_READER, readQualityStage, type QualityStage } from "../local-patch-dual-evidence";
import { localPatchHideEvidenceIds } from "../local-patch-judge";
import { GOOD_V12_VERDICT } from "./local-patch-dual-fixtures";
import { DETECTIVE_PATCH_BOARDS, DETECTIVE_SOURCE_NEIGHBORS } from "../../../../content/detectives/runtime-release";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { cropOf, maskForHide } from "../../../domain/scene/local-patch-hides";
import { localPatchHideForVersion } from "../../../domain/scene/local-patch-family-hide";
import { interruptedLocalPatchImageRequest } from "../../../domain/scene/local-patch-image-request";
import { authoredLocalPatchReturnContract } from "../../../domain/scene/local-patch-return-region";
import { sourceNeighborReviewContext } from "../../../domain/scene/local-patch-review-context";
import { localPatchImagePolicyForVersion, localPatchRenderPolicySha256, LOCAL_PATCH_IMAGE_POLICY, LOCAL_PATCH_LOW_IMAGE_POLICY } from "../../../infra/generation/openai-local-patch";
import type { Container } from "../../container";
import { nextPendingGame } from "../queue";
import { LOCAL_PATCH_QUALITY_FAILED } from "../local-patch-world";
import { subjectPlanOfHide } from "../subject-enrollment";
import { subjectPlanFor, subjectPlanCanonical } from "../../../domain/generation/subject-policy";
import { pinnedLocalPatchPromptVersion, LOCAL_PATCH_FIXED_SCENERY_PROMPT_VERSION, LOCAL_PATCH_REFERENCE_NEUTRAL_PROMPT_VERSION } from "../local-patch-prompt";
import { localPatchGeometry } from "../local-patch-geometry";
import { localPatchNeedsRecomposition } from "../local-patch-recompose";
import { renderLocalPatchHide } from "../local-patch-render";
import { detectiveAutomaticRecoveryQualified } from "../detective-automatic-recovery";
import { recoverLocalPatchImageInterruptions, localPatchBudgetReadyForPublication } from "../local-patch-interruption-recovery";
import { pinLocalPatchSourceFamily, sourceFamilyAuditId } from "../source-placement-release";
import { pinIdentitySourceRelease } from "../identity-source-release";
import { pinLeanRelease, LOCAL_PATCH_LEAN_RELEASE } from "../lean-release";
import { pinVisualReviewRelease, DUAL_VISUAL_REVIEW_V3 } from "../visual-review-release";
import { leanNewWorldRecoveryReceipt, leanReviewRecoveryAuditId } from "../../../domain/generation/lean-review-recovery";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";

vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", LOCAL_PATCH_PROMPT_RELEASE: "v19", LOCAL_PATCH_IDENTITY_SOURCE: "full-source-v1" }) }));

describe("Detective execution contracts", () => {
  it("uses all 27 actual authored subject plans and exact pose membership without an Explorer fallback", () => {
    const hides = DETECTIVE_PATCH_BOARDS.flatMap(board => board.hides);
    expect(hides).toHaveLength(27);
    for (const board of DETECTIVE_PATCH_BOARDS) for (const hide of board.hides) {
      expect(subjectPlanCanonical(subjectPlanOfHide(hide.id, 13)!)).toEqual(subjectPlanCanonical(subjectPlanFor(board, hide.id)));
      expect(subjectPlanOfHide(hide.id)).toBeNull();
      expect(localPatchHideForVersion(hide.id, 12)).toBeNull();
      expect(interruptedLocalPatchImageRequest(hide.id + ":" + hide.pose + ":render:1")).toMatchObject({ hide: { id: hide.id }, attempt: 1, sceneVersion: 13 });
      expect(interruptedLocalPatchImageRequest(hide.id + ":not-authored:render:1")).toBeNull();
      expect(interruptedLocalPatchImageRequest(hide.id + ":" + hide.pose + ":render:3")).toBeNull();
    }
    expect(subjectPlanOfHide("greatwall-v12-2", 13)).toBeNull();
    expect(subjectPlanOfHide("greatwall-v12-2")).not.toBeNull();
    expect(localPatchHideForVersion(hides[0]!.id, 14)).toBeNull();
    expect(interruptedLocalPatchImageRequest("kingdom-detectives-hide-1:standing:render:1")).toBeNull();
    const legacy = localPatchHideForVersion("greatwall-v12-2", 12)!.hide;
    expect(Object.hasOwn(interruptedLocalPatchImageRequest(legacy.id + ":" + legacy.pose + ":render:1")!, "sceneVersion")).toBe(false);
    expect(DETECTIVE_PATCH_BOARDS.find(board => board.board === "antarctica")!.hides.every(hide => subjectPlanOfHide(hide.id, 13)!.warmHat)).toBe(true);
  });
  it("keeps every registered source head inside the actual Detective review context, including Tokyo overruns", () => {
    for (const entry of DETECTIVE_SOURCE_NEIGHBORS) {
      const hide = localPatchHideForVersion(entry.hideId, 13)!.hide, crop = cropOf(hide);
      const context = sourceNeighborReviewContext(crop, { width: 3840, height: 2160 }, entry.neighbors.map(neighbor => neighbor.head), 13);
      expect(context.left).toBeGreaterThanOrEqual(0); expect(context.top).toBeGreaterThanOrEqual(0);
      expect(context.left + context.width).toBeLessThanOrEqual(3840); expect(context.top + context.height).toBeLessThanOrEqual(2160);
      for (const neighbor of entry.neighbors) {
        expect(neighbor.head.left).toBeGreaterThanOrEqual(context.left); expect(neighbor.head.top).toBeGreaterThanOrEqual(context.top);
        expect(neighbor.head.left + neighbor.head.width).toBeLessThanOrEqual(context.left + context.width);
        expect(neighbor.head.top + neighbor.head.height).toBeLessThanOrEqual(context.top + context.height);
      }
    }
    for (const [id, padding] of [["tokyo-detectives-hide-2", 235], ["tokyo-detectives-hide-3", 192]] as const) {
      const crop = cropOf(localPatchHideForVersion(id, 13)!.hide), heads = DETECTIVE_SOURCE_NEIGHBORS.find(entry => entry.hideId === id)!.neighbors.map(n => n.head);
      expect(sourceNeighborReviewContext(crop, { width: 3840, height: 2160 }, heads, 13).top).toBe(crop.top - padding);
    }
    const distant = { left: 3150, top: 720, width: 512, height: 768 };
    expect(sourceNeighborReviewContext(distant, { width: 3840, height: 2160 }, [{ left: 3250, top: 499, width: 40, height: 60 }], 13).top).toBe(499);
    const crop = { left: 1424, top: 794, width: 512, height: 768 };
    expect(sourceNeighborReviewContext(crop, { width: 3840, height: 2160 }, [], 12)).toEqual({ left: 1232, top: 602, width: 896, height: 1152 });
  });
  it("pins v19 MEDIUM for a new13 purchase, preserves old stored prompt bytes, and refuses unsupported recipes before dispatch", async () => {
    expect(pinnedLocalPatchPromptVersion(null, "legacy", 13, "v15")).toBe(LOCAL_PATCH_FIXED_SCENERY_PROMPT_VERSION);
    expect(pinnedLocalPatchPromptVersion({ promptVersion: "retained-original-question", attempts: 1 }, "legacy", 13)).toBe("retained-original-question");
    expect(pinnedLocalPatchPromptVersion(null, "legacy", 12, "v15")).toBe(LOCAL_PATCH_REFERENCE_NEUTRAL_PROMPT_VERSION);
    expect(localPatchImagePolicyForVersion(13)).toBe(LOCAL_PATCH_IMAGE_POLICY);
    expect(localPatchImagePolicyForVersion(12)).toBe(LOCAL_PATCH_IMAGE_POLICY);
    expect(localPatchImagePolicyForVersion(11)).toBe(LOCAL_PATCH_LOW_IMAGE_POLICY);
    const render = vi.fn(async () => { throw Error("No purchase permitted"); });
    const deps = { render, renderPolicySha256: localPatchRenderPolicySha256(LOCAL_PATCH_LOW_IMAGE_POLICY) } as unknown as Parameters<typeof renderLocalPatchHide>[0];
    const input = { contentVersion: 13, paintRecipe: "scene-integration-v8" } as Parameters<typeof renderLocalPatchHide>[1];
    await expect(renderLocalPatchHide(deps, input)).rejects.toThrow("v19 MEDIUM");
    await expect(renderLocalPatchHide({ ...deps, renderPolicySha256: localPatchRenderPolicySha256(LOCAL_PATCH_IMAGE_POLICY) }, input)).rejects.toThrow("trusted source-family");
    expect(render).not.toHaveBeenCalled();
  });
  it("retains real13 parent geometry and refuses a missing source family or historical recomposition", () => {
    const board = DETECTIVE_PATCH_BOARDS[0]!, hide = board.hides[0]!, crop = cropOf(hide);
    const input = { contentVersion: 13, boardId: board.board, hideId: hide.id, source: { art: board.art, sha256: "a".repeat(64), width: 3840, height: 2160 },
      crop, child: maskForHide(hide), authored: hide.returnRect! };
    expect(() => authoredLocalPatchReturnContract(input)).toThrow("pinned integrated-family");
    const parent = authoredLocalPatchReturnContract({ ...input, sourcePlacement: { manifestSha256: "b".repeat(64), basePlacementSha256: "c".repeat(64) } });
    expect(parent.contentVersion).toBe(13); expect(parent.crop).toEqual(crop); expect(parent.child).toEqual(maskForHide(hide));
    expect(authoredLocalPatchReturnContract({ ...input, contentVersion: 12 }).contentVersion).toBe(12);
    expect(localPatchNeedsRecomposition({ status: "GENERATED", attempts: 1, judgeJson: "not-json" }, 13, true)).toBe(false);
    expect(localPatchNeedsRecomposition({ status: "GENERATED", attempts: 1, judgeJson: "not-json" }, 12, true)).toBe(true);
  });
  it("uses the authored >540px child envelope in native target geometry instead of a preview scale", async () => {
    const hide = DETECTIVE_PATCH_BOARDS.find(board => board.board === "paris")!.hides[1]!, crop = cropOf(hide), mask = maskForHide(hide);
    expect(mask.height).toBe(570);
    const boardPng = await sharp({ create: { width: 3840, height: 2160, channels: 4, background: "#c5ad83" } }).png().toBuffer();
    const patchPng = await sharp(boardPng).extract(crop).png().toBuffer();
    const measured = await localPatchGeometry({ contentVersion: 13, hide, boardPng, patchPng, board: { width: 3840, height: 2160 } });
    expect(measured.basis).toBe("declared");
    expect(measured.geometry.rect).toEqual({ x: crop.left / 3840, y: crop.top / 2160, w: 512 / 3840, h: 768 / 2160 });
    expect(measured.geometry.hitRect.h * 2160).toBeGreaterThanOrEqual(mask.height);
  });
});

let directory: string, db: PrismaClient, c: Container;
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-detective-execution-")));
  db = new PrismaClient({ datasources: { db: { url: "file:" + path.join(directory, "test.db").replaceAll("\\", "/") } } });
  await applyTestSchema(db); c = { db, storage: new DbStorage(db) } as unknown as Container;
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("Live calls forbidden in Detective regressions"); }));
});
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(directory) === realpathSync(tmpdir()) && path.basename(directory).startsWith("findme-detective-execution-")) rmSync(directory, { recursive: true });
});

async function prospective(id: string, pin = true) {
  await db.user.create({ data: { id: "usr-" + id, email: id + "@example.invalid" } });
  await db.game.create({ data: { id, ownerId: "usr-" + id, searchLevel: "detectives", packageTier: "ONE_WORLD", sceneCount: 9, status: "DRAFT", styleVersion: "local-patch-world-v1" } });
  for (const [index, board] of DETECTIVE_PATCH_BOARDS.entries()) await db.gameScene.create({ data: { id: "scene-" + id + "-" + index, gameId: id, sceneSlug: board.board, sceneVersion: 13, orderIndex: index } });
  await db.$transaction(async tx => {
    await pinVisualReviewRelease(tx, id, DUAL_VISUAL_REVIEW_V3); await pinLeanRelease(tx, id, LOCAL_PATCH_LEAN_RELEASE); await pinIdentitySourceRelease(tx, id);
    if (pin) await pinLocalPatchSourceFamily(tx, id, { sceneVersion: 13, searchLevel: "detectives" });
  });
  await db.game.update({ where: { id }, data: { status: "TARGETS_GENERATING" } });
  await db.order.create({ data: { id: "order-" + id, gameId: id, userId: "usr-" + id, provider: "mock", packageTier: "ONE_WORLD", amountAgorot: 3900, paymentStatus: "PAID", paidAt: new Date() } });
  const hide = DETECTIVE_PATCH_BOARDS[0]!.hides[0]!, sceneId = "scene-" + id + "-0", requestKey = hide.id + ":" + hide.pose + ":render:1";
  await db.targetInstance.create({ data: { id: "target-" + id, gameSceneId: sceneId, targetId: hide.targetId, targetType: "child", slotAId: "hide-1-A", slotBId: "hide-1-B", status: "PENDING" } });
  await db.targetVariantAsset.create({ data: { id: "row-" + id, targetInstanceId: "target-" + id, variant: "A", slotId: "hide-1-A", status: "PENDING", attempts: 1, provider: "local-patch" } });
  const budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(id);
  await budget.reserve(worldId, { requestKey, scope: "image", operationFingerprint: "d".repeat(64), reserveMicroUsd: 120_000 });
  await budget.markUnknown(worldId, requestKey, requestKey + " failed after dispatch: LOCAL_PATCH_PAINTER: " + requestKey + " was dispatched and no usable image came back (cost_unknown: Request billing is unknown; reservation retained and no retry dispatched)");
  return { budget, worldId, requestKey };
}

describe("prospective Detective automatic continuation", () => {
  it("continues one valid interrupted13 image without changing its reserve or cap, and keeps that old key unusable", async () => {
    const id = "detective-fresh-interruption", f = await prospective(id);
    const prior = await f.budget.readRequest(f.worldId, f.requestKey);
    expect(await detectiveAutomaticRecoveryQualified(db, id)).toBe(true);
    expect(await recoverLocalPatchImageInterruptions(c, id)).toBe(1);
    expect(await f.budget.readRequest(f.worldId, f.requestKey)).toEqual(prior);
    expect(await f.budget.audit(f.worldId)).toMatchObject({ capMicroUsd: 4_000_000, reservedMicroUsd: 120_000, held: false });
    expect(await localPatchBudgetReadyForPublication(f.budget, f.worldId, 13)).toBe(false);
    expect(await localPatchBudgetReadyForPublication(f.budget, f.worldId, 13, { reviewRecoveryV3: await detectiveAutomaticRecoveryQualified(db, id) })).toBe(true);
    expect(await f.budget.reserve(f.worldId, { requestKey: f.requestKey, scope: "image", operationFingerprint: "d".repeat(64), reserveMicroUsd: 120_000 })).toMatchObject({ acquired: false });
    expect(await recoverLocalPatchImageInterruptions(c, id)).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["missing-family", "mixed-version", "missing-recovery", "missing-board", "historical-operator"] as const)("refuses %s before recording any continuation or buying a replacement", async fault => {
    const id = "detective-" + fault, f = await prospective(id, fault !== "missing-family");
    if (fault === "mixed-version") await db.gameScene.update({ where: { id: "scene-" + id + "-1" }, data: { sceneVersion: 12 } });
    if (fault === "missing-recovery") await db.auditLog.delete({ where: { id: leanReviewRecoveryAuditId(id) } });
    if (fault === "historical-operator") await db.auditLog.update({ where: { id: leanReviewRecoveryAuditId(id) }, data: { actorType: "ADMIN", actorId: "synthetic-operator", metaJson: JSON.stringify({ ...leanNewWorldRecoveryReceipt(id), mode: "existing-world", operatorId: "synthetic-operator", planSha256: "a".repeat(64), authorizedAt: "2026-10-22T00:00:00.000Z", binding: { worldId: f.worldId, jobId: "job_" + id, holdSha256: "b".repeat(64), ledgerSha256: "c".repeat(64), heldRequestKeys: ["self-repair:board:newyork:" + "d".repeat(64)] } }) } });
    if (fault === "missing-board") await db.gameScene.delete({ where: { id: "scene-" + id + "-8" } });
    expect(await detectiveAutomaticRecoveryQualified(db, id)).toBe(false);
    expect(await recoverLocalPatchImageInterruptions(c, id)).toBe(0);
    expect(await f.budget.readContinuationApproval(f.worldId, f.requestKey)).toBeNull();
    expect(await f.budget.audit(f.worldId)).toMatchObject({ capMicroUsd: 4_000_000, reservedMicroUsd: 120_000, held: true });
    expect(await db.targetVariantAsset.findUniqueOrThrow({ where: { id: "row-" + id } })).toMatchObject({ attempts: 1, status: "PENDING", assetId: null });
    expect(await db.auditLog.count({ where: { entityId: id, action: "local-patch-image-interruption/v1" } })).toBe(0);
    if (fault === "missing-family") expect(await db.auditLog.findUnique({ where: { id: sourceFamilyAuditId(id) } })).toBeNull();
  });
});

it("the normal cron selector admits a paid13 visual refusal for automatic recovery and still excludes an unsupported family", async () => {
  await db.game.updateMany({ where: { id: { startsWith: "detective-" } }, data: { status: "CANCELLED" } });
  const id = "detective-normal-cron-refusal"; await prospective(id);
  await db.generationJob.create({ data: { id: "job_" + id, gameId: id, status: "FAILED", currentStep: LOCAL_PATCH_QUALITY_FAILED } });
  const before = await db.generationJob.findUniqueOrThrow({ where: { id: "job_" + id } });
  expect(await nextPendingGame(c)).toBe(id);
  expect(await db.generationJob.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);
  await db.gameScene.update({ where: { id: "scene-" + id + "-4" }, data: { sceneVersion: 14 } });
  expect(await nextPendingGame(c)).toBeNull();
  expect(await db.generationJob.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);
});

it("the actual13 quality reader preserves source defects and uncertainty alongside an original all-pass assessment", () => {
  const board = DETECTIVE_PATCH_BOARDS[0]!, hide = board.hides[0]!, source = DETECTIVE_SOURCE_BOARDS.find(s => s.board === board.board)!;
  const context = { boardId: board.board, hideId: hide.id, source: { art: source.path, sha256: source.sha256, width: source.width, height: source.height }, crop: cropOf(hide), returnRect: hide.returnRect! };
  const prepared = prepareSourceNeighborContract({ ...context, version: SOURCE_NEIGHBOR_CONTRACT_VERSION, neighbors: DETECTIVE_SOURCE_NEIGHBORS.find(entry => entry.hideId === hide.id)!.neighbors }, context);
  if (!prepared.ok) throw Error("Actual Detective contract is invalid");
  const binding = { version: SOURCE_NEIGHBOR_BUNDLE_VERSION, policy: SOURCE_NEIGHBOR_POLICY, reader: SOURCE_NEIGHBOR_READER, contractSha256: prepared.contractSha256, candidateSha256: "e".repeat(64) };
  const answer = { version: SOURCE_NEIGHBOR_BUNDLE_VERSION, assessment: { hides: [{ hideId: hide.id, evidenceIds: localPatchHideEvidenceIds(hide.id), verdict: GOOD_V12_VERDICT }] },
    sourceNeighbors: { version: SOURCE_NEIGHBOR_ANSWER_VERSION, contractSha256: binding.contractSha256, candidateSha256: binding.candidateSha256,
      neighbors: prepared.contract.neighbors.map((neighbor, index) => ({ sourceId: neighbor.sourceId, outcome: "preserved", status: "pass", after: [{ ref: "person-" + index, rect: neighbor.head }], remnants: "none", occluder: null, observation: "One coherent controlled source correspondence in this native context." })) } };
  const stage = (value: unknown): QualityStage => ({ requestKey: "synthetic-quality", fingerprint: "f".repeat(64), attempt: 1, policy: leanReviewPolicy("scene-quality", "flex"),
    raw: JSON.stringify(value), model: "gpt-6.1-sol", finishReason: "stop", wireFault: null, costMicroUsd: 1000, reader: CURRENT_QUALITY_READER,
    sourceNeighbors: { manifestSha256: "b".repeat(64), binding, contract: prepared.contract } });
  expect(readQualityStage(stage(answer), hide.id, 13)?.verdict).toBe("pass");
  const duplicate = structuredClone(answer); duplicate.sourceNeighbors.neighbors[0]!.after.push({ ref: "shifted-copy", rect: { ...duplicate.sourceNeighbors.neighbors[0]!.after[0]!.rect, left: duplicate.sourceNeighbors.neighbors[0]!.after[0]!.rect.left + 12 } });
  expect(readQualityStage(stage(duplicate), hide.id, 13)).toMatchObject({ verdict: "fail", neighborsIntact: "fail" });
  const ambiguous = structuredClone(answer); ambiguous.sourceNeighbors.neighbors[1]!.after[0]!.rect = ambiguous.sourceNeighbors.neighbors[0]!.after[0]!.rect;
  expect(readQualityStage(stage(ambiguous), hide.id, 13)).toBeNull();
  const wrong = structuredClone(answer); wrong.sourceNeighbors.candidateSha256 = "0".repeat(64);
  expect(readQualityStage(stage(wrong), hide.id, 13)).toBeNull();
  expect(readQualityStage(stage(answer.assessment), hide.id, 13)).toBeNull();
  const removed = structuredClone(answer); removed.sourceNeighbors.neighbors[0]!.outcome = "removed-whole"; removed.sourceNeighbors.neighbors[0]!.after = [];
  expect(readQualityStage(stage(removed), hide.id, 13)?.verdict).toBe("pass");
});
