import sharp from "sharp";
import type { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { PLAYER_REVIEW_MODE } from "./local-patch-player-review";
import { visualReviewCharge } from "../../infra/generation/visual-review-pricing";
import { CONTINUITY_READER_STRICT, localPatchRuntimeContinuityVerdict, readLocalPatchBodyContinuity, type ContinuityReading } from "../../domain/scene/local-patch-body-continuity";
import { nextLocalPatchEvidenceStep, type EvidenceAttempt, type EvidenceDiagnosis, type EvidenceFaultKind, type EvidenceRole, type EvidenceStrategy } from "../../domain/scene/local-patch-evidence-policy";
import { CURRENT_CONTINUITY_READER, CURRENT_QUALITY_READER, qualityReaderReadsMore, qualityStageReader, readQualityStage, verifiedDualStage, visualStageReadable,
  type ContinuityReReading, type DualReviewProof, type DualReviewStage, type DualStageBase, type QualityReReading, type QualityStage } from "./local-patch-dual-evidence";
import { localPatchCrowdContinuityPrompt, localPatchHeadContinuityPrompt } from "./local-patch-body-continuity";
import { prepareVisualReview, sceneQualityQuestion, parseVisualSceneVerdicts, diagnoseVisualSceneAnswer, type PreparedVisualReview } from "./visual-review";
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
import { DUAL_VISUAL_REVIEW_V2, DUAL_VISUAL_REVIEW_VERSION, dualVisualReviewVersion, qualityQuestionFor, QUALITY_QUESTION_OBJECT_JOINS, type DualVisualReviewVersion } from "./visual-review-release";
import { prepareJoinDetails } from "./local-patch-integration-evidence";
import type { BudgetJson } from "./world-budget";

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
  version: DualVisualReviewVersion = DUAL_VISUAL_REVIEW_VERSION, strategy: EvidenceStrategy = STANDARD) {
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
  return prepareVisualReview({ role: "head-continuity", effort: "high", images, labels,
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
  reader: QualityReader) {
  const wireVerdict = Object.fromEntries(Object.entries(verdicts[hideId]!).filter(([key]) =>
    !["claimedVerdict", "verdictOverridden", "downgraded", "contradicted", "unclassified"].includes(key)));
  return { ...verdicts, [hideId]: result === "repair"
    ? parseLocalPatchVerdict({ ...wireVerdict, pictureWhole: "fail", verdict: "fail", reason: "Independent final-image anatomy review found a visible defect",
      faults: [...verdicts[hideId]!.faults, ...readFaults(read)].slice(0, 16) }, 12, reader)
    : parseLocalPatchVerdict({ ...wireVerdict, pictureWhole: "unsure", verdict: "unsure",
      reason: "Independent final-image anatomy review stayed uncertain about these pixels after a decisive question",
      faults: verdicts[hideId]!.faults.filter(f => f.check !== "pictureWhole") }, 12, reader) };
}

type RetainedBinding = { imageSha256: string; geometrySha256: string; identitySha256: string; hideId: string };
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
    || prior.imageSha256 !== binding.imageSha256 || prior.geometrySha256 !== binding.geometrySha256 || prior.identitySha256 !== binding.identitySha256) return none;
  if (!prior.continuity) return readRetainedQuality(db, worldId, prior, binding);
  if (prior.continuity.reading || (prior.continuity.reader ?? CONTINUITY_READER_STRICT) === CURRENT_CONTINUITY_READER[version]) return none;
  const quality = await verifiedDualStage(db, worldId, prior.quality, "scene-quality");
  if (!quality || !await verifiedDualStage(db, worldId, prior.continuity, "head-continuity"))
    return { ok: false as const, reason: "Retained review answers no longer prove their own settled charges" };
  // The quality answer keeps the reading its own decision was made with.
  const qualityVerdict = readQualityStage(prior.quality, binding.hideId), qualityReader = qualityStageReader(prior.quality) ?? QUALITY_READER_STRICT;
  if (localPatchQualityDisposition(qualityVerdict, 12, { hideId: binding.hideId, reader: qualityReader }).state !== "acceptable")
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
  const quality = await verifiedDualStage(db, worldId, prior.quality, "scene-quality");
  if (!quality) return { ok: false as const, reason: "Retained review answers no longer prove their own settled charges" };
  const reader = CURRENT_QUALITY_READER;
  const verdicts = parseVisualSceneVerdicts(prior.quality.raw, [binding.hideId], 12, "ready-only/v1", PLAYER_REVIEW_MODE, reader);
  const fault: QualityReadFault | null = verdicts[binding.hideId] ? null
    : diagnoseVisualSceneAnswer(prior.quality.raw, [binding.hideId], 12, "ready-only/v1", PLAYER_REVIEW_MODE, reader);
  const disposition = localPatchQualityDisposition(verdicts[binding.hideId] ?? null, 12, { hideId: binding.hideId, reader }).state;
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
  const retained = await readRetainedAnswer(c.db, prepared.worldId, version, receipt.boardReview?.dual as DualReviewProof | undefined, binding);
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
  if (verdict.disposition === "repair") return { ...base, wire, verdicts: withAnatomy(verdicts, binding.hideId, "repair", read, qualityReader), evidence: null, diagnosis: null };
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
    return { ...result, verdicts: withAnatomy(result.verdicts, hideId, "uncertain", read, qualityStageReader(result.proof.quality) ?? QUALITY_READER_STRICT),
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
  if (prepared.scene.sceneVersion !== 12 || prepared.extraPlan || prepared.request.reviewScope !== "ready-only/v1"
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

async function dualReview(c: Container, prepared: Prepared, deps: LocalPatchBoardReviewDeps, version: DualVisualReviewVersion, deadlineAt: number | undefined,
  options: { decideRetained?: boolean }): Promise<Waiting | Reviewed> {
  const { request, entries, game, budget, worldId, evidenceReviewAttempt } = prepared;
  const hideId = request.hides[0]!.hideId, entry = entries.find(e => e.hide.id === hideId)!;
  const binding = { version, gameId: game.id, sceneId: prepared.scene.id, hideId,
    variantId: entry.row.id, imageSha256: entry.imageSha256, geometrySha256: entry.geometrySha256,
    identitySha256: sha256Bytes(prepared.sheet), attempts: entry.row.attempts };
  if (options.decideRetained) return decideRetainedAnswer(c, prepared, version, binding);
  const priorReceipt = JSON.parse(entry.row.judgeJson!);
  const prior = (priorReceipt.boardReview?.dual ?? priorReceipt.dualQualityCheckpoint) as DualReviewProof | undefined;
  // The recovery policy chose this round's question for the role that failed.
  const recovery = localPatchEvidenceRecovery(entry.row);
  const strategyFor = (role: EvidenceRole) => recovery?.retry && recovery.role === role && recovery.strategy ? recovery.strategy : STANDARD;
  // An unreadable Sol reply does not buy a second good Opus assessment: the
  // identical earlier question (same attempt and strategy) is replayed.
  const oldQuality = prior?.quality;
  // Read as its own decision was made: under its named reader, or its verified re-reading.
  const oldVerdict = oldQuality ? readQualityStage(oldQuality, hideId) : null;
  const reuse = prior?.imageSha256 === binding.imageSha256 && oldQuality && Number.isSafeInteger(oldQuality.attempt)
    && oldQuality.attempt > 0 && localPatchQualityDisposition(oldVerdict ?? null, 12, { hideId, reader: qualityStageReader(oldQuality) ?? QUALITY_READER_STRICT }).state === "acceptable";
  const qualityAttempt = reuse ? oldQuality!.attempt : evidenceReviewAttempt;
  const qualityStrategy = reuse ? oldQuality!.strategy ?? STANDARD : strategyFor("quality");
  const quality = sceneQualityQuestion(request, "high");
  const q = prepareVisualReview({ ...quality, prompt: quality.prompt + qualityAddendum(qualityStrategy)
    + `\nImmutable candidate binding: ${JSON.stringify(binding)}. Evidence attempt: ${qualityAttempt}.` });
  const makeKey = (question: PreparedVisualReview) => `self-repair:board:${prepared.board.board}:${question.fingerprint}`;
  const buy = async (question: PreparedVisualReview) => {
    const requestKey = makeKey(question);
    await c.db.$transaction(async tx => { await fenceLocalPatchImages(tx, game.id); await deps.fence(tx); });
    await inventorySelfRepairRequest(c, game.id, requestKey, deps.fence);
    return purchaseOnce({ ledger: budget, store: new LocalPatchRetainedPurchaseStore(c, game.id, budget) }, {
      worldId, requestKey, operationFingerprint: question.fingerprint, scope: "judge", reserveMicroUsd: 300_000,
      ...(deadlineAt === undefined ? {} : { dispatchWindow: { deadlineAt,
        needMs: LOCAL_PATCH_MIN_PROVIDER_MS.judge + LOCAL_PATCH_PHASE_MARGIN_MS, retainMs: LOCAL_PATCH_PHASE_MARGIN_MS } }),
      buy: async ({ timeoutMs }) => {
        const reply = await c.visualReview!.request(question, Math.min(timeoutMs ?? question.policy.timeoutMs, question.policy.timeoutMs));
        const charge = visualReviewCharge(question.policy, reply.model, reply.usage);
        const bytes = Buffer.from(JSON.stringify({ ...reply, policy: question.policy, fingerprint: question.fingerprint }));
        if (reply.costUnknown || charge.costUnknown || !reply.requestId) return { bytes, unknownReason: "Grouped review charge could not be verified" };
        return { bytes, evidence: { providerNamespace: `${question.policy.provider}:find-me-existing`, providerRequestId: reply.requestId,
          usageId: sha256Bytes(Buffer.from(JSON.stringify(reply.usage))), rawUsage: reply.usage as BudgetJson, model: reply.model!,
          amountMicroUsd: Math.ceil(charge.costCents * 10_000), costBasis: "conservative-upper-estimate" as const } };
      },
    });
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
  const qualityBought = await buy(q);
  if (qualityBought.kind !== "bought") return waiting(qualityBought, q, qualityStrategy);
  // Decided now, so read by the current reader, which the stage names for every later reading.
  const qualityStage: QualityStage = { ...stage(qualityBought, q, qualityAttempt, qualityStrategy), reader: CURRENT_QUALITY_READER };
  const verdicts = parseVisualSceneVerdicts(visualStageReadable(qualityStage) ? qualityStage.raw : null,
    [hideId], 12, request.reviewScope, request.assessmentMode, CURRENT_QUALITY_READER);
  const proof: DualReviewProof = { version, hideId, imageSha256: binding.imageSha256,
    geometrySha256: binding.geometrySha256, identitySha256: binding.identitySha256, quality: qualityStage, continuity: null };
  const primaryWire = JSON.parse(qualityBought.bytes.toString()) as LocalPatchJudgeResult;
  let newCostCents = qualityBought.replayed ? 0 : qualityBought.evidence.amountMicroUsd / 10_000;
  const qualityGood = localPatchQualityDisposition(verdicts[hideId] ?? null, 12, { hideId, reader: CURRENT_QUALITY_READER }).state === "acceptable";
  const base = { kind: "reviewed" as const, salvaged: false };
  if (!qualityGood) {
    if (verdicts[hideId]) return { ...base, bought: qualityBought, wire: primaryWire, verdicts, proof, newCostCents, evidence: null, diagnosis: null };
    // The quality answer itself could not be used: a wire fault, or a complete
    // reply the reader refused. Which field, and why, decides the next question:
    // a field over its bound is a size failure, never a request for stricter JSON.
    const fault = visualStageReadable(qualityStage)
      ? diagnoseVisualSceneAnswer(qualityStage.raw, [hideId], 12, request.reviewScope, request.assessmentMode, CURRENT_QUALITY_READER) : null;
    if (fault) qualityStage.readFault = fault;
    const kind: EvidenceFaultKind = fault?.code ?? wireKind(qualityStage);
    const attempt: EvidenceAttempt = { attempt: qualityAttempt, role: "quality", kind, code: qualityStage.wireFault ?? kind, path: fault?.path || null,
      strategy: qualityStrategy, at: new Date().toISOString(), imageSha256: binding.imageSha256 };
    return classify({ ...base, bought: qualityBought, wire: primaryWire, verdicts, proof, newCostCents }, entry.row, priorReceipt, attempt, null, hideId, false);
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
  const continuityStrategy = strategyFor("continuity");
  const anatomy = await runtimeContinuityQuestion(prepared, binding, evidenceReviewAttempt, version, continuityStrategy);
  const anatomyBought = await buy(anatomy);
  if (anatomyBought.kind !== "bought") return waiting(anatomyBought, anatomy, continuityStrategy);
  const reader = CURRENT_CONTINUITY_READER[version];
  proof.continuity = { ...stage(anatomyBought, anatomy, evidenceReviewAttempt, continuityStrategy), reader };
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
  if (verdict.disposition === "pass") return { ...result, evidence: null, diagnosis: null };
  if (verdict.disposition === "repair") return { ...result, verdicts: withAnatomy(verdicts, hideId, "repair", read, CURRENT_QUALITY_READER), evidence: null, diagnosis: null };
  const { kind, code, path } = readKind(read, verdict.reason);
  return classify(result, entry.row, priorReceipt, { attempt: evidenceReviewAttempt, role: "continuity", kind, code, path,
    strategy: continuityStrategy, at, imageSha256: binding.imageSha256 }, read, hideId, false);
}
