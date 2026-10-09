import sharp from "sharp";
import type { Container } from "../container";
import { visualReviewCharge } from "../../infra/generation/visual-review-pricing";
import { readContinuity, runtimeContinuityDisposition, visualStageReadable, type DualReviewProof, type DualReviewStage } from "./local-patch-dual-evidence";
import { localPatchHeadContinuityPrompt } from "./local-patch-body-continuity";
import { prepareVisualReview, sceneQualityQuestion, parseVisualSceneVerdicts, type PreparedVisualReview } from "./visual-review";
import type { LocalPatchJudgeResult, LocalPatchBoardJudgeResult } from "./local-patch-judge";
import { localPatchQualityDisposition, parseLocalPatchVerdict } from "./local-patch-judge";
import type { prepareLocalPatchBoardReview, LocalPatchBoardReviewDeps } from "./local-patch-board-review";
import { purchaseOnce, type PurchaseOutcome } from "./paid-operation";
import { fenceLocalPatchImages, LocalPatchRetainedPurchaseStore } from "./local-patch-lifecycle";
import { inventorySelfRepairRequest } from "./local-patch-self-repair";
import { LOCAL_PATCH_PHASE_MARGIN_MS, LOCAL_PATCH_MIN_PROVIDER_MS } from "./local-patch-render";
import { sha256Bytes } from "./fixed-sprite";
import { recoverPreparedLocalPatchReview } from "./local-patch-review-interruption-recovery";
import { DUAL_VISUAL_REVIEW_VERSION } from "./visual-review-release";
import type { BudgetJson } from "./world-budget";

type Prepared = Extract<Awaited<ReturnType<typeof prepareLocalPatchBoardReview>>, { ready: true }>;
type Bought = Extract<PurchaseOutcome, { kind: "bought" }>;
/** Same FINAL pixels at each join, with a head detail. No BEFORE/portrait may
 * supply an imagined missing head. The context disambiguates evidence borders. */
export async function runtimeContinuityQuestion(prepared: Prepared, binding: object, attempt: number) {
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
  return prepareVisualReview({ role: "head-continuity", effort: "high", images, labels,
    prompt: localPatchHeadContinuityPrompt([{ id, focus: "Every visible person in this final context, especially people crossing the four compositing joins, not only the personalized child." }])
      + "\nRUNTIME CROWD INSPECTION: This case covers ALL people in the context. Trace each visible head/body separately, including bystanders. The case is broken if ANY visible person has a located impossible connection or straight cut. A coherent case requires ALL visible people to be coherent; a good target never excuses a broken neighbour. Summarize the observed connections in headTrace/bodyTrace. Clean complete removal of a bystander is allowed. Do not fail a person naturally continuing outside an evidence crop; use the context. Use unsure only for genuinely insufficient evidence."
      + `\nImmutable candidate binding: ${JSON.stringify(binding)}. Evidence attempt: ${attempt}.` });
}

/** One new paid question per worker slice. Each role has its own durable key,
 * receipt, price policy and reservation; a restart reuses the finished role. */
export async function buyDualLocalPatchReview(c: Container, prepared: Prepared, deps: LocalPatchBoardReviewDeps, deadlineAt?: number): Promise<
  { kind: "waiting"; outcome: { state: "pending" | "held"; reason: string; replayed: boolean; costCents: number } }
  | { kind: "reviewed"; bought: Bought; wire: LocalPatchJudgeResult; verdicts: LocalPatchBoardJudgeResult["verdicts"]; proof: DualReviewProof; newCostCents: number }
