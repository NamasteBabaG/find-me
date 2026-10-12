import type { PrismaClient, TargetVariantAsset } from "@prisma/client";
import { vi } from "vitest";
import type { Container } from "../../container";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { localPatchHideEvidenceIds } from "../local-patch-judge";
import { LOCAL_PATCH_PUBLICATION_ACTION, localPatchPublicationGeometryHash } from "../local-patch-publication-policy";
import { bill, PASSING_ANSWER } from "./local-patch-fixtures";

/** A complete passing v12 player-review verdict, for the quality reviewer's answers. */
export const GOOD_V12_VERDICT = { ...PASSING_ANSWER, faceLikeness: "pass", faceReadable: "pass", severeSeam: "pass", ageAppropriate: "pass",
  boundaryIntegrity: Object.fromEntries(["left", "top", "right", "bottom"].map(edge => [edge, { status: "pass", observation: "Continuous native heads, bodies and supports across this join" }])),
  lightingMatch: "pass", neighborsIntact: "pass", integrationEvidence: { style: "Painted contours match original faces",
    lighting: "Local scene shadows match", neighbors: "All four original neighbor quadrants preserved" } };

/** Synthetic prose of an exact length; no real reviewer text is used anywhere. */
export const prose = (length: number, seed: string) => (seed + " ").repeat(Math.ceil(length / (seed.length + 1))).slice(0, length);

/** A complete, transport-clean v1 anatomy answer whose traces have the given lengths. */
export const longAnswer = (hideId: string, head: number, body: number, occlusion: number, over: Record<string, unknown> = {}) => JSON.stringify({ cases: [{
  id: `${hideId}:people`, state: "coherent", visibleBody: true, headConnection: "connected",
  headTrace: prose(head, "Each visible head joins its own neck above its own collar across the left and right joins."),
  bodyTrace: prose(body, "Every torso continues into its own arms, legs and supported feet without a straight cut."),
  occlusion: prose(occlusion, "The stall counter hides the vendor's lower legs at a coherent depth."), faults: [], ...over }] });

/** The hide a dual question binds, read from its immutable candidate binding. */
export const boundHide = (prompt: string) => (JSON.parse(/Immutable candidate binding: (\{.*?\})\. Evidence attempt/.exec(prompt)![1]!) as { hideId: string; attempts: number });

/** Both HIGH reviewers, synthetic: Opus passes; Sol answers what `anatomy` says. */
export function dualReviewer(id: string, anatomy: (hideId: string, call: number, imageAttempt: number) => string) {
  let calls = 0, anatomyCalls = 0;
  return vi.fn<NonNullable<Container["visualReview"]>["request"]>(async question => {
    const quality = question.role === "scene-quality", bound = boundHide(question.prompt);
    return { verdict: null, model: quality ? "claude-opus-5-5" : "gpt-6.1-sol", requestId: `dual-${id}-${++calls}`,
      finishReason: quality ? "end_turn" : "stop", wireFault: null, costUnknown: false,
      usage: quality ? { input_tokens: 2000, output_tokens: 500 } : { prompt_tokens: 2000, completion_tokens: 500 },
      raw: quality ? "```json\n" + JSON.stringify({ hides: [{ hideId: bound.hideId, evidenceIds: localPatchHideEvidenceIds(bound.hideId), verdict: GOOD_V12_VERDICT }] }) + "\n```"
        : anatomy(bound.hideId, ++anatomyCalls, bound.attempts) };
  });
}

export const publicationBinding = (gameId: string, row: TargetVariantAsset) => {
  const receipt = JSON.parse(row.judgeJson!);
  return { gameId, sceneVersion: 12, hideId: receipt.hide, variantId: row.id, attempts: row.attempts, identityAssetId: `ast-sheet-${gameId}`,
    identitySha256: receipt.boardReview.dual.identitySha256, assetId: row.assetId!, imageSha256: receipt.judgedSha256,
    geometrySha256: localPatchPublicationGeometryHash(row), judgeJson: row.judgeJson };
};

/** Settle synthetic earlier work so the world has committed exactly this much. */
export async function spendTo(c: Container, gameId: string, committedMicroUsd: number) {
  const budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(gameId);
  const amount = committedMicroUsd - (await budget.audit(worldId)).committedMicroUsd;
  await budget.reserve(worldId, { requestKey: `earlier-work-${committedMicroUsd}`, scope: "image", operationFingerprint: "earlier-synthetic-work", reserveMicroUsd: amount });
  await budget.settle(worldId, `earlier-work-${committedMicroUsd}`, bill(`earlier-${gameId}-${committedMicroUsd}`, amount));
}

/**
 * The row exactly as the deployed code (ee74b6c3) wrote it after reading this
 * same paid answer with its 600-character reader: unreadable, no reader named,
 * not published. Only the reading changes; the paid evidence is the real one.
 */
export async function asDeployedReaderRefusal(db: PrismaClient, gameId: string, row: TargetVariantAsset) {
  const receipt = JSON.parse(row.judgeJson!);
  const { reader: _reader, ...continuity } = receipt.boardReview.dual.continuity;
  const { evidenceAttempts: _log, evidenceDiagnosis: _diagnosis, ...rest } = receipt;
  const old = { ...rest, verdict: null, wireFault: "schema", qualityDisposition: { state: "unresolved", faults: ["integration-review-unreadable"] },
    boardReview: { ...receipt.boardReview, dual: { ...receipt.boardReview.dual, continuity } } };
  await db.$transaction(async tx => {
    await tx.targetVariantAsset.update({ where: { id: row.id }, data: { judgeJson: JSON.stringify(old), status: "FAILED",
      lastError: "quality-unresolved: integration-review-unreadable", rejectedAssetIdsJson: JSON.stringify([row.assetId]) } });
    await tx.targetInstance.update({ where: { id: row.targetInstanceId }, data: { status: "FAILED" } });
    await tx.auditLog.deleteMany({ where: { entityId: gameId, action: LOCAL_PATCH_PUBLICATION_ACTION, metaJson: { contains: row.id } } });
  });
  return db.targetVariantAsset.findUniqueOrThrow({ where: { id: row.id } });
}
