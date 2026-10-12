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
/** The same, ending in a non-space so trimming keeps the exact length. */
const exactProse = (length: number, seed: string) => { const text = prose(length, seed); return text.endsWith(" ") ? `${text.slice(0, -1)}.` : text; };

/**
 * The retained 390-character refusal of 12 October, sanitized. Same shape,
 * checks and field lengths as the real Opus HIGH answer about a synthetic child:
 * a located pictureWhole fail for a toy left hanging with no hand, every other
 * check passing, four boundary observations and three evidence fields. The words
 * are synthetic; no reviewer text is copied.
 */
export const LOCATED_390 = Object.freeze({ reason: 179, where: 390, style: 270, lighting: 210, neighbors: 389, left: 302, top: 257, right: 303, bottom: 263 });
export const LOCATED_390_DEFECT = "Left of the child at knee height a single disc on a bar hangs in the air with nothing holding it";
export const located390Verdict = () => ({ ...GOOD_V12_VERDICT, pictureWhole: "fail", verdict: "fail",
  reason: exactProse(LOCATED_390.reason, "The child is recognizable and well placed, but part of the replaced toy hangs unsupported beside her."),
  faults: [{ check: "pictureWhole", where: exactProse(LOCATED_390.where, `${LOCATED_390_DEFECT}; the replaced child's toy was cut in two.`) }],
  integrationEvidence: { style: exactProse(LOCATED_390.style, "Same inked contours and textured painted fabric as the neighbouring children."),
    lighting: exactProse(LOCATED_390.lighting, "Warm daylight from the upper left with a soft cast shadow on the cobbles."),
    neighbors: exactProse(LOCATED_390.neighbors, "Every neighbour keeps one coherent head, neck, torso and hands; a toy part is left behind.") },
  boundaryIntegrity: Object.fromEntries((["left", "top", "right", "bottom"] as const).map(edge => [edge, { status: "pass",
    observation: exactProse(LOCATED_390[edge], "Heads, bodies and supports continue unchanged across this join with no doubled face.") }])) });
export const located390Answer = (hideId: string, verdict: Record<string, unknown> = located390Verdict()) =>
  "```json\n" + JSON.stringify({ hides: [{ hideId, evidenceIds: localPatchHideEvidenceIds(hideId), verdict }] }) + "\n```";

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
 * The same refusal after `round` evidence rounds: the deployed loop reached
 * nine, and both persisted counters belong to that round. Evidence rounds are
 * questions about ONE picture; the row's `attempts` (pictures painted) is not
 * touched, and the paid answers stay exactly the ones bought.
 */
export async function atEvidenceRound(db: PrismaClient, row: TargetVariantAsset, round: number) {
  const receipt = JSON.parse(row.judgeJson!);
  receipt.boardReview.evidenceReviewAttempt = round;
  // The stage that round refused: the anatomy answer, or the quality answer when no anatomy question was bought.
  (receipt.boardReview.dual.continuity ?? receipt.boardReview.dual.quality).attempt = round;
  await db.targetVariantAsset.update({ where: { id: row.id }, data: { judgeJson: JSON.stringify(receipt) } });
  return db.targetVariantAsset.findUniqueOrThrow({ where: { id: row.id } });
}

/**
 * A quality refusal exactly as the deployed code (ee74b6c3) wrote it: its strict
 * reader could not read this Opus answer, so no anatomy question was ever bought.
 * Only the reading changes; the paid answer is the real one.
 */
export async function asDeployedQualityRefusal(db: PrismaClient, gameId: string, row: TargetVariantAsset) {
  const receipt = JSON.parse(row.judgeJson!);
  const { reader: _reader, reading: _reading, readFault: _fault, ...quality } = receipt.boardReview.dual.quality;
  const { evidenceAttempts: _log, evidenceDiagnosis: _diagnosis, ...rest } = receipt;
  const old = { ...rest, verdict: null, wireFault: "schema", qualityDisposition: { state: "unresolved", faults: ["integration-review-unreadable"] },
    boardReview: { ...receipt.boardReview, dual: { ...receipt.boardReview.dual, quality, continuity: null } } };
  await db.$transaction(async tx => {
    await tx.targetVariantAsset.update({ where: { id: row.id }, data: { judgeJson: JSON.stringify(old), status: "FAILED",
      lastError: "quality-unresolved: integration-review-unreadable", rejectedAssetIdsJson: JSON.stringify([row.assetId]) } });
    await tx.targetInstance.update({ where: { id: row.targetInstanceId }, data: { status: "FAILED" } });
    await tx.auditLog.deleteMany({ where: { entityId: gameId, action: LOCAL_PATCH_PUBLICATION_ACTION, metaJson: { contains: row.id } } });
  });
  return db.targetVariantAsset.findUniqueOrThrow({ where: { id: row.id } });
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