> {
  if (!c.visualReview) throw Error("Both HIGH visual-review providers must be configured before any reservation");
  if (prepared.scene.sceneVersion !== 12 || prepared.extraPlan || prepared.request.reviewScope !== "ready-only/v1"
    || prepared.request.hides.length !== 1) throw Error("Dual review requires one ready v12 appearance");
  const { request, entries, game, budget, worldId, evidenceReviewAttempt } = prepared;
  const hideId = request.hides[0]!.hideId, entry = entries.find(e => e.hide.id === hideId)!;
  const binding = { version: DUAL_VISUAL_REVIEW_VERSION, gameId: game.id, sceneId: prepared.scene.id, hideId,
    variantId: entry.row.id, imageSha256: entry.imageSha256, geometrySha256: entry.geometrySha256,
    identitySha256: sha256Bytes(prepared.sheet), attempts: entry.row.attempts };
  const priorReceipt = JSON.parse(entry.row.judgeJson!);
  const prior = (priorReceipt.boardReview?.dual ?? priorReceipt.dualQualityCheckpoint) as DualReviewProof | undefined;
  // An unreadable Sol reply does not buy a second good Opus assessment.
  const oldQuality = prior?.quality;
  const oldVerdict = oldQuality && parseVisualSceneVerdicts(visualStageReadable(oldQuality) ? oldQuality.raw : null,
    [hideId], 12, request.reviewScope, request.assessmentMode)[hideId];
  const qualityAttempt = prior?.imageSha256 === binding.imageSha256 && oldQuality && Number.isSafeInteger(oldQuality.attempt)
    && oldQuality.attempt > 0 && localPatchQualityDisposition(oldVerdict ?? null, 12, { hideId }).state === "acceptable"
    ? oldQuality.attempt : evidenceReviewAttempt;
  const quality = sceneQualityQuestion(request, "high");
  const q = prepareVisualReview({ ...quality, prompt: quality.prompt + `\nImmutable candidate binding: ${JSON.stringify(binding)}. Evidence attempt: ${qualityAttempt}.` });
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
  const waiting = async (bought: Exclude<PurchaseOutcome, Bought>, question: PreparedVisualReview) => {
    const recovered = bought.kind === "unresolved" && await recoverPreparedLocalPatchReview(c,
      { ...prepared, requestKey: makeKey(question), fingerprint: question.fingerprint }, deps.fence);
    return { kind: "waiting" as const, outcome: { state: recovered ? "pending" as const
      : bought.kind === "unresolved" || bought.kind === "deferred" && bought.reserved ? "held" as const : "pending" as const,
      reason: recovered ? "Interrupted review retained its charge; exact pixels await automatic evidence recovery" : bought.reason,
      replayed: false, costCents: 0 } };
  };
  const stage = (bought: Bought, question: PreparedVisualReview, attempt: number): DualReviewStage => {
    const wire = JSON.parse(bought.bytes.toString()) as LocalPatchJudgeResult;
    return { requestKey: makeKey(question), fingerprint: question.fingerprint, attempt, policy: question.policy,
      raw: wire.raw, model: wire.model, finishReason: wire.finishReason, wireFault: wire.wireFault, costMicroUsd: bought.evidence.amountMicroUsd };
  };
  const qualityBought = await buy(q);
  if (qualityBought.kind !== "bought") return waiting(qualityBought, q);
  const qualityStage = stage(qualityBought, q, qualityAttempt);
  const verdicts = parseVisualSceneVerdicts(visualStageReadable(qualityStage) ? qualityStage.raw : null,
    [hideId], 12, request.reviewScope, request.assessmentMode);
  const proof: DualReviewProof = { version: DUAL_VISUAL_REVIEW_VERSION, hideId, imageSha256: binding.imageSha256,
    geometrySha256: binding.geometrySha256, identitySha256: binding.identitySha256, quality: qualityStage, continuity: null };
  const primaryWire = JSON.parse(qualityBought.bytes.toString()) as LocalPatchJudgeResult;
  let newCostCents = qualityBought.replayed ? 0 : qualityBought.evidence.amountMicroUsd / 10_000;
  const qualityGood = localPatchQualityDisposition(verdicts[hideId] ?? null, 12, { hideId }).state === "acceptable";
  if (!qualityGood) return { kind: "reviewed", bought: qualityBought, wire: primaryWire, verdicts, proof, newCostCents };
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
  const anatomy = await runtimeContinuityQuestion(prepared, binding, evidenceReviewAttempt);
  const anatomyBought = await buy(anatomy);
  if (anatomyBought.kind !== "bought") return waiting(anatomyBought, anatomy);
  proof.continuity = stage(anatomyBought, anatomy, evidenceReviewAttempt);
  newCostCents += anatomyBought.replayed ? 0 : anatomyBought.evidence.amountMicroUsd / 10_000;
  const cases = readContinuity(visualStageReadable(proof.continuity) ? proof.continuity.raw : null, `${hideId}:people`);
  const disposition = runtimeContinuityDisposition(cases);
  if (disposition === "unresolved") return { kind: "reviewed", bought: anatomyBought,
    wire: { ...primaryWire, wireFault: "schema" }, verdicts: {}, proof, newCostCents };
  if (disposition === "repair") {
    const faults = cases?.flatMap(item => item.faults.map(f => ({ check: "pictureWhole", where: f.where.slice(0, 300) }))) ?? [];
    if (!faults.length) faults.push({ check: "pictureWhole", where: cases?.[0]?.bodyTrace.slice(0, 300) ?? "Impossible head/body connection in final context" });
    const wireVerdict = Object.fromEntries(Object.entries(verdicts[hideId]!).filter(([key]) =>
      !["claimedVerdict", "verdictOverridden", "downgraded", "contradicted", "unclassified"].includes(key)));
    verdicts[hideId] = parseLocalPatchVerdict({ ...wireVerdict, pictureWhole: "fail", verdict: "fail",
      reason: "Independent final-image anatomy review found a visible defect",
      faults: [...verdicts[hideId]!.faults, ...faults].slice(0, 16) }, 12);
  }
  return { kind: "reviewed", bought: anatomyBought, wire: primaryWire, verdicts, proof, newCostCents };
}
