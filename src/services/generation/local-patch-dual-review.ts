import { nativeDetailQuestion } from "./native-detail-evidence";
import type { NativeDetailEvidence } from "../../domain/generation/native-detail";
import { BOUND_SUBJECT_QUALITY_ENVELOPE_READER_V2 } from "../../domain/generation/bound-subject-quality-envelope";
import { singleMediumEvidence, singleMediumPrompt, singleMediumAnatomyPrompt } from "./single-medium-evidence";
import { publishedCrownSubjectAnchor } from "./published-crown-repair";
import { singleReviewHeadEvidence } from "./single-review-head-evidence";
import { targetHeadReturnPrompt } from "../../domain/generation/target-head-return";
import { ensureSingleMediumReviewPolicy } from "./single-medium-policy";
import { SINGLE_VISUAL_REVIEW_VERSION, SINGLE_MEDIUM_VISUAL_REVIEW_VERSION, readSingleVisualReview } from "../../domain/generation/single-visual-review";
import { singleLowReviewAuthorization as detectivesSingleReviewAuthorization } from "./single-low-policy";
import { hasLocalPatchCapability } from "../../domain/scene/local-patch-family";
import sharp from "sharp";
import type { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { PLAYER_REVIEW_MODE } from "./local-patch-player-review";
import { visualReviewCharge } from "../../infra/generation/visual-review-pricing";
import { CONTINUITY_READER_STRICT, localPatchRuntimeContinuityVerdict, readLocalPatchBodyContinuity, type ContinuityReading } from "../../domain/scene/local-patch-body-continuity";
import { nextLocalPatchEvidenceStep, type EvidenceAttempt, type EvidenceDiagnosis, type EvidenceFaultKind, type EvidenceRole, type EvidenceStrategy } from "../../domain/scene/local-patch-evidence-policy";
import { CURRENT_CONTINUITY_READER, CURRENT_QUALITY_READER, localPatchBoundEnvelopeUndecided, qualityReaderReadsMore, qualityStageReader, qualityStageRaw, subjectStageRaw, readContinuityStage, readQualityStage, verifiedDualStage, visualStageReadable,
  type ContinuityReReading, type ContinuityStage, type DualReviewProof, type DualReviewStage, type DualStageBase, type QualityReReading, type QualityStage,
  type SubjectStage, sourceNeighborQualityEvidence, readSourceNeighborQualityStage, sourceNeighborPublicationMatches,
  type SourceNeighborQualityEvidence } from "./local-patch-dual-evidence";
import { SUBJECT_CHECKS, SUBJECT_FORMAT_RECOVERY_V2, SUBJECT_POLICY_V2, SUBJECT_POLICY_VERSION, SUBJECT_READER, SUBJECT_READER_V2, poseOnlyV1Refusal, readSubjectAnswer,
  readSubjectAnswerV2, subjectCollectionRefusal, subjectHasOnlyOverlongObservations, type SubjectAppearance, type SubjectPlan } from "../../domain/generation/subject-policy";
import { SUBJECT_QUALITY_BUNDLE_VERSION } from "../../domain/generation/subject-quality-bundle";
import { localPatchBoardForVersion } from "../../domain/scene/local-patch-catalog";
import { subjectPlanOfHide, subjectPlanSha256, subjectUpgradeOf, type SubjectUpgradeReceipt } from "./subject-enrollment";
import { loadSubjectPhoto, subjectQuestion, combinedQualitySubjectQuestion, SubjectEvidenceUnavailable, subjectV2RefusalCodes, withSubject, withSubjectV2 } from "./local-patch-subject-review";
import { askContinuityInBackground, backgroundRoundsOnImage, permanentFailureOnImage, providerEndedFailed, reconcileRefusedBackgroundRound,
  roundAnswered, type BackgroundGate, type ImageRound } from "./continuity-background";
import type { BackgroundReviewBinding } from "../../domain/generation/background-review-round";
import { isLeanWorld } from "./lean-release";
import { leanCapacityRecoveryOf } from "./lean-capacity-recovery-pin";
import { leanReviewRecoveryOf } from "./lean-review-recovery-pin";
import { localPatchCrowdContinuityPrompt, localPatchHeadContinuityPrompt } from "./local-patch-body-continuity";
import { prepareVisualReview, sceneQualityQuestion, parseVisualSceneVerdicts, diagnoseVisualSceneAnswer, visualReviewMaxCharge, type PreparedVisualReview } from "./visual-review";
import type { LocalPatchJudgeResult, LocalPatchBoardJudgeResult, QualityReader, QualityReadFault } from "./local-patch-judge";
import { QUALITY_READER_STRICT, localPatchQualityDisposition, parseLocalPatchVerdict } from "./local-patch-judge";
import type { prepareLocalPatchBoardReview, LocalPatchBoardReviewDeps } from "./local-patch-board-review";
import { purchaseOnce, type PurchaseOutcome } from "./paid-operation";
import { fenceLocalPatchImages, LocalPatchRetainedPurchaseStore } from "./local-patch-lifecycle";
import { inventorySelfRepairRequest } from "./local-patch-self-repair";
import { LOCAL_PATCH_PHASE_MARGIN_MS, LOCAL_PATCH_MIN_PROVIDER_MS } from "./local-patch-render";
import { sha256Bytes } from "./fixed-sprite";
import { recoverPreparedLocalPatchReview } from "./local-patch-review-interruption-recovery";
import { localPatchEvidenceHistory, localPatchEvidenceRecovery, evidenceKindOfWireFault } from "./local-patch-review-recovery";
import { DUAL_VISUAL_REVIEW_V2, DUAL_VISUAL_REVIEW_V3, DUAL_VISUAL_REVIEW_VERSION, dualVisualReviewVersion, qualityQuestionFor, QUALITY_QUESTION_OBJECT_JOINS, type DualVisualReviewVersion } from "./visual-review-release";
import { prepareJoinDetails } from "./local-patch-integration-evidence";
import { authoredLocalPatchReviewBinding } from "./local-patch-authored-return";
import { AUTHORED_PATCH_COMPOSITION_VERSION, type AuthoredLocalPatchReturnContract,
  type AuthoredLocalPatchRecoveryContract, type PatchRectangle } from "../../domain/scene/local-patch-return-region";
import { AUTHORED_RECOVERY_COMPOSITION_VERSION } from "../../domain/scene/local-patch-authored-recovery";
import { sourceNeighborQualityBundleDirection } from "../../domain/generation/source-neighbor-quality-bundle";
import { isBackgroundReviewPolicy, isLeanReviewPolicy, type VisualReviewEffort, type VisualReviewJudge, type VisualReviewTier,
  type VisualReviewTransport } from "../../domain/generation/visual-review-policy";
import { WorldBudgetError, type BudgetJson } from "./world-budget";
import type { WorldBudgetRequest } from "../../domain/generation/world-budget";
import { LEAN_REVIEW_RESERVE_MICRO_USD, dualQuestionReserveMicroUsd, type DualReviewRole } from "../../domain/generation/dual-review-reserve";
import { askQualityThroughBatch, qualityBatchKeyOf } from "./quality-batch";

type Prepared = Extract<Awaited<ReturnType<typeof prepareLocalPatchBoardReview>>, { ready: true }>;
type Bought = Extract<PurchaseOutcome, { kind: "bought" }>;
const STANDARD: EvidenceStrategy = "standard/v1";
const WIRE_FAULTS = ["timeout", "http", "no-content", "truncated", "wrong-model", "not-json"] as const;
const CROWD_FOCUS = "Every visible person in this final context, especially people crossing the four compositing joins, not only the personalized child.";
/** The v1 runtime question, verbatim: its paid fingerprints must not move. */
const V1_CROWD_INSPECTION = "\nRUNTIME CROWD INSPECTION: This case covers ALL people in the context. Trace each visible head/body separately, including bystanders. The case is broken if ANY visible person has a located impossible connection or straight cut. A coherent case requires ALL visible people to be coherent; a good target never excuses a broken neighbour. Summarize the observed connections in headTrace/bodyTrace. Clean complete removal of a bystander is allowed. Do not fail a person naturally continuing outside an evidence crop; use the context. Use unsure only for genuinely insufficient evidence.";

/** What a recovery question changes. Never the model, effort, images or policy;
 * a standard question carries no addendum, so its historical bytes are kept. */
function continuityAddendum(strategy: EvidenceStrategy, version: DualVisualReviewVersion): string {
  if (strategy === "strict-json/v1") return "\nFORMAT RECOVERY: a previous answer to this question about these same pixels could not be read; this is not a visual refusal. Return exactly one JSON object in the contract above, with no Markdown fence, prose or second object, exactly the listed keys, and every case id exactly once. Do not infer any previous verdict.";
  if (strategy === "compact/v1") return version === DUAL_VISUAL_REVIEW_V2
    ? "\nSIZE RECOVERY: a previous answer to this question about these same pixels was cut off or exceeded the stated limits. Use one short sentence per trace, at most 120 characters, and list only the required people. Never omit a defect or a defective person to save space."
    : "\nSIZE RECOVERY: a previous answer to this question about these same pixels was cut off or exceeded its bounds. Keep headTrace, bodyTrace and occlusion each to at most 400 characters and each fault location to at most 200, naming the observed connections in one or two sentences. Never omit a fault to save space.";
  if (strategy === "decide/v1") return "\nDECISION RECOVERY: a previous independent answer about these same pixels was uncertain or did not show the personalized child. Decide from the FINAL AFTER context and the same-pixels head detail: name the solid occluder for any natural occlusion; mark broken and locate a cut, missing head, merged face or disconnected limb. Use unsure only when these pixels genuinely cannot show a connection.";
  return "";
}
function qualityAddendum(strategy: EvidenceStrategy): string {
  if (strategy === "strict-json/v1") return "\nFORMAT RECOVERY: a previous answer about these exact unchanged pixels could not be read; this is not a visual refusal. Inspect them independently and return only the exact JSON schema with every supplied hide and evidence ID, with no prose or Markdown. Do not infer the previous verdict.";
  if (strategy === "compact/v1") return "\nSIZE RECOVERY: a previous answer about these exact unchanged pixels was cut off or exceeded its bounds. Keep the reason, every observation and every fault location short, at most 300 characters each, with one located fault per failed check. Never omit a failed check or its location to save space.";
  return "";
}

/** Same FINAL pixels at each join, with a head detail. No BEFORE/portrait may
 * supply an imagined missing head. The context disambiguates evidence borders. */
export async function runtimeContinuityQuestion(prepared: Prepared, binding: object, attempt: number,
  version: DualVisualReviewVersion = DUAL_VISUAL_REVIEW_VERSION, strategy: EvidenceStrategy = STANDARD,
  /** An enrolled world's new question is asked in the background: the same words, a different operation. */
  transport?: VisualReviewTransport,
  /** A lean world's question (local-patch-lean/v1): the same words, at this tier, under its lean policy. */
  tier?: VisualReviewTier) {
  const hide = prepared.request.hides[0]!;
  if (!hide.closeupPng || hide.boundaryComparisons?.length !== 4) throw Error("Dual review requires all four continuous joins and the final head detail");
  const id = `${hide.hideId}:people`;
  const images = [hide.afterPng, hide.closeupPng];
  const labels = [`CASE ${id}: FINAL AFTER context. Inspect ALL people, including bystanders and the target.`,
    `CASE ${id}: SAME final pixels, target head/upper-body detail. This is not a portrait reference.`];
  for (const strip of hide.boundaryComparisons) {
    const meta = await sharp(strip.png).metadata();
    if (!meta.width || !meta.height || (meta.width - 16) % 2) throw Error("Invalid registered boundary pair");
    const width = (meta.width - 16) / 2;
    images.push(await sharp(strip.png).extract({ left: width + 16, top: 0, width, height: meta.height }).png().toBuffer());
    labels.push(`CASE ${id}: FINAL AFTER ${strip.edge} join; ${strip.axis}=${strip.joinOffset} in this strip. Evidence crop borders are not cuts in the game. Verify against the full AFTER context.`);
  }
  const question = version === DUAL_VISUAL_REVIEW_V2 ? localPatchCrowdContinuityPrompt(id, CROWD_FOCUS)
    : localPatchHeadContinuityPrompt([{ id, focus: CROWD_FOCUS }]) + V1_CROWD_INSPECTION;
  return prepareVisualReview({ role: "head-continuity", effort: "high", images, labels, ...(transport ? { transport } : {}), ...(tier ? { tier } : {}),
    prompt: question + continuityAddendum(strategy, version) + `\nImmutable candidate binding: ${JSON.stringify(binding)}. Evidence attempt: ${attempt}.` });
}

/** A review round whose evidence could not decide: the exact class, for the
 * receipt's per-image log, and what the recovery policy makes of it. */
export type DualEvidenceFault = { readonly attempt: EvidenceAttempt; readonly diagnosis: EvidenceDiagnosis | null; readonly reread: boolean };
type Reviewed = { kind: "reviewed"; bought: Bought; wire: LocalPatchJudgeResult; verdicts: LocalPatchBoardJudgeResult["verdicts"];
  proof: DualReviewProof; newCostCents: number; evidence: DualEvidenceFault | null; diagnosis: EvidenceDiagnosis | null; salvaged: boolean };
type Waiting = { kind: "waiting"; outcome: { state: "pending" | "held"; reason: string; replayed: boolean; costCents: number } };

function wireKind(stage: DualReviewStage): EvidenceFaultKind {
  if (stage.wireFault) return evidenceKindOfWireFault(stage.wireFault) === "unknown" ? "shape" : evidenceKindOfWireFault(stage.wireFault);
  if (stage.model !== stage.policy.model) return "wrong-model";
  return "truncated";
}
function readKind(read: ContinuityReading, reason: string): { kind: EvidenceFaultKind; code: string; path: string | null } {
  if (!read.ok) return { kind: read.fault.code, code: read.fault.code, path: read.fault.path || null };
  return { kind: reason === "conflict" ? "conflict" : "unsure", code: reason, path: null };
}
/** Located faults from a reading, for the existing picture-defect route. */
function readFaults(read: ContinuityReading) {
  if (!read.ok) return [];
  const faults = read.people.flatMap(p => p.faults.map(f => ({ check: "pictureWhole", where: f.where.slice(0, 300) })));
  if (!faults.length) faults.push({ check: "pictureWhole", where: (read.people.find(p => p.state === "broken")?.bodyTrace ?? read.people[0]?.bodyTrace ?? "Impossible head/body connection in final context").slice(0, 300) });
  return faults;
}
/** The quality reviewer's verdict with the independent anatomy result applied:
 * a located defect fails pictureWhole; persistent explicit uncertainty about
 * the pixels leaves pictureWhole unsure, which the bounded image route repairs.
 * It is re-read under the same reader that read the quality answer. */
function withAnatomy(verdicts: LocalPatchBoardJudgeResult["verdicts"], hideId: string, result: "repair" | "uncertain", read: ContinuityReading,
  reader: QualityReader, sceneVersion = 12) {
  const wireVerdict = Object.fromEntries(Object.entries(verdicts[hideId]!).filter(([key]) =>
    !["claimedVerdict", "verdictOverridden", "downgraded", "contradicted", "unclassified"].includes(key)));
  return { ...verdicts, [hideId]: result === "repair"
    ? parseLocalPatchVerdict({ ...wireVerdict, pictureWhole: "fail", verdict: "fail", reason: "Final-image anatomy checks found a visible defect",
      faults: [...verdicts[hideId]!.faults, ...readFaults(read)].slice(0, 16) }, sceneVersion, reader)
    : parseLocalPatchVerdict({ ...wireVerdict, pictureWhole: "unsure", verdict: "unsure",
      reason: "Final-image anatomy checks stayed uncertain about these pixels",
      faults: verdicts[hideId]!.faults.filter(f => f.check !== "pictureWhole") }, sceneVersion, reader) };
}

type RetainedBinding = { sceneVersion?: 13; imageSha256: string; geometrySha256: string; identitySha256: string; hideId: string;
  authoredReturn?: AuthoredLocalPatchReturnContract; authoredRecovery?: AuthoredLocalPatchRecoveryContract;
  sourceNeighbors?: SourceNeighborQualityEvidence };
const sameAuthoredReturn = (a: RetainedBinding | undefined, b: RetainedBinding) =>
  a?.sceneVersion === b.sceneVersion && JSON.stringify(a?.authoredReturn) === JSON.stringify(b.authoredReturn)
    && JSON.stringify(a?.authoredRecovery) === JSON.stringify(b.authoredRecovery);
/**
 * Read-only: what a retained dual answer decides under the reader its question
 * now uses. Only an answer read by a superseded reader qualifies, only for the
 * exact pixels, geometry and identity it was asked about, and only while every
 * paid stage still proves its own settled bill. Nothing is reserved, bought or
 * written: the automatic pipeline and the dry-run planner share this.
 *
 * Two kinds: an anatomy answer refused by its strict reader (the quality answer
 * passed), or a quality answer refused by its strict reader, after which no
 * anatomy question was ever bought.
 */
export async function readRetainedAnswer(db: Prisma.TransactionClient, worldId: string, version: DualVisualReviewVersion,
  prior: DualReviewProof | undefined, binding: RetainedBinding) {
  const none = { ok: false as const, reason: "No retained answer awaits a corrected reading" };
  if (!prior?.quality || prior.version !== version || prior.hideId !== binding.hideId
    || prior.imageSha256 !== binding.imageSha256 || prior.geometrySha256 !== binding.geometrySha256 || prior.identitySha256 !== binding.identitySha256
    || !sameAuthoredReturn(prior, binding)
    || binding.sourceNeighbors !== undefined && JSON.stringify(prior.quality.sourceNeighbors) !== JSON.stringify(binding.sourceNeighbors)) return none;
  const gameId = worldId.endsWith(":board-wizard") ? worldId.slice(0, -":board-wizard".length) : "";
  if (!gameId || !await sourceNeighborPublicationMatches(db, { gameId, sceneVersion: binding.sceneVersion ?? 12, hideId: binding.hideId, imageSha256: binding.imageSha256,
    judgeJson: JSON.stringify({ compositionVersion: binding.authoredRecovery ? AUTHORED_RECOVERY_COMPOSITION_VERSION : AUTHORED_PATCH_COMPOSITION_VERSION,
      ...(binding.authoredReturn ? { authoredReturn: binding.authoredReturn } : {}),
      ...(binding.authoredRecovery ? { authoredRecovery: binding.authoredRecovery } : {}) }) }, prior.quality))
    return { ok: false as const, reason: "Retained source-neighbor evidence differs from the authoritative placement" };
  if (!prior.continuity) return readRetainedQuality(db, worldId, prior, binding);
  if (prior.continuity.reading || (prior.continuity.reader ?? CONTINUITY_READER_STRICT) === CURRENT_CONTINUITY_READER[version]) return none;
  const sourceBound = !!prior.quality.sourceNeighbors;
  const quality = await verifiedDualStage(db, worldId, prior.quality, "scene-quality", {
    ...(sourceBound ? { allowLean: true } : {}), authoredReviewBinding: authoredLocalPatchReviewBinding(binding) });
  if (!quality || !await verifiedDualStage(db, worldId, prior.continuity, "head-continuity", {
    ...(sourceBound ? { allowLean: true, allowBackground: true } : {}), authoredReviewBinding: authoredLocalPatchReviewBinding(binding) }))
    return { ok: false as const, reason: "Retained review answers no longer prove their own settled charges" };
  // The quality answer keeps the reading its own decision was made with.
  const qualityVerdict = readQualityStage(prior.quality, binding.hideId, binding.sceneVersion ?? 12), qualityReader = qualityStageReader(prior.quality) ?? QUALITY_READER_STRICT;
  if (localPatchQualityDisposition(qualityVerdict, binding.sceneVersion ?? 12, { hideId: binding.hideId, reader: qualityReader }).state !== "acceptable")
    return { ok: false as const, reason: "The retained quality answer does not pass" };
  const verdicts: LocalPatchBoardJudgeResult["verdicts"] = { [binding.hideId]: qualityVerdict };
  const reader = CURRENT_CONTINUITY_READER[version], read = readLocalPatchBodyContinuity(prior.continuity.raw, [`${binding.hideId}:people`], reader);
  return { ok: true as const, role: "continuity" as const, prior: { ...prior, continuity: prior.continuity }, quality, verdicts, qualityReader,
    reader, read, verdict: localPatchRuntimeContinuityVerdict(read) };
}

/** A quality answer its strict reader refused, read by the current one. A
 * readable answer is what a fresh one would be under that reader; one still
 * unreadable is named exactly (code and path) for the recovery policy. */
async function readRetainedQuality(db: Prisma.TransactionClient, worldId: string, prior: DualReviewProof, binding: RetainedBinding) {
  if (prior.quality.reading || !qualityReaderReadsMore(CURRENT_QUALITY_READER, prior.quality.reader))
    return { ok: false as const, reason: "No retained answer awaits a corrected reading" };
  const quality = await verifiedDualStage(db, worldId, prior.quality, "scene-quality", {
    ...(prior.quality.sourceNeighbors ? { allowLean: true } : {}), authoredReviewBinding: authoredLocalPatchReviewBinding(binding) });
  if (!quality) return { ok: false as const, reason: "Retained review answers no longer prove their own settled charges" };
  const reader = CURRENT_QUALITY_READER;
  const verdicts = prior.quality.sourceNeighbors
    ? { [binding.hideId]: readQualityStage({ ...prior.quality, reader }, binding.hideId, binding.sceneVersion ?? 12) }
    : parseVisualSceneVerdicts(prior.quality.raw, [binding.hideId], binding.sceneVersion ?? 12, "ready-only/v1", PLAYER_REVIEW_MODE, reader);
  const fault: QualityReadFault | null = verdicts[binding.hideId] ? null
    : diagnoseVisualSceneAnswer(prior.quality.sourceNeighbors ? qualityStageRaw(prior.quality) : prior.quality.raw,
      [binding.hideId], binding.sceneVersion ?? 12, "ready-only/v1", PLAYER_REVIEW_MODE, reader);
  const disposition = localPatchQualityDisposition(verdicts[binding.hideId] ?? null, binding.sceneVersion ?? 12, { hideId: binding.hideId, reader }).state;
  // A pass would still need its anatomy question, which is never free.
  if (disposition === "acceptable") return { ok: false as const, reason: "The re-read quality answer passes; its anatomy question is a paid one" };
  return { ok: true as const, role: "quality" as const, prior, quality, verdicts, reader, fault, disposition };
}

/** Decide a retained answer again, with no reservation, question or provider. */
async function decideRetainedAnswer(c: Container, prepared: Prepared, version: DualVisualReviewVersion,
  binding: RetainedBinding): Promise<Reviewed | Waiting> {
  const entry = prepared.entries.find(e => e.hide.id === binding.hideId)!;
  const receipt = JSON.parse(entry.row.judgeJson!);
  const not = (reason: string): Waiting => ({ kind: "waiting", outcome: { state: "pending", reason, replayed: true, costCents: 0 } });
  // Only a live, paid, unrefunded world receives a decision, as for any review.
  const live = await c.db.game.findUnique({ where: { id: prepared.game.id }, include: { orders: true } });
  if (!live || live.status !== "TARGETS_GENERATING" || live.deletedAt || live.ownerId !== prepared.game.ownerId
    || !live.orders.some(o => o.userId === live.ownerId && o.paymentStatus === "PAID" && o.paidAt && !o.refundedAt)
    || live.orders.some(o => o.paymentStatus === "REFUNDED" || o.refundedAt)) return not("The game is no longer a paid world in generation");
  const sourceNeighbors = sourceNeighborQualityEvidence(prepared.placementContext, binding.hideId, binding.imageSha256, receipt);
  const retained = await readRetainedAnswer(c.db, prepared.worldId, version, receipt.boardReview?.dual as DualReviewProof | undefined,
    { ...binding, ...(sourceNeighbors ? { sourceNeighbors } : {}) });
  if (!retained.ok) return not(retained.reason);
  const readAt = new Date().toISOString();
  const bought: Bought = { kind: "bought", bytes: retained.quality.bytes, evidence: retained.quality.evidence, replayed: true, settledFromRetained: false };
  const wire = JSON.parse(retained.quality.bytes.toString()) as LocalPatchJudgeResult;
  if (retained.role === "quality") {
    const { prior, verdicts, reader, fault, disposition } = retained;
    const reading: QualityReReading = { version: "quality-reading/v1", reader, previousReader: prior.quality.reader ?? QUALITY_READER_STRICT,
      sourceRequestKey: prior.quality.requestKey, sourceFingerprint: prior.quality.fingerprint,
      rawSha256: sha256Bytes(Buffer.from(prior.quality.raw ?? "")), disposition, readAt };
    const proof: DualReviewProof = { ...prior, quality: { ...prior.quality, reading, ...(fault ? { readFault: fault } : {}) } };
    const base = { kind: "reviewed" as const, bought, proof, newCostCents: 0, salvaged: true };
    // Readable now: decided exactly as a fresh answer under this reader (a
    // located defect is a repair; the original text is kept whole).
    if (verdicts[binding.hideId]) return { ...base, wire, verdicts, evidence: null, diagnosis: null };
    const attempt: EvidenceAttempt = { attempt: prior.quality.attempt, role: "quality", kind: fault!.code, code: fault!.code, path: fault!.path || null,
      strategy: prior.quality.strategy ?? STANDARD, at: readAt, imageSha256: binding.imageSha256 };
    return classify({ ...base, wire, verdicts }, entry.row, receipt, attempt, null, binding.hideId, true);
  }
  const { prior, verdicts, qualityReader, reader, read, verdict } = retained;
  const reading: ContinuityReReading = { version: "continuity-reading/v1", reader, previousReader: prior.continuity.reader ?? CONTINUITY_READER_STRICT,
    sourceRequestKey: prior.continuity.requestKey, sourceFingerprint: prior.continuity.fingerprint,
    rawSha256: sha256Bytes(Buffer.from(prior.continuity.raw ?? "")), disposition: verdict.disposition, reason: verdict.reason, readAt };
  const proof: DualReviewProof = { ...prior, continuity: { ...prior.continuity, reading } };
  const base = { kind: "reviewed" as const, bought, proof, newCostCents: 0, salvaged: true };
  if (verdict.disposition === "pass") return { ...base, wire, verdicts, evidence: null, diagnosis: null };
  if (verdict.disposition === "repair") return { ...base, wire, verdicts: withAnatomy(verdicts, binding.hideId, "repair", read, qualityReader, binding.sceneVersion ?? 12), evidence: null, diagnosis: null };
  // Still undecided under the new reading: the round keeps its number; its
  // classification is now exact, and the policy chooses the next question.
  const { kind, code, path } = readKind(read, verdict.reason);
  const attempt: EvidenceAttempt = { attempt: prior.continuity.attempt, role: "continuity", kind, code, path,
    strategy: prior.continuity.strategy ?? STANDARD, at: readAt, imageSha256: binding.imageSha256 };
  return classify({ ...base, wire, verdicts }, entry.row, receipt, attempt, read, binding.hideId, true);
}

/** Record an undecided round and apply the policy: another question later, or
 * (for an explicitly uncertain reviewer after a decisive question) the image route. */
function classify(result: Omit<Reviewed, "evidence" | "diagnosis">, row: Prepared["entries"][number]["row"], receipt: Record<string, unknown>,
  attempt: EvidenceAttempt, read: ContinuityReading | null, hideId: string, reread: boolean): Reviewed {
  const history = localPatchEvidenceHistory(receipt, row.updatedAt).filter(h => !(reread && h.attempt === attempt.attempt));
  const step = nextLocalPatchEvidenceStep([...history, attempt], Date.now());
  if (step?.action === "repair" && read && result.verdicts[hideId])
    return { ...result, verdicts: withAnatomy(result.verdicts, hideId, "uncertain", read, qualityStageReader(result.proof.quality) ?? QUALITY_READER_STRICT, result.proof.sceneVersion ?? 12),
      evidence: null, diagnosis: step.diagnosis };
  // The row keeps a wire-fault marker for every older reader of receipts; the
  // exact class, code and JSON path live in the per-image evidence log.
  const exact = WIRE_FAULTS.find(fault => fault === attempt.code);
  const wireFault = result.wire.wireFault ?? exact ?? (attempt.kind === "syntax" ? "not-json" : "schema");
  const diagnosis = step && "diagnosis" in step ? step.diagnosis : null;
  return { ...result, wire: { ...result.wire, wireFault }, verdicts: {}, evidence: { attempt, diagnosis, reread }, diagnosis };
}

/** One new paid question per worker slice. Each role has its own durable key,
 * receipt, price policy and reservation; a restart reuses the finished role.
 * `decideRetained` never buys: it only re-reads an answer already paid for. */
export async function buyDualLocalPatchReview(c: Container, prepared: Prepared, deps: LocalPatchBoardReviewDeps, deadlineAt?: number,
  options: { decideRetained?: boolean } = {}): Promise<Waiting | (Reviewed & { asked: Prepared["request"] })> {
  if (!options.decideRetained && !c.visualReview) throw Error("Both HIGH visual-review providers must be configured before any reservation");
  if (!hasLocalPatchCapability(prepared.scene.sceneVersion, "readyOnlyDualReview") || prepared.extraPlan || prepared.request.reviewScope !== "ready-only/v1"
    || prepared.request.hides.length !== 1) throw Error("Dual review requires one ready v12 appearance");
  const version = await dualVisualReviewVersion(c.db, prepared.game.id);
  if (!version) throw Error("Dual review requires its pinned visual review release");
  // The pinned release decides the quality question: v3 adds each join magnified,
  // derived from the same registered pixels; v1/v2 ask the prepared one byte for byte.
  const asked = await dualQualityRequest(version, prepared.request);
  const result = await dualReview(c, { ...prepared, request: asked }, deps, version, deadlineAt, options);
  return result.kind === "reviewed" ? { ...result, asked } : result;
}

/** The quality request a pinned release asks about one ready appearance. */
export async function dualQualityRequest(version: DualVisualReviewVersion, request: Prepared["request"]): Promise<Prepared["request"]> {
  if (qualityQuestionFor(version) !== QUALITY_QUESTION_OBJECT_JOINS) return request;
  return { ...request, qualityQuestion: QUALITY_QUESTION_OBJECT_JOINS, hides: await Promise.all(request.hides.map(async hide => {
    if (!hide.returnedWindow) throw Error("The object-joins question requires the registered return window");
    return { ...hide, joinDetails: await prepareJoinDetails(hide.beforePng, hide.afterPng, hide.returnedWindow) };
  })) };
}

/** Cost experiment E1 only: the answer stays short for every check that passes, and a
 * failure keeps its full located detail. The reader's 12-character minimum still holds. */
export const QUALITY_ANSWER_SHORT_WHEN_PASSING = "short-when-passing/v1" as const;
const SHORT_WHEN_PASSING = "\nANSWER LENGTH: for every check that passes, keep each required observation to one short sentence of 3 to 20 words, "
  + "and the reason to one sentence. For every check that fails, give its faults entry with the exact check, the visible location and the defect in at most 300 characters. "
  + "Shorten only what passes; never omit, merge or soften a failure, a required field or an evidence ID to save space.";
/** Who answers the quality question, at what effort, in what length. Absent: today's
 * question exactly (Opus, HIGH, full answer). Anything else is a separate experiment. */
export type DualQualityVariant = { readonly judge?: VisualReviewJudge; readonly effort?: VisualReviewEffort;
  readonly answer?: typeof QUALITY_ANSWER_SHORT_WHEN_PASSING;
  /** A lean world (local-patch-lean/v1): Sol HIGH, asked in the background at this tier. */
  readonly tier?: VisualReviewTier };

/** The quality question about one appearance: the scene question, its recovery
 * strategy's addendum and the immutable binding, byte for byte as it is bought. */
export function dualQualityQuestion(request: Prepared["request"], binding: object, attempt: number, strategy: EvidenceStrategy = STANDARD,
  variant: DualQualityVariant = {}) {
  const quality = sceneQualityQuestion(request, variant.effort ?? "high");
  return prepareVisualReview({ ...quality, ...(variant.judge ? { judge: variant.judge } : {}),
    ...(variant.tier ? { judge: "gpt-6.1-sol" as const, transport: "responses-background" as const, tier: variant.tier } : {}),
    prompt: quality.prompt + qualityAddendum(strategy) + (variant.answer === QUALITY_ANSWER_SHORT_WHEN_PASSING ? SHORT_WHEN_PASSING : "")
      + `\nImmutable candidate binding: ${JSON.stringify(binding)}. Evidence attempt: ${attempt}.` });
}

/** The candidate a dual question is bound to: its pixels, geometry, identity and attempt. */
function dualBinding(prepared: Prepared, version: DualVisualReviewVersion) {
  const hideId = prepared.request.hides[0]!.hideId, entry = prepared.entries.find(e => e.hide.id === hideId)!;
  const receipt = JSON.parse(entry.row.judgeJson!);
  const authoredReturn = receipt.authoredReturn as AuthoredLocalPatchReturnContract | undefined;
  const authoredRecovery = receipt.authoredRecovery as AuthoredLocalPatchRecoveryContract | undefined;
  return { version, gameId: prepared.game.id, sceneId: prepared.scene.id, hideId,
    ...(prepared.scene.sceneVersion === 13 ? { sceneVersion: 13 as const } : {}),
    variantId: entry.row.id, imageSha256: entry.imageSha256, geometrySha256: entry.geometrySha256,
    identitySha256: sha256Bytes(prepared.sheet), attempts: entry.row.attempts,
    ...(authoredReturn ? { authoredReturn } : {}), ...(authoredRecovery ? { authoredRecovery } : {}) };
}

/** Append the mandatory source comparison only after the original assessment
 * is complete. Images, policy, output cap, effort and transport are untouched;
 * ordinary admission bounds the resulting prompt before any purchase. */
export function withSourceNeighborQualityQuestion(question: PreparedVisualReview, sourceNeighbors: SourceNeighborQualityEvidence | undefined,
  reviewContextRect?: PatchRectangle): PreparedVisualReview {
  if (!sourceNeighbors) return question;
  if (!reviewContextRect || !Object.values(reviewContextRect).every(Number.isSafeInteger)
    || reviewContextRect.left < 0 || reviewContextRect.top < 0 || reviewContextRect.width < 1 || reviewContextRect.height < 1
    || reviewContextRect.left + reviewContextRect.width > sourceNeighbors.contract.source.width
    || reviewContextRect.top + reviewContextRect.height > sourceNeighbors.contract.source.height
    || sourceNeighbors.contract.neighbors.some(({ head }) => head.left < reviewContextRect.left || head.top < reviewContextRect.top
      || head.left + head.width > reviewContextRect.left + reviewContextRect.width
      || head.top + head.height > reviewContextRect.top + reviewContextRect.height))
    throw Error("SOURCE_NEIGHBOR: actual BEFORE/AFTER context does not contain all registered heads");
  return prepareVisualReview({ ...question, prompt: question.prompt
    + "\nSOURCE COORDINATE FRAME: AFTER rectangles use native full-board pixels, not thumbnail, paired-image or crop-relative coordinates. Full board="
    + JSON.stringify({ width: sourceNeighbors.contract.source.width, height: sourceNeighbors.contract.source.height })
    + "; actual BEFORE/AFTER context native rectangle=" + JSON.stringify(reviewContextRect)
    + ". Its native origin is (left,top) in that rectangle; comparison/detail panels may be resized. Use the source head boxes and this frame."
    + "\nAUTHORITATIVE SOURCE NEIGHBORS: " + JSON.stringify({ manifestSha256: sourceNeighbors.manifestSha256, contract: sourceNeighbors.contract })
    + "\n" + sourceNeighborQualityBundleDirection(sourceNeighbors.binding) });
}
/** Whether a question was already started: reserved, settled, unknown or linked, under its synchronous or its Batch key. */
async function questionStarted(prepared: Pick<Prepared, "budget" | "worldId" | "board">, question: PreparedVisualReview): Promise<boolean> {
  return !!await prepared.budget.readRequest(prepared.worldId, `self-repair:board:${prepared.board.board}:${question.fingerprint}`)
    || !!await prepared.budget.readRequest(prepared.worldId, qualityBatchKeyOf(prepared.board.board, question.fingerprint));
}

/** The questions a dual review asks about one prepared appearance, built exactly
 * as they are bought. Read-only: the purchase and the dry-run planner share it. */
type SubjectQuestionContext = { upgrade: SubjectUpgradeReceipt; plan: SubjectPlan; photoPng: Buffer };
async function dualQuestions(prepared: Prepared, version: DualVisualReviewVersion, transport?: VisualReviewTransport, subject?: SubjectQuestionContext,
  /** A lean world (local-patch-lean/v1): the tier its quality question is asked at. A reused answer keeps the tier it was bought at. */
  lean?: { readonly tier: VisualReviewTier }) {
  const { request, entries, evidenceReviewAttempt } = prepared;
  const binding = dualBinding(prepared, version), hideId = binding.hideId, entry = entries.find(e => e.hide.id === hideId)!;
  const priorReceipt = JSON.parse(entry.row.judgeJson!);
  const sourceNeighbors = sourceNeighborQualityEvidence(prepared.placementContext, hideId, binding.imageSha256, priorReceipt);
  const prior = (priorReceipt.boardReview?.dual ?? priorReceipt.dualQualityCheckpoint) as DualReviewProof | undefined;
  // The recovery policy chose this round's question for the role that failed.
  const recovery = localPatchEvidenceRecovery(entry.row);
  const strategyFor = (role: EvidenceRole): EvidenceStrategy => {
    const strategy = recovery?.retry && recovery.role === role && recovery.strategy ? recovery.strategy : STANDARD;
    // subject-format-recovery/v2: inspect the complete retained subject object,
    // not only its first path. Original answer/fault/history and round cap stay fixed.
    return subject && role === "quality" && strategy === "strict-json/v1"
      && prior?.imageSha256 === binding.imageSha256 && prior.subject
      && subjectHasOnlyOverlongObservations(subjectStageRaw(prior.subject)) ? "compact/v1" : strategy;
  };
  // An unreadable Sol reply does not buy a second good Opus assessment: the
  // identical earlier question (same attempt and strategy) is replayed.
  const oldQuality = prior?.quality;
  // Read as its own decision was made: under its named reader, or its verified re-reading.
  const oldVerdict = oldQuality ? readQualityStage(oldQuality, hideId) : null;
  const reuse = prior?.imageSha256 === binding.imageSha256 && sameAuthoredReturn(prior, binding) && !!oldQuality && Number.isSafeInteger(oldQuality.attempt)
    && JSON.stringify(oldQuality.sourceNeighbors) === JSON.stringify(sourceNeighbors)
    && oldQuality.attempt > 0 && localPatchQualityDisposition(oldVerdict ?? null, prepared.scene.sceneVersion, { hideId, reader: qualityStageReader(oldQuality) ?? QUALITY_READER_STRICT }).state === "acceptable"
    && !(oldQuality.subjectBundle && recovery?.retry && recovery.role === "quality");
  const qualityAttempt = reuse ? oldQuality!.attempt : evidenceReviewAttempt;
  const qualityStrategy = reuse ? oldQuality!.strategy ?? STANDARD : strategyFor("quality");
  // A reused bundle is rebuilt under the policy it was bought with, so it replays; a new one asks v2.
  const bundlePolicy = reuse && oldQuality?.subjectBundle ? oldQuality.subjectBundle.subjectPolicy ?? SUBJECT_POLICY_VERSION : SUBJECT_POLICY_V2;
  const asked = (tier: VisualReviewTier | undefined) => {
    const quality = dualQualityQuestion(request, binding, qualityAttempt, qualityStrategy, tier ? { tier } : {});
    return { quality, combined: subject && (!reuse || oldQuality?.subjectBundle)
      ? combinedQualitySubjectQuestion(quality, subject.plan, subject.photoPng, subject.upgrade, bundlePolicy) : null };
  };
  const reusedTier = lean && reuse ? oldQuality!.policy.serviceTier : undefined;
  let { quality, combined } = asked(lean ? reusedTier ?? lean.tier : undefined);
  // A reused answer keeps the tier it was bought at only while its exact question replays it. Rebuilt for a revised
  // reference, the bundle names the new identity: a new question, asked at this round's tier (a capacity grant's default),
  // never a fresh Flex question beside a default continuity question.
  if (lean && reusedTier && reusedTier !== lean.tier && !await questionStarted(prepared, withSourceNeighborQualityQuestion(combined?.question ?? quality, sourceNeighbors, entry.reviewContextRect)))
    ({ quality, combined } = asked(lean.tier));
  // A v1 bundle already started about these pixels in this round (bought before v2, its answer never
  // recorded on the row) is resumed under v1: never bought a second time in its v2 form.
  if (subject && (!reuse || oldQuality?.subjectBundle) && bundlePolicy === SUBJECT_POLICY_V2) {
    const v1 = combinedQualitySubjectQuestion(quality, subject.plan, subject.photoPng, subject.upgrade, SUBJECT_POLICY_VERSION);
    if (v1 && await questionStarted(prepared, withSourceNeighborQualityQuestion(v1.question, sourceNeighbors, entry.reviewContextRect))) combined = v1;
  }
  const q = withSourceNeighborQualityQuestion(combined?.question ?? quality, sourceNeighbors, entry.reviewContextRect);
  const continuityStrategy = strategyFor("continuity");
  // An enrolled world's subject question follows a passing quality answer; a format or
  // size recovery of the quality role is that question's recovery too.
  const subjectStrategy = reuse ? strategyFor("quality") : STANDARD;
  return { binding, entry, priorReceipt, reuse, quality, q, sourceNeighbors, subjectBundle: combined?.binding, qualityAttempt, qualityStrategy, continuityStrategy, subjectStrategy,
    anatomy: (via: VisualReviewTransport | undefined = transport, tier?: VisualReviewTier) =>
      runtimeContinuityQuestion(prepared, binding, evidenceReviewAttempt, version, continuityStrategy, via, tier) };
}

/**
 * The v2 descriptions of every other appearance this world has accepted, and how many appearances the world
 * has, for the collection's variety rule (subjectCollectionRefusal). An appearance counts while it stands
 * accepted on its current pixels: by a v2 answer that passed without a collection refusal (its look), or under
 * v1, which followed its plan and carries no description (null, no look).
 */
async function acceptedWorldAppearances(db: Container["db"], gameId: string, hideId: string, ageYears: number) {
  const scenes = await db.gameScene.findMany({ where: { gameId }, select: { sceneSlug: true, sceneVersion: true } });
  const worldSize = scenes.reduce((sum, scene) => sum + (localPatchBoardForVersion(scene.sceneSlug, scene.sceneVersion)?.hides.length ?? 0), 0);
  const rows = await db.targetVariantAsset.findMany({ where: { status: "GENERATED", targetInstance: { gameScene: { gameId } } }, select: { judgeJson: true } });
  const accepted = rows.flatMap((row): { hideId: string; appearance: SubjectAppearance | null }[] => {
    try {
      const receipt = JSON.parse(row.judgeJson ?? "null"), proof = receipt?.boardReview?.dual as DualReviewProof | undefined, id: unknown = receipt?.hide;
      if (typeof id !== "string" || id === hideId || receipt.reviewState !== "board-review-complete" || !proof?.subject
        || proof.imageSha256 !== receipt.judgedSha256 || proof.subject.collectionRefusal !== undefined) return [];
      if (proof.subject.reader !== SUBJECT_READER_V2) return [{ hideId: id, appearance: null }];
      const plan = subjectPlanOfHide(id, scenes.find(scene => localPatchBoardForVersion(scene.sceneSlug, scene.sceneVersion)?.hides.some(hide => hide.id === id))?.sceneVersion ?? -1), reading = plan ? readSubjectAnswerV2(subjectStageRaw(proof.subject), { hideId: id, ageYears, plan }) : null;
      return reading?.ok && reading.disposition === "pass" ? [{ hideId: id, appearance: reading.appearance }] : [];
    } catch { return []; }
  });
  return { accepted, worldSize };
}

/**
 * Read-only: every question a dual review of this prepared appearance could have
 * bought under its current evidence round, with its ledger key, so an interrupted
 * one can be found again: the quality question, the synchronous and background
 * continuity questions and, in an enrolled world, the subject question.
 */
export async function dualReviewQuestionCandidates(c: Pick<Container, "db" | "storage">, prepared: Prepared, version: DualVisualReviewVersion) {
  const asked = { ...prepared, request: await dualQualityRequest(version, prepared.request) };
  const questions = await dualQuestions(asked, version);
  const key = (question: PreparedVisualReview) => `self-repair:board:${prepared.board.board}:${question.fingerprint}`;
  /** `form` and `subjectPolicy` say which question a key belongs to; they decide nothing. */
  type Form = "quality" | "continuity" | "bundle" | "subject" | "single";
  const of = (question: PreparedVisualReview, role: EvidenceRole, strategy: EvidenceStrategy, form: Form = role,
    subjectPolicy?: typeof SUBJECT_POLICY_VERSION | typeof SUBJECT_POLICY_V2) => ({ requestKey: key(question), fingerprint: question.fingerprint, role, strategy, form,
    ...(subjectPolicy ? { subjectPolicy } : {}) });
  const found: ReturnType<typeof of>[] = [of(questions.q, "quality", questions.qualityStrategy),
    of(await questions.anatomy(), "continuity", questions.continuityStrategy),
    of(await questions.anatomy("responses-background"), "continuity", questions.continuityStrategy)];
  const upgrade = await subjectUpgradeOf(c.db, prepared.game.id), plan = subjectPlanOfHide(questions.binding.hideId, prepared.scene.sceneVersion);
  if (upgrade && plan) {
    try {
      const photoPng = await loadSubjectPhoto(c, prepared, upgrade);
      const combined = await dualQuestions(asked, version, "responses-background", { upgrade, plan, photoPng });
      // An interrupted question may have been bought under either subject policy: both forms are found.
      for (const policy of [SUBJECT_POLICY_VERSION, SUBJECT_POLICY_V2] as const) {
        const originalBundle = combinedQualitySubjectQuestion(combined.quality, plan, photoPng, upgrade, policy)?.question;
        const bundle = originalBundle ? withSourceNeighborQualityQuestion(originalBundle, combined.sourceNeighbors, prepared.entries.find(e => e.hide.id === combined.binding.hideId)?.reviewContextRect) : undefined;
        if (bundle && !found.some(f => f.fingerprint === bundle.fingerprint)) found.push(of(bundle, "quality", combined.qualityStrategy, "bundle", policy));
        found.push(of(subjectQuestion(asked, plan, photoPng, questions.binding, prepared.evidenceReviewAttempt, qualityAddendum(questions.subjectStrategy), upgrade, policy),
          "quality", questions.subjectStrategy, "subject", policy));
      }
      if (!found.some(f => f.fingerprint === combined.q.fingerprint)) found.push(of(combined.q, "quality", combined.qualityStrategy));
      // A lean world's questions (local-patch-lean/v1): Sol's bundle and continuity, at either tier.
      if (await isLeanWorld(c.db, prepared.game.id)) for (const tier of ["flex", "default"] as const) {
        const leanQuestions = await dualQuestions(asked, version, "responses-background", { upgrade, plan, photoPng }, { tier });
        if (!found.some(f => f.fingerprint === leanQuestions.q.fingerprint)) found.push(of(leanQuestions.q, "quality", leanQuestions.qualityStrategy, "bundle", SUBJECT_POLICY_V2));
        const anatomy = await leanQuestions.anatomy("responses-background", tier);
        if (!found.some(f => f.fingerprint === anatomy.fingerprint)) found.push(of(anatomy, "continuity", leanQuestions.continuityStrategy));
      }
    } catch (error) { if (!(error instanceof SubjectEvidenceUnavailable)) throw error; }
  }
  const singleAuthority = upgrade && plan ? await detectivesSingleReviewAuthorization(c.db, prepared.game.id) : null;
  if (singleAuthority && singleAuthority.sceneVersion !== prepared.scene.sceneVersion) throw Error("SINGLE_REVIEW: source family differs from review authority");
  if (upgrade && plan && singleAuthority) {
    const photoPng = await loadSubjectPhoto(c, prepared, upgrade);
    const one = await prepareSingleLowQuestion(c, asked, version, { upgrade, plan, photoPng });
    return [...found, { requestKey: one.requestKey, fingerprint: one.question.fingerprint, role: "quality" as const, strategy: STANDARD, form: "single" as const,
      single: one.singleVersion, reserveMicroUsd: one.bound.microUsd, continued: one.continued }];
  }
  return found;
}

/** A continuity answer already paid for about exactly these pixels, geometry and identity,
 * that still proves its own settled bill and passes under the reader its stage names. */
async function reusableContinuity(db: Prisma.TransactionClient, worldId: string, version: DualVisualReviewVersion,
  prior: DualReviewProof | undefined, binding: RetainedBinding, lean = false): Promise<{ stage: ContinuityStage; bought: Bought } | null> {
  if (!prior?.continuity || prior.version !== version || prior.hideId !== binding.hideId || prior.imageSha256 !== binding.imageSha256
    || prior.geometrySha256 !== binding.geometrySha256 || prior.identitySha256 !== binding.identitySha256 || !sameAuthoredReturn(prior, binding)) return null;
  const verified = await verifiedDualStage(db, worldId, prior.continuity, "head-continuity", { allowBackground: true, allowLean: lean,
    authoredReviewBinding: authoredLocalPatchReviewBinding(binding) });
  const read = verified ? readContinuityStage(prior.continuity, binding.hideId, version) : null;
  if (!verified || !read || localPatchRuntimeContinuityVerdict(read).disposition !== "pass") return null;
  return { stage: prior.continuity, bought: { kind: "bought", bytes: verified.bytes, evidence: verified.evidence, replayed: true, settledFromRetained: false } };
}

export type DualQuestionAdmission = {
  readonly requestKey: string; readonly role: DualReviewRole; readonly reserveMicroUsd: number;
  /** Already in the ledger: replayed, awaited or held there, never reserved again. */
  readonly existing: WorldBudgetRequest["state"] | null;
  /** The most a NEW question can be billed (visualReviewMaxCharge); null for an existing key. */
  readonly maxChargeMicroUsd: number | null;
  /** Why a new question may not be reserved or sent, or null. */
  readonly refused: string | null;
};
/**
 * What buying a dual question reserves, and whether it may be bought. A key
 * already in the ledger keeps the reservation it was made with and is never
 * reserved again. A new question reserves its release's amount for its role
 * (dual-review-reserve.ts) and is admitted only when the most it can be billed,
 * computed from the exact request, fits that amount. Read-only.
 */
export async function dualQuestionAdmission(budget: Pick<Prepared["budget"], "readRequest">, worldId: string, boardId: string,
  version: DualVisualReviewVersion, question: PreparedVisualReview): Promise<DualQuestionAdmission> {
  const requestKey = `self-repair:board:${boardId}:${question.fingerprint}`, role: DualReviewRole = question.role === "scene-quality" ? "quality" : "continuity";
  const stored = await budget.readRequest(worldId, requestKey);
  // A lean question (local-patch-lean/v1) reserves its role's lean amount, one every interruption-recovery gate
  // admits; a lean request that could be billed more is refused below, like any other.
  const reserveMicroUsd = isLeanReviewPolicy(question.policy) ? stored?.reserveMicroUsd ?? LEAN_REVIEW_RESERVE_MICRO_USD[role]
    : dualQuestionReserveMicroUsd(stored?.reserveMicroUsd, version === DUAL_VISUAL_REVIEW_V3, role);
  if (stored) return { requestKey, role, reserveMicroUsd, existing: stored.state, maxChargeMicroUsd: null, refused: null };
  const most = visualReviewMaxCharge(question);
  const refused = !most.ok ? `the ${role} question cannot be bounded: ${most.reason}`
    : most.microUsd > reserveMicroUsd ? `the ${role} question could be billed up to ${most.microUsd} micro-USD `
      + `(${most.inputTokens} input and ${most.outputTokens} output tokens), more than its ${reserveMicroUsd} reservation` : null;
  return { requestKey, role, reserveMicroUsd, existing: null, maxChargeMicroUsd: most.ok ? most.microUsd : null, refused };
}

/**
 * The next purchase a dual review of this prepared appearance makes, read-only
 * (the dry-run planner): its quality question; or, once a passing quality answer
 * for these exact pixels is settled (it replays for free), its continuity
 * question. Null when no dual purchase follows: not a single ready v12
 * appearance, or a settled quality answer without that passing record, which
 * is replayed and decided first.
 */
export async function nextDualReviewPurchase(prepared: Prepared, version: DualVisualReviewVersion): Promise<DualQuestionAdmission | null> {
  if (!hasLocalPatchCapability(prepared.scene.sceneVersion, "readyOnlyDualReview") || prepared.extraPlan || prepared.request.reviewScope !== "ready-only/v1"
    || prepared.request.hides.length !== 1) return null;
  const questions = await dualQuestions({ ...prepared, request: await dualQualityRequest(version, prepared.request) }, version);
  const quality = await dualQuestionAdmission(prepared.budget, prepared.worldId, prepared.board.board, version, questions.q);
  // A question already reserved in a Message Batches round is not a new reservation.
  const batchKey = qualityBatchKeyOf(prepared.board.board, questions.q.fingerprint);
  const batched = quality.existing ? null : await prepared.budget.readRequest(prepared.worldId, batchKey);
  if (batched) return { ...quality, requestKey: batchKey, existing: batched.state, maxChargeMicroUsd: null, refused: null };
  if (quality.existing !== "settled" && quality.existing !== "linked") return quality;
  return questions.reuse ? dualQuestionAdmission(prepared.budget, prepared.worldId, prepared.board.board, version, await questions.anatomy()) : null;
}

type CarriedBundle = { question: PreparedVisualReview; binding: NonNullable<ReturnType<typeof combinedQualitySubjectQuestion>>["binding"];
  attempt: number; strategy: EvidenceStrategy };
type CarriedContinuity = { question: PreparedVisualReview; attempt: number; strategy: EvidenceStrategy };
const STRATEGIES: readonly EvidenceStrategy[] = ["standard/v1", "strict-json/v1", "compact/v1", "decide/v1"];

/**
 * local-patch-lean-review-recovery/v1. An answer already received about exactly these pixels, replayed instead of bought
 * again when the other question of its round was interrupted (on 20 October a lean world bought an answered bundle again
 * after each continuity question the provider ended failed). Found from the round records alone (`rounds`: the same
 * appearance, variant, pixels, geometry and identity), rebuilt at each earlier evidence attempt and strategy at the tier
 * its own round asked, and used only when the rebuilt question's fingerprint is the recorded one byte for byte, its
 * settled bill and retained answer agree (`verifiedDualStage`), and the answer passes as it would be decided now: a
 * bundle's quality acceptable and its subject reading a pass; a continuity reading a pass. A question of the current
 * attempt (`current`) is the ordinary flow's. Never a provider; nothing is written.
 */
async function carriedLeanAnswers(c: Container, prepared: Prepared, version: DualVisualReviewVersion, rounds: readonly ImageRound[],
  subject: SubjectQuestionContext, current: ReadonlySet<string>): Promise<{ bundle: CarriedBundle | null; continuity: CarriedContinuity | null }> {
  const { request, evidenceReviewAttempt, worldId } = prepared;
  const binding = dualBinding(prepared, version), hideId = binding.hideId;
  const entry = prepared.entries.find(e => e.hide.id === hideId)!;
  const sourceNeighbors = sourceNeighborQualityEvidence(prepared.placementContext, hideId, binding.imageSha256, JSON.parse(entry.row.judgeJson!));
  const store = new LocalPatchRetainedPurchaseStore(c, prepared.game.id, prepared.budget);
  /** The paid answer under this key, as a stage of this question, or null when its bill and envelope do not agree. */
  const stageOf = async (question: PreparedVisualReview, requestKey: string, attempt: number, strategy: EvidenceStrategy): Promise<DualStageBase | null> => {
    const retained = await store.get(worldId, requestKey);
    if (!retained?.evidence || requestKey !== `self-repair:board:${prepared.board.board}:${question.fingerprint}`) return null;
    let wire: LocalPatchJudgeResult;
    try { wire = JSON.parse(retained.bytes.toString()); } catch { return null; }
    return { requestKey, fingerprint: question.fingerprint, attempt, policy: question.policy, raw: wire.raw, model: wire.model,
      finishReason: wire.finishReason, wireFault: wire.wireFault, costMicroUsd: retained.evidence.amountMicroUsd, ...(strategy === STANDARD ? {} : { strategy }) };
  };
  const found: { bundle: CarriedBundle | null; continuity: CarriedContinuity | null } = { bundle: null, continuity: null };
  for (const round of [...rounds].reverse()) {
    if (!roundAnswered(round) || current.has(round.fingerprint)) continue;
    if (round.role === "scene-quality" && !found.bundle) {
      const rebuilt = await (async () => {
        for (let attempt = evidenceReviewAttempt - 1; attempt >= 1; attempt--) for (const strategy of STRATEGIES) {
          const combined = combinedQualitySubjectQuestion(dualQualityQuestion(request, binding, attempt, strategy, { tier: round.tier }),
            subject.plan, subject.photoPng, subject.upgrade, SUBJECT_POLICY_V2);
          const question = combined ? withSourceNeighborQualityQuestion(combined.question, sourceNeighbors, entry.reviewContextRect) : undefined;
          if (question?.fingerprint === round.fingerprint) return { ...combined!, question, attempt, strategy };
        }
        return null;
      })();
      const base = rebuilt ? await stageOf(rebuilt.question, round.requestKey, rebuilt.attempt, rebuilt.strategy) : null;
      if (!rebuilt || !base) continue;
      const stage: QualityStage = { ...base, reader: CURRENT_QUALITY_READER, subjectBundle: rebuilt.binding,
        ...(sourceNeighbors ? { sourceNeighbors } : {}) };
      if (!await verifiedDualStage(c.db, worldId, stage, "scene-quality", { allowLean: true, authoredReviewBinding: authoredLocalPatchReviewBinding(binding) })
        || localPatchQualityDisposition(readQualityStage(stage, hideId, prepared.scene.sceneVersion), prepared.scene.sceneVersion, { hideId, reader: CURRENT_QUALITY_READER }).state !== "acceptable") continue;
      const reading = readSubjectAnswerV2(subjectStageRaw({ raw: stage.raw, combined: SUBJECT_QUALITY_BUNDLE_VERSION, ...(sourceNeighbors ? { sourceNeighbors } : {}) }),
        { hideId, ageYears: subject.upgrade.ageYears, plan: subject.plan });
      if (reading.ok && reading.disposition === "pass")
        found.bundle = { question: rebuilt.question, binding: rebuilt.binding, attempt: rebuilt.attempt, strategy: rebuilt.strategy };
    } else if (round.role === "head-continuity" && !found.continuity) {
      const rebuilt = await (async () => {
        for (let attempt = evidenceReviewAttempt - 1; attempt >= 1; attempt--) for (const strategy of STRATEGIES) {
          const question = await runtimeContinuityQuestion(prepared, binding, attempt, version, strategy, "responses-background", round.tier);
          if (question.fingerprint === round.fingerprint) return { question, attempt, strategy };
        }
        return null;
      })();
      const base = rebuilt ? await stageOf(rebuilt.question, round.requestKey, rebuilt.attempt, rebuilt.strategy) : null;
      if (!rebuilt || !base) continue;
      const stage: ContinuityStage = { ...base, reader: CURRENT_CONTINUITY_READER[version] };
      if (!await verifiedDualStage(c.db, worldId, stage, "head-continuity", { allowBackground: true, allowLean: true,
        authoredReviewBinding: authoredLocalPatchReviewBinding(binding) })) continue;
      const read = readContinuityStage(stage, hideId, version);
      if (read && localPatchRuntimeContinuityVerdict(read).disposition === "pass") found.continuity = rebuilt;
    }
  }
  return found;
}

async function dualReview(c: Container, prepared: Prepared, deps: LocalPatchBoardReviewDeps, version: DualVisualReviewVersion, deadlineAt: number | undefined,
  options: { decideRetained?: boolean }): Promise<Waiting | Reviewed> {
  const { request, game, budget, worldId, evidenceReviewAttempt } = prepared;
  // Historical separate-role answers keep their existing free reading. A
  // retained single MEDIUM answer can carry all mandatory roles for free only
  // when they are literally the same settled immutable paid document.
  const upgrade = await subjectUpgradeOf(c.db, game.id);
  if (options.decideRetained && !upgrade) return decideRetainedAnswer(c, prepared, version, dualBinding(prepared, version));
  let subjectContext: SubjectQuestionContext | undefined;
  if (upgrade) {
    const plan = subjectPlanOfHide(request.hides[0]!.hideId, prepared.scene.sceneVersion);
    if (!plan) throw Error("SUBJECT_REVIEW: missing enrolled subject plan");
    try { subjectContext = { upgrade, plan, photoPng: await loadSubjectPhoto(c, prepared, upgrade) }; }
    catch (error) {
      if (!(error instanceof SubjectEvidenceUnavailable)) throw error;
      return { kind: "waiting", outcome: { state: "held", reason: error.message, replayed: false, costCents: 0 } };
    }
  }
  const singleAuthority = subjectContext ? await detectivesSingleReviewAuthorization(c.db, game.id) : null;
  if (singleAuthority && singleAuthority.sceneVersion !== prepared.scene.sceneVersion) throw Error("SINGLE_REVIEW: source family differs from review authority");
  if (options.decideRetained) {
    if (!subjectContext || !singleAuthority) return { kind:"waiting", outcome:{state:"pending",
      reason:"No complete single-answer envelope awaits a corrected reading",replayed:true,costCents:0} };
    return decideRetainedSingleEnvelope(c,prepared,deps,version,subjectContext,deadlineAt);
  }
  if (subjectContext && singleAuthority)
    return singleLowReview(c, prepared, deps, version, subjectContext, deadlineAt);
  const makeKey = (question: PreparedVisualReview) => `self-repair:board:${prepared.board.board}:${question.fingerprint}`;
  // local-patch-lean/v1: Sol HIGH answers both questions in the background, on Flex; a Flex question whose create
  // the provider refused (documented: nothing created, nothing billed) is asked once more at the default tier.
  const lean = await isLeanWorld(c.db, game.id);
  if (lean && !subjectContext) throw Error("LEAN_REVIEW: a lean world is reviewed only under its subject policy");
  // Refused, and its reservation already settled at the provider's documented zero: only then the default tier.
  const refusedFlex = async (question: PreparedVisualReview) => question.policy.serviceTier === "flex"
    && await reconcileRefusedBackgroundRound(c, game.id, worldId, makeKey(question));
  const pixels = dualBinding(prepared, version);
  const onPixels: BackgroundReviewBinding = { hideId: pixels.hideId, variantId: pixels.variantId, imageSha256: pixels.imageSha256,
    geometrySha256: pixels.geometrySha256, identitySha256: pixels.identitySha256,
    ...(pixels.authoredReturn ? { authoredReviewBinding: authoredLocalPatchReviewBinding(pixels)! } : {}) };
  // local-patch-lean-review-recovery/v1, in every enrolled world (its questions are asked in the background): once the
  // provider has said a question about these pixels can never succeed (its request refused, an image flagged, the
  // account), nothing more is sent or bought about them, whatever that answer's charge (a settled bill stays settled, an
  // unknown one unknown and reserved in full). Checked before any tier is chosen or question sent, and again after every
  // answer that has just ended.
  const permanent = async (): Promise<string | null> => upgrade ? permanentFailureOnImage(c.db, game.id, onPixels) : null;
  const stopped = await permanent();
  if (stopped) return { kind: "waiting", outcome: { state: "held", reason: stopped, replayed: false, costCents: 0 } };
  // local-patch-lean-review-recovery/v1, only in a world that carries its pin: what the round records say about exactly
  // these pixels. Once the provider has ended a question about them failed, both questions about them are asked at the
  // default tier (a separate key and policy version); the failed question's charge stays held in full.
  const imageRounds = lean && await leanReviewRecoveryOf(c.db, game.id) ? await backgroundRoundsOnImage(c.db, game.id, onPixels) : null;
  // A separately granted capacity recovery moves new questions off the failing tier for this world.
  // This attempt's unfinished Flex rounds and settled Flex answers retain their own policy/key, including
  // an answer saved by a separate poll. Earlier-attempt answers are reused below without selecting a new Flex question.
  const capacity = imageRounds && await leanCapacityRecoveryOf(c.db, game.id);
  const flex = capacity ? await dualQuestions(prepared, version, "responses-background", subjectContext, { tier: "flex" }) : null;
  const currentFlex = flex ? new Set([...(flex.qualityAttempt === evidenceReviewAttempt ? [flex.q.fingerprint] : []),
    (await flex.anatomy("responses-background", "flex")).fingerprint]) : null;
  const leanTier: VisualReviewTier = imageRounds?.some(providerEndedFailed)
    || capacity && !imageRounds!.some(round => round.tier === "flex" && currentFlex!.has(round.fingerprint)
      && (!round.terminal || roundAnswered(round))) ? "default" : "flex";
  let questions = flex && leanTier === "flex" ? flex
    : await dualQuestions(prepared, version, upgrade ? "responses-background" : undefined, subjectContext, lean ? { tier: leanTier } : undefined);
  if (lean && await refusedFlex(questions.q)) questions = await dualQuestions(prepared, version, "responses-background", subjectContext, { tier: "default" });
  const { binding, entry, priorReceipt, subjectStrategy, sourceNeighbors, anatomy: anatomyQuestion } = questions;
  let { q, subjectBundle, qualityAttempt, qualityStrategy, continuityStrategy } = questions;
  const hideId = binding.hideId;
  /** A lean world's continuity question at this round's tier; a Flex question the provider refused, at the default tier. */
  const tierAnatomy = async () => {
    const first = await anatomyQuestion("responses-background", leanTier);
    return leanTier === "flex" && await refusedFlex(first) ? anatomyQuestion("responses-background", "default") : first;
  };
  // An answer already received about these pixels in an earlier round of the pinned world is replayed, never bought again.
  const carried = imageRounds && subjectContext && evidenceReviewAttempt > 1 && imageRounds.some(roundAnswered)
    ? await carriedLeanAnswers(c, prepared, version, imageRounds, subjectContext,
      new Set([q.fingerprint, (await anatomyQuestion("responses-background", leanTier)).fingerprint]))
    : { bundle: null, continuity: null };
  if (carried.bundle && !questions.reuse) ({ question: q, binding: subjectBundle, attempt: qualityAttempt, strategy: qualityStrategy } = carried.bundle);
  if (carried.continuity) continuityStrategy = carried.continuity.strategy;
  /** The attempt the continuity question carries: a replayed answer's own, else this round's. */
  const continuityAttempt = carried.continuity?.attempt ?? evidenceReviewAttempt;
  const leanAnatomy = async () => carried.continuity?.question ?? tierAnatomy();
  const askInBackground = async (question: PreparedVisualReview, reserveMicroUsd: number): Promise<BackgroundGate> => {
    const gate = await askContinuityInBackground(c, { gameId: game.id, worldId,
      requestKey: makeKey(question), question, reserveMicroUsd, fence: deps.fence, ...(deadlineAt === undefined ? {} : { deadlineAt }),
      binding: { hideId, variantId: entry.row.id, imageSha256: binding.imageSha256, geometrySha256: binding.geometrySha256, identitySha256: binding.identitySha256,
        ...(binding.authoredReturn ? { authoredReviewBinding: authoredLocalPatchReviewBinding(binding)! } : {}) } });
    if (gate.kind !== "proceed") return gate;
    // The answer that has just ended may be the provider's statement that these pixels can never succeed: then nothing
    // more is read, sent or bought about them.
    const stop = await permanent();
    return stop ? { kind: "held", reason: stop } : gate;
  };
  /** A lean Flex question just refused waits one slice and is asked at the default tier; never a hold for a person. */
  const leanGate = async (gate: Awaited<ReturnType<typeof askContinuityInBackground>>, question: PreparedVisualReview, costCents: number): Promise<Waiting> =>
    ({ kind: "waiting", outcome: gate.kind === "held" && await refusedFlex(question)
      ? { state: "pending", reason: `${makeKey(question)}: the provider refused the Flex request (nothing was created or billed); it is asked at the default tier next`, replayed: false, costCents }
      : { state: gate.kind === "held" ? "held" : "pending", reason: gate.kind === "proceed" ? "" : gate.reason, replayed: false, costCents } });
  // Refused before its request is recorded, reserved or sent: the world parks
  // with the exact reason, and nothing is spent.
  const refused = (admitted: DualQuestionAdmission): Waiting => ({ kind: "waiting", outcome: { state: "held",
    reason: `${admitted.requestKey}: ${admitted.refused}; nothing was reserved or sent`, replayed: false, costCents: 0 } });
  const buy = async (question: PreparedVisualReview, reserveMicroUsd: number) => {
    const requestKey = makeKey(question);
    // A background question is only ever replayed here, from what its round kept.
    if (isBackgroundReviewPolicy(question.policy) && !await budget.readRequest(worldId, requestKey))
      throw Error(`${requestKey}: a background question is never bought synchronously`);
    await c.db.$transaction(async tx => { await fenceLocalPatchImages(tx, game.id); await deps.fence(tx); });
    await inventorySelfRepairRequest(c, game.id, requestKey, deps.fence);
    const bought = await purchaseOnce({ ledger: budget, store: new LocalPatchRetainedPurchaseStore(c, game.id, budget) }, {
      worldId, requestKey, operationFingerprint: question.fingerprint, scope: "judge", reserveMicroUsd,
      ...(deadlineAt === undefined ? {} : { dispatchWindow: { deadlineAt,
        needMs: LOCAL_PATCH_MIN_PROVIDER_MS.judge + LOCAL_PATCH_PHASE_MARGIN_MS, retainMs: LOCAL_PATCH_PHASE_MARGIN_MS } }),
      buy: async ({ timeoutMs }) => {
        const reply = await c.visualReview!.request(question, Math.min(timeoutMs ?? question.policy.timeoutMs, question.policy.timeoutMs));
        const charge = visualReviewCharge(question.policy, reply.model, reply.usage);
        const bytes = Buffer.from(JSON.stringify({ ...reply, policy: question.policy, fingerprint: question.fingerprint,
          ...(binding.authoredReturn ? { authoredReviewBinding: authoredLocalPatchReviewBinding(binding)! } : {}) }));
        if (reply.costUnknown || charge.costUnknown || !reply.requestId) return { bytes, unknownReason: "Grouped review charge could not be verified" };
        return { bytes, evidence: { providerNamespace: `${question.policy.provider}:find-me-existing`, providerRequestId: reply.requestId,
          usageId: sha256Bytes(Buffer.from(JSON.stringify(reply.usage))), rawUsage: reply.usage as BudgetJson, model: reply.model!,
          amountMicroUsd: Math.ceil(charge.costCents * 10_000), costBasis: "conservative-upper-estimate" as const } };
      },
    });
    // A replayed v4 role proves the composition it actually asked about before
    // its answer can cause another paid role or an accepted target write.
    if (bought.kind === "bought" && binding.authoredReturn
      && JSON.parse(bought.bytes.toString()).authoredReviewBinding !== authoredLocalPatchReviewBinding(binding))
      throw Error("LOCAL_PATCH: retained authored review differs from its dispatched candidate");
    return bought;
  };
  const waiting = async (bought: Exclude<PurchaseOutcome, Bought>, question: PreparedVisualReview, strategy: EvidenceStrategy): Promise<Waiting> => {
    const recovered = bought.kind === "unresolved" && await recoverPreparedLocalPatchReview(c,
      { ...prepared, requestKey: makeKey(question), fingerprint: question.fingerprint }, deps.fence,
      { role: question.role === "scene-quality" ? "quality" : "continuity", strategy });
    return { kind: "waiting" as const, outcome: { state: recovered ? "pending" as const
      : bought.kind === "unresolved" || bought.kind === "deferred" && bought.reserved ? "held" as const : "pending" as const,
      reason: recovered ? "Interrupted review retained its charge; exact pixels await automatic evidence recovery" : bought.reason,
      replayed: false, costCents: 0 } };
  };
  const stage = (bought: Bought, question: PreparedVisualReview, attempt: number, strategy: EvidenceStrategy): DualStageBase => {
    const wire = JSON.parse(bought.bytes.toString()) as LocalPatchJudgeResult;
    return { requestKey: makeKey(question), fingerprint: question.fingerprint, attempt, policy: question.policy,
      raw: wire.raw, model: wire.model, finishReason: wire.finishReason, wireFault: wire.wireFault, costMicroUsd: bought.evidence.amountMicroUsd,
      ...(strategy === STANDARD ? {} : { strategy }) };
  };
  const qualityAdmitted = await dualQuestionAdmission(budget, worldId, prepared.board.board, version, q);
  if (qualityAdmitted.refused) return refused(qualityAdmitted);
  if (lean) {
    if (!subjectBundle || !isLeanReviewPolicy(q.policy)) throw Error("LEAN_REVIEW: a lean question asks the quality and subject readings together, of Sol");
    const asked = await askInBackground(q, qualityAdmitted.reserveMicroUsd);
    // The continuity question goes out beside it, so a picture is decided in one slice once both answers
    // are kept; its own admission and round, bought even when the quality answer refuses.
    const anatomy = await leanAnatomy(), anatomyAdmitted = await dualQuestionAdmission(budget, worldId, prepared.board.board, version, anatomy);
    // Only a head start: a ceiling that cannot take it yet leaves it for its own turn below, after the quality answer.
    if (!anatomyAdmitted.refused && asked.kind !== "held") {
      try { await askInBackground(anatomy, anatomyAdmitted.reserveMicroUsd); }
      catch (error) { if (!(error instanceof WorldBudgetError && error.code === "cap_exceeded")) throw error; }
    }
    if (asked.kind !== "proceed") return leanGate(asked, q, 0);
  } else {
    // A game pinned to Message Batches asks this question there first. Nothing below
    // changes: the answer arrives under this same key, settled at the batch price,
    // and `buy` replays it like any answer already paid for; a documented-unbilled
    // result leaves the key free, and `buy` asks synchronously as for any game.
    const batched = await askQualityThroughBatch(c, { gameId: game.id, worldId, sceneId: prepared.scene.id, board: prepared.board.board,
      hideId, variantId: entry.row.id, imageSha256: binding.imageSha256, question: q, syncKey: makeKey(q),
      ...(binding.authoredReturn ? { authoredReviewBinding: authoredLocalPatchReviewBinding(binding)! } : {}),
      reserveMicroUsd: qualityAdmitted.reserveMicroUsd, fence: deps.fence, deadlineAt });
    if (batched.kind !== "proceed") return { kind: "waiting", outcome: { state: batched.kind === "held" ? "held" : "pending", reason: batched.reason, replayed: false, costCents: 0 } };
  }
  const qualityBought = await buy(q, qualityAdmitted.reserveMicroUsd);
  if (qualityBought.kind !== "bought") return waiting(qualityBought, q, qualityStrategy);
  // Decided now, so read by the current reader, which the stage names for every later reading.
  const qualityStage: QualityStage = { ...stage(qualityBought, q, qualityAttempt, qualityStrategy), reader: CURRENT_QUALITY_READER,
    ...(subjectBundle ? { subjectBundle } : {}), ...(sourceNeighbors ? { sourceNeighbors } : {}) };
  const verdicts: LocalPatchBoardJudgeResult["verdicts"] = { [hideId]: readQualityStage(qualityStage, hideId, prepared.scene.sceneVersion) };
  const proof: DualReviewProof = { version, hideId, imageSha256: binding.imageSha256,
    ...(binding.sceneVersion ? { sceneVersion: binding.sceneVersion } : {}),
    geometrySha256: binding.geometrySha256, identitySha256: binding.identitySha256, quality: qualityStage, continuity: null,
    ...(binding.authoredReturn ? { authoredReturn: binding.authoredReturn } : {}),
    ...(binding.authoredRecovery ? { authoredRecovery: binding.authoredRecovery } : {}) };
  const primaryWire = JSON.parse(qualityBought.bytes.toString()) as LocalPatchJudgeResult;
  let newCostCents = qualityBought.replayed ? 0 : qualityBought.evidence.amountMicroUsd / 10_000;
  const qualityGood = localPatchQualityDisposition(verdicts[hideId] ?? null, prepared.scene.sceneVersion, { hideId, reader: CURRENT_QUALITY_READER }).state === "acceptable";
  const base = { kind: "reviewed" as const, salvaged: false };
  /**
   * A lean world's continuity answer about these pixels, read beside a refusal of who the child is: recorded on the
   * proof under its reader, and a located defect added to the refused verdict. Waits while it is still running;
   * an answer that cannot be admitted or read leaves the refusal as it is, without a passing continuity stage.
   */
  const leanContinuityBeside = async (refusedVerdicts: LocalPatchBoardJudgeResult["verdicts"]):
    Promise<Waiting | { kind: "decided"; verdicts: LocalPatchBoardJudgeResult["verdicts"]; costCents: number }> => {
    const anatomy = await leanAnatomy(), admitted = await dualQuestionAdmission(budget, worldId, prepared.board.board, version, anatomy);
    if (admitted.refused) return { kind: "decided", verdicts: refusedVerdicts, costCents: 0 };
    const gate = await askInBackground(anatomy, admitted.reserveMicroUsd);
    if (gate.kind !== "proceed") return leanGate(gate, anatomy, newCostCents);
    const bought = await buy(anatomy, admitted.reserveMicroUsd);
    if (bought.kind !== "bought") return waiting(bought, anatomy, continuityStrategy);
    const reader = CURRENT_CONTINUITY_READER[version];
    proof.continuity = { ...stage(bought, anatomy, continuityAttempt, continuityStrategy), reader };
    const costCents = bought.replayed ? 0 : bought.evidence.amountMicroUsd / 10_000;
    if (!visualStageReadable(proof.continuity)) return { kind: "decided", verdicts: refusedVerdicts, costCents };
    const read = readLocalPatchBodyContinuity(proof.continuity.raw, [`${hideId}:people`], reader);
    if (!read.ok) proof.continuity.readFault = read.fault;
    return { kind: "decided", costCents, verdicts: localPatchRuntimeContinuityVerdict(read).disposition === "repair"
      ? withAnatomy(refusedVerdicts, hideId, "repair", read, CURRENT_QUALITY_READER, prepared.scene.sceneVersion) : refusedVerdicts };
  };
  if (!qualityGood) {
    const neighbors = readSourceNeighborQualityStage(qualityStage);
    if (neighbors && (!neighbors.ok || neighbors.sourceNeighbors.disposition === "unresolved")) {
      // Correspondence uncertainty and malformed/misbound documents are evidence
      // failures, never the visual-uncertainty branch that can authorize repaint.
      const code = !neighbors.ok ? neighbors.fault.code : neighbors.sourceNeighbors.faults[0]?.code ?? "unsure";
      const path = !neighbors.ok ? neighbors.fault.path : "sourceNeighbors.neighbors";
      return classify({ ...base, bought: qualityBought, wire: primaryWire, verdicts: {}, proof, newCostCents }, entry.row, priorReceipt,
        { attempt: qualityAttempt, role: "quality", kind: code === "oversize" ? "oversize" : "shape",
          code: "source-neighbor:" + code, path, strategy: qualityStrategy, at: new Date().toISOString(), imageSha256: binding.imageSha256 },
        null, hideId, false);
    }
    if (verdicts[hideId]) return { ...base, bought: qualityBought, wire: primaryWire, verdicts, proof, newCostCents, evidence: null, diagnosis: null };
    // The quality answer itself could not be used: a wire fault, or a complete
    // reply the reader refused. Which field, and why, decides the next question:
    // a field over its bound is a size failure, never a request for stricter JSON.
    const fault = visualStageReadable(qualityStage)
      ? diagnoseVisualSceneAnswer(qualityStageRaw(qualityStage), [hideId], prepared.scene.sceneVersion, request.reviewScope, request.assessmentMode, CURRENT_QUALITY_READER) : null;
    if (fault) qualityStage.readFault = fault;
    const kind: EvidenceFaultKind = fault?.code ?? wireKind(qualityStage);
    const attempt: EvidenceAttempt = { attempt: qualityAttempt, role: "quality", kind, code: qualityStage.wireFault ?? kind, path: fault?.path || null,
      strategy: qualityStrategy, at: new Date().toISOString(), imageSha256: binding.imageSha256 };
    return classify({ ...base, bought: qualityBought, wire: primaryWire, verdicts, proof, newCostCents }, entry.row, priorReceipt, attempt, null, hideId, false);
  }
  // A bundle bought under v1 is read under v1, exactly as when it was bought: its pass stands (v1 asked more),
  // an unreadable answer takes the evidence route and a refusal is a refusal. Only a refusal for the pose plan
  // alone, which v2 does not require, is superseded (subject-rejudge/v1): it is kept beside the proof, and the
  // separate v2 subject question about these same pixels follows continuity.
  if (subjectBundle && subjectContext && subjectBundle.subjectPolicy !== SUBJECT_POLICY_V2) {
    const subject: SubjectStage = { ...stage(qualityBought, q, qualityAttempt, qualityStrategy), subjectPolicy: SUBJECT_POLICY_VERSION,
      reader: SUBJECT_READER, photoSha256: subjectBundle.photoSha256, planSha256: subjectBundle.planSha256, combined: SUBJECT_QUALITY_BUNDLE_VERSION,
      ...(sourceNeighbors ? { sourceNeighbors } : {}) };
    proof.subject = subject;
    const reading = readSubjectAnswer(subjectStageRaw(subject), { hideId, ageYears: subjectContext.upgrade.ageYears, plan: subjectContext.plan });
    if (!reading.ok) {
      subject.readFault = reading.fault;
      const overlong = subjectHasOnlyOverlongObservations(subjectStageRaw(subject));
      return classify({ ...base, bought: qualityBought, wire: primaryWire, verdicts, proof, newCostCents }, entry.row, priorReceipt,
        { attempt: evidenceReviewAttempt, role: "quality", kind: overlong ? "length" : reading.fault.code,
          code: overlong ? SUBJECT_FORMAT_RECOVERY_V2 : reading.fault.code, path: reading.fault.path || null,
          strategy: qualityStrategy, at: new Date().toISOString(), imageSha256: binding.imageSha256 }, null, hideId, false);
    }
    if (reading.disposition !== "pass") {
      subject.failedChecks = SUBJECT_CHECKS.filter(k => reading.checks[k] !== "pass");
      if (!poseOnlyV1Refusal(reading)) return { ...base, bought: qualityBought, wire: primaryWire,
        verdicts: withSubject(verdicts, hideId, reading, CURRENT_QUALITY_READER, prepared.scene.sceneVersion), proof, newCostCents, evidence: null, diagnosis: null };
      proof.supersededSubject = subject;
      delete proof.subject;
    }
  } else if (subjectBundle && subjectContext) {
    const subject: SubjectStage = { ...stage(qualityBought, q, qualityAttempt, qualityStrategy), subjectPolicy: SUBJECT_POLICY_V2,
      reader: SUBJECT_READER_V2, photoSha256: subjectBundle.photoSha256, planSha256: subjectBundle.planSha256, combined: SUBJECT_QUALITY_BUNDLE_VERSION,
      ...(sourceNeighbors ? { sourceNeighbors } : {}) };
    proof.subject = subject;
    const reading = readSubjectAnswerV2(subjectStageRaw(subject), { hideId, ageYears: subjectContext.upgrade.ageYears, plan: subjectContext.plan });
    if (!reading.ok) {
      subject.readFault = reading.fault;
      return classify({ ...base, bought: qualityBought, wire: primaryWire, verdicts, proof, newCostCents }, entry.row, priorReceipt,
        { attempt: evidenceReviewAttempt, role: "quality", kind: reading.fault.code, code: reading.fault.code, path: reading.fault.path || null,
          strategy: qualityStrategy, at: new Date().toISOString(), imageSha256: binding.imageSha256 }, null, hideId, false);
    }
    const world = reading.disposition === "pass" ? await acceptedWorldAppearances(c.db, game.id, hideId, subjectContext.upgrade.ageYears) : null;
    const refusal = world ? subjectCollectionRefusal({ hideId, appearance: reading.appearance }, world.accepted, world.worldSize) : null;
    if (reading.disposition !== "pass" || refusal) {
      subject.failedChecks = subjectV2RefusalCodes(reading, refusal);
      if (refusal) subject.collectionRefusal = refusal;
      const refusedVerdicts = withSubjectV2(verdicts, hideId, reading, refusal, CURRENT_QUALITY_READER, prepared.scene.sceneVersion);
      if (lean) {
        // local-patch-lean/v1: the continuity answer sent beside it is read before the refusal is recorded, so the
        // refusal carries what continuity found about these pixels, and a broken join is never repainted as a
        // refusal of who the child is (lean-repair.ts reads both).
        const beside = await leanContinuityBeside(refusedVerdicts);
        if (beside.kind === "waiting") return beside;
        return { ...base, bought: qualityBought, wire: primaryWire, verdicts: beside.verdicts, proof, newCostCents: newCostCents + beside.costCents,
          evidence: null, diagnosis: null };
      }
      return { ...base, bought: qualityBought, wire: primaryWire, verdicts: refusedVerdicts, proof, newCostCents, evidence: null, diagnosis: null };
    }
  }
  if (!qualityBought.replayed) {
    await c.db.$transaction(async tx => {
      await fenceLocalPatchImages(tx, game.id); await deps.fence(tx);
      const saved = await tx.targetVariantAsset.updateMany({ where: { id: entry.row.id, status: entry.row.status,
        assetId: entry.asset.id, attempts: entry.row.attempts, judgeJson: entry.row.judgeJson },
        data: { judgeJson: JSON.stringify({ ...priorReceipt, dualQualityCheckpoint: proof }) } });
      if (saved.count !== 1) throw Error("Candidate changed before the independent review checkpoint");
    });
    return { kind: "waiting", outcome: { state: "pending", reason: "Quality receipt retained; independent anatomy review is next",
      replayed: false, costCents: newCostCents } };
  }
  /**
   * The enrolled world's third stage: the subject question about these same pixels,
   * after quality and continuity both pass. Only an explicit, observed pass of every
   * subject check leaves the appearance acceptable; a located failure goes to the
   * repaint route, uncertainty to the bounded image route, an unreadable answer to the
   * evidence policy. Without the owned photograph nothing is accepted.
   */
  const subjectGate = async (reviewed: Omit<Reviewed, "evidence" | "diagnosis">): Promise<Reviewed | Waiting> => {
    // A bundle's subject stage is kept only when it passed (v2, or v1 which asked more); otherwise v2 is asked here.
    if (reviewed.proof.subject?.combined === SUBJECT_QUALITY_BUNDLE_VERSION) return { ...reviewed, evidence: null, diagnosis: null };
    const plan = subjectPlanOfHide(hideId, prepared.scene.sceneVersion);
    if (!upgrade || !plan || plan.board !== prepared.board.board) throw Error(`SUBJECT_REVIEW: ${hideId} has no enrolled subject plan`);
    let photoPng: Buffer;
    try { photoPng = await loadSubjectPhoto(c, prepared, upgrade); }
    catch (error) {
      if (!(error instanceof SubjectEvidenceUnavailable)) throw error;
      return { kind: "waiting", outcome: { state: "held", reason: error.message, replayed: false, costCents: reviewed.newCostCents } };
    }
    // A v1 question already started about these pixels in this round (bought before v2, its answer never
    // recorded on the row) is resumed and read under v1; only its refusal for the pose plan alone goes on to
    // the v2 question, once, with the v1 answer kept beside the proof. Never bought a second time as v2.
    const v1Question = reviewed.proof.supersededSubject ? null
      : subjectQuestion(prepared, plan, photoPng, binding, evidenceReviewAttempt, qualityAddendum(subjectStrategy), upgrade, SUBJECT_POLICY_VERSION);
    const resumeV1 = !!v1Question && await questionStarted(prepared, v1Question);
    const question = resumeV1 ? v1Question!
      : subjectQuestion(prepared, plan, photoPng, binding, evidenceReviewAttempt, qualityAddendum(subjectStrategy), upgrade, SUBJECT_POLICY_V2);
    const admitted = await dualQuestionAdmission(budget, worldId, prepared.board.board, version, question);
    if (admitted.refused) return refused(admitted);
    const subjectBatch = await askQualityThroughBatch(c, { gameId: game.id, worldId, sceneId: prepared.scene.id, board: prepared.board.board,
      hideId, variantId: entry.row.id, imageSha256: binding.imageSha256, question, syncKey: makeKey(question),
      ...(binding.authoredReturn ? { authoredReviewBinding: authoredLocalPatchReviewBinding(binding)! } : {}),
      reserveMicroUsd: admitted.reserveMicroUsd, fence: deps.fence, deadlineAt });
    if (subjectBatch.kind !== "proceed") return { kind: "waiting", outcome: { state: subjectBatch.kind === "held" ? "held" : "pending",
      reason: subjectBatch.reason, replayed: false, costCents: reviewed.newCostCents } };
    const bought = await buy(question, admitted.reserveMicroUsd);
    if (bought.kind !== "bought") return waiting(bought, question, subjectStrategy);
    const subject: SubjectStage = { ...stage(bought, question, evidenceReviewAttempt, subjectStrategy),
      ...(resumeV1 ? { subjectPolicy: SUBJECT_POLICY_VERSION, reader: SUBJECT_READER } : { subjectPolicy: SUBJECT_POLICY_V2, reader: SUBJECT_READER_V2 }),
      photoSha256: upgrade.photoSha256, planSha256: subjectPlanSha256(plan) };
    const next = { ...reviewed, proof: { ...reviewed.proof, subject },
      newCostCents: reviewed.newCostCents + (bought.replayed ? 0 : bought.evidence.amountMicroUsd / 10_000) };
    const attempt = (kind: EvidenceFaultKind, code: string, path: string | null): EvidenceAttempt => ({ attempt: evidenceReviewAttempt, role: "quality",
      kind, code, path, strategy: subjectStrategy, at: new Date().toISOString(), imageSha256: binding.imageSha256 });
    if (!visualStageReadable(subject)) return classify(next, entry.row, priorReceipt, attempt(wireKind(subject), subject.wireFault ?? wireKind(subject), null), null, hideId, false);
    if (resumeV1) {
      const old = readSubjectAnswer(subject.raw, { hideId, ageYears: upgrade.ageYears, plan });
      if (!old.ok) {
        subject.readFault = old.fault;
        return classify(next, entry.row, priorReceipt, attempt(old.fault.code, old.fault.code, old.fault.path || null), null, hideId, false);
      }
      if (old.disposition === "pass") return { ...next, evidence: null, diagnosis: null };
      subject.failedChecks = SUBJECT_CHECKS.filter(k => old.checks[k] !== "pass");
      if (!poseOnlyV1Refusal(old)) return { ...next, verdicts: withSubject(next.verdicts, hideId, old,
        qualityStageReader(next.proof.quality) ?? QUALITY_READER_STRICT, prepared.scene.sceneVersion), evidence: null, diagnosis: null };
      const { subject: _superseded, ...rest } = next.proof;
      return subjectGate({ ...reviewed, newCostCents: next.newCostCents, proof: { ...rest, supersededSubject: subject } });
    }
    const reading = readSubjectAnswerV2(subject.raw, { hideId, ageYears: upgrade.ageYears, plan });
    if (!reading.ok) {
      subject.readFault = reading.fault;
      return classify(next, entry.row, priorReceipt, attempt(reading.fault.code, reading.fault.code, reading.fault.path || null), null, hideId, false);
    }
    const world = reading.disposition === "pass" ? await acceptedWorldAppearances(c.db, game.id, hideId, upgrade.ageYears) : null;
    const refusal = world ? subjectCollectionRefusal({ hideId, appearance: reading.appearance }, world.accepted, world.worldSize) : null;
    if (reading.disposition === "pass" && !refusal) return { ...next, evidence: null, diagnosis: null };
    subject.failedChecks = subjectV2RefusalCodes(reading, refusal);
    if (refusal) subject.collectionRefusal = refusal;
    return { ...next, verdicts: withSubjectV2(next.verdicts, hideId, reading, refusal, qualityStageReader(next.proof.quality) ?? QUALITY_READER_STRICT, prepared.scene.sceneVersion),
      evidence: null, diagnosis: null };
  };
  // An enrolled world re-assessing an appearance keeps the continuity answer it already
  // paid for about exactly these pixels; it is never asked again, and never reused for others.
  if (upgrade) {
    const reused = await reusableContinuity(c.db, worldId, version, priorReceipt.dualContinuityCheckpoint as DualReviewProof | undefined, binding, lean)
      ?? await reusableContinuity(c.db, worldId, version, priorReceipt.boardReview?.dual as DualReviewProof | undefined, binding, lean);
    if (reused) {
      proof.continuity = reused.stage;
      return subjectGate({ ...base, bought: reused.bought, wire: primaryWire, verdicts, proof, newCostCents });
    }
  }
  const anatomy = lean ? await leanAnatomy() : await anatomyQuestion();
  const anatomyAdmitted = await dualQuestionAdmission(budget, worldId, prepared.board.board, version, anatomy);
  if (anatomyAdmitted.refused) return refused(anatomyAdmitted);
  if (isBackgroundReviewPolicy(anatomy.policy)) {
    const asked = await askInBackground(anatomy, anatomyAdmitted.reserveMicroUsd);
    if (asked.kind !== "proceed") return lean ? leanGate(asked, anatomy, newCostCents)
      : { kind: "waiting", outcome: { state: asked.kind === "held" ? "held" : "pending", reason: asked.reason, replayed: false, costCents: newCostCents } };
  }
  const anatomyBought = await buy(anatomy, anatomyAdmitted.reserveMicroUsd);
  if (anatomyBought.kind !== "bought") return waiting(anatomyBought, anatomy, continuityStrategy);
  const reader = CURRENT_CONTINUITY_READER[version];
  proof.continuity = { ...stage(anatomyBought, anatomy, continuityAttempt, continuityStrategy), reader };
  newCostCents += anatomyBought.replayed ? 0 : anatomyBought.evidence.amountMicroUsd / 10_000;
  const result = { ...base, bought: anatomyBought, wire: primaryWire, verdicts, proof, newCostCents };
  const at = new Date().toISOString();
  if (!visualStageReadable(proof.continuity)) {
    const kind = wireKind(proof.continuity);
    return classify(result, entry.row, priorReceipt, { attempt: evidenceReviewAttempt, role: "continuity", kind,
      code: proof.continuity.wireFault ?? kind, path: null, strategy: continuityStrategy, at, imageSha256: binding.imageSha256 }, null, hideId, false);
  }
  const read = readLocalPatchBodyContinuity(proof.continuity.raw, [`${hideId}:people`], reader);
  if (!read.ok) proof.continuity.readFault = read.fault;
  const verdict = localPatchRuntimeContinuityVerdict(read);
  if (verdict.disposition === "pass") {
    if (!upgrade) return { ...result, evidence: null, diagnosis: null };
    // A lean world's subject reading came with its quality answer: nothing more is asked, so it is decided now.
    if (lean && proof.subject?.combined === SUBJECT_QUALITY_BUNDLE_VERSION) return subjectGate(result);
    // Persist the independently paid continuity before starting a subject question.
    // A waiting batch, unreadable subject answer or interrupted worker must reuse it.
    await c.db.$transaction(async tx => {
      await fenceLocalPatchImages(tx, game.id); await deps.fence(tx);
      const saved = await tx.targetVariantAsset.updateMany({ where: { id: entry.row.id, status: entry.row.status,
        assetId: entry.asset.id, attempts: entry.row.attempts, judgeJson: entry.row.judgeJson },
        data: { judgeJson: JSON.stringify({ ...priorReceipt, dualContinuityCheckpoint: proof }) } });
      if (saved.count !== 1) throw Error("Candidate changed before the continuity checkpoint");
    });
    return { kind: "waiting", outcome: { state: "pending", reason: "Independent continuity retained; subject review is next",
      replayed: false, costCents: newCostCents } };
  }
  if (verdict.disposition === "repair") return { ...result, verdicts: withAnatomy(verdicts, hideId, "repair", read, CURRENT_QUALITY_READER, prepared.scene.sceneVersion), evidence: null, diagnosis: null };
  const { kind, code, path } = readKind(read, verdict.reason);
  return classify(result, entry.row, priorReceipt, { attempt: evidenceReviewAttempt, role: "continuity", kind, code, path,
    strategy: continuityStrategy, at, imageSha256: binding.imageSha256 }, read, hideId, false);
}


/** Exact read-only admission plan for the same single question the runtime
 * will dispatch. No policy grant, reservation, provider call or image change. */
export async function prospectiveSingleVisualReviewQuestion(c: Pick<Container, "db" | "storage">, prepared: Prepared) {
  const version = await dualVisualReviewVersion(c.db, prepared.game.id);
  if (!version) throw Error("SINGLE_REVIEW: a pinned visual release is required for planning");
  const asked = {...prepared, request: await dualQualityRequest(version, prepared.request)};
  const upgrade = await subjectUpgradeOf(c.db, prepared.game.id), plan = subjectPlanOfHide(asked.request.hides[0]!.hideId, prepared.scene.sceneVersion);
  if (!upgrade || !plan) throw Error("SINGLE_REVIEW: enrolled subject evidence required for planning");
  const photoPng = await loadSubjectPhoto(c, asked, upgrade), one = await prepareSingleLowQuestion(c, asked, version, {upgrade, plan, photoPng});
  return {requestKey:one.requestKey, fingerprint:one.question.fingerprint, singleVersion:one.singleVersion,
    reserveMicroUsd:one.bound.microUsd, inputTokens:one.bound.inputTokens, outputTokens:one.bound.outputTokens};
}

async function prepareSingleLowQuestion(c: Pick<Container, "db" | "storage">, prepared: Prepared, version: DualVisualReviewVersion, subject: SubjectQuestionContext) {
  const binding = dualBinding(prepared, version), hideId = binding.hideId;
  const entry = prepared.entries.find(e => e.hide.id === hideId)!, receipt = JSON.parse(entry.row.judgeJson!);
  const lowContinued = (Array.isArray(receipt.evidenceAttempts) ? receipt.evidenceAttempts : []).filter((v: {single?:unknown;imageSha256?:unknown}) => v.single === SINGLE_VISUAL_REVIEW_VERSION && v.imageSha256 === binding.imageSha256).length;
  const legacyAttempt = lowContinued + 1, tier = lowContinued ? 'default' as const : 'flex' as const;
  const sourceNeighbors = sourceNeighborQualityEvidence(prepared.placementContext, hideId, binding.imageSha256, receipt);
  const quality = dualQualityQuestion(prepared.request, binding, 1, STANDARD, { tier });
  const combined = combinedQualitySubjectQuestion(quality, subject.plan, subject.photoPng, subject.upgrade, SUBJECT_POLICY_V2);
  if (!combined) throw Error('SINGLE_REVIEW: complete quality and identity evidence does not fit');
  const assessment = withSourceNeighborQualityQuestion(combined.question, sourceNeighbors, entry.reviewContextRect);
  const anatomy = await runtimeContinuityQuestion(prepared, binding, 1, version, STANDARD, 'responses-background', tier);
  const lowQuestion = prepareVisualReview({ ...assessment, combined: SINGLE_VISUAL_REVIEW_VERSION, effort: 'low',
    judge: 'gpt-6.1-sol', transport: 'responses-background', tier, images: [...assessment.images, ...anatomy.images], labels: [...assessment.labels, ...anatomy.labels],
    prompt: assessment.prompt + '\nONE REQUEST, ALL CHECKS: the assessment above and the final-image anatomy below are mandatory sections of ONE answer. Complete all inspections; never infer a pass from another check.\n'
      + anatomy.prompt + '\nFINAL OUTERMOST OUTPUT CONTRACT overrides the separate output envelopes above: {"version":"' + SINGLE_VISUAL_REVIEW_VERSION
      + '","assessment":' + (sourceNeighbors ? '<complete final assessment envelope above including quality, subject and sourceNeighbors>' : '<complete final quality and subject assessment envelope above>')
      + ',"continuity":<complete anatomy object with cases>,"doubt":false,"doubtReason":null}. '
      + (lowContinued ? '\nUNANSWERED TRANSPORT CONTINUATION '+legacyAttempt+': the earlier provider request ended without text or usage. This is the first usable assessment of these unchanged pixels, not a second opinion.' : '')
      + 'Use doubt=true only for a genuinely unresolved visible question and give a specific doubtReason (12-400 characters). Do not request a second opinion routinely. A clearly located defect is a repair decision, not uncertainty. Keep passing observations concise; retain every required field, fault, location and evidence ID.' });
  // Any already submitted LOW request keeps its exact question and fingerprint.
  // Increasing effort is prospective and never buys a second usable opinion.
  const authority = await detectivesSingleReviewAuthorization(c.db, prepared.game.id);
  const rounds = await backgroundRoundsOnImage(c.db, prepared.game.id, { hideId, variantId: entry.row.id,
    imageSha256: binding.imageSha256, geometrySha256: binding.geometrySha256, identitySha256: binding.identitySha256,
    ...(binding.authoredReturn ? { authoredReviewBinding: authoredLocalPatchReviewBinding(binding)! } : {}) });
  const hasLow = rounds.some(round => round.fingerprint === lowQuestion.fingerprint)
    || lowContinued > 0 || receipt.boardReview?.dual?.single === SINGLE_VISUAL_REVIEW_VERSION
      && receipt.boardReview.dual.imageSha256 === binding.imageSha256;
  const singleVersion = authority?.kind === 'from-birth' && !hasLow ? SINGLE_MEDIUM_VISUAL_REVIEW_VERSION : SINGLE_VISUAL_REVIEW_VERSION;
  const continued = singleVersion === SINGLE_VISUAL_REVIEW_VERSION ? lowContinued
    : (Array.isArray(receipt.evidenceAttempts) ? receipt.evidenceAttempts : []).filter((v: {single?:unknown;imageSha256?:unknown}) => v.single === singleVersion && v.imageSha256 === binding.imageSha256).length;
  const attempt = continued + 1;
  let mediumPrompt = (singleVersion === SINGLE_MEDIUM_VISUAL_REVIEW_VERSION ? singleMediumPrompt(lowQuestion.prompt.replace(anatomy.prompt,()=>singleMediumAnatomyPrompt(anatomy.prompt)),binding,hideId) : lowQuestion.prompt).replace('"version":"' + SINGLE_VISUAL_REVIEW_VERSION + '"', '"version":"' + singleVersion + '"');
  if (singleVersion === SINGLE_MEDIUM_VISUAL_REVIEW_VERSION && continued)
    mediumPrompt = mediumPrompt.replace('Use doubt=true only', '\nUNANSWERED TRANSPORT CONTINUATION '+attempt+': the earlier provider request ended without text or usage. This is the first usable assessment of these unchanged pixels, not a second opinion.Use doubt=true only');
  const anchor = prepared.child.originalPhotoAssetId===null ? await publishedCrownSubjectAnchor(c,prepared.game.id,hideId,subject.upgrade) : null;
  if(anchor){mediumPrompt+='\nPRIVACY-PRESERVING RECOMPOSITION SOURCE: the original photograph was normally deleted after delivery and is NOT supplied. The evidence labelled original-photo is instead the prior PHOTO-APPROVED target crop, source image '+anchor.anchor.sourceImageSha256+'. It is an unchanged-face comparison anchor, not a photo or an approval of this new image. For photoLikeness, require the same visible face that previously passed the enrolled photograph check. Independently require agreement with the canonical portrait, the stated age, face visibility and wardrobe. The deterministic correction preserves every pixel below crop-y='+anchor.anchor.unchangedBelowTop+'; only the source-qualified upper crown/feather band changes. Inspect the restored hair against RAW and canonical identity. Never copy the old cut crown. All quality, source-neighbor, anatomy, head and subject checks still require fresh positive evidence in this SAME MEDIUM answer. Anchor ancestry SHA256: '+sha256Bytes(Buffer.from(JSON.stringify(anchor.anchor)));}
  const head = singleVersion === SINGLE_MEDIUM_VISUAL_REVIEW_VERSION ? await singleReviewHeadEvidence(c.db, {
    gameId: prepared.game.id, hide: entry.hide, attempt: entry.row.attempts, receipt, shipping: entry.bytes,
    geometrySha256: binding.geometrySha256, identitySha256: binding.identitySha256 }) : undefined;
  const shared = singleVersion === SINGLE_MEDIUM_VISUAL_REVIEW_VERSION ? await singleMediumEvidence(assessment,anatomy,hideId) : undefined;
  let question = singleVersion === SINGLE_VISUAL_REVIEW_VERSION ? lowQuestion : prepareVisualReview({ ...lowQuestion,
    combined: singleVersion, effort: 'medium', tier: continued ? 'default' : 'flex',
    prompt: mediumPrompt + '\nMEDIUM SHARED NATIVE EVIDENCE: the quality AFTER image contains the anatomy context at LEFT and its exact native head detail at RIGHT across the 24px white gutter. Inspect both panels for every anatomy requirement; neither is a new appearance. All four AFTER-only joins remain supplied as the RIGHT native panels of their labelled BEFORE/AFTER return comparisons. Anatomy must inspect RIGHT AFTER only; never borrow a head from LEFT BEFORE. No required pixels or inspections were removed.' + targetHeadReturnPrompt(head!.evidence), images: [...shared!.images, head!.raw, entry.bytes],
    labels: [...shared!.labels.map(label=>anchor&&label.includes(hideId+':original-photo')?'EVIDENCE_ID='+hideId+':original-photo PRIOR PHOTO-APPROVED TARGET FACE ANCHOR, NOT the deleted photograph':label), 'EVIDENCE_ID='+hideId+':native-provider-raw 512x768 WHOLE RAW TARGET HEAD, crop-local axes',
      'EVIDENCE_ID='+hideId+':native-shipping-crown 512x768 EXACT PLAYER CROP, same axes, inspect full crown at the return edge'] });
  let nativeDetailEvidence: NativeDetailEvidence | undefined;
  if(singleVersion === SINGLE_MEDIUM_VISUAL_REVIEW_VERSION){
    // Any existing reservation/settlement keeps the exact historical question,
    // even when its background intent or mutable row was interrupted. New
    // detail evidence is prospective and never abandons paid recovery work.
    const legacyKey='self-repair:board:'+prepared.board.board+':'+question.fingerprint;
    if(!await prepared.budget.readRequest(prepared.worldId,legacyKey)){
      const native=await nativeDetailQuestion(question,{hideId,
        source:await sharp(prepared.composed).extract(entry.crop).png().toBuffer(),raw:head!.raw,shipping:entry.bytes});
      question=native.question;nativeDetailEvidence=native.evidence;
    }
  }
  const requestKey = 'self-repair:board:' + prepared.board.board + ':' + question.fingerprint;
  const bound = visualReviewMaxCharge(question);
  if (!bound.ok) throw Error('SINGLE_REVIEW: unbounded prepared evidence: ' + bound.reason);
  if (bound.microUsd > 250_000) throw Error('SINGLE_REVIEW: exact request exceeds its qualified maximum');
  return { binding, hideId, entry, receipt, sourceNeighbors, combined, question, requestKey, bound, attempt, continued, singleVersion, head, anchor, nativeDetailEvidence };
}

/** Read all roles from one existing settled question, without a reservation,
 * dispatch, settlement or interpretation of a different image or identity. */
async function decideRetainedSingleEnvelope(c:Container,prepared:Prepared,deps:LocalPatchBoardReviewDeps,version:DualVisualReviewVersion,
  subject:SubjectQuestionContext,deadlineAt?:number):Promise<Waiting|Reviewed>{
  const not=(reason:string):Waiting=>({kind:"waiting",outcome:{state:"pending",reason,replayed:true,costCents:0}});
  const entry=prepared.entries.find(e=>e.hide.id===prepared.request.hides[0]?.hideId);
  if(!entry||!localPatchBoundEnvelopeUndecided(entry.row))return not("No bound single envelope awaits reconciliation");
  const live=await c.db.game.findUnique({where:{id:prepared.game.id},include:{orders:true}});
  if(!live||live.status!=="TARGETS_GENERATING"||live.deletedAt||live.ownerId!==prepared.game.ownerId
    ||!live.orders.some(o=>o.userId===live.ownerId&&o.paymentStatus==="PAID"&&o.paidAt&&!o.refundedAt)
    ||live.orders.some(o=>o.paymentStatus==="REFUNDED"||o.refundedAt))return not("The original paid world is no longer in generation");
  const receipt=JSON.parse(entry.row.judgeJson!),prior=receipt.boardReview.dual as DualReviewProof,binding=dualBinding(prepared,version);
  if(prior.version!==version||prior.single!==SINGLE_MEDIUM_VISUAL_REVIEW_VERSION||!prior.subject||!prior.continuity
    ||prior.hideId!==binding.hideId||prior.imageSha256!==binding.imageSha256||prior.geometrySha256!==binding.geometrySha256
    ||prior.identitySha256!==binding.identitySha256||JSON.stringify(prior.authoredReturn)!==JSON.stringify(binding.authoredReturn))
    return not("Retained single roles differ from the current immutable candidate");
  const options={allowSingle:true,...(binding.authoredReturn?{authoredReviewBinding:authoredLocalPatchReviewBinding(binding)}:{})};
  const quality=await verifiedDualStage(c.db,prepared.worldId,prior.quality,"scene-quality",options);
  const continuity=await verifiedDualStage(c.db,prepared.worldId,prior.continuity,"head-continuity",options);
  const who=await verifiedDualStage(c.db,prepared.worldId,prior.subject,"scene-quality",options);
  if(!quality||!continuity||!who||!quality.bytes.equals(continuity.bytes)||!quality.bytes.equals(who.bytes))
    return not("All three roles must prove the same original settled paid bytes");
  const bought:Bought={kind:"bought",bytes:quality.bytes,evidence:quality.evidence,replayed:true,settledFromRetained:false};
  return singleLowReview(c,prepared,deps,version,subject,deadlineAt,{bought,prior});
}

/** One single-review question per immutable image. Later slices poll or replay this exact key.
 * No automatic second opinion or independent second role is purchased. */
async function singleLowReview(c: Container, prepared: Prepared, deps: LocalPatchBoardReviewDeps, version: DualVisualReviewVersion,
  subject: SubjectQuestionContext, deadlineAt?: number, retained?: {bought:Bought;prior:DualReviewProof}): Promise<Waiting | Reviewed> {
  const { binding, hideId, entry, sourceNeighbors, combined, question, requestKey, bound, attempt, singleVersion, head, anchor, nativeDetailEvidence } = await prepareSingleLowQuestion(c, prepared, version, subject);
  if(retained&&(singleVersion!==SINGLE_MEDIUM_VISUAL_REVIEW_VERSION||retained.prior.quality.requestKey!==requestKey
    ||retained.prior.quality.fingerprint!==question.fingerprint))return{kind:"waiting",outcome:{state:"pending",
      reason:"The retained question differs from the rebuilt immutable evidence",replayed:true,costCents:0}};
  if(!retained){
    if (singleVersion === SINGLE_MEDIUM_VISUAL_REVIEW_VERSION) await ensureSingleMediumReviewPolicy(c, prepared.game.id, deps.fence);
    await inventorySelfRepairRequest(c, prepared.game.id, requestKey, deps.fence);
    const gate = await askContinuityInBackground(c, { gameId: prepared.game.id, worldId: prepared.worldId, requestKey, question,
      reserveMicroUsd: bound.microUsd, fence: deps.fence, ...(deadlineAt === undefined ? {} : { deadlineAt }),
      binding: { hideId, variantId: entry.row.id, imageSha256: binding.imageSha256, geometrySha256: binding.geometrySha256,
        identitySha256: binding.identitySha256, ...(binding.authoredReturn ? { authoredReviewBinding: authoredLocalPatchReviewBinding(binding)! } : {}) } });
    if (gate.kind !== 'proceed') return { kind: 'waiting', outcome: { state: gate.kind === 'held' ? 'held' : 'pending', reason: gate.reason, replayed: false, costCents: 0 } };
  }
  const bought = retained?.bought ?? await purchaseOnce({ ledger: prepared.budget, store: new LocalPatchRetainedPurchaseStore(c, prepared.game.id, prepared.budget) }, {
    worldId: prepared.worldId, requestKey, operationFingerprint: question.fingerprint, scope: 'judge', reserveMicroUsd: bound.microUsd,
    buy: async () => { throw Error('SINGLE_REVIEW: background answer must only replay its retained purchase'); } });
  if (bought.kind !== 'bought') return { kind: 'waiting', outcome: { state: bought.kind === 'unresolved' ? 'held' : 'pending', reason: bought.reason, replayed: false, costCents: 0 } };
  const wire = JSON.parse(bought.bytes.toString()) as LocalPatchJudgeResult;
  if (binding.authoredReturn && JSON.parse(bought.bytes.toString()).authoredReviewBinding !== authoredLocalPatchReviewBinding(binding))
    throw Error('SINGLE_REVIEW: retained answer differs from dispatched authored candidate');
  const base: DualStageBase = { requestKey, fingerprint: question.fingerprint, attempt, policy: question.policy, raw: wire.raw,
    model: wire.model, finishReason: wire.finishReason, wireFault: wire.wireFault, costMicroUsd: bought.evidence.amountMicroUsd,
    ...(singleVersion === SINGLE_MEDIUM_VISUAL_REVIEW_VERSION ? { envelopeReader: BOUND_SUBJECT_QUALITY_ENVELOPE_READER_V2 } : {}) };
  const qualityStage: QualityStage = { ...base, reader: CURRENT_QUALITY_READER, subjectBundle: combined.binding, ...(sourceNeighbors ? { sourceNeighbors } : {}), ...(head ? { headEvidence: head.evidence } : {}), ...(nativeDetailEvidence ? { nativeDetailEvidence } : {}) };
  const continuity: ContinuityStage = { ...base, reader: CURRENT_CONTINUITY_READER[version] };
  const subjectStage: SubjectStage = { ...base, subjectPolicy: SUBJECT_POLICY_V2, reader: SUBJECT_READER_V2,
    photoSha256: subject.upgrade.photoSha256, planSha256: subjectPlanSha256(subject.plan), combined: SUBJECT_QUALITY_BUNDLE_VERSION,
    ...(anchor?{recompositionAnchor:anchor.anchor}:{}),
    ...(sourceNeighbors ? { sourceNeighbors } : {}) };
  const proof: DualReviewProof = { version, single: singleVersion, hideId,
    ...(prepared.scene.sceneVersion === 13 ? { sceneVersion: 13 as const } : {}),
    imageSha256: binding.imageSha256, geometrySha256: binding.geometrySha256, identitySha256: binding.identitySha256,
    ...(binding.authoredReturn ? { authoredReturn: binding.authoredReturn } : {}), ...(binding.authoredRecovery ? { authoredRecovery: binding.authoredRecovery } : {}),
    quality: qualityStage, continuity, subject: subjectStage };
  const verdict = readQualityStage(qualityStage, hideId, prepared.scene.sceneVersion);
  let verdicts: LocalPatchBoardJudgeResult['verdicts'] = verdict ? { [hideId]: verdict } : {};
  const readSubject = readSubjectAnswerV2(subjectStageRaw(subjectStage), { hideId, ageYears: subject.upgrade.ageYears, plan: subject.plan });
  const readAnatomy = readContinuityStage(continuity, hideId, version), outer = readSingleVisualReview(wire.raw);
  // Missing evidence cannot grant acceptance. This stable paid key never purchases a second automatic reading.
  if (!outer || !verdict || !readSubject.ok || !readAnatomy?.ok)
    return { kind: 'reviewed', bought, wire, verdicts: {}, proof, newCostCents: 0, evidence: null, diagnosis: null, salvaged: !!retained };
  const world = readSubject.disposition === 'pass' ? await acceptedWorldAppearances(c.db, prepared.game.id, hideId, subject.upgrade.ageYears) : null;
  const refusal = world ? subjectCollectionRefusal({ hideId, appearance: readSubject.appearance }, world.accepted, world.worldSize) : null;
  if (readSubject.disposition !== 'pass' || refusal) {
    subjectStage.failedChecks = subjectV2RefusalCodes(readSubject, refusal); if (refusal) subjectStage.collectionRefusal = refusal;
    verdicts = withSubjectV2(verdicts, hideId, readSubject, refusal, CURRENT_QUALITY_READER, prepared.scene.sceneVersion);
  }
  const anatomyVerdict = localPatchRuntimeContinuityVerdict(readAnatomy);
  if (anatomyVerdict.disposition === 'repair') verdicts = withAnatomy(verdicts, hideId, 'repair', readAnatomy, CURRENT_QUALITY_READER, prepared.scene.sceneVersion);
  else if (anatomyVerdict.disposition !== 'pass' || outer.doubt) verdicts = withAnatomy(verdicts, hideId, 'uncertain', readAnatomy, CURRENT_QUALITY_READER, prepared.scene.sceneVersion);
  return { kind: 'reviewed', bought, wire, verdicts, proof, newCostCents: 0, evidence: null, diagnosis: null, salvaged: !!retained };
}
